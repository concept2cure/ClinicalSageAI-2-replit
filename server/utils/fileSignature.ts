/**
 * File-signature (magic number) verification for uploaded buffers.
 *
 * Why this exists: multer's `fileFilter` and the `mimetype` value on
 * `req.file` are derived from the request's Content-Type header, which
 * an attacker controls. Without verifying the actual bytes, an upload
 * declared as `application/pdf` could be an arbitrary binary that
 * malware-scanning, downstream parsers, or browsers later render as
 * something else.
 *
 * This utility inspects the first few bytes of the buffer and confirms
 * they match a known signature for the declared MIME type. For text-
 * shaped MIME types (text/*, application/json, application/xml) we
 * check that the buffer is mostly printable rather than a magic-number
 * match — those formats have no canonical prefix.
 *
 * The Office Open XML formats (.docx, .xlsx, .pptx) and EPUB all
 * wrap their content in a ZIP container; they're verified against the
 * ZIP magic (`PK\x03\x04`) rather than a format-specific signature.
 *
 * Centralized so chat/upload, document ingestion, and any future
 * upload path share one source of truth — adding a new allowed MIME
 * type only needs an edit here.
 *
 * The declared type is itself bound to the file's name by
 * {@link verifyDeclaredTypeForName}: checking bytes against a type the
 * uploader chose is not enough when the uploader also chose the name.
 */

import { NAME_ONLY_TYPES, UPLOAD_NAME_BINDINGS, extensionOf } from '../../shared/constants/upload-name-bindings';

export interface SignatureCheck {
  ok: boolean;
  reason?: string;
}

const PDF_MAGIC = Buffer.from('%PDF');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87_MAGIC = Buffer.from('GIF87a');
const GIF89_MAGIC = Buffer.from('GIF89a');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_COMPOUND_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy .doc / .xls
const CMS_SIGNED_DATA_OID = Buffer.from('06092a864886f70d010702', 'hex');

/** DER ContentInfo must occupy the whole file and identify CMS SignedData.
 * This is ingress format recognition only; a pinned CMS verifier must still
 * authenticate the signer, content and message binding before receipt use. */
function isCmsSignedData(buffer: Buffer): boolean {
  if (buffer.length < 13 || buffer[0] !== 0x30) return false;
  let offset = 2, length = buffer[1];
  if (length & 0x80) {
    const octets = length & 0x7f;
    if (octets === 0 || octets > 4 || buffer.length < 2 + octets || buffer[2] === 0) return false;
    length = 0;
    for (let index = 0; index < octets; index++) length = length * 256 + buffer[2 + index];
    if (length < 128) return false;
    offset += octets;
  }
  return offset + length === buffer.length && buffer.subarray(offset, offset + CMS_SIGNED_DATA_OID.length).equals(CMS_SIGNED_DATA_OID);
}
/**
 * SAS transport v5's whole first record (the format FDA's Technical Conformance
 * Guide requires for datasets): its 48-character header, 30 zeros and two
 * blanks. The 48 characters alone admitted anything that began with them.
 */
const XPORT_V5_MAGIC = Buffer.from(`HEADER RECORD*******LIBRARY HEADER RECORD!!!!!!!${'0'.repeat(30)}  `, 'latin1');

const TEXT_LIKE_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/csv'];
const TEXT_LIKE_EXACT = new Set([
  'text/plain',
  'text/csv',
  'text/html',
  'text/xml',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/x-ndjson',
]);

const ZIP_BASED_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
  // Office Open XML
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // EPUB
  'application/epub+zip',
]);

function matchesMagic(buffer: Buffer, magic: Buffer): boolean {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

function isTextLikeMime(mime: string): boolean {
  if (TEXT_LIKE_EXACT.has(mime)) return true;
  return TEXT_LIKE_PREFIXES.some(p => mime.startsWith(p));
}

/**
 * Heuristic: a "text-shaped" payload should be mostly printable ASCII /
 * UTF-8 in its first 2KB. The 90% threshold catches binary masquerading
 * as text while tolerating an occasional non-printable byte from a
 * legitimate UTF-8 multibyte sequence.
 */
function isLikelyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(2048, buffer.length));
  if (sample.length === 0) return false;
  if (sample.includes(0)) return false; // null bytes ⇒ binary
  let printable = 0;
  for (const byte of sample) {
    if (
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte <= 126) ||
      byte >= 128 // accept high bytes for UTF-8
    ) {
      printable += 1;
    }
  }
  return printable / sample.length > 0.9;
}

/**
 * Verify that `buffer` looks like the declared `mimeType`. Returns
 * { ok: false, reason } on mismatch so callers can choose to log /
 * return a 4xx; never throws.
 *
 * Behaviour:
 *   - PDF, PNG, JPEG, GIF — exact magic-number prefix match.
 *   - ZIP-based formats (Office Open XML, EPUB, plain .zip) — must
 *     start with `PK\x03\x04`.
 *   - text/*, JSON, XML, CSV — pass the printable-ASCII heuristic.
 *   - legacy .doc / .xls (application/msword, application/vnd.ms-excel)
 *     — OLE compound document signature.
 *   - Anything else with a known magic — must match its expected magic.
 */
