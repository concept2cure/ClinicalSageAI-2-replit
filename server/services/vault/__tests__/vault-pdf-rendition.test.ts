/**
 * The PDF rendition of one Vault version (P-107 item 3;
 * services/vault/vault-pdf-rendition.ts), with the converter stubbed.
 *
 * A rendition is a PDF made from a version's bytes, for reading. It is a copy,
 * never the record. What this pins:
 *   - it is bound to the source's SHA-256: made only from bytes that hash to
 *     the recorded value, and it names that hash and its own;
 *   - a PDF source needs none and gets none;
 *   - a file the converter does not convert, a converter that is not
 *     installed, and a conversion that failed are each said as that, and none
 *     is answered with an empty or broken PDF;
 *   - a busy converter stays the converter's own refusal;
 *   - a Word file that names content outside itself is not handed to the
 *     converter, however the naming is written (LibreOffice requests what a
 *     file links to; measured in the evidence README);
 *   - the module keeps nothing: it reaches no store and no database, and only
 *     the Vault download reaches it.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const h = vi.hoisted(() => ({ convert: vi.fn() }));
vi.mock('../../pdf-converter', async (original) => ({
  ...(await original<typeof import('../../pdf-converter')>()),
  convertDocxToPdf: h.convert,
}));

import { ConversionCapacityError } from '../../conversion-slots';
import { makeVaultPdfRendition } from '../vault-pdf-rendition';
import { externalRelationship, relationshipPart, wordPackage, wordPackageWithTwoEntriesOfOneName } from './_word-package-fixture';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const WORD = await wordPackage();
const WORKBOOK = Buffer.concat([ZIP, Buffer.from(' the bytes of a workbook')]);
const PDF = Buffer.from('%PDF-1.7\n% the rendition the converter made\n%%EOF\n');
const SOURCE_PDF = Buffer.from('%PDF-1.4\n% a version that is already a PDF\n%%EOF\n');

const word = (over: Record<string, unknown> = {}) => ({
  format: 'pdf', bytes: WORD, fileName: 'Protocol v3.docx', recordedHash: sha(WORD), ...over,
});

beforeEach(() => {
  h.convert.mockReset();
  h.convert.mockImplementation(async () => ({ pdf: PDF, sha256: sha(PDF), backend: 'libreoffice', originalBytes: PDF.length }));
});

describe('a rendition is bound to its source', () => {
  it('is made from the source bytes, and names the source SHA-256 and its own', async () => {
    const made = await makeVaultPdfRendition(word());
    expect(made).toEqual({
      ok: true, pdf: PDF, sha256: sha(PDF), sourceSha256: sha(WORD), fileName: 'Protocol_v3.docx.rendition.pdf',
    });
    expect(h.convert).toHaveBeenCalledTimes(1);
    expect(h.convert.mock.calls[0][0].equals(WORD)).toBe(true);
    // The Word bytes are the only input there is: no HTML stands in for them.
    expect(h.convert.mock.calls[0][1]).toEqual({ backend: 'libreoffice' });
  });

  it('is not made from bytes that do not hash to the recorded SHA-256', async () => {
    const made = await makeVaultPdfRendition(word({ recordedHash: 'f'.repeat(64) }));
    expect(made).toMatchObject({ ok: false, status: 409, code: 'CONTENT_HASH_MISMATCH' });
    expect(h.convert).not.toHaveBeenCalled();
  });

  it('is not made for a version with no recorded SHA-256 to bind it to', async () => {
    const made = await makeVaultPdfRendition(word({ recordedHash: null }));
    expect(made).toMatchObject({ ok: false, status: 409, code: 'RENDITION_SOURCE_UNBOUND' });
    expect(h.convert).not.toHaveBeenCalled();
  });

  it('hashes the PDF it returns itself, whatever hash the converter reported', async () => {
    h.convert.mockResolvedValue({ pdf: PDF, sha256: '0'.repeat(64), backend: 'libreoffice', originalBytes: PDF.length });
    const made = await makeVaultPdfRendition(word());
    expect(made).toMatchObject({ ok: true, sha256: sha(PDF) });
  });
});

describe('what gets no rendition', () => {
  it('a PDF source needs none and gets none', async () => {
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes: SOURCE_PDF, fileName: 'CSR-201.pdf', recordedHash: sha(SOURCE_PDF) });
    expect(made).toMatchObject({ ok: false, status: 409, code: 'RENDITION_NOT_NEEDED' });
    expect(h.convert).not.toHaveBeenCalled();
  });

  it('a PDF saved under a Word name is still a PDF, and gets none', async () => {
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes: SOURCE_PDF, fileName: 'CSR-201.docx', recordedHash: sha(SOURCE_PDF) });
    expect(made).toMatchObject({ ok: false, code: 'RENDITION_NOT_NEEDED' });
    expect(h.convert).not.toHaveBeenCalled();
  });

  it.each([
    ['a workbook', WORKBOOK, 'Stability data.xlsx'],
    ['a text file', Buffer.from('plain words'), 'notes.txt'],
    ['a legacy .doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'old protocol.doc'],
    ['HTML saved under a Word name', Buffer.from('<!doctype html><script>1</script>'), 'protocol.docx'],
    ['a file with no name', WORD, null],
  ])('%s is said to be a file the converter does not convert', async (_what, bytes, fileName) => {
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes, fileName, recordedHash: sha(bytes) });
    expect(made).toMatchObject({ ok: false, status: 409, code: 'RENDITION_NOT_SUPPORTED' });
    expect((made as { message: string }).message).toMatch(/Word document \(\.docx\)/);
    expect(h.convert).not.toHaveBeenCalled();
  });

  it.each(['docx', 'html', '', ['pdf', 'pdf'], undefined])('a rendition asked for as %j is refused: a rendition is a PDF', async (format) => {
    const made = await makeVaultPdfRendition(word({ format }));
    expect(made).toMatchObject({ ok: false, status: 400, code: 'RENDITION_FORMAT_UNSUPPORTED' });
    expect(h.convert).not.toHaveBeenCalled();
  });
});

describe('a Word file that names content outside itself is not handed to the converter', () => {
  const LINKED_IMAGE = relationshipPart(externalRelationship('image', 'http://169.254.169.254/latest/meta-data/x.png'));
  const cases: Array<[string, () => Promise<Buffer>]> = [
    ['a linked image', () => wordPackage(LINKED_IMAGE)],
    // The converter requests a linked image whatever type its relationship declares, so the type is not trusted.
    ['a linked image typed as a hyperlink', () => wordPackage(relationshipPart(externalRelationship('hyperlink', 'http://10.0.0.7/x.png')))],
    ['a hyperlink', () => wordPackage(relationshipPart(externalRelationship('hyperlink', 'https://example.org/')))],
    ['a target mode written with a character reference', () => wordPackage(relationshipPart(externalRelationship('image', 'http://10.0.0.7/x.png', 'TargetMode="Ex&#116;ernal"')))],
    ['a target mode in single quotes', () => wordPackage(relationshipPart(externalRelationship('image', 'http://10.0.0.7/x.png', "TargetMode='External'")))],
    ['a file on the server as the target', () => wordPackage(relationshipPart(externalRelationship('image', 'file:///etc/hostname')))],
    ['a relationship part in UTF-16', () => wordPackage(Buffer.from(`\ufeff${LINKED_IMAGE}`, 'utf16le'))],
    ['a relationship part in UTF-16 with no byte order mark', () => wordPackage(Buffer.from(LINKED_IMAGE, 'utf16le'))],
    ['a relationship part declared in another encoding', () => wordPackage(relationshipPart().replace('encoding="UTF-8"', 'encoding="IBM037"'))],
    ['a relationship part with a DOCTYPE', () => wordPackage(relationshipPart().replace('<Relationships', '<!DOCTYPE Relationships [<!ENTITY mode "External">]><Relationships'))],
    ['a relationship part that is not XML', () => wordPackage('Relationships: none')],
    ["a header's relationship part", () => wordPackage(relationshipPart(), { 'word/_rels/header1.xml.rels': LINKED_IMAGE })],
    ['a relationship part under an upper-case name', () => wordPackage(relationshipPart(), { 'word/_rels/footer1.xml.RELS': LINKED_IMAGE })],
  ];

  it.each(cases)('%s', async (_what, build) => {
    const bytes = await build();
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes, fileName: 'protocol.docx', recordedHash: sha(bytes) });
    expect(made).toMatchObject({ ok: false, status: 409, code: 'RENDITION_LINKS_OUTSIDE_FILE' });
    expect((made as { message: string }).message).toMatch(/links to content outside the file/);
    expect((made as { message: string }).message).toMatch(/can still be downloaded/);
    expect(h.convert).not.toHaveBeenCalled();
  });

  it('a Word file whose relationships are all inside it is converted, an explicit Internal included', async () => {
    const bytes = await wordPackage(relationshipPart('<Relationship Id="rId2" Type="x/styles" Target="styles.xml" TargetMode="Internal"/>'));
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes, fileName: 'protocol.docx', recordedHash: sha(bytes) });
    expect(made).toMatchObject({ ok: true, sourceSha256: sha(bytes) });
    expect(h.convert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['is not an archive that can be opened', async () => Buffer.concat([ZIP, Buffer.from(' not a zip after its first four bytes')])],
    // 8 MiB of one character compresses about 1000:1; the archive limits refuse it before anything inflates it.
    ['expands a thousand-fold', async () => {
      const zip = await JSZip.loadAsync(await wordPackage());
      zip.file('word/media/image1.bin', 'a'.repeat(8 * 1024 * 1024));
      return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    }],
    // The one that links outside comes first; a reader that keeps the last of two would see only the clean one.
    ['holds two entries of one name, one that links outside and a clean one', () => wordPackageWithTwoEntriesOfOneName(LINKED_IMAGE, relationshipPart())],
  ])('a Word file that %s is not converted, and is said to be unchecked', async (_what, build) => {
    const bytes = await build();
    const made = await makeVaultPdfRendition({ format: 'pdf', bytes, fileName: 'protocol.docx', recordedHash: sha(bytes) });
    expect(made).toMatchObject({ ok: false, status: 409 });
    expect(['RENDITION_NOT_SUPPORTED', 'RENDITION_LINKS_OUTSIDE_FILE']).toContain((made as { code: string }).code);
    expect(h.convert).not.toHaveBeenCalled();
  });
});

describe('a converter that cannot make it says so', () => {
  it('a converter that is not installed is said as that', async () => {
    h.convert.mockRejectedValue(Object.assign(new Error('spawn libreoffice ENOENT'), { code: 'ENOENT', syscall: 'spawn libreoffice' }));
    const made = await makeVaultPdfRendition(word());
    expect(made).toMatchObject({ ok: false, status: 503, code: 'RENDITION_CONVERTER_UNAVAILABLE' });
    expect((made as { message: string }).message).toMatch(/no document converter installed/);
    expect((made as { message: string }).message).toMatch(/can still be downloaded/);
  });

  it('a conversion that failed is said as that, with nothing of the converter in the words', async () => {
    h.convert.mockRejectedValue(new Error('LibreOffice exited with code 1. stderr tail: /tmp/pdf-conv-abc/in-1.docx'));
    const made = await makeVaultPdfRendition(word());
    expect(made).toMatchObject({ ok: false, status: 422, code: 'RENDITION_FAILED' });
    expect((made as { message: string }).message).not.toMatch(/tmp|LibreOffice|stderr/);
    expect((made as { message: string }).message).toMatch(/can still be downloaded/);
  });

  it('a converter that ran and left no output is a failed conversion, not a missing converter', async () => {
    h.convert.mockRejectedValue(Object.assign(new Error("ENOENT: no such file or directory, open '/tmp/pdf-conv-abc/in-1.pdf'"), { code: 'ENOENT', syscall: 'open' }));
    const made = await makeVaultPdfRendition(word());
    expect(made).toMatchObject({ ok: false, status: 422, code: 'RENDITION_FAILED' });
  });

  it.each([
    ['no bytes', Buffer.alloc(0)],
    ['bytes that are not a PDF', Buffer.from('<html>conversion error</html>')],
  ])('a converter that returned %s is a failed conversion, never a rendition', async (_what, pdf) => {
    h.convert.mockResolvedValue({ pdf, sha256: sha(pdf), backend: 'libreoffice', originalBytes: pdf.length });
    const made = await makeVaultPdfRendition(word());
    expect(made).toMatchObject({ ok: false, status: 422, code: 'RENDITION_FAILED' });
    expect(made).not.toHaveProperty('pdf');
  });

  it('a busy converter stays the converter\'s own refusal, for the one mapping that answers it', async () => {
    h.convert.mockRejectedValue(new ConversionCapacityError('libreoffice', 120_000, 2));
    await expect(makeVaultPdfRendition(word())).rejects.toBeInstanceOf(ConversionCapacityError);
  });
});

describe('a rendition is kept nowhere and stands in for nothing', () => {
  const SERVER = path.resolve(__dirname, '../../..');
  const MODULE = path.join(SERVER, 'services/vault/vault-pdf-rendition.ts');

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(full);
      return /\.ts$/.test(name) && !/\.(test|spec|dbtest)\.ts$/.test(name) ? [full] : [];
    });
  }

  it('the module reaches no object store and no database', () => {
    const imports = [...readFileSync(MODULE, 'utf8').matchAll(/from\s+'([^']+)'|import\(\s*'([^']+)'\s*\)/g)].map((m) => m[1] ?? m[2]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((from) => /storage|\/db(\.js)?$|\/db\/|drizzle|^pg$/.test(from))).toEqual([]);
  });

  it('only the Vault download reaches it: placement, seals, archives and exports do not', () => {
    const reaching = sources(SERVER)
      .filter((file) => file !== MODULE && /vault-pdf-rendition/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SERVER, file));
    expect(reaching).toEqual([path.join('routes', 'c2c', 'project-vault.ts')]);
  });
});
