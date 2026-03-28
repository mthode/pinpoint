import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';

const storePath = path.join(process.cwd(), '.tmp-test-brainstorm-store.json');
process.env.BRAINSTORM_STORE_PATH = storePath;

beforeEach(() => {
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath);
  }
});

// We need to mock the providers before importing the router
jest.mock('../../src/services/ollama-provider', () => ({
  OllamaProvider: jest.fn().mockImplementation(() => ({
    name: 'ollama',
    isAvailable: jest.fn().mockResolvedValue(true),
    listModels: jest.fn().mockResolvedValue(['llama2:latest', 'mistral:latest']),
    chat: jest.fn().mockResolvedValue({
      content: 'Hello from mock!',
      model: 'llama2:latest',
      provider: 'ollama',
    }),
  })),
}));

jest.mock('../../src/services/ollama-network-provider', () => ({
  OllamaNetworkProvider: jest.fn().mockImplementation(() => ({
    name: 'ollama-network',
    isAvailable: jest.fn().mockResolvedValue(true),
    listModels: jest.fn().mockResolvedValue(['llama2:latest']),
    chat: jest.fn().mockResolvedValue({
      content: 'Hello from network mock!',
      model: 'llama2:latest',
      provider: 'ollama-network',
    }),
  })),
}));

jest.mock('../../src/services/copilot-cli-provider', () => ({
  CopilotCliProvider: jest.fn().mockImplementation(() => ({
    name: 'copilot-cli',
    isAvailable: jest.fn().mockResolvedValue(false),
    listModels: jest.fn().mockResolvedValue(['default']),
    chat: jest.fn().mockResolvedValue({
      content: 'Hello from copilot mock!',
      model: 'default',
      provider: 'copilot-cli',
    }),
  })),
}));

import apiRouter from '../../src/routes/api';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

describe('GET /api/providers', () => {
  it('returns list of providers with availability', async () => {
    const res = await request(app).get('/api/providers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('available');
  });
});

describe('GET /api/models', () => {
  it('returns models for ollama provider', async () => {
    const res = await request(app).get('/api/models?provider=ollama');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('provider', 'ollama');
    expect(Array.isArray(res.body.models)).toBe(true);
  });

  it('returns 404 for unknown provider', async () => {
    const res = await request(app).get('/api/models?provider=unknown-provider');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/chat', () => {
  it('returns AI response for valid request', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: 'Hello!' }],
        model: 'llama2:latest',
        provider: 'ollama',
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('content');
    expect(res.body).toHaveProperty('model');
    expect(res.body).toHaveProperty('provider');
  });

  it('returns 400 when messages are missing', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ model: 'llama2:latest', provider: 'ollama' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when model is missing', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], provider: 'ollama' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when provider is missing', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'Hi' }], model: 'llama2:latest' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for unknown provider', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'llama2:latest',
        provider: 'unknown',
      });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/brainstorm/config', () => {
  it('returns brainstorm config summary', async () => {
    const res = await request(app).get('/api/brainstorm/config');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(typeof res.body.actionCount).toBe('number');
    expect(Array.isArray(res.body.triggers)).toBe(true);
    expect(Array.isArray(res.body.outputs)).toBe(true);
    expect(res.body).toHaveProperty('autoActions');
  });
});

describe('GET /api/brainstorm/actions', () => {
  it('returns 400 when trigger is missing', async () => {
    const res = await request(app).get('/api/brainstorm/actions');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns actions for a valid trigger', async () => {
    const res = await request(app).get('/api/brainstorm/actions?trigger=question');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('trigger', 'question');
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.actions.length).toBeGreaterThan(0);
    expect(res.body.actions[0]).toHaveProperty('name');
  });
});

