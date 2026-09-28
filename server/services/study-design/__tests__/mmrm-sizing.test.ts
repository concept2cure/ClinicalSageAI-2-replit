/**
 * MMRM sizing.
 *
 * What the suite holds: the sized N is the engine's (equal to `mmrmSampleSize`
 * called directly, and to the textbook two-sample formula when there is no
 * dropout and no correlation); the engine's defaults never stand in for a
 * missing assumption (no power, no retention → nothing sized); the planned N is
 * compared both ways; the visit count is cross-checked against the SoA; an
 * MMRM named in the plan with no assumptions is MISSING; a design with no MMRM
 * is not_applicable.
 */
import { describe, expect, it } from 'vitest';

import { mmrmSampleSize } from '../../stats/mmrm-design';
import type { StudyDesign } from '../study-design-types';
import { MMRM_SIZING_BASIS, projectMmrmSizing } from '../mmrm-sizing';

function design(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    objectives: [],
    estimands: [],
    endpoints: [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: {
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }],
      alpha: 0.05,
      oneSided: false,
      power: 0.9,
      plannedSampleSize: 400,
      mmrmAssumptions: {
        endpointName: 'HbA1c change', visits: 3, covariance: 'compound_symmetry', rho: 0.6, sigma: 1.1, delta: 0.4,
        retention: [0.95, 0.9, 0.85], source: 'phase 2 study ACM-201',
      },
    },
    scheduleOfActivities: {
      epochs: [{ id: 'e1', name: 'Treatment', kind: 'treatment', order: 0 }],
      visits: [
        { id: 'V0', name: 'Baseline', epochId: 'e1', studyDay: 1, isBaseline: true, order: 0 },
        { id: 'V1', name: 'Week 8', epochId: 'e1', studyDay: 57, order: 1 },
        { id: 'V2', name: 'Week 16', epochId: 'e1', studyDay: 113, order: 2 },
        { id: 'V3', name: 'Week 24', epochId: 'e1', studyDay: 169, order: 3 },
      ],
      activities: [{ id: 'a1', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 0 }],
      cells: ['V0', 'V1', 'V2', 'V3'].map((visitId) => ({ activityId: 'a1', visitId, state: 'performed' as const })),
    },
  } as StudyDesign;
}

const clone = (d: StudyDesign): StudyDesign => JSON.parse(JSON.stringify(d));

describe('projectMmrmSizing — the engine\'s numbers', () => {
  it('equals mmrmSampleSize called directly, and covers the planned N', () => {
    const p = projectMmrmSizing(design());
    const direct = mmrmSampleSize({ ...design().statisticalPlan.mmrmAssumptions!, alpha: 0.05, power: 0.9 });
    expect(p.status).toBe('rendered');
    expect(p.sizing).toMatchObject({ nPerArm: direct.nPerArm, nTotal: direct.nTotal, varianceFactor: direct.varianceFactor, achievedPower: direct.achievedPower, alphaTwoSided: 0.05 });
    expect(p.sizing!.efficiencyVsCompleters).toBeGreaterThan(1);
    expect(p.plannedVsRequired).toEqual({ planned: 400, required: direct.nTotal, covered: true, shortfall: 0 });
    expect(p.soaVisitCount).toBe(3);
    expect(p.basis).toBe(MMRM_SIZING_BASIS);
  });

  it('reduces to the two-sample formula with no dropout and no correlation', () => {
    const d = design();
    Object.assign(d.statisticalPlan.mmrmAssumptions!, { rho: 0, retention: [1, 1, 1] });
    const z = 1.959964 + 1.281552;
    const perArm = Math.ceil((2 * 1.1 * 1.1 * z * z) / (0.4 * 0.4));
    expect(projectMmrmSizing(d).sizing!.nPerArm).toBe(perArm);
  });

  it('reads a one-sided alpha as its two-sided equivalent', () => {
    const d = design();
    Object.assign(d.statisticalPlan, { alpha: 0.025, oneSided: true });
    expect(projectMmrmSizing(d).sizing!.alphaTwoSided).toBe(0.05);
  });

  it('carries no clock reading and is deterministic', () => {
    const p = projectMmrmSizing(design());
    expect(p.sizing!.provenance).not.toHaveProperty('generatedAt');
    expect(JSON.stringify(p)).toBe(JSON.stringify(projectMmrmSizing(clone(design()))));
  });
});

