<template>
  <section class="ai-assistant">
    <header class="assistant-header">
      <div>
        <h3>RAG 知识图谱助手</h3>
        <p>{{ modelInfo.provider }} · {{ modelInfo.model }}</p>
      </div>
      <span class="status" :class="{ online: isOnline }">
        {{ isOnline ? "在线" : "离线" }}
      </span>
    </header>

    <section ref="chatContainer" class="chat-body">
      <div v-if="messages.length === 0" class="welcome-message">
        <h4>欢迎使用 RAG 知识图谱助手</h4>
        <p>你可以围绕当前图谱中的节点、关系、实体类型和遥感场景进行提问。</p>
        <div class="quick-actions">
          <button
            v-for="action in quickActions"
            :key="action"
            :disabled="isLoading"
            @click="useQuickAction(action)"
          >
            {{ action }}
          </button>
        </div>
      </div>

      <article
        v-for="(message, index) in messages"
        :key="`${message.timestamp}-${index}`"
        class="message"
        :class="message.role"
      >
        <div class="avatar">{{ message.role === "user" ? "我" : "AI" }}</div>
        <div class="bubble">
          <div class="markdown-content" v-html="renderMarkdown(message.content)" />
          <time>{{ formatTime(message.timestamp) }}</time>
        </div>
      </article>

      <div v-if="isLoading" class="typing">
        <span class="spinner"></span>
        RAG 助手正在分析...
      </div>
    </section>

    <footer class="chat-footer">
      <textarea
        v-model="inputMessage"
        :disabled="isLoading"
        placeholder="请输入你的问题，按 Enter 发送，Shift + Enter 换行"
        rows="3"
        @keydown.enter.exact.prevent="sendMessage"
      />
      <div class="footer-actions">
        <button class="clear-button" :disabled="messages.length === 0" @click="clearChat">
          清空对话
        </button>
        <button
          class="send-button"
          :disabled="!inputMessage.trim() || isLoading"
          @click="sendMessage"
        >
          {{ isLoading ? "发送中..." : "发送" }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { marked } from "marked";
import { nextTick, onMounted, ref } from "vue";

import { checkAIHealth, fetchModelInfo, openRagStream } from "@/services/ragApi";
import type { ChatMessage, GraphContext, ModelInfo } from "@/types/knowledge";

interface KnowledgeGraphExpose {
  getCurrentGraphData: () => GraphContext | null;
}

const props = defineProps<{
  knowledgeGraphRef?: KnowledgeGraphExpose | { value?: KnowledgeGraphExpose };
}>();

const quickActions = [
  "请概括当前知识图谱的主要实体和关系",
  "当前图谱中哪些节点更适合作为分析重点？",
  "请结合图谱说明遥感场景类别之间的关系",
];

const messages = ref<ChatMessage[]>([]);
const inputMessage = ref("");
const isLoading = ref(false);
const isOnline = ref(false);
const chatContainer = ref<HTMLElement>();
const modelInfo = ref<ModelInfo>({
  model: "qwen-plus-2025-07-28",
  provider: "通义千问",
  features: [],
});

marked.setOptions({
  breaks: true,
  gfm: true,
});

async function initialiseModelStatus() {
  try {
    isOnline.value = await checkAIHealth();
    modelInfo.value = await fetchModelInfo();
  } catch (error) {
    console.warn("AI 服务状态检查失败:", error);
    isOnline.value = false;
  }
}

function getKnowledgeGraphContext() {
  try {
    const graphRef =
      (props.knowledgeGraphRef as { value?: KnowledgeGraphExpose } | undefined)
        ?.value ?? (props.knowledgeGraphRef as KnowledgeGraphExpose | undefined);

    return graphRef?.getCurrentGraphData() ?? null;
  } catch (error) {
    console.warn("获取知识图谱上下文失败:", error);
    return null;
  }
}

async function sendMessage() {
  const content = inputMessage.value.trim();
  if (!content || isLoading.value) return;

  const userMessage: ChatMessage = {
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: "",
    timestamp: new Date().toISOString(),
  };

  messages.value.push(userMessage, assistantMessage);
  inputMessage.value = "";
  isLoading.value = true;
  await scrollToBottom();

  try {
    await readStream(content, assistantMessage);
  } catch (error) {
    assistantMessage.content =
      error instanceof Error ? error.message : "RAG 服务调用失败，请稍后重试";
  } finally {
    isLoading.value = false;
    await scrollToBottom();
  }
}

async function readStream(message: string, assistantMessage: ChatMessage) {
  const reader = await openRagStream({
    message,
    history: messages.value.slice(-12, -1),
    graphContext: getKnowledgeGraphContext(),
  });

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;

      const parsed = JSON.parse(payload) as { content?: string; error?: string };
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.content) {
        assistantMessage.content += parsed.content;
        await scrollToBottom();
      }
    }
  }
}