describe('GET /api/brainstorm/actions/:name', () => {
  it('returns a specific action by name', async () => {
    const res = await request(app).get('/api/brainstorm/actions/clarify');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'clarify');
    expect(res.body).toHaveProperty('trigger');
  });

  it('returns 404 for unknown action', async () => {
    const res = await request(app).get('/api/brainstorm/actions/not-an-action');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/brainstorm/execute', () => {
  it('returns 400 when action is missing', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({ context: { parent: { content: 'x' } } });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when context is missing', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({ action: 'clarify' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for unknown action', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({ action: 'unknown-action', context: { parent: { content: 'x' } } });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('executes user action and returns bubble', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        action: 'answer_clarification',
        userInput: 'Desktop first',
        context: { parent: { content: 'Desktop or mobile?' } },
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('action', 'answer_clarification');
    expect(res.body).toHaveProperty('actor', 'user');
    expect(Array.isArray(res.body.bubbles)).toBe(true);
    expect(res.body.bubbles[0]).toMatchObject({ type: 'answer', content: 'Desktop first' });
  });

  it('executes AI action and returns generated bubbles', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        action: 'clarify',
        context: {
          parent: { content: 'Design a task app' },
          ancestors: {
            context: ['Small startup'],
            constraints: ['Ship in 2 weeks'],
          },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('action', 'clarify');
    expect(res.body).toHaveProperty('actor', 'facilitator');
    expect(res.body).toHaveProperty('provider', 'ollama-network');
    expect(res.body).toHaveProperty('renderedPrompt');
    expect(Array.isArray(res.body.bubbles)).toBe(true);
    expect(res.body.bubbles[0]).toHaveProperty('type', 'clarification');
    expect(res.body.bubbles[0]).toHaveProperty('content');
    expect(res.body).toHaveProperty('graphId');
    expect(Array.isArray(res.body.createdNodeIds)).toBe(true);
    expect(res.body).toHaveProperty('selectedNodeId');
    expect(Array.isArray(res.body.autoExecutions)).toBe(true);
    expect(res.body).toHaveProperty('history');
    expect(res.body.history).toHaveProperty('canUndo');
    expect(res.body).toHaveProperty('graphStats');
  });

  it('runs configured auto-actions by default', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'auto-default',
        action: 'ask_question',
        userInput: 'How should we design onboarding?',
        context: { parent: { content: 'root' } },
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.autoExecutions)).toBe(true);
    // Auto-actions now run in the background; immediate response has empty array
    expect(res.body.autoExecutions.length).toBe(0);
    expect(res.body.pendingAutoActions).toBe(true);
    // User's bubble is created immediately (nodeCount includes root + question)
    expect(res.body.graphStats.nodeCount).toBeGreaterThanOrEqual(2);

    // Wait for background auto-actions to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // After waiting, the graph should have more nodes from auto-actions
    const graphRes = await request(app).get('/api/brainstorm/graphs/auto-default');
    expect(graphRes.status).toBe(200);
    expect(graphRes.body.nodes.length).toBeGreaterThan(2);
  });

  it('can disable auto-actions per execution call', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'auto-disabled',
        action: 'ask_question',
        userInput: 'What API shape should we use?',
        applyAutoActions: false,
        context: { parent: { content: 'root' } },
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.autoExecutions)).toBe(true);
    expect(res.body.autoExecutions.length).toBe(0);
  });

  it('creates a root node when createAsRoot is true', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'root-node-test',
        action: 'ask_question',
        userInput: 'A brand new root question',
        applyAutoActions: false,
        createAsRoot: true,
        context: { parent: { content: 'root' } },
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.createdNodeIds)).toBe(true);
    expect(res.body.createdNodeIds.length).toBe(1);
    expect(res.body.parentNodeIds).toEqual([]);

    const graphRes = await request(app).get('/api/brainstorm/graphs/root-node-test');
    expect(graphRes.status).toBe(200);

    const createdNodeId = res.body.createdNodeIds[0];
    const hasEdgeTo = graphRes.body.edges.some(
      (e: { from: string; to: string }) => e.to === createdNodeId,
    );
    expect(hasEdgeTo).toBe(false);
  });

  it('stores position when createAsRoot includes position', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'root-pos-test',
        action: 'ask_question',
        userInput: 'Positioned root question',
        applyAutoActions: false,
        createAsRoot: true,
        position: { x: 350, y: 200 },
        context: { parent: { content: 'root' } },
      });

    expect(res.status).toBe(200);
    expect(res.body.createdNodeIds.length).toBe(1);

    const graphRes = await request(app).get('/api/brainstorm/graphs/root-pos-test');
    expect(graphRes.status).toBe(200);

    const createdNodeId = res.body.createdNodeIds[0];
    const createdNode = graphRes.body.nodes.find(
      (n: { id: string }) => n.id === createdNodeId,
    );
    expect(createdNode).toBeTruthy();
    expect(createdNode.position).toEqual({ x: 350, y: 200 });
  });

  it('reuses a client-provided node id for createAsRoot', async () => {
    const clientNodeId = 'optimistic-root-test-id';
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'root-client-id-test',
        action: 'ask_question',
        userInput: 'Keep this exact bubble',
        applyAutoActions: false,
        createAsRoot: true,
        clientNodeIds: [clientNodeId],
        position: { x: 480, y: 160 },
        context: { parent: { content: 'root' } },
      });

    expect(res.status).toBe(200);
    expect(res.body.createdNodeIds).toEqual([clientNodeId]);

    const graphRes = await request(app).get('/api/brainstorm/graphs/root-client-id-test');
    expect(graphRes.status).toBe(200);

    const createdNode = graphRes.body.nodes.find(
      (node: { id: string }) => node.id === clientNodeId,
    );
    expect(createdNode).toBeTruthy();
    expect(createdNode.position).toEqual({ x: 480, y: 160 });
  });
});

