import { spawn } from 'node:child_process';

export interface ValeIssue {
  message: string;
  rule: string;
  severity: 'info' | 'warning' | 'error';
}

export class ValeClient {
  constructor(private readonly command = process.env.VALE_COMMAND || 'vale') {}

  async lint(filePath: string): Promise<ValeIssue[]> {
    const raw = await this.runVale(filePath);
    return parseValeJson(raw);
  }

  private async runVale(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, ['--output=JSON', filePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr || `vale exited ${code}`));
          return;
        }
        resolve(stdout || '{}');
      });
    });
  }
}

function parseValeJson(raw: string): ValeIssue[] {
  try {
    const payload = JSON.parse(raw) as Record<string, Array<{
      Message: string;
      Check: string;
      Severity: 'suggestion' | 'warning' | 'error';
    }>>;

    return Object.values(payload)
      .flat()
      .slice(0, 150)
      .map((entry) => ({
        message: entry.Message,
        rule: entry.Check,
        severity:
          entry.Severity === 'error'
            ? 'error'
            : entry.Severity === 'warning'
              ? 'warning'
              : 'info',
      }));
  } catch {
    return [];
  }
}
