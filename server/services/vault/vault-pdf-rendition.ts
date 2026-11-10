/**
 * The PDF rendition of one Vault version (P-107 item 3, decided 2026-11-08:
 * "each version gets a PDF rendition through the existing converter
 * (`pdf-converter.ts`), bound to the source version's SHA-256 and shown in the
 * viewer. A rendition is never filed in place of its source.").
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 * The Vault's viewer frames a PDF and downloads anything else, so a Word
 * version could not be read in the Vault. A rendition is a PDF made from the
 * version's bytes, for reading. It is a copy, never the record.
 *
 * ── How it is bound to its source ────────────────────────────────────────────
 * It is made on request, from the bytes the Vault's verified reader has just
 * returned (routes/c2c/project-vault.ts `readVerifiedVaultBytes`), and only
 * when those bytes hash to the version's recorded SHA-256. The result names
 * that hash and the rendition's own. So a rendition cannot exist for bytes the
 * record does not hold, and it cannot outlast or drift from its source.
 *
 * ── Why it is not kept ───────────────────────────────────────────────────────
 * Nothing is written here: no object store, no database. A stored rendition
 * would be a second copy of the version's content that no Vault record names.
 * The tenant purge erases the stored objects `vault.documents` lists
 * (services/tenant/tenant-offboarding.ts `eraseStoredObjects`), and a data
 * disposition withholds a version by its row
 * (services/document-data-disposition/eligibility.ts), so a copy outside those
 * rows would survive both. Keeping one needs a record of it first; see
 * docs/evidence/SPINE/S6/2026-11-10-p107-renditions/README.md, "Not done here".
 *
 * ── What it converts ─────────────────────────────────────────────────────────
 * What the existing converter converts: a Word document (.docx). A PDF needs
 * no rendition and gets none. Any other file, a converter that is not
 * installed and a conversion that failed are each said as that. None is
 * answered with an empty or broken PDF. A busy converter stays the converter's
 * own refusal (ConversionCapacityError), for the one mapping that answers it
 * (lib/api-response.ts `respondIfConverterBusy`).
 *
 * ── What is not handed to the converter ──────────────────────────────────────
 * Until now the converter ran only on Word files this platform built. A
 * version is a file someone uploaded, and LibreOffice requests what such a
 * file links to. Measured here on 2026-11-10 with LibreOffice 24.2 and the
 * converter's own flags: a linked image in an external relationship of
 * word/_rels/document.xml.rels was requested over HTTP during conversion, also
 * when the relationship was typed as a hyperlink, and also when its
 * TargetMode was written with a character reference. That would let an
 * upload make this server call an address inside its own network. So a Word
 * file whose relationship parts name anything outside the file is not
 * converted, and is said as that; hyperlinks are included, because the type
 * does not stop the request. This closes the route that was measured. It is
 * not the whole control: that is the converter refusing linked content itself
 * (README, "Not done here"), after which this refusal can be narrowed.
 *
 * Only the Vault download reaches this module. Placement, seals, archives and
 * exports read the source (pinned by __tests__/vault-pdf-rendition.test.ts).
 *
 * @module server/services/vault/vault-pdf-rendition
 */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { extensionOf } from '../../../shared/constants/upload-name-bindings.js';
import { verifyFileSignature } from '../../utils/fileSignature.js';
import { createScopedLogger } from '../../utils/logger.js';
import { assertZipWithinLimits } from '../archive/safeZip.js';
import { isConversionCapacityError } from '../conversion-slots.js';
import { convertDocxToPdf, looksLikePdf } from '../pdf-converter.js';

const logger = createScopedLogger('vault-pdf-rendition');

/** The one format a rendition is made in (`?rendition=pdf`). */
export const VAULT_RENDITION_FORMAT = 'pdf';

const WORD_EXTENSION = '.docx';
const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SOURCE_STILL_DOWNLOADS = 'The version itself can still be downloaded.';

