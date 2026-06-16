/**
 * CSR-grounded evidence extraction — unit tests.
 *
 * The extractor must emit observations on a benefit-positive scale (positive =
 * benefit), consistent with the continuous shapes and `buildEffectPrior`'s
 * plannedEffect. The regression guard is the ratio (HR/OR) shape: a hazard ratio
 * is intrinsically "lower = benefit", so a beneficial ratio (< 1) must yield a
 * POSITIVE log effect — not the negative value that `log(ratio)` gives directly.
 */
import { describe, it, expect } from 'vitest';
import { extractEffectObservation } from '../csr-evidence-source';

const baseReport = {
  reportId: 'CSR-1',
  reportTitle: 'A prior study',
  indication: 'NSCLC',
  phase: 'Phase 3',
  nctId: 'NCT00000001',
  sampleSize: 400,
};

describe('extractEffectObservation — ratio (HR/OR) shape', () => {
  it('maps a beneficial hazard ratio (<1) to a POSITIVE benefit-oriented log effect', () => {
    // HR 0.70 with CI [0.55, 0.89] is a clear survival benefit.
    const detail = { results: { hazardRatio: 0.7, ci: [0.55, 0.89] } };
    const obs = extractEffectObservation(baseReport, detail);

    expect(obs).not.toBeNull();
    // Benefit-positive convention: a beneficial HR must be a positive effect.
    expect(obs!.effect).toBeGreaterThan(0);
    expect(obs!.effect).toBeCloseTo(-Math.log(0.7), 6); // = +0.3567
    expect(obs!.standardError).toBeGreaterThan(0);
  });

  it('maps a harmful hazard ratio (>1) to a NEGATIVE benefit-oriented log effect', () => {
    const detail = { results: { hazardRatio: 1.5, ci: [1.2, 1.9] } };
    const obs = extractEffectObservation(baseReport, detail);

    expect(obs).not.toBeNull();
    expect(obs!.effect).toBeLessThan(0);
    expect(obs!.effect).toBeCloseTo(-Math.log(1.5), 6);
  });

  it('orients ratio benefit independently of the continuous endpoint direction', () => {
    const detail = { results: { oddsRatio: 0.5, ci: [0.3, 0.83] } };
    const expected = -Math.log(0.5); // > 0

    const inc = extractEffectObservation(baseReport, detail, { direction: 'increase' });
    const dec = extractEffectObservation(baseReport, detail, { direction: 'decrease' });

    // A ratio's benefit direction is intrinsic; both should agree and be benefit-positive.
    expect(inc!.effect).toBeCloseTo(expected, 6);
    expect(dec!.effect).toBeCloseTo(expected, 6);
    expect(inc!.effect).toBeGreaterThan(0);
  });
});
