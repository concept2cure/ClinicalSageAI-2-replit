/**
 * Biomarkers & Companion Diagnostics — Deterministic Knowledge Engine
 * ====================================================================
 *
 * Pure, closed-form, reproducible regulatory-science engines for biomarker
 * classification, qualification, companion-diagnostic (CDx) co-development,
 * analytical and clinical validation, and trial enrichment strategy.
 *
 * NO LLM. NO network. NO database. NO imports from other services.
 * Identical input always yields identical output.
 *
 * ── Authoritative sources grounding the rules below ─────────────────────────
 *  - FDA-NIH Biomarker Working Group, BEST (Biomarkers, EndpointS, and other
 *    Tools) Resource (2016, updated). Seven biomarker categories:
 *    diagnostic, prognostic, predictive, pharmacodynamic/response, monitoring,
 *    safety, susceptibility/risk.
 *  - 21st Century Cures Act of 2016, Section 3011 (Drug Development Tool [DDT]
 *    qualification, codified at FD&C Act Section 507).
 *  - FDA Biomarker Qualification: Evidentiary Framework (Guidance for Industry,
 *    Dec 2018). Context of Use (COU), evidentiary criteria scaled to benefit/risk,
 *    the three-stage qualification process (Letter of Intent, Qualification Plan,
 *    Full Qualification Package).
 *  - FDA "In Vitro Companion Diagnostic Devices" (Guidance for Industry and FDA
 *    Staff, Aug 2014).
 *  - FDA "Principles for Codevelopment of an In Vitro Companion Diagnostic Device
 *    with a Therapeutic Product" (Draft Guidance, Jul 2016).
 *  - FDA "Enrichment Strategies for Clinical Trials to Support Determination of
 *    Effectiveness of Human Drugs and Biological Products" (Guidance for Industry,
 *    Mar 2019).
 *  - FDA "Developing Targeted Therapies in Low-Frequency Molecular Subsets of a
 *    Disease" (Guidance, 2018).
 *  - CLSI analytical-validation standards: EP05 (precision), EP06 (linearity),
 *    EP07 (interference), EP09 (method comparison/bias), EP12 (qualitative
 *    performance), EP17 (LoB/LoD/LoQ), EP25 (stability), EP28 (reference
 *    intervals).
 *  - 21 CFR 809.10, 21 CFR 814 (PMA), 21 CFR 807 Subpart E (510(k)),
 *    21 CFR 814.20(b) (CDx/therapeutic cross-labeling).
 *  - ICH E16 (genomic biomarkers — qualification submissions), ICH E15
 *    (pharmacogenomics terminology).
 *
 * All citations are reproduced verbatim in the engine outputs. Callers MUST
 * relay the returned citations and numbers without alteration; a fabricated or
 * misattributed regulatory citation in a marketing application is a critical
 * defect.
 *
 * @module server/services/biomarkers/biomarker-knowledge
 */

// ════════════════════════════════════════════════════════════════════════════
// SHARED TYPES
// ════════════════════════════════════════════════════════════════════════════

/** A regulatory citation reproduced verbatim from a primary source. */
export interface Citation {
  /** Short source identifier, e.g. "FDA-NIH BEST Resource (2016)". */
  source: string;
  /** Specific section / page / clause reference. */
  reference: string;
  /** Verbatim or close-paraphrase statement of the cited rule. */
  statement: string;
}

/** Severity ranking used across engines for findings and warnings. */
export type Severity = 'info' | 'caution' | 'warning' | 'critical';

/** A single structured finding emitted by an engine. */
export interface Finding {
  severity: Severity;
  message: string;
}

/** The seven BEST biomarker categories. */
export type BiomarkerCategory =
  | 'diagnostic'
  | 'prognostic'
  | 'predictive'
  | 'pharmacodynamic_response'
  | 'monitoring'
  | 'safety'
  | 'susceptibility_risk';

/** Intended regulatory use of a biomarker in a development program. */
export type BiomarkerUse =
  | 'patient_selection'
  | 'enrichment'
  | 'stratification'
  | 'dose_selection'
  | 'efficacy_endpoint'
  | 'safety_monitoring'
  | 'screening'
  | 'risk_assessment'
  | 'disease_detection';

/** Measurement modality / assay platform class. */
export type AssayModality =
  | 'ihc'
  | 'pcr'
  | 'ngs'
  | 'fish'
  | 'elisa'
  | 'flow_cytometry'
  | 'mass_spectrometry'
  | 'sequencing_panel'
  | 'ctdna_liquid_biopsy'
  | 'imaging'
  | 'clinical_chemistry'
  | 'other';

/** Regulatory framework / jurisdiction for device-side rules. */
export type DeviceFramework = 'fda' | 'eu_ivdr' | 'pmda' | 'health_canada';

// ════════════════════════════════════════════════════════════════════════════
// REFERENCE TABLES (typed interfaces; NO `as const`)
// ════════════════════════════════════════════════════════════════════════════

/** Descriptor of one BEST biomarker category. */
interface CategoryDescriptor {
  category: BiomarkerCategory;
  /** Human-readable label. */
  label: string;
  /** BEST Resource definition (close paraphrase). */
  definition: string;
  /** Clinical question the category answers. */
  question: string;
  /** Canonical examples. */
  examples: string[];
  /** Regulatory/evidentiary implications of using a marker in this category. */
  evidentiaryImplications: string;
  /** Typical regulatory pathway when this category drives a label claim. */
  regulatoryPathway: string;
  /** Whether use as a basis for patient management generally implies CDx-level rigor. */
  highStakesForLabelClaim: boolean;
}

const CATEGORY_TABLE: CategoryDescriptor[] = [
  {
    category: 'diagnostic',
    label: 'Diagnostic biomarker',
    definition:
      'A biomarker used to detect or confirm presence of a disease or condition of interest, ' +
      'or to identify an individual with a subtype of the disease.',
    question: 'Does this patient have the disease (or this molecular subtype)?',
    examples: [
      'BCR-ABL fusion transcript confirming chronic myeloid leukemia',
      'Elevated blood glucose / HbA1c confirming diabetes mellitus',
      'Sweat chloride for cystic fibrosis',
    ],
    evidentiaryImplications:
      'Must demonstrate diagnostic accuracy (clinical sensitivity/specificity, PPV/NPV) against a ' +
      'reference standard. When the result drives whether a therapy is given, the test is typically ' +
      'a companion diagnostic and requires analytical + clinical validation co-developed with the drug.',
    regulatoryPathway:
      'IVD clearance/approval (510(k) or PMA); CDx via PMA when paired with a specific therapeutic.',
    highStakesForLabelClaim: true,
  },
  {
    category: 'prognostic',
    label: 'Prognostic biomarker',
    definition:
      'A biomarker used to identify likelihood of a clinical event, disease recurrence, or ' +
      'progression in patients who have the disease or medical condition of interest.',
    question: 'How is this patient likely to fare over time, irrespective of treatment?',
    examples: [
      'Oncotype DX recurrence score in early breast cancer',
      'BRCA1/2 germline status for ovarian cancer recurrence risk',
      'Tumor stage / grade for disease-free survival',
    ],
    evidentiaryImplications:
      'Must show association with outcome independent of (or adjusted for) treatment. A prognostic ' +
      'marker informs the natural history and can drive PROGNOSTIC ENRICHMENT (selecting patients ' +
      'more likely to have events to increase absolute event rates and trial power) but does NOT by ' +
      'itself predict differential treatment benefit.',
    regulatoryPathway:
      'Biomarker qualification (DDT) for use across programs, or drug-specific submission within an ' +
      'IND/NDA/BLA; device clearance if used as a marketed test.',
    highStakesForLabelClaim: false,
  },
  {
    category: 'predictive',
    label: 'Predictive biomarker',
    definition:
      'A biomarker used to identify individuals who are more likely than similar individuals without ' +
      'the biomarker to experience a favorable or unfavorable effect from exposure to a medical product ' +
      'or environmental agent.',
    question: 'Is this patient more (or less) likely to benefit from THIS treatment?',
    examples: [
      'EGFR exon-19/L858R mutations predicting response to EGFR-TKIs in NSCLC',
      'HER2 amplification predicting response to trastuzumab',
      'BRAF V600E predicting response to BRAF inhibitors in melanoma',
    ],
    evidentiaryImplications:
      'Requires demonstration of a BIOMARKER-BY-TREATMENT INTERACTION — differential treatment effect ' +
      'between biomarker-positive and biomarker-negative subgroups (ideally from a randomized trial ' +
      'with both subgroups, or a marker-stratified design). This is the canonical basis for a ' +
      'companion diagnostic and PREDICTIVE ENRICHMENT.',
    regulatoryPathway:
      'Co-developed companion diagnostic (PMA, usually Class III) cross-labeled with the therapeutic; ' +
      'drug label restricts indicated population to biomarker-defined subset.',
    highStakesForLabelClaim: true,
  },
  {
    category: 'pharmacodynamic_response',
    label: 'Pharmacodynamic / response biomarker',
    definition:
      'A biomarker that changes in response to exposure to a medical product or environmental agent, ' +
      'demonstrating that a biological response has occurred in an individual.',
    question: 'Is the drug having its intended biological effect (and at what dose)?',
    examples: [
      'LDL-cholesterol reduction in response to a statin or PCSK9 inhibitor',
      'Target receptor occupancy on PET imaging',
      'Viral load decline in response to antiviral therapy',
    ],
    evidentiaryImplications:
      'Supports proof-of-mechanism, dose selection, and go/no-go decisions. A PD marker is NOT ' +
      'automatically a surrogate endpoint; surrogacy requires demonstrating that the marker reliably ' +
      'predicts clinical benefit. Used early to de-risk Phase 1/2 decisions.',
    regulatoryPathway:
      'Biomarker qualification for dose-finding / PoM use, or drug-specific use in IND; surrogate ' +
      'endpoint qualification is a separate, higher bar (accelerated-approval surrogate).',
    highStakesForLabelClaim: false,
  },
  {
    category: 'monitoring',
    label: 'Monitoring biomarker',
    definition:
      'A biomarker measured serially for assessing status of a disease or medical condition, or for ' +
      'evidence of exposure to (or effect of) a medical product or environmental agent.',
    question: 'How is the disease / treatment effect tracking over repeated measurements?',
    examples: [
      'INR for warfarin anticoagulation monitoring',
      'Minimal residual disease (MRD) in leukemia',
      'HbA1c trended over time in diabetes management',
    ],
    evidentiaryImplications:
      'Requires demonstration of measurement stability/reproducibility over time and a meaningful ' +
      'relationship between serial changes and disease status. Pre-analytical control and longitudinal ' +
      'assay drift are central validation concerns.',
    regulatoryPathway:
      'IVD clearance for the marketed monitoring test; biomarker qualification when used as a trial ' +
      'monitoring tool across programs.',
    highStakesForLabelClaim: false,
  },
  {
    category: 'safety',
    label: 'Safety biomarker',
    definition:
      'A biomarker measured before or after an exposure to a medical product or environmental agent to ' +
      'indicate the likelihood, presence, or extent of toxicity as an adverse effect.',
    question: 'Is this product causing (or likely to cause) organ toxicity?',
    examples: [
      'ALT/AST and total bilirubin for drug-induced liver injury (Hy’s Law)',
      'KIM-1, clusterin, and other renal safety biomarkers (PSTC-qualified)',
      'Troponin for drug-induced cardiotoxicity',
    ],
    evidentiaryImplications:
      'Must link marker change to a defined toxicity with adequate sensitivity for early detection. ' +
      'Safety biomarkers are frequent targets of cross-program DDT qualification (e.g., the Predictive ' +
      'Safety Testing Consortium nephrotoxicity panel) because the COU generalizes across compounds.',
    regulatoryPathway:
      'Biomarker qualification (DDT) for nonclinical and/or clinical safety monitoring; can also be ' +
      'used drug-specifically to define stopping rules.',
    highStakesForLabelClaim: false,
  },
  {
    category: 'susceptibility_risk',
    label: 'Susceptibility / risk biomarker',
    definition:
      'A biomarker that indicates the potential for developing a disease or medical condition in an ' +
      'individual who does not currently have clinically apparent disease.',
    question: 'What is this (currently healthy) person’s risk of developing the disease?',
    examples: [
      'BRCA1/2 germline mutation and lifetime breast/ovarian cancer risk',
      'Lp(a) and cardiovascular risk',
      'APOE ε4 genotype and Alzheimer’s disease risk',
    ],
    evidentiaryImplications:
      'Requires prospective association with disease incidence in currently unaffected individuals; ' +
      'clinical utility (does acting on the marker improve outcomes?) is distinct from validity and is ' +
      'often the harder bar. Screening-population PPV is strongly prevalence-dependent.',
    regulatoryPathway:
      'IVD clearance for marketed risk tests; risk markers rarely act as CDx but may guide preventive ' +
      'trial enrichment.',
    highStakesForLabelClaim: false,
  },
];

