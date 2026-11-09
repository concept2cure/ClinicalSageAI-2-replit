/**
 * Digital Health, SaMD & AI/ML Devices — reference tables
 * =========================================================
 *
 * The citation registry, the IMDRF N12 matrix and category descriptions, and the
 * ten GMLP guiding principles of the digital-health knowledge engine. They moved
 * here unchanged from `digital-health-knowledge.ts`
 * on 2026-11-08 (Rule 2 S5b), when its stated-input readers would have carried it
 * past the repository's 100,000-byte ceiling. The engine imports them and exports
 * the same names as before.
 *
 * @module server/services/digital-health/digital-health-reference
 */

import type { HealthcareSituation, InformationSignificance, SaMDCategory } from './digital-health-knowledge.js';

export interface CitationRecord {
  id: string;
  reference: string;
  section?: string;
}

export const CITATIONS: CitationRecord[] = [
  {
    id: 'IMDRF-N10',
    reference:
      'IMDRF/SaMD WG/N10 FINAL:2013 — "Software as a Medical Device (SaMD): Key Definitions"',
  },
  {
    id: 'IMDRF-N12',
    reference:
      'IMDRF/SaMD WG/N12 FINAL:2014 — "Software as a Medical Device: Possible Framework for Risk Categorization and Corresponding Considerations"',
  },
  {
    id: 'IMDRF-N23',
    reference:
      'IMDRF/SaMD WG/N23 FINAL:2015 — "Software as a Medical Device (SaMD): Application of Quality Management System"',
  },
  {
    id: 'IMDRF-N41',
    reference:
      'IMDRF/SaMD WG/N41 FINAL:2017 — "Software as a Medical Device (SaMD): Clinical Evaluation"',
  },
  {
    id: 'FDA-PCCP-2024',
    reference:
      'FDA Guidance — "Marketing Submission Recommendations for a Predetermined Change Control Plan for Artificial Intelligence-Enabled Device Software Functions" (December 2024)',
  },
  {
    id: 'GMLP-2021',
    reference:
      'FDA / Health Canada / MHRA — "Good Machine Learning Practice for Medical Device Development: Guiding Principles" (October 2021)',
  },
  {
    id: 'FDA-CYBER-2023',
    reference:
      'FDA Guidance — "Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions" (September 2023)',
  },
  {
    id: 'FDC-524B',
    reference:
      'Section 524B of the Federal Food, Drug, and Cosmetic Act ("Ensuring Cybersecurity of Devices"), 21 U.S.C. 360n-2',
  },
  {
    id: 'CFR-820-30',
    reference: '21 CFR 820.30 — Design controls (Quality System Regulation)',
  },
  {
    id: 'QMSR-2024',
    reference:
      'FDA Quality Management System Regulation (QMSR) final rule — 21 CFR Part 820 harmonized with ISO 13485:2016 (effective February 2, 2026)',
  },
  {
    id: 'FDA-CDS-2022',
    reference: 'FDA Guidance — "Clinical Decision Support Software" (September 2022)',
  },
  {
    id: 'FDA-SW-2023',
    reference:
      'FDA Guidance — "Content of Premarket Submissions for Device Software Functions" (June 2023)',
  },
  {
    id: 'FDA-AIML-DISC-2019',
    reference:
      'FDA Discussion Paper — "Proposed Regulatory Framework for Modifications to Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD)" (April 2019)',
  },
  {
    id: 'FDA-AIML-ACTION-2021',
    reference:
      'FDA — "Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD) Action Plan" (January 2021)',
  },
  {
    id: 'FDA-TRANSPARENCY-2024',
    reference:
      'FDA — "Transparency for Machine-Learning-Enabled Medical Devices: Guiding Principles" (June 2024)',
  },
  {
    id: 'AAMI-TIR57',
    reference: 'AAMI TIR57:2016 — "Principles for medical device security — Risk management"',
  },
  {
    id: 'AAMI-SW96',
    reference: 'ANSI/AAMI SW96:2023 — "Standard for medical device security — Security risk management for device manufacturers"',
  },
  {
    id: 'ISO-14971',
    reference: 'ANSI/AAMI/ISO 14971:2019 — "Medical devices — Application of risk management to medical devices"',
  },
  {
    id: 'IEC-62304',
    reference: 'IEC 62304:2006+A1:2015 — "Medical device software — Software life cycle processes"',
  },
  {
    id: 'IEC-81001-5-1',
    reference: 'IEC 81001-5-1:2021 — "Health software and health IT systems safety, effectiveness and security — Part 5-1: Security — Activities in the product life cycle"',
  },
  {
    id: 'NTIA-SBOM',
    reference: 'NTIA — "The Minimum Elements For a Software Bill of Materials (SBOM)" (July 2021)',
  },
  {
    id: 'FDA-IMDRF-SOPDA',
    reference:
      'IMDRF/SaMD WG/N12 — Statement of the SaMD definition statement (intended use / intended medical purpose)',
  },
];

