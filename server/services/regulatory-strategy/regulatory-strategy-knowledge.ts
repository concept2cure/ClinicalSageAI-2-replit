/**
 * Regulatory Strategy Intelligence — Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for FDA expedited programs,
 * FDA meeting planning, orphan drug designation, 505 pathway selection,
 * rolling submission assessment, and global regulatory pathway comparison.
 *
 * NO LLM, NO network, NO database. Every function is closed-form and
 * reproducible: identical input always yields identical output.
 *
 * Regulatory citations: 21 CFR 312/314, FD&C Act sections 505/506, FDASIA 2012,
 * FDORA 2022, FDA Guidance for Industry (various), EMA Regulation (EC) 726/2004,
 * Regulation (EC) 141/2000, ICH E5, PMDA SAKIGAKE, NMPA Breakthrough,
 * Health Canada Food and Drugs Act. Japan's expedited pathways and conditional
 * approval are read from the one Japanese programmes record,
 * server/services/ind/ctd/jp-programs.ts, in the sibling
 * regulatory-strategy-reference.ts, which holds the engine's fixed tables.
 *
 * Rule 2 S5d (2026-11-09): an omitted or null true/false input reads as
 * not_stated (inputStates) and is never read as true or false. An eligibility or
 * pathway that an unstated fact, or a criterion no input states, could change is
 * null, and undecided or notAssessedCriteria names it; a stated fact that fails
 * it still gives false. The three-valued helpers and the every-answer search are
 * imported from immunogenicity-reference.ts (S5d-0). A prevalence with no
 * stated source is not used. A missing or malformed required value is refused
 * by name or field.
 *
 * @module server/services/regulatory-strategy/regulatory-strategy-knowledge
 */

import { ComputationRefusal, refuseUnlessStated } from '../ana-biostats/computation-engine';
import {
  allOf,
  anyOf,
  decidingFacts,
  everyAnswer,
  listed,
  oneOfInput,
  shown,
  statedBoolean,
  statedNumber,
  statedText,
  textInput,
} from '../immunogenicity/immunogenicity-reference';
import {
  BRIEFING_DOCUMENT_TEMPLATE, CERTIFICATION_TYPES, EMA_ORPHAN_PREVALENCE_THRESHOLD, EXPEDITED_COMPARISON_MATRIX,
  EXPEDITED_PROGRAM_REGISTRY, FDA_ORPHAN_PREVALENCE_THRESHOLD, GLOBAL_PATHWAY_REGISTRY, MEETING_TYPE_REGISTRY,
  PATENT_EXCLUSIVITY_REGISTRY, PATHWAY_REGISTRY, PURPOSE_TO_TYPE, getPracticalAdvice, getSubmissionTiming,
  getTimingRecommendations,
} from './regulatory-strategy-reference';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Expedited Program Types ──────────────────────────────────────────────

export type ExpeditedProgramName =
  | 'fast_track'
  | 'breakthrough_therapy'
  | 'accelerated_approval'
  | 'priority_review'
  | 'rmat';

export type EvidenceLevel =
  | 'preclinical_only'
  | 'early_clinical'
  | 'phase2_data'
  | 'phase3_data'
  | 'post_marketing';

export type ProductType =
  | 'small_molecule'
  | 'biologic'
  | 'cell_therapy'
  | 'gene_therapy'
  | 'tissue_engineered'
  | 'combination_product'
  | 'vaccine'
  | 'biosimilar'
  | 'diagnostic';

export interface ExpeditedProgramParams {
  indication: 'serious' | 'life_threatening';
  unmetMedicalNeedDescription: string;
  availableTherapyLandscape: 'no_approved_therapy' | 'inadequate_existing_therapy' | 'adequate_existing_therapy';
  evidenceLevel: EvidenceLevel;
  productType: ProductType;
}

export interface ProgramEligibility {
  programName: ExpeditedProgramName;
  displayName: string;
  /** null while a criterion no input states (notAssessedCriteria) decides it and none stated fails it. */
  eligible: boolean | null;
  /** The program's criteria this screen does not assess: no input states them. */
  notAssessedCriteria: string[];
  eligibilityCriteria: string[];
  eligibilityRationale: string[];
  benefits: string[];
  applicationTiming: string;
  regulatoryBasis: string[];
  keyRequirements: string[];
  caveats: string[];
}

export interface ExpeditedProgramResult {
  assessments: ProgramEligibility[];
  comparisonMatrix: {
    dimension: string;
    fast_track: string;
    breakthrough_therapy: string;
    accelerated_approval: string;
    priority_review: string;
    rmat: string;
  }[];
  strategicRecommendations: string[];
  citations: string[];
}

// ── 2. FDA Meeting Types ────────────────────────────────────────────────────

export type MeetingPurpose =
  | 'pre_ind'
  | 'eop1'
  | 'eop2'
  | 'pre_phase3'
  | 'pre_nda_bla'
  | 'type_a_urgent'
  | 'dispute_resolution'
  | 'pre_submission_505b2'
  | 'pre_submission_anda'
  | 'risk_evaluation'
  | 'pediatric'
  | 'other';

export type DevelopmentPhase =
  | 'pre_ind'
  | 'phase1'
  | 'phase2'
  | 'phase3'
  | 'pre_nda'
  | 'post_approval';

export interface FDAMeetingParams {
  developmentPhase: DevelopmentPhase;
  purpose: MeetingPurpose;
  productType: ProductType;
  questionsToDiscuss: string[];
}

export type MeetingTypeClassification = 'A' | 'B' | 'C' | 'D' | 'pre_submission';

export interface MeetingTypeInfo {
  classification: MeetingTypeClassification;
  displayName: string;
  description: string;
  fdaResponseTimeline: string;
  schedulingTimeline: string;
  examples: string[];
  regulatoryBasis: string[];
}

export interface BriefingDocumentSection {
  sectionTitle: string;
  contentGuidance: string[];
  pageGuidance: string;
}

export interface FDAMeetingResult {
  meetingType: MeetingTypeInfo;
  meetingRequestPackage: {
    components: string[];
    submissionTiming: string;
    formatRequirements: string[];
  };
  briefingDocumentStructure: BriefingDocumentSection[];
  timingRecommendations: string[];
  questionFramingTips: string[];
  pdufaGoals: string[];
  meetingManagementMetrics: string[];
  practicalAdvice: string[];
  citations: string[];
}

// ── 3. Orphan Designation Types ─────────────────────────────────────────────

export interface OrphanDesignationParams {
  diseasePrevalenceUS?: number | null;
  /** Where the US prevalence comes from; without it the prevalence is not used. */
  diseasePrevalenceUSSource?: string;
  diseasePrevalenceEU?: number | null;
  /** Where the EU prevalence comes from; without it the prevalence is not used. */
  diseasePrevalenceEUSource?: string;
  clinicalRationale?: string;
  /** A vaccine's or diagnostic's FDA count is persons dosed per year, not the disease prevalence. */
  productType: ProductType;
  existingApprovedTherapies?: number;
  isSerious?: boolean;
  isLifeThreatening?: boolean;
  isDebilitating?: boolean;
}

export interface OrphanEligibilityAssessment {
  jurisdiction: string;
  /** true when every criterion is met on stated, sourced facts; null otherwise (missing, notAssessedCriteria). */
  eligible: boolean | null;
  /** The inputs the screen needed that were not stated. */
  missing: string[];
  /** Criteria the verdict waits on that no input carries. */
  notAssessedCriteria: string[];
  criteria: string[];
  rationale: string[];
  applicationProcess: string[];
  reviewTimeline: string;
}

export interface OrphanBenefitsComparison {
  benefit: string;
  fda: string;
  ema: string;
}