/** Mapping of intended use to the BEST categories that can support it. */
interface UseToCategory {
  use: BiomarkerUse;
  supportingCategories: BiomarkerCategory[];
  note: string;
}

const USE_CATEGORY_TABLE: UseToCategory[] = [
  {
    use: 'patient_selection',
    supportingCategories: ['predictive', 'diagnostic'],
    note:
      'Selecting who receives a therapy is a predictive/diagnostic use and is the canonical companion ' +
      'diagnostic scenario; it carries the highest evidentiary and device burden.',
  },
  {
    use: 'enrichment',
    supportingCategories: ['predictive', 'prognostic'],
    note:
      'Predictive enrichment selects likely responders; prognostic enrichment selects high-event-rate ' +
      'patients. The category determines which enrichment type is justified.',
  },
  {
    use: 'stratification',
    supportingCategories: ['prognostic', 'predictive'],
    note:
      'Randomization stratified by a prognostic/predictive marker balances arms and enables pre-specified ' +
      'subgroup analysis without restricting enrollment.',
  },
  {
    use: 'dose_selection',
    supportingCategories: ['pharmacodynamic_response'],
    note: 'PD/response markers establish the exposure-response relationship used to select dose.',
  },
  {
    use: 'efficacy_endpoint',
    supportingCategories: ['pharmacodynamic_response', 'monitoring'],
    note:
      'Use as an efficacy endpoint (especially a surrogate) is a separate and higher bar than PD use; ' +
      'surrogacy must be independently justified.',
  },
  {
    use: 'safety_monitoring',
    supportingCategories: ['safety', 'monitoring'],
    note: 'Safety and monitoring categories support stopping rules and toxicity surveillance.',
  },
  {
    use: 'screening',
    supportingCategories: ['diagnostic', 'susceptibility_risk'],
    note: 'Screening unaffected populations is strongly prevalence-sensitive (low PPV at low prevalence).',
  },
  {
    use: 'risk_assessment',
    supportingCategories: ['susceptibility_risk', 'prognostic'],
    note: 'Risk markers act in unaffected individuals; prognostic markers act in those already diseased.',
  },
  {
    use: 'disease_detection',
    supportingCategories: ['diagnostic', 'monitoring'],
    note: 'Detection/confirmation of disease is a diagnostic use; serial detection is monitoring.',
  },
];

/** COU impact tier and the evidentiary expectation it triggers. */
interface CouImpactTier {
  tier: 'low' | 'moderate' | 'high';
  description: string;
  evidentiaryExpectation: string;
  exampleCou: string;
}

const COU_IMPACT_TABLE: CouImpactTier[] = [
  {
    tier: 'low',
    description:
      'Biomarker informs internal decisions with limited consequence if wrong (e.g., exploratory ' +
      'go/no-go, non-pivotal dose ranging), or supplements other established measures.',
    evidentiaryExpectation:
      'Lighter evidentiary package: plausible biological rationale, analytical reliability sufficient ' +
      'for the decision, and supportive (often observational) clinical association data.',
    exampleCou:
      'Use a PD marker to support internal dose-selection decisions in early-phase trials of a class.',
  },
  {
    tier: 'moderate',
    description:
      'Biomarker influences trial conduct or interpretation with moderate consequence (e.g., ' +
      'stratification, secondary endpoint, safety monitoring with confirmatory follow-up).',
    evidentiaryExpectation:
      'Moderate package: robust analytical validation, a coherent body of clinical evidence ' +
      'establishing the marker-outcome relationship, and quantified performance with uncertainty.',
    exampleCou:
      'Use a safety biomarker to trigger enhanced monitoring / additional testing in clinical trials.',
  },
  {
    tier: 'high',
    description:
      'Biomarker drives consequential patient-level or regulatory decisions (e.g., patient selection, ' +
      'trial enrichment that excludes patients, a basis for efficacy or approval).',
    evidentiaryExpectation:
      'Most rigorous package: complete analytical validation to the level of the intended assay, ' +
      'strong (ideally prospective and/or randomized) clinical evidence with replication, and explicit ' +
      'characterization of false-positive/false-negative consequences.',
    exampleCou:
      'Use a predictive biomarker to select patients for a therapy as the basis of an indication.',
  },
];

/** Stage descriptor for the FDA Biomarker Qualification (DDT) process. */
interface QualificationStage {
  stage: number;
  name: string;
  fdaSubmission: string;
  purpose: string;
  keyDeliverables: string[];
}

const QUALIFICATION_STAGE_TABLE: QualificationStage[] = [
  {
    stage: 1,
    name: 'Letter of Intent (LOI)',
    fdaSubmission: 'Letter of Intent to the relevant DDT qualification program',
    purpose:
      'Initiate the qualification process: describe the biomarker, the proposed Context of Use, and ' +
      'the need it addresses. FDA decides whether to accept the submission into the program.',
    keyDeliverables: [
      'Biomarker identity and measurement method (summary level)',
      'Draft Context of Use statement',
      'Statement of need and proposed benefit to drug development',
      'Identification of the requesting party (often a consortium)',
    ],
  },
  {
    stage: 2,
    name: 'Qualification Plan (QP)',
    fdaSubmission: 'Qualification Plan submission and FDA feedback',
    purpose:
      'Define the evidentiary strategy: agree with FDA on the studies, analyses, and acceptance ' +
      'criteria needed to support the COU before generating the full dataset.',
    keyDeliverables: [
      'Refined Context of Use',
      'Analytical validation strategy and acceptance criteria',
      'Clinical/biological evidence plan and statistical analysis plan',
      'Benefit/risk and consequence-of-error framing scaled to the COU',
    ],
  },
  {
    stage: 3,
    name: 'Full Qualification Package (FQP)',
    fdaSubmission: 'Full Qualification Package and FDA qualification determination',
    purpose:
      'Submit the complete evidentiary package for FDA review; a successful review yields a ' +
      'qualification determination and a published qualification recommendation for the stated COU.',
    keyDeliverables: [
      'Complete analytical validation report',
      'Complete clinical/biological evidence supporting the COU',
      'Integrated benefit/risk assessment',
      'Final Context of Use as qualified',
    ],
  },
];

/** Analytical validation parameter descriptor (CLSI-grounded). */
interface AnalyticalParameter {
  key:
    | 'accuracy_trueness'
    | 'precision'
    | 'analytical_sensitivity'
    | 'analytical_specificity'
    | 'reportable_range'
    | 'robustness'
    | 'preanalytical';
  label: string;
  definition: string;
  clsiReference: string;
  typicalAcceptance: string;
}

