/**
 * Interim-analysis operating characteristics.
 *
 * What the suite holds: the solved Lan–DeMets boundaries for a two-look design
 * at t = 0.5 are the published O'Brien–Fleming-type 2.963 / 1.969 and
 * Pocock-type 2.157 / 2.201 (one-sided α = 0.025), for a one-sided and for a
 * two-sided recorded alpha, and hold the type I error at α; the operating
 * characteristics are computed for the RECORDED boundaries, and a recorded
 * boundary that departs from the named spending function is a discrepancy,
 * never silently replaced; a type I error above the one-sided alpha is a gap;
 * the type I error is the non-binding one (futility never credited to it);
 * an unknown or prototype spending-function name has no engine and is a gap;
 * futility is validated per look before it is applied; unrecorded or invalid
 * sidedness, alpha, power or sample size is a gap, not a guess; the power's
 * no-inflation assumption is stated; malformed shapes and long schedules are
 * gaps, never a throw or an unbounded computation; no interim is
 * not_applicable unless the design declares a group-sequential feature or
 * records an interim plan with no schedule.
 */
import { describe, expect, it } from 'vitest';

import type { StudyDesign } from '../study-design-types';
import { BOUNDARY_TOLERANCE, INTERIM_OC_BASIS, MAX_ANALYSES, TYPE_I_ERROR_TOLERANCE, projectInterimOperatingCharacteristics } from '../interim-oc';

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
const project = projectInterimOperatingCharacteristics;
/** A design whose interim (or statistical plan) carries values the type does not allow — as a stored design can. */
const loose = (d: StudyDesign) => d as unknown as { statisticalPlan: Record<string, unknown> & { interim: Record<string, unknown> }; framework: Record<string, unknown> };
const threeLooks = (interim: Record<string, unknown>): StudyDesign => {
  const d = design();
  loose(d).statisticalPlan.interim = { informationFractions: [1 / 3, 2 / 3, 1], ...interim };
  return d;
};
const INFLATION = /^the evaluated boundaries give a one-sided type I error of 0\.\d{4}, above the design's one-sided alpha 0\.025$/;

describe('projectInterimOperatingCharacteristics — the engine\'s numbers', () => {
  it('solves the published two-look O\'Brien–Fleming boundaries and holds the type I error at one-sided 0.025', () => {
    const p = project(design());
    expect(p.status).toBe('rendered');
    expect(p.gaps).toEqual([]);
    expect(p.oneSidedAlpha).toBe(0.025);
    expect(p.spending).toEqual({ recorded: 'obrien_fleming', engine: 'obrien-fleming' });
    expect(Math.abs(p.solvedEfficacyBoundaries![0] - 2.963)).toBeLessThan(0.01);
    expect(Math.abs(p.solvedEfficacyBoundaries![1] - 1.969)).toBeLessThan(0.01);
    expect(p.characteristics!.boundariesEvaluated).toBe('solved');
    expect(Math.abs(p.characteristics!.typeIError - 0.025)).toBeLessThan(0.0005);
    expect(p.basis).toBe(INTERIM_OC_BASIS);
  });

  it('a recorded one-sided alpha is used as is — the same boundaries as two-sided 0.05, and no sidedness gap', () => {
    const d = design();
    Object.assign(d.statisticalPlan, { alpha: 0.025, oneSided: true });
    const p = project(d);
    expect(p.oneSidedAlpha).toBe(0.025);
    expect(p.gaps).toEqual([]);
    expect(Math.abs(p.solvedEfficacyBoundaries![0] - 2.963)).toBeLessThan(0.005);
    expect(Math.abs(p.solvedEfficacyBoundaries![1] - 1.969)).toBeLessThan(0.005);
  });

  it('solves the published Lan–DeMets Pocock-type boundaries, and maps linear spending to the linear function', () => {
    const d = design();
    d.statisticalPlan.interim!.spendingFunction = 'pocock';
    const p = project(d);
    expect(p.spending).toEqual({ recorded: 'pocock', engine: 'pocock' });
    expect(Math.abs(p.solvedEfficacyBoundaries![0] - 2.157)).toBeLessThan(0.005);
    expect(Math.abs(p.solvedEfficacyBoundaries![1] - 2.201)).toBeLessThan(0.005);
    d.statisticalPlan.interim!.spendingFunction = 'linear';
    const l = project(d);
    expect(l.spending).toEqual({ recorded: 'linear', engine: 'linear' });
    // α·t spends 0.0125 at t = 0.5, so the first boundary is z(1 − 0.0125).
    expect(Math.abs(l.solvedEfficacyBoundaries![0] - 2.2414)).toBeLessThan(0.005);
  });

  it('reports power at the fixed design\'s alternative, slightly below the target, and expected sample sizes under both hypotheses', () => {
    const c = project(design()).characteristics!;
    expect(c.designDrift).toBeCloseTo(1.959964 + 1.281552, 4);
    expect(c.power!).toBeGreaterThan(0.88);
    expect(c.power!).toBeLessThan(0.9);
    expect(c.expectedInformationFraction.underAlternative!).toBeLessThan(1);
    expect(c.expectedSampleSize!.underNull).toBeCloseTo(c.expectedInformationFraction.underNull * 1000, 9);
    expect(c.expectedSampleSize!.underAlternative!).toBeCloseTo(c.expectedInformationFraction.underAlternative! * 1000, 9);
    expect(c.expectedSampleSize!.underAlternative!).toBeLessThan(c.expectedSampleSize!.underNull);
    expect(c.perLook).toHaveLength(2);
    expect(c.perLook[0].efficacyStopUnderNull).toBeGreaterThan(0);
    expect(c.perLook[0].efficacyStopUnderAlternative!).toBeGreaterThan(c.perLook[0].efficacyStopUnderNull * 10);
    expect(c.perLook.reduce((s, l) => s + l.efficacyStopUnderNull, 0)).toBeCloseTo(c.typeIError, 12);
    expect(c.perLook.reduce((s, l) => s + l.efficacyStopUnderAlternative!, 0)).toBeCloseTo(c.power!, 12);
  });

  it('states what the figures assume: one-sided, and no group-sequential inflation of plannedSampleSize', () => {
    const p = project(design());
    expect(p.notes).toContain(
      'the type I error is one-sided: the probability under H0 of crossing an efficacy (upper) boundary at any analysis, compared with the one-sided alpha 0.025',
    );
    expect(p.notes.some((n) => /^power is computed at drift 3\.2415.*no group-sequential inflation/.test(n))).toBe(true);
    expect(p.notes).toContain('expected sample size is the expected information fraction times plannedSampleSize (1000), read as the maximum sample size');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(project(design()))).toBe(JSON.stringify(project(clone(design()))));
  });
});

