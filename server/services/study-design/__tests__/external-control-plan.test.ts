/**
 * External-control plan.
 *
 * What the suite holds:
 *  - the borrowing strength is the engine's (equal to `powerPriorBorrow` /
 *    `commensurateBorrow` called directly at the planned concurrent-control SE);
 *    a power prior's effective historical N is a0·nH;
 *  - neither a fixed a0 nor a fixed τ² is prior-data conflict handling: at fixed
 *    τ² the engine's borrowing does not move with the concurrent mean, and a
 *    commensurate plan and the power-prior plan it equals get the same verdict;
 *  - the checklist names ten elements the FDA 2023 draft guidance discusses (not
 *    its full list); those the design spine has no field for are never stated,
 *    so no plan is `rendered` while the spine cannot record them;
 *  - `kind` is reported only from a valid concurrent-control size;
 *  - an external-control design with no plan is MISSING, a recorded concurrent
 *    control is not_applicable, and an unrecorded control type is
 *    not_assessable — never read as "no external control";
 *  - malformed persisted input is a gap, never a throw, and a non-finite
 *    borrowing figure is never reported.
 */
import { describe, expect, it, vi } from 'vitest';

import { commensurateBorrow, powerPriorBorrow, type BorrowResult } from '../../stats/external-control';
import type { StudyDesign } from '../study-design-types';
import { EXTERNAL_CONTROL_BASIS, projectExternalControlPlan } from '../external-control-plan';

/** Fault injection: when on, the engine's borrowed share comes back non-finite. */
const engineFault = vi.hoisted(() => ({ nonFinite: false }));
vi.mock('../../stats/external-control', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stats/external-control')>();
  const fault = (r: BorrowResult): BorrowResult => (engineFault.nonFinite ? { ...r, borrowedPrecisionFraction: Number.NaN } : r);
  return {
    ...actual,
    powerPriorBorrow: (a: Parameters<typeof actual.powerPriorBorrow>[0]) => fault(actual.powerPriorBorrow(a)),
    commensurateBorrow: (a: Parameters<typeof actual.commensurateBorrow>[0]) => fault(actual.commensurateBorrow(a)),
  };
});

