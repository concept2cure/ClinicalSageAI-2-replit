/**
 * Tests for the USDM export. The export is a deterministic projection of the
 * design object into a graph aligned to CDISC USDM v4.0.0: every emitted object
 * is a v4.0.0 class with every required attribute and nothing outside the class;
 * entity counts round-trip, every reference resolves, ids are positional and
 * identical across calls, the graph survives a JSON round-trip, conformance is
 * ALWAYS `unverified`, and nothing the design does not carry (sponsor,
 * identifier, date, timing, element placement, intervention model) is invented
 * — every null attribute and empty required list is named in
 * `unfilledUsdmEntities`, and every populated design field with no USDM home is
 * named in `unmappedDesignFields`.
 */

import { describe, it, expect } from 'vitest';
import { ALWAYS_UNFILLED, USDM_BASIS, USDM_CONFORMANCE_REASON, projectUsdm } from '../usdm-projection';
import { SOA_DERIVED_ENTITIES, USDM_NO_SOA } from '../usdm-schedule';
import { C2C_CODE_SYSTEM, USDM_V4_REFERENCE, uniqueIndex, type UsdmProjection, type UsdmStudyDesign } from '../usdm-types';
import { type ScheduleOfActivities, type StudyDesign } from '../study-design-types';

const CELLS = 'a_consent@V1 a_elig@V1 a_elig@V2 a_hba1c@V2 a_hba1c@V3 a_hba1c@V4 a_ae@V2 a_ae@V3 a_ae@V4 a_ae@V5';

/** Screening → treatment → follow-up (epochs listed out of order), five dated visits, baseline on day 1. */
function usdmSoa(): ScheduleOfActivities {
  return {
    id: 'soa-internal-1',
    epochs: [
      { id: 'e_fu', name: 'Follow-up', kind: 'follow_up', order: 2 }, { id: 'e_scr', name: 'Screening', kind: 'screening', order: 0 },
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
      { id: 'a_consent', name: 'Informed consent', category: 'administrative', order: 0 }, { id: 'a_elig', name: 'Eligibility review', category: 'eligibility', order: 1 },
      { id: 'a_hba1c', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 2 }, { id: 'a_ae', name: 'Adverse events', category: 'safety', order: 3 },
    ],
    cells: CELLS.split(' ').map(c => ({ activityId: c.split('@')[0], visitId: c.split('@')[1], state: 'performed' as const })),
  };
}

const METFORMIN = { name: 'Metformin', role: 'standard_of_care' as const, dose: '1000 mg', route: 'oral', regimen: 'twice daily' };

function usdmDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes', phase: '3', indication: 'type 2 diabetes', productType: 'drug', version: 2,
    objectives: [
      { level: 'secondary', order: 1, text: 'Assess body weight', endpointName: 'Body weight change' },
      { level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change', estimandEndpointName: 'HbA1c change' },
    ],
    estimands: [{
      endpointName: 'HbA1c change', treatmentCondition: 'Drug X 10 mg daily versus placebo, both on background metformin', population: 'all randomized patients',
      variable: 'change from baseline in HbA1c at week 24', summaryMeasure: 'difference in means', strategy: 'treatment_policy',
      intercurrentEvents: [{ name: 'rescue medication', strategy: 'treatment_policy', justification: 'reflects clinical practice' }] }],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24', timepoint: 'week 24' },
      { name: 'Body weight change', role: 'key_secondary', type: 'continuous', definition: 'change from baseline in body weight' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
      analysisPopulations: [
        { kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true }, { kind: 'Safety', definition: 'all patients who received any study drug' },
      ],
      eligibility: [
        { type: 'inclusion', text: 'Age 18 years or older' }, { type: 'inclusion', text: 'HbA1c 7.0–10.0% at screening' },
        { type: 'exclusion', text: 'eGFR below 30 mL/min/1.73m2' },
      ],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily' }, { ...METFORMIN }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', route: 'oral', regimen: 'once daily' }, { ...METFORMIN }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double', stratificationFactors: ['region'] },
    scheduleOfActivities: usdmSoa(),
    statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 400, plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }] },
    regulatoryStrategy: { oncology: false },
  };
}

/** No randomization, structural design, version, SoA; empty title, phase and indication. */
function minimalDesign(): StudyDesign {
  const d = { title: '', phase: '', indication: '', objectives: [], estimands: [], endpoints: [], framework: {}, arms: [], statisticalPlan: { plannedAnalyses: [] } };
  return { ...d, population: { targetDescription: '', analysisPopulations: [], eligibility: [] } } as unknown as StudyDesign;
}

