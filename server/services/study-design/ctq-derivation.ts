/**
 * Critical-to-quality (CtQ) factor derivation — ICH E6(R3) / ICH E8(R1) quality
 * by design, read off the structured study design.
 *
 * ## The industry need
 * ICH E6(R3) §3.10 expects a sponsor to identify the factors critical to the
 * quality of a trial and to focus risk-based quality management on them; ICH
 * E8(R1) asks that they be identified AT DESIGN (quality by design).
 * TransCelerate's Risk Assessment and Categorization Tool (RACT) starts from that
 * list. The platform's RBM module (`server/services/rbm/rbm-engine.ts`) carries a
 * GENERIC starting catalogue, `DEFAULT_CTQ_FACTORS`, typed {@link CtqSeed};
 * nothing derives the study-SPECIFIC factors — the ones named for THIS primary
 * endpoint, THIS eligibility threshold, THIS PK sample, THIS blinding scheme —
 * from the design. This module is that derivation. It emits the RBM module's own
 * `CtqSeed` vocabulary so its output drops into the RACT as seed rows.
 *
 * ## One rating source per row (zero duplication)
 * Where a derived row restates a catalogue row, it takes that row's category,
 * likelihood, impact and criticality BY REFERENCE from `DEFAULT_CTQ_FACTORS`
 * ({@link CTQ_CATALOGUE_ROWS}), so the generic and the study-specific rows can
 * never disagree. Every other row takes its likelihood and impact from
 * {@link CTQ_DEFAULT_RATINGS}, whose basis is documented at the constant. Each
 * row names its source in `ratingFrom`. If the catalogue loses a referenced row
 * the module refuses to load — a code defect, not an input.
 *
 * ## The rules (each deterministic; each documented at its function)
 *  | Trigger on the design                                    | Rating from                       | Category / critical        |
 *  |----------------------------------------------------------|-----------------------------------|----------------------------|
 *  | endpoint with role `primary`                             | catalogue: primary endpoint       | as the catalogue row       |
 *  | endpoint with role `key_secondary`                       | table                             | efficacy / no              |
 *  | eligibility criterion with a numeric threshold/age bound | catalogue: eligibility            | as the catalogue row       |
 *  | SoA activity `pk`, `biomarker`, or `pd` with a specimen  | table                             | data_integrity / no        |
 *  | SoA activity `drug_administration`                       | catalogue: IP accountability      | as the catalogue row       |
 *  | arm with `doseModificationRules`                         | table                             | safety / no                |
 *  | `randomization.blinding` single/double/triple (two rows) | table                             | data_integrity + compliance / yes |
 *  | `safety.stoppingRules`                                   | table                             | safety / yes               |
 *  | `safety.dmcCharter.present === true`                     | table                             | safety / no                |
 *  | `statisticalPlan.interim`                                | table                             | data_integrity / no        |
 *  | `safety.dltDefinition`                                   | table                             | safety / yes               |
 *
 * "Numeric threshold" is decided by the repository's one eligibility grammar
 * (`structureEligibility` in `./eligibility-model`): a criterion it reads as a
 * `threshold` or an `age` fires; free text, date, yes/no and enumerated criteria
 * do not, and are counted in `notAssessed` so they are rated by hand.
 *
 * Likelihood and impact are 1..5, scored likelihood × impact by the platform's
 * RBM scoring (`scoreRisk` in rbm-engine). Neither ICH E6(R3) nor the RACT
 * prescribes numeric values. Risk evaluation under ICH E6(R3) and the RACT also
 * weighs detectability, which `CtqSeed` does not carry: it is rated in the RACT.
 *
 * ## The honesty contract
 *  - Pure and total: no model call, no randomness, no clock, no database, no throw
 *    on a partial design — including a runtime-partial one read from unvalidated
 *    JSON (missing nodes, non-list lists, null entries). Same input →
 *    byte-identical output; the input is not mutated; the exported tables are
 *    frozen.
 *  - A factor is emitted ONLY for a trigger the design actually contains. Nothing
 *    is inferred from phase, indication or product type; an absent, blank or
 *    unrecognised value is an absent trigger, never a presumed one — and is noted.
 *  - Every factor carries `ratingSource: 'default_seed'` and `ratingFrom`, so
 *    nobody reads a derived rating as an assessed one. Mitigation text is a
 *    rule-keyed starting control for the sponsor to refine, not an assessed one.
 *  - Every factor names its provenance in `derivedFrom`: the endpoint or arm NAME,
 *    the activity name AND id, the criterion TEXT verbatim, or the design field
 *    path of a structural trigger. A trigger with no name is noted, not emitted.
 *  - `notAssessed` lists every design area the engine could not read, so an empty
 *    factor list is never mistaken for a risk-free design. A recorded negative
 *    (`dmcCharter.present: false`, an open-label design, a placebo-only arm) is
 *    assessed and yields no row and no note.
 *
 * @module server/services/study-design/ctq-derivation
 */

