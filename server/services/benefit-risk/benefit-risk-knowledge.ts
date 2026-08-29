/**
 * Structured Benefit-Risk Assessment — Deterministic Knowledge Engine
 * ====================================================================
 *
 * A pure, closed-form, fully reproducible reasoning engine for structured
 * benefit-risk (B-R) assessment of medicinal products. NO LLM. NO network.
 * NO database. NO imports from other services. Every output is a deterministic
 * function of the inputs and the citation-backed knowledge tables defined here.
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

/* ════════════════════════════════════════════════════════════════════════════
 * SECTION 0 — Shared vocabulary, citation registry, and helper primitives
 * ════════════════════════════════════════════════════════════════════════════ */

/** A single regulatory citation with a stable identifier. */
export interface Citation {
  readonly id: string;
  readonly source: string;
  readonly reference: string;
  readonly year: number;
}

/**
 * Canonical citation registry. Every citation surfaced by the engine is drawn
 * from this table so that wording is identical across all six functions. The
 * keys are stable identifiers used internally; the `reference` strings are the
 * verbatim text callers must report.
 */
interface CitationRegistry {
  readonly [key: string]: Citation;
}

const CITATIONS: CitationRegistry = {
  FDA_BR_FRAMEWORK_2023: {
    id: 'FDA_BR_FRAMEWORK_2023',
    source: 'FDA Guidance for Industry',
    reference:
      'FDA, "Benefit-Risk Assessment for New Drug and Biological Products: ' +
      'Guidance for Industry" (final guidance, September 2023)',
    year: 2023,
  },
  FDA_PDUFA_VI: {
    id: 'FDA_PDUFA_VI',
    source: 'PDUFA Reauthorization Performance Goals',
    reference:
      'PDUFA VI Commitment Letter (FY2018-2022), Section I.J — Enhancement ' +
      'and Modernization of the FDA Drug Safety System and Benefit-Risk Assessment',
    year: 2017,
  },
  FDA_PDUFA_VII: {
    id: 'FDA_PDUFA_VII',
    source: 'PDUFA Reauthorization Performance Goals',
    reference:
      'PDUFA VII Commitment Letter (FY2023-2027), Section I — Patient-Focused ' +
      'Drug Development and Benefit-Risk Assessment in Regulatory Decision-Making',
    year: 2021,
  },
  FDA_BR_FRAMEWORK_GRID: {
    id: 'FDA_BR_FRAMEWORK_GRID',
    source: 'FDA Benefit-Risk Framework',
    reference:
      'FDA Benefit-Risk Assessment Framework grid: Analysis of Condition, ' +
      'Current Treatment Options, Benefit, Risk and Risk Management → Conclusions',
    year: 2023,
  },
  EMA_BR_METHODOLOGY: {
    id: 'EMA_BR_METHODOLOGY',
    source: 'EMA Benefit-Risk Methodology Project',
    reference:
      'EMA, "Benefit-Risk Methodology Project" Work Packages 1-4 ' +
      '(EMA/549682/2010; final report 2012)',
    year: 2012,
  },
  EMA_EFFECTS_TABLE: {
    id: 'EMA_EFFECTS_TABLE',
    source: 'EMA Assessment Report Template',
    reference:
      'EMA effects table — standardized tabulation of favourable and ' +
      'unfavourable effects (CHMP assessment report template; EPAR benefit-risk section)',
    year: 2014,
  },
  PROACT_URL: {
    id: 'PROACT_URL',
    source: 'PrOACT-URL Framework',
    reference:
      'Hammond, Keeney & Raiffa, adapted by EMA — PrOACT-URL: Problem, ' +
      'Objectives, Alternatives, Consequences, Trade-offs, Uncertainty, ' +
      'Risk attitude, Linked decisions',
    year: 2012,
  },
  IMI_PROTECT_BRAT: {
    id: 'IMI_PROTECT_BRAT',
    source: 'IMI PROTECT Benefit-Risk',
    reference:
      'IMI PROTECT Work Package 5, "Recommendations for the methodology and ' +
      'visualisation techniques to be used in the assessment of benefit and risk ' +
      'of medicines" (2013); BRAT framework, Coplan et al., Clin Pharmacol Ther 2011',
    year: 2013,
  },
  ICH_M4E_R2: {
    id: 'ICH_M4E_R2',
    source: 'ICH Harmonised Guideline',
    reference:
      'ICH M4E(R2), Common Technical Document for the Registration of ' +
      'Pharmaceuticals — Clinical Overview, §2.5.6 Benefits and Risks Conclusions (2016)',
    year: 2016,
  },
  CIOMS_IV: {
    id: 'CIOMS_IV',
    source: 'CIOMS Working Group IV',
    reference:
      'CIOMS Working Group IV, "Benefit-Risk Balance for Marketed Drugs: ' +
      'Evaluating Safety Signals" (Geneva, 1998)',
    year: 1998,
  },
  CIOMS_VI: {
    id: 'CIOMS_VI',
    source: 'CIOMS Working Group VI',
    reference:
      'CIOMS Working Group VI, "Management of Safety Information from Clinical ' +
      'Trials" (Geneva, 2005)',
    year: 2005,
  },
  MCDA_SWING: {
    id: 'MCDA_SWING',
    source: 'Multi-Criteria Decision Analysis methodology',
    reference:
      'Mussen, Salek & Walker, "A quantitative approach to benefit-risk ' +
      'assessment of medicines" — MCDA with swing weighting (Pharmacoepidemiol ' +
      'Drug Saf 2007); EMA MCDA pilot, PROTECT WP5',
    year: 2007,
  },
  FDA_PFDD: {
    id: 'FDA_PFDD',
    source: 'FDA Patient-Focused Drug Development',
    reference:
      'FDA PFDD Guidance Series (Guidances 1-4, 2018-2023) on collecting and ' +
      'submitting patient experience data to inform benefit-risk assessment',
    year: 2023,
  },
  ICH_E2C_R2: {
    id: 'ICH_E2C_R2',
    source: 'ICH Harmonised Guideline',
    reference:
      'ICH E2C(R2), Periodic Benefit-Risk Evaluation Report (PBRER) — ' +
      'integrated benefit-risk evaluation for marketed products (2012)',
    year: 2012,
  },
  EMA_RMP_GVP_V: {
    id: 'EMA_RMP_GVP_V',
    source: 'EMA Good Pharmacovigilance Practices',
    reference:
      'EMA GVP Module V — Risk Management Systems (Rev 2, 2017); risk ' +
      'minimisation measures feeding the benefit-risk balance',
    year: 2017,
  },
};

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