/** AB/BA crossover: Period 1 (treatment), Washout (run-in), Period 2 (treatment). */
function crossoverDesign(): StudyDesign {
  const d = usdmDesign();
  d.framework.structuralDesign = 'crossover';
  d.arms = [
    { name: 'Sequence AB', interventions: [{ name: 'A', role: 'investigational' }, { name: 'B', role: 'comparator' }] },
    { name: 'Sequence BA', interventions: [{ name: 'B', role: 'comparator' }, { name: 'A', role: 'investigational' }] },
  ];
  d.scheduleOfActivities!.epochs = [
    { id: 'e_scr', name: 'Period 1', kind: 'treatment', order: 0 }, { id: 'e_trt', name: 'Washout', kind: 'run_in', order: 1 },
    { id: 'e_fu', name: 'Period 2', kind: 'treatment', order: 2 },
  ];
  return d;
}

/** Required sub-fields the route schema does not enforce, left out. */
function partialDesign(): StudyDesign {
  const d = usdmDesign();
  const cuts: Array<[object, string[]]> = [
    [d.population.eligibility[0], ['type']], [d.population.eligibility[1], ['text']], [d.arms[0].interventions[0], ['role', 'route']],
    [d.scheduleOfActivities!.epochs[0], ['kind']], [d.objectives[0], ['level']], [d.population.analysisPopulations[0], ['definition']],
    [d.population, ['targetDescription']], [d.estimands[0], ['treatmentCondition', 'summaryMeasure']], [d.estimands[0].intercurrentEvents[0], ['strategy']],
  ];
  for (const [o, keys] of cuts) for (const k of keys) Reflect.deleteProperty(o, k);
  d.arms[1].name = '';
  return d;
}

/** The fixture after `edit`, projected. */
function edited(edit: (d: StudyDesign) => void): UsdmProjection {
  const d = usdmDesign();
  edit(d);
  return projectUsdm(d);
}

function noSoa(): StudyDesign {
  const d = usdmDesign();
  delete d.scheduleOfActivities;
  return d;
}

const SHAPES: Array<[string, () => StudyDesign]> = [
  ['full', usdmDesign], ['no SoA', noSoa], ['minimal', minimalDesign], ['crossover', crossoverDesign], ['partial', partialDesign],
];

const sd = (p: UsdmProjection): UsdmStudyDesign => p.study.versions[0].studyDesigns[0];
const startsWith = (list: string[], prefix: string): boolean => list.some(s => s.startsWith(prefix));

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
  walk(p.study, o => void (typeof o.id === 'string' && ids.push(o.id)));
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

/** Objects that are not a v4.0.0 class, lack a required attribute, or carry one outside the class. */
function offReference(p: UsdmProjection): string[] {
  const bad: string[] = [];
  walk(p.study, o => {
    const ref = USDM_V4_REFERENCE[String(o.instanceType)];
    if (!ref) return void bad.push(`${String(o.id)}: class ${String(o.instanceType)}`);
    const [required, optional] = ref.map(s => s.split(' '));
    required.filter(k => !(k in o)).forEach(k => bad.push(`${String(o.id)}: missing ${k}`));
    Object.keys(o).filter(k => !required.includes(k) && !optional.includes(k)).forEach(k => bad.push(`${String(o.id)}: extra ${k}`));
  });
  return bad;
}

/** Every null attribute, and every empty REQUIRED list, whose `Class.attr` / `<id>.attr` no ledger line names. */
function unledgered(p: UsdmProjection): string[] {
  const tokens = new Set(p.unfilledUsdmEntities.flatMap(l => l.split(': ')[0].split(/[\s/,]+/)));
  const bad: string[] = [];
  walk(p.study, o => {
    const cls = String(o.instanceType);
    const required = (USDM_V4_REFERENCE[cls]?.[0] ?? '').split(' ');
    const names = [cls, cls === 'InterventionalStudyDesign' ? 'StudyDesign' : cls, String(o.id)];
    for (const [k, v] of Object.entries(o)) {
      if (k === 'previousId' || k === 'nextId') continue;
      const empty = v === null || (Array.isArray(v) && v.length === 0 && required.includes(k));
      if (empty && !names.some(n => tokens.has(`${n}.${k}`))) bad.push(`${String(o.id)}.${k}`);
    }
  });
  return bad;
}

describe('projectUsdm: conformance is never claimed', () => {
  it('reports status unverified with the schema-not-vendored reason for every design shape, and cites the USDM / DDF basis', () => {
    for (const [, make] of SHAPES) {
      const c = projectUsdm(make()).conformance;
      expect([c.status, c.reason]).toEqual(['unverified', USDM_CONFORMANCE_REASON]);
      expect(`${c.reason} | ${c.standard}`).toMatch(/not vendored.*unvalidated.* \| CDISC USDM v4\.0\.0/);
    }
    expect(USDM_BASIS).toMatch(/CDISC Unified Study Definitions Model \(USDM\) v4\.0\.0.*TransCelerate Digital Data Flow.*conformance unverified/);
    expect(projectUsdm(usdmDesign()).basis).toBe(USDM_BASIS);
  });
});

