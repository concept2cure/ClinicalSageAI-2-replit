/**
 * Biomarkers & Companion Diagnostics — reference tables
 * ======================================================
 *
 * The BEST category descriptors, the intended-use mapping, the CLSI analytical
 * parameters and the citation library of the biomarker knowledge engine. They
 * moved here unchanged from `biomarker-knowledge.ts` on 2026-11-08 (Rule 2 S5b),
 * when its stated-input readers would have carried it past the repository's
 * 100,000-byte ceiling. The engine imports them and exports the same names as before.
 * ANALYTICAL_PARAM_TABLE is read by none of the engine's functions, before or
 * after the move.
 *
 * @module server/services/biomarkers/biomarker-reference
 */

import type { BiomarkerCategory, BiomarkerUse, Citation } from './biomarker-knowledge.js';

/** Descriptor of one BEST biomarker category. */
export interface CategoryDescriptor {
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

export const CATEGORY_TABLE: CategoryDescriptor[] = [
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
export interface UseToCategory {
  use: BiomarkerUse;
  supportingCategories: BiomarkerCategory[];
  note: string;
}

export const USE_CATEGORY_TABLE: UseToCategory[] = [
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

/** Analytical validation parameter descriptor (CLSI-grounded). */
export interface AnalyticalParameter {
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

export const ANALYTICAL_PARAM_TABLE: AnalyticalParameter[] = [
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
export interface NamedCitation {
  id: string;
  citation: Citation;
}

export const CITATION_LIBRARY: NamedCitation[] = [
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
