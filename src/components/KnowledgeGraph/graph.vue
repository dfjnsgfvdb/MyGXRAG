<template>
  <div class="knowledge-graph">
    <div class="graph-toolbar">
      <div class="toolbar-left">
        <button class="toolbar-btn" title="放大" @click="zoomIn">
          <el-icon><ZoomIn /></el-icon>
        </button>
        <button class="toolbar-btn" title="缩小" @click="zoomOut">
          <el-icon><ZoomOut /></el-icon>
        </button>
        <button class="toolbar-btn" title="重置视图" @click="resetView">
          <el-icon><Refresh /></el-icon>
        </button>
        <button class="toolbar-btn" title="图例" @click="toggleLegend">
          <el-icon><List /></el-icon>
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: isForceLayoutActive }"
          title="力导向布局"
          @click="toggleForceLayout"
        >
          <el-icon><Connection /></el-icon>
        </button>
      </div>

      <div v-if="movieCategoryOptions.length" class="movie-category-filter">
        <label>电影类别:</label>
        <el-select
          v-model="selectedMovieCategoryId"
          class="movie-category-select"
          clearable
          filterable
          placeholder="全部类别"
          @change="applyMovieCategoryFilter"
        >
          <el-option
            v-for="category in movieCategoryOptions"
            :key="category.value"
            :label="category.label"
            :value="category.value"
          />
        </el-select>
      </div>

      <div class="entity-type-filter">
        <label>实体类型:</label>
        <el-select
          v-model="selectedEntityTypeFilter"
          class="entity-type-select"
          clearable
          filterable
          placeholder="全部实体"
          @change="applyEntityTypeFilter"
        >
          <el-option
            v-for="type in entityTypes"
            :key="type"
            :label="getEntityLabel(type)"
            :value="type"
          />
        </el-select>
      </div>

      <div class="node-search">
        <label>节点:</label>
        <el-select
          v-model="selectedSearchNode"
          class="node-search-select"
          clearable
          filterable
          remote
          reserve-keyword
          placeholder="搜索节点名称"
          :remote-method="filterNodeOptions"
          :loading="nodeSearchLoading"
          @change="focusNode"
        >
          <el-option
            v-for="item in nodeSearchOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </div>

      <div class="toolbar-right">
        <span class="node-count">节点: {{ nodeCount }}</span>
        <span class="edge-count">边: {{ edgeCount }}</span>
        <span v-if="isDragging" class="drag-status">拖拽中</span>
      </div>
    </div>

    <Transition name="legend">
      <div v-if="showLegend" class="legend-panel">
        <div class="legend-header">
          <h4>图谱图例</h4>
          <button class="close-btn" @click="toggleLegend">×</button>
        </div>

        <div class="legend-section">
          <h5>实体类型</h5>
          <div class="legend-items">
            <div
              v-for="type in entityTypes"
              :key="type"
              class="legend-item"
              :class="{ active: selectedNodeTypes.has(type) }"
              @click="toggleTypeFilter('node', type)"
            >
              <span class="legend-dot" :style="{ backgroundColor: getNodeColor(type) }" />
              <span class="legend-text">{{ getEntityLabel(type) }}</span>
              <span class="legend-count">({{ getTypeCount("node", type) }})</span>
            </div>
          </div>
        </div>

        <div class="legend-section">
          <h5>关系类型</h5>
          <div class="legend-items">
            <div
              v-for="type in relationTypes"
              :key="type"
              class="legend-item"
              :class="{ active: selectedEdgeTypes.has(type) }"
              @click="toggleTypeFilter('edge', type)"
            >
              <span class="legend-line" :style="{ backgroundColor: getEdgeColor(type) }" />
              <span class="legend-text">{{ getRelationLabel(type) }}</span>
              <span class="legend-count">({{ getTypeCount("edge", type) }})</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <div ref="sigmaContainer" class="sigma-container" :class="{ dragging: isDragging }"></div>

    <div v-if="loading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>加载图谱数据中...</p>
      </div>
    </div>

    <Transition name="tooltip">
      <div
        v-if="nodeTooltip.visible"
        class="node-tooltip"
        :style="{ left: `${nodeTooltip.x}px`, top: `${nodeTooltip.y}px` }"
      >
        <div class="tooltip-header">
          <h4>{{ nodeTooltip.data?.label }}</h4>
          <span class="node-type">{{ nodeTooltip.data?.type }}</span>
        </div>
        <div class="tooltip-content">
          <div v-if="nodeTooltip.data?.image" class="tooltip-image">
            <img :src="nodeTooltip.data.image" :alt="nodeTooltip.data.label" />
          </div>
          <div class="tooltip-item">
            <span class="label">ID:</span>
            <span class="value">{{ nodeTooltip.data?.id }}</span>
          </div>
          <div class="tooltip-item">
            <span class="label">度数:</span>
            <span class="value">{{ nodeTooltip.data?.degree }}</span>
          </div>
          <div v-if="nodeTooltip.data?.description" class="tooltip-item">
            <span class="label">描述:</span>
            <span class="value">{{ nodeTooltip.data.description }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Connection, List, Refresh, ZoomIn, ZoomOut } from "@element-plus/icons-vue";