export function verifyFileSignature(buffer: Buffer, mimeType: string): SignatureCheck {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'empty buffer' };
  }

  if (mimeType === 'application/pkcs7-mime' || mimeType === 'application/x-pkcs7-mime') {
    return isCmsSignedData(buffer) ? { ok: true } : { ok: false, reason: 'not a complete DER CMS SignedData receipt' };
  }

  if (ZIP_BASED_MIMES.has(mimeType)) {
    return matchesMagic(buffer, ZIP_MAGIC)
      ? { ok: true }
      : { ok: false, reason: `expected ZIP container for ${mimeType}` };
  }

  if (mimeType === 'application/pdf') {
    return matchesMagic(buffer, PDF_MAGIC)
      ? { ok: true }
      : { ok: false, reason: 'not a PDF (no %PDF prefix)' };
  }

  if (mimeType === 'image/png') {
    return matchesMagic(buffer, PNG_MAGIC)
      ? { ok: true }
      : { ok: false, reason: 'not a PNG' };
  }

  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return matchesMagic(buffer, JPEG_MAGIC)
      ? { ok: true }
      : { ok: false, reason: 'not a JPEG' };
  }

  if (mimeType === 'image/gif') {
    return matchesMagic(buffer, GIF87_MAGIC) || matchesMagic(buffer, GIF89_MAGIC)
      ? { ok: true }
      : { ok: false, reason: 'not a GIF' };
  }

  if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') {
    return matchesMagic(buffer, OLE_COMPOUND_MAGIC)
      ? { ok: true }
      : { ok: false, reason: `not an OLE compound document for ${mimeType}` };
  }

  if (mimeType === 'application/x-sas-xport') {
    return matchesMagic(buffer, XPORT_V5_MAGIC)
      ? { ok: true }
      : { ok: false, reason: 'not a SAS transport (v5) file' };
  }

  if (isTextLikeMime(mimeType)) {
    return isLikelyText(buffer)
      ? { ok: true }
      : { ok: false, reason: `${mimeType} content not text-shaped (binary detected)` };
  }

  // Unknown MIME type — be conservative. The caller's allowlist should
  // have already filtered out un-recognised types; reaching here means
  // either the allowlist is wider than this utility supports OR the
  // caller skipped the allowlist check. Either way, refuse.
  return { ok: false, reason: `no signature check defined for ${mimeType}` };
}

/**
 * What a file's name binds: the types it may be declared as, and the one
 * whose signature its bytes must carry.
 *
 * verifyFileSignature checks the bytes against the DECLARED type, and the
 * uploader writes the declared type as well as the name. So `report.pdf`
 * declared `text/html` with HTML bytes passed — text-shaped bytes for a text
 * type — the vault stored text/html, served it back under a .pdf name, and the
 * editor's viewer framed it in the app's origin (periodic review 2026-09-28,
 * editor family, SEC-A-3).
 *
 * This binds, it does not blacklist: text/html stays a valid type for a name
 * that says HTML and is refused for one that says PDF. An extension not listed
 * is not bound; the caller's own allowlist decides whether it is accepted.
 * Every declared type listed is one verifyFileSignature can verify.
 *
 * The table lives in shared/constants/upload-name-bindings.ts (2026-10-15): a
 * browser that builds a File itself, as the .zip intake does for each entry,
 * declares the canonical type from the same table, and never one this refuses.
 */
const NAME_BINDINGS = UPLOAD_NAME_BINDINGS;

/**
 * The type a name binds when the declared type is one it admits, else the
 * declared type: the signature is checked against what the name promises
 * (an .xpt declared application/octet-stream is checked as a transport file).
 */
export function signatureTypeFor(fileName: string, declaredMime: string): string {
  const declared = String(declaredMime ?? '').split(';')[0].trim().toLowerCase();
  const binding = NAME_BINDINGS.get(extensionOf(fileName));
  return binding && binding.declared.includes(declared) ? binding.canonical : declaredMime;
}

/**
 * Verify that `declaredMime` is a type `fileName`'s extension may be declared
 * as, and that `buffer` carries the signature that extension promises, whatever
 * was declared: a `.pdf` must be declared application/pdf AND begin `%PDF`.
 * The comparison ignores case and parameters (`text/plain; charset=utf-8`).
 * Returns { ok: true } for an extension this module does not bind.
 */
export function verifyDeclaredTypeForName(
  buffer: Buffer,
  fileName: string,
  declaredMime: string,
): SignatureCheck {
  const ext = extensionOf(fileName);
  const binding = NAME_BINDINGS.get(ext);
  const declared = String(declaredMime ?? '').split(';')[0].trim().toLowerCase();
  const onlyFor = NAME_ONLY_TYPES.get(declared);
  if (onlyFor && onlyFor !== ext) return { ok: false, reason: `${declared} is admitted for a ${onlyFor} file only` };
  if (!binding) return { ok: true };
  if (!binding.declared.includes(declared)) {
    return { ok: false, reason: `a ${ext} file must be declared as ${binding.declared.join(' or ')}` };
  }
  const bytes = verifyFileSignature(buffer, binding.canonical);
  return bytes.ok ? bytes : { ok: false, reason: `the bytes are not a ${ext} file — ${bytes.reason}` };
}
