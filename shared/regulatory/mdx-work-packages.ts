/**
 * Regulatory work packages — MDX-PM-01.
 *
 * A work package is the unit a regulatory programme is actually managed in:
 * "Analytical performance", "Clinical performance", "Usability", "Labeling and
 * IFU". It is bigger than a task and smaller than a filing. It owns a set of
 * studies, produces a set of documents, requires a set of decisions, and lands in
 * named sections of one or more filings.
 *
 * This module is the PURE registry of which packages a programme of a given MDX
 * specialization has. It exists so the EXISTING Projects cockpit can present the
 * right plan for the project in front of it, rather than a second Projects
 * destination existing for device work. Nothing here touches navigation: the left
 * rail is fixed, and these presets only change what the Projects module offers
 * inside itself. Outside MDX the registry returns nothing and the cockpit renders
 * exactly what it renders today.
 *
 * Three commitments, because they are what make this safe to build a plan on:
 *
 *   1. REQUIRED and CONDITIONAL are kept apart. Whether a device contains
 *      software, is patient-contacting, is supplied sterile, or is claiming a CLIA
 *      waiver are facts a specialization CANNOT decide. Those packages are
 *      returned as conditional with the condition stated, so the surface asks
 *      instead of putting a biocompatibility programme on an app's plan.
 *   2. Nothing here asserts a schedule, a duration or a sample size. A work
 *      package says what has to exist and what has to be decided; how long it
 *      takes is a property of a specific programme, and a fabricated duration on
 *      a regulatory timeline is worse than an absent one.
 *   3. Where the registry does not model something, it says so —
 *      REGISTRY_LIMITS is exported and rendered, not buried in a comment.
 *
 * Deliverables and decisions are named at the level a reviewer would recognize.
 * The registry does NOT claim the list is jurisdictionally complete for any given
 * product; it claims these are the packages a programme of this kind is normally
 * managed in. Completeness for a specific filing is the regulatory lead's call.
 *
 * @module shared/regulatory/mdx-work-packages
 */

import {
  specializationPreset, isMdxSpecialization, INDUSTRY_DETERMINES_VERTICAL,
  type MdxSpecialization, type MdxStudyType, type MdxFilingType, type PrimaryIndustry,
} from './mdx-specialization';
import { type LifecyclePhase, lifecyclePhaseRank } from './mdx-lifecycle';

/** Bump on any content change, so a generated plan can cite its source. */
export const WORK_PACKAGE_REGISTRY_VERSION = '2026.07.1';

export const WORK_PACKAGE_IDS = [
  'regulatory_strategy',
  'design_controls_and_risk',
  'scientific_validity',
  'analytical_performance',
  'stability',
  'clinical_performance_ivd',
  'clia_waiver',
  'cdx_coordination',
  'clinical_investigation',
  'usability_human_factors',
  'software_lifecycle',
  'biocompatibility_and_sterilization',
  'verification_and_validation',
  'labeling_and_ifu',
  'qms_and_technical_documentation',
  'submission_assembly',
  'authority_interactions',
  'postmarket_surveillance',
  'pmcf_pmpf',
] as const;
export type WorkPackageId = (typeof WORK_PACKAGE_IDS)[number];

export interface WorkPackage {
  id: WorkPackageId;
  label: string;
  /** Where the package sits in the lifecycle. Drives ordering on the plan. */
  lifecyclePhase: LifecyclePhase;
  /** One sentence: what this package is FOR. */
  purpose: string;
  /**
   * Study archetypes whose results are this package's evidence. Ids match
   * shared/regulatory/mdx-study-archetypes.ts, so a plan can link straight to a
   * protocol rather than naming a study the Study Design Center cannot open.
   */
  studyArchetypes: MdxStudyType[];
  /** Documents the package has to produce. */
  deliverables: string[];
  /**
   * Decisions that have to be made and recorded. These are the reason the cockpit
   * has a Decisions section: a regulatory programme is a chain of defended
   * choices, and the defence is what an authority asks for.
   */
  decisions: string[];
  /** Filing types whose evidence this package feeds. */
  supportsFilings: MdxFilingType[];
  /** Sections of those filings the package lands in, where they have stable names. */
  filingSections: string[];
  /** Standards and guidance a reviewer expects the package to reflect. */
  references: string[];
  /** True when completion normally needs a signed approval before filing use. */
  approvalRequired: boolean;
  /** Packages that normally have to be substantially settled first. */
  dependsOn: WorkPackageId[];
  /**
   * The condition under which this package applies, for packages a specialization
   * cannot decide on its own. Null for packages every programme of the
   * specialization has. Non-null means: ASK, do not assume.
   */
  appliesWhen: string | null;
}

// ── Filing groups, named once ────────────────────────────────────────────────

const DEVICE_FILINGS: MdxFilingType[] = [
  'us_510k', 'de_novo', 'pma', 'pma_supplement', 'eu_mdr_technical_documentation',
];
const IVD_FILINGS: MdxFilingType[] = [
  'ivd_510k', 'dual_510k_clia_waiver', 'de_novo_ivd', 'pma_cdx',
  'eu_ivdr_technical_documentation', 'performance_evaluation_report',
];
const ALL_FILINGS: MdxFilingType[] = [...DEVICE_FILINGS, ...IVD_FILINGS];

// ── The registry ─────────────────────────────────────────────────────────────

