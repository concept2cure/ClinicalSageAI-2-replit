/**
 * Critical-to-quality (CtQ) factor derivation — ICH E6(R3) quality by design,
 * read off the structured study design.
 *
 * ## The industry need
 * ICH E6(R3) §3.10 expects a sponsor to identify the factors critical to the
 * quality of a trial AT DESIGN, before monitoring is planned, and to focus the
 * risk-based quality-management system on them. TransCelerate's Risk Assessment
 * and Categorization Tool (RACT) starts from that list. The platform's RBM module
 * (`server/services/rbm/rbm-engine.ts`) carries a GENERIC starting catalogue,
 * `DEFAULT_CTQ_FACTORS`, typed {@link CtqSeed}; nothing derives the
 * study-SPECIFIC factors — the ones named for THIS primary endpoint, THIS
 * eligibility threshold, THIS PK sample, THIS blinding scheme — from the design.
 * This module is that derivation. It emits the RBM module's own `CtqSeed`
 * vocabulary (type-only import, zero duplication) so its output drops straight
 * into the RACT as seed rows.
 *
 * ## The rules (each deterministic; each documented at its function)
 *  | Trigger on the design                                  | Category       | Critical |
 *  |--------------------------------------------------------|----------------|----------|
 *  | endpoint with role `primary` / `key_secondary`         | efficacy       | primary  |
 *  | eligibility criterion carrying a numeric threshold     | compliance     | no       |
 *  | SoA activity of category `pk` / `biomarker`            | data_integrity | no       |
 *  | SoA activity of category `drug_administration`         | safety         | yes      |
 *  | arm with `doseModificationRules`                       | safety         | no       |
 *  | `randomization.blinding` other than `open` (two rows)  | data_integrity + compliance | yes |
 *  | `safety.stoppingRules`                                 | safety         | yes      |
 *  | `safety.dmcCharter.present === true`                   | safety         | no       |
 *  | `statisticalPlan.interim`                              | data_integrity | no       |
 *  | `safety.dltDefinition`                                 | safety         | yes      |
 *
 * "Numeric threshold" is decided by the repository's one eligibility grammar
 * (`parseEligibilityCriterion` in `./eligibility-model`): a criterion it reads as
 * a `threshold` or an `age` fires; prose it refuses does not, and the refusal count
 * is reported in `notAssessed` so those criteria are rated by hand, not silently
 * dropped.
 *
 * ## The honesty contract
 *  - Pure and total: no model call, no randomness, no clock, no database, no throw
 *    on a partial design. Same input → byte-identical output; the input is not
 *    mutated.
 *  - A factor is emitted ONLY for a trigger the design actually contains. Nothing
 *    is inferred from phase, indication or product type; an absent node is an
 *    absent trigger, never a presumed one.
 *  - Every likelihood and impact comes from ONE documented category table,
 *    {@link CTQ_DEFAULT_RATINGS}, and every factor carries
 *    `ratingSource: 'default_seed'` so nobody reads a derived rating as an
 *    assessed one. Mitigation text is a rule-keyed starting control for the
 *    sponsor to refine, not an assessed control.
 *  - `isCritical` is true only for the primary-endpoint, IMP-administration,
 *    blinding (both rows), stopping-rule and DLT factors.
 *  - Every factor names its provenance in `derivedFrom`: the endpoint, activity or
 *    arm NAME, the criterion TEXT verbatim, or the design field path for a
 *    structural trigger.
 *  - `notAssessed` lists every design area the engine could not read — the node
 *    or field is absent — so an empty factor list is never mistaken for a
 *    risk-free design. A recorded negative (`dmcCharter.present: false`, an
 *    open-label design) is assessed and yields no row and no note.
 *
 * @module server/services/study-design/ctq-derivation
 */

import type { CtqSeed } from '../rbm/rbm-engine';
import { parseEligibilityCriterion, type StructuredEligibilityCriterion } from './eligibility-model';
import {
  ESTIMAND_REQUIRED_ROLES,
  type Arm,
  type EligibilityCriterion,
  type Endpoint,
  type Randomization,
  type SafetyDesign,
  type ScheduleOfActivities,
  type SoaActivity,
  type StatisticalPlan,
  type StudyDesign,
} from './study-design-types';

export const CTQ_BASIS =
  'ICH E6(R3) §3.10 — identification of critical-to-quality factors at design; TransCelerate RACT';

