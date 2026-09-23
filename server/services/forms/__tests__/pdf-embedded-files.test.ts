/**
 * Building an attachment's objects for an ENCRYPTED PDF.
 *
 * The FDA eSTAR templates are permission-encrypted (V4 / R4 / AESV2, empty user
 * password). In such a document every stream AND every string inside an object
 * is enciphered under that object's own key. A builder that got this wrong
 * would not fail: the file would open, and the attachment would be noise. That
 * is exactly what the slice-1 probe observed — pypdf answering
 * "Ignoring padding error: Invalid padding bytes" over a stream deliberately
 * written in plaintext
 * (docs/reports/wo8-estar-attachments-2026-09-07.md §3).
 *
 * So the round trip is the test: build the objects, then decrypt them back with
 * the module's own reader and compare against what went in.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { createHash } from 'crypto';

import { buildEmbeddedFileObjects, EMBEDDED_FILE_OBJECT_COUNT } from '../pdf-embedded-files';
import {
  decryptObjectData,
  nextFreeObjectNumber,
  readPdfSecurity,
} from '../fill-official-pdf';

const TEMPLATE = path.resolve(
  process.env.ESTAR_TEMPLATE_DIR ?? 'assets/estar-templates',
  'eSTAR-510k-non-ivd.pdf',
);
const HAVE_TEMPLATE = fsSync.existsSync(TEMPLATE);

/** Read a hex PDF string `<..>` out of a dictionary. */
function hexString(dict: string, key: string): Buffer {
  const m = new RegExp(`${key}\\s*<([0-9A-Fa-f]*)>`).exec(dict);
  if (!m) throw new Error(`No hex string for ${key} in ${dict}`);
  return Buffer.from(m[1], 'hex');
}

