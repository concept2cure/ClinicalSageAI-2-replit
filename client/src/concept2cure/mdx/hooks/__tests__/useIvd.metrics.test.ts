import { describe, expect, it } from 'vitest';
import { adaptClassification, adaptEvidence } from '../useIvd';

describe('IVDR classification adapter (canonical columns, D11d consolidation)', () => {
  it('reads the canonical shape-2 row the mdx list returns', () => {
    expect(
      adaptClassification({
        id: 3, device_name: 'Assay A', ivdr_class: 'c', classification_rule: '3',
        companion_diagnostic: true, self_test: false, near_patient_test: true,
        intended_purpose: 'Detection of a biomarker',
      }),
    ).toMatchObject({
      id: '3', device: 'Assay A', classification: 'C', rule: '3',
      cdx: true, selfTest: false, nearPatient: true,
      intendedPurpose: 'Detection of a biomarker',
    });
  });

  it('falls back to the deprecated shape-1 spellings for a not-yet-reconciled database', () => {
    expect(
      adaptClassification({
        id: 4, device_name: 'Assay B', classification: 'D', is_cdx: true,
        is_self_test: true, is_near_patient: false,
        rule_trace: [{ rule: '1', matched: true }],
      }),
    ).toMatchObject({ classification: 'D', cdx: true, selfTest: true, nearPatient: false, rule: '1' });
  });

  it('drops rows without a device name rather than rendering a nameless record', () => {
    expect(adaptClassification({ id: 5, ivdr_class: 'A' })).toBeNull();
  });
});

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
