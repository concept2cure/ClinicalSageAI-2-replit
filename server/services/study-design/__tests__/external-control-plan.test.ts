/**
 * External-control plan.
 *
 * What the suite holds: the borrowing strength is the engine's (equal to
 * `powerPriorBorrow` / `commensurateBorrow` called directly at the planned
 * concurrent-control SE); a power prior's effective historical N is a0·nH; a
 * commensurate prior is recognised as conflict-aware and a fixed a0 is not;
 * every pre-specification element the FDA 2023 draft guidance expects is
 * listed stated-or-not; an external-control design with no plan is MISSING; a
 * fully external control has no ratio computed.
 */
import { describe, expect, it } from 'vitest';

import { commensurateBorrow, powerPriorBorrow } from '../../stats/external-control';
import type { StudyDesign } from '../study-design-types';
import { EXTERNAL_CONTROL_BASIS, projectExternalControlPlan } from '../external-control-plan';

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

describe('projectExternalControlPlan — the engine\'s borrowing strength', () => {
  it('equals powerPriorBorrow at the planned concurrent SE; effective N is a0·nH', () => {
    const p = projectExternalControlPlan(design());
    const seC = 40 / Math.sqrt(30);
    const direct = powerPriorBorrow({ meanC: -25, seC, nC: 30, meanH: -25, seH: 4, nH: 120, a0: 0.5 });
    expect(p.kind).toBe('hybrid');
    expect(p.borrowing).toEqual({
      method: 'power_prior', parameter: { name: 'a0', value: 0.5 },
      effectiveHistoricalN: 60, borrowedPrecisionFraction: direct.borrowedPrecisionFraction, plannedConcurrentSe: seC,
    });
    expect(p.basis).toBe(EXTERNAL_CONTROL_BASIS);
  });

  it('a commensurate prior is computed by its engine and counted as conflict-aware', () => {
    const d = design();
    Object.assign(d.externalControlPlan!, { method: 'commensurate', tau2: 16 });
    delete d.externalControlPlan!.a0;
    const p = projectExternalControlPlan(d);
    const seC = 40 / Math.sqrt(30);
    expect(p.borrowing!.effectiveHistoricalN).toBe(commensurateBorrow({ meanC: -25, seC, nC: 30, meanH: -25, seH: 4, nH: 120, tau2: 16 }).effectiveHistoricalN);
    expect(p.status).toBe('rendered');
    expect(p.elements.find((e) => e.element === 'Prior-data conflict handling')!.stated).toBe(true);
  });
});

describe('projectExternalControlPlan — what the plan does not pre-specify is a gap', () => {
  it('a fixed power-prior discount is not a conflict plan', () => {
    const p = projectExternalControlPlan(design());
    expect(p.status).toBe('partial');
    expect(p.gaps).toEqual(['Prior-data conflict handling: a fixed power-prior discount does not respond to prior-data conflict; a pre-specified conflict assessment is not recorded']);
  });

  it('unstated sensitivity and balance plans are listed, never assumed', () => {
    const d = design();
    Object.assign(d.externalControlPlan!, { method: 'commensurate', tau2: 16, tippingPointAnalysisPlanned: undefined, covariateBalancePlanned: false });
    const p = projectExternalControlPlan(d);
    expect(p.gaps).toEqual([
      'Covariate comparability of the populations: not recorded',
      'Tipping-point sensitivity analysis: not recorded',
    ]);
  });

  it('no assumed SD: the borrowed share is not computed', () => {
    const d = design();
    delete d.externalControlPlan!.assumedSd;
    const p = projectExternalControlPlan(d);
    expect(p.borrowing).toBeNull();
    expect(p.gaps[0]).toMatch(/assumed SD is not recorded/);
  });

  it('a fully external control has no ratio to compute, and says why', () => {
    const d = design();
    d.externalControlPlan!.plannedConcurrentControlN = 0;
    const p = projectExternalControlPlan(d);
    expect(p.kind).toBe('fully_external');
    expect(p.borrowing).toBeNull();
    expect(p.gaps[0]).toMatch(/rests entirely on the external control/);
  });

  it('an incomplete plan computes nothing and names each defect', () => {
    const d = design();
    Object.assign(d.externalControlPlan!, { a0: 1.5, historical: { n: 0, mean: -25, se: 4 }, endpointName: 'Response' });
    const p = projectExternalControlPlan(d);
    expect(p.borrowing).toBeNull();
    expect(p.gaps).toEqual(expect.arrayContaining([
      'endpoint "Response" is not an endpoint of this design',
      'the external control summary (n, mean, standard error) is incomplete',
      'the power-prior discount a0 must be recorded, between 0 and 1',
    ]));
  });

  it('an external-control design with no plan is missing; a concurrent-controlled one is not_applicable', () => {
    const d = design();
    delete d.externalControlPlan;
    const p = projectExternalControlPlan(d);
    expect(p.status).toBe('missing');
    expect(p.gaps[0]).toMatch(/uses an external control but records no borrowing plan/);
    d.framework.controlType = 'placebo';
    expect(projectExternalControlPlan(d).status).toBe('not_applicable');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(projectExternalControlPlan(design()))).toBe(JSON.stringify(projectExternalControlPlan(design())));
  });
});
