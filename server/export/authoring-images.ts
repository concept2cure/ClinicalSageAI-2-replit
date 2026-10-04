/**
 * Image resolution for the authoring export — the bytes behind the refs.
 *
 * Section HTML stores an image as a REFERENCE (`<img
 * src="/api/authoring/images/<id>">`) so the append-only revision ledger
 * carries kilobytes of pointer instead of megabytes of base64 per save. At
 * export time the reference has to become bytes again, exactly once, under
 * the exporting tenant's scope — this module is that step.
 *
 * What a src may be is the figure rule in @shared/authoring/figure-refs, the
 * one the canvas, the read view and the section save apply, compared as the
 * whole string:
 *   - a governed reference, `/api/authoring/images/<minted id>` — resolved
 *     through the canonical tenant-scoped loader (`loadUploadedFile`, the ONLY
 *     sanctioned upload-id → bytes resolver; it enforces the org column AND
 *     the `uploads/org-{id}/` path prefix). A foreign or missing id resolves
 *     to nothing and the renderers emit an honest placeholder.
 *   - an inline PNG, JPEG or GIF — decoded locally. No fetch involved.
 *   - anything else — NOT fetched and NOT filed; the renderers state the
 *     figure was not exported instead. That includes an external address
 *     (fetching it server-side is SSRF), a src that only starts with the image
 *     route (`…/file_1_a/../x` used to file `file_1_a`), and a data: URI of any
 *     other type or form (WebP, SVG, an upper-case type), which the PDF used to
 *     embed while the Word file printed a placeholder and the canvas refused to
 *     show it (periodic review 2026-09-28, editor family, SEC-B-1/2 follow-on
 *     a). An export files a figure only when the canvas shows it.
 *
 * Dimensions are sniffed from the bytes (PNG / JPEG / GIF headers) because
 * the DOCX ImageRun requires explicit width×height. No image library is
 * pulled in for three well-documented fixed headers.
 */

import {
  AUTHORING_IMAGE_URL_PREFIX,
  isGovernedImageRef,
  isInlineFigureImage,
} from '@shared/authoring/figure-refs';
import { loadUploadedFile } from '../services/ana/uploaded-file-access.js';
import { exportImageSrcs, imageReadingsDiffer, refusedKind } from '../services/authoring/authoring-html-sanitizer';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('authoring-images');

export interface ResolvedImage {
  buffer: Buffer;
  mimeType: string;
  /** Pixel dimensions from the file header; null when unreadable. */
  width: number | null;
  height: number | null;
}

/** Mimes the authoring image store accepts — the set DOCX ImageRun can embed
 *  (WebP cannot ride into Word, so it is refused at upload, not dropped at
 *  export). Shared with the upload route so the two cannot drift. */
export const AUTHORING_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif']);

/* ── Dimension sniffing ───────────────────────────────────────── */

function pngSize(b: Buffer): { width: number; height: number } | null {
  // 8-byte signature, 4-byte length, "IHDR", then width/height as BE u32.
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function gifSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 10) return null;
  const sig = b.toString('ascii', 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

function jpegSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < b.length) {
    if (b[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = b[off + 1];
    // Standalone markers with no length segment.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      off += 2;
      continue;
    }
    const len = b.readUInt16BE(off + 2);
    // SOF0–SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(off + 5), width: b.readUInt16BE(off + 7) };
    }
    if (len < 2) return null;
    off += 2 + len;
  }
  return null;
}

/** Pixel size of a PNG/JPEG/GIF buffer, from its header. Null when the bytes
 *  are not one of those formats or the header is truncated. */
export function sniffImageDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  const size = pngSize(buffer) ?? gifSize(buffer) ?? jpegSize(buffer);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  return size;
}

/* ── Reference collection + resolution ────────────────────────── */

/**
 * Every img src in the given HTML strings, in order, deduplicated, read by the
 * parser the export's blocks come from (sectionContentToBlocks). So a src is
 * keyed exactly as its image block carries it: character references decoded,
 * an unquoted or upper-case `SRC` read. A quoted-attribute regex over the raw
 * text used to key `file_1_&#97;` while the block carried `file_1_a`, and the
 * figure was printed as not exported. The value is not trimmed: a src padded
 * with whitespace is not a figure, on the canvas or here.
 */
export function collectImageSrcs(contents: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const content of contents) {
    for (const src of exportImageSrcs(content)) if (src) seen.add(src);
  }
  return [...seen];
}