describe('projectUsdm: aligned to ONE USDM release (v4.0.0)', () => {
  it('every emitted object is a v4.0.0 class with every required attribute and nothing outside it', () => {
    for (const [name, make] of SHAPES) expect(offReference(projectUsdm(make())), name).toEqual([]);
  });

  it('the reference carries the v4.0.0 facts that differ from v3.0 (spot-checked against DDF-RA v4.0.0)', () => {
    expect(Object.keys(USDM_V4_REFERENCE)).toHaveLength(28);
    expect(USDM_V4_REFERENCE.InterventionalStudyDesign[0]).toBe('id name arms studyCells rationale epochs population eligibilityCriteria model instanceType');
    expect(USDM_V4_REFERENCE.Estimand[0]).toBe('id name populationSummary analysisPopulationId interventionIds variableOfInterestId intercurrentEvents instanceType');
    expect(USDM_V4_REFERENCE.Code[0]).toBe('id code codeSystem codeSystemVersion decode instanceType');
    expect(['studyPhase', 'studyInterventions'].map(k => USDM_V4_REFERENCE.StudyVersion[1].split(' ').includes(k))).toEqual([false, true]);
  });

  it('places each attribute where v4.0.0 puts it', () => {
    const p = projectUsdm(usdmDesign());
    const [v, g] = [p.study.versions[0], sd(p)];
    expect([g.instanceType, g.studyPhase?.instanceType, g.model?.code, g.blindingSchema?.standardCode.decode]).toEqual(['InterventionalStudyDesign', 'AliasCode', 'parallel_group', 'Double blind']);
    expect(g.studyPhase?.standardCode).toMatchObject({ instanceType: 'Code', code: '3', decode: 'Phase 3', codeSystemVersion: null });
    expect(g.studyInterventionIds).toEqual(v.studyInterventions.map(i => i.id));
    expect(g.population.criterionIds).toEqual(g.eligibilityCriteria.map(c => c.id));
    const texts = ['Age 18 years or older', 'HbA1c 7.0–10.0% at screening', 'eGFR below 30 mL/min/1.73m2'];
    expect(g.eligibilityCriteria.map(c => v.eligibilityCriterionItems.find(i => i.id === c.criterionItemId)?.text)).toEqual(texts);
    expect(g.population.plannedEnrollmentNumber).toMatchObject({ instanceType: 'Quantity', value: 400 });
    expect(g.estimands[0].populationSummary).toBe('difference in means');
    const e = usdmDesign().estimands[0];
    expect(g.estimands[0].extensionAttributes.map(x => [x.url, x.valueString])).toEqual([
      ['treatmentCondition', e.treatmentCondition], ['population', e.population], ['variable', e.variable]].map(([k, text]) => [`urn:c2c:usdm-extension:Estimand.${k}`, text]));
  });
});

describe('projectUsdm: entity counts round-trip', () => {
  it('exports one entity per design node', () => {
    const g = sd(projectUsdm(usdmDesign()));
    expect([g.arms, g.epochs, g.encounters, g.activities, g.objectives, g.estimands, g.analysisPopulations].map(l => l.length)).toEqual([2, 3, 5, 4, 2, 1, 2]);
    expect(g.eligibilityCriteria.map(c => c.category?.decode)).toEqual(['INCLUSION', 'INCLUSION', 'EXCLUSION']);
    expect(g.objectives.flatMap(o => o.endpoints)).toHaveLength(2);
    expect(g.estimands[0].intercurrentEvents.map(e => [e.name, e.text, e.strategy])).toEqual([['rescue medication', 'rescue medication', 'treatment_policy']]);
  });

  it('exports each distinct intervention record once, shared across arms', () => {
    const p = projectUsdm(usdmDesign());
    const ivs = p.study.versions[0].studyInterventions;
    expect(ivs.map(i => i.name)).toEqual(['Drug X', 'Metformin', 'Placebo']);
    for (const element of sd(p).elements) expect(element.studyInterventionIds).toContain(ivs[1].id);
    const admin = ivs[0].administrations[0];
    expect([admin.description, admin.route?.standardCode.code, admin.dose]).toEqual(['dose: 10 mg; regimen: once daily; route: oral', 'oral', null]);
    expect(ivs.every(i => i.type === null)).toBe(true);
    expect(p.unfilledUsdmEntities).toContain('StudyIntervention.type: the design records no per-intervention product type');
  });

  it('nests each endpoint under the objective that names it, primary objective first', () => {
    const g = sd(projectUsdm(usdmDesign()));
    expect(g.objectives.map(o => `${o.level?.code}:${o.endpoints[0].name}:${o.endpoints[0].level?.code}`)).toEqual(['primary:HbA1c change:primary', 'secondary:Body weight change:key_secondary']);
  });
});

