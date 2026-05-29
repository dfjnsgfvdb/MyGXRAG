export interface MenuItemStats {
  entities: number;
  relations: number;
  triples: number;
}

export interface MenuItem {
  id: string;
  name: string;
  stats?: MenuItemStats;
}

export interface MenuGroup {
  id: string;
  title: string;
  items: MenuItem[];
}

export interface MenuData {
  entityTypes: MenuGroup[];
}

export interface GraphNode {
  id: string | number;
  label: string;
  type: string;
  description?: string;
  image?: string;
  typeLabel?: string;
  color?: string;
  movieType?: string;
  genre?: string;
}

export interface GraphEdge {
  id: string | number;
  source: string | number;
  target: string | number;
  label?: string;
  relation?: string;
  weight?: number;
  color?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphContext extends GraphData {
  nodeCount: number;
  edgeCount: number;
  currentFilter?: {
    type: string;
    id?: string | null;
    label?: string;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ModelInfo {
  model: string;
  provider: string;
  features: string[];
  maxTokens?: number;
  temperature?: number;
}
