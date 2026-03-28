import { EventEmitter } from 'events';
import { CopilotCliProvider } from '../../src/services/copilot-cli-provider';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

function createMockProcess(stdoutData: string, stderrData: string, exitCode: number) {
  const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const stdin = { write: jest.fn(), end: jest.fn() };
  const proc = new EventEmitter() as ReturnType<typeof spawn>;
  Object.assign(proc, { stdout, stderr, stdin });

  setTimeout(() => {
    if (stdoutData) (stdout as EventEmitter).emit('data', Buffer.from(stdoutData));
    if (stderrData) (stderr as EventEmitter).emit('data', Buffer.from(stderrData));
    proc.emit('close', exitCode);
  }, 0);

  return proc;
}

describe('CopilotCliProvider', () => {
  let provider: CopilotCliProvider;

  beforeEach(() => {
    provider = new CopilotCliProvider();
    jest.clearAllMocks();
  });

  describe('isAvailable()', () => {
    it('returns true when gh copilot --version succeeds', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('1.0.0', '', 0) as ReturnType<typeof spawn>);
      expect(await provider.isAvailable()).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('gh', ['copilot', '--version']);
    });

    it('returns false when command fails', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'not found', 1) as ReturnType<typeof spawn>);
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when spawn errors', async () => {
      const proc = new EventEmitter() as ReturnType<typeof spawn>;
      Object.assign(proc, {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: jest.fn(), end: jest.fn() },
      });
      setTimeout(() => proc.emit('error', new Error('ENOENT')), 0);
      mockSpawn.mockReturnValueOnce(proc);
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('listModels()', () => {
    it('returns default model', async () => {
      const models = await provider.listModels();
      expect(models).toEqual(['default']);
    });
  });

  describe('chat()', () => {
    it('sends the last user message to gh copilot suggest', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess('git status --short', '', 0) as ReturnType<typeof spawn>,
      );

      const result = await provider.chat(
        [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Show changed files' },
        ],
        'default',
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['copilot', 'suggest', '-t', 'shell', 'Show changed files'],
        expect.any(Object),
      );
      expect(result.content).toBe('git status --short');
      expect(result.provider).toBe('copilot-cli');
    });

    it('rejects when no user message is present', async () => {
      await expect(
        provider.chat([{ role: 'system', content: 'sys' }], 'default'),
      ).rejects.toThrow('No user message found');
    });

    it('rejects when command exits non-zero', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess('', 'auth required', 1) as ReturnType<typeof spawn>,
      );
      await expect(
        provider.chat([{ role: 'user', content: 'hello' }], 'default'),
      ).rejects.toThrow('gh copilot suggest failed');
    });
  });
});