import { DEFAULT_CTQ_FACTORS, type CtqSeed } from '../rbm/rbm-engine';
import { structureEligibility, type StructuredEligibilityCriterion } from './eligibility-model';
import { present } from './usdm-types';
import {
  ESTIMAND_REQUIRED_ROLES,
  type Arm,
  type EligibilityCriterion,
  type Endpoint,
  type Randomization,
  type SafetyDesign,
  type SoaActivity,
  type StatisticalPlan,
  type StudyDesign,
} from './study-design-types';

export const CTQ_BASIS =
  'ICH E6(R3) §3.10 — identification of critical-to-quality factors at design; ICH E8(R1) — quality by design and critical-to-quality factors; TransCelerate RACT';

// ─── Public shapes ───────────────────────────────────────────────────────────

export type CtqCategory = CtqSeed['category'];

/** The categories a table-rated derived row can carry (no rule emits `operational`). */
export type CtqTableCategory = Exclude<CtqCategory, 'operational'>;

/** Which design node a factor was read from. */
export type CtqDerivedFromKind =
  | 'endpoint'
  | 'eligibility'
  | 'activity'
  | 'intervention'
  | 'randomization'
  | 'safety'
  | 'statistical_plan';

/**
 * Provenance of a derived factor. `ref` is the endpoint / activity / arm name, the
 * criterion text verbatim, or the field path of a structural trigger; `id` is the
 * SoA activity id, carried so two same-named activities stay distinguishable.
 */
export interface CtqDerivedFrom {
  kind: CtqDerivedFromKind;
  ref: string;
  id?: string;
}

/** Where a factor's rating came from: a named RBM catalogue row, or the category table. */
export type CtqRatingFrom =
  | { table: 'DEFAULT_CTQ_FACTORS'; ctqFactor: string }
  | { table: 'CTQ_DEFAULT_RATINGS'; category: CtqTableCategory };

/** A RACT seed row with its provenance and an explicit statement that its rating is a default. */
export interface DerivedCtqFactor extends CtqSeed {
  derivedFrom: CtqDerivedFrom;
  /** Always `'default_seed'`: the likelihood and impact are a starting value, not an assessment. */
  ratingSource: 'default_seed';
  ratingFrom: CtqRatingFrom;
}

export interface CtqDerivation {
  factors: DerivedCtqFactor[];
  /** Design areas the engine could not read, each with the consequence. */
  notAssessed: string[];
  basis: string;
}

export type CtqRating = Readonly<{ likelihood: number; impact: number }>;

/**
 * The starting rating for derived rows that restate NO catalogue row. These are
 * platform starting values, not regulatory ones, chosen against the catalogue:
 *  - safety 3×5 — equal to every safety row of `DEFAULT_CTQ_FACTORS`;
 *  - data_integrity 3×4 — equal to the catalogue's eligibility-verification row;
 *  - efficacy 3×4 — applied only to KEY-SECONDARY endpoints: one impact step below
 *    the catalogue's primary-endpoint row, since the primary conclusion does not
 *    rest on them;
 *  - compliance 2×4 — applied only to emergency unblinding: a rarely exercised
 *    procedure whose failure harms a subject.
 */
export const CTQ_DEFAULT_RATINGS: Readonly<Record<CtqTableCategory, CtqRating>> = Object.freeze({
  safety: Object.freeze({ likelihood: 3, impact: 5 }),
  efficacy: Object.freeze({ likelihood: 3, impact: 4 }),
  data_integrity: Object.freeze({ likelihood: 3, impact: 4 }),
  compliance: Object.freeze({ likelihood: 2, impact: 4 }),
});

