/**
 * ICH Guideline Corpus — citable, structured index of the ICH canon
 *
 * The International Council for Harmonisation (ICH) Q/S/E/M guideline families are
 * the backbone of global pharmaceutical and biotech regulation: they are adopted
 * and implemented by ICH member regulators worldwide (FDA, EMA, PMDA, Health
 * Canada, Swissmedic, MFDS Korea, NMPA China, ANVISA Brazil, TFDA, and others),
 * so a single citable code (e.g. "Q1A(R2)", "E6(R3)", "M4") resolves to the same
 * expectation across markets.
 *
 * This module is a CITABLE INDEX, not a substitute for the guidelines. ICH
 * revisions and step status evolve; codes and official titles here are stable,
 * but `status`/revision should be verified against ich.org before being relied on
 * in a regulatory submission. Every rendered block carries that caveat. Nothing
 * here is fabricated: each entry is a real, published ICH guideline family.
 */

import type { ClientSegment } from './industry-wisdom-pack.js';

export type IchCategory = 'quality' | 'safety' | 'efficacy' | 'multidisciplinary';

/** Coarse lifecycle status. Verify the precise step/revision on ich.org. */
export type IchStatus = 'adopted' | 'in_revision' | 'draft' | 'withdrawn';

export interface IchGuideline {
  /** Canonical ICH code, including the revision in force at time of writing. */
  code: string;
  category: IchCategory;
  /** Official (or closely paraphrased) guideline title. */
  title: string;
  /** Short human-recognisable topic. */
  topic: string;
  /** Segments for which the guideline is most load-bearing. */
  appliesTo: ClientSegment[];
  status: IchStatus;
  /** What it governs and why it matters in practice. */
  summary: string;
  /** CTD module the guideline most directly supports, where applicable. */
  ctdModule?: string;
  /** Retrieval keywords. */
  keywords: string[];
}

/**
 * ICH member and observer regulators that implement the harmonised guidelines.
 * Used to explain, in rendered output, why an ICH citation travels across markets.
 */
export const ICH_IMPLEMENTING_REGULATORS: ReadonlyArray<{ code: string; region: string }> = [
  { code: 'FDA', region: 'United States' },
  { code: 'EMA', region: 'European Union' },
  { code: 'PMDA/MHLW', region: 'Japan' },
  { code: 'Health Canada', region: 'Canada' },
  { code: 'Swissmedic', region: 'Switzerland' },
  { code: 'MHRA', region: 'United Kingdom' },
  { code: 'MFDS', region: 'South Korea' },
  { code: 'NMPA', region: 'China' },
  { code: 'ANVISA', region: 'Brazil' },
  { code: 'TFDA', region: 'Taiwan' },
  { code: 'TGA', region: 'Australia (adopts ICH)' },
  { code: 'HSA', region: 'Singapore (adopts ICH)' },
];

