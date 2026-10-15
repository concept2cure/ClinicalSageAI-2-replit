/**
 * Immunogenicity Intelligence — Deterministic Knowledge Base
 * ============================================================
 *
 * A pure, closed-form regulatory-science knowledge engine for the
 * immunogenicity assessment of therapeutic protein products. Every function
 * is deterministic: identical input always yields identical output. There is
 * NO LLM, NO network and NO database. The one import is ComputationRefusal,
 * thrown when a required input is missing or a stated one cannot be used, so
 * that AnA relays it as needs_parameters. All content is hardcoded,
 * citation-backed reference data and decision logic.
 *
 * Grounding references (cited inline throughout):
 *  - FDA (Jan 2019) "Immunogenicity Testing of Therapeutic Protein Products —
 *    Developing and Validating Assays for Anti-Drug Antibody Detection"
 *    (Guidance for Industry). Referred to as "FDA 2019".
 *  - FDA (Aug 2014) "Immunogenicity Assessment for Therapeutic Protein
 *    Products" (Guidance for Industry). Referred to as "FDA 2014".
 *  - EMA "Guideline on Immunogenicity Assessment of Therapeutic Proteins"
 *    EMEA/CHMP/BMWP/14327/2006 Rev 1 (2017). Referred to as "EMA 2017".
 *  - EMA "Guideline on Immunogenicity Assessment of Monoclonal Antibodies
 *    Intended for In Vivo Clinical Use" EMA/CHMP/BMWP/86289/2010.
 *  - USP General Chapter <1106> "Immunogenicity Assays — Design and
 *    Validation of Immunoassays to Detect Anti-Drug Antibodies" and <1106.1>
 *    for neutralizing antibody assays.
 *  - ICH S6(R1) "Preclinical Safety Evaluation of Biotechnology-Derived
 *    Pharmaceuticals" (2011).
 *  - ICH Q5E "Comparability of Biotechnological/Biological Products Subject
 *    to Changes in Their Manufacturing Process" (2004).
 *  - FDA (2015) "Scientific Considerations in Demonstrating Biosimilarity to
 *    a Reference Product".
 *  - Shankar et al. (2008) J Pharm Biomed Anal — cut-point methodology.
 *  - Shankar et al. (2014) AAPS J — neutralizing antibody assay
 *    recommendations.
 *
 * @module server/services/immunogenicity/immunogenicity-knowledge
 */

import { ComputationRefusal } from '../ana-biostats/computation-engine';

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 0 — SHARED TYPES, ENUMS, AND REFERENCE TABLES
 * ════════════════════════════════════════════════════════════════════════ */

/** Ordinal risk tiers used across the engine. */
export type RiskTier = 'low' | 'moderate' | 'high';

/** Severity scale for clinical-impact classification. */
export type SeverityLevel = 'none' | 'low' | 'moderate' | 'high' | 'critical';

/** A regulatory citation with the issuing body and a specific locator. */
export interface Citation {
  authority: string;
  document: string;
  locator: string;
}

/** Numeric → tier mapping descriptor (documentation of thresholds). */
export interface ScoreBand {
  tier: RiskTier;
  minScore: number;
  maxScore: number;
  label: string;
}

/**
 * Risk score is normalized 0–100. Bands are inclusive of min, exclusive of
 * max except the top band. These bands are an internal deterministic scale;
 * they are NOT a regulatory threshold but a structured way of aggregating the
 * qualitative risk factors enumerated in FDA 2014 Section III and EMA 2017.
 */
export const RISK_SCORE_BANDS: ScoreBand[] = [
  { tier: 'low', minScore: 0, maxScore: 34, label: 'Low immunogenicity concern' },
  { tier: 'moderate', minScore: 34, maxScore: 67, label: 'Moderate immunogenicity concern' },
  { tier: 'high', minScore: 67, maxScore: 101, label: 'High immunogenicity concern' },
];

/** What the risk score is. Carried in every assessImmunogenicityRisk result. */
const RISK_METHODOLOGY =
  'Platform heuristic, not an FDA/EMA scale. FDA 2014 and EMA 2017 name the factors, and each factorCitation ' +
  'cites the guidance for the factor only. The weights, the 0–100 score and the tier bands (low < ' +
  `${RISK_SCORE_BANDS[1].minScore} ≤ moderate < ${RISK_SCORE_BANDS[2].minScore} ≤ high) are this platform's own ` +
  'and come from no guidance. No score or tier is given until every factor is stated.';

const RISK_TIERS: RiskTier[] = RISK_SCORE_BANDS.map((b: ScoreBand) => b.tier);

/** Resolve a normalized 0–100 score to a risk tier deterministically. */
function scoreToTier(score: number): RiskTier {
  const clamped = score < 0 ? 0 : score > 100 ? 100 : score;
  for (const band of RISK_SCORE_BANDS) {
    if (clamped >= band.minScore && clamped < band.maxScore) {
      return band.tier;
    }
  }
  return 'high';
}

/** Combine two tiers, returning the more severe of the two. */
function maxTier(a: RiskTier, b: RiskTier): RiskTier {
  const order: RiskTier[] = ['low', 'moderate', 'high'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/** Combine two severities, returning the more severe of the two. */
function maxSeverity(a: SeverityLevel, b: SeverityLevel): SeverityLevel {
  const order: SeverityLevel[] = ['none', 'low', 'moderate', 'high', 'critical'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/** Round to a fixed number of decimals deterministically. */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function shown(value: unknown): string {
  return typeof value === 'number' ? String(value) : JSON.stringify(value);
}

/**
 * A stated enum input, or undefined when it was not stated (null counts as not
 * stated). A value outside the vocabulary is refused, never scored as a guess.
 */
function statedOneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new ComputationRefusal(
    'invalid_input',
    `${field} must be one of ${allowed.join(', ')} (got ${shown(value)}). Leave it out if it is not known.`,
    field,
  );
}

/** A stated boolean input, or undefined when it was not stated. Absent is not false. */
function statedBoolean(field: string, value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  throw new ComputationRefusal(
    'invalid_input',
    `${field} must be true or false (got ${shown(value)}). Leave it out if it is not known.`,
    field,
  );
}

/** A stated finite number that satisfies `ok`, or undefined when it was not stated. */
function statedNumber(field: string, value: unknown, ok: (n: number) => boolean, rule: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && ok(value)) return value;
  throw new ComputationRefusal('invalid_input', `${field} must be ${rule} (got ${shown(value)}).`, field);
}

/** Canonical citations reused across the engine. */
export const CITATIONS: Record<string, Citation> = {
  FDA_2019: {
    authority: 'FDA',
    document:
      'Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for Anti-Drug Antibody Detection (Jan 2019)',
    locator: 'Guidance for Industry',
  },
  FDA_2019_TIERS: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section IV — Tiered Approach (Screening, Confirmatory, Titer, NAb)',
  },
  FDA_2019_CUTPOINT: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section V.A — Screening Cut Point (5% false-positive rate)',
  },
  FDA_2019_SENSITIVITY: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section V.C — Assay Sensitivity (target ≤ 100 ng/mL)',
  },
  FDA_2019_DRUGTOL: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section V.D — Drug Tolerance',
  },
  FDA_2019_NAB: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section VI — Neutralizing Antibody Assays',
  },
  FDA_2014: {
    authority: 'FDA',
    document: 'Immunogenicity Assessment for Therapeutic Protein Products (Aug 2014)',
    locator: 'Guidance for Industry',
  },
  FDA_2014_FACTORS: {
    authority: 'FDA',
    document: 'Immunogenicity Assessment for Therapeutic Protein Products (Aug 2014)',
    locator: 'Section III — Factors That Can Affect Immunogenicity',
  },
  FDA_2014_CONSEQUENCES: {
    authority: 'FDA',
    document: 'Immunogenicity Assessment for Therapeutic Protein Products (Aug 2014)',
    locator: 'Section II — Clinical Consequences of Immune Responses',
  },
  FDA_2014_RISKBASED: {
    authority: 'FDA',
    document: 'Immunogenicity Assessment for Therapeutic Protein Products (Aug 2014)',
    locator: 'Section IV — Risk-Based Approach to Immunogenicity Evaluation',
  },
  EMA_2017: {
    authority: 'EMA',
    document:
      'Guideline on Immunogenicity Assessment of Therapeutic Proteins (EMEA/CHMP/BMWP/14327/2006 Rev 1, 2017)',
    locator: 'Risk-based immunogenicity programme',
  },
  EMA_MABS: {
    authority: 'EMA',
    document:
      'Guideline on Immunogenicity Assessment of Monoclonal Antibodies for In Vivo Clinical Use (EMA/CHMP/BMWP/86289/2010)',
    locator: 'Monoclonal antibody-specific considerations',
  },
  USP_1106: {
    authority: 'USP',
    document: 'General Chapter <1106> Immunogenicity Assays — Design and Validation (ADA detection)',
    locator: 'Cut-point, sensitivity, specificity, precision',
  },
  USP_1106_1: {
    authority: 'USP',
    document: 'General Chapter <1106.1> Neutralizing Antibody Assay Design and Validation',
    locator: 'Cell-based vs competitive ligand-binding NAb assays',
  },
  ICH_S6R1: {
    authority: 'ICH',
    document: 'ICH S6(R1) Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals (2011)',
    locator: 'Immunogenicity and limitations of animal immunogenicity data',
  },
  ICH_Q5E: {
    authority: 'ICH',
    document: 'ICH Q5E Comparability of Biotechnological/Biological Products (2004)',
    locator: 'Comparability after manufacturing changes',
  },
  FDA_BIOSIM: {
    authority: 'FDA',
    document: 'Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015)',
    locator: 'Immunogenicity comparison for biosimilars',
  },
  SHANKAR_2008: {
    authority: 'Shankar et al.',
    document: 'Recommendations for the validation of immunoassays used for ADA detection (J Pharm Biomed Anal 2008)',
    locator: 'Cut-point statistics (mean + 1.645·SD)',
  },
  SHANKAR_2014: {
    authority: 'Shankar et al.',
    document: 'Assessment and reporting of clinical immunogenicity — NAb assay recommendations (AAPS J 2014)',
    locator: 'Neutralizing antibody assay format selection',
  },
};

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 1 — assessImmunogenicityRisk
 * ════════════════════════════════════════════════════════════════════════ */

/** Therapeutic-protein product class. */
export type ProductType =
  | 'human_recombinant' // fully human sequence (e.g., epoetin, somatropin)
  | 'humanized_mab' // CDR-grafted monoclonal antibody
  | 'chimeric_mab' // mouse variable / human constant
  | 'murine_mab' // fully murine
  | 'fusion_protein' // Fc-fusion or other fusion
  | 'pegylated_protein' // PEGylated conjugate
  | 'enzyme_replacement' // ERT for inborn errors of metabolism
  | 'coagulation_factor' // e.g., factor VIII / IX
  | 'non_human_protein' // bacterial/plant/animal origin (e.g., asparaginase, botulinum)
  | 'peptide'; // short synthetic/recombinant peptide

/** Sequence/structural foreignness relative to the human proteome. */
export type Foreignness = 'fully_human' | 'humanized' | 'chimeric' | 'non_human';

/** Aggregate / particle burden categorization. */
export type AggregationLevel = 'low' | 'moderate' | 'high';

/** Glycosylation/post-translational status. */
export type GlycosylationStatus =
  | 'human_like'
  | 'non_human_glycans' // e.g., galactose-α-1,3-galactose, NGNA from non-human cell lines
  | 'aglycosylated'
  | 'not_applicable';

/** Route of administration (immunological exposure pathway). */
export type Route = 'intravenous' | 'subcutaneous' | 'intramuscular' | 'intravitreal' | 'inhaled' | 'topical' | 'oral';

/** Dosing frequency category. */
export type DoseFrequency = 'single' | 'intermittent' | 'chronic_weekly' | 'chronic_daily' | 'continuous';

/** Patient immune status. */
export type ImmuneStatus = 'immunocompetent' | 'immunosuppressed' | 'autoimmune' | 'mixed';

const FOREIGNNESS_VALUES: Foreignness[] = ['fully_human', 'humanized', 'chimeric', 'non_human'];
const AGGREGATION_LEVELS: AggregationLevel[] = ['low', 'moderate', 'high'];
const GLYCOSYLATION_STATUSES: GlycosylationStatus[] = ['human_like', 'non_human_glycans', 'aglycosylated', 'not_applicable'];
const IMMUNE_STATUSES: ImmuneStatus[] = ['immunocompetent', 'immunosuppressed', 'autoimmune', 'mixed'];