import { createNodeImageProgram } from "@sigma/node-image";
import { ElMessage } from "element-plus";
import Graph from "graphology";
import ForceSupervisor from "graphology-layout-force/worker";
import Sigma from "sigma";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { fetchGraphData } from "@/services/knowledgeApi";
import type { GraphContext, GraphData, GraphEdge, GraphNode } from "@/types/knowledge";

const props = withDefaults(
  defineProps<{
    width?: number;
    height?: number;
    selectedEntity?: string;
    zoomLevel?: number;
  }>(),
  {
    width: 800,
    height: 600,
    selectedEntity: "",
    zoomLevel: 1,
  }
);

const emit = defineEmits<{
  nodeClick: [nodeId: string];
  edgeClick: [edgeId: string];
  backgroundClick: [];
  zoomChange: [level: number];
}>();

type SearchOption = {
  value: string;
  label: string;
};

const NODE_PALETTE = [
  "#4d3ca6",
  "#409eff",
  "#67c23a",
  "#e6a23c",
  "#f56c6c",
  "#909399",
  "#9c27b0",
  "#00acc1",
];
const EDGE_PALETTE = ["#606266", "#4d3ca6", "#409eff", "#67c23a", "#e6a23c"];

const sigmaContainer = ref<HTMLElement>();
const loading = ref(false);
const nodeCount = ref(0);
const edgeCount = ref(0);
const showLegend = ref(false);
const selectedMovieCategoryId = ref<string | null>(null);
const movieCategoryOptions = ref<SearchOption[]>([]);
const selectedEntityTypeFilter = ref<string | null>(null);
const selectedSearchNode = ref<string | null>(null);
const nodeSearchOptions = ref<SearchOption[]>([]);
const nodeSearchLoading = ref(false);
const isDragging = ref(false);
const isForceLayoutActive = ref(false);
const entityTypes = ref<string[]>([]);
const relationTypes = ref<string[]>([]);
const selectedNodeTypes = ref(new Set<string>());
const selectedEdgeTypes = ref(new Set<string>());
const highlightedNodes = ref(new Set<string>());
const highlightedEdges = ref(new Set<string>());
const categoryVisibleNodes = ref(new Set<string>());
const categoryVisibleEdges = ref(new Set<string>());
const nodeTooltip = ref<{
  visible: boolean;
  x: number;
  y: number;
  data: null | {
    id: string;
    label: string;
    type: string;
    degree: number;
    description?: string;
    image?: string;
  };
}>({
  visible: false,
  x: 0,
  y: 0,
  data: null,
});

const entityTypeLabels: Record<string, string> = {};
const relationTypeLabels: Record<string, string> = {};
const relationTypeColors: Record<string, string> = {};

let graph: Graph | null = null;
let sigma: Sigma | null = null;
let layout: ForceSupervisor | null = null;
let draggedNode: string | null = null;

async function initSigma() {
  if (!sigmaContainer.value) return;

  graph = new Graph();
  sigma = new Sigma(graph, sigmaContainer.value, {
    allowInvalidContainer: true,
    renderEdgeLabels: true,
    nodeProgramClasses: {
      image: createNodeImageProgram(),
    },
    nodeReducer: reduceNode,
    edgeReducer: reduceEdge,
  });

  bindSigmaEvents();
}

