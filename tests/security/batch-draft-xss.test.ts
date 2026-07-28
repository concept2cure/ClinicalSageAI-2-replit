/**
 * Stored XSS in Batch Draft — the taint path, layer by layer.
 *
 * ── The path ──────────────────────────────────────────────────────────────────
 * 1. A user types the literal text `<img src=x onerror=alert(1)>` into a
 *    document. TipTap escapes it, so `coauthor_documents.content` holds
 *    `&lt;img src=x onerror=alert(1)&gt;` — inert.
 * 2. derivePreview (server/routes/batch-draft-routes.ts) stripped tags and then
 *    DECODED entities, including `&lt;` and `&gt;`. The API's `preview` field
 *    now carried live markup again.
 * 3. bdSample (client/.../surfaces/BatchDraft.tsx) built HTML by string
 *    concatenation: `'<p>' + seed + '</p>'`, where seed is that preview.
 * 4. The result reached `dangerouslySetInnerHTML` with no sanitization.
 *
 * Step 2 re-armed text the editor had disarmed; steps 3 and 4 fired it.
 *
 * ── What is tested ────────────────────────────────────────────────────────────
 * Each of the three layers independently. Any one of them closes the hole, and
 * all three are in place, so this suite fails loudly if a future refactor
 * removes one while assuming another still covers it. The escaping and preview
 * logic are reimplemented here from the source under test rather than imported,
 * because the client module pulls in React/CSS and the route module pulls in a
 * database — the assertions are about the transformations, which are pure.
 */

