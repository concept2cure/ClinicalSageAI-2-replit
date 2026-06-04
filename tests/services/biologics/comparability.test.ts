import { describe, it, expect } from 'vitest';
import {
  assessComparability,
  assessComparabilityAttribute,
} from '../../../server/services/biologics/comparability';

const PRE = [50, 51, 49, 50, 52, 48, 50, 51, 49, 50];

describe('comparability — per attribute (ICH Q5E)', () => {
  it('declares comparable when post-change lots sit in the pre-change quality range', () => {
    const r = assessComparabilityAttribute({
      name: 'Glycan G0F (%)',
      criticality: 'moderate',
      preChange: PRE,
      postChange: [50, 51, 49, 50, 50, 51, 49, 50],
    });
    expect(r.verdict).toBe('comparable');
    expect(Math.abs(r.shiftInSigma)).toBeLessThanOrEqual(1);
  });

  it('declares not_comparable for a high-criticality attribute that fails equivalence', () => {
    const r = assessComparabilityAttribute({
      name: 'Potency (%)',
      criticality: 'high',
      preChange: PRE,
      postChange: PRE.map((x) => x + 6),
    });
    expect(r.verdict).toBe('not_comparable');
    expect(r.equivalence?.equivalent).toBe(false);
  });

  it('returns insufficient_data without enough pre-change lots', () => {
    const r = assessComparabilityAttribute({
      name: 'X',
      criticality: 'low',
      preChange: [50],
      postChange: [50, 51],
    });
    expect(r.verdict).toBe('insufficient_data');
  });
});

describe('comparability — overall + bridging', () => {
  it('a high-criticality non-comparable attribute drives a clinical bridging recommendation', () => {
    const out = assessComparability({
      changeDescription: 'New DS manufacturing site',
      changeType: 'site',
      modality: 'monoclonal_antibody',
      attributes: [
        { name: 'Potency', criticality: 'high', preChange: PRE, postChange: PRE.map((x) => x + 7) },
        { name: 'Charge variants', criticality: 'moderate', preChange: PRE, postChange: PRE },
      ],
    });
    expect(out.conclusion).toBe('not_comparable');
    expect(out.bridging.analyticalSufficient).toBe(false);
    expect(out.bridging.clinicalRecommended).toBe(true);
    expect(out.flagged).toContain('Potency');
  });

  it('all-comparable concludes comparable and analytical-sufficient', () => {
    const out = assessComparability({
      attributes: [
        { name: 'Potency', criticality: 'high', preChange: PRE, postChange: PRE },
        { name: 'Purity', criticality: 'moderate', preChange: PRE, postChange: PRE },
      ],
    });
    expect(out.conclusion).toBe('comparable');
    expect(out.bridging.analyticalSufficient).toBe(true);
    expect(out.bridging.clinicalRecommended).toBe(false);
  });
});
