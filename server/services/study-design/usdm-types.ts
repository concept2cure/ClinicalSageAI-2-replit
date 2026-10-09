/**
 * USDM entity types — the object graph `usdm-projection.ts` emits, aligned to
 * ONE released version of the CDISC Unified Study Definitions Model: USDM
 * v4.0.0 (CDISC DDF Reference Architecture, release tag v4.0.0).
 *
 * The CDISC USDM, developed with TransCelerate's Digital Data Flow initiative,
 * is the digital-protocol interchange model the industry is converging on
 * (study-definition repositories, CTMS/EDC build, regulator pilots). The v4.0.0
 * JSON schema is NOT vendored in this repository. Instead
 * {@link USDM_V4_REFERENCE} transcribes, for every class this export emits,
 * the required and optional attribute names of that release's API schema
 * (`Deliverables/API/USDM_API.json`, the `<Class>-Output` schemas, DDF-RA
 * commit aa303cb). The test suite pins every emitted object to it: the class
 * exists, every required attribute is present, and no attribute outside the
 * class appears. Attribute value types and codelists are NOT checked.
 *
 * The file also holds the construction primitives (positional ids, internal
 * codes, a unique-key index, the per-attribute gap ledger and the unmapped
 * field sweep) that `usdm-projection.ts` and `usdm-schedule.ts` share.
 *
 * Conventions that hold for every entity below:
 *   - `id` is deterministic and positional (`StudyArm_1`, `Code_12`) — never
 *     random, never time-based.
 *   - `instanceType` names the USDM v4.0.0 class the object stands for.
 *   - Every REQUIRED attribute is present. One the design does not carry is
 *     `null` or an empty list, never a guessed value, and `projectUsdm` names
 *     it in `unfilledUsdmEntities` under `Class.attribute` or
 *     `<id>.attribute`. So the graph is NOT schema-valid where the design is
 *     incomplete, and it says exactly where. An optional attribute is either
 *     omitted or, when emitted as null, named the same way. No `undefined`
 *     appears anywhere, so the graph survives a JSON round-trip unchanged.
 *   - Coded values use {@link C2C_CODE_SYSTEM} with the design's own value as
 *     the code; `codeSystemVersion` is null (the internal system is
 *     unversioned). No NCI Thesaurus C-code is claimed.
 *   - Estimand text that v4.0.0 carries only as a reference (treatment
 *     condition, population, variable) rides verbatim in the Estimand's
 *     `extensionAttributes` — USDM's own extension mechanism — under
 *     {@link C2C_EXTENSION_URN}; it is not a CDISC attribute.
 *
 * @module server/services/study-design/usdm-types
 */

/** The single USDM release this export is aligned to. */
export const USDM_VERSION = '4.0.0';

/** The only code system this export uses. The code is the design's own value; no NCI Thesaurus C-code is claimed. */
export const C2C_CODE_SYSTEM = 'C2C-INTERNAL';

/** Namespace of the ExtensionAttribute urls this export mints. Not a CDISC namespace. */
export const C2C_EXTENSION_URN = 'urn:c2c:usdm-extension:';

/**
 * USDM v4.0.0 attribute names per emitted class, `[required, optional]`, each
 * space-separated — transcribed from DDF-RA v4.0.0 `USDM_API.json`
 * (`<Class>-Output`: `required` and `properties`). The reference the tests
 * pin the graph to; nothing else in the schema is represented here.
 */