describe.skipIf(!HAVE_TEMPLATE)('buildEmbeddedFileObjects (real encrypted eSTAR template)', () => {
  let template: Buffer;
  let sec: ReturnType<typeof readPdfSecurity>;
  let first: number;

  beforeAll(async () => {
    template = Buffer.from(await fs.readFile(TEMPLATE));
    sec = readPdfSecurity(template);
    first = nextFreeObjectNumber(template);
  });

  const payload = Buffer.from('%PDF-1.4\n% the section this attachment carries\n');

  it('confirms the template really is encrypted — otherwise this proves nothing', () => {
    expect(sec.encrypted).toBe(true);
    expect(sec.aes).toBe(true);
  });

  it('encrypts the stream, and the module reads exactly the bytes back', () => {
    const built = buildEmbeddedFileObjects(sec, first, {
      name: 'Section-5-Software.pdf',
      bytes: payload,
      mimeType: 'application/pdf',
    });

    expect(built.objects).toHaveLength(EMBEDDED_FILE_OBJECT_COUNT);
    const stream = built.objects[0];
    expect(stream.num).toBe(first);
    /* Enciphered — the plaintext must not be sitting in the file. */
    expect(stream.data!.equals(payload)).toBe(false);
    expect(stream.data!.includes(Buffer.from('the section this attachment'))).toBe(false);
    expect(decryptObjectData(sec, stream.num, stream.gen, stream.data!).equals(payload)).toBe(true);
  });

  it('declares the plaintext size and checksum, not the ciphertext', () => {
    const built = buildEmbeddedFileObjects(sec, first, {
      name: 'a.pdf',
      bytes: payload,
      mimeType: 'application/pdf',
    });
    const dict = built.objects[0].dict;
    /* /Length is the bytes actually written (ciphertext); /Params /Size is the
       file's real size, which is what a viewer reports. */
    expect(Number(/\/Length\s+(\d+)/.exec(dict)![1])).toBe(built.objects[0].data!.length);
    expect(dict).toContain(`/Size ${payload.length}`);
    const checksum = decryptObjectData(sec, built.objects[0].num, 0, hexString(dict, '/CheckSum'));
    expect(checksum.toString('hex')).toBe(createHash('md5').update(payload).digest('hex'));
  });

  it('encrypts the file NAME too — a readable name in a ciphered file is a bug', () => {
    const built = buildEmbeddedFileObjects(sec, first, {
      name: 'Section-5-Software.pdf',
      bytes: payload,
      mimeType: 'application/pdf',
    });
    const spec = built.objects[1];
    expect(spec.num).toBe(built.filespecNum);
    expect(spec.data).toBeUndefined();
    expect(spec.dict).not.toContain('Section-5-Software.pdf');

    const f = decryptObjectData(sec, spec.num, spec.gen, hexString(spec.dict, '/F'));
    expect(f.toString('latin1')).toBe('Section-5-Software.pdf');
    /* /UF is UTF-16BE with a byte-order mark, per PDF 32000-1 7.11.3. */
    const uf = decryptObjectData(sec, spec.num, spec.gen, hexString(spec.dict, '/UF'));
    expect(uf.subarray(0, 2).toString('hex')).toBe('feff');
    /* Copy before swapping: swap16 mutates the buffer in place. */
    expect(Buffer.from(uf.subarray(2)).swap16().toString('utf16le')).toBe('Section-5-Software.pdf');
  });

  it('points the /Filespec at the stream it just built', () => {
    const built = buildEmbeddedFileObjects(sec, first, { name: 'a.pdf', bytes: payload });
    expect(built.objects[1].dict).toContain(`/EF<</F ${first} 0 R>>`);
    expect(built.filespecNum).toBe(first + 1);
    expect(built.sha256).toBe(createHash('sha256').update(payload).digest('hex'));
  });

  it('carries the attachment description, enciphered like every other string', () => {
    /* FDA's own handler sets one on every attach:
         d[AttachmentIndex].description = "Administrative Documentation | Cover Letter";
       and Acrobat's `dataObject.description` is the /Filespec's /Desc. That
       mapping is from the Acrobat JavaScript API, not measured here — nothing
       in this container runs Acrobat — so it is optional and stated rather than
       assumed. A wrong description is cosmetic; an absent one loses what FDA's
       own flow shows the applicant in the attachment pane. */
    const built = buildEmbeddedFileObjects(sec, first, {
      name: 'a.pdf',
      bytes: payload,
      mimeType: 'application/pdf',
      description: 'Administrative Documentation | Cover Letter',
    });
    const spec = built.objects[1];
    expect(spec.dict).not.toContain('Cover Letter');
    const desc = decryptObjectData(sec, spec.num, spec.gen, hexString(spec.dict, '/Desc'));
    expect(desc.toString('latin1')).toBe('Administrative Documentation | Cover Letter');
  });

  it('omits /Desc entirely when there is nothing to say', () => {
    const built = buildEmbeddedFileObjects(sec, first, { name: 'a.pdf', bytes: payload });
    expect(built.objects[1].dict).not.toContain('/Desc');
  });

  it('escapes a MIME type into a valid PDF name', () => {
    const built = buildEmbeddedFileObjects(sec, first, {
      name: 'a.pdf',
      bytes: payload,
      mimeType: 'application/pdf',
    });
    expect(built.objects[0].dict).toContain('/Subtype/application#2Fpdf');
  });

  it.each([
    ['an empty name', { name: '   ', bytes: Buffer.from('x') }],
    ['no bytes', { name: 'a.pdf', bytes: Buffer.alloc(0) }],
  ])('refuses %s rather than embedding it', (_label, spec) => {
    expect(() => buildEmbeddedFileObjects(sec, first, spec as any)).toThrow();
  });
});

describe('buildEmbeddedFileObjects (unencrypted document)', () => {
  it('leaves the bytes and the name in the clear', () => {
    const plain = { encrypted: false, key: Buffer.alloc(0), aes: false };
    const built = buildEmbeddedFileObjects(plain, 10, {
      name: 'a.txt',
      bytes: Buffer.from('hello'),
    });
    expect(built.objects[0].data!.toString()).toBe('hello');
    expect(hexString(built.objects[1].dict, '/F').toString('latin1')).toBe('a.txt');
  });
});
