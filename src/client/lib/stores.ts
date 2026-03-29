import { derived, writable } from 'svelte/store';

import type { GraphSummary, GraphWithHistory } from './api';
import { apiClient } from './api';

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
