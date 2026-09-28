/**
 * Tests for the USDM-shaped export. The export is a deterministic projection of
 * the design object into a graph named after CDISC USDM v3 entities: entity counts
 * round-trip, every reference resolves, ids are positional and identical across
 * calls, the graph survives a JSON round-trip, conformance is ALWAYS `unverified`,
 * and nothing the design does not carry (sponsor, identifier, date, timing) is
 * invented — it is named in `unfilledUsdmEntities`, while every populated design
 * field with no USDM home is named in `unmappedDesignFields`.
 */

import { describe, it, expect } from 'vitest';
import {
  ALWAYS_UNFILLED,
  USDM_BASIS,
  USDM_CONFORMANCE_REASON,
  projectUsdm,
} from '../usdm-projection';
import { SOA_DERIVED_ENTITIES, USDM_NO_SOA } from '../usdm-schedule';
import { C2C_CODE_SYSTEM, type UsdmProjection, type UsdmStudyDesign } from '../usdm-types';
import { type ScheduleOfActivities, type StudyDesign } from '../study-design-types';

/** Screening → treatment → follow-up (epochs listed out of order), five dated visits, baseline on day 1. */
function usdmSoa(): ScheduleOfActivities {
  return {
    id: 'soa-internal-1',
    epochs: [
      { id: 'e_fu', name: 'Follow-up', kind: 'follow_up', order: 2 },
      { id: 'e_scr', name: 'Screening', kind: 'screening', order: 0 },
      { id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 1 },
    ],
    visits: [
      { id: 'V1', name: 'Screening', epochId: 'e_scr', studyDay: -28, windowDays: 3, order: 0 },
      { id: 'V2', name: 'Baseline', epochId: 'e_trt', studyDay: 1, isBaseline: true, order: 1 },
      { id: 'V3', name: 'Week 12', epochId: 'e_trt', studyDay: 84, windowDays: 3, order: 2 },
      { id: 'V4', name: 'Week 24', epochId: 'e_trt', studyDay: 168, windowDays: 3, order: 3 },
      { id: 'V5', name: 'Safety follow-up', epochId: 'e_fu', studyDay: 196, windowDays: 7, order: 4 },
    ],
    activities: [
      { id: 'a_consent', name: 'Informed consent', category: 'administrative', order: 0 },
      { id: 'a_elig', name: 'Eligibility review', category: 'eligibility', order: 1 },
      { id: 'a_hba1c', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 2 },
      { id: 'a_ae', name: 'Adverse events', category: 'safety', order: 3 },
    ],
    cells: [
      { activityId: 'a_consent', visitId: 'V1', state: 'performed' },
      { activityId: 'a_elig', visitId: 'V1', state: 'performed' },
      { activityId: 'a_elig', visitId: 'V2', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V2', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V3', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V4', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V2', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V3', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V4', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V5', state: 'performed' },
    ],
  };
}

const METFORMIN = { name: 'Metformin', role: 'standard_of_care' as const, dose: '1000 mg', route: 'oral', regimen: 'twice daily' };

function usdmDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    version: 2,
    objectives: [
      { level: 'secondary', order: 1, text: 'Assess body weight', endpointName: 'Body weight change' },
      { level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change', estimandEndpointName: 'HbA1c change' },
    ],
    estimands: [
      {
        endpointName: 'HbA1c change',
        treatmentCondition: 'Drug X 10 mg daily versus placebo, both on background metformin',
        population: 'all randomized patients',
        variable: 'change from baseline in HbA1c at week 24',
        summaryMeasure: 'difference in means',
        strategy: 'treatment_policy',
        intercurrentEvents: [{ name: 'rescue medication', strategy: 'treatment_policy', justification: 'reflects clinical practice' }],
      },
    ],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24', timepoint: 'week 24' },
      { name: 'Body weight change', role: 'key_secondary', type: 'continuous', definition: 'change from baseline in body weight' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
      analysisPopulations: [
        { kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true },
        { kind: 'Safety', definition: 'all patients who received any study drug' },
      ],
      eligibility: [
        { type: 'inclusion', text: 'Age 18 years or older' },
        { type: 'inclusion', text: 'HbA1c 7.0–10.0% at screening' },
        { type: 'exclusion', text: 'eGFR below 30 mL/min/1.73m2' },
      ],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily' }, { ...METFORMIN }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', route: 'oral', regimen: 'once daily' }, { ...METFORMIN }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double', stratificationFactors: ['region'] },
    scheduleOfActivities: usdmSoa(),
    statisticalPlan: {
      alpha: 0.05,
      power: 0.9,
      plannedSampleSize: 400,
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }],
    },
    regulatoryStrategy: { oncology: false },
  };
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function sd(p: UsdmProjection): UsdmStudyDesign {
  return p.study.versions[0].studyDesigns[0];
}