export interface ImmunogenicityRiskParams {
  /** Therapeutic-protein product class. */
  productType: ProductType;
  /** Sequence foreignness relative to the human proteome. */
  foreignness?: Foreignness;
  /** Whether the product has a human endogenous counterpart with a
   *  non-redundant biological function (cross-reactivity concern). */
  hasEndogenousCounterpart?: boolean;
  /** Whether the endogenous counterpart is non-redundant / life-sustaining
   *  (e.g., EPO, thrombopoietin) — drives the most severe risk. */
  endogenousNonRedundant?: boolean;
  /** Aggregate / subvisible-particle burden. */
  aggregationLevel?: AggregationLevel;
  /** Glycosylation status (relevant for cell-line-derived glycoproteins). */
  glycosylation?: GlycosylationStatus;
  /** Presence of process-related impurities (HCP, DNA, leachables) that may
   *  act as adjuvants. */
  hasImmunogenicImpurities?: boolean;
  /** Formulation contains a known T-cell-independent adjuvant-like component
   *  or is prone to particle formation (e.g., polysorbate degradation). */
  formulationRisk?: boolean;
  /** Route of administration. */
  route?: Route;
  /** Dosing frequency. */
  doseFrequency?: DoseFrequency;
  /** Patient immune status of the intended population. */
  immuneStatus?: ImmuneStatus;
  /** Whether concomitant immunosuppression is part of the regimen. */
  concomitantImmunosuppression?: boolean;
  /** Free-text drug name (optional, echoed in output). */
  drugName?: string;
}

export interface RiskFactorContribution {
  factor: string;
  category: 'product' | 'patient_treatment';
  observation: string;
  /** This platform's heuristic weight for the observation. No guidance sets it. */
  scoreContribution: number;
  weightBasis: 'platform_heuristic';
  rationale: string;
  /** The guidance that names this as an immunogenicity factor. It does not set or endorse the weight. */
  factorCitation: Citation;
}

/** A risk factor whose input was not stated. It is neither scored nor assumed. */
export interface NotAssessedFactor {
  factor: string;
  /** The input that would settle it. */
  input: keyof ImmunogenicityRiskParams;
  category: RiskFactorContribution['category'];
}

export interface Mitigation {
  target: string;
  action: string;
  citation: Citation;
}

export interface RequiredStudy {
  study: string;
  timing: string;
  rationale: string;
  citation: Citation;
}

export interface ImmunogenicityRiskResult {
  drugName: string;
  productType: ProductType;
  /** 'undetermined' while any factor in notAssessed is unstated. */
  overallTier: RiskTier | 'undetermined';
  /** 0–100 platform-heuristic score (see methodology); null while any factor is not assessed. */
  riskScore: number | null;
  bandLabel: string;
  /** What the score and the tier are: a platform heuristic, not an FDA/EMA scale. */
  methodology: string;
  factorContributions: RiskFactorContribution[];
  notAssessed: NotAssessedFactor[];
  /** Sum of the heuristic weights in each category; null while a factor in it is not assessed. */
  productFactorScore: number | null;
  patientTreatmentFactorScore: number | null;
  mitigations: Mitigation[];
  requiredStudies: RequiredStudy[];
  keyConcerns: string[];
  citations: Citation[];
  summary: string;
}

/** Foreignness inferred from product type when not explicitly supplied. */
interface ForeignnessDescriptor {
  productType: ProductType;
  foreignness: Foreignness;
  baseScore: number;
  note: string;
}

const PRODUCT_FOREIGNNESS: ForeignnessDescriptor[] = [
  {
    productType: 'human_recombinant',
    foreignness: 'fully_human',
    baseScore: 6,
    note: 'Fully human sequence; lowest sequence-based foreignness, but breaking B-cell tolerance to a self-antigen remains possible.',
  },
  {
    productType: 'humanized_mab',
    foreignness: 'humanized',
    baseScore: 10,
    note: 'CDR-grafted humanized mAb; residual murine CDR and idiotype epitopes can elicit ADA.',
  },
  {
    productType: 'chimeric_mab',
    foreignness: 'chimeric',
    baseScore: 16,
    note: 'Chimeric mAb (murine variable / human constant); higher anti-drug antibody potential than humanized.',
  },
  {
    productType: 'murine_mab',
    foreignness: 'non_human',
    baseScore: 24,
    note: 'Fully murine mAb; strong human anti-mouse antibody (HAMA) response expected.',
  },
  {
    productType: 'fusion_protein',
    foreignness: 'humanized',
    baseScore: 12,
    note: 'Fusion protein; novel junctional (neo-)epitopes at the fusion interface are a recognized ADA driver.',
  },
  {
    productType: 'pegylated_protein',
    foreignness: 'humanized',
    baseScore: 10,
    note: 'PEGylated protein; anti-PEG antibodies and accelerated blood clearance are documented.',
  },
  {
    productType: 'enzyme_replacement',
    foreignness: 'humanized',
    baseScore: 18,
    note: 'Enzyme replacement therapy; CRIM-negative patients lacking endogenous protein mount strong responses.',
  },
  {
    productType: 'coagulation_factor',
    foreignness: 'humanized',
    baseScore: 18,
    note: 'Coagulation factor (e.g., FVIII); inhibitor (neutralizing ADA) development is a major clinical concern.',
  },
  {
    productType: 'non_human_protein',
    foreignness: 'non_human',
    baseScore: 26,
    note: 'Non-human-origin protein (bacterial/plant/animal); intrinsically foreign to the human immune system.',
  },
  {
    productType: 'peptide',
    foreignness: 'humanized',
    baseScore: 8,
    note: 'Peptide; generally lower MHC-presentation potential but aggregation and carrier conjugation can raise risk.',
  },
];

function foreignnessDescriptor(productType: unknown): ForeignnessDescriptor | undefined {
  // 2026-10-15: an unrecognized product type used to get a "default moderate
  // sequence-foreignness assumption" (12). The caller now refuses it.
  return PRODUCT_FOREIGNNESS.find((d: ForeignnessDescriptor) => d.productType === productType);
}

interface RouteDescriptor {
  route: Route;
  score: number;
  note: string;
}

/**
 * Subcutaneous administration is the highest-risk route because antigen is
 * presented to the skin's dense network of professional antigen-presenting
 * cells (Langerhans/dermal dendritic cells); IV is comparatively tolerogenic.
 * (FDA 2014 Section III; EMA 2017.)
 */
const ROUTE_RISK: RouteDescriptor[] = [
  { route: 'subcutaneous', score: 12, note: 'SC route accesses dermal/epidermal antigen-presenting cells — highest immunogenic potential.' },
  { route: 'intramuscular', score: 9, note: 'IM route also engages tissue APCs; intermediate-to-high potential.' },
  { route: 'intravitreal', score: 8, note: 'Intravitreal route — local ocular response; systemic ADA generally lower but local effects matter.' },
  { route: 'inhaled', score: 8, note: 'Inhaled route engages mucosal immune tissue (BALT).' },
  { route: 'intravenous', score: 4, note: 'IV route is comparatively tolerogenic; direct systemic exposure with less APC engagement.' },
  { route: 'topical', score: 3, note: 'Topical route — limited systemic exposure.' },
  { route: 'oral', score: 2, note: 'Oral route — oral tolerance mechanisms and degradation reduce systemic ADA.' },
];

function routeDescriptor(route: Route | undefined): RouteDescriptor | undefined {
  // 2026-10-15: an unstated route used to be scored as IV ("IV assumed") and an
  // unrecognized one as a "moderate assumption" (6). Neither was stated.
  return ROUTE_RISK.find((d: RouteDescriptor) => d.route === route);
}

interface FrequencyDescriptor {
  frequency: DoseFrequency;
  score: number;
  note: string;
}

/**
 * Chronic and frequent dosing increases cumulative antigen exposure and the
 * opportunity for affinity maturation and isotype switching; a single dose
 * carries the lowest risk. (FDA 2014 Section III.)
 */
const FREQUENCY_RISK: FrequencyDescriptor[] = [
  { frequency: 'single', score: 2, note: 'Single dose — minimal repeated boosting.' },
  { frequency: 'intermittent', score: 6, note: 'Intermittent dosing — episodic re-exposure can boost memory responses.' },
  { frequency: 'chronic_weekly', score: 9, note: 'Chronic weekly dosing — sustained exposure favors ADA development.' },
  { frequency: 'chronic_daily', score: 11, note: 'Chronic daily dosing — highest cumulative antigen exposure.' },
  { frequency: 'continuous', score: 7, note: 'Continuous infusion — sustained exposure but high/persistent levels can be tolerogenic (high-zone tolerance).' },
];

function frequencyDescriptor(freq: DoseFrequency | undefined): FrequencyDescriptor | undefined {
  // 2026-10-15: an unstated frequency used to be scored as intermittent and an
  // unrecognized one as a "moderate assumption" (6). Neither was stated.
  return FREQUENCY_RISK.find((d: FrequencyDescriptor) => d.frequency === freq);
}

/**
 * assessImmunogenicityRisk — Risk-based classification of a therapeutic
 * protein product per the FDA 2014 risk-based framework (Section IV) and the
 * EMA 2017 risk-based immunogenicity programme. Aggregates product-intrinsic
 * factors (foreignness, aggregation, glycosylation, formulation, impurities)
 * and patient/treatment factors (route, dose frequency, immune status) into
 * an overall risk tier with mitigations and the studies the program should
 * include.
 */
