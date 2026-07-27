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
 * Every archetype in mdx-specialization.ts appears here, and every one is now
 * specified to full depth: `detail: 'full'` means the sections, endpoints,
 * acceptance criteria, statistics and references below were written deliberately
 * for that archetype, naming the standard that governs it (CLSI EP series for the
 * analytical panel, ISO 14155 and 21 CFR 812 for device investigations,
 * IEC 62366-1 for human factors, the IVDR/MDR annexes for performance evaluation
 * and post-market follow-up). The `detail` axis and `archetypesNeedingDetail()`
 * are retained so a NEW archetype added at scaffold depth is flagged rather than
 * passed off as reviewed — the mechanism outlives the current full coverage.
 *
 * Depth is not the same as sign-off. Full means the content was written by
 * someone who knows the field; it does NOT mean a regulatory specialist has
 * ratified every acceptance criterion for a specific product's intended use. The
 * acceptance criteria are deliberately phrased as claims a sponsor must justify,
 * never as thresholds the platform asserts, precisely because that ratification
 * is the sponsor's and the reviewer's to make — not this table's.
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
export const REGISTRY_VERSION = '2026.07.2';

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
  {
    id: 'cross_reactivity',
    label: 'Cross-reactivity',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Characterize whether closely related analytes, metabolites or organisms are detected as the '
      + 'measurand and produce a false result — the structural-similarity companion to interference.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Cross-reactant panel and rationale', 'Concentration and dose-response design'],
    designQuestions: [
      'Which related analytes or organisms are tested, and how was the list derived from the measurand, the differential diagnosis and the specimen population?',
      'At what concentrations are cross-reactants challenged — at or above the highest concentration plausible in a real specimen?',
      'For a microbial assay, does the panel cover the phylogenetically nearest organisms and the commensal flora of the specimen site?',
      'Is a paired or dose-response design used, and how is a cross-reacting substance distinguished from ordinary analytical non-specificity?',
    ],
    endpoints: [
      'Result and bias for each cross-reactant at the tested concentration',
      'Highest cross-reactant concentration at which no clinically significant false result occurs',
      'Any cross-reactivity identified, with the concentration at which it appears',
    ],
    typicalAcceptanceCriteria: [
      'No clinically significant false result from any panel member at concentrations plausible in the intended specimen',
      'Any cross-reactivity found is characterized and reflected in the IFU limitations',
    ],
    statisticalMethods: [
      'Descriptive; proportion positive per challenge with exact (Clopper-Pearson) confidence intervals (CLSI EP07)',
      'Dose-response characterization where cross-reactivity is detected',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Cross-reactant sourcing and value-assignment plan', 'Panel justification'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP07-Ed3', 'FDA guidance on establishing analytical specificity for infectious-disease assays'],
    approvalRequired: true,
  },
  {
    id: 'carryover',
    label: 'Carryover',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Show that a high-concentration specimen does not contaminate the result of the specimen that '
      + 'follows it on an automated analyzer, where a carried-over trace can turn a true negative positive.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'High/low sequence design', 'Carryover calculation and acceptance'],
    designQuestions: [
      'What high concentration drives the challenge — the top of the measuring range, or the highest plausible clinical value?',
      'How many high–low–low sequences and replicates, and are specimen-to-specimen and reagent carryover distinguished?',
      'What carryover is clinically allowable, given the decision point a low result sits near?',
      'Are the washing and probe protocols the production configuration, not an optimized bench setup?',
    ],
    endpoints: [
      'Carryover index — the low result following a high, relative to a low following a low',
      'Carryover expressed at the concentrations bracketing the medical decision point',
      'Presence or absence of carryover above the allowable limit',
    ],
    typicalAcceptanceCriteria: [
      'Carryover below a pre-specified limit that keeps a low or negative result clinically unaffected by a preceding high specimen',
      'The claim demonstrated in the production configuration, not an idealized one',
    ],
    statisticalMethods: [
      'Carryover ratio (Broughton) with confidence interval',
      'Comparison of low-after-high against low-after-low with a pre-specified allowable difference (CLSI EP10)',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'High/low sequence panel plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP10-A3-AMD', 'Manufacturer carryover evaluation protocols'],
    approvalRequired: true,
  },
  {
    id: 'matrix_equivalence',
    label: 'Matrix equivalence',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Show that the specimen types claimed perform equivalently, so a performance claim established in '
      + 'one matrix transfers to another and a result does not depend on the tube it was drawn into.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Matrix comparison design', 'Split-sample and paired analysis'],
    designQuestions: [
      'Which specimen types and collection tubes are claimed (serum, plasma by anticoagulant, whole blood), and is each in the panel?',
      'Is a split-sample paired design used, so matrix is the only variable between paired results?',
      'Do the paired specimens span the measuring range, including near the medical decision point?',
      'How many paired specimens per matrix pair, and how is a matrix effect distinguished from ordinary imprecision?',
    ],
    endpoints: [
      'Slope, intercept and bias between each claimed matrix and the reference matrix',
      'Mean difference at the medical decision points',
      'Concentration range over which equivalence is demonstrated',
    ],
    typicalAcceptanceCriteria: [
      'Differences between matrices within a pre-specified clinically allowable limit across the measuring range',
      'Equivalence demonstrated at the decision points specifically, not only on average',
    ],
    statisticalMethods: [
      'Deming or Passing-Bablok regression with confidence intervals on slope and intercept (CLSI EP09)',
      'Bland-Altman difference analysis at the decision points',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Matched-specimen collection plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP09-Ed3', 'CLSI EP35'],
    approvalRequired: true,
  },
  {
    id: 'specimen_stability',
    label: 'Specimen stability',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Establish the storage conditions, transport conditions and durations over which a specimen remains '
      + 'valid — the hold-time and handling claims printed in the IFU.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Stability conditions and time points', 'Baseline and difference-from-baseline design'],
    designQuestions: [
      'Which storage conditions, transport conditions and freeze-thaw cycles are claimed, and is each under test?',
      'What time points bracket the claimed hold time, and do they extend beyond the claim to establish its edge?',
      'How many specimens span the measuring range, and are decision-point concentrations included?',
      'What change from baseline is clinically allowable, and is the claim demonstrated by real-time data rather than extrapolated?',
    ],
    endpoints: [
      'Change from baseline at each time point and condition',
      'Longest duration at each condition within the allowable change — the claimed stability',
      'Effect of freeze-thaw cycles where claimed',
    ],
    typicalAcceptanceCriteria: [
      'Change from baseline within the pre-specified clinically allowable limit at the claimed duration and condition',
      'The claim demonstrated at its stated edge, not inferred from a shorter interval',
    ],
    statisticalMethods: [
      'Difference-from-baseline with confidence intervals at each time point (CLSI EP25)',
      'Regression to estimate the time at which the allowable-change limit is reached',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Specimen sourcing and aliquoting plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP25-A'],
    approvalRequired: true,
  },
  {
    id: 'reagent_stability',
    label: 'Reagent stability',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Establish shelf life, in-use, on-board and open-vial stability and transport conditions for the '
      + 'reagents and calibrators — the dating and handling the label commits to.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Real-time and accelerated stability design', 'Shelf-life and in-use claim'],
    designQuestions: [
      'Which claims are made — shelf life, in-use, on-board, open-vial, calibration stability — and is each supported by real-time data?',
      'How many reagent lots enter the study, so the claim is not a property of a single favorable lot?',
      'Is accelerated (e.g. Arrhenius) data used only to bracket and support, with the label claim resting on real-time data?',
      'Are transport conditions simulated, including any excursion the distribution chain allows?',
    ],
    endpoints: [
      'Performance drift over time at each storage condition, per lot',
      'Longest duration meeting acceptance at each condition — the claimed dating',
      'On-board, open-vial and calibration stability where claimed',
    ],
    typicalAcceptanceCriteria: [
      'Each dating claim supported by real-time data across multiple lots; accelerated data is supportive, never a substitute',
      'Drift within the pre-specified allowable change at the claimed dating',
    ],
    statisticalMethods: [
      'Degradation regression to the allowable-change limit, with confidence intervals (CLSI EP25)',
      'Lot-to-lot comparison so the claim holds across manufacturing variation',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Multi-lot stability plan', 'Transport simulation plan'],
    supportsFilings: IVD_ANALYTICAL_FILINGS,
    references: ['CLSI EP25-A', 'ASTM D4169 for transport simulation'],
    approvalRequired: true,
  },
  {
    id: 'scientific_validity',
    label: 'Scientific validity',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Establish that the analyte is associated with the clinical condition the assay is claimed for — the '
      + 'IVDR performance-evaluation limb that precedes analytical and clinical performance, and is '
      + 'evidenced from the literature rather than generated in the laboratory.',
    protocolSections: [
      'Intended purpose and claimed association',
      'Analyte-condition association',
      'Literature search protocol and reproducibility',
      'Evidence appraisal and grading',
      'State of the art',
      'Conclusion and residual uncertainty',
    ],
    designQuestions: [
      'What association between the analyte and the clinical condition is claimed, and is it established in the literature or does it need to be demonstrated?',
      'What search strategy makes the literature review reproducible, and is it documented to a recognized standard?',
      'How is the body of evidence appraised and graded, and are conflicting findings represented rather than omitted?',
      'Is the claimed association consistent with the current state of the art, and where it is novel, is that stated?',
    ],
    endpoints: [
      'A documented, reproducible analyte-condition association',
      'An appraised and graded body of evidence, including contradictory findings',
      'A state-of-the-art comparison situating the claim',
    ],
    typicalAcceptanceCriteria: [
      'The association demonstrated to a level defensible for the specific intended purpose, not asserted',
      'The literature search reproducible and the appraisal transparent about the strength of the evidence',
    ],
    statisticalMethods: [
      'Systematic literature appraisal with a documented, reproducible search (PRISMA-style reporting)',
      'Structured evidence grading; descriptive rather than hypothesis-testing',
    ],
    requiredSupportingPlans: ['Literature search protocol', 'Evidence appraisal and grading plan'],
    supportsFilings: ['eu_ivdr_technical_documentation', 'performance_evaluation_report'],
    references: ['EU IVDR 2017/746 Annex XIII Part A', 'MDCG 2022-2'],
    approvalRequired: true,
  },
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
  {
    id: 'prospective_clinical_performance',
    label: 'Prospective clinical performance study',
    detail: 'full',
    evidenceClass: 'clinical_performance',
    purpose:
      'Estimate clinical performance in subjects enrolled prospectively in the intended use setting, where '
      + 'consecutive enrollment avoids the spectrum and selection bias that banked specimens invite.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Prospective enrollment plan', 'Site and investigator selection', 'Reference standard and adjudication'],
    designQuestions: [
      'Is enrollment consecutive or otherwise protected against spectrum bias, and does the population reflect the intended use?',
      'What reference standard defines true status, and is it applied to every subject regardless of the assay result?',
      'Are interpreters blinded to the comparator, and is the sample size adequate for the rarer class and the key subgroups?',
      'Are sites and investigators representative of the intended use setting rather than centers of excellence only?',
    ],
    endpoints: [
      'Clinical sensitivity and specificity (or PPA/NPA where the comparator is not a reference standard) with two-sided confidence intervals',
      'Predictive values at the prevalence of the intended use population, with the prevalence source cited',
      'Performance across pre-specified subgroups and sites',
    ],
    typicalAcceptanceCriteria: [
      'Lower confidence bounds above pre-specified limits justified by the consequence of a false negative and a false positive',
      'A subject spectrum representative of the intended use population, not enriched to flatter the estimate',
    ],
    statisticalMethods: [
      'Sensitivity/specificity or agreement with score (Wilson) confidence intervals',
      'Pre-specified subgroup and site analyses, reported whether or not favorable; STARD-conformant reporting',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Enrollment and blinding plan', 'Reference-standard procedure', 'Clinical monitoring plan'],
    supportsFilings: IVD_CLINICAL_FILINGS,
    references: ['FDA statistical guidance on diagnostic test studies', 'STARD 2015', 'EU IVDR 2017/746 Annex XIII'],
    approvalRequired: true,
  },
  {
    id: 'retrospective_specimen',
    label: 'Retrospective specimen study',
    detail: 'full',
    evidenceClass: 'clinical_performance',
    purpose:
      'Estimate clinical performance from banked specimens, where the central task is not the measurement '
      + 'but the honest treatment of the selection and spectrum bias that banking introduces.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Banked specimen provenance', 'Selection- and spectrum-bias assessment', 'Specimen characterization'],
    designQuestions: [
      'What is the provenance and chain of custody of the bank, and how were specimens selected — does that selection bias the spectrum?',
      'How long were specimens stored, and could storage have altered the analyte relative to fresh collection?',
      'Is the banked spectrum representative of the intended use population, and how is non-availability of some specimens handled?',
      'Are interpreters blinded, and was the reference status assigned independently of the assay result?',
    ],
    endpoints: [
      'Clinical sensitivity/specificity or agreement in the banked set, with confidence intervals',
      'Comparison of the banked spectrum against the intended use population',
      'Sensitivity analyses for selection and verification bias',
    ],
    typicalAcceptanceCriteria: [
      'Performance reported with an explicit selection-bias assessment, not as though the bank were a random sample',
      'The banked spectrum shown comparable to the intended use population, or the limitation disclosed in the claim',
    ],
    statisticalMethods: [
      'Sensitivity/specificity or agreement with score confidence intervals',
      'Pre-specified sensitivity analyses for selection, spectrum and verification bias',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Specimen provenance and inventory plan', 'Bias-assessment plan'],
    supportsFilings: IVD_CLINICAL_FILINGS,
    references: ['FDA statistical guidance on diagnostic test studies', 'STARD 2015', 'CLSI EP12-A2'],
    approvalRequired: true,
  },
  {
    id: 'untrained_operator',
    label: 'Untrained-operator study',
    detail: 'full',
    evidenceClass: 'usability',
    purpose:
      'Show operators representative of the waived, non-laboratory setting obtain correct results from the '
      + 'labeling alone — the human limb of a CLIA waiver, where the labeling, not the operator, is under test.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Operator population and recruitment', 'Training prohibition and observation protocol', 'Result comprehension assessment'],
    designQuestions: [
      'Are operators recruited to represent the waived-setting population — the sites and backgrounds where the test will actually run — rather than laboratory staff?',
      'Is any training, demonstration or prompting given? (Any is a protocol deviation: the labeling is what is under test.)',
      'How is observer non-interference enforced and documented, and are specimens of known concentration used, especially near the cutoff?',
      'Is comprehension of the result and of the IFU assessed, not just the numerical agreement?',
    ],
    endpoints: [
      'Agreement between untrained-operator and trained-operator or reference results',
      'Performance near the medical decision point specifically',
      'Observed use errors and their clinical consequence',
      'Comprehension of the result and of the IFU',
    ],
    typicalAcceptanceCriteria: [
      'Untrained-operator agreement comparable to trained-operator performance, with the confidence bound pre-specified',
      'No use error with a clinically significant consequence left unmitigated by the labeling',
    ],
    statisticalMethods: [
      'Percent agreement with score confidence intervals, reported separately near the cutoff',
      'Use-error frequency with descriptive analysis of consequence',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Recruitment and representativeness plan', 'Labeling under test (versioned)', 'Human-factors use-error analysis'],
    supportsFilings: ['dual_510k_clia_waiver', 'ivd_510k'],
    references: ['FDA CLIA Waiver by Application guidance', 'FDA human factors guidance (IEC 62366-1 aligned)'],
    approvalRequired: true,
  },
  {
    id: 'clia_waiver_flex',
    label: 'CLIA waiver flex study',
    detail: 'full',
    evidenceClass: 'analytical_performance',
    purpose:
      'Stress the assay across the environmental and handling conditions plausible outside a laboratory, to '
      + 'show it fails safe — flags or invalidates — rather than returning a wrong result an untrained user would trust.',
    protocolSections: [...IVD_COMMON_SECTIONS, 'Flex condition matrix', 'Failure-mode and fail-safe analysis', 'Stress-range justification'],
    designQuestions: [
      'Which stresses are exercised — temperature, humidity, timing, sample volume, specimen handling, power interruption, altitude — and are the ranges beyond what the waived setting plausibly imposes?',
      'Are stresses applied singly, and are the clinically important combinations also tested?',
      'For each stress: does the assay detect the condition and invalidate, or can it return a wrong result?',
      'What failure alerts exist, and does an untrained user know what to do when one fires?',
    ],
    endpoints: [
      'Performance under each stress condition relative to baseline',
      'Conditions under which the assay invalidates versus conditions under which it returns a wrong result',
      'Effectiveness of failure alerts and fail-safe mechanisms',
    ],
    typicalAcceptanceCriteria: [
      'Across the plausible stress envelope, the assay fails safe rather than producing a wrong result',
      'Failure alerts are effective and the recovery action is within an untrained user\'s reach',
    ],
    statisticalMethods: [
      'Descriptive per condition; bias or agreement against baseline with the robustness envelope characterized',
      'Pre-specified definition of a fail-safe versus a wrong-result outcome',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Flex-matrix plan', 'Failure-mode and fail-safe analysis', 'IFU environmental and handling claims'],
    supportsFilings: ['dual_510k_clia_waiver'],
    references: ['FDA CLIA Waiver by Application guidance', 'FDA Dual 510(k) and CLIA Waiver by Application guidance'],
    approvalRequired: true,
  },
  {
    id: 'pmpf',
    label: 'Post-market performance follow-up (PMPF)',
    detail: 'full',
    evidenceClass: 'postmarket',
    purpose:
      'Proactively confirm performance and safety after IVDR certification against the residual '
      + 'uncertainties named at certification, feeding the performance evaluation report rather than waiting for complaints.',
    protocolSections: [
      'PMPF objectives and residual performance uncertainties',
      'Methods and data sources',
      'General versus specific PMPF activities',
      'Analysis plan',
      'Reporting and PER linkage',
      'Justification where no PMPF is planned',
    ],
    designQuestions: [
      'What residual performance uncertainty is this follow-up designed to reduce, and is it traceable to the performance evaluation?',
      'Which method answers it — literature surveillance, a registry, a user survey, or a dedicated performance study — and why is it sufficient?',
      'At what interval is the performance evaluation report updated, and how do findings feed the benefit-risk conclusion?',
      'Where no PMPF is planned, is that justified and documented rather than simply absent?',
    ],
    endpoints: [
      'Confirmed performance and safety in real-world use against the premarket claims',
      'Emerging risks, performance drift, or off-label use',
      'Updated inputs to the benefit-risk determination',
    ],
    typicalAcceptanceCriteria: [
      'Residual uncertainties addressed on a documented plan, with the PER kept current',
      'A deviation from the expected performance triggers CAPA and, where warranted, a field safety corrective action',
    ],
    statisticalMethods: [
      'Descriptive trending against the premarket performance claims',
      'Pre-specified thresholds that distinguish expected variation from a signal',
    ],
    requiredSupportingPlans: ['PMPF plan', 'Performance evaluation report update procedure', 'Vigilance and trending linkage'],
    supportsFilings: ['pmpf_plan', 'eu_ivdr_technical_documentation', 'performance_evaluation_report'],
    references: ['EU IVDR 2017/746 Annex XIII Part B', 'EU IVDR 2017/746 Articles 78-81'],
    approvalRequired: true,
  },
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
  {
    id: 'feasibility',
    label: 'Feasibility study',
    detail: 'full',
    evidenceClass: 'clinical_safety_effectiveness',
    purpose:
      'Gather early clinical data to de-risk and shape the pivotal — endpoint measurability, procedure, and '
      + 'device iteration — without being mistaken for confirmatory evidence.',
    protocolSections: DEVICE_COMMON_SECTIONS,
    designQuestions: [
      'What specific question does this study answer to de-risk the pivotal — endpoint feasibility, procedural learning curve, or device refinement?',
      'Is the sample size adequate to inform the pivotal design rather than to confirm effectiveness?',
      'Is the investigation significant risk, and does it therefore require an IDE?',
      'Are the endpoints framed as exploratory, and is it explicit that this evidence does not itself support the marketing claim?',
    ],
    endpoints: [
      'Preliminary safety: adverse device effects and device deficiencies',
      'Device function and performance signals',
      'Feasibility of measuring the intended pivotal endpoint and of the procedure',
    ],
    typicalAcceptanceCriteria: [
      'Sufficient safety and functional signal to justify proceeding to the pivotal, framed as a go/no-go rather than as proof of effectiveness',
      'Findings adequate to fix the pivotal design assumptions, not to be reused as pivotal evidence',
    ],
    statisticalMethods: [
      'Descriptive; estimates reported with wide confidence intervals to inform pivotal sample-size assumptions',
      'No confirmatory hypothesis test',
    ],
    requiredSupportingPlans: ['Clinical investigation plan', 'Risk management file', 'Investigator brochure', 'Clinical monitoring plan'],
    supportsFilings: ['ide', 'q_submission'],
    references: ['FDA IDE Early/Traditional Feasibility Studies guidance', 'ISO 14155', 'FDA IDE regulation 21 CFR 812'],
    approvalRequired: true,
  },
  {
    id: 'early_feasibility',
    label: 'Early feasibility study',
    detail: 'full',
    evidenceClass: 'clinical_safety_effectiveness',
    purpose:
      'Assess an early-stage device in a small number of subjects where bench and animal testing cannot '
      + 'answer the question, under an IDE that anticipates iterative device changes.',
    protocolSections: DEVICE_COMMON_SECTIONS,
    designQuestions: [
      'Why can bench and animal testing not answer the question, justifying first-in-human use of an early-stage device?',
      'Is the cohort small with intensive per-subject monitoring, and is enrollment staged against emerging safety data?',
      'How are iterative device or procedure changes anticipated and controlled within the IDE, and how is each documented?',
      'Is informed consent enhanced to reflect the early developmental stage and the evolving device?',
    ],
    endpoints: [
      'Early safety and device-human interaction, per subject',
      'Feasibility signals that guide the next design iteration',
      'Adverse device effects and deficiencies with root cause',
    ],
    typicalAcceptanceCriteria: [
      'Acceptable early safety supporting continued or expanded investigation, judged per subject rather than in aggregate',
      'Each device or procedure iteration justified and controlled under the IDE',
    ],
    statisticalMethods: [
      'Descriptive and per-subject narrative; no powering',
      'Pre-specified stopping considerations tied to emerging safety',
    ],
    requiredSupportingPlans: ['Clinical investigation plan', 'Risk management file', 'Investigator brochure', 'Iterative-change control plan', 'Data monitoring committee charter'],
    supportsFilings: ['ide', 'q_submission'],
    references: ['FDA Early Feasibility Studies IDE guidance', 'ISO 14155', 'FDA IDE regulation 21 CFR 812'],
    approvalRequired: true,
  },
  {
    id: 'comparative_device_study',
    label: 'Comparative device study',
    detail: 'full',
    evidenceClass: 'clinical_safety_effectiveness',
    purpose:
      'Compare against a predicate, an alternative device or standard of care to support substantial '
      + 'equivalence or a comparative labeling claim — where the margin, not just the point estimate, is the claim.',
    protocolSections: DEVICE_COMMON_SECTIONS,
    designQuestions: [
      'What is the comparator — predicate, active alternative, or standard of care — and is it the right benchmark for the claim?',
      'Is the design superiority, non-inferiority or equivalence, and is the margin justified clinically rather than by convenience?',
      'Is the study randomized and blinded, and where it is not, how is bias controlled?',
      'Is the sample size driven by the margin, and are both ITT and per-protocol populations pre-specified for a non-inferiority conclusion?',
    ],
    endpoints: [
      'Primary comparative effectiveness endpoint',
      'Comparative safety, including adverse device effects',
      'Secondary endpoints supporting the specific comparative claim',
    ],
    typicalAcceptanceCriteria: [
      'The pre-specified comparative endpoint met, with any non-inferiority margin justified by clinical consequence',
      'Benefit-risk favorable on the totality of evidence, not the primary endpoint alone',
    ],
    statisticalMethods: [
      'Pre-specified non-inferiority or superiority analysis with multiplicity control across secondary endpoints',
      'ITT and per-protocol analyses for a non-inferiority claim; pre-specified missing-data handling',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Clinical monitoring plan', 'Risk management file', 'Investigator brochure'],
    supportsFilings: DEVICE_CLINICAL_FILINGS,
    references: ['ISO 14155', 'FDA guidance on non-inferiority clinical trials', 'ICH E6(R3) where applicable'],
    approvalRequired: true,
  },
  {
    id: 'human_factors_formative',
    label: 'Human-factors formative study',
    detail: 'full',
    evidenceClass: 'usability',
    purpose:
      'Find and fix use-related design problems while the design can still change. It informs the design and '
      + 'the critical-task list; it is not, on its own, validation evidence for a filing.',
    protocolSections: [
      'Device and user-interface description',
      'Use specification and user profiles',
      'Formative objectives',
      'Participants and scenarios',
      'Tasks under evaluation',
      'Findings and resulting design changes',
      'Link to the use-related risk analysis',
    ],
    designQuestions: [
      'Which use-related hazards and tasks are being explored, and does the task list trace to the use-related risk analysis?',
      'Are the participant groups representative, even if small, of the intended users?',
      'Is it explicit that this is iterative, pre-validation work and not evidence for a filing on its own?',
      'How do findings feed design changes and refine the critical-task list before the design is frozen for summative validation?',
    ],
    endpoints: [
      'Use difficulties, use errors and close calls observed',
      'Design problems identified and their disposition',
      'Refinements to the critical-task list carried into summative validation',
    ],
    typicalAcceptanceCriteria: [
      'Use-related design problems identified and addressed before validation — this is not a pass/fail study, and framing it as one misunderstands its role',
      'Findings traceable to specific design changes and to the use-related risk analysis',
    ],
    statisticalMethods: [
      'Qualitative; root-cause of observed difficulties, not hypothesis testing',
      'Findings-to-change traceability rather than a powered sample',
    ],
    requiredSupportingPlans: ['Use-related risk analysis', 'Usability engineering file', 'Moderator guide'],
    supportsFilings: ['us_510k', 'de_novo'],
    references: ['IEC 62366-1', 'FDA Applying Human Factors and Usability Engineering guidance'],
    approvalRequired: true,
  },
  {
    id: 'pmcf',
    label: 'Post-market clinical follow-up (PMCF)',
    detail: 'full',
    evidenceClass: 'postmarket',
    purpose:
      'Proactively confirm clinical safety and performance after MDR certification against the residual '
      + 'uncertainties named in the clinical evaluation, feeding the CER and PSUR rather than waiting for complaints.',
    protocolSections: [
      'PMCF objectives and residual clinical uncertainties',
      'Methods and data sources',
      'General versus specific PMCF activities',
      'Analysis plan',
      'Reporting and CER / PSUR linkage',
      'Justification where no PMCF is planned',
    ],
    designQuestions: [
      'Which residual clinical risks or uncertainties is this follow-up designed to reduce, and are they traceable to the clinical evaluation?',
      'Which methods apply — general (literature, registries, vigilance) or specific (PMCF studies, surveys) — and why are they sufficient?',
      'At what interval are the CER and PSUR updated, and how do findings feed the benefit-risk conclusion?',
      'Where no PMCF is planned, is the justification documented per MDCG 2020-7 rather than simply absent?',
    ],
    endpoints: [
      'Confirmed clinical safety and performance in real-world use against the premarket claims',
      'Emerging risks, previously unknown side effects, or off-label use',
      'Updated inputs to the benefit-risk determination',
    ],
    typicalAcceptanceCriteria: [
      'Residual uncertainties addressed on a documented plan, with the CER kept current',
      'A signal triggers CAPA and, where warranted, a field safety corrective action',
    ],
    statisticalMethods: [
      'Descriptive trending against the premarket clinical claims',
      'Pre-specified thresholds distinguishing expected variation from a signal',
    ],
    requiredSupportingPlans: ['PMCF plan (MDCG 2020-7)', 'PMCF evaluation report (MDCG 2020-8)', 'PSUR linkage'],
    supportsFilings: ['pmcf_plan', 'eu_mdr_technical_documentation', 'cer'],
    references: ['EU MDR 2017/745 Annex XIV Part B', 'MDCG 2020-7', 'MDCG 2020-8'],
    approvalRequired: true,
  },
  {
    id: 'registry',
    label: 'Registry',
    detail: 'full',
    evidenceClass: 'postmarket',
    purpose:
      'Collect longitudinal real-world data on a defined population to support long-term safety and '
      + 'performance, where the value turns on the completeness of follow-up and the relevance and reliability of the data.',
    protocolSections: [
      'Registry objectives and questions',
      'Target population and enrollment',
      'Core data elements and definitions',
      'Follow-up schedule and retention',
      'Data quality and completeness plan',
      'Governance and analysis plan',
    ],
    designQuestions: [
      'What specific safety or performance question does the registry answer, rather than being an open-ended data collection?',
      'Is the population enumerable and representative, and how is enrollment bias assessed?',
      'Are the core data elements defined to a standard so the data is relevant and reliable enough for the regulatory purpose?',
      'What follow-up duration and loss-to-follow-up handling make the long-term outcome interpretable?',
    ],
    endpoints: [
      'Long-term safety events and device performance or survival, with time-to-event',
      'Pre-specified outcomes across the enrolled population and key subgroups',
      'Completeness and data-quality metrics that qualify the conclusions',
    ],
    typicalAcceptanceCriteria: [
      'Data of sufficient relevance and reliability for the regulatory purpose, with follow-up and completeness adequate to the outcome',
      'Outcomes pre-specified, so the registry answers its question rather than mining for one',
    ],
    statisticalMethods: [
      'Time-to-event analysis (Kaplan-Meier, competing risks) with pre-specified outcomes',
      'Sensitivity analyses for missingness and confounding',
    ],
    requiredSupportingPlans: ['Registry protocol', 'Data management and quality plan', 'Statistical analysis plan', 'Governance charter'],
    supportsFilings: ['eu_mdr_technical_documentation', 'cer', 'pmcf_plan'],
    references: ['FDA "Use of Real-World Evidence to Support Regulatory Decision-Making" framework', 'EU MDR 2017/745 Annex XIV Part B (registries as a PMCF method)'],
    approvalRequired: true,
  },
  {
    id: 'postmarket_study',
    label: 'Post-market study',
    detail: 'full',
    evidenceClass: 'postmarket',
    purpose:
      'Answer a specific question raised after market authorization — often an authority condition of '
      + 'approval or a surveillance order — with a design sized to that question and milestones committed to the authority.',
    protocolSections: [
      'Objectives and regulatory basis',
      'Design',
      'Population and endpoints',
      'Analysis plan',
      'Milestones and reporting commitments',
      'Data monitoring',
    ],
    designQuestions: [
      'What specific question is being answered, and on what regulatory basis — a condition of approval, a 522 order, or an MDR requirement?',
      'Is the design adequate to answer that question with sufficient precision, and are the endpoints tied to it rather than generic?',
      'What enrollment and milestone timeline has been committed to the authority, and how is adherence monitored?',
      'How are results reported back to the authority, and on what schedule?',
    ],
    endpoints: [
      'The specific safety or effectiveness outcome the authority asked about',
      'Enrollment and milestone adherence against the committed timeline',
      'Adverse events and device deficiencies over the study period',
    ],
    typicalAcceptanceCriteria: [
      'The authority\'s question answered with adequate power or precision, not merely addressed',
      'The committed milestones met, or a deviation reported to the authority with a remediation plan',
    ],
    statisticalMethods: [
      'Pre-specified analysis matched to the specific question',
      'Interim reporting per the commitment to the authority',
    ],
    requiredSupportingPlans: ['Statistical analysis plan', 'Clinical monitoring plan', 'Milestone and reporting plan', 'Risk management file update'],
    supportsFilings: ['pma_supplement', 'eu_mdr_technical_documentation', 'cer'],
    references: ['FDA 522 Postmarket Surveillance Studies guidance', '21 CFR 814.82 (PMA conditions of approval)', 'EU MDR 2017/745 Articles 83-86'],
    approvalRequired: true,
  },
  {
    id: 'real_world_evidence',
    label: 'Real-world evidence study',
    detail: 'full',
    evidenceClass: 'postmarket',
    purpose:
      'Use routinely collected data to support a claim, where the whole difficulty is establishing that the '
      + 'data is fit for purpose and that confounding has been controlled rather than assumed away.',
    protocolSections: [
      'Objectives and regulatory question',
      'Data source and provenance',
      'Fitness-for-purpose: relevance and reliability',
      'Study design (including target-trial emulation)',
      'Confounding and bias control plan',
      'Analysis plan and sensitivity analyses',
    ],
    designQuestions: [
      'Is the data source fit for purpose — relevant to the question and reliable in its capture — per the FDA RWE framework?',
      'Is a target-trial-emulation design used to make the causal question and its assumptions explicit?',
      'How are confounding, missingness, misclassification and immortal-time bias identified and controlled?',
      'Is the protocol pre-specified and registered, so the analysis is not chosen after seeing the data?',
    ],
    endpoints: [
      'The pre-specified effectiveness or safety estimate',
      'Pre-specified sensitivity and negative-control analyses probing residual bias',
      'Data-quality and curation metrics that qualify the estimate',
    ],
    typicalAcceptanceCriteria: [
      'The data shown relevant and reliable for the specific claim, not assumed to be',
      'The estimate robust across pre-specified sensitivity analyses, with residual confounding quantified rather than dismissed',
    ],
    statisticalMethods: [
      'Target-trial emulation with propensity-score or covariate adjustment',
      'Quantitative bias analysis and negative-control outcomes; all pre-specified',
    ],
    requiredSupportingPlans: ['Pre-registered RWE protocol', 'Data curation and quality plan', 'Statistical analysis plan with sensitivity analyses'],
    supportsFilings: ['us_510k', 'pma_supplement', 'eu_mdr_technical_documentation', 'cer'],
    references: ['FDA "Framework for the Use of Real-World Evidence"', 'FDA RWD/RWE guidances', 'ENCePP / ISPOR good-practice recommendations for RWE'],
    approvalRequired: true,
  },
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
 * Archetypes declared but not yet specified to full depth.
 *
 * Currently empty — every archetype is full — but retained as the honesty
 * mechanism for the next one added: a scaffold-depth archetype must surface here
 * so a consumer can label it rather than presenting an outline-level skeleton as
 * a reviewed protocol specification. A regulatory writer told the frame is
 * complete will ship the gaps.
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
