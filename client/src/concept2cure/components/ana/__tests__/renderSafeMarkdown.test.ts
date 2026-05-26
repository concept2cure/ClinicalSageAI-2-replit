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
import { renderSafeMarkdown, sanitizeChatHtml } from '../renderSafeMarkdown';

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
});