interface OrdinalMap {
  readonly [key: string]: number;
}

/** Numeric anchors for magnitude levels (0..1), used for deterministic scoring. */
const MAGNITUDE_SCORE: OrdinalMap = {
  negligible: 0.05,
  low: 0.25,
  moderate: 0.5,
  high: 0.75,
  very_high: 0.95,
};

/** Numeric anchors for severity levels (0..1). */
const SEVERITY_SCORE: OrdinalMap = {
  mild: 0.15,
  moderate: 0.4,
  severe: 0.7,
  life_threatening: 0.9,
  fatal: 1.0,
};

/** Numeric anchors for reversibility (multiplier on harm weight). */
const REVERSIBILITY_MULTIPLIER: OrdinalMap = {
  fully_reversible: 0.6,
  partially_reversible: 0.85,
  irreversible: 1.0,
};

/** Numeric anchors for uncertainty (penalty applied to confidence). */
const UNCERTAINTY_PENALTY: OrdinalMap = {
  low: 0.05,
  moderate: 0.18,
  high: 0.35,
};

function magnitudeScore(level: MagnitudeLevel): number {
  const v = MAGNITUDE_SCORE[level];
  return v === undefined ? 0.5 : v;
}

function severityScore(level: SeverityLevel): number {
  const v = SEVERITY_SCORE[level];
  return v === undefined ? 0.5 : v;
}

function reversibilityMultiplier(level: ReversibilityLevel): number {
  const v = REVERSIBILITY_MULTIPLIER[level];
  return v === undefined ? 1.0 : v;
}

function uncertaintyPenalty(level: UncertaintyLevel): number {
  const v = UNCERTAINTY_PENALTY[level];
  return v === undefined ? 0.18 : v;
}

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
  readonly unmetNeedConsidered: boolean;
  readonly severityContextScore: number;
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

const CONDITION_SEVERITY_RANK: OrdinalMap = {
  mild: 0.2,
  moderate: 0.45,
  serious: 0.65,
  severe: 0.8,
  life_threatening: 1.0,
};

function describeConditionSeverity(
  severity: StructureBenefitRiskFrameworkParams['conditionSeverity'],
): string {
  switch (severity) {
    case 'life_threatening':
      return 'life-threatening condition; tolerance for risk and uncertainty is correspondingly higher';
    case 'severe':
      return 'severe condition with substantial impact on survival or daily functioning';
    case 'serious':
      return 'serious condition associated with meaningful morbidity if untreated';
    case 'moderate':
      return 'moderate condition; risk tolerance is calibrated to symptom and functional burden';
    case 'mild':
      return 'mild condition; tolerance for serious risk is low and the safety bar is high';
    default:
      return 'condition severity not specified; risk tolerance cannot be anchored to disease burden';
  }
}

function describeConditionCourse(
  course: StructureBenefitRiskFrameworkParams['conditionCourse'],
): string {
  switch (course) {
    case 'acute':
      return 'acute course — benefit and risk are evaluated over a short, defined treatment window';
    case 'chronic':
      return 'chronic course — cumulative and long-term risks weigh more heavily because of prolonged exposure';
    case 'progressive':
      return 'progressive course — delay or denial of an effective therapy itself carries a risk of irreversible decline';
    case 'relapsing':
      return 'relapsing course — durability of benefit and risk across repeated treatment cycles is material';
    case 'episodic':
      return 'episodic course — intermittent exposure changes the relevant time-horizon for harms';
    default:
      return 'disease course not specified';
  }
}

function describeBenefitEndpoint(
  endpoint: KeyBenefitClaim['endpointType'],
): string {
  switch (endpoint) {
    case 'mortality':
      return 'mortality endpoint — the most clinically important category of benefit';
    case 'irreversible_morbidity':
      return 'prevention of irreversible morbidity — high clinical importance';
    case 'function':
      return 'functional endpoint — directly meaningful to how a patient feels and functions';
    case 'symptom':
      return 'symptomatic endpoint — patient-relevant but generally below survival/irreversible-morbidity in the hierarchy';
    case 'surrogate':
      return 'surrogate endpoint — clinical benefit is inferred and carries added uncertainty about translation to outcomes';
    case 'biomarker':
      return 'biomarker endpoint — requires explicit justification that it predicts clinical benefit';
    default:
      return 'endpoint type not specified';
  }
}

