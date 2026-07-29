import { describe, expect, it } from 'vitest';
import { adaptEvidence } from '../useIvd';

describe('IVDR clinical evidence adapter', () => {
  it('derives display metrics from counts rather than trusting inconsistent stored percentages', () => {
    const row = adaptEvidence({
      id: 1, true_positive: 9, false_positive: 2, true_negative: 8, false_negative: 1,
      sensitivity: 0.01, specificity: 0.02,
    });
    expect(row).toMatchObject({ sensitivity: 0.9, specificity: 0.8, accuracy: 0.85 });
  });

  it.each([-1, 1.5, 'not-a-count'])('excludes corrupt source counts (%s)', (true_positive) => {
    expect(adaptEvidence({ true_positive, false_positive: 0, true_negative: 1, false_negative: 0 })).toBeNull();
  });

  it('keeps undefined zero-denominator metrics explicit', () => {
    expect(adaptEvidence({ true_positive: 0, false_positive: 0, true_negative: 0, false_negative: 0 })).toMatchObject({
      sensitivity: null, specificity: null, ppv: null, npv: null, accuracy: null,
    });
  });
});