function reduceNode(nodeId: string, data: Record<string, unknown>) {
  const nodeType = String(data.originalType || data.type || "");
  const hasCategoryFilter = categoryVisibleNodes.value.size > 0;
  const hasTypeFilter = selectedNodeTypes.value.size > 0;
  const hasHighlight = highlightedNodes.value.size > 0;

  if (hasCategoryFilter && !categoryVisibleNodes.value.has(nodeId)) {
    return { ...data, hidden: true };
  }

  if (hasTypeFilter && !selectedNodeTypes.value.has(nodeType)) {
    return { ...data, hidden: true };
  }

  if (hasHighlight && !highlightedNodes.value.has(nodeId)) {
    return {
      ...data,
      color: "#d8dce5",
      label: "",
      type: data.image ? "image" : "circle",
      zIndex: 0,
    };
  }

  return {
    ...data,
    type: data.image ? "image" : "circle",
    zIndex: highlightedNodes.value.has(nodeId) ? 2 : 1,
  };
}

function reduceEdge(edgeId: string, data: Record<string, unknown>) {
  const edgeType = String(data.originalRelation || data.relation || "");
  const hasCategoryFilter = categoryVisibleEdges.value.size > 0;
  const hasTypeFilter = selectedEdgeTypes.value.size > 0;
  const hasHighlight = highlightedEdges.value.size > 0;

  if (hasCategoryFilter && !categoryVisibleEdges.value.has(edgeId)) {
    return { ...data, hidden: true };
  }

  if (hasTypeFilter && !selectedEdgeTypes.value.has(edgeType)) {
    return { ...data, hidden: true };
  }

  if (hasHighlight && !highlightedEdges.value.has(edgeId)) {
    return { ...data, hidden: true };
  }

  return data;
}

function bindSigmaEvents() {
  if (!sigma || !graph) return;

  sigma.on("clickNode", ({ node }) => {
    if (isDragging.value) return;
    focusNode(node);
    emit("nodeClick", node);
  });

  sigma.on("clickEdge", ({ edge }) => {
    highlightEdge(edge);
    emit("edgeClick", edge);
  });

  sigma.on("clickStage", () => {
    if (isDragging.value) return;
    clearHighlight();
    hideNodeTooltip();
    selectedSearchNode.value = null;
    emit("backgroundClick");
  });

  sigma.on("enterNode", ({ node }) => {
    if (isDragging.value) return;
    showNodeTooltip(node);
    if (sigmaContainer.value) sigmaContainer.value.style.cursor = "grab";
  });

  sigma.on("leaveNode", () => {
    hideNodeTooltip();
    if (sigmaContainer.value) sigmaContainer.value.style.cursor = "default";
  });

  sigma.on("downNode", ({ node }) => {
    isDragging.value = true;
    draggedNode = node;
    sigma?.getCamera().disable();
    hideNodeTooltip();
    if (sigmaContainer.value) sigmaContainer.value.style.cursor = "grabbing";
  });

  sigma.getMouseCaptor().on("mousemove", (event) => {
    if (!isDragging.value || !draggedNode || !graph || !sigma) return;

    const position = sigma.viewportToGraph({ x: event.x, y: event.y });
    graph.setNodeAttribute(draggedNode, "x", position.x);
    graph.setNodeAttribute(draggedNode, "y", position.y);
    sigma.refresh();
  });

  sigma.getMouseCaptor().on("mouseup", () => {
    if (!isDragging.value) return;

    sigma?.getCamera().enable();
    isDragging.value = false;
    draggedNode = null;
    if (sigmaContainer.value) sigmaContainer.value.style.cursor = "default";
  });

  sigma.getCamera().on("updated", () => {
    const ratio = sigma?.getCamera().ratio ?? 1;
    emit("zoomChange", 1 / ratio);
  });
}

async function loadGraphData(entityType: string, zoomLevel = 1) {
  if (!entityType) return;

  loading.value = true;
  try {
    const data = await fetchGraphData(entityType, zoomLevel);
    updateGraph(data);
  } catch (error) {
    console.error(error);
    ElMessage.error("图谱数据加载失败，请检查后端服务");
  } finally {
    loading.value = false;
  }
}

