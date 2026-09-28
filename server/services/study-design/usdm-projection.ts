/**
 * USDM export — the study design projected as a CDISC Unified Study Definitions
 * Model (USDM) shaped object graph.
 *
 * ## The industry need
 * USDM, built by CDISC with TransCelerate's Digital Data Flow initiative, is the
 * digital-protocol interchange model the industry is converging on: study
 * definition repositories, CTMS/EDC build tools and regulator pilots consume a
 * study as a graph of Study → StudyVersion → StudyDesign → arms, epochs, cells,
 * activities, encounters and a schedule timeline. This repository's design spine
 * is described as USDM-aligned and, until this module, emitted nothing in USDM
 * shape. This is that export: one deterministic pass from `StudyDesign` to a
 * graph named after USDM v3 entities (see `usdm-types.ts`).
 *
 * ## What maps where
 *  - title → Study.name, StudyTitle.text; phase → StudyVersion.studyPhase;
 *    version → versionIdentifier; indication → Indication (uncoded).
 *  - arms → StudyArm; interventions → StudyIntervention (identical records
 *    shared by several arms become ONE intervention) with an Administration
 *    carrying the recorded dose/regimen/route/duration text verbatim; each arm
 *    with an intervention → one StudyElement, placed in that arm's cells for
 *    every epoch of kind `treatment` (the schedule is common to all arms, so
 *    cells are the full arm × epoch grid).
 *  - SoA epochs → StudyEpoch; visits → Encounter; activities → Activity; each
 *    visit (SoA column) → one ScheduledActivityInstance listing the activities
 *    its cells schedule, on one main ScheduleTimeline.
 *  - study days → Timing, relative to ONE anchor (the unique baseline visit,
 *    else the unique study-day-1 visit), offsets computed under the design
 *    model's own day-1 convention (no day 0); windows → windowLower/Upper.
 *  - eligibility → EligibilityCriterion (category INCLUSION/EXCLUSION);
 *    plannedSampleSize → plannedEnrollmentNumber; objectives → Objective with
 *    its endpoint nested; estimands → Estimand with IntercurrentEvents.
 *
 * ## The honesty contract
 *  - `conformance.status` is ALWAYS the literal `unverified`: the CDISC USDM JSON
 *    schema is not vendored here, so the graph is unvalidated and says so.
 *  - Ids are positional (`StudyArm_1`) — no RNG, no clock. Same design →
 *    byte-identical output. The input is not mutated.
 *  - Codes use codeSystem `C2C-INTERNAL` with the design's own value; no NCI
 *    Thesaurus C-code is claimed.
 *  - Nothing is invented: no sponsor, identifier, date, arm type, study type,
 *    endpoint purpose or timing the design does not carry. Absent → null or an
 *    empty list, named in `unfilledUsdmEntities`.
 *  - `unmappedDesignFields` lists every POPULATED design field with no home in
 *    this mapping — swept generically, so a field added to the design later is
 *    reported rather than silently dropped. A reference that does not resolve
 *    exactly once (cell → visit, objective → endpoint) is reported, never guessed.
 *
 * Pure: no model call, no RNG, no clock, no DB.
 *
 * @module server/services/study-design/usdm-projection
 */

import type { Arm, EstimandInput, Intervention, StudyDesign } from './study-design-types';
import {
  humanize,
  nextId,
  present,
  trimmed,
  uniqueIndex,
  usdmCode,
  type UsdmAdministration,
  type UsdmAnalysisPopulation,
  type UsdmContext,
  type UsdmEstimand,
  type UsdmObjective,
  type UsdmProjection,
  type UsdmStudyArm,
  type UsdmStudyDesign,
  type UsdmStudyDesignPopulation,
  type UsdmStudyElement,
  type UsdmStudyIntervention,
} from './usdm-types';
import { mapSchedule, type ScheduleResult } from './usdm-schedule';

export const USDM_BASIS =
  'CDISC Unified Study Definitions Model (USDM) / TransCelerate Digital Data Flow — export shape only; conformance unverified (schema not vendored)';

export const USDM_STANDARD = 'CDISC USDM v3 — entity and attribute naming as understood by the author';

export const USDM_CONFORMANCE_REASON =
  'The CDISC USDM JSON schema is not vendored in this repository, so this export has not been validated against it. ' +
  'The graph follows USDM v3 entity and attribute naming as understood by the author and is unvalidated.';

