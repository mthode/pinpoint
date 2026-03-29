import { derived, writable } from 'svelte/store';

import type {
  ActionExecutionRequest,
  ActionExecutionResponse,
  GraphSummary,
  GraphWithHistory,
} from './api';
import { apiClient } from './api';
import { pollUntil } from './polling';

export const graphs = writable<GraphSummary[]>([]);
export const graphById = writable<Record<string, GraphWithHistory>>({});
export const selectedGraphId = writable<string | null>(null);

export const uiControls = writable({
  zoom: 1,
  search: '',
  drawerOpen: false,
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

export const statusSummary = derived(selectedGraph, ($selectedGraph) => ({
  graphId: $selectedGraph?.id ?? '(none)',
  nodeCount: $selectedGraph?.nodes.length ?? 0,
  edgeCount: $selectedGraph?.edges.length ?? 0,
  canUndo: Boolean($selectedGraph?.history?.canUndo),
  canRedo: Boolean($selectedGraph?.history?.canRedo),
}));

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
    graphById.update((existing) => ({ ...existing, [graphId]: graph }));
    selectedGraphId.set(graphId);
    asyncState.update((s) => ({ ...s, isLoading: false }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load graph';
    asyncState.update((s) => ({ ...s, isLoading: false, error: message }));
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
