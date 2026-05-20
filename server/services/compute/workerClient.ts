import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ComputeIntent, ComputeOutput } from './types';

function sanitizeHtml(content: string): string {
  return content
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+=/gi, 'data-removed=');
}

async function runDocxPythonIsolated(intent: ComputeIntent): Promise<ComputeOutput[]> {
  if (intent.metadata?.networkEnabled === true) {
    throw new Error('Network egress blocked: docx-python runtime enforces no-network policy');
  }

  const runtimeScript = path.resolve(process.cwd(), 'workers/artifact-compute/docx-python-runtime.py');
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-compute-'));
  const inputPath = path.join(workdir, 'input.json');
  const outputPath = path.join(workdir, 'output.json');

  /* The runtime accepts an optional `images` map (key → base64 PNG/JPEG)
     referenced from content via ![alt](key). When the caller passed
     metadata.images, forward it so inline imagery renders. */
  const images =
    intent.metadata && typeof intent.metadata.images === 'object'
      ? intent.metadata.images
      : undefined;

  await fs.writeFile(
    inputPath,
    JSON.stringify(
      {
        title: intent.title,
        content: intent.content,
        images,
        output_path: outputPath,
        force_invalid_output: intent.metadata?.forceInvalidOutput === true,
      },
      null,
      2
    )
  );

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('python3', [runtimeScript, inputPath], {
      cwd: workdir,
      env: {
        ...process.env,
        ARTIFACT_COMPUTE_NO_NETWORK: '1',
        ARTIFACT_COMPUTE_WORKDIR: workdir,
      },
      stdio: 'pipe',
    });

    let stderr = '';
    proc.stderr.on('data', d => {
      stderr += d.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('docx-python worker timeout exceeded'));
    }, 20_000);

    proc.on('exit', code => {
      clearTimeout(timeout);
      if (code === 0) return resolve();
      reject(new Error(`docx-python worker failed (${code}): ${stderr || 'unknown error'}`));
    });
  });

  const outputRaw = await fs.readFile(outputPath, 'utf8');
  const payload = JSON.parse(outputRaw);

  if (payload.output_type !== 'docx') {
    throw new Error(`Invalid output type from isolated worker: ${payload.output_type}`);
  }

  return [
    {
      outputType: payload.output_type,
      mimeType: payload.mime_type,
      fileName: payload.file_name,
      buffer: Buffer.from(payload.content_base64, 'base64'),
      sanitizerReport: { runtime: 'docx-python', isolation: 'subprocess-tempdir' },
    },
  ];
}

export async function runIsolatedCompute(intent: ComputeIntent): Promise<ComputeOutput[]> {
  if (intent.format === 'docx') {
    return runDocxPythonIsolated(intent);
  }

  const baseText = `${intent.title}\n\n${intent.content}`;
  switch (intent.format) {
    case 'html': {
      const sanitized = sanitizeHtml(intent.content);
      return [
        {
          outputType: 'safe_html',
          mimeType: 'text/html',
          fileName: `${intent.title.replace(/\s+/g, '_').toLowerCase()}.html`,
          buffer: Buffer.from(`<article><h1>${intent.title}</h1>${sanitized}</article>`, 'utf8'),
          sanitizerReport: { scriptsRemoved: intent.content.includes('<script'), maturity: 'provisional' },
        },
      ];
    }
    case 'xlsx':
      return [
        {
          outputType: 'spreadsheet',
          mimeType: 'text/csv',
          fileName: `${intent.title.replace(/\s+/g, '_').toLowerCase()}.csv`,
          buffer: Buffer.from(
            `section,content\n"${intent.title}","${intent.content.replace(/"/g, '""')}"`,
            'utf8'
          ),
          sanitizerReport: { maturity: 'provisional' },
        },
      ];
    case 'pptx':
      return [
        {
          outputType: 'presentation',
          mimeType: 'text/plain',
          fileName: `${intent.title.replace(/\s+/g, '_').toLowerCase()}.pptx.txt`,
          buffer: Buffer.from(baseText, 'utf8'),
          sanitizerReport: { maturity: 'provisional' },
        },
      ];
    case 'zip':
      return [
        {
          outputType: 'bundle',
          mimeType: 'application/json',
          fileName: `${intent.title.replace(/\s+/g, '_').toLowerCase()}.bundle.json`,
          buffer: Buffer.from(JSON.stringify({ title: intent.title, content: intent.content }, null, 2), 'utf8'),
          sanitizerReport: { maturity: 'provisional' },
        },
      ];
    default:
      throw new Error(`Unsupported output format: ${intent.format}`);
  }
}