/** Every object in the graph, depth-first. */
function walk(node: unknown, visit: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) node.forEach(n => walk(n, visit));
  else if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach(v => walk(v, visit));
  }
}

function allIds(p: UsdmProjection): string[] {
  const ids: string[] = [];
  walk(p.study, o => {
    if (typeof o.id === 'string') ids.push(o.id);
  });
  return ids;
}

/** Every `…Id` / `…Ids` reference in the graph that does not resolve to an entity id. */
function danglingRefs(p: UsdmProjection): string[] {
  const ids = new Set(allIds(p));
  const bad: string[] = [];
  walk(p.study, o => {
    for (const [k, v] of Object.entries(o)) {
      if (k.endsWith('Id') && typeof v === 'string' && !ids.has(v)) bad.push(`${k}=${v}`);
      if (k.endsWith('Ids') && Array.isArray(v)) v.filter(x => !ids.has(x as string)).forEach(x => bad.push(`${k}=${String(x)}`));
    }
  });
  return bad;
}

function startsWith(list: string[], prefix: string): boolean {
  return list.some(s => s.startsWith(prefix));
}

describe('projectUsdm: conformance is never claimed', () => {
  it('reports status unverified, with the schema-not-vendored reason, for every design shape', () => {
    const noSoa = clone(usdmDesign());
    delete noSoa.scheduleOfActivities;
    const minimal: StudyDesign = {
      title: 'Minimal',
      phase: '1',
      indication: 'healthy volunteers',
      objectives: [],
      estimands: [],
      endpoints: [],
      framework: { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' },
      population: { targetDescription: 'healthy adults', analysisPopulations: [], eligibility: [] },
      arms: [],
      statisticalPlan: { plannedAnalyses: [] },
    };
    for (const d of [usdmDesign(), noSoa, minimal]) {
      const p = projectUsdm(d);
      expect(p.conformance.status).toBe('unverified');
      expect(p.conformance.reason).toBe(USDM_CONFORMANCE_REASON);
      expect(p.conformance.reason).toMatch(/not vendored/);
      expect(p.conformance.reason).toMatch(/unvalidated/);
      expect(p.conformance.standard).toMatch(/USDM v3/);
    }
  });

  it('cites the USDM / Digital Data Flow basis', () => {
    expect(USDM_BASIS).toMatch(/CDISC Unified Study Definitions Model \(USDM\)/);
    expect(USDM_BASIS).toMatch(/TransCelerate Digital Data Flow/);
    expect(USDM_BASIS).toMatch(/conformance unverified/);
    expect(projectUsdm(usdmDesign()).basis).toBe(USDM_BASIS);
  });
});

describe('projectUsdm: entity counts round-trip', () => {
  it('exports one entity per design node', () => {
    const d = usdmDesign();
    const g = sd(projectUsdm(d));
    expect(g.arms).toHaveLength(2);
    expect(g.epochs).toHaveLength(3);
    expect(g.encounters).toHaveLength(d.scheduleOfActivities!.visits.length);
    expect(g.activities).toHaveLength(4);
    expect(g.population.criteria).toHaveLength(3);
    expect(g.population.criteria.map(c => c.category.decode)).toEqual(['INCLUSION', 'INCLUSION', 'EXCLUSION']);
    expect(g.objectives).toHaveLength(2);
    expect(g.objectives.flatMap(o => o.endpoints)).toHaveLength(2);
    expect(g.estimands).toHaveLength(1);
    expect(g.estimands[0].intercurrentEvents).toHaveLength(1);
    expect(g.analysisPopulations).toHaveLength(2);
    expect(g.population.plannedEnrollmentNumber).toEqual({ instanceType: 'Quantity', value: 400, unit: null });
  });

  it('exports each distinct intervention record once, shared across arms', () => {
    const g = sd(projectUsdm(usdmDesign()));
    expect(g.studyInterventions.map(i => i.name)).toEqual(['Drug X', 'Metformin', 'Placebo']);
    const [drugX, placebo] = g.elements;
    const metforminId = g.studyInterventions[1].id;
    expect(drugX.studyInterventionIds).toContain(metforminId);
    expect(placebo.studyInterventionIds).toContain(metforminId);
    expect(g.studyInterventions[0].administrations[0].description).toBe('dose: 10 mg; regimen: once daily; route: oral');
    expect(g.studyInterventions[0].administrations[0].route?.code).toBe('oral');
    expect(g.studyInterventions[0].administrations[0].dose).toBeNull();
  });

  it('builds the full arm × epoch cell grid and places each arm element only in treatment epochs', () => {
    const g = sd(projectUsdm(usdmDesign()));
    expect(g.studyCells).toHaveLength(2 * 3);
    const treatment = g.epochs.find(e => e.name === 'Treatment')!;
    for (const c of g.studyCells) {
      expect(c.elementIds).toHaveLength(c.epochId === treatment.id ? 1 : 0);
    }
  });

  it('nests each endpoint under the objective that names it, primary objective first', () => {
    const g = sd(projectUsdm(usdmDesign()));
    expect(g.objectives.map(o => o.level.code)).toEqual(['primary', 'secondary']);
    expect(g.objectives[0].endpoints[0].name).toBe('HbA1c change');
    expect(g.objectives[0].endpoints[0].level.code).toBe('primary');
    expect(g.objectives[1].endpoints[0].name).toBe('Body weight change');
  });
});

describe('projectUsdm: referential integrity', () => {
  it('every ScheduledActivityInstance points at an existing activity, encounter and epoch', () => {
    const g = sd(projectUsdm(usdmDesign()));
    const activityIds = new Set(g.activities.map(a => a.id));
    const encounterIds = new Set(g.encounters.map(e => e.id));
    const epochIds = new Set(g.epochs.map(e => e.id));
    const instances = g.scheduleTimelines[0].instances;
    expect(instances).toHaveLength(5);
    for (const inst of instances) {
      expect(encounterIds.has(inst.encounterId)).toBe(true);
      expect(inst.epochId !== null && epochIds.has(inst.epochId)).toBe(true);
      for (const a of inst.activityIds) expect(activityIds.has(a)).toBe(true);
    }
  });

  it('round-trips the SoA grid: the (activity, visit) pairs are exactly the design cells', () => {
    const d = usdmDesign();
    const g = sd(projectUsdm(d));
    const soa = d.scheduleOfActivities!;
    const want = soa.cells
      .map(c => `${soa.activities.find(a => a.id === c.activityId)!.name}@${soa.visits.find(v => v.id === c.visitId)!.name}`)
      .sort();
    const name = (list: Array<{ id: string; name: string }>, id: string) => list.find(x => x.id === id)!.name;
    const got = g.scheduleTimelines[0].instances
      .flatMap(i => i.activityIds.map(a => `${name(g.activities, a)}@${name(g.encounters, i.encounterId)}`))
      .sort();
    expect(got).toEqual(want);
  });

  it('every id is unique and every reference in the graph resolves', () => {
    const p = projectUsdm(usdmDesign());
    const ids = allIds(p);
    expect(new Set(ids).size).toBe(ids.length);
    expect(danglingRefs(p)).toEqual([]);
    const g = sd(p);
    expect(g.estimands[0].variableOfInterestId).toBe(g.objectives[0].endpoints[0].id);
    expect(g.estimands[0].analysisPopulationId).toBe(g.analysisPopulations[0].id);
  });
});

describe('projectUsdm: determinism', () => {
  it('ids are positional and identical across two calls', () => {
    const a = projectUsdm(usdmDesign());
    const b = projectUsdm(clone(usdmDesign()));
    expect(b).toStrictEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const g = sd(a);
    expect(a.study.id).toBe('Study_1');
    expect(g.arms.map(x => x.id)).toEqual(['StudyArm_1', 'StudyArm_2']);
    expect(g.epochs.map(e => `${e.id}:${e.name}`)).toEqual(['StudyEpoch_1:Screening', 'StudyEpoch_2:Treatment', 'StudyEpoch_3:Follow-up']);
    expect(g.encounters.map(e => e.id)).toEqual(['Encounter_1', 'Encounter_2', 'Encounter_3', 'Encounter_4', 'Encounter_5']);
    expect(g.epochs[1].previousId).toBe('StudyEpoch_1');
    expect(g.epochs[1].nextId).toBe('StudyEpoch_3');
  });

  it('survives a JSON round-trip unchanged', () => {
    for (const d of [usdmDesign(), (() => { const x = clone(usdmDesign()); delete x.scheduleOfActivities; return x; })()]) {
      const p = projectUsdm(d);
      expect(JSON.parse(JSON.stringify(p))).toStrictEqual(p);
    }
  });

  it('does not mutate the input', () => {
    const d = usdmDesign();
    const before = JSON.stringify(d);
    projectUsdm(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('projectUsdm: timings come only from recorded study days', () => {
  it('anchors on the baseline visit and computes offsets under the no-day-0 convention', () => {
    const g = sd(projectUsdm(usdmDesign()));
    const t = g.scheduleTimelines[0].timings;
    expect(t.map(x => `${x.type.code} ${x.value} ${x.valueLabel}`)).toEqual([
      'before P28D Day -28',
      'fixed_reference P0D Day 1',
      'after P83D Day 84',
      'after P167D Day 168',
      'after P195D Day 196',
    ]);
    const anchor = g.scheduleTimelines[0].instances[1].id;
    for (const x of t) expect(x.relativeToScheduledInstanceId).toBe(anchor);
    expect(t[0].windowLower).toBe('P3D');
    expect(t[4].windowUpper).toBe('P7D');
    expect(t[1].windowLower).toBeNull();
    expect(g.encounters.map(e => e.scheduledAtId)).toEqual(t.map(x => x.id));
  });

  it('invents no timing for an undated visit and says so', () => {
    const d = usdmDesign();
    delete d.scheduleOfActivities!.visits[2].studyDay;
    const p = projectUsdm(d);
    const g = sd(p);
    expect(g.encounters[2].scheduledAtId).toBeNull();
    expect(g.scheduleTimelines[0].timings).toHaveLength(4);
    expect(p.unfilledUsdmEntities).toContain('Timing: Encounter_3 carry no usable study day; no timing is invented for them');
    expect(startsWith(p.unmappedDesignFields, 'scheduleOfActivities.visits[].windowDays (1 of 5)')).toBe(true);
  });

  it('builds no timing at all without an anchor', () => {
    const d = usdmDesign();
    delete d.scheduleOfActivities!.visits[1].isBaseline;
    d.scheduleOfActivities!.visits[1].studyDay = 2;
    const p = projectUsdm(d);
    expect(sd(p).scheduleTimelines[0].timings).toEqual([]);
    expect(startsWith(p.unfilledUsdmEntities, 'Timing: no dated visit is marked baseline')).toBe(true);
    expect(startsWith(p.unmappedDesignFields, 'scheduleOfActivities.visits[].studyDay (5 of 5)')).toBe(true);
  });
});

describe('projectUsdm: the honesty ledgers', () => {
  it('names the SoA-derived entities as unfilled without a SoA, and drops them when one is present', () => {
    const withSoa = projectUsdm(usdmDesign());
    const d = usdmDesign();
    delete d.scheduleOfActivities;
    const without = projectUsdm(d);
    for (const e of SOA_DERIVED_ENTITIES) {
      expect(without.unfilledUsdmEntities).toContain(`${e}: ${USDM_NO_SOA}`);
      expect(startsWith(withSoa.unfilledUsdmEntities, `${e}:`)).toBe(false);
    }
    expect(withSoa.unfilledUsdmEntities.length).toBeLessThan(without.unfilledUsdmEntities.length);
    expect(sd(without).scheduleTimelines).toEqual([]);
    expect(sd(without).studyCells).toEqual([]);
    expect(startsWith(without.unmappedDesignFields, 'scheduleOfActivities')).toBe(false);
    expect(startsWith(withSoa.unmappedDesignFields, 'scheduleOfActivities.activities[].category (4 of 4)')).toBe(true);
  });

  it('never invents a sponsor, identifier, date, arm type, study type or endpoint purpose', () => {
    const p = projectUsdm(usdmDesign());
    const v = p.study.versions[0];
    expect(v.studyIdentifiers).toEqual([]);
    expect(v.dateValues).toEqual([]);
    for (const e of ALWAYS_UNFILLED) expect(p.unfilledUsdmEntities).toContain(e);
    for (const prefix of ['Organization:', 'StudyIdentifier:', 'GovernanceDate:']) {
      expect(startsWith(p.unfilledUsdmEntities, prefix)).toBe(true);
    }
    const g = sd(p);
    expect(g.studyType).toBeNull();
    expect(g.arms.every(a => a.type === null)).toBe(true);
    expect(g.objectives.flatMap(o => o.endpoints).every(e => e.purpose === null)).toBe(true);
    expect(g.population.includesHealthySubjects).toBeNull();
  });

  it('claims no NCI Thesaurus code: every Code is C2C-INTERNAL', () => {
    const p = projectUsdm(usdmDesign());
    let codes = 0;
    walk(p.study, o => {
      if (o.instanceType === 'Code') {
        codes += 1;
        expect(o.codeSystem).toBe(C2C_CODE_SYSTEM);
        expect(String(o.code)).not.toMatch(/^C\d{4,6}$/);
      }
    });
    expect(codes).toBeGreaterThan(10);
  });

  it('lists every populated design field with no USDM home, and only populated ones', () => {
    const d = usdmDesign();
    Object.assign(d, { futureField: 'added after this mapping was written' });
    const u = projectUsdm(d).unmappedDesignFields;
    for (const prefix of [
      'endpoints[].timepoint (1 of 2):',
      'endpoints[].type (2 of 2):',
      'statisticalPlan.alpha:',
      'statisticalPlan.plannedAnalyses:',
      'randomization.ratio:',
      'framework.inferentialFrame:',
      'regulatoryStrategy.oncology:',
      'estimands[].strategy (1 of 1):',
      'estimands[].intercurrentEvents[].justification (1 of 1):',
      'objectives[].estimandEndpointName (1 of 2):',
      'population.analysisPopulations[].isPrimaryAnalysisSet (1 of 2):',
      'productType:',
      'scheduleOfActivities.id:',
      'futureField: no USDM home in this mapping',
    ]) {
      expect(startsWith(u, prefix), prefix).toBe(true);
    }
    for (const mapped of ['statisticalPlan.plannedSampleSize', 'framework.structuralDesign', 'framework.margin', 'randomization.blinding', 'version', 'title']) {
      expect(startsWith(u, mapped), mapped).toBe(false);
    }
  });

  it('reports a planned sample size as absent, never as zero', () => {
    const d = usdmDesign();
    delete d.statisticalPlan.plannedSampleSize;
    const p = projectUsdm(d);
    expect(sd(p).population.plannedEnrollmentNumber).toBeNull();
    expect(startsWith(p.unfilledUsdmEntities, 'StudyDesignPopulation.plannedEnrollmentNumber:')).toBe(true);
  });
});

describe('projectUsdm: unresolvable references are reported, never guessed', () => {
  it('does not place a cell whose visit is undefined', () => {
    const d = usdmDesign();
    d.scheduleOfActivities!.cells.push({ activityId: 'a_hba1c', visitId: 'V99', state: 'performed' });
    const p = projectUsdm(d);
    expect(sd(p).scheduleTimelines[0].instances.flatMap(i => i.activityIds)).toHaveLength(10);
    expect(danglingRefs(p)).toEqual([]);
    expect(startsWith(p.unmappedDesignFields, 'scheduleOfActivities.cells (1 of 11):')).toBe(true);
    expect(p.unmappedDesignFields.join('\n')).toContain('a_hba1c × V99');
  });

  it('leaves the epoch null for a visit naming an undefined epoch', () => {
    const d = usdmDesign();
    d.scheduleOfActivities!.visits[4].epochId = 'e_missing';
    const p = projectUsdm(d);
    expect(sd(p).scheduleTimelines[0].instances[4].epochId).toBeNull();
    expect(startsWith(p.unfilledUsdmEntities, 'ScheduledActivityInstance.epochId: ScheduledActivityInstance_5')).toBe(true);
  });

  it('reports conditional cell state as unmapped', () => {
    const d = usdmDesign();
    d.scheduleOfActivities!.cells[0].state = 'conditional';
    expect(startsWith(projectUsdm(d).unmappedDesignFields, 'scheduleOfActivities.cells[].state (1 of 10):')).toBe(true);
  });

  it('reports an objective naming an undefined endpoint, and an endpoint no objective nests', () => {
    const d = usdmDesign();
    d.objectives[0].endpointName = 'Nonexistent';
    const p = projectUsdm(d);
    expect(p.unfilledUsdmEntities).toContain('Objective_2.endpoints: the objective names endpoint "Nonexistent", which the design does not define');
    expect(startsWith(p.unmappedDesignFields, 'endpoints[name="Body weight change"]:')).toBe(true);
    expect(sd(p).objectives.flatMap(o => o.endpoints)).toHaveLength(1);
  });

  it('leaves the estimand population reference null when no analysis population matches verbatim', () => {
    const d = usdmDesign();
    d.estimands[0].population = 'randomized patients (roughly ITT)';
    const p = projectUsdm(d);
    expect(sd(p).estimands[0].analysisPopulationId).toBeNull();
    expect(sd(p).estimands[0].population).toBe('randomized patients (roughly ITT)');
    expect(startsWith(p.unfilledUsdmEntities, 'Estimand_1.analysisPopulationId:')).toBe(true);
  });
});