const PACKAGES: Record<WorkPackageId, WorkPackage> = {
  regulatory_strategy: {
    id: 'regulatory_strategy',
    label: 'Regulatory strategy',
    lifecyclePhase: 'strategy',
    purpose:
      'Fix the intended use, the classification and the route to market in each target region, '
      + 'because every downstream evidence decision is justified against them.',
    studyArchetypes: [],
    deliverables: [
      'Intended use and indications-for-use statement',
      'Classification rationale per market',
      'Regulatory strategy memo',
      'Predicate or equivalent-product rationale, where the route depends on one',
      'Pre-submission or scientific-advice briefing package, where one is sought',
    ],
    decisions: [
      'What is the intended use, and what claim is being made?',
      'What is the classification in each target market, and on what rule?',
      'Which route applies per market, and what evidence does that route require?',
      'Is a pre-submission or Notified Body consultation needed before evidence is generated?',
    ],
    supportsFilings: ['q_submission', 'section_513g', ...ALL_FILINGS],
    filingSections: ['Indications for use', 'Device description', 'Substantial equivalence discussion'],
    references: [
      '21 CFR 807 subpart E', '21 CFR 860', 'FDA Q-Submission Program guidance',
      'EU MDR 2017/745 Annex VIII', 'EU IVDR 2017/746 Annex VIII',
    ],
    approvalRequired: true,
    dependsOn: [],
    appliesWhen: null,
  },

  design_controls_and_risk: {
    id: 'design_controls_and_risk',
    label: 'Design controls and risk management',
    lifecyclePhase: 'design',
    purpose:
      'Establish the design inputs and the risk file the rest of the programme is verified against, '
      + 'so evidence can be traced to a requirement rather than collected and then rationalized.',
    studyArchetypes: [],
    deliverables: [
      'Design and development plan',
      'Design inputs and requirements specification',
      'Risk management plan',
      'Risk management file and report',
      'Design traceability matrix',
    ],
    decisions: [
      'Which requirements are design inputs, and which are claims requiring clinical evidence?',
      'What risk acceptability criteria apply, and who approved them?',
      'Which risk controls are verified by test, and which by labeling or training?',
    ],
    supportsFilings: ALL_FILINGS,
    filingSections: ['Risk analysis', 'Design controls summary'],
    references: ['ISO 14971', 'ISO 13485', '21 CFR 820.30', 'ISO/TR 24971'],
    approvalRequired: true,
    dependsOn: ['regulatory_strategy'],
    appliesWhen: null,
  },

  scientific_validity: {
    id: 'scientific_validity',
    label: 'Scientific validity',
    lifecyclePhase: 'strategy',
    purpose:
      'Establish that the analyte is associated with the clinical condition claimed, which is a '
      + 'separate pillar of IVD performance from analytical and clinical performance and is '
      + 'evidenced from literature rather than generated.',
    studyArchetypes: ['scientific_validity'],
    deliverables: [
      'Scientific validity report',
      'Literature search protocol and search record',
      'State-of-the-art summary',
    ],
    decisions: [
      'What is the claimed association between the analyte and the clinical condition?',
      'Is the association established in the literature, or does it need to be demonstrated?',
      'What search strategy makes the literature review reproducible for a reviewer?',
    ],
    supportsFilings: IVD_FILINGS,
    filingSections: ['Scientific validity', 'Performance evaluation report — scientific validity'],
    references: ['EU IVDR 2017/746 Annex XIII Part A', 'MDCG 2022-2'],
    approvalRequired: true,
    dependsOn: ['regulatory_strategy'],
    appliesWhen: null,
  },

  analytical_performance: {
    id: 'analytical_performance',
    label: 'Analytical performance',
    lifecyclePhase: 'verification',
    purpose:
      'Characterize the measurement itself — how precisely, how low, over what range and against '
      + 'what interferents it measures — independently of what the result means clinically.',
    studyArchetypes: [
      'precision', 'reproducibility', 'lob_lod_loq', 'linearity_measuring_range',
      'analytical_specificity', 'interference', 'cross_reactivity', 'carryover',
      'matrix_equivalence',
    ],
    deliverables: [
      'Analytical performance study protocols',
      'Analytical performance study reports',
      'Analytical performance summary',
      'Traceability and calibration documentation',
    ],
    decisions: [
      'What is the medical decision point, and which performance is characterized around it?',
      'How is each acceptance criterion justified against the intended use?',
      'Which specimen types and matrices are claimed, and which are excluded?',
      'How many lots, instruments, sites and operators make the estimate representative?',
    ],
    supportsFilings: IVD_FILINGS,
    filingSections: ['Analytical performance', 'Performance evaluation report — analytical performance'],
    references: [
      'CLSI EP05-A3', 'CLSI EP17-A2', 'CLSI EP06', 'CLSI EP07', 'CLSI EP25',
      'EU IVDR 2017/746 Annex I §9.1(a)',
    ],
    approvalRequired: true,
    dependsOn: ['design_controls_and_risk'],
    appliesWhen: null,
  },

  stability: {
    id: 'stability',
    label: 'Stability and shelf life',
    lifecyclePhase: 'verification',
    purpose:
      'Establish the claims printed on the box and the insert: shelf life, in-use and on-board '
      + 'stability, shipping conditions, and how long a specimen may be held before testing.',
    studyArchetypes: ['specimen_stability', 'reagent_stability'],
    deliverables: [
      'Stability study protocol and reports',
      'Shelf-life claim justification',
      'Specimen handling and storage claims',
      'Shipping and transport simulation report',
    ],
    decisions: [
      'What shelf life is claimed, and is it supported by real-time or accelerated data?',
      'What in-use, on-board and open-vial claims are made?',
      'What specimen storage conditions and hold times are claimed?',
    ],
    supportsFilings: IVD_FILINGS,
    filingSections: ['Analytical performance — stability', 'Labeling — storage and handling'],
    references: ['CLSI EP25', 'EU IVDR 2017/746 Annex I §9.1(a)', 'ASTM D4169 for transport simulation'],
    approvalRequired: true,
    dependsOn: ['analytical_performance'],
    appliesWhen: null,
  },

  clinical_performance_ivd: {
    id: 'clinical_performance_ivd',
    label: 'Clinical performance',
    lifecyclePhase: 'clinical_performance_evidence',
    purpose:
      'Establish what the result means for a patient — agreement against a comparator, or '
      + 'sensitivity and specificity against a clinical reference standard. These are different '
      + 'claims and the distinction is load-bearing.',
    studyArchetypes: [
      'ppa_npa_opa', 'clinical_sensitivity_specificity', 'roc_cutoff',
      'prospective_clinical_performance', 'retrospective_specimen',
    ],
    deliverables: [
      'Clinical performance study protocol',
      'Clinical performance study report',
      'Performance evaluation report (EU)',
      'Clinical evidence summary',
    ],
    decisions: [
      'Is the comparator a clinical reference standard (supporting sensitivity and '
      + 'specificity), or another test (supporting agreement only)?',
      'Is the specimen set prospective, or banked — and how is selection bias addressed?',
      'What is the cutoff, and was it locked before the validation set was analysed?',
      'What prevalence is assumed in any predictive-value claim?',
    ],
    supportsFilings: [...IVD_FILINGS, 'performance_study'],
    filingSections: ['Clinical performance', 'Performance evaluation report — clinical performance'],
    references: [
      'CLSI EP12-A2', 'CLSI EP24-A2', 'FDA guidance on reporting results from studies '
      + 'evaluating diagnostic tests', 'EU IVDR 2017/746 Annex XIII Part A',
    ],
    approvalRequired: true,
    dependsOn: ['analytical_performance', 'scientific_validity'],
    appliesWhen: null,
  },

  clia_waiver: {
    id: 'clia_waiver',
    label: 'CLIA waiver evidence',
    lifecyclePhase: 'clinical_performance_evidence',
    purpose:
      'Support a waived-complexity claim: that an untrained operator in a non-laboratory setting '
      + 'gets the same answer, and that the assay tolerates the errors such an operator makes.',
    studyArchetypes: ['lay_user', 'untrained_operator', 'clia_waiver_flex'],
    deliverables: [
      'Flex (robustness) studies report',
      'Lay-user or untrained-operator study report',
      'Failure-alert and fail-safe mechanism description',
      'CLIA waiver section of the submission',
    ],
    decisions: [
      'Which stress conditions are exercised, and what tolerance is claimed for each?',
      'Who are the intended untrained operators, and how is that population recruited?',
      'What failure alerts exist, and what does the operator do when one fires?',
    ],
    supportsFilings: ['dual_510k_clia_waiver'],
    filingSections: ['CLIA waiver — flex studies', 'CLIA waiver — untrained user study'],
    references: [
      'FDA guidance: Recommendations for Clinical Laboratory Improvement Amendments of 1988 '
      + '(CLIA) Waiver Applications',
      'FDA Dual 510(k) and CLIA Waiver by Application Studies guidance',
    ],
    approvalRequired: true,
    dependsOn: ['clinical_performance_ivd'],
    appliesWhen:
      'A waived-complexity claim is being made. A professional-use-only assay does not carry '
      + 'this package.',
  },

  cdx_coordination: {
    id: 'cdx_coordination',
    label: 'Companion diagnostic coordination',
    lifecyclePhase: 'clinical_performance_evidence',
    purpose:
      'Tie the assay to the therapeutic it selects for: bridge the clinical trial assay to the '
      + 'market-ready assay, and keep the diagnostic and drug review timelines aligned.',
    studyArchetypes: ['cdx_concordance'],
    deliverables: [
      'Clinical-trial-assay to market-assay bridging study report',
      'Concordance analysis report',
      'Coordinated review plan with the therapeutic sponsor',
      'Co-labeling text agreed with the therapeutic sponsor',
    ],
    decisions: [
      'Which trial specimens are available for bridging, and are they representative of the '
      + 'enrolled population?',
      'What concordance is required for the drug efficacy conclusion to transfer to the '
      + 'market assay?',
      'How are discordant cases adjudicated, and by whom?',
      'What are the drug programme milestones the diagnostic timeline must meet?',
    ],
    supportsFilings: ['pma_cdx', 'pma', 'pma_supplement'],
    filingSections: ['Clinical performance — bridging', 'Co-labeling'],
    references: [
      'FDA guidance: In Vitro Companion Diagnostic Devices',
      'FDA guidance: Developing and Labeling In Vitro Companion Diagnostic Devices for a '
      + 'Specific Group of Oncology Therapeutic Products',
    ],
    approvalRequired: true,
    dependsOn: ['clinical_performance_ivd'],
    appliesWhen: null,
  },

  clinical_investigation: {
    id: 'clinical_investigation',
    label: 'Clinical investigation',
    lifecyclePhase: 'clinical_performance_evidence',
    purpose:
      'Generate clinical evidence of safety and performance in human subjects where the '
      + 'benefit-risk conclusion cannot be reached from bench, animal and literature evidence.',
    studyArchetypes: [
      'feasibility', 'early_feasibility', 'pivotal_clinical_investigation',
      'comparative_device_study',
    ],
    deliverables: [
      'Clinical investigation plan',
      'Investigator brochure',
      'Clinical study report',
      'Clinical evaluation report',
      'IDE application, where the investigation is significant risk',
    ],
    decisions: [
      'Can the benefit-risk conclusion be reached without a clinical investigation?',
      'What is the primary endpoint, and is the comparison against a control or a performance goal?',
      'Is the investigation significant risk, and what approvals does that require?',
      'What is the clinical evidence gap this investigation exists to close?',
    ],
    supportsFilings: ['ide', ...DEVICE_FILINGS, 'cer'],
    filingSections: ['Clinical evidence', 'Clinical evaluation report', 'Benefit-risk determination'],
    references: ['ISO 14155', '21 CFR 812', 'EU MDR 2017/745 Annex XIV and Annex XV', 'MDCG 2020-6'],
    approvalRequired: true,
    dependsOn: ['design_controls_and_risk'],
    appliesWhen:
      'The evidence gap cannot be closed from bench, animal and literature evidence. Many '
      + '510(k) programmes carry no clinical investigation at all.',
  },

  usability_human_factors: {
    id: 'usability_human_factors',
    label: 'Usability and human factors',
    lifecyclePhase: 'verification',
    purpose:
      'Show that the people who will use the product can use it correctly and safely, and that '
      + 'use-related hazards have been controlled by design rather than by instructions.',
    studyArchetypes: ['human_factors_formative', 'human_factors_validation'],
    deliverables: [
      'Use specification and user profiles',
      'Use-related risk analysis',
      'Formative evaluation reports',
      'Human factors validation protocol and report',
      'Usability engineering file',
    ],
    decisions: [
      'Who are the intended users, and in what use environment?',
      'Which use errors are hazard-related, and which are inconvenience?',
      'Is a summative validation study required, or does the use-related risk analysis '
      + 'support a lighter conclusion?',
      'For each residual use error: is it controlled by design, or only by labeling and training?',
    ],
    supportsFilings: ALL_FILINGS,
    filingSections: ['Human factors', 'Usability engineering', 'Risk analysis — use-related risk'],
    references: [
      'IEC 62366-1', 'FDA guidance: Applying Human Factors and Usability Engineering to '
      + 'Medical Devices', 'EU MDR 2017/745 Annex I §5', 'EU IVDR 2017/746 Annex I §5',
    ],
    approvalRequired: true,
    dependsOn: ['design_controls_and_risk'],
    appliesWhen: null,
  },

  software_lifecycle: {
    id: 'software_lifecycle',
    label: 'Software lifecycle and cybersecurity',
    lifecyclePhase: 'verification',
    purpose:
      'Produce the software documentation a reviewer expects for the safety class claimed, '
      + 'including the security posture of a connected product.',
    studyArchetypes: ['software_clinical_validation'],
    deliverables: [
      'Software development and maintenance plan',
      'Software requirements and architecture description',
      'Software verification and validation reports',
      'Software safety classification rationale',
      'Cybersecurity risk assessment and software bill of materials',
      'Predetermined change control plan, where adaptive changes are planned',
    ],
    decisions: [
      'What is the software safety class, and what documentation level does that require?',
      'Which off-the-shelf and open-source components are used, and how are they maintained?',
      'Is any model or algorithm subject to change after clearance, and under what plan?',
      'What is the update mechanism, and how are security patches delivered?',
    ],
    supportsFilings: ALL_FILINGS,
    filingSections: ['Software documentation', 'Cybersecurity'],
    references: [
      'IEC 62304', 'IEC 81001-5-1',
      'FDA guidance: Content of Premarket Submissions for Device Software Functions',
      'FDA guidance: Cybersecurity in Medical Devices',
      'FDA guidance: Predetermined Change Control Plans for Machine Learning-Enabled Devices',
    ],
    approvalRequired: true,
    dependsOn: ['design_controls_and_risk'],
    appliesWhen:
      'The product contains software, or is software. A purely mechanical device carries no '
      + 'software documentation.',
  },

  biocompatibility_and_sterilization: {
    id: 'biocompatibility_and_sterilization',
    label: 'Biocompatibility and sterilization',
    lifecyclePhase: 'verification',
    purpose:
      'Establish that patient-contacting materials are safe for the contact type and duration '
      + 'claimed, and that a product supplied sterile reaches its sterility assurance level.',
    studyArchetypes: [],
    deliverables: [
      'Biological evaluation plan and report',
      'Material characterization and extractables data',
      'Sterilization validation report',
      'Packaging and sterile barrier validation report',
      'Endotoxin and residuals testing reports',
    ],
    decisions: [
      'What is the contact type and duration, and which endpoints does that require?',
      'Can existing material data be leveraged, or is testing required?',
      'What sterilization method applies, and what sterility assurance level is claimed?',
    ],
    supportsFilings: DEVICE_FILINGS,
    filingSections: ['Biocompatibility', 'Sterilization and shelf life'],
    references: [
      'ISO 10993-1', 'FDA guidance: Use of ISO 10993-1', 'ISO 11135', 'ISO 11137', 'ISO 11607',
    ],
    approvalRequired: true,
    dependsOn: ['design_controls_and_risk'],
    appliesWhen:
      'The product contacts the patient, or is supplied sterile. Neither is true of software or '
      + 'of most laboratory instruments.',
  },

  verification_and_validation: {
    id: 'verification_and_validation',
    label: 'Design verification and validation',
    lifecyclePhase: 'verification',
    purpose:
      'Demonstrate the product meets its design inputs (verification) and satisfies user needs in '
      + 'the intended use environment (validation) — including the bench and safety testing a '
      + 'reviewer expects for the product type.',
    studyArchetypes: [],
    deliverables: [
      'Verification protocols and reports against each design input',
      'Design validation report',
      'Electrical safety and electromagnetic compatibility reports, where applicable',
      'Performance bench testing reports',
    ],
    decisions: [
      'Which design inputs are verified by test, analysis, inspection, or leveraged data?',
      'Which recognized consensus standards are declared, and in which version?',
      'What constitutes a validation failure, and what happens to the design when one occurs?',
    ],
    supportsFilings: DEVICE_FILINGS,
    filingSections: ['Performance testing — bench', 'Electrical safety and EMC', 'Standards conformity'],
    references: ['21 CFR 820.30(f) and (g)', 'IEC 60601-1', 'IEC 61010-1', 'IEC 60601-1-2'],
    approvalRequired: true,
    dependsOn: ['design_controls_and_risk'],
    appliesWhen: null,
  },

  labeling_and_ifu: {
    id: 'labeling_and_ifu',
    label: 'Labeling and instructions for use',
    lifecyclePhase: 'submission_preparation',
    purpose:
      'Produce the labeling that carries every claim the evidence supports — and no claim it does '
      + 'not. Labeling is where an unsupported claim becomes a regulatory problem.',
    studyArchetypes: [],
    deliverables: [
      'Instructions for use',
      'Package insert, for an IVD',
      'Container and carton labels',
      'Symbols and UDI record',
      'Claim-to-evidence traceability table',
    ],
    decisions: [
      'For each claim in the labeling: which study result supports it?',
      'What limitations and warnings does the evidence require to be stated?',
      'Which languages and market-specific labeling variants are needed?',
      'Does the labeling describe the product as validated, or as intended?',
    ],
    supportsFilings: ALL_FILINGS,
    filingSections: ['Labeling', 'Instructions for use', 'UDI'],
    references: [
      '21 CFR 801', '21 CFR 809.10', 'EU MDR 2017/745 Annex I Chapter III',
      'EU IVDR 2017/746 Annex I Chapter III', 'ISO 15223-1',
    ],
    approvalRequired: true,
    dependsOn: [],
    appliesWhen: null,
  },

  qms_and_technical_documentation: {
    id: 'qms_and_technical_documentation',
    label: 'Quality system and technical documentation',
    lifecyclePhase: 'submission_preparation',
    purpose:
      'Assemble the quality system evidence and the technical documentation set an auditor or '
      + 'Notified Body reviews, as distinct from the premarket submission itself.',
    studyArchetypes: [],
    deliverables: [
      'Technical documentation set per the applicable annex',
      'Design history file index',
      'Quality management system certificate or audit readiness pack',
      'Declaration of conformity, for EU markets',
      'Supplier and manufacturing controls documentation',
    ],
    decisions: [
      'Which conformity assessment route applies, and which annex governs the documentation?',
      'Which Notified Body is engaged, and what is its review timeline?',
      'Which processes require validation, and which are verified per unit?',
    ],
    supportsFilings: ALL_FILINGS,
    filingSections: ['Technical documentation', 'Quality system information'],
    references: [
      'ISO 13485', '21 CFR 820 (Quality Management System Regulation)',
      'EU MDR 2017/745 Annex II and III', 'EU IVDR 2017/746 Annex II and III',
    ],
    approvalRequired: true,
    dependsOn: ['design_controls_and_risk'],
    appliesWhen: null,
  },

  submission_assembly: {
    id: 'submission_assembly',
    label: 'Submission assembly',
    lifecyclePhase: 'submission_preparation',
    purpose:
      'Compile the evidence into the filing format the authority accepts, and confirm it will '
      + 'pass an administrative screen before the substantive review clock starts.',
    studyArchetypes: [],
    deliverables: [
      'Assembled submission in the required format',
      'Refuse-to-accept or completeness checklist, worked through',
      'Executive summary and evidence index',
      'Truthful and accurate statement, and other required certifications',
    ],
    decisions: [
      'Which submission format and template version applies?',
      'Is every claim in the summary traceable to a report in the submission?',
      'What is deliberately NOT included, and why is that defensible?',
    ],
    supportsFilings: ALL_FILINGS,
    filingSections: ['Cover letter', 'Executive summary', 'Table of contents'],
    references: [
      'FDA eSTAR and eCopy guidance', 'FDA Refuse to Accept Policy for 510(k)s',
      'EU MDR/IVDR Annex II documentation structure',
    ],
    approvalRequired: true,
    dependsOn: ['labeling_and_ifu', 'qms_and_technical_documentation'],
    appliesWhen: null,
  },

  authority_interactions: {
    id: 'authority_interactions',
    label: 'Authority interactions',
    lifecyclePhase: 'authority_review',
    purpose:
      'Run the review conversation: track questions, deficiencies and commitments, and keep the '
      + 'record of what was promised to whom.',
    studyArchetypes: [],
    deliverables: [
      'Additional-information and deficiency responses',
      'Meeting requests, agendas and minutes',
      'Commitment register, with the evidence each commitment requires',
      'Review correspondence log',
    ],
    decisions: [
      'Does this question require new data, or a clearer presentation of existing data?',
      'What commitment is being made, and who owns delivering it after approval?',
      'Is a hold requested, or is the response filed within the clock?',
    ],
    supportsFilings: ALL_FILINGS,
    filingSections: ['Interactive review correspondence', 'Deficiency responses'],
    references: [
      'FDA guidance: FDA and Industry Actions on Premarket Notification (510(k)) Submissions',
      'MDCG guidance on Notified Body questions',
    ],
    approvalRequired: false,
    dependsOn: ['submission_assembly'],
    appliesWhen: null,
  },

  postmarket_surveillance: {
    id: 'postmarket_surveillance',
    label: 'Postmarket surveillance',
    lifecyclePhase: 'postmarket',
    purpose:
      'Keep the benefit-risk conclusion current once the product is in use: collect complaints '
      + 'and adverse events, trend them, and report what has to be reported.',
    studyArchetypes: ['registry', 'real_world_evidence', 'postmarket_study'],
    deliverables: [
      'Postmarket surveillance plan',
      'Complaint handling and trending records',
      'Vigilance and adverse-event reports',
      'Periodic safety update report, for EU markets',
      'Postmarket surveillance report',
    ],
    decisions: [
      'What signals are monitored, at what threshold, and who reviews them?',
      'Which events are reportable, in which market, and within what timeframe?',
      'When does a trend become a field safety corrective action?',
    ],
    supportsFilings: ALL_FILINGS,
    filingSections: ['Postmarket surveillance plan', 'PSUR'],
    references: [
      '21 CFR 803', '21 CFR 820.198', 'EU MDR 2017/745 Articles 83-86',
      'EU IVDR 2017/746 Articles 78-81',
    ],
    approvalRequired: true,
    dependsOn: [],
    appliesWhen: null,
  },

  pmcf_pmpf: {
    id: 'pmcf_pmpf',
    label: 'Postmarket clinical or performance follow-up',
    lifecyclePhase: 'postmarket',
    purpose:
      'Proactively generate the postmarket evidence the EU regulations require on a plan, as '
      + 'distinct from reactively collecting complaints.',
    studyArchetypes: ['pmcf', 'pmpf'],
    deliverables: [
      'PMCF or PMPF plan',
      'PMCF or PMPF evaluation report',
      'Updated clinical evaluation or performance evaluation report',
    ],
    decisions: [
      'What residual uncertainty is this follow-up designed to reduce?',
      'What method — registry, survey, study, literature surveillance — answers it?',
      'At what interval is the evaluation report updated?',
      'If no follow-up is planned, what is the documented justification?',
    ],
    supportsFilings: ['pmcf_plan', 'pmpf_plan', 'cer', 'performance_evaluation_report'],
    filingSections: ['PMCF plan', 'PMPF plan', 'Clinical evaluation report — postmarket'],
    references: [
      'EU MDR 2017/745 Annex XIV Part B', 'EU IVDR 2017/746 Annex XIII Part B',
      'MDCG 2020-7', 'MDCG 2020-8',
    ],
    approvalRequired: true,
    dependsOn: ['postmarket_surveillance'],
    appliesWhen:
      'An EU market is in scope. A US-only programme carries postmarket surveillance without a '
      + 'PMCF or PMPF plan.',
  },
};

