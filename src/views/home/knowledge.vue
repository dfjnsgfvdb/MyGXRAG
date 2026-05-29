<template>
  <div class="knowledge-container">
    <aside class="left-panel" :class="{ hidden: !showLeftPanel }">
      <div class="menu-header">
        <h3>知识图谱导航</h3>
      </div>

      <div class="menu-content">
        <div v-if="menuLoading" class="menu-loading">
          <div class="loading-spinner"></div>
          <p>加载菜单数据中...</p>
        </div>

        <template v-else-if="menuData">
          <div
            v-for="group in menuData.entityTypes"
            :key="group.id"
            class="menu-group"
          >
            <div class="menu-title" @click="toggleMenuGroup(group.id)">
              <div class="title-content">
                <el-icon><Folder /></el-icon>
                <span>{{ group.title }}</span>
              </div>
              <i class="expand-icon" :class="{ expanded: expandedGroups[group.id] }">
                ▼
              </i>
            </div>

            <ul class="menu-list" :class="{ collapsed: !expandedGroups[group.id] }">
              <li
                v-for="item in group.items"
                :key="item.id"
                :class="{ active: selectedEntityType === item.id }"
                @click="selectMenuItem(item)"
                @mouseenter="showTooltip($event, item)"
                @mouseleave="hideTooltip"
              >
                <span class="item-name">{{ item.name }}</span>
              </li>
            </ul>
          </div>
        </template>

        <div v-else class="menu-error">
          <p>菜单加载失败</p>
          <button class="retry-btn" @click="loadMenuData">重试</button>
        </div>
      </div>
    </aside>

    <main class="center-panel">
      <button class="toggle-btn left-toggle" @click="toggleLeftPanel">
        {{ showLeftPanel ? "◀" : "▶" }}
      </button>

      <div class="graph-container">
        <KnowledgeGraph
          ref="knowledgeGraphRef"
          :selected-entity="selectedEntityType"
          :zoom-level="currentZoomLevel"
          @zoom-change="handleZoomChange"
        />
      </div>

      <button class="toggle-btn right-toggle" @click="toggleRightPanel">
        {{ showRightPanel ? "▶" : "◀" }}
      </button>
    </main>

    <aside class="right-panel" :class="{ hidden: !showRightPanel }">
      <AIAssistant
        ref="aiAssistantRef"
        :knowledge-graph-ref="knowledgeGraphRef"
      />
    </aside>

    <div
      v-if="tooltip.visible"
      class="custom-tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <div class="tooltip-title">数据规模</div>
      <div class="tooltip-item">
        <span>实体数：</span>
        <strong>{{ formatNumber(tooltip.stats?.entities || 0) }}</strong>
      </div>
      <div class="tooltip-item">
        <span>关系数：</span>
        <strong>{{ formatNumber(tooltip.stats?.relations || 0) }}</strong>
      </div>
      <div class="tooltip-item">
        <span>三元组：</span>
        <strong>{{ formatNumber(tooltip.stats?.triples || 0) }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Folder } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { nextTick, onMounted, ref } from "vue";

import AIAssistant from "@/components/KnowledgeGraph/AIAssistant.vue";
import KnowledgeGraph from "@/components/KnowledgeGraph/graph.vue";
import { fetchMenuData } from "@/services/knowledgeApi";
import type { MenuData, MenuItem, MenuItemStats } from "@/types/knowledge";

const showLeftPanel = ref(true);
const showRightPanel = ref(true);
const menuData = ref<MenuData | null>(null);
const menuLoading = ref(false);
const selectedEntityType = ref("");
const currentZoomLevel = ref(1);
const expandedGroups = ref<Record<string, boolean>>({});

const knowledgeGraphRef = ref<InstanceType<typeof KnowledgeGraph>>();
const aiAssistantRef = ref<InstanceType<typeof AIAssistant>>();

const tooltip = ref<{
  visible: boolean;
  x: number;
  y: number;
  stats?: MenuItemStats;
}>({
  visible: false,
  x: 0,
  y: 0,
});

function formatNumber(value: number) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function resizeGraphAfterLayoutChange() {
  window.setTimeout(() => {
    knowledgeGraphRef.value?.resizeGraph();
  }, 300);
}

function toggleLeftPanel() {
  showLeftPanel.value = !showLeftPanel.value;
  resizeGraphAfterLayoutChange();
}

function toggleRightPanel() {
  showRightPanel.value = !showRightPanel.value;
  resizeGraphAfterLayoutChange();
}

function toggleMenuGroup(groupId: string) {
  expandedGroups.value[groupId] = !expandedGroups.value[groupId];
}

function showTooltip(event: MouseEvent, item: MenuItem) {
  if (!item.stats) return;

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  tooltip.value = {
    visible: true,
    x: rect.right + 10,
    y: rect.top,
    stats: item.stats,
  };
}

