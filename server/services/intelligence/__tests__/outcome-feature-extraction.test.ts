/**
 * Tests for the outcome → feature vector extractor.
 *
 * Scope: the pure feature builders (binners + buildFeatures + featuresForDraft).
 * DB-dependent paths are excluded here and covered separately by integration.
 */

import { describe, it, expect } from 'vitest';
import {
  binSubmissionType,
  binAgency,
  binTherapeuticArea,
  binCompleteness,
  buildFeatures,
  featuresForDraft,
} from '../outcome-feature-extraction';

describe('bin helpers', () => {
  it('normalizes submission types to a closed enum', () => {
    expect(binSubmissionType('510(k)')).toBe('510k');
    expect(binSubmissionType('PMA')).toBe('pma');
    expect(binSubmissionType('NDA')).toBe('nda');
    expect(binSubmissionType('505(b)(2)')).toBe('505b2');
    expect(binSubmissionType('EU MDR CER')).toBe('cer');
    expect(binSubmissionType(undefined)).toBe('other');
    expect(binSubmissionType('not_a_real_type')).toBe('other');
  });

  it('normalizes agencies', () => {
    expect(binAgency('FDA')).toBe('fda');
    expect(binAgency('Health Canada')).toBe('hc');
    expect(binAgency('PMDA')).toBe('pmda');
    expect(binAgency('Random')).toBe('other');
  });

  it('infers therapeutic-area bins from free text', () => {
    expect(binTherapeuticArea('Pediatric Oncology')).toBe('oncology');
    expect(binTherapeuticArea('Heart Failure')).toBe('cardiovascular');
    expect(binTherapeuticArea('Type 2 Diabetes')).toBe('metabolic');
    expect(binTherapeuticArea('Rare orphan condition')).toBe('rare_disease');
    expect(binTherapeuticArea('Software-as-a-medical-device')).toBe('medtech');
    expect(binTherapeuticArea(null)).toBe('other');
  });

  it('bins completeness percentages into low/medium/high', () => {
    expect(binCompleteness(95)).toBe('high');
    expect(binCompleteness(70)).toBe('medium');
    expect(binCompleteness(45)).toBe('low');
    expect(binCompleteness(null)).toBeNull();
  });
});

describe('buildFeatures', () => {
  it('emits one-hot indicators for the categorical bins', () => {
    const f = buildFeatures({
      submissionType: 'NDA',
      agency: 'FDA',
      therapeuticArea: 'oncology',
    });
    expect(f.stype_is_nda).toBe(1);
    expect(f.stype_is_pma).toBe(0);
    expect(f.agency_is_fda).toBe(1);
    expect(f.agency_is_ema).toBe(0);
    expect(f.ta_is_oncology).toBe(1);
    expect(f.ta_is_cns).toBe(0);
  });

  it('clamps numeric features to [0, 1] using fixed scales', () => {
    const f = buildFeatures({
      submissionType: 'NDA',
      agency: 'FDA',
      missingCriticalCount: 100,        // way over the cap of 10
      missingImportantCount: -5,        // negative → clamp to 0
      readinessPercentage: 73,
      questionsReceived: 999,
    });
    expect(f.missing_critical).toBe(1);
    expect(f.missing_important).toBe(0);
    expect(f.completeness_pct).toBeCloseTo(0.73, 5);
    expect(f.questions_received).toBe(1);
  });

  it('handles missing optional fields as zeros, not NaN', () => {
    const f = buildFeatures({
      submissionType: 'NDA',
      agency: 'FDA',
    });
    for (const v of Object.values(f)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(f.had_advcomm).toBe(0);
    expect(f.review_days_norm).toBe(0);
  });
});

describe('featuresForDraft', () => {
  it('zeros post-submission features regardless of input', () => {
    // Even if the caller (incorrectly) supplied review_days etc, the draft
    // path should ignore them — a draft hasn't been reviewed yet.
    const f = featuresForDraft({
      submissionType: 'NDA',
      agency: 'FDA',
      missingCriticalCount: 1,
      readinessPercentage: 80,
    } as any);
    expect(f.questions_received).toBe(0);
    expect(f.info_requests).toBe(0);
    expect(f.deficiencies).toBe(0);
    expect(f.review_days_norm).toBe(0);
    expect(f.had_advcomm).toBe(0);
    // Pre-submission features should still be present.
    expect(f.missing_critical).toBeGreaterThan(0);
    expect(f.completeness_pct).toBeCloseTo(0.80, 2);
  });
});