const QUALITY: IchGuideline[] = [
  {
    code: 'Q1A(R2)',
    category: 'quality',
    title: 'Stability Testing of New Drug Substances and Products',
    topic: 'Stability — core',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary:
      'Defines the stability data package (storage conditions, testing frequency, climatic zones) needed to assign retest periods and shelf lives for new drug substances and products.',
    ctdModule: 'Module 3.2.S.7 / 3.2.P.8',
    keywords: ['stability', 'shelf life', 'retest', 'climatic zone', 'storage'],
  },
  {
    code: 'Q1B',
    category: 'quality',
    title: 'Photostability Testing of New Drug Substances and Products',
    topic: 'Photostability',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Standard for testing intrinsic photostability and the need for light-protective packaging.',
    ctdModule: 'Module 3.2.S.7 / 3.2.P.8',
    keywords: ['photostability', 'light', 'packaging'],
  },
  {
    code: 'Q1D',
    category: 'quality',
    title: 'Bracketing and Matrixing Designs for Stability Testing',
    topic: 'Reduced stability designs',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Permits reduced stability designs (bracketing/matrixing) to cut testing burden when justified.',
    ctdModule: 'Module 3.2.P.8',
    keywords: ['bracketing', 'matrixing', 'stability design'],
  },
  {
    code: 'Q1E',
    category: 'quality',
    title: 'Evaluation of Stability Data',
    topic: 'Stability extrapolation',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'How to evaluate stability data and justify extrapolation of shelf life beyond observed data.',
    ctdModule: 'Module 3.2.P.8',
    keywords: ['stability evaluation', 'extrapolation', 'shelf life'],
  },
  {
    code: 'Q2(R2)',
    category: 'quality',
    title: 'Validation of Analytical Procedures',
    topic: 'Analytical validation',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary:
      'Validation characteristics (specificity, accuracy, precision, linearity, range, robustness) for analytical procedures; R2 modernised it alongside Q14.',
    ctdModule: 'Module 3.2.S.4 / 3.2.P.5',
    keywords: ['analytical validation', 'accuracy', 'precision', 'specificity', 'method validation'],
  },
  {
    code: 'Q3A(R2)',
    category: 'quality',
    title: 'Impurities in New Drug Substances',
    topic: 'Drug-substance impurities',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Reporting, identification and qualification thresholds for impurities in new drug substances.',
    ctdModule: 'Module 3.2.S.3',
    keywords: ['impurities', 'qualification threshold', 'drug substance'],
  },
  {
    code: 'Q3B(R2)',
    category: 'quality',
    title: 'Impurities in New Drug Products',
    topic: 'Drug-product impurities',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Thresholds and qualification for degradation products in new drug products.',
    ctdModule: 'Module 3.2.P.5',
    keywords: ['impurities', 'degradation products', 'drug product'],
  },
  {
    code: 'Q3C(R8)',
    category: 'quality',
    title: 'Impurities: Guideline for Residual Solvents',
    topic: 'Residual solvents',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Permitted daily exposures (PDEs) for Class 1–3 residual solvents.',
    ctdModule: 'Module 3.2.S.3 / 3.2.P.5',
    keywords: ['residual solvents', 'PDE', 'class 1 solvent'],
  },
  {
    code: 'Q3D(R2)',
    category: 'quality',
    title: 'Guideline for Elemental Impurities',
    topic: 'Elemental impurities',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'PDEs and a risk-assessment framework for elemental impurities (e.g. heavy metals).',
    ctdModule: 'Module 3.2.P.5',
    keywords: ['elemental impurities', 'heavy metals', 'PDE', 'risk assessment'],
  },
  {
    code: 'Q5A(R2)',
    category: 'quality',
    title: 'Viral Safety Evaluation of Biotechnology Products Derived from Cell Lines of Human or Animal Origin',
    topic: 'Viral safety',
    appliesTo: ['biotech'],
    status: 'adopted',
    summary:
      'Viral safety strategy (testing, clearance evaluation) for biotech products; R2 extends to advanced/new modalities.',
    ctdModule: 'Module 3.2.A.2',
    keywords: ['viral safety', 'viral clearance', 'cell line', 'biologics'],
  },
  {
    code: 'Q5C',
    category: 'quality',
    title: 'Stability Testing of Biotechnological/Biological Products',
    topic: 'Biologics stability',
    appliesTo: ['biotech'],
    status: 'adopted',
    summary: 'Stability principles specific to biologics, where degradation pathways differ from small molecules.',
    ctdModule: 'Module 3.2.S.7 / 3.2.P.8',
    keywords: ['biologics stability', 'protein degradation'],
  },
  {
    code: 'Q5E',
    category: 'quality',
    title: 'Comparability of Biotechnological/Biological Products Subject to Changes in their Manufacturing Process',
    topic: 'Comparability',
    appliesTo: ['biotech'],
    status: 'adopted',
    summary:
      'How to demonstrate that a product is comparable before and after a manufacturing change — the backbone of process-change and biosimilar strategy.',
    ctdModule: 'Module 3.2.S / 3.2.P',
    keywords: ['comparability', 'manufacturing change', 'biosimilar', 'process change'],
  },
  {
    code: 'Q6A',
    category: 'quality',
    title: 'Specifications: Test Procedures and Acceptance Criteria for New Drug Substances and New Drug Products (Chemical)',
    topic: 'Specifications (chemical)',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'How to set specifications (tests + acceptance criteria) for chemical drug substances and products.',
    ctdModule: 'Module 3.2.S.4 / 3.2.P.5',
    keywords: ['specifications', 'acceptance criteria', 'release testing'],
  },
  {
    code: 'Q6B',
    category: 'quality',
    title: 'Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products',
    topic: 'Specifications (biologics)',
    appliesTo: ['biotech'],
    status: 'adopted',
    summary: 'Specification-setting for biologics, including potency, purity and identity.',
    ctdModule: 'Module 3.2.S.4 / 3.2.P.5',
    keywords: ['specifications', 'potency', 'purity', 'biologics'],
  },
  {
    code: 'Q7',
    category: 'quality',
    title: 'Good Manufacturing Practice Guide for Active Pharmaceutical Ingredients',
    topic: 'API GMP',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'The globally referenced GMP standard for active pharmaceutical ingredients.',
    ctdModule: 'Module 3.2.S.2',
    keywords: ['GMP', 'API', 'manufacturing', 'good manufacturing practice'],
  },
  {
    code: 'Q8(R2)',
    category: 'quality',
    title: 'Pharmaceutical Development',
    topic: 'QbD / pharmaceutical development',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Quality-by-Design: design space, critical quality attributes, control strategy.',
    ctdModule: 'Module 3.2.P.2',
    keywords: ['QbD', 'design space', 'CQA', 'control strategy', 'pharmaceutical development'],
  },
  {
    code: 'Q9(R1)',
    category: 'quality',
    title: 'Quality Risk Management',
    topic: 'Quality risk management',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Principles and tools (e.g. FMEA) for quality risk management across the product lifecycle.',
    keywords: ['quality risk management', 'QRM', 'FMEA', 'risk assessment'],
  },
  {
    code: 'Q10',
    category: 'quality',
    title: 'Pharmaceutical Quality System',
    topic: 'Pharmaceutical quality system',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'A model pharmaceutical quality system spanning development through discontinuation.',
    keywords: ['PQS', 'quality system', 'CAPA', 'management review'],
  },
  {
    code: 'Q11',
    category: 'quality',
    title: 'Development and Manufacture of Drug Substances (Chemical Entities and Biotechnological/Biological Entities)',
    topic: 'Drug-substance development',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Approaches to developing and describing drug-substance manufacturing, including starting-material selection.',
    ctdModule: 'Module 3.2.S.2',
    keywords: ['drug substance', 'starting material', 'manufacturing process'],
  },
  {
    code: 'Q12',
    category: 'quality',
    title: 'Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management',
    topic: 'Lifecycle management',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary:
      'Tools (Established Conditions, PACMP) to manage post-approval CMC changes with less regulatory friction.',
    keywords: ['lifecycle', 'established conditions', 'PACMP', 'post-approval change'],
  },
  {
    code: 'Q13',
    category: 'quality',
    title: 'Continuous Manufacturing of Drug Substances and Drug Products',
    topic: 'Continuous manufacturing',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Scientific and regulatory considerations for continuous manufacturing.',
    keywords: ['continuous manufacturing', 'CM', 'process'],
  },
  {
    code: 'Q14',
    category: 'quality',
    title: 'Analytical Procedure Development',
    topic: 'Analytical development',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Enhanced (QbD-style) approach to analytical procedure development; companion to Q2(R2).',
    ctdModule: 'Module 3.2.S.4 / 3.2.P.5',
    keywords: ['analytical development', 'method development', 'AQbD'],
  },
  {
    code: 'Q1C',
    category: 'quality',
    title: 'Stability Testing for New Dosage Forms',
    topic: 'Stability — new dosage forms',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Extends the Q1A stability principles to a new dosage form of an already-approved drug.',
    ctdModule: 'Module 3.2.P.8',
    keywords: ['stability', 'new dosage form', 'line extension'],
  },
  {
    code: 'Q3E',
    category: 'quality',
    title: 'Assessment and Control of Extractables and Leachables for Pharmaceuticals and Biologics',
    topic: 'Extractables & leachables',
    appliesTo: ['pharma', 'biotech'],
    status: 'draft',
    summary: 'Harmonised approach to assessing and controlling extractables and leachables from containers/manufacturing systems.',
    ctdModule: 'Module 3.2.P.7',
    keywords: ['extractables', 'leachables', 'container closure', 'E&L'],
  },
  {
    code: 'Q4B',
    category: 'quality',
    title: 'Evaluation and Recommendation of Pharmacopoeial Texts for Use in the ICH Regions',
    topic: 'Pharmacopoeial harmonisation',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Mechanism for recognising harmonised pharmacopoeial general chapters (USP/Ph.Eur./JP) as interchangeable across regions.',
    keywords: ['pharmacopoeia', 'USP', 'Ph.Eur.', 'JP', 'harmonisation', 'general chapter'],
  },
  {
    code: 'Q5B',
    category: 'quality',
    title: 'Analysis of the Expression Construct in Cells Used for Production of r-DNA Derived Protein Products',
    topic: 'Expression construct',
    appliesTo: ['biotech'],
    status: 'adopted',
    summary: 'Analysis of the expression construct to support genetic stability of the production cell line.',
    ctdModule: 'Module 3.2.S.2',
    keywords: ['expression construct', 'genetic stability', 'cell line', 'r-DNA'],
  },
  {
    code: 'Q5D',
    category: 'quality',
    title: 'Derivation and Characterisation of Cell Substrates Used for Production of Biotechnological/Biological Products',
    topic: 'Cell substrates',
    appliesTo: ['biotech'],
    status: 'adopted',
    summary: 'Derivation, banking and characterisation of cell substrates (master/working cell banks).',
    ctdModule: 'Module 3.2.S.2',
    keywords: ['cell substrate', 'cell bank', 'MCB', 'WCB', 'characterisation'],
  },
];