describe('projectInterimOperatingCharacteristics — the recorded boundaries are what is evaluated', () => {
  it('recorded boundaries matching the function to rounding are evaluated with no discrepancy', () => {
    const d = design();
    d.statisticalPlan.interim!.efficacyBoundaries = [2.96, 1.97];
    const p = project(d);
    expect(p.status).toBe('rendered');
    expect(p.characteristics!.boundariesEvaluated).toBe('recorded');
    expect(p.discrepancies).toEqual([]);
  });

  it('the discrepancy tolerance is the stated one: 0.005 away is rounding, 0.02 away is a discrepancy', () => {
    const solved = project(design()).solvedEfficacyBoundaries!;
    const d = design();
    d.statisticalPlan.interim!.efficacyBoundaries = [solved[0] + 0.005, solved[1] + 0.005];
    expect(project(d).discrepancies).toEqual([]);
    d.statisticalPlan.interim!.efficacyBoundaries = [solved[0] + 0.02, solved[1] + 0.005];
    const p = project(d);
    expect(p.discrepancies.map((x) => x.look)).toEqual([1]);
    expect(p.discrepancies[0].difference).toBeGreaterThan(BOUNDARY_TOLERANCE);
  });

  it('a recorded boundary that departs from the function is a discrepancy, and its inflated type I error is a gap', () => {
    const d = design();
    d.statisticalPlan.interim!.efficacyBoundaries = [2.5, 1.97];
    const p = project(d);
    expect(p.status).toBe('partial');
    expect(p.discrepancies).toHaveLength(1);
    expect(p.discrepancies[0].look).toBe(1);
    expect(Math.abs(p.discrepancies[0].difference)).toBeGreaterThan(BOUNDARY_TOLERANCE);
    expect(p.characteristics!.perLook[0].efficacyBoundary).toBe(2.5);
    expect(p.characteristics!.typeIError).toBeGreaterThan(0.026);
    expect(p.gaps).toContain('1 recorded efficacy boundary differs from the named spending function\'s by more than 0.01');
    expect(p.gaps.at(-1)).toMatch(INFLATION);
  });

  it('an inflated type I error is a gap even when no spending function can check the boundaries', () => {
    const family = project(threeLooks({ spendingFunction: 'lan_demets', efficacyBoundaries: [1.96, 1.96, 1.96] }));
    expect(family.characteristics!.typeIError).toBeGreaterThan(0.05);
    expect(family.gaps.at(-1)).toMatch(INFLATION);
    const unnamed = project(threeLooks({ efficacyBoundaries: [1.96, 1.96, 1.96] }));
    expect(unnamed.gaps.at(-1)).toMatch(INFLATION);
  });

  it('boundaries holding alpha to the stated grid tolerance raise no inflation gap', () => {
    expect(TYPE_I_ERROR_TOLERANCE).toBe(1e-4);
    const d = design();
    d.statisticalPlan.interim!.efficacyBoundaries = [2.96, 1.97];
    expect(project(d).gaps).toEqual([]);
  });

  it('the type I error is the non-binding one: futility is never credited to it, and the binding figure is reported apart', () => {
    const without = project(threeLooks({ spendingFunction: 'obrien_fleming' })).characteristics!;
    const p = project(threeLooks({ spendingFunction: 'obrien_fleming', futilityBoundaries: [0, 0, null] }));
    const c = p.characteristics!;
    expect(p.status).toBe('rendered');
    expect(c.typeIError).toBeCloseTo(without.typeIError, 12);
    expect(c.typeIErrorIfFutilityBinding!).toBeLessThan(0.0245);
    expect(without.typeIErrorIfFutilityBinding).toBeNull();
    expect(c.power!).toBeLessThan(without.power!);
    expect(c.expectedSampleSize!.underNull).toBeLessThan(without.expectedSampleSize!.underNull);
    expect(c.perLook.map((l) => l.futilityBoundary)).toEqual([0, 0, null]);
    expect(p.notes).toContain(
      'futility boundaries are applied to power, expected information and expected sample size (they assume futility stopping is followed); ' +
      'the type I error ignores them — the non-binding reading, which holds whether or not futility is followed (FDA 2019) — ' +
      'and the type I error if futility were binding is reported separately',
    );
  });

  it('a futility array of the wrong length is left out, with the gap', () => {
    const d = design();
    d.statisticalPlan.interim!.futilityBoundaries = [0];
    const p = project(d);
    expect(p.gaps).toContain('1 futility boundaries are recorded for 2 analyses: futility is left out of the computation');
    expect(p.characteristics!.perLook[0].futilityBoundary).toBeNull();
    expect(p.characteristics!.typeIErrorIfFutilityBinding).toBeNull();
  });

  it('a futility value is validated per look before it is applied: not above efficacy, finite, and nothing separate at the final analysis', () => {
    const base = project(design()).characteristics!;
    const above = design();
    above.statisticalPlan.interim!.futilityBoundaries = [3.5, null];
    const a = project(above);
    expect(a.gaps).toContain('the futility boundary at look 1 (3.5) is not below its efficacy boundary (2.963): it is left out of the computation');
    expect(a.characteristics!.perLook[0].futilityBoundary).toBeNull();
    expect(a.characteristics!.power).toBeCloseTo(base.power!, 12);
    expect(a.notes.some((n) => n.startsWith('futility boundaries are applied'))).toBe(false);

    const text = design();
    loose(text).statisticalPlan.interim.futilityBoundaries = ['x', null];
    const t = project(text);
    expect(t.gaps).toContain('the futility boundary at look 1 is not a finite z-value: it is left out of the computation');
    expect(t.characteristics!.perLook[0].futilityBoundary).toBeNull();
    expect(t.notes.some((n) => n.startsWith('futility boundaries are applied'))).toBe(false);

    const final = design();
    final.statisticalPlan.interim!.futilityBoundaries = [0, 1.5];
    const f = project(final);
    expect(f.gaps).toContain('the futility boundary at the final analysis (1.5) differs from its efficacy boundary (1.969): the efficacy boundary alone decides there, so it is not applied');
    expect(f.characteristics!.perLook.map((l) => l.futilityBoundary)).toEqual([0, null]);
    const equal = design();
    equal.statisticalPlan.interim!.futilityBoundaries = [0, 1.97];
    expect(project(equal).gaps).toEqual([]);
  });
});

