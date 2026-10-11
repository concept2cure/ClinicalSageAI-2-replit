/**
 * File-signature verification contract.
 *
 * Pre-fix, chat/upload (and academic-resource-upload) relied on
 * `file.mimetype` from multer — a client-controlled header value.
 * verifyFileSignature inspects the actual bytes and rejects an
 * upload whose content doesn't match its declared MIME type. These
 * tests pin that contract: a future widening of the allowlist or a
 * regression in the magic-byte check will fail a test here.
 */

import { describe, expect, it } from 'vitest';
import { verifyDeclaredTypeForName, verifyFileSignature } from '../fileSignature';

// Build a buffer that starts with `prefix` and pads to at least
// minLen bytes. The pad isn't strictly needed for magic-number checks
// but mirrors how a real file would have content following the magic.
function makeBuf(prefix: Buffer | number[] | string, minLen = 16): Buffer {
  const head = Buffer.isBuffer(prefix)
    ? prefix
    : typeof prefix === 'string'
      ? Buffer.from(prefix)
      : Buffer.from(prefix);
  if (head.length >= minLen) return head;
  return Buffer.concat([head, Buffer.alloc(minLen - head.length)]);
}

describe('verifyFileSignature — PDF', () => {
  it('accepts a buffer starting with %PDF', () => {
    expect(verifyFileSignature(makeBuf('%PDF-1.4\n'), 'application/pdf').ok).toBe(true);
  });

  it('rejects a buffer that declares pdf but starts with PNG bytes', () => {
    const res = verifyFileSignature(
      makeBuf([0x89, 0x50, 0x4e, 0x47]),
      'application/pdf',
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/PDF/);
  });

  it('rejects an executable masquerading as pdf', () => {
    // ELF header
    expect(verifyFileSignature(makeBuf([0x7f, 0x45, 0x4c, 0x46]), 'application/pdf').ok).toBe(false);
    // PE / Windows executable
    expect(verifyFileSignature(makeBuf('MZ'), 'application/pdf').ok).toBe(false);
  });
});

