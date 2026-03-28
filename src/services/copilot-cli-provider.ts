import { spawn } from 'child_process';
import { AIMessage, AIProvider, AIResponse } from './ai-provider';

export class CopilotCliProvider implements AIProvider {
  readonly name = 'copilot-cli';

  isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('gh', ['copilot', '--version']);
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
  }

  listModels(): Promise<string[]> {
    // gh copilot doesn't expose a model list; return a single logical entry.
    return Promise.resolve(['default']);
  }

  chat(messages: AIMessage[], model: string): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      // Build a single prompt with the most recent user message.
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (!lastUserMsg) {
        reject(new Error('No user message found'));
        return;
      }

      const proc = spawn('gh', ['copilot', 'suggest', '-t', 'shell', lastUserMsg.content], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`gh copilot suggest failed (exit ${code}): ${stderr}`));
          return;
        }
        resolve({
          content: stdout.trim(),
          model,
          provider: this.name,
        });
      });
    });
  }
}