/** The `DEFAULT_CTQ_FACTORS` rows (by title) whose rating a derived row takes by reference. */
export const CTQ_CATALOGUE_ROWS = Object.freeze({
  primaryEndpoint: 'Primary endpoint data collection',
  eligibility: 'Eligibility / inclusion-exclusion verification',
  investigationalProduct: 'Investigational product accountability and compliance',
} as const);

/** The `notAssessed` entries, keyed by area, so callers and tests can match them exactly. */
export const CTQ_NOT_ASSESSED = Object.freeze({
  endpoints: 'endpoints: the design carries no endpoints; no efficacy factor derived',
  confirmatoryEndpoints: 'endpoints: no primary or key-secondary endpoint recorded; no efficacy factor derived',
  eligibility: 'eligibility: the design carries no eligibility criteria; no eligibility-verification factor derived',
  scheduleOfActivities:
    'schedule of activities: the design carries no Schedule of Activities, or it lists no activities; no sampling or IMP-administration factor derived',
  arms: 'arms: the design carries no arms; no dose-modification factor derived',
  randomization: 'randomization: the design carries no randomization node; no blinding factor derived',
  blinding: 'randomization.blinding: not recorded as open, single, double or triple; no blinding factor derived',
  safety: 'safety: the design carries no safety design; no stopping-rule, DMC or DLT factor derived',
  stoppingRules: 'safety.stoppingRules: not recorded; no stopping-rule factor derived',
  dmcCharter: 'safety.dmcCharter: not recorded with present true or false; no DMC factor derived',
  dltDefinition: 'safety.dltDefinition: not recorded; no DLT factor derived',
  interim: 'statisticalPlan.interim: not recorded; no interim data-cut factor derived',
} as const);

/** Criteria the grammar does not read as a numeric threshold or age bound: rated by hand. */
export function unparsedEligibilityNote(count: number, total: number): string {
  return `eligibility: ${count} of ${total} criteria carry no numeric threshold or age bound in the eligibility grammar (free text, or a date, yes/no or enumerated criterion); no verification factor derived for them — rate manually`;
}

/** Numeric criteria whose inclusion/exclusion type is not recorded, so the direction of the risk is unknown. */
export function untypedEligibilityNote(count: number): string {
  return `eligibility: ${count} numeric criteria carry no inclusion/exclusion type, so the direction of the risk is unknown; no verification factor derived for them — rate manually`;
}

/** Arms that are not placebo-only and record no dose-modification rules. */
export function doseModificationNote(armNames: string[]): string {
  return `arms: no dose-modification rules recorded for arm(s) ${armNames.map((n) => `"${n}"`).join(', ')}; no dose-modification factor derived for them`;
}

/** `pd` activities that record no specimen: whether they collect a sample is not recorded. */
export function pdWithoutSpecimenNote(count: number): string {
  return `schedule of activities: ${count} pharmacodynamic (pd) activities record no specimen, so whether a sample is collected is not recorded; no sample-handling factor derived for them — rate manually`;
}

/** Elements a rule reads that carry no name: a factor with no provenance is not emitted. */
export function unnamedTriggerNote(area: 'endpoints' | 'schedule of activities' | 'arms', count: number): string {
  return `${area}: ${count} element(s) the rule reads carry no name; no factor derived for them — rate manually`;
}

// ─── Internals ───────────────────────────────────────────────────────────────

interface RuleOutcome {
  factors: DerivedCtqFactor[];
  notAssessed: string[];
}

type FactorText = Pick<DerivedCtqFactor, 'ctqFactor' | 'riskDescription' | 'mitigation' | 'derivedFrom'>;
interface TableSpec extends FactorText {
  category: CtqTableCategory;
  isCritical: boolean;
}
type CatalogueKey = keyof typeof CTQ_CATALOGUE_ROWS;
type CatalogueRating = Readonly<Pick<CtqSeed, 'category' | 'likelihood' | 'impact' | 'isCritical'>>;

const NONE: RuleOutcome = { factors: [], notAssessed: [] };
const BLINDED: readonly unknown[] = ['single', 'double', 'triple'];

function isObject(x: unknown): x is object {
  return typeof x === 'object' && x !== null;
}

/** A list node as the design carries it at runtime: a non-list is empty; null entries carry no trigger. */
function objects<T>(x: T[] | undefined | null): T[] {
  return Array.isArray(x) ? x.filter(isObject) : [];
}

