/**
 * MDX study archetype registry — MDX-STUDY-01.
 *
 * What a study of each kind actually has to answer, in the shape the Study Design
 * Center and the protocol builder need: which protocol sections are required, what
 * the design questions are, what the endpoints and typical acceptance criteria
 * look like, which statistical method applies, which supporting plans must exist,
 * and which filing sections the result feeds.
 *
 * Why a registry rather than a list of names. An archetype is the difference
 * between "run a precision study" and knowing that precision means 20 days × 2
 * runs × 2 replicates against CLSI EP05-A3, reported as repeatability and
 * within-laboratory SD/CV at each of at least two concentrations near the medical
 * decision point, and that it feeds FDA 510(k) analytical performance AND the IVDR
 * performance evaluation report. A dropdown of names produces a protocol someone
 * has to rewrite; this produces one that starts in the right shape.
 *
 * ── Coverage is declared, not implied ─────────────────────────────────────────
 *
 * Every archetype in mdx-specialization.ts appears here, but they are NOT all
 * specified to the same depth. `detail: 'full'` means the sections, endpoints,
 * acceptance criteria and statistics below were written deliberately for that
 * archetype. `detail: 'outline'` means the archetype is real and correctly
 * classified but its content is a starting frame, not a reviewed specification.
 *
 * That distinction is published (see `archetypesNeedingDetail`) rather than hidden,
 * because a registry that looks uniformly authoritative when half of it is
 * scaffolding is worse than one that says which half. A regulatory writer given an
 * outline-level protocol skeleton and told it is complete will ship the gaps.
 *
 * Versioned: REGISTRY_VERSION changes whenever an archetype's content changes, so
 * a protocol can record which version of the registry it was generated from and a
 * later reviewer can tell whether the guidance has moved since.
 *
 * Pure — no DB, no server imports — like its siblings. Persistence and entitlement
 * are layered by the server.
 *
 * @module shared/regulatory/mdx-study-archetypes
 */

import {
  DEVICE_STUDY_TYPES, IVD_ANALYTICAL_STUDY_TYPES, IVD_CLINICAL_STUDY_TYPES,
  type MdxStudyType, type MdxFilingType, type MdxSpecialization,
  specializationPreset,
} from './mdx-specialization';

/** Bump on any content change, so a generated protocol can cite its source. */
export const REGISTRY_VERSION = '2026.07.1';

/** How thoroughly this archetype has been specified. See the module docs. */
export type ArchetypeDetail = 'full' | 'outline';

/** Which regulatory question the study exists to answer. */
export type EvidenceClass =
  | 'analytical_performance'
  | 'clinical_performance'
  | 'clinical_safety_effectiveness'
  | 'usability'
  | 'software_validation'
  | 'postmarket';

export interface StudyArchetype {
  id: MdxStudyType;
  label: string;
  detail: ArchetypeDetail;
  evidenceClass: EvidenceClass;
  /** One sentence: what this study is FOR. Shown when picking an archetype. */
  purpose: string;
  /** Protocol sections this archetype requires, in the order they are authored. */
  protocolSections: string[];
  /**
   * The questions that must be answered before a protocol can be drafted. These
   * drive the design wizard — an unanswered one is a gap, not a default.
   */
  designQuestions: string[];
  endpoints: string[];
  /**
   * Typical acceptance criteria. Deliberately phrased as what sponsors commonly
   * justify, NOT as thresholds the platform asserts: an acceptance criterion is a
   * claim about a specific product's intended use and has to be defended, so
   * presenting a number as authoritative would invite it being adopted unexamined.
   */
  typicalAcceptanceCriteria: string[];
  /** Statistical approach, naming the standard where one governs. */
  statisticalMethods: string[];
  /** Plans that must exist alongside the protocol. */
  requiredSupportingPlans: string[];
  /** Filing types whose evidence this study supports. */
  supportsFilings: MdxFilingType[];
  /** Guidance/standards a reviewer will expect the protocol to reflect. */
  references: string[];
  /** True when the result normally needs a signed approval before use in a filing. */
  approvalRequired: boolean;
}

// ── Shared section blocks ────────────────────────────────────────────────────
// Written once because a reviewer expects the same spine in every protocol of a
// kind; the archetypes below extend rather than restate them.

const IVD_COMMON_SECTIONS = [
  'Assay and instrument configuration',
  'Intended use',
  'Analyte and measurand',
  'Specimen types',
  'Comparator or reference method',
  'Site and operator design',
  'Lot design',
  'Acceptance criteria',
  'Invalid and indeterminate results',
  'Data exclusions',
  'Statistical analysis',
  'Specimen handling and retention',
];

