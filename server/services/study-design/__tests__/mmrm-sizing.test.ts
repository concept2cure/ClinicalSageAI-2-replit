/**
 * MMRM sizing.
 *
 * What the suite holds: the sized N is the engine's (equal to `mmrmSampleSize`
 * called directly, and to the textbook two-sample formula when there is no
 * dropout and no correlation), and the output says what was sized (allocation,
 * target visit); the engine's defaults never stand in for a missing assumption
 * (no alpha, power, retention or allocation → nothing sized; a recorded 2:1 is
 * never sized as 1:1); what is sized is what the plan analyses (the endpoint
 * the plan analyses by MMRM, in a superiority frame); the planned N is
 * compared both ways; the visit count is cross-checked against the SoA, and a
 * check that cannot run is a gap; an MMRM named in the plan with no
 * assumptions is MISSING; a design with no MMRM is not_applicable.
 */
import { describe, expect, it } from 'vitest';

import { mmrmSampleSize } from '../../stats/mmrm-design';
import type { StudyDesign } from '../study-design-types';
import { isMmrmMethod, MMRM_SIZING_BASIS, projectMmrmSizing } from '../mmrm-sizing';

function design(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    objectives: [],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24' },
      { name: 'Body weight change', role: 'secondary', type: 'continuous', definition: 'change from baseline in body weight at week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
    arms: [],
    randomization: { ratio: [1, 1], allocationMethod: 'block', blinding: 'double' },
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
const assumptions = () => design().statisticalPlan.mmrmAssumptions!;
/** A persisted design is not validated: tests write malformed values through this. */
const loose = (o: object): Record<string, unknown> => o as Record<string, unknown>;

describe('projectMmrmSizing — the engine\'s numbers', () => {
  it('equals mmrmSampleSize called directly, says what it sized, and covers the planned N', () => {
    const p = projectMmrmSizing(design());
    const direct = mmrmSampleSize({ ...assumptions(), alpha: 0.05, power: 0.9, allocationRatio: 1 });
    expect(p.status).toBe('rendered');
    expect(p.gaps).toEqual([]);
    expect(p.sizing).toMatchObject({
      nPerArm: direct.nPerArm, nSecondArm: direct.nTotal - direct.nPerArm, nTotal: direct.nTotal, varianceFactor: direct.varianceFactor,
      achievedPower: direct.achievedPower, alphaTwoSided: 0.05, allocationRatio: 1, allocationSource: 'randomization', targetVisit: 3,
    });
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

  it('reports the target visit the engine sized at', () => {
    const d = design();
    d.statisticalPlan.mmrmAssumptions!.targetVisit = 2;
    const p = projectMmrmSizing(d);
    expect(p.sizing!.targetVisit).toBe(2);
    expect(p.sizing!.nTotal).toBe(mmrmSampleSize({ ...assumptions(), targetVisit: 2, alpha: 0.05, power: 0.9, allocationRatio: 1 }).nTotal);
  });

  it('carries no clock reading and is deterministic', () => {
    const p = projectMmrmSizing(design());
    expect(p.sizing!.provenance).not.toHaveProperty('generatedAt');
    expect(JSON.stringify(p)).toBe(JSON.stringify(projectMmrmSizing(clone(design()))));
  });
});

describe('projectMmrmSizing — the allocation ratio is the design\'s, never the engine\'s 1:1', () => {
  it('a 2:1 randomization with no allocation in the assumptions is sized at 2:1, and a 400 plan is short', () => {
    const d = design();
    d.randomization!.ratio = [2, 1];
    const p = projectMmrmSizing(d);
    const direct = mmrmSampleSize({ ...assumptions(), alpha: 0.05, power: 0.9, allocationRatio: 0.5 });
    expect(p.sizing).toMatchObject({ allocationRatio: 0.5, allocationSource: 'randomization', nTotal: direct.nTotal, nPerArm: direct.nPerArm });
    expect(p.status).not.toBe('rendered');
    expect(p.plannedVsRequired!.covered).toBe(false);
    expect(p.gaps).toContain(`the planned sample size (400) is ${direct.nTotal - 400} below the MMRM requirement (${direct.nTotal})`);
  });

  it('no allocation recorded anywhere: nothing is sized', () => {
    const d = design();
    delete d.randomization;
    const p = projectMmrmSizing(d);
    expect(p.status).toBe('partial');
    expect(p.sizing).toBeNull();
    expect(p.gaps).toEqual([
      'the allocation ratio is not recorded (neither in the MMRM assumptions nor as the randomization ratio): the engine\'s 1:1 is not assumed',
    ]);
  });

  it('a recorded allocation that the randomization contradicts is a gap', () => {
    const d = design();
    d.statisticalPlan.mmrmAssumptions!.allocationRatio = 2;
    const p = projectMmrmSizing(d);
    expect(p.sizing).toMatchObject({ allocationRatio: 2, allocationSource: 'mmrm_assumptions' });
    expect(p.status).toBe('partial');
    expect(p.gaps).toContain('the MMRM assumptions allocate n₂/n₁ = 2; the randomization records 1:1');
  });

  it('three randomized arms and no allocation in the assumptions: nothing is sized', () => {
    const d = design();
    d.randomization!.ratio = [1, 1, 1];
    const p = projectMmrmSizing(d);
    expect(p.sizing).toBeNull();
    expect(p.gaps).toEqual([
      'the allocation ratio is not recorded in the MMRM assumptions, and the randomization (1:1:1) has 3 arms: which two the MMRM contrast compares is not recorded',
    ]);
  });

  it('three randomized arms with an allocation recorded: the two-arm total is not compared with the planned total', () => {
    const d = design();
    d.randomization!.ratio = [1, 1, 1];
    d.statisticalPlan.mmrmAssumptions!.allocationRatio = 1;
    const p = projectMmrmSizing(d);
    expect(p.sizing).not.toBeNull();
    expect(p.plannedVsRequired).toBeNull();
    expect(p.gaps).toContain('the design randomizes 3 arms; the engine\'s total is for one two-arm contrast, so the planned total is not compared with it');
  });
});

describe('projectMmrmSizing — no engine default stands in for an assumption', () => {
  it('no target power: nothing is sized (the engine would have used 0.90)', () => {
    const d = design();
    delete d.statisticalPlan.power;
    const p = projectMmrmSizing(d);
    expect(p.status).toBe('partial');
    expect(p.sizing).toBeNull();
    expect(p.gaps).toEqual(['the target power is not recorded: no sample size is computed rather than assume one']);
  });

  it('no alpha: nothing is sized (the engine would have used 0.05)', () => {
    const d = design();
    delete d.statisticalPlan.alpha;
    const p = projectMmrmSizing(d);
    expect(p.sizing).toBeNull();
    expect(p.gaps).toEqual(['the significance level (alpha) is not recorded']);
  });

  it('no sidedness: alpha is read as two-sided, stated as a gap, and the design is still sized', () => {
    const d = design();
    delete d.statisticalPlan.oneSided;
    const p = projectMmrmSizing(d);
    expect(p.status).toBe('partial');
    expect(p.sizing!.alphaTwoSided).toBe(0.05);
    expect(p.gaps).toEqual(['sidedness is not recorded: alpha is read as two-sided']);
  });

  it('a one-sided alpha of 0.5 or more has no two-sided equivalent: nothing is sized, nothing clamped', () => {
    const d = design();
    Object.assign(d.statisticalPlan, { alpha: 0.6, oneSided: true });
    const p = projectMmrmSizing(d);
    expect(p.sizing).toBeNull();
    expect(p.plannedVsRequired).toBeNull();
    expect(p.gaps).toEqual(['a one-sided alpha of 0.6 has no two-sided equivalent below 1: nothing is sized']);
  });

  it('no retention — the field absent, and an empty list: nothing is sized (the engine would have assumed complete data)', () => {
    const gap = 'per-visit retention is not recorded: the dropout pattern MMRM is sized under is unknown, and complete data is not assumed';
    const d = design();
    delete loose(d.statisticalPlan.mmrmAssumptions!).retention;
    expect(projectMmrmSizing(d)).toMatchObject({ status: 'partial', sizing: null, gaps: [gap] });
    d.statisticalPlan.mmrmAssumptions!.retention = [];
    expect(projectMmrmSizing(d)).toMatchObject({ status: 'partial', sizing: null, gaps: [gap] });
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
    const p = projectMmrmSizing(d);
    expect(p.sizing).toBeNull();
    expect(p.gaps).toContain('endpoint "Response rate" is not a continuous endpoint of this design');
  });
});

describe('projectMmrmSizing — what is sized is what the plan analyses', () => {
  it.each(['non_inferiority', 'equivalence'] as const)('a %s frame is not sized as a superiority contrast', (frame) => {
    const d = design();
    d.framework.inferentialFrame = frame;
    const p = projectMmrmSizing(d);
    expect(p).toMatchObject({ status: 'partial', sizing: null, plannedVsRequired: null });
    expect(p.gaps).toEqual([
      `the design's inferential frame is ${frame.replace('_', '-')}: the MMRM engine sizes a two-sided superiority contrast only, so no sample size is computed for this frame`,
    ]);
  });

  it('an unrecorded frame is not assumed to be superiority', () => {
    const d = design();
    delete loose(d).framework;
    const p = projectMmrmSizing(d);
    expect(p.sizing).toBeNull();
    expect(p.gaps).toEqual(['the inferential frame is not recorded: the MMRM engine sizes a superiority contrast only, and superiority is not assumed']);
  });

  it('assumptions for an endpoint the plan analyses by ANCOVA are not sized as MMRM', () => {
    const d = design();
    d.statisticalPlan.plannedAnalyses = [{ endpointName: 'HbA1c change', method: 'ANCOVA' }];
    const p = projectMmrmSizing(d);
    expect(p).toMatchObject({ status: 'partial', sizing: null });
    expect(p.gaps).toEqual(['the plan analyses "HbA1c change" by ANCOVA, not by MMRM: an MMRM sample size does not apply to it']);
  });

  it('assumptions for another endpoint leave the MMRM-analysed endpoint reported as unsized', () => {
    const d = design();
    d.statisticalPlan.mmrmAssumptions!.endpointName = 'Body weight change';
    const p = projectMmrmSizing(d);
    expect(p.status).toBe('partial');
    expect(p.gaps).toEqual(expect.arrayContaining([
      'no planned analysis of "Body weight change" is recorded, so it is not confirmed that the plan analyses it by MMRM',
      'the plan also analyses "HbA1c change" by MMRM, and no MMRM assumptions are recorded for it: it is not sized',
    ]));
  });

  it.each(['Mixed models for repeated measures', 'mixed-effects model for repeated measures', 'Repeated-measures mixed model', 'MMRM (unstructured)'])(
    'a planned "%s" with no assumptions is missing, not not_applicable',
    (method) => {
      const d = design();
      delete d.statisticalPlan.mmrmAssumptions;
      d.statisticalPlan.plannedAnalyses = [{ endpointName: 'HbA1c change', method }];
      const p = projectMmrmSizing(d);
      expect(p.status).toBe('missing');
      expect(p.gaps[0]).toMatch(/analyses "HbA1c change" by MMRM but records no/);
    },
  );

  it('the MMRM method classifier does not claim a model that is not a repeated-measures mixed model', () => {
    for (const m of ['ANCOVA', 'linear mixed model', 'mixed model', 'repeated-measures ANOVA', 'GEE']) expect(isMmrmMethod(m)).toBe(false);
    expect(isMmrmMethod(undefined)).toBe(false);
  });

  it('recorded assumptions that name no endpoint are a gap, never not_applicable', () => {
    for (const name of [null, '', '  ']) {
      const d = design();
      loose(d.statisticalPlan.mmrmAssumptions!).endpointName = name;
      const p = projectMmrmSizing(d);
      expect(p.status).toBe('partial');
      expect(p.sizing).toBeNull();
      expect(p.gaps).toContain('the MMRM assumptions name no endpoint: it is not known which endpoint they size');
    }
  });

  it('MMRM named in the plan with no assumptions is missing; no MMRM at all is not_applicable', () => {
    const d = design();
    delete d.statisticalPlan.mmrmAssumptions;
    const p = projectMmrmSizing(d);
    expect(p.status).toBe('missing');
    expect(p.gaps[0]).toMatch(/analyses "HbA1c change" by MMRM but records no/);
    d.statisticalPlan.plannedAnalyses = [{ endpointName: 'HbA1c change', method: 'ANCOVA' }];
    expect(projectMmrmSizing(d)).toMatchObject({ status: 'not_applicable', gaps: ['no MMRM analysis is planned and no MMRM assumptions are recorded'] });
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

  it('no planned N: sized, but not compared', () => {
    const d = design();
    delete d.statisticalPlan.plannedSampleSize;
    const p = projectMmrmSizing(d);
    expect(p.sizing).not.toBeNull();
    expect(p.plannedVsRequired).toBeNull();
    expect(p.gaps).toEqual(['the planned sample size is not recorded, so it cannot be checked against the MMRM requirement']);
  });

  it('no source for the assumptions is a gap', () => {
    const d = design();
    delete d.statisticalPlan.mmrmAssumptions!.source;
    expect(projectMmrmSizing(d)).toMatchObject({ status: 'partial', gaps: ['the source of the MMRM assumptions is not recorded'] });
  });

  it('a dropout rate the retention contradicts is a gap; one it matches is not', () => {
    const d = design();
    d.statisticalPlan.dropoutRate = 0.4;
    expect(projectMmrmSizing(d).gaps).toEqual([
      'the plan\'s dropout rate (0.4) and the dropout the MMRM retention implies by the final visit (0.15) differ by more than 0.02',
    ]);
    d.statisticalPlan.dropoutRate = 0.15;
    expect(projectMmrmSizing(d)).toMatchObject({ status: 'rendered', gaps: [] });
  });
});

describe('projectMmrmSizing — the Schedule of Activities cross-check', () => {
  it('a visit count the SoA contradicts is a gap', () => {
    const d = design();
    d.statisticalPlan.mmrmAssumptions!.visits = 4;
    d.statisticalPlan.mmrmAssumptions!.retention = [0.95, 0.9, 0.87, 0.85];
    expect(projectMmrmSizing(d).gaps).toContain('the assumptions model 4 post-baseline visits; the Schedule of Activities schedules the endpoint at 3');
  });

  it('an SoA with no baseline visit is reported as not cross-checked', () => {
    const d = design();
    d.scheduleOfActivities!.visits[0].isBaseline = false;
    const p = projectMmrmSizing(d);
    expect(p).toMatchObject({ status: 'partial', soaVisitCount: null });
    expect(p.gaps).toEqual(['the Schedule of Activities flags no baseline visit: the modelled post-baseline visit count is not cross-checked against it']);
  });

  it('an SoA with no activity linked to the endpoint — or a link that is not a list — is reported as not cross-checked', () => {
    const gap = 'no Schedule of Activities activity is linked to "HbA1c change": the modelled visit count is not cross-checked against it';
    const d = design();
    d.scheduleOfActivities!.activities[0].endpointNames = ['HbA1c'];
    expect(projectMmrmSizing(d)).toMatchObject({ status: 'partial', soaVisitCount: null, gaps: [gap] });
    loose(d.scheduleOfActivities!.activities[0]).endpointNames = 'HbA1c change, extended';
    expect(projectMmrmSizing(d)).toMatchObject({ status: 'partial', soaVisitCount: null, gaps: [gap] });
  });

  it('a malformed SoA is a gap, not a throw', () => {
    const d = design();
    loose(d).scheduleOfActivities = { epochs: [] };
    const p = projectMmrmSizing(d);
    expect(p.sizing).not.toBeNull();
    expect(p.gaps).toEqual(['the Schedule of Activities is malformed (it lacks a visits, activities or cells list): the modelled visit count is not cross-checked against it']);
  });

  it('an unscheduled visit is not counted as a modelled visit', () => {
    const d = design();
    d.scheduleOfActivities!.visits.push({ id: 'ET', name: 'Early termination', epochId: 'e1', unscheduled: true, order: 4 });
    d.scheduleOfActivities!.cells.push({ activityId: 'a1', visitId: 'ET', state: 'performed' });
    expect(projectMmrmSizing(d)).toMatchObject({ status: 'rendered', soaVisitCount: 3 });
  });
});