function only(factors: DerivedCtqFactor[]): RuleOutcome {
  return { factors, notAssessed: [] };
}

function absent(note: string): RuleOutcome {
  return { factors: [], notAssessed: [note] };
}

function catalogueRating(title: string): CatalogueRating {
  const row = DEFAULT_CTQ_FACTORS.find((f) => f.ctqFactor === title);
  if (!row) throw new Error(`ctq-derivation: DEFAULT_CTQ_FACTORS has no row "${title}"; CTQ_CATALOGUE_ROWS must follow the catalogue`);
  return Object.freeze({ category: row.category, likelihood: row.likelihood, impact: row.impact, isCritical: row.isCritical });
}

/** Resolved once at load, frozen: the catalogue rows the derived rows restate. */
const CATALOGUE_RATINGS: Readonly<Record<CatalogueKey, CatalogueRating>> = Object.freeze({
  primaryEndpoint: catalogueRating(CTQ_CATALOGUE_ROWS.primaryEndpoint),
  eligibility: catalogueRating(CTQ_CATALOGUE_ROWS.eligibility),
  investigationalProduct: catalogueRating(CTQ_CATALOGUE_ROWS.investigationalProduct),
});

/** A row rated from the category table; criticality is the rule's. */
function seed(spec: TableSpec): DerivedCtqFactor {
  const { likelihood, impact } = CTQ_DEFAULT_RATINGS[spec.category];
  const { category, ctqFactor, riskDescription, isCritical, mitigation, derivedFrom } = spec;
  return {
    category, ctqFactor, riskDescription, likelihood, impact, isCritical, mitigation, derivedFrom,
    ratingSource: 'default_seed',
    ratingFrom: { table: 'CTQ_DEFAULT_RATINGS', category },
  };
}

/** A row that restates a catalogue row: category, rating and criticality are that row's. */
function catalogueSeed(key: CatalogueKey, text: FactorText): DerivedCtqFactor {
  const { category, likelihood, impact, isCritical } = CATALOGUE_RATINGS[key];
  const { ctqFactor, riskDescription, mitigation, derivedFrom } = text;
  return {
    category, ctqFactor, riskDescription, likelihood, impact, isCritical, mitigation, derivedFrom,
    ratingSource: 'default_seed',
    ratingFrom: { table: 'DEFAULT_CTQ_FACTORS', ctqFactor: CTQ_CATALOGUE_ROWS[key] },
  };
}

// ─── Rule: primary / key-secondary endpoints → efficacy ──────────────────────

function endpointMeasurement(e: Endpoint): string {
  if (present(e.validatedInstrument)) return e.validatedInstrument;
  if (present(e.measurementMethod)) return e.measurementMethod;
  return e.name;
}

function endpointFactor(e: Endpoint): DerivedCtqFactor {
  const isPrimary = e.role === 'primary';
  const tier = isPrimary ? 'Primary' : 'Key secondary';
  const at = present(e.timepoint) ? ` at ${e.timepoint}` : '';
  const instrumentGap =
    e.type === 'patient_reported' && !present(e.validatedInstrument)
      ? ' No validated instrument is recorded for this patient-reported endpoint.'
      : '';
  const text: FactorText = {
    ctqFactor: `${tier} endpoint assessment: ${endpointMeasurement(e)}${at}`,
    riskDescription:
      `"${e.name}" (${tier.toLowerCase()} endpoint) measured off-window, by untrained or uncertified staff, ` +
      `or with an unvalidated or uncalibrated method; missing or unreliable ${tier.toLowerCase()} endpoint data ` +
      `bias the treatment-effect estimate.${instrumentGap}`,
    mitigation:
      'Endpoint-specific training and certification; visit-window KRI on the assessment; central read or ' +
      `central review where applicable; ${isPrimary ? 'primary-endpoint missing-data QTL' : 'missing-data KRI on this endpoint'}.`,
    derivedFrom: { kind: 'endpoint', ref: e.name },
  };
  return isPrimary ? catalogueSeed('primaryEndpoint', text) : seed({ ...text, category: 'efficacy', isCritical: false });
}