describe('Brainstorm graph endpoints', () => {
  it('creates and fetches a graph', async () => {
    const createRes = await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'test-graph' });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('id', 'test-graph');
    expect(createRes.body).toHaveProperty('rootNodeId');
    expect(createRes.body).toHaveProperty('history');
    expect(Array.isArray(createRes.body.nodes)).toBe(true);

    const getRes = await request(app).get('/api/brainstorm/graphs/test-graph');
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty('id', 'test-graph');
    expect(getRes.body).toHaveProperty('history');
  });

  it('lists graphs', async () => {
    const res = await request(app).get('/api/brainstorm/graphs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.graphs)).toBe(true);
  });

  it('updates graph metadata (name/bookmark)', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'meta-graph' });

    const patchRes = await request(app)
      .patch('/api/brainstorm/graphs/meta-graph/meta')
      .send({ name: 'Brainstorm A', bookmarked: true });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body).toHaveProperty('id', 'meta-graph');
    expect(patchRes.body).toHaveProperty('name', 'Brainstorm A');
    expect(patchRes.body).toHaveProperty('bookmarked', true);
    expect(patchRes.body).toHaveProperty('updatedAt');

    const listRes = await request(app).get('/api/brainstorm/graphs');
    expect(listRes.status).toBe(200);
    const entry = listRes.body.graphs.find((g: { id: string }) => g.id === 'meta-graph');
    expect(entry).toBeTruthy();
    expect(entry).toHaveProperty('name', 'Brainstorm A');
    expect(entry).toHaveProperty('bookmarked', true);
  });

  it('returns 400 when metadata patch has no fields', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'meta-empty' });

    const res = await request(app)
      .patch('/api/brainstorm/graphs/meta-empty/meta')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for unknown graph', async () => {
    const res = await request(app).get('/api/brainstorm/graphs/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('exports and imports a graph payload', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'export-source' });

    await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'export-source',
        action: 'answer_clarification',
        userInput: 'Use incremental delivery',
        context: { parent: { content: 'How should we ship?' } },
      });

    const exportRes = await request(app).get('/api/brainstorm/graphs/export-source/export');
    expect(exportRes.status).toBe(200);
    expect(exportRes.body).toHaveProperty('graph');
    expect(exportRes.body.graph).toHaveProperty('id', 'export-source');
    expect(Array.isArray(exportRes.body.graph.nodes)).toBe(true);

    const importRes = await request(app)
      .post('/api/brainstorm/graphs/import')
      .send({ graph: exportRes.body.graph, graphId: 'import-target' });

    expect(importRes.status).toBe(201);
    expect(importRes.body).toHaveProperty('id', 'import-target');
    expect(Array.isArray(importRes.body.nodes)).toBe(true);
    expect(Array.isArray(importRes.body.edges)).toBe(true);
    expect(importRes.body.history).toHaveProperty('canUndo', false);
  });

  it('returns 400 when importing invalid payload', async () => {
    const res = await request(app)
      .post('/api/brainstorm/graphs/import')
      .send({ graph: { id: 'broken' } });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('updates node position coordinates', async () => {
    const createRes = await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'position-graph' });

    const nodeId = createRes.body.rootNodeId as string;
    const patchRes = await request(app)
      .patch(`/api/brainstorm/graphs/position-graph/nodes/${encodeURIComponent(nodeId)}/position`)
      .send({ x: 120, y: 240 });

    expect(patchRes.status).toBe(200);
    const updated = patchRes.body.nodes.find((n: { id: string }) => n.id === nodeId);
    expect(updated).toBeTruthy();
    expect(updated.position).toEqual({ x: 120, y: 240 });
    expect(patchRes.body.history).toHaveProperty('canUndo', true);
  });

  it('returns 400 when coordinates are missing', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'position-missing' });

    const res = await request(app)
      .patch('/api/brainstorm/graphs/position-missing/nodes/whatever/position')
      .send({ x: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('supports undo and redo after graph mutation', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'undo-graph' });

    const executeRes = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'undo-graph',
        action: 'answer_clarification',
        userInput: 'Desktop first',
        context: { parent: { content: 'Desktop or mobile?' } },
      });

    expect(executeRes.status).toBe(200);
    expect(executeRes.body.history).toHaveProperty('canUndo', true);

    const undoRes = await request(app)
      .post('/api/brainstorm/graphs/undo-graph/undo')
      .send({});

    expect(undoRes.status).toBe(200);
    expect(undoRes.body.history).toHaveProperty('canRedo', true);

    const redoRes = await request(app)
      .post('/api/brainstorm/graphs/undo-graph/redo')
      .send({});

    expect(redoRes.status).toBe(200);
    expect(redoRes.body.history).toHaveProperty('canUndo', true);
  });

  it('returns 409 for undo without history', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'undo-empty' });

    const undoRes = await request(app)
      .post('/api/brainstorm/graphs/undo-empty/undo')
      .send({});

    expect(undoRes.status).toBe(409);
    expect(undoRes.body).toHaveProperty('error');
  });
});
