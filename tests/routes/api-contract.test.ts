import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';

import type { BrainstormGraph, GraphHistoryStatus } from '../../src/shared/graph';

const storePath = path.join(process.cwd(), '.tmp-test-brainstorm-store-contract.json');
process.env.BRAINSTORM_STORE_PATH = storePath;

beforeEach(() => {
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath);
  }
});

jest.mock('../../src/services/ollama-provider', () => ({
  OllamaProvider: jest.fn().mockImplementation(() => ({
    name: 'ollama',
    isAvailable: jest.fn().mockResolvedValue(true),
    listModels: jest.fn().mockResolvedValue(['llama2:latest']),
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

type GraphWithHistory = BrainstormGraph & { history: GraphHistoryStatus };

describe('API contract for shared graph DTOs', () => {
  it('GET /api/brainstorm/graphs/:graphId returns BrainstormGraph-compatible payload plus history', async () => {
    await request(app)
      .post('/api/brainstorm/graphs')
      .send({ graphId: 'contract-graph' })
      .expect(201);

    const res = await request(app).get('/api/brainstorm/graphs/contract-graph');

    expect(res.status).toBe(200);

    const payload = res.body as GraphWithHistory;

    expect(typeof payload.id).toBe('string');
    expect(typeof payload.name).toBe('string');
    expect(typeof payload.bookmarked).toBe('boolean');
    expect(typeof payload.createdAt).toBe('string');
    expect(typeof payload.updatedAt).toBe('string');
    expect(typeof payload.rootNodeId).toBe('string');
    expect(typeof payload.selectedNodeId).toBe('string');
    expect(Array.isArray(payload.nodes)).toBe(true);
    expect(Array.isArray(payload.edges)).toBe(true);
    expect(payload.history).toMatchObject({
      canUndo: expect.any(Boolean),
      canRedo: expect.any(Boolean),
      undoDepth: expect.any(Number),
      redoDepth: expect.any(Number),
    });
  });
});
