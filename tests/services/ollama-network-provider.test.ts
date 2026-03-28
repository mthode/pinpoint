import http from 'http';
import { OllamaNetworkProvider } from '../../src/services/ollama-network-provider';

let mockServer: http.Server;
let port: number;

function startMockServer(handler: http.RequestListener): Promise<void> {
  return new Promise((resolve) => {
    mockServer = http.createServer(handler);
    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address();
      if (addr && typeof addr !== 'string') {
        port = addr.port;
      }
      resolve();
    });
  });
}

function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (mockServer) mockServer.close(() => resolve());
    else resolve();
  });
}

describe('OllamaNetworkProvider', () => {
  afterEach(async () => {
    await stopMockServer();
  });

  describe('isAvailable()', () => {
    it('returns true when /api/tags responds 200', async () => {
      await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [] }));
      });

      const provider = new OllamaNetworkProvider(`http://127.0.0.1:${port}`);
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when connection refused', async () => {
      const provider = new OllamaNetworkProvider('http://127.0.0.1:1');
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('listModels()', () => {
    it('returns model names from /api/tags', async () => {
      await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'llama2:latest' }, { name: 'mistral:latest' }] }));
      });

      const provider = new OllamaNetworkProvider(`http://127.0.0.1:${port}`);
      const models = await provider.listModels();
      expect(models).toEqual(['llama2:latest', 'mistral:latest']);
    });

    it('returns empty array when no models', async () => {
      await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [] }));
      });

      const provider = new OllamaNetworkProvider(`http://127.0.0.1:${port}`);
      const models = await provider.listModels();
      expect(models).toEqual([]);
    });
  });

  describe('chat()', () => {
    it('sends messages and returns response', async () => {
      let receivedBody = '';
      await startMockServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          receivedBody = body;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { role: 'assistant', content: 'Hello there!' } }));
        });
      });

      const provider = new OllamaNetworkProvider(`http://127.0.0.1:${port}`);
      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        'llama2',
      );

      expect(result.content).toBe('Hello there!');
      expect(result.model).toBe('llama2');
      expect(result.provider).toBe('ollama-network');

      const parsed = JSON.parse(receivedBody);
      expect(parsed.model).toBe('llama2');
      expect(parsed.stream).toBe(false);
      expect(parsed.messages).toEqual([{ role: 'user', content: 'Hi' }]);
    });

    it('rejects on HTTP error', async () => {
      await startMockServer((_req, res) => {
        res.writeHead(500);
        res.end('internal error');
      });

      const provider = new OllamaNetworkProvider(`http://127.0.0.1:${port}`);
      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], 'llama2'),
      ).rejects.toThrow('Ollama HTTP 500');
    });
  });
});