describe('projectUsdm: StudyElement placement is never inferred', () => {
  it('parallel group with one treatment epoch: each arm element sits only in its treatment cell', () => {
    const p = projectUsdm(usdmDesign());
    const g = sd(p);
    expect(g.studyCells).toHaveLength(2 * 3);
    const treatment = g.epochs.find(e => e.name === 'Treatment')!;
    for (const c of g.studyCells) expect(c.elementIds).toHaveLength(c.epochId === treatment.id ? 1 : 0);
    expect(startsWith(p.unfilledUsdmEntities, 'StudyCell.elementIds: the design records no screening, run-in or follow-up element')).toBe(true);
  });

  it('crossover: no element is built or placed, and the undetermined assignment is named in both ledgers', () => {
    const p = projectUsdm(crossoverDesign());
    const g = sd(p);
    expect([g.model?.code, g.elements, g.studyCells.length]).toEqual(['crossover', [], 6]);
    expect(g.studyCells.every(c => c.elementIds.length === 0)).toBe(true);
    expect(p.unfilledUsdmEntities).toContain('StudyDesign.elements / StudyElement / StudyCell.elementIds: the crossover design does not record which intervention is given in which epoch; no element is built, so the arm-to-intervention assignment is not exported (the interventions themselves are)');
    expect(startsWith(p.unmappedDesignFields, 'arms[].interventions (2 of 2): USDM links an arm to its interventions only through StudyCell')).toBe(true);
    expect(p.study.versions[0].studyInterventions.map(i => i.name)).toEqual(['A', 'B']);
  });

  it('a second treatment epoch (open-label extension) or no SoA leaves placement undetermined too', () => {
    const p = edited(d => { d.scheduleOfActivities!.epochs[0].kind = 'treatment'; });
    expect(sd(p).elements).toEqual([]);
    expect(p.unfilledUsdmEntities.join('\n')).toContain('2 epochs are of kind treatment and the design does not record which intervention is given in which');
    const q = projectUsdm(noSoa());
    expect(sd(q).elements).toEqual([]);
    expect(q.unfilledUsdmEntities.join('\n')).toContain('the design carries no Schedule of Activities, so there is no epoch to place an element in');
  });

  it('maps only intervention models to StudyDesign.model; a design feature leaves it null, named in both ledgers', () => {
    for (const v of ['adaptive', 'platform', 'basket', 'umbrella', 'mams', 'dose_ranging'] as const) {
      const p = edited(d => { d.framework.structuralDesign = v; });
      expect(sd(p).model, v).toBeNull();
      expect(p.unfilledUsdmEntities).toContain(`StudyDesign.model: structural design "${v}" is a design feature, not an intervention model (parallel group, crossover, factorial, single arm); not mapped`);
      expect(p.unmappedDesignFields).toContain('framework.structuralDesign: not an intervention model, so not exported as StudyDesign.model (see unfilledUsdmEntities)');
    }
    for (const v of ['parallel_group', 'crossover', 'factorial', 'single_arm'] as const) expect(sd(edited(d => { d.framework.structuralDesign = v; })).model?.code).toBe(v);
  });
});

describe('projectUsdm: referential integrity', () => {
  it('round-trips the SoA grid: the (activity, visit) pairs are exactly the design cells', () => {
    const d = usdmDesign();
    const g = sd(projectUsdm(d));
    const soa = d.scheduleOfActivities!;
    const want = soa.cells.map(c => `${soa.activities.find(a => a.id === c.activityId)!.name}@${soa.visits.find(v => v.id === c.visitId)!.name}`).sort();
    const name = (list: Array<{ id: string; name: string | null }>, id: string) => list.find(x => x.id === id)!.name;
    const got = g.scheduleTimelines[0].instances.flatMap(i => i.activityIds.map(a => `${name(g.activities, a)}@${name(g.encounters, i.encounterId)}`)).sort();
    expect(got).toEqual(want);
    expect(g.scheduleTimelines[0].instances.map(i => i.epochId)).toEqual(['StudyEpoch_1', 'StudyEpoch_2', 'StudyEpoch_2', 'StudyEpoch_2', 'StudyEpoch_3']);
  });

  it('every id is unique and every reference in the graph resolves, for every design shape', () => {
    for (const [name, make] of SHAPES) {
      const p = projectUsdm(make());
      const ids = allIds(p);
      expect(new Set(ids).size, name).toBe(ids.length);
      expect(danglingRefs(p), name).toEqual([]);
    }
    const g = sd(projectUsdm(usdmDesign()));
    expect([g.estimands[0].variableOfInterestId, g.estimands[0].analysisPopulationId]).toEqual([g.objectives[0].endpoints[0].id, g.analysisPopulations[0].id]);
  });
});

