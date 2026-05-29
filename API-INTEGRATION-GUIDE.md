# API 与大模型接入说明

## 1. 服务职责

本项目后端服务由 `express.js` 提供，主要承担三类职责：

- 图谱数据接口：向前端提供菜单、节点和边数据。
- 大模型代理：封装 DashScope API 调用，避免在前端暴露 API Key。
- 对话输出适配：将模型完整响应拆分为 SSE 风格的数据块，适配前端逐步展示。

## 2. 大模型配置

模型配置优先从项目根目录的 `ai.config.json` 读取：

```json
{
  "apiKey": "your-dashscope-api-key",
  "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "model": "qwen-plus-2025-07-28"
}
```

如果没有配置文件，则回退读取环境变量：

| 环境变量 | 说明 |
|---|---|
| `DASHSCOPE_API_KEY` | DashScope API Key |
| `DASHSCOPE_BASE_URL` | OpenAI 兼容接口地址 |
| `DASHSCOPE_MODEL` | 模型名称 |

默认模型为：

```text
qwen-plus-2025-07-28
```

## 3. 接口列表

### 获取菜单

```http
GET /rest/mock/menu
```

返回左侧图谱导航菜单。

### 获取图谱数据

```http
GET /rest/mock/graph?entityType=rsvg&zoomLevel=1&limit=1000
```

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `entityType` | string | 图谱类型，例如 `rsvg`、`douban` |
| `zoomLevel` | number | 缩放级别，用于控制数据规模 |
| `limit` | number | 返回节点数量上限 |

### 获取模型配置

```http
GET /rest/mock/ai/config
```

示例响应：

```json
{
  "success": true,
  "data": {
    "model": "qwen-plus-2025-07-28",
    "provider": "通义千问",
    "features": ["知识图谱分析", "专业术语解释", "遥感数据处理建议"],
    "maxTokens": 2000,
    "temperature": 0.7
  }
}
```

### 健康检查

```http
GET /rest/mock/ai/health
```

用于验证后端是否能够正常调用 DashScope 模型服务。

### RAG 对话

```http
POST /rest/mock/ai/chat
Content-Type: application/json
```

请求体：

```json
{
  "message": "请解释当前图谱中的主要关系",
  "history": [],
  "graphContext": {
    "nodes": [],
    "edges": [],
    "entityType": "rsvg"
  }
}
```

响应格式为 SSE 风格文本：

```text
data: {"content":"回答片段","timestamp":"2026-05-29T00:00:00.000Z"}

data: [DONE]
```

## 4. 调用链路

```text
前端 AIAssistant.vue
  -> POST /rest/mock/ai/chat
  -> express.js 组装 system prompt + history + graphContext
  -> DashScope /chat/completions
  -> 后端拆分回答并写出 SSE 风格响应
  -> 前端逐步渲染回答内容
```

## 5. 错误处理

| 错误码 | 场景 | 处理建议 |
|---|---|---|
| `MISSING_DASHSCOPE_API_KEY` | 未配置 API Key | 检查 `ai.config.json` 或环境变量 |
| `INTERNAL_ERROR` | 模型调用失败 | 检查网络、Key 权限和模型名称 |

如果服务端日志出现模型调用失败，应优先检查：

- `ai.config.json` 是否存在。
- `apiKey` 是否为空或过期。
- 模型名是否为当前账号可调用模型。
- 本地网络是否可以访问 DashScope。

## 6. 本地调试

```bash
# 启动后端
npm run start-server

# 检查模型状态
curl http://localhost:9090/rest/mock/ai/health

# 测试对话接口
curl -X POST http://localhost:9090/rest/mock/ai/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"请介绍知识图谱的作用\",\"history\":[],\"graphContext\":null}"
```