export function assessImmunogenicityRisk(params: ImmunogenicityRiskParams): ImmunogenicityRiskResult {
  const drugName = params.drugName ?? '(unnamed product)';
  const contributions: RiskFactorContribution[] = [];
  const notAssessed: NotAssessedFactor[] = [];
  const mitigations: Mitigation[] = [];
  const requiredStudies: RequiredStudy[] = [];
  const keyConcerns: string[] = [];

  // 2026-10-15: every unstated factor used to be scored as its most favourable
  // value (aggregation low, human-like glycans, IV, intermittent,
  // immunocompetent; absent booleans as 0), so productType alone came back
  // tier LOW, score 18, with the NAb assay dropped. An unstated factor is now
  // listed in notAssessed and leaves the tier undetermined. A stated value the
  // engine cannot score is refused.
  const productTypes = PRODUCT_FOREIGNNESS.map((d: ForeignnessDescriptor) => d.productType).join(', ');
  if (params.productType === undefined || params.productType === null) {
    throw new ComputationRefusal('missing_input', `productType is required (one of ${productTypes}).`, 'productType');
  }
  const fd = foreignnessDescriptor(params.productType);
  if (!fd) {
    throw new ComputationRefusal(
      'invalid_input',
      `productType must be one of ${productTypes} (got ${shown(params.productType)}).`,
      'productType',
    );
  }
  const statedForeignness = statedOneOf('foreignness', params.foreignness, FOREIGNNESS_VALUES);
  const hasEndogenous = statedBoolean('hasEndogenousCounterpart', params.hasEndogenousCounterpart);
  const endogenousNonRedundant = statedBoolean('endogenousNonRedundant', params.endogenousNonRedundant);
  const agg = statedOneOf('aggregationLevel', params.aggregationLevel, AGGREGATION_LEVELS);
  const glyco = statedOneOf('glycosylation', params.glycosylation, GLYCOSYLATION_STATUSES);
  const impurities = statedBoolean('hasImmunogenicImpurities', params.hasImmunogenicImpurities);
  const formulation = statedBoolean('formulationRisk', params.formulationRisk);
  const rd = routeDescriptor(
    statedOneOf('route', params.route, ROUTE_RISK.map((d: RouteDescriptor) => d.route)),
  );
  const freqD = frequencyDescriptor(
    statedOneOf('doseFrequency', params.doseFrequency, FREQUENCY_RISK.map((d: FrequencyDescriptor) => d.frequency)),
  );
  const immune = statedOneOf('immuneStatus', params.immuneStatus, IMMUNE_STATUSES);
  const concomitant = statedBoolean('concomitantImmunosuppression', params.concomitantImmunosuppression);

  // ── Product factor: sequence foreignness ────────────────────────────────
  const foreignness = statedForeignness ?? fd.foreignness;
  let foreignnessScore = fd.baseScore;
  if (statedForeignness === 'non_human') foreignnessScore = Math.max(foreignnessScore, 24);
  if (statedForeignness === 'fully_human') foreignnessScore = Math.min(foreignnessScore, 8);
  contributions.push({
    factor: 'Sequence foreignness',
    category: 'product',
    observation: `${fd.productType} (${foreignness})`,
    scoreContribution: foreignnessScore,
    weightBasis: 'platform_heuristic',
    rationale: fd.note,
    factorCitation: CITATIONS.FDA_2014_FACTORS,
  });
  if (foreignness === 'non_human' || foreignness === 'chimeric') {
    mitigations.push({
      target: 'Sequence foreignness',
      action: 'Apply in silico and in vitro immunogenicity de-risking (HLA-binding epitope prediction, MAPPs, DC:T-cell assays) and consider further humanization/deimmunization of T-cell epitopes.',
      citation: CITATIONS.EMA_2017,
    });
  }

  // ── Product factor: endogenous counterpart / cross-reactivity ───────────
  if (hasEndogenous === undefined) {
    notAssessed.push({ factor: 'Endogenous counterpart', input: 'hasEndogenousCounterpart', category: 'product' });
  } else if (!hasEndogenous) {
    contributions.push({
      factor: 'Endogenous counterpart',
      category: 'product',
      observation: 'No endogenous human counterpart (stated)',
      scoreContribution: 0,
      weightBasis: 'platform_heuristic',
      rationale: 'With no endogenous counterpart, there is no native protein for ADA to cross-react with.',
      factorCitation: CITATIONS.FDA_2014_CONSEQUENCES,
    });
  } else {
    const nonRedundant = endogenousNonRedundant === true;
    // The weight is 18 or 10 by redundancy, so an unstated answer is not
    // read as redundant.
    if (endogenousNonRedundant === undefined) {
      notAssessed.push({ factor: 'Endogenous counterpart', input: 'endogenousNonRedundant', category: 'product' });
    } else {
      contributions.push({
        factor: 'Endogenous counterpart',
        category: 'product',
        observation: nonRedundant
          ? 'Product has a non-redundant endogenous human counterpart'
          : 'Product has an endogenous human counterpart',
        scoreContribution: nonRedundant ? 18 : 10,
        weightBasis: 'platform_heuristic',
        rationale: nonRedundant
          ? 'ADA cross-reacting with a non-redundant endogenous protein can neutralize an essential physiological function (e.g., anti-EPO causing pure red cell aplasia) — the most severe immunogenicity consequence.'
          : 'ADA may cross-react with the endogenous counterpart; assess for neutralization of native function.',
        factorCitation: CITATIONS.FDA_2014_CONSEQUENCES,
      });
    }
    keyConcerns.push(
      nonRedundant
        ? 'Cross-reactive neutralization of a non-redundant endogenous protein is possible — design assays to detect ADA that bind the endogenous molecule and monitor for deficiency syndromes.'
        : 'Potential cross-reactivity with the endogenous counterpart should be characterized.',
    );
    mitigations.push({
      target: 'Endogenous cross-reactivity',
      action: 'Include a NAb assay capable of detecting neutralization of the endogenous counterpart, and monitor for the corresponding clinical deficiency syndrome.',
      citation: CITATIONS.FDA_2019_NAB,
    });
  }

  // ── Product factor: aggregation ─────────────────────────────────────────
  if (agg === undefined) {
    notAssessed.push({ factor: 'Aggregation / particle burden', input: 'aggregationLevel', category: 'product' });
  } else {
    const aggScore = agg === 'high' ? 16 : agg === 'moderate' ? 9 : 2;
    contributions.push({
      factor: 'Aggregation / particle burden',
      category: 'product',
      observation: `Aggregation level: ${agg}`,
      scoreContribution: aggScore,
      weightBasis: 'platform_heuristic',
      rationale:
        'Protein aggregates and subvisible particles present repetitive, multivalent arrays of epitopes that can cross-link B-cell receptors and break tolerance — one of the strongest product-intrinsic immunogenicity risk factors (FDA 2014 Section III).',
      factorCitation: CITATIONS.FDA_2014_FACTORS,
    });
    if (agg !== 'low') {
      mitigations.push({
        target: 'Aggregation',
        action: 'Minimize aggregates via formulation/process optimization; characterize subvisible particles (USP <787>/<788>, MFI, HIAC) and submicron particles; set tight aggregate acceptance criteria and stability controls.',
        citation: CITATIONS.FDA_2014_FACTORS,
      });
      keyConcerns.push('Aggregate/particle content is a recognized immunogenicity driver and must be controlled and monitored across shelf life.');
    }
  }

  // ── Product factor: glycosylation ───────────────────────────────────────
  if (glyco === undefined) {
    notAssessed.push({ factor: 'Glycosylation', input: 'glycosylation', category: 'product' });
  } else {
    let glycoScore = 0;
    let glycoNote = 'Human-like glycosylation; low glycan-related immunogenicity.';
    if (glyco === 'non_human_glycans') {
      glycoScore = 12;
      glycoNote = 'Non-human glycans (e.g., galactose-α-1,3-galactose, N-glycolylneuraminic acid) can be recognized by pre-existing antibodies and trigger hypersensitivity (e.g., cetuximab α-gal reactions).';
    } else if (glyco === 'aglycosylated') {
      glycoScore = 4;
      glycoNote = 'Aglycosylated protein; altered effector function but limited glycan-related ADA risk.';
    } else if (glyco === 'not_applicable') {
      // 2026-10-15: this used to read "Human-like glycosylation" too.
      glycoNote = 'Glycosylation does not apply to this product.';
    }
    contributions.push({
      factor: 'Glycosylation',
      category: 'product',
      observation: `Glycosylation status: ${glyco}`,
      scoreContribution: glycoScore,
      weightBasis: 'platform_heuristic',
      rationale: glycoNote,
      factorCitation: CITATIONS.FDA_2014_FACTORS,
    });
    if (glyco === 'non_human_glycans') {
      mitigations.push({
        target: 'Non-human glycans',
        action: 'Use a glyco-engineered or human/humanized cell line, characterize α-gal/NGNA content, and assess pre-existing anti-glycan antibodies in the target population.',
        citation: CITATIONS.FDA_2014_FACTORS,
      });
      keyConcerns.push('Non-human glycans may elicit hypersensitivity via pre-existing antibodies; characterize and minimize.');
    }
  }

  // ── Product factor: impurities ──────────────────────────────────────────
  if (impurities === undefined) {
    notAssessed.push({ factor: 'Process-related impurities', input: 'hasImmunogenicImpurities', category: 'product' });
  } else if (impurities) {
    contributions.push({
      factor: 'Process-related impurities',
      category: 'product',
      observation: 'Process-related impurities present (HCP, DNA, leachables)',
      scoreContribution: 9,
      weightBasis: 'platform_heuristic',
      rationale:
        'Host-cell proteins, residual DNA, and leachables can act as adjuvants (danger signals) that enhance the adaptive response to the therapeutic protein (FDA 2014 Section III).',
      factorCitation: CITATIONS.FDA_2014_FACTORS,
    });
    mitigations.push({
      target: 'Impurities',
      action: 'Tighten downstream purification, monitor HCP/DNA/leachables with orthogonal methods, and qualify the container-closure system for leachables.',
      citation: CITATIONS.FDA_2014_FACTORS,
    });
  } else {
    contributions.push({
      factor: 'Process-related impurities',
      category: 'product',
      observation: 'No immunogenic process-related impurities (stated)',
      scoreContribution: 0,
      weightBasis: 'platform_heuristic',
      rationale: 'Stated absent, so no adjuvant effect from host-cell protein, DNA or leachables is weighed.',
      factorCitation: CITATIONS.FDA_2014_FACTORS,
    });
  }

  // ── Product factor: formulation ─────────────────────────────────────────
  if (formulation === undefined) {
    notAssessed.push({ factor: 'Formulation', input: 'formulationRisk', category: 'product' });
  } else if (formulation) {
    contributions.push({
      factor: 'Formulation',
      category: 'product',
      observation: 'Formulation susceptible to particle formation / adjuvant-like components',
      scoreContribution: 7,
      weightBasis: 'platform_heuristic',
      rationale:
        'Surfactant (polysorbate) degradation, silicone-oil microdroplets, and freeze–thaw stress can generate immunogenic particles; certain excipients can act as adjuvants (FDA 2014 Section III).',
      factorCitation: CITATIONS.FDA_2014_FACTORS,
    });
    mitigations.push({
      target: 'Formulation',
      action: 'Optimize surfactant level and grade, control silicone-oil in prefilled syringes, and confirm particle stability under stress/shipping conditions.',
      citation: CITATIONS.FDA_2014_FACTORS,
    });
  } else {
    contributions.push({
      factor: 'Formulation',
      category: 'product',
      observation: 'Formulation not prone to particle formation or adjuvant-like components (stated)',
      scoreContribution: 0,
      weightBasis: 'platform_heuristic',
      rationale: 'Stated not at risk, so no formulation-driven particle or adjuvant effect is weighed.',
      factorCitation: CITATIONS.FDA_2014_FACTORS,
    });
  }

  // ── Patient/treatment factor: route ─────────────────────────────────────
  if (!rd) {
    notAssessed.push({ factor: 'Route of administration', input: 'route', category: 'patient_treatment' });
  } else {
    contributions.push({
      factor: 'Route of administration',
      category: 'patient_treatment',
      observation: `Route: ${rd.route}`,
      scoreContribution: rd.score,
      weightBasis: 'platform_heuristic',
      rationale: rd.note,
      factorCitation: CITATIONS.FDA_2014_FACTORS,
    });
    if (rd.route === 'subcutaneous') {
      keyConcerns.push('Subcutaneous administration is the highest-risk route; ensure robust ADA monitoring.');
    }
  }

  // ── Patient/treatment factor: dose frequency ────────────────────────────
  if (!freqD) {
    notAssessed.push({ factor: 'Dose frequency / duration', input: 'doseFrequency', category: 'patient_treatment' });
  } else {
    contributions.push({
      factor: 'Dose frequency / duration',
      category: 'patient_treatment',
      observation: `Frequency: ${freqD.frequency}`,
      scoreContribution: freqD.score,
      weightBasis: 'platform_heuristic',
      rationale: freqD.note,
      factorCitation: CITATIONS.FDA_2014_FACTORS,
    });
  }

  // ── Patient/treatment factor: immune status ─────────────────────────────
  if (immune === undefined) {
    notAssessed.push({ factor: 'Patient immune status', input: 'immuneStatus', category: 'patient_treatment' });
  } else {
    let immuneScore = 0;
    let immuneNote = 'Immunocompetent population — standard responsiveness.';
    if (immune === 'autoimmune') {
      immuneScore = 8;
      immuneNote = 'Autoimmune populations have a dysregulated, primed immune system and may show higher ADA incidence.';
    } else if (immune === 'immunosuppressed') {
      immuneScore = -6;
      immuneNote = 'Immunosuppressed populations generally show reduced ADA incidence (a mitigating factor).';
    } else if (immune === 'mixed') {
      immuneScore = 3;
      immuneNote = 'Mixed population — variable responsiveness; size studies for the most responsive subset.';
    }
    contributions.push({
      factor: 'Patient immune status',
      category: 'patient_treatment',
      observation: `Immune status: ${immune}`,
      scoreContribution: immuneScore,
      weightBasis: 'platform_heuristic',
      rationale: immuneNote,
      factorCitation: CITATIONS.FDA_2014_RISKBASED,
    });
  }

  // ── Patient/treatment factor: concomitant immunosuppression ─────────────
  if (concomitant === undefined) {
    notAssessed.push({
      factor: 'Concomitant immunosuppression',
      input: 'concomitantImmunosuppression',
      category: 'patient_treatment',
    });
  } else if (concomitant) {
    contributions.push({
      factor: 'Concomitant immunosuppression',
      category: 'patient_treatment',
      observation: 'Regimen includes concomitant immunosuppression',
      scoreContribution: -5,
      weightBasis: 'platform_heuristic',
      rationale:
        'Concomitant immunosuppressants (e.g., methotrexate with TNF inhibitors) demonstrably reduce ADA incidence and are a recognized mitigation.',
      factorCitation: CITATIONS.FDA_2014_RISKBASED,
    });
  } else {
    contributions.push({
      factor: 'Concomitant immunosuppression',
      category: 'patient_treatment',
      observation: 'No concomitant immunosuppression in the regimen (stated)',
      scoreContribution: 0,
      weightBasis: 'platform_heuristic',
      rationale: 'Stated absent, so no ADA-reducing effect of an immunosuppressant is weighed.',
      factorCitation: CITATIONS.FDA_2014_RISKBASED,
    });
  }

  // ── Aggregate scoring ────────────────────────────────────────────────────
  // 2026-10-15: each category used to get its own tier from the 0–100 bands,
  // the patient/treatment sum after an undocumented +30. Those weights sum to
  // −7…31, so that tier could never leave 'moderate' (nor 'low' without the
  // offset). The category sums are reported instead.
  let productScoreSum = 0;
  let patientScoreSum = 0;
  for (const c of contributions) {
    if (c.category === 'product') productScoreSum += c.scoreContribution;
    else patientScoreSum += c.scoreContribution;
  }
  const categoryAssessed = (category: NotAssessedFactor['category']): boolean =>
    !notAssessed.some((n: NotAssessedFactor) => n.category === category);
  const productFactorScore = categoryAssessed('product') ? productScoreSum : null;
  const patientTreatmentFactorScore = categoryAssessed('patient_treatment') ? patientScoreSum : null;

  const riskScore =
    notAssessed.length === 0 ? round(Math.max(0, Math.min(100, productScoreSum + patientScoreSum)), 0) : null;
  const overallTier: RiskTier | 'undetermined' = riskScore === null ? 'undetermined' : scoreToTier(riskScore);

  // ── Required studies driven by overall tier ─────────────────────────────
  requiredStudies.push({
    study: 'Validated tiered ADA assay (screening → confirmatory → titer)',
    timing: 'Throughout clinical development (Phase 1 onward)',
    rationale: 'A validated multi-tiered ADA detection strategy is expected for all therapeutic protein products (FDA 2019).',
    citation: CITATIONS.FDA_2019_TIERS,
  });
  if (overallTier !== 'low' || hasEndogenous === true) {
    requiredStudies.push({
      study: 'Neutralizing antibody (NAb) assay',
      timing: 'Phase 2/3; triggered for confirmed ADA-positive samples',
      rationale:
        overallTier === 'undetermined' && hasEndogenous !== true
          ? 'The overall tier is undetermined (see notAssessed), so a low tier, the only case in which this assessment omits the NAb assay, has not been established (FDA 2019 Section VI).'
          : 'Moderate/high-risk products and products with an endogenous counterpart require characterization of neutralizing capacity (FDA 2019 Section VI).',
      citation: CITATIONS.FDA_2019_NAB,
    });
  }
  if (overallTier === 'undetermined') {
    keyConcerns.push(
      'The overall tier is undetermined until every factor in notAssessed is stated. Until then it is open whether the high-tier elements (ADA characterization; immunogenicity risk-management plan) apply.',
    );
  }
  if (overallTier === 'high') {
    requiredStudies.push({
      study: 'ADA characterization (isotype, IgE for hypersensitivity, domain specificity, persistence)',
      timing: 'Phase 2/3 and post-marketing',
      rationale: 'High-risk products warrant deeper ADA characterization and, where relevant, IgE/hypersensitivity assessment and PK/PD impact analysis (FDA 2014; EMA 2017).',
      citation: CITATIONS.EMA_2017,
    });
    requiredStudies.push({
      study: 'Immunogenicity risk-management / pharmacovigilance plan',
      timing: 'Submission and post-marketing',
      rationale: 'High-risk products require a structured immunogenicity risk-management plan with defined monitoring and labeling commitments (EMA 2017).',
      citation: CITATIONS.EMA_2017,
    });
  }
  requiredStudies.push({
    study: 'Correlation of ADA with PK, efficacy, and safety',
    timing: 'Integrated analysis across pivotal trials',
    rationale: 'Immunogenicity data must be interpreted against clinical PK, exposure-response, efficacy, and safety to establish clinical relevance (FDA 2014 Section II).',
    citation: CITATIONS.FDA_2014_CONSEQUENCES,
  });

  // ── Standing mitigations always offered ─────────────────────────────────
  mitigations.push({
    target: 'Program-level',
    action: 'Adopt a risk-based, lifecycle immunogenicity strategy: define the assay strategy, sampling schedule, and analysis plan prospectively in the clinical protocol and statistical analysis plan.',
    citation: CITATIONS.FDA_2014_RISKBASED,
  });

  const citations: Citation[] = dedupeCitations([
    CITATIONS.FDA_2014,
    CITATIONS.FDA_2014_FACTORS,
    CITATIONS.FDA_2014_RISKBASED,
    CITATIONS.FDA_2014_CONSEQUENCES,
    CITATIONS.FDA_2019_TIERS,
    CITATIONS.EMA_2017,
    CITATIONS.ICH_S6R1,
  ]);

  const tally = `${requiredStudies.length} study element(s) recommended; ${mitigations.length} mitigation(s) identified.`;
  const summary =
    riskScore === null
      ? `${drugName}: overall immunogenicity risk tier is UNDETERMINED: ${notAssessed.length} factor input(s) not stated ` +
        `(${notAssessed.map((n: NotAssessedFactor) => n.input).join(', ')}), so no score is computed. ${tally}`
      : `${drugName}: overall immunogenicity risk tier is ${overallTier.toUpperCase()} ` +
        `(platform-heuristic score ${riskScore}/100, not an FDA/EMA scale; product factors ${productScoreSum}, ` +
        `patient/treatment factors ${patientScoreSum}). ` +
        `Dominant drivers: ${contributions
          .slice()
          .sort((a: RiskFactorContribution, b: RiskFactorContribution) => b.scoreContribution - a.scoreContribution)
          .slice(0, 3)
          .map((c: RiskFactorContribution) => c.factor)
          .join(', ')}. ${tally}`;

  const band = RISK_SCORE_BANDS.find((b: ScoreBand) => overallTier === b.tier);

  return {
    drugName,
    productType: fd.productType,
    overallTier,
    riskScore,
    bandLabel: band ? band.label : 'Undetermined: not every risk factor was stated',
    methodology: RISK_METHODOLOGY,
    factorContributions: contributions,
    notAssessed,
    productFactorScore,
    patientTreatmentFactorScore,
    mitigations,
    requiredStudies,
    keyConcerns,
    citations,
    summary,
  };
}