function updateGraph(data: GraphData) {
  if (!graph || !sigma) return;

  stopForceLayout();
  graph.clear();
  clearState();

  const nodes = normaliseNodes(data.nodes);
  const edges = normaliseEdges(data.edges);
  const radius = Math.max(120, nodes.length * 8);

  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    const nodeType = node.type || "entity";
    entityTypeLabels[nodeType] = node.typeLabel || nodeType;

    graph?.addNode(String(node.id), {
      label: node.label || String(node.id),
      originalType: nodeType,
      description: node.description,
      image: node.image,
      movieType: node.movieType,
      genre: node.genre,
      x: Math.cos(angle) * radius + Math.random() * 20,
      y: Math.sin(angle) * radius + Math.random() * 20,
      size: getNodeSize(nodeType, Boolean(node.image)),
      color: node.color || getNodeColor(nodeType),
      borderColor: "#ffffff",
      borderSize: node.image ? 2 : 0,
    });
  });

  edges.forEach((edge, index) => {
    const source = String(edge.source);
    const target = String(edge.target);
    if (!graph?.hasNode(source) || !graph.hasNode(target)) return;

    const edgeId = String(edge.id || `${source}-${target}-${index}`);
    if (graph.hasEdge(edgeId)) return;

    const relation = edge.relation || edge.label || "关联";
    relationTypeLabels[relation] = edge.label || relation;
    relationTypeColors[relation] = edge.color || getEdgeColor(relation);

    graph.addEdgeWithKey(edgeId, source, target, {
      label: edge.label || relation,
      originalRelation: relation,
      relation,
      weight: edge.weight || 1,
      color: edge.color || getEdgeColor(relation),
      size: Math.max(1, Math.min(Number(edge.weight || 1), 4)),
    });
  });

  nodeCount.value = graph.order;
  edgeCount.value = graph.size;
  analyseTypes();
  sigma.refresh();
  resetView();
}

function normaliseNodes(nodes: GraphNode[]) {
  return Array.isArray(nodes) ? nodes : [];
}

function normaliseEdges(edges: GraphEdge[]) {
  return Array.isArray(edges) ? edges : [];
}

function clearState() {
  nodeCount.value = 0;
  edgeCount.value = 0;
  entityTypes.value = [];
  relationTypes.value = [];
  selectedEntityTypeFilter.value = null;
  selectedNodeTypes.value.clear();
  selectedEdgeTypes.value.clear();
  highlightedNodes.value.clear();
  highlightedEdges.value.clear();
  nodeSearchOptions.value = [];
  selectedSearchNode.value = null;
  selectedMovieCategoryId.value = null;
  movieCategoryOptions.value = [];
  categoryVisibleNodes.value.clear();
  categoryVisibleEdges.value.clear();
}

function analyseTypes() {
  if (!graph) return;

  const nodeTypes = new Set<string>();
  const edgeTypes = new Set<string>();
  const categories: SearchOption[] = [];

  graph.forEachNode((nodeId, attributes) => {
    nodeTypes.add(String(attributes.originalType || attributes.type || "entity"));
    if (String(attributes.originalType || attributes.type) === "category") {
      categories.push({
        value: nodeId,
        label: String(attributes.label || nodeId),
      });
    }
  });

  graph.forEachEdge((_, attributes) => {
    edgeTypes.add(String(attributes.originalRelation || attributes.relation || "关联"));
  });

  entityTypes.value = [...nodeTypes].sort();
  relationTypes.value = [...edgeTypes].sort();
  movieCategoryOptions.value = categories.sort((a, b) =>
    a.label.localeCompare(b.label, "zh-CN")
  );
}

function applyMovieCategoryFilter(categoryId: string | null) {
  categoryVisibleNodes.value.clear();
  categoryVisibleEdges.value.clear();
  clearHighlight();

  if (!categoryId || !graph?.hasNode(categoryId)) {
    selectedMovieCategoryId.value = null;
    sigma?.refresh();
    return;
  }

  selectedMovieCategoryId.value = categoryId;
  categoryVisibleNodes.value.add(categoryId);

  const categoryMovies = findMoviesByCategory(categoryId);
  categoryMovies.forEach((movieId) => {
    categoryVisibleNodes.value.add(movieId);
    graph?.forEachEdge(movieId, (edgeId, attributes, source, target) => {
      categoryVisibleEdges.value.add(edgeId);
      categoryVisibleNodes.value.add(source);
      categoryVisibleNodes.value.add(target);
    });
  });

  graph.forEachEdge(categoryId, (edgeId) => {
    categoryVisibleEdges.value.add(edgeId);
  });

  layoutVisibleCategorySubgraph(categoryId, categoryMovies);
  focusCategoryView(categoryId, categoryMovies);
  sigma?.refresh();
}