/**
 * IMDRF N12 4x3 categorization matrix.
 * Rows = state of healthcare situation; Columns = significance of information.
 * Category ordering (per N12): IV (highest) > III > II > I (lowest).
 */
export interface N12Cell {
  situation: HealthcareSituation;
  significance: InformationSignificance;
  category: SaMDCategory;
}

export const N12_MATRIX: N12Cell[] = [
  // Critical situation
  { situation: 'critical', significance: 'treat-or-diagnose', category: 'IV' },
  { situation: 'critical', significance: 'drive', category: 'III' },
  { situation: 'critical', significance: 'inform', category: 'II' },
  // Serious situation
  { situation: 'serious', significance: 'treat-or-diagnose', category: 'III' },
  { situation: 'serious', significance: 'drive', category: 'II' },
  { situation: 'serious', significance: 'inform', category: 'I' },
  // Non-serious situation
  { situation: 'non-serious', significance: 'treat-or-diagnose', category: 'II' },
  { situation: 'non-serious', significance: 'drive', category: 'I' },
  { situation: 'non-serious', significance: 'inform', category: 'I' },
];

export interface CategoryMeta {
  category: SaMDCategory;
  impactLevel: 'low' | 'moderate' | 'high' | 'very-high';
  description: string;
}

export const CATEGORY_META: CategoryMeta[] = [
  {
    category: 'I',
    impactLevel: 'low',
    description:
      'Category I — Lowest impact. Accurate SaMD output is important; errors carry the lowest probability of contributing to harm relative to the other categories (IMDRF N12).',
  },
  {
    category: 'II',
    impactLevel: 'moderate',
    description:
      'Category II — Moderate impact. SaMD information is important to inform/drive clinical management; failure could contribute to a moderate level of harm (IMDRF N12).',
  },
  {
    category: 'III',
    impactLevel: 'high',
    description:
      'Category III — High impact. SaMD drives clinical management of a critical situation or treats/diagnoses a serious situation; failure could contribute to serious harm (IMDRF N12).',
  },
  {
    category: 'IV',
    impactLevel: 'very-high',
    description:
      'Category IV — Highest impact. SaMD treats or diagnoses a critical healthcare situation/condition; failure could contribute to death or irreversible harm (IMDRF N12).',
  },
];

export interface GMLPPrincipleDef {
  principle: number;
  title: string;
  summary: string;
  keyExpectations: string[];
}