function hideTooltip() {
  tooltip.value.visible = false;
}

function selectMenuItem(item: MenuItem) {
  if (selectedEntityType.value === item.id) return;

  selectedEntityType.value = item.id;
  aiAssistantRef.value?.clearChat();
  ElMessage.info(`正在加载 ${item.name} 的关系图谱...`);
}

async function loadMenuData() {
  menuLoading.value = true;

  try {
    const data = await fetchMenuData();
    menuData.value = data;
    expandedGroups.value = Object.fromEntries(
      data.entityTypes.map((group) => [group.id, true])
    );

    const firstItem = data.entityTypes[0]?.items[0];
    if (firstItem) {
      selectedEntityType.value = firstItem.id;
      await nextTick();
      ElMessage.info(`已自动加载 ${firstItem.name}`);
    } else {
      ElMessage.warning("没有可用的图谱数据");
    }
  } catch (error) {
    console.error(error);
    menuData.value = null;
    ElMessage.error("菜单加载失败，请检查后端服务");
  } finally {
    menuLoading.value = false;
  }
}

function handleZoomChange(zoomLevel: number) {
  currentZoomLevel.value = zoomLevel;
}

onMounted(loadMenuData);
</script>

<style scoped lang="scss">
.knowledge-container {
  display: flex;
  height: 100vh;
  min-width: 1120px;
  overflow: hidden;
  background: #f5f7fa;
}

.left-panel {
  display: flex;
  width: 250px;
  height: 100%;
  flex-shrink: 0;
  flex-direction: column;
  background: #1a1a1a;
  border-right: 1px solid #333333;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.3);
  transition: width 0.3s ease;

  &.hidden {
    width: 0;
    overflow: hidden;
  }
}

.menu-header {
  display: flex;
  height: 60px;
  align-items: center;
  padding: 0 20px;
  background: #111111;
  border-bottom: 1px solid #333333;

  h3 {
    margin: 0;
    color: #ffffff;
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
  }
}

.menu-content {
  height: calc(100% - 60px);
  padding: 20px 0;
  overflow-y: auto;
}

.menu-loading,
.menu-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #888888;
  font-size: 14px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  margin-bottom: 12px;
  border: 2px solid #3a3a3a;
  border-top-color: #4d3ca6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.retry-btn {
  margin-top: 12px;
  padding: 6px 12px;
  color: #ffffff;
  background: #4d3ca6;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.menu-group {
  margin-bottom: 24px;
}

.menu-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px 8px;
  color: #888888;
  border-bottom: 1px solid #333333;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;

  &:hover {
    color: #4d3ca6;
  }
}

.title-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expand-icon {
  font-size: 10px;
  font-style: normal;
  transition: transform 0.3s ease;

  &.expanded {
    transform: rotate(180deg);
  }
}

.menu-list {
  max-height: 240px;
  margin: 8px 0 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
  transition: max-height 0.3s ease;

  &.collapsed {
    max-height: 0;
    margin: 0;
  }

  li {
    display: flex;
    align-items: center;
    padding: 8px 20px;
    color: #cccccc;
    cursor: pointer;
    border-left: 3px solid transparent;
    font-size: 14px;
    white-space: nowrap;

    &:hover {
      color: #4d3ca6;
      background: #333333;
    }

    &.active {
      color: #ffffff;
      background: #2a2a2a;
      border-left-color: #4d3ca6;
    }
  }
}

.center-panel {
  position: relative;
  display: flex;
  height: 100%;
  min-width: 900px;
  flex: 1;
  flex-direction: column;
  background: #ffffff;
}

.graph-container {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.right-panel {
  display: flex;
  width: 350px;
  height: 100%;
  flex-shrink: 0;
  flex-direction: column;
  background: #1a1a1a;
  border-left: 1px solid #333333;
  box-shadow: -2px 0 4px rgba(0, 0, 0, 0.3);
  transition: width 0.3s ease;

  &.hidden {
    width: 0;
    overflow: hidden;
  }
}

.toggle-btn {
  position: absolute;
  top: 50%;
  z-index: 200;
  display: flex;
  width: 24px;
  height: 48px;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: #4d3ca6;
  border: 0;
  cursor: pointer;
  opacity: 0.7;
  transform: translateY(-50%);
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 1;
  }
}

.left-toggle {
  left: 0;
  border-radius: 0 4px 4px 0;
}

.right-toggle {
  right: 0;
  border-radius: 4px 0 0 4px;
}

.custom-tooltip {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  padding: 12px;
  color: #ffffff;
  background: #2a2a2a;
  border: 1px solid #4d3ca6;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 13px;
  line-height: 1.4;
}

.tooltip-title {
  margin-bottom: 8px;
  padding-bottom: 4px;
  color: #8b7cff;
  border-bottom: 1px solid #4d3ca6;
  font-weight: 600;
}

.tooltip-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