function design(): StudyDesign {
  return {
    title: 'A hybrid-control study of ACM-9 in a rare disease',
    phase: '3',
    indication: 'rare disease X',
    objectives: [],
    estimands: [],
    endpoints: [{ name: 'Change in 6MWD', role: 'primary', type: 'continuous', definition: 'change from baseline at week 48' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'external' },
    population: { targetDescription: 'patients with X', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: { plannedAnalyses: [] },
    externalControlPlan: {
      source: 'natural-history registry NH-X (2015–2024)',
      endpointName: 'Change in 6MWD',
      historical: { n: 120, mean: -25, se: 4 },
      method: 'power_prior',
      a0: 0.5,
      plannedConcurrentControlN: 30,
      assumedSd: 40,
      tippingPointAnalysisPlanned: true,
      covariateBalancePlanned: true,
    },
  } as StudyDesign;
}

/** The same design with a commensurate prior at τ². */
function commensurate(tau2: number): StudyDesign {
  const d = design();
  Object.assign(d.externalControlPlan!, { method: 'commensurate', tau2 });
  delete d.externalControlPlan!.a0;
  return d;
}

/** A design whose plan carries a value the type does not admit (as a `.passthrough()` persist can store). */
function withPlan(patch: Record<string, unknown>): StudyDesign {
  const d = design();
  Object.assign(d.externalControlPlan!, patch);
  return d;
}

const SE_C = 40 / Math.sqrt(30);
const conflictOf = (d: StudyDesign) => projectExternalControlPlan(d).elements.find((e) => e.element === 'Prior-data conflict handling')!;

/** The elements the design spine has no field for: never stated, whatever the plan says. */
const UNRECORDABLE = [
  'Fitness of the external data (relevance and reliability)',
  'Index date (time zero) alignment',
  'Comparable outcome ascertainment',
  'Prior-data conflict handling',
  'Confounding-adjustment method',
  'Missing data in the external source',
];

describe('projectExternalControlPlan — the engine\'s borrowing strength', () => {
  it('equals powerPriorBorrow at the planned concurrent SE; effective N is a0·nH', () => {
    const p = projectExternalControlPlan(design());
    const direct = powerPriorBorrow({ meanC: -25, seC: SE_C, nC: 30, meanH: -25, seH: 4, nH: 120, a0: 0.5 });
    expect(p.kind).toBe('hybrid');
    expect(p.borrowing).toEqual({
      method: 'power_prior', parameter: { name: 'a0', value: 0.5 },
      effectiveHistoricalN: 60, borrowedPrecisionFraction: direct.borrowedPrecisionFraction, plannedConcurrentSe: SE_C,
    });
    expect(p.basis).toBe(EXTERNAL_CONTROL_BASIS);
  });

  it('a commensurate prior is computed by its engine', () => {
    const p = projectExternalControlPlan(commensurate(16));
    const direct = commensurateBorrow({ meanC: -25, seC: SE_C, nC: 30, meanH: -25, seH: 4, nH: 120, tau2: 16 });
    expect(p.borrowing).toEqual({
      method: 'commensurate', parameter: { name: 'tau2', value: 16 },
      effectiveHistoricalN: direct.effectiveHistoricalN, borrowedPrecisionFraction: direct.borrowedPrecisionFraction, plannedConcurrentSe: SE_C,
    });
  });

  it('a non-finite figure from the engine is withheld, never reported under any status', () => {
    engineFault.nonFinite = true;
    try {
      const p = projectExternalControlPlan(design());
      expect(p.borrowing).toBeNull();
      expect(p.status).toBe('partial');
      expect(p.gaps).toContain('the engine returned a non-finite borrowing figure for these inputs, so none is reported');
    } finally {
      engineFault.nonFinite = false;
    }
  });
});

describe('projectExternalControlPlan — a fixed discount is not prior-data conflict handling', () => {
  it('at fixed τ² the engine\'s borrowing does not move when the concurrent control disagrees', () => {
    const agree = commensurateBorrow({ meanC: -25, seC: SE_C, nC: 30, meanH: -25, seH: 4, nH: 120, tau2: 16 });
    const conflict = commensurateBorrow({ meanC: 500, seC: SE_C, nC: 30, meanH: -25, seH: 4, nH: 120, tau2: 16 });
    expect(conflict.effectiveHistoricalN).toBe(agree.effectiveHistoricalN);
    expect(conflict.borrowedPrecisionFraction).toBe(agree.borrowedPrecisionFraction);
    // So a fixed-τ² plan must not be scored as conflict handling.
    const c = conflictOf(commensurate(16));
    expect(c.stated).toBe(false);
    expect(c.field).toBeNull();
    expect(c.detail).toMatch(/a fixed τ² is a fixed discount/);
  });

  it('a commensurate plan and the power prior it equals (a0 = seH²/(seH²+τ²)) get the same verdict', () => {
    const comm = projectExternalControlPlan(commensurate(16));
    const pp = projectExternalControlPlan(withPlan({ a0: 16 / (16 + 16) }));
    expect(comm.borrowing!.effectiveHistoricalN).toBe(pp.borrowing!.effectiveHistoricalN);
    expect(comm.borrowing!.borrowedPrecisionFraction).toBeCloseTo(pp.borrowing!.borrowedPrecisionFraction, 14);
    expect(comm.status).toBe(pp.status);
    expect(conflictOf(commensurate(16)).stated).toBe(conflictOf(withPlan({ a0: 0.5 })).stated);
  });

  it('full pooling (τ² = 0) is not conflict handling either', () => {
    const p = projectExternalControlPlan(commensurate(0));
    expect(p.borrowing!.effectiveHistoricalN).toBe(120);
    expect(conflictOf(commensurate(0)).stated).toBe(false);
    expect(p.status).toBe('partial');
  });

  it('a fixed power-prior discount says so', () => {
    expect(conflictOf(design()).detail).toMatch(/^a fixed power-prior discount does not respond to prior-data conflict/);
  });
});

describe('projectExternalControlPlan — the pre-specification checklist', () => {
  it('names ten elements; those the spine cannot record are never stated, so even a full plan is partial', () => {
    const p = projectExternalControlPlan(design());
    expect(p.elements.map((e) => e.element)).toEqual([
      'External data source',
      'Fitness of the external data (relevance and reliability)',
      'Index date (time zero) alignment',
      'Comparable outcome ascertainment',
      'Borrowing method and strength',
      'Prior-data conflict handling',
      'Covariate comparability of the populations',
      'Confounding-adjustment method',
      'Missing data in the external source',
      'Tipping-point sensitivity analysis',
    ]);
    const unrecordable = p.elements.filter((e) => e.field === null);
    expect(unrecordable.map((e) => e.element).sort()).toEqual([...UNRECORDABLE].sort());
    expect(unrecordable.every((e) => !e.stated)).toBe(true);
    expect(p.elements.filter((e) => e.field !== null).every((e) => e.stated)).toBe(true);
    expect(p.status).toBe('partial');
    expect(p.gaps).toHaveLength(UNRECORDABLE.length);
    for (const e of UNRECORDABLE) expect(p.gaps.some((g) => g.startsWith(`${e}: `))).toBe(true);
    expect(p.gaps.find((g) => g.startsWith('Comparable outcome ascertainment'))).toMatch(/blinded assessment or re-adjudication/);
  });

  it('unstated sensitivity and balance plans are listed, never assumed', () => {
    const p = projectExternalControlPlan(withPlan({ tippingPointAnalysisPlanned: undefined, covariateBalancePlanned: false }));
    expect(p.gaps).toEqual(expect.arrayContaining([
      'Covariate comparability of the populations: not recorded',
      'Tipping-point sensitivity analysis: not recorded',
    ]));
  });

  it('a blank or non-string source is "not recorded", and a non-string one does not throw', () => {
    for (const source of ['   ', 123, null]) {
      const p = projectExternalControlPlan(withPlan({ source }));
      expect(p.gaps).toContain('External data source: not recorded');
      expect(p.elements[0]).toMatchObject({ element: 'External data source', stated: false });
    }
  });
});

describe('projectExternalControlPlan — what the plan does not carry is a gap', () => {
  it('no assumed SD: the borrowed share is not computed', () => {
    const d = design();
    delete d.externalControlPlan!.assumedSd;
    const p = projectExternalControlPlan(d);
    expect(p.borrowing).toBeNull();
    expect(p.gaps[0]).toMatch(/assumed SD is not recorded/);
  });

  it('a fully external control has no ratio to compute, and says why', () => {
    const p = projectExternalControlPlan(withPlan({ plannedConcurrentControlN: 0 }));
    expect(p.kind).toBe('fully_external');
    expect(p.borrowing).toBeNull();
    expect(p.gaps[0]).toMatch(/rests entirely on the external control/);
  });

  it('an invalid concurrent-control size is a gap, computes nothing, and reports no kind', () => {
    for (const n of [-1, 2.5, undefined, null, Number.NaN]) {
      const p = projectExternalControlPlan(withPlan({ plannedConcurrentControlN: n }));
      expect(p.gaps).toContain('the planned concurrent control size must be a whole number (0 for a fully external control)');
      expect(p.borrowing).toBeNull();
      expect(p.kind).toBeNull();
    }
  });

  it('a negative or non-finite τ² is a gap and does not throw', () => {
    for (const tau2 of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = projectExternalControlPlan(commensurate(tau2));
      expect(p.gaps).toContain('the commensurability variance τ² must be recorded as a finite, non-negative number');
      expect(p.borrowing).toBeNull();
    }
  });

  it('an incomplete plan computes nothing and names each defect', () => {
    const p = projectExternalControlPlan(withPlan({ a0: 1.5, historical: { n: 0, mean: -25, se: 4 }, endpointName: 'Response' }));
    expect(p.borrowing).toBeNull();
    expect(p.gaps).toEqual(expect.arrayContaining([
      'endpoint "Response" is not an endpoint of this design',
      'the external control summary (n, mean, standard error) is incomplete',
      'the power-prior discount a0 must be recorded, between 0 and 1',
    ]));
  });
});

describe('projectExternalControlPlan — whether a plan is needed', () => {
  it('an external-control design with no plan is missing; a recorded concurrent control is not_applicable', () => {
    const d = design();
    delete d.externalControlPlan;
    const p = projectExternalControlPlan(d);
    expect(p.status).toBe('missing');
    expect(p.gaps[0]).toMatch(/uses an external control but records no borrowing plan/);
    d.framework.controlType = 'placebo';
    expect(projectExternalControlPlan(d).status).toBe('not_applicable');
  });

  it('an unrecorded or unknown control type is not_assessable, never "no external control"', () => {
    const d = design();
    delete d.externalControlPlan;
    for (const framework of [undefined, { inferentialFrame: 'superiority' }, { inferentialFrame: 'superiority', controlType: 'synthetic' }]) {
      const p = projectExternalControlPlan({ ...d, framework } as unknown as StudyDesign);
      expect(p.status).toBe('not_assessable');
      expect(p.gaps[0]).toMatch(/so whether an external-control plan is required cannot be assessed$/);
      expect(p.gaps.join(' ')).not.toMatch(/uses no external/);
    }
  });
});

describe('projectExternalControlPlan — total over what a passthrough persist can store', () => {
  const run = (d: StudyDesign) => () => projectExternalControlPlan(d);

  it('a null or non-object endpoint entry is skipped, not dereferenced', () => {
    const d = { ...design(), endpoints: [null, 7] } as unknown as StudyDesign;
    expect(run(d)).not.toThrow();
    expect(projectExternalControlPlan(d).gaps).toContain('endpoint "Change in 6MWD" is not an endpoint of this design');
    expect(run({ ...design(), endpoints: 'x' } as unknown as StudyDesign)).not.toThrow();
  });

  it('a plan that is not a record is a gap', () => {
    for (const plan of ['x', 5, [1, 2]]) {
      const p = projectExternalControlPlan({ ...design(), externalControlPlan: plan } as unknown as StudyDesign);
      expect(p.status).toBe('partial');
      expect(p.gaps).toEqual(['the external-control plan is not a structured record, so none of it can be read']);
    }
  });

  it('a concurrent SE with no finite positive precision is a gap — not the engine\'s throw, nor a finite wrong share', () => {
    // 5e-324 underflows seC to 0 (the engine would throw); 1e-160 leaves seC > 0 but 1/seC² = ∞, where the
    // engine returns a FINITE borrowed share of 0 — a wrong figure no finiteness check afterwards would catch.
    for (const assumedSd of [5e-324, 1e-160]) {
      const d = withPlan({ assumedSd });
      expect(run(d)).not.toThrow();
      const p = projectExternalControlPlan(d);
      expect(p.borrowing).toBeNull();
      expect(p.gaps[0]).toMatch(/^the planned concurrent control's standard error .* has no finite positive precision/);
    }
  });

  it('an external SE whose precision underflows is a gap, never a rendered NaN', () => {
    const d = commensurate(0);
    d.externalControlPlan!.historical = { n: 120, mean: -25, se: 1e-200 };
    const p = projectExternalControlPlan(d);
    expect(p.borrowing).toBeNull();
    expect(p.gaps[0]).toMatch(/^the external control's standard error \(1e-200\) has no finite positive precision/);
    expect(JSON.stringify(p)).not.toMatch(/null,"plannedConcurrentSe"|"effectiveHistoricalN":null/);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(projectExternalControlPlan(design()))).toBe(JSON.stringify(projectExternalControlPlan(design())));
  });
});
