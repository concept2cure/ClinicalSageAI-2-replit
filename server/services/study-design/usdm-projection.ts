/**
 * USDM export — the study design projected as an object graph shaped after
 * ONE released version of the CDISC Unified Study Definitions Model: USDM
 * v4.0.0 (CDISC DDF Reference Architecture, release v4.0.0).
 *
 * ## The industry need
 * USDM, built by CDISC with TransCelerate's Digital Data Flow initiative, is the
 * digital-protocol interchange model the industry is converging on: study
 * definition repositories, CTMS/EDC build tools and regulator pilots consume a
 * study as a graph of Study → StudyVersion → StudyDesign → arms, epochs, cells,
 * activities, encounters and a schedule timeline. This repository's design spine
 * is described as USDM-aligned; this is its export, one deterministic pass from
 * `StudyDesign` to a graph whose class and attribute names are pinned to the
 * v4.0.0 API schema (see `USDM_V4_REFERENCE` in `usdm-types.ts`).
 *
 * ## What maps where
 *  - title → Study.name and the official StudyTitle; publicTitle and acronym →
 *    their own StudyTitles, each typed by what the design records it as (a
 *    C2C-INTERNAL code, not a CDISC controlled term); version → versionIdentifier;
 *    phase → StudyDesign.studyPhase; indication → Indication (uncoded).
 *  - framework.structuralDesign → InterventionalStudyDesign.model ONLY when it
 *    is an intervention model (parallel group, crossover, factorial, single
 *    arm). Adaptive, platform, basket, umbrella, MAMS and dose-ranging are design
 *    features, not intervention models: model stays null and the gap is named.
 *    randomization.blinding → blindingSchema.
 *  - interventions → StudyVersion.studyInterventions (identical records shared
 *    by several arms become ONE intervention; the design references them by
 *    id), each with an Administration carrying the recorded
 *    dose/regimen/route/duration text verbatim.
 *  - arms → StudyArm. An arm's StudyElement (its interventions) is built and
 *    placed only where the design determines which intervention is given in
 *    which epoch (see `usdm-schedule.ts`); a crossover never gets one.
 *  - SoA epochs → StudyEpoch; visits → Encounter; activities → Activity; each
 *    visit → one ScheduledActivityInstance on one main ScheduleTimeline; study
 *    days → Timing relative to ONE anchor (see `usdm-schedule.ts`).
 *  - eligibility → EligibilityCriterion (category INCLUSION/EXCLUSION) with its
 *    text in a StudyVersion EligibilityCriterionItem; plannedSampleSize →
 *    plannedEnrollmentNumber; objectives → Objective with its endpoint nested;
 *    estimands → Estimand (summary measure → populationSummary, variable →
 *    variableOfInterestId, population → analysisPopulationId only on an exact,
 *    unique match) with IntercurrentEvents; the recorded treatment condition,
 *    population and variable text rides verbatim in `extensionAttributes`.
 *
 * ## The honesty contract
 *  - `conformance.status` is ALWAYS the literal `unverified`: the CDISC USDM JSON
 *    schema is not vendored here, so the graph is unvalidated and says so.
 *  - Ids are positional (`StudyArm_1`) — no RNG, no clock. Same design →
 *    byte-identical output. The input is not mutated.
 *  - Codes use codeSystem `C2C-INTERNAL` with the design's own value; no NCI
 *    Thesaurus C-code is claimed.
 *  - Nothing is invented: no sponsor, identifier, date, arm type, study type,
 *    rationale, endpoint purpose, timing or element placement the design does
 *    not carry. Every null attribute and every empty required list is named in
 *    `unfilledUsdmEntities` under `Class.attribute` or `<id>.attribute`; a
 *    recorded but invalid value is reported as invalid, never as absent.
 *  - `unmappedDesignFields` lists every POPULATED design field with no home in
 *    this mapping — swept generically, so a field added to the design later is
 *    reported rather than silently dropped. A reference that does not resolve
 *    exactly once (cell → visit, objective → endpoint, estimand → analysis
 *    population) is reported, never guessed.
 *  - A partial design (missing sub-fields the route schema does not enforce)
 *    never throws: an absent coded or text value is null and named.
 *
 * Pure: no model call, no RNG, no clock, no DB.
 *
 * @module server/services/study-design/usdm-projection
 */

