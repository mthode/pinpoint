import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';

const storePath = path.join(process.cwd(), '.tmp-test-brainstorm-store.json');
process.env.BRAINSTORM_STORE_PATH = storePath;

const mockOllamaProvider = {
  name: 'ollama',
  isAvailable: jest.fn(),
  listModels: jest.fn(),
  chat: jest.fn(),
};

const mockOllamaNetworkProvider = {
  name: 'ollama-network',
  isAvailable: jest.fn(),
  listModels: jest.fn(),
  chat: jest.fn(),
};

const mockCopilotCliProvider = {
  name: 'copilot-cli',
  isAvailable: jest.fn(),
  listModels: jest.fn(),
  chat: jest.fn(),
};

beforeEach(() => {
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath);
  }

  mockOllamaProvider.isAvailable.mockResolvedValue(true);
  mockOllamaProvider.listModels.mockResolvedValue(['llama2:latest', 'mistral:latest']);
  mockOllamaProvider.chat.mockResolvedValue({
    content: 'Hello from mock!',
    model: 'llama2:latest',
    provider: 'ollama',
  });

  mockOllamaNetworkProvider.isAvailable.mockResolvedValue(true);
  mockOllamaNetworkProvider.listModels.mockResolvedValue(['gemma3:1b', 'llama2:latest']);
  mockOllamaNetworkProvider.chat.mockResolvedValue({
    content: 'Hello from network mock!',
    model: 'llama2:latest',
    provider: 'ollama-network',
  });

  mockCopilotCliProvider.isAvailable.mockResolvedValue(false);
  mockCopilotCliProvider.listModels.mockResolvedValue(['default']);
  mockCopilotCliProvider.chat.mockResolvedValue({
    content: 'Hello from copilot mock!',
    model: 'default',
    provider: 'copilot-cli',
  });
});

// We need to mock the providers before importing the router
jest.mock('../../src/services/ollama-provider', () => ({
  OllamaProvider: jest.fn().mockImplementation(() => mockOllamaProvider),
}));

jest.mock('../../src/services/ollama-network-provider', () => ({
  OllamaNetworkProvider: jest.fn().mockImplementation(() => mockOllamaNetworkProvider),
}));

jest.mock('../../src/services/copilot-cli-provider', () => ({
  CopilotCliProvider: jest.fn().mockImplementation(() => mockCopilotCliProvider),
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

describe('GET /api/default-model', () => {
  it('returns the ollama-network gemma3:1b default when available', async () => {
    const res = await request(app).get('/api/default-model');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      provider: 'ollama-network',
      model: 'gemma3:1b',
      fallback: false,
    });
  });

  it('falls back to the built-in dummy model when the default model is unavailable', async () => {
    mockOllamaNetworkProvider.isAvailable.mockResolvedValue(false);

    const res = await request(app).get('/api/default-model');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      provider: 'builtin',
      model: 'dummy',
      fallback: true,
    });
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
    expect(res.body.autoExecutions.length).toBeGreaterThan(0);
    expect(res.body.graphStats.nodeCount).toBeGreaterThan(2);
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
    expect(createRes.body.nodes.length).toBe(0);

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
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'position-graph' });

    const nodeRes = await request(app)
      .post('/api/brainstorm/graphs/position-graph/nodes')
      .send({
        type: 'question',
        content: 'How do we ship this?',
        position: { x: 40, y: 80 },
      });

    expect(nodeRes.status).toBe(201);
    const nodeId = nodeRes.body.selectedNodeId as string;
    const patchRes = await request(app)
      .patch(`/api/brainstorm/graphs/position-graph/nodes/${encodeURIComponent(nodeId)}/position`)
      .send({ x: 120, y: 240 });

    expect(patchRes.status).toBe(200);
    const updated = patchRes.body.nodes.find((n: { id: string }) => n.id === nodeId);
    expect(updated).toBeTruthy();
    expect(updated.position).toEqual({ x: 120, y: 240 });
    expect(patchRes.body.history).toHaveProperty('canUndo', true);
  });

  it('creates a parentless node as a root node', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'root-create' });

    const createNodeRes = await request(app)
      .post('/api/brainstorm/graphs/root-create/nodes')
      .send({
        type: 'question',
        content: 'What should we build first?',
        position: { x: 320, y: 180 },
      });

    expect(createNodeRes.status).toBe(201);
    expect(createNodeRes.body.nodes.length).toBe(1);
    expect(createNodeRes.body.edges.length).toBe(0);
    expect(createNodeRes.body.rootNodeId).toBe(createNodeRes.body.selectedNodeId);
    const createdNode = createNodeRes.body.nodes[0];
    expect(createdNode).toMatchObject({ type: 'question', content: 'What should we build first?' });
    expect(createdNode.position).toEqual({ x: 320, y: 180 });
  });

  it('deletes a node and its descendant subtree', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'delete-subtree' });

    const rootRes = await request(app)
      .post('/api/brainstorm/graphs/delete-subtree/nodes')
      .send({
        type: 'question',
        content: 'Root node',
      });

    const rootId = rootRes.body.selectedNodeId as string;

    const childRes = await request(app)
      .post('/api/brainstorm/graphs/delete-subtree/nodes')
      .send({
        type: 'assumption',
        content: 'Child node',
        parentNodeId: rootId,
      });

    const childId = childRes.body.selectedNodeId as string;

    await request(app)
      .post('/api/brainstorm/graphs/delete-subtree/nodes')
      .send({
        type: 'context',
        content: 'Grandchild node',
        parentNodeId: childId,
      });

    const siblingRootRes = await request(app)
      .post('/api/brainstorm/graphs/delete-subtree/nodes')
      .send({
        type: 'question',
        content: 'Sibling root',
      });

    const siblingRootId = siblingRootRes.body.selectedNodeId as string;

    const deleteRes = await request(app)
      .delete(`/api/brainstorm/graphs/delete-subtree/nodes/${encodeURIComponent(childId)}`)
      .send({});

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.nodes.map((n: { id: string }) => n.id)).toEqual(
      expect.arrayContaining([rootId, siblingRootId]),
    );
    expect(deleteRes.body.nodes.length).toBe(2);
    expect(deleteRes.body.edges.length).toBe(0);
    expect(deleteRes.body.history).toHaveProperty('canUndo', true);
  });

  it('returns 404 when deleting an unknown node', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'delete-missing' });

    const res = await request(app)
      .delete('/api/brainstorm/graphs/delete-missing/nodes/does-not-exist')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
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
