/**
 * ICH guideline reference catalog — Quality, Safety, Efficacy, Multidisciplinary.
 *
 * The International Council for Harmonisation of Technical Requirements for
 * Pharmaceuticals for Human Use (ICH) publishes harmonised guidelines that
 * structure global drug development and registration. This service encodes the
 * well-known ICH guideline codes + titles as a typed, deterministic catalog and
 * provides pure lookup / filter / search helpers — the reference a regulatory
 * strategist reaches for when mapping a development question to its guideline.
 *
 * Categories: Quality (Q), Safety (S), Efficacy (E), Multidisciplinary (M).
 *
 * Pure / deterministic — no DB, no IO.
 *
 * Reference: ICH harmonised guidelines (https://www.ich.org).
 *
 * @module server/services/global-ri/ich-guideline-catalog
 */

export type GuidelineCategory = 'Quality' | 'Safety' | 'Efficacy' | 'Multidisciplinary';

export interface Guideline {
  /** ICH guideline code (e.g. 'Q1', 'E6', 'M4'). */
  code: string;
  /** Official guideline title / subject. */
  title: string;
  category: GuidelineCategory;
  /** Short topic label for grouping and search. */
  topic: string;
}

/** The modeled ICH guideline catalog (deterministic order: Q, S, E, M by code). */
export const ICH_GUIDELINES: Guideline[] = [
  // ── Quality (Q) ────────────────────────────────────────────────────────────
  { code: 'Q1', title: 'Stability Testing of New Drug Substances and Products', category: 'Quality', topic: 'Stability' },
  { code: 'Q2', title: 'Validation of Analytical Procedures', category: 'Quality', topic: 'Analytical validation' },
  { code: 'Q3A', title: 'Impurities in New Drug Substances', category: 'Quality', topic: 'Impurities' },
  { code: 'Q3B', title: 'Impurities in New Drug Products', category: 'Quality', topic: 'Impurities' },
  { code: 'Q3C', title: 'Impurities: Guideline for Residual Solvents', category: 'Quality', topic: 'Residual solvents' },
  { code: 'Q3D', title: 'Guideline for Elemental Impurities', category: 'Quality', topic: 'Elemental impurities' },
  { code: 'Q5A', title: 'Viral Safety Evaluation of Biotechnology Products Derived from Cell Lines of Human or Animal Origin', category: 'Quality', topic: 'Biotechnology' },
  { code: 'Q5B', title: 'Analysis of the Expression Construct in Cells Used for Production of r-DNA Derived Protein Products', category: 'Quality', topic: 'Biotechnology' },
  { code: 'Q5C', title: 'Stability Testing of Biotechnological/Biological Products', category: 'Quality', topic: 'Biotechnology' },
  { code: 'Q5D', title: 'Derivation and Characterisation of Cell Substrates Used for Production of Biotechnological/Biological Products', category: 'Quality', topic: 'Biotechnology' },
  { code: 'Q5E', title: 'Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process', category: 'Quality', topic: 'Biotechnology' },
  { code: 'Q6A', title: 'Specifications: Test Procedures and Acceptance Criteria for New Drug Substances and New Drug Products: Chemical Substances', category: 'Quality', topic: 'Specifications' },
  { code: 'Q6B', title: 'Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products', category: 'Quality', topic: 'Specifications' },
  { code: 'Q7', title: 'Good Manufacturing Practice Guide for Active Pharmaceutical Ingredients', category: 'Quality', topic: 'GMP' },
  { code: 'Q8', title: 'Pharmaceutical Development', category: 'Quality', topic: 'Pharmaceutical development' },
  { code: 'Q9', title: 'Quality Risk Management', category: 'Quality', topic: 'Quality risk management' },
  { code: 'Q10', title: 'Pharmaceutical Quality System', category: 'Quality', topic: 'Quality system' },
  { code: 'Q11', title: 'Development and Manufacture of Drug Substances (Chemical Entities and Biotechnological/Biological Entities)', category: 'Quality', topic: 'Drug substance' },
  { code: 'Q12', title: 'Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management', category: 'Quality', topic: 'Lifecycle management' },
  { code: 'Q13', title: 'Continuous Manufacturing of Drug Substances and Drug Products', category: 'Quality', topic: 'Continuous manufacturing' },
  { code: 'Q14', title: 'Analytical Procedure Development', category: 'Quality', topic: 'Analytical development' },

  // ── Safety (S) ─────────────────────────────────────────────────────────────
  { code: 'S1A', title: 'Need for Carcinogenicity Studies of Pharmaceuticals', category: 'Safety', topic: 'Carcinogenicity' },
  { code: 'S1B', title: 'Testing for Carcinogenicity of Pharmaceuticals', category: 'Safety', topic: 'Carcinogenicity' },
  { code: 'S1C', title: 'Dose Selection for Carcinogenicity Studies of Pharmaceuticals', category: 'Safety', topic: 'Carcinogenicity' },
  { code: 'S2', title: 'Genotoxicity Testing and Data Interpretation for Pharmaceuticals Intended for Human Use', category: 'Safety', topic: 'Genotoxicity' },
  { code: 'S3A', title: 'Note for Guidance on Toxicokinetics: The Assessment of Systemic Exposure in Toxicity Studies', category: 'Safety', topic: 'Toxicokinetics' },
  { code: 'S3B', title: 'Pharmacokinetics: Guidance for Repeated Dose Tissue Distribution Studies', category: 'Safety', topic: 'Pharmacokinetics' },
  { code: 'S4', title: 'Duration of Chronic Toxicity Testing in Animals (Rodent and Non-Rodent Toxicity Testing)', category: 'Safety', topic: 'Chronic toxicity' },
  { code: 'S5', title: 'Detection of Reproductive and Developmental Toxicity for Human Pharmaceuticals', category: 'Safety', topic: 'Reproductive toxicity' },
  { code: 'S6', title: 'Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals', category: 'Safety', topic: 'Biotechnology safety' },
  { code: 'S7A', title: 'Safety Pharmacology Studies for Human Pharmaceuticals', category: 'Safety', topic: 'Safety pharmacology' },
  { code: 'S7B', title: 'The Non-Clinical Evaluation of the Potential for Delayed Ventricular Repolarization (QT Interval Prolongation) by Human Pharmaceuticals', category: 'Safety', topic: 'Safety pharmacology' },
  { code: 'S8', title: 'Immunotoxicity Studies for Human Pharmaceuticals', category: 'Safety', topic: 'Immunotoxicity' },
  { code: 'S9', title: 'Nonclinical Evaluation for Anticancer Pharmaceuticals', category: 'Safety', topic: 'Anticancer' },
  { code: 'S11', title: 'Nonclinical Safety Testing in Support of Development of Paediatric Pharmaceuticals', category: 'Safety', topic: 'Pediatric' },

  // ── Efficacy (E) ───────────────────────────────────────────────────────────
  { code: 'E1', title: 'The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions', category: 'Efficacy', topic: 'Population exposure' },
  { code: 'E2A', title: 'Clinical Safety Data Management: Definitions and Standards for Expedited Reporting', category: 'Efficacy', topic: 'Pharmacovigilance' },
  { code: 'E2B', title: 'Clinical Safety Data Management: Data Elements for Transmission of Individual Case Safety Reports', category: 'Efficacy', topic: 'Pharmacovigilance' },
  { code: 'E2C', title: 'Periodic Benefit-Risk Evaluation Report (PBRER)', category: 'Efficacy', topic: 'Pharmacovigilance' },
  { code: 'E2D', title: 'Post-Approval Safety Data Management: Definitions and Standards for Expedited Reporting', category: 'Efficacy', topic: 'Pharmacovigilance' },
  { code: 'E2E', title: 'Pharmacovigilance Planning', category: 'Efficacy', topic: 'Pharmacovigilance' },
  { code: 'E2F', title: 'Development Safety Update Report (DSUR)', category: 'Efficacy', topic: 'Pharmacovigilance' },
  { code: 'E3', title: 'Structure and Content of Clinical Study Reports', category: 'Efficacy', topic: 'Clinical study reports' },
  { code: 'E4', title: 'Dose-Response Information to Support Drug Registration', category: 'Efficacy', topic: 'Dose-response' },
  { code: 'E5', title: 'Ethnic Factors in the Acceptability of Foreign Clinical Data', category: 'Efficacy', topic: 'Ethnic factors' },
  { code: 'E6', title: 'Good Clinical Practice', category: 'Efficacy', topic: 'Good Clinical Practice' },
  { code: 'E7', title: 'Studies in Support of Special Populations: Geriatrics', category: 'Efficacy', topic: 'Geriatrics' },
  { code: 'E8', title: 'General Considerations for Clinical Studies', category: 'Efficacy', topic: 'Clinical study design' },
  { code: 'E9', title: 'Statistical Principles for Clinical Trials', category: 'Efficacy', topic: 'Statistics' },
  { code: 'E10', title: 'Choice of Control Group and Related Issues in Clinical Trials', category: 'Efficacy', topic: 'Control group' },
  { code: 'E11', title: 'Clinical Investigation of Medicinal Products in the Pediatric Population', category: 'Efficacy', topic: 'Pediatric' },
  { code: 'E14', title: 'The Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential for Non-Antiarrhythmic Drugs', category: 'Efficacy', topic: 'QT/QTc' },
  { code: 'E17', title: 'General Principles for Planning and Design of Multi-Regional Clinical Trials', category: 'Efficacy', topic: 'Multi-regional trials' },
  { code: 'E19', title: 'Optimisation of Safety Data Collection', category: 'Efficacy', topic: 'Safety data collection' },

  // ── Multidisciplinary (M) ──────────────────────────────────────────────────
  { code: 'M1', title: 'MedDRA — Medical Dictionary for Regulatory Activities', category: 'Multidisciplinary', topic: 'Terminology' },
  { code: 'M2', title: 'Electronic Standards for the Transfer of Regulatory Information (ESTRI)', category: 'Multidisciplinary', topic: 'Electronic standards' },
  { code: 'M3', title: 'Guidance on Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization for Pharmaceuticals', category: 'Multidisciplinary', topic: 'Nonclinical safety' },
  { code: 'M4', title: 'Common Technical Document (CTD)', category: 'Multidisciplinary', topic: 'CTD' },
  { code: 'M7', title: 'Assessment and Control of DNA Reactive (Mutagenic) Impurities in Pharmaceuticals to Limit Potential Carcinogenic Risk', category: 'Multidisciplinary', topic: 'Mutagenic impurities' },
  { code: 'M8', title: 'Electronic Common Technical Document (eCTD)', category: 'Multidisciplinary', topic: 'eCTD' },
  { code: 'M9', title: 'Biopharmaceutics Classification System-Based Biowaivers', category: 'Multidisciplinary', topic: 'Biowaivers' },
  { code: 'M10', title: 'Bioanalytical Method Validation and Study Sample Analysis', category: 'Multidisciplinary', topic: 'Bioanalytical validation' },
  { code: 'M11', title: 'Clinical Electronic Structured Harmonised Protocol (CeSHarP) — Clinical Protocol Template', category: 'Multidisciplinary', topic: 'Protocol template' },
  { code: 'M12', title: 'Drug Interaction Studies', category: 'Multidisciplinary', topic: 'Drug interactions' },
];