function frequencyToProseFda(freq: KeyRiskItem['frequency']): string {
  switch (freq) {
    case 'very_common':
      return 'very common (≥1/10)';
    case 'common':
      return 'common (≥1/100 to <1/10)';
    case 'uncommon':
      return 'uncommon (≥1/1,000 to <1/100)';
    case 'rare':
      return 'rare (≥1/10,000 to <1/1,000)';
    case 'very_rare':
      return 'very rare (<1/10,000) — typically detectable only post-marketing';
    default:
      return 'frequency not characterized';
  }
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
  const productName = norm(params.productName, 'the investigational product');
  const indication = norm(params.indication, 'the proposed indication');
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
  conditionEvidence.push(describeConditionSeverity(params.conditionSeverity));
  conditionEvidence.push(describeConditionCourse(params.conditionCourse));
  if (params.populationDescriptor) {
    conditionEvidence.push(`Affected population: ${norm(params.populationDescriptor, 'not specified')}.`);
  }
  const severityRank =
    params.conditionSeverity !== undefined
      ? CONDITION_SEVERITY_RANK[params.conditionSeverity] ?? 0.5
      : 0.5;
  const conditionConclusion =
    severityRank >= 0.65
      ? 'The condition is serious or life-threatening, which raises the acceptable level of risk and uncertainty in the benefit-risk judgment.'
      : 'The condition is of lower severity, which sets a higher safety bar and lowers tolerance for serious or irreversible harms.';

  // ── Row 2: Current Treatment Options ──────────────────────────────────────
  const treatmentEvidence: string[] = [];
  const treatments = params.currentTreatments ?? [];
  if (treatments.length === 0) {
    treatmentEvidence.push('No current treatment options were supplied for analysis.');
  } else {
    for (const t of treatments) {
      const status = t.status ?? 'approved';
      const lim = t.limitations ? ` Limitation: ${norm(t.limitations, 'not specified')}.` : '';
      treatmentEvidence.push(`${norm(t.name, 'unnamed option')} (${status}).${lim}`);
    }
  }
  const unmetNeed =
    params.unmetMedicalNeed === true ||
    treatments.length === 0 ||
    treatments.every((t: TreatmentOption) => (t.status ?? 'approved') === 'none' || (t.status ?? 'approved') === 'supportive_care');
  if (unmetNeed) {
    treatmentEvidence.push(
      'An unmet medical need is present: available options are absent, supportive only, or materially limited.',
    );
  }
  const treatmentConclusion = unmetNeed
    ? 'Because available therapy is inadequate, a meaningful incremental benefit can justify a higher level of risk.'
    : 'Effective alternatives exist; the product must show a favourable benefit-risk profile relative to, not merely in addition to, the current standard of care.';

  // ── Row 3: Benefit ────────────────────────────────────────────────────────
  const benefitEvidence: string[] = [];
  const benefits = params.keyBenefits ?? [];
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
  for (const b of benefits) {
    const m = magnitudeScore(b.magnitude ?? 'moderate');
    const u = b.uncertainty ? 1 - uncertaintyPenalty(b.uncertainty) : 0.82;
    benefitAgg += m * u;
  }
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
  const risks = params.keyRisks ?? [];
  if (risks.length === 0) {
    riskEvidence.push('No key risks were supplied; the safety profile is uncharacterized in this grid.');
  } else {
    for (const r of risks) {
      const sev = r.severity ? ` Severity: ${r.severity}.` : '';
      const rev = r.reversibility ? ` Reversibility: ${r.reversibility}.` : '';
      const freq = ` Frequency: ${frequencyToProseFda(r.frequency)}.`;
      const mng = r.manageable === false ? ' Not readily manageable.' : ' Considered manageable with stated measures.';
      riskEvidence.push(`${norm(r.description, 'unspecified risk')} —${sev}${rev}${freq}${mng}`);
    }
  }
  const rmTools = params.riskManagementTools ?? [];
  if (rmTools.length > 0) {
    riskEvidence.push(`Risk management tools proposed: ${rmTools.map((s: string) => norm(s, 'unnamed')).join('; ')}.`);
  } else {
    riskEvidence.push('No specific risk-management tools were proposed; routine pharmacovigilance and labeling are assumed.');
  }
  // deterministic aggregate risk score
  let riskAgg = 0;
  for (const r of risks) {
    const s = severityScore(r.severity ?? 'moderate');
    const rev = reversibilityMultiplier(r.reversibility ?? 'partially_reversible');
    const manage = r.manageable === false ? 1.0 : 0.8;
    riskAgg += s * rev * manage;
  }
  const riskScore = risks.length > 0 ? round(riskAgg / risks.length, 3) : 0;
  // riskScore is 0 both when risks are genuinely minimal AND when NO risks were
  // characterized; only the latter must not read as a favourable safety finding.
  // An uncharacterized safety profile is a non-determination, not "readily
  // manageable" — the seal is the wrong place to imply a risk grade nobody gave.
  const riskConclusion =
    risks.length === 0
      ? 'No risks were characterized on the supplied evidence; the safety profile is not established and no risk determination can be made.'
      : riskScore >= 0.6
        ? 'The principal risks are serious and/or irreversible; effective risk management is essential to a favourable conclusion.'
        : riskScore >= 0.35
          ? 'The risks are of moderate concern and appear addressable through labeling and routine pharmacovigilance.'
          : 'The identified risks are limited in severity and reversibility and are readily manageable.';

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
  const net = round(benefitScore - riskScore, 3);
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
  } else if (net >= 0.2) {
    netPhrase = 'the weight of benefit clearly exceeds the weight of risk';
  } else if (net >= 0.0) {
    netPhrase = 'benefit modestly exceeds risk, with the margin sensitive to risk management';
  } else if (net >= -0.2) {
    netPhrase = 'benefit and risk are closely balanced and the conclusion is sensitive to uncertainty';
  } else {
    netPhrase = 'the weight of risk exceeds the demonstrated benefit on the supplied evidence';
  }

  const integratedAssessmentNarrative =
    `For ${productName} in ${indication}, the FDA Benefit-Risk Framework integrates the four ` +
    `dimensions as follows. ${conditionConclusion} ${treatmentConclusion} On the evidence supplied, ` +
    `${benefitConclusion.toLowerCase().replace(/\.$/, '')}, while ${riskConclusion.toLowerCase().replace(/\.$/, '')}. ` +
    `Taken together (benefit weight ${benefitScore}, risk weight ${riskScore}, net ${net}), ${netPhrase}. ` +
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

  return {
    productName,
    indication,
    framework: 'FDA Benefit-Risk Assessment Framework',
    rows,
    integratedAssessmentNarrative,
    unmetNeedConsidered: unmetNeed,
    severityContextScore: round(severityRank, 3),
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

function evidenceSourceProse(src: EffectInput['evidenceSource']): string {
  switch (src) {
    case 'pivotal_rct':
      return 'pivotal randomized controlled trial (highest weight)';
    case 'supportive_rct':
      return 'supportive randomized controlled trial';
    case 'meta_analysis':
      return 'meta-analysis of randomized trials';
    case 'observational':
      return 'observational study (residual confounding possible)';
    case 'indirect':
      return 'indirect/network comparison (added uncertainty)';
    case 'modeling':
      return 'modeling or simulation (extrapolation beyond observed data)';
    default:
      return 'evidence source not specified';
  }
}

/** Map an evidence source to a baseline uncertainty floor. */
function evidenceSourceUncertaintyFloor(src: EffectInput['evidenceSource']): UncertaintyLevel {
  switch (src) {
    case 'pivotal_rct':
    case 'meta_analysis':
      return 'low';
    case 'supportive_rct':
      return 'moderate';
    case 'observational':
    case 'indirect':
    case 'modeling':
      return 'high';
    default:
      return 'moderate';
  }
}

/** Derive an ordinal magnitude from a numeric absolute difference, normalized. */
function deriveMagnitude(effect: EffectInput): MagnitudeLevel {
  if (effect.magnitude) return effect.magnitude;
  if (effect.treatmentValue !== undefined && effect.controlValue !== undefined) {
    const base = Math.abs(effect.controlValue) > 1e-9 ? Math.abs(effect.controlValue) : 1;
    const rel = Math.abs(effect.treatmentValue - effect.controlValue) / base;
    if (rel >= 0.5) return 'very_high';
    if (rel >= 0.25) return 'high';
    if (rel >= 0.1) return 'moderate';
    if (rel >= 0.03) return 'low';
    return 'negligible';
  }
  return 'moderate';
}

/** Combine the worse (higher) of two uncertainty levels. */
function worseUncertainty(a: UncertaintyLevel, b: UncertaintyLevel): UncertaintyLevel {
  const rank: OrdinalMap = { low: 0, moderate: 1, high: 2 };
  const inv: UncertaintyLevel[] = ['low', 'moderate', 'high'];
  const r = Math.max(rank[a] ?? 1, rank[b] ?? 1);
  return inv[r] ?? 'moderate';
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

/**
 * Build an EMA-style effects table: the standardized tabulation of favourable
 * and unfavourable effects, each with magnitude, units, confidence interval,
 * uncertainty grading, and references. This is the canonical artifact in the
 * benefit-risk section of an EMA assessment report / EPAR.
 */
export function buildEffectsTable(params: BuildEffectsTableParams): EffectsTableResult {
  const productName = norm(params.productName, 'the product');
  const indication = norm(params.indication, 'the indication');
  const comparator = norm(params.comparator, 'comparator / placebo');
  const effects = params.effects ?? [];

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

  const methodNotes: string[] = [
    'Effects are grouped into favourable and unfavourable per the EMA effects-table convention; ' +
      'each row records magnitude, unit, treatment vs comparator values, confidence interval, ' +
      'evidence source and an explicit uncertainty grade.',
    'Magnitude is taken from the supplied ordinal judgment when present, otherwise derived ' +
      'deterministically from the relative difference between treatment and comparator values.',
    'Overall evidence quality is set to the worst (highest) uncertainty present, consistent with ' +
      'a conservative regulatory reading.',
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
  readonly contribution: number;
  readonly rationale: string;
}

export interface BenefitRiskBalanceResult {
  readonly productName: string;
  readonly indication: string;
  readonly verdict: BRVerdict;
  readonly benefitWeight: number;
  readonly riskWeight: number;
  readonly netBalance: number;
  readonly confidence: number;
  readonly drivers: BalanceDriver[];
  readonly keyBenefitsSummary: string[];
  readonly keyRisksSummary: string[];
  readonly mitigationImpact: string;
  readonly populationConsiderations: string[];
  readonly structuredConclusion: string;
  readonly conditionsForFavourable: string[];
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

/** Default importance weight by benefit endpoint type (clinical hierarchy). */
function defaultBenefitWeight(endpoint: KeyBenefitClaim['endpointType']): number {
  switch (endpoint) {
    case 'mortality':
      return 1.0;
    case 'irreversible_morbidity':
      return 0.9;
    case 'function':
      return 0.75;
    case 'symptom':
      return 0.6;
    case 'surrogate':
      return 0.45;
    case 'biomarker':
      return 0.35;
    default:
      return 0.6;
  }
}

/** Default importance weight by risk frequency (more common → more weight). */
function defaultRiskFrequencyWeight(freq: KeyRiskItem['frequency']): number {
  switch (freq) {
    case 'very_common':
      return 1.0;
    case 'common':
      return 0.8;
    case 'uncommon':
      return 0.55;
    case 'rare':
      return 0.4;
    case 'very_rare':
      return 0.3;
    default:
      return 0.6;
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
  const productName = norm(params.productName, 'the product');
  const indication = norm(params.indication, 'the indication');
  const benefits = params.benefits ?? [];
  const risks = params.risks ?? [];
  const mitigations = params.riskMitigations ?? [];
  const specialPopulations = params.specialPopulations ?? [];

  const drivers: BalanceDriver[] = [];
  const keyBenefitsSummary: string[] = [];
  const keyRisksSummary: string[] = [];

  // ── Benefit weight ────────────────────────────────────────────────────────
  let benefitNumer = 0;
  let benefitDenom = 0;
  for (const b of benefits) {
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
  }
  const benefitWeight = benefitDenom > 0 ? round(benefitNumer / benefitDenom, 3) : 0;

  // ── Risk weight ───────────────────────────────────────────────────────────
  let riskNumer = 0;
  let riskDenom = 0;
  for (const r of risks) {
    const w = r.weight !== undefined ? clamp(r.weight, 0, 1) : defaultRiskFrequencyWeight(r.frequency);
    const s = severityScore(r.severity);
    const rev = reversibilityMultiplier(r.reversibility ?? 'partially_reversible');
    const mitigationFactor = r.mitigated === true ? 0.7 : 1.0;
    const contribution = round(w * s * rev * mitigationFactor, 4);
    riskNumer += contribution;
    riskDenom += w;
    keyRisksSummary.push(
      `${norm(r.name, 'unnamed risk')}: severity ${r.severity}, reversibility ${r.reversibility ?? 'partially_reversible'}` +
        (r.frequency ? `, frequency ${r.frequency}` : '') +
        (r.mitigated === true ? ', mitigated' : '') +
        (r.population ? `, population ${norm(r.population, 'overall')}` : '') + '.',
    );
    drivers.push({
      factor: `Risk: ${norm(r.name, 'unnamed risk')}`,
      direction: 'supports_risk',
      contribution,
      rationale:
        `Severity ${r.severity}, ${r.reversibility ?? 'partially_reversible'}, frequency weight ${round(w, 2)}` +
        (r.mitigated === true ? '; reduced ~30% by mitigation.' : '; no mitigation credit applied.'),
    });
  }
  const riskWeight = riskDenom > 0 ? round(riskNumer / riskDenom, 3) : 0;

  // ── Net balance, adjusted for unmet need / condition severity ─────────────
  let net = benefitWeight - riskWeight;
  const severityRank =
    params.conditionSeverity !== undefined
      ? CONDITION_SEVERITY_RANK[params.conditionSeverity] ?? 0.5
      : 0.5;
  // Higher disease severity / unmet need raises risk tolerance (additive credit
  // to net, bounded), reflecting FDA framework "Analysis of Condition" logic.
  const severityCredit = round((severityRank - 0.5) * 0.3, 4);
  const unmetCredit = params.unmetMedicalNeed === true ? 0.08 : 0;
  net = round(net + severityCredit + unmetCredit, 3);
  if (severityCredit !== 0) {
    drivers.push({
      factor: 'Disease severity context',
      direction: severityCredit >= 0 ? 'supports_benefit' : 'supports_risk',
      contribution: Math.abs(severityCredit),
      rationale:
        `Condition severity (${params.conditionSeverity ?? 'unspecified'}) adjusts risk tolerance by ${severityCredit}.`,
    });
  }
  if (unmetCredit > 0) {
    drivers.push({
      factor: 'Unmet medical need',
      direction: 'supports_benefit',
      contribution: unmetCredit,
      rationale: 'Inadequate existing therapy raises the acceptable level of risk for an incremental benefit.',
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

  // ── Verdict (deterministic thresholds) ────────────────────────────────────
  let verdict: BRVerdict;
  // Both sides must be characterized for a directional verdict. Guarding only
  // empty benefits let benefits-with-no-risks reach 'favourable' (riskWeight 0
  // → high net) against an uncharacterized safety profile — a favourable
  // determination the evidence does not support. Empty EITHER side ⇒ indeterminate.
  if (benefits.length === 0 || risks.length === 0) {
    verdict = 'indeterminate';
  } else if (net >= 0.18 && confidence >= 0.65) {
    verdict = 'favourable';
  } else if (net >= 0.05) {
    verdict = 'favourable_with_conditions';
  } else if (net > -0.1) {
    verdict = 'indeterminate';
  } else {
    verdict = 'unfavourable';
  }

  // ── Mitigation impact ─────────────────────────────────────────────────────
  const mitigatedRisks = risks.filter((r: WeightedRisk) => r.mitigated === true);
  const mitigationImpact =
    mitigations.length === 0 && mitigatedRisks.length === 0
      ? 'No risk-mitigation measures were credited; the balance rests on the intrinsic safety profile and labeling.'
      : `Risk mitigation (${mitigations.map((s: string) => norm(s, 'measure')).join('; ') || 'measures applied'}) ` +
        `reduces the weighted impact of ${mitigatedRisks.length} of ${risks.length} key risk(s) and is ` +
        `load-bearing for the conclusion where the net margin is narrow.`;

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
  if (verdict === 'favourable_with_conditions' || verdict === 'indeterminate') {
    conditionsForFavourable.push('Confirm the durability and magnitude of the principal benefit in the target population.');
    if (mitigatedRisks.length < risks.length) {
      conditionsForFavourable.push('Strengthen risk minimisation for the serious/irreversible risks not yet credited as mitigated.');
    }
    if (confidence < 0.65) {
      conditionsForFavourable.push('Reduce key uncertainties (precision of estimates, generalizability) before a firm favourable conclusion.');
    }
  }
  if (verdict === 'unfavourable') {
    conditionsForFavourable.push('A favourable balance would require a materially larger benefit, a narrower higher-benefit population, or substantially reduced serious risk.');
  }

  // ── Structured conclusion ─────────────────────────────────────────────────
  const verdictPhrase = (() => {
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
  })();
  const topBenefit = keyBenefitsSummary.length > 0 ? keyBenefitsSummary[0] : 'no benefit specified';
  const topRisk = keyRisksSummary.length > 0 ? keyRisksSummary[0] : 'no risk specified';
  const structuredConclusion =
    `The benefit-risk balance of ${productName} in ${indication} is ${verdictPhrase} ` +
    `(benefit weight ${benefitWeight}, risk weight ${riskWeight}, net ${net}, confidence ${confidence}). ` +
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

function weightingGuidanceText(
  approach: 'qualitative' | 'swing_weighting' | 'mcda',
): string {
  switch (approach) {
    case 'qualitative':
      return (
        'Qualitative weighting: criteria are ranked and discussed without numerical weights. ' +
        'Appropriate for an initial structured assessment or when stakeholders are unwilling to ' +
        'commit to numeric trade-offs. Transparent but does not yield a single integrated score.'
      );
    case 'swing_weighting':
      return (
        'Swing weighting: stakeholders rank the "swing" from worst to best on each criterion, assign ' +
        '100 points to the most important swing, and score the rest relative to it; weights are then ' +
        'normalized to sum to 1. This captures both the importance of a criterion and the range of ' +
        'outcomes on it, and is the recommended elicitation method for MCDA value trees.'
      );
    case 'mcda':
      return (
        'Multi-criteria decision analysis (MCDA): each alternative is scored on every criterion, scores ' +
        'are combined with normalized swing weights into a single weighted value, and sensitivity analysis ' +
        'tests robustness to the weights. Yields a fully quantitative, auditable benefit-risk score but ' +
        'requires defensible value functions and weight elicitation.'
      );
    default:
      return 'Weighting approach not specified.';
  }
}

/**
 * Design a PrOACT-URL / IMI PROTECT BRAT value tree: decision objective →
 * benefit and risk criteria → outcome measures, with a recommended weighting
 * approach (qualitative, swing weighting, or full MCDA). When swing weighting
 * or MCDA is selected and importance ranks are supplied, deterministic
 * normalized swing weights are computed.
 */
export function designValueTree(params: DesignValueTreeParams): ValueTreeResult {
  const productName = norm(params.productName, 'the product');
  const indication = norm(params.indication, 'the indication');
  const decisionObjective = norm(
    params.decisionObjective,
    `Determine the benefit-risk balance of ${productName} in ${indication}`,
  );
  const approach = params.weightingApproach ?? 'swing_weighting';
  const criteria = params.criteria ?? [];
  const alternatives =
    params.alternatives && params.alternatives.length > 0
      ? params.alternatives.map((a: string) => norm(a, 'alternative'))
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
  readonly affects: 'benefit' | 'risk' | 'both';
  readonly level: UncertaintyLevel;
  readonly impactOnBalance: string;
  readonly mitigationToReduce: string;
}

export interface BRUncertaintyResult {
  readonly productName: string;
  readonly indication: string;
  readonly sources: ResolvedUncertaintySource[];
  readonly overallUncertainty: UncertaintyLevel;
  readonly robustnessOfConclusion: 'robust' | 'sensitive' | 'fragile';
  readonly whatWouldChangeTheConclusion: string[];
  readonly recommendedSensitivityAnalyses: string[];
  readonly residualUncertaintyForLabel: string[];
  readonly narrative: string;
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

function uncertaintySourceLabel(type: UncertaintySourceType): string {
  switch (type) {
    case 'data_quality':
      return 'Data quality / risk of bias';
    case 'extrapolation':
      return 'Extrapolation beyond studied conditions';
    case 'rare_events':
      return 'Rare serious adverse events (limited exposure)';
    case 'indirect_evidence':
      return 'Indirect / network evidence';
    case 'surrogate_endpoint':
      return 'Surrogate endpoint translation';
    case 'missing_data':
      return 'Missing data / dropout';
    case 'external_validity':
      return 'External validity / generalizability';
    case 'subgroup':
      return 'Subgroup heterogeneity';
    case 'long_term':
      return 'Long-term efficacy and safety';
    case 'comparator':
      return 'Comparator relevance';
    default:
      return 'Uncertainty source';
  }
}

function uncertaintyDefaultDescription(type: UncertaintySourceType): string {
  switch (type) {
    case 'data_quality':
      return 'Internal validity may be limited by design or conduct issues (randomization, blinding, ascertainment).';
    case 'extrapolation':
      return 'Conclusions are extended beyond the populations, doses, or durations actually studied.';
    case 'rare_events':
      return 'The trial exposure is too small to characterize low-frequency serious harms; absence of evidence is not evidence of absence.';
    case 'indirect_evidence':
      return 'Comparisons rely on indirect or network evidence rather than head-to-head randomized data.';
    case 'surrogate_endpoint':
      return 'Benefit rests on a surrogate whose link to clinical outcomes is incompletely established.';
    case 'missing_data':
      return 'Incomplete follow-up or missing outcomes could bias both efficacy and safety estimates.';
    case 'external_validity':
      return 'The studied population may not represent the real-world indicated population.';
    case 'subgroup':
      return 'The balance may differ across subgroups, and subgroup estimates are imprecise.';
    case 'long_term':
      return 'Durability of benefit and emergence of late harms are not yet characterized.';
    case 'comparator':
      return 'The comparator may not reflect the relevant standard of care, affecting the incremental balance.';
    default:
      return 'An uncertainty affecting the benefit-risk estimate.';
  }
}

function uncertaintyMitigation(type: UncertaintySourceType): string {
  switch (type) {
    case 'data_quality':
      return 'Sensitivity analyses excluding higher-risk-of-bias data; confirmatory trial if pivotal evidence is affected.';
    case 'extrapolation':
      return 'Restrict the indication/label to the studied conditions, or generate confirmatory data in the extrapolated setting.';
    case 'rare_events':
      return 'Post-authorisation safety study (PASS), registry, and enhanced pharmacovigilance powered for rare events.';
    case 'indirect_evidence':
      return 'Head-to-head randomized comparison or a well-conducted real-world comparative effectiveness study.';
    case 'surrogate_endpoint':
      return 'Confirmatory outcome trial, or post-marketing requirement to verify clinical benefit.';
    case 'missing_data':
      return 'Pre-specified multiple-imputation and tipping-point analyses; minimize loss to follow-up.';
    case 'external_validity':
      return 'Real-world evidence and broader-population studies; pragmatic trial.';
    case 'subgroup':
      return 'Pre-specified subgroup analyses with interaction tests; adequately powered subgroup data.';
    case 'long_term':
      return 'Long-term extension study and post-authorisation safety/efficacy surveillance.';
    case 'comparator':
      return 'Add the current standard-of-care comparator arm or an external comparator with calibration.';
    default:
      return 'Targeted evidence generation to reduce the specific uncertainty.';
  }
}

function uncertaintyImpactProse(
  affects: 'benefit' | 'risk' | 'both',
  level: UncertaintyLevel,
): string {
  const side =
    affects === 'benefit'
      ? 'reduces confidence in the demonstrated benefit'
      : affects === 'risk'
        ? 'reduces confidence in the characterized risk (harms may be under- or over-stated)'
        : 'reduces confidence in both benefit and risk estimates';
  const strength =
    level === 'high'
      ? 'materially — potentially decisive for a narrowly balanced conclusion'
      : level === 'moderate'
        ? 'moderately — relevant where the net margin is small'
        : 'modestly — unlikely to overturn a clear conclusion';
  return `This ${side}; impact is judged ${strength}.`;
}

/**
 * Assess the uncertainty surrounding a benefit-risk conclusion: enumerate the
 * sources (data quality, extrapolation, rare events, indirect evidence, etc.),
 * grade their impact on the balance, judge how robust the conclusion is, and
 * state explicitly what would change the conclusion. Implements the PROTECT/EMA
 * "Uncertainty" element and the FDA framework's uncertainty discipline.
 */
export function assessBRUncertainty(params: AssessBRUncertaintyParams): BRUncertaintyResult {
  const productName = norm(params.productName, 'the product');
  const indication = norm(params.indication, 'the indication');
  const sourcesIn = params.sources ?? [];

  const sources: ResolvedUncertaintySource[] = [];
  let highCount = 0;
  let moderateCount = 0;
  let worst: UncertaintyLevel = 'low';
  for (const s of sourcesIn) {
    const level = s.level ?? 'moderate';
    const affects = s.affects ?? 'both';
    if ((level as UncertaintyLevel) === 'high') highCount += 1;
    if ((level as UncertaintyLevel) === 'moderate') moderateCount += 1;
    worst = worseUncertainty(worst, level);
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

  const overallUncertainty: UncertaintyLevel = sourcesIn.length === 0 ? 'moderate' : worst;

  // Robustness: combine number/severity of uncertainties with the net margin.
  const margin = params.netBalanceEstimate !== undefined ? Math.abs(params.netBalanceEstimate) : 0.15;
  let robustness: 'robust' | 'sensitive' | 'fragile';
  if (highCount >= 2 || (highCount >= 1 && margin < 0.1)) {
    robustness = 'fragile';
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
  if (whatWouldChangeTheConclusion.length === 0) {
    whatWouldChangeTheConclusion.push(
      'No specific decision-flipping uncertainty was identified from the supplied sources; the conclusion appears ' +
        'insensitive to the stated uncertainties.',
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
    if ((s.level as UncertaintyLevel) === 'high') {
      residualUncertaintyForLabel.push(
        `${s.label}: carry as "missing information" in the risk management plan and reflect in labeling/PASS.`,
      );
    }
  }
  if (residualUncertaintyForLabel.length === 0) {
    residualUncertaintyForLabel.push('No high-grade residual uncertainty requires explicit labeling beyond routine pharmacovigilance.');
  }

  const narrative =
    `Uncertainty assessment for ${productName} in ${indication}: ${sources.length} source(s) considered ` +
    `(${highCount} high, ${moderateCount} moderate). Overall uncertainty is graded ${overallUncertainty}; ` +
    `the conclusion is judged ${robustness} given a net margin of approximately ${round(margin, 3)}. ` +
    `The principal way the conclusion could change: ${whatWouldChangeTheConclusion[0]}`;

  const methodNotes: string[] = [
    'Uncertainty sources follow the PROTECT/EMA taxonomy and the FDA framework\'s requirement to make ' +
      'uncertainties explicit alongside the evidence in every framework row.',
    'Robustness combines the count/severity of uncertainties with the net benefit-risk margin: a small margin ' +
      'plus high uncertainty yields a fragile conclusion.',
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

export interface PlanBRCommunicationParams {
  readonly productName: string;
  readonly indication: string;
  readonly verdict?: BRVerdict;
  /** The key benefit and risk messages to frame. */
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
  readonly citations: Citation[];
  readonly methodNotes: string[];
}

function audienceLabel(a: BRAudience): string {
  switch (a) {
    case 'label':
      return 'Product label / prescribing information';
    case 'advisory_committee':
      return 'Advisory committee';
    case 'prescriber':
      return 'Prescribers / healthcare professionals';
    case 'patient':
      return 'Patients and caregivers';
    case 'payer':
      return 'Payers / HTA bodies';
    case 'regulator_internal':
      return 'Internal regulatory review team';
    default:
      return 'Audience';
  }
}

function audienceFraming(a: BRAudience, patientData: boolean): string {
  switch (a) {
    case 'label':
      return (
        'Frame the balance through the indication, Warnings/Precautions, and Adverse Reactions sections; ' +
        'state benefit precisely in terms of the studied endpoint and population, and present risks at the ' +
        'frequency and severity supported by the data. Avoid promotional or comparative claims not supported by adequate evidence.'
      );
    case 'advisory_committee':
      return (
        'Frame as a transparent, structured benefit-risk story: analysis of condition and unmet need, the ' +
        'magnitude and certainty of benefit, the seriousness and manageability of risk, key uncertainties, and ' +
        'the specific questions on which the committee\'s advice is sought. Present both favourable and ' +
        'unfavourable evidence even-handedly.'
      );
    case 'prescriber':
      return (
        'Frame around the clinical decision: which patients benefit most, what to monitor, how to manage and ' +
        'mitigate the principal risks, and how the product compares to alternatives in practice.'
      );
    case 'patient':
      return (
        'Frame in plain language around what the treatment can do, what it cannot do, the chance and ' +
        'seriousness of common and serious harms, and what to watch for — using absolute frequencies (natural ' +
        'frequencies, e.g. "x in 1,000") rather than relative risks.' +
        (patientData
          ? ' Incorporate patient-experience/PFDD data on which outcomes patients value most.'
          : '')
      );
    case 'payer':
      return (
        'Frame around incremental benefit versus the relevant comparator, the population in whom benefit is ' +
        'greatest, and the budget/risk-management implications; align with the HTA evidence requirements.'
      );
    case 'regulator_internal':
      return (
        'Frame using the full structured framework (FDA grid or EMA effects table plus PrOACT-URL), with all ' +
        'evidence, uncertainties, and the integrated reasoning documented for the administrative record.'
      );
    default:
      return 'Frame the benefit-risk balance appropriately for the audience.';
  }
}

function audienceFormat(a: BRAudience): string {
  switch (a) {
    case 'label':
      return 'Structured prescribing information per regional template (US PI / EU SmPC).';
    case 'advisory_committee':
      return 'Sponsor briefing document + slide deck with effects table and forest/value-tree visuals.';
    case 'prescriber':
      return 'Concise benefit-risk summary, educational materials, and (where applicable) DHPC.';
    case 'patient':
      return 'Plain-language leaflet / patient information using icon arrays and natural frequencies.';
    case 'payer':
      return 'Value dossier with comparative benefit-risk and subgroup analyses.';
    case 'regulator_internal':
      return 'Assessment report (Module 2.5.6 / EPAR benefit-risk section).';
    default:
      return 'Audience-appropriate format.';
  }
}

function audienceMustInclude(a: BRAudience): string[] {
  switch (a) {
    case 'label':
      return [
        'Indication and population precisely matching the evidence',
        'Serious risks with frequency and management in Warnings/Precautions',
        'No unsupported comparative or superiority claims',
      ];
    case 'advisory_committee':
      return [
        'Even-handed presentation of favourable and unfavourable evidence',
        'Explicit statement of key uncertainties and what would change the conclusion',
        'The specific questions posed to the committee',
      ];
    case 'prescriber':
      return [
        'Patient-selection guidance',
        'Monitoring and risk-mitigation steps',
        'Absolute (not only relative) effect sizes',
      ];
    case 'patient':
      return [
        'Natural-frequency presentation of benefits and harms',
        'Plain language, no jargon',
        'What to watch for and when to seek care',
      ];
    case 'payer':
      return [
        'Incremental benefit vs relevant comparator',
        'Subgroup / enriched-population analyses',
        'Risk-management and budget implications',
      ];
    case 'regulator_internal':
      return [
        'Complete structured framework with all evidence and uncertainties',
        'Traceable reasoning to the decision',
        'Risk management plan linkage',
      ];
    default:
      return ['Audience-appropriate content'];
  }
}

function audienceCautions(a: BRAudience): string[] {
  switch (a) {
    case 'label':
      return ['Do not overstate benefit or understate risk', 'Keep claims within the studied evidence'];
    case 'advisory_committee':
      return ['Avoid selective presentation of favourable data', 'Disclose all material uncertainties'];
    case 'prescriber':
      return ['Avoid relative-risk-only framing that exaggerates benefit'];
    case 'patient':
      return ['Avoid technical jargon and relative-risk-only framing', 'Avoid alarming or minimizing language'];
    case 'payer':
      return ['Do not extrapolate beyond the evidenced population'];
    case 'regulator_internal':
      return ['Maintain an auditable, reproducible record'];
    default:
      return [];
  }
}

/**
 * Plan benefit-risk communication across audiences (label, advisory committee,
 * prescriber, patient, payer, internal review): audience-specific framing,
 * format, must-include content, cautions, and a recommended visual-summary
 * approach (effects table, forest plot, value-tree, icon arrays). Enforces a
 * single consistent core benefit-risk message across all artifacts.
 */
export function planBRCommunication(params: PlanBRCommunicationParams): BRCommunicationResult {
  const productName = norm(params.productName, 'the product');
  const indication = norm(params.indication, 'the indication');
  const verdict: BRVerdict = params.verdict ?? 'favourable_with_conditions';
  const patientData = params.patientExperienceDataAvailable === true;
  const includeVisual = params.includeVisualSummary !== false;
  const benefitMessages = params.keyBenefitMessages ?? [];
  const riskMessages = params.keyRiskMessages ?? [];

  const audiences: BRAudience[] =
    params.audiences && params.audiences.length > 0
      ? [...params.audiences]
      : ['label', 'advisory_committee', 'prescriber', 'patient', 'payer', 'regulator_internal'];

  const audiencePlans: AudienceCommunicationPlan[] = audiences.map((a: BRAudience) => ({
    audience: a,
    audienceLabel: audienceLabel(a),
    framing: audienceFraming(a, patientData),
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
      ? `provides ${benefitMessages.map((m: string) => norm(m, 'benefit')).join('; ')}`
      : 'provides the demonstrated benefit in the indicated population';
  const riskClause =
    riskMessages.length > 0
      ? `with the principal risks being ${riskMessages.map((m: string) => norm(m, 'risk')).join('; ')}`
      : 'with manageable, characterized risks';
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
  ];

  return {
    productName,
    indication,
    verdict,
    audiencePlans,
    visualSummary,
    coreBenefitRiskMessage,
    consistencyRequirement,
    citations: citeAll(['FDA_BR_FRAMEWORK_2023', 'FDA_PFDD', 'EMA_EFFECTS_TABLE', 'IMI_PROTECT_BRAT', 'CIOMS_VI']),
    methodNotes,
  };
}
