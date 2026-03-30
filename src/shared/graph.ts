export interface GraphNode {
  id: string;
  type: string;
  content: string;
  actor: string;
  createdAt: string;
  position?: {
    x: number;
    y: number;
  };
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface BrainstormGraph {
  id: string;
  name: string;
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  rootNodeId: string;
  selectedNodeId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BubbleToInsert {
  type: string;
  content: string;
}

export interface GraphHistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}
