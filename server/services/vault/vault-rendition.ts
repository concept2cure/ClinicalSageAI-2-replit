/**
 * A PDF rendition of a Vault version (founder decision P-107 item 3, 2026-11-08):
 *
 *   "each version gets a PDF rendition through the existing converter (pdf-converter.ts), bound to the source
 *    version's SHA-256 and shown in the viewer. A rendition is never filed in place of its source."
 *
 * What already existed: the one converter (server/services/pdf-converter.ts, LibreOffice, deterministic output) and
 * the Vault's audited, hash-verified byte read (readVerifiedVaultBytes, project-vault.ts). No Vault version had a
 * rendition: a Word file could only be downloaded.
 *
 * The rendition is DERIVED, on request, from the version's verified bytes. It is never stored as a Vault document,
 * never takes the source's place in a folder, a seal or a submission, and is always served with the SHA-256 of the
 * source it was made from. A source that is already a PDF has no rendition: it is viewed as itself. A format the
 * converter does not read is refused by name, never rendered as something else.
 *
 * @module server/services/vault/vault-rendition
 */
import { convertDocxToPdf, looksLikePdf } from '../pdf-converter.js';

export interface RenditionSource {
  /** The version's bytes, already verified against its recorded hash. */
  bytes: Buffer;
  fileName: string | null;
  mimeType: string | null;
  /** The version's recorded SHA-256: what the rendition is bound to. */
  contentHash: string | null;
}

export type RenditionResult =
  | { ok: true; pdf: Buffer; sha256: string; sourceSha256: string }
  | { ok: false; status: number; code: string; message: string };

const refuse = (status: number, code: string, message: string): RenditionResult => ({ ok: false, status, code, message });

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** A Word document: a zip container that is named or typed as .docx. Both, so a spreadsheet or archive is not sent to the Word converter. */
function isWord(s: RenditionSource): boolean {
  const zip = s.bytes.length > 4 && s.bytes[0] === 0x50 && s.bytes[1] === 0x4b;
  return zip && (/\.docx$/i.test(s.fileName ?? '') || s.mimeType === WORD_MIME);
}

/** The name a rendition is served under: the source's, marked as a rendition. */
export function renditionFileName(fileName: string | null): string {
  const base = (fileName ?? '').replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';
  return `${base}.rendition.pdf`;
}

/** Render the PDF rendition of one version, or say why there is none. */
export async function renderVaultRendition(source: RenditionSource): Promise<RenditionResult> {
  if (looksLikePdf(source.bytes)) {
    return refuse(409, 'SOURCE_IS_PDF', 'This version is a PDF already; it is viewed as itself and has no rendition.');
  }
  if (!isWord(source)) {
    return refuse(422, 'NO_RENDITION_FOR_FORMAT', 'A PDF rendition is made from a Word document (.docx). This version is another format; download it to open it.');
  }
  if (!source.contentHash) {
    return refuse(409, 'SOURCE_HASH_NOT_RECORDED', 'This version has no recorded content hash, so a rendition could not be bound to it. None was made.');
  }
  try {
    // LibreOffice only: the converter's HTML fallback would render other content than the source file.
    const out = await convertDocxToPdf(source.bytes, { backend: 'libreoffice' });
    if (!looksLikePdf(out.pdf)) throw new Error('the converter returned bytes that are not a PDF');
    return { ok: true, pdf: out.pdf, sha256: out.sha256, sourceSha256: source.contentHash };
  } catch {
    return refuse(503, 'RENDITION_UNAVAILABLE', 'The PDF rendition could not be made just now. The source version is unchanged; download it instead.');
  }
}