// ── Which packages a specialization has ──────────────────────────────────────

export interface SpecializationWorkPackages {
  specialization: MdxSpecialization;
  /** Packages every programme of this specialization has. */
  required: WorkPackageId[];
  /**
   * Packages whose applicability depends on a fact the specialization cannot
   * decide. Each carries its condition in `appliesWhen`; the surface asks.
   */
  conditional: WorkPackageId[];
}

const DEVICE_REQUIRED: WorkPackageId[] = [
  'regulatory_strategy', 'design_controls_and_risk', 'verification_and_validation',
  'usability_human_factors', 'labeling_and_ifu', 'qms_and_technical_documentation',
  'submission_assembly', 'authority_interactions', 'postmarket_surveillance',
];

const DEVICE_CONDITIONAL: WorkPackageId[] = [
  'clinical_investigation', 'software_lifecycle', 'biocompatibility_and_sterilization',
  'pmcf_pmpf',
];

const IVD_REQUIRED: WorkPackageId[] = [
  'regulatory_strategy', 'scientific_validity', 'design_controls_and_risk',
  'analytical_performance', 'stability', 'clinical_performance_ivd',
  'usability_human_factors', 'labeling_and_ifu', 'qms_and_technical_documentation',
  'submission_assembly', 'authority_interactions', 'postmarket_surveillance',
];