describe('projectMmrmSizing — no engine default stands in for an assumption', () => {
  it('no target power: nothing is sized (the engine would have used 0.90)', () => {
    const d = design();
    delete d.statisticalPlan.power;
    const p = projectMmrmSizing(d);
    expect(p.status).toBe('partial');
    expect(p.sizing).toBeNull();
    expect(p.gaps).toContain('the target power is not recorded: no sample size is computed rather than assume one');
  });

  it('no retention: nothing is sized (the engine would have assumed complete data)', () => {
    const d = design();
    d.statisticalPlan.mmrmAssumptions!.retention = [];
    const p = projectMmrmSizing(d);
    expect(p.sizing).toBeNull();
    expect(p.gaps[0]).toMatch(/complete data is not assumed/);
  });

  it('invalid assumptions are gaps, with nothing sized', () => {
    const d = design();
    Object.assign(d.statisticalPlan.mmrmAssumptions!, { rho: 1, sigma: 0, delta: 0, retention: [0.9, 0.95], covariance: 'unstructured' });
    const p = projectMmrmSizing(d);
    expect(p.sizing).toBeNull();
    expect(p.gaps).toEqual(expect.arrayContaining([
      expect.stringMatching(/covariance "unstructured"/),
      expect.stringMatching(/correlation must be/),
      expect.stringMatching(/SD must be positive/),
      expect.stringMatching(/delta\) must be a non-zero/),
      expect.stringMatching(/2 retention values are recorded for 3 visits/),
      expect.stringMatching(/never increase/),
    ]));
  });

  it('an endpoint that is not a continuous endpoint of the design is a gap', () => {
    const d = design();
    d.statisticalPlan.mmrmAssumptions!.endpointName = 'Response rate';
    expect(projectMmrmSizing(d).gaps[0]).toMatch(/is not a continuous endpoint of this design/);
  });
});

describe('projectMmrmSizing — consistency with the plan', () => {
  it('a planned N below the requirement is reported with the shortfall', () => {
    const d = design();
    d.statisticalPlan.plannedSampleSize = 100;
    const p = projectMmrmSizing(d);
    expect(p.status).toBe('partial');
    expect(p.plannedVsRequired!.covered).toBe(false);
    expect(p.plannedVsRequired!.shortfall).toBe(p.sizing!.nTotal - 100);
    expect(p.gaps.at(-1)).toMatch(/is \d+ below the MMRM requirement/);
  });

  it('a visit count the SoA contradicts is a gap', () => {
    const d = design();
    d.statisticalPlan.mmrmAssumptions!.visits = 4;
    d.statisticalPlan.mmrmAssumptions!.retention = [0.95, 0.9, 0.87, 0.85];
    expect(projectMmrmSizing(d).gaps).toContain('the assumptions model 4 post-baseline visits; the Schedule of Activities schedules the endpoint at 3');
  });

  it('MMRM named in the plan with no assumptions is missing; no MMRM at all is not_applicable', () => {
    const d = design();
    delete d.statisticalPlan.mmrmAssumptions;
    const p = projectMmrmSizing(d);
    expect(p.status).toBe('missing');
    expect(p.gaps[0]).toMatch(/analyses "HbA1c change" by MMRM but records no/);
    d.statisticalPlan.plannedAnalyses = [{ endpointName: 'HbA1c change', method: 'ANCOVA' }];
    expect(projectMmrmSizing(d).status).toBe('not_applicable');
  });
});