function dedupeCitations(list: Citation[]): Citation[] {
  const seen: Record<string, boolean> = {};
  const out: Citation[] = [];
  for (const c of list) {
    const key = `${c.authority}|${c.document}|${c.locator}`;
    if (!seen[key]) {
      seen[key] = true;
      out.push(c);
    }
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 2 — designADAAssayStrategy
 * ════════════════════════════════════════════════════════════════════════ */

/** Detection platform technology. */
export type AssayPlatform = 'ELISA' | 'ECL' | 'SPR' | 'RIA' | 'bridging_ELISA' | 'bridging_ECL';

/** Phase of clinical development (drives validation rigor). */
export type DevelopmentPhase = 'preclinical' | 'phase1' | 'phase2' | 'phase3' | 'post_marketing';

export interface ADAAssayStrategyParams {
  /** Modality of the therapeutic protein. */
  productType: ProductType;
  /** Highest expected circulating drug concentration at the ADA sampling
   *  time, in µg/mL (drives required drug tolerance). */
  expectedCirculatingDrug_ug_per_mL?: number;
  /** Whether the matrix is expected to contain a high target / soluble
   *  receptor that can interfere with a bridging assay. */
  highSolubleTarget?: boolean;
  /** Whether the product is a monoclonal antibody (affects rheumatoid-factor
   *  and bridging-assay interference considerations). */
  isMonoclonalAntibody?: boolean;
  /** Development phase. */
  phase?: DevelopmentPhase;
  /** Preferred platform, if any (engine will validate suitability). */
  preferredPlatform?: AssayPlatform;
  /** Target sensitivity in ng/mL; FDA 2019 target is ≤ 100 ng/mL. */
  targetSensitivity_ng_per_mL?: number;
  /** Free-text drug name (echoed). */
  drugName?: string;
}

export interface AssayTier {
  tier: string;
  purpose: string;
  method: string;
  cutPointApproach: string;
  reportingResult: string;
  citation: Citation;
}

export interface CutPointSpec {
  tier: string;
  falsePositiveTarget: string;
  statisticalApproach: string;
  formula: string;
  minDonors: number;
  citation: Citation;
}

export interface DrugToleranceSpec {
  /** null when the expected circulating drug level was not stated. */
  expectedCirculatingDrug_ug_per_mL: number | null;
  /** null when the expected circulating drug level was not stated. */
  recommendedDrugTolerance_ug_per_mL: number | null;
  approach: string[];
  citation: Citation;
}

export interface ADAAssayStrategyResult {
  drugName: string;
  recommendedPlatform: AssayPlatform;
  platformRationale: string;
  platformAlternatives: AssayPlatform[];
  tiers: AssayTier[];
  cutPoints: CutPointSpec[];
  drugTolerance: DrugToleranceSpec;
  targetSensitivity_ng_per_mL: number;
  sensitivityStatement: string;
  validationParameters: string[];
  matrixInterferenceControls: string[];
  citations: Citation[];
  summary: string;
}

interface PlatformDescriptor {
  platform: AssayPlatform;
  strengths: string;
  limitations: string;
}

const PLATFORM_LIBRARY: PlatformDescriptor[] = [
  {
    platform: 'bridging_ECL',
    strengths: 'Electrochemiluminescence bridging format: broad dynamic range, high sensitivity, low background, detects all ADA isotypes (except some IgG4 in classic bridging) and is the de-facto industry standard for ADA screening.',
    limitations: 'Bridging formats can under-detect low-affinity, IgG4, and monovalent ADA; susceptible to drug interference unless acid-dissociation is used.',
  },
  {
    platform: 'bridging_ELISA',
    strengths: 'Bridging ELISA: well-characterized, accessible, detects multiple isotypes without isotype-specific reagents.',
    limitations: 'Narrower dynamic range and lower drug tolerance than ECL; colorimetric readout less sensitive.',
  },
  {
    platform: 'ECL',
    strengths: 'Direct ECL formats: high sensitivity and dynamic range.',
    limitations: 'Isotype-specific detection reagents may be needed; species cross-reactivity considerations.',
  },
  {
    platform: 'ELISA',
    strengths: 'Direct/indirect ELISA: simple and economical.',
    limitations: 'Lower sensitivity and drug tolerance; matrix effects.',
  },
  {
    platform: 'SPR',
    strengths: 'Surface plasmon resonance (label-free): real-time kinetics, isotype-independent, useful for confirmatory/characterization and low-affinity ADA.',
    limitations: 'Lower throughput, higher sample volume, generally less sensitive than ECL for screening.',
  },
  {
    platform: 'RIA',
    strengths: 'Radioimmunoassay: high sensitivity and historically high drug tolerance.',
    limitations: 'Radioisotope handling and disposal; declining use.',
  },
];

function platformDescriptor(p: AssayPlatform): PlatformDescriptor {
  for (const d of PLATFORM_LIBRARY) {
    if (d.platform === p) return d;
  }
  return PLATFORM_LIBRARY[0];
}

/**
 * The stated expected drug level and the drug tolerance it calls for, at or
 * above the highest expected concentration at the ADA sampling time (FDA
 * expects a low positive-control ADA to be detected in its presence).
 * 2026-10-15: an unstated level used to be reported as 0 µg/mL with a
 * recommended drug tolerance of 0. Both are null until the level is stated.
 */
function drugToleranceFigures(value: unknown): { expected: number | null; recommended: number | null } {
  const expected = statedNumber('expectedCirculatingDrug_ug_per_mL', value, (n: number) => n >= 0, 'a concentration of 0 µg/mL or more');
  if (expected === undefined) return { expected: null, recommended: null };
  return { expected, recommended: expected > 0 ? round(expected * 1.0, 3) : 0 };
}

/**
 * designADAAssayStrategy — Specifies a multi-tiered ADA assay strategy per
 * the FDA 2019 tiered approach (screening → confirmatory → titer, with NAb as
 * a downstream tier), including platform selection, cut-point statistics,
 * drug tolerance, and the ≤ 100 ng/mL sensitivity target.
 */
export function designADAAssayStrategy(params: ADAAssayStrategyParams): ADAAssayStrategyResult {
  const drugName = params.drugName ?? '(unnamed product)';
  const isMab = params.isMonoclonalAntibody ??
    (params.productType === 'humanized_mab' || params.productType === 'chimeric_mab' || params.productType === 'murine_mab');

  // ── Platform selection ──────────────────────────────────────────────────
  let recommended: AssayPlatform = 'bridging_ECL';
  let rationale =
    'A bridging electrochemiluminescence (ECL) format is recommended as the screening platform: it provides the sensitivity, dynamic range, and isotype breadth expected by FDA 2019 and is the prevailing industry standard for therapeutic protein ADA detection.';

  if (params.highSolubleTarget) {
    rationale +=
      ' Because a high soluble target/receptor is present, incorporate acid-dissociation sample pretreatment and a target-tolerance evaluation to prevent false negatives from drug–target complexes.';
  }
  if (isMab) {
    rationale +=
      ' For a monoclonal antibody, confirm the bridging reagents do not detect rheumatoid factor or other non-specific bridging, and consider an IgG4-sensitive format if the response may be IgG4-skewed.';
  }
  if (params.preferredPlatform && params.preferredPlatform !== recommended) {
    const pd = platformDescriptor(params.preferredPlatform);
    rationale += ` Requested platform ${params.preferredPlatform}: ${pd.strengths} Limitation: ${pd.limitations}`;
    // Honor SPR/RIA only as confirmatory/characterization, keep ECL for screening.
    if (params.preferredPlatform === 'bridging_ELISA' || params.preferredPlatform === 'ELISA') {
      recommended = params.preferredPlatform;
      rationale +=
        ' Using the requested ELISA-based format is acceptable provided sensitivity (≤ 100 ng/mL) and drug tolerance targets are met during validation.';
    }
  }

  const alternatives: AssayPlatform[] = (['bridging_ELISA', 'SPR', 'ECL'] as AssayPlatform[]).filter(
    (p: AssayPlatform) => p !== recommended,
  );

  // ── Tiered strategy ─────────────────────────────────────────────────────
  const tiers: AssayTier[] = [
    {
      tier: 'Tier 1 — Screening',
      purpose: 'Detect all potential ADA-positive samples with a low (≈5%) false-negative rate; deliberately set to be slightly over-sensitive (≈5% false-positive).',
      method: `${recommended} bridging immunoassay; samples above the screening cut point are flagged as "potentially positive".`,
      cutPointApproach: 'Screening cut point set so ~5% of treatment-naïve (drug-negative) samples score positive (95th percentile of the negative population).',
      reportingResult: 'Reactive / Non-reactive (qualitative).',
      citation: CITATIONS.FDA_2019_TIERS,
    },
    {
      tier: 'Tier 2 — Confirmatory (specificity)',
      purpose: 'Confirm that screening-reactive signal is specific to the drug, removing non-specific reactivity.',
      method: 'Competitive inhibition / immunodepletion: pre-incubate sample with excess unlabeled drug; specific signal is reduced by a pre-set percent inhibition threshold.',
      cutPointApproach: 'Confirmatory cut point (percent signal inhibition) set so ~1% of true-negative samples are false-confirmed.',
      reportingResult: 'Confirmed positive / Negative.',
      citation: CITATIONS.FDA_2019_TIERS,
    },
    {
      tier: 'Tier 3 — Titer (quasi-quantitative)',
      purpose: 'Quantify the magnitude of confirmed-positive ADA responses for trend and clinical-correlation analysis.',
      method: 'Serial dilution of confirmed-positive samples to the titer endpoint (last dilution at or above the screening/titer cut point).',
      cutPointApproach: 'Titer reported as the reciprocal of the highest dilution yielding a signal at or above the titration cut point.',
      reportingResult: 'Titer value (reciprocal dilution).',
      citation: CITATIONS.FDA_2019_TIERS,
    },
    {
      tier: 'Tier 4 — Neutralizing antibody (NAb)',
      purpose: 'Determine whether confirmed-positive ADA neutralize the biological activity of the drug.',
      method: 'Cell-based or competitive ligand-binding NAb assay on confirmed-positive samples (see designNAbAssay).',
      cutPointApproach: 'NAb cut point set to a ~1% false-positive rate from drug-naïve samples.',
      reportingResult: 'Neutralizing positive / negative (and, where applicable, NAb titer).',
      citation: CITATIONS.FDA_2019_NAB,
    },
  ];

  // ── Cut points ──────────────────────────────────────────────────────────
  const cutPoints: CutPointSpec[] = [
    {
      tier: 'Screening',
      falsePositiveTarget: '~5% false-positive rate',
      statisticalApproach: 'Parametric (normal data) or non-parametric (95th percentile) on ≥ 50 individual drug-naïve donors across ≥ 3 runs/2 analysts; evaluate biological and analytical variability separately.',
      formula: 'Normalized cut point ≈ mean(negative) + 1.645 × SD(negative) (parametric, one-sided 5%).',
      minDonors: 50,
      citation: CITATIONS.FDA_2019_CUTPOINT,
    },
    {
      tier: 'Confirmatory',
      falsePositiveTarget: '~1% false-positive rate',
      statisticalApproach: 'Percent inhibition distribution from drug-naïve donors; cut point at the 99th percentile (one-sided 1%).',
      formula: 'Confirmatory cut point ≈ mean(%inhibition) + 2.33 × SD(%inhibition) (one-sided 1%).',
      minDonors: 50,
      citation: CITATIONS.FDA_2019_CUTPOINT,
    },
    {
      tier: 'Titer / NAb',
      falsePositiveTarget: '~1% false-positive rate (NAb)',
      statisticalApproach: 'Titration cut point from negative controls; NAb cut point determined like the screening cut point but typically at the 1% false-positive level.',
      formula: 'NAb cut point ≈ mean(negative) + 2.33 × SD(negative) (one-sided 1%).',
      minDonors: 50,
      citation: CITATIONS.SHANKAR_2008,
    },
  ];

  // ── Drug tolerance ──────────────────────────────────────────────────────
  const { expected: expectedDrug, recommended: recommendedTol } = drugToleranceFigures(
    params.expectedCirculatingDrug_ug_per_mL,
  );
  const tolApproach: string[] = [
    'Demonstrate the assay detects the low positive control (≈100 ng/mL surrogate ADA) in the presence of the highest drug concentration expected at the ADA sampling time.',
    'If drug interference exceeds tolerance, apply acid-dissociation (low-pH treatment) followed by neutralization to free ADA from drug–ADA complexes.',
    'Use bead-based extraction (e.g., PandA / affinity capture-elution) to remove excess drug when very high drug levels are expected.',
    'Schedule ADA sampling at trough or after washout (≥ 5 half-lives) to minimize circulating drug at the time of sampling.',
  ];
  const drugTolerance: DrugToleranceSpec = {
    expectedCirculatingDrug_ug_per_mL: expectedDrug,
    recommendedDrugTolerance_ug_per_mL: recommendedTol,
    approach: tolApproach,
    citation: CITATIONS.FDA_2019_DRUGTOL,
  };

  // ── Sensitivity ─────────────────────────────────────────────────────────
  const targetSensitivity = params.targetSensitivity_ng_per_mL ?? 100;
  const sensitivityStatement =
    `Target assay sensitivity is ${targetSensitivity} ng/mL of a positive-control antibody (FDA 2019 recommends ≤ 100 ng/mL). ` +
    'Sensitivity is the lowest concentration of the positive control that consistently yields a signal at or above the screening cut point, reported in mass units (ng/mL) of the surrogate positive control.';

  const validationParameters: string[] = [
    'Cut point (screening, confirmatory, titer, NAb) with documented statistical approach',
    `Sensitivity (target ≤ ${targetSensitivity} ng/mL surrogate positive control)`,
    'Specificity (competitive inhibition / immunodepletion confirmation)',
    'Drug tolerance (detection of low PC in presence of expected drug level)',
    'Target/soluble-receptor tolerance (if applicable)',
    'Precision — intra-assay (repeatability) and inter-assay (intermediate precision)',
    'Selectivity / matrix effects across individual donors (≥ 5–10 disease-state donors)',
    'Hook (prozone) effect evaluation at high ADA concentrations',
    'Robustness and ruggedness (analysts, days, reagent lots)',
    'Stability of samples and positive/negative controls (freeze–thaw, bench-top, long-term)',
    'System suitability and assay acceptance criteria',
  ];

  const matrixInterferenceControls: string[] = [
    'Acid-dissociation pretreatment to mitigate drug interference and free complexed ADA',
    'Target/soluble-receptor competition controls when a high soluble target is present',
    'Rheumatoid-factor and heterophilic-antibody interference assessment (especially for mAbs and Fc-fusion products)',
    'Hemolysis, lipemia, and bilirubin interference checks',
    'Minimum required dilution (MRD) optimization to balance matrix effects and sensitivity',
  ];

  const citations: Citation[] = dedupeCitations([
    CITATIONS.FDA_2019,
    CITATIONS.FDA_2019_TIERS,
    CITATIONS.FDA_2019_CUTPOINT,
    CITATIONS.FDA_2019_SENSITIVITY,
    CITATIONS.FDA_2019_DRUGTOL,
    CITATIONS.USP_1106,
    CITATIONS.SHANKAR_2008,
  ]);

  const summary =
    `${drugName}: recommended ${recommended} multi-tiered ADA strategy (screening → confirmatory → titer → NAb). ` +
    `Screening cut point at ~5% false-positive (mean + 1.645·SD); confirmatory at ~1%. ` +
    `Target sensitivity ≤ ${targetSensitivity} ng/mL. ` +
    (expectedDrug !== null && expectedDrug > 0
      ? `Drug tolerance to ≥ ${recommendedTol} µg/mL with acid-dissociation if exceeded.`
      : 'Define drug tolerance once the expected circulating drug concentration at sampling is known.');

  return {
    drugName,
    recommendedPlatform: recommended,
    platformRationale: rationale,
    platformAlternatives: alternatives,
    tiers,
    cutPoints,
    drugTolerance,
    targetSensitivity_ng_per_mL: targetSensitivity,
    sensitivityStatement,
    validationParameters,
    matrixInterferenceControls,
    citations,
    summary,
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 3 — classifyImmunogenicityClinicalImpact
 * ════════════════════════════════════════════════════════════════════════ */

/** Observed or anticipated consequence domains. */
export interface ClinicalImpactParams {
  /** ADA observed to reduce drug exposure (faster clearance / lower trough). */
  pkImpact?: boolean;
  /** Magnitude of PK impact, if known (fraction reduction in exposure, 0–1). */
  exposureReductionFraction?: number;
  /** ADA neutralize the drug's mechanism of action / loss of efficacy. */
  neutralizingEfficacyLoss?: boolean;
  /** Hypersensitivity / infusion reactions / anaphylaxis observed or expected. */
  hypersensitivity?: boolean;
  /** IgE-mediated (Type I) reactions specifically. */
  igeMediated?: boolean;
  /** Cross-reactivity with a non-redundant endogenous protein. */
  endogenousCrossReactivity?: boolean;
  /** The endogenous counterpart is life-sustaining (e.g., EPO, TPO). */
  endogenousLifeSustaining?: boolean;
  /** ADA are persistent (vs transient). */
  persistentADA?: boolean;
  /** ADA titer is high. */
  highTiter?: boolean;
  /** Whether the indication is life-threatening (affects benefit-risk). */
  lifeThreateningIndication?: boolean;
  /** Free-text drug name (echoed). */
  drugName?: string;
}

export interface ImpactDomain {
  domain: string;
  /** null: not assessed, because the input that decides it was not stated. */
  present: boolean | null;
  /** 'undetermined' when the domain, or the detail that sets its grade, was not stated. */
  severity: SeverityLevel | 'undetermined';
  description: string;
  citation: Citation;
}

export interface LabelingImplication {
  section: string;
  recommendation: string;
  citation: Citation;
}

export interface ClinicalImpactResult {
  drugName: string;
  /** 'undetermined' while a domain is ungraded, unless one is already 'critical' (the top of the scale). */
  overallSeverity: SeverityLevel | 'undetermined';
  domains: ImpactDomain[];
  /** Inputs that were not stated, each with the domain it leaves ungraded. */
  notAssessed: Array<{ domain: string; input: keyof ClinicalImpactParams }>;
  labelingImplications: LabelingImplication[];
  monitoringRecommendations: string[];
  citations: Citation[];
  summary: string;
}

/**
 * classifyImmunogenicityClinicalImpact — Classifies the clinical consequence
 * of an immune response across the four FDA 2014 consequence domains (PK,
 * efficacy/neutralization, safety/hypersensitivity, cross-reactivity to a
 * non-redundant endogenous protein) and derives labeling implications.
 */
export function classifyImmunogenicityClinicalImpact(params: ClinicalImpactParams): ClinicalImpactResult {
  const drugName = params.drugName ?? '(unnamed product)';
  const domains: ImpactDomain[] = [];
  const notAssessed: ClinicalImpactResult['notAssessed'] = [];
  const labeling: LabelingImplication[] = [];
  const monitoring: string[] = [];

  // 2026-10-15: each domain used to be `present = input === true`, so {} came
  // back NONE with "No endogenous cross-reactivity expected/observed", and a
  // PK impact, hypersensitivity or cross-reactivity whose grading detail was
  // unstated was graded as if that detail were the milder one. An unstated
  // input now leaves its domain ungraded and is listed in notAssessed.
  const pkImpact = statedBoolean('pkImpact', params.pkImpact);
  const frac = statedNumber(
    'exposureReductionFraction',
    params.exposureReductionFraction,
    (n: number) => n >= 0 && n <= 1,
    'a fraction from 0 to 1',
  );
  const efficacyLoss = statedBoolean('neutralizingEfficacyLoss', params.neutralizingEfficacyLoss);
  const hypersensitivity = statedBoolean('hypersensitivity', params.hypersensitivity);
  const igeMediated = statedBoolean('igeMediated', params.igeMediated);
  const crossReactivity = statedBoolean('endogenousCrossReactivity', params.endogenousCrossReactivity);
  const lifeSustaining = statedBoolean('endogenousLifeSustaining', params.endogenousLifeSustaining);

  // ── Domain 1: PK impact ─────────────────────────────────────────────────
  {
    const domain = 'Pharmacokinetic (altered exposure)';
    let severity: ImpactDomain['severity'] = 'none';
    let description =
      'No ADA-related PK impact reported. Monitor exposure in ADA-positive subjects to detect emerging impact.';
    if (pkImpact === undefined) {
      severity = 'undetermined';
      description =
        'Not assessed: pkImpact was not stated. Monitor exposure in ADA-positive subjects to detect emerging impact.';
      notAssessed.push({ domain, input: 'pkImpact' });
    } else if (pkImpact && frac === undefined) {
      severity = 'undetermined';
      description =
        'ADA alter drug PK (typically increased clearance / lower trough), but the magnitude (exposureReductionFraction) was not stated, so the impact is not graded. Sustained exposure loss can precede and predict efficacy loss.';
      notAssessed.push({ domain, input: 'exposureReductionFraction' });
    } else if (pkImpact && frac !== undefined) {
      severity = frac >= 0.5 ? 'high' : frac >= 0.2 ? 'moderate' : 'low';
      description = `ADA alter drug PK (typically increased clearance / lower trough)${frac > 0 ? `; estimated exposure reduction ≈ ${round(frac * 100, 0)}%` : ''}. Sustained exposure loss can precede and predict efficacy loss.`;
    }
    domains.push({ domain, present: pkImpact ?? null, severity, description, citation: CITATIONS.FDA_2014_CONSEQUENCES });
    if (pkImpact) {
      monitoring.push('Perform integrated PK–ADA analysis (trough concentrations stratified by ADA status and titer).');
    }
  }

  // ── Domain 2: Efficacy / neutralization ─────────────────────────────────
  {
    const domain = 'Efficacy (neutralization / loss of response)';
    const present = efficacyLoss === true;
    let severity: ImpactDomain['severity'] = present ? 'high' : 'none';
    if (present && (params.persistentADA || params.highTiter)) severity = 'high';
    if (efficacyLoss === undefined) {
      severity = 'undetermined';
      notAssessed.push({ domain, input: 'neutralizingEfficacyLoss' });
    }
    domains.push({
      domain,
      present: efficacyLoss ?? null,
      severity,
      description: present
        ? 'Neutralizing ADA reduce or abolish the drug\'s pharmacological activity, causing secondary loss of efficacy. Confirm with a validated NAb assay and correlate to clinical endpoints.'
        : efficacyLoss === undefined
          ? 'Not assessed: neutralizingEfficacyLoss was not stated. NAb assessment should be available for confirmed-positive subjects.'
          : 'No neutralization-related efficacy loss reported. NAb assessment should still be available for confirmed-positive subjects.',
      citation: CITATIONS.FDA_2014_CONSEQUENCES,
    });
    if (present) {
      monitoring.push('Confirm neutralizing capacity (NAb assay) and correlate with primary efficacy endpoint over time.');
      labeling.push({
        section: 'CLINICAL PHARMACOLOGY / Immunogenicity',
        recommendation: 'Describe the observed neutralizing-antibody incidence and its relationship to loss of efficacy; report ADA/NAb incidence with assay caveats.',
        citation: CITATIONS.FDA_2014_CONSEQUENCES,
      });
    }
  }

  // ── Domain 3: Safety / hypersensitivity ─────────────────────────────────
  {
    const domain = 'Safety (hypersensitivity / infusion reactions / anaphylaxis)';
    // IgE-mediated reactions are hypersensitivity reactions: either stated true
    // makes the domain present; hypersensitivity stated false makes it absent.
    const present: boolean | null =
      hypersensitivity === true || igeMediated === true ? true : hypersensitivity === false ? false : null;
    let severity: ImpactDomain['severity'] = 'none';
    let description = 'No hypersensitivity reactions reported. Maintain standard infusion-reaction surveillance.';
    if (present === null) {
      severity = 'undetermined';
      description = 'Not assessed: hypersensitivity was not stated. Maintain standard infusion-reaction surveillance.';
      notAssessed.push({ domain, input: 'hypersensitivity' });
    } else if (present && igeMediated === true) {
      severity = 'critical';
      description =
        'IgE-mediated (Type I) hypersensitivity raises the risk of anaphylaxis — the most acute immunogenicity safety concern; requires immediate-onset reaction preparedness.';
    } else if (present && igeMediated === false) {
      severity = 'high';
      description =
        'Hypersensitivity / infusion reactions (non-IgE, e.g., immune-complex / cytokine-mediated) require monitoring, premedication strategies, and reaction management.';
    } else if (present) {
      severity = 'undetermined';
      description =
        'Hypersensitivity / infusion reactions reported, but whether they are IgE-mediated (Type I) was not stated, so they are not graded: high if not IgE-mediated, critical (anaphylaxis risk) if IgE-mediated.';
      notAssessed.push({ domain, input: 'igeMediated' });
    }
    domains.push({ domain, present, severity, description, citation: CITATIONS.FDA_2014_CONSEQUENCES });
    if (present) {
      monitoring.push('Implement hypersensitivity surveillance; for suspected Type I reactions assess drug-specific IgE and tryptase.');
      labeling.push({
        section: 'WARNINGS AND PRECAUTIONS',
        recommendation:
          igeMediated === true
            ? 'Include an anaphylaxis/hypersensitivity warning with administration-setting and monitoring requirements; consider Boxed Warning if severe reactions are frequent.'
            : igeMediated === false
              ? 'Include hypersensitivity/infusion-reaction precautions with monitoring and management guidance.'
              : 'Include hypersensitivity/infusion-reaction precautions with monitoring and management guidance. Whether an anaphylaxis warning is needed depends on IgE mediation, which was not stated.',
        citation: CITATIONS.FDA_2014_CONSEQUENCES,
      });
    }
  }

  // ── Domain 4: Cross-reactivity to endogenous protein ────────────────────
  {
    const domain = 'Cross-reactivity with endogenous counterpart';
    const present = crossReactivity === true;
    let severity: ImpactDomain['severity'] = 'none';
    let description = 'No endogenous cross-reactivity reported.';
    if (crossReactivity === undefined) {
      severity = 'undetermined';
      description = 'Not assessed: endogenousCrossReactivity was not stated.';
      notAssessed.push({ domain, input: 'endogenousCrossReactivity' });
    } else if (present && lifeSustaining === undefined) {
      severity = 'undetermined';
      description =
        'ADA cross-react with an endogenous counterpart, but whether it is life-sustaining was not stated, so this is not graded: high if not, critical if it is (e.g., anti-EPO pure red cell aplasia). Assess for neutralization of native function and resulting deficiency.';
      notAssessed.push({ domain, input: 'endogenousLifeSustaining' });
    } else if (present) {
      severity = lifeSustaining ? 'critical' : 'high';
      description = lifeSustaining
        ? 'ADA cross-react with a non-redundant, life-sustaining endogenous protein, risking a deficiency syndrome (e.g., anti-EPO pure red cell aplasia, anti-TPO thrombocytopenia) — the most severe immunogenicity outcome.'
        : 'ADA cross-react with an endogenous counterpart; assess for neutralization of native function and resulting deficiency.';
    }
    domains.push({
      domain,
      present: crossReactivity ?? null,
      severity,
      description,
      citation: CITATIONS.FDA_2014_CONSEQUENCES,
    });
    if (present) {
      monitoring.push('Monitor for the corresponding endogenous-protein deficiency syndrome and assess NAb against the endogenous molecule.');
      labeling.push({
        section: 'WARNINGS AND PRECAUTIONS / Immunogenicity',
        recommendation: 'Warn of the potential for antibody cross-reactivity with the endogenous protein and the associated deficiency syndrome; describe monitoring and management.',
        citation: CITATIONS.FDA_2014_CONSEQUENCES,
      });
    }
  }

  // 'critical' is the top of the scale, so no ungraded domain can raise it.
  let graded: SeverityLevel = 'none';
  for (const d of domains) {
    if (d.severity !== 'undetermined') graded = maxSeverity(graded, d.severity);
  }
  const overall: ClinicalImpactResult['overallSeverity'] =
    domains.some((d: ImpactDomain) => d.severity === 'undetermined') && graded !== 'critical' ? 'undetermined' : graded;

  // ── Benefit-risk modulation for life-threatening indications ─────────────
  if (params.lifeThreateningIndication && overall !== 'critical') {
    monitoring.push('For a life-threatening indication, weigh immunogenicity findings within the overall benefit-risk; loss of efficacy may be tolerable if no alternative therapy exists, but safety signals remain decisive.');
  }

  // ── Standing labeling implication ───────────────────────────────────────
  labeling.push({
    section: 'ADVERSE REACTIONS / Immunogenicity subsection',
    recommendation: 'Report ADA (and NAb where applicable) incidence by assay, with the standard caveat that incidence is highly dependent on assay sensitivity, specificity, methodology, sample handling, timing, concomitant medications, and underlying disease, so cross-product comparisons are misleading.',
    citation: CITATIONS.FDA_2014_CONSEQUENCES,
  });

  const citations: Citation[] = dedupeCitations([
    CITATIONS.FDA_2014,
    CITATIONS.FDA_2014_CONSEQUENCES,
    CITATIONS.EMA_2017,
    CITATIONS.FDA_2019_NAB,
  ]);

  const presentDomains = domains.filter((d: ImpactDomain) => d.present === true).map((d: ImpactDomain) => d.domain);
  const summary =
    `${drugName}: overall clinical-impact severity is ${overall.toUpperCase()}. ` +
    (presentDomains.length > 0 ? `Affected domain(s): ${presentDomains.join('; ')}. ` : '') +
    (notAssessed.length > 0
      ? `Not assessed (input not stated): ${notAssessed.map((n) => n.input).join(', ')}. `
      : presentDomains.length === 0
        ? 'All four domains were stated absent. '
        : '') +
    `${labeling.length} labeling implication(s) and ${monitoring.length} monitoring recommendation(s) generated.`;

  return {
    drugName,
    overallSeverity: overall,
    domains,
    notAssessed,
    labelingImplications: labeling,
    monitoringRecommendations: monitoring,
    citations,
    summary,
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 4 — designNAbAssay
 * ════════════════════════════════════════════════════════════════════════ */

/** Mechanism class of the therapeutic — drives cell-based vs CLB choice. */
export type MechanismClass =
  | 'receptor_agonist' // signals through a receptor (e.g., growth factors, cytokines) — cell-based preferred
  | 'receptor_antagonist' // blocks a receptor/ligand
  | 'ligand_neutralizer' // soluble-ligand-binding mAb (e.g., anti-TNF, anti-VEGF)
  | 'enzyme' // catalytic activity (e.g., ERT)
  | 'cell_depleting' // ADCC/CDC-mediated cell depletion
  | 'soluble_target_binder'; // binds soluble target, no direct cell signaling

export type NAbFormat = 'cell_based' | 'competitive_ligand_binding' | 'enzymatic_activity';

export interface NAbAssayParams {
  /** Mechanism class of the therapeutic. */
  mechanismClass: MechanismClass;
  /** Whether the drug acts via direct cell-surface receptor signaling. */
  actsThroughCellReceptor?: boolean;
  /** Whether a robust, reproducible cell-based bioassay is technically
   *  feasible (cell line responsive, acceptable variability). */
  cellBasedFeasible?: boolean;
  /** Whether the endogenous counterpart is non-redundant (drives the need
   *  for a sensitive cell-based NAb assay regardless of feasibility). */
  endogenousNonRedundant?: boolean;
  /** Expected circulating drug at NAb sampling (µg/mL) — drives drug
   *  tolerance for the NAb assay. */
  expectedCirculatingDrug_ug_per_mL?: number;
  /** Free-text drug name (echoed). */
  drugName?: string;
}

export interface NAbAssayResult {
  drugName: string;
  recommendedFormat: NAbFormat;
  cellBasedRequired: boolean;
  formatRationale: string;
  fallbackFormat: NAbFormat | null;
  fallbackJustification: string;
  validationParameters: string[];
  drugToleranceApproach: string[];
  matrixInterferenceControls: string[];
  citations: Citation[];
  summary: string;
}

/**
 * designNAbAssay — Recommends a neutralizing-antibody assay design. The FDA
 * 2019 and Shankar 2014 position is that a cell-based functional assay is
 * preferred when the drug's mechanism is mediated through a cell-surface
 * receptor or when the endogenous counterpart is non-redundant; a competitive
 * ligand-binding (CLB) format may be acceptable when a cell-based assay is not
 * feasible or the mechanism does not involve cell signaling, provided the CLB
 * format is shown to reflect neutralization.
 */
export function designNAbAssay(params: NAbAssayParams): NAbAssayResult {
  const drugName = params.drugName ?? '(unnamed product)';
  const actsThroughReceptor =
    params.actsThroughCellReceptor ??
    (params.mechanismClass === 'receptor_agonist' || params.mechanismClass === 'receptor_antagonist');
  const cellBasedFeasible = params.cellBasedFeasible ?? true;
  const endoNonRedundant = params.endogenousNonRedundant === true;

  // ── Decision: is cell-based required? ───────────────────────────────────
  // FDA 2019: cell-based functional NAb assay is preferred/expected when the
  // MoA is receptor-mediated cell signaling or when neutralization of a
  // non-redundant endogenous protein must be detected.
  const cellBasedRequired =
    (actsThroughReceptor && params.mechanismClass !== 'soluble_target_binder') ||
    endoNonRedundant ||
    params.mechanismClass === 'receptor_agonist';

  let recommended: NAbFormat;
  let rationale: string;
  let fallback: NAbFormat | null = null;
  let fallbackJustification = '';

  if (params.mechanismClass === 'enzyme') {
    recommended = 'enzymatic_activity';
    rationale =
      'For an enzyme therapeutic, a functional enzymatic-activity (substrate turnover) neutralization assay directly measures inhibition of catalytic activity and is the appropriate functional NAb format.';
    fallback = 'competitive_ligand_binding';
    fallbackJustification =
      'A competitive ligand-binding format may supplement the activity assay but does not by itself demonstrate functional neutralization.';
  } else if (cellBasedRequired) {
    if (cellBasedFeasible) {
      recommended = 'cell_based';
      rationale =
        'The mechanism is receptor/cell-signaling-mediated' +
        (endoNonRedundant ? ' and the endogenous counterpart is non-redundant' : '') +
        ', so a cell-based functional NAb assay is required: it best reflects the in vivo neutralizing activity and is expected by FDA 2019 / Shankar 2014.';
      fallback = 'competitive_ligand_binding';
      fallbackJustification =
        'A competitive ligand-binding format is acceptable only as a fallback or screening tier if the cell-based assay cannot meet sensitivity/drug-tolerance targets, and only if it is demonstrated to reflect neutralization.';
    } else {
      recommended = 'competitive_ligand_binding';
      rationale =
        'A cell-based assay is mechanistically preferred but is documented as not technically feasible (no reproducible responsive cell line / excessive variability). A competitive ligand-binding (CLB) NAb assay is used as a justified alternative, with a documented scientific rationale that it reflects neutralization, per FDA 2019.';
      fallback = 'cell_based';
      fallbackJustification =
        'Re-evaluate cell-based feasibility as the program matures; a cell-based confirmatory assay should be developed if the CLB format proves insufficiently reflective of neutralization, especially for products with a non-redundant endogenous counterpart.';
    }
  } else {
    recommended = 'competitive_ligand_binding';
    rationale =
      'The mechanism is binding of a soluble target/ligand without direct cell-surface receptor signaling, so a competitive ligand-binding (CLB) NAb assay that measures blockade of drug–target binding is scientifically appropriate and generally more sensitive and rugged than a cell-based format for this mechanism (FDA 2019; Shankar 2014).';
    fallback = 'cell_based';
    fallbackJustification =
      'A cell-based assay can be used for confirmation/characterization if a functional downstream readout is available, but is not required when the MoA is purely soluble-target binding.';
  }

  const validationParameters: string[] = [
    'NAb cut point (typically ~1% false-positive from drug-naïve donors)',
    'Sensitivity (lowest neutralizing positive-control concentration detected, in mass units)',
    'Specificity / selectivity (signal attributable to neutralizing ADA, not matrix)',
    'Drug tolerance (NAb detection in presence of expected circulating drug)',
    'Precision (intra- and inter-assay; for cell-based: monitor assay drift and cell-passage effects)',
    'Matrix interference (serum factors, soluble target, complement for cell-based)',
    'Confirmation of neutralization mechanism (the readout reflects the drug\'s MoA)',
    'Assay robustness/ruggedness (analysts, cell passages, reagent lots, plate position)',
  ];

  const drugToleranceApproach: string[] = [
    'Demonstrate NAb detection in the presence of the highest expected circulating drug at the NAb sampling time.',
    'Apply sample pretreatment (acid-dissociation, affinity bead extraction) to remove excess drug if interference exceeds tolerance.',
    'Time NAb sampling to drug trough or after washout (≥ 5 half-lives) where feasible.',
  ];
  if ((params.expectedCirculatingDrug_ug_per_mL ?? 0) > 0) {
    drugToleranceApproach.unshift(
      `Target NAb drug tolerance ≥ ${round(params.expectedCirculatingDrug_ug_per_mL ?? 0, 3)} µg/mL (highest expected circulating drug at sampling).`,
    );
  }

  const matrixInterferenceControls: string[] = [
    'Soluble-target / shed-receptor interference assessment and competition controls',
    'Serum-matrix effect characterization with multiple individual donors',
    'For cell-based assays: control for non-specific cytotoxicity, complement, and serum-mediated effects (e.g., heat-inactivation or serum-tolerance optimization)',
    'Hook/prozone evaluation at high NAb concentrations',
  ];

  const citations: Citation[] = dedupeCitations([
    CITATIONS.FDA_2019_NAB,
    CITATIONS.USP_1106_1,
    CITATIONS.SHANKAR_2014,
    CITATIONS.EMA_2017,
  ]);

  const summary =
    `${drugName}: recommended NAb format is ${recommended.replace(/_/g, ' ')} ` +
    `(${cellBasedRequired ? 'cell-based functional assay required' : 'cell-based not strictly required for this mechanism'}). ` +
    (fallback ? `Fallback/complementary format: ${fallback.replace(/_/g, ' ')}. ` : '') +
    `${validationParameters.length} validation parameters defined.`;

  return {
    drugName,
    recommendedFormat: recommended,
    cellBasedRequired,
    formatRationale: rationale,
    fallbackFormat: fallback,
    fallbackJustification,
    validationParameters,
    drugToleranceApproach,
    matrixInterferenceControls,
    citations,
    summary,
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 5 — planImmunogenicitySampling
 * ════════════════════════════════════════════════════════════════════════ */

export interface ImmunogenicitySamplingParams {
  /** Terminal elimination half-life of the product in days. */
  halfLife_days: number;
  /** Dosing frequency. */
  doseFrequency?: DoseFrequency;
  /** Planned treatment duration in weeks (0 = single dose / acute). */
  treatmentDuration_weeks?: number;
  /** Route of administration (affects expected onset and persistence). */
  route?: Route;
  /** Overall immunogenicity risk tier (from assessImmunogenicityRisk). */
  riskTier?: RiskTier;
  /** Whether the product has a non-redundant endogenous counterpart
   *  (extends follow-up to detect delayed cross-reactive responses). */
  endogenousNonRedundant?: boolean;
  /** Blood volume per ADA draw in mL (default 5 mL serum tube). */
  drawVolume_mL?: number;
  /** Free-text drug name (echoed). */
  drugName?: string;
}

export interface SamplingTimepoint {
  label: string;
  timing: string;
  relativeToDose: string;
  purpose: string;
  citation: Citation;
}

/** The inputs a sampling plan was not given, each with the value it used. */
export interface SamplingAssumptions {
  riskTier?: RiskTier;
  doseFrequency?: DoseFrequency;
  treatmentDuration_weeks?: number;
  drawVolume_mL?: number;
  endogenousNonRedundant?: boolean;
}

export interface ImmunogenicitySamplingResult {
  drugName: string;
  washout_days: number;
  followUpDuration_days: number;
  timepoints: SamplingTimepoint[];
  totalNominalDraws: number;
  totalBloodVolume_mL: number;
  /** Empty when every input was stated. */
  assumed: SamplingAssumptions;
  samplingPrinciples: string[];
  citations: Citation[];
  summary: string;
}

/** What a sampling plan uses for an input that was not stated; each use is echoed in `assumed`. */
const SAMPLING_DEFAULTS: Required<SamplingAssumptions> = {
  riskTier: 'moderate',
  doseFrequency: 'intermittent',
  treatmentDuration_weeks: 12,
  drawVolume_mL: 5,
  endogenousNonRedundant: false,
};

interface SamplingInputs {
  halfLife: number;
  riskTier: RiskTier;
  freq: DoseFrequency;
  duration: number;
  drawVol: number;
  endogenousNonRedundant: boolean;
  assumed: SamplingAssumptions;
}

/**
 * 2026-10-15: a missing, zero, negative or non-numeric half-life used to
 * become 1 day, and a washout, follow-up and schedule were computed from it
 * and stated as fact; the other defaults were applied without saying so. The
 * half-life is now required, and each defaulted input is echoed in `assumed`.
 */
function samplingInputs(params: ImmunogenicitySamplingParams): SamplingInputs {
  const halfLife = statedNumber('halfLife_days', params.halfLife_days, (n: number) => n > 0, 'a positive number of days');
  if (halfLife === undefined) {
    throw new ComputationRefusal(
      'missing_input',
      'halfLife_days is required: the terminal elimination half-life in days sets the washout (5 half-lives) and the follow-up.',
      'halfLife_days',
    );
  }
  const frequencies = FREQUENCY_RISK.map((d: FrequencyDescriptor) => d.frequency);
  const riskTier = statedOneOf('riskTier', params.riskTier, RISK_TIERS);
  const freq = statedOneOf('doseFrequency', params.doseFrequency, frequencies);
  const duration = statedNumber('treatmentDuration_weeks', params.treatmentDuration_weeks, (n: number) => n >= 0, '0 weeks or more');
  const drawVol = statedNumber('drawVolume_mL', params.drawVolume_mL, (n: number) => n > 0, 'a positive volume in mL');
  const endogenousNonRedundant = statedBoolean('endogenousNonRedundant', params.endogenousNonRedundant);
  const assumed: SamplingAssumptions = {};
  if (riskTier === undefined) assumed.riskTier = SAMPLING_DEFAULTS.riskTier;
  if (freq === undefined) assumed.doseFrequency = SAMPLING_DEFAULTS.doseFrequency;
  if (duration === undefined) assumed.treatmentDuration_weeks = SAMPLING_DEFAULTS.treatmentDuration_weeks;
  if (drawVol === undefined) assumed.drawVolume_mL = SAMPLING_DEFAULTS.drawVolume_mL;
  if (endogenousNonRedundant === undefined) assumed.endogenousNonRedundant = SAMPLING_DEFAULTS.endogenousNonRedundant;
  return {
    halfLife,
    riskTier: riskTier ?? SAMPLING_DEFAULTS.riskTier,
    freq: freq ?? SAMPLING_DEFAULTS.doseFrequency,
    duration: duration ?? SAMPLING_DEFAULTS.treatmentDuration_weeks,
    drawVol: drawVol ?? SAMPLING_DEFAULTS.drawVolume_mL,
    endogenousNonRedundant: endogenousNonRedundant ?? SAMPLING_DEFAULTS.endogenousNonRedundant,
    assumed,
  };
}

/**
 * planImmunogenicitySampling — Builds an ADA/NAb sampling schedule (baseline,
 * on-treatment, end-of-treatment, follow-up) with timing relative to dosing
 * and a follow-up duration scaled to the product half-life (≥ 5 half-lives,
 * extended for high-risk products and those with a non-redundant endogenous
 * counterpart), per FDA 2019 / FDA 2014 / EMA 2017.
 */
export function planImmunogenicitySampling(params: ImmunogenicitySamplingParams): ImmunogenicitySamplingResult {
  const drugName = params.drugName ?? '(unnamed product)';
  const { halfLife, riskTier, freq, duration, drawVol, endogenousNonRedundant, assumed } = samplingInputs(params);

  // Washout = 5 half-lives (the time for drug to clear so trough sampling
  // minimizes drug interference). FDA 2019 Section V.D / sampling rationale.
  const washout = round(5 * halfLife, 1);

  // Follow-up duration: at least 5 half-lives after last dose; extended for
  // high risk and non-redundant endogenous counterparts to capture delayed
  // and persistent responses.
  let followUp = washout;
  if (riskTier === 'high') followUp = Math.max(followUp, round(8 * halfLife, 1));
  if (endogenousNonRedundant) followUp = Math.max(followUp, round(12 * halfLife, 1));
  // Floor and ceiling: at least ~28 days for any biologic, capped guidance note.
  followUp = Math.max(followUp, 28);

  const timepoints: SamplingTimepoint[] = [];

  // Baseline (pre-dose) — mandatory to establish pre-existing antibodies and
  // each subject's individual baseline for treatment-emergent comparison.
  timepoints.push({
    label: 'Baseline (pre-dose)',
    timing: 'Within the screening/baseline window, before the first dose',
    relativeToDose: 'Pre-first-dose',
    purpose: 'Establish pre-existing antibody status and the individual baseline for treatment-boosted/treatment-emergent classification.',
    citation: CITATIONS.FDA_2019_TIERS,
  });

  // On-treatment sampling — frequency depends on dosing/duration; always at
  // trough to minimize drug interference.
  const onTreatmentCount = onTreatmentSampleCount(freq, duration, riskTier);
  timepoints.push({
    label: `On-treatment (×${onTreatmentCount})`,
    timing: onTreatmentTimingDescription(freq, duration, onTreatmentCount),
    relativeToDose: 'At trough (immediately before the next dose) to minimize circulating drug interference',
    purpose: 'Detect treatment-emergent ADA over the dosing period and characterize onset/kinetics; pair with PK trough sampling.',
    citation: CITATIONS.FDA_2014,
  });

  // End of treatment (EOT)
  timepoints.push({
    label: 'End of treatment (EOT)',
    timing: 'At the last scheduled dose / end-of-treatment visit',
    relativeToDose: 'At trough before/at the final dose',
    purpose: 'Capture peak treatment-emergent ADA prevalence and serve as the reference for follow-up persistence assessment.',
    citation: CITATIONS.FDA_2014,
  });

  // Follow-up sample(s) after washout — detect delayed/persistent responses
  // and resolve drug-interference-masked positives.
  timepoints.push({
    label: 'Follow-up 1 (post-washout)',
    timing: `≈ ${washout} days after the last dose (≥ 5 half-lives), when circulating drug is minimal`,
    relativeToDose: '≥ 5 half-lives post-last-dose',
    purpose: 'Detect ADA that were masked by drug during treatment and assess early persistence; resolves false-negatives from drug interference.',
    citation: CITATIONS.FDA_2019_DRUGTOL,
  });
  if (riskTier !== 'low' || endogenousNonRedundant) {
    timepoints.push({
      label: 'Follow-up 2 (extended)',
      timing: `≈ ${followUp} days after the last dose`,
      relativeToDose: `${riskTier === 'high' ? '≥ 8' : endogenousNonRedundant ? '≥ 12' : '≥ 5'} half-lives post-last-dose`,
      purpose: 'Characterize persistence vs transience of ADA and capture delayed cross-reactive responses (critical for non-redundant endogenous counterparts).',
      citation: CITATIONS.EMA_2017,
    });
  }

  const totalDraws = 1 + onTreatmentCount + 1 + (timepoints.length - 3);
  // Recompute precisely from constructed timepoints (on-treatment is one row
  // representing onTreatmentCount draws).
  const nominalDraws = 1 /*baseline*/ + onTreatmentCount + 1 /*EOT*/ + (riskTier !== 'low' || endogenousNonRedundant ? 2 : 1);
  const totalVolume = round(nominalDraws * drawVol, 1);

  const samplingPrinciples: string[] = [
    'Always collect a pre-dose baseline sample to enable treatment-emergent and treatment-boosted classification.',
    'Sample at drug trough (immediately before the next dose) to minimize drug interference with the ADA assay.',
    'Collect at least one follow-up sample after ≥ 5 half-lives so drug has cleared and masked ADA can be detected.',
    'Extend follow-up for high-risk products and products with a non-redundant endogenous counterpart to capture persistent/delayed responses.',
    'Co-locate ADA sampling with PK trough sampling to enable integrated PK–immunogenicity analysis.',
    'Retain samples to allow reflex NAb and characterization testing on confirmed-positive samples.',
    'Standardize sample handling (collection, processing, freezing) to preserve antibody integrity and assay performance.',
  ];

  const citations: Citation[] = dedupeCitations([
    CITATIONS.FDA_2019,
    CITATIONS.FDA_2019_DRUGTOL,
    CITATIONS.FDA_2014,
    CITATIONS.EMA_2017,
  ]);

  const summary =
    `${drugName}: sampling plan with ${nominalDraws} nominal ADA draws (≈ ${totalVolume} mL total at ${drawVol} mL/draw). ` +
    `Washout/trough basis = ${washout} days (5×t½ of ${halfLife} d); follow-up extends to ≈ ${followUp} days. ` +
    `Schedule: baseline → ${onTreatmentCount} on-treatment (trough) → EOT → ${riskTier !== 'low' || endogenousNonRedundant ? '2' : '1'} follow-up.` +
    (Object.keys(assumed).length > 0
      ? ` Assumed (not stated): ${Object.entries(assumed)
        .map(([input, value]: [string, unknown]) => `${input} = ${String(value)}`)
        .join(', ')}.`
      : '');

  // touch totalDraws to avoid unused (kept for parity); use nominalDraws below
  void totalDraws;

  return {
    drugName,
    washout_days: washout,
    followUpDuration_days: followUp,
    timepoints,
    totalNominalDraws: nominalDraws,
    totalBloodVolume_mL: totalVolume,
    assumed,
    samplingPrinciples,
    citations,
    summary,
  };
}

function onTreatmentSampleCount(freq: DoseFrequency, durationWeeks: number, tier: RiskTier): number {
  let base: number;
  switch (freq) {
    case 'single':
      base = 1;
      break;
    case 'intermittent':
      base = Math.max(2, Math.round(durationWeeks / 8));
      break;
    case 'chronic_weekly':
      base = Math.max(3, Math.round(durationWeeks / 6));
      break;
    case 'chronic_daily':
      base = Math.max(3, Math.round(durationWeeks / 6));
      break;
    case 'continuous':
      base = Math.max(2, Math.round(durationWeeks / 8));
      break;
    default:
      base = 3;
  }
  if (tier === 'high') base += 1;
  return Math.min(base, 12);
}

function onTreatmentTimingDescription(freq: DoseFrequency, durationWeeks: number, count: number): string {
  if (freq === 'single') {
    return 'A single on-treatment draw timed to the expected ADA onset window (typically ~2–4 weeks post-dose).';
  }
  if (durationWeeks <= 0) {
    return `Approximately ${count} on-treatment draws spaced across the dosing period.`;
  }
  const interval = round(durationWeeks / (count + 1), 1);
  return `Approximately ${count} on-treatment draws at roughly every ${interval} week(s) across the ${durationWeeks}-week treatment period, each at trough.`;
}

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 6 — assessImmunogenicityComparability
 * ════════════════════════════════════════════════════════════════════════ */

/** Context that triggers a comparability assessment. */
export type ComparabilityContext = 'biosimilar' | 'manufacturing_change' | 'formulation_change' | 'site_transfer' | 'scale_up';

/** Categorization of the change's potential impact on immunogenicity. */
export type ChangeImpact = 'minor' | 'moderate' | 'major';

export interface ComparabilityParams {
  /** What triggered the comparability evaluation. */
  context: ComparabilityContext;
  /** Whether analytical/structural comparability (primary structure, PTMs,
   *  charge variants, aggregates) was demonstrated. */
  analyticalComparable?: boolean;
  /** Whether the change could alter aggregate/particle levels. */
  affectsAggregation?: boolean;
  /** Whether the change could alter glycosylation/PTMs. */
  affectsGlycosylation?: boolean;
  /** Whether the change affects the formulation / container-closure
   *  (leachables, particles). */
  affectsFormulation?: boolean;
  /** Whether new or different process-related impurities are introduced. */
  affectsImpurities?: boolean;
  /** The product's intrinsic immunogenicity risk tier. */
  productRiskTier?: RiskTier;
  /** For biosimilars: whether a comparative clinical immunogenicity study is
   *  planned (typically required unless justified). */
  comparativeClinicalStudyPlanned?: boolean;
  /** Free-text drug name (echoed). */
  drugName?: string;
}

export interface ComparabilityResult {
  drugName: string;
  context: ComparabilityContext;
  changeImpact: ChangeImpact;
  clinicalImmunogenicityStudyRequired: boolean;
  studyRecommendation: string;
  analyticalExpectations: string[];
  bridgingDataNeeds: string[];
  riskFactorsTriggered: string[];
  decisionRationale: string;
  citations: Citation[];
  summary: string;
}

/**
 * assessImmunogenicityComparability — Assesses immunogenicity comparability
 * after a manufacturing/formulation change (ICH Q5E) or for a biosimilar
 * (FDA 2015 biosimilarity considerations / EMA 2017). Determines whether a
 * comparative clinical immunogenicity study is warranted and what analytical
 * and bridging data are needed.
 */
export function assessImmunogenicityComparability(params: ComparabilityParams): ComparabilityResult {
  const drugName = params.drugName ?? '(unnamed product)';
  const analyticalComparable = params.analyticalComparable ?? false;
  const productRisk = params.productRiskTier ?? 'moderate';

  const triggered: string[] = [];
  if (params.affectsAggregation) triggered.push('Change may alter aggregate/subvisible-particle levels (a primary immunogenicity driver).');
  if (params.affectsGlycosylation) triggered.push('Change may alter glycosylation/PTMs (potential new glycan epitopes / effector-function shifts).');
  if (params.affectsFormulation) triggered.push('Change affects formulation or container-closure (leachables, silicone oil, particle formation).');
  if (params.affectsImpurities) triggered.push('Change may introduce new or different process-related impurities (potential adjuvant effect).');
  if (!analyticalComparable) triggered.push('Analytical/structural comparability not yet demonstrated.');

  // ── Determine change impact ─────────────────────────────────────────────
  let impact: ChangeImpact = 'minor';
  const triggerCount = triggered.length;
  if (params.context === 'biosimilar') {
    impact = 'major'; // biosimilars carry an inherent immunogenicity comparison expectation
  } else if (!analyticalComparable || triggerCount >= 2) {
    impact = 'major';
  } else if (triggerCount === 1) {
    impact = 'moderate';
  }
  // High-risk products escalate the impact one level (capped at major).
  if (productRisk === 'high' && impact === 'moderate') impact = 'major';
  if (productRisk === 'high' && impact === 'minor') impact = 'moderate';

  // ── Clinical study determination ────────────────────────────────────────
  let clinicalRequired: boolean;
  let studyRecommendation: string;
  let rationale: string;

  if (params.context === 'biosimilar') {
    clinicalRequired = params.comparativeClinicalStudyPlanned ?? true;
    studyRecommendation = clinicalRequired
      ? 'Conduct a comparative clinical immunogenicity study (biosimilar vs reference product) with a pre-specified margin on ADA/NAb incidence, unless a robust analytical and clinical-pharmacology data package justifies a waiver. Include a single-switch evaluation where the totality-of-evidence approach requires it.'
      : 'A standalone comparative clinical immunogenicity study is not planned; justification must rest on a strong analytical similarity package plus comparative PK/PD immunogenicity data (totality-of-evidence).';
    rationale =
      'For a biosimilar, immunogenicity comparability is a core element of the totality-of-the-evidence demonstration of biosimilarity; comparative immunogenicity assessment is expected (FDA 2015; EMA 2017), typically as a head-to-head comparison using a single validated assay applied to both products.';
  } else {
    // Manufacturing/formulation change under ICH Q5E.
    if (impact === 'major') {
      clinicalRequired = true;
      studyRecommendation =
        'Analytical comparability alone is insufficient. Generate comparative immunogenicity data — at minimum bridging non-clinical and PK/immunogenicity data, and a clinical immunogenicity comparison (pre- vs post-change) when residual uncertainty remains, especially for moderate/high-risk products.';
      rationale =
        'Under ICH Q5E, when a manufacturing change has a meaningful potential to affect immunogenicity-relevant quality attributes (aggregates, glycosylation, impurities, formulation) and analytical comparability is uncertain, additional non-clinical and/or clinical immunogenicity data are required to conclude comparability.';
    } else if (impact === 'moderate') {
      clinicalRequired = false;
      studyRecommendation =
        'Demonstrate comparability primarily through enhanced analytical characterization focused on immunogenicity-relevant attributes; supplement with bridging immunogenicity data if residual risk remains. A dedicated clinical immunogenicity study may be avoidable if analytical comparability is robust.';
      rationale =
        'Under ICH Q5E, a change with a single immunogenicity-relevant trigger and otherwise comparable analytics can often be supported analytically, with clinical immunogenicity data reserved for residual uncertainty.';
    } else {
      clinicalRequired = false;
      studyRecommendation =
        'Comparability can be concluded on the basis of analytical/structural comparability of immunogenicity-relevant quality attributes; no dedicated clinical immunogenicity study is anticipated.';
      rationale =
        'Under ICH Q5E, a low-impact change with demonstrated analytical comparability and no immunogenicity-relevant triggers does not warrant a dedicated clinical immunogenicity study.';
    }
  }

  const analyticalExpectations: string[] = [
    'Primary structure and post-translational modification comparison (sequence, disulfides, glycosylation, deamidation/oxidation).',
    'Higher-order structure (HOS) comparison (e.g., circular dichroism, DSC, HDX-MS, NMR fingerprinting).',
    'Aggregate and subvisible/submicron particle comparison (SEC-MALS, AUC, MFI, HIAC, nanoparticle tracking).',
    'Charge-variant and size-variant profiles (cIEF/icIEF, CE-SDS).',
    'Process-related impurity comparison (HCP, residual DNA, leachables).',
    'Binding and potency comparison reflecting the mechanism of action.',
  ];

  const bridgingDataNeeds: string[] = [
    'A single, validated ADA assay applied to pre- and post-change (or biosimilar and reference) samples to avoid assay-driven differences.',
    'Comparable cut points, sensitivity, drug tolerance, and specificity across the compared products.',
    'NAb comparison where neutralization is clinically relevant.',
    'PK/PD bridging data interpreted alongside immunogenicity to detect exposure-mediated effects.',
  ];

  if (params.context === 'biosimilar') {
    bridgingDataNeeds.push('Demonstrate the assay equally detects ADA against both the biosimilar and the reference product (assay capable of detecting antibodies to both).');
  }

  const citations: Citation[] = dedupeCitations(
    params.context === 'biosimilar'
      ? [CITATIONS.FDA_BIOSIM, CITATIONS.EMA_2017, CITATIONS.ICH_Q5E, CITATIONS.FDA_2019_TIERS]
      : [CITATIONS.ICH_Q5E, CITATIONS.FDA_2014_RISKBASED, CITATIONS.EMA_2017, CITATIONS.FDA_2019_TIERS],
  );

  const summary =
    `${drugName}: ${params.context.replace(/_/g, ' ')} immunogenicity comparability — change impact ${impact.toUpperCase()}. ` +
    `Comparative clinical immunogenicity study ${clinicalRequired ? 'IS' : 'is NOT'} recommended. ` +
    `${triggered.length} immunogenicity-relevant trigger(s) identified. ` +
    `Demonstration rests on ${analyticalComparable ? 'demonstrated' : 'pending'} analytical comparability${params.context === 'biosimilar' ? ' within a totality-of-evidence approach' : ' under ICH Q5E'}.`;

  return {
    drugName,
    context: params.context,
    changeImpact: impact,
    clinicalImmunogenicityStudyRequired: clinicalRequired,
    studyRecommendation,
    analyticalExpectations,
    bridgingDataNeeds,
    riskFactorsTriggered: triggered,
    decisionRationale: rationale,
    citations,
    summary,
  };
}
