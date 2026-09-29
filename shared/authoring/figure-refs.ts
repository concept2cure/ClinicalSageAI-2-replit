/**
 * Figure references — what an image in a governed section may point at.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * A section stores a figure as `<img src="…">`. Two client checks decided what
 * that src could do, and the server decided nothing (periodic review
 * 2026-09-28, editor family, SEC-B-1 and SEC-B-2):
 *
 *   - "Is this a governed image?" was `src.startsWith('/api/authoring/images/')`.
 *     A browser removes dot segments, raw or percent-encoded, before it sends a
 *     request, so `/api/authoring/images/../../tenant-export/full` passed the
 *     test and was fetched as `/api/tenant-export/full` with the VIEWER's
 *     credentials, on render, with no click. Whoever wrote the section chose a
 *     request that every later reader made in their own name.
 *   - Every other src (an external https address, a data: URI of any type) was
 *     handed to the browser as a live image. Each reader's browser contacted a
 *     host the content chose, and the figure on screen could change after the
 *     section was approved. The export never fetches such a src and prints
 *     "[Figure not exported]", so the canvas showed a figure the filed document
 *     did not contain.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A figure's src is one of two things, compared as the WHOLE string:
 *
 *   1. A governed reference, `/api/authoring/images/<id>`, where <id> has the
 *      shape the upload store mints: `file_<epoch ms>_<up to six base-36
 *      characters>` (saveDerivedUpload in server/services/ana/
 *      uploaded-file-access.ts; the chat upload mints the same shape). The
 *      characters an id may hold cannot form a further segment, a dot segment
 *      (raw or encoded), a backslash, a query, a fragment or whitespace, so the
 *      path the browser requests is the path that was checked.
 *   2. An inline PNG, JPEG or GIF, `data:image/(png|jpeg|gif);base64,<base64>`.
 *      These are the formats the export files in BOTH of its branches: the PDF
 *      branch embeds any decoded image, the Word branch only these three
 *      (DOCX_IMAGE_TYPE in server/export/authoring-blocks-to-docx.ts), and the
 *      upload route accepts only these for the same reason. WebP is not a
 *      figure, because Word cannot hold it. SVG is not a figure, because it is a
 *      script container.
 *
 * Nothing else is a figure. It is not fetched and not displayed as an image.
 * The canvas and the read view say it must be uploaded, the canvas will not
 * parse one in from a paste or a load, and the section save refuses it.
 *
 * One module for the client and the server, so the canvas, the read view and
 * the store cannot disagree about what a figure is.
 */

/** The route a governed figure reference points at. POST /api/authoring/images
 *  returns it; GET /api/authoring/images/:id serves it. */
export const AUTHORING_IMAGE_URL_PREFIX = '/api/authoring/images/';

/** `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`. The random
 *  part is at most six characters, fewer when the number's base-36 form is
 *  short, and only ever [0-9a-z]. */
const GOVERNED_IMAGE_REF = /^\/api\/authoring\/images\/file_[0-9]{1,16}_[0-9a-z]{0,6}$/;

/** Lower-case scheme and type, which is how the export matches a data: src,
 *  and a payload of base64 characters only. */
const INLINE_FIGURE = /^data:image\/(?:png|jpeg|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Is this src a governed figure reference? It is the only same-app path the
 *  canvas and the read view fetch with the viewer's credentials. */
export function isGovernedImageRef(src: unknown): src is string {
  return typeof src === 'string' && GOVERNED_IMAGE_REF.test(src);
}

/** Is this src an inline figure, displayed and filed as it is? */
export function isInlineFigureImage(src: unknown): src is string {
  return typeof src === 'string' && INLINE_FIGURE.test(src);
}

/** Is this src a figure at all? One that is not is never fetched and never
 *  displayed as an image. */
export function isFigureSrc(src: unknown): src is string {
  return isGovernedImageRef(src) || isInlineFigureImage(src);
}
