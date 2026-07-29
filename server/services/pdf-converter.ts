/**
 * Canonical DOCX → PDF converter.
 *
 * Produces deterministic, audit-bound PDFs from DOCX bytes. This is the
 * single canonical PDF entry point for the document export pipeline; the
 * ad-hoc /artifacts/export-pdf and ind-pdf routes (pdf-lib, pdfkit raw) are
 * kept for backwards compat but new export surfaces should call this
 * service.
 *
 * Strategy:
 *   1. Primary  — LibreOffice headless subprocess (high fidelity, preserves
 *                 the DOCX layout the user signed off on in Word).
 *   2. Fallback — Puppeteer-cluster rendering of an HTML preview (lower
 *                 fidelity but works without LibreOffice in dev environments).
 *
 * Determinism:
 *   PDF metadata fields that change every run (CreationDate, ModDate,
 *   Producer build string, document /ID) are stripped/normalized so the
 *   same DOCX input always yields byte-identical PDF output. This is what
 *   makes the SHA-256 of the PDF a stable artifact ID for the audit chain.
 *
 * Operator runbook (production):
 *   1. Verify Dockerfile.optimized installs `libreoffice-writer`.
 *   2. Set PDF_CONVERTER_BACKEND=libreoffice in env (default = "auto").
 *   3. Optional: set PDF_CONVERTER_TIMEOUT_MS (default 60000).
 *
 * Compliance:
 *   FDA 21 CFR Part 11 §11.10(c) — protect records to enable accurate and
 *   ready retrieval. A deterministic hash means the PDF you exported in
 *   January is provably the same artifact you re-render in July.
 */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface PdfConvertResult {
  /** PDF bytes, deterministic for a given DOCX input. */
  pdf: Buffer;
  /** SHA-256 of the deterministic PDF (after metadata stripping). */
  sha256: string;
  /** Which backend produced the PDF. */
  backend: 'libreoffice' | 'puppeteer-fallback';
  /** Bytes before deterministic stripping (for comparison / debugging). */
  originalBytes: number;
}

export type PdfConverterBackend = 'auto' | 'libreoffice' | 'puppeteer';

