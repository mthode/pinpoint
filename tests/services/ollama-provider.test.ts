import { EventEmitter } from 'events';
import { OllamaProvider } from '../../src/services/ollama-provider';

// Mock child_process.spawn
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

function createMockProcess(stdoutData: string, stderrData: string, exitCode: number) {
  const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const stdin = {
    write: jest.fn(),
    end: jest.fn(),
  };
  const proc = new EventEmitter() as ReturnType<typeof spawn>;
  Object.assign(proc, { stdout, stderr, stdin });

  setTimeout(() => {
    if (stdoutData) (stdout as EventEmitter).emit('data', Buffer.from(stdoutData));
    if (stderrData) (stderr as EventEmitter).emit('data', Buffer.from(stderrData));
    proc.emit('close', exitCode);
  }, 0);

  return proc;
}

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider();
    jest.clearAllMocks();
  });

  describe('isAvailable()', () => {
    it('returns true when ollama --version exits with code 0', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('ollama version 0.1.0', '', 0) as ReturnType<typeof spawn>);
      const result = await provider.isAvailable();
      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('ollama', ['--version']);
    });

    it('returns false when process exits with non-zero code', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'not found', 1) as ReturnType<typeof spawn>);
      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });

    it('returns false when spawn emits an error', async () => {
      const proc = new EventEmitter() as ReturnType<typeof spawn>;
      Object.assign(proc, {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: jest.fn(), end: jest.fn() },
      });
      setTimeout(() => proc.emit('error', new Error('ENOENT')), 0);
      mockSpawn.mockReturnValueOnce(proc);
      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('listModels()', () => {
    it('parses ollama list output correctly', async () => {
      const output = `NAME                    ID              SIZE    MODIFIED
llama2:latest           abc123          3.8 GB  2 days ago
mistral:latest          def456          4.1 GB  3 days ago
`;
      mockSpawn.mockReturnValueOnce(createMockProcess(output, '', 0) as ReturnType<typeof spawn>);
      const models = await provider.listModels();
      expect(models).toEqual(['llama2:latest', 'mistral:latest']);
      expect(mockSpawn).toHaveBeenCalledWith('ollama', ['list']);
    });

    it('returns empty array when no models exist', async () => {
      const output = `NAME    ID    SIZE    MODIFIED\n`;
      mockSpawn.mockReturnValueOnce(createMockProcess(output, '', 0) as ReturnType<typeof spawn>);
      const models = await provider.listModels();
      expect(models).toEqual([]);
    });

    it('rejects when ollama list exits with non-zero code', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'error occurred', 1) as ReturnType<typeof spawn>);
      await expect(provider.listModels()).rejects.toThrow('ollama list failed');
    });
  });

  describe('chat()', () => {
    it('constructs the correct command', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('Hello! How can I help?', '', 0) as ReturnType<typeof spawn>);
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const response = await provider.chat(messages, 'llama2');
      expect(mockSpawn).toHaveBeenCalledWith('ollama', ['run', 'llama2'], expect.any(Object));
      expect(response.content).toBe('Hello! How can I help?');
      expect(response.model).toBe('llama2');
      expect(response.provider).toBe('ollama');
    });

    it('rejects when ollama run exits with non-zero code', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'model not found', 1) as ReturnType<typeof spawn>);
      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], 'nonexistent-model')
      ).rejects.toThrow('ollama run failed');
    });
  });
});
