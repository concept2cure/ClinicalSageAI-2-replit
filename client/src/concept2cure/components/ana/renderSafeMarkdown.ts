/**
 * Markdown → safe HTML renderer for the AnA chat surface.
 *
 * Why this lives in a separate module:
 *   The ana/Message component renders assistant text as inline HTML via
 *   `dangerouslySetInnerHTML`, so it needs a single, audited sanitization
 *   story or it becomes an XSS sink. The allowlist and the
 *   marked → DOMPurify chain stay here, in one place.
 *
 * Sanitization model:
 *   1. `marked.parse(content)` converts user/assistant markdown to HTML.
 *      Markdown can include raw HTML, so the output may contain
 *      arbitrary tags and attributes.
 *   2. `DOMPurify.sanitize(html, SANITIZE_CONFIG)` reduces the HTML to
 *      a whitelist of formatting tags. `<script>`, inline event
 *      handlers, `javascript:` URLs, and unknown attributes are
 *      stripped. CSP is the second line of defense; sanitization is
 *      the first.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'b',
    'i',
    'u',
    'a',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'pre',
    'code',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'span',
    'div',
    'hr',
    'sup',
    'sub',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
};

/* ── Authored section HTML — the document-view variant ──────────────────────
 *
 * Same audited module, second config, one deliberate difference: figures.
 * Section HTML written by the canonical editor stores images as governed
 * references (`<img src="/api/authoring/images/<id>">`), and a read-only view
 * that strips them shows a DIFFERENT document from the one the author signed —
 * the silent-loss class this platform bans. Chat stays image-free on purpose
 * (model/tool-authored chat HTML rendering arbitrary external images is a
 * tracking/exfil surface); authored sections carry their figures.
 *
 * The extra tags are the editor's own serialization set: img (the figure
 * reference), figure/figcaption (legacy stored content), caption (a table's
 * own), s/mark (strike and highlight marks), ins/del (track changes), and
 * colspan/rowspan so merged table cells don't silently un-merge in the read
 * view.
 *
 * `caption` was missing, and a missing tag here DELETES CONTENT: DOMPurify
 * strips the element and its text, so a table's caption — the label a reviewer
 * navigates by — was absent from every read-only view of a document whose
 * editor and whose exported DOCX and PDF all show it. Same silent-loss class
 * as the stripped figure above, and the same fix.
 *
 * API image references are rewritten `src` → `data-authsrc` during
 * sanitization: every API route authenticates by Authorization header only,
 * so a bare <img src="/api/…"> would fire an unauthenticated request and
 * paint a broken glyph. The companion renderer (v2/editor/AuthoredHtml)
 * resolves data-authsrc through the app's authenticated fetch — the same
 * path the editor's node view uses — and states a failure instead of hiding
 * it. External http(s) and data:image URIs pass through DOMPurify's default
 * URI policy untouched, matching what the editor itself displays.
 */
const AUTHORING_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    ...SANITIZE_CONFIG.ALLOWED_TAGS,
    'img',
    'figure',
    'figcaption',
    'caption',
    's',
    'mark',
    'ins',
    'del',
  ],
  ALLOWED_ATTR: [...SANITIZE_CONFIG.ALLOWED_ATTR, 'src', 'alt', 'colspan', 'rowspan'],
};

/** The attribute AuthoredHtml resolves through the authenticated fetch. */
export const AUTH_IMG_ATTR = 'data-authsrc';

/** The ONE same-app route a stored figure reference may point at (POST
 *  /api/authoring/images returns it; GET serves it). Everything under /api/
 *  that is NOT this prefix must never reach the authenticated resolver — a
 *  bare '/api/' test let any API path one author stored in section HTML be
 *  fetched with the NEXT VIEWER's credentials when the document rendered. */
export const AUTHORING_IMAGE_URL_PREFIX = '/api/authoring/images/';

// Bounded LRU so the chat panel doesn't recompute identical markdown
// every render during streaming. 200 entries ≈ one long conversation.
const MD_CACHE_MAX = 200;
const cache = new Map<string, string>();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Render markdown to HTML safe to inject via dangerouslySetInnerHTML.
 * Cached; falsy/empty input returns ''.
 */
export function renderSafeMarkdown(content: string): string {
  if (!content) return '';

  const cached = cache.get(content);
  if (cached !== undefined) return cached;

  let result: string;
  try {
    const rawHtml = marked.parse(content) as string;
    result = DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
  } catch {
    result = escapeHtml(content);
  }

  if (cache.size >= MD_CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(content, result);
  return result;
}

/**
 * Sanitize an already-rendered HTML fragment using the same allowlist.
 * Use when a caller hands you HTML rather than markdown (e.g. server-
 * stored chat messages that arrive as HTML).
 */
export function sanitizeChatHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

/**
 * Sanitize authored section HTML for read-only rendering (document view,
 * batch-draft cards). Keeps figures; rewrites same-app API image references
 * to `data-authsrc` so nothing fires an unauthenticated image request — see
 * AUTHORING_SANITIZE_CONFIG above for the full rationale. Render the result
 * with `AuthoredHtml` (v2/editor/AuthoredHtml), which resolves the references
 * with auth and states failures; a bare dangerouslySetInnerHTML of this
 * output shows figures only for external/data sources.
 */
export function sanitizeAuthoringHtml(html: string): string {
  if (!html) return '';
  // Hook scoped to this call: registered, used, removed — DOMPurify hooks are
  // instance-global, so the try/finally keeps chat sanitization unaffected.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') ?? '';
      if (src.startsWith(AUTHORING_IMAGE_URL_PREFIX)) {
        node.setAttribute(AUTH_IMG_ATTR, src);
        node.removeAttribute('src');
      } else if (src.startsWith('/api/')) {
        // Any OTHER same-app API path is not a figure reference: never leave
        // it for the browser to fire as a native (cookie-carrying) request,
        // and never hand it to the authenticated resolver either.
        node.removeAttribute('src');
      }
    }
  });
  try {
    return DOMPurify.sanitize(html, AUTHORING_SANITIZE_CONFIG);
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