export type VaultRenditionRefusalCode =
  | 'RENDITION_FORMAT_UNSUPPORTED'
  | 'RENDITION_SOURCE_UNBOUND'
  | 'CONTENT_HASH_MISMATCH'
  | 'RENDITION_NOT_NEEDED'
  | 'RENDITION_NOT_SUPPORTED'
  | 'RENDITION_LINKS_OUTSIDE_FILE'
  | 'RENDITION_CONVERTER_UNAVAILABLE'
  | 'RENDITION_FAILED';

export interface VaultRenditionRefusal {
  ok: false;
  status: number;
  code: VaultRenditionRefusalCode;
  message: string;
}

export interface VaultRenditionMade {
  ok: true;
  /** The rendition: bytes that begin %PDF-. */
  pdf: Buffer;
  /** SHA-256 of `pdf`, computed here from the bytes returned. */
  sha256: string;
  /** SHA-256 of the source bytes it was made from, equal to the version's recorded hash. */
  sourceSha256: string;
  /** The name it is served under: the source's own name, marked as a rendition. */
  fileName: string;
}

export type VaultPdfRendition = VaultRenditionMade | VaultRenditionRefusal;

export interface VaultRenditionSource {
  /** What the request asked for (`?rendition=`). Only 'pdf' is made. */
  format: unknown;
  /** The version's bytes, as the Vault's verified reader returned them. */
  bytes: Buffer;
  /** `vault.documents.file_name`. */
  fileName: string | null;
  /** `vault.documents.content_hash`: the SHA-256 the version is recorded under. */
  recordedHash: string | null;
}

const refuse = (status: number, code: VaultRenditionRefusalCode, message: string): VaultRenditionRefusal =>
  ({ ok: false, status, code, message });

const sha256Of = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** The source's name as the download serves it, marked as a rendition of it. */
function renditionFileName(fileName: string | null): string {
  const safe = (fileName ?? '').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';
  return `${safe}.rendition.pdf`;
}

/** Whether the converter's program could not be started at all: it is not installed on this server. */
function converterNotInstalled(err: unknown): boolean {
  const e = err as { code?: unknown; syscall?: unknown } | null;
  return e?.code === 'ENOENT' && typeof e.syscall === 'string' && e.syscall.startsWith('spawn');
}

/** Why this source gets no rendition before any conversion is tried, or null when one may be made. */
function sourceRefusal(source: VaultRenditionSource, sourceSha256: string): VaultRenditionRefusal | null {
  if (source.format !== VAULT_RENDITION_FORMAT) {
    return refuse(400, 'RENDITION_FORMAT_UNSUPPORTED', 'A rendition is a PDF. Ask for it with rendition=pdf.');
  }
  if (!source.recordedHash) {
    return refuse(409, 'RENDITION_SOURCE_UNBOUND',
      'This version has no recorded SHA-256, so a rendition cannot be bound to it. Nothing was made.');
  }
  if (source.recordedHash !== sourceSha256) {
    return refuse(409, 'CONTENT_HASH_MISMATCH',
      'The stored file does not match the recorded SHA-256, so no rendition was made from it.');
  }
  // The bytes decide, as they do in the viewer: a PDF under any name is read as it is.
  if (looksLikePdf(source.bytes)) {
    return refuse(409, 'RENDITION_NOT_NEEDED', 'This version is a PDF. It is read as it is, so it has no rendition.');
  }
  const word = extensionOf(source.fileName ?? '') === WORD_EXTENSION && verifyFileSignature(source.bytes, WORD_MIME).ok;
  if (!word) {
    return refuse(409, 'RENDITION_NOT_SUPPORTED',
      `A PDF rendition is made from a Word document (.docx). This version is not one, so it has no rendition. ${SOURCE_STILL_DOWNLOADS}`);
  }
  return null;
}

/**
 * Whether one relationship part (`*.rels`) may name something outside the
 * file. Read as bytes and decided on what cannot be disguised: a relationship
 * is external only through an attribute named TargetMode, and a name cannot be
 * written with a character reference. A part that is not plain UTF-8 XML, or
 * that carries a DOCTYPE (which can add attributes and entities), is counted
 * as naming something outside, because it cannot be read here as the
 * converter would read it.
 */