const SAFETY: IchGuideline[] = [
  {
    code: 'S1A/S1B(R1)/S1C(R2)',
    category: 'safety',
    title: 'Carcinogenicity Studies (Need, Testing, Dose Selection)',
    topic: 'Carcinogenicity',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'When carcinogenicity studies are needed and how to design and dose them.',
    ctdModule: 'Module 4.2.3.4',
    keywords: ['carcinogenicity', 'rodent', 'dose selection'],
  },
  {
    code: 'S2(R1)',
    category: 'safety',
    title: 'Genotoxicity Testing and Data Interpretation for Pharmaceuticals',
    topic: 'Genotoxicity',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Standard genotoxicity battery and interpretation.',
    ctdModule: 'Module 4.2.3.3',
    keywords: ['genotoxicity', 'Ames', 'mutagenicity', 'micronucleus'],
  },
  {
    code: 'S3A/S3B',
    category: 'safety',
    title: 'Toxicokinetics and Pharmacokinetics in Toxicity Studies',
    topic: 'Toxicokinetics',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Exposure assessment (toxicokinetics) and repeat-dose tissue distribution in tox studies.',
    ctdModule: 'Module 4.2.2',
    keywords: ['toxicokinetics', 'exposure', 'pharmacokinetics'],
  },
  {
    code: 'S5(R3)',
    category: 'safety',
    title: 'Detection of Reproductive and Developmental Toxicity for Human Pharmaceuticals',
    topic: 'DART',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Design of reproductive and developmental toxicity (DART) studies.',
    ctdModule: 'Module 4.2.3.5',
    keywords: ['DART', 'reproductive toxicity', 'developmental toxicity', 'teratogenicity'],
  },
  {
    code: 'S6(R1)',
    category: 'safety',
    title: 'Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals',
    topic: 'Biologics nonclinical',
    appliesTo: ['biotech'],
    status: 'adopted',
    summary: 'Nonclinical safety strategy specific to biotech-derived products (species selection, immunogenicity).',
    ctdModule: 'Module 4',
    keywords: ['biologics', 'nonclinical safety', 'species selection', 'immunogenicity'],
  },
  {
    code: 'S7A/S7B',
    category: 'safety',
    title: 'Safety Pharmacology Studies (incl. QT/Delayed Ventricular Repolarisation)',
    topic: 'Safety pharmacology / hERG',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Core battery of safety pharmacology and nonclinical QT (hERG) assessment.',
    ctdModule: 'Module 4.2.1.3',
    keywords: ['safety pharmacology', 'hERG', 'QT', 'cardiac'],
  },
  {
    code: 'S9',
    category: 'safety',
    title: 'Nonclinical Evaluation for Anticancer Pharmaceuticals',
    topic: 'Oncology nonclinical',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Tailored, reduced nonclinical package appropriate to advanced-cancer development.',
    ctdModule: 'Module 4',
    keywords: ['oncology', 'anticancer', 'nonclinical'],
  },
  {
    code: 'S11',
    category: 'safety',
    title: 'Nonclinical Safety Testing in Support of Development of Paediatric Pharmaceuticals',
    topic: 'Pediatric nonclinical',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Juvenile animal studies and nonclinical considerations for pediatric programs.',
    ctdModule: 'Module 4',
    keywords: ['pediatric', 'juvenile animal', 'nonclinical'],
  },
  {
    code: 'S12',
    category: 'safety',
    title: 'Nonclinical Biodistribution Considerations for Gene Therapy Products',
    topic: 'Gene therapy biodistribution',
    appliesTo: ['biotech'],
    status: 'adopted',
    summary: 'Biodistribution study design and interpretation for gene therapy products.',
    ctdModule: 'Module 4',
    keywords: ['gene therapy', 'biodistribution', 'vector', 'cell and gene'],
  },
  {
    code: 'S4',
    category: 'safety',
    title: 'Duration of Chronic Toxicity Testing in Animals (Rodent and Non-Rodent Toxicity Testing)',
    topic: 'Chronic toxicity duration',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Sets the duration of chronic toxicity studies in rodent and non-rodent species.',
    ctdModule: 'Module 4.2.3.2',
    keywords: ['chronic toxicity', 'duration', 'rodent', 'non-rodent'],
  },
  {
    code: 'S8',
    category: 'safety',
    title: 'Immunotoxicity Studies for Human Pharmaceuticals',
    topic: 'Immunotoxicity',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'When and how to evaluate unintended immunosuppression or immunostimulation.',
    ctdModule: 'Module 4.2.3',
    keywords: ['immunotoxicity', 'immunosuppression', 'immunostimulation'],
  },
  {
    code: 'S10',
    category: 'safety',
    title: 'Photosafety Evaluation of Pharmaceuticals',
    topic: 'Photosafety',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Assessment of phototoxic potential for drugs that absorb light and distribute to skin/eye.',
    ctdModule: 'Module 4.2.3',
    keywords: ['photosafety', 'phototoxicity', 'UV'],
  },
];