export const GMLP_PRINCIPLES: GMLPPrincipleDef[] = [
  {
    principle: 1,
    title: 'Multi-disciplinary expertise is leveraged throughout the total product life cycle',
    summary:
      'In-depth understanding of a model\'s intended integration into clinical workflow, and the desired benefits and patient risks, helps ensure ML-enabled devices are safe and effective and address clinically meaningful needs over the device life cycle.',
    keyExpectations: [
      'Clinical, data science, software, regulatory and human-factors expertise engaged across the life cycle.',
      'Intended clinical workflow integration understood and documented.',
    ],
  },
  {
    principle: 2,
    title: 'Good software engineering and security practices are implemented',
    summary:
      'Model design is implemented with attention to the fundamentals of good software engineering practice, data quality assurance, data management, and robust cybersecurity practices.',
    keyExpectations: [
      'Risk management and design process (IEC 62304, ISO 14971) applied.',
      'Cybersecurity practices integrated (AAMI SW96 / IEC 81001-5-1).',
      'Data quality assurance and authenticity/integrity controls implemented.',
    ],
  },
  {
    principle: 3,
    title:
      'Clinical study participants and data sets are representative of the intended patient population',
    summary:
      'Data collection protocols ensure relevant characteristics of the intended patient population (e.g., age, sex, race, ethnicity), use, and measurement inputs are sufficiently represented so results can be reasonably generalized; this helps manage bias and promotes equity.',
    keyExpectations: [
      'Intended-use population characterized; representativeness demonstrated.',
      'Subgroup coverage and performance reported; bias actively managed.',
    ],
  },
  {
    principle: 4,
    title: 'Training data sets are independent of test sets',
    summary:
      'Training and test data sets are selected and maintained to be appropriately independent of one another. All potential sources of dependence (patient, data acquisition, site factors) are considered and addressed to assure independence.',
    keyExpectations: [
      'No patient/site/scanner leakage between training, tuning and test partitions.',
      'Independence verified and documented.',
    ],
  },
  {
    principle: 5,
    title: 'Selected reference datasets are based upon best available methods',
    summary:
      'Accepted, best-available methods for developing a reference dataset (i.e., a reference standard) ensure clinically relevant and well-characterized data are collected and the limitations of the reference are understood.',
    keyExpectations: [
      'Reference standard defined using best-available, accepted methods.',
      'Labeling/adjudication process and its limitations documented.',
    ],
  },
  {
    principle: 6,
    title: 'Model design is tailored to the available data and reflects the intended use',
    summary:
      'Model design is suited to the available data and supports the active mitigation of known risks, like overfitting, performance degradation, and security risks. Clinical benefits and risks are well understood, used to derive clinically meaningful performance goals, and support a safe and effective product.',
    keyExpectations: [
      'Architecture/feature choices justified by data and intended use.',
      'Overfitting and degradation risks actively mitigated.',
      'Clinically meaningful performance goals defined.',
    ],
  },
  {
    principle: 7,
    title: 'Focus is placed on the performance of the Human-AI Team',
    summary:
      'Where the model has a "human in the loop," human factors considerations and the human interpretability of the model outputs are addressed with emphasis on the performance of the Human-AI team, rather than just the performance of the model in isolation.',
    keyExpectations: [
      'Human-factors / usability engineering applied (IEC 62366-1).',
      'Output interpretability supports correct reliance and override.',
      'Human-AI team performance (not just model) evaluated where applicable.',
    ],
  },
  {
    principle: 8,
    title: 'Testing demonstrates device performance during clinically relevant conditions',
    summary:
      'Statistically sound test plans are developed and executed to generate clinically relevant device performance information independently of the training data set. Considerations include the intended population, important subgroups, clinical environment, inputs, and measurement equipment.',
    keyExpectations: [
      'Pre-specified, statistically sound test plan on independent data.',
      'Performance characterized across clinically relevant conditions and subgroups.',
    ],
  },
  {
    principle: 9,
    title: 'Users are provided clear, essential information',
    summary:
      'Users are provided ready access to clear, contextually relevant information appropriate for the intended audience — the product\'s intended use and indications, performance for appropriate subgroups, characteristics of the data used, acceptable inputs, known limitations, and the basis for decisions where available.',
    keyExpectations: [
      'Transparent labeling: intended use, population, subgroup performance, inputs, limitations.',
      'Aligned with FDA transparency guiding principles.',
    ],
  },
  {
    principle: 10,
    title: 'Deployed models are monitored for performance and re-training risks are managed',
    summary:
      'Deployed models have the capability to be monitored in "real world" use with a focus on maintained or improved safety and performance. When models are periodically or continually trained, there are appropriate controls to manage risks of overfitting, unintended bias, or degradation (e.g., dataset drift).',
    keyExpectations: [
      'Real-world performance monitoring with metrics and thresholds.',
      'Data/dataset drift detection and controlled re-training (ties to PCCP).',
    ],
  },
];