/** Unfilled entities every export carries: the design object has no home for them at all. */
export const ALWAYS_UNFILLED: readonly string[] = [
  'Organization: the design records no sponsor or other organisation; none is invented',
  'StudyIdentifier: the design records no registry or sponsor study identifier; none is invented',
  'GovernanceDate: the design records no protocol, approval or amendment date; none is invented',
  'StudyProtocolDocument: the protocol document is not part of the design object; Study.documentedBy is not emitted',
  'StudyTitle.type: the design does not record whether its title is the official, brief or acronym title',
  'StudyDesign.studyType: interventional vs observational is not recorded and is not inferred',
  'StudyDesign.therapeuticAreas: no coded therapeutic area is recorded',
  'StudyDesignPopulation.includesHealthySubjects: not recorded',
];

const PHASE_DECODE: Record<string, string> = { FIH: 'First in human' };
const BLINDING_DECODE: Record<string, string> = {
  open: 'Open label',
  single: 'Single blind',
  double: 'Double blind',
  triple: 'Triple blind',
};
const LEVEL_RANK: Record<string, number> = { primary: 0, secondary: 1, exploratory: 2 };

// ─── Projection ─────────────────────────────────────────────────────────────

/**
 * Project a design as a USDM-shaped graph. Deterministic; conformance is always
 * `unverified`; every populated-but-unmapped field and every unfillable entity is listed.
 */
export function projectUsdm(design: StudyDesign): UsdmProjection {
  const ctx: UsdmContext = { counters: new Map(), unmapped: [], unfilled: [...ALWAYS_UNFILLED] };
  const studyId = nextId(ctx, 'Study');
  const versionId = nextId(ctx, 'StudyVersion');
  const designId = nextId(ctx, 'StudyDesign');
  const titleId = nextId(ctx, 'StudyTitle');

  const armsIn = design.arms ?? [];
  const iv = mapInterventions(armsIn, ctx);
  const arms = mapArms(armsIn, ctx);
  const el = mapElements(armsIn, arms, iv.idsByArm, ctx);
  const analysisPopulations = mapAnalysisPopulations(design, ctx);
  const population = mapPopulation(design, ctx);
  const obj = mapObjectives(design, ctx);
  const estimands = mapEstimands(design.estimands ?? [], obj.endpointIdByName, analysisPopulations, design, ctx);
  const schedule = mapSchedule(design.scheduleOfActivities, arms, el.elementByArm, ctx);
  const studyDesign = assembleDesign(design, designId, {
    arms, elements: el.elements, schedule, population, objectives: obj.objectives, estimands,
    studyInterventions: iv.interventions, analysisPopulations,
  }, ctx);
  const hasVersion = typeof design.version === 'number' && Number.isFinite(design.version);
  sweepUnmapped(
    design,
    { timed: schedule.timed, versionMapped: hasVersion, sampleSizeMapped: population.plannedEnrollmentNumber !== null },
    ctx.unmapped,
  );
  if (!hasVersion) ctx.unfilled.push('StudyVersion.versionIdentifier: the design records no version number');
  if (!present(design.phase)) ctx.unfilled.push('StudyVersion.studyPhase: the design records no phase');
  const title = trimmed(design.title);
  if (!title) ctx.unfilled.push('Study.name / StudyTitle: the design records no title');

  return {
    conformance: { status: 'unverified', reason: USDM_CONFORMANCE_REASON, standard: USDM_STANDARD },
    study: {
      id: studyId,
      instanceType: 'Study',
      name: title,
      versions: [{
        id: versionId,
        instanceType: 'StudyVersion',
        versionIdentifier: hasVersion ? String(design.version) : null,
        titles: title ? [{ id: titleId, instanceType: 'StudyTitle', text: title, type: null }] : [],
        studyPhase: present(design.phase) ? usdmCode(design.phase, PHASE_DECODE[design.phase] ?? `Phase ${design.phase}`) : null,
        studyIdentifiers: [],
        dateValues: [],
        studyDesigns: [studyDesign],
      }],
    },
    unmappedDesignFields: ctx.unmapped,
    unfilledUsdmEntities: ctx.unfilled,
    basis: USDM_BASIS,
  };
}

interface DesignParts {
  arms: UsdmStudyArm[];
  elements: UsdmStudyElement[];
  schedule: ScheduleResult;
  population: UsdmStudyDesignPopulation;
  objectives: UsdmObjective[];
  estimands: UsdmEstimand[];
  studyInterventions: UsdmStudyIntervention[];
  analysisPopulations: UsdmAnalysisPopulation[];
}

