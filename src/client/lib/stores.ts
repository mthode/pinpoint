import { derived, writable } from 'svelte/store';

import type {
  BrainstormAction,
  BrainstormConfigSummary,
  ActionExecutionRequest,
  ActionExecutionResponse,
  GraphSummary,
  GraphWithHistory,
  ProviderStatus,
} from './api';
import { apiClient } from './api';
import { pollUntil } from './polling';
import type { GraphEdge, GraphNode } from '../../shared/graph';

export const graphs = writable<GraphSummary[]>([]);
export const graphById = writable<Record<string, GraphWithHistory>>({});
export const selectedGraphId = writable<string | null>(null);
export const selectedNodeId = writable<string | null>(null);
export const mergeNodeIds = writable<string[]>([]);

export const brainstormConfig = writable<BrainstormConfigSummary | null>(null);
export const selectedTrigger = writable('root');
export const availableActions = writable<BrainstormAction[]>([]);
export const actionCacheByTrigger = writable<Record<string, BrainstormAction[]>>({});
export const composerInput = writable('');
export const modelProviders = writable<ProviderStatus[]>([]);
export const selectedProvider = writable('ollama-network');
export const availableModels = writable<string[]>([]);
export const selectedModel = writable('gemma3:1b');

export const uiControls = writable({
  zoom: 1,
  search: '',
  drawerOpen: false,
  autoActionsEnabled: true,
});

export const asyncState = writable({
  isLoading: false,
  error: '',
  toast: '',
});

export const selectedGraph = derived(
  [graphById, selectedGraphId],
  ([$graphById, $selectedGraphId]) => ($selectedGraphId ? $graphById[$selectedGraphId] ?? null : null),
);

export const selectedNode = derived(
  [selectedGraph, selectedNodeId],
  ([$selectedGraph, $selectedNodeId]) =>
    $selectedGraph?.nodes.find((node) => node.id === $selectedNodeId) ?? null,
);

export const statusSummary = derived(selectedGraph, ($selectedGraph) => ({
  graphId: $selectedGraph?.id ?? '(none)',
  nodeCount: $selectedGraph?.nodes.length ?? 0,
  edgeCount: $selectedGraph?.edges.length ?? 0,
  canUndo: Boolean($selectedGraph?.history?.canUndo),
  canRedo: Boolean($selectedGraph?.history?.canRedo),
}));

function readStore<T>(store: { subscribe: (subscriber: (value: T) => void) => () => void }): T {
  let current!: T;
  const unsubscribe = store.subscribe((value) => {
    current = value;
  });
  unsubscribe();
  return current;
}

function upsertGraph(graph: GraphWithHistory): void {
  graphById.update((existing) => ({ ...existing, [graph.id]: graph }));
  selectedGraphId.set(graph.id);
  selectedNodeId.set(graph.selectedNodeId || graph.rootNodeId || graph.nodes[0]?.id || null);
}

function setActionsForTrigger(trigger: string, actions: BrainstormAction[]): void {
  actionCacheByTrigger.update((cache) => ({ ...cache, [trigger]: actions }));
  availableActions.set(actions);
}

