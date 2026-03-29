type Subscriber<T> = (value: T) => void;

function writable<T>(initialValue: T) {
  let value = initialValue;
  const subscribers = new Set<Subscriber<T>>();

  return {
    set(next: T) {
      value = next;
      subscribers.forEach((subscriber) => subscriber(value));
    },
    update(updater: (current: T) => T) {
      this.set(updater(value));
    },
    subscribe(subscriber: Subscriber<T>) {
      subscriber(value);
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
}

function get<T>(store: { subscribe: (subscriber: Subscriber<T>) => () => void }): T {
  let current!: T;
  const unsubscribe = store.subscribe((value) => {
    current = value;
  });
  unsubscribe();
  return current;
}

function derived<A, T>(
  stores:
    | { subscribe: (subscriber: Subscriber<A>) => () => void }
    | Array<{ subscribe: (subscriber: Subscriber<unknown>) => () => void }>,
  map: (value: A | unknown[]) => T,
) {
  const storeList = Array.isArray(stores) ? stores : [stores];
  const readInputs = () =>
    Array.isArray(stores) ? storeList.map((store) => get(store)) : get(storeList[0] as any);

  const output = writable<T>(map(readInputs() as A | unknown[]));
  storeList.forEach((store) => {
    store.subscribe(() => {
      output.set(map(readInputs() as A | unknown[]));
    });
  });

  return {
    subscribe: output.subscribe,
  };
}

const apiClientMock = {
  loadModels: jest.fn(),
  loadConfig: jest.fn(),
  loadActions: jest.fn(),
  loadGraphs: jest.fn(),
  createGraph: jest.fn(),
  loadGraph: jest.fn(),
  executeAction: jest.fn(),
};

jest.mock('../../src/client/lib/api', () => ({
  apiClient: apiClientMock,
}));

jest.mock('svelte/store', () => ({
  writable,
  derived,
}));

import type { ActionExecutionResponse, GraphWithHistory } from '../../src/client/lib/api';
import {
  asyncState,
  executeActionAndRefresh,
  graphById,
  graphs,
  selectedGraphId,
} from '../../src/client/lib/stores';

function makeGraph(graphId: string): GraphWithHistory {
  return {
    id: graphId,
    name: `Graph ${graphId}`,
    bookmarked: false,
    createdAt: '',
    updatedAt: '',
    rootNodeId: 'n1',
    selectedNodeId: 'n1',
    nodes: [{ id: 'n1', type: 'root', content: 'Root', actor: 'user', createdAt: '' }],
    edges: [],
    history: { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 },
  };
}

describe('stores executeActionAndRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    graphs.set([]);
    graphById.set({});
    selectedGraphId.set(null);
    asyncState.set({ isLoading: false, error: '', toast: '' });
  });

  it('executes action, refreshes graph and summaries, and sets toast', async () => {
    const response: ActionExecutionResponse = {
      action: 'clarify',
      actor: 'facilitator',
      graphId: 'g1',
      bubbles: [{ type: 'idea', content: 'A' }],
      autoExecutions: [],
      history: { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 },
      graphStats: { nodeCount: 1, edgeCount: 0 },
    };
    const refreshedGraph = makeGraph('g1');

    apiClientMock.executeAction.mockResolvedValue(response);
    apiClientMock.loadGraph.mockResolvedValue(refreshedGraph);
    apiClientMock.loadGraphs.mockResolvedValue({
      graphs: [
        {
          id: 'g1',
          name: 'Graph g1',
          bookmarked: false,
          createdAt: '',
          updatedAt: '',
          nodeCount: 1,
          edgeCount: 0,
        },
      ],
    });

    const result = await executeActionAndRefresh({
      action: 'clarify',
      context: {},
      graphId: 'g1',
    });

    expect(result).toEqual(response);
    expect(apiClientMock.executeAction).toHaveBeenCalledWith({
      action: 'clarify',
      context: {},
      graphId: 'g1',
    });
    expect(apiClientMock.loadGraph).toHaveBeenCalledWith('g1');
    expect(apiClientMock.loadGraphs).toHaveBeenCalledTimes(1);

    expect(get(selectedGraphId)).toBe('g1');
    expect(get(graphById).g1).toEqual(refreshedGraph);
    expect(get(asyncState)).toEqual({
      isLoading: false,
      error: '',
      toast: "Executed 'clarify'",
    });
  });

  it('sets async error and rethrows when execute action fails', async () => {
    apiClientMock.executeAction.mockRejectedValue(new Error('boom'));

    await expect(
      executeActionAndRefresh({
        action: 'clarify',
        context: {},
        graphId: 'g1',
      }),
    ).rejects.toThrow('boom');

    expect(apiClientMock.loadGraph).not.toHaveBeenCalled();
    expect(apiClientMock.loadGraphs).not.toHaveBeenCalled();
    expect(get(asyncState)).toEqual({
      isLoading: false,
      error: 'boom',
      toast: '',
    });
  });
});
