import axios from "axios";
import type { ChatMessage, GraphContext, ModelInfo } from "@/types/knowledge";

const AI_BASE_URL = "http://localhost:9090/rest/mock/ai";

export async function fetchModelInfo() {
  const response = await axios.get<{ success: boolean; data: ModelInfo }>(
    `${AI_BASE_URL}/config`
  );

  if (!response.data.success) {
    throw new Error("模型配置获取失败");
  }

  return response.data.data;
}

export async function checkAIHealth() {
  const response = await axios.get<{ success: boolean }>(`${AI_BASE_URL}/health`);
  return response.data.success;
}

export async function openRagStream(payload: {
  message: string;
  history: ChatMessage[];
  graphContext: GraphContext | null;
}) {
  const response = await fetch(`${AI_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `RAG 服务请求失败：${response.status}`;
    try {
      const errorBody = await response.json();
      message = errorBody.error || message;
    } catch {
      // Response may already be an SSE stream or plain text.
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("RAG 服务未返回可读取的数据流");
  }

  return response.body.getReader();
}