const IVD_CONDITIONAL: WorkPackageId[] = [
  'clia_waiver', 'software_lifecycle', 'pmcf_pmpf',
];

/** Preserve first-seen order while removing duplicates from a union. */
function unique<T>(ids: T[]): T[] {
  return [...new Set(ids)];
}

const SPECIALIZATION_PACKAGES: Record<MdxSpecialization, SpecializationWorkPackages> = {
  medical_device: {
    specialization: 'medical_device',
    required: DEVICE_REQUIRED,
    conditional: DEVICE_CONDITIONAL,
  },

  ivd_diagnostics: {
    specialization: 'ivd_diagnostics',
    required: IVD_REQUIRED,
    conditional: IVD_CONDITIONAL,
  },

  medical_device_and_ivd: {
    specialization: 'medical_device_and_ivd',
    required: unique([...DEVICE_REQUIRED, ...IVD_REQUIRED]),
    conditional: unique([...DEVICE_CONDITIONAL, ...IVD_CONDITIONAL]),
  },

  software_as_medical_device: {
    specialization: 'software_as_medical_device',
    // Software is required here, not conditional — it is the product. And there is
    // no analytical performance or stability panel: there is no reagent, no
    // specimen and no shelf life.
    required: [
      'regulatory_strategy', 'design_controls_and_risk', 'software_lifecycle',
      'verification_and_validation', 'usability_human_factors', 'labeling_and_ifu',
      'qms_and_technical_documentation', 'submission_assembly', 'authority_interactions',
      'postmarket_surveillance',
    ],
    conditional: ['clinical_investigation', 'pmcf_pmpf'],
  },

  companion_diagnostic: {
    specialization: 'companion_diagnostic',
    // A CDx is an IVD whose claim is tied to a therapeutic, so coordination with
    // the drug programme is not optional for it.
    required: unique([...IVD_REQUIRED, 'cdx_coordination']),
    conditional: IVD_CONDITIONAL,
  },

  combination_product: {
    specialization: 'combination_product',
    // The device constituent only. See REGISTRY_LIMITS — the drug or biologic
    // constituent's work is not modeled here, and the plan says so rather than
    // reading as complete.
    required: DEVICE_REQUIRED,
    conditional: DEVICE_CONDITIONAL,
  },

  unspecified: {
    specialization: 'unspecified',
    // Deliberately empty, matching specializationPreset('unspecified'). Offering
    // every package would be the same failure as guessing: a plan that is wrong
    // for at least half of it, presented as the plan.
    required: [],
    conditional: [],
  },
};

