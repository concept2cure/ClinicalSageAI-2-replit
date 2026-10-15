import { spawn } from 'child_process';
import path from 'path';

export interface DocxPdfPipelineOptions {
  inputDocxPath: string;
  outputPdfPath?: string;
  compress?: boolean;
  quality?: 'screen' | 'ebook' | 'printer' | 'prepress' | 'default';
  /** Wall-clock limit for the conversion. Default DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** Two minutes: well past a normal conversion, short of a tool call held for ever. */
export const DEFAULT_TIMEOUT_MS = 120_000;

export interface DocxPdfPipelineResult {
  ok: boolean;
  inputDocx: string;
  convertedPdf: string;
  finalPdf: string;
  compression?: {
    quality: string;
    originalSizeBytes: number;
    compressedSizeBytes: number;
    compressionRatio: number;
  } | null;
  /**
   * Reason compression was skipped, when `--compress` was requested but could
   * not run (e.g. `ghostscript_unavailable`). Null when compression ran or was
   * not requested. The PDF is still produced either way.
   */
  compressionSkipped?: string | null;
}

export async function runDocxPdfPipeline(
  options: DocxPdfPipelineOptions
): Promise<DocxPdfPipelineResult> {
  const scriptPath = path.resolve(process.cwd(), 'server', 'scripts', 'docx_pdf_pipeline.py');
  const args = ['--input-docx', options.inputDocxPath];
  if (options.outputPdfPath) args.push('--output-pdf', options.outputPdfPath);
  if (options.compress) args.push('--compress');
  if (options.quality) args.push('--quality', options.quality);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /* A LibreOffice that hangs used to hold the calling tool for ever: nothing
     timed the conversion. It now runs in its own process group (detached),
     and at the limit the whole group is killed — the python wrapper and the
     soffice it started. A spawn that fails ('error', e.g. no python3) used to
     leave the promise unsettled; it now rejects. (2026-10-01) */
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const proc = spawn('python3', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    const timer = setTimeout(() => {
      try {
        if (proc.pid) process.kill(-proc.pid, 'SIGKILL');
        else proc.kill('SIGKILL');
      } catch {
        // already gone
      }
      settle(() =>
        reject(new Error(`DOCX→PDF conversion stopped after ${Math.round(timeoutMs / 1000)}s: LibreOffice did not finish.`)),
      );
    }, timeoutMs);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('error', err => {
      settle(() => reject(new Error(`DOCX→PDF conversion could not be started: ${err.message}`)));
    });

    proc.on('close', code => {
      settle(() => {
        if (code !== 0) {
          reject(new Error(stderr || `docx_pdf_pipeline exited with code ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as DocxPdfPipelineResult);
        } catch {
          reject(new Error(`Failed to parse pipeline output: ${stdout || stderr}`));
        }
      });
    });
  });
}
