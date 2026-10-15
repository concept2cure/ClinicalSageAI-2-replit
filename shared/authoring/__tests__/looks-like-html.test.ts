/**
 * looksLikeHtml answers in linear time, and answers exactly as it always did.
 *
 * The rule decides whether a section's stored content is HTML or plain text
 * for every reader of it: the section editor, the authoring export, and the
 * batch-draft accept's lineage on every save that carries machine text. Its
 * pattern ends in `[^>]*>`, and every `<a` (or `<p`, `<b` …) with no `>` after
 * it re-scanned the rest of the string: quadratic. 80,000 characters of `<a`
 * took about three seconds and a 400,000-character section, the accept's
 * limit, about seventy, on the server's one event loop (periodic review
 * 2026-09-28, editor family, the batch-draft accept, round 3).
 *
 * A tag needs a `>` after its name, so nothing after the string's last `>`
 * can start one; the pattern runs on the prefix that ends there, where every
 * scan stops at a `>`. The answer is unchanged, which the equivalence test
 * below asserts against a frozen copy of the pattern as it was.
 */
import { describe, it, expect } from 'vitest';
import { looksLikeHtml } from '../plain-text-html';

/** The rule as it was before the prefix, frozen: the reference for every answer. */
const FROZEN =
  /<\/?(p|div|br|h[1-6]|ul|ol|li|dl|dt|dd|b|strong|i|em|u|s|strike|ins|del|span|table|caption|thead|tbody|tfoot|tr|td|th|blockquote|pre|a|img|hr|sub|sup|mark|code|font|section|article|figure|figcaption)\b[^>]*>/i;

describe('looksLikeHtml in linear time', () => {
  it.each([
    ['400,000 characters of `<a` with no `>`', '<a'.repeat(200_000)],
    ['the same after a `>`', `>${'<p'.repeat(200_000)}`],
    ['the same before a `>` at the very end', `${'<b'.repeat(200_000)} >`],
  ])('%s', (_, stored) => {
    const started = performance.now();
    looksLikeHtml(stored);
    expect(performance.now() - started, 'quadratic: every opener re-scanned the rest').toBeLessThan(1_000);
  });
});

describe('looksLikeHtml answers as the frozen rule does', () => {
  it('on 200,000 generated strings built from the characters the rule reads', () => {
    // A small deterministic generator, so a failure names a reproducible input.
    let seed = 20261004;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const ALPHABET = ['<', '>', '/', 'p', 'a', 'b', 'd', 'l', 'i', 'v', 'h', '1', 'x', ' ', '\n', '"', '='];
    for (let n = 0; n < 200_000; n++) {
      const len = 1 + Math.floor(next() * 24);
      let s = '';
      for (let k = 0; k < len; k++) s += ALPHABET[Math.floor(next() * ALPHABET.length)];
      if (looksLikeHtml(s) !== FROZEN.test(s)) {
        expect(looksLikeHtml(s), `differs from the frozen rule on ${JSON.stringify(s)}`).toBe(FROZEN.test(s));
      }
    }
  });

  it.each([
    ['<p>Text.</p>', true],
    ['<dl><dt>AE</dt><dd>Adverse Event</dd></dl>', true],
    ['temperature <critical> threshold exceeded', false],
    ['the value is <= 10 and >= 2', false],
    ['a <p', false],
    ['a <p >', true],
    ['<P CLASS="x">', true],
    ['', false],
  ])('%j → %s', (stored, expected) => {
    expect(looksLikeHtml(stored)).toBe(expected);
    expect(FROZEN.test(stored)).toBe(expected);
  });
});