export const USDM_V4_REFERENCE: Readonly<Record<string, readonly [string, string]>> = {
  Activity: ['id name instanceType', 'extensionAttributes label description previousId nextId childIds definedProcedures biomedicalConceptIds bcCategoryIds bcSurrogateIds timelineId notes'],
  Administration: ['id name duration instanceType', 'extensionAttributes label description dose route frequency administrableProductId medicalDeviceId notes'],
  AliasCode: ['id standardCode instanceType', 'extensionAttributes standardCodeAliases'],
  AnalysisPopulation: ['id name text instanceType', 'extensionAttributes label description subsetOfIds notes'],
  Code: ['id code codeSystem codeSystemVersion decode instanceType', 'extensionAttributes'],
  EligibilityCriterion: ['id name category identifier criterionItemId instanceType', 'extensionAttributes label description nextId previousId notes'],
  EligibilityCriterionItem: ['id name text instanceType', 'extensionAttributes label description dictionaryId notes'],
  Encounter: ['id name type instanceType', 'extensionAttributes label description previousId nextId scheduledAtId environmentalSettings contactModes transitionStartRule transitionEndRule notes'],
  Endpoint: ['id name text purpose level instanceType', 'extensionAttributes label description dictionaryId notes'],
  Estimand: ['id name populationSummary analysisPopulationId interventionIds variableOfInterestId intercurrentEvents instanceType', 'extensionAttributes label description notes'],
  ExtensionAttribute: ['id url instanceType', 'valueString valueBoolean valueInteger valueId valueQuantity valueRange valueCode valueAliasCode valueExtensionClass extensionAttributes'],
  Indication: ['id name isRareDisease instanceType', 'extensionAttributes label description codes notes'],
  IntercurrentEvent: ['id name text strategy instanceType', 'extensionAttributes label description dictionaryId notes'],
  InterventionalStudyDesign: ['id name arms studyCells rationale epochs population eligibilityCriteria model instanceType', 'extensionAttributes label description studyType studyPhase therapeuticAreas characteristics encounters activities elements estimands indications studyInterventionIds objectives scheduleTimelines biospecimenRetentions documentVersionIds analysisPopulations notes subTypes intentTypes blindingSchema'],
  Objective: ['id name text level instanceType', 'extensionAttributes label description dictionaryId notes endpoints'],
  Quantity: ['id value instanceType', 'extensionAttributes unit'],
  ScheduleTimeline: ['id name mainTimeline entryCondition entryId instanceType', 'extensionAttributes label description exits timings instances plannedDuration'],
  ScheduledActivityInstance: ['id name instanceType', 'extensionAttributes label description defaultConditionId epochId timelineId timelineExitId activityIds encounterId'],
  Study: ['name instanceType', 'id extensionAttributes description label versions documentedBy'],
  StudyArm: ['id name type dataOriginDescription dataOriginType instanceType', 'extensionAttributes label description populationIds notes'],
  StudyCell: ['id armId epochId elementIds instanceType', 'extensionAttributes'],
  StudyDesignPopulation: ['id name includesHealthySubjects instanceType', 'extensionAttributes label description plannedEnrollmentNumber plannedCompletionNumber plannedSex criterionIds plannedAge notes cohorts'],
  StudyElement: ['id name instanceType', 'extensionAttributes label description transitionStartRule transitionEndRule studyInterventionIds notes'],
  StudyEpoch: ['id name type instanceType', 'extensionAttributes label description previousId nextId notes'],
  StudyIntervention: ['id name role type instanceType', 'extensionAttributes label description minimumResponseDuration codes administrations notes'],
  StudyTitle: ['id text type instanceType', 'extensionAttributes'],
  StudyVersion: ['id versionIdentifier rationale studyIdentifiers titles instanceType', 'extensionAttributes documentVersionIds dateValues amendments businessTherapeuticAreas referenceIdentifiers studyDesigns eligibilityCriterionItems narrativeContentItems abbreviations roles organizations studyInterventions administrableProducts medicalDevices productOrganizationRoles biomedicalConcepts bcCategories bcSurrogates dictionaries conditions notes'],
  Timing: ['id name type value valueLabel relativeToFrom relativeFromScheduledInstanceId instanceType', 'extensionAttributes label description relativeToScheduledInstanceId windowLower windowUpper windowLabel'],
};