const DEVICE_COMMON_SECTIONS = [
  'Device description and configuration',
  'Intended use',
  'Clinical background',
  'Benefit-risk analysis',
  'Objectives',
  'Study population',
  'Study procedures',
  'Device accountability',
  'Malfunctions and deficiencies',
  'Adverse device effects',
  'Endpoints',
  'Monitoring plan',
  'Statistical plan',
  'Suspension and stopping criteria',
];

const IVD_ANALYTICAL_FILINGS: MdxFilingType[] = [
  'ivd_510k', 'dual_510k_clia_waiver', 'de_novo_ivd', 'pma_cdx',
  'eu_ivdr_technical_documentation', 'performance_evaluation_report',
];

const IVD_CLINICAL_FILINGS: MdxFilingType[] = [
  'ivd_510k', 'dual_510k_clia_waiver', 'de_novo_ivd', 'pma_cdx',
  'eu_ivdr_technical_documentation', 'performance_evaluation_report', 'performance_study',
];

const DEVICE_CLINICAL_FILINGS: MdxFilingType[] = [
  'ide', 'us_510k', 'de_novo', 'pma', 'pma_supplement',
  'eu_mdr_technical_documentation', 'cer',
];

/** An archetype specified only to outline depth — see the coverage note above. */
function outline(
  id: MdxStudyType,
  label: string,
  evidenceClass: EvidenceClass,
  purpose: string,
  sections: string[],
  filings: MdxFilingType[],
): StudyArchetype {
  return {
    id, label, detail: 'outline', evidenceClass, purpose,
    protocolSections: sections,
    designQuestions: [
      'What claim does this study support, and in which filing section does it land?',
      'What is the acceptance criterion, and on what basis is it justified?',
      'What population, specimen set or use environment makes the result generalizable?',
    ],
    endpoints: [],
    typicalAcceptanceCriteria: [],
    statisticalMethods: [],
    requiredSupportingPlans: ['Statistical analysis plan'],
    supportsFilings: filings,
    references: [],
    approvalRequired: true,
  };
}

// ── IVD analytical performance ───────────────────────────────────────────────