describe('projectUsdm: determinism', () => {
  it('ids are positional and identical across two calls, and the input is not mutated', () => {
    const [a, b] = [projectUsdm(usdmDesign()), projectUsdm(JSON.parse(JSON.stringify(usdmDesign())))];
    expect([b, JSON.stringify(b)]).toStrictEqual([a, JSON.stringify(a)]);
    const g = sd(a);
    expect([a.study.id, ...g.arms.map(x => x.id)]).toEqual(['Study_1', 'StudyArm_1', 'StudyArm_2']);
    expect(g.epochs.map(e => `${e.id}:${e.name}`)).toEqual(['StudyEpoch_1:Screening', 'StudyEpoch_2:Treatment', 'StudyEpoch_3:Follow-up']);
    expect(g.encounters.map(e => e.id)).toEqual(['Encounter_1', 'Encounter_2', 'Encounter_3', 'Encounter_4', 'Encounter_5']);
    expect([g.epochs[1].previousId, g.epochs[1].nextId]).toEqual(['StudyEpoch_1', 'StudyEpoch_3']);
    const d = usdmDesign();
    const before = JSON.stringify(d);
    projectUsdm(d);
    expect(JSON.stringify(d), 'the input is not mutated').toBe(before);
  });

  it('survives a JSON round-trip unchanged, never throws and carries no undefined, for every shape and prototype-named values', () => {
    const proto = usdmDesign();
    Object.assign(proto, { phase: 'constructor' });
    proto.randomization!.blinding = 'toString' as never;
    for (const d of [...SHAPES.map(([, make]) => make()), proto]) {
      const p = projectUsdm(d);
      expect(JSON.parse(JSON.stringify(p))).toStrictEqual(p);
    }
    expect(sd(projectUsdm(proto)).studyPhase?.standardCode.decode).toBe('Phase constructor');
  });
});

describe('projectUsdm: timings come only from recorded study days', () => {
  const timingsOf = (p: UsdmProjection) => sd(p).scheduleTimelines[0].timings;

  it('anchors on the baseline visit (else the unique day-1 visit) and computes offsets under the no-day-0 convention', () => {
    const g = sd(projectUsdm(usdmDesign()));
    const t = g.scheduleTimelines[0].timings;
    expect(t.map(x => `${x.type.code} ${x.value} ${x.valueLabel}`)).toEqual(['before P28D Day -28', 'fixed_reference P0D Day 1', 'after P83D Day 84', 'after P167D Day 168', 'after P195D Day 196']);
    for (const x of t) expect(x.relativeToScheduledInstanceId).toBe(g.scheduleTimelines[0].instances[1].id);
    expect([t[0].windowLower, t[4].windowUpper, t[1].windowLower]).toEqual(['P3D', 'P7D', null]);
    expect(g.encounters.map(e => e.scheduledAtId)).toEqual(t.map(x => x.id));
    // With no visit marked baseline, the unique study-day-1 visit is the anchor.
    expect(timingsOf(edited(d => { delete d.scheduleOfActivities!.visits[1].isBaseline; })).map(x => x.type.code)).toEqual(['before', 'fixed_reference', 'after', 'after', 'after']);
  });

  it('invents no timing for an undated visit and says so', () => {
    const p = edited(d => { delete d.scheduleOfActivities!.visits[2].studyDay; });
    expect([sd(p).encounters[2].scheduledAtId, timingsOf(p).length]).toEqual([null, 4]);
    expect(p.unfilledUsdmEntities).toEqual(expect.arrayContaining(['Timing: Encounter_3 carry no usable study day; no timing is invented for them', 'Encounter.scheduledAtId: no Timing could be built for the visit (see Timing) (Encounter_3)']));
    expect(startsWith(p.unmappedDesignFields, 'scheduleOfActivities.visits[].windowDays (1 of 5)')).toBe(true);
  });

  it('gives an unscheduled dated visit no Timing, and times the rest', () => {
    const early = { id: 'V6', name: 'Early termination', epochId: 'e_fu', studyDay: 200, unscheduled: true, order: 5 };
    const p = edited(d => { d.scheduleOfActivities!.visits.push(early); d.scheduleOfActivities!.visits[0].unscheduled = false; });
    expect([sd(p).encounters[5].scheduledAtId, timingsOf(p).length]).toEqual([null, 5]);
    expect(p.unfilledUsdmEntities).toContain('Encounter.scheduledAtId: an unscheduled visit; USDM Encounter has no unscheduled flag and no Timing is invented (Encounter_6)');
    expect(p.unmappedDesignFields).toContain('scheduleOfActivities.visits[].unscheduled (2 of 6): USDM v4 Encounter has no unscheduled flag; not mapped (a visit flagged unscheduled gets no Timing)');
  });

  it('builds no timing at all without an anchor, with a recorded day 0, or with two baselines', () => {
    const noAnchor = (d: StudyDesign) => Object.assign(d.scheduleOfActivities!.visits[1], { isBaseline: undefined, studyDay: 2 });
    const cases: Array<[(d: StudyDesign) => void, string]> = [
      [noAnchor, 'Timing: no dated visit is marked baseline and no single visit falls on study day 1, so there is no anchor; no timing is computed'],
      [d => { d.scheduleOfActivities!.visits[0].studyDay = 0; }, "Timing: a visit records study day 0, which the design model's day-1 convention does not define; no offsets are computed"],
      [d => { d.scheduleOfActivities!.visits[2].isBaseline = true; }, 'Timing: 2 dated visits are marked baseline, so the anchor is ambiguous; no timing is computed'],
    ];
    for (const [edit, line] of cases) {
      const p = edited(edit);
      expect(timingsOf(p), line).toEqual([]);
      expect(p.unfilledUsdmEntities).toContain(line);
      expect(sd(p).encounters.every(e => e.scheduledAtId === null)).toBe(true);
      expect(startsWith(p.unmappedDesignFields, 'scheduleOfActivities.visits[].studyDay (5 of 5)')).toBe(true);
    }
  });

  it('emits no window for a negative or fractional windowDays, and names it', () => {
    for (const w of [-1, 1.5]) {
      const p = edited(d => { d.scheduleOfActivities!.visits[0].windowDays = w; });
      const t = timingsOf(p)[0];
      expect([t.windowLower, t.windowUpper, t.windowLabel]).toEqual([null, null, null]);
      expect(p.unfilledUsdmEntities).toContain('Timing.windowLower / Timing.windowUpper / Timing.windowLabel: the visit records no window that is a non-negative integer number of days (Timing_1, Timing_2)');
    }
  });
});

