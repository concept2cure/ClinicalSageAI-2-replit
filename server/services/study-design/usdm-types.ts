/**
 * USDM-shaped entity types — the object graph `usdm-projection.ts` emits.
 *
 * The CDISC Unified Study Definitions Model (USDM), developed with
 * TransCelerate's Digital Data Flow initiative, is the digital-protocol
 * interchange model the industry is converging on (study-definition
 * repositories, CTMS/EDC build, FDA pilots). These interfaces name the USDM v3
 * entities and attributes AS UNDERSTOOD BY THE AUTHOR of this module. The CDISC
 * USDM JSON schema is not vendored in this repository, so nothing here has been
 * checked against it: a consumer must validate before relying on the shape.
 *
 * The file also holds the few construction primitives (positional ids, the
 * internal code constructor, a unique-key index) that `usdm-projection.ts` and
 * `usdm-schedule.ts` share, so neither imports the other's internals.
 *
 * Conventions that hold for every entity below:
 *   - `id` is deterministic and positional (`StudyArm_1`, `Encounter_3`) —
 *     never random, never time-based.
 *   - `instanceType` names the USDM class the object stands for.
 *   - An attribute the design does not carry is `null` (or an empty list),
 *     never a guessed value; `projectUsdm` names every such gap in
 *     `unfilledUsdmEntities`. No `undefined` appears anywhere, so the graph
 *     survives a JSON round-trip unchanged.
 *   - Coded values use {@link C2C_CODE_SYSTEM} with the design's own value as
 *     the code. No NCI Thesaurus C-code is claimed.
 *
 * @module server/services/study-design/usdm-types
 */

/** The only code system this export uses. The code is the design's own value; no NCI Thesaurus C-code is claimed. */
export const C2C_CODE_SYSTEM = 'C2C-INTERNAL';

/** A coded value (USDM `Code`). */
export interface UsdmCode {
  instanceType: 'Code';
  code: string;
  codeSystem: typeof C2C_CODE_SYSTEM;
  decode: string;
}

/** USDM `Quantity`. The unit is not recorded by the design and is left null. */
export interface UsdmQuantity {
  instanceType: 'Quantity';
  value: number;
  unit: null;
}

// ─── Study / version ────────────────────────────────────────────────────────

export interface UsdmStudyTitle {
  id: string;
  instanceType: 'StudyTitle';
  text: string;
  /** Official / brief / acronym: the design does not record which, so null. */
  type: null;
}

export interface UsdmStudyVersion {
  id: string;
  instanceType: 'StudyVersion';
  /** `String(design.version)`; null when the design records no version. */
  versionIdentifier: string | null;
  titles: UsdmStudyTitle[];
  /** Null only when the design carries no phase (reported). */
  studyPhase: UsdmCode | null;
  /** Always empty: the design carries no registry or sponsor identifier. */
  studyIdentifiers: [];
  /** Always empty: the design carries no governance dates. */
  dateValues: [];
  studyDesigns: UsdmStudyDesign[];
}

export interface UsdmStudy {
  id: string;
  instanceType: 'Study';
  /** The design's title; null when it records none. */
  name: string | null;
  versions: UsdmStudyVersion[];
}

// ─── Study design ───────────────────────────────────────────────────────────

export interface UsdmStudyArm {
  id: string;
  instanceType: 'StudyArm';
  name: string;
  /** Arm type is not recorded and is not inferred from intervention roles. */
  type: null;
  dataOriginType: null;
}

export interface UsdmStudyEpoch {
  id: string;
  instanceType: 'StudyEpoch';
  name: string;
  type: UsdmCode;
  previousId: string | null;
  nextId: string | null;
}

export interface UsdmStudyElement {
  id: string;
  instanceType: 'StudyElement';
  name: string;
  studyInterventionIds: string[];
  transitionStartRule: null;
  transitionEndRule: null;
}

/** One arm × epoch cell of the design grid. */
export interface UsdmStudyCell {
  id: string;
  instanceType: 'StudyCell';
  armId: string;
  epochId: string;
  elementIds: string[];
}

