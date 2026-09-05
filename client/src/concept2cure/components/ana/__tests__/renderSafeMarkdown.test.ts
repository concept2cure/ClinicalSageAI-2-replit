/**
 * Verifies the shared chat markdown sanitizer strips every XSS sink the
 * allowlist excludes. The ana/Message and AnaPersistentPanel surfaces
 * both inject the result via dangerouslySetInnerHTML, so a regression
 * here is a direct XSS exposure even with our prod CSP enforcing.
 *
 * CSP nonce + strict-dynamic is the second line of defense; this
 * sanitizer is the first.
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  AUTH_IMG_ATTR,
  renderSafeMarkdown,
  sanitizeAuthoringHtml,
  sanitizeChatHtml,
} from '../renderSafeMarkdown';

describe('renderSafeMarkdown', () => {
  it('renders ordinary markdown into HTML', () => {
    const out = renderSafeMarkdown('# Heading\n\nSome **bold** text.');
    expect(out).toContain('<h1');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('returns empty string for empty input', () => {
    expect(renderSafeMarkdown('')).toBe('');
  });

  it('strips <script> tags inside raw HTML', () => {
    const out = renderSafeMarkdown('hello <script>alert(1)</script> world');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips inline event handlers', () => {
    const out = renderSafeMarkdown('<img src=x onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain('onerror');
  });

  it('strips javascript: URLs from anchors', () => {
    const out = renderSafeMarkdown('[click](javascript:alert(1))');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('strips <iframe> and <object> entirely', () => {
    const iframe = renderSafeMarkdown('<iframe src="http://attacker"></iframe>');
    const object = renderSafeMarkdown('<object data="http://attacker"></object>');
    expect(iframe).not.toContain('<iframe');
    expect(object).not.toContain('<object');
  });

  it('strips <style> tags (CSS injection vector)', () => {
    const out = renderSafeMarkdown('<style>body{display:none}</style>hi');
    expect(out).not.toContain('<style');
  });

  it('keeps safe formatting tags from the allowlist', () => {
    const out = renderSafeMarkdown('a list:\n- one\n- two');
    expect(out).toContain('<ul');
    expect(out).toContain('<li');
  });

  it('keeps href on <a> but strips other attributes', () => {
    const out = renderSafeMarkdown('<a href="https://example.com" onclick="x" id="ok">go</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).not.toContain('onclick');
    expect(out).toContain('id="ok"'); // id is on the ALLOWED_ATTR list
  });

  it('caches identical inputs (idempotent return value)', () => {
    const a = renderSafeMarkdown('# cached');
    const b = renderSafeMarkdown('# cached');
    expect(a).toBe(b);
  });
});

describe('sanitizeChatHtml', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeChatHtml('')).toBe('');
  });

  it('strips <script> tags from HTML input', () => {
    const out = sanitizeChatHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
  });

  it('strips inline event handlers from HTML input', () => {
    const out = sanitizeChatHtml('<button onclick="alert(1)">x</button>');
    expect(out.toLowerCase()).not.toContain('onclick');
  });

  it('still strips <img> — chat stays image-free by design', () => {
    // The authoring variant below allows figures; chat deliberately does not
    // (model/tool-authored chat HTML rendering arbitrary images is a
    // tracking/exfil surface). This test pins the divergence in BOTH configs.
    const out = sanitizeChatHtml('<p>x</p><img src="https://attacker/pixel.png">');
    expect(out).not.toContain('<img');
  });
});

describe('sanitizeAuthoringHtml', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeAuthoringHtml('')).toBe('');
  });

  it('keeps a governed figure reference, moved off src so injection cannot fire an unauthenticated request', () => {
    const out = sanitizeAuthoringHtml(
      '<p>before</p><img src="/api/authoring/images/file_1_ab" alt="Chromatogram"><p>after</p>',
    );
    expect(out).toContain('<img');
    expect(out).toContain(`${AUTH_IMG_ATTR}="/api/authoring/images/file_1_ab"`);
    expect(out).toContain('alt="Chromatogram"');
    // The live src must be GONE — a bare /api/ src 401s without the header
    // and paints a broken glyph before AuthoredHtml can resolve it.
    expect(out).not.toMatch(/\ssrc="\/api\//);
  });

  it('strips a same-app API src OUTSIDE the governed images route — no data-authsrc, no live src', () => {
    // A bare '/api/' rewrite handed ANY stored API path to the authenticated
    // resolver: one author's `<img src="/api/authoring/docs/<other>/audit">`
    // fired a GET with the next viewer's credentials when the document
    // rendered. Only the images route is a figure reference.
    const out = sanitizeAuthoringHtml(
      '<img src="/api/authoring/docs/abc/audit" alt="not a figure">',
    );
    expect(out).not.toContain(AUTH_IMG_ATTR);
    expect(out).not.toMatch(/\ssrc="\/api\//);
    // The element survives (alt text remains in the record) — only the
    // fetchable reference is gone.
    expect(out).toContain('alt="not a figure"');
  });

  it('keeps external https images on src directly (no auth to attach)', () => {
    const out = sanitizeAuthoringHtml('<img src="https://example.com/fig.png" alt="x">');
    expect(out).toContain('src="https://example.com/fig.png"');
    expect(out).not.toContain(AUTH_IMG_ATTR);
  });

  it('keeps data:image URIs (DOMPurify default policy for img)', () => {
    const out = sanitizeAuthoringHtml('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('keeps figure/figcaption structure', () => {
    const out = sanitizeAuthoringHtml(
      '<figure><img src="/api/authoring/images/f1"><figcaption>Figure 1 — stability</figcaption></figure>',
    );
    expect(out).toContain('<figure>');
    expect(out).toContain('<figcaption>Figure 1 — stability</figcaption>');
  });

  it('keeps merged-cell and track-change markup the editor serializes', () => {
    const out = sanitizeAuthoringHtml(
      '<table><tbody><tr><td colspan="2" rowspan="3">m</td></tr></tbody></table><p><ins>added</ins> <del>cut</del> <s>strike</s> <mark>hl</mark></p>',
    );
    expect(out).toContain('colspan="2"');
    expect(out).toContain('rowspan="3"');
    expect(out).toContain('<ins>added</ins>');
    expect(out).toContain('<del>cut</del>');
    expect(out).toContain('<s>strike</s>');
    expect(out).toContain('<mark>hl</mark>');
  });

  it('strips script, event handlers, and javascript: src exactly like the chat path', () => {
    const out = sanitizeAuthoringHtml(
      '<img src="javascript:alert(1)" onerror="alert(1)"><script>alert(1)</script>',
    );
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out).not.toContain('<script');
  });

  it('does not leak the img allowance back into the chat config (hook is scoped)', () => {
    // Run authoring first, then chat — the hook and the wider allowlist must
    // not persist across calls on the shared DOMPurify instance.
    sanitizeAuthoringHtml('<img src="/api/authoring/images/f2">');
    const chat = sanitizeChatHtml('<img src="/api/authoring/images/f2"><p>ok</p>');
    expect(chat).not.toContain('<img');
    expect(chat).not.toContain(AUTH_IMG_ATTR);
    expect(chat).toContain('<p>ok</p>');
  });
});