describe('projectUsdm: the honesty ledgers are complete', () => {
  it('names every null attribute and every empty required list, for every design shape', () => {
    for (const [name, make] of SHAPES) expect(unledgered(projectUsdm(make())), name).toEqual([]);
  });

  it('carries the always-unfilled entities, checked against a literal list', () => {
    expect(ALWAYS_UNFILLED.map(l => l.split(': ')[0])).toEqual([
      'Organization', 'StudyVersion.studyIdentifiers / StudyIdentifier', 'StudyVersion.dateValues / GovernanceDate', 'StudyVersion.rationale', 'StudyDefinitionDocument',
      'StudyTitle.type', 'StudyDesign.studyType', 'StudyDesign.rationale', 'StudyDesign.therapeuticAreas', 'StudyDesignPopulation.includesHealthySubjects']);
    const p = projectUsdm(usdmDesign());
    expect(p.unfilledUsdmEntities).toEqual(expect.arrayContaining([...ALWAYS_UNFILLED]));
    const g = sd(p);
    expect([g.studyType, g.rationale, p.study.versions[0].rationale, g.population.includesHealthySubjects]).toEqual([null, null, null, null]);
    expect(g.arms.every(a => a.type === null && a.dataOriginType === null)).toBe(true);
    expect(g.objectives.flatMap(o => o.endpoints).every(e => e.purpose === null)).toBe(true);
  });

  it('a minimal design: every absent value is null or empty and named', () => {
    const p = projectUsdm(minimalDesign());
    const [v, g] = [p.study.versions[0], sd(p)];
    expect([g.blindingSchema, g.model, g.studyPhase, v.versionIdentifier, p.study.name, g.population.description]).toEqual([null, null, null, null, null, null]);
    expect([v.titles, g.indications, g.arms, g.eligibilityCriteria]).toEqual([[], [], [], []]);
    expect(p.unfilledUsdmEntities).toEqual(expect.arrayContaining([
      'StudyDesign.blindingSchema: the design records no blinding level', 'StudyDesign.model: the design records no structural design',
      'StudyDesign.studyPhase: the design records no phase', 'StudyVersion.versionIdentifier: the design records no version number',
      'Study.name / StudyVersion.titles / StudyTitle: the design records no title', 'StudyDesign.indications / Indication: the design records no indication',
      'StudyDesignPopulation.description: the design records no target population description',
      'StudyDesignPopulation.plannedEnrollmentNumber: the design records no planned sample size',
    ]));
  });

  it('names the SoA-derived entities as unfilled without a SoA, and drops them when one is present', () => {
    const [withSoa, without] = [projectUsdm(usdmDesign()), projectUsdm(noSoa())];
    for (const e of SOA_DERIVED_ENTITIES) {
      expect(without.unfilledUsdmEntities).toContain(`${e}: ${USDM_NO_SOA}`);
      expect(startsWith(withSoa.unfilledUsdmEntities, `${e}:`)).toBe(false);
    }
    expect([sd(without).scheduleTimelines, sd(without).studyCells]).toEqual([[], []]);
    expect(startsWith(without.unmappedDesignFields, 'scheduleOfActivities')).toBe(false);
    expect(startsWith(withSoa.unmappedDesignFields, 'scheduleOfActivities.activities[].category (4 of 4)')).toBe(true);
  });

  it('claims no NCI Thesaurus code: every Code is C2C-INTERNAL and unversioned, and says so', () => {
    const p = projectUsdm(usdmDesign());
    const codes: Array<Record<string, unknown>> = [];
    walk(p.study, o => void (o.instanceType === 'Code' && codes.push(o)));
    expect(codes.length).toBeGreaterThan(10);
    for (const o of codes) expect([o.codeSystem, o.codeSystemVersion, /^C\d{4,6}$/.test(String(o.code))]).toEqual([C2C_CODE_SYSTEM, null, false]);
    expect(p.unfilledUsdmEntities).toContain('Code.codeSystemVersion: the C2C-INTERNAL code system is unversioned; no version is invented');
  });
});

