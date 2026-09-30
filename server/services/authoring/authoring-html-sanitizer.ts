/**
 * Server-side sanitizer for authored section HTML (WM, 2026-09-21).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Section HTML written through the editor is sanitized where it is RENDERED:
 * `sanitizeAuthoringHtml` in client/src/concept2cure/components/ana/
 * renderSafeMarkdown.ts (the one audited sanitiser module) runs DOMPurify over
 * every section before `AuthoredHtml` paints it, and the PATCH /sections route
 * stores what the editor sends. That is the right boundary for a person typing
 * in the editor.
 *
 * `POST /api/authoring/docs/from-draft` and the `draft_authoring_document`
 * tool are a different boundary: the HTML arrives from a model turn or a seed,
 * not from the editor, and it is stored as the document's content — the bytes
 * the export renders into a filed PDF or DOCX and the bytes the editor loads.
 * The design contract requires that content sanitized on the way IN.
 *
 * ── One allowlist, mirrored ─────────────────────────────────────────────────
 * This is the client's AUTHORING_SANITIZE_CONFIG, tag for tag and attribute
 * for attribute, so what the server stores is exactly what the client would
 * have rendered: the editor's own serialization set (figure references,
 * captions, strike/highlight marks, ins/del track changes, merged cells).
 * DOMPurify keeps `data-*` attributes by default, which is what carries the
 * editor's tracked-change author/timestamp, citation and cross-reference
 * marks through. The client module cannot be imported here (client/**), so
 * the config is restated with a pointer; a change to one is a change to both.
 *
 * `<script>`, inline event handlers, `javascript:` URLs and every unknown tag
 * or attribute are removed.
 *
 * ── An image is a figure or nothing ─────────────────────────────────────────
 * Same-app image references used to be left exactly as written, and so was
 * every other `<img src>`. That stored `/api/authoring/images/../../tenant-
 * export/full`, which every reader's browser requested as `/api/tenant-export/
 * full` in the reader's own name, and `https://collector.example/p.png?d=…`,
 * which every reader's browser fetched from that host (periodic review
 * 2026-09-28, editor family, SEC-B-1, SEC-B-2). An `<img>` whose src is not a
 * figure (@shared/authoring/figure-refs: a governed reference or an inline
 * PNG, JPEG or GIF) is now removed whole, like any other markup outside the
 * allowlist. `refusedFigures` answers the same question for the section save,
 * which refuses rather than rewrites.
 */

import DOMPurifyImport from 'isomorphic-dompurify';
import type { JSDOM } from 'jsdom';
import { isFigureSrc } from '@shared/authoring/figure-refs';

type PurifyHook = (node: Element) => void;

// isomorphic-dompurify ships a CommonJS default; under both tsx and the
// production bundle the callable is reached this way (see routes/c2c/shared.ts).
const DOMPurify = ((DOMPurifyImport as unknown as { default?: unknown }).default ??
  DOMPurifyImport) as {
  sanitize: (html: string, cfg: Record<string, unknown>) => string;
  addHook: (entryPoint: 'uponSanitizeElement', hook: PurifyHook) => void;
  removeHook: (entryPoint: 'uponSanitizeElement', hook: PurifyHook) => void;
};

const CHAT_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'hr', 'sup', 'sub',
];

/** Mirrors AUTHORING_SANITIZE_CONFIG in the client's renderSafeMarkdown.ts. */
export const AUTHORING_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [...CHAT_TAGS, 'img', 'figure', 'figcaption', 'caption', 's', 'mark', 'ins', 'del'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id', 'src', 'alt', 'colspan', 'rowspan'],
} as const;

/** Removes an `<img>` whose src is not a figure. An `<img>` with no src, or
 *  with one the URI policy would strip (`javascript:`), is not a figure either. */
const dropNonFigureImage: PurifyHook = (node) => {
  if (node.nodeName === 'IMG' && !isFigureSrc(node.getAttribute('src'))) node.remove();
};

