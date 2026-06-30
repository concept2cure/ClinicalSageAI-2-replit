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
 * Health Canada Food and Drugs Act.
 *
 * @module server/services/regulatory-strategy/regulatory-strategy-knowledge
 */

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
  eligible: boolean;
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
  diseasePrevalenceUS: number | null;
  diseasePrevalenceEU: number | null;
  clinicalRationale: string;
  productType: ProductType;
  existingApprovedTherapies: number;
  isSerious: boolean;
  isLifeThreatening: boolean;
  isDebilitating: boolean;
}

export interface OrphanEligibilityAssessment {
  jurisdiction: string;
  eligible: boolean;
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
  citations: string[];
}

// ── 4. 505 Pathway Types ────────────────────────────────────────────────────

export type PathwayType = '505b1' | '505b2' | '505j' | 'suitability_petition';

export interface Select505PathwayParams {
  activeIngredient: 'new_molecular_entity' | 'known';
  dosageFormChange: boolean;
  routeChange: boolean;
  indicationChange: boolean;
  newCombination: boolean;
  formulationInnovation: boolean;
  availableRLD: boolean;
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
  recommendedPathway: PathwayRecommendation;
  alternativePathways: PathwayRecommendation[];
  decisionTreeRationale: string[];
  patentExclusivityConsiderations: PatentExclusivity[];
  certificationTypes: CertificationType[];
  citations: string[];
}

// ── 5. Rolling Submission Types ─────────────────────────────────────────────

export interface RollingSubmissionParams {
  expeditedDesignationStatus: {
    fastTrack: boolean;
    breakthroughTherapy: boolean;
    rmat: boolean;
  };
  productType: ProductType;
  estimatedModuleCompletionDates: {
    module1_regional?: string;
    module2_summaries?: string;
    module3_quality?: string;
    module4_nonclinical?: string;
    module5_clinical?: string;
  };
}

