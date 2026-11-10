/**
 * P-107 item 3, renditions: "each version gets a PDF rendition through the existing converter (pdf-converter.ts),
 * bound to the source version's SHA-256 and shown in the viewer. A rendition is never filed in place of its source."
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const convertDocxToPdf = vi.hoisted(() => vi.fn());
vi.mock('../../pdf-converter.js', async (original) => ({
  ...await original<typeof import('../../pdf-converter.js')>(),
  convertDocxToPdf,
}));

import { renderVaultRendition, renditionFileName } from '../vault-rendition';

const DOCX = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.from('word/document.xml')]);
const PDF = Buffer.from('%PDF-1.7\nrendered');
const HASH = 'a'.repeat(64);
const source = (over: Record<string, unknown> = {}) => ({
  bytes: DOCX, fileName: 'protocol.docx', mimeType: null, contentHash: HASH, ...over,
});

beforeEach(() => {
  convertDocxToPdf.mockReset();
  convertDocxToPdf.mockResolvedValue({ pdf: PDF, sha256: 'b'.repeat(64), backend: 'libreoffice', originalBytes: PDF.length });
});

describe('a PDF rendition of a Vault version', () => {
  it('renders a Word source through the one converter and binds it to the source hash', async () => {
    const r = await renderVaultRendition(source());
    expect(r).toEqual({ ok: true, pdf: PDF, sha256: 'b'.repeat(64), sourceSha256: HASH });
    expect(convertDocxToPdf).toHaveBeenCalledTimes(1);
    expect(convertDocxToPdf.mock.calls[0][0]).toBe(DOCX);
    // LibreOffice only: the HTML fallback would render something other than the source.
    expect(convertDocxToPdf.mock.calls[0][1]).toMatchObject({ backend: 'libreoffice' });
  });

  it('a source that is already a PDF has no rendition: it is viewed as itself', async () => {
    const r = await renderVaultRendition(source({ bytes: PDF, fileName: 'report.pdf' }));
    expect(r).toMatchObject({ ok: false, status: 409, code: 'SOURCE_IS_PDF' });
    expect(convertDocxToPdf).not.toHaveBeenCalled();
  });

  it('refuses a format the converter does not read, by its bytes and not by its name', async () => {
    expect(await renderVaultRendition(source({ bytes: Buffer.from('STUDYID,USUBJID'), fileName: 'adsl.csv' })))
      .toMatchObject({ ok: false, status: 422, code: 'NO_RENDITION_FOR_FORMAT' });
    // Named .docx, but not a Word container.
    expect(await renderVaultRendition(source({ bytes: Buffer.from('plain text') })))
      .toMatchObject({ ok: false, status: 422, code: 'NO_RENDITION_FOR_FORMAT' });
    // A zip that is not named or typed as Word (an .xlsx, a .zip) is not sent to the Word converter.
    expect(await renderVaultRendition(source({ fileName: 'data.xlsx' })))
      .toMatchObject({ ok: false, status: 422, code: 'NO_RENDITION_FOR_FORMAT' });
    expect(convertDocxToPdf).not.toHaveBeenCalled();
  });

  it('refuses a source with no recorded hash: a rendition bound to nothing is not one', async () => {
    expect(await renderVaultRendition(source({ contentHash: null })))
      .toMatchObject({ ok: false, status: 409, code: 'SOURCE_HASH_NOT_RECORDED' });
    expect(convertDocxToPdf).not.toHaveBeenCalled();
  });

  it('says the converter failed, and never returns something that is not a PDF', async () => {
    convertDocxToPdf.mockRejectedValueOnce(new Error('soffice exited 1: /tmp/secret/path'));
    const failed = await renderVaultRendition(source());
    expect(failed).toMatchObject({ ok: false, status: 503, code: 'RENDITION_UNAVAILABLE' });
    expect(JSON.stringify(failed)).not.toContain('/tmp/secret');
    convertDocxToPdf.mockResolvedValueOnce({ pdf: Buffer.from('<html>'), sha256: 'c'.repeat(64), backend: 'libreoffice', originalBytes: 6 });
    expect(await renderVaultRendition(source())).toMatchObject({ ok: false, status: 503, code: 'RENDITION_UNAVAILABLE' });
  });

  it('names the rendition for what it is, never as the source file', () => {
    expect(renditionFileName('Protocol v2.docx')).toBe('Protocol_v2.rendition.pdf');
    expect(renditionFileName(null)).toBe('document.rendition.pdf');
  });
});
