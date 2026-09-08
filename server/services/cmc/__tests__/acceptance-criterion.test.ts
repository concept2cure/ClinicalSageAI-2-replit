/**
 * How a recorded acceptance criterion becomes a specification limit.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 * A two-sided assay range is normally typed the way the pharmacopoeia prints
 * it: `98.0-102.0%`. The parser pulled numbers with /-?\d+(?:\.\d+)?/g, and on
 * that string the ASCII hyphen separating the bounds was consumed as a MINUS
 * SIGN — so the range read as [98.0, -102.0] and the lower bound taken for the
 * spec limit was -102. A potency that must stay above 98% was compared against
 * minus one hundred and two, which nothing can fail, and the shelf-life
 * estimate ran to the search horizon.
 *
 * It parsed correctly only when the hyphen happened to be spaced, or was an
 * en/em dash. The spaced form is what the earlier tests happened to use.
 *
 * @compliance ICH Q1E — the estimate is only as good as the limit it is against.
 */
import { describe, it, expect } from 'vitest';
import { parseAcceptanceCriterion } from '../recorded-stability';

describe('parseAcceptanceCriterion — two-sided ranges', () => {
  it('reads an unspaced hyphenated range as a range, not as a negative number', () => {
    expect(parseAcceptanceCriterion(['98.0-102.0%'])).toEqual({
      limit: 98, direction: 'decreasing', upperLimit: 102, twoSided: true,
    });
  });

  it('reads every dash the pharmacopoeias and keyboards actually produce', () => {
    for (const text of ['95.0 – 105.0%', '90.0 - 110.0 %', '98.0–102.0%', '98.0—102.0%', '95.0 to 105.0%']) {
      const parsed = parseAcceptanceCriterion([text]);
      expect(parsed, text).toBeTruthy();
      expect(parsed!.limit, text).toBeGreaterThan(0);
      expect(parsed!.twoSided, text).toBe(true);
      expect(parsed!.upperLimit!, text).toBeGreaterThan(parsed!.limit);
    }
  });

  it('keeps a genuinely negative one-sided limit', () => {
    /* The fix must not make every minus sign a range separator: a criterion can
       legitimately be about a negative quantity. */
    expect(parseAcceptanceCriterion(['NLT -5.0 °C'])).toEqual({
      limit: -5, direction: 'decreasing', upperLimit: null, twoSided: false,
    });
  });

  it('still reads the one-sided forms', () => {
    expect(parseAcceptanceCriterion(['NMT 2.0%'])).toEqual({
      limit: 2, direction: 'increasing', upperLimit: null, twoSided: false,
    });
    expect(parseAcceptanceCriterion(['>= 95.0%'])).toEqual({
      limit: 95, direction: 'decreasing', upperLimit: null, twoSided: false,
    });
  });

  it('refuses a range whose bounds cannot be ordered', () => {
    /* Two identical bounds are not a range, and a section that treated them as
       one would report a shelf life against a limit the record does not set. */
    expect(parseAcceptanceCriterion(['100.0-100.0%'])).toBeNull();
  });

  it('refuses text with nothing numeric in it', () => {
    expect(parseAcceptanceCriterion(['Conforms', 'Clear, colourless solution'])).toBeNull();
    expect(parseAcceptanceCriterion([null, undefined, ''])).toBeNull();
  });
});
