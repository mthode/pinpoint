import type { BrainstormGraph, GraphHistoryStatus } from '../../shared/graph';

export interface GraphSummary {
  id: string;
  name: string;
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
}

export interface BrainstormConfigSummary {
  agents: string[];
  actionCount: number;
  triggers: string[];
  outputs: string[];
  autoActions: Record<string, string[]>;
}

export interface ActionExecutionRequest {
  action: string;
  context: Record<string, unknown>;
  userInput?: string;
  provider?: string;
  model?: string;
  graphId?: string;
  parentNodeId?: string;
  parentNodeIds?: string[];
  applyAutoActions?: boolean;
}

export interface ActionExecutionResponse {
  action: string;
  actor: string;
  graphId: string;
  bubbles: Array<{ type: string; content: string }>;
  autoExecutions: Array<{
    action: string;
    parentNodeId: string;
    createdNodeIds: string[];
    bubbleCount: number;
  }>;
  history: GraphHistoryStatus;
  graphStats: {
    nodeCount: number;
    edgeCount: number;
  };
}

export type GraphWithHistory = BrainstormGraph & { history: GraphHistoryStatus };

type FetchLike = typeof fetch;

function withJsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    ...(typeof body === 'undefined' ? {} : { body: JSON.stringify(body) }),
  };
}

export function createApiClient(baseUrl = '/api', fetchImpl: FetchLike = fetch) {
  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, init);
    if (!res.ok) {
      let message = `Request failed: ${res.status}`;
      try {
        const payload = (await res.json()) as { error?: string };
        if (payload?.error) {
          message = payload.error;
        }
      } catch {
        // ignore parse failure
      }
      throw new Error(message);
    }
    return res.json() as Promise<T>;
  }

  return {
    loadModels(provider = 'ollama'): Promise<{ provider: string; models: string[] }> {
      return requestJson(`/models?provider=${encodeURIComponent(provider)}`);
    },
    loadConfig(): Promise<BrainstormConfigSummary> {
      return requestJson('/brainstorm/config');
    },
    loadActions(trigger: string): Promise<{ trigger: string; actions: Array<{ name: string }> }> {
      return requestJson(`/brainstorm/actions?trigger=${encodeURIComponent(trigger)}`);
    },
    loadGraphs(): Promise<{ graphs: GraphSummary[] }> {
      return requestJson('/brainstorm/graphs');
    },
    createGraph(graphId?: string): Promise<GraphWithHistory> {
      return requestJson('/brainstorm/graphs', withJsonInit('POST', graphId ? { graphId } : {}));
    },
    loadGraph(graphId: string): Promise<GraphWithHistory> {
      return requestJson(`/brainstorm/graphs/${encodeURIComponent(graphId)}`);
    },
    executeAction(payload: ActionExecutionRequest): Promise<ActionExecutionResponse> {
      return requestJson('/brainstorm/execute', withJsonInit('POST', payload));
    },
  };
}

export const apiClient = createApiClient();
