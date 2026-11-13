/**
 * The request validator does not refuse a design the engine sizes.
 *
 * `inputNormalizer.normalize` runs in front of every biostatistics route, and
 * the route stops at `validation.valid === false`. It refused:
 *
 *   - every design whose effect size is not positive — "Effect size must be
 *     positive". But a non-inferiority design is sized on (δ − Δ_NI) and assumes
 *     a true difference of 0 more often than not; an equivalence design is sized
 *     on its margin with the true difference taken as 0 (computation-engine.ts
 *     says so in as many words); and an ROC design is sized on its AUC and does
 *     not read the effect size at all.
 *   - every diagnostic-accuracy study with no sensitivity or specificity target
 *     — but an ROC / AUC design is a diagnostic-accuracy study with neither.
 *
 * So the engine sized the "Non-inferiority" and "ROC / AUC" worked examples
 * (N = 312, N = 24) and the Biostatistics screen answered both chips with a red
 * refusal. Found 2026-11-12 by walking the page; the suite that sizes every
 * worked example called the engine directly and never met the validator.
 *
 * What is still refused is checked as carefully as what is now admitted.
 */
import { describe, expect, it } from 'vitest';
import { inputNormalizer } from '../input-normalizer';
import { computationEngine } from '../computation-engine';
import type { StatisticalInput } from '../types';

const errorsOf = (input: Partial<StatisticalInput>) => inputNormalizer.normalize(input).errors.map((e) => `${e.field}: ${e.message}`);

const CONTINUOUS: Partial<StatisticalInput> = {
  clientTrack: 'biotech_pharma', objectiveType: 'efficacy', endpointType: 'continuous', alpha: 0.05, powerTarget: 0.9,
  variance: 1, attritionRate: 0.1, allocationRatio: 1, numberOfGroups: 2, comparatorType: 'active', phase: 'Phase III',
};
const ROC: Partial<StatisticalInput> = {
  clientTrack: 'diagnostics_ivd', regulatoryBody: 'FDA', studyType: 'diagnostic_accuracy', objectiveType: 'diagnostic_accuracy',
  endpointType: 'auc_roc', alpha: 0.05, powerTarget: 0.8, attritionRate: 0.1, allocationRatio: 1, numberOfGroups: 2,
};

describe('a design sized on its margin may state a true difference of zero', () => {
  it('non-inferiority, true difference 0', () => {
    const input = { ...CONTINUOUS, studyType: 'non_inferiority' as const, effectSize: 0, nonInferiorityMargin: -0.4 };
    expect(errorsOf(input)).toEqual([]);
    const normalized = inputNormalizer.normalize(input).normalizedInput!;
    expect(normalized.effectSize).toBe(0);
    expect(computationEngine.compute(normalized).sampleSize.total).toBeGreaterThan(0);
  });

  it('non-inferiority, a true difference slightly on the wrong side of zero', () => {
    expect(errorsOf({ ...CONTINUOUS, studyType: 'non_inferiority', effectSize: -0.1, nonInferiorityMargin: -0.4 })).toEqual([]);
  });

  it('equivalence, true difference 0 — and with no effect size given at all', () => {
    expect(errorsOf({ ...CONTINUOUS, studyType: 'equivalence', effectSize: 0, equivalenceMargin: 0.4 })).toEqual([]);
    expect(errorsOf({ ...CONTINUOUS, studyType: 'equivalence', equivalenceMargin: 0.4 })).toEqual([]);
  });
});

describe('an ROC design is sized on its AUC', () => {
  it('is admitted with an expected AUC and no sensitivity, specificity or effect size', () => {
    expect(errorsOf({ ...ROC, aucTarget: 0.85, aucNull: 0.5 })).toEqual([]);
    expect(errorsOf({ ...ROC, aucTarget: 0.85, aucNull: 0.5, effectSize: 0 })).toEqual([]);
    const normalized = inputNormalizer.normalize({ ...ROC, aucTarget: 0.85, aucNull: 0.5, effectSize: 0 }).normalizedInput!;
    expect(computationEngine.compute(normalized).sampleSize.total).toBeGreaterThan(0);
  });

  it('is not warned that it lacks the sensitivity and specificity it does not use', () => {
    const warnings = inputNormalizer.normalize({ ...ROC, aucTarget: 0.85 }).warnings.map((w) => w.field);
    expect(warnings).not.toContain('sensitivity/specificity');
  });

  it('is refused without its expected AUC, by name', () => {
    expect(errorsOf({ ...ROC, effectSize: 0 })).toEqual(['aucTarget: An ROC / AUC design needs the expected AUC (aucTarget).']);
  });
});

describe('what the validator still refuses', () => {
  it('a superiority design with an effect size of zero', () => {
    expect(errorsOf({ ...CONTINUOUS, studyType: 'superiority', effectSize: 0 })).toEqual(['effectSize: Effect size must be positive']);
  });

  it('a superiority design with no effect size', () => {
    expect(errorsOf({ ...CONTINUOUS, studyType: 'superiority' })).toEqual([
      'effectSize: Effect size is required. Provide directly or via controlRate/treatmentRate.',
    ]);
  });

  it('a non-inferiority design with no margin: zero is not excused when there is nothing else to size on', () => {
    expect(errorsOf({ ...CONTINUOUS, studyType: 'non_inferiority', effectSize: 0 })).toEqual([
      'effectSize: Effect size must be positive',
      'nonInferiorityMargin: Non-inferiority margin is required for NI studies',
    ]);
  });

  it('a diagnostic-accuracy study on sensitivity and specificity that gives neither', () => {
    expect(errorsOf({ ...ROC, endpointType: 'sensitivity_specificity', effectSize: 0.9 })).toEqual([
      'sensitivity/specificity: At least sensitivity or specificity target is required for diagnostic accuracy studies',
    ]);
  });
});
