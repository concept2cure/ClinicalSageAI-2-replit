/**
 * Shared markdown → safe HTML renderer for chat surfaces.
 *
 * Why this lives in a shared module:
 *   AnaPersistentPanel and the ana/Message component both render
 *   assistant text as inline HTML via `dangerouslySetInnerHTML`. Both
 *   need the same sanitization story or one becomes an XSS sink.
 *   Extracted so the allowlist and the marked → DOMPurify chain stay
 *   in one place.
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