/**
 * What the registry does NOT model for a specialization.
 *
 * Exported so a surface can render the gap rather than presenting a partial plan
 * as complete. A regulatory lead who can see the boundary can work around it; one
 * who cannot will assume the plan is the whole plan.
 */
export const REGISTRY_LIMITS: Record<MdxSpecialization, string | null> = {
  medical_device: null,
  ivd_diagnostics: null,
  medical_device_and_ivd: null,
  software_as_medical_device: null,
  companion_diagnostic:
    'The therapeutic programme this diagnostic selects for is not modeled here. Only the '
    + 'diagnostic side, and its coordination with the drug programme, appears on this plan.',
  combination_product:
    'Only the device constituent is modeled. The drug or biologic constituent — CMC, '
    + 'nonclinical pharmacology and toxicology, and clinical pharmacology — is not in this '
    + 'registry, so this plan is not the whole programme.',
  unspecified:
    'No specialization has been declared for this project, so there is no plan to offer. '
    + 'Declaring it presents the work packages for that kind of programme.',
};

// ── Lookups ──────────────────────────────────────────────────────────────────

export function allWorkPackages(): WorkPackage[] {
  return WORK_PACKAGE_IDS.map(id => PACKAGES[id]);
}

export function getWorkPackage(id: string): WorkPackage | null {
  return (PACKAGES as Record<string, WorkPackage>)[id] ?? null;
}

