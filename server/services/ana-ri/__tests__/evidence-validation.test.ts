/**
 * Evidence validation — the verdict must now carry the *specific* claims it
 * flagged (ungrounded / overclaim / contradiction), not just counts, so the
 * client can let a reviewer see which claims are weak. These tests lock the
 * itemized `flagged_claims` behaviour and guard the existing counts against
 * regression.
 */

import { describe, it, expect } from 'vitest';
import { validateEvidence } from '../evidence-validation';

// Long enough to clear MIN_VALIDATION_LENGTH (200 chars).
const pad = (s: string) => s + ' ' + 'Context follows. '.repeat(20);

describe('validateEvidence — itemized flagged claims', () => {
  it('surfaces ungrounded regulatory claims with their text', () => {
    const answer = pad(
      'The submission is required to include a full risk analysis. ' +
        'No evidence labels appear anywhere near this assertion.'
    );
    const v = validateEvidence(answer, 'ana-ri');

    expect(v.weak_or_ungrounded_claim_count).toBeGreaterThan(0);
    expect(v.flagged_claims).toBeDefined();
    expect(v.flagged_claims!.length).toBeGreaterThan(0);
    expect(v.flagged_claims!.some(c => c.kind === 'ungrounded')).toBe(true);
    // The flagged text is the offending claim, not an empty placeholder.
    expect(v.flagged_claims!.every(c => c.text.trim().length > 0)).toBe(true);
  });

  it('surfaces overclaims using strong language without [KNOWN] backing', () => {
    const answer = pad(
      'This provides conclusive evidence that the device is safe. ' +
        'There is no risk to any patient population.'
    );
    const v = validateEvidence(answer, 'ana-ri');

    expect(v.flagged_claims).toBeDefined();
    expect(v.flagged_claims!.some(c => c.kind === 'overclaim')).toBe(true);
  });

  it('surfaces internal contradictions', () => {
    const answer = pad(
      'The data is sufficient to support the indication. ' +
        'However, there is a clear data gap and the data is insufficient for review.'
    );
    const v = validateEvidence(answer, 'ana-ri');

    expect(v.flagged_claims).toBeDefined();
    expect(v.flagged_claims!.some(c => c.kind === 'contradiction')).toBe(true);
  });

  it('omits flagged_claims when claims are grounded by nearby labels', () => {
    const answer = pad(
      'The submission is required to include a risk analysis [KNOWN: per 21 CFR 814]. ' +
        'FDA requires a clinical summary [KNOWN: ICH M4E].'
    );
    const v = validateEvidence(answer, 'ana-ri');

    // Grounded claims carry a nearby [KNOWN] label, so nothing is flagged.
    expect(v.grounded_claim_count).toBeGreaterThan(0);
    expect(v.flagged_claims).toBeUndefined();
  });

  it('passes short responses without flagging', () => {
    const v = validateEvidence('Looks good.', 'ana-ri');
    expect(v.validated).toBe(true);
    expect(v.flagged_claims).toBeUndefined();
  });

  it('bounds the flagged list and trims long claims', () => {
    // Many distinct ungrounded claims; the list must stay capped.
    const manyClaims = Array.from({ length: 20 }, (_, i) =>
      `Requirement ${i}: the applicant must include section ${i} per 21 CFR for completeness.`
    ).join(' ');
    const v = validateEvidence(pad(manyClaims), 'ana-ri');

    expect(v.flagged_claims).toBeDefined();
    expect(v.flagged_claims!.length).toBeLessThanOrEqual(8);
    expect(v.flagged_claims!.every(c => c.text.length <= 181)).toBe(true);
  });

  it('does not flag the same claim text twice', () => {
    const answer = pad(
      'The applicant must include a risk analysis. The applicant must include a risk analysis.'
    );
    const v = validateEvidence(answer, 'ana-ri');
    const texts = (v.flagged_claims ?? []).map(c => c.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});