import type { Arm, EstimandInput, IntercurrentEventInput, Intervention, StudyDesign } from './study-design-types';
import {
  aliasCode, C2C_EXTENSION_URN, codeOr, flushGaps, gap, humanize, newContext, nextId, NO_HOME, one, present, sweep, textOr, trimmed,
  uniqueIndex, usdmCode, USDM_VERSION,
} from './usdm-types';
import type {
  SweepSpec, UsdmAdministration, UsdmAnalysisPopulation, UsdmContext, UsdmEligibilityCriterion, UsdmEligibilityCriterionItem, UsdmEstimand,
  UsdmExtensionAttribute, UsdmIntercurrentEvent, UsdmObjective, UsdmProjection, UsdmStudyArm, UsdmStudyDesign, UsdmStudyDesignPopulation,
  UsdmStudyElement, UsdmStudyIntervention, UsdmStudyTitle,
} from './usdm-types';
import { elementPlacementBlocker, mapSchedule, scheduleSweepSpecs, type ScheduleResult } from './usdm-schedule';

export const USDM_BASIS =
  'CDISC Unified Study Definitions Model (USDM) v4.0.0 (DDF Reference Architecture release v4.0.0) / TransCelerate Digital Data Flow; ' +
  'ICH E9(R1) estimand attributes — export shape only; conformance unverified (schema not vendored)';

export const USDM_STANDARD = `CDISC USDM v${USDM_VERSION} — class and attribute names pinned to the release's API schema; value types and codelists unverified`;

export const USDM_CONFORMANCE_REASON =
  `The CDISC USDM v${USDM_VERSION} JSON schema is not vendored in this repository, so this export has not been validated against it. ` +
  'Class and attribute names are pinned to a transcription of that release; required attributes the design cannot fill are emitted ' +
  'as null or empty and named in unfilledUsdmEntities, so the graph is unvalidated and is not schema-valid where the design is incomplete.';

/** Unfilled entities every export carries: the design object has no home for them at all. */
export const ALWAYS_UNFILLED: readonly string[] = [
  'Organization: the design records no sponsor or other organisation; none is invented',
  'StudyVersion.studyIdentifiers / StudyIdentifier: the design records no registry or sponsor study identifier; none is invented',
  'StudyVersion.dateValues / GovernanceDate: the design records no protocol, approval or amendment date; none is invented',
  'StudyVersion.rationale: the design records no study rationale; none is invented',
  'StudyDefinitionDocument: the protocol document is not part of the design object; Study.documentedBy is not emitted',
  'StudyDesign.studyType: interventional vs observational is not recorded as a value and is not inferred; the graph uses ' +
    'InterventionalStudyDesign because this mapping exports intervention-model and blinding content, which only that class carries, ' +
    'so a consumer must confirm the study is interventional',
  'StudyDesign.rationale: the design records no design rationale as such; none is invented',
  'StudyDesign.therapeuticAreas: no coded therapeutic area is recorded',
  'StudyDesignPopulation.includesHealthySubjects: not recorded',
];

/** Structural designs that ARE intervention models (USDM InterventionalStudyDesign.model). */
const INTERVENTION_MODELS: ReadonlySet<string> = new Set(['parallel_group', 'crossover', 'factorial', 'single_arm']);
const PHASE_DECODE: ReadonlyMap<string, string> = new Map([['FIH', 'First in human']]);
const BLINDING_DECODE: ReadonlyMap<string, string> = new Map([
  ['open', 'Open label'],
  ['single', 'Single blind'],
  ['double', 'Double blind'],
  ['triple', 'Triple blind'],
]);
const LEVEL_RANK: ReadonlyMap<string, number> = new Map([['primary', 0], ['secondary', 1], ['exploratory', 2]]);

type ValueState = 'mapped' | 'absent' | 'invalid';

interface SweepFlags {
  timed: boolean;
  version: ValueState;
  sampleSize: ValueState;
  modelMapped: boolean;
  assignmentExported: boolean;
}

// ─── Projection ─────────────────────────────────────────────────────────────

/**
 * Project a design as a USDM v4.0.0-shaped graph. Deterministic; conformance is
 * always `unverified`; every populated-but-unmapped field and every unfillable
 * attribute is listed.
 */