export function isWorkPackageId(v: unknown): v is WorkPackageId {
  return typeof v === 'string' && (WORK_PACKAGE_IDS as readonly string[]).includes(v);
}

/** The required/conditional split for a specialization; `unspecified` for anything unknown. */
export function workPackagesForSpecialization(
  specialization: string | null | undefined,
): SpecializationWorkPackages {
  if (!isMdxSpecialization(specialization)) return SPECIALIZATION_PACKAGES.unspecified;
  return SPECIALIZATION_PACKAGES[specialization];
}

/**
 * A work package as it appears on a plan: the registry entry plus whether this
 * programme has it because of its specialization, or only if a condition holds.
 */
export interface PlannedWorkPackage extends WorkPackage {
  applicability: 'required' | 'conditional';
}

/**
 * The work packages a project's plan should offer, in lifecycle order.
 *
 * Returns an EMPTY array outside MDX. That is the acceptance criterion for
 * MDX-PM-01 read literally: a biopharma project's cockpit shows the content it
 * shows today, because there is no work-package model for it here and inventing
 * one would put device vocabulary on a pharmaceutical programme.
 */
export function plannedWorkPackages(context: {
  vertical: string;
  specialization: string | null | undefined;
}): PlannedWorkPackage[] {
  if (context.vertical !== 'mdx') return [];
  const { required, conditional } = workPackagesForSpecialization(context.specialization);
  const planned: PlannedWorkPackage[] = [
    ...required.map(id => ({ ...PACKAGES[id], applicability: 'required' as const })),
    ...conditional.map(id => ({ ...PACKAGES[id], applicability: 'conditional' as const })),
  ];
  return sortByLifecycle(planned);
}

