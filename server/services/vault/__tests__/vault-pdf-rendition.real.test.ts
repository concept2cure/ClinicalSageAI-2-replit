/**
 * The PDF rendition of a Vault version, through the real converter (P-107
 * item 3). vault-pdf-rendition.test.ts stubs the converter; this runs it.
 *
 * LibreOffice is what services/pdf-converter.ts runs. Where it is installed, a
 * real Word file becomes a real PDF with the words in it, bound to the Word
 * file's SHA-256, and a zip that is not a Word document is a failed
 * conversion. Where it is not, the two conversions are skipped and say so.
 * The missing-converter case runs everywhere: it points the converter at a
 * program that does not exist. So does the Word file with a web link in it,
 * as the docx package writes one: it is refused before any conversion.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Document, ExternalHyperlink, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const installed = spawnSync(process.env.LIBREOFFICE_BIN || 'libreoffice', ['--version'], { stdio: 'ignore' }).status === 0;

async function wordFile(): Promise<Buffer> {
  return Buffer.from(await Packer.toBuffer(new Document({
    sections: [{ children: [new Paragraph('Stability protocol SP-014'), new Paragraph('Storage condition 25C/60%RH, 36 months.')] }],
  })));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('a rendition through the real converter', () => {
  it.skipIf(!installed)('makes a PDF with the words of the Word file, bound to the Word file\'s SHA-256', async () => {
    const { makeVaultPdfRendition } = await import('../vault-pdf-rendition');
    const word = await wordFile();
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes: word, fileName: 'SP-014 protocol.docx', recordedHash: sha(word) });
    if (!made.ok) throw new Error(`no rendition was made: ${made.code}`);

    expect(made.sourceSha256).toBe(sha(word));
    expect(made.sha256).toBe(sha(made.pdf));
    expect(made.fileName).toBe('SP-014_protocol.docx.rendition.pdf');
    expect(made.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await PDFDocument.load(made.pdf)).getPageCount()).toBe(1);

    // pdf-parse v2's class, narrowed as services/ocr/extractDocumentText.ts narrows it.
    const mod = (await import('pdf-parse')) as unknown as { PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text?: string }> } };
    const text = (await new mod.PDFParse({ data: made.pdf }).getText()).text ?? '';
    expect(text).toContain('Stability protocol SP-014');
    expect(text).toContain('36 months');
  }, 180_000);

  it.skipIf(!installed)('says a zip that is not a Word document could not be converted, and returns no PDF', async () => {
    const { makeVaultPdfRendition } = await import('../vault-pdf-rendition');
    const zip = new JSZip();
    zip.file('readme.bin', Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xfe, 0xfd]));
    const notWord = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes: notWord, fileName: 'protocol.docx', recordedHash: sha(notWord) });
    expect(made).toMatchObject({ ok: false, status: 422, code: 'RENDITION_FAILED' });
    expect(made).not.toHaveProperty('pdf');
  }, 180_000);

  it('does not convert a Word file that holds a web link, and says so', async () => {
    const { makeVaultPdfRendition } = await import('../vault-pdf-rendition');
    const linking = Buffer.from(await Packer.toBuffer(new Document({
      sections: [{ children: [new Paragraph({ children: [
        new TextRun('See '), new ExternalHyperlink({ link: 'https://example.org/sp-014', children: [new TextRun('the method')] }),
      ] })] }],
    })));
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes: linking, fileName: 'SP-014 protocol.docx', recordedHash: sha(linking) });
    expect(made).toMatchObject({ ok: false, status: 409, code: 'RENDITION_LINKS_OUTSIDE_FILE' });
    expect(made).not.toHaveProperty('pdf');
  }, 60_000);

  it('says the converter is not installed when its program does not exist', async () => {
    vi.stubEnv('LIBREOFFICE_BIN', '/nonexistent/vault-rendition-test/libreoffice');
    vi.resetModules();
    const { makeVaultPdfRendition } = await import('../vault-pdf-rendition');
    const word = await wordFile();
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes: word, fileName: 'SP-014 protocol.docx', recordedHash: sha(word) });
    expect(made).toMatchObject({ ok: false, status: 503, code: 'RENDITION_CONVERTER_UNAVAILABLE' });
    expect(made).not.toHaveProperty('pdf');
  }, 60_000);
});
