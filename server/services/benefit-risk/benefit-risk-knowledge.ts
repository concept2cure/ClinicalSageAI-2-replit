/**
 * Structured Benefit-Risk Assessment — Deterministic Knowledge Engine
 * ====================================================================
 *
 * A pure, closed-form, fully reproducible reasoning engine for structured
 * benefit-risk (B-R) assessment of medicinal products. NO LLM. NO network.
 * NO database. Its imports from other services are the shared input readers
 * (refuseUnlessStated and ComputationRefusal; statedBoolean, statedNumber,
 * statedOneOf and booleanInputStates), which refuse an input that decides the
 * output and was not stated, or was malformed, so that AnA relays it as
 * needs_parameters. Every output is a deterministic function of the inputs and
 * the citation-backed knowledge tables defined here and in the sibling
 * benefit-risk-reference.ts.
 *
 * Rule 2 S5d (2026-11-09): an omitted or null true/false input reads as
 * not_stated (inputStates) and is never read as true or false. A verdict,
 * weight, net balance or conclusion that an unstated fact could change is null
 * or says it is not assessed, and names the facts (undecided). A malformed value
 * is refused by field. An omitted grade that a score still uses (magnitude,
 * severity, reversibility, uncertainty) keeps its middle value and is named in
 * methodNotes.
 *
 * The engine encodes the structured B-R methodologies that regulators expect a
 * sponsor to apply and document in a marketing application (Module 2.5.6 of the
 * CTD), at an advisory committee, and in periodic safety reports:
 *
 *   1. FDA Benefit-Risk Assessment Framework
 *      - PDUFA VI commitment (FY2018-2022) operationalizing the framework.
 *      - PDUFA VII commitment (FY2023-2027) extending Patient-Focused Drug
 *        Development (PFDD) and structured B-R into review.
 *      - FDA Guidance "Benefit-Risk Assessment for New Drug and Biological
 *        Products" (final, September 2023).
 *      - The five-row FDA framework grid: Analysis of Condition, Current
 *        Treatment Options, Benefit, Risk, Risk Management → Conclusions.
 *
 *   2. EMA benefit-risk methodology
 *      - EMA "Benefit-risk methodology project" (2009-2012) work packages.
 *      - PrOACT-URL decision-analysis framework (Problem, Objectives,
 *        Alternatives, Consequences, Trade-offs, Uncertainty, Risk attitude,
 *        Linked decisions).
 *      - The EMA "effects table" — the standardized tabulation of favourable
 *        and unfavourable effects with magnitude, units, and uncertainty that
 *        appears in every European Public Assessment Report (EPAR) since 2014.
 *
 *   3. IMI PROTECT Benefit-Risk (BRAT) framework
 *      - Innovative Medicines Initiative PROTECT WP5 recommendations (2013).
 *      - The BRAT (Benefit-Risk Action Team) 6-step process and value tree.
 *      - Visualizations: forest plots, tornado diagrams, value-tree diagrams.
 *
 *   4. ICH M4E(R2) Common Technical Document, §2.5.6 "Benefits and Risks
 *      Conclusions" — the structured benefit-risk content expected in the
 *      Clinical Overview.
 *
 *   5. CIOMS Working Group IV — "Benefit-Risk Balance for Marketed Drugs:
 *      Evaluating Safety Signals" (1998) — the classical qualitative
 *      benefit-risk evaluation method for post-marketing signals.
 *
 * Determinism contract
 * ---------------------
 * Identical input ALWAYS yields identical output. All branching is on explicit
 * input values and the constant tables below. No Date.now(), no Math.random(),
 * no iteration over unordered structures whose order affects output. Numeric
 * outputs are computed with documented, stable formulas. Citations are returned
 * verbatim from the CITATIONS registry; callers must not paraphrase them.
 *
 * @module server/services/benefit-risk/benefit-risk-knowledge
 */

import { ComputationRefusal, refuseUnlessStated, type RequiredInputCheck } from '../ana-biostats/computation-engine';
import {
  booleanInputStates,
  conclusions,
  listed,
  oneOfInput,
  shown,
  statedBoolean,
  statedList,
  statedNumber,
  statedOneOf,
  statedText,
} from '../immunogenicity/immunogenicity-reference';
import {
  CITATIONS, CONDITION_SEVERITY_RANK, audienceCautions, audienceFormat, audienceFraming, audienceLabel,
  audienceMustInclude, defaultBenefitWeight, deriveMagnitude, uncertaintyImpactProse, worseUncertainty, defaultRiskFrequencyWeight, describeBenefitEndpoint, describeConditionCourse,
  describeConditionSeverity, evidenceSourceProse, evidenceSourceUncertaintyFloor, frequencyToProseFda, magnitudeScore,
  reversibilityMultiplier, severityScore, uncertaintyDefaultDescription, uncertaintyMitigation, uncertaintyPenalty,
  uncertaintySourceLabel, weightingGuidanceText, type Citation,
} from './benefit-risk-reference';

export type { Citation } from './benefit-risk-reference';

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 0 — Shared vocabulary, citation registry, and helper primitives
 * ════════════════════════════════════════════════════════════════════════════ */

// The citation registry, the score tables and the fixed texts are in
// benefit-risk-reference.ts (moved unchanged 2026-11-09, Rule 2 S5d).

/** Resolve a citation by id; deterministic, throws on unknown id. */
function cite(id: string): Citation {
  const c = CITATIONS[id];
  if (!c) {
    throw new Error(`Unknown citation id: ${id}`);
  }
  return c;
}

/** Resolve an ordered, de-duplicated list of citations by id. */
function citeAll(ids: readonly string[]): Citation[] {
  const seen: Record<string, boolean> = {};
  const out: Citation[] = [];
  for (const id of ids) {
    if (!seen[id]) {
      seen[id] = true;
      out.push(cite(id));
    }
  }
  return out;
}

