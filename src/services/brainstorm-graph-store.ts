import fs from 'fs';
import path from 'path';
import {
  BrainstormGraph,
  BubbleToInsert,
  GraphEdge,
  GraphHistoryStatus,
  GraphNode,
} from '../shared/graph';

interface GraphHistory {
  past: BrainstormGraph[];
  future: BrainstormGraph[];
}

const graphs = new Map<string, BrainstormGraph>();
const histories = new Map<string, GraphHistory>();
const STORE_PATH = process.env.BRAINSTORM_STORE_PATH
  ? path.resolve(process.env.BRAINSTORM_STORE_PATH)
  : path.join(process.cwd(), 'data', 'brainstorm-graphs.json');
const PERSISTENCE_ENABLED = process.env.NODE_ENV !== 'test';
let storeLoaded = false;

function nodeId(prefix = 'node'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function withDefaults(raw: Partial<BrainstormGraph>): BrainstormGraph {
  const createdAt = raw.createdAt || nowIso();
  return {
    id: raw.id || `graph-${Date.now().toString(36)}`,
    name: raw.name || raw.id || 'Untitled Graph',
    bookmarked: Boolean(raw.bookmarked),
    createdAt,
    updatedAt: raw.updatedAt || createdAt,
    rootNodeId: raw.rootNodeId || '',
    selectedNodeId: raw.selectedNodeId || raw.rootNodeId || '',
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
  };
}

function persistStore(): void {
  if (!PERSISTENCE_ENABLED) {
    return;
  }

  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload = {
    version: 1,
    graphs: Array.from(graphs.values()),
  };

  fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

function loadStoreIfNeeded(): void {
  if (storeLoaded || !PERSISTENCE_ENABLED) {
    storeLoaded = true;
    return;
  }

  if (!fs.existsSync(STORE_PATH)) {
    storeLoaded = true;
    return;
  }

  try {
    const content = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(content) as { graphs?: Partial<BrainstormGraph>[] };
    const loadedGraphs = Array.isArray(parsed.graphs) ? parsed.graphs : [];

    loadedGraphs.forEach((rawGraph) => {
      const graph = withDefaults(rawGraph);
      graphs.set(graph.id, graph);
    });
  } catch {
    // If parsing fails we start from an empty in-memory store.
  }

  storeLoaded = true;
}

function touchGraph(graph: BrainstormGraph): void {
  graph.updatedAt = nowIso();
}

function cloneGraph(graph: BrainstormGraph): BrainstormGraph {
  return JSON.parse(JSON.stringify(graph)) as BrainstormGraph;
}

function getHistory(graphId: string): GraphHistory {
  const existing = histories.get(graphId);
  if (existing) {
    return existing;
  }
  const created: GraphHistory = { past: [], future: [] };
  histories.set(graphId, created);
  return created;
}

function recordSnapshotBeforeMutation(graph: BrainstormGraph): void {
  const history = getHistory(graph.id);
  history.past.push(cloneGraph(graph));
  if (history.past.length > 100) {
    history.past.shift();
  }
  history.future = [];
}

function replaceGraph(graphId: string, graph: BrainstormGraph): BrainstormGraph {
  graphs.set(graphId, graph);
  persistStore();
  return graph;
}

function computePrimaryRootNodeId(graph: BrainstormGraph): string {
  if (graph.nodes.length === 0) {
    return '';
  }

  const children = new Set(graph.edges.map((edge) => edge.to));
  const firstParentless = graph.nodes.find((node) => !children.has(node.id));
  return firstParentless?.id ?? graph.nodes[0].id;
}

function normalizeGraphPointers(graph: BrainstormGraph): void {
  graph.rootNodeId = computePrimaryRootNodeId(graph);

  if (!graph.selectedNodeId || !graph.nodes.some((node) => node.id === graph.selectedNodeId)) {
    graph.selectedNodeId = graph.rootNodeId || '';
  }
}

export function createGraph(id?: string): BrainstormGraph {
  loadStoreIfNeeded();

  const graphId = id && id.trim() ? id.trim() : `graph-${Date.now().toString(36)}`;

  const graph: BrainstormGraph = {
    id: graphId,
    name: graphId,
    bookmarked: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rootNodeId: '',
    selectedNodeId: '',
    nodes: [],
    edges: [],
  };

  graphs.set(graphId, graph);
  histories.set(graphId, { past: [], future: [] });
  persistStore();
  return graph;
}

export function listGraphs(): Array<{ id: string; nodeCount: number; edgeCount: number }> {
  loadStoreIfNeeded();

  return Array.from(graphs.values()).map((graph) => ({
    id: graph.id,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  }));
}

export function listGraphSummaries(): Array<{
  id: string;
  name: string;
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
}> {
  loadStoreIfNeeded();

  return Array.from(graphs.values()).map((graph) => ({
    id: graph.id,
    name: graph.name,
    bookmarked: graph.bookmarked,
    createdAt: graph.createdAt,
    updatedAt: graph.updatedAt,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  }));
}

export function getGraph(graphId: string): BrainstormGraph | undefined {
  loadStoreIfNeeded();
  return graphs.get(graphId);
}

export function exportGraph(graphId: string): BrainstormGraph {
  loadStoreIfNeeded();

  const graph = getGraph(graphId);
  if (!graph) {
    throw new Error(`Graph '${graphId}' not found`);
  }

  return cloneGraph(graph);
}

export function importGraph(rawGraph: Partial<BrainstormGraph>, overrideId?: string): BrainstormGraph {
  loadStoreIfNeeded();

  if (!rawGraph || !Array.isArray(rawGraph.nodes) || !Array.isArray(rawGraph.edges)) {
    throw new Error('Invalid graph payload: nodes and edges arrays are required');
  }

  const sanitized = withDefaults(rawGraph);
  const graphId = overrideId && overrideId.trim() ? overrideId.trim() : sanitized.id;
  sanitized.id = graphId;
  sanitized.name = sanitized.name || graphId;

  const nodeIds = new Set(sanitized.nodes.map((node) => node.id));

  sanitized.edges = sanitized.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  normalizeGraphPointers(sanitized);
  touchGraph(sanitized);

  graphs.set(graphId, sanitized);
  histories.set(graphId, { past: [], future: [] });
  persistStore();

  return sanitized;
}

export function getOrCreateGraph(graphId = 'default'): BrainstormGraph {
  loadStoreIfNeeded();

  const existing = getGraph(graphId);
  return existing ?? createGraph(graphId);
}

function insertNode(graph: BrainstormGraph, node: GraphNode): void {
  graph.nodes.push(node);
}

function insertEdge(graph: BrainstormGraph, edge: GraphEdge): void {
  graph.edges.push(edge);
}

export function appendBubblesToGraph(params: {
  graphId: string;
  parentNodeIds: string[];
  bubbles: BubbleToInsert[];
  actor: string;
  mode?: 'pause' | 'linear' | 'fork' | 'fork_multiple' | 'merge';
  outputMode?: 'chain';
}): { graph: BrainstormGraph; createdNodeIds: string[] } {
  loadStoreIfNeeded();

  const graph = getOrCreateGraph(params.graphId);
  recordSnapshotBeforeMutation(graph);
  const createdNodeIds: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const fallbackParentId = graph.selectedNodeId || graph.rootNodeId;
  const parentIds = params.parentNodeIds.length
    ? params.parentNodeIds.filter((id) => nodeIds.has(id))
    : (fallbackParentId && nodeIds.has(fallbackParentId) ? [fallbackParentId] : []);
  const mode = params.outputMode === 'chain' ? 'chain' : params.mode ?? 'linear';

  if (mode === 'chain') {
    let previousId = parentIds[0];
    for (const bubble of params.bubbles) {
      const id = nodeId('bubble');
      const node: GraphNode = {
        id,
        type: bubble.type,
        content: bubble.content,
        actor: params.actor,
        createdAt: nowIso(),
      };
      insertNode(graph, node);
      if (previousId) {
        insertEdge(graph, { from: previousId, to: id });
      }
      previousId = id;
      createdNodeIds.push(id);
    }
  } else if (mode === 'merge') {
    const first = params.bubbles[0];
    if (first) {
      const id = nodeId('bubble');
      const node: GraphNode = {
        id,
        type: first.type,
        content: first.content,
        actor: params.actor,
        createdAt: nowIso(),
      };
      insertNode(graph, node);
      for (const parentId of parentIds) {
        insertEdge(graph, { from: parentId, to: id });
      }
      createdNodeIds.push(id);
    }
  } else {
    const parentId = parentIds[0];
    for (const bubble of params.bubbles) {
      const id = nodeId('bubble');
      const node: GraphNode = {
        id,
        type: bubble.type,
        content: bubble.content,
        actor: params.actor,
        createdAt: nowIso(),
      };
      insertNode(graph, node);
      if (parentId) {
        insertEdge(graph, { from: parentId, to: id });
      }
      createdNodeIds.push(id);
    }
  }

  if (createdNodeIds.length > 0) {
    graph.selectedNodeId = createdNodeIds[createdNodeIds.length - 1];
  }

  normalizeGraphPointers(graph);

  touchGraph(graph);
  persistStore();

  return { graph, createdNodeIds };
}

export function createNodeInGraph(params: {
  graphId: string;
  type: string;
  content: string;
  actor?: string;
  parentNodeId?: string;
  position?: { x: number; y: number };
}): BrainstormGraph {
  loadStoreIfNeeded();

  const graph = getOrCreateGraph(params.graphId);
  recordSnapshotBeforeMutation(graph);

  const created: GraphNode = {
    id: nodeId('node'),
    type: params.type,
    content: params.content,
    actor: params.actor || 'user',
    createdAt: nowIso(),
    ...(params.position
      ? {
        position: {
          x: Math.round(params.position.x),
          y: Math.round(params.position.y),
        },
      }
      : {}),
  };

  insertNode(graph, created);

  if (params.parentNodeId && graph.nodes.some((node) => node.id === params.parentNodeId)) {
    insertEdge(graph, { from: params.parentNodeId, to: created.id });
  }

  graph.selectedNodeId = created.id;
  normalizeGraphPointers(graph);
  touchGraph(graph);
  persistStore();

  return graph;
}

export function deleteNodeSubtree(graphId: string, nodeId: string): BrainstormGraph {
  loadStoreIfNeeded();

  const graph = getGraph(graphId);
  if (!graph) {
    throw new Error(`Graph '${graphId}' not found`);
  }

  if (!graph.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`Node '${nodeId}' not found in graph '${graphId}'`);
  }

  recordSnapshotBeforeMutation(graph);

  const childrenByParent = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const children = childrenByParent.get(edge.from) ?? [];
    children.push(edge.to);
    childrenByParent.set(edge.from, children);
  }

  const toDelete = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (toDelete.has(current)) {
      continue;
    }
    toDelete.add(current);
    const children = childrenByParent.get(current) ?? [];
    for (const childId of children) {
      queue.push(childId);
    }
  }

  graph.nodes = graph.nodes.filter((node) => !toDelete.has(node.id));
  graph.edges = graph.edges.filter((edge) => !toDelete.has(edge.from) && !toDelete.has(edge.to));

  normalizeGraphPointers(graph);
  touchGraph(graph);
  persistStore();

  return graph;
}

