/**
 * The missing-data impact states a power only where the engine computes one (RULE 2).
 *
 * Until 2026-11-12 `computeMissingDataImpact` stated an "adjusted power" for four
 * methods by multiplying the design's power by a fixed constant:
 *
 *   LOCF                 power × 0.95
 *   MMRM                 power × (1 − 0.3 r)
 *   multiple imputation  power × (1 − 0.25 r)
 *   pattern mixture      power × (1 − 0.5 r)        (r = the expected missing rate)
 *
 * None of those numbers follows from the design, the missingness mechanism or a
 * simulation. The SAP section and the full SAP printed them as "Estimated power
 * after missing data" and "adjusted power"; the defensibility judgment docked 10
 * points for a "power reduction" derived from them; AnA's tool told the model to
 * report them verbatim.
 *
 * Only complete-case analysis has a power that follows from the design: the power
 * of the same test at the reduced evaluable N, which the engine recomputes. For
 * every other method the power is now `null`, said in words, and nothing is
 * derived from it. The effective sample size and the bias-risk statement stay.
 */
import { describe, expect, it } from 'vitest';
import { computationEngine } from '../computation-engine';
import { judgmentEngine } from '../judgment-engine';
import { domainAdapter } from '../domain-adapter';
import { documentGenerator } from '../document-generator';
import type { StatisticalInput } from '../types';

const BASE: StatisticalInput = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.9,
  effectSize: 0.4,
  attritionRate: 0.15,
  expectedMissingRate: 0.3,
  allocationRatio: 1,
  numberOfGroups: 2,
  comparatorType: 'placebo',
  phase: 'Phase 3',
};
const META = { projectId: 1, organizationId: 1, userId: 1 };
const NOT_COMPUTED = ['LOCF', 'MMRM', 'multiple_imputation', 'pattern_mixture'] as const;

const run = (missingDataMethod: StatisticalInput['missingDataMethod']) => {
  const input: StatisticalInput = { ...BASE, missingDataMethod };
  // computeEnhanced, as the document route uses: it attaches the missing-data impact.
  const computation = computationEngine.computeEnhanced(input);
  const judgment = judgmentEngine.judge(input, computation);
  const domain = domainAdapter.adapt(input, computation, judgment);
  const doc = (type: 'sap_section_draft' | 'full_statistical_analysis_plan') =>
    documentGenerator.generate(type, input, computation, judgment, domain, undefined, META).content;
  return { input, computation, judgment, doc };
};
const section = (content: string, heading: RegExp) => {
  const start = content.search(heading);
  expect(start, `no ${heading} in the document`).toBeGreaterThanOrEqual(0);
  const rest = content.slice(start + 1);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
};

describe('complete case: the power is recomputed at the evaluable N', () => {
  it('states the power of the same test at the effective sample size, and the reduction from it', () => {
    const { computation, input } = run('complete_case');
    const impact = computation.missingDataImpact!;
    const effectiveN = Math.floor(computation.sampleSize.total * (1 - 0.3));
    expect(impact.effectiveSampleSize).toBe(effectiveN);
    expect(typeof impact.adjustedPower).toBe('number');
    // The engine's own power at that N: size a design for exactly that power and get the same N back (±2 for rounding).
    const resized = computationEngine.compute({ ...input, powerTarget: impact.adjustedPower!, expectedMissingRate: 0 }).sampleSize.total;
    expect(Math.abs(resized - effectiveN)).toBeLessThanOrEqual(2);
    expect(impact.powerReduction).toBeCloseTo(computation.power - impact.adjustedPower!, 10);
    expect(impact.adjustedPower!).toBeLessThan(computation.power);
  });
});

describe.each(NOT_COMPUTED)('%s: no power is stated', (method) => {
  it('returns no adjusted power and no reduction, and keeps the effective N and the bias risk', () => {
    const { computation } = run(method);
    const impact = computation.missingDataImpact!;
    expect(impact.adjustedPower).toBeNull();
    expect(impact.powerReduction).toBeNull();
    expect(impact.effectiveSampleSize).toBe(Math.floor(computation.sampleSize.total * 0.7));
    expect(['low', 'moderate', 'high']).toContain(impact.biasRisk);
    expect(impact.recommendation).toMatch(/not computed/);
    expect(impact.recommendation).not.toMatch(/Power reduction of/);
  });

  it('the SAP section and the full SAP say the power is not computed, and print no power for missing data', () => {
    const { doc } = run(method);
    const sap = section(doc('sap_section_draft'), /## 7\. Missing Data Handling/);
    expect(sap).toMatch(/Power after missing data: not computed/);
    expect(sap).not.toMatch(/Estimated power after missing data: \d/);
    const full = section(doc('full_statistical_analysis_plan'), /## 9\. Missing Data/);
    expect(full).toMatch(/power under this method is not computed/);
    expect(full).not.toMatch(/adjusted power \d/);
  });

  it('the judgment raises no power-reduction flag from it', () => {
    const { judgment } = run(method);
    const flags = JSON.stringify(judgment);
    expect(flags).not.toMatch(/Power reduced by [\d.]+% due to missing data/);
  });
});
