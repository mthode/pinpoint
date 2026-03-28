import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';

const storePath = path.join(process.cwd(), '.tmp-test-auto-action-errors.json');
process.env.BRAINSTORM_STORE_PATH = storePath;

beforeEach(() => {
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath);
  }
});

afterAll(() => {
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath);
  }
});

// Mock providers — the ollama-network provider chat throws to simulate AI failure
jest.mock('../../src/services/ollama-provider', () => ({
  OllamaProvider: jest.fn().mockImplementation(() => ({
    name: 'ollama',
    isAvailable: jest.fn().mockResolvedValue(true),
    listModels: jest.fn().mockResolvedValue(['llama2:latest']),
    chat: jest.fn().mockRejectedValue(new Error('Ollama not available')),
  })),
}));

jest.mock('../../src/services/ollama-network-provider', () => ({
  OllamaNetworkProvider: jest.fn().mockImplementation(() => ({
    name: 'ollama-network',
    isAvailable: jest.fn().mockResolvedValue(true),
    listModels: jest.fn().mockResolvedValue(['llama2:latest']),
    chat: jest.fn().mockRejectedValue(new Error('Ollama network not available')),
  })),
}));

jest.mock('../../src/services/copilot-cli-provider', () => ({
  CopilotCliProvider: jest.fn().mockImplementation(() => ({
    name: 'copilot-cli',
    isAvailable: jest.fn().mockResolvedValue(false),
    listModels: jest.fn().mockResolvedValue(['default']),
    chat: jest.fn().mockRejectedValue(new Error('Copilot not available')),
  })),
}));

import apiRouter from '../../src/routes/api';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

describe('POST /api/brainstorm/execute — auto-action error handling', () => {
  it('returns 200 with user bubble even when auto-actions fail', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'auto-fail-graph',
        action: 'ask_question',
        userInput: 'Why is the sky blue?',
        context: { parent: { content: 'root' } },
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('action', 'ask_question');
    expect(res.body).toHaveProperty('actor', 'user');
    expect(Array.isArray(res.body.bubbles)).toBe(true);
    expect(res.body.bubbles[0]).toMatchObject({
      type: 'question',
      content: 'Why is the sky blue?',
    });
    expect(Array.isArray(res.body.createdNodeIds)).toBe(true);
    expect(res.body.createdNodeIds.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('graphId', 'auto-fail-graph');
    expect(res.body).toHaveProperty('selectedNodeId');
  });

  it('records failed auto-actions in the response', async () => {
    const res = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'auto-fail-record',
        action: 'ask_question',
        userInput: 'How does gravity work?',
        context: { parent: { content: 'root' } },
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.autoExecutions)).toBe(true);
    // Auto-actions for question type (clarify, state_assumption, research_context)
    // should all have failed but been recorded
    expect(res.body.autoExecutions.length).toBeGreaterThan(0);
    for (const auto of res.body.autoExecutions) {
      expect(auto.createdNodeIds).toEqual([]);
      expect(auto.bubbleCount).toBe(0);
    }
  });

  it('creates the user bubble in the graph even when auto-actions fail', async () => {
    const execRes = await request(app)
      .post('/api/brainstorm/execute')
      .send({
        graphId: 'auto-fail-persist',
        action: 'ask_question',
        userInput: 'What is photosynthesis?',
        context: { parent: { content: 'root' } },
      });

    expect(execRes.status).toBe(200);

    // Verify the graph contains the user's bubble
    const graphRes = await request(app).get('/api/brainstorm/graphs/auto-fail-persist');
    expect(graphRes.status).toBe(200);

    const questionNode = graphRes.body.nodes.find(
      (n: { type: string; content: string }) =>
        n.type === 'question' && n.content === 'What is photosynthesis?',
    );
    expect(questionNode).toBeTruthy();
    // The selected node should be the created question
    expect(graphRes.body.selectedNodeId).toBe(questionNode.id);
  });
});
