// @vitest-environment node
/**
 * One place in the client frames anything: vaultPdfViewer.tsx (security
 * review 2026-10-22). frame-src admits blob:, so what keeps a framed blob a
 * PDF is the bytes rule there (pdfViewerBlob, typed PdfViewerBlob). A second
 * <iframe>, a srcdoc or a script-built frame elsewhere would sit outside that
 * rule, so it fails here until it is moved onto the viewer or its frame source
 * is reviewed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..');
const FRAMING = /<iframe\b|\bsrcdoc\b|createElement\(\s*['"]iframe['"]\s*\)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(full);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\.[tj]sx?$/.test(name) ? [full] : [];
  });
}

describe('the client frames content in one place', () => {
  it('only vaultPdfViewer.tsx builds a frame', () => {
    const framing = sources(ROOT).filter((f) => FRAMING.test(readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
    expect(framing).toEqual([path.join('concept2cure', 'v2', 'editor', 'vaultPdfViewer.tsx')]);
  });
});
