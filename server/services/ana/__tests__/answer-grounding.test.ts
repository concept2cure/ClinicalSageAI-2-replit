/**
 * Tests for answer-grounding — the self-verification round that catches AnA
 * fabricating trial identifiers or quoting source text that is not in the
 * evidence she actually gathered this turn.
 *
 * This is the deterministic anti-hallucination guard: it must flag a fabricated
 * NCT id or invented quote, and must never false-positive when there is nothing
 * to check against (no tools ran) or when the claim genuinely appears in the
 * evidence.
 */
import { describe, it, expect } from 'vitest';
import { verifyAnswerGrounding } from '../answer-grounding.js';

describe('verifyAnswerGrounding — no-op cases (nothing to ground)', () => {
  it('returns a clean no-op when the answer is empty', () => {
    const r = verifyAnswerGrounding('', 'NCT01234567 was the pivotal trial');
    expect(r).toEqual({ checked: 0, grounded: 0, unsupported: [], ratio: 1 });
  });

  it('returns a clean no-op when there is no evidence corpus', () => {
    const r = verifyAnswerGrounding('See NCT01234567 for details', '');
    expect(r.checked).toBe(0);
    expect(r.ratio).toBe(1);
  });

  it('treats whitespace-only evidence as no evidence', () => {
    const r = verifyAnswerGrounding('See NCT01234567 for details', '   \n  ');
    expect(r.checked).toBe(0);
    expect(r.ratio).toBe(1);
  });
});

describe('verifyAnswerGrounding — trial identifiers', () => {
  it('grounds an NCT id that appears verbatim in the evidence', () => {
    const r = verifyAnswerGrounding(
      'The pivotal study was NCT01234567.',
      'Tool result: trial NCT01234567 enrolled 412 patients.'
    );
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
    expect(r.unsupported).toHaveLength(0);
    expect(r.ratio).toBe(1);
  });

  it('flags a fabricated NCT id as unsupported', () => {
    const r = verifyAnswerGrounding(
      'Per NCT99999999 the endpoint was met.',
      'Tool result: trial NCT01234567 enrolled 412 patients.'
    );
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(0);
    expect(r.unsupported).toEqual([{ kind: 'nct', text: 'NCT99999999' }]);
    expect(r.ratio).toBe(0);
  });

  it('matches NCT ids case-insensitively', () => {
    const r = verifyAnswerGrounding(
      'The trial nct01234567 is relevant.',
      'NCT01234567 is in the corpus.'
    );
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
  });

  it('de-duplicates a repeated NCT id into a single check', () => {
    const r = verifyAnswerGrounding(
      'NCT01234567 and again NCT01234567 confirm this.',
      'unrelated evidence corpus'
    );
    expect(r.checked).toBe(1);
    expect(r.unsupported).toHaveLength(1);
  });
});

describe('verifyAnswerGrounding — quoted source text', () => {
  it('grounds a quote that appears in the evidence (normalized match)', () => {
    const r = verifyAnswerGrounding(
      'The report says "the primary endpoint was overall survival".',
      'Document excerpt: the primary endpoint was overall survival at 12 months.'
    );
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(1);
    expect(r.ratio).toBe(1);
  });

  it('flags an invented quote not present in the evidence', () => {
    const r = verifyAnswerGrounding(
      'AnA wrote "this device reduces mortality by forty percent".',
      'Unrelated evidence about packaging and shelf life.'
    );
    expect(r.checked).toBe(1);
    expect(r.grounded).toBe(0);
    expect(r.unsupported[0].kind).toBe('quote');
  });

  it('ignores quotes too short to be meaningful (under 20 inner chars)', () => {
    const r = verifyAnswerGrounding('The label reads "too short here".', 'some evidence');
    expect(r.checked).toBe(0);
    expect(r.ratio).toBe(1);
  });

  it('skips a long single-token quote (no whitespace to ground)', () => {
    const token = 'a'.repeat(24); // 24 chars, captured by the regex but a single token
    const r = verifyAnswerGrounding(`The code is "${token}".`, 'evidence corpus here');
    expect(r.checked).toBe(0);
  });

  it('truncates a long unsupported quote to 80 chars with an ellipsis', () => {
    const longInner =
      'this is a deliberately long invented passage that should be truncated when reported back to the caller';
    const r = verifyAnswerGrounding(`She claimed "${longInner}".`, 'nothing relevant here');
    expect(r.unsupported).toHaveLength(1);
    expect(r.unsupported[0].text).toHaveLength(80);
    expect(r.unsupported[0].text.endsWith('…')).toBe(true);
  });
});

describe('verifyAnswerGrounding — mixed claims and ratio', () => {
  it('computes a partial ratio when some claims ground and others do not', () => {
    const r = verifyAnswerGrounding(
      'NCT01234567 reported that "the primary endpoint was overall survival".',
      'Corpus mentions NCT01234567 but never describes the endpoint.'
    );
    expect(r.checked).toBe(2);
    expect(r.grounded).toBe(1);
    expect(r.ratio).toBe(0.5);
    expect(r.unsupported).toHaveLength(1);
    expect(r.unsupported[0].kind).toBe('quote');
  });
});