describe('projectUsdm: unmapped design fields', () => {
  it('lists every populated design field with no USDM home', () => {
    const u = edited(d => Object.assign(d, { futureField: 'added after this mapping was written' })).unmappedDesignFields;
    for (const prefix of [
      'endpoints[].timepoint (1 of 2):', 'endpoints[].type (2 of 2):', 'statisticalPlan.alpha:', 'statisticalPlan.plannedAnalyses:', 'randomization.ratio:',
      'framework.inferentialFrame:', 'regulatoryStrategy.oncology:', 'estimands[].strategy (1 of 1):', 'estimands[].intercurrentEvents[].justification (1 of 1):',
      'objectives[].estimandEndpointName (1 of 2):', 'population.analysisPopulations[].isPrimaryAnalysisSet (1 of 2):', 'productType:', 'scheduleOfActivities.id:',
      'futureField: no USDM home in this mapping',
    ]) expect(startsWith(u, prefix), prefix).toBe(true);
    const mapped = ['statisticalPlan.plannedSampleSize', 'framework.structuralDesign', 'framework.margin', 'randomization.blinding', 'version', 'title', 'estimands[].treatmentCondition', 'arms[].interventions'];
    for (const m of mapped) expect(startsWith(u, m), m).toBe(false);
  });

  it('reports recorded false and 0, and never empty strings, blank text, empty lists or empty objects', () => {
    const u = edited(d => {
      Object.assign(d.framework, { marginJustification: '', margin: 0 });
      Object.assign(d.endpoints[0], { measurementMethod: '   ', isSurrogate: false });
      Object.assign(d.population, { pediatric: {} });
      Object.assign(d.randomization!, { stratificationFactors: [] });
    }).unmappedDesignFields;
    for (const hit of ['framework.margin:', 'endpoints[].isSurrogate (1 of 2):']) expect(startsWith(u, hit), hit).toBe(true);
    for (const miss of ['framework.marginJustification', 'endpoints[].measurementMethod', 'population.pediatric', 'randomization.stratificationFactors']) expect(startsWith(u, miss), miss).toBe(false);
  });

  it('reports a recorded but invalid sample size or version as invalid, never as absent', () => {
    for (const n of [0, -5, 400.5]) {
      const p = edited(d => { d.statisticalPlan.plannedSampleSize = n; });
      expect(sd(p).population.plannedEnrollmentNumber).toBeNull();
      expect(p.unfilledUsdmEntities).toContain(`StudyDesignPopulation.plannedEnrollmentNumber: the design records plannedSampleSize=${n}, which is not a positive integer; not exported`);
      expect(p.unmappedDesignFields).toContain('statisticalPlan.plannedSampleSize: recorded but not a positive integer; not exported as plannedEnrollmentNumber');
    }
    const p = edited(d => Object.assign(d, { version: '2' }));
    expect(p.study.versions[0].versionIdentifier).toBeNull();
    expect(p.unfilledUsdmEntities).toContain('StudyVersion.versionIdentifier: the design records version "2", which is not a number; not exported');
    expect(p.unmappedDesignFields).toContain('version: recorded but not a number; not exported as StudyVersion.versionIdentifier');
  });
});

