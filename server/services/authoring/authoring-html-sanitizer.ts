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
 * or attribute are removed. Same-app `/api/` image references are left as the
 * editor stores them — the client rewrites them to `data-authsrc` at render.
 */

import DOMPurifyImport from 'isomorphic-dompurify';

// isomorphic-dompurify ships a CommonJS default; under both tsx and the
// production bundle the callable is reached this way (see routes/c2c/shared.ts).
const DOMPurify = ((DOMPurifyImport as unknown as { default?: unknown }).default ??
  DOMPurifyImport) as { sanitize: (html: string, cfg: Record<string, unknown>) => string };

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

/**
 * Sanitize one section's HTML for storage. Empty input stays empty; the
 * result is the DOMPurify output and nothing else — no wrapping, no
 * normalisation, so a section that was already clean round-trips.
 */
export function sanitizeAuthoringSectionHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...AUTHORING_SANITIZE_CONFIG.ALLOWED_TAGS],
    ALLOWED_ATTR: [...AUTHORING_SANITIZE_CONFIG.ALLOWED_ATTR],
  });
}
