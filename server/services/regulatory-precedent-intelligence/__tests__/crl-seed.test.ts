/**
 * Shape and content tests for the CRL trigger seed array. Runs without a
 * live database — validates that every seed matches the runtime contract
 * `crlTriggerService.createPattern` expects.
 */

import { describe, it, expect } from 'vitest';
import {
  CRL_TRIGGER_PATTERNS,
  type CrlTriggerSeed,
} from '../seeds/crl-trigger-patterns';

const REQUIRED_CODES = [
  'CRL_CLIN_EFFICACY_SINGLE_TRIAL',
  'CRL_CLIN_SAFETY_DATABASE_INSUFFICIENT',
  'CRL_CLIN_DESIGN_ENDPOINT_NOT_CLINICAL',
  'CRL_CMC_INSPECTIONAL_FAILURE',
  'CRL_CMC_QUALITY_SPECIFICATION_INSUFFICIENT',
  'CRL_CMC_STABILITY_INSUFFICIENT',
  'CRL_NONCLIN_BRIDGING_GAP',
  'CRL_BIOSTATS_MULTIPLICITY_UNCONTROLLED',
  'CRL_LABELING_INDICATION_MISMATCH',
  'CRL_PHARMACOLOGY_DOSE_JUSTIFICATION',
  'CRL_REMS_INSUFFICIENT',
  'CRL_PEDIATRIC_PREA_DEFERRAL',
  'CRL_POSTMARKET_COMMITMENT_GAP',
] as const;

const ALLOWED_CATEGORIES = new Set([
  'clinical_efficacy', 'clinical_safety', 'clinical_design',
  'cmc_quality', 'cmc_manufacturing', 'cmc_stability',
  'nonclinical', 'biostatistics', 'labeling',
  'pharmacology', 'rems', 'pediatric', 'postmarket',
]);

const ALLOWED_DIFFICULTY = new Set(['low', 'moderate', 'high', 'very_high']);

describe('CRL trigger seed patterns', () => {
  it('contains every required pattern code', () => {
    const codes = CRL_TRIGGER_PATTERNS.map(p => p.patternCode).sort();
    expect(codes).toEqual([...REQUIRED_CODES].sort());
  });

  it('uses a recognised CRL category for every entry', () => {
    for (const p of CRL_TRIGGER_PATTERNS) {
      expect(ALLOWED_CATEGORIES.has(p.category)).toBe(true);
    }
  });

  it('uses a recognised resolution difficulty', () => {
    for (const p of CRL_TRIGGER_PATTERNS) {
      expect(ALLOWED_DIFFICULTY.has(p.resolutionDifficulty)).toBe(true);
    }
  });

  it('attaches at least one deficiency signal per pattern', () => {
    for (const p of CRL_TRIGGER_PATTERNS) {
      expect(p.deficiencySignals.length).toBeGreaterThan(0);
      for (const sig of p.deficiencySignals) {
        expect(sig.signalType.length).toBeGreaterThan(0);
        expect(sig.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('declares submission types and applicable divisions', () => {
    for (const p of CRL_TRIGGER_PATTERNS) {
      expect(p.submissionTypes.length).toBeGreaterThan(0);
      expect(p.applicableDivisions.length).toBeGreaterThan(0);
    }
  });

  it('uses a unique patternCode per entry', () => {
    const codes = CRL_TRIGGER_PATTERNS.map(p => p.patternCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps frequencyRate and resolutionSuccessRate in the [0, 1] range', () => {
    for (const p of CRL_TRIGGER_PATTERNS) {
      expect(p.frequencyRate).toBeGreaterThanOrEqual(0);
      expect(p.frequencyRate).toBeLessThanOrEqual(1);
      expect(p.resolutionSuccessRate).toBeGreaterThanOrEqual(0);
      expect(p.resolutionSuccessRate).toBeLessThanOrEqual(1);
    }
  });

  it('keeps avgCyclesToResolve positive', () => {
    for (const p of CRL_TRIGGER_PATTERNS) {
      expect(p.avgCyclesToResolve).toBeGreaterThan(0);
    }
  });

  it('quotes typical FDA language for every pattern', () => {
    for (const p of CRL_TRIGGER_PATTERNS) {
      expect(p.typicalFdaLanguage.length).toBeGreaterThan(0);
      for (const phrase of p.typicalFdaLanguage) {
        expect(phrase.length).toBeGreaterThan(10);
      }
    }
  });
});

const _typeCheck: CrlTriggerSeed[] = CRL_TRIGGER_PATTERNS;
void _typeCheck;