interface ConvertOptions {
  /** Override the env-selected backend. */
  backend?: PdfConverterBackend;
  /** Override the env timeout. */
  timeoutMs?: number;
  /** HTML used by the puppeteer fallback. Required if libreoffice is unavailable. */
  fallbackHtml?: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const LIBREOFFICE_BIN = process.env.LIBREOFFICE_BIN || 'libreoffice';

function selectedBackend(opts: ConvertOptions): PdfConverterBackend {
  return opts.backend ?? (process.env.PDF_CONVERTER_BACKEND as PdfConverterBackend) ?? 'auto';
}

function timeoutMs(opts: ConvertOptions): number {
  if (typeof opts.timeoutMs === 'number') return opts.timeoutMs;
  const fromEnv = Number(process.env.PDF_CONVERTER_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
}

/** Public entry point. */
export async function convertDocxToPdf(
  docx: Buffer,
  opts: ConvertOptions = {}
): Promise<PdfConvertResult> {
  if (!Buffer.isBuffer(docx) || docx.byteLength === 0) {
    throw new Error('convertDocxToPdf: docx must be a non-empty Buffer');
  }

  const backend = selectedBackend(opts);

  let raw: Buffer;
  let backendUsed: 'libreoffice' | 'puppeteer-fallback';

  if (backend === 'libreoffice') {
    raw = await runLibreOffice(docx, timeoutMs(opts));
    backendUsed = 'libreoffice';
  } else if (backend === 'puppeteer') {
    raw = await runPuppeteerFallback(opts.fallbackHtml, timeoutMs(opts));
    backendUsed = 'puppeteer-fallback';
  } else {
    // 'auto' — try LibreOffice, fall back if it isn't installed.
    try {
      raw = await runLibreOffice(docx, timeoutMs(opts));
      backendUsed = 'libreoffice';
    } catch (err) {
      if (!isLibreOfficeMissing(err)) throw err;
      raw = await runPuppeteerFallback(opts.fallbackHtml, timeoutMs(opts));
      backendUsed = 'puppeteer-fallback';
    }
  }

  const originalBytes = raw.byteLength;
  const pdf = makeDeterministic(raw);
  const sha256 = createHash('sha256').update(pdf).digest('hex');

  return { pdf, sha256, backend: backendUsed, originalBytes };
}

// ============================================================================
// LibreOffice subprocess
// ============================================================================

async function runLibreOffice(docx: Buffer, timeout: number): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-conv-'));
  const inputPath = path.join(workDir, `in-${randomBytes(8).toString('hex')}.docx`);
  const outputPath = inputPath.replace(/\.docx$/, '.pdf');

  try {
    await fs.writeFile(inputPath, docx);

    await new Promise<void>((resolve, reject) => {
      const args = [
        '--headless',
        '--norestore',
        '--nologo',
        '--nofirststartwizard',
        '--convert-to',
        'pdf:writer_pdf_Export',
        '--outdir',
        workDir,
        inputPath,
      ];

      const child = spawn(LIBREOFFICE_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const stderr: Buffer[] = [];
      child.stderr.on('data', chunk => stderr.push(chunk as Buffer));

      const killer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`LibreOffice conversion timed out after ${timeout}ms`));
      }, timeout);

      child.once('error', err => {
        clearTimeout(killer);
        reject(err);
      });

      child.once('exit', code => {
        clearTimeout(killer);
        if (code === 0) return resolve();
        const tail = Buffer.concat(stderr).toString('utf8').slice(-500);
        reject(new Error(`LibreOffice exited with code ${code}. stderr tail: ${tail}`));
      });
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function isLibreOfficeMissing(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /ENOENT|not found|Cannot find/i.test(message);
}

// ============================================================================
// Puppeteer fallback (low-fidelity but works in dev without LibreOffice)
// ============================================================================

async function runPuppeteerFallback(html: string | undefined, timeout: number): Promise<Buffer> {
  if (!html) {
    throw new Error(
      'PDF converter: puppeteer fallback selected but no fallbackHtml was provided. ' +
        'Either install LibreOffice (set PDF_CONVERTER_BACKEND=libreoffice) or pass ' +
        '{ fallbackHtml } to convertDocxToPdf().'
    );
  }

  // Lazy import so this module loads in environments without puppeteer.
  const { renderHtmlToPdf } = await import('../export/renderers');
  const racePromise = renderHtmlToPdf(html);
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Puppeteer fallback timed out after ${timeout}ms`)), timeout)
  );
  const buffer = (await Promise.race([racePromise, timer])) as Buffer;
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

// ============================================================================
// Determinism: strip non-deterministic PDF metadata
// ============================================================================

const PDF_NORMALIZED_DATE = 'D:19700101000000Z';
const PDF_NORMALIZED_PRODUCER = '/Producer (Concept2Cure RI canonical)';
const PDF_NORMALIZED_CREATOR = '/Creator (Concept2Cure RI canonical)';

/**
 * Normalize the parts of a PDF that change between runs:
 *   - /CreationDate, /ModDate  (timestamps)
 *   - /Producer                (build string with version)
 *   - /Creator                 (renderer build string)
 *   - /ID [<...> <...>]        (the trailer document ID — random per run)
 *
 * Operates on the raw bytes rather than re-parsing the PDF, because
 * re-parsing through pdf-lib would itself introduce non-determinism in
 * cross-reference offsets. PDF tooling tolerates these in-place edits.
 */
export function makeDeterministic(pdf: Buffer): Buffer {
  let text = pdf.toString('binary');

  text = text.replace(
    /\/CreationDate\s*\(D:[^)]+\)/g,
    `/CreationDate (${PDF_NORMALIZED_DATE})`
  );
  text = text.replace(/\/ModDate\s*\(D:[^)]+\)/g, `/ModDate (${PDF_NORMALIZED_DATE})`);
  // PDF Producer/Creator strings often contain nested parens (e.g.
  // "LibreOffice 7.5 (Linux build-1234)"). [^)]* would stop at the first
  // inner ')' and leave trailing garbage. Match one level of balanced
  // parens, which covers every real-world producer string we've seen.
  const fieldValuePattern = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/;
  text = text.replace(new RegExp(`/Producer\\s*${fieldValuePattern.source}`, 'g'), PDF_NORMALIZED_PRODUCER);
  text = text.replace(new RegExp(`/Creator\\s*${fieldValuePattern.source}`, 'g'), PDF_NORMALIZED_CREATOR);
  // Trailer /ID — replace whatever pair is present with two zero-hash ids.
  text = text.replace(
    /\/ID\s*\[\s*<[0-9a-fA-F]+>\s*<[0-9a-fA-F]+>\s*\]/g,
    '/ID [<00000000000000000000000000000000> <00000000000000000000000000000000>]'
  );

  return Buffer.from(text, 'binary');
}

/**
 * Quick sniff that a buffer looks like a PDF. Used by tests + callers that
 * want to validate before storing.
 */
export function looksLikePdf(buf: Buffer): boolean {
  return buf.byteLength > 4 && buf.slice(0, 5).toString('ascii') === '%PDF-';
}