/** A coded value (USDM `Code`). */
export interface UsdmCode {
  id: string;
  instanceType: 'Code';
  code: string;
  codeSystem: typeof C2C_CODE_SYSTEM;
  /** Required by USDM; the internal code system is unversioned (reported). */
  codeSystemVersion: null;
  decode: string;
}

/** USDM `AliasCode`: a standard code with no aliases. */
export interface UsdmAliasCode {
  id: string;
  instanceType: 'AliasCode';
  standardCode: UsdmCode;
  standardCodeAliases: [];
}

/** USDM `Quantity`. A participant count carries no unit, so the optional `unit` is omitted. */
export interface UsdmQuantity {
  id: string;
  instanceType: 'Quantity';
  value: number;
}

/** USDM `ExtensionAttribute` carrying recorded text verbatim. */
export interface UsdmExtensionAttribute {
  id: string;
  instanceType: 'ExtensionAttribute';
  url: string;
  valueString: string;
}

// ─── Study / version ────────────────────────────────────────────────────────

export interface UsdmStudyTitle {
  id: string;
  instanceType: 'StudyTitle';
  text: string;
  /** What the design records the title as: official, public or acronym (C2C-INTERNAL). */
  type: UsdmCode;
}

export interface UsdmStudyVersion {
  id: string;
  instanceType: 'StudyVersion';
  /** `String(design.version)`; null when the design records no usable version. */
  versionIdentifier: string | null;
  /** The design records no study rationale. */
  rationale: null;
  titles: UsdmStudyTitle[];
  /** Always empty: the design carries no registry or sponsor identifier. */
  studyIdentifiers: [];
  /** Always empty: the design carries no governance dates. */
  dateValues: [];
  studyDesigns: UsdmStudyDesign[];
  /** v4.0.0 holds interventions on the version; the design references them by id. */
  studyInterventions: UsdmStudyIntervention[];
  /** v4.0.0 holds criterion text on the version; each criterion references its item. */
  eligibilityCriterionItems: UsdmEligibilityCriterionItem[];
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
  name: string | null;
  /** Arm type and data origin are not recorded and are not inferred from intervention roles. */
  type: null;
  dataOriginType: null;
  dataOriginDescription: null;
}

export interface UsdmStudyEpoch {
  id: string;
  instanceType: 'StudyEpoch';
  name: string | null;
  type: UsdmCode | null;
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
  /** USDM requires at least one; empty where no element is determined (reported). */
  elementIds: string[];
}

export interface UsdmActivity {
  id: string;
  instanceType: 'Activity';
  name: string | null;
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
  name: string | null;
  /** Visit / contact type is not recorded. */
  type: null;
  previousId: string | null;
  nextId: string | null;
  /** The Timing that places this encounter; null when none could be built (reported). */
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
  /** Start/end anchoring is not recorded (reported). */
  relativeToFrom: null;
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
  /** The design records no entry condition (reported). */
  entryCondition: null;
  /** The first instance on the timeline (a timeline is emitted only when one exists). */
  entryId: string;
  instances: UsdmScheduledActivityInstance[];
  timings: UsdmTiming[];
}

/** The criterion text, held on the StudyVersion. */
export interface UsdmEligibilityCriterionItem {
  id: string;
  instanceType: 'EligibilityCriterionItem';
  name: string;
  text: string | null;
}

export interface UsdmEligibilityCriterion {
  id: string;
  instanceType: 'EligibilityCriterion';
  name: string;
  /** The design records no criterion number; none is invented. */
  identifier: null;
  category: UsdmCode | null;
  criterionItemId: string;
}

export interface UsdmStudyDesignPopulation {
  id: string;
  instanceType: 'StudyDesignPopulation';
  name: string;
  description: string | null;
  includesHealthySubjects: null;
  /** The design's planned total sample size; null when unrecorded or invalid (reported). */
  plannedEnrollmentNumber: UsdmQuantity | null;
  criterionIds: string[];
}