/** Round to a fixed number of decimals deterministically. */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Clamp a number into [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** Title-case-free safe label normalizer (trim + collapse whitespace). */
function norm(text: string | undefined, fallback: string): string {
  if (text === undefined) return fallback;
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length === 0 ? fallback : t;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Input readers (Rule 2 S5d, 2026-11-09). Omitted or null is not stated; a
 * value of the wrong kind is refused by field, never read as another value.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A true/false input: true, false or not_stated. */
type BooleanState = boolean | 'not_stated';

/** A conclusion an unstated fact leaves open: the facts it turns on, and what it could be. */
export interface Undecided {
  readonly conclusion: string;
  readonly decidingFacts: string[];
  readonly couldBe: Array<string | number | boolean>;
}

/** A stated list of texts; each entry must be text. */
function statedTexts(field: string, value: unknown): string[] | undefined {
  return statedList(field, value)?.map((v: unknown, i: number): string => {
    if (typeof v === 'string') return v;
    throw new ComputationRefusal('invalid_input', `${field}[${i}] must be text (got ${shown(v)}).`, `${field}[${i}]`);
  });
}

/** One entry of a list of objects, as a record of its fields. */
function statedItem(field: string, value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new ComputationRefusal('invalid_input', `${field} must be an object (got ${shown(value)}).`, field);
}

/** A required list, for refuseUnlessStated. */
function listInput(field: string, value: unknown): RequiredInputCheck {
  return { field, value, ok: Array.isArray(value), expected: 'a list' };
}

/** A required value from a fixed vocabulary. */
function requiredOneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  refuseUnlessStated('benefit-risk', [oneOfInput(field, value, allowed)], 'assessed');
  return value as T;
}

/** Readers for one entry of a list of objects; each refuses a malformed field by its path. */
interface Reader {
  text(k: string): string | undefined;
  oneOf<T extends string>(k: string, allowed: readonly T[]): T | undefined;
  need<T extends string>(k: string, allowed: readonly T[]): T;
  bool(k: string): boolean | undefined;
  num(k: string, ok: (n: number) => boolean, rule: string): number | undefined;
  texts(k: string): string[] | undefined;
}

/** The entries of a stated list of objects (none when omitted or null), each with its readers. */
function entries(field: string, value: unknown): Reader[] {
  return (statedList(field, value) ?? []).map((v: unknown, i: number): Reader => {
    const o = statedItem(`${field}[${i}]`, v);
    const at = (k: string): string => `${field}[${i}].${k}`;
    return {
      text: (k) => statedText(at(k), o[k]),
      oneOf: (k, allowed) => statedOneOf(at(k), o[k], allowed),
      need: (k, allowed) => requiredOneOf(at(k), o[k], allowed),
      bool: (k) => statedBoolean(at(k), o[k]),
      num: (k, ok, rule) => statedNumber(at(k), o[k], ok, rule),
      texts: (k) => statedTexts(at(k), o[k]),
    };
  });
}

/** A weight from 0 to 1. */
const unitWeight = (n: number): boolean => n >= 0 && n <= 1;

const MAGNITUDES = ['negligible', 'low', 'moderate', 'high', 'very_high'] as const;
const UNCERTAINTIES = ['low', 'moderate', 'high'] as const;
const SEVERITIES = ['mild', 'moderate', 'severe', 'life_threatening', 'fatal'] as const;
const REVERSIBILITIES = ['fully_reversible', 'partially_reversible', 'irreversible'] as const;
const FREQUENCIES = ['very_common', 'common', 'uncommon', 'rare', 'very_rare'] as const;
const ENDPOINT_TYPES = ['mortality', 'irreversible_morbidity', 'symptom', 'function', 'surrogate', 'biomarker'] as const;
const CONDITION_SEVERITIES = ['mild', 'moderate', 'serious', 'severe', 'life_threatening'] as const;
const CONDITION_COURSES = ['acute', 'chronic', 'progressive', 'relapsing', 'episodic'] as const;
const TREATMENT_STATUSES = ['approved', 'off_label', 'supportive_care', 'none'] as const;
const EFFECT_DIRECTIONS = ['favourable', 'unfavourable'] as const;
const EVIDENCE_SOURCES = ['pivotal_rct', 'supportive_rct', 'meta_analysis', 'observational', 'indirect', 'modeling'] as const;
const CRITERION_TYPES = ['benefit', 'risk'] as const;
const WEIGHTING_APPROACHES = ['qualitative', 'swing_weighting', 'mcda'] as const;
const UNCERTAINTY_SOURCE_TYPES = [
  'data_quality', 'extrapolation', 'rare_events', 'indirect_evidence', 'surrogate_endpoint', 'missing_data',
  'external_validity', 'subgroup', 'long_term', 'comparator',
] as const;
const AFFECTED_SIDES = ['benefit', 'risk', 'both'] as const;
const BR_AUDIENCES = ['label', 'advisory_committee', 'prescriber', 'patient', 'payer', 'regulator_internal'] as const;

/** The methodNotes line naming each omitted grade a score used at its middle value. */
function defaultsNote(defaulted: readonly string[]): string[] {
  return defaulted.length === 0
    ? []
    : [`Not stated, so scored at the middle value (a default, not a finding): ${defaulted.join('; ')}.`];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared ordinal scales used across the engine
 * ──────────────────────────────────────────────────────────────────────────── */

/** Five-point clinical-importance / magnitude scale. */
export type MagnitudeLevel = 'negligible' | 'low' | 'moderate' | 'high' | 'very_high';

/** Three-point uncertainty scale used in EMA effects tables and PROTECT. */
export type UncertaintyLevel = 'low' | 'moderate' | 'high';

/** Severity of a harm. */
export type SeverityLevel = 'mild' | 'moderate' | 'severe' | 'life_threatening' | 'fatal';

/** Reversibility of a harm. */
export type ReversibilityLevel = 'fully_reversible' | 'partially_reversible' | 'irreversible';

/** Effect direction in an effects table. */
export type EffectDirection = 'favourable' | 'unfavourable';

/** Overall benefit-risk verdict. */
export type BRVerdict =
  | 'favourable'
  | 'favourable_with_conditions'
  | 'indeterminate'
  | 'unfavourable';

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 1 — FDA Benefit-Risk Assessment Framework grid
 *   structureBenefitRiskFramework(params): FdaBrFrameworkResult
 * ════════════════════════════════════════════════════════════════════════════ */

/** A treatment option in the current therapeutic landscape. */
export interface TreatmentOption {
  readonly name: string;
  /** Approved, off-label, supportive care, or none. */
  readonly status?: 'approved' | 'off_label' | 'supportive_care' | 'none';
  /** Brief characterization of its limitations. */
  readonly limitations?: string;
}

/** A key benefit claim for the FDA framework Benefit row. */
export interface KeyBenefitClaim {
  readonly description: string;
  /** Endpoint type supporting the benefit. */
  readonly endpointType?: 'mortality' | 'irreversible_morbidity' | 'symptom' | 'function' | 'surrogate' | 'biomarker';
  readonly magnitude?: MagnitudeLevel;
  readonly uncertainty?: UncertaintyLevel;
}

/** A key risk for the FDA framework Risk row. */
export interface KeyRiskItem {
  readonly description: string;
  readonly severity?: SeverityLevel;
  readonly reversibility?: ReversibilityLevel;
  readonly frequency?: 'very_common' | 'common' | 'uncommon' | 'rare' | 'very_rare';
  readonly uncertainty?: UncertaintyLevel;
  /** Whether the risk is preventable/manageable. */
  readonly manageable?: boolean;
}

export interface StructureBenefitRiskFrameworkParams {
  readonly productName: string;
  readonly indication: string;
  /** Severity/seriousness of the condition being treated. */
  readonly conditionSeverity?: 'mild' | 'moderate' | 'serious' | 'severe' | 'life_threatening';
  /** Chronic, acute, progressive, etc. */
  readonly conditionCourse?: 'acute' | 'chronic' | 'progressive' | 'relapsing' | 'episodic';
  /** Affected population size descriptor. */
  readonly populationDescriptor?: string;
  /** Whether an unmet medical need exists. */
  readonly unmetMedicalNeed?: boolean;
  readonly currentTreatments?: readonly TreatmentOption[];
  readonly keyBenefits?: readonly KeyBenefitClaim[];
  readonly keyRisks?: readonly KeyRiskItem[];
  readonly riskManagementTools?: readonly string[];
}

/** A single row of the FDA framework grid. */
export interface FdaFrameworkRow {
  readonly dimension:
    | 'Analysis of Condition'
    | 'Current Treatment Options'
    | 'Benefit'
    | 'Risk and Risk Management';
  readonly evidenceAndUncertainties: string[];
  readonly conclusionsAndReasons: string;
}

export interface FdaBrFrameworkResult {
  readonly productName: string;
  readonly indication: string;
  readonly framework: 'FDA Benefit-Risk Assessment Framework';
  readonly rows: FdaFrameworkRow[];
  readonly integratedAssessmentNarrative: string;
  /** null while unmetMedicalNeed is not stated and the treatment options supplied do not settle it. */
  readonly unmetNeedConsidered: boolean | null;
  /** null while conditionSeverity is not stated. */
  readonly severityContextScore: number | null;
  /** Each true/false input: true, false or not_stated. */
  readonly inputStates: Record<string, BooleanState>;
  /** The conclusions an unstated fact leaves open. */
  readonly undecided: Undecided[];
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

/**
 * Build the FDA Benefit-Risk Assessment Framework grid for a product/indication.
 * Returns the four substantive rows (Analysis of Condition, Current Treatment
 * Options, Benefit, Risk and Risk Management) plus an integrated assessment
 * narrative, per the FDA 2023 guidance and PDUFA VI/VII commitments.
 */
export function structureBenefitRiskFramework(
  params: StructureBenefitRiskFrameworkParams,
): FdaBrFrameworkResult {
  // 2026-11-09 (S5d): an omitted unmet need beside an approved option read "Effective alternatives exist", an omitted
  // manageable "Considered manageable", an omitted severity "of lower severity"; 'false' or 'Severe' was misread.
  const productName = norm(statedText('productName', params.productName), 'the investigational product');
  const indication = norm(statedText('indication', params.indication), 'the proposed indication');
  const conditionSeverity = statedOneOf('conditionSeverity', params.conditionSeverity, CONDITION_SEVERITIES);
  const conditionCourse = statedOneOf('conditionCourse', params.conditionCourse, CONDITION_COURSES);
  const populationDescriptor = statedText('populationDescriptor', params.populationDescriptor);
  const unmetStated = statedBoolean('unmetMedicalNeed', params.unmetMedicalNeed);
  const treatmentList = statedList('currentTreatments', params.currentTreatments);
  const treatments: TreatmentOption[] = entries('currentTreatments', treatmentList).map((t: Reader) => ({
    name: t.text('name') ?? '', status: t.oneOf('status', TREATMENT_STATUSES), limitations: t.text('limitations'),
  }));
  const benefits: KeyBenefitClaim[] = entries('keyBenefits', params.keyBenefits).map((b: Reader) => ({
    description: b.text('description') ?? '', endpointType: b.oneOf('endpointType', ENDPOINT_TYPES),
    magnitude: b.oneOf('magnitude', MAGNITUDES), uncertainty: b.oneOf('uncertainty', UNCERTAINTIES),
  }));
  const risks: KeyRiskItem[] = entries('keyRisks', params.keyRisks).map((r: Reader) => ({
    description: r.text('description') ?? '', severity: r.oneOf('severity', SEVERITIES),
    reversibility: r.oneOf('reversibility', REVERSIBILITIES), frequency: r.oneOf('frequency', FREQUENCIES),
    uncertainty: r.oneOf('uncertainty', UNCERTAINTIES), manageable: r.bool('manageable'),
  }));
  const rmTools = statedTexts('riskManagementTools', params.riskManagementTools) ?? [];
  const inputStates: Record<string, BooleanState> = {
    unmetMedicalNeed: unmetStated ?? 'not_stated',
    ...Object.fromEntries(risks.map((r: KeyRiskItem, i: number) => [`keyRisks[${i}].manageable`, r.manageable ?? 'not_stated'])),
  };
  const undecided: Undecided[] = [];
  const defaulted: string[] = [];
  const methodNotes: string[] = [];
  const citationIds: string[] = [
    'FDA_BR_FRAMEWORK_2023',
    'FDA_BR_FRAMEWORK_GRID',
    'FDA_PDUFA_VI',
    'FDA_PDUFA_VII',
  ];

  // ── Row 1: Analysis of Condition ──────────────────────────────────────────
  const conditionEvidence: string[] = [];
  conditionEvidence.push(`Indication under review: ${indication}.`);
  conditionEvidence.push(describeConditionSeverity(conditionSeverity));
  conditionEvidence.push(describeConditionCourse(conditionCourse));
  if (populationDescriptor) {
    conditionEvidence.push(`Affected population: ${norm(populationDescriptor, 'not specified')}.`);
  }
  const severityRank = conditionSeverity !== undefined ? CONDITION_SEVERITY_RANK[conditionSeverity] ?? 0.5 : null;
  const conditionConclusion =
    severityRank === null
      ? 'Not assessed: the condition severity was not stated (conditionSeverity), so the acceptable level of risk and uncertainty is not anchored to disease burden.'
      : severityRank >= 0.65
        ? 'The condition is serious or life-threatening, which raises the acceptable level of risk and uncertainty in the benefit-risk judgment.'
        : 'The condition is of lower severity, which sets a higher safety bar and lowers tolerance for serious or irreversible harms.';

  // ── Row 2: Current Treatment Options ──────────────────────────────────────
  const treatmentEvidence: string[] = [];
  if (treatments.length === 0) {
    treatmentEvidence.push('No current treatment options were supplied for analysis.');
  } else {
    for (const t of treatments) {
      const lim = t.limitations ? ` Limitation: ${norm(t.limitations, 'not specified')}.` : '';
      treatmentEvidence.push(`${norm(t.name, 'unnamed option')} (${t.status ?? 'status not stated'}).${lim}`);
    }
  }
  // The list shows an unmet need when it is stated and empty, or every option is absent or supportive only. A stated
  // approved or off-label option says nothing either way; an option of unstated status leaves the list undecided.
  const listShowsUnmet: boolean | undefined =
    treatmentList === undefined
      ? false
      : treatments.length === 0
        ? true
        : treatments.some((t: TreatmentOption) => t.status === 'approved' || t.status === 'off_label')
          ? false
          : treatments.every((t: TreatmentOption) => t.status === 'none' || t.status === 'supportive_care')
            ? true
            : undefined;
  const unmetNeed: boolean | null =
    unmetStated === true || listShowsUnmet === true ? true : unmetStated === false && listShowsUnmet === false ? false : null;
  if (unmetNeed === true) {
    treatmentEvidence.push(
      'An unmet medical need is present: available options are absent, supportive only, or materially limited.',
    );
  } else if (unmetNeed === null) {
    const open = [
      ...(unmetStated === undefined ? ['unmetMedicalNeed'] : []),
      // An option of unstated status decides nothing once a stated approved or off-label option settles the list.
      ...(listShowsUnmet === false
        ? []
        : treatments.flatMap((t: TreatmentOption, i: number) => (t.status === undefined ? [`currentTreatments[${i}].status`] : []))),
    ];
    treatmentEvidence.push(`Whether an unmet medical need exists was not stated (${listed(open)}).`);
    undecided.push({ conclusion: 'unmetNeedConsidered', decidingFacts: open, couldBe: [true, false] });
  }
  const treatmentConclusion =
    unmetNeed === true
      ? 'Because available therapy is inadequate, a meaningful incremental benefit can justify a higher level of risk.'
      : unmetNeed === false
        ? 'Effective alternatives exist; the product must show a favourable benefit-risk profile relative to, not merely in addition to, the current standard of care.'
        : 'Not assessed: whether available therapy is adequate was not stated, so the level of risk an incremental benefit can justify is not anchored to it.';

  // ── Row 3: Benefit ────────────────────────────────────────────────────────
  const benefitEvidence: string[] = [];
  if (benefits.length === 0) {
    benefitEvidence.push('No key benefits were supplied; the Benefit row cannot be substantiated.');
  } else {
    for (const b of benefits) {
      const mag = b.magnitude ? ` Magnitude: ${b.magnitude}.` : '';
      const unc = b.uncertainty ? ` Uncertainty: ${b.uncertainty}.` : '';
      benefitEvidence.push(
        `${norm(b.description, 'unspecified benefit')} — ${describeBenefitEndpoint(b.endpointType)}.${mag}${unc}`,
      );
    }
  }
  // deterministic aggregate benefit score
  let benefitAgg = 0;
  benefits.forEach((b: KeyBenefitClaim, i: number) => {
    if (b.magnitude === undefined) defaulted.push(`keyBenefits[${i}].magnitude (moderate)`);
    if (b.uncertainty === undefined) defaulted.push(`keyBenefits[${i}].uncertainty (certainty 0.82)`);
    const m = magnitudeScore(b.magnitude ?? 'moderate');
    const u = b.uncertainty ? 1 - uncertaintyPenalty(b.uncertainty) : 0.82;
    benefitAgg += m * u;
  });
  const benefitScore = benefits.length > 0 ? round(benefitAgg / benefits.length, 3) : 0;
  const benefitConclusion =
    benefits.length === 0
      ? 'No benefits were characterized on the supplied evidence; the Benefit row cannot anchor any favourable weight.'
      : benefitScore >= 0.55
        ? 'The demonstrated benefit is clinically meaningful and supported with acceptable certainty.'
        : benefitScore >= 0.3
          ? 'The benefit is modest or carries notable uncertainty; its weight in the balance is limited.'
          : 'The benefit is small or insufficiently substantiated to anchor a favourable conclusion.';

  // ── Row 4: Risk and Risk Management ───────────────────────────────────────
  const riskEvidence: string[] = [];
  if (risks.length === 0) {
    riskEvidence.push('No key risks were supplied; the safety profile is uncharacterized in this grid.');
  } else {
    for (const r of risks) {
      const sev = r.severity ? ` Severity: ${r.severity}.` : '';
      const rev = r.reversibility ? ` Reversibility: ${r.reversibility}.` : '';
      const freq = ` Frequency: ${frequencyToProseFda(r.frequency)}.`;
      const mng =
        r.manageable === false
          ? ' Not readily manageable.'
          : r.manageable === true
            ? ' Considered manageable with stated measures.'
            : ' Manageability not stated.';
      riskEvidence.push(`${norm(r.description, 'unspecified risk')} —${sev}${rev}${freq}${mng}`);
    }
  }
  if (rmTools.length > 0) {
    riskEvidence.push(`Risk management tools proposed: ${rmTools.map((s: string) => norm(s, 'unnamed')).join('; ')}.`);
  } else {
    riskEvidence.push('No specific risk-management tools were proposed; routine pharmacovigilance and labeling are assumed.');
  }
  // deterministic aggregate risk score, on each answer to an unstated manageable (the score falls as more are true)
  risks.forEach((r: KeyRiskItem, i: number) => {
    if (r.severity === undefined) defaulted.push(`keyRisks[${i}].severity (moderate)`);
    if (r.reversibility === undefined) defaulted.push(`keyRisks[${i}].reversibility (partially_reversible)`);
  });
  const riskScoreOn = (unstatedManageable: boolean): number => {
    let riskAgg = 0;
    for (const r of risks) {
      const s = severityScore(r.severity ?? 'moderate');
      const rev = reversibilityMultiplier(r.reversibility ?? 'partially_reversible');
      const manage = (r.manageable ?? unstatedManageable) === false ? 1.0 : 0.8;
      riskAgg += s * rev * manage;
    }
    return risks.length > 0 ? round(riskAgg / risks.length, 3) : 0;
  };
  const riskLow = riskScoreOn(true);
  const riskHigh = riskScoreOn(false);
  const riskScore: number | null = riskLow === riskHigh ? riskLow : null;
  const manageabilityOpen = risks.flatMap((r: KeyRiskItem, i: number) =>
    r.manageable === undefined ? [`keyRisks[${i}].manageable`] : [],
  );
  const riskBand = (score: number): string =>
    score >= 0.6
      ? 'The principal risks are serious and/or irreversible; effective risk management is essential to a favourable conclusion.'
      : score >= 0.35
        ? 'The risks are of moderate concern and appear addressable through labeling and routine pharmacovigilance.'
        : 'The identified risks are limited in severity and reversibility and are readily manageable.';
  // riskScore is 0 both when risks are genuinely minimal AND when NO risks were
  // characterized; only the latter must not read as a favourable safety finding.
  // An uncharacterized safety profile is a non-determination, not "readily
  // manageable" — the seal is the wrong place to imply a risk grade nobody gave.
  const riskConclusion =
    risks.length === 0
      ? 'No risks were characterized on the supplied evidence; the safety profile is not established and no risk determination can be made.'
      : riskBand(riskLow) === riskBand(riskHigh)
        ? riskBand(riskLow)
        : `Not assessed: the risk conclusion turns on whether ${listed(manageabilityOpen)} holds, which was not stated.`;
  if (riskScore === null) {
    undecided.push({ conclusion: 'riskWeight', decidingFacts: manageabilityOpen, couldBe: [riskLow, riskHigh] });
  }

  const rows: FdaFrameworkRow[] = [
    {
      dimension: 'Analysis of Condition',
      evidenceAndUncertainties: conditionEvidence,
      conclusionsAndReasons: conditionConclusion,
    },
    {
      dimension: 'Current Treatment Options',
      evidenceAndUncertainties: treatmentEvidence,
      conclusionsAndReasons: treatmentConclusion,
    },
    {
      dimension: 'Benefit',
      evidenceAndUncertainties: benefitEvidence,
      conclusionsAndReasons: benefitConclusion,
    },
    {
      dimension: 'Risk and Risk Management',
      evidenceAndUncertainties: riskEvidence,
      conclusionsAndReasons: riskConclusion,
    },
  ];

  // Integrated narrative — deterministic composition of the four rows.
  const netOf = (risk: number): number => round(benefitScore - risk, 3);
  const netBand = (net: number): string =>
    net >= 0.2
      ? 'the weight of benefit clearly exceeds the weight of risk'
      : net >= 0.0
        ? 'benefit modestly exceeds risk, with the margin sensitive to risk management'
        : net >= -0.2
          ? 'benefit and risk are closely balanced and the conclusion is sensitive to uncertainty'
          : 'the weight of risk exceeds the demonstrated benefit on the supplied evidence';
  let netPhrase: string;
  // A directional balance requires BOTH sides characterized. With either side
  // empty, net is an artefact of a zero score (an uncharacterized dimension),
  // not a real margin — so net>=0 must NOT read as "benefit exceeds risk".
  // Refuse the direction and name what was not characterized.
  if (benefits.length === 0 || risks.length === 0) {
    const missing =
      benefits.length === 0 && risks.length === 0
        ? 'neither benefit nor risk was characterized'
        : benefits.length === 0
          ? 'no benefit was characterized'
          : 'no risk was characterized';
    netPhrase = `the overall balance cannot be determined on the supplied evidence, because ${missing}`;
  } else if (netBand(netOf(riskHigh)) === netBand(netOf(riskLow))) {
    netPhrase = netBand(netOf(riskLow));
  } else {
    netPhrase = `the overall balance is not determined, because it turns on ${listed(manageabilityOpen)}, which was not stated`;
    undecided.push({
      conclusion: 'overallBalance',
      decidingFacts: manageabilityOpen,
      couldBe: [netBand(netOf(riskHigh)), netBand(netOf(riskLow))],
    });
  }
  const weights =
    riskScore === null
      ? `benefit weight ${benefitScore}, risk weight from ${riskLow} to ${riskHigh} and net from ${netOf(riskHigh)} to ` +
        `${netOf(riskLow)} as ${listed(manageabilityOpen)} is answered`
      : `benefit weight ${benefitScore}, risk weight ${riskScore}, net ${netOf(riskScore)}`;

  const integratedAssessmentNarrative =
    `For ${productName} in ${indication}, the FDA Benefit-Risk Framework integrates the four ` +
    `dimensions as follows. ${conditionConclusion} ${treatmentConclusion} On the evidence supplied, ` +
    `${benefitConclusion.toLowerCase().replace(/\.$/, '')}, while ${riskConclusion.toLowerCase().replace(/\.$/, '')}. ` +
    `Taken together (${weights}), ${netPhrase}. ` +
    `This framework summary is the structured input to the regulatory benefit-risk decision; ` +
    `it is not itself the decision.`;

  methodNotes.push(
    'Rows follow the FDA Benefit-Risk Assessment Framework (Analysis of Condition; Current Treatment ' +
      'Options; Benefit; Risk and Risk Management) leading to Conclusions, per FDA 2023 guidance.',
  );
  methodNotes.push(
    'Benefit/risk weights are deterministic ordinal aggregations intended to organize the evidence; ' +
      'they do not replace expert regulatory judgment and are not probability estimates.',
  );
  methodNotes.push(...defaultsNote(defaulted));

  return {
    productName,
    indication,
    framework: 'FDA Benefit-Risk Assessment Framework',
    rows,
    integratedAssessmentNarrative,
    unmetNeedConsidered: unmetNeed,
    severityContextScore: severityRank === null ? null : round(severityRank, 3),
    inputStates,
    undecided,
    citations: citeAll(citationIds),
    methodNotes,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 2 — EMA-style effects table
 *   buildEffectsTable(params): EffectsTableResult
 * ════════════════════════════════════════════════════════════════════════════ */

/** A single effect (favourable or unfavourable) for an EMA effects table. */
export interface EffectInput {
  readonly name: string;
  readonly direction: EffectDirection;
  /** Treatment-arm value (point estimate). */
  readonly treatmentValue?: number;
  /** Control/comparator-arm value (point estimate). */
  readonly controlValue?: number;
  /** Effect measure unit (e.g. "%", "mmHg", "events/100 patient-years"). */
  readonly unit?: string;
  /** Lower confidence bound on the treatment-vs-control difference. */
  readonly ciLow?: number;
  /** Upper confidence bound on the treatment-vs-control difference. */
  readonly ciHigh?: number;
  /** Ordinal magnitude judgment (if a numeric estimate is unavailable). */
  readonly magnitude?: MagnitudeLevel;
  readonly uncertainty?: UncertaintyLevel;
  /** Strength/source of evidence. */
  readonly evidenceSource?: 'pivotal_rct' | 'supportive_rct' | 'meta_analysis' | 'observational' | 'indirect' | 'modeling';
  /** Free-text reference string (study id, citation). */
  readonly reference?: string;
}

export interface BuildEffectsTableParams {
  readonly productName: string;
  readonly indication: string;
  readonly comparator?: string;
  readonly effects: readonly EffectInput[];
}

/** A fully resolved effects-table row, EMA style. */
export interface EffectsTableRow {
  readonly effect: string;
  readonly direction: EffectDirection;
  readonly unit: string;
  readonly treatmentValue: number | null;
  readonly controlValue: number | null;
  readonly absoluteDifference: number | null;
  readonly confidenceInterval: string;
  readonly magnitude: MagnitudeLevel;
  readonly uncertainty: UncertaintyLevel;
  readonly evidenceSource: string;
  readonly reference: string;
  readonly uncertaintiesAndStrengthOfEvidence: string;
}

export interface EffectsTableResult {
  readonly productName: string;
  readonly indication: string;
  readonly comparator: string;
  readonly tableTitle: string;
  readonly favourableEffects: EffectsTableRow[];
  readonly unfavourableEffects: EffectsTableRow[];
  readonly favourableCount: number;
  readonly unfavourableCount: number;
  readonly aggregateFavourableMagnitude: number;
  readonly aggregateUnfavourableMagnitude: number;
  readonly overallEvidenceQuality: UncertaintyLevel;
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

function buildEffectsRow(effect: EffectInput): EffectsTableRow {
  const name = norm(effect.name, 'unnamed effect');
  const unit = norm(effect.unit, '—');
  const tv = effect.treatmentValue ?? null;
  const cv = effect.controlValue ?? null;
  const absDiff = tv !== null && cv !== null ? round(tv - cv, 4) : null;
  const ci =
    effect.ciLow !== undefined && effect.ciHigh !== undefined
      ? `[${round(effect.ciLow, 4)}, ${round(effect.ciHigh, 4)}]`
      : 'not reported';
  const magnitude = deriveMagnitude(effect);
  const floor = evidenceSourceUncertaintyFloor(effect.evidenceSource);
  const declared = effect.uncertainty ?? 'moderate';
  const uncertainty = worseUncertainty(floor, declared);
  const evidenceSource = evidenceSourceProse(effect.evidenceSource);
  const reference = norm(effect.reference, 'reference not provided');

  // Deterministic uncertainty/strength annotation, EMA style.
  let ciNote: string;
  if (effect.ciLow !== undefined && effect.ciHigh !== undefined) {
    const crossesNull = effect.ciLow <= 0 && effect.ciHigh >= 0;
    ciNote = crossesNull
      ? 'Confidence interval includes the null — statistical significance is not established for this effect.'
      : 'Confidence interval excludes the null — the effect is statistically supported in direction.';
  } else {
    ciNote = 'No confidence interval supplied; precision of the estimate cannot be evaluated from the table.';
  }
  const uncertaintiesAndStrengthOfEvidence =
    `Evidence: ${evidenceSource}. ${ciNote} Overall uncertainty graded ${uncertainty}.`;

  return {
    effect: name,
    direction: effect.direction,
    unit,
    treatmentValue: tv,
    controlValue: cv,
    absoluteDifference: absDiff,
    confidenceInterval: ci,
    magnitude,
    uncertainty,
    evidenceSource,
    reference,
    uncertaintiesAndStrengthOfEvidence,
  };
}

/** One stated effect, refused by field when malformed. */
function readEffect(e: Reader): EffectInput {
  const finite = (k: string): number | undefined => e.num(k, Number.isFinite, 'a finite number');
  return {
    name: e.text('name') ?? '', direction: e.need('direction', EFFECT_DIRECTIONS), treatmentValue: finite('treatmentValue'),
    controlValue: finite('controlValue'), unit: e.text('unit'), ciLow: finite('ciLow'), ciHigh: finite('ciHigh'),
    magnitude: e.oneOf('magnitude', MAGNITUDES), uncertainty: e.oneOf('uncertainty', UNCERTAINTIES),
    evidenceSource: e.oneOf('evidenceSource', EVIDENCE_SOURCES), reference: e.text('reference'),
  };
}

/** The omitted grades a row used at their middle value. */
function effectDefaults(effect: EffectInput, i: number): string[] {
  return [
    ...(effect.magnitude === undefined && (effect.treatmentValue === undefined || effect.controlValue === undefined)
      ? [`effects[${i}].magnitude (moderate: no ordinal judgment or treatment and control values)`]
      : []),
    ...(effect.uncertainty === undefined ? [`effects[${i}].uncertainty (moderate)`] : []),
    ...(effect.evidenceSource === undefined ? [`effects[${i}].evidenceSource (uncertainty floor moderate)`] : []),
  ];
}

/**
 * Build an EMA-style effects table: the standardized tabulation of favourable
 * and unfavourable effects, each with magnitude, units, confidence interval,
 * uncertainty grading, and references. This is the canonical artifact in the
 * benefit-risk section of an EMA assessment report / EPAR.
 */
export function buildEffectsTable(params: BuildEffectsTableParams): EffectsTableResult {
  // 2026-11-09 (S5d): 'Favourable' was tabulated as unfavourable, '12' subtracted, and no list gave an empty table.
  refuseUnlessStated('buildEffectsTable', [listInput('effects', params.effects)], 'tabulated');
  const productName = norm(statedText('productName', params.productName), 'the product');
  const indication = norm(statedText('indication', params.indication), 'the indication');
  const comparator = norm(statedText('comparator', params.comparator), 'comparator / placebo');
  const effects = entries('effects', params.effects).map(readEffect);

  const favourable: EffectsTableRow[] = [];
  const unfavourable: EffectsTableRow[] = [];
  for (const e of effects) {
    const row = buildEffectsRow(e);
    if ((row.direction as EffectDirection) === 'favourable') {
      favourable.push(row);
    } else {
      unfavourable.push(row);
    }
  }

  let favAgg = 0;
  for (const r of favourable) {
    favAgg += magnitudeScore(r.magnitude) * (1 - uncertaintyPenalty(r.uncertainty));
  }
  let unfavAgg = 0;
  for (const r of unfavourable) {
    unfavAgg += magnitudeScore(r.magnitude) * (1 - uncertaintyPenalty(r.uncertainty));
  }
  const aggregateFavourableMagnitude = favourable.length > 0 ? round(favAgg / favourable.length, 3) : 0;
  const aggregateUnfavourableMagnitude = unfavourable.length > 0 ? round(unfavAgg / unfavourable.length, 3) : 0;

  // Overall evidence quality = worst uncertainty present (conservative).
  let overall: UncertaintyLevel = 'low';
  for (const r of [...favourable, ...unfavourable]) {
    overall = worseUncertainty(overall, r.uncertainty);
  }
  if (favourable.length === 0 && unfavourable.length === 0) {
    overall = 'high';
  }

  const defaulted = effects.flatMap(effectDefaults);
  const methodNotes: string[] = [
    'Effects are grouped into favourable and unfavourable per the EMA effects-table convention; ' +
      'each row records magnitude, unit, treatment vs comparator values, confidence interval, ' +
      'evidence source and an explicit uncertainty grade.',
    'Magnitude is taken from the supplied ordinal judgment when present, otherwise derived ' +
      'deterministically from the relative difference between treatment and comparator values.',
    'Overall evidence quality is set to the worst (highest) uncertainty present, consistent with ' +
      'a conservative regulatory reading.',
    ...defaultsNote(defaulted),
  ];

  return {
    productName,
    indication,
    comparator,
    tableTitle: `Effects Table — ${productName} vs ${comparator} in ${indication}`,
    favourableEffects: favourable,
    unfavourableEffects: unfavourable,
    favourableCount: favourable.length,
    unfavourableCount: unfavourable.length,
    aggregateFavourableMagnitude,
    aggregateUnfavourableMagnitude,
    overallEvidenceQuality: overall,
    citations: citeAll(['EMA_EFFECTS_TABLE', 'EMA_BR_METHODOLOGY', 'IMI_PROTECT_BRAT']),
    methodNotes,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 3 — Deterministic benefit-risk balance assessment
 *   assessBenefitRiskBalance(params): BenefitRiskBalanceResult
 * ════════════════════════════════════════════════════════════════════════════ */

/** A weighted key benefit for the balance assessment. */
export interface WeightedBenefit {
  readonly name: string;
  readonly magnitude: MagnitudeLevel;
  readonly uncertainty?: UncertaintyLevel;
  readonly endpointType?: KeyBenefitClaim['endpointType'];
  /** Optional relative importance weight (0..1); defaults derived from endpoint. */
  readonly weight?: number;
  /** Population(s) in which this benefit applies. */
  readonly population?: string;
}

/** A weighted key risk for the balance assessment. */
export interface WeightedRisk {
  readonly name: string;
  readonly severity: SeverityLevel;
  readonly reversibility?: ReversibilityLevel;
  readonly frequency?: KeyRiskItem['frequency'];
  readonly uncertainty?: UncertaintyLevel;
  /** Whether a risk-mitigation measure meaningfully reduces this risk. */
  readonly mitigated?: boolean;
  readonly weight?: number;
  readonly population?: string;
}

export interface AssessBenefitRiskBalanceParams {
  readonly productName: string;
  readonly indication: string;
  readonly conditionSeverity?: StructureBenefitRiskFrameworkParams['conditionSeverity'];
  readonly unmetMedicalNeed?: boolean;
  readonly benefits: readonly WeightedBenefit[];
  readonly risks: readonly WeightedRisk[];
  /** Risk-mitigation measures in place (label warnings, REMS, monitoring). */
  readonly riskMitigations?: readonly string[];
  /** Populations of special interest (subgroups). */
  readonly specialPopulations?: readonly string[];
}

export interface BalanceDriver {
  readonly factor: string;
  readonly direction: 'supports_benefit' | 'supports_risk';
  /** null for a risk whose mitigation was not stated. */
  readonly contribution: number | null;
  readonly rationale: string;
}

export interface BenefitRiskBalanceResult {
  readonly productName: string;
  readonly indication: string;
  /** null unless every answer to the unstated facts (undecided) gives the same verdict. */
  readonly verdict: BRVerdict | null;
  readonly benefitWeight: number;
  /** null while a risk's mitigation is not stated. */
  readonly riskWeight: number | null;
  /** null while unmetMedicalNeed or a risk's mitigation is not stated. */
  readonly netBalance: number | null;
  readonly confidence: number;
  readonly drivers: BalanceDriver[];
  readonly keyBenefitsSummary: string[];
  readonly keyRisksSummary: string[];
  readonly mitigationImpact: string;
  readonly populationConsiderations: string[];
  readonly structuredConclusion: string;
  readonly conditionsForFavourable: string[];
  /** Each true/false input: true, false or not_stated. */
  readonly inputStates: Record<string, BooleanState>;
  /** The conclusions an unstated fact leaves open. */
  readonly undecided: Undecided[];
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

/** The verdict for a net balance and confidence (fixed, deterministic thresholds). */
function verdictFor(net: number, confidence: number, bothSides: boolean): BRVerdict {
  // Both sides must be characterized for a directional verdict. Guarding only
  // empty benefits let benefits-with-no-risks reach 'favourable' (riskWeight 0
  // → high net) against an uncharacterized safety profile — a favourable
  // determination the evidence does not support. Empty EITHER side ⇒ indeterminate.
  if (!bothSides) return 'indeterminate';
  if (net >= 0.18 && confidence >= 0.65) return 'favourable';
  if (net >= 0.05) return 'favourable_with_conditions';
  if (net > -0.1) return 'indeterminate';
  return 'unfavourable';
}

/** The verdict in words, for the structured conclusion. */
function verdictPhraseFor(verdict: BRVerdict): string {
  switch (verdict) {
    case 'favourable':
      return 'favourable';
    case 'favourable_with_conditions':
      return 'favourable conditional on the stated risk management and remaining-uncertainty actions';
    case 'indeterminate':
      return 'not determinable as clearly favourable on the supplied evidence (closely balanced)';
    case 'unfavourable':
      return 'unfavourable';
    default:
      return 'indeterminate';
  }
}

/**
 * Deterministic benefit-risk balance assessment that integrates key benefits,
 * key risks, severity, reversibility, populations, and risk mitigation into a
 * structured conclusion with the principal drivers made explicit. Mirrors the
 * integrative judgment expected in ICH M4E(R2) §2.5.6 and CIOMS IV.
 */
export function assessBenefitRiskBalance(
  params: AssessBenefitRiskBalanceParams,
): BenefitRiskBalanceResult {
  // 2026-11-09 (S5d): an omitted unmet need or mitigation read as false and the verdict was given anyway; 'true',
  // 'large' or 'heavy' was read as false, 0.5 or NaN.
  refuseUnlessStated('assessBenefitRiskBalance', [listInput('benefits', params.benefits), listInput('risks', params.risks)], 'weighed');
  const productName = norm(statedText('productName', params.productName), 'the product');
  const indication = norm(statedText('indication', params.indication), 'the indication');
  const conditionSeverity = statedOneOf('conditionSeverity', params.conditionSeverity, CONDITION_SEVERITIES);
  const unmetStated = statedBoolean('unmetMedicalNeed', params.unmetMedicalNeed);
  const weight = 'a number from 0 to 1';
  const benefits: WeightedBenefit[] = entries('benefits', params.benefits).map((b: Reader) => ({
    name: b.text('name') ?? '', magnitude: b.need('magnitude', MAGNITUDES), uncertainty: b.oneOf('uncertainty', UNCERTAINTIES),
    endpointType: b.oneOf('endpointType', ENDPOINT_TYPES), weight: b.num('weight', unitWeight, weight), population: b.text('population'),
  }));
  const risks: WeightedRisk[] = entries('risks', params.risks).map((r: Reader) => ({
    name: r.text('name') ?? '', severity: r.need('severity', SEVERITIES), reversibility: r.oneOf('reversibility', REVERSIBILITIES),
    frequency: r.oneOf('frequency', FREQUENCIES), uncertainty: r.oneOf('uncertainty', UNCERTAINTIES), mitigated: r.bool('mitigated'),
    weight: r.num('weight', unitWeight, weight), population: r.text('population'),
  }));
  const mitigations = statedTexts('riskMitigations', params.riskMitigations) ?? [];
  const specialPopulations = statedTexts('specialPopulations', params.specialPopulations) ?? [];
  const inputStates: Record<string, BooleanState> = {
    unmetMedicalNeed: unmetStated ?? 'not_stated',
    ...Object.fromEntries(risks.map((r: WeightedRisk, i: number) => [`risks[${i}].mitigated`, r.mitigated ?? 'not_stated'])),
  };
  const defaulted: string[] = [];
  const undecided: Undecided[] = [];

  const drivers: BalanceDriver[] = [];
  const keyBenefitsSummary: string[] = [];
  const keyRisksSummary: string[] = [];

  // ── Benefit weight ────────────────────────────────────────────────────────
  let benefitNumer = 0;
  let benefitDenom = 0;
  benefits.forEach((b: WeightedBenefit, i: number) => {
    if (b.weight === undefined && b.endpointType === undefined) defaulted.push(`benefits[${i}].endpointType (weight 0.6)`);
    if (b.uncertainty === undefined) defaulted.push(`benefits[${i}].uncertainty (moderate)`);
    const w = b.weight !== undefined ? clamp(b.weight, 0, 1) : defaultBenefitWeight(b.endpointType);
    const m = magnitudeScore(b.magnitude);
    const certainty = b.uncertainty ? 1 - uncertaintyPenalty(b.uncertainty) : 0.82;
    const contribution = round(w * m * certainty, 4);
    benefitNumer += contribution;
    benefitDenom += w;
    keyBenefitsSummary.push(
      `${norm(b.name, 'unnamed benefit')}: magnitude ${b.magnitude}, weight ${round(w, 2)}` +
        (b.uncertainty ? `, uncertainty ${b.uncertainty}` : '') +
        (b.population ? `, population ${norm(b.population, 'overall')}` : '') + '.',
    );
    drivers.push({
      factor: `Benefit: ${norm(b.name, 'unnamed benefit')}`,
      direction: 'supports_benefit',
      contribution,
      rationale:
        `Endpoint ${b.endpointType ?? 'unspecified'} weighted ${round(w, 2)}; magnitude ${b.magnitude} ` +
        `discounted for ${b.uncertainty ?? 'moderate'} uncertainty.`,
    });
  });
  const benefitWeight = benefitDenom > 0 ? round(benefitNumer / benefitDenom, 3) : 0;

  // ── Risk weight, on each answer to an unstated mitigation (it falls as more are true) ──
  const riskTerms = risks.map((r: WeightedRisk, i: number) => {
    if (r.weight === undefined && r.frequency === undefined) defaulted.push(`risks[${i}].frequency (weight 0.6)`);
    if (r.reversibility === undefined) defaulted.push(`risks[${i}].reversibility (partially_reversible)`);
    if (r.uncertainty === undefined) defaulted.push(`risks[${i}].uncertainty (moderate)`);
    const w = r.weight !== undefined ? clamp(r.weight, 0, 1) : defaultRiskFrequencyWeight(r.frequency);
    const s = severityScore(r.severity);
    const rev = reversibilityMultiplier(r.reversibility ?? 'partially_reversible');
    return { r, w, harm: w * s * rev };
  });
  const contributionOf = (harm: number, mitigated: boolean): number => round(harm * (mitigated ? 0.7 : 1.0), 4);
  /** The risk weight on one answer to each unstated mitigation (risks[i]). */
  const riskWeightFor = (answer: (i: number) => boolean): number => {
    let riskNumer = 0;
    let riskDenom = 0;
    riskTerms.forEach((t: { r: WeightedRisk; w: number; harm: number }, i: number) => {
      riskNumer += contributionOf(t.harm, t.r.mitigated ?? answer(i));
      riskDenom += t.w;
    });
    return riskDenom > 0 ? round(riskNumer / riskDenom, 3) : 0;
  };
  const riskWeightOn = (unstatedMitigated: boolean): number => riskWeightFor(() => unstatedMitigated);
  riskTerms.forEach((t: { r: WeightedRisk; w: number; harm: number }, i: number) => {
    const r = t.r;
    keyRisksSummary.push(
      `${norm(r.name, 'unnamed risk')}: severity ${r.severity}, reversibility ${r.reversibility ?? 'partially_reversible'}` +
        (r.frequency ? `, frequency ${r.frequency}` : '') +
        (r.mitigated === true ? ', mitigated' : r.mitigated === undefined ? ', mitigation not stated' : '') +
        (r.population ? `, population ${norm(r.population, 'overall')}` : '') + '.',
    );
    drivers.push({
      factor: `Risk: ${norm(r.name, 'unnamed risk')}`,
      direction: 'supports_risk',
      contribution: r.mitigated === undefined ? null : contributionOf(t.harm, r.mitigated),
      rationale:
        `Severity ${r.severity}, ${r.reversibility ?? 'partially_reversible'}, frequency weight ${round(t.w, 2)}` +
        (r.mitigated === true
          ? '; reduced ~30% by mitigation.'
          : r.mitigated === false
            ? '; no mitigation credit applied.'
            : `; mitigation not stated (risks[${i}].mitigated), so its contribution is not given.`),
    });
  });
  const mitigationOpen = riskTerms.flatMap((t: { r: WeightedRisk; w: number }, i: number) =>
    t.r.mitigated === undefined && t.w > 0 ? [`risks[${i}].mitigated`] : [],
  );
  const riskLow = riskWeightOn(true);
  const riskHigh = riskWeightOn(false);
  const riskWeight: number | null = riskLow === riskHigh ? riskLow : null;
  if (riskWeight === null) undecided.push({ conclusion: 'riskWeight', decidingFacts: mitigationOpen, couldBe: [riskLow, riskHigh] });

  // ── Net balance, adjusted for unmet need / condition severity ─────────────
  const severityRank = conditionSeverity !== undefined ? CONDITION_SEVERITY_RANK[conditionSeverity] ?? 0.5 : 0.5;
  if (conditionSeverity === undefined) defaulted.push('conditionSeverity (no severity credit)');
  // Higher disease severity / unmet need raises risk tolerance (additive credit
  // to net, bounded), reflecting FDA framework "Analysis of Condition" logic.
  const severityCredit = round((severityRank - 0.5) * 0.3, 4);
  const netOn = (unmet: boolean, risk: number): number => round(benefitWeight - risk + severityCredit + (unmet ? 0.08 : 0), 3);
  const netBest = netOn(unmetStated ?? true, riskLow);
  const netWorst = netOn(unmetStated ?? false, riskHigh);
  const net: number | null = netBest === netWorst ? netBest : null;
  const netOpen = [...(unmetStated === undefined ? ['unmetMedicalNeed'] : []), ...mitigationOpen];
  if (net === null) undecided.push({ conclusion: 'netBalance', decidingFacts: netOpen, couldBe: [netWorst, netBest] });
  if (severityCredit !== 0) {
    drivers.push({
      factor: 'Disease severity context',
      direction: severityCredit >= 0 ? 'supports_benefit' : 'supports_risk',
      contribution: Math.abs(severityCredit),
      rationale:
        `Condition severity (${conditionSeverity ?? 'unspecified'}) adjusts risk tolerance by ${severityCredit}.`,
    });
  }
  if (unmetStated === true) {
    drivers.push({
      factor: 'Unmet medical need',
      direction: 'supports_benefit',
      contribution: 0.08,
      rationale: 'Inadequate existing therapy raises the acceptable level of risk for an incremental benefit.',
    });
  } else if (unmetStated === undefined) {
    drivers.push({
      factor: 'Unmet medical need',
      direction: 'supports_benefit',
      contribution: null,
      rationale: 'Not stated (unmetMedicalNeed): a stated true adds a 0.08 credit, a stated false none.',
    });
  }

  // ── Confidence (driven by uncertainty across benefits and risks) ──────────
  let penaltyAcc = 0;
  let penaltyCount = 0;
  for (const b of benefits) {
    penaltyAcc += uncertaintyPenalty(b.uncertainty ?? 'moderate');
    penaltyCount += 1;
  }
  for (const r of risks) {
    penaltyAcc += uncertaintyPenalty(r.uncertainty ?? 'moderate');
    penaltyCount += 1;
  }
  const avgPenalty = penaltyCount > 0 ? penaltyAcc / penaltyCount : 0.18;
  const confidence = round(clamp(1 - avgPenalty, 0, 1), 3);

  // ── Verdict: the same on every answer to the unstated facts, or none ──────
  // The verdict rises with net, and net with each unstated fact answered true, so
  // the best and worst answers bound every other.
  const bothSides = benefits.length > 0 && risks.length > 0;
  const verdictBest = verdictFor(netBest, confidence, bothSides);
  const verdictWorst = verdictFor(netWorst, confidence, bothSides);
  const verdict: BRVerdict | null = verdictBest === verdictWorst ? verdictBest : null;
  if (verdict === null) {
    // couldBe holds the verdicts the answers give: a verdict between the bounds that no answer reaches is left out.
    // Past 12 unstated facts (4,096 answers) it is every verdict from the worst to the best.
    const order: BRVerdict[] = ['unfavourable', 'indeterminate', 'favourable_with_conditions', 'favourable'];
    const between = order.slice(order.indexOf(verdictWorst), order.indexOf(verdictBest) + 1);
    const facts = Object.fromEntries(netOpen.map((k: string) => [k, undefined])) as Record<string, boolean | undefined>;
    const verdictOn = (a: Record<string, boolean>): BRVerdict =>
      verdictFor(netOn(unmetStated ?? a.unmetMedicalNeed, riskWeightFor((i: number) => a[`risks[${i}].mitigated`] ?? true)), confidence, bothSides);
    const given = netOpen.length <= 12 ? conclusions(facts, verdictOn) : between;
    undecided.push({ conclusion: 'verdict', decidingFacts: netOpen, couldBe: between.filter((v: BRVerdict) => given.includes(v)) });
  }

  // ── Mitigation impact ─────────────────────────────────────────────────────
  const mitigatedRisks = risks.filter((r: WeightedRisk) => r.mitigated === true);
  const mitigationImpact =
    (mitigations.length === 0 && mitigatedRisks.length === 0
      ? 'No risk-mitigation measures were credited; the balance rests on the intrinsic safety profile and labeling.'
      : `Risk mitigation (${mitigations.map((s: string) => norm(s, 'measure')).join('; ') || 'measures applied'}) ` +
        `reduces the weighted impact of ${mitigatedRisks.length} of ${risks.length} key risk(s) and is ` +
        `load-bearing for the conclusion where the net margin is narrow.`) +
    (mitigationOpen.length > 0 ? ` Whether ${listed(mitigationOpen)} holds was not stated.` : '');

  // ── Population considerations ─────────────────────────────────────────────
  const populationConsiderations: string[] = [];
  if (specialPopulations.length > 0) {
    for (const p of specialPopulations) {
      populationConsiderations.push(
        `${norm(p, 'subgroup')}: the overall benefit-risk balance should be checked for heterogeneity; ` +
          'subgroups with higher baseline risk or different benefit may carry a different balance.',
      );
    }
  } else {
    populationConsiderations.push(
      'No special populations were specified; the balance is stated for the overall indicated population only.',
    );
  }
  const benefitPops = benefits
    .filter((b: WeightedBenefit) => b.population !== undefined)
    .map((b: WeightedBenefit) => norm(b.population, 'overall'));
  const riskPops = risks
    .filter((r: WeightedRisk) => r.population !== undefined)
    .map((r: WeightedRisk) => norm(r.population, 'overall'));
  if (benefitPops.length > 0 || riskPops.length > 0) {
    populationConsiderations.push(
      'Benefit and risk are not uniformly distributed: ' +
        `benefits concentrate in [${[...new Set(benefitPops)].join(', ') || 'overall'}] and ` +
        `risks concentrate in [${[...new Set(riskPops)].join(', ') || 'overall'}]; enrichment or ` +
        'restriction of the indicated population can improve the balance.',
    );
  }

  // ── Conditions for a favourable conclusion ────────────────────────────────
  const conditionsForFavourable: string[] = [];
  if (verdict === null) {
    conditionsForFavourable.push(`State ${listed(netOpen)}: the verdict turns on ${netOpen.length > 1 ? 'them' : 'it'}.`);
  }
  if (verdict === 'favourable_with_conditions' || verdict === 'indeterminate') {
    conditionsForFavourable.push('Confirm the durability and magnitude of the principal benefit in the target population.');
    if (risks.some((r: WeightedRisk) => r.mitigated === false)) {
      conditionsForFavourable.push('Strengthen risk minimisation for the serious/irreversible risks not yet credited as mitigated.');
    } else if (mitigationOpen.length > 0) {
      conditionsForFavourable.push(`State whether ${listed(mitigationOpen)} holds; if not, strengthen risk minimisation for it.`);
    }
    if (confidence < 0.65) {
      conditionsForFavourable.push('Reduce key uncertainties (precision of estimates, generalizability) before a firm favourable conclusion.');
    }
  }
  if (verdict === 'unfavourable') {
    conditionsForFavourable.push('A favourable balance would require a materially larger benefit, a narrower higher-benefit population, or substantially reduced serious risk.');
  }

  // ── Structured conclusion ─────────────────────────────────────────────────
  const topBenefit = keyBenefitsSummary.length > 0 ? keyBenefitsSummary[0] : 'no benefit specified';
  const topRisk = keyRisksSummary.length > 0 ? keyRisksSummary[0] : 'no risk specified';
  const weights =
    `(benefit weight ${benefitWeight}, risk weight ${riskWeight ?? 'not determined'}, net ` +
    `${net ?? `from ${netWorst} to ${netBest}`}, confidence ${confidence})`;
  const opening =
    verdict === null
      ? `The benefit-risk balance of ${productName} in ${indication} is not determined on the stated inputs: it turns ` +
        `on ${listed(netOpen)}, which ${netOpen.length > 1 ? 'were' : 'was'} not stated. With ${netOpen.length > 1 ? 'each' : 'it'} ` +
        `answered in the product's favour it is ${verdictPhraseFor(verdictBest)}; otherwise ${verdictPhraseFor(verdictWorst)} ${weights}. `
      : `The benefit-risk balance of ${productName} in ${indication} is ${verdictPhraseFor(verdict)} ${weights}. ` +
        (netOpen.length > 0 ? `The verdict is the same on every answer to ${listed(netOpen)}, which ${netOpen.length > 1 ? 'were' : 'was'} not stated. ` : '');
  const structuredConclusion =
    opening +
    `The conclusion is driven principally by the favourable effect "${topBenefit}" set against the ` +
    `unfavourable effect "${topRisk}". ${mitigationImpact} ` +
    `This is a structured integrative judgment, not a substitute for the regulatory authority's decision.`;

  const methodNotes: string[] = [
    'Benefit and risk weights are importance-weighted ordinal aggregations (clinical-hierarchy weights ' +
      'for benefits; frequency weights for risks; severity × reversibility for harm intensity), discounted ' +
      'for uncertainty. They organize judgment and are not probabilities.',
    'Disease severity and unmet need apply a bounded additive credit to the net balance, reflecting the ' +
      'FDA framework principle that acceptable risk rises with disease seriousness and inadequacy of alternatives.',
    'Verdict thresholds are fixed and deterministic; identical inputs reproduce the identical verdict.',
    ...defaultsNote(defaulted),
  ];

  return {
    productName,
    indication,
    verdict,
    benefitWeight,
    riskWeight,
    netBalance: net,
    confidence,
    drivers,
    keyBenefitsSummary,
    keyRisksSummary,
    mitigationImpact,
    populationConsiderations,
    structuredConclusion,
    conditionsForFavourable,
    inputStates,
    undecided,
    citations: citeAll(['ICH_M4E_R2', 'CIOMS_IV', 'FDA_BR_FRAMEWORK_2023', 'EMA_BR_METHODOLOGY', 'EMA_RMP_GVP_V']),
    methodNotes,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 4 — PrOACT-URL / BRAT value tree
 *   designValueTree(params): ValueTreeResult
 * ════════════════════════════════════════════════════════════════════════════ */

/** A criterion (benefit or risk attribute) in the value tree. */
export interface ValueTreeCriterionInput {
  readonly name: string;
  readonly type: 'benefit' | 'risk';
  /** Outcome measure / endpoint operationalizing the criterion. */
  readonly outcomeMeasure?: string;
  readonly unit?: string;
  /** Importance ranking (1 = most important); used for swing weighting. */
  readonly importanceRank?: number;
  /** Sub-criteria, if the criterion decomposes further. */
  readonly subCriteria?: readonly string[];
}

export interface DesignValueTreeParams {
  readonly productName: string;
  readonly indication: string;
  /** The overall decision objective (the root of the tree). */
  readonly decisionObjective?: string;
  readonly criteria: readonly ValueTreeCriterionInput[];
  /** Weighting approach to recommend/apply. */
  readonly weightingApproach?: 'qualitative' | 'swing_weighting' | 'mcda';
  /** Decision alternatives being compared (e.g. product vs comparator vs no treatment). */
  readonly alternatives?: readonly string[];
}

/** A resolved criterion node in the value tree. */
export interface ValueTreeCriterion {
  readonly name: string;
  readonly type: 'benefit' | 'risk';
  readonly outcomeMeasure: string;
  readonly unit: string;
  readonly importanceRank: number;
  readonly swingWeight: number | null;
  readonly subCriteria: string[];
}

/** PrOACT-URL element mapping. */
export interface ProactUrlElement {
  readonly element: string;
  readonly letter: string;
  readonly content: string;
}

export interface ValueTreeResult {
  readonly productName: string;
  readonly indication: string;
  readonly decisionObjective: string;
  readonly framework: 'PrOACT-URL value tree (IMI PROTECT / BRAT)';
  readonly benefitCriteria: ValueTreeCriterion[];
  readonly riskCriteria: ValueTreeCriterion[];
  readonly alternatives: string[];
  readonly weightingApproach: 'qualitative' | 'swing_weighting' | 'mcda';
  readonly weightingGuidance: string;
  readonly swingWeightsNormalized: boolean;
  readonly proactUrl: ProactUrlElement[];
  readonly treeNarrative: string;
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

/**
 * Design a PrOACT-URL / IMI PROTECT BRAT value tree: decision objective →
 * benefit and risk criteria → outcome measures, with a recommended weighting
 * approach (qualitative, swing weighting, or full MCDA). When swing weighting
 * or MCDA is selected and importance ranks are supplied, deterministic
 * normalized swing weights are computed.
 */
export function designValueTree(params: DesignValueTreeParams): ValueTreeResult {
  // 2026-11-09 (S5d): type 'Benefit' dropped the criterion, rank '1' was ranked, 'MCDA' gave "not specified".
  refuseUnlessStated('designValueTree', [listInput('criteria', params.criteria)], 'structured');
  const productName = norm(statedText('productName', params.productName), 'the product');
  const indication = norm(statedText('indication', params.indication), 'the indication');
  const decisionObjective = norm(
    statedText('decisionObjective', params.decisionObjective),
    `Determine the benefit-risk balance of ${productName} in ${indication}`,
  );
  const approachStated = statedOneOf('weightingApproach', params.weightingApproach, WEIGHTING_APPROACHES);
  const approach = approachStated ?? 'swing_weighting';
  const criteria: ValueTreeCriterionInput[] = entries('criteria', params.criteria).map((c: Reader) => ({
    name: c.text('name') ?? '', type: c.need('type', CRITERION_TYPES), outcomeMeasure: c.text('outcomeMeasure'),
    unit: c.text('unit'), subCriteria: c.texts('subCriteria'),
    importanceRank: c.num('importanceRank', (n: number) => Number.isInteger(n) && n >= 1, 'a whole number of at least 1'),
  }));
  const alternativesStated = statedTexts('alternatives', params.alternatives);
  const alternatives =
    alternativesStated && alternativesStated.length > 0
      ? alternativesStated.map((a: string) => norm(a, 'alternative'))
      : [productName, 'comparator / standard of care', 'no treatment'];

  // Split benefit and risk criteria preserving input order.
  const benefitInputs = criteria.filter((c: ValueTreeCriterionInput) => c.type === 'benefit');
  const riskInputs = criteria.filter((c: ValueTreeCriterionInput) => c.type === 'risk');

  // Swing weights: only computed for swing_weighting / mcda when ranks present.
  const computeSwing = approach !== 'qualitative';
  // Assign provisional point scores from importance rank (lower rank = higher points).
  const allRanked = criteria.filter((c: ValueTreeCriterionInput) => c.importanceRank !== undefined);
  let totalPoints = 0;
  const pointsByName: Record<string, number> = {};
  if (computeSwing && allRanked.length > 0) {
    // Highest rank value present (for inversion).
    let maxRank = 1;
    for (const c of allRanked) {
      if ((c.importanceRank ?? 1) > maxRank) maxRank = c.importanceRank ?? 1;
    }
    for (const c of allRanked) {
      // points = 100 * (maxRank - rank + 1) / maxRank  → rank 1 gets 100.
      const pts = round((100 * (maxRank - (c.importanceRank ?? maxRank) + 1)) / maxRank, 2);
      pointsByName[norm(c.name, 'criterion')] = pts;
      totalPoints += pts;
    }
  }

  function resolveCriterion(c: ValueTreeCriterionInput): ValueTreeCriterion {
    const name = norm(c.name, 'criterion');
    let swing: number | null = null;
    if (computeSwing && totalPoints > 0 && pointsByName[name] !== undefined) {
      swing = round(pointsByName[name] / totalPoints, 4);
    }
    return {
      name,
      type: c.type,
      outcomeMeasure: norm(c.outcomeMeasure, 'outcome measure to be defined'),
      unit: norm(c.unit, '—'),
      importanceRank: c.importanceRank ?? 0,
      swingWeight: swing,
      subCriteria: (c.subCriteria ?? []).map((s: string) => norm(s, 'sub-criterion')),
    };
  }

  const benefitCriteria = benefitInputs.map(resolveCriterion);
  const riskCriteria = riskInputs.map(resolveCriterion);
  const swingWeightsNormalized = computeSwing && totalPoints > 0;

  // PrOACT-URL element mapping.
  const proactUrl: ProactUrlElement[] = [
    {
      element: 'Problem',
      letter: 'Pr',
      content:
        `Frame the decision: is the benefit-risk balance of ${productName} favourable in ${indication}? ` +
        'Define the regulatory question, the population, and the decision context.',
    },
    {
      element: 'Objectives',
      letter: 'O',
      content:
        'State the fundamental objectives — maximise favourable effects and minimise unfavourable effects — ' +
        'which become the benefit and risk branches of the value tree.',
    },
    {
      element: 'Alternatives',
      letter: 'A',
      content: `Alternatives under comparison: ${alternatives.join('; ')}.`,
    },
    {
      element: 'Consequences',
      letter: 'C',
      content:
        `Specify the outcome on each criterion for every alternative. Benefit criteria: ` +
        `${benefitCriteria.map((b: ValueTreeCriterion) => b.name).join(', ') || 'none supplied'}; ` +
        `risk criteria: ${riskCriteria.map((r: ValueTreeCriterion) => r.name).join(', ') || 'none supplied'}.`,
    },
    {
      element: 'Trade-offs',
      letter: 'T',
      content: weightingGuidanceText(approach),
    },
    {
      element: 'Uncertainty',
      letter: 'U',
      content:
        'Characterise the uncertainty in each consequence (estimation error, extrapolation, indirect ' +
        'evidence) and propagate it via sensitivity analysis on scores and weights.',
    },
    {
      element: 'Risk attitude',
      letter: 'R',
      content:
        'Make the decision-maker\'s risk attitude explicit (risk-neutral vs risk-averse), especially for ' +
        'low-frequency, high-severity harms where a risk-averse stance lowers the acceptable balance.',
    },
    {
      element: 'Linked decisions',
      letter: 'L',
      content:
        'Account for decisions linked over time — post-authorisation studies, label changes, and risk ' +
        'minimisation revisions that can change the balance as evidence accrues.',
    },
  ];

  const treeNarrative =
    `Value tree for ${productName} in ${indication}. Root objective: ${decisionObjective}. ` +
    `The tree decomposes into a benefit branch (${benefitCriteria.length} criterion/criteria) and a risk ` +
    `branch (${riskCriteria.length} criterion/criteria), each criterion operationalized by an outcome ` +
    `measure. Weighting approach: ${approach}. ` +
    (swingWeightsNormalized
      ? 'Normalized swing weights were computed from the supplied importance ranks and sum to 1 across all criteria.'
      : 'Numeric weights were not computed (qualitative approach or no importance ranks supplied).');

  const methodNotes: string[] = [
    'The value tree follows the IMI PROTECT BRAT structure (objectives → criteria → outcome measures) ' +
      'and the PrOACT-URL decision framework adopted by EMA.',
    'Swing weights are derived deterministically from importance ranks (rank 1 → 100 points; inverse-linear) ' +
      'and normalized to sum to 1; they are a transparent placeholder for, not a replacement for, formal ' +
      'stakeholder weight elicitation.',
    'A value tree organizes the decision; quantitative integration (MCDA) is optional and must be paired ' +
      'with sensitivity analysis on both scores and weights.',
    ...(approachStated === undefined ? ['No weighting approach was stated; swing weighting is recommended by default.'] : []),
    ...(alternativesStated && alternativesStated.length > 0
      ? []
      : ['No alternatives were stated; the product, the comparator / standard of care and no treatment are listed by default.']),
  ];

  return {
    productName,
    indication,
    decisionObjective,
    framework: 'PrOACT-URL value tree (IMI PROTECT / BRAT)',
    benefitCriteria,
    riskCriteria,
    alternatives,
    weightingApproach: approach,
    weightingGuidance: weightingGuidanceText(approach),
    swingWeightsNormalized,
    proactUrl,
    treeNarrative,
    citations: citeAll(['PROACT_URL', 'IMI_PROTECT_BRAT', 'MCDA_SWING', 'EMA_BR_METHODOLOGY']),
    methodNotes,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 5 — Benefit-risk uncertainty assessment
 *   assessBRUncertainty(params): BRUncertaintyResult
 * ════════════════════════════════════════════════════════════════════════════ */

/** Category of an uncertainty source. */
export type UncertaintySourceType =
  | 'data_quality'
  | 'extrapolation'
  | 'rare_events'
  | 'indirect_evidence'
  | 'surrogate_endpoint'
  | 'missing_data'
  | 'external_validity'
  | 'subgroup'
  | 'long_term'
  | 'comparator';

/** A declared source of uncertainty affecting the balance. */
export interface UncertaintySourceInput {
  readonly type: UncertaintySourceType;
  readonly description?: string;
  /** Which side of the balance the uncertainty mainly affects. */
  readonly affects?: 'benefit' | 'risk' | 'both';
  readonly level?: UncertaintyLevel;
}

export interface AssessBRUncertaintyParams {
  readonly productName: string;
  readonly indication: string;
  /** The current best-estimate verdict to stress-test. */
  readonly currentVerdict?: BRVerdict;
  /** Net balance estimate from the balance assessment, if available. */
  readonly netBalanceEstimate?: number;
  readonly sources: readonly UncertaintySourceInput[];
}

/** A resolved uncertainty source with its impact. */
export interface ResolvedUncertaintySource {
  readonly type: UncertaintySourceType;
  readonly label: string;
  readonly description: string;
  /** 'not_stated' when no affected side was supplied. */
  readonly affects: 'benefit' | 'risk' | 'both' | 'not_stated';
  /** 'not_stated' when the source gave no level: none is assumed. */
  readonly level: UncertaintyLevel | 'not_stated';
  readonly impactOnBalance: string;
  readonly mitigationToReduce: string;
}

export interface BRUncertaintyResult {
  readonly productName: string;
  readonly indication: string;
  readonly sources: ResolvedUncertaintySource[];
  /** 'not_assessed' with no source stated, or a source with no level and none stated 'high'. */
  readonly overallUncertainty: UncertaintyLevel | 'not_assessed';
  /** 'not_assessed' without a stated net margin, a stated source, or the levels a verdict needs. */
  readonly robustnessOfConclusion: 'robust' | 'sensitive' | 'fragile' | 'not_assessed';
  readonly whatWouldChangeTheConclusion: string[];
  readonly recommendedSensitivityAnalyses: string[];
  readonly residualUncertaintyForLabel: string[];
  readonly narrative: string;
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

/**
 * Assess the uncertainty surrounding a benefit-risk conclusion: enumerate the
 * sources (data quality, extrapolation, rare events, indirect evidence, etc.),
 * grade their impact on the balance, judge how robust the conclusion is, and
 * state explicitly what would change the conclusion. Implements the PROTECT/EMA
 * "Uncertainty" element and the FDA framework's uncertainty discipline.
 */
export function assessBRUncertainty(params: AssessBRUncertaintyParams): BRUncertaintyResult {
  // 2026-11-09 (S5d): level 'High' read as not stated, type 'bias' as a generic source, margin '0.3' as none.
  refuseUnlessStated('assessBRUncertainty', [listInput('sources', params.sources)], 'assessed');
  const productName = norm(statedText('productName', params.productName), 'the product');
  const indication = norm(statedText('indication', params.indication), 'the indication');
  const netBalanceEstimate = statedNumber('netBalanceEstimate', params.netBalanceEstimate,
    (n: number) => Number.isFinite(n), 'a finite number');
  const sourcesIn: UncertaintySourceInput[] = entries('sources', params.sources).map((x: Reader) => ({
    type: x.need('type', UNCERTAINTY_SOURCE_TYPES), description: x.text('description'),
    affects: x.oneOf('affects', AFFECTED_SIDES), level: x.oneOf('level', UNCERTAINTIES),
  }));

  const sources: ResolvedUncertaintySource[] = [];
  let highCount = 0;
  let moderateCount = 0;
  let notStatedCount = 0;
  let worst: UncertaintyLevel = 'low';
  for (const s of sourcesIn) {
    // An omitted level is not stated, never 'moderate'; an unrecognised one was refused above.
    const level: UncertaintyLevel | 'not_stated' = s.level ?? 'not_stated';
    const affects: ResolvedUncertaintySource['affects'] = s.affects ?? 'not_stated';
    if (level === 'high') highCount += 1;
    if (level === 'moderate') moderateCount += 1;
    if (level === 'not_stated') {
      notStatedCount += 1;
    } else {
      worst = worseUncertainty(worst, level);
    }
    sources.push({
      type: s.type,
      label: uncertaintySourceLabel(s.type),
      description: norm(s.description, uncertaintyDefaultDescription(s.type)),
      affects,
      level,
      impactOnBalance: uncertaintyImpactProse(affects, level),
      mitigationToReduce: uncertaintyMitigation(s.type),
    });
  }

  // No source, or an unstated level with no stated 'high', leaves the grade
  // unassessed: a stated 'high' is the top of the scale whatever the rest are.
  const overallUncertainty: UncertaintyLevel | 'not_assessed' =
    sourcesIn.length === 0 || (notStatedCount > 0 && highCount === 0) ? 'not_assessed' : worst;

  // Robustness: combine number/severity of uncertainties with the net margin.
  // Neither a margin nor a source is assumed: without both it is not assessed.
  // An unstated level can only add to the counts, so it leaves standing a
  // 'fragile' that the stated levels reach, and nothing else.
  const margin = netBalanceEstimate !== undefined ? Math.abs(netBalanceEstimate) : null;
  const notAssessedBecause: string[] = [];
  if (margin === null) notAssessedBecause.push('no net benefit-risk margin was stated');
  if (sourcesIn.length === 0) notAssessedBecause.push('no uncertainty source was stated');
  if (notStatedCount > 0) notAssessedBecause.push(`the level of ${notStatedCount} source(s) was not stated`);
  let robustness: 'robust' | 'sensitive' | 'fragile' | 'not_assessed';
  if (margin === null || sourcesIn.length === 0) {
    robustness = 'not_assessed';
  } else if (highCount >= 2 || (highCount >= 1 && margin < 0.1)) {
    robustness = 'fragile';
  } else if (notStatedCount > 0) {
    robustness = 'not_assessed';
  } else if (highCount >= 1 || moderateCount >= 2 || margin < 0.18) {
    robustness = 'sensitive';
  } else {
    robustness = 'robust';
  }

  // What would change the conclusion — deterministic, source-driven.
  const whatWouldChangeTheConclusion: string[] = [];
  const benefitAffecting = sources.filter((s: ResolvedUncertaintySource) => s.affects === 'benefit' || s.affects === 'both');
  const riskAffecting = sources.filter((s: ResolvedUncertaintySource) => s.affects === 'risk' || s.affects === 'both');
  if (benefitAffecting.length > 0) {
    whatWouldChangeTheConclusion.push(
      'If the true benefit is at the lower bound of its plausible range (e.g. the surrogate fails to translate, ' +
        'or efficacy does not generalize), the favourable margin could be eliminated.',
    );
  }
  if (riskAffecting.length > 0) {
    whatWouldChangeTheConclusion.push(
      'If a rare serious harm emerges at a frequency above current upper confidence bounds, or a new safety ' +
        'signal is confirmed post-authorisation, the balance could shift toward unfavourable.',
    );
  }
  const hasComparator = sources.some((s: ResolvedUncertaintySource) => s.type === 'comparator');
  if (hasComparator) {
    whatWouldChangeTheConclusion.push(
      'If the relevant standard of care outperforms the comparator actually studied, the incremental benefit ' +
        '(and thus the balance) is overstated.',
    );
  }
  const hasLongTerm = sources.some((s: ResolvedUncertaintySource) => s.type === 'long_term');
  if (hasLongTerm) {
    whatWouldChangeTheConclusion.push(
      'If benefit wanes or late toxicity accumulates over longer exposure, the lifetime balance differs from the ' +
        'short-term trial balance.',
    );
  }
  // Nothing above came from a stated source, so nothing was assessed: that is
  // not evidence that the conclusion is insensitive.
  const changeAssessed = whatWouldChangeTheConclusion.length > 0;
  if (!changeAssessed) {
    whatWouldChangeTheConclusion.push(
      sources.length === 0
        ? 'No uncertainty source was stated, so what would change the conclusion was not assessed.'
        : 'No stated source names a recognised side of the balance (benefit, risk or both), so what would change ' +
          'the conclusion was not assessed.',
    );
  }

  // Recommended sensitivity analyses (de-duplicated by source type).
  const recommendedSensitivityAnalyses: string[] = [];
  const seenTypes: Record<string, boolean> = {};
  for (const s of sources) {
    if (!seenTypes[s.type]) {
      seenTypes[s.type] = true;
      recommendedSensitivityAnalyses.push(`${s.label}: ${s.mitigationToReduce}`);
    }
  }
  if (recommendedSensitivityAnalyses.length === 0) {
    recommendedSensitivityAnalyses.push(
      'Tornado/one-way sensitivity analysis varying each key benefit and risk estimate across its plausible range.',
    );
  } else {
    recommendedSensitivityAnalyses.push(
      'Tornado diagram across all key criteria to identify which uncertainty contributes most to decision risk.',
    );
  }

  // Residual uncertainty for the label / RMP.
  const residualUncertaintyForLabel: string[] = [];
  for (const s of sources) {
    if (s.level === 'high') {
      residualUncertaintyForLabel.push(
        `${s.label}: carry as "missing information" in the risk management plan and reflect in labeling/PASS.`,
      );
    } else if (s.level === 'not_stated') {
      residualUncertaintyForLabel.push(
        `${s.label}: its level was not stated, so whether it is carried as missing information was not assessed.`,
      );
    }
  }
  if (residualUncertaintyForLabel.length === 0) {
    residualUncertaintyForLabel.push(
      sources.length === 0
        ? 'No uncertainty source was stated, so the residual uncertainty for the label was not assessed.'
        : 'No high-grade residual uncertainty requires explicit labeling beyond routine pharmacovigilance.',
    );
  }

  const notStatedPhrase = notStatedCount > 0 ? `, ${notStatedCount} with no stated level` : '';
  const narrative =
    `Uncertainty assessment for ${productName} in ${indication}: ${sources.length} source(s) considered ` +
    `(${highCount} high, ${moderateCount} moderate${notStatedPhrase}). ` +
    (overallUncertainty === 'not_assessed'
      ? 'Overall uncertainty is not graded; '
      : `Overall uncertainty is graded ${overallUncertainty}; `) +
    (robustness === 'not_assessed' || margin === null
      ? `the robustness of the conclusion is not assessed, because ${notAssessedBecause.join(' and ')}. `
      : `the conclusion is judged ${robustness} given a net margin of approximately ${round(margin, 3)}. `) +
    (changeAssessed
      ? `The principal way the conclusion could change: ${whatWouldChangeTheConclusion[0]}`
      : whatWouldChangeTheConclusion[0]);

  const methodNotes: string[] = [
    'Uncertainty sources follow the PROTECT/EMA taxonomy and the FDA framework\'s requirement to make ' +
      'uncertainties explicit alongside the evidence in every framework row.',
    'Robustness combines the count/severity of uncertainties with the net benefit-risk margin: a small margin ' +
      'plus high uncertainty yields a fragile conclusion.',
    'No net margin or uncertainty level is assumed: an omitted one is reported as not stated, and the overall ' +
      'grade, robustness and labeling conclusion it would decide are reported as not assessed.',
    'Outputs are deterministic; "what would change the conclusion" is generated from the affected side and type ' +
      'of each declared uncertainty, not from any stochastic simulation.',
  ];

  return {
    productName,
    indication,
    sources,
    overallUncertainty,
    robustnessOfConclusion: robustness,
    whatWouldChangeTheConclusion,
    recommendedSensitivityAnalyses,
    residualUncertaintyForLabel,
    narrative,
    citations: citeAll(['EMA_BR_METHODOLOGY', 'IMI_PROTECT_BRAT', 'FDA_BR_FRAMEWORK_2023', 'PROACT_URL', 'ICH_E2C_R2']),
    methodNotes,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 6 — Benefit-risk communication plan
 *   planBRCommunication(params): BRCommunicationResult
 * ════════════════════════════════════════════════════════════════════════════ */

/** The intended audience for a communication artifact. */
export type BRAudience =
  | 'label'
  | 'advisory_committee'
  | 'prescriber'
  | 'patient'
  | 'payer'
  | 'regulator_internal';

/** The benefit-risk conclusions a communication plan can carry. */
const BR_VERDICTS: readonly BRVerdict[] = ['favourable', 'favourable_with_conditions', 'indeterminate', 'unfavourable'];

export interface PlanBRCommunicationParams {
  readonly productName: string;
  readonly indication: string;
  /** The sponsor's benefit-risk conclusion. Refused when absent, never defaulted. */
  readonly verdict?: BRVerdict;
  /** The key benefit and risk messages to frame; an absent one is named as not stated. */
  readonly keyBenefitMessages?: readonly string[];
  readonly keyRiskMessages?: readonly string[];
  /** Audiences to plan communication for; defaults to the standard set. */
  readonly audiences?: readonly BRAudience[];
  /** Whether a structured visual (effects table, forest plot) is desired. */
  readonly includeVisualSummary?: boolean;
  /** Whether patient-experience/PFDD data inform the framing. */
  readonly patientExperienceDataAvailable?: boolean;
}

/** A per-audience communication plan entry. */
export interface AudienceCommunicationPlan {
  readonly audience: BRAudience;
  readonly audienceLabel: string;
  readonly framing: string;
  readonly recommendedFormat: string;
  readonly mustInclude: string[];
  readonly cautions: string[];
}

/** A recommended visual summary artifact. */
export interface VisualSummaryRecommendation {
  readonly artifact: string;
  readonly purpose: string;
  readonly audiences: BRAudience[];
}

export interface BRCommunicationResult {
  readonly productName: string;
  readonly indication: string;
  readonly verdict: BRVerdict;
  readonly audiencePlans: AudienceCommunicationPlan[];
  readonly visualSummary: VisualSummaryRecommendation[];
  readonly coreBenefitRiskMessage: string;
  readonly consistencyRequirement: string;
  /** Inputs the core message names as not stated: keyBenefitMessages, keyRiskMessages. */
  readonly notStated: string[];
  /** Each true/false input: true, false or not_stated. */
  readonly inputStates: Record<string, BooleanState>;
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

/**
 * Plan benefit-risk communication across audiences (label, advisory committee,
 * prescriber, patient, payer, internal review): audience-specific framing,
 * format, must-include content, cautions, and a recommended visual-summary
 * approach (effects table, forest plot, value-tree, icon arrays). Enforces a
 * single consistent core benefit-risk message across all artifacts.
 */
export function planBRCommunication(params: PlanBRCommunicationParams): BRCommunicationResult {
  // 2026-10-26 (Rule 2 S3): an unstated verdict was planned as favourable_with_conditions, and absent key
  // messages became "the demonstrated benefit in the indicated population" and "manageable, characterized
  // risks". The conclusion is the sponsor's, so an unstated one is refused; absent messages are named as
  // not stated.
  refuseUnlessStated('planBRCommunication', [{
    field: 'verdict',
    value: params.verdict,
    ok: typeof params.verdict === 'string' && BR_VERDICTS.includes(params.verdict),
    expected: `the benefit-risk conclusion is the sponsor's: one of ${BR_VERDICTS.join(', ')}`,
  }], 'planned');
  const PFDD_NOT_STATED =
    ' Whether patient-experience/PFDD data are available was not stated (patientExperienceDataAvailable); ' +
    'if they are, incorporate them on which outcomes patients value most.';
  // 2026-11-09 (S5d): an omitted PFDD fact read as false unsaid, 'false' as include, 'Patients' as "Audience".
  const productName = norm(statedText('productName', params.productName), 'the product');
  const indication = norm(statedText('indication', params.indication), 'the indication');
  const verdict = params.verdict as BRVerdict;
  const inputStates = booleanInputStates(params, ['includeVisualSummary', 'patientExperienceDataAvailable']);
  const patientData = statedBoolean('patientExperienceDataAvailable', params.patientExperienceDataAvailable);
  const includeVisualStated = statedBoolean('includeVisualSummary', params.includeVisualSummary);
  const includeVisual = includeVisualStated !== false;
  const stated = (field: string, messages: unknown): string[] =>
    (statedTexts(field, messages) ?? []).map((m: string) => norm(m, '')).filter((m: string) => m.length > 0);
  const benefitMessages = stated('keyBenefitMessages', params.keyBenefitMessages);
  const riskMessages = stated('keyRiskMessages', params.keyRiskMessages);
  const audiencesStated = statedList('audiences', params.audiences)?.map((a: unknown, i: number): BRAudience =>
    requiredOneOf(`audiences[${i}]`, a, BR_AUDIENCES));

  const audiences: BRAudience[] =
    audiencesStated && audiencesStated.length > 0
      ? [...audiencesStated]
      : ['label', 'advisory_committee', 'prescriber', 'patient', 'payer', 'regulator_internal'];

  const audiencePlans: AudienceCommunicationPlan[] = audiences.map((a: BRAudience) => ({
    audience: a,
    audienceLabel: audienceLabel(a),
    framing: audienceFraming(a, patientData === true) + (a === 'patient' && patientData === undefined ? PFDD_NOT_STATED : ''),
    recommendedFormat: audienceFormat(a),
    mustInclude: audienceMustInclude(a),
    cautions: audienceCautions(a),
  }));

  // Visual summary recommendations.
  const visualSummary: VisualSummaryRecommendation[] = [];
  if (includeVisual) {
    visualSummary.push({
      artifact: 'EMA-style effects table',
      purpose:
        'Tabulate favourable and unfavourable effects with magnitude, units, confidence intervals and ' +
        'uncertainty in one view — the canonical structured benefit-risk visual.',
      audiences: (['advisory_committee', 'regulator_internal', 'payer'] as BRAudience[]).filter((x: BRAudience) =>
        audiences.includes(x),
      ),
    });
    visualSummary.push({
      artifact: 'Forest plot of key effects',
      purpose: 'Show point estimates and confidence intervals for principal benefits and risks side by side.',
      audiences: (['advisory_committee', 'prescriber', 'regulator_internal'] as BRAudience[]).filter((x: BRAudience) =>
        audiences.includes(x),
      ),
    });
    visualSummary.push({
      artifact: 'Value-tree / MCDA diagram',
      purpose: 'Display the decision structure and, where used, the weighted integration of criteria.',
      audiences: (['advisory_committee', 'regulator_internal'] as BRAudience[]).filter((x: BRAudience) =>
        audiences.includes(x),
      ),
    });
    visualSummary.push({
      artifact: 'Icon array / natural-frequency graphic',
      purpose: 'Communicate absolute chances of benefit and harm to patients without relative-risk distortion.',
      audiences: (['patient', 'prescriber'] as BRAudience[]).filter((x: BRAudience) => audiences.includes(x)),
    });
    visualSummary.push({
      artifact: 'Tornado diagram (sensitivity)',
      purpose: 'Show which uncertainties most affect the conclusion, supporting the uncertainty narrative.',
      audiences: (['advisory_committee', 'regulator_internal'] as BRAudience[]).filter((x: BRAudience) =>
        audiences.includes(x),
      ),
    });
  }

  // Core message — single source of truth for consistency across audiences.
  const verdictWord = (() => {
    switch (verdict) {
      case 'favourable':
        return 'favourable';
      case 'favourable_with_conditions':
        return 'favourable subject to risk management';
      case 'indeterminate':
        return 'not yet established as favourable';
      case 'unfavourable':
        return 'unfavourable';
      default:
        return 'under assessment';
    }
  })();
  const benefitClause =
    benefitMessages.length > 0
      ? `provides ${benefitMessages.join('; ')}`
      : 'provides [key benefit messages not stated]';
  const riskClause =
    riskMessages.length > 0
      ? `with the principal risks being ${riskMessages.join('; ')}`
      : 'with the principal risks being [key risk messages not stated]';
  const notStated: string[] = [
    ...(benefitMessages.length > 0 ? [] : ['keyBenefitMessages']),
    ...(riskMessages.length > 0 ? [] : ['keyRiskMessages']),
  ];
  const coreBenefitRiskMessage =
    `In ${indication}, ${productName} ${benefitClause}, ${riskClause}; the overall benefit-risk balance is ` +
    `${verdictWord}. All audience-specific materials must restate this same core balance without ` +
    `strengthening the benefit or softening the risk.`;

  const consistencyRequirement =
    'Every artifact (label, briefing document, prescriber and patient materials, payer dossier) must be ' +
    'traceable to the same structured benefit-risk assessment and the same core message; differences are ' +
    'permitted only in level of detail and language, never in the substance of the balance. Patient and ' +
    'prescriber materials must use absolute/natural frequencies rather than relative-risk-only framing.';

  const methodNotes: string[] = [
    'Audience framings follow FDA labeling principles, advisory-committee transparency expectations, EMA EPAR ' +
      'communication, and PFDD/patient-communication guidance (natural frequencies, icon arrays).',
    'A single core benefit-risk message is generated and all audience plans are required to be consistent with ' +
      'it, preventing benefit overstatement or risk understatement across channels.',
    'Outputs are deterministic functions of the inputs and the audience set.',
    ...(audiencesStated && audiencesStated.length > 0 ? [] : ['No audiences were stated; all six are planned by default.']),
    ...(includeVisualStated === undefined ? ['includeVisualSummary was not stated; the visual summary is included by default.'] : []),
  ];

  return {
    productName,
    indication,
    verdict,
    audiencePlans,
    visualSummary,
    coreBenefitRiskMessage,
    consistencyRequirement,
    notStated,
    inputStates,
    citations: citeAll(['FDA_BR_FRAMEWORK_2023', 'FDA_PFDD', 'EMA_EFFECTS_TABLE', 'IMI_PROTECT_BRAT', 'CIOMS_VI']),
    methodNotes,
  };
}