function useQuickAction(action: string) {
  inputMessage.value = action;
  void sendMessage();
}

function clearChat() {
  messages.value = [];
}

async function scrollToBottom() {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

function renderMarkdown(content: string) {
  if (!content) return "";

  try {
    return String(marked.parse(content));
  } catch {
    return content.replace(/\n/g, "<br>");
  }
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

onMounted(initialiseModelStatus);

defineExpose({
  clearChat,
  getKnowledgeGraphContext,
});
</script>

<style scoped lang="scss">
.ai-assistant {
  display: flex;
  height: 100%;
  flex-direction: column;
  color: #cdd6f4;
  background: #1e1e2e;
}

.assistant-header {
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #181825;
  border-bottom: 1px solid #313244;

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: #cba6f7;
    font-size: 18px;
    font-weight: 600;
  }

  p {
    margin-top: 5px;
    color: #a6adc8;
    font-size: 12px;
  }
}

.status {
  padding: 4px 12px;
  color: #f38ba8;
  background: rgba(243, 139, 168, 0.2);
  border: 1px solid rgba(243, 139, 168, 0.3);
  border-radius: 20px;
  font-size: 12px;

  &.online {
    color: #a6e3a1;
    background: rgba(166, 227, 161, 0.2);
    border-color: rgba(166, 227, 161, 0.3);
  }
}

.chat-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.welcome-message {
  color: #a6adc8;
  text-align: center;

  h4 {
    margin: 0 0 12px;
    color: #cba6f7;
    font-size: 16px;
  }

  p {
    margin: 0 0 16px;
    line-height: 1.7;
  }
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;

  button {
    padding: 8px 12px;
    color: #cdd6f4;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 20px;
    cursor: pointer;
    font-size: 12px;

    &:hover:not(:disabled) {
      color: #cba6f7;
      border-color: #cba6f7;
    }
  }
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;

  &.user {
    flex-direction: row-reverse;

    .bubble {
      align-items: flex-end;
    }

    .markdown-content {
      color: #181825;
      background: #89b4fa;
      border-color: #89b4fa;
    }
  }
}

.avatar {
  display: flex;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  align-items: center;
  justify-content: center;
  color: #181825;
  background: #cba6f7;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}

.bubble {
  display: flex;
  max-width: 72%;
  flex-direction: column;
  gap: 4px;

  time {
    color: #6c7086;
    font-size: 12px;
  }
}

.markdown-content {
  padding: 12px 16px;
  color: #cdd6f4;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 18px;
  line-height: 1.6;
  word-break: break-word;

  :deep(p) {
    margin: 0 0 8px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(ul),
  :deep(ol) {
    margin: 8px 0;
    padding-left: 20px;
  }

  :deep(pre) {
    max-width: 100%;
    padding: 12px;
    overflow-x: auto;
    background: #181825;
    border-radius: 6px;
  }

  :deep(code) {
    font-family: Consolas, Monaco, monospace;
  }
}

.typing {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #a6adc8;
  font-size: 13px;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #313244;
  border-top-color: #cba6f7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.chat-footer {
  display: grid;
  gap: 12px;
  padding: 20px;
  background: #181825;
  border-top: 1px solid #313244;

  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 16px;
    resize: none;
    color: #cdd6f4;
    background: #313244;
    border: 2px solid #45475a;
    border-radius: 8px;
    font: inherit;
    line-height: 1.5;

    &:focus {
      outline: none;
      border-color: #4d3ca6;
      box-shadow: 0 0 0 2px rgba(77, 60, 166, 0.2);
    }
  }
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  button {
    min-width: 80px;
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }
}

.clear-button {
  color: #f38ba8;
  background: rgba(243, 139, 168, 0.16);
  border: 1px solid rgba(243, 139, 168, 0.35);
}

.send-button {
  color: #ffffff;
  background: #4d3ca6;
  border: 1px solid #4d3ca6;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