/** Rule 1: one efficacy factor per named primary or key-secondary endpoint; the primary row restates the catalogue's. */
function endpointRule(endpoints: Endpoint[]): RuleOutcome {
  if (endpoints.length === 0) return absent(CTQ_NOT_ASSESSED.endpoints);
  const confirmatory = endpoints.filter((e) => ESTIMAND_REQUIRED_ROLES.includes(e.role));
  if (confirmatory.length === 0) return absent(CTQ_NOT_ASSESSED.confirmatoryEndpoints);
  const named = confirmatory.filter((e) => present(e.name));
  const unnamed = confirmatory.length - named.length;
  return { factors: named.map(endpointFactor), notAssessed: unnamed > 0 ? [unnamedTriggerNote('endpoints', unnamed)] : [] };
}

// ─── Rule: eligibility criteria with a numeric threshold → catalogue row ──────

function describeBounds(s: StructuredEligibilityCriterion['structure']): string {
  if (s.kind !== 'threshold' && s.kind !== 'age') return '';
  const bounds = s.bounds.map((b) => `${b.op} ${b.value} ${s.unit}`).join(' and ');
  return `${s.concept.label} ${bounds}`;
}

/** Who is wrongly enrolled differs by type: an inclusion bound NOT satisfied, an exclusion bound MET. */
const ELIGIBILITY_BREACH: Readonly<Record<EligibilityCriterion['type'], string>> = Object.freeze({
  inclusion: 'Subjects enrolled who do not satisfy the inclusion threshold',
  exclusion: 'Subjects enrolled although they meet the exclusion threshold',
});

function eligibilityFactor(c: StructuredEligibilityCriterion): DerivedCtqFactor {
  return catalogueSeed('eligibility', {
    ctqFactor: `Eligibility verification: ${c.text}`,
    riskDescription:
      `${ELIGIBILITY_BREACH[c.type]} (${describeBounds(c.structure)}), or the value ` +
      'not source-verifiable at screening; ineligible subjects undermine the analysis population.',
    mitigation:
      'Targeted source-data verification of this criterion at screening; eligibility-violation KRI by site; ' +
      'central screening review of the recorded value against the threshold.',
    derivedFrom: { kind: 'eligibility', ref: c.text },
  });
}

/**
 * Rule 2: one factor per inclusion/exclusion criterion the eligibility grammar
 * reads as a numeric threshold or an age bound, rated as the catalogue's
 * eligibility row. Every other criterion, and a numeric one with no recorded
 * type, is counted in `notAssessed`, never guessed at.
 */
function eligibilityRule(criteria: EligibilityCriterion[]): RuleOutcome {
  if (criteria.length === 0) return absent(CTQ_NOT_ASSESSED.eligibility);
  const parsed = structureEligibility(criteria);
  const numeric = parsed.filter((p) => p.structure.kind === 'threshold' || p.structure.kind === 'age');
  const typed = numeric.filter((p) => p.type === 'inclusion' || p.type === 'exclusion');
  const notAssessed: string[] = [];
  if (numeric.length < parsed.length) notAssessed.push(unparsedEligibilityNote(parsed.length - numeric.length, parsed.length));
  if (typed.length < numeric.length) notAssessed.push(untypedEligibilityNote(numeric.length - typed.length));
  return { factors: typed.map(eligibilityFactor), notAssessed };
}

// ─── Rule: SoA activities → sample handling (table) and IMP (catalogue row) ───

const SAMPLE_KIND: Readonly<Partial<Record<SoaActivity['category'], string>>> = Object.freeze({ pk: 'PK', biomarker: 'biomarker', pd: 'PD' });

function sampleFactor(a: SoaActivity): DerivedCtqFactor {
  const endpoints = Array.isArray(a.endpointNames) ? a.endpointNames.filter(present) : [];
  const feeds = endpoints.length > 0 ? ` Feeds endpoint(s): ${endpoints.join(', ')}.` : '';
  const kind = SAMPLE_KIND[a.category] ?? a.category;
  return seed({
    category: 'data_integrity',
    ctqFactor: `Sample timing and handling: ${a.name}`,
    riskDescription:
      `${kind} sample "${a.name}" collected off-schedule, with an unrecorded collection time, mislabelled, ` +
      `or processed and stored outside the handling requirements; the derived ${kind} data are then uninterpretable.${feeds}`,
    isCritical: false,
    mitigation:
      'Collection-time capture to the minute; chain-of-custody and temperature log; lab-manual training; ' +
      'sample-deviation KRI.',
    derivedFrom: { kind: 'activity', ref: a.name, id: a.id },
  });
}

