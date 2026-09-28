/**
 * Multiplicity check.
 *
 * What the suite holds: the rates are the engine's `estimateFWER` (the
 * unadjusted rate for three hypotheses sits at 1 − (1 − α)³ within Monte Carlo
 * error, and Holm and fixed-sequence sit at or below α); "controlled" is decided
 * against the stated SE tolerance; the allocation is checked against the
 * confirmatory family; a procedure the spine cannot parameterise is a gap, not
 * a substitute; one confirmatory hypothesis is not_applicable; a hierarchy with
 * no procedure is missing.
 */
import { describe, expect, it } from 'vitest';

import type { StudyDesign } from '../study-design-types';
import { FWER_SIMULATIONS, FWER_TOLERANCE_SE, MULTIPLICITY_CHECK_BASIS, checkMultiplicity } from '../multiplicity-check';

function design(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in heart failure',
    phase: '3',
    indication: 'heart failure',
    objectives: [],
    estimands: [],
    endpoints: [
      { name: 'CV death or HF hospitalisation', role: 'primary', type: 'time_to_event', definition: 'time to first event' },
      { name: 'KCCQ-TSS change', role: 'key_secondary', type: 'continuous', definition: 'change at month 8' },
      { name: 'All-cause death', role: 'key_secondary', type: 'time_to_event', definition: 'time to death' },
      { name: 'NT-proBNP', role: 'exploratory', type: 'continuous', definition: 'change at month 8' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults with HFrEF', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: {
      plannedAnalyses: [],
      alpha: 0.05,
      multiplicity: {
        method: 'holm',
        alphaAllocation: [
          { endpointName: 'CV death or HF hospitalisation', alpha: 0.05 },
          { endpointName: 'KCCQ-TSS change', alpha: 0.05 },
          { endpointName: 'All-cause death', alpha: 0.05 },
        ],
      },
    },
  } as StudyDesign;
}

describe('checkMultiplicity — the engine\'s rates', () => {
  it('Holm holds the family-wise error at alpha; testing each at alpha does not', () => {
    const c = checkMultiplicity(design());
    expect(c.family).toEqual(['CV death or HF hospitalisation', 'KCCQ-TSS change', 'All-cause death']);
    expect(c.status).toBe('rendered');
    expect(c.procedure!.controlled).toBe(true);
    expect(c.procedure!.fwer).toBeLessThanOrEqual(0.05 + FWER_TOLERANCE_SE * c.procedure!.monteCarloSe);
    const exact = 1 - Math.pow(0.95, 3);
    expect(Math.abs(c.unadjusted!.fwer - exact)).toBeLessThan(4 * c.unadjusted!.monteCarloSe);
    expect(c.unadjusted!.provenance).not.toHaveProperty('generatedAt');
    expect(c.basis).toBe(MULTIPLICITY_CHECK_BASIS);
  });

  it('fixed sequence holds it too, and the Monte Carlo SE is from the stated simulation count', () => {
    const d = design();
    d.statisticalPlan.multiplicity!.method = 'fixed_sequence';
    const c = checkMultiplicity(d);
    expect(c.procedure!.controlled).toBe(true);
    expect(c.procedure!.monteCarloSe).toBeCloseTo(Math.sqrt((c.procedure!.fwer * (1 - c.procedure!.fwer)) / FWER_SIMULATIONS), 12);
  });

  it('Hochberg is checked and carries its dependence caveat', () => {
    const d = design();
    d.statisticalPlan.multiplicity!.method = 'hochberg';
    const c = checkMultiplicity(d);
    expect(c.procedure!.controlled).toBe(true);
    expect(c.notes[0]).toMatch(/independence or positive dependence/);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(checkMultiplicity(design()))).toBe(JSON.stringify(checkMultiplicity(design())));
  });
});

describe('checkMultiplicity — gaps, never substitutes', () => {
  it('a graphical procedure without weights and a transition matrix is not approximated', () => {
    const d = design();
    d.statisticalPlan.multiplicity!.method = 'graphical';
    const c = checkMultiplicity(d);
    expect(c.status).toBe('partial');
    expect(c.procedure).toBeNull();
    expect(c.unadjusted).not.toBeNull();
    expect(c.gaps[0]).toMatch(/needs its initial weights and transition matrix/);
  });

  it('alpha spending is named for what it is', () => {
    const d = design();
    d.statisticalPlan.multiplicity!.method = 'alpha_spending';
    expect(checkMultiplicity(d).gaps[0]).toMatch(/not a multiplicity procedure for this family/);
  });

  it('an allocation that misses a confirmatory endpoint, names another, or exceeds alpha is a gap each', () => {
    const d = design();
    d.statisticalPlan.multiplicity!.alphaAllocation = [
      { endpointName: 'CV death or HF hospitalisation', alpha: 0.05 },
      { endpointName: 'NT-proBNP', alpha: 0.01 },
      { endpointName: 'KCCQ-TSS change', alpha: 0.2 },
    ];
    const c = checkMultiplicity(d);
    expect(c.status).toBe('partial');
    expect(c.gaps).toEqual([
      'confirmatory endpoint "All-cause death" has no alpha allocation',
      'the allocation names "NT-proBNP", which is not a confirmatory endpoint of this design',
      'the allocation for "KCCQ-TSS change" is not a level between 0 and the overall alpha',
    ]);
  });

  it('no allocation at all is a gap', () => {
    const d = design();
    delete d.statisticalPlan.multiplicity!.alphaAllocation;
    expect(checkMultiplicity(d).gaps).toEqual(['no alpha allocation is recorded for the family']);
  });

  it('no alpha: nothing is simulated', () => {
    const d = design();
    delete d.statisticalPlan.alpha;
    const c = checkMultiplicity(d);
    expect(c.procedure).toBeNull();
    expect(c.unadjusted).toBeNull();
    expect(c.gaps).toEqual(['the significance level (alpha) is not recorded']);
  });

  it('a hierarchy with no procedure is missing; a single confirmatory hypothesis is not_applicable', () => {
    const d = design();
    d.statisticalPlan.multiplicity = { method: 'none' };
    expect(checkMultiplicity(d).status).toBe('missing');
    d.endpoints = d.endpoints.filter((e) => e.role === 'primary');
    expect(checkMultiplicity(d).status).toBe('not_applicable');
  });
});