function mayNameOutsideContent(part: Buffer): boolean {
  if (part.includes(0)) return true;
  const text = part.toString('latin1').replace(/^\xef\xbb\xbf/, '');
  if (!text.startsWith('<') || /<!DOCTYPE/i.test(text)) return true;
  const declared = /^<\?xml[^>]*\bencoding\s*=\s*["']([^"']*)["']/i.exec(text)?.[1];
  if (declared !== undefined && declared.toLowerCase() !== 'utf-8') return true;
  return /TargetMode/.test(text.replace(/TargetMode\s*=\s*(["'])Internal\1/g, ''));
}

/**
 * Why a Word file is not handed to the converter, or null when it may be: it
 * cannot be opened within the archive limits, it holds two entries of one
 * name (a reader here and the converter could then read different ones), or a
 * relationship part of it names something outside the file.
 */
async function wordFileRefusal(bytes: Buffer): Promise<VaultRenditionRefusal | null> {
  let relationshipParts: Buffer[];
  try {
    const names = (await assertZipWithinLimits(bytes)).map((entry) => entry.name);
    if (new Set(names).size !== names.length) throw new Error('two entries share one name');
    const zip = await JSZip.loadAsync(bytes);
    const parts = Object.values(zip.files).filter((file) => !file.dir && /\.rels$/i.test(file.name));
    relationshipParts = await Promise.all(parts.map((file) => file.async('nodebuffer')));
  } catch (err) {
    logger.error('vault rendition: the Word file could not be opened to check it', { reason: err instanceof Error ? err.message : 'unknown' });
    return refuse(409, 'RENDITION_NOT_SUPPORTED',
      `This Word file could not be opened to check what it links to, so it was not converted. ${SOURCE_STILL_DOWNLOADS}`);
  }
  if (!relationshipParts.some(mayNameOutsideContent)) return null;
  return refuse(409, 'RENDITION_LINKS_OUTSIDE_FILE',
    `This Word file links to content outside the file, so the Vault does not convert it. ${SOURCE_STILL_DOWNLOADS}`);
}

/** Why the converter made nothing. Its own words stay in the log: they name temporary paths. */
function conversionRefusal(err: unknown): VaultRenditionRefusal {
  if (converterNotInstalled(err)) {
    logger.error('vault rendition: the document converter is not installed on this server');
    return refuse(503, 'RENDITION_CONVERTER_UNAVAILABLE',
      `This server has no document converter installed, so a PDF rendition cannot be made here. ${SOURCE_STILL_DOWNLOADS}`);
  }
  logger.error('vault rendition: the conversion failed', { reason: err instanceof Error ? err.message : 'unknown' });
  return refuse(422, 'RENDITION_FAILED',
    `The converter could not make a PDF from this version, so nothing is shown in its place. ${SOURCE_STILL_DOWNLOADS}`);
}

/**
 * The PDF rendition of one version, or why there is none.
 *
 * `source.bytes` are the bytes the verified reader returned for the version,
 * after every access check the source download makes. Throws only the
 * converter's capacity refusal.
 */
export async function makeVaultPdfRendition(source: VaultRenditionSource): Promise<VaultPdfRendition> {
  const sourceSha256 = sha256Of(source.bytes);
  const refusal = sourceRefusal(source, sourceSha256) ?? await wordFileRefusal(source.bytes);
  if (refusal) return refusal;

  let pdf: Buffer;
  try {
    // LibreOffice only: the Word bytes are the only input, and no HTML stands in for them.
    ({ pdf } = await convertDocxToPdf(source.bytes, { backend: 'libreoffice' }));
  } catch (err) {
    if (isConversionCapacityError(err)) throw err;
    return conversionRefusal(err);
  }
  if (!Buffer.isBuffer(pdf) || !looksLikePdf(pdf)) return conversionRefusal(new Error('the converter returned bytes that are not a PDF'));

  return { ok: true, pdf, sha256: sha256Of(pdf), sourceSha256, fileName: renditionFileName(source.fileName) };
}