// ─── Public shapes ───────────────────────────────────────────────────────────

export type CtqCategory = CtqSeed['category'];

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
 * criterion text verbatim, or the field path of a structural trigger.
 */
export interface CtqDerivedFrom {
  kind: CtqDerivedFromKind;
  ref: string;
}

/** A RACT seed row with its provenance and an explicit statement that its rating is a default. */
export interface DerivedCtqFactor extends CtqSeed {
  derivedFrom: CtqDerivedFrom;
  /** Always `'default_seed'`: the likelihood and impact are the category table, not an assessment. */
  ratingSource: 'default_seed';
}

export interface CtqDerivation {
  factors: DerivedCtqFactor[];
  /** Design areas the engine could not read, each with the consequence. */
  notAssessed: string[];
  basis: string;
}

/**
 * The one default rating table. Likelihood and impact are 1..5 per the RACT
 * convention; these are STARTING values by category, applied to every factor of
 * that category and marked `default_seed` on the row.
 */
export const CTQ_DEFAULT_RATINGS: Readonly<Record<CtqCategory, { likelihood: number; impact: number }>> = {
  safety: { likelihood: 3, impact: 5 },
  efficacy: { likelihood: 3, impact: 4 },
  data_integrity: { likelihood: 3, impact: 4 },
  compliance: { likelihood: 2, impact: 4 },
  operational: { likelihood: 2, impact: 3 },
};

/** The `notAssessed` entries, keyed by area, so callers and tests can match them exactly. */
export const CTQ_NOT_ASSESSED = {
  endpoints: 'endpoints: the design carries no endpoints; no efficacy factor derived',
  confirmatoryEndpoints: 'endpoints: no primary or key-secondary endpoint recorded; no efficacy factor derived',
  eligibility: 'eligibility: the design carries no eligibility criteria; no eligibility-verification factor derived',
  scheduleOfActivities:
    'schedule of activities: the design carries no Schedule of Activities, or it lists no activities; no sampling or IMP-administration factor derived',
  arms: 'arms: the design carries no arms; no dose-modification factor derived',
  randomization: 'randomization: the design carries no randomization node; no blinding factor derived',
  safety: 'safety: the design carries no safety design; no stopping-rule, DMC or DLT factor derived',
  stoppingRules: 'safety.stoppingRules: not recorded; no stopping-rule factor derived',
  dmcCharter: 'safety.dmcCharter: not recorded; no DMC factor derived',
  dltDefinition: 'safety.dltDefinition: not recorded; no DLT factor derived',
  interim: 'statisticalPlan.interim: not recorded; no interim data-cut factor derived',
} as const;

/** The note for criteria the eligibility grammar refused: they must be rated by hand. */
export function unparsedEligibilityNote(refused: number, total: number): string {
  return `eligibility: ${refused} of ${total} criteria carry no numeric threshold the eligibility grammar accepts; no verification factor derived for them — rate manually`;
}

// ─── Internals ───────────────────────────────────────────────────────────────

interface RuleOutcome {
  factors: DerivedCtqFactor[];
  notAssessed: string[];
}

type FactorSpec = Omit<DerivedCtqFactor, 'likelihood' | 'impact' | 'ratingSource'>;

const NONE: RuleOutcome = { factors: [], notAssessed: [] };