function assembleDesign(design: StudyDesign, id: string, p: DesignParts, ctx: UsdmContext): UsdmStudyDesign {
  const structural = design.framework?.structuralDesign;
  const blinding = design.randomization?.blinding;
  if (!present(structural)) ctx.unfilled.push('StudyDesign.interventionModel: the design records no structural design');
  if (!present(blinding)) ctx.unfilled.push('StudyDesign.blindingSchema: the design records no randomization/blinding node');
  const indications = present(design.indication)
    ? [{ id: nextId(ctx, 'Indication'), instanceType: 'Indication' as const, name: design.indication, description: design.indication, codes: [] as [] }]
    : [];
  ctx.unfilled.push(
    indications.length > 0
      ? 'Indication.codes: the indication is free text; no coded disease term is recorded'
      : 'Indication: the design records no indication',
  );
  return {
    id,
    instanceType: 'StudyDesign',
    name: id,
    studyType: null,
    interventionModel: present(structural) ? usdmCode(structural, humanize(structural)) : null,
    blindingSchema: present(blinding) ? usdmCode(blinding, BLINDING_DECODE[blinding] ?? humanize(blinding)) : null,
    arms: p.arms,
    epochs: p.schedule.epochs,
    studyCells: p.schedule.cells,
    elements: p.elements,
    activities: p.schedule.activities,
    encounters: p.schedule.encounters,
    scheduleTimelines: p.schedule.timelines,
    population: p.population,
    objectives: p.objectives,
    estimands: p.estimands,
    studyInterventions: p.studyInterventions,
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
  return [{
    id,
    instanceType: 'Administration',
    name: id,
    description: recorded.map(([k, v]) => `${k}: ${v}`).join('; '),
    route: route ? usdmCode(route, route) : null,
    frequency: regimen ? usdmCode(regimen, regimen) : null,
    dose: null,
    duration: null,
  }];
}

/** One StudyIntervention per DISTINCT intervention record; identical records in several arms share one. */
function mapInterventions(arms: Arm[], ctx: UsdmContext): { interventions: UsdmStudyIntervention[]; idsByArm: string[][] } {
  const interventions: UsdmStudyIntervention[] = [];
  const byRecord = new Map<string, string>();
  const bare: string[] = [];
  const idsByArm = arms.map(arm => {
    const ids = (arm.interventions ?? []).map(i => {
      const key = JSON.stringify([i.name, i.role, trimmed(i.dose), trimmed(i.regimen), trimmed(i.route), trimmed(i.duration)]);
      const existing = byRecord.get(key);
      if (existing) return existing;
      const id = nextId(ctx, 'StudyIntervention');
      byRecord.set(key, id);
      const administrations = administrationFor(i, ctx);
      if (administrations.length === 0) bare.push(id);
      interventions.push({ id, instanceType: 'StudyIntervention', name: i.name, role: usdmCode(i.role, humanize(i.role)), administrations });
      return id;
    });
    return [...new Set(ids)];
  });
  if (bare.length > 0) {
    ctx.unfilled.push(`Administration: ${bare.join(', ')} record no dose, regimen, route or duration`);
  }
  if (interventions.some(i => i.administrations.length > 0)) {
    ctx.unfilled.push(
      'Administration.dose / Administration.duration: recorded as free text and carried verbatim in Administration.description; no Quantity or Duration is parsed',
    );
  }
  return { interventions, idsByArm };
}

function mapArms(arms: Arm[], ctx: UsdmContext): UsdmStudyArm[] {
  const out = arms.map(arm => ({
    id: nextId(ctx, 'StudyArm'),
    instanceType: 'StudyArm' as const,
    name: arm.name,
    type: null,
    dataOriginType: null,
  }));
  ctx.unfilled.push(
    out.length > 0
      ? 'StudyArm.type / StudyArm.dataOriginType: not recorded; not inferred from intervention roles'
      : 'StudyArm: the design records no arms',
  );
  return out;
}

/** One element per arm that records an intervention: the arm's treatment. */
function mapElements(
  arms: Arm[],
  usdmArms: UsdmStudyArm[],
  idsByArm: string[][],
  ctx: UsdmContext,
): { elements: UsdmStudyElement[]; elementByArm: Array<string | null> } {
  const elements: UsdmStudyElement[] = [];
  const noIntervention: string[] = [];
  const elementByArm = arms.map((arm, i) => {
    if (idsByArm[i].length === 0) {
      noIntervention.push(usdmArms[i].id);
      return null;
    }
    const id = nextId(ctx, 'StudyElement');
    elements.push({
      id,
      instanceType: 'StudyElement',
      name: `Treatment: ${arm.name}`,
      studyInterventionIds: idsByArm[i],
      transitionStartRule: null,
      transitionEndRule: null,
    });
    return id;
  });
  if (noIntervention.length > 0) {
    ctx.unfilled.push(`StudyElement: ${noIntervention.join(', ')} record no intervention, so no treatment element exists for them`);
  }
  if (elements.length > 0) {
    ctx.unfilled.push('StudyElement.transitionStartRule / transitionEndRule: the design records no element transition rules');
  }
  return { elements, elementByArm };
}

// ─── Population ─────────────────────────────────────────────────────────────

function mapAnalysisPopulations(design: StudyDesign, ctx: UsdmContext): UsdmAnalysisPopulation[] {
  return (design.population?.analysisPopulations ?? []).map(ap => ({
    id: nextId(ctx, 'AnalysisPopulation'),
    instanceType: 'AnalysisPopulation' as const,
    name: ap.kind,
    text: ap.definition,
  }));
}

function validCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function mapPopulation(design: StudyDesign, ctx: UsdmContext): UsdmStudyDesignPopulation {
  const id = nextId(ctx, 'StudyDesignPopulation');
  const criteria = (design.population?.eligibility ?? []).map(c => {
    const cid = nextId(ctx, 'EligibilityCriterion');
    return {
      id: cid,
      instanceType: 'EligibilityCriterion' as const,
      name: cid,
      text: c.text,
      category: usdmCode(c.type, String(c.type).toUpperCase()),
    };
  });
  if (criteria.length === 0) ctx.unfilled.push('EligibilityCriterion: the design records no eligibility criteria');
  const n = design.statisticalPlan?.plannedSampleSize;
  if (!validCount(n)) {
    ctx.unfilled.push('StudyDesignPopulation.plannedEnrollmentNumber: the design records no planned sample size (positive integer)');
  }
  return {
    id,
    instanceType: 'StudyDesignPopulation',
    name: id,
    description: trimmed(design.population?.targetDescription),
    includesHealthySubjects: null,
    plannedEnrollmentNumber: validCount(n) ? { instanceType: 'Quantity', value: n, unit: null } : null,
    criteria,
  };
}

// ─── Objectives, endpoints, estimands ───────────────────────────────────────

function mapObjectives(design: StudyDesign, ctx: UsdmContext): { objectives: UsdmObjective[]; endpointIdByName: Map<string, string> } {
  const endpoints = design.endpoints ?? [];
  const byName = uniqueIndex(endpoints, e => e.name);
  const endpointIdByName = new Map<string, string>();
  const owner = new Map<string, string>();
  const sorted = [...(design.objectives ?? [])].sort(
    (a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9) || (a.order ?? 0) - (b.order ?? 0),
  );
  const objectives = sorted.map(o => {
    const id = nextId(ctx, 'Objective');
    const pos = byName.get(o.endpointName);
    const nested: UsdmObjective['endpoints'] = [];
    if (pos === undefined) {
      const why = byName.ambiguous(o.endpointName) ? 'defines more than once' : 'does not define';
      ctx.unfilled.push(`${id}.endpoints: the objective names endpoint "${o.endpointName}", which the design ${why}`);
    } else if (owner.has(o.endpointName)) {
      ctx.unmapped.push(
        `objectives[].endpointName: ${id} names endpoint "${o.endpointName}", already nested under ${owner.get(o.endpointName)}; USDM nests each endpoint under one objective`,
      );
    } else {
      const e = endpoints[pos];
      const eid = nextId(ctx, 'Endpoint');
      nested.push({ id: eid, instanceType: 'Endpoint', name: e.name, text: e.definition, level: usdmCode(e.role, humanize(e.role)), purpose: null });
      owner.set(e.name, id);
      endpointIdByName.set(e.name, eid);
    }
    return { id, instanceType: 'Objective' as const, name: id, text: o.text, level: usdmCode(o.level, humanize(o.level)), endpoints: nested };
  });
  const orphans = [...new Set(endpoints.map(e => e.name).filter(n => !endpointIdByName.has(n)))];
  for (const name of orphans) {
    ctx.unmapped.push(`endpoints[name="${name}"]: no objective nests it (USDM nests endpoints under objectives), so it is not exported`);
  }
  if (objectives.length === 0) ctx.unfilled.push('Objective: the design records no objectives');
  if (endpointIdByName.size > 0) ctx.unfilled.push('Endpoint.purpose: the design records no endpoint purpose');
  return { objectives, endpointIdByName };
}

function mapEstimands(
  estimands: EstimandInput[],
  endpointIdByName: Map<string, string>,
  aps: UsdmAnalysisPopulation[],
  design: StudyDesign,
  ctx: UsdmContext,
): UsdmEstimand[] {
  const apsIn = design.population?.analysisPopulations ?? [];
  const out = estimands.map(e => {
    const id = nextId(ctx, 'Estimand');
    const intercurrentEvents = (e.intercurrentEvents ?? []).map(ev => ({
      id: nextId(ctx, 'IntercurrentEvent'),
      instanceType: 'IntercurrentEvent' as const,
      name: ev.name,
      description: trimmed(ev.description),
      strategy: ev.strategy,
    }));
    const variableOfInterestId = endpointIdByName.get(e.endpointName) ?? null;
    if (!variableOfInterestId) {
      ctx.unfilled.push(`${id}.variableOfInterestId: endpoint "${e.endpointName}" was not exported as an Endpoint`);
    }
    const pop = (e.population ?? '').trim();
    const matches = apsIn.map((ap, i) => (ap.definition.trim() === pop || ap.kind === pop ? i : -1)).filter(i => i >= 0);
    const analysisPopulationId = matches.length === 1 ? aps[matches[0]].id : null;
    if (!analysisPopulationId) {
      ctx.unfilled.push(
        `${id}.analysisPopulationId: population "${e.population}" matches no single analysis population's definition or kind verbatim`,
      );
    }
    return {
      id,
      instanceType: 'Estimand' as const,
      name: id,
      treatment: trimmed(e.treatmentCondition),
      population: e.population,
      analysisPopulationId,
      variableOfInterest: e.variable,
      variableOfInterestId,
      intercurrentEvents,
      summaryMeasure: e.summaryMeasure,
    };
  });
  ctx.unfilled.push(
    out.length > 0
      ? 'Estimand treatment reference: the design records the treatment condition as free text, not as a StudyIntervention; not resolved'
      : 'Estimand: the design records no estimands',
  );
  return out;
}

// ─── Unmapped-field sweep ───────────────────────────────────────────────────

const NO_HOME = 'no USDM home in this mapping';

const TOP_LEVEL_MAPPED = [
  'title', 'phase', 'indication', 'objectives', 'estimands', 'endpoints', 'framework', 'population',
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

/** One node (or list of nodes) of the design: which keys the mapping carries, and why the rest have no home. */
interface SweepSpec {
  path: string;
  each: boolean;
  items: readonly unknown[];
  mapped: readonly string[];
  reason: string;
  overrides?: Readonly<Record<string, string>>;
}

/** A recorded value. `false` and `0` are statements and count; empty strings, lists and objects do not. */
function isPopulated(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.some(isPopulated);
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(isPopulated);
  return true;
}

function sweep(spec: SweepSpec, out: string[]): void {
  const counts = new Map<string, number>();
  for (const item of spec.items) {
    if (!item || typeof item !== 'object') continue;
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (spec.mapped.includes(k) || !isPopulated(v)) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  for (const k of [...counts.keys()].sort()) {
    const field = spec.path === '' ? k : `${spec.path}${spec.each ? '[]' : ''}.${k}`;
    const where = spec.each ? `${field} (${counts.get(k)} of ${spec.items.length})` : field;
    out.push(`${where}: ${spec.overrides?.[k] ?? spec.reason}`);
  }
}

function one(v: unknown): unknown[] {
  return v === undefined || v === null ? [] : [v];
}

function designSpecs(d: StudyDesign, versionMapped: boolean, sampleSizeMapped: boolean): SweepSpec[] {
  const arms = d.arms ?? [];
  const estimands = d.estimands ?? [];
  return [
    { path: '', each: false, items: [d], mapped: versionMapped ? [...TOP_LEVEL_MAPPED, 'version'] : TOP_LEVEL_MAPPED, reason: NO_HOME, overrides: TOP_LEVEL_REASONS },
    { path: 'framework', each: false, items: one(d.framework), mapped: ['structuralDesign'], reason: 'no USDM v3 StudyDesign attribute in this mapping (frame, control, margins and adaptive features are rationale/SAP content)' },
    { path: 'population', each: false, items: one(d.population), mapped: ['targetDescription', 'analysisPopulations', 'eligibility'], reason: 'the pediatric age range is free text; USDM plannedAge is a numeric range' },
    { path: 'population.eligibility', each: true, items: d.population?.eligibility ?? [], mapped: ['type', 'text'], reason: 'criterion terminology codes have no home in this mapping' },
    { path: 'population.analysisPopulations', each: true, items: d.population?.analysisPopulations ?? [], mapped: ['kind', 'definition'], reason: 'USDM AnalysisPopulation has no primary-analysis-set flag' },
    { path: 'arms', each: true, items: arms, mapped: ['name', 'interventions'], reason: 'dose-modification rules have no home in this mapping' },
    { path: 'arms[].interventions', each: true, items: arms.flatMap(a => a.interventions ?? []), mapped: ['name', 'role', 'dose', 'regimen', 'route', 'duration'], reason: NO_HOME },
    { path: 'objectives', each: true, items: d.objectives ?? [], mapped: ['level', 'order', 'text', 'endpointName'], reason: 'USDM links an estimand to its endpoint, not to an objective' },
    { path: 'endpoints', each: true, items: d.endpoints ?? [], mapped: ['name', 'role', 'definition'], reason: 'no USDM v3 Endpoint attribute in this mapping' },
    { path: 'estimands', each: true, items: estimands, mapped: ['endpointName', 'population', 'variable', 'summaryMeasure', 'intercurrentEvents', 'treatmentCondition'], reason: 'USDM records the strategy per intercurrent event, not per estimand' },
    { path: 'estimands[].intercurrentEvents', each: true, items: estimands.flatMap(e => e.intercurrentEvents ?? []), mapped: ['name', 'description', 'strategy'], reason: 'USDM IntercurrentEvent has no justification attribute' },
    { path: 'randomization', each: false, items: one(d.randomization), mapped: ['blinding'], reason: 'USDM v3 has no randomisation entity in this mapping' },
    { path: 'statisticalPlan', each: false, items: one(d.statisticalPlan), mapped: sampleSizeMapped ? ['plannedSampleSize'] : [], reason: 'USDM v3 carries no statistical-analysis-plan content' },
    { path: 'safety', each: false, items: one(d.safety), mapped: [], reason: 'USDM v3 carries no safety-monitoring design in this mapping' },
    { path: 'regulatoryStrategy', each: false, items: one(d.regulatoryStrategy), mapped: [], reason: 'regulatory-strategy attribute; no USDM home' },
  ];
}

function scheduleSpecs(soa: StudyDesign['scheduleOfActivities'], timed: boolean): SweepSpec[] {
  if (!soa) return [];
  const timingKeys = timed ? ['studyDay', 'windowDays', 'isBaseline'] : [];
  return [
    { path: 'scheduleOfActivities', each: false, items: [soa], mapped: ['epochs', 'visits', 'activities', 'cells'], reason: 'SoA footnotes have no home in this mapping (no USDM Condition or note is emitted)', overrides: { id: 'internal schedule id; the timeline takes a positional id' } },
    { path: 'scheduleOfActivities.epochs', each: true, items: soa.epochs ?? [], mapped: ['id', 'name', 'kind', 'order'], reason: NO_HOME },
    { path: 'scheduleOfActivities.visits', each: true, items: soa.visits ?? [], mapped: ['id', 'name', 'epochId', 'order', ...timingKeys], reason: 'no Timing could be built (see unfilledUsdmEntities)', overrides: { unscheduled: 'USDM v3 Encounter has no unscheduled flag; the encounter is exported with no Timing' } },
    { path: 'scheduleOfActivities.activities', each: true, items: soa.activities ?? [], mapped: ['id', 'name', 'order'], reason: 'USDM v3 Activity has no attribute for it in this mapping', overrides: { location: 'USDM carries setting and contact mode on the Encounter, not the Activity; not mapped' } },
    { path: 'scheduleOfActivities.cells', each: true, items: soa.cells ?? [], mapped: ['activityId', 'visitId', 'state'], reason: 'cell footnotes have no home in this mapping' },
  ];
}

/** List every populated design field this mapping does not carry, node by node. */
function sweepUnmapped(d: StudyDesign, flags: { timed: boolean; versionMapped: boolean; sampleSizeMapped: boolean }, out: string[]): void {
  for (const spec of [...designSpecs(d, flags.versionMapped, flags.sampleSizeMapped), ...scheduleSpecs(d.scheduleOfActivities, flags.timed)]) {
    sweep(spec, out);
  }
}
