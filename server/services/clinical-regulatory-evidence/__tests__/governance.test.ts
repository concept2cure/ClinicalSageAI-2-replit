/**
 * §14 statistical & evidentiary governance — the two honesty guards.
 * Pure unit tests (no DB).
 */

import { describe, it, expect } from 'vitest';
import {
  validateMetricProvenance, detectUnsupportedClaims, assertNoUnsupportedClaims,
  isEvidentiallySound, UnsupportedClaimError, INSUFFICIENT_EVIDENCE,
} from '../governance';
import type { MetricProvenance } from '../types';

const fullEnvelope: MetricProvenance = {
  numerator: 3, denominator: 12, missingCount: 1, inclusionCriteria: 'NSCLC, phase 3',
  filters: { indication: 'NSCLC' }, extractionMethod: 'structured', verificationStatus: 'unverified',
  dateRange: { from: '2020-01-01', to: '2026-01-01' },
};

describe('validateMetricProvenance (§14 envelope)', () => {
  it('accepts a complete envelope (numerator 0 is valid, null is not)', () => {
    expect(validateMetricProvenance(fullEnvelope).valid).toBe(true);
    expect(validateMetricProvenance({ ...fullEnvelope, numerator: 0 }).valid).toBe(true);
  });
  it('reports every missing field', () => {
    const r = validateMetricProvenance({ ...fullEnvelope, numerator: null as unknown as number, extractionMethod: '' });
    expect(r.valid).toBe(false);
    expect(r.missing).toContain('numerator');
    expect(r.missing).toContain('extractionMethod');
  });
  it('treats a null metric as fully missing', () => {
    expect(validateMetricProvenance(null).valid).toBe(false);
    expect(validateMetricProvenance(null).missing.length).toBeGreaterThan(5);
  });
});

describe('detectUnsupportedClaims (§14 prohibitions)', () => {
  const prohibited = [
    'FDA usually accepts overall survival as a primary endpoint.',
    'This design has an 85% approval probability.',
    'Approval likelihood is 72% for this program.',
    'Completed trials were successful in this indication.',
    'Three PPQ batches resolve this deficiency.',
    'This endpoint is FDA-approved.',
    'The program will be approved on resubmission.',
    'This yields guaranteed approval.',
  ];
  it.each(prohibited)('flags: %s', (text) => {
    const v = detectUnsupportedClaims(text);
    expect(v.length).toBeGreaterThan(0);
  });

  const sound = [
    'This is precedent, not a prediction of acceptance.',
    'FDA issued a Complete Response Letter citing inadequate efficacy.',
    'Absence of objection is not evidence of acceptance.',
    INSUFFICIENT_EVIDENCE,
    'Three studies reported overall survival with a hazard ratio below 1.',
    'The sponsor proposed a confirmatory trial.',
  ];
  it.each(sound)('passes: %s', (text) => {
    expect(detectUnsupportedClaims(text)).toHaveLength(0);
    expect(isEvidentiallySound(text)).toBe(true);
  });

  it('assertNoUnsupportedClaims throws on a violation with the reason', () => {
    expect(() => assertNoUnsupportedClaims('This design has an 85% approval probability.')).toThrow(UnsupportedClaimError);
    try {
      assertNoUnsupportedClaims('FDA usually accepts this endpoint.');
    } catch (e) {
      expect((e as Error).message).toMatch(/general FDA disposition/i);
    }
  });

  it('catches multiple violations in one passage, ordered by position', () => {
    const text = 'FDA usually accepts this. Also, there is an 85% approval probability.';
    const v = detectUnsupportedClaims(text);
    expect(v.length).toBeGreaterThanOrEqual(2);
    expect(v[0].index).toBeLessThan(v[1].index);
  });
});
