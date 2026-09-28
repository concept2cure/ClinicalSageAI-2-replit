/**
 * Interim-analysis operating characteristics.
 *
 * What the suite holds: the solved Lan–DeMets O'Brien–Fleming boundaries for a
 * two-look design at t = 0.5 are the published 2.963 / 1.969 (one-sided
 * α = 0.025) and hold the type I error at α; the operating characteristics are
 * computed for the RECORDED boundaries, and a recorded boundary that departs
 * from the named spending function is a discrepancy, never silently replaced;
 * "lan_demets" is refused as a family; unrecorded sidedness, alpha or power is
 * a gap, not a guess; no interim is not_applicable unless the design declares a
 * group-sequential feature.
 */
import { describe, expect, it } from 'vitest';

import type { StudyDesign } from '../study-design-types';
import { BOUNDARY_TOLERANCE, INTERIM_OC_BASIS, projectInterimOperatingCharacteristics } from '../interim-oc';

function design(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in heart failure',
    phase: '3',
    indication: 'heart failure',
    objectives: [],
    estimands: [],
    endpoints: [{ name: 'CV death or HF hospitalisation', role: 'primary', type: 'time_to_event', definition: 'time to first event' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults with HFrEF', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: {
      plannedAnalyses: [],
      alpha: 0.05,
      oneSided: false,
      power: 0.9,
      plannedSampleSize: 1000,
      interim: { informationFractions: [0.5, 1], spendingFunction: 'obrien_fleming' },
    },
  } as StudyDesign;
}

const clone = (d: StudyDesign): StudyDesign => JSON.parse(JSON.stringify(d));

describe('projectInterimOperatingCharacteristics — the engine\'s numbers', () => {
  it('solves the published two-look O\'Brien–Fleming boundaries and holds the type I error at one-sided 0.025', () => {
    const p = projectInterimOperatingCharacteristics(design());
    expect(p.status).toBe('rendered');
    expect(p.oneSidedAlpha).toBe(0.025);
    expect(p.spending).toEqual({ recorded: 'obrien_fleming', engine: 'obrien-fleming' });
    expect(Math.abs(p.solvedEfficacyBoundaries![0] - 2.963)).toBeLessThan(0.01);
    expect(Math.abs(p.solvedEfficacyBoundaries![1] - 1.969)).toBeLessThan(0.01);
    expect(p.characteristics!.boundariesEvaluated).toBe('solved');
    expect(Math.abs(p.characteristics!.typeIError - 0.025)).toBeLessThan(0.0005);
    expect(p.basis).toBe(INTERIM_OC_BASIS);
  });

  it('reports power at the fixed design\'s alternative, slightly below the target, and expected sample sizes', () => {
    const c = projectInterimOperatingCharacteristics(design()).characteristics!;
    expect(c.designDrift).toBeCloseTo(1.959964 + 1.281552, 4);
    expect(c.power!).toBeGreaterThan(0.88);
    expect(c.power!).toBeLessThan(0.9);
    expect(c.expectedInformationFraction.underAlternative!).toBeLessThan(1);
    expect(c.expectedSampleSize!.underNull).toBeCloseTo(c.expectedInformationFraction.underNull * 1000, 9);
    expect(c.perLook).toHaveLength(2);
    expect(c.perLook[0].efficacyStopUnderNull).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(projectInterimOperatingCharacteristics(design()))).toBe(JSON.stringify(projectInterimOperatingCharacteristics(clone(design()))));
  });
});

