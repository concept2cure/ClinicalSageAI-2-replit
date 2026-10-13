/**
 * A roster key reaches a regex ESCAPED, from every consumer.
 *
 * ── What this pins, and why a document-level test cannot ────────────────────
 * `rosterOf(text)` builds the arm roster out of DOCUMENT TEXT, and three places
 * then interpolate those keys into `new RegExp`: `armSource`, `armRef`'s arm
 * pattern, and the dose loop inside `rosterOf`. Until 2026-10-13 only the first
 * escaped regex metacharacters; the other two applied the `\s+` normalisation
 * and interpolated the key raw. Semgrep flagged all three
 * (javascript.lang.security.audit.detect-non-literal-regexp) and was right to.
 *
 * Nothing was exploitable, and the reason is the point: the capture class
 *
 *     W = (Drug\s+[A-Z]|[A-Za-z][a-z]{4,}|[A-Z]{5,})
 *
 * admits letters and one space, so no key can hold `(`, `[`, `*` or `\`. That
 * invariant lives ~90 lines from two of the three consumers, and those two
 * disagreed about relying on it. Widening `W` — to admit a hyphen, a digit, a
 * parenthesised synonym — would turn a vocabulary change into a `SyntaxError`
 * on a legitimate document, or a catastrophic pattern on a hostile one.
 *
 * Which is why a document-driven test proves nothing here: `W` will not let a
 * document produce the input that breaks. So the escaping contract is pinned
 * directly, and a final case pins that all three sites go through it — that is
 * the property that stops the drift recurring.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { rosterKeyPattern } from '../clinical-claims/doc';

const DOC_TS = path.join(__dirname, '..', 'clinical-claims', 'doc.ts');

describe('rosterKeyPattern', () => {
  it('escapes every regex metacharacter, so a key matches as text', () => {
    for (const key of ['drug (x)', 'a+b', 'dose[1]', 'c*d', 'e?f', 'g^h', 'i$j', 'k{2}l', 'm|n', 'o.p', 'q\\r']) {
      const re = new RegExp(`^(?:${rosterKeyPattern(key)})$`, 'i');
      expect(re.test(key), `${key} should match itself literally`).toBe(true);
    }
  });

  it('does not throw on a key that would be an invalid pattern raw', () => {
    // Raw, a lone `(` is "Unterminated group" — the SyntaxError a widened W
    // would have produced at armRef's call site, on a legitimate document.
    //
    // The key goes through a variable rather than being written inline: as a
    // literal, `new RegExp('drug (')` is an ESLint `no-invalid-regexp` ERROR,
    // and rightly so — a statically invalid pattern is a bug everywhere except
    // in the one assertion that exists to show it throws.
    const key = 'drug (';
    expect(() => new RegExp(rosterKeyPattern(key))).not.toThrow();
    expect(() => new RegExp(key)).toThrow();
  });

  it('keeps whitespace runs flexible, which is the behaviour it replaced', () => {
    expect(new RegExp(`^${rosterKeyPattern('drug x')}$`, 'i').test('drug   x')).toBe(true);
    expect(new RegExp(`^${rosterKeyPattern('drug x')}$`, 'i').test('drugx')).toBe(false);
  });

  it('does not let a metacharacter act as a pattern', () => {
    // `a+` raw matches 'aaa'; escaped it matches only the literal 'a+'.
    const re = new RegExp(`^(?:${rosterKeyPattern('a+')})$`);
    expect(re.test('a+')).toBe(true);
    expect(re.test('aaa')).toBe(false);
  });

  it('is the ONLY way a roster key reaches a RegExp in doc.ts', () => {
    // The structural half. Three sites drifted apart once; this fails if a
    // fourth is added, or if one reverts to its own inline escape.
    const src = fs.readFileSync(DOC_TS, 'utf8');
    const interpolations = [...src.matchAll(/\$\{[^}]*(?:roster\.keys\(\)|arm\.drug)[^}]*\}/g)].map((m) => m[0]);

    expect(interpolations.length, 'doc.ts should still interpolate roster keys somewhere').toBeGreaterThan(0);
    for (const frag of interpolations) {
      expect(frag, `a roster key reaches a pattern without rosterKeyPattern: ${frag}`).toContain('rosterKeyPattern');
    }

    // And the metacharacter escape exists exactly once, in the helper.
    const inlineEscapes = [...src.matchAll(/\[\.\*\+\?\^\$\{\}\(\)\|\[/g)];
    expect(inlineEscapes.length, 'the metacharacter escape should exist once, in rosterKeyPattern').toBe(1);
  });
});