function recorded(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function only(factors: DerivedCtqFactor[]): RuleOutcome {
  return { factors, notAssessed: [] };
}

function absent(note: string): RuleOutcome {
  return { factors: [], notAssessed: [note] };
}

/** The single place a rating is attached: always the category table, always `default_seed`. */
function seed(spec: FactorSpec): DerivedCtqFactor {
  const { likelihood, impact } = CTQ_DEFAULT_RATINGS[spec.category];
  return { ...spec, likelihood, impact, ratingSource: 'default_seed' };
}

// ─── Rule: primary / key-secondary endpoints → efficacy ──────────────────────

function endpointMeasurement(e: Endpoint): string {
  if (recorded(e.validatedInstrument)) return e.validatedInstrument;
  if (recorded(e.measurementMethod)) return e.measurementMethod;
  return e.name;
}

function endpointFactor(e: Endpoint): DerivedCtqFactor {
  const isPrimary = e.role === 'primary';
  const tier = isPrimary ? 'Primary' : 'Key secondary';
  const at = recorded(e.timepoint) ? ` at ${e.timepoint}` : '';
  const instrumentGap =
    e.type === 'patient_reported' && !recorded(e.validatedInstrument)
      ? ' No validated instrument is recorded for this patient-reported endpoint.'
      : '';
  return seed({
    category: 'efficacy',
    ctqFactor: `${tier} endpoint assessment: ${endpointMeasurement(e)}${at}`,
    riskDescription:
      `"${e.name}" (${tier.toLowerCase()} endpoint) measured off-window, by untrained or uncertified staff, ` +
      `or with an unvalidated or uncalibrated method; missing or unreliable ${tier.toLowerCase()} endpoint data ` +
      `bias the treatment-effect estimate.${instrumentGap}`,
    isCritical: isPrimary,
    mitigation:
      'Endpoint-specific training and certification; visit-window KRI on the assessment; central read or ' +
      'central review where applicable; primary-endpoint missing-data QTL.',
    derivedFrom: { kind: 'endpoint', ref: e.name },
  });
}

/** Rule 1: one efficacy factor per primary or key-secondary endpoint; primary rows are critical. */
function endpointRule(endpoints: Endpoint[]): RuleOutcome {
  if (endpoints.length === 0) return absent(CTQ_NOT_ASSESSED.endpoints);
  const confirmatory = endpoints.filter((e) => ESTIMAND_REQUIRED_ROLES.includes(e.role));
  if (confirmatory.length === 0) return absent(CTQ_NOT_ASSESSED.confirmatoryEndpoints);
  return only(confirmatory.map(endpointFactor));
}

// ─── Rule: eligibility criteria with a numeric threshold → compliance ─────────

function describeBounds(s: StructuredEligibilityCriterion['structure']): string {
  if (s.kind !== 'threshold' && s.kind !== 'age') return '';
  const bounds = s.bounds.map((b) => `${b.op} ${b.value} ${s.unit}`).join(' and ');
  return `${s.concept.label} ${bounds}`;
}

function eligibilityFactor(c: StructuredEligibilityCriterion): DerivedCtqFactor {
  return seed({
    category: 'compliance',
    ctqFactor: `Eligibility verification: ${c.text}`,
    riskDescription:
      `Subjects enrolled outside the ${c.type} threshold (${describeBounds(c.structure)}), or the value ` +
      'not source-verifiable at screening; ineligible subjects undermine the analysis population.',
    isCritical: false,
    mitigation:
      'Targeted source-data verification of this criterion at screening; eligibility-violation KRI by site; ' +
      'central screening review of the recorded value against the threshold.',
    derivedFrom: { kind: 'eligibility', ref: c.text },
  });
}

/**
 * Rule 2: one compliance factor per inclusion/exclusion criterion the eligibility
 * grammar reads as a numeric threshold or an age bound. Criteria it refuses are
 * counted in `notAssessed`, never guessed at.
 */
function eligibilityRule(criteria: EligibilityCriterion[]): RuleOutcome {
  if (criteria.length === 0) return absent(CTQ_NOT_ASSESSED.eligibility);
  const parsed = criteria.map((c, i) => parseEligibilityCriterion(c, i));
  const numeric = parsed.filter((p) => p.structure.kind === 'threshold' || p.structure.kind === 'age');
  const refused = parsed.length - numeric.length;
  return {
    factors: numeric.map(eligibilityFactor),
    notAssessed: refused > 0 ? [unparsedEligibilityNote(refused, parsed.length)] : [],
  };
}

// ─── Rule: SoA activities → data_integrity (pk/biomarker) and safety (IMP) ───

function sampleFactor(a: SoaActivity): DerivedCtqFactor {
  const feeds = a.endpointNames && a.endpointNames.length > 0 ? ` Feeds endpoint(s): ${a.endpointNames.join(', ')}.` : '';
  const kind = a.category === 'pk' ? 'PK' : 'biomarker';
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
    derivedFrom: { kind: 'activity', ref: a.name },
  });
}

function impFactor(a: SoaActivity): DerivedCtqFactor {
  return seed({
    category: 'safety',
    ctqFactor: `IMP accountability and dosing: ${a.name}`,
    riskDescription:
      `Dosing errors, missed or unrecorded administrations, accountability gaps or storage excursions for "${a.name}".`,
    isCritical: true,
    mitigation:
      'IMP accountability reconciliation at each visit; dosing-error signal; temperature-excursion alerts; ' +
      'dispensing-log review.',
    derivedFrom: { kind: 'activity', ref: a.name },
  });
}