/**
 * Order packages the way a plan reads: by lifecycle phase, then by the registry's
 * own declaration order within a phase.
 *
 * Dependencies are NOT used for ordering. Real programmes run phases
 * concurrently, and a topological sort would present a sequence the platform does
 * not enforce as though it did — `dependsOn` is there to warn when a package is
 * being started ahead of its inputs, not to schedule it.
 */
export function sortByLifecycle<T extends { id: WorkPackageId; lifecyclePhase: LifecyclePhase }>(
  packages: T[],
): T[] {
  const declared = new Map(WORK_PACKAGE_IDS.map((id, i) => [id, i]));
  return [...packages].sort((a, b) => {
    const phase = lifecyclePhaseRank(a.lifecyclePhase) - lifecyclePhaseRank(b.lifecyclePhase);
    if (phase !== 0) return phase;
    return (declared.get(a.id) ?? 0) - (declared.get(b.id) ?? 0);
  });
}

/** Which filings a package feeds, restricted to the ones this project is pursuing. */
export function packageFilingsInScope(
  pkg: WorkPackage,
  projectFilings: readonly string[],
): MdxFilingType[] {
  if (projectFilings.length === 0) return pkg.supportsFilings;
  const scope = new Set(projectFilings);
  return pkg.supportsFilings.filter(f => scope.has(f));
}