export interface UsdmEndpoint {
  id: string;
  instanceType: 'Endpoint';
  name: string;
  text: string | null;
  level: UsdmCode | null;
  /** The design records no endpoint purpose. */
  purpose: null;
}

export interface UsdmObjective {
  id: string;
  instanceType: 'Objective';
  name: string;
  text: string | null;
  level: UsdmCode | null;
  endpoints: UsdmEndpoint[];
}

export interface UsdmIntercurrentEvent {
  id: string;
  instanceType: 'IntercurrentEvent';
  name: string | null;
  /** The recorded event name, verbatim: the design records each event as one phrase. */
  text: string | null;
  description: string | null;
  strategy: string | null;
}

/** USDM v4.0.0 `Estimand`: references by id, recorded text in extension attributes. */
export interface UsdmEstimand {
  id: string;
  instanceType: 'Estimand';
  name: string;
  /** The ICH E9(R1) population-level summary measure, as recorded. */
  populationSummary: string | null;
  /** The AnalysisPopulation whose definition (or kind) equals the recorded population verbatim; else null. */
  analysisPopulationId: string | null;
  /** The exported Endpoint named by the estimand; null when it was not exported. */
  variableOfInterestId: string | null;
  intercurrentEvents: UsdmIntercurrentEvent[];
  /** Never resolved: the design records the treatment condition as free text (reported). */
  interventionIds: [];
  extensionAttributes: UsdmExtensionAttribute[];
}

export interface UsdmAdministration {
  id: string;
  instanceType: 'Administration';
  name: string;
  /** Dose, regimen, route and duration exactly as recorded (free text, not parsed). */
  description: string;
  route: UsdmAliasCode | null;
  frequency: UsdmAliasCode | null;
  /** The design records dose and duration as free text; no Quantity/Duration is parsed from it. */
  dose: null;
  duration: null;
}

export interface UsdmStudyIntervention {
  id: string;
  instanceType: 'StudyIntervention';
  name: string | null;
  role: UsdmCode | null;
  /** The design records no per-intervention product type (reported). */
  type: null;
  administrations: UsdmAdministration[];
}

export interface UsdmAnalysisPopulation {
  id: string;
  instanceType: 'AnalysisPopulation';
  name: string | null;
  text: string | null;
}

export interface UsdmIndication {
  id: string;
  instanceType: 'Indication';
  name: string;
  description: string;
  isRareDisease: null;
  /** The indication is free text; no coded disease term is recorded. */
  codes: [];
}

/** USDM v4.0.0 `InterventionalStudyDesign` (the abstract `StudyDesign` cannot be instantiated). */
export interface UsdmStudyDesign {
  id: string;
  instanceType: 'InterventionalStudyDesign';
  name: string;
  rationale: null;
  /** Interventional / observational is not recorded as a value and is not inferred. */
  studyType: null;
  studyPhase: UsdmAliasCode | null;
  /** Intervention model; null unless the structural design IS one (reported otherwise). */
  model: UsdmCode | null;
  blindingSchema: UsdmAliasCode | null;
  arms: UsdmStudyArm[];
  epochs: UsdmStudyEpoch[];
  studyCells: UsdmStudyCell[];
  elements: UsdmStudyElement[];
  activities: UsdmActivity[];
  encounters: UsdmEncounter[];
  scheduleTimelines: UsdmScheduleTimeline[];
  eligibilityCriteria: UsdmEligibilityCriterion[];
  population: UsdmStudyDesignPopulation;
  objectives: UsdmObjective[];
  estimands: UsdmEstimand[];
  studyInterventionIds: string[];
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
  /** Every USDM entity or attribute the design cannot populate, as `Class.attribute: reason`. */
  unfilledUsdmEntities: string[];
  basis: string;
}

// ─── Construction primitives (shared by usdm-projection and usdm-schedule) ──