export interface UsdmActivity {
  id: string;
  instanceType: 'Activity';
  name: string;
  previousId: string | null;
  nextId: string | null;
  childIds: string[];
  /** The design records no procedures or biomedical concepts. */
  definedProcedures: [];
  biomedicalConceptIds: [];
}

export interface UsdmEncounter {
  id: string;
  instanceType: 'Encounter';
  name: string;
  /** Visit / contact type is not recorded. */
  type: null;
  previousId: string | null;
  nextId: string | null;
  /** The Timing that places this encounter; null when the visit has no usable study day. */
  scheduledAtId: string | null;
}

/** The activities scheduled at one encounter — one SoA column. */
export interface UsdmScheduledActivityInstance {
  id: string;
  instanceType: 'ScheduledActivityInstance';
  name: string;
  encounterId: string;
  /** Null when the visit names an epoch the schedule does not define (reported). */
  epochId: string | null;
  activityIds: string[];
}

export type UsdmTimingType = 'fixed_reference' | 'before' | 'after';

export interface UsdmTiming {
  id: string;
  instanceType: 'Timing';
  name: string;
  type: UsdmCode;
  /** ISO 8601 duration from the anchor instance, e.g. `P83D`. */
  value: string;
  /** The design's own study day, e.g. `Day 84`. */
  valueLabel: string;
  relativeFromScheduledInstanceId: string;
  relativeToScheduledInstanceId: string;
  windowLower: string | null;
  windowUpper: string | null;
  windowLabel: string | null;
}

export interface UsdmScheduleTimeline {
  id: string;
  instanceType: 'ScheduleTimeline';
  name: string;
  mainTimeline: true;
  /** The first instance on the timeline; null when there is none. */
  entryId: string | null;
  instances: UsdmScheduledActivityInstance[];
  timings: UsdmTiming[];
}

export interface UsdmEligibilityCriterion {
  id: string;
  instanceType: 'EligibilityCriterion';
  name: string;
  text: string;
  category: UsdmCode;
}

export interface UsdmStudyDesignPopulation {
  id: string;
  instanceType: 'StudyDesignPopulation';
  name: string;
  description: string | null;
  includesHealthySubjects: null;
  /** The design's planned total sample size; null when unrecorded. */
  plannedEnrollmentNumber: UsdmQuantity | null;
  criteria: UsdmEligibilityCriterion[];
}

export interface UsdmEndpoint {
  id: string;
  instanceType: 'Endpoint';
  name: string;
  text: string;
  level: UsdmCode;
  /** The design records no endpoint purpose. */
  purpose: null;
}

export interface UsdmObjective {
  id: string;
  instanceType: 'Objective';
  name: string;
  text: string;
  level: UsdmCode;
  endpoints: UsdmEndpoint[];
}

export interface UsdmIntercurrentEvent {
  id: string;
  instanceType: 'IntercurrentEvent';
  name: string;
  description: string | null;
  strategy: string;
}

/**
 * USDM `Estimand`. USDM links an estimand to other entities by id; the design
 * records the treatment, population and variable as text, so each text is
 * carried verbatim and the reference is filled only where it resolves exactly.
 */
export interface UsdmEstimand {
  id: string;
  instanceType: 'Estimand';
  name: string;
  /** Treatment condition as recorded; null when unrecorded. Never resolved to a StudyIntervention. */
  treatment: string | null;
  population: string;
  /** AnalysisPopulation whose definition (or kind) equals `population` verbatim; else null. */
  analysisPopulationId: string | null;
  variableOfInterest: string;
  /** The exported Endpoint named by the estimand; null when it was not exported. */
  variableOfInterestId: string | null;
  intercurrentEvents: UsdmIntercurrentEvent[];
  summaryMeasure: string;
}

export interface UsdmAdministration {
  id: string;
  instanceType: 'Administration';
  name: string;
  /** Dose, regimen, route and duration exactly as recorded (free text, not parsed). */
  description: string;
  route: UsdmCode | null;
  frequency: UsdmCode | null;
  /** The design records dose and duration as free text; no Quantity/Duration is parsed from it. */
  dose: null;
  duration: null;
}

