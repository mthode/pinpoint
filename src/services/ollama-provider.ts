import { spawn } from 'child_process';
import { AIMessage, AIProvider, AIResponse } from './ai-provider';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';

  isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('ollama', ['--version']);
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
  }

  listModels(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ollama', ['list']);
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
          reject(new Error(`ollama list failed: ${stderr}`));
          return;
        }
        const models = stdout
          .split('\n')
          .slice(1) // skip header line
          .map((line) => line.split(/\s+/)[0])
          .filter((name) => name && name.length > 0);
        resolve(models);
      });
    });
  }

  chat(messages: AIMessage[], model: string): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      const prompt = messages
        .map((m) => {
          if (m.role === 'system') return `System: ${m.content}`;
          if (m.role === 'user') return `User: ${m.content}`;
          return `Assistant: ${m.content}`;
        })
        .join('\n');

      const proc = spawn('ollama', ['run', model], { stdio: ['pipe', 'pipe', 'pipe'] });
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
          reject(new Error(`ollama run failed: ${stderr}`));
          return;
        }
        resolve({
          content: stdout.trim(),
          model,
          provider: this.name,
        });
      });

      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }
}