const EFFICACY: IchGuideline[] = [
  {
    code: 'E2A',
    category: 'efficacy',
    title: 'Clinical Safety Data Management: Definitions and Standards for Expedited Reporting',
    topic: 'Expedited safety reporting',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Defines SAE/SUSAR and expedited reporting standards during clinical development.',
    ctdModule: 'Module 5',
    keywords: ['SAE', 'SUSAR', 'expedited reporting', 'pharmacovigilance', 'safety'],
  },
  {
    code: 'E2B(R3)',
    category: 'efficacy',
    title: 'Electronic Transmission of Individual Case Safety Reports (ICSRs)',
    topic: 'ICSR transmission',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Data elements and message standard (ICH ICSR/E2B) for electronic adverse-event reporting.',
    keywords: ['ICSR', 'E2B', 'adverse event', 'electronic reporting'],
  },
  {
    code: 'E2C(R2)',
    category: 'efficacy',
    title: 'Periodic Benefit-Risk Evaluation Report (PBRER)',
    topic: 'PBRER',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Structure and content of the periodic benefit-risk evaluation report for marketed products.',
    keywords: ['PBRER', 'PSUR', 'benefit-risk', 'periodic report', 'post-market'],
  },
  {
    code: 'E2D(R1)',
    category: 'efficacy',
    title: 'Post-Approval Safety Data Management',
    topic: 'Post-approval safety',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Definitions and standards for handling post-approval adverse-event data.',
    keywords: ['post-approval', 'safety data', 'adverse event'],
  },
  {
    code: 'E2E',
    category: 'efficacy',
    title: 'Pharmacovigilance Planning',
    topic: 'Pharmacovigilance planning',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Framework for the safety specification and pharmacovigilance plan (basis of RMPs).',
    keywords: ['pharmacovigilance', 'PV plan', 'safety specification', 'RMP'],
  },
  {
    code: 'E2F',
    category: 'efficacy',
    title: 'Development Safety Update Report (DSUR)',
    topic: 'DSUR',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Annual development-stage safety report harmonised across regions.',
    keywords: ['DSUR', 'development safety', 'annual report'],
  },
  {
    code: 'E3',
    category: 'efficacy',
    title: 'Structure and Content of Clinical Study Reports',
    topic: 'Clinical study reports',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'The canonical CSR structure relied on across submissions.',
    ctdModule: 'Module 5.3',
    keywords: ['CSR', 'clinical study report', 'study report'],
  },
  {
    code: 'E6(R3)',
    category: 'efficacy',
    title: 'Good Clinical Practice (GCP)',
    topic: 'GCP',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary:
      'The global standard for the design, conduct, recording and reporting of clinical trials; R3 modernises GCP around quality-by-design and varied trial types.',
    ctdModule: 'Module 5',
    keywords: ['GCP', 'good clinical practice', 'trial conduct', 'data integrity', 'ICH E6'],
  },
  {
    code: 'E8(R1)',
    category: 'efficacy',
    title: 'General Considerations for Clinical Studies',
    topic: 'Clinical study design',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Quality-by-design principles and critical-to-quality factors for clinical studies.',
    keywords: ['clinical study', 'quality by design', 'critical to quality', 'study design'],
  },
  {
    code: 'E9(R1)',
    category: 'efficacy',
    title: 'Statistical Principles for Clinical Trials (incl. Estimands and Sensitivity Analysis addendum)',
    topic: 'Statistics / estimands',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Statistical principles plus the estimand framework for defining and analysing treatment effects.',
    ctdModule: 'Module 5',
    keywords: ['statistics', 'estimand', 'intercurrent events', 'sensitivity analysis', 'SAP'],
  },
  {
    code: 'E10',
    category: 'efficacy',
    title: 'Choice of Control Group and Related Issues in Clinical Trials',
    topic: 'Control group choice',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Framework for selecting controls, including assay sensitivity and non-inferiority logic.',
    keywords: ['control group', 'non-inferiority', 'assay sensitivity', 'placebo'],
  },
  {
    code: 'E11(R1)',
    category: 'efficacy',
    title: 'Clinical Investigation of Medicinal Products in the Paediatric Population',
    topic: 'Pediatrics',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Core pediatric clinical development principles (companion: E11A on extrapolation).',
    keywords: ['pediatric', 'paediatric', 'children', 'extrapolation'],
  },
  {
    code: 'E14(R3)',
    category: 'efficacy',
    title: 'Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential',
    topic: 'Clinical QT',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Clinical QT assessment, including concentration-QT modelling and integration with S7B.',
    keywords: ['QT', 'QTc', 'thorough QT', 'proarrhythmia', 'concentration-QT'],
  },
  {
    code: 'E17',
    category: 'efficacy',
    title: 'General Principles for Planning and Design of Multi-Regional Clinical Trials',
    topic: 'MRCT',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary:
      'How to design one multi-regional trial that supports approval across regions — central to a global filing strategy.',
    keywords: ['MRCT', 'multi-regional', 'global trial', 'regional consistency', 'bridging'],
  },
  {
    code: 'E19',
    category: 'efficacy',
    title: 'Optimisation of Safety Data Collection',
    topic: 'Selective safety data',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'When a selective (rather than comprehensive) safety data collection approach is acceptable.',
    keywords: ['safety data collection', 'selective', 'late-stage'],
  },
  {
    code: 'E1',
    category: 'efficacy',
    title: 'The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions',
    topic: 'Safety exposure (long-term)',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Expected size and duration of the safety database for chronic-use products.',
    keywords: ['exposure', 'safety database', 'long-term', 'chronic'],
  },
  {
    code: 'E4',
    category: 'efficacy',
    title: 'Dose-Response Information to Support Drug Registration',
    topic: 'Dose-response',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'The role of dose-response data in establishing dose and supporting registration.',
    keywords: ['dose-response', 'dose finding', 'dose selection'],
  },
  {
    code: 'E5(R1)',
    category: 'efficacy',
    title: 'Ethnic Factors in the Acceptability of Foreign Clinical Data',
    topic: 'Ethnic factors / bridging',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Framework for evaluating whether foreign clinical data apply to a new region, and when a bridging study is needed.',
    keywords: ['ethnic factors', 'bridging', 'foreign data', 'extrapolation', 'Japan'],
  },
  {
    code: 'E7',
    category: 'efficacy',
    title: 'Studies in Support of Special Populations: Geriatrics',
    topic: 'Geriatrics',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Inclusion of older patients and assessment of age effects on safety/efficacy.',
    keywords: ['geriatrics', 'elderly', 'special population'],
  },
  {
    code: 'E11A',
    category: 'efficacy',
    title: 'Pediatric Extrapolation',
    topic: 'Pediatric extrapolation',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'How to use extrapolation to reduce the pediatric data needed when disease/response is sufficiently similar to adults.',
    keywords: ['pediatric', 'extrapolation', 'children', 'modelling'],
  },
  {
    code: 'E16',
    category: 'efficacy',
    title: 'Biomarkers Related to Drug or Biotechnology Product Development: Context, Structure and Format of Qualification Submissions',
    topic: 'Biomarker qualification',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Structure and content of biomarker qualification submissions.',
    keywords: ['biomarker', 'qualification', 'context of use'],
  },
  {
    code: 'E18',
    category: 'efficacy',
    title: 'Genomic Sampling and Management of Genomic Data',
    topic: 'Genomic sampling',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Principles for collecting, handling and consenting genomic samples and data in clinical studies.',
    keywords: ['genomic sampling', 'pharmacogenomics', 'consent', 'data management'],
  },
  {
    code: 'E20',
    category: 'efficacy',
    title: 'Adaptive Clinical Trials',
    topic: 'Adaptive designs',
    appliesTo: ['pharma', 'biotech'],
    status: 'draft',
    summary: 'Harmonised principles for the design, conduct and analysis of adaptive clinical trials.',
    keywords: ['adaptive design', 'interim analysis', 'sample size re-estimation', 'group sequential'],
  },
];