function impFactor(a: SoaActivity): DerivedCtqFactor {
  return catalogueSeed('investigationalProduct', {
    ctqFactor: `IMP accountability and dosing: ${a.name}`,
    riskDescription:
      `Dosing errors, missed or unrecorded administrations, accountability gaps or storage excursions for "${a.name}".`,
    mitigation:
      'IMP accountability reconciliation at each visit; dosing-error signal; temperature-excursion alerts; ' +
      'dispensing-log review.',
    derivedFrom: { kind: 'activity', ref: a.name, id: a.id },
  });
}

type ActivityTrigger = 'sample' | 'imp' | 'pd_without_specimen' | null;

function activityTrigger(a: SoaActivity): ActivityTrigger {
  if (a.category === 'pk' || a.category === 'biomarker') return 'sample';
  if (a.category === 'drug_administration') return 'imp';
  if (a.category === 'pd') return isObject(a.specimen) ? 'sample' : 'pd_without_specimen';
  return null;
}

/**
 * Rule 3: `pk` and `biomarker` activities, and `pd` activities that record a
 * specimen, yield a data-integrity factor; `drug_administration` activities
 * restate the catalogue's IP-accountability row. A `pd` activity with no specimen
 * and an unnamed triggering activity are counted in `notAssessed`. Row order
 * follows the SoA's own activity order.
 */
function activityRule(activities: SoaActivity[]): RuleOutcome {
  if (activities.length === 0) return absent(CTQ_NOT_ASSESSED.scheduleOfActivities);
  const factors: DerivedCtqFactor[] = [];
  let pdUnrated = 0;
  let unnamed = 0;
  for (const a of activities) {
    const trigger = activityTrigger(a);
    if (trigger === null) continue;
    if (trigger === 'pd_without_specimen') pdUnrated += 1;
    else if (!present(a.name)) unnamed += 1;
    else factors.push(trigger === 'imp' ? impFactor(a) : sampleFactor(a));
  }
  const notAssessed: string[] = [];
  if (pdUnrated > 0) notAssessed.push(pdWithoutSpecimenNote(pdUnrated));
  if (unnamed > 0) notAssessed.push(unnamedTriggerNote('schedule of activities', unnamed));
  return { factors, notAssessed };
}

// ─── Rule: arms carrying dose-modification rules → safety ────────────────────

function doseModificationFactor(arm: Arm): DerivedCtqFactor {
  const names = objects(arm.interventions).map((i) => i.name).filter(present);
  const of = names.length > 0 ? ` (${names.join(', ')})` : '';
  return seed({
    category: 'safety',
    ctqFactor: `Dose modification and titration rules: ${arm.name}`,
    riskDescription:
      `Dose-modification, titration or rescue rules recorded for arm "${arm.name}"${of} applied late, ` +
      'inconsistently or without documentation; subjects continue on a dose the rules would have changed.',
    isCritical: false,
    mitigation:
      'Dose-modification decision log per subject; lab-trigger review against the rules; ' +
      'dose-deviation KRI; investigator training on the rules.',
    derivedFrom: { kind: 'intervention', ref: arm.name },
  });
}

/** A recorded negative: every recorded intervention is a placebo. An arm with none recorded is not placebo-only. */
function placeboOnly(arm: Arm): boolean {
  const interventions = objects(arm.interventions);
  return interventions.length > 0 && interventions.every((i) => i.role === 'placebo');
}

/**
 * Rule 4: one safety factor per named arm that records `doseModificationRules`.
 * Each named arm that records none and is not placebo-only is named in
 * `notAssessed` (the SPIRIT 11b reading); unnamed arms are counted.
 */
function doseModificationRule(arms: Arm[]): RuleOutcome {
  if (arms.length === 0) return absent(CTQ_NOT_ASSESSED.arms);
  const factors: DerivedCtqFactor[] = [];
  const unrecorded: string[] = [];
  let unnamed = 0;
  for (const arm of arms) {
    const hasRules = present(arm.doseModificationRules);
    if (!hasRules && placeboOnly(arm)) continue;
    if (!present(arm.name)) unnamed += 1;
    else if (hasRules) factors.push(doseModificationFactor(arm));
    else unrecorded.push(arm.name);
  }
  const notAssessed: string[] = [];
  if (unrecorded.length > 0) notAssessed.push(doseModificationNote(unrecorded));
  if (unnamed > 0) notAssessed.push(unnamedTriggerNote('arms', unnamed));
  return { factors, notAssessed };
}

