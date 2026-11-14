/**
 * A study's recorded shelf life against its own ICH Q1E estimate.
 *
 * Walked in the running app on 2026-11-12: the Stability register printed
 * "Q1E estimate 21.9 mo, limited by Assay" beside "Recorded shelf life 24
 * months retest", and said nothing about the two. `checkQ1E` judges a claim
 * against the period the data cover, never against the fit; this is the
 * comparison the register was missing, decided in the engine.
 */
import { describe, expect, it } from 'vitest';

import { judgeRecordedShelfLifeClaim } from '../ich-compliance-q1e';

const fit = (supportedShelfLife: number | null, limitingParameter: string | null = 'Assay') => ({ supportedShelfLife, limitingParameter });

describe('judgeRecordedShelfLifeClaim', () => {
  it('says nothing when no shelf life is recorded', () => {
    expect(judgeRecordedShelfLifeClaim('', fit(21.9))).toBeNull();
    expect(judgeRecordedShelfLifeClaim(null, fit(21.9))).toBeNull();
  });

  // The demo programme's drug-substance study.
  it('names a recorded period longer than the study supports, with both figures and the limiting attribute', () => {
    const j = judgeRecordedShelfLifeClaim('24 months retest', fit(21.9))!;
    expect(j.verdict).toBe('exceeds-estimate');
    expect(j.claimedMonths).toBe(24);
    expect(j.supportedMonths).toBe(21.9);
    expect(j.sentence).toContain('24 months is longer than the 21.9 months');
    expect(j.sentence).toContain('limited by Assay');
  });

  it('reads a claim in years, and with its storage condition', () => {
    expect(judgeRecordedShelfLifeClaim('2 years at 25°C/60% RH', fit(18))!.verdict).toBe('exceeds-estimate');
    expect(judgeRecordedShelfLifeClaim('18 months at 25°C/60% RH', fit(18))!.verdict).toBe('within-estimate');
  });

  it('treats a claim equal to the estimate as within it', () => {
    const j = judgeRecordedShelfLifeClaim('18 months', fit(18, null))!;
    expect(j.verdict).toBe('within-estimate');
    expect(j.sentence).not.toContain('limited by');
  });

  it('does not compare a claim that states no period', () => {
    const j = judgeRecordedShelfLifeClaim('per protocol', fit(21.9))!;
    expect(j.verdict).toBe('not-comparable');
    expect(j.claimedMonths).toBeNull();
    expect(j.sentence).toContain('"per protocol"');
  });

  it('does not call a claim supported when the study could not be fitted', () => {
    const j = judgeRecordedShelfLifeClaim('24 months', fit(null, null))!;
    expect(j.verdict).toBe('not-comparable');
    expect(j.sentence).toContain('not supported by a fit of this study');
  });

  /* It informs; it never refuses. A longer period can rest on other batches. */
  it('never returns a refusal — the close-out stays a person’s decision', () => {
    const j = judgeRecordedShelfLifeClaim('36 months', fit(12))!;
    expect(Object.keys(j).sort()).toEqual(['claim', 'claimedMonths', 'sentence', 'supportedMonths', 'verdict']);
  });
});