const ANALYTICAL_PARAM_TABLE: AnalyticalParameter[] = [
  {
    key: 'accuracy_trueness',
    label: 'Accuracy / trueness (bias)',
    definition:
      'Closeness of agreement between the measured value and an accepted reference (true) value. For ' +
      'quantitative assays assessed as bias via method comparison; for qualitative assays as concordance ' +
      'with a reference method or clinical truth.',
    clsiReference: 'CLSI EP09 (method comparison & bias); EP12 for qualitative concordance',
    typicalAcceptance:
      'Bias within predefined total-allowable-error budget; for qualitative tests, positive/negative ' +
      'percent agreement (PPA/NPA) meeting prespecified thresholds (commonly ≥ 90% with adequate CI).',
  },
  {
    key: 'precision',
    label: 'Precision (repeatability & reproducibility)',
    definition:
      'Closeness of agreement among independent results under stipulated conditions. Repeatability ' +
      '(within-run), intermediate precision (between-day/operator/instrument), and reproducibility ' +
      '(between-site/lot) characterize random error.',
    clsiReference: 'CLSI EP05 (precision evaluation); multi-site reproducibility',
    typicalAcceptance:
      'CV% within prespecified limits across levels spanning the medically relevant range; for ' +
      'qualitative tests, high agreement near the cutoff (C5–C95 interval characterized).',
  },
  {
    key: 'analytical_sensitivity',
    label: 'Analytical sensitivity (LoB / LoD / LoQ)',
    definition:
      'Smallest amount of analyte reliably detected/quantified. Limit of Blank (LoB), Limit of ' +
      'Detection (LoD), and Limit of Quantitation (LoQ) define the low-end performance.',
    clsiReference: 'CLSI EP17 (detection capability)',
    typicalAcceptance:
      'LoD established at ≤ the lowest clinically meaningful concentration; LoQ meets prespecified ' +
      'precision/accuracy at the low end (e.g., for ctDNA, a defined variant allele fraction).',
  },
  {
    key: 'analytical_specificity',
    label: 'Analytical specificity (interference & cross-reactivity)',
    definition:
      'Ability to measure the intended analyte in the presence of potential interferents (hemolysis, ' +
      'lipemia, icterus, drugs, related molecules) without cross-reactivity to non-target species.',
    clsiReference: 'CLSI EP07 (interference testing)',
    typicalAcceptance:
      'No clinically significant interference at defined interferent concentrations; documented ' +
      'cross-reactivity profile (e.g., homologous gene regions for NGS panels).',
  },
  {
    key: 'reportable_range',
    label: 'Reportable range / linearity',
    definition:
      'Span of analyte values over which the assay yields valid, linear (for quantitative) results ' +
      'without dilution/concentration, between LoQ and the upper limit.',
    clsiReference: 'CLSI EP06 (linearity / measuring interval)',
    typicalAcceptance:
      'Linearity demonstrated across the analytical measuring interval; dilution recovery established ' +
      'for values above the upper limit.',
  },
  {
    key: 'robustness',
    label: 'Robustness / ruggedness',
    definition:
      'Capacity of the assay to remain unaffected by small, deliberate variations in method parameters ' +
      '(reagent lots, incubation times/temperatures, operators, instruments).',
    clsiReference: 'CLSI EP05/EP25 (reproducibility & stability under varied conditions)',
    typicalAcceptance:
      'Performance maintained within acceptance limits across deliberately varied conditions and ' +
      'reagent lots; guard-banding of critical parameters documented.',
  },
  {
    key: 'preanalytical',
    label: 'Pre-analytical factors & specimen stability',
    definition:
      'Effects of specimen type, collection, handling, transport, storage, and processing time on the ' +
      'measured result; defines acceptable specimen conditions.',
    clsiReference: 'CLSI EP25 (specimen stability); GP-series pre-analytical guidance',
    typicalAcceptance:
      'Documented acceptable specimen types, anticoagulants, time-to-fixation/processing, storage ' +
      'temperature and freeze-thaw limits; out-of-range specimens flagged as invalid.',
  },
];

/** Citation library reused across engines. */
interface NamedCitation {
  id: string;
  citation: Citation;
}

const CITATION_LIBRARY: NamedCitation[] = [
  {
    id: 'best',
    citation: {
      source: 'FDA-NIH Biomarker Working Group, BEST Resource (2016, updated)',
      reference: 'BEST Glossary — Biomarker categories',
      statement:
        'BEST defines seven biomarker categories: susceptibility/risk, diagnostic, monitoring, ' +
        'prognostic, predictive, pharmacodynamic/response, and safety.',
    },
  },
  {
    id: 'cures_act',
    citation: {
      source: '21st Century Cures Act (2016), Section 3011',
      reference: 'FD&C Act Section 507 (Qualification of Drug Development Tools)',
      statement:
        'Establishes the statutory framework for FDA qualification of drug development tools, ' +
        'including biomarkers, for a specified context of use.',
    },
  },
  {
    id: 'bq_framework',
    citation: {
      source: 'FDA Biomarker Qualification: Evidentiary Framework (Guidance, Dec 2018)',
      reference: 'Sections on Context of Use and evidentiary scaling',
      statement:
        'The evidence needed to qualify a biomarker scales with the benefit/risk and consequences of ' +
        'error implied by the Context of Use; the COU defines the biomarker category and intended use.',
    },
  },
  {
    id: 'ich_e16',
    citation: {
      source: 'ICH E16 (Genomic Biomarkers — Qualification Submissions)',
      reference: 'ICH E16 Guideline',
      statement:
        'Provides a harmonized structure for the data submission supporting genomic biomarker ' +
        'qualification, including context of use.',
    },
  },
  {
    id: 'cdx_2014',
    citation: {
      source: 'FDA In Vitro Companion Diagnostic Devices (Guidance, Aug 2014)',
      reference: 'Definition and contemporaneous development principle',
      statement:
        'An IVD companion diagnostic provides information essential for the safe and effective use of ' +
        'a corresponding therapeutic product and should generally be developed and approved or cleared ' +
        'contemporaneously with the therapeutic.',
    },
  },
  {
    id: 'cdx_codev_2016',
    citation: {
      source: 'FDA Principles for Codevelopment of an IVD CDx with a Therapeutic Product (Draft, Jul 2016)',
      reference: 'Co-development principles',
      statement:
        'Therapeutic and companion diagnostic development should be planned jointly so that an ' +
        'analytically and clinically validated diagnostic is available at the time of therapeutic approval; ' +
        'the clinical trial assay used to enroll the pivotal trial must be bridged to the market-ready IVD.',
    },
  },
  {
    id: 'enrichment_2019',
    citation: {
      source: 'FDA Enrichment Strategies for Clinical Trials (Guidance, Mar 2019)',
      reference: 'Prognostic and predictive enrichment',
      statement:
        'Enrichment is the prospective use of patient characteristics to select a study population in ' +
        'which a drug effect can more readily be detected. Prognostic enrichment selects higher-risk ' +
        'patients; predictive enrichment selects those more likely to respond to the specific mechanism.',
    },
  },
  {
    id: 'cfr_80910',
    citation: {
      source: '21 CFR 809.10',
      reference: 'Labeling for in vitro diagnostic products',
      statement: 'Specifies labeling content requirements for in vitro diagnostic products.',
    },
  },
  {
    id: 'cfr_814',
    citation: {
      source: '21 CFR Part 814',
      reference: 'Premarket Approval (PMA) of medical devices',
      statement: 'Governs PMA, the pathway typically used for Class III companion diagnostics.',
    },
  },
  {
    id: 'cfr_807e',
    citation: {
      source: '21 CFR Part 807, Subpart E',
      reference: 'Premarket notification 510(k)',
      statement: 'Governs 510(k) premarket notification for devices demonstrating substantial equivalence.',
    },
  },
  {
    id: 'clsi_ep17',
    citation: {
      source: 'CLSI EP17',
      reference: 'Evaluation of Detection Capability for Clinical Laboratory Measurement Procedures',
      statement: 'Defines protocols to establish Limit of Blank (LoB), Limit of Detection (LoD), and Limit of Quantitation (LoQ).',
    },
  },
  {
    id: 'clsi_ep05',
    citation: {
      source: 'CLSI EP05',
      reference: 'Evaluation of Precision of Quantitative Measurement Procedures',
      statement: 'Defines repeatability and within-laboratory (intermediate) precision study designs.',
    },
  },
  {
    id: 'clsi_ep09',
    citation: {
      source: 'CLSI EP09',
      reference: 'Measurement Procedure Comparison and Bias Estimation Using Patient Samples',
      statement: 'Defines method-comparison studies for estimating systematic bias against a comparator.',
    },
  },
  {
    id: 'clsi_ep12',
    citation: {
      source: 'CLSI EP12',
      reference: 'Evaluation of Qualitative, Binary Output Examination Performance',
      statement: 'Defines evaluation of qualitative test performance including agreement near the cutoff.',
    },
  },
];

// ════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS (pure)
// ════════════════════════════════════════════════════════════════════════════

function cite(id: string): Citation {
  const found = CITATION_LIBRARY.find((c: NamedCitation): boolean => c.id === id);
  if (!found) {
    return {
      source: 'Unknown source',
      reference: id,
      statement: 'Citation identifier not found in library.',
    };
  }
  return found.citation;
}

