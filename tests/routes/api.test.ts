import request from 'supertest';
import express from 'express';

// We need to mock the OllamaProvider before importing the router
jest.mock('../../src/services/ollama-provider', () => {
  return {
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
  };
});

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
