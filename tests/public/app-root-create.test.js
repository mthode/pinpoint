const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

async function flushAsyncWork() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe('background root creation', () => {
  it('creates a root without parent context and keeps the requested position', async () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), 'src', 'public', 'index.html'),
      'utf8',
    );
    const script = fs.readFileSync(
      path.join(process.cwd(), 'src', 'public', 'app.js'),
      'utf8',
    );

    const dom = new JSDOM(html, {
      url: 'http://localhost/',
      runScripts: 'outside-only',
    });

    const { window } = dom;
    const { document } = window;
    const graphCanvas = document.getElementById('graph-canvas');
    const graphSummary = document.getElementById('graph-summary');

    Object.defineProperty(graphCanvas, 'clientWidth', {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(graphCanvas, 'clientHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(graphCanvas, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(graphCanvas, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    graphCanvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
    });
    graphCanvas.scrollTo = jest.fn(({ left = 0, top = 0 } = {}) => {
      graphCanvas.scrollLeft = left;
      graphCanvas.scrollTop = top;
    });

    window.prompt = jest.fn(() => null);
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = jest.fn();

    const graphState = {
      id: 'default',
      name: 'default',
      bookmarked: false,
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
      history: { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 },
      rootNodeId: 'root-1',
      selectedNodeId: 'root-1',
      nodes: [
        {
          id: 'root-1',
          type: 'root',
          content: 'Brainstorm root',
        },
      ],
      edges: [],
    };
    const executeBodies = [];
    const persistedNodeId = 'bubble-persisted-1';

    window.fetch = jest.fn(async (resource, init = {}) => {
      const url = typeof resource === 'string' ? resource : resource.url;

      if (url === '/api/brainstorm/graphs/default') {
        return jsonResponse(graphState);
      }

      if (url === '/api/brainstorm/graphs') {
        return jsonResponse({
          graphs: [{
            id: graphState.id,
            name: graphState.name,
            bookmarked: graphState.bookmarked,
            createdAt: graphState.createdAt,
            updatedAt: graphState.updatedAt,
            nodeCount: graphState.nodes.length,
          }],
        });
      }

      if (url.startsWith('/api/models?provider=')) {
        return jsonResponse({
          provider: 'ollama-network',
          models: ['mock-model'],
        });
      }

      if (url === '/api/brainstorm/config') {
        return jsonResponse({
          agents: [{ name: 'facilitator' }],
          actionCount: 1,
          triggers: ['question'],
          outputs: ['question'],
          autoActions: [],
        });
      }

      if (url === '/api/brainstorm/actions?trigger=question') {
        return jsonResponse({
          trigger: 'question',
          actions: [{
            name: 'clarify',
            actor: 'facilitator',
            output: 'clarification',
          }],
        });
      }

      if (url === '/api/brainstorm/execute') {
        const body = JSON.parse(init.body);
        executeBodies.push(body);
        graphState.nodes = [
          ...graphState.nodes,
          {
            id: persistedNodeId,
            type: 'question',
            content: body.userInput,
            position: body.position,
          },
        ];
        graphState.selectedNodeId = persistedNodeId;
        graphState.updatedAt = '2026-03-28T00:00:01.000Z';
        return jsonResponse({
          graphId: graphState.id,
          selectedNodeId: persistedNodeId,
          createdNodeIds: [persistedNodeId],
          pendingAutoActions: false,
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    window.eval(script);
    await flushAsyncWork();

    document.getElementById('auto-actions-toggle').checked = false;
    graphCanvas.scrollLeft = 0;
    graphCanvas.scrollTop = 0;
    graphCanvas.scrollTo.mockClear();

    graphCanvas.dispatchEvent(new window.MouseEvent('dblclick', {
      bubbles: true,
      clientX: 420,
      clientY: 260,
    }));
    await flushAsyncWork();

    const textarea = document.querySelector('.draft textarea');
    expect(textarea).toBeTruthy();
    textarea.value = 'Background root question';
    textarea.dispatchEvent(new window.KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Enter',
    }));
    await flushAsyncWork();

    expect(executeBodies).toHaveLength(1);
    expect(executeBodies[0]).toMatchObject({
      action: 'ask_question',
      createAsRoot: true,
      position: { x: 420, y: 260 },
      context: {
        parent: { content: '' },
        selected: { content: [] },
      },
    });
    expect(executeBodies[0].parentNodeId).toBeUndefined();
    expect(executeBodies[0].parentNodeIds).toBeUndefined();

    const createdNode = Array.from(document.querySelectorAll('.graph-node'))
      .find((node) => node.textContent.includes('Background root question'));
    expect(createdNode).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll('.graph-node'))
        .filter((node) => node.textContent.includes('Background root question')),
    ).toHaveLength(1);
    expect(createdNode.style.left).toBe('420px');
    expect(createdNode.style.top).toBe('260px');
    expect(createdNode.className).not.toContain('pending');
    expect(createdNode.textContent).toContain('Select');
    expect(createdNode.textContent).not.toContain('Unselect');
    expect(graphState.edges).toEqual([]);
    expect(graphSummary.textContent).toContain('Edges: 0');
    expect(graphSummary.textContent).toContain('Nodes: 2');
    expect(graphCanvas.scrollLeft).toBe(0);
    expect(graphCanvas.scrollTop).toBe(0);
    expect(
      graphCanvas.scrollTo.mock.calls.every((call) => call[0].left === 0 && call[0].top === 0),
    ).toBe(true);

    dom.window.close();
  });

  it('clears the optimistic spinner before the delayed reload completes', async () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), 'src', 'public', 'index.html'),
      'utf8',
    );
    const script = fs.readFileSync(
      path.join(process.cwd(), 'src', 'public', 'app.js'),
      'utf8',
    );

    const dom = new JSDOM(html, {
      url: 'http://localhost/',
      runScripts: 'outside-only',
    });

    const { window } = dom;
    const { document } = window;
    const graphCanvas = document.getElementById('graph-canvas');

    Object.defineProperty(graphCanvas, 'clientWidth', {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(graphCanvas, 'clientHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(graphCanvas, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(graphCanvas, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    graphCanvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
    });
    graphCanvas.scrollTo = jest.fn(({ left = 0, top = 0 } = {}) => {
      graphCanvas.scrollLeft = left;
      graphCanvas.scrollTop = top;
    });

    window.prompt = jest.fn(() => null);
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = jest.fn();

    const graphState = {
      id: 'default',
      name: 'default',
      bookmarked: false,
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
      history: { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 },
      rootNodeId: 'root-1',
      selectedNodeId: 'root-1',
      nodes: [
        {
          id: 'root-1',
          type: 'root',
          content: 'Brainstorm root',
        },
      ],
      edges: [],
    };
    const persistedNodeId = 'bubble-persisted-delayed';
    const delayedGraphResponse = createDeferred();

    window.fetch = jest.fn(async (resource, init = {}) => {
      const url = typeof resource === 'string' ? resource : resource.url;

      if (url === '/api/brainstorm/graphs/default') {
        if (graphState.nodes.some((node) => node.id === persistedNodeId)) {
          await delayedGraphResponse.promise;
        }
        return jsonResponse(graphState);
      }

      if (url === '/api/brainstorm/graphs') {
        return jsonResponse({
          graphs: [{
            id: graphState.id,
            name: graphState.name,
            bookmarked: graphState.bookmarked,
            createdAt: graphState.createdAt,
            updatedAt: graphState.updatedAt,
            nodeCount: graphState.nodes.length,
          }],
        });
      }

      if (url.startsWith('/api/models?provider=')) {
        return jsonResponse({
          provider: 'ollama-network',
          models: ['mock-model'],
        });
      }

      if (url === '/api/brainstorm/config') {
        return jsonResponse({
          agents: [{ name: 'facilitator' }],
          actionCount: 1,
          triggers: ['question'],
          outputs: ['question'],
          autoActions: [],
        });
      }

      if (url === '/api/brainstorm/actions?trigger=question') {
        return jsonResponse({
          trigger: 'question',
          actions: [{
            name: 'clarify',
            actor: 'facilitator',
            output: 'clarification',
          }],
        });
      }

      if (url === '/api/brainstorm/execute') {
        const body = JSON.parse(init.body);
        graphState.nodes = [
          ...graphState.nodes,
          {
            id: persistedNodeId,
            type: 'question',
            content: body.userInput,
            position: body.position,
          },
        ];
        graphState.selectedNodeId = persistedNodeId;
        graphState.updatedAt = '2026-03-28T00:00:01.000Z';
        return jsonResponse({
          graphId: graphState.id,
          selectedNodeId: persistedNodeId,
          createdNodeIds: [persistedNodeId],
          pendingAutoActions: false,
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    window.eval(script);
    await flushAsyncWork();

    document.getElementById('auto-actions-toggle').checked = false;

    graphCanvas.dispatchEvent(new window.MouseEvent('dblclick', {
      bubbles: true,
      clientX: 420,
      clientY: 260,
    }));
    await flushAsyncWork();

    const textarea = document.querySelector('.draft textarea');
    expect(textarea).toBeTruthy();
    textarea.value = 'Delayed background root question';
    textarea.dispatchEvent(new window.KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Enter',
    }));
    await flushAsyncWork();

    const interimNodes = Array.from(document.querySelectorAll('.graph-node'))
      .filter((node) => node.textContent.includes('Delayed background root question'));
    expect(interimNodes).toHaveLength(0);
    expect(document.querySelector('.graph-node.pending')).toBeNull();

    delayedGraphResponse.resolve();
    await flushAsyncWork();

    const finalNodes = Array.from(document.querySelectorAll('.graph-node'))
      .filter((node) => node.textContent.includes('Delayed background root question'));
    expect(finalNodes).toHaveLength(1);
    expect(finalNodes[0].className).not.toContain('pending');

    dom.window.close();
  });
});