/** Positional id counters plus the honesty ledgers, threaded through one projection. */
export interface UsdmContext {
  counters: Map<string, number>;
  unmapped: string[];
  unfilled: string[];
  /** `Class.attribute: reason` → the ids that leave it null; flushed by {@link flushGaps}. */
  gaps: Map<string, string[]>;
}

export function newContext(unfilled: readonly string[]): UsdmContext {
  return { counters: new Map(), unmapped: [], unfilled: [...unfilled], gaps: new Map() };
}

/** Next positional id for an entity kind: `StudyArm_1`, `StudyArm_2`, … Never random, never time-based. */
export function nextId(ctx: UsdmContext, kind: string): string {
  const n = (ctx.counters.get(kind) ?? 0) + 1;
  ctx.counters.set(kind, n);
  return `${kind}_${n}`;
}

/** A C2C-INTERNAL code: the design's own value as the code. */
export function usdmCode(ctx: UsdmContext, value: string, decode: string): UsdmCode {
  return { id: nextId(ctx, 'Code'), instanceType: 'Code', code: value, codeSystem: C2C_CODE_SYSTEM, codeSystemVersion: null, decode };
}

export function aliasCode(ctx: UsdmContext, value: string, decode: string): UsdmAliasCode {
  const id = nextId(ctx, 'AliasCode');
  return { id, instanceType: 'AliasCode', standardCode: usdmCode(ctx, value, decode), standardCodeAliases: [] };
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

/** Look up an own key of a plain table; never an Object.prototype member. */
export function own<V>(table: Readonly<Record<string, V>>, key: unknown): V | undefined {
  return typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined;
}

/**
 * Record that entity `id` leaves `field` (`Class.attribute`) null. Gaps are
 * flushed as ONE ledger line per field and reason, listing the ids.
 */
export function gap(ctx: UsdmContext, field: string, id: string, reason = 'not recorded by the design'): void {
  const key = `${field}: ${reason}`;
  const ids = ctx.gaps.get(key);
  if (ids) ids.push(id);
  else ctx.gaps.set(key, [id]);
}

export function flushGaps(ctx: UsdmContext): void {
  for (const [key, ids] of ctx.gaps) ctx.unfilled.push(`${key} (${ids.join(', ')})`);
  ctx.gaps.clear();
}

/** The recorded text, trimmed; null — and a gap — when absent. */
export function textOr(ctx: UsdmContext, field: string, id: string, value: unknown): string | null {
  const t = trimmed(value);
  if (t === null) gap(ctx, field, id);
  return t;
}

/** A code for the recorded value; null — and a gap — when absent, never a code for `undefined`. */
export function codeOr(ctx: UsdmContext, field: string, id: string, value: unknown, decode: (v: string) => string = humanize): UsdmCode | null {
  const t = trimmed(value);
  if (t === null) {
    gap(ctx, field, id);
    return null;
  }
  return usdmCode(ctx, t, decode(t));
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

// ─── Unmapped-field sweep ───────────────────────────────────────────────────

/** The default reason for a populated design field this mapping carries nowhere. */
export const NO_HOME = 'no USDM home in this mapping';

/** One node (or list of nodes) of the design: which keys the mapping carries, and why the rest have no home. */
export interface SweepSpec {
  path: string;
  each: boolean;
  items: readonly unknown[];
  mapped: readonly string[];
  reason: string;
  overrides?: Readonly<Record<string, string>>;
}

/** A recorded value. `false` and `0` are statements and count; empty strings, lists and objects do not. */
export function isPopulated(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.some(isPopulated);
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(isPopulated);
  return true;
}

/** Append `path: reason` for every populated key of the spec's items that the mapping does not carry. */
export function sweep(spec: SweepSpec, out: string[]): void {
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
    out.push(`${where}: ${(spec.overrides && own(spec.overrides, k)) ?? spec.reason}`);
  }
}

/** A single optional node as a list of zero or one item. */
export function one(v: unknown): unknown[] {
  return v === undefined || v === null ? [] : [v];
}