export interface UsdmStudyIntervention {
  id: string;
  instanceType: 'StudyIntervention';
  name: string;
  role: UsdmCode;
  administrations: UsdmAdministration[];
}

export interface UsdmAnalysisPopulation {
  id: string;
  instanceType: 'AnalysisPopulation';
  name: string;
  text: string;
}

export interface UsdmIndication {
  id: string;
  instanceType: 'Indication';
  name: string;
  description: string;
  /** The indication is free text; no coded disease term is recorded. */
  codes: [];
}

export interface UsdmStudyDesign {
  id: string;
  instanceType: 'StudyDesign';
  name: string;
  /** Interventional / observational is not recorded and not inferred. */
  studyType: null;
  interventionModel: UsdmCode | null;
  blindingSchema: UsdmCode | null;
  arms: UsdmStudyArm[];
  epochs: UsdmStudyEpoch[];
  studyCells: UsdmStudyCell[];
  elements: UsdmStudyElement[];
  activities: UsdmActivity[];
  encounters: UsdmEncounter[];
  scheduleTimelines: UsdmScheduleTimeline[];
  population: UsdmStudyDesignPopulation;
  objectives: UsdmObjective[];
  estimands: UsdmEstimand[];
  studyInterventions: UsdmStudyIntervention[];
  analysisPopulations: UsdmAnalysisPopulation[];
  indications: UsdmIndication[];
}

// ─── Projection envelope ────────────────────────────────────────────────────

export interface UsdmConformance {
  /** Always `unverified`: the schema is not vendored, so no validation ran. */
  status: 'unverified';
  reason: string;
  standard: string;
}

export interface UsdmProjection {
  conformance: UsdmConformance;
  study: UsdmStudy;
  /** Every populated design field with no home in this mapping, as `path: reason`. */
  unmappedDesignFields: string[];
  /** Every USDM entity or attribute the design cannot populate, as `Entity: reason`. */
  unfilledUsdmEntities: string[];
  basis: string;
}

// ─── Construction primitives (shared by usdm-projection and usdm-schedule) ──

/** Positional id counters plus the two honesty ledgers, threaded through one projection. */
export interface UsdmContext {
  counters: Map<string, number>;
  unmapped: string[];
  unfilled: string[];
}

/** Next positional id for an entity kind: `StudyArm_1`, `StudyArm_2`, … Never random, never time-based. */
export function nextId(ctx: UsdmContext, kind: string): string {
  const n = (ctx.counters.get(kind) ?? 0) + 1;
  ctx.counters.set(kind, n);
  return `${kind}_${n}`;
}

/** A C2C-INTERNAL code: the design's own value as the code. */
export function usdmCode(value: string, decode: string): UsdmCode {
  return { instanceType: 'Code', code: value, codeSystem: C2C_CODE_SYSTEM, decode };
}

/** `key_secondary` → `Key secondary`. */
export function humanize(value: string): string {
  const s = value.replace(/_/g, ' ');
  return s.length === 0 ? s : `${s[0].toUpperCase()}${s.slice(1)}`;
}

export function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

export function trimmed(s: unknown): string | null {
  return present(s) ? s.trim() : null;
}

/**
 * Index items by a key that must be unique. `get` returns the position only
 * when the key occurs exactly once; a duplicated key is ambiguous and resolves
 * to nothing, so a reference to it is reported rather than guessed.
 */
export function uniqueIndex<T>(
  items: readonly T[],
  key: (t: T) => string,
): { get(k: string): number | undefined; ambiguous(k: string): boolean } {
  const pos = new Map<string, number>();
  items.forEach((item, i) => {
    const k = key(item);
    pos.set(k, pos.has(k) ? -1 : i);
  });
  return {
    get: k => {
      const p = pos.get(k);
      return p === undefined || p < 0 ? undefined : p;
    },
    ambiguous: k => pos.get(k) === -1,
  };
}