/**
 * Rule 3: `pk` and `biomarker` activities yield a data-integrity factor;
 * `drug_administration` activities yield a critical safety factor. Row order
 * follows the SoA's own activity order.
 */
function activityRule(soa: ScheduleOfActivities | undefined): RuleOutcome {
  const activities = soa?.activities ?? [];
  if (activities.length === 0) return absent(CTQ_NOT_ASSESSED.scheduleOfActivities);
  const factors: DerivedCtqFactor[] = [];
  for (const a of activities) {
    if (a.category === 'pk' || a.category === 'biomarker') factors.push(sampleFactor(a));
    else if (a.category === 'drug_administration') factors.push(impFactor(a));
  }
  return only(factors);
}

// ─── Rule: arms carrying dose-modification rules → safety ────────────────────

function doseModificationFactor(arm: Arm): DerivedCtqFactor {
  const names = arm.interventions.map((i) => i.name).filter(recorded);
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

/** Rule 4: one safety factor per arm that records `doseModificationRules`. */
function doseModificationRule(arms: Arm[]): RuleOutcome {
  if (arms.length === 0) return absent(CTQ_NOT_ASSESSED.arms);
  return only(arms.filter((a) => recorded(a.doseModificationRules)).map(doseModificationFactor));
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
  const procedure = recorded(r.emergencyUnblindingProcedure)
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
 * Rule 5: any blinding other than `open` yields a critical data-integrity row
 * (blind maintenance) and a critical compliance row (emergency unblinding). An
 * open-label design is a recorded fact: no row, no note.
 */
function blindingRule(r: Randomization | undefined): RuleOutcome {
  if (!r) return absent(CTQ_NOT_ASSESSED.randomization);
  if (r.blinding === 'open') return NONE;
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
  const cadence = recorded(charter.meetingCadence) ? ` (${charter.meetingCadence})` : '';
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
 * safety row; `dmcCharter.present === true` yields a non-critical one. Each field
 * that is not recorded is noted; `present: false` is a recorded negative and is
 * not noted. An absent safety node yields the single `safety` note.
 */
function safetyRule(safety: SafetyDesign | undefined): RuleOutcome {
  if (!safety) return absent(CTQ_NOT_ASSESSED.safety);
  const factors: DerivedCtqFactor[] = [];
  const notAssessed: string[] = [];
  if (recorded(safety.stoppingRules)) factors.push(stoppingRuleFactor());
  else notAssessed.push(CTQ_NOT_ASSESSED.stoppingRules);
  if (safety.dmcCharter === undefined) notAssessed.push(CTQ_NOT_ASSESSED.dmcCharter);
  else if (safety.dmcCharter.present) factors.push(dmcFactor(safety.dmcCharter));
  if (recorded(safety.dltDefinition)) factors.push(dltFactor());
  else notAssessed.push(CTQ_NOT_ASSESSED.dltDefinition);
  return { factors, notAssessed };
}

// ─── Rule: interim design → data_integrity ───────────────────────────────────

/** Rule 8: an interim design yields one data-integrity factor naming its information fractions. */
function interimRule(plan: StatisticalPlan): RuleOutcome {
  const interim = plan.interim;
  if (!interim) return absent(CTQ_NOT_ASSESSED.interim);
  const fractions = interim.informationFractions.length > 0 ? ` (information fractions ${interim.informationFractions.join(', ')})` : '';
  return only([
    seed({
      category: 'data_integrity',
      ctqFactor: `Interim analysis data-cut integrity${fractions}`,
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
 */
export function deriveCtqFactors(design: StudyDesign): CtqDerivation {
  const outcomes: RuleOutcome[] = [
    endpointRule(design.endpoints ?? []),
    eligibilityRule(design.population?.eligibility ?? []),
    activityRule(design.scheduleOfActivities),
    doseModificationRule(design.arms ?? []),
    blindingRule(design.randomization),
    safetyRule(design.safety),
    interimRule(design.statisticalPlan ?? { plannedAnalyses: [] }),
  ];
  return {
    factors: outcomes.flatMap((o) => o.factors),
    notAssessed: outcomes.flatMap((o) => o.notAssessed),
    basis: CTQ_BASIS,
  };
}