const MULTIDISCIPLINARY: IchGuideline[] = [
  {
    code: 'M1',
    category: 'multidisciplinary',
    title: 'MedDRA — Medical Dictionary for Regulatory Activities',
    topic: 'MedDRA terminology',
    appliesTo: ['pharma', 'biotech', 'mdx'],
    status: 'adopted',
    summary: 'The standardised medical terminology for coding adverse events and medical history.',
    keywords: ['MedDRA', 'terminology', 'coding', 'adverse event'],
  },
  {
    code: 'M3(R2)',
    category: 'multidisciplinary',
    title: 'Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization',
    topic: 'Nonclinical-to-clinical timing',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'What nonclinical work must precede each phase of human trials — the gatekeeper to first-in-human.',
    ctdModule: 'Module 4',
    keywords: ['nonclinical', 'first-in-human', 'phase timing', 'duration of dosing'],
  },
  {
    code: 'M4',
    category: 'multidisciplinary',
    title: 'Common Technical Document (CTD) — Organisation (M4Q, M4S, M4E)',
    topic: 'CTD structure',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary:
      'The CTD: the harmonised five-module structure (Quality/Safety/Efficacy) that every major-market dossier is built on.',
    ctdModule: 'Modules 2–5',
    keywords: ['CTD', 'common technical document', 'module', 'dossier structure'],
  },
  {
    code: 'M7(R2)',
    category: 'multidisciplinary',
    title: 'Assessment and Control of DNA Reactive (Mutagenic) Impurities to Limit Potential Carcinogenic Risk',
    topic: 'Mutagenic impurities',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Control of mutagenic impurities (incl. nitrosamines context) via the TTC and (Q)SAR assessment.',
    ctdModule: 'Module 3.2.S.3',
    keywords: ['mutagenic impurities', 'nitrosamines', 'TTC', 'QSAR', 'genotoxic impurity'],
  },
  {
    code: 'M8',
    category: 'multidisciplinary',
    title: 'Electronic Common Technical Document (eCTD)',
    topic: 'eCTD',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'The electronic specification and message standard for submitting the CTD to agencies.',
    keywords: ['eCTD', 'electronic submission', 'backbone', 'sequence'],
  },
  {
    code: 'M9',
    category: 'multidisciplinary',
    title: 'Biopharmaceutics Classification System-based Biowaivers',
    topic: 'BCS biowaivers',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'When in-vivo bioequivalence can be waived based on BCS class and dissolution.',
    keywords: ['BCS', 'biowaiver', 'bioequivalence', 'dissolution'],
  },
  {
    code: 'M10',
    category: 'multidisciplinary',
    title: 'Bioanalytical Method Validation and Study Sample Analysis',
    topic: 'Bioanalytical validation',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'Validation requirements for bioanalytical methods (chromatographic and ligand-binding assays).',
    ctdModule: 'Module 5',
    keywords: ['bioanalytical', 'method validation', 'LC-MS', 'ligand binding', 'PK'],
  },
  {
    code: 'M11',
    category: 'multidisciplinary',
    title: 'Clinical electronic Structured Harmonised Protocol (CeSHarP)',
    topic: 'Structured protocol',
    appliesTo: ['pharma', 'biotech'],
    status: 'draft',
    summary: 'A harmonised, structured clinical trial protocol template and technical specification.',
    keywords: ['protocol', 'structured protocol', 'CeSHarP', 'template'],
  },
  {
    code: 'M12',
    category: 'multidisciplinary',
    title: 'Drug Interaction Studies',
    topic: 'Drug-drug interactions',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Design and interpretation of in-vitro and clinical drug-drug interaction studies.',
    keywords: ['DDI', 'drug interaction', 'CYP', 'transporter'],
  },
  {
    code: 'M13A',
    category: 'multidisciplinary',
    title: 'Bioequivalence for Immediate-Release Solid Oral Dosage Forms',
    topic: 'Bioequivalence (IR oral)',
    appliesTo: ['pharma'],
    status: 'adopted',
    summary: 'Harmonised bioequivalence study design for immediate-release solid oral products (generics).',
    keywords: ['bioequivalence', 'generic', 'immediate release', 'oral'],
  },
  {
    code: 'M2',
    category: 'multidisciplinary',
    title: 'Electronic Standards for the Transfer of Regulatory Information (ESTRI)',
    topic: 'Electronic standards',
    appliesTo: ['pharma', 'biotech'],
    status: 'adopted',
    summary: 'The electronic-standards gateway work (ESTRI) underpinning eCTD and ICSR transmission.',
    keywords: ['ESTRI', 'electronic standards', 'gateway', 'transmission'],
  },
  {
    code: 'M13B',
    category: 'multidisciplinary',
    title: 'Bioequivalence for Immediate-Release Solid Oral Dosage Forms — Additional Strengths Biowaiver',
    topic: 'Bioequivalence — biowaiver of strengths',
    appliesTo: ['pharma'],
    status: 'draft',
    summary: 'Criteria for waiving in-vivo bioequivalence for additional strengths of an IR solid oral product.',
    keywords: ['bioequivalence', 'biowaiver', 'additional strengths', 'generic'],
  },
  {
    code: 'M14',
    category: 'multidisciplinary',
    title: 'General Principles on Planning and Designing Pharmacoepidemiological Studies That Utilise Real-World Data for Safety Assessment',
    topic: 'Real-world data for safety',
    appliesTo: ['pharma', 'biotech'],
    status: 'draft',
    summary: 'Harmonised principles for using real-world data in pharmacoepidemiological safety studies.',
    keywords: ['real-world data', 'RWD', 'RWE', 'pharmacoepidemiology', 'safety'],
  },
];