// ─── Rule: blinding → data_integrity (maintenance) + compliance (unblinding) ──

function blindMaintenanceFactor(r: Randomization): DerivedCtqFactor {
  return seed({
    category: 'data_integrity',
    ctqFactor: `Blind maintenance (${r.blinding}-blind design)`,
    riskDescription:
      'Treatment allocation disclosed to blinded roles through IMP appearance, PK or laboratory results, ' +
      'unblinded-pharmacist workflow or randomisation-system access; assessment bias on the primary endpoint.',
    isCritical: true,
    mitigation:
      'Blinded/unblinded role matrix; masked laboratory and PK reporting; randomisation-system access review; ' +
      'unblinding-event KRI.',
    derivedFrom: { kind: 'randomization', ref: 'randomization.blinding' },
  });
}

function emergencyUnblindingFactor(r: Randomization): DerivedCtqFactor {
  const procedure = present(r.emergencyUnblindingProcedure)
    ? `Code-break performed outside the recorded procedure ("${r.emergencyUnblindingProcedure}"), not documented, ` +
      'or not reported; or unavailable when a subject\'s care requires it.'
    : 'No emergency unblinding procedure is recorded on the design; a code-break that cannot be performed, ' +
      'documented or reported when a subject\'s care requires it.';
  return seed({
    category: 'compliance',
    ctqFactor: `Emergency unblinding (${r.blinding}-blind design)`,
    riskDescription: procedure,
    isCritical: true,
    mitigation:
      '24-hour code-break availability; unblinding-request log with reason and reporter; ' +
      'post-event review of every code-break; sponsor notification timeline.',
    derivedFrom: { kind: 'randomization', ref: 'randomization.blinding' },
  });
}

/**
 * Rule 5: `single`, `double` or `triple` blinding yields a critical data-integrity
 * row (blind maintenance) and a critical compliance row (emergency unblinding).
 * `open` is a recorded fact: no row, no note. Any other value — missing, blank or
 * outside the enum — is noted, never presumed blinded.
 */
function blindingRule(r: Randomization | undefined): RuleOutcome {
  if (!isObject(r)) return absent(CTQ_NOT_ASSESSED.randomization);
  if (r.blinding === 'open') return NONE;
  if (!BLINDED.includes(r.blinding)) return absent(CTQ_NOT_ASSESSED.blinding);
  return only([blindMaintenanceFactor(r), emergencyUnblindingFactor(r)]);
}

// ─── Rule: safety design → stopping rules, DMC readiness, DLT ────────────────

function stoppingRuleFactor(): DerivedCtqFactor {
  return seed({
    category: 'safety',
    ctqFactor: 'Stopping-rule triggers and escalation',
    riskDescription:
      'An individual or study-level stopping rule met but not recognised, escalated or acted on in time; ' +
      'subjects continue to be dosed after the rule is met.',
    isCritical: true,
    mitigation:
      'Stopping-rule trigger monitoring in central review; escalation path with named owners; ' +
      'time-to-action KRI on each trigger.',
    derivedFrom: { kind: 'safety', ref: 'safety.stoppingRules' },
  });
}

function dmcFactor(charter: NonNullable<SafetyDesign['dmcCharter']>): DerivedCtqFactor {
  const cadence = present(charter.meetingCadence) ? ` (${charter.meetingCadence})` : '';
  return seed({
    category: 'safety',
    ctqFactor: `DMC data readiness and review cadence${cadence}`,
    riskDescription:
      'Data delivered to the DMC late, incomplete or not cleaned to the agreed cut; DMC recommendations ' +
      'not received, actioned or documented by the sponsor.',
    isCritical: false,
    mitigation:
      'DMC data-package checklist and cut schedule; data-cleaning status report per package; ' +
      'recommendation-to-action log.',
    derivedFrom: { kind: 'safety', ref: 'safety.dmcCharter' },
  });
}

