import { createApiClient } from '../../src/client/lib/api';

describe('createApiClient', () => {
  it('loads graph summaries from brainstorm graphs endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ graphs: [{ id: 'g1', name: 'Graph 1', bookmarked: false, createdAt: '', updatedAt: '', nodeCount: 1, edgeCount: 0 }] }),
    });

    const client = createApiClient('/api', fetchMock as unknown as typeof fetch);
    const result = await client.loadGraphs();

    expect(fetchMock).toHaveBeenCalledWith('/api/brainstorm/graphs', undefined);
    expect(result.graphs[0]).toHaveProperty('id', 'g1');
  });

  it('posts execute action payload to brainstorm execute endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        action: 'clarify',
        actor: 'facilitator',
        graphId: 'g1',
        bubbles: [],
        autoExecutions: [],
        history: { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 },
        graphStats: { nodeCount: 1, edgeCount: 0 },
      }),
    });

    const client = createApiClient('/api', fetchMock as unknown as typeof fetch);
    await client.executeAction({
      action: 'clarify',
      context: { parent: { content: 'x' } },
      graphId: 'g1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/brainstorm/execute',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('surfaces API error payload message when request fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad request payload' }),
    });

    const client = createApiClient('/api', fetchMock as unknown as typeof fetch);

    await expect(client.loadConfig()).rejects.toThrow('bad request payload');
  });
});