function createPendingNodeId(): string {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addPendingNodesToGraph(
  graph: GraphWithHistory,
  nodes: Array<{ type: string; parentNodeIds: string[] }>,
): string[] {
  if (nodes.length === 0 || !graph.id) {
    return [];
  }

  const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const laneByParent = new Map<string, number>();
  const created = nodes.map((node) => {
    const anchorParentId = node.parentNodeIds[0] || graph.selectedNodeId || graph.rootNodeId;
    const anchor = anchorParentId ? graphNodeById.get(anchorParentId) : undefined;
    const laneKey = anchorParentId || '__root__';
    const lane = laneByParent.get(laneKey) ?? 0;
    laneByParent.set(laneKey, lane + 1);

    return {
      id: createPendingNodeId(),
      type: node.type,
      content: '',
      actor: 'pending',
      createdAt: new Date().toISOString(),
      position: {
        x: anchor?.position?.x ?? 60,
        y: (anchor?.position?.y ?? 40) + (lane + 1) * 132,
      },
      parentNodeIds: node.parentNodeIds,
    };
  });

  const createdNodes = created.map(({ parentNodeIds: _parentNodeIds, ...rest }) => rest);
  const createdEdges = created.flatMap((node) =>
    node.parentNodeIds.map((parentNodeId) => ({ from: parentNodeId, to: node.id })),
  );

  graphById.update((existing) => {
    const current = existing[graph.id];
    if (!current) {
      return existing;
    }

    return {
      ...existing,
      [graph.id]: {
        ...current,
        nodes: [...current.nodes, ...createdNodes],
        edges: [...current.edges, ...createdEdges],
      },
    };
  });

  return created.map((node) => node.id);
}

function removePendingNodesFromGraph(graphId: string, nodeIds: string[]): void {
  if (nodeIds.length === 0) {
    return;
  }

  const ids = new Set(nodeIds);
  graphById.update((existing) => {
    const current = existing[graphId];
    if (!current) {
      return existing;
    }

    return {
      ...existing,
      [graphId]: {
        ...current,
        nodes: current.nodes.filter((node) => !ids.has(node.id)),
        edges: current.edges.filter((edge) => !ids.has(edge.to) && !ids.has(edge.from)),
      },
    };
  });
}

export function setNodePositionLocally(nodeId: string, x: number, y: number): void {
  const graphId = readStore(selectedGraphId);
  if (!graphId) {
    return;
  }

  graphById.update((existing) => {
    const current = existing[graphId];
    if (!current) {
      return existing;
    }

    return {
      ...existing,
      [graphId]: {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? {
              ...node,
              position: { x: Math.round(x), y: Math.round(y) },
            }
            : node,
        ),
      },
    };
  });
}

function hydratePendingNodesFromActionResponse(
  graphId: string,
  pendingNodeIds: string[],
  response: ActionExecutionResponse,
): void {
  if (pendingNodeIds.length === 0) {
    return;
  }

  const pendingIndexById = new Map(pendingNodeIds.map((id, index) => [id, index]));
  const createdNodeIds = response.createdNodeIds ?? [];

  graphById.update((existing) => {
    const current = existing[graphId];
    if (!current) {
      return existing;
    }

    const remappedNodeIdByOldId = new Map<string, string>();
    const nodes = current.nodes.map((node) => {
      const pendingIndex = pendingIndexById.get(node.id);
      if (typeof pendingIndex === 'undefined') {
        return node;
      }

      const bubble = response.bubbles[pendingIndex];
      const createdNodeId = createdNodeIds[pendingIndex] || node.id;
      remappedNodeIdByOldId.set(node.id, createdNodeId);

      return {
        ...node,
        id: createdNodeId,
        type: bubble?.type ?? node.type,
        content: bubble?.content ?? node.content,
        actor: response.actor,
      };
    });

    const edges = current.edges.map((edge) => ({
      from: remappedNodeIdByOldId.get(edge.from) ?? edge.from,
      to: remappedNodeIdByOldId.get(edge.to) ?? edge.to,
    }));

    return {
      ...existing,
      [graphId]: {
        ...current,
        nodes,
        edges,
      },
    };
  });
}