/**
 * Packages whose declared inputs are not yet settled.
 *
 * Reported rather than enforced: starting analytical performance before the risk
 * file is settled is a normal, deliberate compression of a timeline. Naming it is
 * useful; blocking it would be wrong.
 */
export function unsettledDependencies(
  pkg: WorkPackage,
  settled: readonly string[],
): WorkPackageId[] {
  const done = new Set(settled);
  return pkg.dependsOn.filter(id => !done.has(id));
}

// ── The contextual sections of the Projects cockpit ──────────────────────────

/**
 * The sections the existing Projects cockpit gains for an MDX project.
 *
 * These are SECTIONS INSIDE the project detail surface, not destinations. No
 * route, no rail entry, no new shell — the acceptance criterion for MDX-PM-01 is
 * that the same URL renders different content, and that is only true if this
 * stays a section list.
 */
export const PROJECT_SECTIONS = [
  'plan', 'studies', 'deliverables', 'decisions', 'timeline', 'client_review',
] as const;
export type ProjectSectionId = (typeof PROJECT_SECTIONS)[number];

export interface ProjectSection {
  id: ProjectSectionId;
  /** Terminology-aware label: an IVD sponsor is not running clinical investigations. */
  label: string;
  description: string;
}

/**
 * Section labels for a project's context.
 *
 * `studies` is the one that has to move: the specialization's own word for the
 * work ("Performance study", "Clinical investigation", "Clinical validation")
 * comes from specializationPreset, so this module does not maintain a second
 * copy of that vocabulary.
 */
export function projectSectionsForContext(context: {
  vertical: string;
  specialization: string | null | undefined;
  primaryIndustry?: PrimaryIndustry | null;
}): ProjectSection[] {
  if (context.vertical !== 'mdx') return [];

  const preset = specializationPreset(context.specialization);
  const studyWord = preset.terminology.study ?? 'Study';
  const productWord = preset.terminology.product ?? 'Product';

  const sections: ProjectSection[] = [
    {
      id: 'plan',
      label: 'Regulatory plan',
      description: `The work packages this ${productWord.toLowerCase()} programme is managed in.`,
    },
    {
      id: 'studies',
      // "Performance study" -> "Performance studies"; "Clinical investigation" ->
      // "Clinical investigations". Only the trailing 'y' case needs care, and the
      // vocabulary is closed, so this is safe without a pluralization library.
      label: pluralize(studyWord),
      description: `Protocols and reports generating this programme's evidence.`,
    },
    {
      id: 'deliverables',
      label: 'Deliverables',
      description: 'Documents each work package has to produce, and their state.',
    },
    {
      id: 'decisions',
      label: 'Decisions',
      description: 'Choices this programme has made, and the basis each was defended on.',
    },
    {
      id: 'timeline',
      label: 'Timeline',
      description: 'Dated milestones this programme has committed to. Nothing is inferred.',
    },
  ];

  // A client review room only means something when there is a client. A device
  // manufacturer running its own programme has colleagues, not clients — showing
  // it an empty "Client review" section would be furniture.
  if (isServiceOrganization(context.primaryIndustry)) {
    sections.push({
      id: 'client_review',
      label: 'Client review',
      description: 'What has been released to the client, and what is waiting on them.',
    });
  }

  return sections;
}

/**
 * Whether this organization does regulatory work on someone else's behalf.
 *
 * Derived from INDUSTRY_DETERMINES_VERTICAL rather than a second list: an industry
 * whose vertical is NOT determined by the industry itself is one whose projects
 * belong to clients. That is the same fact, so it is read from the same place.
 */
export function isServiceOrganization(primaryIndustry: PrimaryIndustry | null | undefined): boolean {
  if (!primaryIndustry) return false;
  const determines = INDUSTRY_DETERMINES_VERTICAL[primaryIndustry];
  return determines === false;
}

function pluralize(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Coverage, so the registry's own size is reportable rather than asserted. */
export function registryCoverage(): {
  version: string;
  packages: number;
  withStudies: number;
  conditional: number;
} {
  const all = allWorkPackages();
  return {
    version: WORK_PACKAGE_REGISTRY_VERSION,
    packages: all.length,
    withStudies: all.filter(p => p.studyArchetypes.length > 0).length,
    conditional: all.filter(p => p.appliesWhen !== null).length,
  };
}

export default {
  WORK_PACKAGE_REGISTRY_VERSION, WORK_PACKAGE_IDS, REGISTRY_LIMITS,
  allWorkPackages, getWorkPackage, isWorkPackageId, workPackagesForSpecialization,
  plannedWorkPackages, sortByLifecycle, packageFilingsInScope, unsettledDependencies,
  PROJECT_SECTIONS, projectSectionsForContext, isServiceOrganization, registryCoverage,
};