export interface OrphanDesignationResult {
  fdaAssessment: OrphanEligibilityAssessment;
  emaAssessment: OrphanEligibilityAssessment;
  benefitsComparison: OrphanBenefitsComparison[];
  commonPitfalls: string[];
  successFactors: string[];
  prevalenceMethodology: string[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  citations: string[];
}

// ── 4. 505 Pathway Types ────────────────────────────────────────────────────

export type PathwayType = '505b1' | '505b2' | '505j' | 'suitability_petition';

export interface Select505PathwayParams {
  activeIngredient: 'new_molecular_entity' | 'known';
  dosageFormChange?: boolean;
  routeChange?: boolean;
  indicationChange?: boolean;
  newCombination?: boolean;
  formulationInnovation?: boolean;
  availableRLD?: boolean;
}

export interface PathwayRecommendation {
  pathway: PathwayType;
  displayName: string;
  description: string;
  legalBasis: string;
  requiredStudies: string[];
  advantages: string[];
  disadvantages: string[];
  typicalTimeline: string;
  regulatoryBasis: string[];
}

export interface PatentExclusivity {
  type: string;
  duration: string;
  description: string;
  legalBasis: string;
  applicableTo: string[];
}

export interface CertificationType {
  paragraph: string;
  description: string;
  implications: string[];
}

export interface Select505PathwayResult {
  /** null while an unstated fact could change it (see undecided). */
  recommendedPathway: PathwayRecommendation | null;
  /** The alternatives every answer to the unstated facts gives. */
  alternativePathways: PathwayRecommendation[];
  decisionTreeRationale: string[];
  patentExclusivityConsiderations: PatentExclusivity[];
  certificationTypes: CertificationType[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  /** The conclusions an unstated fact leaves open. */
  undecided: Undecided[];
  citations: string[];
}

// ── 5. Rolling Submission Types ─────────────────────────────────────────────

export interface RollingSubmissionParams {
  expeditedDesignationStatus?: {
    fastTrack?: boolean;
    breakthroughTherapy?: boolean;
    rmat?: boolean;
  };
  /** Not read. */
  productType?: ProductType;
  /** Not read. */
  estimatedModuleCompletionDates?: {
    module1_regional?: string;
    module2_summaries?: string;
    module3_quality?: string;
    module4_nonclinical?: string;
    module5_clinical?: string;
  };
}

export interface RollingSubmissionResult {
  /** null while no designation is stated true and one is not stated. */
  eligible: boolean | null;
  eligibilityRationale: string[];
  submissionScheduleTemplate: {
    phase: string;
    modules: string[];
    description: string;
    typicalOrder: number;
  }[];
  recommendedModuleOrder: string[];
  preSubmissionChecklist: string[];
  filingReviewClockConsiderations: string[];
  manufacturingSiteReadiness: string[];
  practicalTips: string[];
  /** Each true/false input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
  citations: string[];
}

// ── 6. Global Pathway Types ─────────────────────────────────────────────────

export type TargetMarket =
  | 'us'
  | 'eu'
  | 'japan'
  | 'china'
  | 'canada'
  | 'australia'
  | 'brazil'
  | 'south_korea';

export interface CompareGlobalPathwaysParams {
  productType: ProductType;
  indication: string;
  targetMarkets: TargetMarket[];
}

export interface RegionalPathwayInfo {
  market: TargetMarket;
  displayName: string;
  regulatoryAuthority: string;
  relevantDivision: string;
  applicationType: string;
  standardReviewTimeline: string;
  expeditedReviewTimeline: string;
  expeditedPathways: {
    name: string;
    equivalent: string;
    criteria: string[];
    benefits: string[];
  }[];
  orphanEquivalent: {
    name: string;
    prevalenceThreshold: string;
    exclusivityPeriod: string;
    otherBenefits: string[];
  };
  conditionalApproval: {
    name: string;
    criteria: string[];
    postApprovalRequirements: string[];
  };
  dataRequirementsDifferences: string[];
  gmpInspectionRequirements: string[];
  referencePricingHTA: string[];
}

export interface CompareGlobalPathwaysResult {
  pathways: RegionalPathwayInfo[];
  harmonizationNotes: string[];
  simultaneousSubmissionStrategy: string[];
  keyDifferences: {
    dimension: string;
    differences: Record<string, string>;
  }[];
  citations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input readers (Rule 2 S5d, 2026-11-09). Omitted or null is not stated; a value
// of the wrong kind is refused by field, never read as another value or crashed on.
// ═══════════════════════════════════════════════════════════════════════════════

/** A true/false input: true, false or not_stated. */
type BooleanState = boolean | 'not_stated';

/** A conclusion an unstated fact leaves open: the facts it turns on, and what each answer gives. */
export interface Undecided {
  conclusion: string;
  decidingFacts: string[];
  couldBe: Array<string | boolean>;
}

const PRODUCT_TYPES: readonly ProductType[] = [
  'small_molecule', 'biologic', 'cell_therapy', 'gene_therapy', 'tissue_engineered', 'combination_product', 'vaccine', 'biosimilar', 'diagnostic',
];

// ═══════════════════════════════════════════════════════════════════════════════
// Private Reference Data
// ═══════════════════════════════════════════════════════════════════════════════

// The Japan rows, the expedited-program registry and comparison matrix, the FDA meeting types, the briefing
// template, the meeting purpose map, the orphan thresholds, the 505 pathway, exclusivity and certification data and
// the global pathway registry are in regulatory-strategy-reference.ts (moved unchanged 2026-11-09, Rule 2 S5d).

// ═══════════════════════════════════════════════════════════════════════════════
// Exported Functions
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. assessExpeditedProgram ───────────────────────────────────────────────

/**
 * Assess FDA expedited program eligibility for a product based on its
 * indication severity, unmet medical need, evidence level, and product type.
 *
 * Returns eligibility assessment for all 5 FDA expedited programs, a comparison
 * matrix, strategic recommendations, and regulatory citations.
 *
 * Deterministic — identical input always yields identical output.
 */
export function assessExpeditedProgram(params: ExpeditedProgramParams): ExpeditedProgramResult {
  // 2026-11-09 (S5d): an omitted therapy landscape or evidence level read as an unmet need and clinical evidence (and
  // then crashed), and Breakthrough Therapy, Accelerated Approval and Priority Review were called eligible (or not)
  // on criteria no input states: substantial improvement, a surrogate endpoint, significant improvement.
  refuseUnlessStated('assessExpeditedProgram', [
    oneOfInput('indication', params.indication, ['serious', 'life_threatening']),
    textInput('unmetMedicalNeedDescription', params.unmetMedicalNeedDescription),
    oneOfInput('availableTherapyLandscape', params.availableTherapyLandscape, ['no_approved_therapy', 'inadequate_existing_therapy', 'adequate_existing_therapy']),
    oneOfInput('evidenceLevel', params.evidenceLevel, ['preclinical_only', 'early_clinical', 'phase2_data', 'phase3_data', 'post_marketing']),
    oneOfInput('productType', params.productType, PRODUCT_TYPES),
  ], 'assessed');
  const {
    indication,
    unmetMedicalNeedDescription,
    availableTherapyLandscape,
    evidenceLevel,
    productType,
  } = params;
  const BT_CRITERION = 'Preliminary clinical evidence indicates substantial improvement over available therapy on a clinically significant endpoint';
  const AA_CRITERION = 'An effect on a surrogate or intermediate clinical endpoint reasonably likely to predict clinical benefit';
  const PR_CRITERION = 'A significant improvement in the safety or effectiveness of the treatment of a serious condition';
  const RMAT_CRITERION = 'A combination product qualifies only if it uses a cell therapy, therapeutic tissue engineering product or human cell and tissue product';
  // An available therapy stated adequate does not settle these (the coordinating session, 2026-11-09): an unmet need can
  // remain beside it (an improved effect, patients intolerant of or refractory to it, a serious outcome it does not
  // address: FDA, Expedited Programs for Serious Conditions, 2014, §III.B), and so can a meaningful advantage over it.
  const UNMET_NEED_CRITERION =
    'Whether the product can address an unmet medical need beside the available therapy stated adequate (an improved effect, patients intolerant of or refractory to it, a serious outcome it does not address)';
  const ADVANTAGE_CRITERION =
    'Whether the product has a meaningful advantage over the available therapy stated adequate (21 CFR 314.500, 601.40)';
  const notAssessedLine = (c: string): string => `Not assessed: ${c.charAt(0).toLowerCase()}${c.slice(1)}. No input states it.`;

  const isSeriousOrLifeThreatening = indication === 'serious' || indication === 'life_threatening';
  // No approved therapy, or an inadequate one, is an unmet need. An adequate one leaves it not assessed: no input states
  // that the product cannot address one beside it.
  const hasUnmetNeed: boolean | undefined = availableTherapyLandscape === 'adequate_existing_therapy' ? undefined : true;
  const adequateTherapy = hasUnmetNeed === undefined;
  const hasClinicalEvidence = evidenceLevel !== 'preclinical_only';
  // A 351(k) biosimilar is licensed only for its reference product's approved conditions of use and has no clinically
  // meaningful difference from it, so it can show no unmet need, improvement or advantage over that available therapy.
  const isBiosimilar = productType === 'biosimilar';
  const BIOSIMILAR_LINE =
    'A biosimilar (PHS Act §351(k)) is licensed only for conditions of use already approved for its reference product and ' +
    'has no clinically meaningful difference from it (§351(i)(2)), so it cannot show the unmet need, improvement or ' +
    'advantage over that available therapy this program requires.';
  // RMAT covers a combination product only if it uses a regenerative therapy, which no input states.
  const isRegenerativeMedicine: boolean | undefined =
    productType === 'cell_therapy' || productType === 'gene_therapy' || productType === 'tissue_engineered'
      ? true
      : productType === 'combination_product'
        ? undefined
        : false;

  const assessments: ProgramEligibility[] = [];

  // Fast Track
  const ftDef = EXPEDITED_PROGRAM_REGISTRY.fast_track;
  // False only on a stated fact: a condition not serious or life-threatening (FD&C Act §506(b)(1)), or a §351(k)
  // biosimilar (PHS Act §351(i)(2), §351(k)(2)(A)(i)(III)). Beside an adequate therapy the unmet need is not assessed.
  const ftEligible: boolean | null =
    !isSeriousOrLifeThreatening || isBiosimilar ? false : adequateTherapy ? null : true;
  const ftRationale: string[] = [];
  if (!isSeriousOrLifeThreatening) {
    ftRationale.push('Product does not target a serious or life-threatening condition — fundamental eligibility criterion not met.');
  } else {
    ftRationale.push('Product targets a ' + indication.replace('_', '-') + ' condition — meets serious condition criterion.');
  }
  if (adequateTherapy) {
    ftRationale.push(
      'Available therapy is stated adequate. Whether the product can address an unmet medical need beside it is not ' +
      'stated (FD&C Act §506(b)(1)).',
    );
  } else {
    ftRationale.push(
      'Therapy landscape: ' + availableTherapyLandscape.replace(/_/g, ' ') +
      '. Unmet medical need rationale: ' + unmetMedicalNeedDescription,
    );
  }
  if (isBiosimilar) ftRationale.push(BIOSIMILAR_LINE);
  assessments.push({
    programName: 'fast_track',
    displayName: ftDef.displayName,
    eligible: ftEligible,
    notAssessedCriteria: ftEligible === null ? [UNMET_NEED_CRITERION] : [],
    eligibilityCriteria: ftDef.criteria,
    eligibilityRationale: ftRationale,
    benefits: ftDef.benefits,
    applicationTiming: ftDef.applicationTiming,
    regulatoryBasis: ftDef.regulatoryBasis,
    keyRequirements: ftDef.keyRequirements,
    caveats: ftDef.caveats,
  });

  // Breakthrough Therapy
  const btDef = EXPEDITED_PROGRAM_REGISTRY.breakthrough_therapy;
  const hasSubstantialImprovementEvidence =
    evidenceLevel === 'phase2_data' || evidenceLevel === 'phase3_data' || evidenceLevel === 'post_marketing';
  // Substantial improvement is a finding on the evidence, which no input states: the level alone decides nothing.
  // False only on a stated fact: a condition not serious or life-threatening, or no clinical evidence (FD&C Act
  // §506(a)(1) asks for preliminary clinical evidence), or a §351(k) biosimilar (PHS Act §351(i)(2)).
  const btEligible: boolean | null = isSeriousOrLifeThreatening && hasClinicalEvidence && !isBiosimilar ? null : false;
  const btRationale: string[] = [];
  if (!isSeriousOrLifeThreatening) {
    btRationale.push('Product does not target a serious or life-threatening condition.');
  } else {
    btRationale.push('Serious/life-threatening condition criterion met.');
  }
  if (!hasClinicalEvidence) {
    btRationale.push(
      'No clinical evidence available (evidence level: ' + evidenceLevel +
      '). Breakthrough Therapy requires preliminary CLINICAL evidence — preclinical data alone is insufficient.',
    );
  } else if (!hasSubstantialImprovementEvidence) {
    btRationale.push(
      'Evidence level is "' + evidenceLevel +
      '". Breakthrough Therapy typically requires Phase 1/2 data demonstrating substantial improvement. ' +
      'Early clinical data may be considered if compelling, but stronger evidence improves chances.',
    );
  } else {
    btRationale.push(
      'Evidence level "' + evidenceLevel +
      '" provides a basis for demonstrating substantial improvement over existing therapies.',
    );
  }
  if (isBiosimilar) btRationale.push(BIOSIMILAR_LINE);
  if (btEligible === null) btRationale.push(notAssessedLine(BT_CRITERION));
  assessments.push({
    programName: 'breakthrough_therapy',
    displayName: btDef.displayName,
    eligible: btEligible,
    notAssessedCriteria: btEligible === null ? [BT_CRITERION] : [],
    eligibilityCriteria: btDef.criteria,
    eligibilityRationale: btRationale,
    benefits: btDef.benefits,
    applicationTiming: btDef.applicationTiming,
    regulatoryBasis: btDef.regulatoryBasis,
    keyRequirements: btDef.keyRequirements,
    caveats: btDef.caveats,
  });

  // Accelerated Approval
  const aaDef = EXPEDITED_PROGRAM_REGISTRY.accelerated_approval;
  // False only on a stated fact: a condition not serious or life-threatening (FD&C Act §506(c)(1)(A)), or a §351(k)
  // biosimilar (§506(c)(1)(A) applies to applications under §505(c) and PHS Act §351(a)). Otherwise the surrogate
  // endpoint, and beside an adequate therapy the meaningful advantage over it, are not stated.
  const aaEligible: boolean | null = isSeriousOrLifeThreatening && !isBiosimilar ? null : false;
  const aaRationale: string[] = [];
  if (!isSeriousOrLifeThreatening) {
    aaRationale.push('Product does not target a serious or life-threatening condition.');
  } else {
    aaRationale.push('Serious/life-threatening condition criterion met.');
  }
  if (adequateTherapy) {
    aaRationale.push(
      'Available therapy is stated adequate. Accelerated Approval asks for a meaningful advantage over it ' +
      '(21 CFR 314.500, 601.40), which is not stated.',
    );
  } else if (!isBiosimilar) {
    aaRationale.push('Unmet medical need identified — Accelerated Approval pathway may be applicable.');
  }
  aaRationale.push(
    'IMPORTANT: Accelerated Approval requires identification and FDA agreement on a surrogate ' +
    'or intermediate clinical endpoint reasonably likely to predict clinical benefit. This should be ' +
    'discussed with FDA at the End-of-Phase 2 or pre-Phase 3 meeting.',
  );
  aaRationale.push(
    'FDORA 2022 updates: FDA now has enhanced authority to require confirmatory studies to be underway ' +
    'at the time of approval and can use expedited withdrawal proceedings if the sponsor does not ' +
    'conduct the confirmatory study with due diligence.',
  );
  if (isBiosimilar) aaRationale.push(BIOSIMILAR_LINE + ' Accelerated Approval (§506(c)(1)(A)) applies to applications under §505(c) or PHS Act §351(a).');
  if (aaEligible === null) aaRationale.push(notAssessedLine(AA_CRITERION));
  assessments.push({
    programName: 'accelerated_approval',
    displayName: aaDef.displayName,
    eligible: aaEligible,
    notAssessedCriteria: aaEligible === null ? (adequateTherapy ? [AA_CRITERION, ADVANTAGE_CRITERION] : [AA_CRITERION]) : [],
    eligibilityCriteria: aaDef.criteria,
    eligibilityRationale: aaRationale,
    benefits: aaDef.benefits,
    applicationTiming: aaDef.applicationTiming,
    regulatoryBasis: aaDef.regulatoryBasis,
    keyRequirements: aaDef.keyRequirements,
    caveats: aaDef.caveats,
  });

  // Priority Review
  const prDef = EXPEDITED_PROGRAM_REGISTRY.priority_review;
  // False only on a stated fact: a condition not serious (Priority Review is for a significant improvement in the
  // treatment of a serious condition: FDA, Expedited Programs guidance, 2014, §VII; MAPP 6020.3), or a §351(k)
  // biosimilar, which has no clinically meaningful difference from its reference product (PHS Act §351(i)(2)).
  const prEligible: boolean | null = isSeriousOrLifeThreatening && !isBiosimilar ? null : false;
  const prRationale: string[] = [];
  if (!isSeriousOrLifeThreatening) {
    prRationale.push('Product does not target a serious condition — Priority Review eligibility requires significant improvement for a serious condition.');
  } else {
    prRationale.push('Targets a serious condition — potentially eligible for Priority Review.');
  }
  if (!adequateTherapy && !isBiosimilar) {
    prRationale.push('Product addresses an unmet medical need, supporting the "significant improvement" criterion for Priority Review.');
  } else if (adequateTherapy) {
    prRationale.push(
      'Adequate existing therapy available. Priority Review may still be granted if the product demonstrates ' +
      'a significant improvement in safety or effectiveness over available therapy.',
    );
  }
  prRationale.push('Priority Review is determined at the time of NDA/BLA filing and is based on the totality of evidence in the submission.');
  if (isBiosimilar) prRationale.push(BIOSIMILAR_LINE);
  if (prEligible === null) prRationale.push(notAssessedLine(PR_CRITERION));
  assessments.push({
    programName: 'priority_review',
    displayName: prDef.displayName,
    eligible: prEligible,
    notAssessedCriteria: prEligible === null ? [PR_CRITERION] : [],
    eligibilityCriteria: prDef.criteria,
    eligibilityRationale: prRationale,
    benefits: prDef.benefits,
    applicationTiming: prDef.applicationTiming,
    regulatoryBasis: prDef.regulatoryBasis,
    keyRequirements: prDef.keyRequirements,
    caveats: prDef.caveats,
  });

  // RMAT
  const rmatDef = EXPEDITED_PROGRAM_REGISTRY.rmat;
  // False only on a stated fact: not a regenerative medicine therapy (FD&C Act §506(g)(8)), a condition not serious or
  // life-threatening, or no clinical evidence (§506(g)(1) asks for preliminary clinical evidence of potential to address
  // unmet medical needs). Beside an adequate therapy the unmet need is not assessed, so RMAT is not either.
  const rmatAll = allOf(isRegenerativeMedicine, isSeriousOrLifeThreatening, hasClinicalEvidence, hasUnmetNeed);
  const rmatEligible: boolean | null = rmatAll ?? null;
  const rmatRationale: string[] = [];
  if (isRegenerativeMedicine === false) {
    rmatRationale.push(
      'Product type "' + productType +
      '" does not qualify as a regenerative medicine therapy. RMAT designation is limited to ' +
      'cell therapy, gene therapy, tissue engineering products, and their combinations.',
    );
  } else if (isRegenerativeMedicine === undefined) {
    rmatRationale.push('Product type "' + productType + '": whether it uses a regenerative medicine therapy was not stated.');
  } else {
    rmatRationale.push('Product type "' + productType + '" qualifies as a regenerative medicine therapy under Section 506(g) of the FD&C Act.');
  }
  if (!isSeriousOrLifeThreatening) {
    rmatRationale.push('Product does not target a serious or life-threatening condition.');
  } else {
    rmatRationale.push('Serious/life-threatening condition criterion met.');
  }
  if (!hasClinicalEvidence) {
    rmatRationale.push('No clinical evidence available. RMAT requires preliminary clinical evidence indicating potential to address unmet medical needs.');
  } else {
    rmatRationale.push('Preliminary clinical evidence available (evidence level: ' + evidenceLevel + ') — supports RMAT application.');
  }
  if (adequateTherapy) {
    rmatRationale.push(
      'Available therapy is stated adequate. Whether the product can address an unmet medical need beside it is not ' +
      'stated (FD&C Act §506(g)(1)).',
    );
  }
  const rmatOpen = [
    ...(isRegenerativeMedicine === undefined ? [RMAT_CRITERION] : []),
    ...(rmatEligible === null && adequateTherapy ? [UNMET_NEED_CRITERION] : []),
  ];
  if (rmatEligible === null && isRegenerativeMedicine === undefined) rmatRationale.push(notAssessedLine(RMAT_CRITERION));
  assessments.push({
    programName: 'rmat',
    displayName: rmatDef.displayName,
    eligible: rmatEligible,
    notAssessedCriteria: rmatEligible === null ? rmatOpen : [],
    eligibilityCriteria: rmatDef.criteria,
    eligibilityRationale: rmatRationale,
    benefits: rmatDef.benefits,
    applicationTiming: rmatDef.applicationTiming,
    regulatoryBasis: rmatDef.regulatoryBasis,
    keyRequirements: rmatDef.keyRequirements,
    caveats: rmatDef.caveats,
  });

  // Strategic recommendations
  const strategicRecommendations: string[] = [];
  const eligiblePrograms = assessments.filter(a => a.eligible === true);
  const openPrograms = assessments.filter(a => a.eligible === null);
  if (eligiblePrograms.length === 0) {
    strategicRecommendations.push(
      (openPrograms.length === 0 ? 'No expedited programs appear eligible based on current parameters. ' : 'No expedited program is met on the stated parameters alone. ') +
      'Consider whether the product targets a serious condition and addresses an unmet medical need.',
    );
  } else {
    strategicRecommendations.push(
      'Eligible for ' + eligiblePrograms.length + ' expedited program(s): ' +
      eligiblePrograms.map(p => p.displayName).join(', ') + '.',
    );
  }
  if (openPrograms.length > 0) {
    strategicRecommendations.push(
      'Not assessed: ' + openPrograms.map(p => p.displayName).join(', ') + ', which turn on criteria no input states (' +
      openPrograms.map(p => p.notAssessedCriteria[0]).join('; ') + ').',
    );
  }

  if (ftEligible && btEligible === null) {
    strategicRecommendations.push(
      'If the preliminary clinical evidence shows substantial improvement, consider applying for Breakthrough Therapy ' +
      'Designation first — it includes all Fast Track benefits plus intensive FDA guidance; Fast Track is the fallback.',
    );
  } else if (ftEligible && !btEligible) {
    strategicRecommendations.push(
      'Fast Track designation is the most accessible expedited program. Consider applying early ' +
      '(with or prior to IND) to gain rolling review and frequent FDA meetings.',
    );
  }

  if (rmatEligible) {
    strategicRecommendations.push(
      'RMAT designation is recommended for this regenerative medicine therapy — it provides the most ' +
      'comprehensive benefits package, combining Fast Track, Breakthrough Therapy, and potential Accelerated Approval advantages.',
    );
  }

  if (aaEligible !== false) {
    strategicRecommendations.push(
      'Accelerated Approval may be viable if a suitable surrogate or intermediate endpoint can be identified. ' +
      'Discuss endpoint selection with FDA at EOP2/pre-Phase 3 meeting. Be aware of FDORA 2022 enhanced ' +
      'post-marketing requirements.',
    );
  }

  strategicRecommendations.push(
    'Multiple designations can be combined (e.g., Fast Track + Priority Review, Breakthrough Therapy + Accelerated Approval). ' +
    'Develop a comprehensive expedited program strategy aligned with the clinical development timeline.',
  );

  const citations: string[] = [
    'FD&C Act Section 506 [21 USC 356] — Expedited Programs',
    'FDASIA (Food and Drug Administration Safety and Innovation Act) 2012 — Sections 901-902',
    '21st Century Cures Act 2016 — Section 3033 (RMAT)',
    'FDORA (Food and Drug Omnibus Reform Act) 2022 — Sections 3201-3210 (Accelerated Approval reform)',
    'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
    'FDA Guidance: Expedited Programs for Regenerative Medicine Therapies for Serious Conditions (2019)',
    'PDUFA VII Performance Goals and Procedures (2022-2027)',
  ];

  return {
    assessments,
    comparisonMatrix: EXPEDITED_COMPARISON_MATRIX,
    strategicRecommendations,
    citations,
  };
}

// ── 2. planFDAMeeting ───────────────────────────────────────────────────────

/**
 * Plan an FDA meeting by selecting the meeting type, preparing the meeting
 * request package, and structuring the briefing document.
 *
 * Returns meeting type classification, request package requirements, briefing
 * document structure, timing recommendations, and question framing tips.
 *
 * Deterministic — identical input always yields identical output.
 */
export function planFDAMeeting(params: FDAMeetingParams): FDAMeetingResult {
  // 2026-11-09 (S5d): a purpose outside the vocabulary gave a meeting type of undefined; an omitted phase or product
  // type was planned as neither. Each is now refused by name. questionsToDiscuss is not read.
  refuseUnlessStated('planFDAMeeting', [
    oneOfInput('developmentPhase', params.developmentPhase, ['pre_ind', 'phase1', 'phase2', 'phase3', 'pre_nda', 'post_approval']),
    oneOfInput('purpose', params.purpose, Object.keys(PURPOSE_TO_TYPE)),
    oneOfInput('productType', params.productType, PRODUCT_TYPES),
  ], 'planned');
  const { developmentPhase, purpose, productType } = params;

  const meetingTypeClass = PURPOSE_TO_TYPE[purpose];
  const meetingTypeDef = MEETING_TYPE_REGISTRY[meetingTypeClass];

  const meetingType: MeetingTypeInfo = {
    classification: meetingTypeClass,
    ...meetingTypeDef,
  };

  // Meeting request package
  const meetingRequestPackage = {
    components: [
      'Meeting Request Letter (formal letter to relevant FDA review division)',
      'Product name, application number (IND/NDA/BLA), and regulatory history',
      'Proposed meeting type (A/B/C/D) with justification',
      'Proposed meeting date range (at least 2-3 options)',
      'List of proposed attendees (sponsor side)',
      'Preliminary list of questions/topics for discussion',
      'Brief statement of meeting purpose and background',
    ],
    submissionTiming: getSubmissionTiming(purpose, developmentPhase),
    formatRequirements: [
      'Submit via FDA electronic gateway (ESG) or mail to relevant review division',
      'Reference the IND or application number in all correspondence',
      'Meeting request letter should be concise (1-2 pages)',
      'Briefing document due at least 30 days before scheduled meeting (Type B); 47 days (Type A)',
      'FDA preliminary response (preliminary comments) provided at least 5 business days before meeting',
    ],
  };

  // Timing recommendations
  const timingRecommendations = getTimingRecommendations(purpose, developmentPhase);

  // Question framing tips
  const questionFramingTips = [
    'State the sponsor position BEFORE each question — FDA wants to know where you stand',
    'Frame questions to elicit actionable yes/no or agree/disagree responses whenever possible',
    'Avoid open-ended questions like "What does FDA recommend?" — instead state your proposed approach and ask FDA to comment',
    'Limit to 5-7 focused questions per meeting — too many questions reduce quality of discussion',
    'Break compound questions into discrete, specific questions',
    'Provide sufficient background data to support each question — FDA needs context to provide meaningful feedback',
    'Prioritize questions — FDA may not address all questions if time runs short',
    'For pivotal trial design questions, include the proposed protocol synopsis',
    'For endpoint questions, cite relevant precedent (approved products using similar endpoints)',
    'Avoid asking questions whose answers are clearly stated in existing FDA guidance',
  ];

  // PDUFA goals
  const pdufaGoals = [
    'PDUFA VII (FY2023-2027): Type A meetings — FDA response within 30 calendar days of receipt',
    'PDUFA VII: Type B meetings — FDA should schedule within 75 calendar days of receipt',
    'PDUFA VII: Type C meetings — FDA should schedule within 75 calendar days of receipt',
    'PDUFA VII goal: FDA should grant 90% of meeting requests within the timeline goals',
    'Written-only responses are provided if FDA determines a face-to-face meeting is unnecessary',
    'PDUFA VII: Pre-submission meetings count as Type B meetings with 75-day scheduling goal',
    'Post-meeting minutes should be issued by FDA within 30 calendar days of the meeting',
  ];

  // Meeting management metrics
  const meetingManagementMetrics = [
    'Briefing document submission deadline: Type A — 4 weeks (28 days) before meeting; Type B/C — 4 weeks (30 days) before meeting',
    'FDA preliminary response: at least 2 business days before Type A; at least 5 business days before Type B',
    'Meeting duration: typically 60 minutes for Type B; 30 minutes for Type C',
    'Teleconference vs. face-to-face: sponsor preference, but FDA may designate format',
    'Post-meeting minutes: sponsor should submit draft within 30 calendar days; FDA has 30 days to finalize',
    'Cancelled/rescheduled meetings: at least 5 business days advance notice required',
  ];

  // Practical advice
  const practicalAdvice = getPracticalAdvice(purpose, productType);

  const citations: string[] = [
    'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFA Products (2017, revised 2023)',
    'PDUFA VII Performance Goals and Procedures (FY2023-2027)',
    '21 CFR 312.47 — Meetings (IND meetings)',
    '21 CFR 312.82 — Early consultation for products for life-threatening conditions',
    'FDA Guidance: Best Practices for Communication Between IND Sponsors and FDA During Drug Development (2017)',
    'FDA MAPP 4000.4 — Formal Meetings Between FDA and PDUFA Applicants',
  ];

  return {
    meetingType,
    meetingRequestPackage,
    briefingDocumentStructure: BRIEFING_DOCUMENT_TEMPLATE,
    timingRecommendations,
    questionFramingTips,
    pdufaGoals,
    meetingManagementMetrics,
    practicalAdvice,
    citations,
  };
}


// ── 3. assessOrphanDesignation ──────────────────────────────────────────────

/**
 * Assess FDA and EMA orphan drug designation eligibility based on disease
 * prevalence, clinical rationale, product type, and existing therapies.
 *
 * Returns eligibility assessment for both jurisdictions, benefits comparison,
 * common pitfalls, success factors, and prevalence methodology.
 *
 * Deterministic — identical input always yields identical output.
 */
export function assessOrphanDesignation(params: OrphanDesignationParams): OrphanDesignationResult {
  // 2026-11-09 (S5d): a US prevalence with no stated source gave fdaEligible true (design S5d); a missing prevalence,
  // a prevalence over a threshold or an omitted seriousness fact gave eligible false although the cost-recovery prong,
  // the insufficient-return limb or the fact itself was never assessed; any clinical rationale text was read as
  // significant benefit; 5 in 10,000 failed a limit of "not more than 5"; and a text prevalence or 'true' was misread.
  // A serious condition alone met the prevalence limb, which needs a life-threatening or chronically debilitating one,
  // and a vaccine's or diagnostic's disease prevalence was read as the count FDA applies (persons dosed per year).
  refuseUnlessStated('assessOrphanDesignation', [oneOfInput('productType', params.productType, PRODUCT_TYPES)], 'assessed');
  const count = (field: string, value: unknown): number | undefined =>
    statedNumber(field, value, (n: number) => n >= 0, 'a number of at least 0');
  const diseasePrevalenceUS = count('diseasePrevalenceUS', params.diseasePrevalenceUS);
  const diseasePrevalenceEU = count('diseasePrevalenceEU', params.diseasePrevalenceEU);
  const sourceUS = statedText('diseasePrevalenceUSSource', params.diseasePrevalenceUSSource)?.trim() || undefined;
  const sourceEU = statedText('diseasePrevalenceEUSource', params.diseasePrevalenceEUSource)?.trim() || undefined;
  const clinicalRationale = statedText('clinicalRationale', params.clinicalRationale) ?? '';
  const existingApprovedTherapies = statedNumber('existingApprovedTherapies', params.existingApprovedTherapies,
    (n: number) => Number.isInteger(n) && n >= 0, 'a whole number of at least 0');
  const isSerious = statedBoolean('isSerious', params.isSerious);
  const isLifeThreatening = statedBoolean('isLifeThreatening', params.isLifeThreatening);
  const isDebilitating = statedBoolean('isDebilitating', params.isDebilitating);
  const shownFact = (v: boolean | undefined): string => (v === undefined ? 'not stated' : String(v));

  // FDA Assessment: 21 CFR 316.20(b)(8), fewer than 200,000 persons (for a vaccine or diagnostic drug, persons to whom
  // it will be administered per year) or no reasonable expectation of recovering costs (not assessed).
  const dosedPerYear = params.productType === 'vaccine' || params.productType === 'diagnostic';
  const DOSED_PER_YEAR =
    'For a vaccine or diagnostic drug: fewer than 200,000 persons in the United States to whom it will be administered per year (21 CFR 316.20(b)(8)(i)), not the disease prevalence';
  const fdaPrevalenceMet = !dosedPerYear && diseasePrevalenceUS !== undefined && diseasePrevalenceUS < FDA_ORPHAN_PREVALENCE_THRESHOLD;
  const fdaMissing = [
    ...(diseasePrevalenceUS === undefined && !dosedPerYear ? ['diseasePrevalenceUS'] : []),
    ...(diseasePrevalenceUS !== undefined && sourceUS === undefined && !dosedPerYear ? ['diseasePrevalenceUSSource'] : []),
  ];
  // Met only on a sourced prevalence under the threshold; never false, since the cost-recovery prong is not assessed.
  const fdaEligible: boolean | null = fdaPrevalenceMet && sourceUS !== undefined ? true : null;

  const fdaCriteria: string[] = [
    'Disease or condition affects fewer than 200,000 persons in the United States, OR',
    'There is no reasonable expectation that the cost of developing and making available the drug will be recovered from sales in the US',
    'No requirement for the disease to be "serious" — any disease with <200,000 prevalence qualifies',
  ];

  const fdaRationale: string[] = [];
  if (diseasePrevalenceUS === undefined) {
    fdaRationale.push('US prevalence data not provided — cannot assess FDA orphan eligibility.');
  } else if (dosedPerYear) {
    fdaRationale.push('US disease prevalence of ' + diseasePrevalenceUS.toLocaleString() + ' stated.');
  } else if (fdaPrevalenceMet) {
    fdaRationale.push(
      'US prevalence of ' + diseasePrevalenceUS.toLocaleString() +
      ' is below the 200,000-person threshold — meets FDA orphan drug prevalence criterion.',
    );
  } else {
    fdaRationale.push(
      'US prevalence of ' + diseasePrevalenceUS.toLocaleString() +
      ' exceeds the 200,000-person threshold. FDA orphan designation is NOT met on prevalence grounds. ' +
      'Alternative: demonstrate that costs of development cannot be recovered from US sales.',
    );
  }
  if (dosedPerYear) {
    fdaRationale.push(
      `For a ${params.productType} the FDA count is the number of persons in the United States to whom it will be administered per ` +
      'year (21 CFR 316.20(b)(8)(i)), not the disease prevalence. No input states it, so FDA eligibility is not determined.',
    );
  } else if (diseasePrevalenceUS !== undefined && sourceUS === undefined) {
    fdaRationale.push('No source was stated for the US prevalence (diseasePrevalenceUSSource): a prevalence with no stated source is not used to assess eligibility.');
  }
  if (sourceUS !== undefined) fdaRationale.push(`Prevalence source stated: ${sourceUS}.`);
  const fdaNotAssessed = [
    ...(dosedPerYear ? [DOSED_PER_YEAR] : []),
    ...(dosedPerYear || (diseasePrevalenceUS !== undefined && !fdaPrevalenceMet) ? [fdaCriteria[1]] : []),
  ];
  if (fdaEligible === null && diseasePrevalenceUS !== undefined && !fdaPrevalenceMet) {
    fdaRationale.push('Not assessed: the cost-recovery prong. No input states it, so eligibility is not determined.');
  }

  const fdaProcess: string[] = [
    'Submit Form FDA 4035 (Orphan Drug Designation Request)',
    'Include: description of disease/condition, scientific rationale, prevalence documentation, and regulatory/marketing history',
    'Prevalence documentation: published literature, epidemiological data, disease registries, expert opinions',
    'FDA Office of Orphan Products Development (OOPD) reviews the request',
    'Review timeline: approximately 90 days from receipt of complete application',
    'If additional information needed: FDA sends a 90-day information request letter',
    'Designation is product-specific and disease/condition-specific',
  ];

  const fdaAssessment: OrphanEligibilityAssessment = {
    jurisdiction: 'United States (FDA)',
    eligible: fdaEligible,
    missing: fdaMissing,
    notAssessedCriteria: fdaNotAssessed,
    criteria: fdaCriteria,
    rationale: fdaRationale,
    applicationProcess: fdaProcess,
    reviewTimeline: 'Approximately 90 days from receipt of complete application',
  };

  // EMA Assessment: Regulation (EC) No 141/2000 Art 3(1)(a), the prevalence limb (a life-threatening or chronically
  // debilitating condition affecting not more than 5 in 10,000) or the insufficient-return limb (not assessed; a
  // life-threatening, seriously debilitating or serious and chronic condition), and (b), no satisfactory method or
  // significant benefit (not assessed: a clinical rationale is not a finding of it).
  const emaPrevalencePerTenK = diseasePrevalenceEU ?? null;
  const emaPrevalenceMet = emaPrevalencePerTenK !== null && emaPrevalencePerTenK <= EMA_ORPHAN_PREVALENCE_THRESHOLD;
  // The prevalence limb's condition: life-threatening or chronically debilitating.
  const prevalenceLimbCondition = anyOf(isLifeThreatening, isDebilitating);
  // A condition stated not serious, not life-threatening and not debilitating meets neither limb.
  const anyLimbCondition = anyOf(isSerious, isLifeThreatening, isDebilitating);
  const emaNoSatisfactoryTreatment = existingApprovedTherapies === 0;
  const emaLimbMet = emaPrevalenceMet && sourceEU !== undefined && prevalenceLimbCondition === true;
  // false only when a stated fact fails both limbs; otherwise met only when every criterion is, since the
  // insufficient-return limb and significant benefit are not assessed.
  const emaEligible: boolean | null =
    anyLimbCondition === false ? false : emaLimbMet && emaNoSatisfactoryTreatment ? true : null;
  const SIGNIFICANT_BENEFIT = 'If satisfactory treatment exists, the product must provide significant benefit to those affected';
  const INSUFFICIENT_RETURN = 'Insufficient return on investment (Regulation (EC) No 141/2000 Art 3(1)(a), the alternative to the prevalence limb)';
  const seriousnessMissing = prevalenceLimbCondition === true
    ? []
    : ([['isSerious', isSerious], ['isLifeThreatening', isLifeThreatening], ['isDebilitating', isDebilitating]] as const)
      .filter(([, v]) => v === undefined).map(([k]) => k);
  const emaMissing = emaEligible === false ? [] : [
    ...(emaPrevalencePerTenK === null ? ['diseasePrevalenceEU'] : []),
    ...(emaPrevalencePerTenK !== null && sourceEU === undefined ? ['diseasePrevalenceEUSource'] : []),
    ...seriousnessMissing,
    ...(existingApprovedTherapies === undefined ? ['existingApprovedTherapies'] : []),
  ];

  const emaCriteria: string[] = [
    'Prevalence of the condition in the EU must not exceed 5 in 10,000 (approximately 250,000 persons in the EU)',
    'The condition must be life-threatening or chronically debilitating (for the insufficient-return limb: life-threatening, seriously debilitating, or serious and chronic)',
    'No satisfactory method of diagnosis, prevention, or treatment authorized in the EU, OR',
    SIGNIFICANT_BENEFIT,
  ];

  const emaRationale: string[] = [];
  if (emaPrevalencePerTenK === null) {
    emaRationale.push('EU prevalence data not provided — cannot assess EMA orphan eligibility.');
  } else if (emaPrevalencePerTenK < EMA_ORPHAN_PREVALENCE_THRESHOLD) {
    emaRationale.push(
      'EU prevalence of ' + emaPrevalencePerTenK +
      ' per 10,000 is below the 5 per 10,000 threshold — meets EMA orphan prevalence criterion.',
    );
  } else if (emaPrevalenceMet) {
    emaRationale.push('EU prevalence of 5 per 10,000 does not exceed the limit of 5 in 10,000 — meets EMA orphan prevalence criterion.');
  } else {
    emaRationale.push(
      'EU prevalence of ' + emaPrevalencePerTenK +
      ' per 10,000 exceeds the 5 per 10,000 threshold — EMA orphan designation NOT met on prevalence grounds.',
    );
  }
  if (emaPrevalencePerTenK !== null && sourceEU === undefined) {
    emaRationale.push('No source was stated for the EU prevalence (diseasePrevalenceEUSource): a prevalence with no stated source is not used to assess eligibility.');
  } else if (sourceEU !== undefined) {
    emaRationale.push(`Prevalence source stated: ${sourceEU}.`);
  }
  const facts = `(serious: ${shownFact(isSerious)}, life-threatening: ${shownFact(isLifeThreatening)}, chronically debilitating: ${shownFact(isDebilitating)})`;
  if (anyLimbCondition === false) {
    emaRationale.push(
      `Disease is stated not serious, not life-threatening and not debilitating ${facts}, so it meets neither limb of Art 3(1)(a): ` +
      'the prevalence limb needs a life-threatening or chronically debilitating condition, the insufficient-return limb a ' +
      'life-threatening, seriously debilitating or serious and chronic one. Not eligible.',
    );
  } else if (prevalenceLimbCondition === true) {
    emaRationale.push(`Disease meets the prevalence limb's condition criterion, life-threatening or chronically debilitating ${facts}.`);
  } else if (prevalenceLimbCondition === false) {
    emaRationale.push(
      `Disease is stated neither life-threatening nor chronically debilitating ${facts}, so the prevalence limb is not met; ` +
      'a serious condition may still meet the insufficient-return limb.',
    );
  } else {
    emaRationale.push(`Whether the disease is life-threatening or chronically debilitating was not stated in full (${listed(seriousnessMissing)}), and neither is stated true.`);
  }
  if (existingApprovedTherapies === undefined) {
    emaRationale.push('The number of existing approved therapies was not stated (existingApprovedTherapies).');
  } else if (emaNoSatisfactoryTreatment) {
    emaRationale.push('No existing approved therapies — "no satisfactory method of treatment" criterion met.');
  } else {
    emaRationale.push(
      existingApprovedTherapies + ' existing approved therapies available. ' +
      'EMA orphan designation requires demonstration of "significant benefit" over existing treatment, which is not assessed here' +
      (clinicalRationale.length > 0 ? '. Clinical rationale provided: ' + clinicalRationale : ' (no clinical rationale was provided).'),
    );
  }
  if (emaEligible === null && !emaLimbMet && emaPrevalencePerTenK !== null) {
    emaRationale.push('Not assessed: the insufficient-return limb of Art 3(1)(a), the alternative to the prevalence limb. No input states it.');
  }

  const emaProcess: string[] = [
    'Submit orphan designation application to EMA Committee for Orphan Medicinal Products (COMP)',
    'Application form: EMA/OD application form with supporting documentation',
    'Include: prevalence data, medical plausibility, significant benefit justification (if applicable)',
    'COMP evaluates the application — opinion within 90 days',
    'If positive COMP opinion: European Commission grants orphan designation (30 days after COMP opinion)',
    'Designation must be maintained through annual reports and confirmed at time of MAA',
    'Orphan designation can be reviewed at any time if criteria are no longer met',
    'Re-assessment at Year 5 of market exclusivity — 10-year exclusivity may be reduced to 6 years if criteria no longer met',
  ];

  const emaAssessment: OrphanEligibilityAssessment = {
    jurisdiction: 'European Union (EMA)',
    eligible: emaEligible,
    missing: emaMissing,
    notAssessedCriteria: emaEligible === false ? [] : [
      ...(emaLimbMet ? [] : [INSUFFICIENT_RETURN]),
      ...(existingApprovedTherapies !== undefined && existingApprovedTherapies > 0 ? [SIGNIFICANT_BENEFIT] : []),
    ],
    criteria: emaCriteria,
    rationale: emaRationale,
    applicationProcess: emaProcess,
    reviewTimeline: 'COMP opinion within 90 days; EC decision within ~30 days of COMP opinion',
  };

  // Benefits Comparison
  const benefitsComparison: OrphanBenefitsComparison[] = [
    {
      benefit: 'Market Exclusivity',
      fda: '7 years from NDA/BLA approval date. Cannot be shortened. Prevents FDA from approving another application for the same drug for the same orphan indication.',
      ema: '10 years from MA grant date. May be reduced to 6 years at Year 5 review if orphan criteria no longer met. Prevents similar product approval for the same indication.',
    },
    {
      benefit: 'Tax Credits',
      fda: 'Orphan drug tax credit for qualified clinical testing expenses. Credit was 50% (expired December 2017 under Tax Cuts and Jobs Act). Reduced to 25% for tax years after 2017. Legislative proposals to restore 50% credit are pending.',
      ema: 'Not applicable at EU level. Individual member states may offer national incentives.',
    },
    {
      benefit: 'Fee Waivers/Reductions',
      fda: 'PDUFA application fee waiver for first orphan drug application for the designated indication. Protocol assistance fee waiver.',
      ema: 'Fee reductions for protocol assistance, marketing authorisation, post-authorisation activities, and inspections. Micro/small/medium enterprises (SMEs) receive additional reductions.',
    },
    {
      benefit: 'Protocol Assistance',
      fda: 'Protocol assistance available at no additional fee. FDA may provide orphan-specific guidance on clinical development.',
      ema: 'Protocol assistance from COMP at reduced fee. EMA provides scientific advice on development plan including clinical, nonclinical, and quality aspects.',
    },
    {
      benefit: 'Regulatory Pathway',
      fda: 'Standard NDA/BLA pathway applies. Orphan designation does not change approval standard. Compatible with all expedited programs (Fast Track, Breakthrough, AA, PR).',
      ema: 'Centralized Procedure mandatory for orphan designated products. Access to Conditional MA and MA under Exceptional Circumstances.',
    },
    {
      benefit: 'Grants/Funding',
      fda: 'FDA Office of Orphan Products Development (OOPD) grants program: up to $600,000/year for clinical studies (typically Phase 2/3). Competitive application process.',
      ema: 'No direct grants. EU Framework Programmes (Horizon Europe) may fund rare disease research.',
    },
    {
      benefit: 'Pediatric Requirements',
      fda: 'Pediatric Study Requirements (PSR) under PREA may be waived or deferred for orphan drugs. BPCA Written Request for voluntary pediatric studies — 6-month pediatric exclusivity add-on.',
      ema: 'Paediatric Investigation Plan (PIP) required but waiver/deferral possible for orphan drugs. Paediatric-use MA (PUMA) available for off-patent orphan drugs.',
    },
  ];

  const commonPitfalls: string[] = [
    'Overestimating disease prevalence: using incidence (new cases/year) instead of prevalence (total affected at a point in time)',
    'Failing to account for the "orphan subset" approach: if a pharmacologically plausible subset of a more common disease meets the prevalence threshold, orphan designation may be available for the subset',
    'Not providing adequate prevalence documentation: published literature, epidemiological databases, and expert opinions are all important',
    'Waiting too long to apply: apply early in development — designation can be obtained before clinical data is available',
    'Ignoring the "significant benefit" requirement (EMA): when approved therapies exist, EMA requires evidence that the new product provides a clinically relevant advantage',
    'Failing to maintain the orphan designation: annual reports to EMA and compliance with FDA conditions are required',
    'Not considering the "same drug" doctrine (FDA): another sponsor may receive orphan designation for the same drug for the same indication if they can show "clinical superiority"',
    'Misunderstanding exclusivity scope: orphan exclusivity is indication-specific, not product-wide',
    'Confusing orphan drug exclusivity with patent protection: they are independent protections with different scopes and durations',
  ];

  const successFactors: string[] = [
    'Apply for orphan designation as early as possible — even at the preclinical stage',
    'Invest in robust prevalence documentation using multiple data sources (literature, registries, epidemiological databases)',
    'For diseases with existing treatments (EMA): develop a clear significant benefit argument early in development',
    'Consider dual FDA and EMA orphan designation — they have different criteria and benefits',
    'Engage with FDA OOPD and EMA COMP through pre-designation consultations',
    'Maintain ongoing compliance with designation conditions and annual reporting requirements',
    'Plan for post-approval requirements: both agencies require confirmation that orphan criteria are still met',
    'Consider orphan designation as part of a broader expedited program strategy (combining with Fast Track, Breakthrough, etc.)',
    'For rare disease programs: explore FDA OOPD grants for clinical study funding',
    'Document the clinical rationale for the "orphan subset" if applicable — FDA permits this approach when medically plausible',
  ];

  const prevalenceMethodology: string[] = [
    'FDA prevalence standard: total number of persons in the United States affected by the disease or condition at the time of designation request',
    'EMA prevalence standard: point prevalence in the EU, expressed per 10,000 persons',
    'Prevalence = total number of existing cases at a point in time (NOT incidence, which is new cases per year)',
    'Acceptable data sources: peer-reviewed publications, national disease registries, epidemiological databases (e.g., SEER, NHANES, GBD Study), expert surveys, Orphanet database',
    'For rare diseases without direct prevalence data: indirect estimation methods (incidence x average duration) are acceptable with justification',
    'FDA "orphan subset" doctrine: if a medically plausible subset of a more common disease has <200,000 prevalence and the drug is not indicated for the broader population, orphan designation may be granted for the subset',
    'EMA does not formally recognize the "orphan subset" approach — condition must be a distinct medical entity',
    'When prevalence data is limited: provide multiple estimates using different methodologies and data sources to establish the range',
    'Geographic considerations: FDA uses US-only prevalence; EMA uses EU-wide prevalence',
    'Dynamic prevalence: if a disease prevalence is near the threshold, monitor trends and timing of designation application carefully',
  ];

  const citations: string[] = [
    'Orphan Drug Act of 1983 [21 USC 360aa-360ee]',
    '21 CFR Part 316 — Orphan Drugs',
    'Regulation (EC) No 141/2000 — EU Orphan Medicinal Products Regulation',
    'Commission Regulation (EC) No 847/2000 — Criteria for designation of orphan medicinal products',
    'FDA Guidance: Designating an Orphan Product: Drugs and Biological Products (2011, revised)',
    'EMA Guideline on the Format and Content of Applications for Designation as Orphan Medicinal Products (ENTR/6283/00 Rev 4)',
    'FDA OOPD: Orphan Drug Designation Database (searchable at FDA.gov)',
    'Orphanet: The portal for rare diseases and orphan drugs (orpha.net)',
  ];

  return {
    fdaAssessment,
    emaAssessment,
    benefitsComparison,
    commonPitfalls,
    successFactors,
    prevalenceMethodology,
    inputStates: { isSerious: isSerious ?? 'not_stated', isLifeThreatening: isLifeThreatening ?? 'not_stated', isDebilitating: isDebilitating ?? 'not_stated' },
    citations,
  };
}

// ── 4. select505Pathway ─────────────────────────────────────────────────────

/**
 * Select the recommended 505 regulatory pathway based on the product
 * characteristics: active ingredient novelty, changes from RLD, and
 * available reference listed drug.
 *
 * Returns recommended pathway, alternative pathways, decision tree rationale,
 * patent/exclusivity considerations, and certification types.
 *
 * Deterministic — identical input always yields identical output.
 */
/** The 505 facts the decision tree turns on. */
const PATHWAY_FACTS = ['dosageFormChange', 'routeChange', 'indicationChange', 'newCombination', 'formulationInnovation', 'availableRLD'] as const;
type PathwayFact = (typeof PATHWAY_FACTS)[number];

/** The decision tree on one full answer (the pre-S5d tree, with every fact stated). */
function pathwayTree(
  activeIngredient: Select505PathwayParams['activeIngredient'],
  { dosageFormChange, routeChange, indicationChange, newCombination, formulationInnovation, availableRLD }: Record<PathwayFact, boolean>,
): { recommended: PathwayType; alternatives: PathwayType[]; rationale: string[] } {
  const decisionTreeRationale: string[] = [];
  let recommendedPathwayType: PathwayType;
  const alternativePathwayTypes: PathwayType[] = [];

  // Decision tree logic
  if (activeIngredient === 'new_molecular_entity') {
    recommendedPathwayType = '505b1';
    decisionTreeRationale.push(
      'Active ingredient is a new molecular entity (NME). A 505(b)(1) Full NDA is required because ' +
      'there is no prior FDA finding of safety and effectiveness to reference.',
    );
    decisionTreeRationale.push(
      'NME status provides 5-year NCE exclusivity, the strongest exclusivity protection under the FD&C Act.',
    );
    decisionTreeRationale.push(
      'Full nonclinical and clinical development program required: Phase 1 through Phase 3 adequate and well-controlled trials.',
    );
  } else {
    // Known active ingredient
    decisionTreeRationale.push('Active ingredient is a known molecule with prior FDA approval history.');

    if (!availableRLD) {
      recommendedPathwayType = '505b1';
      decisionTreeRationale.push(
        'No reference listed drug (RLD) is available in the Orange Book. Without an RLD to reference, ' +
        'a 505(b)(1) Full NDA is required even for a known active ingredient.',
      );
    } else if (
      !dosageFormChange &&
      !routeChange &&
      !indicationChange &&
      !newCombination &&
      !formulationInnovation
    ) {
      // Same as RLD in all respects → ANDA
      recommendedPathwayType = '505j';
      decisionTreeRationale.push(
        'Product is the same active ingredient, dosage form, route, strength, and conditions of use as the RLD. ' +
        'A 505(j) ANDA is the appropriate pathway — demonstrating bioequivalence to the RLD is sufficient.',
      );
      alternativePathwayTypes.push('505b2');
      decisionTreeRationale.push(
        'Alternative: 505(b)(2) NDA could also be filed for a product identical to the RLD, but ANDA is more ' +
        'efficient (no clinical trials, lower fees, shorter timeline).',
      );
    } else if (
      (dosageFormChange || routeChange) &&
      !indicationChange &&
      !newCombination &&
      !formulationInnovation
    ) {
      // Change in dosage form or route, no new indication
      recommendedPathwayType = '505b2';
      decisionTreeRationale.push(
        'Product involves a change in ' +
        (dosageFormChange ? 'dosage form' : '') +
        (dosageFormChange && routeChange ? ' and ' : '') +
        (routeChange ? 'route of administration' : '') +
        ' from the RLD. A 505(b)(2) NDA is appropriate — can rely on FDA finding of safety/effectiveness ' +
        'for the active ingredient while submitting bridging studies for the change.',
      );
      // Check if suitability petition could work
      if (dosageFormChange && !routeChange) {
        alternativePathwayTypes.push('suitability_petition');
        decisionTreeRationale.push(
          'Alternative: A Suitability Petition (21 CFR 314.93) could be submitted to FDA to determine ' +
          'if an ANDA can accommodate this dosage form change. If approved, ANDA pathway with lower ' +
          'development cost becomes available.',
        );
      }
      if (routeChange) {
        alternativePathwayTypes.push('suitability_petition');
        decisionTreeRationale.push(
          'A Suitability Petition may be possible for the route change, but FDA frequently denies ' +
          'such petitions for route changes because they often require new clinical safety data.',
        );
      }
    } else if (indicationChange && !newCombination) {
      // New indication for known drug
      recommendedPathwayType = '505b2';
      decisionTreeRationale.push(
        'Product involves a new indication for a known active ingredient. A 505(b)(2) NDA is appropriate — ' +
        'can rely on FDA finding of safety for the active ingredient while submitting new clinical efficacy ' +
        'data for the new indication.',
      );
      decisionTreeRationale.push(
        'New clinical investigation for the new indication may qualify for 3-year exclusivity.',
      );
      alternativePathwayTypes.push('505b1');
      decisionTreeRationale.push(
        'Alternative: 505(b)(1) could be filed with a complete data package, but this is less efficient ' +
        'given the known safety profile of the active ingredient.',
      );
    } else if (newCombination) {
      // New combination product
      recommendedPathwayType = '505b2';
      decisionTreeRationale.push(
        'Product is a new fixed-dose combination. A 505(b)(2) NDA is typically appropriate — can reference ' +
        'the individual components listed drugs for safety/efficacy and submit combination-specific ' +
        'clinical data (contribution of each component, PK interaction, combination safety).',
      );
      alternativePathwayTypes.push('505b1');
      decisionTreeRationale.push(
        'Alternative: 505(b)(1) may be required if both components are new molecular entities or if ' +
        'the combination requires a full independent clinical program.',
      );
    } else if (formulationInnovation) {
      // Formulation innovation (e.g., extended release, novel delivery)
      recommendedPathwayType = '505b2';
      decisionTreeRationale.push(
        'Product involves a formulation innovation (e.g., extended-release, novel delivery system, abuse-deterrent). ' +
        'A 505(b)(2) NDA is appropriate — can rely on FDA finding of safety/effectiveness for the active ingredient ' +
        'and submit formulation-specific data (PK bridging, clinical efficacy for new formulation claim).',
      );
      decisionTreeRationale.push(
        '3-year exclusivity may be available if new clinical investigations are essential to approval of the new formulation.',
      );
    } else {
      // Fallback: default to 505(b)(2) for any changes from RLD
      recommendedPathwayType = '505b2';
      decisionTreeRationale.push(
        'Product involves changes from the RLD. A 505(b)(2) NDA is the most appropriate pathway.',
      );
    }
  }

  return { recommended: recommendedPathwayType, alternatives: alternativePathwayTypes, rationale: decisionTreeRationale };
}

export function select505Pathway(params: Select505PathwayParams): Select505PathwayResult {
  // 2026-11-09 (S5d): an omitted change fact or availableRLD read as false, so ANDA (or a full NDA) was recommended from
  // facts nobody stated; 'true' read as true and 'false' as true; an omitted active ingredient was a known one.
  refuseUnlessStated('select505Pathway', [oneOfInput('activeIngredient', params.activeIngredient, ['new_molecular_entity', 'known'])], 'selected');
  const activeIngredient = params.activeIngredient;
  const stated = Object.fromEntries(PATHWAY_FACTS.map((k: PathwayFact) => [k, statedBoolean(k, params[k])])) as Record<PathwayFact, boolean | undefined>;
  const outcomes = everyAnswer(stated).map((a: Record<PathwayFact, boolean>) => pathwayTree(activeIngredient, a));
  const undecided: Undecided[] = [];
  const pathways = [...new Set(outcomes.map((o) => o.recommended))];
  const recommendedPathwayType: PathwayType | null = pathways.length === 1 ? pathways[0] : null;
  if (recommendedPathwayType === null) {
    undecided.push({
      conclusion: 'recommendedPathway',
      decidingFacts: decidingFacts(stated, (a: Record<PathwayFact, boolean>) => pathwayTree(activeIngredient, a).recommended),
      couldBe: pathways,
    });
  }
  const alternativePathwayTypes = outcomes[0].alternatives.filter((p: PathwayType) => outcomes.every((o) => o.alternatives.includes(p)));
  const rationales = [...new Set(outcomes.map((o) => JSON.stringify(o.rationale)))];
  const decisionTreeRationale: string[] = rationales.length === 1 ? outcomes[0].rationale : [];
  if (rationales.length > 1) {
    const first = outcomes[0].rationale;
    const common = first.filter((line: string, i: number) => outcomes.every((o) => o.rationale[i] === line));
    const open = (Object.keys(stated) as PathwayFact[]).filter((k: PathwayFact) => stated[k] === undefined);
    decisionTreeRationale.push(
      ...common,
      recommendedPathwayType === null
        ? `Not determined: the pathway turns on ${listed(undecided[0].decidingFacts)}, not stated. It could be ${listed(pathways.map((p: PathwayType) => PATHWAY_REGISTRY[p].displayName))}.`
        : `${listed(open)} ${open.length > 1 ? 'were' : 'was'} not stated: on every answer the pathway is ${PATHWAY_REGISTRY[recommendedPathwayType].displayName}; the reasoning and any alternative turn on ${open.length > 1 ? 'them' : 'it'}.`,
    );
  }

  const recommendedPathway: PathwayRecommendation | null =
    recommendedPathwayType === null ? null : { pathway: recommendedPathwayType, ...PATHWAY_REGISTRY[recommendedPathwayType] };

  const alternativePathways: PathwayRecommendation[] = alternativePathwayTypes.map(pt => ({
    pathway: pt,
    ...PATHWAY_REGISTRY[pt],
  }));

  const citations: string[] = [
    'FD&C Act Section 505(b)(1), (b)(2), (j) [21 USC 355]',
    '21 CFR Part 314 — Applications for FDA Approval to Market a New Drug',
    '21 CFR 314.54 — Content and format of 505(b)(2) applications',
    '21 CFR 314.93 — Suitability petitions',
    '21 CFR Part 320 — Bioavailability and Bioequivalence Requirements',
    'FDA Guidance: Applications Covered by Section 505(b)(2) (2023 draft)',
    'FDA Guidance: Determining Whether to Submit an ANDA or a 505(b)(2) Application (2019)',
    'FDA Orange Book: Approved Drug Products with Therapeutic Equivalence Evaluations',
    'Hatch-Waxman Act (Drug Price Competition and Patent Term Restoration Act of 1984)',
  ];

  return {
    recommendedPathway,
    alternativePathways,
    decisionTreeRationale,
    patentExclusivityConsiderations: PATENT_EXCLUSIVITY_REGISTRY,
    certificationTypes: CERTIFICATION_TYPES,
    inputStates: Object.fromEntries(PATHWAY_FACTS.map((k: PathwayFact) => [k, stated[k] ?? 'not_stated'])),
    undecided,
    citations,
  };
}

// ── 5. assessRollingSubmission ───────────────────────────────────────────────

/**
 * Assess rolling submission eligibility and plan the submission schedule
 * for an NDA/BLA with expedited designation status.
 *
 * Returns eligibility assessment, submission schedule template, recommended
 * module order, pre-submission checklist, and manufacturing readiness guidance.
 *
 * Deterministic — identical input always yields identical output.
 */
export function assessRollingSubmission(params: RollingSubmissionParams): RollingSubmissionResult {
  // 2026-11-09 (S5d): an omitted designation read as none, so a product nobody described was "not eligible"; 'false'
  // read as a designation; an omitted status object crashed. productType and the module dates are not read.
  const status = params.expeditedDesignationStatus as unknown;
  if (status !== undefined && status !== null && (typeof status !== 'object' || Array.isArray(status))) {
    throw new ComputationRefusal('invalid_input', `expeditedDesignationStatus must be an object (got ${shown(status)}).`, 'expeditedDesignationStatus');
  }
  const given = (status ?? {}) as Record<string, unknown>;
  const at = (k: string): string => `expeditedDesignationStatus.${k}`;
  const fastTrack = statedBoolean(at('fastTrack'), given.fastTrack);
  const breakthroughTherapy = statedBoolean(at('breakthroughTherapy'), given.breakthroughTherapy);
  const rmat = statedBoolean(at('rmat'), given.rmat);
  const open = [['fastTrack', fastTrack], ['breakthroughTherapy', breakthroughTherapy], ['rmat', rmat]]
    .filter(([, v]) => v === undefined).map(([k]) => at(k as string));

  const eligible: boolean | null =
    fastTrack === true || breakthroughTherapy === true || rmat === true ? true : open.length === 0 ? false : null;

  const eligibilityRationale: string[] = [];
  if (eligible === null) {
    eligibilityRationale.push(
      `Rolling review is available only to products with Fast Track, Breakthrough Therapy, or RMAT designation; none is ` +
      `stated true, and ${listed(open)} ${open.length > 1 ? 'were' : 'was'} not stated, so eligibility is not determined.`,
    );
  } else if (eligible) {
    const designations: string[] = [];
    if (fastTrack) designations.push('Fast Track');
    if (breakthroughTherapy) designations.push('Breakthrough Therapy');
    if (rmat) designations.push('RMAT');
    eligibilityRationale.push(
      'Product has ' + designations.join(' and ') +
      ' designation(s), which grant eligibility for rolling review.',
    );
    eligibilityRationale.push(
      'Rolling review allows sections of the NDA/BLA to be submitted and reviewed as they are completed, ' +
      'rather than waiting for the entire application to be ready.',
    );
    eligibilityRationale.push(
      'The review clock begins when the first section is submitted and formally accepted by FDA.',
    );
  } else {
    eligibilityRationale.push(
      'Product does not have Fast Track, Breakthrough Therapy, or RMAT designation. ' +
      'Rolling review is only available to products with one of these designations.',
    );
    eligibilityRationale.push(
      'Recommendation: Apply for Fast Track designation (lowest bar) if the product targets a serious condition ' +
      'and addresses an unmet medical need. This will enable rolling review.',
    );
    eligibilityRationale.push(
      'Without rolling review, the complete NDA/BLA must be submitted as a single package.',
    );
  }

  // Submission schedule template (typical order for rolling submission)
  const submissionScheduleTemplate = [
    {
      phase: 'Phase 1: Nonclinical Data',
      modules: ['Module 2.4 (Nonclinical Overview)', 'Module 2.6 (Nonclinical Written & Tabulated Summaries)', 'Module 4 (Nonclinical Study Reports)'],
      description:
        'Nonclinical data is typically completed first. Submit pharmacology, ADME, and toxicology modules.',
      typicalOrder: 1,
    },
    {
      phase: 'Phase 2: Quality/CMC Data',
      modules: ['Module 2.3 (Quality Overall Summary)', 'Module 3 (Quality Data — Drug Substance & Drug Product)'],
      description:
        'CMC data for drug substance and drug product. Includes manufacturing process, analytical methods, specifications, stability.',
      typicalOrder: 2,
    },
    {
      phase: 'Phase 3: Clinical Pharmacology',
      modules: ['Module 2.7.1 (Summary of Biopharmaceutic Studies)', 'Module 2.7.2 (Summary of Clinical Pharmacology Studies)', 'Module 5 subset (Clinical Pharmacology Study Reports)'],
      description:
        'PK, PK/PD, dose-response, drug interaction studies. Often available before pivotal clinical data.',
      typicalOrder: 3,
    },
    {
      phase: 'Phase 4: Pivotal Clinical Data',
      modules: ['Module 2.5 (Clinical Overview)', 'Module 2.7.3-2.7.6 (Clinical Summaries)', 'Module 5 (Clinical Study Reports — pivotal and supportive)'],
      description:
        'Pivotal efficacy and safety data. Usually the last major scientific section completed.',
      typicalOrder: 4,
    },
    {
      phase: 'Phase 5: Regional/Administrative',
      modules: ['Module 1 (Administrative Information & Prescribing Information)'],
      description:
        'Module 1 is typically submitted last because it includes the proposed labeling (USPI), which may change ' +
        'based on FDA review of other modules. Includes form FDA 356h, patent/exclusivity information, and financial disclosure.',
      typicalOrder: 5,
    },
  ];

  const recommendedModuleOrder = [
    'Module 4 (Nonclinical) — typically completed earliest',
    'Module 3 (Quality/CMC) — submit once manufacturing process is locked and stability data is available',
    'Module 5 subset (Clinical Pharmacology) — submit after PK/PD studies complete',
    'Module 2 (Summaries/Overviews) — submit in phases as underlying modules are finalized',
    'Module 5 (Pivotal Clinical) — submit after database lock, statistical analysis, and CSR finalization',
    'Module 1 (Regional/Administrative) — submit last; includes proposed labeling that depends on clinical data review',
  ];

  const preSubmissionChecklist = [
    'Confirm Fast Track, Breakthrough Therapy, or RMAT designation is active and in good standing',
    'Hold pre-NDA/BLA meeting with FDA to discuss rolling submission plan and module submission sequence',
    'Agree on tentative submission schedule with FDA review division',
    'Prepare rolling submission plan document identifying target submission dates for each module',
    'Establish eCTD submission capability with FDA Electronic Submissions Gateway (ESG)',
    'Assign a regulatory submission lead responsible for managing the rolling submission sequence',
    'Ensure each module/section is self-contained and reviewable independently when submitted',
    'Prepare cover letters for each rolling submission identifying what is included and what will follow',
    'Coordinate with manufacturing to ensure GMP compliance and site readiness for pre-approval inspection',
    'Plan for FDA information requests — rolling review may generate questions on early modules while later modules are in preparation',
    'Prepare draft prescribing information (label) early — even though Module 1 is submitted last, labeling discussions should begin in advance',
    'Ensure all CTD formatting, pagination, and hyperlink requirements are met for each submission',
  ];

  const filingReviewClockConsiderations = [
    'The PDUFA review clock starts when FDA receives the first rolling submission and formally accepts it',
    'However, the PDUFA date (action date) is calculated from the last submission if that triggers the formal filing',
    'FDA filing review (60-day refuse-to-file assessment) typically occurs after all modules are received',
    'If FDA issues a Refuse to File (RTF), the entire application must be resubmitted — rolling review does not protect against RTF',
    'Priority Review (6-month target) or Standard Review (10-month target) clock runs from filing date, which is after the 60-day filing review',
    'Keep FDA informed of any changes to the submission schedule — delays in later modules may affect review planning',
    'FDA may provide informal feedback on early modules before the filing determination — this is a significant advantage of rolling review',
  ];

  const manufacturingSiteReadiness = [
    'Manufacturing site must be GMP-compliant and ready for pre-approval inspection (PAI) 2-4 months before PDUFA date',
    'Process validation should be completed before or concurrent with the rolling submission',
    'Stability studies should cover the proposed shelf life at time of submission',
    'Drug substance and drug product manufacturing sites should be identified in Module 3',
    'If using contract manufacturing: ensure quality agreements and inspection readiness at CMO sites',
    'Environmental monitoring and trend data should be current and available for inspection',
    'Batch records for commercial-scale batches should be ready for PAI review',
    'Ensure all SOPs, equipment qualification, and cleaning validation are current',
    'For biologics: ensure cell bank characterization, viral safety, and process validation are complete',
    'For cell/gene therapy: ensure chain of identity, potency assay validation, and cold chain validation are complete',
  ];

  const practicalTips = [
    'Rolling review is a logistics challenge — assign a dedicated rolling submission team',
    'Use a master submission tracker to manage dependencies between modules',
    'Build in buffer time between planned and actual submission dates — delays are common',
    'Communicate proactively with FDA about any schedule changes',
    'Quality check each module thoroughly before submission — errors in early modules may create issues later',
    'Consider submitting the most complete and strongest modules first to build FDA confidence',
    'Maintain a running list of FDA questions received on early modules and their resolution status',
  ];

  const citations: string[] = [
    'FD&C Act Section 506(b)(2) — Rolling Review provision',
    'FD&C Act Section 506(a) — Breakthrough Therapy (inherits rolling review)',
    'FD&C Act Section 506(g) — RMAT (inherits rolling review)',
    'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
    'FDA Guidance: Providing Regulatory Submissions in Electronic Format — Certain Human Pharmaceutical Product Applications (2022)',
    'PDUFA VII Performance Goals — Review clock and filing date procedures',
    'ICH M4 — Organization of the Common Technical Document (CTD)',
    'FDA Guidance: Formal Meetings Between FDA and Sponsors (2017) — Pre-NDA/BLA meeting for rolling submission planning',
  ];

  return {
    eligible,
    eligibilityRationale,
    inputStates: {
      [at('fastTrack')]: fastTrack ?? 'not_stated',
      [at('breakthroughTherapy')]: breakthroughTherapy ?? 'not_stated',
      [at('rmat')]: rmat ?? 'not_stated',
    },
    submissionScheduleTemplate: submissionScheduleTemplate,
    recommendedModuleOrder,
    preSubmissionChecklist,
    filingReviewClockConsiderations,
    manufacturingSiteReadiness,
    practicalTips,
    citations,
  };
}

// ── 6. compareGlobalPathways ────────────────────────────────────────────────

/**
 * Compare regulatory pathways across target markets for a given product type
 * and indication.
 *
 * Returns pathway information for each market, harmonization notes,
 * simultaneous submission strategy, and key cross-regional differences.
 *
 * Deterministic — identical input always yields identical output.
 */
export function compareGlobalPathways(params: CompareGlobalPathwaysParams): CompareGlobalPathwaysResult {
  // 2026-11-09 (S5d): an unknown market ('USA') or an omitted list crashed. productType and indication are not read.
  const markets = Object.keys(GLOBAL_PATHWAY_REGISTRY);
  const list = params.targetMarkets as unknown;
  refuseUnlessStated('compareGlobalPathways', [{ field: 'targetMarkets', value: list, ok: Array.isArray(list) && list.length > 0, expected: 'a non-empty list' }], 'compared');
  refuseUnlessStated('compareGlobalPathways', (list as unknown[]).map((m: unknown, i: number) => oneOfInput(`targetMarkets[${i}]`, m, markets)), 'compared');
  const { targetMarkets } = params;

  const pathways: RegionalPathwayInfo[] = targetMarkets.map(market => {
    const data = GLOBAL_PATHWAY_REGISTRY[market];
    return {
      market,
      ...data,
    };
  });

  const harmonizationNotes = [
    'ICH (International Council for Harmonisation): CTD format (ICH M4), stability testing (ICH Q1A-Q1F), nonclinical safety (ICH S1-S11), clinical trial guidelines (ICH E1-E20) provide the foundation for global harmonization',
    'ICH E5 (Ethnic Factors): key for Japan, China, South Korea — ethnic bridging studies may be required when significant intrinsic/extrinsic ethnic factors affect PK/PD or dose-response',
    'ICH E17 (Multi-Regional Clinical Trials): enables acceptance of MRCT data across regions, but local regulatory requirements for minimum patient enrollment may apply',
    'ICH M4 (CTD) format is accepted by all ICH member regions and many non-ICH countries — the foundation for global submissions',
    'GMP harmonization: PIC/S (Pharmaceutical Inspection Co-operation Scheme) facilitates mutual recognition of GMP inspections among member countries',
    'Mutual Recognition Agreements (MRAs) exist between several regulatory authorities (e.g., EU-US, EU-Japan, EU-Canada) for GMP inspections',
    'WHO Prequalification: relevant for low- and middle-income country access and procurement by UN agencies',
    'Project Orbis (FDA): collaborative oncology review program enabling simultaneous review by multiple agencies (FDA, TGA, Health Canada, Swissmedic, MFDS, ANVISA, and others)',
    'ACCESS Consortium (Australia, Canada, Singapore, Switzerland, UK): collaborative work-sharing and recognition procedures for new medicines',
  ];

  const simultaneousSubmissionStrategy: string[] = [];

  if (targetMarkets.includes('us') && targetMarkets.includes('eu')) {
    simultaneousSubmissionStrategy.push(
      'US-EU simultaneous submission: align CTD modules and submit to FDA and EMA within a narrow window. ' +
      'Use the same data package with region-specific Module 1 adaptations.',
    );
  }
  if (targetMarkets.includes('japan')) {
    simultaneousSubmissionStrategy.push(
      'Japan: consider ICH E5 ethnic bridging strategy early. Include Japanese patients in global MRCTs (ICH E17) ' +
      'to potentially avoid separate bridging study. PMDA pre-submission consultation is critical.',
    );
  }
  if (targetMarkets.includes('china')) {
    simultaneousSubmissionStrategy.push(
      'China: include Chinese patients in global MRCTs (NMPA increasingly accepts MRCT data per ICH E17). ' +
      'Minimum Chinese patient enrollment requirements vary by therapeutic area. ' +
      'Simultaneous submission with US/EU is increasingly feasible under NMPA reform.',
    );
  }

  simultaneousSubmissionStrategy.push(
    'Global submission sequence recommendation: submit to FDA and EMA first (most established review processes), ' +
    'then Japan, China, Canada, and other markets. Adjust based on commercial priorities and unmet medical need.',
  );
  simultaneousSubmissionStrategy.push(
    'Consider reliance/recognition pathways: many smaller regulatory agencies accept FDA/EMA approval as a basis ' +
    'for expedited or abbreviated review (e.g., Health Canada, TGA, Singapore HSA, Gulf states).',
  );
  simultaneousSubmissionStrategy.push(
    'Maintain a global regulatory strategy document tracking: submission dates, review timelines, commitments, ' +
    'and approval conditions across all markets.',
  );
  simultaneousSubmissionStrategy.push(
    'Harmonize the global labeling strategy: use a Company Core Data Sheet (CCDS) as the reference document, ' +
    'with region-specific adaptations for local labeling requirements.',
  );

  // Key differences across markets
  const keyDifferences: CompareGlobalPathwaysResult['keyDifferences'] = [];

  // Expedited pathway comparison
  const expeditedDiff: Record<string, string> = {};
  for (const market of targetMarkets) {
    const info = GLOBAL_PATHWAY_REGISTRY[market];
    expeditedDiff[market] = info.expeditedPathways.map(p => p.name).join('; ');
  }
  keyDifferences.push({
    dimension: 'Expedited Pathways Available',
    differences: expeditedDiff,
  });

  // Review timeline comparison
  const timelineDiff: Record<string, string> = {};
  for (const market of targetMarkets) {
    const info = GLOBAL_PATHWAY_REGISTRY[market];
    timelineDiff[market] = 'Standard: ' + info.standardReviewTimeline + ' | Expedited: ' + info.expeditedReviewTimeline;
  }
  keyDifferences.push({
    dimension: 'Review Timelines',
    differences: timelineDiff,
  });

  // Orphan designation comparison
  const orphanDiff: Record<string, string> = {};
  for (const market of targetMarkets) {
    const info = GLOBAL_PATHWAY_REGISTRY[market];
    orphanDiff[market] = info.orphanEquivalent.name + ' (threshold: ' + info.orphanEquivalent.prevalenceThreshold + ', exclusivity: ' + info.orphanEquivalent.exclusivityPeriod + ')';
  }
  keyDifferences.push({
    dimension: 'Orphan Drug Programs',
    differences: orphanDiff,
  });

  // Conditional/provisional approval comparison
  const conditionalDiff: Record<string, string> = {};
  for (const market of targetMarkets) {
    const info = GLOBAL_PATHWAY_REGISTRY[market];
    conditionalDiff[market] = info.conditionalApproval.name;
  }
  keyDifferences.push({
    dimension: 'Conditional/Provisional Approval Mechanism',
    differences: conditionalDiff,
  });

  // Ethnic bridging requirements
  const bridgingDiff: Record<string, string> = {};
  for (const market of targetMarkets) {
    const info = GLOBAL_PATHWAY_REGISTRY[market];
    const bridgingReqs = info.dataRequirementsDifferences.filter(d =>
      d.toLowerCase().includes('bridging') || d.toLowerCase().includes('ethnic') || d.toLowerCase().includes('mrct'),
    );
    bridgingDiff[market] = bridgingReqs.length > 0 ? bridgingReqs.join('; ') : 'No specific ethnic bridging requirements';
  }
  keyDifferences.push({
    dimension: 'Ethnic Bridging / Local Data Requirements',
    differences: bridgingDiff,
  });

  // HTA/Pricing considerations
  const htaDiff: Record<string, string> = {};
  for (const market of targetMarkets) {
    const info = GLOBAL_PATHWAY_REGISTRY[market];
    htaDiff[market] = info.referencePricingHTA.slice(0, 2).join('; ');
  }
  keyDifferences.push({
    dimension: 'HTA/Pricing Framework',
    differences: htaDiff,
  });

  const citations: string[] = [
    'ICH E5 — Ethnic Factors in the Acceptability of Foreign Clinical Data (1998)',
    'ICH E17 — General Principles for Planning and Design of Multi-Regional Clinical Trials (2017)',
    'ICH M4 — Organisation of the Common Technical Document for the Registration of Pharmaceuticals for Human Use (2004)',
    'ICH Q1A(R2) — Stability Testing of New Drug Substances and Drug Products (2003)',
    'Regulation (EC) No 726/2004 — EU centralised procedure',
    'Regulation (EC) No 141/2000 — Orphan Medicinal Products (EU)',
    'EU HTA Regulation 2021/2282 — Joint clinical assessments',
    'PMDA: Pharmaceutical Affairs Law (Japan PAL) and PMD Act',
    'NMPA: Drug Registration Regulation (China, revised 2020)',
    'Health Canada: Food and Drugs Act and Regulations',
    'TGA: Therapeutic Goods Act 1989 (Australia)',
    'ANVISA: Law No. 6.360/1976 and RDC resolutions (Brazil)',
    'MFDS: Pharmaceutical Affairs Act (South Korea)',
    'Project Orbis (FDA international collaboration)',
    'ACCESS Consortium — Work-sharing framework',
    'PIC/S — Pharmaceutical Inspection Co-operation Scheme',
  ];

  return {
    pathways,
    harmonizationNotes,
    simultaneousSubmissionStrategy,
    keyDifferences,
    citations,
  };
}
