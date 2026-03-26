import { spawn } from 'child_process';
import path from 'path';

export interface DocxPdfPipelineOptions {
  inputDocxPath: string;
  outputPdfPath?: string;
  compress?: boolean;
  quality?: 'screen' | 'ebook' | 'printer' | 'prepress' | 'default';
}

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
}

export async function runDocxPdfPipeline(
  options: DocxPdfPipelineOptions
): Promise<DocxPdfPipelineResult> {
  const scriptPath = path.resolve(process.cwd(), 'server', 'scripts', 'docx_pdf_pipeline.py');
  const args = ['--input-docx', options.inputDocxPath];
  if (options.outputPdfPath) args.push('--output-pdf', options.outputPdfPath);
  if (options.compress) args.push('--compress');
  if (options.quality) args.push('--quality', options.quality);

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || `docx_pdf_pipeline exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed as DocxPdfPipelineResult);
      } catch {
        reject(new Error(`Failed to parse pipeline output: ${stdout || stderr}`));
      }
    });
  });
}