export function projectUsdm(design: StudyDesign): UsdmProjection {
  const ctx = newContext(ALWAYS_UNFILLED);
  const [studyId, versionId, designId, titleId] = ['Study', 'StudyVersion', 'StudyDesign', 'StudyTitle'].map(k => nextId(ctx, k));
  const armsIn = design.arms ?? [];
  const arms = mapArms(armsIn, ctx);
  const iv = mapInterventions(armsIn, arms, ctx);
  const el = mapElements(arms, iv.idsByArm, elementPlacementBlocker(design.scheduleOfActivities, design.framework?.structuralDesign), ctx);
  const analysisPopulations = mapAnalysisPopulations(design, ctx);
  const pop = mapPopulation(design, ctx);
  const obj = mapObjectives(design, ctx);
  const estimands = mapEstimands(design, obj.endpointIdByName, analysisPopulations, ctx);
  const schedule = mapSchedule(design.scheduleOfActivities, arms, el.elementByArm, ctx);
  const studyDesign = assembleDesign(design, designId, {
    arms, elements: el.elements, schedule, population: pop.population, criteria: pop.criteria, objectives: obj.objectives, estimands,
    studyInterventionIds: iv.interventions.map(i => i.id), analysisPopulations,
  }, ctx);
  const version = mapVersion(design.version, ctx);
  const title = trimmed(design.title);
  if (!title) ctx.unfilled.push('Study.name / StudyVersion.titles / StudyTitle: the design records no title');
  const titles = mapTitles(design, titleId, ctx);
  sweepUnmapped(design, {
    timed: schedule.timed, version: version.state, sampleSize: pop.sampleSize, modelMapped: studyDesign.model !== null, assignmentExported: el.assignmentExported,
  }, ctx.unmapped);
  if (ctx.counters.has('Code')) ctx.unfilled.push('Code.codeSystemVersion: the C2C-INTERNAL code system is unversioned; no version is invented');
  flushGaps(ctx);

  return {
    conformance: { status: 'unverified', reason: USDM_CONFORMANCE_REASON, standard: USDM_STANDARD },
    study: {
      id: studyId,
      instanceType: 'Study',
      name: title,
      versions: [{
        id: versionId,
        instanceType: 'StudyVersion',
        versionIdentifier: version.identifier,
        rationale: null,
        titles,
        studyIdentifiers: [],
        dateValues: [],
        studyDesigns: [studyDesign],
        studyInterventions: iv.interventions,
        eligibilityCriterionItems: pop.items,
      }],
    },
    unmappedDesignFields: ctx.unmapped,
    unfilledUsdmEntities: ctx.unfilled,
    basis: USDM_BASIS,
  };
}