describe('projectUsdm: unresolvable references are reported, never guessed', () => {
  const placed = (p: UsdmProjection) => sd(p).scheduleTimelines[0].instances.flatMap(i => i.activityIds).length;

  it('does not place a cell whose visit is undefined, or whose activity or visit id is duplicated', () => {
    const p = edited(d => { d.scheduleOfActivities!.cells.push({ activityId: 'a_hba1c', visitId: 'V99', state: 'performed' }); });
    expect([placed(p), danglingRefs(p)]).toEqual([10, []]);
    expect(p.unmappedDesignFields.find(l => l.startsWith('scheduleOfActivities.cells (1 of 11):'))).toContain('a_hba1c × V99');
    expect(placed(edited(d => { d.scheduleOfActivities!.activities.push({ id: 'a_ae', name: 'Adverse events (again)', category: 'safety', order: 4 }); }))).toBe(6);
    const q = edited(d => { d.scheduleOfActivities!.visits.push({ id: 'V5', name: 'Duplicate', epochId: 'e_fu', order: 5 }); });
    expect(placed(q)).toBe(9);
    expect(startsWith(q.unmappedDesignFields, 'scheduleOfActivities.cells (1 of 10):')).toBe(true);
    expect(uniqueIndex(['x', 'y', 'x'], s => s).get('x')).toBeUndefined();
  });

  it('leaves the epoch null for a visit naming an undefined epoch, and reports conditional cells', () => {
    const p = edited(d => { d.scheduleOfActivities!.visits[4].epochId = 'e_missing'; d.scheduleOfActivities!.cells[0].state = 'conditional'; });
    expect(sd(p).scheduleTimelines[0].instances[4].epochId).toBeNull();
    expect(startsWith(p.unfilledUsdmEntities, 'ScheduledActivityInstance.epochId: ScheduledActivityInstance_5')).toBe(true);
    expect(startsWith(p.unmappedDesignFields, 'scheduleOfActivities.cells[].state (1 of 10):')).toBe(true);
  });

  it('reports an objective naming an undefined endpoint, an endpoint no objective nests, and a duplicated endpoint name', () => {
    const p = edited(d => { d.objectives[0].endpointName = 'Nonexistent'; });
    expect(p.unfilledUsdmEntities).toContain('Objective_2.endpoints: the objective names endpoint "Nonexistent", which the design does not define');
    expect(startsWith(p.unmappedDesignFields, 'endpoints[name="Body weight change"]: no objective nests it')).toBe(true);
    expect(sd(p).objectives.flatMap(o => o.endpoints)).toHaveLength(1);
    const q = edited(d => { d.endpoints.push({ ...d.endpoints[1] }); });
    expect(sd(q).objectives[1].endpoints).toEqual([]);
    expect(q.unfilledUsdmEntities).toContain('Objective_2.endpoints: the objective names endpoint "Body weight change", which the design defines more than once');
    expect(q.unmappedDesignFields).toContain('endpoints[name="Body weight change"] (2 records): the name is defined more than once, so no objective can reference it unambiguously; not exported');
  });

  it('resolves the estimand population only on one exact match of a recorded population', () => {
    const cases: Array<[(d: StudyDesign) => void, string]> = [
      [d => { d.estimands[0].population = 'randomized patients (roughly ITT)'; }, 'population "randomized patients (roughly ITT)" matches no analysis populations'],
      [d => { d.population.analysisPopulations[1].definition = 'all randomized patients'; }, 'population "all randomized patients" matches 2 analysis populations'],
      [d => { d.estimands[0].population = ''; d.population.analysisPopulations[0].definition = ''; }, 'the estimand records no population'],
      [d => { d.estimands[0].population = '  '; d.population.analysisPopulations[0].definition = '   '; }, 'the estimand records no population'],
    ];
    for (const [edit, why] of cases) {
      const p = edited(edit);
      expect(sd(p).estimands[0].analysisPopulationId, why).toBeNull();
      expect(startsWith(p.unfilledUsdmEntities, `Estimand_1.analysisPopulationId: ${why}`), why).toBe(true);
    }
  });
});

describe('projectUsdm: a partial design never throws and never fabricates', () => {
  it('leaves each absent coded or text value null, and names it', () => {
    const p = projectUsdm(partialDesign());
    const [v, g] = [p.study.versions[0], sd(p)];
    expect([
      g.eligibilityCriteria[0].category, v.eligibilityCriterionItems[1].text, v.studyInterventions[0].role, v.studyInterventions[0].administrations[0].route,
      g.epochs[2].type, g.analysisPopulations[0].text, g.arms[1].name, g.estimands[0].populationSummary, g.estimands[0].intercurrentEvents[0].strategy,
    ]).toEqual([null, null, null, null, null, null, null, null, null]);
    expect(g.objectives.find(o => o.level === null)).toBeDefined();
    expect(g.elements[1].name).toBe('StudyElement_2');
    const gaps = 'EligibilityCriterion.category EligibilityCriterion_1|EligibilityCriterionItem.text EligibilityCriterionItem_2|StudyIntervention.role StudyIntervention_1|' +
      'Administration.route Administration_1|StudyEpoch.type StudyEpoch_3|StudyArm.name StudyArm_2|AnalysisPopulation.text AnalysisPopulation_1|' +
      'IntercurrentEvent.strategy IntercurrentEvent_1|IntercurrentEvent.description IntercurrentEvent_1';
    expect(p.unfilledUsdmEntities).toEqual(expect.arrayContaining([
      ...gaps.split('|').map(g => g.split(' ')).map(([field, id]) => `${field}: not recorded by the design (${id})`),
      'Estimand_1.interventionIds: the estimand records no treatment condition', 'Estimand_1.populationSummary: the estimand records no summary measure',
    ]));
  });

  it('reports an intervention record repeated within one arm', () => {
    const p = edited(d => { d.arms[0].interventions.push({ ...METFORMIN }); });
    expect(sd(p).elements[0].studyInterventionIds).toHaveLength(2);
    expect(p.unmappedDesignFields).toContain('arms[].interventions: StudyArm_1 list an identical intervention record more than once; the repetition has no home and each record is exported once');
  });
});
