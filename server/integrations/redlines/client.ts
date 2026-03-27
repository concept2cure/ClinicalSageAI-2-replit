import { spawn } from 'node:child_process';

export interface RedlinesResult {
  html: string;
  summary: string;
}

export class RedlinesClient {
  constructor(private readonly pythonCommand = process.env.REDLINES_PYTHON_COMMAND || 'python3') {}

  async generate(oldText: string, newText: string): Promise<RedlinesResult | null> {
    const script = [
      'import json',
      'from redlines import Redlines',
      `old_text = json.loads(${JSON.stringify(JSON.stringify(oldText))})`,
      `new_text = json.loads(${JSON.stringify(JSON.stringify(newText))})`,
      'r = Redlines(old_text, new_text)',
      'print(r.output_markdown)',
    ].join('\n');

    return new Promise((resolve) => {
      const child = spawn(this.pythonCommand, ['-c', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.on('error', () => resolve(null));
      child.on('close', (code) => {
        if (code !== 0 || !stdout.trim()) {
          resolve(null);
          return;
        }

        resolve({
          html: stdout.trim(),
          summary: 'Generated via python redlines sidecar.',
        });
      });
    });
  }
}