function dltFactor(): DerivedCtqFactor {
  return seed({
    category: 'safety',
    ctqFactor: 'Dose-limiting toxicity assessment and escalation decisions',
    riskDescription:
      'A DLT missed, mis-graded or attributed outside the DLT window; a dose-escalation decision taken on ' +
      'incomplete DLT data.',
    isCritical: true,
    mitigation:
      'DLT adjudication before each escalation decision; cohort-completion check against the DLT window; ' +
      'safety-review-committee minutes with the data cut used.',
    derivedFrom: { kind: 'safety', ref: 'safety.dltDefinition' },
  });
}

/**
 * Rules 6, 7 and 9: `stoppingRules` and `dltDefinition` each yield a critical
 * safety row; `dmcCharter.present === true` yields a non-critical one. Only
 * `present === false` is a recorded negative; any other `present` value, like an
 * unrecorded or blank text field, is noted. An absent safety node yields the
 * single `safety` note.
 */
function safetyRule(safety: SafetyDesign | undefined): RuleOutcome {
  if (!isObject(safety)) return absent(CTQ_NOT_ASSESSED.safety);
  const factors: DerivedCtqFactor[] = [];
  const notAssessed: string[] = [];
  if (present(safety.stoppingRules)) factors.push(stoppingRuleFactor());
  else notAssessed.push(CTQ_NOT_ASSESSED.stoppingRules);
  const charter = isObject(safety.dmcCharter) ? safety.dmcCharter : undefined;
  if (charter?.present === true) factors.push(dmcFactor(charter));
  else if (charter?.present !== false) notAssessed.push(CTQ_NOT_ASSESSED.dmcCharter);
  if (present(safety.dltDefinition)) factors.push(dltFactor());
  else notAssessed.push(CTQ_NOT_ASSESSED.dltDefinition);
  return { factors, notAssessed };
}

// ─── Rule: interim design → data_integrity ───────────────────────────────────

/** Rule 8: an interim design yields one data-integrity factor naming its information fractions, or saying they are unrecorded. */
function interimRule(plan: StatisticalPlan | undefined): RuleOutcome {
  const interim = isObject(plan) ? plan.interim : undefined;
  if (!isObject(interim)) return absent(CTQ_NOT_ASSESSED.interim);
  const recorded = Array.isArray(interim.informationFractions)
    ? interim.informationFractions.filter((f) => typeof f === 'number' && Number.isFinite(f))
    : [];
  const fractions = recorded.length > 0 ? `information fractions ${recorded.join(', ')}` : 'information fractions not recorded';
  return only([
    seed({
      category: 'data_integrity',
      ctqFactor: `Interim analysis data-cut integrity (${fractions})`,
      riskDescription:
        'Interim data cut taken on stale or uncleaned data, the analysis population or boundary applied ' +
        'inconsistently with the plan, or interim results reaching blinded roles.',
      isCritical: false,
      mitigation:
        'Pre-specified data-cut procedure; interim snapshot QC; firewall between the DMC statistician and the ' +
        'study team; lock checklist for each cut.',
      derivedFrom: { kind: 'statistical_plan', ref: 'statisticalPlan.interim' },
    }),
  ]);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Derive the study-specific CtQ factors from a design. Rule order is fixed
 * (endpoints, eligibility, SoA, arms, blinding, safety, interim) and, within a
 * rule, follows the design's own order, so the output is stable across runs.
 * Total on a runtime-partial design: a missing or malformed node is noted.
 */
export function deriveCtqFactors(design: StudyDesign): CtqDerivation {
  const d: Partial<StudyDesign> = isObject(design) ? design : {};
  const population = isObject(d.population) ? d.population : undefined;
  const soa = isObject(d.scheduleOfActivities) ? d.scheduleOfActivities : undefined;
  const outcomes: RuleOutcome[] = [
    endpointRule(objects(d.endpoints)),
    eligibilityRule(objects(population?.eligibility)),
    activityRule(objects(soa?.activities)),
    doseModificationRule(objects(d.arms)),
    blindingRule(d.randomization),
    safetyRule(d.safety),
    interimRule(d.statisticalPlan),
  ];
  return {
    factors: outcomes.flatMap((o) => o.factors),
    notAssessed: outcomes.flatMap((o) => o.notAssessed),
    basis: CTQ_BASIS,
  };
}
