/**
 * Refute-review probe for claim (5): looksLikeHtml answers as the old
 * allowlist regex did, in linear time. A broader alphabet than the commit's
 * own test (upper case, CR, tab, NUL, non-ASCII, every character of every tag
 * name), longer strings, and adversarial timing shapes.
 */
import { describe, it, expect } from 'vitest';
import { looksLikeHtml } from './tree/shared/authoring/plain-text-html';

const FROZEN =
  /<\/?(p|div|br|h[1-6]|ul|ol|li|dl|dt|dd|b|strong|i|em|u|s|strike|ins|del|span|table|caption|thead|tbody|tfoot|tr|td|th|blockquote|pre|a|img|hr|sub|sup|mark|code|font|section|article|figure|figcaption)\b[^>]*>/i;

describe('claim (5): equivalence on a broader alphabet', () => {
  it('2,000,000 generated strings', () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const ALPHABET = [...'<<<>>/ PpAaBbDdLlIiVvHh16xX\n\r\t"=-_.:éſK', '\u0000', 'K', 'figcaption', 'blockquote', 'strong', 'thead', 'sup'];
    let diffs = 0;
    let trues = 0;
    for (let n = 0; n < 2_000_000; n++) {
      const len = 1 + Math.floor(next() * 40);
      let s = '';
      for (let k = 0; k < len; k++) s += ALPHABET[Math.floor(next() * ALPHABET.length)];
      const a = looksLikeHtml(s);
      if (a) trues++;
      if (a !== FROZEN.test(s)) {
        diffs++;
        expect(a, `differs on ${JSON.stringify(s)}`).toBe(FROZEN.test(s));
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[C5] 2,000,000 strings, ${trues} read as HTML, ${diffs} differences`);
    expect(diffs).toBe(0);
  });
});

describe('claim (5): linear time on adversarial shapes (400,000 chars)', () => {
  const N = 200_000;
  it.each([
    ['openers failing at \\b, then a >', `${'<pX'.repeat(N / 1.5)}>`],
    ['partial long names', `${'<blockquotX'.repeat(N / 5.5)}>`],
    ['"</" runs', `${'</'.repeat(N)}>`],
    ['"<" runs', `${'<'.repeat(2 * N)}>`],
    ['h7 openers', `${'<h7'.repeat(N / 1.5)}>`],
    ['valid opener at the very start, > at the end', `<p ${'x'.repeat(2 * N)}>`],
    ['many > and failing openers interleaved', `${'<px>'.repeat(N / 2)}`],
    ['the old pathological case, `<a` with no >', '<a'.repeat(N)],
    ['`<a` then a > far away', `${'<a'.repeat(N)}>`],
  ])('%s', (_, s) => {
    const t0 = performance.now();
    const a = looksLikeHtml(s);
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[C5 timing] ${_}: ${ms.toFixed(1)} ms, answer ${a}, frozen-equivalent ${s.length < 50_000 ? a === FROZEN.test(s) : 'skipped (frozen is quadratic)'}`);
    expect(ms).toBeLessThan(500);
  });
});
