import http from 'http';
import { AIMessage, AIProvider, AIResponse } from './ai-provider';

export class OllamaNetworkProvider implements AIProvider {
  readonly name = 'ollama-network';
  private readonly baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  isAvailable(): Promise<boolean> {
    return this.request<{ models?: unknown[] }>('/api/tags', 'GET', undefined, 1_000)
      .then(() => true)
      .catch(() => false);
  }

  async listModels(): Promise<string[]> {
    const data = await this.request<{ models: { name: string }[] }>('/api/tags', 'GET');
    return (data.models || []).map((m) => m.name);
  }

  async chat(messages: AIMessage[], model: string): Promise<AIResponse> {
    const body = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };

    const data = await this.request<{ message: { content: string } }>('/api/chat', 'POST', body);

    return {
      content: data.message.content.trim(),
      model,
      provider: this.name,
    };
  }

  private request<T>(path: string, method: string, body?: unknown, timeoutMs = 120_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const payload = body ? JSON.stringify(body) : undefined;

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method,
          headers: {
            ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk: Buffer) => {
            raw += chunk.toString();
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Ollama HTTP ${res.statusCode}: ${raw}`));
              return;
            }
            try {
              resolve(JSON.parse(raw) as T);
            } catch {
              reject(new Error(`Invalid JSON from Ollama: ${raw.slice(0, 200)}`));
            }
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama network request timed out'));
      });

      if (payload) req.write(payload);
      req.end();
    });
  }
}