/**
 * Sanitize one section's HTML for storage. Empty input stays empty; the
 * result is the DOMPurify output and nothing else — no wrapping, no
 * normalisation, so a section that was already clean round-trips.
 */
export function sanitizeAuthoringSectionHtml(html: string): string {
  if (!html) return '';
  // Scoped to this call: DOMPurify hooks are instance-global, and the instance
  // is shared with every other server caller.
  DOMPurify.addHook('uponSanitizeElement', dropNonFigureImage);
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [...AUTHORING_SANITIZE_CONFIG.ALLOWED_TAGS],
      ALLOWED_ATTR: [...AUTHORING_SANITIZE_CONFIG.ALLOWED_ATTR],
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeElement', dropNonFigureImage);
  }
}

/* ── What the section save refuses ────────────────────────────────────────── */

/** An `<img>` whose src is not a figure: its place among the section's images
 *  (1-based, document order) and the src as the browser reads it. */
export interface RefusedFigure {
  position: number;
  src: string;
}

type HtmlParser = InstanceType<JSDOM['window']['DOMParser']>;
let htmlParser: Promise<HtmlParser> | null = null;

/** A browser's HTML parser. jsdom's DOMParser builds the tree a browser builds,
 *  and the canvas reads stored content through a DOMParser too. Loaded on the
 *  first section that holds an image, so a server that never saves one never
 *  pays for it. */
function parser(): Promise<HtmlParser> {
  htmlParser ??= import('jsdom').then(({ JSDOM }) => {
    const { window } = new JSDOM('');
    return new window.DOMParser();
  });
  return htmlParser;
}

/**
 * Every `<img>` in section HTML whose src is not a figure. Read the way a
 * browser reads it, because a browser is what would fetch it: an upper-case or
 * unquoted `SRC`, an `<image>` (parsed as `<img>`), a `>` inside a quoted
 * attribute, character references in the path, and an image nested where a
 * sanitizer would drop its parent are all seen. An `<img>` with no src
 * attribute requests nothing and is not named.
 */
export async function refusedFigures(html: string): Promise<RefusedFigure[]> {
  // An image element comes only from a start tag named `img` or `image`, and
  // a tag name is never written with character references.
  if (!html || !/<im/i.test(html)) return [];
  const doc = (await parser()).parseFromString(html, 'text/html');
  const refused: RefusedFigure[] = [];
  doc.querySelectorAll('img').forEach((img, i) => {
    const src = img.getAttribute('src');
    if (src !== null && !isFigureSrc(src)) refused.push({ position: i + 1, src });
  });
  return refused;
}

/** What kind of src it is, in words an author can act on. Never the src
 *  itself: an application path in a message makes the client hide the whole
 *  message (redactInternals), and the src is returned alongside it anyway. */
function refusedKind(src: string): string {
  if (!src.trim()) return 'an empty reference';
  const dataType = /^data:([a-z0-9.+/-]{1,40})/i.exec(src);
  if (dataType) return `inline ${dataType[1].toLowerCase()} data`;
  if (/^data:/i.test(src)) return 'inline data';
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(src.trim())) return 'from another site';
  return 'not from the image store';
}

/** The sentence a refused save carries: which images, and what to do. */
export function describeRefusedFigures(refused: RefusedFigure[]): string {
  const named = refused.map((r, i) => `${i === 0 ? 'Image' : 'image'} ${r.position} (${refusedKind(r.src)})`);
  const list =
    named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  const one = refused.length === 1;
  return (
    `${list} ${one ? 'is not an uploaded figure' : 'are not uploaded figures'}. ` +
    'A section can only hold images uploaded to the document (PNG, JPEG or GIF), because only ' +
    'those are shown to every reader as stored and filed with the document. ' +
    `Upload ${one ? 'the image' : 'each image'} or remove it, then save again.`
  );
}