const IVD_ANALYTICAL: StudyArchetype[] = [
  {
    id: 'precision',
    label: 'Precision',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Quantify repeatability and within-laboratory imprecision so a result can be interpreted '
      + 'against a medical decision point.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Precision design (days, runs, replicates)', 'Bias and precision methods'],
    designQuestions: [
      'Which concentrations are tested, and how do they relate to the medical decision point?',
      'How many days, runs per day and replicates per run? (EP05-A3 default is 20 × 2 × 2.)',
      'Single-site or multi-site, and how many reagent lots and instruments?',
      'Are contrived samples used, and how is their commutability with native specimens justified?',
    ],
    endpoints: [
      'Repeatability (within-run) SD and CV at each concentration',
      'Within-laboratory (total) SD and CV at each concentration',
      'Between-run, between-day and between-lot components where the design supports them',
    ],
    typicalAcceptanceCriteria: [
      'Within-laboratory CV at or below a limit justified by the medical decision point and clinical use',
      'Precision near the cutoff tight enough that a result does not straddle the decision point within its own imprecision',
    ],
    statisticalMethods: [
      'Nested ANOVA variance-component estimation (CLSI EP05-A3)',
      'Two-sided confidence intervals on each SD/CV estimate',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Specimen sourcing and handling plan', 'Lot and instrument plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP05-A3', 'FDA guidance on assay migration and analytical studies'],
    approvalRequired: true,
  },
  {
    id: 'reproducibility',
    label: 'Reproducibility',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Show the assay performs consistently across the sites, operators, instruments, lots and days '
      + 'it will actually be used in — the multi-site extension of precision.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Site, operator and lot matrix', 'Bias and precision methods'],
    designQuestions: [
      'How many sites, and are they representative of the intended use setting?',
      'How many operators per site, and are they trained to the IFU rather than by the manufacturer?',
      'How many reagent lots and instruments enter the matrix?',
      'Over how many days, and how is the panel blinded and randomized?',
    ],
    endpoints: [
      'Total reproducibility SD and CV across all factors',
      'Variance contribution of site, operator, lot, instrument and day',
      'Per-site precision for comparison against the overall estimate',
    ],
    typicalAcceptanceCriteria: [
      'Total reproducibility CV within a pre-specified limit justified for the intended use',
      'No single site, lot or operator contributing a disproportionate share of total variance',
    ],
    statisticalMethods: [
      'Multi-factor nested ANOVA / variance components (CLSI EP05-A3 Appendix)',
      'Per-factor variance contribution with confidence intervals',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Site selection and training plan', 'Panel construction and blinding plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP05-A3', 'CLSI EP15-A3'],
    approvalRequired: true,
  },
  {
    id: 'lob_lod_loq',
    label: 'Limit of blank / detection / quantitation',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Establish the lowest analyte concentration the assay can distinguish from blank, reliably '
      + 'detect, and quantify with stated precision and bias.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Blank and low-level sample design', 'LoQ precision and bias goal'],
    designQuestions: [
      'How many blank and low-level samples, across how many lots, days and replicates? (EP17 defaults are 60 blank / 60 low-level.)',
      'Is the underlying distribution consistent with the parametric approach, or is the non-parametric option required?',
      'What total-error or precision goal defines LoQ, and how is it justified?',
      'Is LoD claimed per specimen type, or pooled across types — and is pooling defensible?',
    ],
    endpoints: [
      'LoB at the 95th percentile of blank measurements',
      'LoD at which ≥95% of low-level samples read above LoB',
      'LoQ at which the pre-specified precision and bias goal is met',
    ],
    typicalAcceptanceCriteria: [
      'LoD at or below the concentration required by the intended use claim',
      'LoQ supported by measured precision and bias at that level, not extrapolated from higher concentrations',
    ],
    statisticalMethods: [
      'Parametric or non-parametric LoB/LoD estimation (CLSI EP17-A2)',
      'Precision-profile modelling for LoQ',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Low-level panel preparation and value-assignment plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP17-A2'],
    approvalRequired: true,
  },
  {
    id: 'linearity_measuring_range',
    label: 'Linearity and measuring range',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Establish the interval over which the assay result is proportional to the true concentration, '
      + 'defining the claimed measuring range.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Dilution series design', 'Range and reportable-interval claim'],
    designQuestions: [
      'How many levels span the claimed range, and are the extremes at or beyond the claim?',
      'How is the dilution series prepared, and is the diluent commutable with patient specimens?',
      'What deviation from linearity is clinically allowable, and on what basis?',
      'How are results outside the measuring range reported?',
    ],
    endpoints: [
      'Deviation from linearity at each level',
      'Upper and lower limits of the linear measuring interval',
      'Claimed reportable interval including any dilution protocol',
    ],
    typicalAcceptanceCriteria: [
      'Deviation from the best-fit linear model within a pre-specified clinically allowable limit at every level',
      'Range extremes demonstrated rather than inferred',
    ],
    statisticalMethods: [
      'Polynomial regression with comparison of first-, second- and third-order fits (CLSI EP06)',
      'Allowable-deviation assessment at each concentration',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Dilution and value-assignment plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP06-Ed2'],
    approvalRequired: true,
  },
  {
    id: 'interference',
    label: 'Interference',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Determine whether endogenous and exogenous substances present in real specimens bias the result.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Interferent selection and rationale', 'Dose-response design'],
    designQuestions: [
      'Which interferents are tested, and how was the list derived from the specimen type and patient population?',
      'At what concentrations — and are those at or above the highest plausible clinical level?',
      'Is a paired-difference or dose-response design used?',
      'What bias is clinically allowable at the tested concentrations?',
    ],
    endpoints: [
      'Percent or absolute bias at each interferent concentration',
      'Highest interferent concentration at which no clinically significant interference is observed',
    ],
    typicalAcceptanceCriteria: [
      'Bias within the pre-specified clinically allowable limit at the highest plausible clinical concentration',
      'Any interference found is characterized and reflected in the IFU limitations',
    ],
    statisticalMethods: [
      'Paired-difference testing with confidence intervals (CLSI EP07)',
      'Dose-response modelling where interference is detected',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Interferent sourcing and spiking plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP07-Ed3', 'CLSI EP37'],
    approvalRequired: true,
  },
  {
    id: 'analytical_specificity',
    label: 'Analytical specificity',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Show the assay measures the intended measurand and is not confounded by related analytes or organisms.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Specificity panel and rationale'],
    designQuestions: [
      'What panel establishes specificity, and how does it reflect the differential diagnosis or related analytes?',
      'At what concentrations are the challenge materials tested?',
      'Is in-silico analysis used to support panel selection, and is wet testing done for the plausible cases?',
    ],
    endpoints: [
      'Result for each specificity challenge at the tested concentration',
      'Any cross-reacting substance or organism identified, with the concentration at which it appears',
    ],
    typicalAcceptanceCriteria: [
      'No false result from any panel member at clinically plausible concentrations',
      'Identified cross-reactivity documented in the IFU',
    ],
    statisticalMethods: ['Descriptive; proportion positive per challenge with exact confidence intervals'],
    requiredSupportingPlans: ['Statistical analysis plan', 'Specificity panel justification'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP07-Ed3', 'FDA guidance on analytical specificity for microbial assays'],
    approvalRequired: true,
  },
  outline('cross_reactivity', 'Cross-reactivity', 'analytical_performance',
    'Characterize response to closely related analytes or organisms that could produce a false result.',
    [...IVD_COMMON_SECTIONS, 'Cross-reactant panel and rationale'], IVD_ANALYTICAL_FILINGS),
  outline('carryover', 'Carryover', 'analytical_performance',
    'Show that a high-concentration specimen does not contaminate the result of the specimen that follows it.',
    [...IVD_COMMON_SECTIONS, 'High/low sequence design'], IVD_ANALYTICAL_FILINGS),
  outline('matrix_equivalence', 'Matrix equivalence', 'analytical_performance',
    'Show that claimed specimen types perform equivalently, so a claim in one matrix transfers to another.',
    [...IVD_COMMON_SECTIONS, 'Matrix comparison design'], IVD_ANALYTICAL_FILINGS),
  outline('specimen_stability', 'Specimen stability', 'analytical_performance',
    'Establish the storage and transport conditions and durations over which a specimen remains valid.',
    [...IVD_COMMON_SECTIONS, 'Stability time points and conditions'], IVD_ANALYTICAL_FILINGS),
  outline('reagent_stability', 'Reagent stability', 'analytical_performance',
    'Establish shelf life, in-use stability and transport conditions for the reagents.',
    [...IVD_COMMON_SECTIONS, 'Real-time and accelerated stability design'], IVD_ANALYTICAL_FILINGS),
  outline('scientific_validity', 'Scientific validity', 'analytical_performance',
    'Establish that the analyte is associated with the clinical condition the assay is claimed for — the IVDR '
    + 'performance-evaluation limb that precedes analytical and clinical performance.',
    ['Intended purpose', 'Analyte-condition association', 'Literature and evidence appraisal', 'State of the art', 'Conclusion'],
    ['eu_ivdr_technical_documentation', 'performance_evaluation_report']),
];

// ── IVD clinical performance ─────────────────────────────────────────────────

const IVD_CLINICAL: StudyArchetype[] = [
  {
    id: 'ppa_npa_opa',
    label: 'Method comparison — PPA / NPA / OPA',
    detail: 'full',
    evidenceClass: 'clinical_performance',
    purpose:
      'Compare the assay against a comparator method when no reference standard establishes true '
      + 'disease status, reporting agreement rather than accuracy.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Comparator justification', 'Discordant-result resolution'],
    designQuestions: [
      'Is the comparator a true reference standard or another test? (If the latter, the result is AGREEMENT, not sensitivity/specificity.)',
      'How are discordant results adjudicated, and is the adjudication pre-specified?',
      'How many specimens per result category, including near the cutoff?',
      'Are specimens prospectively collected or banked — and does banked selection bias the spectrum?',
    ],
    endpoints: [
      'Positive percent agreement with two-sided confidence interval',
      'Negative percent agreement with two-sided confidence interval',
      'Overall percent agreement',
      'Discordant analysis',
    ],
    typicalAcceptanceCriteria: [
      'Lower bound of the PPA and NPA confidence intervals above a pre-specified limit justified by clinical consequence',
      'Adequate representation of specimens near the cutoff, where agreement is hardest',
    ],
    statisticalMethods: [
      'PPA/NPA/OPA with score (Wilson) confidence intervals',
      'Pre-specified handling of invalid and indeterminate results — reported, never silently excluded',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Specimen sourcing plan', 'Discordant-resolution plan'],
    supportsFilings: IVD_CLINICAL_FILINGS,
    references: [
      'FDA "Statistical Guidance on Reporting Results from Studies Evaluating Diagnostic Tests"',
      'CLSI EP12-A2',
    ],
    approvalRequired: true,
  },
  {
    id: 'clinical_sensitivity_specificity',
    label: 'Clinical sensitivity and specificity',
    detail: 'full',
    evidenceClass: 'clinical_performance',
    purpose:
      'Estimate how well the assay identifies subjects with and without the target condition, against a '
      + 'reference standard that establishes true status.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Reference standard definition', 'Subject enrollment and spectrum'],
    designQuestions: [
      'What reference standard defines true disease status, and is it applied to every subject regardless of assay result?',
      'Is enrollment consecutive or selected — and how is spectrum bias avoided?',
      'What prevalence is expected, and is the sample size adequate for the rarer class?',
      'Are readers or interpreters blinded to the comparator result?',
    ],
    endpoints: [
      'Clinical sensitivity with two-sided confidence interval',
      'Clinical specificity with two-sided confidence interval',
      'Predictive values at the prevalence of the intended use population',
    ],
    typicalAcceptanceCriteria: [
      'Lower confidence bounds above pre-specified limits justified by the consequence of a false negative and a false positive respectively',
      'Subject spectrum representative of the intended use population, not enriched to flatter the estimate',
    ],
    statisticalMethods: [
      'Sensitivity/specificity with score confidence intervals',
      'Predictive values computed at stated prevalence, with the prevalence source cited',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Enrollment and blinding plan', 'Reference-standard procedure'],
    supportsFilings: IVD_CLINICAL_FILINGS,
    references: ['FDA statistical guidance on diagnostic test studies', 'STARD reporting checklist'],
    approvalRequired: true,
  },
  {
    id: 'roc_cutoff',
    label: 'ROC and cutoff selection',
    detail: 'full',
    evidenceClass: 'clinical_performance',
    purpose:
      'Select and justify the decision threshold, making the sensitivity/specificity trade-off explicit '
      + 'rather than implicit.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Cutoff derivation', 'Cutoff validation set'],
    designQuestions: [
      'Is the cutoff derived and validated on the SAME specimens? (If so, the performance estimate is optimistic and must be reported as such.)',
      'What clinical consideration drives the sensitivity/specificity trade-off at the chosen point?',
      'Is an equivocal or indeterminate zone defined, and how are those results reported?',
    ],
    endpoints: [
      'Area under the ROC curve with confidence interval',
      'Sensitivity and specificity at the proposed cutoff',
      'Operating characteristics at candidate alternative cutoffs',
    ],
    typicalAcceptanceCriteria: [
      'AUC above a pre-specified limit',
      'Chosen cutoff justified by clinical consequence, and validated on specimens independent of those used to derive it',
    ],
    statisticalMethods: [
      'Empirical or binormal ROC estimation with confidence intervals (DeLong)',
      'Pre-specified cutoff rule, with any post-hoc change reported as such',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Independent validation-set plan'],
    supportsFilings: IVD_CLINICAL_FILINGS,
    references: ['FDA statistical guidance on diagnostic test studies', 'CLSI EP24-A2'],
    approvalRequired: true,
  },
  {
    id: 'lay_user',
    label: 'Lay-user study',
    detail: 'full',
    evidenceClass: 'usability',
    purpose:
      'Show that untrained intended users obtain correct results from the labeling alone — the core of a '
      + 'CLIA waiver or an over-the-counter claim.',
    protocolSections: [
      ...IVD_COMMON_SECTIONS,
      'Lay-user population and recruitment',
      'Labeling and instructions under test',
      'Observation and non-interference protocol',
      'Flex and failure-mode considerations',
    ],
    designQuestions: [
      'How are participants recruited to represent the intended user population, including reading level and demographics?',
      'Is any training, demonstration or prompting given? (Any is a protocol deviation — the labeling is what is under test.)',
      'How is observer non-interference enforced and documented?',
      'Are participants tested on specimens of known concentration, especially near the cutoff?',
    ],
    endpoints: [
      'Percent agreement between lay-user and trained-operator or reference result',
      'Performance near the medical decision point specifically',
      'Observed use errors and their consequence',
      'Comprehension of the result and of the IFU',
    ],
    typicalAcceptanceCriteria: [
      'Lay-user agreement comparable to trained-operator performance, with the confidence bound pre-specified',
      'No use error with a clinically significant consequence left unmitigated by labeling',
    ],
    statisticalMethods: [
      'Percent agreement with score confidence intervals, reported separately near the cutoff',
      'Use-error frequency with descriptive analysis of consequence',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Recruitment and representativeness plan', 'Labeling under test (versioned)', 'Human-factors use-error analysis'],
    supportsFilings: ['dual_510k_clia_waiver', 'ivd_510k', 'de_novo_ivd'],
    references: ['FDA CLIA Waiver by Application guidance', 'FDA human factors guidance (IEC 62366-1 aligned)'],
    approvalRequired: true,
  },
  {
    id: 'cdx_concordance',
    label: 'Companion diagnostic concordance',
    detail: 'full',
    evidenceClass: 'clinical_performance',
    purpose:
      'Show the marketed assay identifies the same patients as the clinical trial assay used to establish '
      + 'the therapeutic benefit — the bridge between the drug trial and the commercial test.',
    protocolSections: [
      ...IVD_COMMON_SECTIONS,
      'Clinical trial assay description',
      'Bridging population and specimen provenance',
      'Drug efficacy linkage',
    ],
    designQuestions: [
      'What was the clinical trial assay, and are its specimens available for direct bridging?',
      'Is the bridging set representative of the trial population, and what is the specimen availability rate?',
      'How is missing-specimen bias assessed, given non-availability is rarely random?',
      'Does the analysis re-derive the efficacy estimate in the assay-positive subgroup?',
    ],
    endpoints: [
      'PPA / NPA / OPA against the clinical trial assay',
      'Efficacy in the marketed-assay-positive population versus the trial-assay-positive population',
      'Discordant-case clinical outcomes',
    ],
    typicalAcceptanceCriteria: [
      'Concordance high enough that the therapeutic benefit demonstrated in the trial transfers to patients selected by the marketed assay',
      'Discordant cases individually examined for outcome, not summarized away',
    ],
    statisticalMethods: [
      'PPA/NPA with confidence intervals',
      'Subgroup efficacy re-estimation with sensitivity analysis for unavailable specimens',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Bridging specimen plan', 'Drug-diagnostic co-development agreement'],
    supportsFilings: ['pma_cdx', 'pma', 'pma_supplement', 'eu_ivdr_technical_documentation'],
    references: ['FDA In Vitro Companion Diagnostic Devices guidance', 'FDA/EMA co-development principles'],
    approvalRequired: true,
  },
  outline('prospective_clinical_performance', 'Prospective clinical performance study', 'clinical_performance',
    'Enroll subjects prospectively in the intended use setting to estimate clinical performance without selection bias.',
    [...IVD_COMMON_SECTIONS, 'Prospective enrollment plan', 'Site and investigator selection'], IVD_CLINICAL_FILINGS),
  outline('retrospective_specimen', 'Retrospective specimen study', 'clinical_performance',
    'Use banked specimens to estimate performance, with explicit treatment of selection and spectrum bias.',
    [...IVD_COMMON_SECTIONS, 'Banked specimen provenance', 'Selection-bias assessment'], IVD_CLINICAL_FILINGS),
  outline('untrained_operator', 'Untrained-operator study', 'usability',
    'Show operators representative of the waived setting obtain correct results without specialized training.',
    [...IVD_COMMON_SECTIONS, 'Operator population', 'Training prohibition and observation protocol'],
    ['dual_510k_clia_waiver', 'ivd_510k']),
  outline('clia_waiver_flex', 'CLIA waiver flex study', 'analytical_performance',
    'Stress the assay across environmental and handling conditions plausible outside a laboratory, to show '
    + 'it fails safe rather than producing a wrong result.',
    [...IVD_COMMON_SECTIONS, 'Flex condition matrix', 'Failure-mode and fail-safe analysis'],
    ['dual_510k_clia_waiver']),
  outline('pmpf', 'Post-market performance follow-up (PMPF)', 'postmarket',
    'Continue confirming performance and safety after IVDR certification, feeding the periodic performance report.',
    ['PMPF objectives', 'Methods and data sources', 'Analysis plan', 'Reporting and PER linkage'],
    ['pmpf_plan', 'eu_ivdr_technical_documentation', 'performance_evaluation_report']),
];

// ── Device clinical / usability / software ───────────────────────────────────

const DEVICE: StudyArchetype[] = [
  {
    id: 'pivotal_clinical_investigation',
    label: 'Pivotal clinical investigation',
    detail: 'full',
    evidenceClass: 'clinical_safety_effectiveness',
    purpose:
      'Generate the primary clinical evidence of safety and effectiveness supporting the marketing claim.',
    protocolSections: DEVICE_COMMON_SECTIONS,
    designQuestions: [
      'What is the primary endpoint, and is it clinically meaningful rather than merely measurable?',
      'Is the design randomized, controlled, blinded — and where not, how is bias addressed?',
      'What is the control: sham, active comparator, or objective performance criterion, and how is it justified?',
      'What is the sample size, and on what effect size and variance assumptions does it rest?',
      'What are the stopping rules and the interim analysis plan?',
    ],
    endpoints: [
      'Primary safety endpoint',
      'Primary effectiveness endpoint',
      'Secondary endpoints supporting labeling claims',
      'Adverse device effects and device deficiencies',
    ],
    typicalAcceptanceCriteria: [
      'Primary endpoint met at the pre-specified significance level with the pre-specified analysis population',
      'Benefit-risk favorable on the totality of evidence, not on the primary endpoint alone',
    ],
    statisticalMethods: [
      'Pre-specified primary analysis with multiplicity control across secondary endpoints',
      'Pre-specified handling of missing data and of the analysis population (ITT / per-protocol)',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Clinical monitoring plan', 'Risk management file', 'Investigator brochure'],
    supportsFilings: DEVICE_CLINICAL_FILINGS,
    references: ['ISO 14155', 'ICH E6(R3) where applicable', 'FDA IDE regulation 21 CFR 812'],
    approvalRequired: true,
  },
  {
    id: 'human_factors_validation',
    label: 'Human-factors validation',
    detail: 'full',
    evidenceClass: 'usability',
    purpose:
      'Demonstrate that intended users can perform the critical tasks safely and effectively with the '
      + 'final design and final labeling.',
    protocolSections: [
      'Device and user-interface description',
      'Intended users, uses and use environments',
      'Critical tasks derived from use-related risk analysis',
      'Participant groups and sample size',
      'Test environment and simulated use',
      'Data collection: observation, knowledge task, subjective assessment',
      'Use-error and close-call definitions',
      'Root-cause analysis approach',
      'Acceptance criteria',
    ],
    designQuestions: [
      'Which tasks are critical, and does that list come from the use-related risk analysis rather than from convenience?',
      'Are all distinct user groups represented, with at least 15 participants each?',
      'Is the final production-equivalent design and final labeling under test?',
      'How will root cause be established for every use error and close call?',
    ],
    endpoints: [
      'Successful completion of each critical task',
      'Use errors, close calls and operational difficulties, with root cause',
      'Knowledge-task performance',
      'Subjective feedback on the interface and labeling',
    ],
    typicalAcceptanceCriteria: [
      'Every use error on a critical task root-caused and either mitigated or justified as acceptable residual risk',
      'No unmitigated use error capable of causing serious harm',
    ],
    statisticalMethods: [
      'Descriptive; analysis is qualitative root-cause, not hypothesis testing',
      'Sample size is by user group per FDA guidance, not powered',
    ],
    requiredSupportingPlans: ['Use-related risk analysis', 'Final labeling (versioned)', 'Moderator guide'],
    supportsFilings: ['us_510k', 'de_novo', 'pma', 'pma_supplement', 'eu_mdr_technical_documentation'],
    references: ['FDA Applying Human Factors and Usability Engineering guidance', 'IEC 62366-1'],
    approvalRequired: true,
  },
  {
    id: 'software_clinical_validation',
    label: 'Software clinical validation',
    detail: 'full',
    evidenceClass: 'software_validation',
    purpose:
      'Show the software produces clinically valid output on data representative of intended use — for SaMD, '
      + 'this is the clinical evidence, not a verification activity.',
    protocolSections: [
      'Software description, version and configuration',
      'Intended use and clinical claim',
      'Reference standard or ground truth definition',
      'Validation dataset and its independence from training data',
      'Subgroup and generalizability plan',
      'Endpoints and acceptance criteria',
      'Statistical analysis',
      'Failure-mode and edge-case handling',
    ],
    designQuestions: [
      'Is the validation dataset genuinely independent of any data used in development? (Overlap invalidates the estimate.)',
      'How is ground truth established, and by how many independent adjudicators?',
      'Which subgroups must be analyzed separately to show the model does not degrade for some populations?',
      'What is the locked version under test, and is the change-control plan defined?',
    ],
    endpoints: [
      'Primary performance metric against ground truth (sensitivity/specificity, AUC, or task-appropriate)',
      'Subgroup performance',
      'Failure and edge-case behaviour',
    ],
    typicalAcceptanceCriteria: [
      'Primary metric lower confidence bound above a pre-specified clinically justified limit',
      'No subgroup showing clinically significant degradation without disclosure in labeling',
    ],
    statisticalMethods: [
      'Pre-specified primary metric with confidence intervals on a locked, independent test set',
      'Pre-specified subgroup analyses, reported whether or not favourable',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Data provenance and independence attestation', 'Predetermined change control plan (where applicable)'],
    supportsFilings: ['us_510k', 'de_novo', 'pma', 'eu_mdr_technical_documentation'],
    references: ['IEC 62304', 'FDA SaMD clinical evaluation guidance', 'FDA predetermined change control plan guidance'],
    approvalRequired: true,
  },
  outline('feasibility', 'Feasibility study', 'clinical_safety_effectiveness',
    'Gather early data on device function and safety to inform the pivotal design.',
    DEVICE_COMMON_SECTIONS, ['ide', 'q_submission']),
  outline('early_feasibility', 'Early feasibility study', 'clinical_safety_effectiveness',
    'Assess an early-stage device in a small number of subjects where non-clinical testing cannot answer the question.',
    DEVICE_COMMON_SECTIONS, ['ide', 'q_submission']),
  outline('comparative_device_study', 'Comparative device study', 'clinical_safety_effectiveness',
    'Compare against a predicate or alternative device to support substantial equivalence or a comparative claim.',
    DEVICE_COMMON_SECTIONS, DEVICE_CLINICAL_FILINGS),
  outline('human_factors_formative', 'Human-factors formative study', 'usability',
    'Find and fix use-related design problems while the design can still change. Not evidence for a filing on its own.',
    ['Device and interface description', 'Objectives', 'Participants', 'Tasks', 'Findings and design changes'],
    ['us_510k', 'de_novo']),
  outline('pmcf', 'Post-market clinical follow-up (PMCF)', 'postmarket',
    'Continue confirming safety and performance after MDR certification, feeding the periodic safety update report.',
    ['PMCF objectives', 'Methods and data sources', 'Analysis plan', 'Reporting and CER linkage'],
    ['pmcf_plan', 'eu_mdr_technical_documentation', 'cer']),
  outline('registry', 'Registry', 'postmarket',
    'Collect longitudinal real-world data on a defined population to support long-term safety and performance.',
    ['Registry objectives', 'Population and enrollment', 'Data elements', 'Follow-up schedule', 'Analysis plan'],
    ['eu_mdr_technical_documentation', 'cer', 'pmcf_plan']),
  outline('postmarket_study', 'Post-market study', 'postmarket',
    'Answer a specific question raised after market authorization, often an authority condition of approval.',
    ['Objectives and regulatory basis', 'Design', 'Endpoints', 'Analysis plan', 'Reporting commitments'],
    ['pma_supplement', 'eu_mdr_technical_documentation', 'cer']),
  outline('real_world_evidence', 'Real-world evidence study', 'postmarket',
    'Use routinely collected data to support a claim, with explicit treatment of data quality and confounding.',
    ['Objectives', 'Data source and provenance', 'Data quality assessment', 'Confounding and bias plan', 'Analysis plan'],
    ['us_510k', 'pma_supplement', 'eu_mdr_technical_documentation', 'cer']),
];

const ALL: StudyArchetype[] = [...IVD_ANALYTICAL, ...IVD_CLINICAL, ...DEVICE];

const BY_ID = new Map<string, StudyArchetype>(ALL.map(a => [a.id, a]));

/** Every archetype in the registry. */
export function allArchetypes(): StudyArchetype[] {
  return ALL;
}

export function getArchetype(id: string): StudyArchetype | null {
  return BY_ID.get(id) ?? null;
}

/**
 * The archetypes a project of this specialization should be offered.
 *
 * Driven by the specialization preset rather than a second list here, so the
 * Study Design Center and the project-creation dialog cannot drift apart about
 * what an IVD project is. An unspecified specialization yields NOTHING — the
 * caller is expected to ask, and offering everything would be the guess this
 * design exists to avoid.
 */
export function archetypesForSpecialization(specialization: MdxSpecialization): StudyArchetype[] {
  const allowed = new Set<string>(specializationPreset(specialization).studyTypes);
  return ALL.filter(a => allowed.has(a.id));
}

/** Archetypes whose evidence supports a given filing type. */
export function archetypesForFiling(filing: MdxFilingType): StudyArchetype[] {
  return ALL.filter(a => a.supportsFilings.includes(filing));
}

/**
 * Archetypes that are declared but not yet specified to full depth.
 *
 * Published so a consumer can label them honestly rather than presenting an
 * outline-level skeleton as a reviewed protocol specification. A regulatory
 * writer told the frame is complete will ship the gaps.
 */
export function archetypesNeedingDetail(): StudyArchetype[] {
  return ALL.filter(a => a.detail === 'outline');
}

/** Registry coverage, for a consumer that wants to state it. */
export function registryCoverage(): { total: number; full: number; outline: number; version: string } {
  const full = ALL.filter(a => a.detail === 'full').length;
  return { total: ALL.length, full, outline: ALL.length - full, version: REGISTRY_VERSION };
}

export default {
  REGISTRY_VERSION, allArchetypes, getArchetype, archetypesForSpecialization,
  archetypesForFiling, archetypesNeedingDetail, registryCoverage,
};

/**
 * Every study type declared in mdx-specialization.ts, for completeness checking.
 *
 * Checked by a TEST, not by the type system. A `Record<DeclaredStudyType, ...>`
 * built by reducing over an array needs an `as` assertion to typecheck, which
 * defeats the exhaustiveness it appears to provide — so it would have been a
 * comment claiming a guarantee that did not hold. The test asserts it for real.
 *
 * It matters because a study type added to the specialization presets without
 * content here would surface in a dropdown and produce an empty protocol.
 */
export type DeclaredStudyType =
  | (typeof DEVICE_STUDY_TYPES)[number]
  | (typeof IVD_ANALYTICAL_STUDY_TYPES)[number]
  | (typeof IVD_CLINICAL_STUDY_TYPES)[number];

export const DECLARED_STUDY_TYPES: readonly DeclaredStudyType[] = [
  ...DEVICE_STUDY_TYPES, ...IVD_ANALYTICAL_STUDY_TYPES, ...IVD_CLINICAL_STUDY_TYPES,
];