function findMoviesByCategory(categoryId: string) {
  const movieIds = new Set<string>();
  if (!graph) return movieIds;

  graph.forEachEdge(categoryId, (_edgeId, attributes, source, target) => {
    const relation = String(attributes.originalRelation || attributes.relation || "");
    const otherNodeId = source === categoryId ? target : source;
    const otherNode = graph?.getNodeAttributes(otherNodeId);
    const isCategoryRelation = relation === "category" || relation.includes("category");
    if (isCategoryRelation && otherNode?.originalType === "movie") {
      movieIds.add(otherNodeId);
    }
  });

  return movieIds;
}

function layoutVisibleCategorySubgraph(categoryId: string, movieIds: Set<string>) {
  if (!graph) return;

  const movies = Array.from(movieIds);
  graph.setNodeAttribute(categoryId, "x", 0);
  graph.setNodeAttribute(categoryId, "y", 0);
  graph.setNodeAttribute(categoryId, "size", 24);

  const movieRadius = Math.max(220, movies.length * 10);
  movies.forEach((movieId, movieIndex) => {
    const movieAngle = (Math.PI * 2 * movieIndex) / Math.max(movies.length, 1);
    const movieX = Math.cos(movieAngle) * movieRadius;
    const movieY = Math.sin(movieAngle) * movieRadius;

    graph?.setNodeAttribute(movieId, "x", movieX);
    graph?.setNodeAttribute(movieId, "y", movieY);
    graph?.setNodeAttribute(movieId, "size", 22);

    const relatedNodes: string[] = [];
    graph?.forEachEdge(movieId, (_edgeId, _attributes, source, target) => {
      const otherNodeId = source === movieId ? target : source;
      if (otherNodeId !== categoryId && categoryVisibleNodes.value.has(otherNodeId)) {
        relatedNodes.push(otherNodeId);
      }
    });

    relatedNodes.forEach((nodeId, relatedIndex) => {
      const relatedAngle =
        movieAngle +
        ((relatedIndex + 1) / Math.max(relatedNodes.length + 1, 1) - 0.5) *
          Math.PI *
          0.8;
      const relatedRadius = 76 + (relatedIndex % 3) * 28;
      graph?.setNodeAttribute(nodeId, "x", movieX + Math.cos(relatedAngle) * relatedRadius);
      graph?.setNodeAttribute(nodeId, "y", movieY + Math.sin(relatedAngle) * relatedRadius);
    });
  });
}

function focusCategoryView(categoryId: string, movieIds: Set<string>) {
  if (!graph || !sigma) return;

  const focusIds = [categoryId, ...Array.from(movieIds)];
  const positions = focusIds
    .filter((nodeId) => graph?.hasNode(nodeId))
    .map((nodeId) => graph!.getNodeAttributes(nodeId));

  if (!positions.length) return;

  const center = positions.reduce(
    (acc, item) => ({
      x: acc.x + Number(item.x || 0) / positions.length,
      y: acc.y + Number(item.y || 0) / positions.length,
    }),
    { x: 0, y: 0 }
  );

  sigma.getCamera().animate({ x: center.x, y: center.y, ratio: 1.15 }, { duration: 450 });
}

function applyEntityTypeFilter(value: string | null) {
  selectedNodeTypes.value.clear();
  if (value) {
    selectedNodeTypes.value.add(value);
  }
  sigma?.refresh();
}

