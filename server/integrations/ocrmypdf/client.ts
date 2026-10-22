import { spawn } from 'node:child_process';
import { withConversionSlot } from '../../services/conversion-slots';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('ocrmypdf-client');

export class OcrMyPdfClient {
  constructor(private readonly command = process.env.OCRMYPDF_COMMAND || 'ocrmypdf') {}

  /**
   * OCR a PDF. Runs inside one of the process's conversion slots (OPS-13,
   * MR-03 Stage 2) and with `--jobs 1`: ocrmypdf otherwise starts one worker per
   * CPU, each with its own Tesseract and Ghostscript, so one slot would stand
   * for several heavy children. A wait past CONVERTER_QUEUE_TIMEOUT_MS rejects
   * with ConversionCapacityError; a missing binary or a failed run still
   * resolves `{ applied: false }` as before.
   */
  async run(inputPath: string, outputPath: string): Promise<{ applied: boolean; stderr?: string }> {
    return withConversionSlot('ocrmypdf', () => new Promise<{ applied: boolean; stderr?: string }>((resolve) => {
      const args = ['--jobs', '1', '--skip-text', '--sidecar', '/dev/null', inputPath, outputPath];
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
    }));
  }
}