/** A recorded value as the ledger quotes it: strings in quotes, anything else as written. */
function show(v: unknown): string {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

function mapVersion(v: unknown, ctx: UsdmContext): { identifier: string | null; state: ValueState } {
  if (typeof v === 'number' && Number.isFinite(v)) return { identifier: String(v), state: 'mapped' };
  if (v === undefined || v === null) {
    ctx.unfilled.push('StudyVersion.versionIdentifier: the design records no version number');
    return { identifier: null, state: 'absent' };
  }
  ctx.unfilled.push(`StudyVersion.versionIdentifier: the design records version ${show(v)}, which is not a number; not exported`);
  return { identifier: null, state: 'invalid' };
}

interface DesignParts {
  arms: UsdmStudyArm[];
  elements: UsdmStudyElement[];
  schedule: ScheduleResult;
  population: UsdmStudyDesignPopulation;
  criteria: UsdmEligibilityCriterion[];
  objectives: UsdmObjective[];
  estimands: UsdmEstimand[];
  studyInterventionIds: string[];
  analysisPopulations: UsdmAnalysisPopulation[];
}

function mapModel(structural: unknown, ctx: UsdmContext): UsdmStudyDesign['model'] {
  if (!present(structural)) {
    ctx.unfilled.push('StudyDesign.model: the design records no structural design');
    return null;
  }
  if (!INTERVENTION_MODELS.has(structural)) {
    ctx.unfilled.push(
      `StudyDesign.model: structural design "${structural}" is a design feature, not an intervention model (parallel group, crossover, factorial, single arm); not mapped`,
    );
    return null;
  }
  return usdmCode(ctx, structural, humanize(structural));
}

function assembleDesign(design: StudyDesign, id: string, p: DesignParts, ctx: UsdmContext): UsdmStudyDesign {
  const blinding = trimmed(design.randomization?.blinding);
  const phase = trimmed(design.phase);
  if (!phase) ctx.unfilled.push('StudyDesign.studyPhase: the design records no phase');
  if (!blinding) ctx.unfilled.push('StudyDesign.blindingSchema: the design records no blinding level');
  const model = mapModel(design.framework?.structuralDesign, ctx);
  const indication = trimmed(design.indication);
  const indications = indication
    ? [{ id: nextId(ctx, 'Indication'), instanceType: 'Indication' as const, name: indication, description: indication, isRareDisease: null, codes: [] as [] }]
    : [];
  if (indication) {
    ctx.unfilled.push('Indication.codes: the indication is free text; no coded disease term is recorded', 'Indication.isRareDisease: not recorded');
  } else {
    ctx.unfilled.push('StudyDesign.indications / Indication: the design records no indication');
  }
  return {
    id,
    instanceType: 'InterventionalStudyDesign',
    name: id,
    rationale: null,
    studyType: null,
    studyPhase: phase ? aliasCode(ctx, phase, PHASE_DECODE.get(phase) ?? `Phase ${phase}`) : null,
    model,
    blindingSchema: blinding ? aliasCode(ctx, blinding, BLINDING_DECODE.get(blinding) ?? humanize(blinding)) : null,
    arms: p.arms,
    epochs: p.schedule.epochs,
    studyCells: p.schedule.cells,
    elements: p.elements,
    activities: p.schedule.activities,
    encounters: p.schedule.encounters,
    scheduleTimelines: p.schedule.timelines,
    eligibilityCriteria: p.criteria,
    population: p.population,
    objectives: p.objectives,
    estimands: p.estimands,
    studyInterventionIds: p.studyInterventionIds,
    analysisPopulations: p.analysisPopulations,
    indications,
  };
}

// ─── Arms, interventions, elements ──────────────────────────────────────────

function administrationFor(i: Intervention, ctx: UsdmContext): UsdmAdministration[] {
  const parts: Array<[string, string | null]> = [
    ['dose', trimmed(i.dose)],
    ['regimen', trimmed(i.regimen)],
    ['route', trimmed(i.route)],
    ['duration', trimmed(i.duration)],
  ];
  const recorded = parts.filter((p): p is [string, string] => p[1] !== null);
  if (recorded.length === 0) return [];
  const route = trimmed(i.route);
  const regimen = trimmed(i.regimen);
  const id = nextId(ctx, 'Administration');
  if (!route) gap(ctx, 'Administration.route', id);
  if (!regimen) gap(ctx, 'Administration.frequency', id, 'the intervention records no regimen');
  return [{
    id,
    instanceType: 'Administration',
    name: id,
    description: recorded.map(([k, v]) => `${k}: ${v}`).join('; '),
    route: route ? aliasCode(ctx, route, route) : null,
    frequency: regimen ? aliasCode(ctx, regimen, regimen) : null,
    dose: null,
    duration: null,
  }];
}

function newIntervention(i: Intervention, ctx: UsdmContext): UsdmStudyIntervention {
  const id = nextId(ctx, 'StudyIntervention');
  const name = textOr(ctx, 'StudyIntervention.name', id, i.name);
  const role = codeOr(ctx, 'StudyIntervention.role', id, i.role);
  return { id, instanceType: 'StudyIntervention', name, role, type: null, administrations: administrationFor(i, ctx) };
}

/** One StudyIntervention per DISTINCT intervention record; identical records in several arms share one. */
function mapInterventions(armsIn: Arm[], arms: UsdmStudyArm[], ctx: UsdmContext): { interventions: UsdmStudyIntervention[]; idsByArm: string[][] } {
  const interventions: UsdmStudyIntervention[] = [];
  const byRecord = new Map<string, string>();
  const repeated: string[] = [];
  const idsByArm = armsIn.map((arm, ai) => {
    const ids = (arm.interventions ?? []).map(i => {
      const key = JSON.stringify([trimmed(i.name), trimmed(i.role), trimmed(i.dose), trimmed(i.regimen), trimmed(i.route), trimmed(i.duration)]);
      const existing = byRecord.get(key);
      if (existing) return existing;
      const si = newIntervention(i, ctx);
      byRecord.set(key, si.id);
      interventions.push(si);
      return si.id;
    });
    const unique = [...new Set(ids)];
    if (unique.length < ids.length) repeated.push(arms[ai].id);
    return unique;
  });
  if (repeated.length > 0) {
    ctx.unmapped.push(`arms[].interventions: ${repeated.join(', ')} list an identical intervention record more than once; the repetition has no home and each record is exported once`);
  }
  const bare = interventions.filter(i => i.administrations.length === 0).map(i => i.id);
  if (bare.length > 0) ctx.unfilled.push(`Administration: ${bare.join(', ')} record no dose, regimen, route or duration`);
  if (interventions.length > 0) ctx.unfilled.push('StudyIntervention.type: the design records no per-intervention product type');
  if (interventions.some(i => i.administrations.length > 0)) {
    ctx.unfilled.push(
      'Administration.dose / Administration.duration: recorded as free text and carried verbatim in Administration.description; no Quantity or Duration is parsed',
    );
  }
  return { interventions, idsByArm };
}

function mapArms(arms: Arm[], ctx: UsdmContext): UsdmStudyArm[] {
  const out = arms.map(arm => {
    const id = nextId(ctx, 'StudyArm');
    return { id, instanceType: 'StudyArm' as const, name: textOr(ctx, 'StudyArm.name', id, arm.name), type: null, dataOriginType: null, dataOriginDescription: null };
  });
  ctx.unfilled.push(
    out.length > 0
      ? 'StudyArm.type / StudyArm.dataOriginType / StudyArm.dataOriginDescription: not recorded; not inferred from intervention roles'
      : 'StudyDesign.arms / StudyArm: the design records no arms',
  );
  return out;
}

/**
 * One element per arm that records an intervention — built ONLY when the
 * element's placement is determined (`blocker` null); otherwise none is built
 * and the arm-to-intervention assignment is reported as not exported.
 */
function mapElements(
  arms: UsdmStudyArm[],
  idsByArm: string[][],
  blocker: string | null,
  ctx: UsdmContext,
): { elements: UsdmStudyElement[]; elementByArm: Array<string | null>; assignmentExported: boolean } {
  const none = arms.filter((_, i) => idsByArm[i].length === 0).map(a => a.id);
  const unplaced = { elements: [] as UsdmStudyElement[], elementByArm: arms.map((): string | null => null), assignmentExported: true };
  if (none.length > 0) {
    ctx.unfilled.push(`StudyElement / StudyCell.elementIds: ${none.join(', ')} record no intervention, so no element exists for them`);
  }
  if (none.length === arms.length) return unplaced;
  if (blocker) {
    ctx.unfilled.push(
      `StudyDesign.elements / StudyElement / StudyCell.elementIds: ${blocker}; no element is built, so the arm-to-intervention assignment is not exported (the interventions themselves are)`,
    );
    return { ...unplaced, assignmentExported: false };
  }
  const elements: UsdmStudyElement[] = [];
  const elementByArm = arms.map((arm, i) => {
    if (idsByArm[i].length === 0) return null;
    const id = nextId(ctx, 'StudyElement');
    const name = arm.name ? `Treatment: ${arm.name}` : id;
    elements.push({ id, instanceType: 'StudyElement', name, studyInterventionIds: idsByArm[i], transitionStartRule: null, transitionEndRule: null });
    return id;
  });
  ctx.unfilled.push('StudyElement.transitionStartRule / StudyElement.transitionEndRule: the design records no element transition rules');
  return { elements, elementByArm, assignmentExported: true };
}

// ─── Population ─────────────────────────────────────────────────────────────

function mapAnalysisPopulations(design: StudyDesign, ctx: UsdmContext): UsdmAnalysisPopulation[] {
  return (design.population?.analysisPopulations ?? []).map(ap => {
    const id = nextId(ctx, 'AnalysisPopulation');
    return { id, instanceType: 'AnalysisPopulation' as const, name: textOr(ctx, 'AnalysisPopulation.name', id, ap.kind), text: textOr(ctx, 'AnalysisPopulation.text', id, ap.definition) };
  });
}

function sampleSizeState(n: unknown, ctx: UsdmContext): ValueState {
  if (typeof n === 'number' && Number.isInteger(n) && n > 0) return 'mapped';
  if (n === undefined || n === null) {
    ctx.unfilled.push('StudyDesignPopulation.plannedEnrollmentNumber: the design records no planned sample size');
    return 'absent';
  }
  ctx.unfilled.push(`StudyDesignPopulation.plannedEnrollmentNumber: the design records plannedSampleSize=${show(n)}, which is not a positive integer; not exported`);
  return 'invalid';
}

function mapPopulation(design: StudyDesign, ctx: UsdmContext): {
  population: UsdmStudyDesignPopulation; criteria: UsdmEligibilityCriterion[]; items: UsdmEligibilityCriterionItem[]; sampleSize: ValueState;
} {
  const id = nextId(ctx, 'StudyDesignPopulation');
  const items: UsdmEligibilityCriterionItem[] = [];
  const criteria = (design.population?.eligibility ?? []).map(c => {
    const cid = nextId(ctx, 'EligibilityCriterion');
    const iid = nextId(ctx, 'EligibilityCriterionItem');
    items.push({ id: iid, instanceType: 'EligibilityCriterionItem', name: iid, text: textOr(ctx, 'EligibilityCriterionItem.text', iid, c.text) });
    const category = codeOr(ctx, 'EligibilityCriterion.category', cid, c.type, v => v.toUpperCase());
    return { id: cid, instanceType: 'EligibilityCriterion' as const, name: cid, identifier: null, category, criterionItemId: iid };
  });
  ctx.unfilled.push(
    criteria.length === 0
      ? 'StudyDesign.eligibilityCriteria / EligibilityCriterion: the design records no eligibility criteria'
      : 'EligibilityCriterion.identifier: the design records no criterion number; none is invented',
  );
  const description = trimmed(design.population?.targetDescription);
  if (!description) ctx.unfilled.push('StudyDesignPopulation.description: the design records no target population description');
  const n = design.statisticalPlan?.plannedSampleSize;
  const sampleSize = sampleSizeState(n, ctx);
  const population: UsdmStudyDesignPopulation = {
    id,
    instanceType: 'StudyDesignPopulation',
    name: id,
    description,
    includesHealthySubjects: null,
    plannedEnrollmentNumber: sampleSize === 'mapped' ? { id: nextId(ctx, 'Quantity'), instanceType: 'Quantity', value: n as number } : null,
    criterionIds: criteria.map(c => c.id),
  };
  return { population, criteria, items, sampleSize };
}

// ─── Objectives, endpoints, estimands ───────────────────────────────────────

function reportOrphanEndpoints(endpoints: StudyDesign['endpoints'], exported: Map<string, string>, ctx: UsdmContext): void {
  const counts = new Map<string, number>();
  for (const e of endpoints) if (present(e.name)) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  for (const [name, k] of counts) {
    if (exported.has(name)) continue;
    ctx.unmapped.push(k > 1
      ? `endpoints[name="${name}"] (${k} records): the name is defined more than once, so no objective can reference it unambiguously; not exported`
      : `endpoints[name="${name}"]: no objective nests it (USDM nests endpoints under objectives), so it is not exported`);
  }
  const unnamed = endpoints.filter(e => !present(e.name)).length;
  if (unnamed > 0) ctx.unmapped.push(`endpoints (${unnamed} of ${endpoints.length}): record no name, so no objective can reference them; not exported`);
}

function mapObjectives(design: StudyDesign, ctx: UsdmContext): { objectives: UsdmObjective[]; endpointIdByName: Map<string, string> } {
  const endpoints = design.endpoints ?? [];
  const byName = uniqueIndex(endpoints, e => e.name);
  const endpointIdByName = new Map<string, string>();
  const owner = new Map<string, string>();
  const rank = (level: unknown) => (typeof level === 'string' ? LEVEL_RANK.get(level) : undefined) ?? 9;
  const sorted = [...(design.objectives ?? [])].sort((a, b) => rank(a.level) - rank(b.level) || (a.order ?? 0) - (b.order ?? 0));
  const objectives = sorted.map(o => {
    const id = nextId(ctx, 'Objective');
    const level = codeOr(ctx, 'Objective.level', id, o.level);
    const text = textOr(ctx, 'Objective.text', id, o.text);
    const pos = present(o.endpointName) ? byName.get(o.endpointName) : undefined;
    const nested: UsdmObjective['endpoints'] = [];
    if (!present(o.endpointName)) {
      ctx.unfilled.push(`${id}.endpoints: the objective names no endpoint`);
    } else if (pos === undefined) {
      const why = byName.ambiguous(o.endpointName) ? 'defines more than once' : 'does not define';
      ctx.unfilled.push(`${id}.endpoints: the objective names endpoint "${o.endpointName}", which the design ${why}`);
    } else if (owner.has(o.endpointName)) {
      ctx.unmapped.push(
        `objectives[].endpointName: ${id} names endpoint "${o.endpointName}", already nested under ${owner.get(o.endpointName)}; USDM nests each endpoint under one objective`,
      );
    } else {
      const e = endpoints[pos];
      const eid = nextId(ctx, 'Endpoint');
      nested.push({ id: eid, instanceType: 'Endpoint', name: e.name, text: textOr(ctx, 'Endpoint.text', eid, e.definition), level: codeOr(ctx, 'Endpoint.level', eid, e.role), purpose: null });
      owner.set(e.name, id);
      endpointIdByName.set(e.name, eid);
    }
    return { id, instanceType: 'Objective' as const, name: id, text, level, endpoints: nested };
  });
  reportOrphanEndpoints(endpoints, endpointIdByName, ctx);
  if (objectives.length === 0) ctx.unfilled.push('StudyDesign.objectives / Objective: the design records no objectives');
  if (endpointIdByName.size > 0) ctx.unfilled.push('Endpoint.purpose: the design records no endpoint purpose');
  return { objectives, endpointIdByName };
}

/** The AnalysisPopulation whose definition or kind equals the estimand's recorded population verbatim — only when exactly one does. */
function resolvePopulation(id: string, population: unknown, design: StudyDesign, aps: UsdmAnalysisPopulation[], ctx: UsdmContext): string | null {
  const pop = trimmed(population);
  if (pop === null) {
    ctx.unfilled.push(`${id}.analysisPopulationId: the estimand records no population`);
    return null;
  }
  const apsIn = design.population?.analysisPopulations ?? [];
  const matches = apsIn.map((ap, i) => (trimmed(ap.definition) === pop || trimmed(ap.kind) === pop ? i : -1)).filter(i => i >= 0);
  if (matches.length === 1) return aps[matches[0]].id;
  ctx.unfilled.push(
    `${id}.analysisPopulationId: population "${pop}" matches ${matches.length === 0 ? 'no' : `${matches.length}`} analysis populations' definition or kind verbatim; not resolved`,
  );
  return null;
}

function mapIntercurrent(ev: IntercurrentEventInput, ctx: UsdmContext): UsdmIntercurrentEvent {
  const id = nextId(ctx, 'IntercurrentEvent');
  const name = textOr(ctx, 'IntercurrentEvent.name / IntercurrentEvent.text', id, ev.name);
  return {
    id,
    instanceType: 'IntercurrentEvent',
    name,
    text: name,
    description: textOr(ctx, 'IntercurrentEvent.description', id, ev.description),
    strategy: textOr(ctx, 'IntercurrentEvent.strategy', id, ev.strategy),
  };
}

function extensions(e: EstimandInput, ctx: UsdmContext): UsdmExtensionAttribute[] {
  const texts: Array<[string, unknown]> = [['treatmentCondition', e.treatmentCondition], ['population', e.population], ['variable', e.variable]];
  return texts
    .filter((t): t is [string, string] => present(t[1]))
    .map(([k, v]) => ({ id: nextId(ctx, 'ExtensionAttribute'), instanceType: 'ExtensionAttribute' as const, url: `${C2C_EXTENSION_URN}Estimand.${k}`, valueString: v }));
}

function mapEstimand(e: EstimandInput, endpointIdByName: Map<string, string>, design: StudyDesign, aps: UsdmAnalysisPopulation[], ctx: UsdmContext): UsdmEstimand {
  const id = nextId(ctx, 'Estimand');
  const intercurrentEvents = (e.intercurrentEvents ?? []).map(ev => mapIntercurrent(ev, ctx));
  if (intercurrentEvents.length === 0) ctx.unfilled.push(`${id}.intercurrentEvents: the estimand records no intercurrent event`);
  const variableOfInterestId = (present(e.endpointName) && endpointIdByName.get(e.endpointName)) || null;
  if (!variableOfInterestId) ctx.unfilled.push(`${id}.variableOfInterestId: endpoint "${e.endpointName ?? ''}" was not exported as an Endpoint`);
  const analysisPopulationId = resolvePopulation(id, e.population, design, aps, ctx);
  ctx.unfilled.push(present(e.treatmentCondition)
    ? `${id}.interventionIds: the treatment condition is recorded as free text, not as StudyIntervention references; not resolved (carried verbatim as an extension attribute)`
    : `${id}.interventionIds: the estimand records no treatment condition`);
  const populationSummary = trimmed(e.summaryMeasure);
  if (!populationSummary) ctx.unfilled.push(`${id}.populationSummary: the estimand records no summary measure`);
  return {
    id, instanceType: 'Estimand', name: id, populationSummary, analysisPopulationId, variableOfInterestId, intercurrentEvents,
    interventionIds: [], extensionAttributes: extensions(e, ctx),
  };
}

function mapEstimands(design: StudyDesign, endpointIdByName: Map<string, string>, aps: UsdmAnalysisPopulation[], ctx: UsdmContext): UsdmEstimand[] {
  const out = (design.estimands ?? []).map(e => mapEstimand(e, endpointIdByName, design, aps, ctx));
  if (out.length === 0) ctx.unfilled.push('StudyDesign.estimands / Estimand: the design records no estimands');
  return out;
}

// ─── Unmapped-field sweep ───────────────────────────────────────────────────

const TOP_LEVEL_MAPPED = [
  'title', 'publicTitle', 'acronym', 'phase', 'indication', 'objectives', 'estimands', 'endpoints', 'framework', 'population',
  'arms', 'randomization', 'scheduleOfActivities', 'statisticalPlan', 'safety', 'regulatoryStrategy',
];

const TOP_LEVEL_REASONS: Record<string, string> = {
  id: 'internal design id; a USDM StudyIdentifier needs an issuing Organization the design does not carry',
  programId: 'internal programme id; no USDM home',
  organizationId: 'tenant id, not a sponsor Organization',
  productType: 'study-level; USDM types each StudyIntervention and the design records no per-intervention type',
  targetRegions: 'USDM geographic scope attaches to amendments and enrolment, which the design does not carry',
  scheduleOfActivitiesId: 'internal schedule reference; the timeline takes a positional id',
  status: 'design lifecycle status; USDM protocol status belongs to a protocol document version, which is not exported',
  evidence: 'provenance links have no USDM home',
};

function designSpecs(d: StudyDesign, f: SweepFlags): SweepSpec[] {
  const arms = d.arms ?? [];
  const estimands = d.estimands ?? [];
  const topOverrides = f.version === 'invalid' ? { ...TOP_LEVEL_REASONS, version: 'recorded but not a number; not exported as StudyVersion.versionIdentifier' } : TOP_LEVEL_REASONS;
  return [
    { path: '', each: false, items: [d], mapped: f.version === 'mapped' ? [...TOP_LEVEL_MAPPED, 'version'] : TOP_LEVEL_MAPPED, reason: NO_HOME, overrides: topOverrides },
    {
      path: 'framework', each: false, items: one(d.framework), mapped: f.modelMapped ? ['structuralDesign'] : [],
      reason: 'no USDM v4 StudyDesign attribute in this mapping (frame, control, margins and adaptive features are rationale/SAP content)',
      overrides: { structuralDesign: 'not an intervention model, so not exported as StudyDesign.model (see unfilledUsdmEntities)' },
    },
    { path: 'population', each: false, items: one(d.population), mapped: ['targetDescription', 'analysisPopulations', 'eligibility'], reason: 'the pediatric age range is free text; USDM plannedAge is a numeric range' },
    { path: 'population.eligibility', each: true, items: d.population?.eligibility ?? [], mapped: ['type', 'text'], reason: 'criterion terminology codes have no home in this mapping' },
    { path: 'population.analysisPopulations', each: true, items: d.population?.analysisPopulations ?? [], mapped: ['kind', 'definition'], reason: 'USDM AnalysisPopulation has no primary-analysis-set flag' },
    {
      path: 'arms', each: true, items: arms, mapped: f.assignmentExported ? ['name', 'interventions'] : ['name'], reason: 'dose-modification rules have no home in this mapping',
      overrides: { interventions: 'USDM links an arm to its interventions only through StudyCell → StudyElement and no element could be placed (see unfilledUsdmEntities); the interventions are exported, the assignment is not' },
    },
    { path: 'arms[].interventions', each: true, items: arms.flatMap(a => a.interventions ?? []), mapped: ['name', 'role', 'dose', 'regimen', 'route', 'duration'], reason: NO_HOME },
    { path: 'objectives', each: true, items: d.objectives ?? [], mapped: ['level', 'order', 'text', 'endpointName'], reason: 'USDM links an estimand to its endpoint, not to an objective' },
    { path: 'endpoints', each: true, items: d.endpoints ?? [], mapped: ['name', 'role', 'definition'], reason: 'no USDM v4 Endpoint attribute in this mapping' },
    { path: 'estimands', each: true, items: estimands, mapped: ['endpointName', 'population', 'variable', 'summaryMeasure', 'intercurrentEvents', 'treatmentCondition'], reason: 'USDM records the strategy per intercurrent event, not per estimand' },
    { path: 'estimands[].intercurrentEvents', each: true, items: estimands.flatMap(e => e.intercurrentEvents ?? []), mapped: ['name', 'description', 'strategy'], reason: 'USDM IntercurrentEvent has no justification attribute' },
    { path: 'randomization', each: false, items: one(d.randomization), mapped: ['blinding'], reason: 'USDM v4 has no randomisation entity in this mapping' },
    {
      path: 'statisticalPlan', each: false, items: one(d.statisticalPlan), mapped: f.sampleSize === 'mapped' ? ['plannedSampleSize'] : [],
      reason: 'USDM v4 carries no statistical-analysis-plan content', overrides: { plannedSampleSize: 'recorded but not a positive integer; not exported as plannedEnrollmentNumber' },
    },
    { path: 'safety', each: false, items: one(d.safety), mapped: [], reason: 'USDM v4 carries no safety-monitoring design in this mapping' },
    { path: 'regulatoryStrategy', each: false, items: one(d.regulatoryStrategy), mapped: [], reason: 'regulatory-strategy attribute; no USDM home' },
  ];
}

/**
 * The design's titles. Each is typed by what the design records it as — `title`
 * is the protocol's official title, `publicTitle` the lay title a person
 * recorded, `acronym` the study's acronym — with C2C-INTERNAL codes, not CDISC
 * controlled terms. A title the design does not record is not emitted.
 */
function mapTitles(design: StudyDesign, officialId: string, ctx: UsdmContext): UsdmStudyTitle[] {
  const out: UsdmStudyTitle[] = [];
  const official = trimmed(design.title);
  if (official) out.push({ id: officialId, instanceType: 'StudyTitle', text: official, type: usdmCode(ctx, 'official', 'Official title (the title of the protocol)') });
  const others: Array<[unknown, string, string]> = [
    [design.publicTitle, 'public', 'Public (lay-language) title'],
    [design.acronym, 'acronym', 'Study acronym'],
  ];
  for (const [value, code, decode] of others) {
    const text = trimmed(value);
    if (text) out.push({ id: nextId(ctx, 'StudyTitle'), instanceType: 'StudyTitle', text, type: usdmCode(ctx, code, decode) });
  }
  return out;
}

/** List every populated design field this mapping does not carry, node by node. */
function sweepUnmapped(d: StudyDesign, flags: SweepFlags, out: string[]): void {
  for (const spec of [...designSpecs(d, flags), ...scheduleSweepSpecs(d.scheduleOfActivities, flags.timed)]) sweep(spec, out);
}
