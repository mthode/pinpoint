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
  createNode: jest.fn(),
  selectNode: jest.fn(),
  updateGraphMetadata: jest.fn(),
  updateNodePosition: jest.fn(),
  undoGraph: jest.fn(),
  redoGraph: jest.fn(),
  exportGraph: jest.fn(),
  importGraph: jest.fn(),
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
  availableActions,
  asyncState,
  buildExecutionContext,
  composerInput,
  executeActionByName,
  executeActionAndRefresh,
  graphById,
  graphs,
  mergeNodeIds,
  selectedNodeId,
  selectedGraphId,
  uiControls,
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
    selectedNodeId.set(null);
    availableActions.set([]);
    mergeNodeIds.set([]);
    composerInput.set('');
    uiControls.set({ zoom: 1, search: '', drawerOpen: false, autoActionsEnabled: true });
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

  it('builds branch path and merge-selected context content', () => {
    const graph: GraphWithHistory = {
      id: 'g1',
      name: 'Graph g1',
      bookmarked: false,
      createdAt: '',
      updatedAt: '',
      rootNodeId: 'root',
      selectedNodeId: 'n2',
      nodes: [
        { id: 'root', type: 'root', content: 'Root', actor: 'system', createdAt: '' },
        { id: 'n1', type: 'question', content: 'Question A', actor: 'user', createdAt: '' },
        { id: 'n2', type: 'response', content: 'Response B', actor: 'facilitator', createdAt: '' },
      ],
      edges: [
        { from: 'root', to: 'n1' },
        { from: 'n1', to: 'n2' },
      ],
      history: { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 },
    };

    const context = buildExecutionContext(graph, 'n2', ['n1', 'n2']);
    expect(context.parent.content).toBe('Response B');
    expect(context.branch.path).toContain('root: Root');
    expect(context.branch.path).toContain('question: Question A');
    expect(context.selected.content).toEqual(['Question A', 'Response B']);
  });

  it('executes merge action with parentNodeIds and user input', async () => {
    const graph: GraphWithHistory = {
      id: 'g2',
      name: 'Graph g2',
      bookmarked: false,
      createdAt: '',
      updatedAt: '',
      rootNodeId: 'root',
      selectedNodeId: 'n3',
      nodes: [
        { id: 'root', type: 'root', content: 'Root', actor: 'system', createdAt: '' },
        { id: 'n2', type: 'response', content: 'Option A', actor: 'facilitator', createdAt: '' },
        { id: 'n3', type: 'response', content: 'Option B', actor: 'facilitator', createdAt: '' },
      ],
      edges: [
        { from: 'root', to: 'n2' },
        { from: 'root', to: 'n3' },
      ],
      history: { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 },
    };

    const response: ActionExecutionResponse = {
      action: 'synthesize',
      actor: 'synthesizer',
      graphId: 'g2',
      bubbles: [{ type: 'synthesis', content: 'Merged approach' }],
      autoExecutions: [],
      history: { canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 },
      graphStats: { nodeCount: 4, edgeCount: 3 },
    };

    graphById.set({ g2: graph });
    selectedGraphId.set('g2');
    selectedNodeId.set('n3');
    mergeNodeIds.set(['n2', 'n3']);
    availableActions.set([
      {
        name: 'synthesize',
        description: 'merge selected branches',
        trigger: ['response'],
        actor: 'synthesizer',
        output: 'synthesis',
        branching: 'merge',
      },
    ]);
    composerInput.set('Keep speed and quality');

    apiClientMock.executeAction.mockResolvedValue(response);
    apiClientMock.loadGraph.mockResolvedValue({
      ...graph,
      selectedNodeId: 'merged',
      nodes: [...graph.nodes, { id: 'merged', type: 'synthesis', content: 'Merged approach', actor: 'synthesizer', createdAt: '' }],
      edges: [...graph.edges, { from: 'n2', to: 'merged' }, { from: 'n3', to: 'merged' }],
      history: response.history,
    });
    apiClientMock.loadGraphs.mockResolvedValue({
      graphs: [
        {
          id: 'g2',
          name: 'Graph g2',
          bookmarked: false,
          createdAt: '',
          updatedAt: '',
          nodeCount: 4,
          edgeCount: 3,
        },
      ],
    });

    await executeActionByName('synthesize');

    expect(apiClientMock.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'synthesize',
        graphId: 'g2',
        parentNodeIds: ['n2', 'n3'],
        userInput: 'Keep speed and quality',
      }),
    );
  });
});