describe('projectInterimOperatingCharacteristics — spending and alpha: nothing guessed', () => {
  it('"lan_demets" is a family: nothing is solved, and recorded boundaries are still evaluated', () => {
    const d = design();
    d.statisticalPlan.interim = { informationFractions: [0.5, 1], spendingFunction: 'lan_demets', efficacyBoundaries: [2.96, 1.97] };
    const p = project(d);
    expect(p.spending.engine).toBeNull();
    expect(p.solvedEfficacyBoundaries).toBeNull();
    expect(p.gaps[0]).toMatch(/names the spending-function family/);
    expect(p.characteristics!.boundariesEvaluated).toBe('recorded');
  });

  it.each(['constructor', 'toString', '__proto__', 'haybittle_peto'])('spending function %s has no engine: nothing is solved, and it is a gap', (name) => {
    const d = design();
    loose(d).statisticalPlan.interim.spendingFunction = name;
    const p = project(d);
    expect(p.spending).toEqual({ recorded: name, engine: null });
    expect(p.solvedEfficacyBoundaries).toBeNull();
    expect(p.status).toBe('partial');
    expect(p.gaps).toContain(`spending function "${name}" has no engine here: nothing is solved and the recorded boundaries are not checked against it`);
  });

  it('an unknown spending function with inflating recorded boundaries says both', () => {
    const d = design();
    loose(d).statisticalPlan.interim = { informationFractions: [0.5, 1], spendingFunction: 'haybittle_peto', efficacyBoundaries: [3, 1.5] };
    const p = project(d);
    expect(p.status).toBe('partial');
    expect(p.characteristics!.typeIError).toBeGreaterThan(0.06);
    expect(p.gaps.at(-1)).toMatch(INFLATION);
  });

  it('unrecorded sidedness is solved at alpha/2 and said to be an assumption', () => {
    const d = design();
    delete d.statisticalPlan.oneSided;
    const p = project(d);
    expect(p.oneSidedAlpha).toBe(0.025);
    expect(p.status).toBe('partial');
    expect(p.gaps[0]).toMatch(/sidedness is not recorded/);
  });

  it('no alpha: no boundary is solved and no power is reported, but recorded boundaries still give a type I error', () => {
    const d = design();
    delete d.statisticalPlan.alpha;
    d.statisticalPlan.interim!.efficacyBoundaries = [2.96, 1.97];
    const p = project(d);
    expect(p.solvedEfficacyBoundaries).toBeNull();
    expect(p.characteristics!.power).toBeNull();
    expect(p.characteristics!.designDrift).toBeNull();
    expect(p.characteristics!.typeIError).toBeGreaterThan(0);
    expect(p.gaps[0]).toMatch(/alpha\) is not recorded/);
  });

  it('a one-sided alpha of 0.5 or more is a gap, never a throw', () => {
    for (const alpha of [0.5, 0.6]) {
      const d = design();
      Object.assign(d.statisticalPlan, { alpha, oneSided: true });
      const p = project(d);
      expect(p.oneSidedAlpha).toBeNull();
      expect(p.gaps[0]).toBe(`a one-sided alpha of ${alpha} is not below 0.5: no boundary can be solved and no type I error target checked`);
    }
  });

  it('no alpha and no recorded boundaries: nothing is computed, and it says why', () => {
    const d = design();
    delete d.statisticalPlan.alpha;
    const p = project(d);
    expect(p.characteristics).toBeNull();
    expect(p.gaps).toContain('neither usable recorded boundaries nor a solvable spending function: no operating characteristic can be computed');
  });

});

