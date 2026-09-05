/**
 * Evidence validation — the verdict must now carry the *specific* claims it
 * flagged (ungrounded / overclaim / contradiction), not just counts, so the
 * client can let a reviewer see which claims are weak. These tests lock the
 * itemized `flagged_claims` behaviour and guard the existing counts against
 * regression.
 */

import { describe, it, expect } from 'vitest';
import { validateEvidence } from '../evidence-validation';
import { buildTrustSummary } from '../response-contract';

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

  it('reports a short response as UNASSESSED, not as verified', () => {
    /* This test used to assert `v.validated === true` — it pinned the defect
       in place. The shortcut returned `attempted: true, validated: true` with
       every count zero, under the comment "Short responses get a quick pass —
       no claims to validate". That is an assumption about LENGTH dressed as a
       finding about CONTENT: "21 CFR 314.50(d)(5)(vi)(a) requires an
       integrated summary of safety" is a whole regulatory claim in 78
       characters.

       Downstream it became a green check reading "Claims grounded" and a trust
       line reading "Verified · 0 grounded · 0 weak · 0 missing · 0 sources" —
       the platform telling someone drafting a submission that an answer's
       claims had been checked and were sound, when the grounding pipeline had
       not run.

       Declining to judge a fragment is fine; the extractors want sentence
       structure. Reporting the declined judgement as a pass is not. */
    const v = validateEvidence('Looks good.', 'ana-ri');
    expect(v.attempted, 'claimed the evidence check ran on a fragment').toBe(false);
    expect(v.validated, 'claimed an unassessed answer was verified').toBe(false);
    expect(v.flagged_claims).toBeUndefined();
  });

  it('a short response carrying a real regulatory claim is not called verified', () => {
    /* The concrete case the length assumption gets wrong. */
    const v = validateEvidence(
      '21 CFR 314.50(d)(5)(vi)(a) requires an integrated summary of safety.',
      'ana-ri',
    );
    expect(v.validated).toBe(false);
    expect(v.attempted).toBe(false);
  });

  it('says the check was not run, in the words the user actually sees', () => {
    /* The verdict only matters through what it renders. `buildTrustSummary`
       keys on `attempted`, so this is the sentence the surface now shows. */
    const summary = buildTrustSummary(validateEvidence('Looks good.', 'ana-ri'));
    expect(summary).toMatch(/not run/i);
    expect(summary).not.toMatch(/\bVerified\b/);
  });

  it('still verifies a long, well-grounded answer — the working path', () => {
    /* The fix must not turn everything into "not assessed". A response above
       the floor is still assessed and can still pass. */
    const v = validateEvidence(
      pad('[KNOWN] 21 CFR 314.50 requires an integrated summary of safety.'),
      'ana-ri',
    );
    expect(v.attempted).toBe(true);
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

  it('does NOT validate a self-contradictory response even when claims are grounded', () => {
    // One grounded claim (nearby [KNOWN]) plus an internal contradiction. The
    // ungrounded ratio is 0, but a contradiction is a categorical failure and
    // must not pass validation — guards against the ratio-fallback fail-open.
    const answer = pad(
      'The submission is required to include a risk analysis [KNOWN: per 21 CFR 814]. ' +
        'The data is sufficient to support the indication. However, there is a clear data gap ' +
        'and the data is insufficient for review.'
    );
    const v = validateEvidence(answer, 'ana-ri');

    expect(v.flagged_claims!.some(c => c.kind === 'contradiction')).toBe(true);
    expect(v.weak_or_ungrounded_claim_count).toBe(0); // ratio fallback would have passed
    expect(v.validated).toBe(false);
  });
});