function categoryDescriptor(category: BiomarkerCategory): CategoryDescriptor {
  const found = CATEGORY_TABLE.find(
    (c: CategoryDescriptor): boolean => c.category === category,
  );
  // CATEGORY_TABLE is exhaustive over BiomarkerCategory; fallback kept for safety.
  return found ?? CATEGORY_TABLE[0];
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function uniqueStrings(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 1 — classifyBiomarker
// ════════════════════════════════════════════════════════════════════════════

export interface ClassifyBiomarkerParams {
  /** Free-text or canonical biomarker name. */
  biomarkerName: string;
  /** Optionally assert a category; otherwise inferred from intendedUse + clinicalQuestion. */
  assertedCategory?: BiomarkerCategory;
  /** Intended regulatory use of the biomarker in the program. */
  intendedUse?: BiomarkerUse;
  /** Whether the marker measures a treatment-by-marker interaction (predictive signature). */
  predictsDifferentialTreatmentEffect?: boolean;
  /** Whether the marker is measured in individuals who do NOT yet have the disease. */
  measuredInUnaffectedIndividuals?: boolean;
  /** Whether the marker changes in response to the product (PD). */
  changesWithExposure?: boolean;
  /** Whether the marker is measured serially over time. */
  measuredSerially?: boolean;
  /** Whether the marker indicates toxicity / adverse effect. */
  indicatesToxicity?: boolean;
  /** Whether the marker confirms presence/subtype of disease. */
  confirmsDisease?: boolean;
  /** Disease / therapeutic area context (free text). */
  diseaseContext?: string;
}

export interface ClassifyBiomarkerResult {
  biomarkerName: string;
  category: BiomarkerCategory;
  categoryLabel: string;
  definition: string;
  clinicalQuestion: string;
  inferred: boolean;
  inferenceBasis: string;
  examples: string[];
  evidentiaryImplications: string;
  regulatoryPathway: string;
  highStakesForLabelClaim: boolean;
  supportedUses: BiomarkerUse[];
  cdxLikely: boolean;
  cautions: Finding[];
  citations: Citation[];
}

function inferCategory(
  params: ClassifyBiomarkerParams,
): { category: BiomarkerCategory; basis: string } {
  // Deterministic precedence reflecting BEST distinctions.
  if (params.predictsDifferentialTreatmentEffect === true) {
    return {
      category: 'predictive',
      basis:
        'Marker reported to predict differential treatment effect (biomarker-by-treatment interaction), ' +
        'the defining feature of a predictive biomarker.',
    };
  }
  if (params.indicatesToxicity === true) {
    return {
      category: 'safety',
      basis: 'Marker indicates likelihood/presence/extent of toxicity — a safety biomarker.',
    };
  }
  if (params.measuredInUnaffectedIndividuals === true) {
    return {
      category: 'susceptibility_risk',
      basis:
        'Marker measured in individuals without clinically apparent disease to indicate future risk — ' +
        'a susceptibility/risk biomarker.',
    };
  }
  if (params.changesWithExposure === true) {
    return {
      category: 'pharmacodynamic_response',
      basis: 'Marker changes in response to product exposure — a pharmacodynamic/response biomarker.',
    };
  }
  if (params.confirmsDisease === true && params.measuredSerially !== true) {
    return {
      category: 'diagnostic',
      basis: 'Marker detects/confirms presence or subtype of disease — a diagnostic biomarker.',
    };
  }
  if (params.measuredSerially === true) {
    return {
      category: 'monitoring',
      basis: 'Marker measured serially to assess disease/treatment status — a monitoring biomarker.',
    };
  }
  // Fall back to intended-use mapping.
  if (params.intendedUse) {
    const mapping = USE_CATEGORY_TABLE.find(
      (u: UseToCategory): boolean => u.use === params.intendedUse,
    );
    if (mapping && mapping.supportingCategories.length > 0) {
      return {
        category: mapping.supportingCategories[0],
        basis:
          'Inferred from intended use "' +
          params.intendedUse +
          '": ' +
          mapping.note,
      };
    }
  }
  return {
    category: 'prognostic',
    basis:
      'Insufficient distinguishing features supplied; defaulted to prognostic. Provide ' +
      'predictsDifferentialTreatmentEffect / confirmsDisease / changesWithExposure / indicatesToxicity / ' +
      'measuredInUnaffectedIndividuals / measuredSerially for a precise classification.',
  };
}

/**
 * Classify a biomarker per the FDA-NIH BEST Resource into one of the seven
 * categories and return the regulatory/evidentiary implications of that category.
 *
 * Deterministic: classification follows a fixed precedence over the supplied
 * distinguishing features (or an asserted category), never an LLM.
 */
export function classifyBiomarker(
  params: ClassifyBiomarkerParams,
): ClassifyBiomarkerResult {
  let category: BiomarkerCategory;
  let inferred: boolean;
  let basis: string;

  if (params.assertedCategory) {
    category = params.assertedCategory;
    inferred = false;
    basis = 'Category asserted by caller; not inferred.';
  } else {
    const inf = inferCategory(params);
    category = inf.category;
    inferred = true;
    basis = inf.basis;
  }

  const desc = categoryDescriptor(category);

  // Supported uses: every use whose supporting categories include this category.
  const supportedUses = (USE_CATEGORY_TABLE.filter((u: UseToCategory): boolean =>
    u.supportingCategories.includes(category),
  )).map((u: UseToCategory): BiomarkerUse => u.use);

  const cautions: Finding[] = [];

  // Cross-check asserted category against distinguishing features.
  if (
    params.assertedCategory === 'predictive' &&
    params.predictsDifferentialTreatmentEffect === false
  ) {
    cautions.push({
      severity: 'critical',
      message:
        'Asserted PREDICTIVE but predictsDifferentialTreatmentEffect=false. A predictive claim REQUIRES ' +
        'evidence of a biomarker-by-treatment interaction; without it the marker is at most prognostic. ' +
        'Mislabeling a prognostic marker as predictive can wrongly restrict a label population.',
    });
  }
  if (
    params.assertedCategory === 'prognostic' &&
    params.predictsDifferentialTreatmentEffect === true
  ) {
    cautions.push({
      severity: 'warning',
      message:
        'Marker reportedly predicts differential treatment effect yet asserted as prognostic. ' +
        'Re-examine: a treatment-interaction signal implies a PREDICTIVE classification.',
    });
  }
  if (category === 'pharmacodynamic_response' && params.intendedUse === 'efficacy_endpoint') {
    cautions.push({
      severity: 'warning',
      message:
        'Using a PD/response marker as an efficacy endpoint requires separate surrogate-endpoint ' +
        'justification; PD activity alone does not establish that the marker predicts clinical benefit.',
    });
  }
  if (
    (category === 'diagnostic' || category === 'predictive') &&
    (params.intendedUse === 'patient_selection' || desc.highStakesForLabelClaim)
  ) {
    cautions.push({
      severity: 'caution',
      message:
        'This category, used for patient selection / label claims, generally triggers companion-diagnostic ' +
        'level rigor (analytical + clinical validation co-developed with the therapeutic).',
    });
  }
  if (category === 'susceptibility_risk' && params.intendedUse === 'screening') {
    cautions.push({
      severity: 'caution',
      message:
        'Screening unaffected populations is prevalence-sensitive: PPV falls sharply at low prevalence ' +
        'even with high analytical performance. Evaluate clinical utility, not just validity.',
    });
  }

  const cdxLikely =
    (category === 'predictive' || category === 'diagnostic') &&
    (params.intendedUse === 'patient_selection' ||
      params.predictsDifferentialTreatmentEffect === true ||
      desc.highStakesForLabelClaim);

  const citations: Citation[] = [cite('best')];
  if (cdxLikely) {
    citations.push(cite('cdx_2014'));
  }
  if (category === 'safety' || category === 'monitoring' || category === 'pharmacodynamic_response') {
    citations.push(cite('cures_act'));
    citations.push(cite('bq_framework'));
  }

  return {
    biomarkerName: params.biomarkerName,
    category,
    categoryLabel: desc.label,
    definition: desc.definition,
    clinicalQuestion: desc.question,
    inferred,
    inferenceBasis: basis,
    examples: desc.examples.slice(),
    evidentiaryImplications: desc.evidentiaryImplications,
    regulatoryPathway: desc.regulatoryPathway,
    highStakesForLabelClaim: desc.highStakesForLabelClaim,
    supportedUses,
    cdxLikely,
    cautions,
    citations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 2 — planBiomarkerQualification
// ════════════════════════════════════════════════════════════════════════════

export interface PlanBiomarkerQualificationParams {
  biomarkerName: string;
  category: BiomarkerCategory;
  /** Plain-language statement of how/where the biomarker will be used. */
  proposedContextOfUse: string;
  /** Consequence/impact tier of the COU (drives evidentiary scaling). */
  couImpact?: 'low' | 'moderate' | 'high';
  /** Whether intended for use across multiple drug-development programs. */
  crossProgramUse?: boolean;
  /** Whether the marker is genomic (engages ICH E16 structure). */
  isGenomic?: boolean;
  /** Whether a consortium is sponsoring (typical for DDT qualification). */
  consortiumSponsored?: boolean;
  /** Whether the marker is intended only for one specific drug. */
  singleDrugOnly?: boolean;
}

export interface QualificationStageOutput {
  stage: number;
  name: string;
  fdaSubmission: string;
  purpose: string;
  keyDeliverables: string[];
}

export interface PlanBiomarkerQualificationResult {
  biomarkerName: string;
  category: BiomarkerCategory;
  contextOfUse: string;
  couImpactTier: 'low' | 'moderate' | 'high';
  couImpactDescription: string;
  evidentiaryExpectation: string;
  recommendedPathway: 'ddt_qualification' | 'drug_specific_submission';
  pathwayRationale: string;
  stages: QualificationStageOutput[];
  evidentiaryCriteria: string[];
  analyticalValidationNeeded: boolean;
  clinicalEvidenceNeeded: string;
  findings: Finding[];
  citations: Citation[];
}

/**
 * Plan an FDA biomarker qualification: define the COU, scale evidentiary criteria
 * to COU impact, choose qualification (DDT) vs drug-specific submission, and lay
 * out the three-stage process (LOI -> QP -> FQP).
 *
 * Deterministic.
 */
export function planBiomarkerQualification(
  params: PlanBiomarkerQualificationParams,
): PlanBiomarkerQualificationResult {
  const desc = categoryDescriptor(params.category);

  // Determine impact tier (explicit, else inferred from category + cross-program).
  let tier: 'low' | 'moderate' | 'high';
  if (params.couImpact) {
    tier = params.couImpact;
  } else if (params.category === 'predictive' || params.category === 'diagnostic') {
    tier = 'high';
  } else if (params.category === 'safety' || params.category === 'monitoring') {
    tier = 'moderate';
  } else {
    tier = 'low';
  }

  const tierDesc = COU_IMPACT_TABLE.find(
    (t: CouImpactTier): boolean => t.tier === tier,
  ) ?? COU_IMPACT_TABLE[0];

  // Pathway: DDT qualification for cross-program/consortium use; drug-specific otherwise.
  const recommendedPathway: 'ddt_qualification' | 'drug_specific_submission' =
    params.singleDrugOnly === true
      ? 'drug_specific_submission'
      : params.crossProgramUse === true || params.consortiumSponsored === true
        ? 'ddt_qualification'
        : 'drug_specific_submission';

  const pathwayRationale =
    recommendedPathway === 'ddt_qualification'
      ? 'Cross-program / consortium intent favors formal DDT qualification under FD&C Act §507: once ' +
        'qualified for the COU, the biomarker can be relied upon across programs without re-establishing ' +
        'its validity in each submission.'
      : 'Use confined to a single drug program is most efficiently supported by a drug-specific submission ' +
        '(IND/NDA/BLA), where the biomarker is justified in the context of that application rather than ' +
        'formally qualified for general reuse.';

  const stages: QualificationStageOutput[] = QUALIFICATION_STAGE_TABLE.map(
    (s: QualificationStage): QualificationStageOutput => ({
      stage: s.stage,
      name: s.name,
      fdaSubmission: s.fdaSubmission,
      purpose: s.purpose,
      keyDeliverables: s.keyDeliverables.slice(),
    }),
  );

  // Evidentiary criteria scaled to tier.
  const evidentiaryCriteria: string[] = [
    'Biological rationale linking the biomarker to the underlying mechanism/outcome in the COU.',
    'Analytical validation appropriate to the measurement and the consequence of error.',
  ];
  if (tier === 'low') {
    evidentiaryCriteria.push(
      'Supportive clinical/biological association data (may be observational) consistent with the COU.',
      'Documented limitations and the bounded set of decisions the marker may inform.',
    );
  } else if (tier === 'moderate') {
    evidentiaryCriteria.push(
      'A coherent body of clinical evidence quantifying the marker-outcome relationship with uncertainty.',
      'Robust multi-condition analytical validation including reproducibility across sites/lots.',
      'Pre-specified acceptance criteria agreed with FDA in the Qualification Plan.',
    );
  } else {
    evidentiaryCriteria.push(
      'Strong clinical evidence — ideally prospective and/or randomized with replication — establishing ' +
        'the marker-outcome (or marker-by-treatment) relationship.',
      'Complete analytical validation to the level of the intended decision (CLSI EP-series).',
      'Explicit characterization of false-positive/false-negative rates and their patient-level consequences.',
      'Pre-specified statistical analysis plan and acceptance criteria agreed with FDA.',
    );
  }

  const findings: Finding[] = [];
  if (params.category === 'predictive' && recommendedPathway === 'ddt_qualification') {
    findings.push({
      severity: 'caution',
      message:
        'A predictive biomarker driving patient selection is usually realized as a co-developed companion ' +
        'diagnostic (device pathway), not solely a DDT qualification. Confirm whether the device-side CDx ' +
        'route (designCDxCodevelopment) is the operative pathway.',
    });
  }
  if (tier === 'high' && params.couImpact === undefined) {
    findings.push({
      severity: 'info',
      message:
        'COU impact tier inferred as HIGH from category; supply couImpact explicitly to lock the ' +
        'evidentiary scaling for the qualification plan.',
    });
  }
  if (params.singleDrugOnly === true && params.crossProgramUse === true) {
    findings.push({
      severity: 'warning',
      message:
        'Conflicting inputs: singleDrugOnly=true and crossProgramUse=true. Defaulted to drug-specific ' +
        'submission; reconcile the intended scope of use.',
    });
  }

  const citations: Citation[] = [cite('cures_act'), cite('bq_framework')];
  if (params.isGenomic === true) {
    citations.push(cite('ich_e16'));
  }

  return {
    biomarkerName: params.biomarkerName,
    category: params.category,
    contextOfUse: params.proposedContextOfUse,
    couImpactTier: tier,
    couImpactDescription: tierDesc.description,
    evidentiaryExpectation: tierDesc.evidentiaryExpectation,
    recommendedPathway,
    pathwayRationale,
    stages,
    evidentiaryCriteria,
    analyticalValidationNeeded: true,
    clinicalEvidenceNeeded:
      tier === 'high'
        ? 'Prospective and/or randomized clinical evidence with replication.'
        : tier === 'moderate'
          ? 'A coherent body of clinical evidence with quantified uncertainty.'
          : 'Supportive (possibly observational) clinical association data.',
    findings,
    citations: uniqueCitations([...citations, cite('best')]),
  };
}

function uniqueCitations(items: Citation[]): Citation[] {
  const out: Citation[] = [];
  for (const c of items) {
    const dup = out.find(
      (o: Citation): boolean =>
        o.source === c.source && o.reference === c.reference && o.statement === c.statement,
    );
    if (!dup) {
      out.push(c);
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 3 — designCDxCodevelopment
// ════════════════════════════════════════════════════════════════════════════

export interface DesignCDxCodevelopmentParams {
  therapeuticName: string;
  biomarkerName: string;
  /** Assay modality used for patient selection. */
  assayModality: AssayModality;
  /** Whether the marker is essential for safe/effective use (true CDx) vs complementary. */
  essentialForUse?: boolean;
  /** Device risk class (drives PMA vs 510(k)). */
  deviceRiskClass?: 'I' | 'II' | 'III';
  /** Whether a single locally-developed clinical trial assay (CTA) was used to enroll the pivotal trial. */
  usedClinicalTrialAssay?: boolean;
  /** Whether the market-ready IVD differs from the CTA (drives bridging study need). */
  marketAssayDiffersFromCTA?: boolean;
  /** Therapeutic development phase at planning time. */
  therapeuticPhase?: 'preclinical' | 'phase1' | 'phase2' | 'phase3' | 'filed';
  /** Regulatory framework. */
  framework?: DeviceFramework;
}

export interface CodevelopmentMilestone {
  phase: string;
  therapeuticActivity: string;
  diagnosticActivity: string;
  alignmentNote: string;
}

export interface DesignCDxCodevelopmentResult {
  therapeuticName: string;
  biomarkerName: string;
  isCompanionDiagnostic: boolean;
  cdxVsComplementary: 'companion' | 'complementary';
  devicePathway: 'pma' | '510k' | 'de_novo';
  devicePathwayRationale: string;
  contemporaneousApprovalRequired: boolean;
  parallelTimeline: CodevelopmentMilestone[];
  ctaBridgingRequired: boolean;
  ctaBridgingPlan: string;
  crossLabelingNote: string;
  findings: Finding[];
  citations: Citation[];
}

function cdxParallelTimeline(): CodevelopmentMilestone[] {
  return [
    {
      phase: 'Discovery / Preclinical',
      therapeuticActivity:
        'Identify the predictive hypothesis and candidate biomarker linking mechanism to response.',
      diagnosticActivity:
        'Develop a feasible measurement (assay prototype); define analyte, specimen, and preliminary cutoff.',
      alignmentNote:
        'Lock the biomarker hypothesis early — late biomarker definition changes invalidate prior enrollment.',
    },
    {
      phase: 'Phase 1 / early Phase 2',
      therapeuticActivity:
        'Establish safety, PK, and proof-of-mechanism; explore biomarker-defined response signal.',
      diagnosticActivity:
        'Develop and analytically characterize a clinical trial assay (CTA); establish provisional cutoff.',
      alignmentNote:
        'Use the CTA to test the enrichment hypothesis before committing to the pivotal design.',
    },
    {
      phase: 'Late Phase 2 / cutoff selection',
      therapeuticActivity:
        'Confirm the biomarker-defined population and effect size; finalize the enrichment strategy.',
      diagnosticActivity:
        'Lock the cutoff and the assay used for pivotal enrollment; begin analytical validation of the IVD.',
      alignmentNote:
        'The cutoff and assay enrolling the pivotal trial must be fixed before pivotal start; later ' +
        'changes require a bridging study to the originally enrolled population.',
    },
    {
      phase: 'Phase 3 / pivotal',
      therapeuticActivity:
        'Run the pivotal trial in the biomarker-defined population; collect samples for bridging.',
      diagnosticActivity:
        'Complete analytical validation of the market-ready IVD; conduct the CTA-to-IVD bridging study; ' +
        'establish clinical validity from pivotal-trial concordance.',
      alignmentNote:
        'Banked pivotal specimens enable the bridging study that links the market IVD to the clinical ' +
        'outcomes generated with the CTA.',
    },
    {
      phase: 'Submission & approval',
      therapeuticActivity: 'Submit NDA/BLA with the biomarker-restricted indication.',
      diagnosticActivity: 'Submit the IVD marketing application (PMA/510(k)/De Novo) for the CDx.',
      alignmentNote:
        'FDA expects contemporaneous approval/clearance so an approved test is available the day the ' +
        'therapeutic is approved; cross-labeling references the specific test.',
    },
  ];
}

/**
 * Design a contemporaneous drug + companion-diagnostic co-development program:
 * parallel therapeutic/diagnostic timelines, CTA-to-IVD bridging, device pathway
 * (PMA/510(k)/De Novo) and cross-labeling aligned with the therapeutic approval.
 *
 * Deterministic.
 */
export function designCDxCodevelopment(
  params: DesignCDxCodevelopmentParams,
): DesignCDxCodevelopmentResult {
  const isCompanion = params.essentialForUse !== false; // default to companion unless explicitly complementary
  const cdxVsComplementary: 'companion' | 'complementary' = isCompanion
    ? 'companion'
    : 'complementary';

  // Device pathway: Class III -> PMA; explicit De Novo when novel low/moderate risk; else 510(k).
  let devicePathway: 'pma' | '510k' | 'de_novo';
  let devicePathwayRationale: string;
  const riskClass = params.deviceRiskClass ?? (isCompanion ? 'III' : 'II');
  if (riskClass === 'III') {
    devicePathway = 'pma';
    devicePathwayRationale =
      'Most CDx that gate use of a therapy are Class III and follow PMA (21 CFR Part 814): an ' +
      'erroneous result directly drives a treatment decision, so the highest device controls apply.';
  } else if (riskClass === 'II') {
    devicePathway = '510k';
    devicePathwayRationale =
      'A moderate-risk device with a suitable predicate may follow 510(k) (21 CFR Part 807 Subpart E) ' +
      'by demonstrating substantial equivalence; many CDx, however, lack a predicate and require PMA.';
  } else {
    devicePathway = 'de_novo';
    devicePathwayRationale =
      'A novel low/moderate-risk device without a predicate may use the De Novo classification request ' +
      'to establish a new device type and special controls.';
  }

  const ctaBridgingRequired =
    params.usedClinicalTrialAssay === true && params.marketAssayDiffersFromCTA !== false;

  const ctaBridgingPlan = ctaBridgingRequired
    ? 'A bridging study is required: the market-ready IVD must be shown concordant with the clinical ' +
      'trial assay (CTA) used to enroll the pivotal trial, using banked pivotal specimens, so the ' +
      'clinical outcomes observed with the CTA can be attributed to the marketed test. Characterize ' +
      'concordance (PPA/NPA), discordant cases, and the effect of any discordance on the demonstrated ' +
      'clinical benefit.'
    : 'No CTA-to-IVD bridging study indicated (the pivotal trial was enrolled with the market-ready ' +
      'assay, or no difference between trial and market assays). Confirm assay equivalence and ' +
      'lock-down status before pivotal start.';

  const findings: Finding[] = [];
  if (isCompanion && params.deviceRiskClass !== undefined && params.deviceRiskClass !== 'III') {
    findings.push({
      severity: 'caution',
      message:
        'Marker is treated as a true companion diagnostic (essential for safe/effective use) but a ' +
        'non-Class-III risk class was supplied. CDx that gate therapy are typically Class III/PMA; ' +
        'confirm the risk classification with FDA early (pre-submission).',
    });
  }
  if (params.therapeuticPhase === 'phase3' && params.marketAssayDiffersFromCTA === true) {
    findings.push({
      severity: 'warning',
      message:
        'Market IVD differs from the CTA at Phase 3. The cutoff and assay enrolling the pivotal trial ' +
        'should be locked before pivotal start; a robust bridging study is now mandatory and discordance ' +
        'risk must be managed against the demonstrated clinical benefit.',
    });
  }
  if (params.therapeuticPhase === 'filed' && params.usedClinicalTrialAssay === true && params.marketAssayDiffersFromCTA !== false) {
    findings.push({
      severity: 'critical',
      message:
        'Filing the therapeutic while the market IVD still diverges from the enrolling CTA without a ' +
        'completed bridging study risks a non-contemporaneous approval and an unsupported cross-label. ' +
        'Complete and submit the bridging data with, or ahead of, the marketing applications.',
    });
  }
  if (!isCompanion) {
    findings.push({
      severity: 'info',
      message:
        'Treated as a COMPLEMENTARY diagnostic (informs use but is not required for safe/effective use). ' +
        'Complementary tests do not restrict the indicated population and carry a lighter cross-labeling ' +
        'burden than a companion diagnostic.',
    });
  }

  const citations: Citation[] = [cite('cdx_2014'), cite('cdx_codev_2016')];
  if (devicePathway === 'pma') {
    citations.push(cite('cfr_814'));
  } else if (devicePathway === '510k') {
    citations.push(cite('cfr_807e'));
  }
  citations.push(cite('cfr_80910'));

  return {
    therapeuticName: params.therapeuticName,
    biomarkerName: params.biomarkerName,
    isCompanionDiagnostic: isCompanion,
    cdxVsComplementary,
    devicePathway,
    devicePathwayRationale,
    contemporaneousApprovalRequired: isCompanion,
    parallelTimeline: cdxParallelTimeline(),
    ctaBridgingRequired,
    ctaBridgingPlan,
    crossLabelingNote:
      'The therapeutic label restricts the indicated population to the biomarker-defined subset and ' +
      'references the approved test; the IVD label references the therapeutic. Cross-labeling must be ' +
      'consistent between the two marketing applications (21 CFR 809.10; 21 CFR 814.20(b)).',
    findings,
    citations: uniqueCitations(citations),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 4 — assessBiomarkerAnalyticalValidation
// ════════════════════════════════════════════════════════════════════════════

export interface AnalyticalValidationInputs {
  /** Observed/claimed precision CV% at the medical decision level (quantitative). */
  precisionCVPercent?: number;
  /** Maximum acceptable CV% for the COU. */
  maxAcceptableCVPercent?: number;
  /** Established limit of detection (assay units), if claimed. */
  limitOfDetection?: number;
  /** Lowest clinically meaningful concentration / level that must be detectable. */
  lowestClinicallyMeaningfulLevel?: number;
  /** Established limit of quantitation, if claimed. */
  limitOfQuantitation?: number;
  /** Whether interference/cross-reactivity testing was completed. */
  interferenceTested?: boolean;
  /** Whether linearity / reportable range was established. */
  reportableRangeEstablished?: boolean;
  /** Whether robustness across lots/operators/instruments was demonstrated. */
  robustnessDemonstrated?: boolean;
  /** Whether pre-analytical/specimen-stability conditions are documented. */
  preanalyticalDocumented?: boolean;
  /** Whether multi-site reproducibility was demonstrated. */
  multiSiteReproducibility?: boolean;
  /** For qualitative assays: positive percent agreement with reference (%). */
  positivePercentAgreement?: number;
  /** For qualitative assays: negative percent agreement with reference (%). */
  negativePercentAgreement?: number;
}

export interface AnalyticalValidationParams {
  biomarkerName: string;
  assayModality: AssayModality;
  /** Whether the assay is quantitative (vs qualitative/binary). */
  quantitative?: boolean;
  /** Stakes of the intended use (high for CDx/patient selection). */
  intendedUseStakes?: 'low' | 'moderate' | 'high';
  inputs: AnalyticalValidationInputs;
}

export interface ParameterAssessment {
  parameter: string;
  status: 'pass' | 'fail' | 'not_evaluated';
  detail: string;
  clsiReference: string;
}

export interface AnalyticalValidationResult {
  biomarkerName: string;
  assayModality: AssayModality;
  quantitative: boolean;
  overallReadiness: 'ready' | 'gaps' | 'not_ready';
  parameterAssessments: ParameterAssessment[];
  outstandingRequirements: string[];
  findings: Finding[];
  citations: Citation[];
}

/**
 * Assess analytical validation of a biomarker assay against CLSI-grounded
 * parameters: accuracy/trueness, precision, sensitivity (LoB/LoD/LoQ),
 * specificity, reportable range, robustness, and pre-analytical control.
 *
 * Deterministic — pass/fail follows fixed rules over the supplied evidence.
 */
export function assessBiomarkerAnalyticalValidation(
  params: AnalyticalValidationParams,
): AnalyticalValidationResult {
  const quantitative = params.quantitative !== false;
  const i = params.inputs;
  const assessments: ParameterAssessment[] = [];
  const outstanding: string[] = [];
  const findings: Finding[] = [];

  // Accuracy / trueness.
  if (quantitative) {
    assessments.push({
      parameter: 'Accuracy / trueness (bias)',
      status: 'not_evaluated',
      detail:
        'Provide method-comparison/bias data (vs reference method) to evaluate trueness for a quantitative ' +
        'assay. Bias should fall within the total-allowable-error budget for the COU.',
      clsiReference: 'CLSI EP09',
    });
    outstanding.push('Method-comparison/bias study (CLSI EP09) demonstrating trueness within TAE.');
  } else {
    const ppa = i.positivePercentAgreement;
    const npa = i.negativePercentAgreement;
    if (ppa !== undefined && npa !== undefined) {
      const pass = ppa >= 90 && npa >= 90;
      assessments.push({
        parameter: 'Accuracy (qualitative concordance, PPA/NPA)',
        status: pass ? 'pass' : 'fail',
        detail:
          'PPA=' +
          round(ppa, 1) +
          '%, NPA=' +
          round(npa, 1) +
          '%. Both should meet the pre-specified threshold (commonly ≥ 90% with adequate confidence ' +
          'intervals; CDx may require higher).',
        clsiReference: 'CLSI EP12',
      });
      if (!pass) {
        outstanding.push('Improve PPA/NPA to the pre-specified concordance threshold.');
      }
    } else {
      assessments.push({
        parameter: 'Accuracy (qualitative concordance, PPA/NPA)',
        status: 'not_evaluated',
        detail: 'Provide positive/negative percent agreement vs a reference method or clinical truth.',
        clsiReference: 'CLSI EP12',
      });
      outstanding.push('Qualitative concordance study (PPA/NPA) vs reference (CLSI EP12).');
    }
  }

  // Precision.
  if (quantitative && i.precisionCVPercent !== undefined) {
    const maxCV = i.maxAcceptableCVPercent ?? (params.intendedUseStakes === 'high' ? 10 : 15);
    const pass = i.precisionCVPercent <= maxCV;
    assessments.push({
      parameter: 'Precision (repeatability / reproducibility)',
      status: pass ? 'pass' : 'fail',
      detail:
        'Observed CV=' +
        round(i.precisionCVPercent, 2) +
        '% vs acceptance ≤ ' +
        round(maxCV, 2) +
        '%. Evaluate across the medically relevant range and multiple conditions.',
      clsiReference: 'CLSI EP05',
    });
    if (!pass) {
      outstanding.push('Reduce imprecision to meet the CV acceptance limit (CLSI EP05).');
    }
  } else {
    assessments.push({
      parameter: 'Precision (repeatability / reproducibility)',
      status: 'not_evaluated',
      detail:
        'Provide repeatability and intermediate-precision CV% at decision levels (CLSI EP05); for ' +
        'qualitative tests characterize agreement near the cutoff (C5–C95).',
      clsiReference: 'CLSI EP05',
    });
    outstanding.push('Precision study at the medical decision level(s) (CLSI EP05).');
  }

  // Analytical sensitivity (LoD vs clinical need).
  if (i.limitOfDetection !== undefined && i.lowestClinicallyMeaningfulLevel !== undefined) {
    const pass = i.limitOfDetection <= i.lowestClinicallyMeaningfulLevel;
    assessments.push({
      parameter: 'Analytical sensitivity (LoB/LoD/LoQ)',
      status: pass ? 'pass' : 'fail',
      detail:
        'LoD=' +
        i.limitOfDetection +
        ' vs lowest clinically meaningful level=' +
        i.lowestClinicallyMeaningfulLevel +
        '. LoD must be at or below the lowest level the COU must detect.',
      clsiReference: 'CLSI EP17',
    });
    if (!pass) {
      outstanding.push('Lower the LoD to at or below the lowest clinically meaningful level (CLSI EP17).');
    }
  } else {
    assessments.push({
      parameter: 'Analytical sensitivity (LoB/LoD/LoQ)',
      status: 'not_evaluated',
      detail:
        'Establish LoB/LoD/LoQ (CLSI EP17) and confirm LoD ≤ lowest clinically meaningful level. ' +
        'Critical for low-input modalities (ctDNA/liquid biopsy: define detectable variant allele fraction).',
      clsiReference: 'CLSI EP17',
    });
    outstanding.push('Detection-capability study establishing LoB/LoD/LoQ (CLSI EP17).');
  }

  // Analytical specificity.
  assessments.push({
    parameter: 'Analytical specificity (interference / cross-reactivity)',
    status: i.interferenceTested === true ? 'pass' : 'not_evaluated',
    detail:
      i.interferenceTested === true
        ? 'Interference/cross-reactivity testing reported complete (CLSI EP07).'
        : 'Test common interferents (hemolysis, lipemia, icterus, concomitant drugs) and cross-reactivity ' +
          '(e.g., homologous regions for NGS) per CLSI EP07.',
    clsiReference: 'CLSI EP07',
  });
  if (i.interferenceTested !== true) {
    outstanding.push('Interference / cross-reactivity study (CLSI EP07).');
  }

  // Reportable range / linearity.
  if (quantitative) {
    assessments.push({
      parameter: 'Reportable range / linearity',
      status: i.reportableRangeEstablished === true ? 'pass' : 'not_evaluated',
      detail:
        i.reportableRangeEstablished === true
          ? 'Linearity / measuring interval established (CLSI EP06).'
          : 'Establish linearity across the analytical measuring interval and dilution recovery (CLSI EP06).',
      clsiReference: 'CLSI EP06',
    });
    if (i.reportableRangeEstablished !== true) {
      outstanding.push('Linearity / reportable-range study (CLSI EP06).');
    }
  }

  // Robustness.
  assessments.push({
    parameter: 'Robustness / ruggedness',
    status: i.robustnessDemonstrated === true ? 'pass' : 'not_evaluated',
    detail:
      i.robustnessDemonstrated === true
        ? 'Robustness across reagent lots / operators / instruments demonstrated.'
        : 'Demonstrate performance across reagent lots, operators, instruments, and small deliberate ' +
          'method variations; guard-band critical parameters.',
    clsiReference: 'CLSI EP05 / EP25',
  });
  if (i.robustnessDemonstrated !== true) {
    outstanding.push('Robustness/ruggedness study including reagent-lot variability.');
  }

  // Pre-analytical.
  assessments.push({
    parameter: 'Pre-analytical factors / specimen stability',
    status: i.preanalyticalDocumented === true ? 'pass' : 'not_evaluated',
    detail:
      i.preanalyticalDocumented === true
        ? 'Acceptable specimen types and stability conditions documented (CLSI EP25).'
        : 'Document acceptable specimen types/anticoagulants, time-to-processing/fixation, storage ' +
          'temperature, and freeze-thaw limits; define specimen-rejection criteria (CLSI EP25).',
    clsiReference: 'CLSI EP25',
  });
  if (i.preanalyticalDocumented !== true) {
    outstanding.push('Pre-analytical / specimen-stability characterization (CLSI EP25).');
  }

  // Multi-site reproducibility for high-stakes (CDx) use.
  if (params.intendedUseStakes === 'high') {
    if (i.multiSiteReproducibility === true) {
      findings.push({
        severity: 'info',
        message: 'Multi-site reproducibility demonstrated — appropriate for a high-stakes/CDx assay.',
      });
    } else {
      outstanding.push('Multi-site reproducibility study (required for CDx-level assays).');
      findings.push({
        severity: 'warning',
        message:
          'High-stakes (CDx) intended use but multi-site reproducibility not demonstrated. CDx assays ' +
          'must reproduce across sites, lots, and operators.',
      });
    }
  }

  // Overall readiness.
  const anyFail = assessments.some((a: ParameterAssessment): boolean => a.status === 'fail');
  const anyNotEvaluated = assessments.some(
    (a: ParameterAssessment): boolean => a.status === 'not_evaluated',
  );
  let overallReadiness: 'ready' | 'gaps' | 'not_ready';
  if (anyFail) {
    overallReadiness = 'not_ready';
  } else if (anyNotEvaluated || outstanding.length > 0) {
    overallReadiness = 'gaps';
  } else {
    overallReadiness = 'ready';
  }

  if (anyFail) {
    findings.push({
      severity: 'critical',
      message:
        'One or more analytical parameters FAILED their acceptance criteria. The assay is not ' +
        'analytically validated for the intended use until these are resolved.',
    });
  }

  const citations: Citation[] = [
    cite('clsi_ep17'),
    cite('clsi_ep05'),
    cite('clsi_ep09'),
    cite('clsi_ep12'),
  ];

  return {
    biomarkerName: params.biomarkerName,
    assayModality: params.assayModality,
    quantitative,
    overallReadiness,
    parameterAssessments: assessments,
    outstandingRequirements: uniqueStrings(outstanding),
    findings,
    citations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 5 — assessBiomarkerClinicalValidation
// ════════════════════════════════════════════════════════════════════════════

export interface ClinicalValidationParams {
  biomarkerName: string;
  /** True positives: diseased/responders correctly classified positive. */
  truePositives: number;
  /** False negatives: diseased/responders classified negative. */
  falseNegatives: number;
  /** True negatives: non-diseased/non-responders classified negative. */
  trueNegatives: number;
  /** False positives: non-diseased/non-responders classified positive. */
  falsePositives: number;
  /**
   * Optional disease/responder prevalence (0-1) in the intended-use population for
   * recomputing PPV/NPV at that prevalence (Bayes). If omitted, PPV/NPV are reported
   * at the apparent prevalence of the supplied 2x2 table.
   */
  intendedUsePrevalence?: number;
  /** Whether clinical utility (improved outcomes from acting on the result) is demonstrated. */
  clinicalUtilityDemonstrated?: boolean;
  /** Whether the cutoff was pre-specified before the validation dataset was analyzed. */
  cutoffPrespecified?: boolean;
  /** Whether validation used an independent dataset (not the cutoff-derivation set). */
  independentValidationSet?: boolean;
}

export interface ClinicalValidationResult {
  biomarkerName: string;
  clinicalSensitivity: number;
  clinicalSpecificity: number;
  ppvApparent: number;
  npvApparent: number;
  apparentPrevalence: number;
  ppvAtIntendedPrevalence?: number;
  npvAtIntendedPrevalence?: number;
  intendedUsePrevalence?: number;
  validityEstablished: boolean;
  utilityDistinctionNote: string;
  cutoffNote: string;
  findings: Finding[];
  citations: Citation[];
}

/**
 * Assess clinical validation of a biomarker: clinical sensitivity/specificity,
 * PPV/NPV (apparent and re-projected to the intended-use prevalence by Bayes),
 * cutoff-determination integrity, and the validity-vs-utility distinction.
 *
 * Deterministic — all metrics are closed-form from the 2x2 table.
 */
export function assessBiomarkerClinicalValidation(
  params: ClinicalValidationParams,
): ClinicalValidationResult {
  const tp = Math.max(0, params.truePositives);
  const fn = Math.max(0, params.falseNegatives);
  const tn = Math.max(0, params.trueNegatives);
  const fp = Math.max(0, params.falsePositives);

  const diseased = tp + fn;
  const nonDiseased = tn + fp;
  const total = diseased + nonDiseased;

  const sensitivity = diseased > 0 ? tp / diseased : 0;
  const specificity = nonDiseased > 0 ? tn / nonDiseased : 0;

  const testPositive = tp + fp;
  const testNegative = tn + fn;
  const ppvApparent = testPositive > 0 ? tp / testPositive : 0;
  const npvApparent = testNegative > 0 ? tn / testNegative : 0;
  const apparentPrevalence = total > 0 ? diseased / total : 0;

  const findings: Finding[] = [];

  // Re-project PPV/NPV to intended-use prevalence via Bayes.
  let ppvAtPrev: number | undefined;
  let npvAtPrev: number | undefined;
  let usedPrevalence: number | undefined;
  if (params.intendedUsePrevalence !== undefined) {
    const prev = clamp(params.intendedUsePrevalence, 0, 1);
    usedPrevalence = prev;
    const sens = sensitivity;
    const spec = specificity;
    const ppvDenom = sens * prev + (1 - spec) * (1 - prev);
    const npvDenom = spec * (1 - prev) + (1 - sens) * prev;
    ppvAtPrev = ppvDenom > 0 ? (sens * prev) / ppvDenom : 0;
    npvAtPrev = npvDenom > 0 ? (spec * (1 - prev)) / npvDenom : 0;

    if (prev <= 0.01 && ppvAtPrev < 0.5) {
      findings.push({
        severity: 'caution',
        message:
          'At the low intended-use prevalence supplied, PPV is below 50% despite the test’s ' +
          'sensitivity/specificity — most positives will be false positives. This is the canonical ' +
          'screening-population pitfall; consider clinical utility and a confirmatory pathway.',
      });
    }
  }

  // Validity = adequate accuracy on an independent set with a pre-specified cutoff.
  const accuracyAdequate = sensitivity >= 0.8 && specificity >= 0.8;
  const validityEstablished =
    accuracyAdequate &&
    params.independentValidationSet === true &&
    params.cutoffPrespecified !== false;

  if (!accuracyAdequate) {
    findings.push({
      severity: 'warning',
      message:
        'Clinical sensitivity (' +
        round(sensitivity * 100, 1) +
        '%) and/or specificity (' +
        round(specificity * 100, 1) +
        '%) are below a typical 80% threshold; clinical validity is not established at this performance.',
    });
  }
  if (params.cutoffPrespecified === false) {
    findings.push({
      severity: 'critical',
      message:
        'Cutoff was NOT pre-specified. A data-derived cutoff fitted on the same dataset used to report ' +
        'performance overstates accuracy (optimism bias). Lock the cutoff, then validate on independent data.',
    });
  }
  if (params.independentValidationSet !== true) {
    findings.push({
      severity: 'warning',
      message:
        'Performance not confirmed on an independent validation set. Apparent metrics may reflect ' +
        'overfitting to the development data.',
    });
  }
  if (params.clinicalUtilityDemonstrated !== true) {
    findings.push({
      severity: 'caution',
      message:
        'Clinical VALIDITY (the test measures what it claims and predicts the outcome) is distinct from ' +
        'clinical UTILITY (acting on the result improves patient outcomes). Utility is not yet demonstrated; ' +
        'a valid test can still lack utility if no action changes outcomes.',
    });
  }
  if (total === 0) {
    findings.push({
      severity: 'critical',
      message: 'Empty 2x2 table — no subjects supplied. Metrics are undefined and reported as zero.',
    });
  }

  return {
    biomarkerName: params.biomarkerName,
    clinicalSensitivity: round(sensitivity, 4),
    clinicalSpecificity: round(specificity, 4),
    ppvApparent: round(ppvApparent, 4),
    npvApparent: round(npvApparent, 4),
    apparentPrevalence: round(apparentPrevalence, 4),
    ppvAtIntendedPrevalence: ppvAtPrev !== undefined ? round(ppvAtPrev, 4) : undefined,
    npvAtIntendedPrevalence: npvAtPrev !== undefined ? round(npvAtPrev, 4) : undefined,
    intendedUsePrevalence: usedPrevalence,
    validityEstablished,
    utilityDistinctionNote:
      'Clinical validity = the biomarker accurately identifies the clinical condition/response it claims. ' +
      'Clinical utility = using the biomarker leads to improved, measurable patient outcomes (net benefit). ' +
      'Regulators and payers may require utility, not just validity.',
    cutoffNote:
      params.cutoffPrespecified === false
        ? 'Cutoff not pre-specified — re-derive and validate on independent data.'
        : 'Cutoff treated as pre-specified; confirm it was locked before unblinding the validation set.',
    findings,
    citations: [cite('best'), cite('bq_framework'), cite('clsi_ep12')],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 6 — planEnrichmentStrategy
// ════════════════════════════════════════════════════════════════════════════

export interface PlanEnrichmentStrategyParams {
  biomarkerName: string;
  /** BEST category of the enrichment biomarker. */
  category: BiomarkerCategory;
  /** Prevalence of the biomarker-positive subgroup in the screened population (0-1). */
  biomarkerPositivePrevalence: number;
  /** Whether biomarker-negative patients are expected to derive any benefit. */
  negativesExpectedToBenefit?: boolean;
  /** Whether the treatment effect is plausibly large only in biomarker-positives. */
  effectConcentratedInPositives?: boolean;
  /** Expected screen-to-enroll yield consideration: total screening pool size, if known. */
  screeningPoolSize?: number;
  /** Whether the goal is to also characterize the biomarker-negative population. */
  characterizeNegatives?: boolean;
  /** Whether a validated assay exists to operationalize enrichment at screening. */
  validatedAssayAvailable?: boolean;
}

export interface EnrichmentDesignOption {
  design: 'all_comers' | 'biomarker_positive_only' | 'stratified' | 'enrichment_with_negative_cohort';
  description: string;
  whenAppropriate: string;
  tradeoffs: string;
}

export interface PlanEnrichmentStrategyResult {
  biomarkerName: string;
  enrichmentType: 'predictive' | 'prognostic' | 'none';
  enrichmentTypeRationale: string;
  recommendedDesign: EnrichmentDesignOption['design'];
  recommendedDesignRationale: string;
  designOptions: EnrichmentDesignOption[];
  feasibility: {
    biomarkerPositivePrevalence: number;
    screensPerEnrolledPositive: number;
    estimatedScreensNeeded?: number;
    feasibilityFlag: 'feasible' | 'challenging' | 'low_prevalence_warning';
  };
  findings: Finding[];
  citations: Citation[];
}

function enrichmentDesignOptions(): EnrichmentDesignOption[] {
  return [
    {
      design: 'all_comers',
      description:
        'Enroll the full population regardless of biomarker status; analyze the overall effect and the ' +
        'biomarker subgroup as pre-specified secondary.',
      whenAppropriate:
        'When the predictive hypothesis is uncertain, negatives may benefit, or the goal is to confirm ' +
        'effect across the whole indicated population.',
      tradeoffs:
        'Largest sample size; if the effect is concentrated in positives, dilution by non-responders can ' +
        'mask a real effect.',
    },
    {
      design: 'biomarker_positive_only',
      description:
        'Restrict enrollment to biomarker-positive patients (predictive enrichment); the trial supports ' +
        'a biomarker-restricted indication and a companion diagnostic.',
      whenAppropriate:
        'When strong prior evidence concentrates benefit in positives and negatives are not expected to ' +
        'benefit (or may be harmed).',
      tradeoffs:
        'Most efficient for detecting the effect in positives but cannot characterize negatives; requires ' +
        'a validated selection assay at screening; restricts the labeled population.',
    },
    {
      design: 'stratified',
      description:
        'Enroll all-comers but randomize stratified by biomarker status with pre-specified analyses in ' +
        'each subgroup (marker-stratified design).',
      whenAppropriate:
        'When you must formally test the biomarker-by-treatment interaction and characterize both subgroups.',
      tradeoffs:
        'Balances arms within strata and enables a rigorous interaction test, but needs adequate power in ' +
        'each subgroup, increasing total size.',
    },
    {
      design: 'enrichment_with_negative_cohort',
      description:
        'Primarily enroll biomarker-positives but include a smaller biomarker-negative cohort to ' +
        'characterize (rather than power) the negative population.',
      whenAppropriate:
        'When benefit is expected mainly in positives but regulators want evidence about negatives to ' +
        'support or bound the label.',
      tradeoffs:
        'Captures some negative-population information at moderate cost without fully powering the negative ' +
        'subgroup.',
    },
  ];
}

/**
 * Plan an FDA enrichment strategy: classify the enrichment as prognostic vs
 * predictive, recommend an all-comers / biomarker-positive-only / stratified /
 * enrichment-with-negative-cohort design, and assess prevalence-driven feasibility.
 *
 * Deterministic.
 */
export function planEnrichmentStrategy(
  params: PlanEnrichmentStrategyParams,
): PlanEnrichmentStrategyResult {
  const prevalence = clamp(params.biomarkerPositivePrevalence, 0, 1);

  // Enrichment type from category.
  let enrichmentType: 'predictive' | 'prognostic' | 'none';
  let enrichmentTypeRationale: string;
  if (params.category === 'predictive') {
    enrichmentType = 'predictive';
    enrichmentTypeRationale =
      'A predictive biomarker selects patients more likely to respond to the specific mechanism — ' +
      'predictive enrichment (FDA Enrichment Strategies, 2019).';
  } else if (params.category === 'prognostic') {
    enrichmentType = 'prognostic';
    enrichmentTypeRationale =
      'A prognostic biomarker selects higher-risk / higher-event-rate patients to raise absolute event ' +
      'rates and statistical power without claiming differential treatment benefit — prognostic enrichment.';
  } else if (params.category === 'susceptibility_risk') {
    enrichmentType = 'prognostic';
    enrichmentTypeRationale =
      'A susceptibility/risk biomarker enriches a prevention trial for patients likely to develop the ' +
      'event — a prognostic-type enrichment of event rate.';
  } else {
    enrichmentType = 'none';
    enrichmentTypeRationale =
      'This biomarker category does not, by itself, justify prognostic or predictive enrichment. ' +
      'Enrichment relies on prognostic (event-rate) or predictive (response) selection.';
  }

  // Recommended design.
  let recommendedDesign: EnrichmentDesignOption['design'];
  let recommendedDesignRationale: string;
  if (enrichmentType === 'predictive') {
    if (params.negativesExpectedToBenefit === true) {
      recommendedDesign = 'stratified';
      recommendedDesignRationale =
        'Negatives may benefit, so do not exclude them: enroll all-comers stratified by biomarker to ' +
        'test the interaction and characterize both subgroups.';
    } else if (params.characterizeNegatives === true) {
      recommendedDesign = 'enrichment_with_negative_cohort';
      recommendedDesignRationale =
        'Benefit concentrated in positives but evidence on negatives is wanted: enrich for positives while ' +
        'including a smaller negative cohort to characterize (not power) the negative population.';
    } else if (params.effectConcentratedInPositives === true) {
      recommendedDesign = 'biomarker_positive_only';
      recommendedDesignRationale =
        'Strong prior that benefit is concentrated in positives and negatives are not expected to benefit: ' +
        'predictive enrichment via biomarker-positive-only enrollment supports a restricted indication and CDx.';
    } else {
      recommendedDesign = 'stratified';
      recommendedDesignRationale =
        'Predictive hypothesis not yet firmly established: a marker-stratified all-comers design formally ' +
        'tests the biomarker-by-treatment interaction before restricting the population.';
    }
  } else if (enrichmentType === 'prognostic') {
    recommendedDesign = 'all_comers';
    recommendedDesignRationale =
      'Prognostic enrichment raises the event rate by selecting higher-risk patients but does not predict ' +
      'differential benefit; enroll the enriched (high-risk) population without splitting by a treatment-' +
      'interaction marker.';
  } else {
    recommendedDesign = 'all_comers';
    recommendedDesignRationale =
      'No enrichment justified by this biomarker; default to an all-comers design.';
  }

  // Feasibility.
  const screensPerEnrolledPositive = prevalence > 0 ? round(1 / prevalence, 2) : Infinity;
  let estimatedScreensNeeded: number | undefined;
  if (params.screeningPoolSize !== undefined) {
    estimatedScreensNeeded = params.screeningPoolSize;
  }
  let feasibilityFlag: 'feasible' | 'challenging' | 'low_prevalence_warning';
  if (prevalence >= 0.2) {
    feasibilityFlag = 'feasible';
  } else if (prevalence >= 0.05) {
    feasibilityFlag = 'challenging';
  } else {
    feasibilityFlag = 'low_prevalence_warning';
  }

  const findings: Finding[] = [];
  if (
    recommendedDesign === 'biomarker_positive_only' &&
    params.validatedAssayAvailable !== true
  ) {
    findings.push({
      severity: 'warning',
      message:
        'Biomarker-positive-only enrollment requires a validated selection assay at screening. No validated ' +
        'assay reported — operationalizing enrichment (and the eventual CDx) is blocked until one exists.',
    });
  }
  if (feasibilityFlag === 'low_prevalence_warning') {
    findings.push({
      severity: 'caution',
      message:
        'Low biomarker-positive prevalence (' +
        round(prevalence * 100, 1) +
        '%) means many patients must be screened per enrolled positive (~' +
        (screensPerEnrolledPositive === Infinity ? '∞' : screensPerEnrolledPositive) +
        '). Plan screening logistics, central testing, and consider a low-frequency-subset development ' +
        'strategy.',
    });
  }
  if (enrichmentType === 'predictive' && params.negativesExpectedToBenefit === true && recommendedDesign === 'biomarker_positive_only') {
    findings.push({
      severity: 'warning',
      message:
        'Excluding negatives who may benefit risks an overly narrow label and missed effect in negatives. ' +
        'Reconsider a stratified design.',
    });
  }
  if (params.category !== 'predictive' && params.effectConcentratedInPositives === true) {
    findings.push({
      severity: 'info',
      message:
        'Effect reportedly concentrated in biomarker-positives implies a PREDICTIVE marker; confirm the ' +
        'category — predictive enrichment may be justified.',
    });
  }

  const citations: Citation[] = [cite('enrichment_2019'), cite('best')];
  if (recommendedDesign === 'biomarker_positive_only') {
    citations.push(cite('cdx_2014'));
  }

  return {
    biomarkerName: params.biomarkerName,
    enrichmentType,
    enrichmentTypeRationale,
    recommendedDesign,
    recommendedDesignRationale,
    designOptions: enrichmentDesignOptions(),
    feasibility: {
      biomarkerPositivePrevalence: round(prevalence, 4),
      screensPerEnrolledPositive:
        screensPerEnrolledPositive === Infinity ? 0 : screensPerEnrolledPositive,
      estimatedScreensNeeded,
      feasibilityFlag,
    },
    findings,
    citations: uniqueCitations(citations),
  };
}