describe('projectInterimOperatingCharacteristics — the recorded boundaries are what is evaluated', () => {
  it('recorded boundaries matching the function to rounding are evaluated with no discrepancy', () => {
    const d = design();
    d.statisticalPlan.interim!.efficacyBoundaries = [2.96, 1.97];
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.status).toBe('rendered');
    expect(p.characteristics!.boundariesEvaluated).toBe('recorded');
    expect(p.discrepancies).toEqual([]);
  });

  it('a recorded boundary that departs from the function is a discrepancy, and its inflated type I error is reported', () => {
    const d = design();
    d.statisticalPlan.interim!.efficacyBoundaries = [2.5, 1.97];
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.status).toBe('partial');
    expect(p.discrepancies).toHaveLength(1);
    expect(p.discrepancies[0].look).toBe(1);
    expect(Math.abs(p.discrepancies[0].difference)).toBeGreaterThan(BOUNDARY_TOLERANCE);
    expect(p.characteristics!.perLook[0].efficacyBoundary).toBe(2.5);
    expect(p.characteristics!.typeIError).toBeGreaterThan(0.026);
    expect(p.gaps.at(-1)).toMatch(/1 recorded efficacy boundary differs/);
  });

  it('binding futility is used and said', () => {
    const d = design();
    d.statisticalPlan.interim!.futilityBoundaries = [0, null];
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.notes).toEqual(['futility boundaries are treated as binding: the continuation region is truncated at them']);
    expect(p.characteristics!.perLook[0].futilityBoundary).toBe(0);
    expect(p.characteristics!.typeIError).toBeLessThan(0.025);
  });

  it('a futility array of the wrong length is left out, with the gap', () => {
    const d = design();
    d.statisticalPlan.interim!.futilityBoundaries = [0];
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.gaps).toContain('1 futility boundaries are recorded for 2 analyses: futility is left out of the computation');
    expect(p.characteristics!.perLook[0].futilityBoundary).toBeNull();
  });
});

describe('projectInterimOperatingCharacteristics — nothing guessed', () => {
  it('"lan_demets" is a family: nothing is solved, and recorded boundaries are still evaluated', () => {
    const d = design();
    d.statisticalPlan.interim = { informationFractions: [0.5, 1], spendingFunction: 'lan_demets', efficacyBoundaries: [2.96, 1.97] };
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.spending.engine).toBeNull();
    expect(p.solvedEfficacyBoundaries).toBeNull();
    expect(p.gaps[0]).toMatch(/names the spending-function family/);
    expect(p.characteristics!.boundariesEvaluated).toBe('recorded');
  });

  it('unrecorded sidedness is solved at alpha/2 and said to be an assumption', () => {
    const d = design();
    delete d.statisticalPlan.oneSided;
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.oneSidedAlpha).toBe(0.025);
    expect(p.status).toBe('partial');
    expect(p.gaps[0]).toMatch(/sidedness is not recorded/);
  });

  it('no alpha: no boundary is solved and no power is reported, but recorded boundaries still give a type I error', () => {
    const d = design();
    delete d.statisticalPlan.alpha;
    d.statisticalPlan.interim!.efficacyBoundaries = [2.96, 1.97];
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.solvedEfficacyBoundaries).toBeNull();
    expect(p.characteristics!.power).toBeNull();
    expect(p.characteristics!.designDrift).toBeNull();
    expect(p.characteristics!.typeIError).toBeGreaterThan(0);
    expect(p.gaps[0]).toMatch(/alpha\) is not recorded/);
  });

  it('no alpha and no recorded boundaries: nothing is computed, and it says why', () => {
    const d = design();
    delete d.statisticalPlan.alpha;
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.characteristics).toBeNull();
    expect(p.gaps).toContain('neither usable recorded boundaries nor a solvable spending function: no operating characteristic can be computed');
  });

  it('an invalid schedule computes nothing', () => {
    const d = design();
    d.statisticalPlan.interim!.informationFractions = [0.3, 0.6];
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.status).toBe('partial');
    expect(p.characteristics).toBeNull();
    expect(p.gaps[0]).toMatch(/not a valid schedule/);
  });

  it('no interim is not_applicable — unless the design declares a group-sequential feature', () => {
    const d = design();
    delete d.statisticalPlan.interim;
    expect(projectInterimOperatingCharacteristics(d).status).toBe('not_applicable');
    d.framework.adaptiveFeatures = ['group_sequential'];
    const p = projectInterimOperatingCharacteristics(d);
    expect(p.status).toBe('missing');
    expect(p.gaps[0]).toMatch(/records no interim schedule/);
  });

  it('no planned sample size: no expected sample size, never a made-up one', () => {
    const d = design();
    delete d.statisticalPlan.plannedSampleSize;
    expect(projectInterimOperatingCharacteristics(d).characteristics!.expectedSampleSize).toBeNull();
  });
});
