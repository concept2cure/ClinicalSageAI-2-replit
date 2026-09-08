/**
 * Image resolution for the authoring export — the bytes behind the refs.
 *
 * Section HTML stores an image as a REFERENCE (`<img
 * src="/api/authoring/images/<id>">`) so the append-only revision ledger
 * carries kilobytes of pointer instead of megabytes of base64 per save. At
 * export time the reference has to become bytes again, exactly once, under
 * the exporting tenant's scope — this module is that step.
 *
 * Three src shapes, three behaviours:
 *   - `/api/authoring/images/<id>` — resolved through the canonical
 *     tenant-scoped loader (`loadUploadedFile`, the ONLY sanctioned
 *     upload-id → bytes resolver; it enforces the org column AND the
 *     `uploads/org-{id}/` path prefix). A foreign or missing id resolves to
 *     nothing and the renderers emit an honest placeholder.
 *   - `data:image/...;base64,...` — decoded locally. Legacy or pasted
 *     content; no fetch involved.
 *   - anything else (external http, file:, …) — NOT fetched. Fetching
 *     arbitrary URLs from stored content server-side is SSRF; the renderers
 *     state the figure was not exported instead.
 *
 * Dimensions are sniffed from the bytes (PNG / JPEG / GIF headers) because
 * the DOCX ImageRun requires explicit width×height. No image library is
 * pulled in for three well-documented fixed headers.
 */

import { loadUploadedFile } from '../services/ana/uploaded-file-access.js';
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

export const AUTHORING_IMAGE_URL_PREFIX = '/api/authoring/images/';

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

const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Every img src in the given HTML strings, in order, deduplicated. */
export function collectImageSrcs(contents: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const content of contents) {
    if (!content) continue;
    for (const m of String(content).matchAll(IMG_SRC_RE)) {
      const src = (m[1] ?? m[2] ?? '').trim();
      if (src) seen.add(src);
    }
  }
  return [...seen];
}

function decodeDataUri(src: string): ResolvedImage | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(src);
  if (!m) return null;
  try {
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0) return null;
    const dims = sniffImageDimensions(buffer);
    return {
      buffer,
      mimeType: m[1].toLowerCase(),
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve every image reference in the given section contents to bytes, under
 * the exporting tenant. A src that cannot be resolved — foreign tenant,
 * deleted bytes, non-image upload, external URL — is simply absent from the
 * map; the renderers state that honestly instead of dropping the figure
 * silently.
 */
export async function resolveAuthoringImages(
  contents: Array<string | null | undefined>,
  organizationId: number,
): Promise<Map<string, ResolvedImage>> {
  const out = new Map<string, ResolvedImage>();
  for (const src of collectImageSrcs(contents)) {
    if (src.startsWith('data:')) {
      const decoded = decodeDataUri(src);
      if (decoded) out.set(src, decoded);
      continue;
    }
    if (!src.startsWith(AUTHORING_IMAGE_URL_PREFIX)) continue; // never fetched
    const fileId = src.slice(AUTHORING_IMAGE_URL_PREFIX.length).split(/[/?#]/)[0];
    if (!fileId) continue;
    try {
      const file = await loadUploadedFile(fileId, organizationId);
      if (!AUTHORING_IMAGE_MIMES.has(file.mimeType)) {
        logger.warn('export image ref resolves to a non-image upload; skipped', {
          fileId,
          mimeType: file.mimeType,
        });
        continue;
      }
      const dims = sniffImageDimensions(file.buffer);
      out.set(src, {
        buffer: file.buffer,
        mimeType: file.mimeType,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      });
    } catch (err) {
      // Unknown, foreign, or bytes gone — the placeholder path says so.
      logger.warn('export image ref did not resolve', {
        fileId,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
  return out;
}