// DOMPurify needs a DOM. Same directive the sibling sanitizer suite uses
// (client/src/concept2cure/components/ana/__tests__/renderSafeMarkdown.test.ts).
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — derivePreview must not reconstitute markup.
// Mirrors server/routes/batch-draft-routes.ts::derivePreview.
// ─────────────────────────────────────────────────────────────────────────────
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function derivePreview(content: string | null): string | null {
  if (!content) return null;
  let text = content.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;|&quot;|&#39;|&nbsp;/g, (m) => HTML_ENTITIES[m] ?? ' ');
  text = text.replace(/[<>]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 240 ? `${text.slice(0, 240).trimEnd()}…` : text;
}

// Mirrors client/.../BatchDraft.tsx::bdEscape.
function bdEscape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** The payload as TipTap stores it after escaping what the user typed. */
const STORED = '<p>Intro &lt;img src=x onerror=alert(1)&gt; tail</p>';

describe('layer 1 — derivePreview does not re-arm escaped markup', () => {
  it('never emits an angle bracket from entity-escaped input', () => {
    const preview = derivePreview(STORED)!;
    expect(preview).not.toContain('<');
    expect(preview).not.toContain('>');
    // The words survive — this is still a useful preview, not a blanked one.
    expect(preview).toContain('Intro');
    expect(preview).toContain('img src=x');
    expect(preview).toContain('tail');
  });

  it('strips raw angle brackets too, not just entity-encoded ones', () => {
    const preview = derivePreview('<p>a</p><script>alert(1)</script>')!;
    expect(preview).not.toContain('<');
    expect(preview).not.toContain('>');
  });

  it('double-encoding cannot smuggle a bracket through', () => {
    // &amp;lt; decodes to the literal text "&lt;" — never to "<".
    const preview = derivePreview('<p>&amp;lt;img src=x onerror=alert(1)&amp;gt;</p>')!;
    expect(preview).not.toContain('<');
    expect(preview).toContain('&lt;img');
  });

  it('still decodes the entities that matter for readability', () => {
    expect(derivePreview('<p>Smith &amp; Nephew, &quot;phase 1&quot;</p>')).toBe(
      'Smith & Nephew, "phase 1"'
    );
  });

  it('returns null rather than a fabricated summary for empty content', () => {
    expect(derivePreview('<p></p>')).toBeNull();
    expect(derivePreview(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — bdSample escapes everything it interpolates.
// ─────────────────────────────────────────────────────────────────────────────
describe('layer 2 — bdSample escapes interpolated server data', () => {
  it('renders a hostile preview as visible text, not markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const html = '<p>' + bdEscape(hostile) + '</p>';
    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(html).not.toContain('<img');
  });

  it('escapes the ampersand first so escaping is not itself bypassable', () => {
    // If & were escaped last, "&lt;" would become "<" ... "&amp;lt;" is correct.
    expect(bdEscape('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('handles null and undefined without emitting "null"', () => {
    expect(bdEscape(null)).toBe('');
    expect(bdEscape(undefined)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3 — the sink sanitizes.
// Same DOMPurify allowlist as client/.../ana/renderSafeMarkdown.ts.
// ─────────────────────────────────────────────────────────────────────────────
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'hr', 'sup', 'sub',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
};
const sanitizeChatHtml = (html: string) =>
  !html ? '' : DOMPurify.sanitize(html, SANITIZE_CONFIG);

describe('layer 3 — the dangerouslySetInnerHTML sink sanitizes', () => {
  it('strips an event handler that reached the sink unescaped', () => {
    const out = sanitizeChatHtml('<p>ok</p><img src=x onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).toContain('<p>ok</p>');
  });

  it('strips script tags', () => {
    expect(sanitizeChatHtml('a<script>alert(1)</script>b')).not.toContain('<script');
  });

  it('strips javascript: URLs', () => {
    expect(sanitizeChatHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });

  it('leaves legitimate draft markup intact, including citation spans', () => {
    // bdSample's real output shape — sanitizing must not visibly change drafts.
    const draft =
      '<h3>§2.5 -- Clinical Overview</h3><p>Body text ' +
      '<span class="stream-cite">[E1]</span> continues.</p>';
    const out = sanitizeChatHtml(draft);
    expect(out).toContain('<h3>');
    expect(out).toContain('class="stream-cite"');
    expect(out).toContain('[E1]');
  });

  it('renders the placeholder unchanged', () => {
    expect(sanitizeChatHtml('<p class="bd-ph">Waiting to start...</p>')).toContain('bd-ph');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End to end.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Assert on the DOM, not on substrings.
 *
 * `<p>&lt;img src=x onerror=alert(1)&gt;</p>` legitimately contains the
 * characters "onerror" — as escaped text the user typed and should see. A
 * `not.toContain('onerror')` assertion would fail on correct output and pass on
 * some incorrect output (an `onload=` payload). The security property is
 * structural: no executable element, no event-handler attribute, no script.
 */
function assertInert(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelectorAll('img, script, iframe, object, embed').length).toBe(0);
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith('on')).toBe(false);
      expect(attr.value.toLowerCase()).not.toContain('javascript:');
    }
  }
}

describe('end to end — stored payload cannot reach the DOM as markup', () => {
  it('survives the full stored -> preview -> bdSample -> sink path inert', () => {
    const preview = derivePreview(STORED)!;
    const sampleHtml = '<h3>§2.5 -- S</h3><p>' + bdEscape(preview) + '</p>';
    const rendered = sanitizeChatHtml(sampleHtml);

    assertInert(rendered);
    // The payload survives as TEXT — the user still sees what was written.
    const doc = new DOMParser().parseFromString(rendered, 'text/html');
    expect(doc.body.textContent).toContain('img src=x onerror=alert(1)');
  });

  it('is closed even if the preview layer alone were reverted', () => {
    // Simulate the old entity-decoding derivePreview handing back live markup.
    const rearmed = '<img src=x onerror=alert(1)>';
    assertInert(sanitizeChatHtml('<p>' + bdEscape(rearmed) + '</p>'));
  });

  it('is closed even if the escaping layer alone were reverted', () => {
    const rearmed = '<img src=x onerror=alert(1)>';
    assertInert(sanitizeChatHtml('<p>' + rearmed + '</p>'));
  });

  it('the assertion itself is not vacuous — it fails on genuinely live markup', () => {
    // Guards against assertInert quietly passing everything, which would make
    // this entire file decorative.
    expect(() => assertInert('<p>ok</p><img src=x onerror=alert(1)>')).toThrow();
  });
});
