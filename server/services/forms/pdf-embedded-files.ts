/**
 * Embedded-file objects for a PDF, built correctly for an ENCRYPTED document.
 *
 * The FDA eSTAR templates are permission-encrypted — V4 / R4 / AESV2 with an
 * empty user password — and in such a document every stream AND every string
 * inside an object is enciphered under that object's own key. Getting that
 * wrong does not fail: the file opens, and the attachment is noise. The
 * slice-1 probe watched it happen, pypdf answering "Ignoring padding error:
 * Invalid padding bytes" over a stream deliberately written in the clear
 * (docs/reports/wo8-estar-attachments-2026-09-07.md §3).
 *
 * So this module builds the pair — the `/EmbeddedFile` stream and the
 * `/Filespec` dictionary that names it — with the encipherment already applied,
 * and hands back objects `appendIncrementalUpdate` can write verbatim. It does
 * not touch the catalog: attaching the pair to `/Names /EmbeddedFiles` is a
 * separate concern, and a separate slice.
 *
 * Hex strings, not literals. A PDF literal string would need `\\(`, `\\)` and
 * `\\\\` escaping over ciphertext that is uniformly random; hex is the same
 * information with no escaping to get wrong.
 *
 * @module server/services/forms/pdf-embedded-files
 */

import { createHash } from 'node:crypto';

import {
  encryptObjectData,
  type PdfObjectWrite,
  type PdfSecurity,
} from './fill-official-pdf';

/** How many objects one attachment contributes: the stream and its /Filespec. */
export const EMBEDDED_FILE_OBJECT_COUNT = 2;

export interface EmbeddedFileSpec {
  /**
   * The FILE NAME — what `/F` and `/UF` carry, and Acrobat's
   * `dataObject.path`. Distinct from the `/EmbeddedFiles` name-tree key, which
   * `pdf-attach.EmbeddedFileEntry.nameTreeKey` supplies and which the eSTAR
   * requires to be date-shaped. The eSTAR's attachment manifest references
   * THIS string, not the key.
   */
  name: string;
  bytes: Buffer;
  /** The file's media type, e.g. 'application/pdf'. Omitted ⇒ no /Subtype. */
  mimeType?: string;
  /**
   * What the viewer shows beside the file in its attachment pane.
   *
   * The eSTAR sets one on every attach —
   * `d[AttachmentIndex].description = "Administrative Documentation | Cover Letter"`
   * — and Acrobat's `dataObject.description` is the `/Filespec`'s `/Desc`. That
   * mapping comes from the Acrobat JavaScript API and is NOT measured here;
   * nothing in this environment runs Acrobat. It is optional for that reason,
   * and stated rather than assumed. Omitted ⇒ no `/Desc` key at all, rather
   * than an empty string, which a viewer would render as a blank description.
   */
  description?: string;
}

export interface BuiltEmbeddedFile {
  /** In write order: the /EmbeddedFile stream, then its /Filespec. */
  objects: PdfObjectWrite[];
  /** Object number of the /Filespec — what a name tree points at. */
  filespecNum: number;
  /** sha256 of the PLAINTEXT bytes, for the manifest and the audit row. */
  sha256: string;
}

/** A PDF string, enciphered for `num`/`gen` when the document is encrypted. */
function pdfString(sec: PdfSecurity, num: number, gen: number, value: Buffer): string {
  return `<${encryptObjectData(sec, num, gen, value).toString('hex')}>`;
}

/**
 * A MIME type as a PDF name: every character outside the regular set becomes
 * `#` plus two hex digits (PDF 32000-1 7.3.5). `application/pdf` is the common
 * case and `/` is exactly such a character, so this is not an edge case.
 */
function pdfName(value: string): string {
  return value.replace(
    /[^A-Za-z0-9._-]/g,
    (c) => `#${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`,
  );
}

/** UTF-16BE with a byte-order mark — the /UF encoding (PDF 32000-1 7.11.3). */
function utf16be(value: string): Buffer {
  return Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(value, 'utf16le').swap16()]);
}

/**
 * Build the objects for one attachment, numbering from `firstFreeNum`.
 *
 * Two objects, in write order: the `/EmbeddedFile` stream at `firstFreeNum` and
 * the `/Filespec` at `firstFreeNum + 1`. The `/Filespec` names the stream by
 * reference, which is why the numbers have to be decided before either is
 * written.
 *
 * `/Length` is the CIPHERTEXT length, because that is what a reader must read;
 * `/Params /Size` and `/CheckSum` describe the PLAINTEXT, because that is the
 * file the user attached. Conflating the two produces a viewer that reports a
 * size nobody recognises.
 */
export function buildEmbeddedFileObjects(
  sec: PdfSecurity,
  firstFreeNum: number,
  spec: EmbeddedFileSpec,
): BuiltEmbeddedFile {
  const name = spec.name?.trim();
  if (!name) throw new Error('An embedded file needs a name');
  if (!Buffer.isBuffer(spec.bytes) || spec.bytes.length === 0) {
    throw new Error(`Embedded file "${name}" has no bytes`);
  }

  const streamNum = firstFreeNum;
  const filespecNum = firstFreeNum + 1;

  const md5 = createHash('md5').update(spec.bytes).digest();
  const sha256 = createHash('sha256').update(spec.bytes).digest('hex');
  const encrypted = encryptObjectData(sec, streamNum, 0, spec.bytes);
  const subtype = spec.mimeType ? `/Subtype/${pdfName(spec.mimeType)}` : '';
  const checkSum = pdfString(sec, streamNum, 0, md5);

  const streamObject: PdfObjectWrite = {
    num: streamNum,
    gen: 0,
    dict:
      `<</Type/EmbeddedFile${subtype}/Length ${encrypted.length}` +
      `/Params<</Size ${spec.bytes.length}/CheckSum ${checkSum}>>>>`,
    data: encrypted,
  };

  const description = spec.description?.trim();
  const descriptionEntry = description
    ? `/Desc ${pdfString(sec, filespecNum, 0, Buffer.from(description, 'latin1'))}`
    : '';

  const filespecObject: PdfObjectWrite = {
    num: filespecNum,
    gen: 0,
    dict:
      `<</Type/Filespec` +
      `/F ${pdfString(sec, filespecNum, 0, Buffer.from(name, 'latin1'))}` +
      `/UF ${pdfString(sec, filespecNum, 0, utf16be(name))}` +
      descriptionEntry +
      `/EF<</F ${streamNum} 0 R>>>>`,
  };

  return { objects: [streamObject, filespecObject], filespecNum, sha256 };
}