describe('projectInterimOperatingCharacteristics — power and sample size are read, not assumed', () => {
  it('a missing or invalid power is a gap', () => {
    const none = design();
    delete none.statisticalPlan.power;
    const n = project(none);
    expect(n.status).toBe('partial');
    expect(n.gaps).toEqual(['the target power is not recorded: no power and no expected sample size under the alternative are computed']);
    expect(n.characteristics!.power).toBeNull();
    const bad = design();
    bad.statisticalPlan.power = 1.2;
    const b = project(bad);
    expect(b.gaps).toEqual(['the recorded power 1.2 is not a probability strictly between 0 and 1: no power is computed']);
    expect(b.characteristics!.power).toBeNull();
  });

  it('a missing or invalid planned sample size is a gap, never a made-up expected sample size', () => {
    const none = design();
    delete none.statisticalPlan.plannedSampleSize;
    const n = project(none);
    expect(n.status).toBe('partial');
    expect(n.gaps).toEqual(['the planned sample size is not recorded: no expected sample size is computed']);
    expect(n.characteristics!.expectedSampleSize).toBeNull();
    for (const size of [0, -10, 12.5]) {
      const bad = design();
      bad.statisticalPlan.plannedSampleSize = size;
      const b = project(bad);
      expect(b.gaps).toEqual([`the planned sample size ${size} is not a whole number of at least 1: no expected sample size is computed`]);
      expect(b.characteristics!.expectedSampleSize).toBeNull();
    }
  });

});

