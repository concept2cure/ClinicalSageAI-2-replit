import { spawn } from 'node:child_process';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('ocrmypdf-client');

export class OcrMyPdfClient {
  constructor(private readonly command = process.env.OCRMYPDF_COMMAND || 'ocrmypdf') {}

  async run(inputPath: string, outputPath: string): Promise<{ applied: boolean; stderr?: string }> {
    return new Promise((resolve) => {
      const args = ['--skip-text', '--sidecar', '/dev/null', inputPath, outputPath];
      const child = spawn(this.command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        logger.warn('OCRmyPDF unavailable', { error: error.message });
        resolve({ applied: false, stderr: error.message });
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ applied: true, stderr });
          return;
        }
        resolve({ applied: false, stderr: stderr || `exit_code_${code}` });
      });
    });
  }
}