export interface RollingSubmissionResult {
  eligible: boolean;
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
// Private Reference Data
// ═══════════════════════════════════════════════════════════════════════════════

// ── Expedited Program Registry ──────────────────────────────────────────────

interface ExpeditedProgramDef {
  displayName: string;
  statutoryBasis: string;
  criteria: string[];
  benefits: string[];
  applicationTiming: string;
  keyRequirements: string[];
  regulatoryBasis: string[];
  caveats: string[];
}

const EXPEDITED_PROGRAM_REGISTRY: Record<ExpeditedProgramName, ExpeditedProgramDef> = {
  fast_track: {
    displayName: 'Fast Track Designation',
    statutoryBasis: 'FD&C Act Section 506(b), as amended by FDASIA 2012',
    criteria: [
      'Product is intended to treat a serious or life-threatening condition',
      'Product demonstrates potential to address an unmet medical need',
      'Unmet medical need: no therapy exists, or potential advantage over available therapy (effectiveness, avoidance of serious side effects, improved compliance that may lead to improved outcomes, effectiveness in a new subpopulation)',
    ],
    benefits: [
      'Rolling review: sections of NDA/BLA reviewed as completed rather than waiting for complete submission',
      'More frequent meetings and communications with FDA to discuss drug development plan',
      'Eligibility for Accelerated Approval and Priority Review if relevant criteria met',
      'Written communication from FDA within 60 calendar days of request',
    ],
    applicationTiming:
      'May be requested at any time during development, including prior to IND submission. Most commonly requested with IND or at End-of-Phase 1.',
    keyRequirements: [
      'Submit Fast Track designation request including: indication and intended use, rationale for serious condition, evidence of unmet medical need, description of clinical development program, data supporting product potential',
      'FDA response within 60 calendar days of receipt of request',
      'Rescission possible if product no longer meets criteria',
    ],
    regulatoryBasis: [
      'FD&C Act Section 506(b) [21 USC 356(b)]',
      'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
      'FDASIA Section 901 (2012)',
      '21 CFR 312.300 — IND content and format',
    ],
    caveats: [
      'Fast Track does not change the standard of evidence for approval',
      'Rolling review does not guarantee faster review time — it allows earlier submission of completed sections',
      'Designation can be rescinded if the product no longer meets criteria',
      'Not available for drugs that are not intended to treat a serious condition',
    ],
  },
  breakthrough_therapy: {
    displayName: 'Breakthrough Therapy Designation',
    statutoryBasis: 'FD&C Act Section 506(a), as added by FDASIA 2012 Section 902',
    criteria: [
      'Product is intended to treat a serious or life-threatening condition',
      'Preliminary clinical evidence indicates that the drug may demonstrate SUBSTANTIAL IMPROVEMENT over existing therapies on one or more clinically significant endpoints',
      'Substantial improvement: clear advantage over available therapy — not merely a different mechanism of action. Evidence of a clinically meaningful advantage is required.',
      'Clinical evidence is typically Phase 1 or Phase 2 data, but earlier data may be acceptable if compelling',
    ],
    benefits: [
      'All features of Fast Track designation (rolling review, more frequent meetings)',
      'Intensive guidance on an efficient drug development program, beginning as early as Phase 1',
      'Organizational commitment involving senior managers at FDA',
      'Rolling review',
      'Potential for other actions to expedite review (e.g., involving senior managers/experienced review staff, FDA cross-disciplinary meetings, project management involvement)',
    ],
    applicationTiming:
      'Should be requested no later than End-of-Phase 2 meeting request. Typically requested after preliminary clinical evidence is available (Phase 1/2 data). FDA encourages early requests.',
    keyRequirements: [
      'Submit Breakthrough Therapy designation request with preliminary clinical evidence of substantial improvement',
      'Clinical evidence must include some evidence from a clinical trial (not just preclinical or mechanistic data)',
      'FDA response within 60 calendar days of receipt of request',
      'Must identify the serious condition and the available therapies for comparison',
    ],
    regulatoryBasis: [
      'FD&C Act Section 506(a) [21 USC 356(a)]',
      'FDASIA Section 902 (2012)',
      'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
      'FDA Breakthrough Therapy Designation: Frequently Asked Questions (2018)',
    ],
    caveats: [
      'Higher bar than Fast Track — requires preliminary CLINICAL evidence of substantial improvement',
      'Preclinical data alone is insufficient; at least some clinical evidence required',
      'Designation can be rescinded if further data do not support substantial improvement',
      'Does not change the evidentiary standard for approval',
      'About 30-40% of requests are granted historically',
    ],
  },
  accelerated_approval: {
    displayName: 'Accelerated Approval',
    statutoryBasis: 'FD&C Act Section 506(c), as amended by FDORA 2022',
    criteria: [
      'Product is intended to treat a serious or life-threatening condition',
      'Product provides a meaningful therapeutic benefit over existing treatments (addresses unmet medical need)',
      'Approval based on a surrogate endpoint reasonably likely to predict clinical benefit OR an intermediate clinical endpoint',
      'FDORA 2022 updates: FDA has enhanced authority to require and enforce post-marketing confirmatory studies',
    ],
    benefits: [
      'Earlier approval based on surrogate or intermediate endpoint rather than waiting for definitive clinical benefit data',
      'Enables access to treatments for serious conditions years earlier than traditional approval timeline',
      'Can be combined with other expedited programs (Fast Track, Breakthrough, Priority Review)',
    ],
    applicationTiming:
      'Discussed with FDA at End-of-Phase 2 or pre-Phase 3 meeting. The surrogate/intermediate endpoint must be agreed upon with FDA before pivotal trial design.',
    keyRequirements: [
      'Identification and agreement with FDA on the surrogate or intermediate endpoint',
      'Adequate and well-controlled clinical trial demonstrating effect on agreed endpoint',
      'Commitment to conduct confirmatory post-marketing study (FDORA 2022: FDA can require study to be underway at time of approval)',
      'Post-marketing study must verify and describe the predicted clinical benefit',
      'FDORA 2022: FDA can require progress reports, can use expedited withdrawal if confirmatory study fails or is not conducted with due diligence',
      'Promotional materials require pre-review',
    ],
    regulatoryBasis: [
      'FD&C Act Section 506(c) [21 USC 356(c)]',
      '21 CFR Part 314 Subpart H (drugs), 21 CFR Part 601 Subpart E (biologics)',
      'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
      'FDORA (Food and Drug Omnibus Reform Act) 2022 — Sections 3201-3210',
      'FDA Guidance: Accelerated Approval Program — Fulfillment of Postmarketing Requirements (draft 2023)',
    ],
    caveats: [
      'FDORA 2022 significantly strengthened FDA authority over post-marketing requirements',
      'FDA can now require confirmatory trial to be underway at the time of accelerated approval',
      'Expedited withdrawal proceedings available if sponsor fails to conduct confirmatory study with due diligence',
      'Approval may be withdrawn if confirmatory study does not verify clinical benefit',
      'Historical concern: ~20% of accelerated approvals eventually withdrawn or indication narrowed',
      'Surrogate endpoint must be "reasonably likely to predict clinical benefit" — lower bar than validated surrogate',
    ],
  },
  priority_review: {
    displayName: 'Priority Review Designation',
    statutoryBasis: 'FD&C Act Section 505(b), PDUFA performance goals',
    criteria: [
      'Application for a drug that, if approved, would provide a significant improvement in the safety or effectiveness of the treatment, diagnosis, or prevention of a serious condition compared to available therapy',
      'Significant improvement may include: evidence of increased effectiveness, elimination or substantial reduction of a treatment-limiting adverse reaction, enhanced compliance leading to improved outcomes, effectiveness in a new subpopulation, safety and effectiveness of a new dosage form, convenience or ease of use',
    ],
    benefits: [
      'FDA review target shortened from 10 months (Standard) to 6 months from filing date',
      '8-month review clock for Priority NMEs under PDUFA VII',
      'Does NOT change the scientific/medical standard for approval',
    ],
    applicationTiming:
      'Determined at the time of NDA/BLA filing. Sponsor can request Priority Review in the submission cover letter. FDA may grant Priority Review independently.',
    keyRequirements: [
      'Include Priority Review request in NDA/BLA submission cover letter',
      'Provide data and rationale for why product represents a significant improvement over available therapy',
      'FDA determines Priority Review eligibility within 60 days of receipt (at the filing/refuse to file stage)',
      'Priority Review Voucher (PRV) programs: tropical disease, rare pediatric disease — voucher can be applied to any subsequent NDA/BLA submission',
    ],
    regulatoryBasis: [
      'PDUFA VII (Prescription Drug User Fee Amendments, 2022-2027) Performance Goals',
      'FD&C Act Section 505(b) [21 USC 355(b)]',
      'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
      'FDA MAPP 6020.3 — Priority Review',
    ],
    caveats: [
      'Shorter review time does NOT mean lower evidentiary standard',
      'Review clock starts from the filing date (60-day filing review occurs first)',
      'FDA may reclassify from Priority to Standard if data review does not support significant improvement claim',
      'Priority Review does not guarantee approval — it only expedites the review process',
      'Priority Review Vouchers (PRVs) are separate programs — not the same as Priority Review designation',
    ],
  },
  rmat: {
    displayName: 'Regenerative Medicine Advanced Therapy (RMAT) Designation',
    statutoryBasis: 'FD&C Act Section 506(g), as added by 21st Century Cures Act (2016)',
    criteria: [
      'Product is a regenerative medicine therapy: cell therapy, therapeutic tissue engineering product, human cell and tissue product, or any combination product using such therapies or products',
      'Also includes gene therapies and certain combination products',
      'Product is intended to treat, modify, reverse, or cure a serious or life-threatening disease or condition',
      'Preliminary clinical evidence indicates that the drug has the potential to address unmet medical needs for such disease or condition',
    ],
    benefits: [
      'All benefits of Fast Track and Breakthrough Therapy designations combined',
      'Intensive FDA guidance on efficient development program',
      'Organizational commitment involving senior managers',
      'Rolling review',
      'Potential for accelerated approval based on surrogate or intermediate endpoints',
      'Eligibility for Priority Review',
      'Potential use of post-approval patient registries or other real-world evidence sources to fulfill post-marketing requirements',
    ],
    applicationTiming:
      'May be requested at any time during development after preliminary clinical evidence is available. FDA encourages early requests.',
    keyRequirements: [
      'Product must qualify as a "regenerative medicine therapy" (cell therapy, gene therapy, tissue engineering, HCT/P, or combination)',
      'Preliminary clinical evidence required (similar standard to Breakthrough Therapy)',
      'Submit RMAT designation request to relevant FDA review division',
      'FDA response within 60 calendar days of receipt of request',
    ],
    regulatoryBasis: [
      'FD&C Act Section 506(g) [21 USC 356(g)]',
      '21st Century Cures Act Section 3033 (2016)',
      'FDA Guidance: Regulatory Considerations for Human Cells, Tissues, and Cellular and Tissue-Based Products: Minimal Manipulation and Homologous Use (2020)',
      'FDA Guidance: Expedited Programs for Regenerative Medicine Therapies for Serious Conditions (2019)',
    ],
    caveats: [
      'Only available for regenerative medicine therapies — not small molecules or traditional biologics',
      'Preliminary clinical evidence required — preclinical data alone is insufficient',
      'Gene therapies are eligible for RMAT (even though also eligible for Breakthrough Therapy)',
      'Not a separate approval pathway — it enhances the existing BLA pathway',
      'Designation can be rescinded if criteria are no longer met',
    ],
  },
};

// ── Comparison Matrix Dimensions ────────────────────────────────────────────

const EXPEDITED_COMPARISON_MATRIX: ExpeditedProgramResult['comparisonMatrix'] = [
  {
    dimension: 'Statutory Basis',
    fast_track: 'FD&C Act §506(b), FDASIA 2012',
    breakthrough_therapy: 'FD&C Act §506(a), FDASIA 2012',
    accelerated_approval: 'FD&C Act §506(c), FDORA 2022',
    priority_review: 'PDUFA Performance Goals',
    rmat: 'FD&C Act §506(g), 21st Century Cures Act 2016',
  },
  {
    dimension: 'Condition Requirement',
    fast_track: 'Serious or life-threatening',
    breakthrough_therapy: 'Serious or life-threatening',
    accelerated_approval: 'Serious or life-threatening',
    priority_review: 'Serious condition',
    rmat: 'Serious or life-threatening',
  },
  {
    dimension: 'Evidence Required',
    fast_track: 'Nonclinical or clinical data showing potential to address unmet need',
    breakthrough_therapy: 'Preliminary CLINICAL evidence of substantial improvement',
    accelerated_approval: 'Adequate trial using surrogate/intermediate endpoint',
    priority_review: 'Evidence of significant improvement in NDA/BLA',
    rmat: 'Preliminary clinical evidence of potential to address unmet need',
  },
  {
    dimension: 'Product Scope',
    fast_track: 'Any drug or biologic',
    breakthrough_therapy: 'Any drug or biologic',
    accelerated_approval: 'Any drug or biologic',
    priority_review: 'Any drug or biologic',
    rmat: 'Regenerative medicine therapies only (cell, gene, tissue)',
  },
  {
    dimension: 'Key Benefit',
    fast_track: 'Rolling review + frequent FDA meetings',
    breakthrough_therapy: 'Intensive FDA guidance + organizational commitment + rolling review',
    accelerated_approval: 'Earlier approval on surrogate endpoint',
    priority_review: '6-month review vs. 10-month standard',
    rmat: 'All BT benefits + potential AA on surrogate + RWE for post-marketing',
  },
  {
    dimension: 'Application Timing',
    fast_track: 'Any time during development (even pre-IND)',
    breakthrough_therapy: 'No later than EOP2; early requests encouraged',
    accelerated_approval: 'Discussed at EOP2/pre-Phase 3; granted at NDA/BLA filing',
    priority_review: 'Determined at NDA/BLA filing',
    rmat: 'Any time after preliminary clinical evidence available',
  },
  {
    dimension: 'FDA Response Timeline',
    fast_track: '60 calendar days',
    breakthrough_therapy: '60 calendar days',
    accelerated_approval: 'N/A (regulatory pathway, not designation)',
    priority_review: 'At filing determination (60-day filing review)',
    rmat: '60 calendar days',
  },
  {
    dimension: 'Rolling Review',
    fast_track: 'Yes',
    breakthrough_therapy: 'Yes (inherits from Fast Track)',
    accelerated_approval: 'No (unless also granted Fast Track/BT)',
    priority_review: 'No (unless also granted Fast Track/BT)',
    rmat: 'Yes (inherits from Fast Track/BT)',
  },
  {
    dimension: 'Approval Standard',
    fast_track: 'Standard — substantial evidence of effectiveness and adequate safety',
    breakthrough_therapy: 'Standard — same evidentiary requirements',
    accelerated_approval: 'Surrogate/intermediate endpoint (confirmatory study required)',
    priority_review: 'Standard — same evidentiary requirements',
    rmat: 'May use surrogate endpoints and accelerated approval pathway',
  },
  {
    dimension: 'Historical Approval Rate (approximate)',
    fast_track: '~60% of designated products ultimately approved',
    breakthrough_therapy: '~70-80% of designated products ultimately approved',
    accelerated_approval: 'N/A — pathway rather than designation',
    priority_review: 'N/A — review timeline classification',
    rmat: 'Program relatively new (2017+); limited historical data',
  },
];

// ── FDA Meeting Type Registry ───────────────────────────────────────────────

const MEETING_TYPE_REGISTRY: Record<MeetingTypeClassification, Omit<MeetingTypeInfo, 'classification'>> = {
  A: {
    displayName: 'Type A Meeting',
    description:
      'Immediately necessary for an otherwise stalled drug development program. Includes meetings to discuss: ' +
      'clinical hold disputes, special protocol assessment (SPA) disputes, and post-action (Complete Response Letter) meetings.',
    fdaResponseTimeline: '30 calendar days from FDA receipt of meeting request',
    schedulingTimeline: 'Meeting should be scheduled within 30 calendar days of receipt',
    examples: [
      'Dispute resolution for clinical holds (21 CFR 312.48)',
      'Post-Complete Response Letter meetings',
      'Special Protocol Assessment (SPA) dispute meetings',
      'Safety-related meetings that impact an ongoing clinical program',
    ],
    regulatoryBasis: [
      'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFA Products (2017, revised)',
      'PDUFA VII Performance Goals and Procedures (2022-2027)',
      '21 CFR 312.47 — Meetings',
    ],
  },
  B: {
    displayName: 'Type B Meeting',
    description:
      'Pre-IND, certain End-of-Phase 1 (for Subpart E/H products), End-of-Phase 2/pre-Phase 3, and pre-NDA/BLA meetings. ' +
      'These are the most common and strategically important development milestone meetings.',
    fdaResponseTimeline: '75 calendar days from FDA receipt of meeting request for scheduling',
    schedulingTimeline: 'Pre-IND: within 75 days. EOP2: within 75 days. Pre-NDA/BLA: within 75 days.',
    examples: [
      'Pre-IND meeting: discuss planned IND content, nonclinical program, initial clinical plan',
      'End-of-Phase 1 meeting (for products under Subpart E/H): discuss Phase 2 plans for serious conditions',
      'End-of-Phase 2 / Pre-Phase 3 meeting: discuss pivotal trial design, endpoints, statistical plan',
      'Pre-NDA/BLA meeting: discuss submission format, content, and review expectations',
    ],
    regulatoryBasis: [
      'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFA Products (2017, revised)',
      'PDUFA VII Performance Goals — Type B meeting timelines',
      '21 CFR 312.47(b) — End-of-Phase 2 meetings',
      '21 CFR 312.82 — IND meetings for life-threatening conditions',
    ],
  },
  C: {
    displayName: 'Type C Meeting',
    description:
      'Any other meeting necessary for drug development that does not qualify as Type A or B. ' +
      'Used for questions that arise during development but are not tied to major milestones.',
    fdaResponseTimeline: '75 calendar days from FDA receipt of meeting request',
    schedulingTimeline: 'Within 75 calendar days of receipt of meeting request',
    examples: [
      'CMC development strategy discussions',
      'Labeling discussions',
      'Post-marketing commitment/requirement discussions',
      'REMS discussions',
      'General clinical development questions not tied to Phase boundaries',
    ],
    regulatoryBasis: [
      'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFA Products (2017, revised)',
      'PDUFA VII Performance Goals',
    ],
  },
  D: {
    displayName: 'Type D Meeting — Formal Dispute Resolution',
    description:
      'Formal dispute resolution meeting. Used when a sponsor disagrees with a scientific or procedural decision ' +
      'and has exhausted the informal dispute resolution process at the review division level.',
    fdaResponseTimeline: 'Within 30 calendar days if involving a clinical hold or SPA; otherwise varies',
    schedulingTimeline: 'Varies — follows formal dispute resolution procedures in 21 CFR 10.75 and MAPP 4151.7',
    examples: [
      'Disputes over Complete Response Letter content',
      'Disputes over clinical hold reasons',
      'Disputes over FDA requests for additional studies',
      'Disagreements on endpoint acceptability',
    ],
    regulatoryBasis: [
      '21 CFR 10.75 — Internal agency review of decisions',
      'FDA Guidance: Formal Dispute Resolution: Scientific and Technical Issues Related to Pharmaceutical Component Quality (2017)',
      'FDA MAPP 4151.7 — Formal Dispute Resolution process',
    ],
  },
  pre_submission: {
    displayName: 'Pre-Submission Meeting (505(b)(2)/ANDA-specific)',
    description:
      'Product-specific pre-submission meetings for 505(b)(2) NDAs and ANDAs to discuss formulation strategy, ' +
      'bioequivalence study design, clinical study needs, and product-specific guidance interpretation.',
    fdaResponseTimeline: '75 calendar days from receipt of meeting request',
    schedulingTimeline: 'Within 75 calendar days; GDUFA goals may apply for ANDAs',
    examples: [
      'Pre-ANDA meeting to discuss bioequivalence approach for complex generics',
      '505(b)(2) pre-NDA meeting to discuss clinical bridging strategy',
      'Product-specific guidance (PSG) interpretation',
      'Complex generic drug development strategy',
    ],
    regulatoryBasis: [
      'GDUFA III Performance Goals (2023-2027) — pre-ANDA meeting goals',
      'FDA Guidance: ANDAs for Certain Highly Purified Synthetic Peptide Drug Products That Refer to Listed Drugs of rDNA Origin (2021)',
      'FDA Guidance: Controlled Correspondence Related to Generic Drug Development (2020)',
    ],
  },
};

// ── Briefing Document Template ──────────────────────────────────────────────

const BRIEFING_DOCUMENT_TEMPLATE: BriefingDocumentSection[] = [
  {
    sectionTitle: '1. Meeting Objectives',
    contentGuidance: [
      'State the purpose of the meeting clearly and concisely',
      'List the specific questions or issues to be discussed (numbered)',
      'Include the sponsor position for each question',
    ],
    pageGuidance: '1 page',
  },
  {
    sectionTitle: '2. Product Background',
    contentGuidance: [
      'Product name (generic and trade name if applicable), dosage form, route of administration',
      'Mechanism of action',
      'Regulatory history (INDs, previous submissions, previous FDA meetings)',
      'Development stage and key milestones',
    ],
    pageGuidance: '1-2 pages',
  },
  {
    sectionTitle: '3. Disease Background and Unmet Need',
    contentGuidance: [
      'Brief epidemiology and pathophysiology',
      'Current standard of care and its limitations',
      'Unmet medical need that the product addresses',
    ],
    pageGuidance: '1-2 pages',
  },
  {
    sectionTitle: '4. Nonclinical Summary',
    contentGuidance: [
      'Key pharmacology findings (in vitro and in vivo)',
      'Toxicology summary (species, key findings, NOAEL, safety margins)',
      'ADME/PK overview',
      'Any outstanding nonclinical issues',
    ],
    pageGuidance: '3-5 pages',
  },
  {
    sectionTitle: '5. Clinical Summary',
    contentGuidance: [
      'Clinical pharmacology summary (PK, dose-response, PK/PD)',
      'Clinical efficacy data (Phase 1/2/3 as available)',
      'Key efficacy endpoints and results',
      'Safety database summary, including serious adverse events',
      'Risk-benefit assessment',
    ],
    pageGuidance: '5-15 pages (varies by development stage)',
  },
  {
    sectionTitle: '6. CMC Summary',
    contentGuidance: [
      'Drug substance manufacturing process overview',
      'Drug product formulation and manufacturing',
      'Analytical methods and specifications',
      'Stability data summary',
      'Any CMC challenges or open issues',
    ],
    pageGuidance: '2-4 pages',
  },
  {
    sectionTitle: '7. Proposed Regulatory Strategy',
    contentGuidance: [
      'Proposed clinical development plan (if applicable)',
      'Proposed pivotal trial design and endpoints',
      'Statistical analysis plan overview',
      'Proposed regulatory pathway and expedited program strategy',
      'Target submission timeline',
    ],
    pageGuidance: '2-4 pages',
  },
  {
    sectionTitle: '8. Questions for FDA',
    contentGuidance: [
      'Number each question clearly',
      'State the sponsor position for each question BEFORE asking the question',
      'Provide relevant background data supporting the sponsor position',
      'Frame questions to elicit actionable FDA feedback (yes/no or agree/disagree preferred)',
      'Limit to 5-7 focused questions per meeting',
      'Avoid compound questions — break complex issues into discrete questions',
    ],
    pageGuidance: '2-5 pages',
  },
  {
    sectionTitle: '9. Appendices (as needed)',
    contentGuidance: [
      'Detailed data tables, figures, and study designs',
      'Protocol synopses',
      'Literature references',
      'Regulatory correspondence history',
    ],
    pageGuidance: 'As needed — keep appendices focused',
  },
];

// ── Meeting Purpose to Type Mapping ─────────────────────────────────────────

const PURPOSE_TO_TYPE: Record<MeetingPurpose, MeetingTypeClassification> = {
  pre_ind: 'B',
  eop1: 'B',
  eop2: 'B',
  pre_phase3: 'B',
  pre_nda_bla: 'B',
  type_a_urgent: 'A',
  dispute_resolution: 'D',
  pre_submission_505b2: 'pre_submission',
  pre_submission_anda: 'pre_submission',
  risk_evaluation: 'C',
  pediatric: 'C',
  other: 'C',
};

// ── Orphan Designation Registry ─────────────────────────────────────────────

const FDA_ORPHAN_PREVALENCE_THRESHOLD = 200000;
const EMA_ORPHAN_PREVALENCE_THRESHOLD = 5; // per 10,000

// ── 505 Pathway Decision Data ───────────────────────────────────────────────

const PATHWAY_REGISTRY: Record<PathwayType, Omit<PathwayRecommendation, 'pathway'>> = {
  '505b1': {
    displayName: '505(b)(1) Full NDA — New Drug Application',
    description:
      'Full NDA with complete reports of adequate and well-controlled investigations demonstrating ' +
      'safety and effectiveness. Required for new molecular entities (NMEs) and products where the ' +
      'sponsor generates all safety and efficacy data independently.',
    legalBasis: 'FD&C Act Section 505(b)(1) [21 USC 355(b)(1)]',
    requiredStudies: [
      'Complete nonclinical pharmacology and toxicology package',
      'Phase 1 clinical pharmacology studies (PK, dose-ranging, drug-drug interaction)',
      'Phase 2 dose-finding and proof-of-concept studies',
      'Phase 3 pivotal adequate and well-controlled efficacy trials (typically 2)',
      'Complete safety database (typically 300-600 patients for non-life-threatening; 1500+ for chronic conditions per ICH E1)',
      'Full CMC data package (drug substance and drug product)',
      'Environmental assessment or claim of categorical exclusion',
    ],
    advantages: [
      '5-year New Chemical Entity (NCE) exclusivity for NMEs',
      '3-year exclusivity for new clinical investigation essential to approval (change in condition of use)',
      'No reliance on another product — full independence',
      'Broadest patent protection strategy options',
    ],
    disadvantages: [
      'Longest and most expensive development pathway',
      'Requires full nonclinical and clinical data package',
      'Typical development timeline: 10-15 years, $1-3 billion',
      'Highest regulatory risk if pivotal trials fail',
    ],
    typicalTimeline: '10-15 years from discovery to approval',
    regulatoryBasis: [
      'FD&C Act Section 505(b)(1) [21 USC 355(b)(1)]',
      '21 CFR 314 Subpart B — Applications',
      '21 CFR 314.50 — Content and format of an NDA',
      'ICH E1 — Extent of Population Exposure',
      'ICH E8 — General Considerations for Clinical Trials',
    ],
  },
  '505b2': {
    displayName: '505(b)(2) NDA — NDA with Reliance on Prior Findings',
    description:
      'NDA where at least some of the information required for approval comes from studies not ' +
      'conducted by or for the applicant and for which the applicant has not obtained a right of ' +
      'reference. Relies on FDA previous findings of safety and effectiveness for a listed drug (RLD). ' +
      'May include the applicant own studies to support changes from the RLD.',
    legalBasis: 'FD&C Act Section 505(b)(2) [21 USC 355(b)(2)]',
    requiredStudies: [
      'Literature-based or FDA-finding-based safety/efficacy data for the active ingredient',
      'Bridging studies as needed: bioequivalence/bioavailability studies, comparative clinical studies',
      'Clinical studies to support the specific change from the RLD (new indication, route, dosage form, strength)',
      'Nonclinical studies if the change raises new safety questions (e.g., new route may need new tox studies)',
      'CMC data for the proposed drug product',
      'If Paragraph IV certification: patent challenge litigation potential',
    ],
    advantages: [
      'Reduced development time and cost compared to 505(b)(1)',
      'May leverage existing safety and efficacy data for the active ingredient',
      'Enables development of improved formulations, new routes, new indications for known drugs',
      '3-year exclusivity for new clinical investigations essential to approval',
      'Can establish new competitive position for a known molecule',
    ],
    disadvantages: [
      'Subject to patent challenges (Paragraph IV certification may trigger 30-month stay)',
      'Must identify and cite a listed drug (RLD) in the Orange Book',
      'Bridging study requirements may be substantial depending on the change from RLD',
      'Potential for Citizen Petitions from RLD holder to delay approval',
      'No 5-year NCE exclusivity (only 3-year new clinical investigation exclusivity)',
    ],
    typicalTimeline: '3-7 years from development start to approval',
    regulatoryBasis: [
      'FD&C Act Section 505(b)(2) [21 USC 355(b)(2)]',
      '21 CFR 314.54 — Content and format of an NDA filed under 505(b)(2)',
      'FDA Guidance: Applications Covered by Section 505(b)(2) (2023 draft)',
      'FDA Guidance: Determining Whether to Submit an ANDA or a 505(b)(2) Application (2019)',
    ],
  },
  '505j': {
    displayName: '505(j) ANDA — Abbreviated New Drug Application',
    description:
      'Abbreviated application for a generic drug that is the same as a listed drug (RLD) in active ingredient, ' +
      'dosage form, strength, route of administration, labeling, quality, performance characteristics, and ' +
      'intended use. Must demonstrate bioequivalence to the RLD.',
    legalBasis: 'FD&C Act Section 505(j) [21 USC 355(j)]',
    requiredStudies: [
      'Bioequivalence study demonstrating that the generic product is bioequivalent to the RLD',
      'In vitro dissolution testing (comparative with RLD)',
      'Full CMC data for drug substance and drug product',
      'Stability studies per ICH Q1A/Q1E',
      'No clinical efficacy trials required (bioequivalence substitutes for efficacy)',
      'Product-specific guidance (PSG) requirements, if available',
    ],
    advantages: [
      'Shortest and least expensive regulatory pathway',
      '180-day first-to-file exclusivity for successful Paragraph IV challengers',
      'No clinical efficacy trials required — bioequivalence to RLD is sufficient',
      'GDUFA fee structure (lower than PDUFA)',
      'Eligible for competitive generic therapy (CGT) designation for additional benefits',
    ],
    disadvantages: [
      'Must be the same active ingredient, dosage form, route, strength, and conditions of use as RLD',
      'Subject to patent exclusivity and 30-month stay for Paragraph IV challenges',
      'Cannot make changes to the RLD (no new indications, routes, or dosage forms without suitability petition)',
      'Competitive market with thin margins',
      'Complex generics may require additional studies (product-specific guidances)',
    ],
    typicalTimeline: '2-5 years from development start to approval',
    regulatoryBasis: [
      'FD&C Act Section 505(j) [21 USC 355(j)]',
      '21 CFR 314 Subpart C — Abbreviated Applications (ANDAs)',
      '21 CFR 320 — Bioavailability and Bioequivalence Requirements',
      'FDA Orange Book (Approved Drug Products with Therapeutic Equivalence Evaluations)',
      'GDUFA III Performance Goals (2023-2027)',
    ],
  },
  suitability_petition: {
    displayName: 'Suitability Petition (21 CFR 314.93)',
    description:
      'Petition to FDA requesting permission to file an ANDA for a drug product that differs from the RLD ' +
      'in dosage form, route of administration, strength, or active ingredient in a combination product. ' +
      'If approved, the ANDA may be filed with the change; if denied, a 505(b)(2) NDA is required instead.',
    legalBasis: '21 CFR 314.93, FD&C Act Section 505(j)(2)(C)',
    requiredStudies: [
      'Petition must demonstrate that the proposed change from the RLD does not require new clinical investigations to establish safety and effectiveness',
      'If petition is approved: standard ANDA requirements (bioequivalence, CMC)',
      'If petition is denied: 505(b)(2) NDA with appropriate clinical bridging studies',
    ],
    advantages: [
      'May enable ANDA pathway for products that differ from RLD in dosage form, route, or strength',
      'Lower cost than 505(b)(2) NDA if petition is approved',
      'Maintains generic drug cost and development advantages',
    ],
    disadvantages: [
      'FDA may deny the petition, requiring 505(b)(2) NDA instead',
      'Petition review adds time before ANDA can be filed',
      'Limited to specific types of changes from RLD',
      'Cannot be used for new indications or new active ingredients (except in combinations)',
    ],
    typicalTimeline: 'Petition review: ~150 days. Then ANDA timeline if approved.',
    regulatoryBasis: [
      '21 CFR 314.93 — Petition to request change from listed drug',
      'FD&C Act Section 505(j)(2)(C) [21 USC 355(j)(2)(C)]',
      'FDA Guidance: Determining Whether to Submit an ANDA or a 505(b)(2) Application (2019)',
    ],
  },
};

// ── Patent Exclusivity Registry ─────────────────────────────────────────────

const PATENT_EXCLUSIVITY_REGISTRY: PatentExclusivity[] = [
  {
    type: 'New Chemical Entity (NCE) Exclusivity',
    duration: '5 years from NDA approval date',
    description:
      'Prevents FDA from accepting any ANDA or 505(b)(2) application referencing the NME for 5 years. ' +
      'An ANDA with Paragraph IV certification may be submitted after 4 years.',
    legalBasis: 'FD&C Act Section 505(c)(3)(E)(ii) and 505(j)(5)(F)(ii)',
    applicableTo: ['505b1'],
  },
  {
    type: 'New Clinical Investigation Exclusivity',
    duration: '3 years from approval date',
    description:
      'Granted when approval requires new clinical investigations (other than BA/BE studies) essential to ' +
      'the approval. Blocks approval (not submission) of ANDAs and 505(b)(2)s for the same condition of approval.',
    legalBasis: 'FD&C Act Section 505(c)(3)(E)(iii) and 505(j)(5)(F)(iii)',
    applicableTo: ['505b1', '505b2'],
  },
  {
    type: 'OTC Exclusivity',
    duration: '3 years from OTC approval date',
    description:
      'Three-year exclusivity for a switch from prescription to OTC status when supported by new clinical data.',
    legalBasis: 'FD&C Act Section 505(c)(3)(E)(iii)',
    applicableTo: ['505b1', '505b2'],
  },
  {
    type: 'Pediatric Exclusivity',
    duration: '6 months added to existing exclusivity/patent',
    description:
      'Six-month extension added to all existing exclusivities and patents for the moiety when the sponsor ' +
      'conducts pediatric studies pursuant to a Written Request from FDA.',
    legalBasis: 'FD&C Act Section 505A, Pediatric Research Equity Act (PREA), BPCA',
    applicableTo: ['505b1', '505b2', '505j'],
  },
  {
    type: 'Orphan Drug Exclusivity',
    duration: '7 years from NDA/BLA approval date',
    description:
      'Prevents FDA from approving another application for the same drug for the same orphan indication for 7 years. ' +
      'Does not prevent approval of a clinically superior product for the same indication.',
    legalBasis: 'Orphan Drug Act Section 527 [21 USC 360cc]',
    applicableTo: ['505b1', '505b2'],
  },
  {
    type: '180-Day Generic Exclusivity',
    duration: '180 days from first commercial marketing or court decision',
    description:
      'First ANDA applicant to file a Paragraph IV certification gets 180 days of exclusivity — ' +
      'FDA will not approve subsequent ANDAs during this period.',
    legalBasis: 'FD&C Act Section 505(j)(5)(B)(iv), Hatch-Waxman Act',
    applicableTo: ['505j'],
  },
  {
    type: 'Patent Term Extension (PTE)',
    duration: 'Up to 5 years (total patent life post-approval cannot exceed 14 years)',
    description:
      'Extension of one patent per product to compensate for time lost during FDA review. ' +
      'Calculated based on IND-to-NDA and NDA-to-approval periods.',
    legalBasis: '35 USC 156 (Hatch-Waxman Patent Term Restoration)',
    applicableTo: ['505b1', '505b2'],
  },
];

// ── Paragraph Certification Types ───────────────────────────────────────────

const CERTIFICATION_TYPES: CertificationType[] = [
  {
    paragraph: 'Paragraph I',
    description: 'No patent information has been submitted to FDA for the RLD.',
    implications: [
      'ANDA/505(b)(2) may be approved immediately (no patent barrier)',
      'Rare scenario — most listed drugs have Orange Book patents',
    ],
  },
  {
    paragraph: 'Paragraph II',
    description: 'The patent has expired.',
    implications: [
      'ANDA/505(b)(2) may be approved immediately (patent barrier removed)',
      'Applicant must verify patent expiration date in Orange Book',
    ],
  },
  {
    paragraph: 'Paragraph III',
    description: 'The applicant will not seek approval until the patent expires.',
    implications: [
      'ANDA/505(b)(2) approval will be delayed until the patent expiration date',
      'No litigation risk — applicant is deferring to the patent',
      'Tentative approval may be granted before patent expiration',
    ],
  },
  {
    paragraph: 'Paragraph IV',
    description:
      'The patent is invalid, unenforceable, or will not be infringed by the generic product.',
    implications: [
      'Triggers notice to patent holder and NDA holder within 20 days of acceptance of ANDA',
      'Patent holder may sue within 45 days of receiving notice',
      'If suit filed: 30-month stay of ANDA approval (unless court resolves sooner)',
      'First filer eligible for 180-day generic exclusivity',
      'Requires paragraph IV certification letter with detailed factual and legal basis',
      'Significant litigation cost and risk',
    ],
  },
];

// ── Global Regulatory Pathway Data ──────────────────────────────────────────

const GLOBAL_PATHWAY_REGISTRY: Record<TargetMarket, Omit<RegionalPathwayInfo, 'market'>> = {
  us: {
    displayName: 'United States',
    regulatoryAuthority: 'Food and Drug Administration (FDA)',
    relevantDivision: 'CDER (drugs) or CBER (biologics, gene/cell therapy, vaccines, blood products)',
    applicationType: 'NDA (drugs under FD&C Act) or BLA (biologics under PHS Act)',
    standardReviewTimeline: '10 months (Standard Review, PDUFA VII)',
    expeditedReviewTimeline: '6 months (Priority Review); 8 months (Priority NME, PDUFA VII)',
    expeditedPathways: [
      {
        name: 'Fast Track Designation',
        equivalent: 'N/A — US-specific program',
        criteria: ['Serious condition', 'Potential to address unmet medical need'],
        benefits: ['Rolling review', 'Frequent FDA meetings', 'Eligible for AA and PR'],
      },
      {
        name: 'Breakthrough Therapy Designation',
        equivalent: 'EMA PRIME, PMDA SAKIGAKE, NMPA Breakthrough, Health Canada NOC/c',
        criteria: ['Serious condition', 'Preliminary clinical evidence of substantial improvement'],
        benefits: ['Intensive FDA guidance', 'Organizational commitment', 'Rolling review', 'Senior manager involvement'],
      },
      {
        name: 'Accelerated Approval',
        equivalent: 'EMA Conditional Marketing Authorization, PMDA Conditional/Time-Limited Approval, NMPA Conditional Approval',
        criteria: ['Serious condition', 'Unmet need', 'Surrogate or intermediate endpoint'],
        benefits: ['Earlier approval on surrogate endpoint', 'FDORA 2022 strengthened post-marketing requirements'],
      },
      {
        name: 'Priority Review',
        equivalent: 'EMA Accelerated Assessment, Health Canada Priority Review',
        criteria: ['Significant improvement in safety or effectiveness over available therapy'],
        benefits: ['6-month review target vs. 10-month standard'],
      },
      {
        name: 'RMAT Designation',
        equivalent: 'EMA PRIME (for ATMPs), PMDA SAKIGAKE (for regenerative medicine)',
        criteria: ['Regenerative medicine therapy', 'Serious condition', 'Preliminary clinical evidence'],
        benefits: ['All Fast Track + Breakthrough benefits', 'Potential accelerated approval', 'RWE for post-marketing'],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Designation (ODD)',
      prevalenceThreshold: '<200,000 persons in the US',
      exclusivityPeriod: '7 years from approval',
      otherBenefits: [
        'Tax credit for clinical research (expired 2017; renewal pending)',
        'PDUFA fee waiver',
        'Protocol assistance fee waiver',
        'Grants program (up to $600K/year for clinical studies)',
      ],
    },
    conditionalApproval: {
      name: 'Accelerated Approval (under FD&C Act §506(c))',
      criteria: [
        'Serious or life-threatening condition',
        'Meaningful therapeutic benefit over existing treatments',
        'Surrogate or intermediate clinical endpoint reasonably likely to predict clinical benefit',
      ],
      postApprovalRequirements: [
        'Confirmatory post-marketing study required (FDORA 2022: must be underway at time of approval)',
        'Promotional material pre-review',
        'Expedited withdrawal if confirmatory study fails or not conducted with due diligence',
      ],
    },
    dataRequirementsDifferences: [
      'Two adequate and well-controlled studies typically required (but one study with strong evidence may suffice)',
      'US-specific safety reporting: CIOMS-I form for expedited reports, MedWatch for post-marketing',
      'FDA may accept foreign clinical data if applicable to US population (21 CFR 312.120)',
      'Ethnic bridging generally not required for US submissions',
    ],
    gmpInspectionRequirements: [
      'Pre-approval inspection (PAI) of manufacturing sites for all NDA/BLA submissions',
      'FDA may inspect foreign manufacturing sites',
      'Inspection within approximately 6 months of PDUFA date',
      'Warning Letter or Import Alert can delay approval',
    ],
    referencePricingHTA: [
      'No formal reference pricing system at federal level',
      'Inflation Reduction Act (2022): Medicare drug price negotiation for select high-spend drugs',
      'CMS coverage decisions (NCDs/LCDs) impact Medicare reimbursement',
      'Private payer formulary decisions based on clinical and economic evidence',
      'ICER (Institute for Clinical and Economic Review) value assessments increasingly influential',
    ],
  },
  eu: {
    displayName: 'European Union',
    regulatoryAuthority: 'European Medicines Agency (EMA)',
    relevantDivision: 'Committee for Medicinal Products for Human Use (CHMP) or Committee for Advanced Therapies (CAT) for ATMPs',
    applicationType: 'Marketing Authorisation Application (MAA) — Centralised Procedure',
    standardReviewTimeline: '210 active days (~12-15 months total including clock stops)',
    expeditedReviewTimeline: '150 active days (Accelerated Assessment, ~9-10 months total)',
    expeditedPathways: [
      {
        name: 'PRIME (PRIority MEdicines)',
        equivalent: 'FDA Breakthrough Therapy Designation',
        criteria: [
          'Targets an unmet medical need',
          'Preliminary clinical evidence showing major therapeutic advantage (or for ATMPs/academic sponsors: compelling nonclinical data)',
        ],
        benefits: [
          'Early and enhanced scientific and regulatory support',
          'Rapporteur appointed at PRIME eligibility',
          'Eligibility for Accelerated Assessment',
          'Increased interaction with CHMP/CAT',
        ],
      },
      {
        name: 'Accelerated Assessment',
        equivalent: 'FDA Priority Review',
        criteria: ['Major public health interest', 'Therapeutic innovation'],
        benefits: ['Review timeline reduced from 210 to 150 active days'],
      },
      {
        name: 'Conditional Marketing Authorisation (CMA)',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Unmet medical need',
          'Benefit-risk balance is positive',
          'Applicant will be able to provide comprehensive data post-approval',
          'Product addresses life-threatening, seriously debilitating, or emergency situations',
        ],
        benefits: [
          'Earlier market access based on less comprehensive data',
          'Annual renewal until full MA granted',
        ],
      },
      {
        name: 'Marketing Authorisation Under Exceptional Circumstances',
        equivalent: 'No direct FDA equivalent',
        criteria: [
          'Comprehensive data cannot be provided due to rarity of condition, limited scientific knowledge, or ethical concerns',
          'Benefit-risk balance is positive',
        ],
        benefits: ['Permanent MA with specific obligations for additional data collection'],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Medicinal Product Designation',
      prevalenceThreshold: '<5 per 10,000 in the EU (approximately <250,000 persons in EU)',
      exclusivityPeriod: '10 years (may be reduced to 6 years if criteria no longer met at Year 5 review)',
      otherBenefits: [
        'Protocol assistance at reduced fee',
        'Fee reductions for regulatory procedures',
        'Access to EU orphan drug incentives (varies by member state)',
        'Centralized procedure mandatory — single EU-wide authorization',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Marketing Authorisation (CMA)',
      criteria: [
        'Seriously debilitating or life-threatening disease, or emergency situation',
        'Unmet medical need',
        'Positive benefit-risk balance based on available data',
        'Comprehensive data can be provided post-authorisation',
        'Public health benefit of immediate availability outweighs risk of less comprehensive data',
      ],
      postApprovalRequirements: [
        'Specific obligations to complete ongoing or new studies',
        'Annual renewal by CHMP until converted to full MA',
        'MA may be suspended or revoked if obligations are not fulfilled',
      ],
    },
    dataRequirementsDifferences: [
      'One adequate and well-controlled pivotal study may be sufficient if compelling',
      'CTD format required (ICH M4)',
      'Environmental Risk Assessment (ERA) required — not required for US NDA',
      'Paediatric Investigation Plan (PIP) required unless waiver/deferral granted (Regulation (EC) No 1901/2006)',
      'Ethnic bridging generally not required for EU submissions',
      'QP (Qualified Person) batch release required for EU-marketed products',
    ],
    gmpInspectionRequirements: [
      'GMP compliance verified by EEA member state inspectorates',
      'Mutual Recognition Agreements (MRA) with certain countries (Australia, Canada, Japan, Switzerland, US, etc.)',
      'QP certification required for each batch released in EU',
      'Pre-approval GMP inspection may be requested by CHMP',
    ],
    referencePricingHTA: [
      'HTA assessments by member states (NICE UK, G-BA Germany, HAS France, AIFA Italy, etc.)',
      'EU HTA Regulation (2021/2282) — joint clinical assessments starting January 2025 for oncology and ATMPs',
      'External reference pricing (ERP) used by most EU member states',
      'Pricing and reimbursement decisions are member state competence',
      'Value-based pricing increasingly adopted',
    ],
  },
  japan: {
    displayName: 'Japan',
    regulatoryAuthority: 'Pharmaceuticals and Medical Devices Agency (PMDA) / Ministry of Health, Labour and Welfare (MHLW)',
    relevantDivision: 'Office of New Drug (drugs) or Office of Cellular and Tissue-based Products (cell/gene therapy)',
    applicationType: 'J-NDA (drugs) or BLA equivalent (biologics) or Regenerative Medicine Product application',
    standardReviewTimeline: '12 months standard review (PMDA target)',
    expeditedReviewTimeline: '6-9 months (SAKIGAKE or Priority Review)',
    expeditedPathways: [
      {
        name: 'SAKIGAKE Designation',
        equivalent: 'FDA Breakthrough Therapy Designation',
        criteria: [
          'Drug developed in Japan with world-first application in Japan',
          'Serious condition with high medical need',
          'Outstanding efficacy expected (significant improvement over existing therapy)',
        ],
        benefits: [
          'Priority consultation (pre-application)',
          'Substantial review period reduction (target: 6 months)',
          'Dedicated review team',
          'Pre-submission consultation',
          'Extension of re-examination period (orphan equivalent)',
        ],
      },
      {
        name: 'Priority Review (PMDA)',
        equivalent: 'FDA Priority Review',
        criteria: ['Serious disease with no adequate therapy', 'Outstanding clinical benefit'],
        benefits: ['Review period target: ~9 months vs. 12 months standard'],
      },
      {
        name: 'Conditional Early Approval',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Serious disease with no adequate therapy',
          'Patient population limited in Japan',
          'Significant efficacy confirmed in exploratory clinical trial',
        ],
        benefits: [
          'Approval based on limited clinical data',
          'Post-marketing requirements for confirmatory evidence',
        ],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Designation (Japan)',
      prevalenceThreshold: '<50,000 patients in Japan',
      exclusivityPeriod: '10 years re-examination period (extended from standard 8 years)',
      otherBenefits: [
        'Priority review',
        'Reduced regulatory fees',
        'Tax incentives for R&D expenses',
        'Subsidies for clinical development',
        'National Health Insurance (NHI) listing with premium pricing',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Early Approval System',
      criteria: [
        'Serious life-threatening disease',
        'No adequate alternative treatment',
        'Surrogate or biomarker-based efficacy in exploratory trial',
        'Difficult to conduct adequate confirmatory trial in Japan (small population)',
      ],
      postApprovalRequirements: [
        'Post-marketing clinical study or use-results survey',
        'Deadline for submission of confirmatory data',
        'Re-evaluation based on post-marketing data',
      ],
    },
    dataRequirementsDifferences: [
      'Ethnic bridging study may be required per ICH E5 (Ethnic Factors in the Acceptability of Foreign Clinical Data)',
      'Japanese bridging strategy: evaluate PK/PD intrinsic/extrinsic ethnic factors',
      'PMDA may require Japan-specific clinical data if ethnic sensitivity identified',
      'CTD format in Japanese (translations required)',
      'Drug Master File (DMF) system similar to US DMF',
      'GLP and GCP inspections conducted by PMDA',
    ],
    gmpInspectionRequirements: [
      'PMDA pre-approval GMP inspection (Compliance Assessment)',
      'Regular GMP inspections every 5 years for marketed products',
      'MRA with EU, US (PIC/S member since 2014)',
      'Inspection of foreign manufacturing sites may be conducted',
    ],
    referencePricingHTA: [
      'NHI drug price listing: cost-effectiveness analysis required for drugs with annual sales >10 billion yen or significant budget impact',
      'Drug Pricing Organization (Chuikyo) determines NHI price',
      'Premium pricing for innovative drugs (kasan) based on: innovativeness, usefulness, pediatric indication, SAKIGAKE designation',
      'Biennial price revision (price cuts) based on market price surveys',
      'Cost-effectiveness evaluation (CEA) introduced 2019 for high-cost drugs',
    ],
  },
  china: {
    displayName: 'China',
    regulatoryAuthority: 'National Medical Products Administration (NMPA)',
    relevantDivision: 'Center for Drug Evaluation (CDE)',
    applicationType: 'Import Drug License Application (IDLA) for foreign products; Domestic NDA for domestic products',
    standardReviewTimeline: '200 working days (~10-12 months) per 2020 reform targets',
    expeditedReviewTimeline: '130 working days (~6-7 months) for Priority Review; 70 working days for Breakthrough',
    expeditedPathways: [
      {
        name: 'Breakthrough Therapy Designation (China)',
        equivalent: 'FDA Breakthrough Therapy Designation',
        criteria: [
          'Innovative drug for serious or life-threatening condition',
          'Preliminary clinical evidence of significant clinical advantage',
          'Drug with clear clinical value',
        ],
        benefits: [
          'Priority review and approval',
          'Reduced review timeline (70 working days target)',
          'Enhanced communication with CDE',
          'Rolling submission permitted',
          'Conditional approval possible',
        ],
      },
      {
        name: 'Priority Review (China)',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Innovative drugs with obvious clinical value',
          'Drugs urgently needed for public health',
          'Drugs designated as breakthrough therapy',
          'Pediatric drugs with urgent clinical need',
        ],
        benefits: ['Accelerated review timeline: 130 working days target'],
      },
      {
        name: 'Special Approval Procedure',
        equivalent: 'FDA Emergency Use Authorization (emergency context)',
        criteria: [
          'Public health emergency',
          'Prevention/treatment of HIV/AIDS, viral hepatitis, rare diseases, malignant tumors',
          'Innovative drugs urgently needed',
        ],
        benefits: ['Expedited review and approval', 'Conditional approval permitted'],
      },
    ],
    orphanEquivalent: {
      name: 'Rare Disease Drug Incentives',
      prevalenceThreshold: 'Based on First Batch of Rare Diseases List (2018): 121 diseases listed; prevalence <1/500,000 or similar',
      exclusivityPeriod: 'No specific orphan exclusivity period — data protection rules apply (6 years for innovative drugs)',
      otherBenefits: [
        'Priority review pathway',
        'Reduced clinical data requirements possible',
        'Potential for conditional approval',
        'Import drug registration may be expedited',
        'VAT exemption for certain rare disease drugs (State Council 2019)',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Approval (China)',
      criteria: [
        'Urgently needed drug for serious or life-threatening condition with no effective treatment',
        'Public health emergency drug',
        'Drug designated as breakthrough therapy',
        'Surrogate/intermediate endpoint or early/mid-stage clinical trial data shows significant benefit',
      ],
      postApprovalRequirements: [
        'Confirmatory clinical study required within specified timeline',
        'Annual report on post-marketing study progress',
        'Approval may be withdrawn if confirmatory study fails',
      ],
    },
    dataRequirementsDifferences: [
      'China Clinical Trial Registration required (all trials involving Chinese subjects)',
      'ICH E5 ethnic bridging: China-specific PK/PD or bridging study often required',
      'Multi-regional clinical trial (MRCT) data with Chinese subjects increasingly accepted (ICH E17)',
      'Minimum Chinese patient enrollment requirements in global studies (varies by indication)',
      'Drug Master File (DMF) filing with CDE for drug substance and excipients',
      'GMP certification of domestic and foreign manufacturing sites by NMPA',
      'Data integrity and source data verification emphasis in inspections',
    ],
    gmpInspectionRequirements: [
      'NMPA pre-approval inspection of manufacturing sites (domestic and foreign)',
      'Overseas inspection program for foreign manufacturing sites',
      'GMP certificate required for import drug applications',
      'Inspection cycle: every 2-3 years for marketed products',
    ],
    referencePricingHTA: [
      'National Reimbursement Drug List (NRDL) — negotiated inclusion',
      'Annual NRDL negotiation rounds (centralized by NHSA)',
      'Significant price reductions expected during negotiation (often 50-80% from list price)',
      'Volume-based procurement (VBP/centralized procurement) for generics — dramatic price reductions',
      'HTA evaluation increasingly required for NRDL inclusion',
      'Provincial supplemental drug lists being phased out',
    ],
  },
  canada: {
    displayName: 'Canada',
    regulatoryAuthority: 'Health Canada — Health Products and Food Branch (HPFB)',
    relevantDivision: 'Therapeutic Products Directorate (TPD) for drugs; Biologic and Radiopharmaceutical Drugs Directorate (BRDD) for biologics',
    applicationType: 'New Drug Submission (NDS) or Abbreviated New Drug Submission (ANDS)',
    standardReviewTimeline: '300 calendar days (target) from filing to decision',
    expeditedReviewTimeline: '180 calendar days (Priority Review)',
    expeditedPathways: [
      {
        name: 'Priority Review',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Serious, life-threatening, or severely debilitating condition',
          'Evidence of significant increase in efficacy and/or significant decrease in risk',
        ],
        benefits: ['180-day review target vs. 300-day standard'],
      },
      {
        name: 'Notice of Compliance with Conditions (NOC/c)',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Serious, life-threatening, or severely debilitating condition',
          'Promising evidence of clinical effectiveness based on surrogate marker or limited clinical data',
          'Undertaking to provide confirmatory evidence',
        ],
        benefits: [
          'Earlier market access based on surrogate/limited data',
          'Conditions attached for additional studies',
        ],
      },
      {
        name: 'Advance Consideration',
        equivalent: 'No direct equivalent',
        criteria: ['Drug addresses serious condition with unmet need', 'Sponsor requests advance consideration'],
        benefits: ['Enhanced pre-submission consultation', 'Potential for expedited processing'],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Framework (proposed — no formal orphan drug legislation as of 2024)',
      prevalenceThreshold: 'No formal prevalence threshold — Canada lacks formal orphan drug legislation. Special Access Programme may apply.',
      exclusivityPeriod: 'No orphan exclusivity — standard 8-year data protection for innovative drugs applies',
      otherBenefits: [
        'Priority Review eligible for rare disease drugs',
        'Special Access Programme for emergency access',
        'Collaboration with FDA and EMA through Project Orbis and MHRA-HC partnership',
        'Proposed orphan drug framework under development',
      ],
    },
    conditionalApproval: {
      name: 'Notice of Compliance with Conditions (NOC/c)',
      criteria: [
        'Serious, life-threatening, or severely debilitating disease or condition',
        'Promising evidence of clinical effectiveness',
        'Acceptable safety profile',
        'Sponsor commitment to confirmatory studies',
      ],
      postApprovalRequirements: [
        'Confirmatory studies as specified in conditions',
        'Periodic safety update reports',
        'Conditions published on Health Canada website',
        'NOC/c may be suspended if conditions not met',
      ],
    },
    dataRequirementsDifferences: [
      'CTD format required (ICH member)',
      'Canadian Reference Product (CRP) required for generic submissions',
      'Bilingual labeling requirements (English and French)',
      'Drug Identification Number (DIN) assigned upon approval',
      'Product Monograph (PM) format specific to Canada',
      'No specific ethnic bridging requirements',
      'Foreign clinical data generally accepted',
    ],
    gmpInspectionRequirements: [
      'Health Canada GMP inspection required for all manufacturing sites',
      'Drug Establishment License (DEL) required for domestic manufacturers and importers',
      'MRA with EU, Australia, and other PIC/S members',
      'Risk-based inspection approach — high-risk sites inspected more frequently',
    ],
    referencePricingHTA: [
      'CADTH (Canadian Agency for Drugs and Technologies in Health) — HTA and formulary listing recommendations',
      'INESSS (Quebec) — separate HTA evaluation for Quebec',
      'pan-Canadian Pharmaceutical Alliance (pCPA) — centralized pricing negotiation',
      'Patented Medicine Prices Review Board (PMPRB) — maximum price regulation',
      'Provincial formulary listing required for public reimbursement',
      'PMPRB reforms (2022+): new price ceiling methodology based on pharmacoeconomic value and international reference pricing',
    ],
  },
  australia: {
    displayName: 'Australia',
    regulatoryAuthority: 'Therapeutic Goods Administration (TGA)',
    relevantDivision: 'Prescription Medicines Authorisation Branch',
    applicationType: 'Registration on the Australian Register of Therapeutic Goods (ARTG) — Category 1 application',
    standardReviewTimeline: '255 working days (~12 months)',
    expeditedReviewTimeline: '150 working days (Priority Review); Provisional approval pathway also available',
    expeditedPathways: [
      {
        name: 'Priority Review',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Major therapeutic advance for serious condition',
          'Important improvement in safety or efficacy',
        ],
        benefits: ['150 working days review target vs. 255 standard'],
      },
      {
        name: 'Provisional Approval',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Serious or life-threatening condition',
          'Promising clinical data but incomplete',
          'Expected to provide significant improvement in efficacy/safety',
        ],
        benefits: [
          'Earlier market access based on preliminary clinical data',
          'Provisional registration for up to 6 years (2-year initial + 2 extensions)',
        ],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Designation (TGA)',
      prevalenceThreshold: '<2,000 patients in Australia (approximately <1 in 12,500)',
      exclusivityPeriod: '5 years data exclusivity for orphan drugs',
      otherBenefits: [
        'Fee waivers and reductions',
        'TGA orphan drug designation facilitates PBAC listing',
        'Access to Life Saving Drugs Program (LSDP) for eligible rare disease drugs',
      ],
    },
    conditionalApproval: {
      name: 'Provisional Approval',
      criteria: [
        'Serious or life-threatening condition',
        'Preliminary clinical data showing significant promise',
        'Reasonable to expect comprehensive data will be provided',
      ],
      postApprovalRequirements: [
        'Sponsor must provide confirmatory data within registration period',
        'Provisional registration for 2 years, extendable twice (up to 6 years total)',
        'Automatic cancellation if not transitioned to full registration or extended',
      ],
    },
    dataRequirementsDifferences: [
      'CTD format required (ICH member)',
      'Australian-specific Module 1',
      'Product Information (PI) and Consumer Medicine Information (CMI) format',
      'Generally accepts foreign clinical data — no ethnic bridging requirement',
      'Work-sharing arrangements with EMA, Health Canada, Swissmedic (ACCESS Consortium)',
    ],
    gmpInspectionRequirements: [
      'TGA GMP clearance required for all manufacturing sites',
      'MRA with EU, Canada, and other PIC/S members (TGA is PIC/S member)',
      'Risk-based GMP inspection program',
      'Periodic GMP re-assessment',
    ],
    referencePricingHTA: [
      'Pharmaceutical Benefits Advisory Committee (PBAC) — cost-effectiveness evaluation required for PBS listing',
      'Pharmaceutical Benefits Scheme (PBS) — government subsidized medicines',
      'PBAC is the sole national HTA body — positive recommendation required for PBS listing',
      'Evidence of cost-effectiveness mandatory — willingness-to-pay threshold approximately AUD 45,000-75,000/QALY',
      'Reference pricing within therapeutic groups',
    ],
  },
  brazil: {
    displayName: 'Brazil',
    regulatoryAuthority: 'Agencia Nacional de Vigilancia Sanitaria (ANVISA)',
    relevantDivision: 'General Office for Medicines and Biological Products (GGMED)',
    applicationType: 'New Drug Registration (Registro de Medicamento Novo) or Biological Product Registration',
    standardReviewTimeline: '365 calendar days (statutory target); actual may be longer',
    expeditedReviewTimeline: '120 calendar days (Priority Review for serious conditions)',
    expeditedPathways: [
      {
        name: 'Priority Review (ANVISA)',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Innovative drug for serious or life-threatening condition',
          'No adequate treatment available in Brazil',
          'Drugs already approved by FDA, EMA, or PMDA (stringent regulatory authority)',
        ],
        benefits: ['120-day review target vs. 365-day standard'],
      },
      {
        name: 'Temporary Emergency Use (Uso Emergencial)',
        equivalent: 'FDA Emergency Use Authorization',
        criteria: [
          'Public health emergency',
          'No approved alternative in Brazil',
          'Sufficient evidence of quality, safety, and efficacy',
        ],
        benefits: ['Rapid authorization during public health emergencies'],
      },
    ],
    orphanEquivalent: {
      name: 'No formal orphan drug legislation in Brazil',
      prevalenceThreshold: 'No formal prevalence threshold — ANVISA uses WHO rare disease definition (affecting <65/100,000 persons)',
      exclusivityPeriod: 'No orphan drug exclusivity — standard 10-year data protection for innovative drugs applies',
      otherBenefits: [
        'Priority Review available for drugs for rare diseases',
        'ANVISA may grant compassionate use for rare disease patients',
        'National Commission for Technology Incorporation in SUS (CONITEC) evaluation for public system inclusion',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Approval (ANVISA)',
      criteria: [
        'Serious or life-threatening condition with unmet need',
        'Preliminary evidence of clinical benefit',
        'Product approved by stringent regulatory authority (FDA, EMA, PMDA)',
      ],
      postApprovalRequirements: [
        'Annual renewal based on additional data submission',
        'Confirmatory studies required',
        'ANVISA may revoke if benefit-risk becomes unfavorable',
      ],
    },
    dataRequirementsDifferences: [
      'CTD format accepted but not always mandatory — Brazilian regulatory format also accepted',
      'Portuguese language labeling and product information required',
      'Stability studies under WHO Climatic Zone IVb conditions (30C/75% RH) required',
      'Brazilian GMP certificate (CBPF) required for all manufacturing sites',
      'Local clinical data may be requested for certain therapeutic areas',
      'ANVISA may accept foreign clinical data from well-controlled studies',
    ],
    gmpInspectionRequirements: [
      'ANVISA GMP inspection required for all domestic and foreign manufacturing sites',
      'Certificado de Boas Praticas de Fabricacao (CBPF) — GMP certificate mandatory',
      'ANVISA conducts overseas inspections — significant lead time required',
      'GMP certificate valid for 2 years',
      'Brazil is not currently a PIC/S member (observer status)',
    ],
    referencePricingHTA: [
      'CMED (Camara de Regulacao do Mercado de Medicamentos) — pharmaceutical price regulation',
      'Maximum price set at lowest among reference countries (US, Canada, France, Spain, Portugal, Australia, Greece, Italy, New Zealand)',
      'CONITEC (Comissao Nacional de Incorporacao de Tecnologias no SUS) — HTA for public system (SUS)',
      'Positive CONITEC recommendation required for SUS reimbursement',
      'Private market pricing may differ from SUS pricing',
    ],
  },
  south_korea: {
    displayName: 'South Korea',
    regulatoryAuthority: 'Ministry of Food and Drug Safety (MFDS)',
    relevantDivision: 'Pharmaceutical Safety Bureau — New Drug Division',
    applicationType: 'New Drug Application (NDA) or Biologics License Application (BLA equivalent)',
    standardReviewTimeline: '120 working days (~6 months) statutory target',
    expeditedReviewTimeline: '100 working days (Priority Review); 50 working days (Accelerated Approval drugs)',
    expeditedPathways: [
      {
        name: 'Priority Review (MFDS)',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Drug with significant clinical improvement for serious condition',
          'First domestic application for orphan drug',
          'Drug designated as breakthrough therapy by foreign authority (FDA, EMA)',
        ],
        benefits: ['100 working days review target vs. 120 standard'],
      },
      {
        name: 'Conditional Approval (Korea)',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Serious or life-threatening condition with limited treatment options',
          'Surrogate endpoint or clinical data suggesting benefit',
          'Benefit of early availability outweighs risk of incomplete data',
        ],
        benefits: ['Earlier approval based on preliminary data', 'Conditional marketing permitted'],
      },
      {
        name: 'Fast Track Designation (Korea)',
        equivalent: 'FDA Fast Track',
        criteria: [
          'Innovative drug for serious condition',
          'Potential to address unmet medical need',
          'First-in-class mechanism of action',
        ],
        benefits: ['Pre-review consultation', 'Rolling submission permitted', 'Expedited review'],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Designation (Korea)',
      prevalenceThreshold: '<20,000 patients in South Korea',
      exclusivityPeriod: '6 years data exclusivity for orphan drugs',
      otherBenefits: [
        'Fee waivers for regulatory review',
        'Priority review designation',
        'Tax incentives for R&D',
        'National Health Insurance (NHI) listing support',
        'Government subsidies for clinical development',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Approval (MFDS)',
      criteria: [
        'Serious or life-threatening condition',
        'No adequate alternative treatment',
        'Expected clinical benefit based on available data',
        'Sponsor commitment to post-marketing studies',
      ],
      postApprovalRequirements: [
        'Post-marketing confirmatory clinical studies',
        'Periodic safety reports',
        'Re-evaluation upon receipt of confirmatory data',
        'Approval may be revoked if confirmatory data does not support benefit-risk',
      ],
    },
    dataRequirementsDifferences: [
      'CTD format required (ICH member since 2016)',
      'Korean bridging study may be required per ICH E5',
      'MFDS encourages inclusion of Korean patients in global MRCTs',
      'Korean labeling in Korean language required',
      'Bio-creep concerns for multiple generic submissions',
      'Project Orbis participation for oncology drugs — simultaneous review with FDA and other agencies',
    ],
    gmpInspectionRequirements: [
      'MFDS GMP inspection required for manufacturing sites',
      'Korea PIC/S member — mutual recognition of GMP inspections from PIC/S members',
      'Pre-approval inspection within review period',
      'GMP certificate renewal every 3 years',
    ],
    referencePricingHTA: [
      'Health Insurance Review and Assessment Service (HIRA) — drug pricing and reimbursement',
      'Positive HTA assessment required for NHI listing',
      'A-7 reference pricing system: price set based on average of 7 comparator countries',
      'Risk-sharing agreements (RSAs) increasingly used for high-cost drugs',
      'Managed Entry Agreements (MEAs) for innovative drugs with uncertain long-term value',
      'Pharmacoeconomic evaluation required for all new drugs seeking NHI listing',
    ],
  },
};

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
  const {
    indication,
    unmetMedicalNeedDescription,
    availableTherapyLandscape,
    evidenceLevel,
    productType,
  } = params;

  const isSeriousOrLifeThreatening = indication === 'serious' || indication === 'life_threatening';
  const hasUnmetNeed = availableTherapyLandscape !== 'adequate_existing_therapy';
  const hasClinicalEvidence = evidenceLevel !== 'preclinical_only';
  const isRegenerativeMedicine =
    productType === 'cell_therapy' ||
    productType === 'gene_therapy' ||
    productType === 'tissue_engineered';

  const assessments: ProgramEligibility[] = [];

  // Fast Track
  const ftDef = EXPEDITED_PROGRAM_REGISTRY.fast_track;
  const ftEligible = isSeriousOrLifeThreatening && hasUnmetNeed;
  const ftRationale: string[] = [];
  if (!isSeriousOrLifeThreatening) {
    ftRationale.push('Product does not target a serious or life-threatening condition — fundamental eligibility criterion not met.');
  } else {
    ftRationale.push('Product targets a ' + indication.replace('_', '-') + ' condition — meets serious condition criterion.');
  }
  if (!hasUnmetNeed) {
    ftRationale.push('Adequate existing therapy available — unmet medical need criterion not satisfied.');
  } else {
    ftRationale.push(
      'Therapy landscape: ' + availableTherapyLandscape.replace(/_/g, ' ') +
      '. Unmet medical need rationale: ' + unmetMedicalNeedDescription,
    );
  }
  assessments.push({
    programName: 'fast_track',
    displayName: ftDef.displayName,
    eligible: ftEligible,
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
  const btEligible = isSeriousOrLifeThreatening && hasClinicalEvidence && hasSubstantialImprovementEvidence;
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
  assessments.push({
    programName: 'breakthrough_therapy',
    displayName: btDef.displayName,
    eligible: btEligible,
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
  const aaEligible = isSeriousOrLifeThreatening && hasUnmetNeed;
  const aaRationale: string[] = [];
  if (!isSeriousOrLifeThreatening) {
    aaRationale.push('Product does not target a serious or life-threatening condition.');
  } else {
    aaRationale.push('Serious/life-threatening condition criterion met.');
  }
  if (!hasUnmetNeed) {
    aaRationale.push('Adequate existing therapy available — unmet medical need criterion not met.');
  } else {
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
  assessments.push({
    programName: 'accelerated_approval',
    displayName: aaDef.displayName,
    eligible: aaEligible,
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
  const prEligible = isSeriousOrLifeThreatening && hasUnmetNeed;
  const prRationale: string[] = [];
  if (!isSeriousOrLifeThreatening) {
    prRationale.push('Product does not target a serious condition — Priority Review eligibility requires significant improvement for a serious condition.');
  } else {
    prRationale.push('Targets a serious condition — potentially eligible for Priority Review.');
  }
  if (hasUnmetNeed) {
    prRationale.push('Product addresses an unmet medical need, supporting the "significant improvement" criterion for Priority Review.');
  } else {
    prRationale.push(
      'Adequate existing therapy available. Priority Review may still be granted if the product demonstrates ' +
      'a significant improvement in safety or effectiveness over available therapy.',
    );
  }
  prRationale.push('Priority Review is determined at the time of NDA/BLA filing and is based on the totality of evidence in the submission.');
  assessments.push({
    programName: 'priority_review',
    displayName: prDef.displayName,
    eligible: prEligible,
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
  const rmatEligible = isRegenerativeMedicine && isSeriousOrLifeThreatening && hasClinicalEvidence;
  const rmatRationale: string[] = [];
  if (!isRegenerativeMedicine) {
    rmatRationale.push(
      'Product type "' + productType +
      '" does not qualify as a regenerative medicine therapy. RMAT designation is limited to ' +
      'cell therapy, gene therapy, tissue engineering products, and their combinations.',
    );
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
  assessments.push({
    programName: 'rmat',
    displayName: rmatDef.displayName,
    eligible: rmatEligible,
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
  const eligiblePrograms = assessments.filter(a => a.eligible);
  if (eligiblePrograms.length === 0) {
    strategicRecommendations.push(
      'No expedited programs appear eligible based on current parameters. ' +
      'Consider whether the product targets a serious condition and addresses an unmet medical need.',
    );
  } else {
    strategicRecommendations.push(
      'Eligible for ' + eligiblePrograms.length + ' expedited program(s): ' +
      eligiblePrograms.map(p => p.displayName).join(', ') + '.',
    );
  }

  if (ftEligible && btEligible) {
    strategicRecommendations.push(
      'Consider applying for Breakthrough Therapy Designation first — it includes all Fast Track benefits ' +
      'plus intensive FDA guidance. If BT is denied, Fast Track can be requested as a fallback.',
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

  if (aaEligible) {
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
  const { developmentPhase, purpose, productType, questionsToDiscuss } = params;

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

function getSubmissionTiming(purpose: MeetingPurpose, phase: DevelopmentPhase): string {
  switch (purpose) {
    case 'pre_ind':
      return 'Submit meeting request 2-3 months before planned IND submission to allow time for scheduling and FDA response.';
    case 'eop1':
      return 'Submit meeting request upon availability of Phase 1 data, typically 1-2 months before planned Phase 2 initiation.';
    case 'eop2':
      return 'Submit meeting request 2-4 months before planned Phase 3 initiation. EOP2 is the most strategically important meeting — allow adequate time for preparation.';
    case 'pre_phase3':
      return 'Submit meeting request 2-3 months before planned Phase 3 protocol finalization.';
    case 'pre_nda_bla':
      return 'Submit meeting request at least 6 months before planned NDA/BLA submission to allow for filing format discussions and resolution of any outstanding issues.';
    case 'type_a_urgent':
      return 'Submit as soon as the urgent issue is identified. Type A meetings have 30-day scheduling targets.';
    case 'dispute_resolution':
      return 'Submit after exhausting informal dispute resolution at the review division level. Formal dispute follows MAPP 4151.7 procedures.';
    case 'pre_submission_505b2':
      return 'Submit meeting request 3-6 months before planned 505(b)(2) submission to discuss clinical bridging strategy and data requirements.';
    case 'pre_submission_anda':
      return 'Submit meeting request 3-6 months before planned ANDA submission per GDUFA III pre-ANDA meeting goals.';
    default:
      return 'Submit meeting request at the appropriate development milestone. Allow 75 calendar days for Type B/C scheduling.';
  }
}

function getTimingRecommendations(purpose: MeetingPurpose, phase: DevelopmentPhase): string[] {
  const common: string[] = [
    'Begin briefing document preparation at least 6 weeks before the meeting to allow for internal review and revision',
    'Conduct a mock meeting or dry run 1-2 weeks before the actual FDA meeting',
    'Identify and prepare the lead spokesperson for each question area',
  ];

  switch (purpose) {
    case 'pre_ind':
      return [
        ...common,
        'Pre-IND meeting should occur 2-3 months before planned IND submission',
        'Key topics: overall nonclinical plan adequacy, first-in-human dose selection rationale, Phase 1 design',
        'Use this meeting to identify any deal-breaking FDA concerns before investing in IND-enabling studies',
        'For novel mechanisms: discuss biomarker strategy, patient selection, and dose escalation scheme',
      ];
    case 'eop2':
      return [
        ...common,
        'EOP2 is the single most important meeting in drug development — invest heavily in preparation',
        'Request meeting 2-4 months before planned Phase 3 initiation',
        'Key topics: pivotal trial design, primary endpoint, statistical analysis plan, patient population, adequacy of safety database',
        'Come with a clearly articulated proposed Phase 3 plan and ask FDA to agree or propose modifications',
        'Discuss regulatory pathway (standard vs. accelerated) and any expedited program designations',
        'If accelerated approval is contemplated, discuss the proposed surrogate/intermediate endpoint',
        'Include proposed label claims and their evidentiary basis',
      ];
    case 'pre_nda_bla':
      return [
        ...common,
        'Schedule pre-NDA/BLA meeting at least 6 months before planned submission',
        'Key topics: submission format, eCTD structure, data presentation, any outstanding study issues',
        'Discuss proposed product labeling and prescribing information',
        'Confirm the filing checklist and any division-specific requirements',
        'Address any outstanding safety signals or risk management strategies',
        'Discuss the need for Advisory Committee meeting',
        'Confirm the anticipated review timeline (Priority vs. Standard)',
      ];
    case 'type_a_urgent':
      return [
        ...common,
        'Type A meetings have 30-day scheduling targets — prepare quickly',
        'For clinical holds: focus on the specific hold issue and proposed resolution',
        'For Complete Response Letter follow-up: address each deficiency clearly',
        'Bring proposed resolution for each issue with supporting data',
      ];
    default:
      return [
        ...common,
        'Allow appropriate lead time for meeting scheduling and preparation',
        'Focus questions on the most critical decision points in the development program',
      ];
  }
}

function getPracticalAdvice(purpose: MeetingPurpose, productType: ProductType): string[] {
  const general: string[] = [
    'Designate a single point of contact for all FDA communications',
    'Keep the meeting team small and focused — typically 5-8 people from the sponsor',
    'The most senior scientific/medical person should lead the discussion',
    'Listen more than talk — the goal is to understand FDA thinking, not to convince them',
    'Take detailed notes — the official minutes are the legally binding record',
    'Do not introduce new data or topics at the meeting that were not in the briefing document',
    'If FDA raises unexpected concerns, acknowledge them and request time to respond rather than arguing',
    'Follow up on all action items within the agreed timeline',
  ];

  const productSpecific: string[] = [];
  switch (productType) {
    case 'biologic':
    case 'cell_therapy':
    case 'gene_therapy':
    case 'tissue_engineered':
      productSpecific.push(
        'For biologics and advanced therapies, CBER meetings may have different procedures than CDER — confirm with the relevant division',
        'Discuss manufacturing comparability strategy if process changes are anticipated',
        'For cell/gene therapy: confirm long-term follow-up expectations (15 years for integrating vectors per FDA LTFU Guidance)',
      );
      break;
    case 'biosimilar':
      productSpecific.push(
        'For biosimilar meetings, discuss the analytical similarity assessment plan and its impact on clinical study requirements',
        'Confirm the reference product and any cross-referencing arrangements',
      );
      break;
    case 'combination_product':
      productSpecific.push(
        'For combination products, confirm the lead center (CDER, CBER, or CDRH) assignment',
        'Discuss the product classification and applicable regulatory pathway (PMA, 510(k), NDA, BLA)',
      );
      break;
    default:
      break;
  }

  return [...general, ...productSpecific];
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
  const {
    diseasePrevalenceUS,
    diseasePrevalenceEU,
    clinicalRationale,
    productType,
    existingApprovedTherapies,
    isSerious,
    isLifeThreatening,
    isDebilitating,
  } = params;

  // FDA Assessment
  const fdaPrevalenceMet = diseasePrevalenceUS !== null && diseasePrevalenceUS < FDA_ORPHAN_PREVALENCE_THRESHOLD;
  const fdaEligible = fdaPrevalenceMet;

  const fdaCriteria: string[] = [
    'Disease or condition affects fewer than 200,000 persons in the United States, OR',
    'There is no reasonable expectation that the cost of developing and making available the drug will be recovered from sales in the US',
    'No requirement for the disease to be "serious" — any disease with <200,000 prevalence qualifies',
  ];

  const fdaRationale: string[] = [];
  if (diseasePrevalenceUS === null) {
    fdaRationale.push('US prevalence data not provided — cannot assess FDA orphan eligibility.');
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
    criteria: fdaCriteria,
    rationale: fdaRationale,
    applicationProcess: fdaProcess,
    reviewTimeline: 'Approximately 90 days from receipt of complete application',
  };

  // EMA Assessment
  const emaPrevalencePerTenK = diseasePrevalenceEU !== null
    ? diseasePrevalenceEU
    : null;
  const emaPrevalenceMet = emaPrevalencePerTenK !== null && emaPrevalencePerTenK < EMA_ORPHAN_PREVALENCE_THRESHOLD;
  const emaSeriousCondition = isSerious || isLifeThreatening || isDebilitating;
  const emaNoSatisfactoryTreatment = existingApprovedTherapies === 0;
  const emaSignificantBenefit = existingApprovedTherapies > 0 && clinicalRationale.length > 0;
  const emaEligible = emaPrevalenceMet && emaSeriousCondition && (emaNoSatisfactoryTreatment || emaSignificantBenefit);

  const emaCriteria: string[] = [
    'Prevalence of the condition in the EU must not exceed 5 in 10,000 (approximately 250,000 persons in the EU)',
    'The condition must be life-threatening, seriously debilitating, or serious and chronic',
    'No satisfactory method of diagnosis, prevention, or treatment authorized in the EU, OR',
    'If satisfactory treatment exists, the product must provide significant benefit to those affected',
  ];

  const emaRationale: string[] = [];
  if (emaPrevalencePerTenK === null) {
    emaRationale.push('EU prevalence data not provided — cannot assess EMA orphan eligibility.');
  } else if (emaPrevalenceMet) {
    emaRationale.push(
      'EU prevalence of ' + emaPrevalencePerTenK +
      ' per 10,000 is below the 5 per 10,000 threshold — meets EMA orphan prevalence criterion.',
    );
  } else {
    emaRationale.push(
      'EU prevalence of ' + emaPrevalencePerTenK +
      ' per 10,000 exceeds the 5 per 10,000 threshold — EMA orphan designation NOT met on prevalence grounds.',
    );
  }
  if (!emaSeriousCondition) {
    emaRationale.push('Disease does not meet the "life-threatening, seriously debilitating, or serious and chronic" criterion.');
  } else {
    emaRationale.push('Disease meets the serious condition criterion (serious: ' + isSerious + ', life-threatening: ' + isLifeThreatening + ', debilitating: ' + isDebilitating + ').');
  }
  if (emaNoSatisfactoryTreatment) {
    emaRationale.push('No existing approved therapies — "no satisfactory method of treatment" criterion met.');
  } else if (emaSignificantBenefit) {
    emaRationale.push(
      existingApprovedTherapies + ' existing approved therapies available. ' +
      'EMA orphan designation requires demonstration of "significant benefit" over existing treatment. ' +
      'Clinical rationale provided: ' + clinicalRationale,
    );
  } else {
    emaRationale.push(
      existingApprovedTherapies + ' existing approved therapies available and no significant benefit rationale provided.',
    );
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
export function select505Pathway(params: Select505PathwayParams): Select505PathwayResult {
  const {
    activeIngredient,
    dosageFormChange,
    routeChange,
    indicationChange,
    newCombination,
    formulationInnovation,
    availableRLD,
  } = params;

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

  const recommendedDef = PATHWAY_REGISTRY[recommendedPathwayType];
  const recommendedPathway: PathwayRecommendation = {
    pathway: recommendedPathwayType,
    ...recommendedDef,
  };

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
  const { expeditedDesignationStatus, productType, estimatedModuleCompletionDates } = params;

  const { fastTrack, breakthroughTherapy, rmat } = expeditedDesignationStatus;

  const eligible = fastTrack || breakthroughTherapy || rmat;

  const eligibilityRationale: string[] = [];
  if (eligible) {
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
  const { productType, indication, targetMarkets } = params;

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
