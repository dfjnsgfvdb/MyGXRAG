# KnowledgeGraph 组件说明

## 组件定位

`KnowledgeGraph` 目录包含当前项目的核心前端能力：

- `graph.vue`：知识图谱可视化组件。
- `AIAssistant.vue`：图谱上下文问答组件。

这两个组件共同组成主页面的核心工作区：左侧选择图谱数据，中间展示图谱，右侧围绕当前图谱进行 RAG 对话。

## graph.vue

### 职责

- 加载图谱数据。
- 使用 Graphology 管理节点和边。
- 使用 Sigma.js 渲染图谱。
- 支持节点搜索、缩放、拖拽、布局和图例筛选。
- 向父组件暴露当前图谱上下文，供 RAG 对话使用。

### Props

```ts
interface Props {
  width?: number;
  height?: number;
  selectedEntity?: string;
  zoomLevel?: number;
}
```

### Events

```ts
const emit = defineEmits<{
  nodeClick: [nodeId: string];
  edgeClick: [edgeId: string];
  backgroundClick: [];
  zoomChange: [level: number];
}>();
```

### 暴露方法

```ts
defineExpose({
  loadGraphData,
  updateGraph,
  resizeGraph,
  clearHighlight,
  resetView,
  getCurrentGraphData,
});
```

其中 `getCurrentGraphData` 会被 `AIAssistant.vue` 调用，用来把当前图谱节点、边和统计信息传递给后端。

## AIAssistant.vue

### 职责

- 维护前端对话历史。
- 获取当前图谱上下文。
- 调用 `/rest/mock/ai/chat`。
- 解析后端返回的 SSE 风格数据。
- 使用 Markdown 渲染模型回答。

### 数据流

```text
用户输入问题
  -> AIAssistant.vue 收集 history 和 graphContext
  -> POST /rest/mock/ai/chat
  -> 后端调用 qwen-plus-2025-07-28
  -> 前端逐步渲染回答
```

## 图谱数据格式

```ts
interface GraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  image?: string;
  typeLabel?: string;
  color?: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  relation?: string;
  weight?: number;
  color?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

## 维护建议

- 图谱渲染逻辑集中维护在 `graph.vue`，不要把 Sigma 实例操作散落到页面组件中。
- RAG 对话只通过后端接口访问模型，前端不保存 API Key。
- 如果后续接入真实图数据库，优先保持 `GraphData` 数据结构稳定，减少前端改动。
- 大规模图谱建议在后端做分页、裁剪或按层级加载，避免一次性渲染过多节点。