describe('projectInterimOperatingCharacteristics — schedules and shapes', () => {
  it('an invalid schedule computes nothing', () => {
    const d = design();
    d.statisticalPlan.interim!.informationFractions = [0.3, 0.6];
    const p = project(d);
    expect(p.status).toBe('partial');
    expect(p.characteristics).toBeNull();
    expect(p.gaps[0]).toMatch(/not a valid schedule/);
  });

  it('a schedule with no interim look is not an interim plan', () => {
    const d = design();
    d.statisticalPlan.interim!.informationFractions = [1];
    const p = project(d);
    expect(p.status).toBe('partial');
    expect(p.characteristics).toBeNull();
    expect(p.gaps).toEqual(['the schedule [1] contains no interim look: a single final analysis is not an interim plan']);
  });

  it('more analyses than the exact computation runs here is a gap, and nothing long is run', () => {
    expect(MAX_ANALYSES).toBe(10);
    const d = design();
    d.statisticalPlan.interim!.informationFractions = Array.from({ length: MAX_ANALYSES + 1 }, (_, i) => (i + 1) / (MAX_ANALYSES + 1));
    const started = Date.now();
    const p = project(d);
    expect(Date.now() - started).toBeLessThan(200);
    expect(p.status).toBe('partial');
    expect(p.characteristics).toBeNull();
    expect(p.gaps).toEqual(['11 analyses are recorded; the exact computation here runs for at most 10: nothing is computed']);
  });

  it('a non-finite recorded efficacy boundary is named by its look', () => {
    const d = design();
    d.statisticalPlan.interim!.efficacyBoundaries = [Number.NaN, 1.97];
    const p = project(d);
    expect(p.gaps).toContain('the efficacy boundary at look 1 is not a finite z-value: the recorded boundaries cannot be evaluated');
    expect(p.characteristics!.boundariesEvaluated).toBe('solved');
  });

  it('malformed shapes are gaps, never a throw', () => {
    const schedule = design();
    loose(schedule).statisticalPlan.interim.informationFractions = '0.5,1';
    const s = project(schedule);
    expect(s.status).toBe('partial');
    expect(s.gaps).toEqual(['the information fractions are not recorded as a list of numbers: no schedule can be read']);
    const text = design();
    loose(text).statisticalPlan.interim.informationFractions = ['0.5', 1];
    expect(project(text).gaps[0]).toMatch(/not a valid schedule/);
    const efficacy = design();
    loose(efficacy).statisticalPlan.interim.efficacyBoundaries = '29';
    expect(project(efficacy).gaps).toContain('the efficacy boundaries are not recorded as a list of z-values: they cannot be evaluated');
    const futility = design();
    loose(futility).statisticalPlan.interim.futilityBoundaries = 0;
    expect(project(futility).gaps).toContain('the futility boundaries are not recorded as a list: futility is left out of the computation');
    const features = design();
    delete features.statisticalPlan.interim;
    loose(features).framework.adaptiveFeatures = 5;
    expect(project(features).status).toBe('not_applicable');
    const unreadable = design();
    loose(unreadable).statisticalPlan.interim = 'at 50%' as unknown as Record<string, unknown>;
    expect(project(unreadable)).toMatchObject({ status: 'partial', gaps: ['the interim plan is recorded in an unreadable form: nothing can be computed'] });
  });

  it('no interim is not_applicable — unless the design declares a group-sequential feature', () => {
    const d = design();
    delete d.statisticalPlan.interim;
    expect(project(d).status).toBe('not_applicable');
    d.framework.adaptiveFeatures = ['group_sequential'];
    const p = project(d);
    expect(p.status).toBe('missing');
    expect(p.gaps[0]).toMatch(/records no interim schedule/);
  });

  it('an interim plan recorded with an empty schedule is missing, not "no interim planned"', () => {
    const d = design();
    d.statisticalPlan.interim = { informationFractions: [], spendingFunction: 'obrien_fleming', efficacyBoundaries: [2.96, 1.97], futilityBoundaries: [0, null], dmcRole: 'DMC reviews unblinded' };
    expect(project(d)).toMatchObject({ status: 'missing', gaps: ['an interim plan is recorded but its information fractions are not'] });
    d.statisticalPlan.interim = { informationFractions: [], dmcRole: 'DMC reviews unblinded' };
    expect(project(d).status).toBe('missing');
    d.statisticalPlan.interim = { informationFractions: [] };
    expect(project(d).status).toBe('not_applicable');
  });
});