const GUIDELINE_CATEGORIES: GuidelineCategory[] = ['Quality', 'Safety', 'Efficacy', 'Multidisciplinary'];

/** The four ICH guideline categories. */
export function listCategories(): GuidelineCategory[] {
  return [...GUIDELINE_CATEGORIES];
}

/**
 * Look up a single guideline by code (case-insensitive).
 * Returns undefined when no guideline matches.
 * Pure / deterministic.
 */
export function getGuideline(code: string): Guideline | undefined {
  const needle = code.trim().toLowerCase();
  return ICH_GUIDELINES.find((g) => g.code.toLowerCase() === needle);
}

/**
 * All guidelines in a category, in the catalog's stable order.
 * Pure / deterministic.
 */
export function guidelinesByCategory(category: GuidelineCategory): Guideline[] {
  return ICH_GUIDELINES.filter((g) => g.category === category);
}

/**
 * Case-insensitive substring search over code + title + topic.
 * Results are ordered by code (stable, deterministic).
 * Pure / deterministic.
 */
export function searchGuidelines(query: string): Guideline[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  return ICH_GUIDELINES.filter((g) =>
    `${g.code} ${g.title} ${g.topic}`.toLowerCase().includes(needle),
  ).sort((a, b) => a.code.localeCompare(b.code));
}