export function setSelectedNode(graphId: string, nodeIdToSelect: string): BrainstormGraph {
  loadStoreIfNeeded();

  const graph = getOrCreateGraph(graphId);
  const exists = graph.nodes.some((n) => n.id === nodeIdToSelect);
  if (!exists) {
    throw new Error(`Node '${nodeIdToSelect}' does not exist in graph '${graphId}'`);
  }
  recordSnapshotBeforeMutation(graph);
  graph.selectedNodeId = nodeIdToSelect;
  touchGraph(graph);
  persistStore();

  return graph;
}

export function updateGraphMetadata(
  graphId: string,
  updates: { name?: string; bookmarked?: boolean },
): BrainstormGraph {
  loadStoreIfNeeded();

  const graph = getGraph(graphId);
  if (!graph) {
    throw new Error(`Graph '${graphId}' not found`);
  }

  recordSnapshotBeforeMutation(graph);

  if (typeof updates.name === 'string' && updates.name.trim()) {
    graph.name = updates.name.trim();
  }

  if (typeof updates.bookmarked === 'boolean') {
    graph.bookmarked = updates.bookmarked;
  }

  touchGraph(graph);
  persistStore();

  return graph;
}

export function updateNodePosition(
  graphId: string,
  nodeId: string,
  position: { x: number; y: number },
): BrainstormGraph {
  loadStoreIfNeeded();

  const graph = getGraph(graphId);
  if (!graph) {
    throw new Error(`Graph '${graphId}' not found`);
  }

  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    throw new Error(`Node '${nodeId}' not found in graph '${graphId}'`);
  }

  recordSnapshotBeforeMutation(graph);

  node.position = {
    x: Math.round(position.x),
    y: Math.round(position.y),
  };

  touchGraph(graph);
  persistStore();

  return graph;
}

export function getGraphHistoryStatus(graphId: string): GraphHistoryStatus {
  const history = getHistory(graphId);
  return {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoDepth: history.past.length,
    redoDepth: history.future.length,
  };
}

export function undoGraph(graphId: string): BrainstormGraph {
  loadStoreIfNeeded();

  const current = getGraph(graphId);
  if (!current) {
    throw new Error(`Graph '${graphId}' not found`);
  }

  const history = getHistory(graphId);
  const previous = history.past.pop();
  if (!previous) {
    throw new Error(`No undo history for graph '${graphId}'`);
  }

  history.future.push(cloneGraph(current));
  const restored = cloneGraph(previous);
  touchGraph(restored);
  return replaceGraph(graphId, restored);
}

export function redoGraph(graphId: string): BrainstormGraph {
  loadStoreIfNeeded();

  const current = getGraph(graphId);
  if (!current) {
    throw new Error(`Graph '${graphId}' not found`);
  }

  const history = getHistory(graphId);
  const next = history.future.pop();
  if (!next) {
    throw new Error(`No redo history for graph '${graphId}'`);
  }

  history.past.push(cloneGraph(current));
  const restored = cloneGraph(next);
  touchGraph(restored);
  return replaceGraph(graphId, restored);
}
