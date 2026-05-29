# 遥感知识图谱可视化与 RAG 问答系统

## 项目简介

本项目是一个面向遥感知识组织与智能问答场景的 Web 应用，主要实现知识图谱可视化展示、图谱节点交互、图谱上下文问答和大模型辅助分析能力。项目采用前后端分离结构，前端负责图谱渲染与交互，后端负责图谱数据接口、问答代理和通义千问模型调用。

项目定位为一次完整的前端工程实践：从图谱数据建模、交互式可视化、组件封装，到大模型 API 接入、服务端代理与构建部署，覆盖了实习/项目开发中常见的需求拆解、工程实现和联调验证流程。

## 核心功能

- 知识图谱展示：基于 Sigma.js 和 Graphology 渲染节点、边和关系类型。
- 图谱交互：支持节点搜索、缩放、拖拽、悬浮详情、图例筛选和布局调整。
- 图谱数据切换：通过左侧导航切换不同类型的知识图谱数据。
- RAG 对话：右侧对话面板支持多轮提问，并将当前图谱上下文传递给后端。
- 大模型接入：后端通过 DashScope OpenAI 兼容接口调用 `qwen-plus-2025-07-28`。
- 本地 mock 数据：保留图谱菜单与图谱样例数据，便于本地演示和开发调试。

## 技术栈

### 前端

- Vue 3
- TypeScript
- Vite
- Vue Router
- Element Plus
- Sigma.js
- Graphology
- SCSS / WindiCSS

### 后端

- Node.js
- Express
- DashScope OpenAI 兼容接口
- Server-Sent Events 风格的流式响应封装

## 项目结构

```text
yaogan-main/
├── src/
│   ├── components/
│   │   └── KnowledgeGraph/
│   │       ├── graph.vue              # 知识图谱渲染组件
│   │       ├── AIAssistant.vue        # RAG 对话组件
│   │       └── README.md              # 组件说明
│   ├── mock/
│   │   ├── knowledgeMenu.json         # 左侧图谱菜单数据
│   │   ├── RSVG.json                  # 遥感相关图谱样例
│   │   └── doubanDetail.json          # 图谱样例数据
│   ├── router/
│   │   └── index.ts                   # 单页路由配置
│   ├── views/
│   │   └── home/
│   │       └── knowledge.vue          # 主页面：图谱 + 对话
│   ├── App.vue
│   └── main.ts
├── express.js                         # 本地后端服务
├── ai.config.example.json             # 大模型配置示例
├── API-INTEGRATION-GUIDE.md           # 后端接口与模型接入说明
├── PROJECT-EXPERIENCE.md              # 项目实践说明
├── package.json
└── vite.config.ts
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置大模型 API

复制示例配置：

```bash
cp ai.config.example.json ai.config.json
```

在 `ai.config.json` 中填写自己的 DashScope API Key：

```json
{
  "apiKey": "your-dashscope-api-key",
  "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "model": "qwen-plus-2025-07-28"
}
```

`ai.config.json` 已加入 `.gitignore`，请不要提交真实密钥。

### 3. 启动后端

```bash
npm run start-server
```

后端默认运行在：

```text
http://localhost:9090
```

### 4. 启动前端

```bash
npm run dev
```

前端默认运行在：

```text
http://localhost:5173
```

## 常用命令

```bash
# 开发环境
npm run dev

# 启动后端服务
npm run start-server

# 类型检查
npm run type-check

# 生产构建
npm run build

# 仅执行 Vite 构建
npm run build-only
```

## 后端接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `/rest/mock/menu` | GET | 获取左侧图谱菜单 |
| `/rest/mock/graph` | GET | 获取图谱节点和边数据 |
| `/rest/mock/ai/config` | GET | 获取当前模型配置 |
| `/rest/mock/ai/health` | GET | 检查模型服务可用性 |
| `/rest/mock/ai/chat` | POST | RAG 对话接口 |
| `/api/rag/reset` | POST | 对话重置兼容接口 |

## 开发说明

- 当前版本聚焦知识图谱展示与 RAG 问答，不包含用户登录、遥感影像处理、数据集管理等非核心模块。
- 前端通过 `knowledge.vue` 组织整体布局，`graph.vue` 负责图谱渲染，`AIAssistant.vue` 负责对话交互。
- 后端 `express.js` 统一处理图谱 mock 数据、模型配置读取和大模型调用，避免在前端暴露 API Key。
- 图谱上下文会在提问时传递到后端，并作为 system prompt 的补充信息参与回答生成。

## 项目亮点

- 将图谱可视化和大模型问答整合在同一工作台中，方便围绕图谱内容进行解释和分析。
- 使用后端代理保护大模型 API Key，前端只访问本地服务接口。
- 组件边界清晰，图谱展示、页面布局、RAG 对话分别拆分维护。
- 通过 TypeScript 类型检查和 Vite 构建验证，保证基础工程质量。

## 注意事项

- 使用 RAG 对话前需要先启动 `express.js` 后端服务。
- 如果 `/rest/mock/ai/health` 返回 `MISSING_DASHSCOPE_API_KEY`，说明没有正确创建 `ai.config.json` 或 `apiKey` 为空。
- 当前图谱数据为本地样例数据，后续可以替换为数据库、图数据库或检索服务返回的数据。
