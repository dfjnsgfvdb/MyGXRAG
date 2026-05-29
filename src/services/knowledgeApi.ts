import axios from "axios";
import type { GraphData, MenuData } from "@/types/knowledge";

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

const http = axios.create({
  baseURL: "http://localhost:9090",
  timeout: 30000,
});

export async function fetchMenuData() {
  const response = await http.get<ApiResponse<MenuData>>("/rest/mock/menu");
  if (response.data.code !== 200) {
    throw new Error(response.data.message || "菜单数据加载失败");
  }

  return response.data.data;
}

export async function fetchGraphData(entityType: string, zoomLevel = 1) {
  const response = await http.get<ApiResponse<GraphData>>("/rest/mock/graph", {
    params: {
      entityType,
      zoomLevel,
      limit: 1000,
    },
  });

  if (response.data.code !== 200) {
    throw new Error(response.data.message || "图谱数据加载失败");
  }

  return response.data.data;
}