function filterNodeOptions(query: string) {
  nodeSearchLoading.value = true;
  const keyword = query.trim().toLowerCase();

  if (!keyword || !graph) {
    nodeSearchOptions.value = [];
    nodeSearchLoading.value = false;
    return;
  }

  const options: SearchOption[] = [];
  graph.forEachNode((nodeId, attributes) => {
    const label = String(attributes.label || nodeId);
    if (label.toLowerCase().includes(keyword)) {
      options.push({ value: nodeId, label });
    }
  });

  nodeSearchOptions.value = options.slice(0, 100);
  nodeSearchLoading.value = false;
}

function focusNode(nodeId: string | null) {
  if (!nodeId || !graph?.hasNode(nodeId)) return;

  clearHighlight();
  highlightedNodes.value.add(nodeId);
  graph.forEachNeighbor(nodeId, (neighbor) => highlightedNodes.value.add(neighbor));
  graph.forEachEdge(nodeId, (edge) => highlightedEdges.value.add(edge));

  const attributes = graph.getNodeAttributes(nodeId);
  sigma?.getCamera().animate(
    { x: Number(attributes.x || 0), y: Number(attributes.y || 0), ratio: 0.35 },
    { duration: 450 }
  );
  sigma?.refresh();
}

function highlightEdge(edgeId: string) {
  if (!graph?.hasEdge(edgeId)) return;

  clearHighlight();
  highlightedEdges.value.add(edgeId);

  const [source, target] = graph.extremities(edgeId);
  highlightedNodes.value.add(source);
  highlightedNodes.value.add(target);
  sigma?.refresh();
}

function clearHighlight() {
  highlightedNodes.value.clear();
  highlightedEdges.value.clear();
  sigma?.refresh();
}

function showNodeTooltip(nodeId: string) {
  if (!graph || !sigma || !graph.hasNode(nodeId)) return;

  const attributes = graph.getNodeAttributes(nodeId);
  const position = sigma.graphToViewport({
    x: Number(attributes.x || 0),
    y: Number(attributes.y || 0),
  });

  nodeTooltip.value = {
    visible: true,
    x: Math.min(position.x + 20, window.innerWidth - 320),
    y: Math.max(position.y - 130, 10),
    data: {
      id: nodeId,
      label: String(attributes.label || nodeId),
      type: String(attributes.originalType || "entity"),
      degree: graph.degree(nodeId),
      description: attributes.description ? String(attributes.description) : undefined,
      image: attributes.image ? String(attributes.image) : undefined,
    },
  };
}

function hideNodeTooltip() {
  nodeTooltip.value.visible = false;
}

function toggleLegend() {
  showLegend.value = !showLegend.value;
}

function toggleTypeFilter(kind: "node" | "edge", type: string) {
  const target = kind === "node" ? selectedNodeTypes.value : selectedEdgeTypes.value;
  if (target.has(type)) {
    target.delete(type);
  } else {
    target.add(type);
  }

  selectedEntityTypeFilter.value =
    kind === "node" && selectedNodeTypes.value.size === 1
      ? [...selectedNodeTypes.value][0]
      : null;
  sigma?.refresh();
}

function getTypeCount(kind: "node" | "edge", type: string) {
  if (!graph) return 0;

  let count = 0;
  if (kind === "node") {
    graph.forEachNode((_, attributes) => {
      if (String(attributes.originalType || attributes.type) === type) count += 1;
    });
  } else {
    graph.forEachEdge((_, attributes) => {
      if (String(attributes.originalRelation || attributes.relation) === type) count += 1;
    });
  }
  return count;
}

function getEntityLabel(type: string) {
  return entityTypeLabels[type] || type;
}

function getRelationLabel(type: string) {
  return relationTypeLabels[type] || type;
}

function getNodeColor(type: string) {
  return NODE_PALETTE[getHashIndex(type, NODE_PALETTE.length)];
}

function getEdgeColor(type: string) {
  return relationTypeColors[type] || EDGE_PALETTE[getHashIndex(type, EDGE_PALETTE.length)];
}

function getNodeSize(type: string, hasImage = false) {
  if (hasImage) return 24;
  const sizeByType: Record<string, number> = {
    movie: 18,
    category: 16,
    Class: 14,
    person: 12,
  };
  return sizeByType[type] || 10;
}

function getHashIndex(value: string, length: number) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

function zoomIn() {
  sigma?.getCamera().animatedZoom({ duration: 250 });
}

function zoomOut() {
  sigma?.getCamera().animatedUnzoom({ duration: 250 });
}