/** The full ICH guideline corpus. */
export const ICH_GUIDELINES: IchGuideline[] = [
  ...QUALITY,
  ...SAFETY,
  ...EFFICACY,
  ...MULTIDISCIPLINARY,
];

const BY_CODE = new Map(ICH_GUIDELINES.map(g => [g.code.toUpperCase(), g]));

/** Exact lookup by ICH code (case-insensitive; full code form). */
export function getGuideline(code: string): IchGuideline | undefined {
  return BY_CODE.get(code.trim().toUpperCase());
}

export function guidelinesByCategory(category: IchCategory): IchGuideline[] {
  return ICH_GUIDELINES.filter(g => g.category === category);
}

export function guidelinesForSegment(segment: ClientSegment): IchGuideline[] {
  return ICH_GUIDELINES.filter(g => g.appliesTo.includes(segment));
}

/**
 * Keyword search over code / title / topic / keywords. Also matches a bare
 * family letter+number prefix (e.g. "Q1", "E6", "M7") so partial codes resolve.
 */
export function searchGuidelines(query: string, limit = 8): IchGuideline[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/[\s,]+/).filter(Boolean);
  const scored = ICH_GUIDELINES.map(g => {
    const hay = `${g.code} ${g.title} ${g.topic} ${g.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (g.code.toLowerCase().startsWith(t)) score += 5;
      else if (g.code.toLowerCase().includes(t)) score += 4;
      if (g.keywords.some(k => k.toLowerCase() === t)) score += 3;
      if (hay.includes(t)) score += 1;
    }
    return { g, score };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.g);
}

const CATEGORY_LABEL: Record<IchCategory, string> = {
  quality: 'Quality (Q)',
  safety: 'Safety (S)',
  efficacy: 'Efficacy (E)',
  multidisciplinary: 'Multidisciplinary (M)',
};

/** Honest caveat appended to every rendered block. */
const VERIFY_NOTE =
  '_ICH revisions and step status evolve. Codes and titles above are stable, but confirm the current revision/step on ich.org before citing in a submission._';

/**
 * Render a Markdown block of relevant ICH guidelines for the chat system prompt.
 * If the message matches specific guidelines, those are shown; otherwise a
 * compact overview across the four families is returned.
 */
export function buildIchGuidelineBlock(opts: {
  message?: string;
  category?: IchCategory;
  segment?: ClientSegment;
  limit?: number;
}): string {
  const { message, category, segment, limit = 6 } = opts;

  let hits: IchGuideline[] = [];
  if (message && message.trim()) hits = searchGuidelines(message, limit);
  if (hits.length === 0 && category) hits = guidelinesByCategory(category).slice(0, limit);
  if (hits.length === 0 && segment) hits = guidelinesForSegment(segment).slice(0, limit);

  const lines: string[] = ['## ICH Guideline Reference'];

  if (hits.length > 0) {
    lines.push(
      'Relevant ICH guidelines (harmonised across ICH-member regulators — FDA, EMA, PMDA, Health Canada, Swissmedic, MHRA, MFDS, NMPA, ANVISA, and others):',
      ''
    );
    for (const g of hits) {
      const mod = g.ctdModule ? ` · CTD ${g.ctdModule}` : '';
      lines.push(`- **ICH ${g.code}** — ${g.title} _(${CATEGORY_LABEL[g.category]}; ${g.status}${mod})_`);
      lines.push(`  ${g.summary}`);
    }
  } else {
    lines.push(
      'The ICH canon spans four families, each adopted across ICH-member regulators worldwide:',
      `- **Quality (Q1–Q14):** stability, impurities, specifications, GMP/API, QbD, lifecycle (${guidelinesByCategory('quality').length} indexed)`,
      `- **Safety (S1–S12):** carcinogenicity, genotoxicity, tox, safety pharmacology, biologics & gene-therapy nonclinical (${guidelinesByCategory('safety').length} indexed)`,
      `- **Efficacy (E1–E20):** GCP, study design, statistics/estimands, pharmacovigilance, pediatrics, QT, MRCT (${guidelinesByCategory('efficacy').length} indexed)`,
      `- **Multidisciplinary (M1–M14):** MedDRA, CTD/eCTD, nonclinical timing, mutagenic impurities, bioanalytical, DDI (${guidelinesByCategory('multidisciplinary').length} indexed)`,
      '',
      'Name a topic (e.g. "stability", "estimand", "nitrosamine", "comparability") or a code (e.g. "E6", "Q3D") to pull the specific guideline.'
    );
  }

  lines.push('', VERIFY_NOTE);
  return lines.join('\n');
}

export interface IchCorpusSummary {
  total: number;
  byCategory: Record<IchCategory, number>;
  implementingRegulators: number;
}

export function ichCorpusSummary(): IchCorpusSummary {
  return {
    total: ICH_GUIDELINES.length,
    byCategory: {
      quality: guidelinesByCategory('quality').length,
      safety: guidelinesByCategory('safety').length,
      efficacy: guidelinesByCategory('efficacy').length,
      multidisciplinary: guidelinesByCategory('multidisciplinary').length,
    },
    implementingRegulators: ICH_IMPLEMENTING_REGULATORS.length,
  };
}
