/**
 * PDF/A finalization pipeline — proves the safe no-op contract: with no
 * Ghostscript or veraPDF binary present, finalizePdfA returns the input bytes
 * unchanged with converted:false and NEVER throws. No real binaries are run.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub binary detection: every execFile (including --version probes) fails as
// if the binary were absent. The pipeline must degrade to a no-op.
vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], opts: any, cb: any) => {
    const callback = typeof opts === 'function' ? opts : cb;
    const err: any = new Error('spawn ENOENT');
    err.code = 'ENOENT';
    callback(err);
  }),
}));

import { finalizePdfA } from '../pdfa-pipeline';

const pdf = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('finalizePdfA (no binary present)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns converted:false and the input unchanged, without throwing', async () => {
    const input = pdf('%PDF-1.7\n... ordinary pdf body ...');
    const res = await finalizePdfA(input);

    expect(res.converted).toBe(false);
    expect(res.pdfBytes).toEqual(input);
    expect(res.warnings.join(' ')).toMatch(/no-binary/);
  });

  it('does not throw on a non-PDF input', async () => {
    const res = await finalizePdfA(pdf('not a pdf'));
    expect(res.converted).toBe(false);
    expect(res.warnings.some((w) => /not a PDF/i.test(w))).toBe(true);
  });

  it('refuses to convert an encrypted PDF and returns it unchanged', async () => {
    const input = pdf('%PDF-1.6\n... /Encrypt 12 0 R ... trailer');
    const res = await finalizePdfA(input);
    expect(res.converted).toBe(false);
    expect(res.pdfBytes).toEqual(input);
    expect(res.warnings.some((w) => /encrypted/i.test(w))).toBe(true);
  });
});