describe('verifyFileSignature — PNG / JPEG / GIF', () => {
  it('accepts a real PNG', () => {
    const png = makeBuf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(verifyFileSignature(png, 'image/png').ok).toBe(true);
  });

  it('rejects a JPEG-marked buffer that is actually PDF bytes', () => {
    expect(verifyFileSignature(makeBuf('%PDF'), 'image/jpeg').ok).toBe(false);
  });

  it('accepts real JPEG (ff d8 ff)', () => {
    expect(verifyFileSignature(makeBuf([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg').ok).toBe(true);
  });

  it('accepts both GIF87a and GIF89a', () => {
    expect(verifyFileSignature(makeBuf('GIF87a'), 'image/gif').ok).toBe(true);
    expect(verifyFileSignature(makeBuf('GIF89a'), 'image/gif').ok).toBe(true);
  });
});

describe('verifyFileSignature — ZIP-based (.docx, .xlsx, .pptx, .epub)', () => {
  const zipMagic = [0x50, 0x4b, 0x03, 0x04];

  it('accepts a docx-declared buffer that starts with PK', () => {
    const res = verifyFileSignature(
      makeBuf(zipMagic),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.ok).toBe(true);
  });

  it('rejects a docx-declared buffer that does not start with PK', () => {
    const res = verifyFileSignature(
      makeBuf('%PDF'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/ZIP/);
  });

  it('accepts .xlsx and .pptx (same container)', () => {
    expect(
      verifyFileSignature(
        makeBuf(zipMagic),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ).ok,
    ).toBe(true);
    expect(
      verifyFileSignature(
        makeBuf(zipMagic),
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ).ok,
    ).toBe(true);
  });

  it('accepts plain application/zip', () => {
    expect(verifyFileSignature(makeBuf(zipMagic), 'application/zip').ok).toBe(true);
  });
});

describe('verifyFileSignature — text-shaped formats', () => {
  it('accepts plain ASCII text/plain', () => {
    expect(verifyFileSignature(Buffer.from('Hello, world.\n'), 'text/plain').ok).toBe(true);
  });

  it('accepts CSV', () => {
    expect(
      verifyFileSignature(Buffer.from('a,b,c\n1,2,3\n'), 'text/csv').ok,
    ).toBe(true);
  });

  it('accepts JSON', () => {
    expect(verifyFileSignature(Buffer.from('{"a":1}'), 'application/json').ok).toBe(true);
  });

  it('rejects binary content declared as text/plain', () => {
    // High concentration of non-printable bytes
    const binary = Buffer.from([0x00, 0xff, 0x00, 0xff, 0xfe, 0x01, 0x02, 0x03]);
    expect(verifyFileSignature(binary, 'text/plain').ok).toBe(false);
  });

  it('rejects a buffer with embedded null bytes (classic binary tell)', () => {
    const mixed = Buffer.concat([Buffer.from('Some text\0'), Buffer.alloc(100)]);
    expect(verifyFileSignature(mixed, 'text/plain').ok).toBe(false);
  });
});

describe('verifyFileSignature — legacy Office (.doc, .xls)', () => {
  const oleMagic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

  it('accepts OLE compound for application/msword', () => {
    expect(verifyFileSignature(makeBuf(oleMagic), 'application/msword').ok).toBe(true);
  });

  it('rejects a .doc-declared buffer that is actually a ZIP (real-world bug case)', () => {
    // Modern .docx mis-declared as legacy .doc — would fail conversion
    // downstream; we want to fail at the boundary.
    expect(
      verifyFileSignature(makeBuf([0x50, 0x4b, 0x03, 0x04]), 'application/msword').ok,
    ).toBe(false);
  });
});

describe('verifyFileSignature — edge cases', () => {
  it('rejects an empty buffer', () => {
    expect(verifyFileSignature(Buffer.alloc(0), 'application/pdf')).toEqual({
      ok: false,
      reason: 'empty buffer',
    });
  });

  it('rejects unknown / unhandled MIME types', () => {
    // application/x-executable, application/octet-stream — anything that
    // isn't on the safelist should bounce.
    expect(verifyFileSignature(makeBuf('hello'), 'application/x-executable').ok).toBe(false);
    expect(verifyFileSignature(makeBuf('hello'), 'application/octet-stream').ok).toBe(false);
  });

  it('rejects a buffer too short to contain the magic', () => {
    // PDF magic is 4 bytes; a 2-byte buffer can't possibly match.
    expect(verifyFileSignature(Buffer.from('%P'), 'application/pdf').ok).toBe(false);
  });
});

/**
 * The name binds the type (periodic review 2026-09-28, editor family, SEC-A-3).
 *
 * verifyFileSignature checks the bytes against the DECLARED type, and the
 * uploader writes the declared type. `report.pdf` declared `text/html` with
 * HTML bytes passed it — text-shaped bytes for a text type — so the vault
 * stored text/html under a .pdf name and the editor's viewer framed it.
 * verifyDeclaredTypeForName ties the declared type, and the bytes, to what the
 * file's extension says.
 */
describe('verifyDeclaredTypeForName — the extension binds the declared type and the bytes', () => {
  it.each(['json', 'xml', 'tsv'])('refuses a .%s name carrying a different declared binary type', (extension) => {
    const pdf = Buffer.from('%PDF-1.4\n');
    expect(verifyFileSignature(pdf, 'application/pdf').ok).toBe(true);
    expect(verifyDeclaredTypeForName(pdf, `data.${extension}`, 'application/pdf').ok).toBe(false);
  });

  it.each([
    ['data.json', 'application/json', '{"subject":"001"}'],
    ['data.xml', 'application/xml', '<Study id="S1" />'],
    ['data.xml', 'text/xml', '<Study id="S1" />'],
    ['data.tsv', 'text/tab-separated-values', 'subject\tvalue\n001\t0'],
    ['data.json', 'text/plain', '{"subject":"001"}'],
  ])('verifies the existing byte-shape check for %s / %s', (name, mime, source) => {
    const bytes = Buffer.from(source);
    expect(verifyFileSignature(bytes, mime).ok).toBe(true);
    expect(verifyDeclaredTypeForName(bytes, name, mime).ok).toBe(true);
    expect(verifyDeclaredTypeForName(Buffer.from([0, 1, 2]), name, mime).ok).toBe(false);
  });

  const HTML = Buffer.from('<!doctype html><script>alert(document.domain)</script>');
  const PDF = makeBuf('%PDF-1.7\n', 32);

  it('the SEC-A-3 upload passes the declared-type check on its own — the gap this closes', () => {
    expect(verifyFileSignature(HTML, 'text/html').ok).toBe(true);
  });

  it('refuses a .pdf declared text/html, naming the type a .pdf must be declared as', () => {
    const res = verifyDeclaredTypeForName(HTML, 'report.pdf', 'text/html');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/a \.pdf file must be declared as application\/pdf/);
    // The ingest route's extension allowlist lower-cases, so REPORT.PDF gets this far too.
    expect(verifyDeclaredTypeForName(HTML, 'REPORT.PDF', 'text/html').ok).toBe(false);
  });

  it('refuses a .pdf whose bytes are not a PDF, whatever was declared', () => {
    const res = verifyDeclaredTypeForName(HTML, 'report.pdf', 'application/pdf');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not a \.pdf file.*%PDF/);
  });

  it('accepts a real PDF, whatever the case of its extension', () => {
    expect(verifyDeclaredTypeForName(PDF, 'report.pdf', 'application/pdf').ok).toBe(true);
    expect(verifyDeclaredTypeForName(PDF, 'REPORT.PDF', 'application/pdf').ok).toBe(true);
  });

  it('binds rather than blacklists: text/html is refused for .txt and .md, and left alone for .html', () => {
    expect(verifyDeclaredTypeForName(HTML, 'notes.txt', 'text/html').ok).toBe(false);
    expect(verifyDeclaredTypeForName(HTML, 'notes.md', 'text/html').ok).toBe(false);
    expect(verifyDeclaredTypeForName(HTML, 'page.html', 'text/html').ok).toBe(true);
  });

  it('accepts the types a text file is actually sent as, parameters and case aside', () => {
    const csv = Buffer.from('a,b\n1,2\n');
    expect(verifyDeclaredTypeForName(csv, 'data.csv', 'text/csv').ok).toBe(true);
    // A multipart part with no Content-Type reaches multer as text/plain.
    expect(verifyDeclaredTypeForName(csv, 'data.csv', 'text/plain').ok).toBe(true);
    expect(verifyDeclaredTypeForName(Buffer.from('# Title\n'), 'notes.md', 'text/markdown').ok).toBe(true);
    expect(verifyDeclaredTypeForName(Buffer.from('hello\n'), 'notes.txt', 'Text/Plain; charset=utf-8').ok).toBe(true);
  });

  it('refuses one Office format declared as another', () => {
    const zip = makeBuf([0x50, 0x4b, 0x03, 0x04]);
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    expect(verifyDeclaredTypeForName(zip, 'tables.xlsx', docx).ok).toBe(false);
    expect(verifyDeclaredTypeForName(zip, 'tables.xlsx', xlsx).ok).toBe(true);
  });

  it('leaves a name it does not bind to the caller’s own allowlist', () => {
    expect(verifyDeclaredTypeForName(HTML, 'no-extension', 'text/html').ok).toBe(true);
  });
});