function resetView() {
  sigma?.getCamera().animatedReset({ duration: 450 });
}

function toggleForceLayout() {
  if (isForceLayoutActive.value) {
    stopForceLayout();
  } else {
    startForceLayout();
  }
}

function startForceLayout() {
  if (!graph || graph.order === 0) return;

  stopForceLayout();
  layout = new ForceSupervisor(graph);
  layout.start();
  isForceLayoutActive.value = true;

  window.setTimeout(() => {
    stopForceLayout();
    sigma?.refresh();
  }, 3000);
}

function stopForceLayout() {
  if (layout) {
    layout.kill();
    layout = null;
  }
  isForceLayoutActive.value = false;
}

function resizeGraph() {
  sigma?.refresh();
}

function getCurrentGraphData(): GraphContext | null {
  if (!graph) return null;

  const visibleNodeIds = getVisibleNodeIds();
  const visibleEdgeIds = getVisibleEdgeIds(visibleNodeIds);
  const selectedCategory = selectedMovieCategoryId.value
    ? graph.getNodeAttributes(selectedMovieCategoryId.value)
    : null;

  return {
    nodes: visibleNodeIds.map((nodeId) => {
      const attributes = graph!.getNodeAttributes(nodeId);
      return {
        id: nodeId,
        label: String(attributes.label || nodeId),
        type: String(attributes.originalType || attributes.type || "entity"),
        description: attributes.description ? String(attributes.description) : undefined,
        image: attributes.image ? String(attributes.image) : undefined,
        movieType: attributes.movieType ? String(attributes.movieType) : undefined,
        genre: attributes.genre ? String(attributes.genre) : undefined,
      };
    }),
    edges: visibleEdgeIds.map((edgeId) => {
      const attributes = graph!.getEdgeAttributes(edgeId);
      return {
        id: edgeId,
        source: graph!.source(edgeId),
        target: graph!.target(edgeId),
        label: attributes.label ? String(attributes.label) : undefined,
        relation: String(attributes.originalRelation || attributes.relation || "关联"),
        weight: Number(attributes.weight || 1),
      };
    }),
    nodeCount: visibleNodeIds.length,
    edgeCount: visibleEdgeIds.length,
    currentFilter: selectedCategory
      ? {
          type: "movie-category",
          id: selectedMovieCategoryId.value,
          label: String(selectedCategory.label || selectedMovieCategoryId.value),
        }
      : {
          type: "all",
        },
  };
}

function getVisibleNodeIds() {
  if (!graph) return [];

  return graph.nodes().filter((nodeId) => {
    const attributes = graph!.getNodeAttributes(nodeId);
    const nodeType = String(attributes.originalType || attributes.type || "");
    const matchesCategory =
      categoryVisibleNodes.value.size === 0 || categoryVisibleNodes.value.has(nodeId);
    const matchesType =
      selectedNodeTypes.value.size === 0 || selectedNodeTypes.value.has(nodeType);

    return matchesCategory && matchesType;
  });
}

function getVisibleEdgeIds(visibleNodeIds: string[]) {
  if (!graph) return [];

  const visibleNodes = new Set(visibleNodeIds);
  return graph.edges().filter((edgeId) => {
    const attributes = graph!.getEdgeAttributes(edgeId);
    const edgeType = String(attributes.originalRelation || attributes.relation || "");
    const source = graph!.source(edgeId);
    const target = graph!.target(edgeId);
    const matchesCategory =
      categoryVisibleEdges.value.size === 0 || categoryVisibleEdges.value.has(edgeId);
    const matchesType =
      selectedEdgeTypes.value.size === 0 || selectedEdgeTypes.value.has(edgeType);

    return (
      matchesCategory &&
      matchesType &&
      visibleNodes.has(source) &&
      visibleNodes.has(target)
    );
  });
}

watch(
  () => [props.width, props.height],
  () => nextTick(resizeGraph)
);

watch(
  () => props.selectedEntity,
  (entityType) => {
    if (entityType) {
      void loadGraphData(entityType, props.zoomLevel);
    }
  }
);

onMounted(async () => {
  await nextTick();
  await initSigma();
  window.addEventListener("resize", resizeGraph);

  if (props.selectedEntity) {
    await loadGraphData(props.selectedEntity, props.zoomLevel);
  }
});

