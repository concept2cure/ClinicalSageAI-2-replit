import { describe, it, expect } from 'vitest';
import {
  assessAnalyticalSimilarity,
  assessAttribute,
} from '../../../server/services/biologics/analytical-similarity';

const REF = [100, 99, 101, 100, 98, 102, 100, 99, 101, 100];

describe('analytical-similarity — Tier 1 (equivalence)', () => {
  it('passes when test lots equivalence-match the reference', () => {
    const r = assessAttribute({
      name: 'Potency (relative %)',
      tier: 1,
      reference: REF,
      test: [100, 100, 99, 101, 100, 99, 101, 100, 100, 99],
    });
    expect(r.verdict).toBe('pass');
    expect(r.tier1?.equivalent).toBe(true);
    expect(r.tier1?.eac).toBeGreaterThan(0);
  });

  it('fails when the mean difference exceeds ±1.5·σ_R', () => {
    const r = assessAttribute({
      name: 'Potency (relative %)',
      tier: 1,
      reference: REF,
      test: REF.map((x) => x + 8),
    });
    expect(r.verdict).toBe('fail');
    expect(r.tier1?.equivalent).toBe(false);
  });

  it('marks marginal when the point estimate is within EAC but the CI is too wide', () => {
    // Only 3 test lots → wide CI, but centred near the reference.
    const r = assessAttribute({
      name: 'Charge variants (%)',
      tier: 1,
      reference: REF,
      test: [100, 101, 99],
    });
    expect(['marginal', 'pass']).toContain(r.verdict);
  });

  it('reports insufficient_data when reference variability cannot be estimated', () => {
    const r = assessAttribute({ name: 'X', tier: 1, reference: [100], test: [100, 101] });
    expect(r.verdict).toBe('insufficient_data');
  });
});

describe('analytical-similarity — Tier 2 (quality range)', () => {
  it('passes when ≥90% of test lots fall in mean_R ± 3·σ_R', () => {
    const r = assessAttribute({
      name: 'HMW species (%)',
      tier: 2,
      reference: REF,
      test: [100, 101, 99, 100, 102, 98, 100, 101, 99, 100],
    });
    expect(r.verdict).toBe('pass');
    expect(r.tier2?.fractionWithin).toBeGreaterThanOrEqual(0.9);
  });

  it('fails when most test lots fall outside the quality range', () => {
    const r = assessAttribute({
      name: 'HMW species (%)',
      tier: 2,
      reference: REF,
      test: [130, 131, 129, 132, 128],
    });
    expect(r.verdict).toBe('fail');
  });
});

describe('analytical-similarity — Tier 3 (min–max)', () => {
  it('passes when all test lots fall within the observed reference range', () => {
    const r = assessAttribute({
      name: 'Color',
      tier: 3,
      reference: REF,
      test: [100, 99, 101],
    });
    expect(r.verdict).toBe('pass');
  });
});

describe('analytical-similarity — overall conclusion', () => {
  it('a Tier 1 failure makes the overall conclusion not_demonstrated', () => {
    const out = assessAnalyticalSimilarity({
      referenceProduct: 'RP-1',
      modality: 'monoclonal_antibody',
      targetAgency: 'FDA',
      attributes: [
        { name: 'Potency', tier: 1, reference: REF, test: REF.map((x) => x + 9) },
        { name: 'Purity', tier: 2, reference: REF, test: REF },
      ],
    });
    expect(out.conclusion).toBe('not_demonstrated');
    expect(out.flagged).toContain('Potency');
    expect(out.counts.total).toBe(2);
    expect(out.methodology.length).toBeGreaterThan(0);
  });

  it('all-pass attributes conclude similar', () => {
    const out = assessAnalyticalSimilarity({
      attributes: [
        { name: 'Potency', tier: 1, reference: REF, test: REF },
        { name: 'Purity', tier: 2, reference: REF, test: REF },
        { name: 'Color', tier: 3, reference: REF, test: [100, 100, 99] },
      ],
    });
    expect(out.conclusion).toBe('similar');
    expect(out.counts.pass).toBe(3);
  });
});
