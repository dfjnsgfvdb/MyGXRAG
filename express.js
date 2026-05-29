import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 9090);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

const QWEN_CONFIG = loadQwenConfig();
const graphDatasets = {
  douban: readJsonFile("src/mock/doubanDetail.json"),
  rsvg: readJsonFile("src/mock/RSVG.json"),
};
const menuData = readJsonFile("src/mock/knowledgeMenu.json");

app.get("/rest/mock/menu", (_req, res) => {
  res.json({
    code: 200,
    message: "success",
    data: menuData,
  });
});

app.get("/rest/mock/graph", (req, res) => {
  const entityType = String(req.query.entityType || "rsvg");
  const zoomLevel = Number(req.query.zoomLevel || 1);
  const graphData = graphDatasets[entityType];

  if (!graphData) {
    return res.status(404).json({
      code: 404,
      message: `未找到图谱数据集：${entityType}`,
      data: null,
    });
  }

  res.json({
    code: 200,
    message: "success",
    data: graphData,
    meta: {
      entityType,
      zoomLevel,
      nodeCount: graphData.nodes.length,
      edgeCount: graphData.edges.length,
    },
  });
});

app.post("/rest/mock/ai/chat", async (req, res) => {
  const { message, history = [], graphContext = null } = req.body;

  if (!message || !String(message).trim()) {
    return res.status(400).json({
      success: false,
      error: "消息内容不能为空",
      code: "EMPTY_MESSAGE",
    });
  }

  if (!QWEN_CONFIG.apiKey) {
    return res.status(500).json({
      success: false,
      error:
        "DASHSCOPE_API_KEY is not configured. 请在项目根目录创建 ai.config.json 并填写 apiKey，或设置环境变量 DASHSCOPE_API_KEY。",
      code: "MISSING_DASHSCOPE_API_KEY",
    });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  try {
    const answer = await callQwen({
      message: String(message),
      history,
      graphContext,
    });

    await writeSseText(res, answer);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("通义千问 API 调用失败:", error);
    res.write(
      `data: ${JSON.stringify({
        error: "AI 服务暂时不可用，请检查模型配置或稍后重试",
        code: "QWEN_API_ERROR",
      })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

app.post("/api/rag/reset", (_req, res) => {
  res.json({ ok: true });
});

app.get("/rest/mock/ai/config", (_req, res) => {
  res.json({
    success: true,
    data: {
      model: QWEN_CONFIG.model,
      provider: "通义千问",
      features: ["知识图谱上下文问答", "实体关系解释", "遥感场景语义分析"],
      maxTokens: 2000,
      temperature: 0.7,
    },
  });
});

app.get("/rest/mock/ai/health", async (_req, res) => {
  try {
    if (!QWEN_CONFIG.apiKey) {
      throw new Error("DASHSCOPE_API_KEY is not configured");
    }

    const response = await fetch(`${QWEN_CONFIG.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${QWEN_CONFIG.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: QWEN_CONFIG.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
    });

    if (!response.ok) {
      throw new Error(`API 返回状态 ${response.status}`);
    }

    res.json({
      success: true,
      status: "healthy",
      model: QWEN_CONFIG.model,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

function loadQwenConfig() {
  const localConfig = readOptionalJsonFile("ai.config.json");

  return {
    apiKey: localConfig.apiKey || process.env.DASHSCOPE_API_KEY,
    baseURL:
      localConfig.baseURL ||
      process.env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model:
      localConfig.model ||
      process.env.DASHSCOPE_MODEL ||
      "qwen-plus-2025-07-28",
  };
}

async function callQwen({ message, history, graphContext }) {
  const safeHistory = Array.isArray(history)
    ? history
        .slice(-10)
        .filter((item) => item?.role && item?.content)
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content),
        }))
    : [];

  const response = await fetch(`${QWEN_CONFIG.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${QWEN_CONFIG.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: QWEN_CONFIG.model,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(graphContext, message),
        },
        ...safeHistory,
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen request failed: ${response.status} ${errorText}`);
  }

  const responseData = await response.json();
  return responseData.choices?.[0]?.message?.content || "未获取到模型回复";
}

async function writeSseText(res, text) {
  const chunkSize = 3;

  for (let index = 0; index < text.length; index += chunkSize) {
    const content = text.slice(index, index + chunkSize);
    res.write(
      `data: ${JSON.stringify({
        content,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
    await delay(35);
  }
}

function buildSystemPrompt(graphContext, userMessage = "") {
  const basePrompt =
    "你是一个面向遥感知识图谱的 RAG 问答助手。回答必须优先依据当前知识图谱上下文；如果用户提到的节点或关系不在上下文中，请明确说明未检索到，而不要只凭常识补全。请使用 Markdown 输出。";

  if (!graphContext?.nodes?.length) {
    return `${basePrompt}\n\n当前没有收到前端传入的知识图谱上下文。`;
  }

  const nodes = graphContext.nodes;
  const edges = Array.isArray(graphContext.edges) ? graphContext.edges : [];
  const nodeTypes = countBy(nodes, (node) => node.type || "未知类型");
  const relationTypes = countBy(edges, (edge) => edge.relation || "关联");
  const relevantNodes = pickRelevantNodes(nodes, userMessage);
  const relevantEdges = pickRelevantEdges(edges, relevantNodes);
  const nodeListLimit = nodes.length <= 180 ? nodes.length : 180;
  const edgeListLimit = edges.length <= 180 ? edges.length : 180;

  return [
    basePrompt,
    "",
    "当前知识图谱上下文摘要：",
    `- 当前筛选条件：${formatCurrentFilter(graphContext.currentFilter)}`,
    `- 节点数量：${graphContext.nodeCount ?? nodes.length}`,
    `- 关系数量：${graphContext.edgeCount ?? edges.length}`,
    `- 主要实体类型：${formatCounter(nodeTypes)}`,
    `- 主要关系类型：${formatCounter(relationTypes)}`,
    "",
    "与用户问题可能相关的节点：",
    formatNodeList(relevantNodes.slice(0, 60)),
    "",
    "与相关节点连接的关系：",
    formatEdgeList(relevantEdges.slice(0, 80)),
    "",
    `当前图谱节点清单（最多 ${nodeListLimit} 个）：`,
    formatNodeList(nodes.slice(0, nodeListLimit)),
    "",
    `当前图谱关系清单（最多 ${edgeListLimit} 条）：`,
    formatEdgeList(edges.slice(0, edgeListLimit)),
    "",
    "回答要求：",
    "- 先判断用户提到的节点是否存在于上面的节点清单或相关节点中。",
    "- 如果存在，请结合节点描述和相邻关系回答。",
    "- 如果不存在，请说明当前图谱没有该节点，并给出最接近的节点或需要补充的数据。",
  ].join("\n");
}

function formatCurrentFilter(currentFilter) {
  if (!currentFilter || currentFilter.type === "all") {
    return "完整图谱";
  }

  if (currentFilter.type === "movie-category") {
    return `电影类别 = ${currentFilter.label || currentFilter.id}`;
  }

  return `${currentFilter.type}${currentFilter.label ? ` = ${currentFilter.label}` : ""}`;
}

function pickRelevantNodes(nodes, userMessage) {
  const query = String(userMessage || "").trim().toLowerCase();
  if (!query) return nodes.slice(0, 40);

  const matched = nodes.filter((node) => {
    const text = [node.id, node.label, node.type, node.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(query) || query.includes(String(node.label || "").toLowerCase());
  });

  return matched.length ? matched : nodes.slice(0, 40);
}

function pickRelevantEdges(edges, relevantNodes) {
  const nodeIds = new Set(relevantNodes.map((node) => String(node.id)));
  return edges.filter(
    (edge) => nodeIds.has(String(edge.source)) || nodeIds.has(String(edge.target))
  );
}

function formatNodeList(nodes) {
  if (!nodes.length) return "- 无";

  return nodes
    .map((node) => {
      const parts = [
        `id=${node.id}`,
        `label=${node.label || node.id}`,
        `type=${node.type || "未知"}`,
      ];
      if (node.description) parts.push(`description=${node.description}`);
      return `- ${parts.join("；")}`;
    })
    .join("\n");
}

function formatEdgeList(edges) {
  if (!edges.length) return "- 无";

  return edges
    .map((edge) => {
      const relation = edge.relation || edge.label || "关联";
      return `- ${edge.source} --[${relation}]--> ${edge.target}${
        edge.label ? `；label=${edge.label}` : ""
      }`;
    })
    .join("\n");
}

function countBy(items, getKey) {
  return items.reduce((counter, item) => {
    const key = getKey(item);
    counter[key] = (counter[key] || 0) + 1;
    return counter;
  }, {});
}

function formatCounter(counter) {
  const entries = Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, value]) => `${key}(${value})`);

  return entries.length ? entries.join("、") : "无";
}

function readJsonFile(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relativePath), "utf8"));
}

function readOptionalJsonFile(relativePath) {
  const filePath = path.join(__dirname, relativePath);
  if (!fs.existsSync(filePath)) return {};

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`配置文件读取失败：${relativePath}`, error.message);
    return {};
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const server = app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. 请先关闭占用该端口的进程，或通过 PORT 指定其他端口。`
    );
    process.exit(1);
  }

  console.error("Server failed to start:", error);
  process.exit(1);
});