onUnmounted(() => {
  window.removeEventListener("resize", resizeGraph);
  stopForceLayout();
  sigma?.kill();
  sigma = null;
  graph = null;
});

defineExpose({
  loadGraphData,
  updateGraph,
  resizeGraph,
  clearHighlight,
  resetView,
  getCurrentGraphData,
});
</script>

<style scoped lang="scss">
.knowledge-graph {
  position: relative;
  width: 100%;
  height: 100%;
  background: #fafafa;
}

.graph-toolbar {
  position: absolute;
  top: 10px;
  right: 10px;
  left: 10px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.toolbar-left,
.toolbar-right,
.movie-category-filter,
.entity-type-filter,
.node-search {
  display: flex;
  align-items: center;
  gap: 8px;
}

.movie-category-filter,
.entity-type-filter,
.node-search {
  label {
    color: #666666;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
}

.movie-category-select {
  width: 150px;
}

.entity-type-select {
  width: 150px;
}

.node-search-select {
  width: 180px;
}

.toolbar-btn {
  display: flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  color: #000000;
  background: #ffffff;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;

  &:hover,
  &.active {
    color: #ffffff;
    background: #4d3ca6;
    border-color: #4d3ca6;
  }
}

.toolbar-right {
  color: #666666;
  font-size: 12px;

  span {
    padding: 2px 6px;
    background: #f0f2f5;
    border-radius: 4px;
    white-space: nowrap;
  }

  .drag-status {
    color: #ffffff;
    background: #52c41a;
  }
}

.sigma-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  user-select: none;

  &.dragging {
    cursor: grabbing !important;
  }
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.78);
}

.loading-content {
  display: grid;
  justify-items: center;
  gap: 8px;
  color: #666666;

  p {
    margin: 0;
    font-size: 14px;
  }
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #d8d8d8;
  border-top-color: #4d3ca6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.legend-panel {
  position: absolute;
  top: 60px;
  right: 20px;
  z-index: 1000;
  width: 280px;
  max-height: 70vh;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.legend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;

  h4 {
    margin: 0;
    color: #333333;
    font-size: 14px;
    font-weight: 600;
  }
}

.close-btn {
  display: flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  color: #999999;
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
}

.legend-section {
  padding: 16px;
  border-bottom: 1px solid #f5f5f5;

  h5 {
    margin: 0 0 12px;
    color: #555555;
    font-size: 13px;
    font-weight: 600;
  }
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;

  &:hover {
    background: #f8f9fa;
  }

  &.active {
    background: #e3f2fd;
    border-color: #90caf9;
  }
}

.legend-dot {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 50%;
}

.legend-line {
  width: 16px;
  height: 3px;
  flex-shrink: 0;
  border-radius: 2px;
}

.legend-text {
  flex: 1;
  color: #333333;
  font-weight: 500;
}

.legend-count {
  color: #666666;
  font-size: 11px;
}

.node-tooltip {
  position: fixed;
  z-index: 99999;
  min-width: 200px;
  max-width: 300px;
  padding: 12px;
  color: #ffffff;
  background: #2a2a2a;
  border: 1px solid #4d3ca6;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.tooltip-header {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #4d3ca6;

  h4 {
    margin: 0 0 4px;
    color: #ffffff;
    font-size: 14px;
  }
}

.node-type {
  padding: 2px 6px;
  color: #c8c0ff;
  background: rgba(77, 60, 166, 0.2);
  border-radius: 4px;
  font-size: 12px;
}

.tooltip-image {
  display: flex;
  height: 80px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  overflow: hidden;
  background: #333333;
  border-radius: 4px;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.tooltip-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;

  .label {
    color: #cccccc;
  }

  .value {
    flex: 1;
    color: #ffffff;
    font-weight: 500;
    text-align: right;
    word-break: break-word;
  }
}

.legend-enter-active,
.legend-leave-active,
.tooltip-enter-active,
.tooltip-leave-active {
  transition: all 0.2s ease;
}

.legend-enter-from,
.legend-leave-to,
.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1200px) {
  .graph-toolbar {
    flex-wrap: wrap;
  }
}
</style>
