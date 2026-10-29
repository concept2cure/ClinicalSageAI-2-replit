/**
 * SEC-17 (MR-08 Stage 3 step 2): every place the server inflates a ZIP that a
 * person supplied is bounded before it inflates. A crafted DOCX or package whose
 * entry expands about 1000:1 is refused with ARCHIVE_LIMITS_EXCEEDED, and an
 * ordinary one still reads.
 *
 * The cases match the refusal by its code, not by importing the helper, so they
 * fail on a tree that has no helper for the reason they exist: the bomb is read.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

const mammothRead = vi.hoisted(() => ({ calls: 0 }));
vi.mock('mammoth', async (importOriginal) => {
  const real = await importOriginal<typeof import('mammoth')>();
  const extractRawText: typeof real.extractRawText = (...args) => { mammothRead.calls += 1; return real.extractRawText(...args); };
  return { ...real, default: { ...real, extractRawText }, extractRawText };
});

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" '
  + 'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const documentXml = (body: string) => '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + `<w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p></w:body></w:document>`;

/** 8 MiB of one character compresses about 1000:1: the shape of a decompression bomb, in a few kilobytes. */
const BOMB_TEXT = 'a'.repeat(8 * 1024 * 1024);

async function docx(body: string): Promise<Buffer> {
  const z = new JSZip();
  z.file('[Content_Types].xml', CONTENT_TYPES);
  z.file('_rels/.rels', RELS);
  z.file('word/document.xml', documentXml(body));
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function ectdPackage(withBomb: boolean): Promise<Buffer> {
  const z = new JSZip();
  z.file('index.xml', '<?xml version="1.0"?><ectd:ectd xmlns:ectd="http://www.ich.org/ectd"></ectd:ectd>');
  z.file('m1/us/cover.pdf', '%PDF-1.4 cover');
  if (withBomb) z.file('m2/bomb.xml', `<?xml version="1.0"?><x>${BOMB_TEXT}</x>`);
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

let bombDocx: Buffer;
let plainDocx: Buffer;
let dir: string;
beforeAll(async () => {
  bombDocx = await docx(BOMB_TEXT);
  plainDocx = await docx('An ordinary protocol synopsis.');
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-limit-sites-'));
  expect(bombDocx.length).toBeLessThan(64 * 1024);
});
afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('an upload is bounded before it is scanned or read (assertUploadSafe)', () => {
  it('refuses a bomb DOCX with 422 ARCHIVE_LIMITS_EXCEEDED', async () => {
    const { assertUploadSafe } = await import('../../../middleware/uploadSafety');
    await expect(assertUploadSafe(bombDocx, DOCX, 'synopsis.docx')).rejects.toMatchObject({ status: 422, code: 'ARCHIVE_LIMITS_EXCEEDED' });
  });

  it('refuses a "Word container" whose directory cannot be read, rather than handing it on', async () => {
    const { assertUploadSafe } = await import('../../../middleware/uploadSafety');
    const junk = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 2)]);
    await expect(assertUploadSafe(junk, DOCX, 'synopsis.docx')).rejects.toMatchObject({ status: 422, code: 'ARCHIVE_LIMITS_EXCEEDED' });
  });

  it('admits an ordinary DOCX', async () => {
    const { assertUploadSafe } = await import('../../../middleware/uploadSafety');
    await expect(assertUploadSafe(plainDocx, DOCX, 'synopsis.docx')).resolves.toBeUndefined();
  });
});

describe('template extraction (extractTemplateFromFile)', () => {
  it('refuses a bomb DOCX before it inflates', async () => {
    const { extractTemplateFromFile } = await import('../../templates');
    await expect(extractTemplateFromFile(bombDocx, 'letterhead.docx', DOCX)).rejects.toMatchObject({ code: 'ARCHIVE_LIMITS_EXCEEDED' });
  });

  it('still reads an ordinary DOCX', async () => {
    const { extractTemplateFromFile } = await import('../../templates');
    const out = await extractTemplateFromFile(plainDocx, 'letterhead.docx', DOCX);
    expect(out.source.kind).toBe('docx');
  });
});

describe('document text extraction (extractDocumentText)', () => {
  it('reads no text from a bomb DOCX, and never hands it to the DOCX reader', async () => {
    const { extractDocumentText } = await import('../../ocr/extractDocumentText');
    mammothRead.calls = 0;
    const out = await extractDocumentText(bombDocx, DOCX, 'synopsis.docx');
    expect(out).toEqual({ text: '', method: 'none' });
    expect(mammothRead.calls).toBe(0);
  });

  it('still reads an ordinary DOCX', async () => {
    const { extractDocumentText } = await import('../../ocr/extractDocumentText');
    const out = await extractDocumentText(plainDocx, DOCX, 'synopsis.docx');
    expect(out.method).toBe('docx');
    expect(out.text).toMatch(/ordinary protocol synopsis/);
  });
});

describe('eCTD package validation (validateEctdPackage)', () => {
  it('refuses a caller-supplied bomb package', async () => {
    const { validateEctdPackage } = await import('../../submission-gateways/ectd-structural-validator');
    await expect(validateEctdPackage(await ectdPackage(true))).rejects.toMatchObject({ code: 'ARCHIVE_LIMITS_EXCEEDED' });
  });

  it('still validates an ordinary package, and a package this server assembled is not bounded by an upload limit', async () => {
    const { validateEctdPackage } = await import('../../submission-gateways/ectd-structural-validator');
    expect((await validateEctdPackage(await ectdPackage(false))).errors).not.toContainEqual(expect.stringMatching(/expands|limit/i));
    await expect(validateEctdPackage(await ectdPackage(true), { origin: 'platform-generated' })).resolves.toMatchObject({ valid: expect.any(Boolean) });
  });
});

describe('legacy import detection (detectArchive)', () => {
  it('reports a bomb archive as refused, reading none of its files', async () => {
    const { detectArchive } = await import('../../legacy-importer/detector');
    const file = path.join(dir, 'prior-sequence.zip');
    await fs.writeFile(file, await ectdPackage(true));
    const out = await detectArchive(file);
    expect(out.files).toEqual([]);
    expect(out.findings).toEqual([expect.objectContaining({ severity: 'error', code: 'archive_limits_exceeded' })]);
  });
});