export async function refreshGraphSummaries(): Promise<void> {
  asyncState.update((s) => ({ ...s, isLoading: true, error: '' }));
  try {
    const result = await apiClient.loadGraphs();
    graphs.set(result.graphs);
    asyncState.update((s) => ({ ...s, isLoading: false }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load graphs';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
  }
}

export async function selectGraph(graphId: string): Promise<void> {
  asyncState.update((s) => ({ ...s, isLoading: true, error: '' }));
  try {
    const graph = await apiClient.loadGraph(graphId);
    upsertGraph(graph);
    mergeNodeIds.set([]);
    asyncState.update((s) => ({ ...s, isLoading: false }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load graph';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
  }
}

export async function loadBrainstormConfig(): Promise<void> {
  try {
    const config = await apiClient.loadConfig();
    brainstormConfig.set(config);

    const trigger = config.triggers.includes('root') ? 'root' : config.triggers[0] ?? '';
    selectedTrigger.set(trigger);
    if (trigger) {
      await loadActionsForTrigger(trigger);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load brainstorm config';
    asyncState.update((s) => ({ ...s, error: message }));
  }
}

export async function loadActionsForTrigger(trigger: string): Promise<void> {
  const cache = readStore(actionCacheByTrigger);
  if (cache[trigger]) {
    availableActions.set(cache[trigger]);
    selectedTrigger.set(trigger);
    return;
  }

  try {
    const result = await apiClient.loadActions(trigger);
    selectedTrigger.set(trigger);
    setActionsForTrigger(trigger, result.actions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load actions';
    asyncState.update((s) => ({ ...s, error: message }));
  }
}

export async function initializeClientState(): Promise<void> {
  asyncState.update((s) => ({ ...s, isLoading: true, error: '', toast: '' }));
  await Promise.all([refreshGraphSummaries(), loadBrainstormConfig(), initializeModelSelection()]);

  const list = readStore(graphs);
  if (list.length > 0) {
    await selectGraph(list[0].id);
  }

  asyncState.update((s) => ({ ...s, isLoading: false }));
}

export async function initializeModelSelection(): Promise<void> {
  try {
    const providers = await apiClient.loadProviders();
    modelProviders.set(providers);

    const preferred = providers.find((provider) => provider.name === 'ollama-network')
      ?? providers.find((provider) => provider.available)
      ?? providers[0];

    if (preferred?.name) {
      selectedProvider.set(preferred.name);
    }
  } catch {
    modelProviders.set([
      { name: 'ollama-network', available: true },
      { name: 'ollama', available: true },
      { name: 'copilot-cli', available: true },
    ]);
    selectedProvider.set('ollama-network');
  }

  await loadModelsForSelectedProvider();
}

export async function loadModelsForSelectedProvider(): Promise<void> {
  const provider = readStore(selectedProvider);
  if (!provider) {
    availableModels.set([]);
    return;
  }

  try {
    const result = await apiClient.loadModels(provider);
    availableModels.set(result.models);

    const preferredModel = result.models.includes('gemma3:1b')
      ? 'gemma3:1b'
      : result.models[0] ?? '';

    if (preferredModel) {
      selectedModel.set(preferredModel);
    }
  } catch (error) {
    availableModels.set([]);
    selectedModel.set('');
    const message = error instanceof Error ? error.message : 'Failed to load models';
    asyncState.update((s) => ({ ...s, error: message }));
  }
}

export async function chooseProvider(provider: string): Promise<void> {
  selectedProvider.set(provider);
  await loadModelsForSelectedProvider();
}

export function chooseModel(model: string): void {
  selectedModel.set(model);
}

export async function createGraphAndSelect(graphId?: string): Promise<void> {
  asyncState.update((s) => ({ ...s, isLoading: true, error: '' }));
  try {
    const graph = await apiClient.createGraph(graphId);
    upsertGraph(graph);
    mergeNodeIds.set([]);
    await refreshGraphSummaries();
    asyncState.update((s) => ({
      ...s,
      isLoading: false,
      toast: `Created graph '${graph.id}'`,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create graph';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
  }
}

export async function selectNodeInGraph(nodeId: string, additive = false): Promise<void> {
  const graphId = readStore(selectedGraphId);
  if (!graphId) {
    return;
  }

  selectedNodeId.set(nodeId);
  if (additive) {
    mergeNodeIds.update((ids) => {
      const set = new Set(ids);
      if (set.has(nodeId)) {
        set.delete(nodeId);
      } else {
        set.add(nodeId);
      }
      return Array.from(set);
    });
  } else {
    mergeNodeIds.set([]);
  }

  try {
    const graph = await apiClient.selectNode(graphId, nodeId);
    upsertGraph(graph);
  } catch {
    // Keep local selection if select endpoint fails; visual interaction should remain responsive.
  }
}

export function setSearchQuery(query: string): void {
  uiControls.update((state) => ({ ...state, search: query }));
}

export function setZoom(zoom: number): void {
  const clamped = Math.min(2.5, Math.max(0.4, Number.isFinite(zoom) ? zoom : 1));
  uiControls.update((state) => ({ ...state, zoom: Math.round(clamped * 100) / 100 }));
}

export function zoomIn(): void {
  const zoom = readStore(uiControls).zoom;
  setZoom(zoom + 0.1);
}

export function zoomOut(): void {
  const zoom = readStore(uiControls).zoom;
  setZoom(zoom - 0.1);
}

export function resetZoom(): void {
  setZoom(1);
}

export function clearMergeSelection(): void {
  mergeNodeIds.set([]);
}

export function setComposerInput(content: string): void {
  composerInput.set(content);
}

export function setAutoActionsEnabled(enabled: boolean): void {
  uiControls.update((state) => ({ ...state, autoActionsEnabled: enabled }));
}

export function updateSelectedTrigger(trigger: string): void {
  selectedTrigger.set(trigger);
}

function buildPathToNode(nodeId: string, edges: GraphEdge[], nodeById: Map<string, GraphNode>): GraphNode[] {
  const parentByChild = new Map<string, string>();
  for (const edge of edges) {
    if (!parentByChild.has(edge.to)) {
      parentByChild.set(edge.to, edge.from);
    }
  }

  const path: GraphNode[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = nodeId;

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = nodeById.get(cursor);
    if (!node) {
      break;
    }
    path.push(node);
    cursor = parentByChild.get(cursor);
  }

  return path.reverse();
}

export function buildExecutionContext(
  graph: GraphWithHistory,
  activeNodeId: string | null,
  selectedMergeNodeIds: string[],
) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const fallbackNodeId = graph.selectedNodeId || graph.rootNodeId || graph.nodes[0]?.id || '';
  const selectedId = activeNodeId || fallbackNodeId;
  const selectedNode = nodeById.get(selectedId) || graph.nodes[0];

  const branchPath = selectedNode
    ? buildPathToNode(selectedNode.id, graph.edges, nodeById).map((node) => `${node.type}: ${node.content}`).join('\n')
    : '';

  const selectedContents = selectedMergeNodeIds
    .map((nodeId) => nodeById.get(nodeId)?.content)
    .filter((content): content is string => Boolean(content));

  return {
    parent: {
      content: selectedNode?.content || 'No parent bubble selected yet.',
    },
    branch: {
      path: branchPath,
      summary: branchPath ? `Branch has ${branchPath.split('\n').length} node(s)` : 'No branch selected',
    },
    ancestors: {
      context: [],
      constraints: [],
      assumptions: [],
      criteria: [],
    },
    siblings: { content: [] },
    selected: { content: selectedContents },
    comparison: { content: '' },
  };
}

export async function executeActionByName(actionName: string): Promise<ActionExecutionResponse> {
  const graph = readStore(selectedGraph);
  if (!graph) {
    throw new Error('Select a graph before executing an action');
  }

  const action = readStore(availableActions).find((entry) => entry.name === actionName);
  const activeNodeId = readStore(selectedNodeId);
  const selectedMergeNodeIds = readStore(mergeNodeIds);
  const input = readStore(composerInput).trim();
  const shouldMerge = action?.branching === 'merge' && selectedMergeNodeIds.length >= 2;
  const provider = readStore(selectedProvider);
  const model = readStore(selectedModel);

  const payload: ActionExecutionRequest = {
    action: actionName,
    graphId: graph.id,
    context: buildExecutionContext(graph, activeNodeId, selectedMergeNodeIds),
    applyAutoActions: readStore(uiControls).autoActionsEnabled,
  };

  if (provider) {
    payload.provider = provider;
  }
  if (model) {
    payload.model = model;
  }

  if (input) {
    payload.userInput = input;
  }

  if (shouldMerge) {
    payload.parentNodeIds = selectedMergeNodeIds;
  } else {
    const fallbackParentId = activeNodeId || graph.selectedNodeId || graph.rootNodeId || graph.nodes[0]?.id;
    if (fallbackParentId) {
      payload.parentNodeId = fallbackParentId;
    }
  }

  const pendingParentNodeIds = shouldMerge
    ? selectedMergeNodeIds
    : payload.parentNodeId
      ? [payload.parentNodeId]
      : [];

  const pendingNodeIds = addPendingNodesToGraph(graph, [
    {
      type: action?.output ?? 'idea',
      parentNodeIds: pendingParentNodeIds,
    },
  ]);

  asyncState.update((s) => ({ ...s, isLoading: true, error: '', toast: '' }));
  try {
    const response = await apiClient.executeAction(payload);
    hydratePendingNodesFromActionResponse(graph.id, pendingNodeIds, response);
    if (response.autoExecutions.length > 0) {
      await refreshGraphAfterAction({
        graphId: response.graphId,
        autoExecutions: response.autoExecutions,
      });
    }
    await refreshGraphSummaries();
    asyncState.update((s) => ({
      ...s,
      isLoading: false,
      toast: `Executed '${response.action}'`,
    }));
    composerInput.set('');
    mergeNodeIds.set([]);
    return response;
  } catch (error) {
    removePendingNodesFromGraph(graph.id, pendingNodeIds);
    const message = error instanceof Error ? error.message : 'Failed to execute action';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
    throw error;
  } finally {
    asyncState.update((s) => ({ ...s, isLoading: false }));
  }
}

export async function createRootNodeAtPosition(params: {
  type: string;
  content: string;
  x: number;
  y: number;
}): Promise<void> {
  const graphId = readStore(selectedGraphId);
  if (!graphId) {
    throw new Error('Select a graph before creating a root node');
  }

  asyncState.update((s) => ({ ...s, isLoading: true, error: '' }));
  try {
    const graph = await apiClient.createNode(graphId, {
      type: params.type,
      content: params.content,
      actor: 'user',
      position: { x: params.x, y: params.y },
    });
    upsertGraph(graph);
    await refreshGraphSummaries();
    asyncState.update((s) => ({ ...s, isLoading: false, toast: `Created root ${params.type}` }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create root node';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
    throw error;
  }
}

export async function deleteNodeAndChildren(nodeId: string): Promise<void> {
  const graphId = readStore(selectedGraphId);
  if (!graphId) {
    throw new Error('Select a graph before deleting a node');
  }

  asyncState.update((s) => ({ ...s, isLoading: true, error: '' }));
  try {
    const graph = await apiClient.deleteNode(graphId, nodeId);
    upsertGraph(graph);
    mergeNodeIds.set([]);
    await refreshGraphSummaries();
    asyncState.update((s) => ({ ...s, isLoading: false, toast: 'Deleted node and children' }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete node';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
    throw error;
  }
}

export async function persistNodePosition(nodeId: string, x: number, y: number): Promise<void> {
  const graphId = readStore(selectedGraphId);
  if (!graphId) {
    return;
  }

  graphById.update((existing) => {
    const current = existing[graphId];
    if (!current) {
      return existing;
    }
    return {
      ...existing,
      [graphId]: {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? {
              ...node,
              position: { x: Math.round(x), y: Math.round(y) },
            }
            : node,
        ),
      },
    };
  });

  try {
    const graph = await apiClient.updateNodePosition(graphId, nodeId, x, y);
    upsertGraph(graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to persist node position';
    asyncState.update((s) => ({ ...s, error: message }));
    await refreshSelectedGraph();
  }
}

function expectedNodeIdsFromAutoExecutions(
  autoExecutions: Array<{ createdNodeIds: string[] }>,
): Set<string> {
  return new Set(autoExecutions.flatMap((execution) => execution.createdNodeIds));
}

export async function refreshGraphAfterAction(params: {
  graphId: string;
  autoExecutions: Array<{ createdNodeIds: string[] }>;
  pollOptions?: { maxAttempts?: number; intervalMs?: number };
}): Promise<void> {
  const expectedIds = expectedNodeIdsFromAutoExecutions(params.autoExecutions);
  const graph = await pollUntil({
    run: () => apiClient.loadGraph(params.graphId),
    isDone: (result) => {
      if (expectedIds.size === 0) {
        return true;
      }
      const nodeIds = new Set(result.nodes.map((n) => n.id));
      for (const expectedId of expectedIds) {
        if (!nodeIds.has(expectedId)) {
          return false;
        }
      }
      return true;
    },
    maxAttempts: params.pollOptions?.maxAttempts,
    intervalMs: params.pollOptions?.intervalMs,
  });

  graphById.update((existing) => ({ ...existing, [params.graphId]: graph }));
  selectedGraphId.set(params.graphId);
  selectedNodeId.set(graph.selectedNodeId || graph.rootNodeId || graph.nodes[0]?.id || null);
}

export async function executeActionAndRefresh(
  payload: ActionExecutionRequest,
): Promise<ActionExecutionResponse> {
  asyncState.update((s) => ({ ...s, isLoading: true, error: '', toast: '' }));
  try {
    const response = await apiClient.executeAction(payload);
    await refreshGraphAfterAction({
      graphId: response.graphId,
      autoExecutions: response.autoExecutions,
    });
    await refreshGraphSummaries();
    asyncState.update((s) => ({
      ...s,
      isLoading: false,
      toast: `Executed '${response.action}'`,
    }));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to execute action';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
    throw error;
  }
}

export async function refreshSelectedGraph(): Promise<void> {
  const graphId = readStore(selectedGraphId);
  if (!graphId) {
    return;
  }
  await selectGraph(graphId);
}

export async function undoSelectedGraph(): Promise<void> {
  const graphId = readStore(selectedGraphId);
  if (!graphId) {
    return;
  }
  asyncState.update((s) => ({ ...s, isLoading: true, error: '' }));
  try {
    const graph = await apiClient.undoGraph(graphId);
    upsertGraph(graph);
    await refreshGraphSummaries();
    asyncState.update((s) => ({ ...s, isLoading: false, toast: 'Undo complete' }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to undo graph';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
  }
}

export async function redoSelectedGraph(): Promise<void> {
  const graphId = readStore(selectedGraphId);
  if (!graphId) {
    return;
  }
  asyncState.update((s) => ({ ...s, isLoading: true, error: '' }));
  try {
    const graph = await apiClient.redoGraph(graphId);
    upsertGraph(graph);
    await refreshGraphSummaries();
    asyncState.update((s) => ({ ...s, isLoading: false, toast: 'Redo complete' }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to redo graph';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
  }
}

export async function toggleBookmarkForSelectedGraph(): Promise<void> {
  const graph = readStore(selectedGraph);
  if (!graph) {
    return;
  }
  try {
    const updated = await apiClient.updateGraphMetadata(graph.id, { bookmarked: !graph.bookmarked });
    upsertGraph(updated);
    await refreshGraphSummaries();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update bookmark';
    asyncState.update((s) => ({ ...s, error: message }));
  }
}

export async function renameSelectedGraph(name: string): Promise<void> {
  const graph = readStore(selectedGraph);
  const trimmed = name.trim();
  if (!graph || !trimmed) {
    return;
  }
  try {
    const updated = await apiClient.updateGraphMetadata(graph.id, { name: trimmed });
    upsertGraph(updated);
    await refreshGraphSummaries();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rename graph';
    asyncState.update((s) => ({ ...s, error: message }));
  }
}
