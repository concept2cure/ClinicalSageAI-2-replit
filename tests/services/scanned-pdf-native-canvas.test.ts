/**
 * A scanned PDF must not crash the server process.
 *
 * Until 2026-10-01 the tree held three builds of the @napi-rs/canvas native
 * library (1.0.6 top level, 0.1.100 under pdfjs-dist, 0.1.80 under pdf-parse),
 * each with its own statically linked Skia. The rasteriser drew the page on one
 * copy while pdfjs drew embedded images and paths with objects from another,
 * and the native heap was corrupted: SIGSEGV or SIGABRT, which no
 * uncaughtException handler sees. The page that does it is any page with an
 * image on it — exactly what a scan is. ocr-live.test.ts never caught it
 * because its "scanned" PDF is drawn text, with no image.
 *
 * So this builds the real case — a page that is one embedded PNG — and runs
 * the production entry point (extractDocumentText, which loads pdf-parse first
 * and then rasterises for OCR) in a child process, where a native abort shows
 * as an exit status instead of killing the test runner.
 *
 * The lockfile half (one copy, ever) is ci:single-native-canvas.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';

const REPO = path.resolve(__dirname, '../..');
const HAS_LANG_DATA = existsSync(path.join(REPO, 'server/assets/tessdata/eng.traineddata.gz'));

function textImagePng(text: string): Buffer {
  const canvas = createCanvas(1200, 240);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1200, 240);
  ctx.fillStyle = '#000000';
  ctx.font = '64px sans-serif';
  ctx.fillText(text, 40, 140);
  return canvas.toBuffer('image/png');
}

async function scannedPdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(textImagePng(text));
  const page = doc.addPage([612, 160]);
  page.drawImage(png, { x: 6, y: 18, width: 600, height: 120 });
  return Buffer.from(await doc.save());
}

describe('scanned PDF (a page that is an image)', () => {
  (HAS_LANG_DATA ? it : it.skip)('is read by OCR and the process survives', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'scanned-pdf-'));
    const pdfPath = path.join(dir, 'scan.pdf');
    writeFileSync(pdfPath, await scannedPdf('Certificate of Analysis'));

    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(__dirname, 'fixtures/extract-pdf-in-child.ts'), pdfPath],
      { cwd: REPO, encoding: 'utf8', timeout: 120_000, env: { ...process.env, LOG_LEVEL: 'error' } },
    );

    // A native abort is a signal (SIGSEGV/SIGABRT) or 128+n, never a thrown error.
    expect({ status: child.status, signal: child.signal, stderr: child.status === 0 ? '' : child.stderr.slice(-2000) })
      .toEqual({ status: 0, signal: null, stderr: '' });
    const out = JSON.parse(child.stdout.trim().split('\n').pop() ?? '{}');
    expect(out.method).toBe('pdf-ocr');
    expect(out.text.toLowerCase()).toContain('certificate of analysis');
  }, 150_000);
});