/**
 * Sources the export must not file: every image src of a section whose images
 * the export's parser and a browser read differently (refute-review of the
 * figure rule, 2026-10-04, round 3: D1, D3).
 *
 * A browser keeps the first of two duplicated attributes and the parser the
 * last, so `<img src=A SRC=B>` is shown as A and was filed as B. And a browser
 * builds no image from markup inside a comment, a raw-text element or a
 * <template>, which the parser reads as images and filed. Comparing source
 * lists cannot say which image went wrong, only that one did, so none of the
 * section's images is filed. The map is keyed by source, shared by every
 * section of the export, so none of those sources is filed for any section:
 * each such image prints its placeholder. Failing closed costs a placeholder
 * where a figure could have been; the alternative files a figure the canvas
 * never showed, into a regulated document.
 */
async function unfileableSrcs(contents: Array<string | null | undefined>): Promise<Set<string>> {
  const out = new Set<string>();
  for (const content of contents) {
    if (!content) continue;
    if ((await imageReadingsDiffer(String(content))) === null) continue;
    for (const src of exportImageSrcs(content)) if (src) out.add(src);
  }
  return out;
}

/** The bytes of an inline figure. `isInlineFigureImage` has already fixed the
 *  shape (a lower-case png, jpeg or gif type and a payload of base64
 *  characters only), so the type is read as written and nothing is guessed. */
function decodeInlineFigure(src: string): ResolvedImage | null {
  const buffer = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  if (buffer.length === 0) return null;
  const dims = sniffImageDimensions(buffer);
  return {
    buffer,
    mimeType: src.slice('data:'.length, src.indexOf(';')),
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}

/** The bytes behind a governed reference's file id, under the exporting
 *  tenant, or null when the id is unknown, foreign, gone or not an image. */
async function loadGovernedFigure(fileId: string, organizationId: number): Promise<ResolvedImage | null> {
  try {
    const file = await loadUploadedFile(fileId, organizationId);
    if (!AUTHORING_IMAGE_MIMES.has(file.mimeType)) {
      logger.warn('export image ref resolves to a non-image upload; skipped', {
        fileId,
        mimeType: file.mimeType,
      });
      return null;
    }
    const dims = sniffImageDimensions(file.buffer);
    return {
      buffer: file.buffer,
      mimeType: file.mimeType,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  } catch (err) {
    // Unknown, foreign, or bytes gone — the placeholder path says so.
    logger.warn('export image ref did not resolve', {
      fileId,
      reason: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

/**
 * Resolve every image reference in the given section contents to bytes, under
 * the exporting tenant. A src that cannot be resolved — foreign tenant,
 * deleted bytes, non-image upload, anything that is not a figure — is simply
 * absent from the map; the renderers state that honestly instead of dropping
 * the figure silently.
 */
export async function resolveAuthoringImages(
  contents: Array<string | null | undefined>,
  organizationId: number,
): Promise<Map<string, ResolvedImage>> {
  const out = new Map<string, ResolvedImage>();
  const unfileable = await unfileableSrcs(contents);
  for (const src of collectImageSrcs(contents)) {
    if (unfileable.has(src)) continue;
    let image: ResolvedImage | null = null;
    if (isGovernedImageRef(src)) {
      image = await loadGovernedFigure(src.slice(AUTHORING_IMAGE_URL_PREFIX.length), organizationId);
    } else if (isInlineFigureImage(src)) {
      image = decodeInlineFigure(src);
    }
    // Anything else is not a figure: never fetched, never filed. The renderers
    // print the placeholder for it.
    if (image) out.set(src, image);
  }
  return out;
}

/**
 * What a "[Figure not exported: …]" placeholder names, for a figure whose bytes
 * this export did not file. Both renderers print it, so the PDF and the Word
 * file of one document say the same thing. The eCTD leaf renderer
 * (server/services/ectd/leaf-pdf-renderer.ts) names every figure by it too,
 * because a leaf is a text rendering and files no figure's bytes.
 *
 * The author's alt text when there is one. Otherwise the kind of src in the
 * section save's own words (refusedKind), never the src itself. The renderers
 * used to print the src, which was short while only an external address or a
 * missing upload reached the placeholder. The export now also declines inline
 * data it used to embed (WebP, SVG, an upper-case type), and for such an image
 * with no alt the src is the whole payload: the filed PDF and Word file printed
 * hundreds of kilobytes of base64 as a line of text (periodic review
 * 2026-09-28, editor family, SEC-B-1/2 follow-on a, fix-up). An upload that did
 * not resolve is still named by its reference: the figure rule bounds its
 * length, and it says which upload is missing.
 */
export function unfiledFigureLabel(fig: { src?: string; alt?: string }): string {
  if (fig.alt) return fig.alt;
  if (!fig.src) return 'unresolved image reference';
  return isGovernedImageRef(fig.src) ? fig.src : refusedKind(fig.src);
}
