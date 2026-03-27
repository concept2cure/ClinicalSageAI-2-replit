import { spawn } from 'node:child_process';
import type { PdfValidationReport } from '../../services/documentIntelligence/contracts';

export class VeraPdfClient {
  constructor(private readonly command = process.env.VERAPDF_COMMAND || 'verapdf') {}

  async validate(pdfPath: string): Promise<PdfValidationReport> {
    return new Promise((resolve) => {
      const child = spawn(this.command, ['--format', 'text', pdfPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        resolve({
          validator: 'verapdf',
          compliant: false,
          profile: 'unknown',
          failures: [{ ruleId: 'tool_unavailable', message: error.message }],
          rawSummary: error.message,
        });
      });

      child.on('close', (code) => {
        const failed = code !== 0 || /failed/i.test(output);
        resolve({
          validator: 'verapdf',
          compliant: !failed,
          profile: 'PDF/A',
          failures: failed
            ? [{ ruleId: 'pdfa_validation', message: stderr || output || `exit_code_${code}` }]
            : [],
          rawSummary: output || stderr,
        });
      });
    });
  }
}
