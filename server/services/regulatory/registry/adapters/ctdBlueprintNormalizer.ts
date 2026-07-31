/**
 * CTD Blueprint Normalizer — Normalizes different CTD-based section
 * structures into a consistent SectionDefinition format.
 *
 * Different regions use variants of the CTD structure:
 * - ICH CTD (international standard, Modules 1-5)
 * - eCTD (electronic CTD, same structure, electronic format)
 * - ACTD (ASEAN CTD, adapted Module 1)
 * - NeeS (Non-eCTD electronic Submissions, EU legacy)
 *
 * This normalizer ensures all CTD-based blueprints share a common
 * section model regardless of regional variations.
 *
 * @module server/services/regulatory/registry/adapters/ctdBlueprintNormalizer
 */

import type { SectionDefinition, SectionBlueprint, DossierStandard } from '../../../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NormalizationOptions {
  /** Whether Module 1 is region-specific (true for most regions) */
  regionSpecificModule1: boolean;
  /** Region code for Module 1 customization */
  region?: string;
  /** Whether all clinical sections (M5) are required */
  clinicalRequired: boolean;
  /** Whether nonclinical summaries (M2.6) are required */
  nonclinicalSummaryRequired: boolean;
  /** Override required flags for specific section codes */
  requiredOverrides?: Record<string, boolean>;
}

// ─── Core CTD Template ────────────────────────────────────────────────────────

/**
 * Standard ICH CTD Module 2-5 sections that are common across all
 * CTD-based dossier standards. Module 1 is always region-specific.
 */
// Deep, leaf-level CTD Module 2-5 template. Every marketing application (NDA,
// BLA) and regional MAA/CTA that normalizes through buildCTDBlueprint inherits
// this granularity, so a sponsor can author 3.2.S.4 (Control of Drug Substance),
// 2.7.4 (Summary of Clinical Safety), 4.2.3.2 (Repeat-Dose Toxicity), 5.3.5.3
// (ISS/ISE integrated analyses), etc. as first-class sections — not a single
// 3.2.S / 3.2.P / 5.3 blob. Parent nodes are retained as navigational headings.
// Per-section AUTHORING GUIDANCE lives in the canonical guidance overlay
// (server/services/ind/ctd) keyed by these same codes.
const CTD_COMMON_MODULES: SectionDefinition[] = [
  // Module 2 — Common Technical Document Summaries
  { code: '2.1', title: 'Table of Contents (CTD)', module: 2, required: true, contentType: 'list' },
  { code: '2.2', title: 'Introduction', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4' },
  { code: '2.3', title: 'Quality Overall Summary', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4Q(R1)' },
  { code: '2.4', title: 'Nonclinical Overview', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4S(R2)' },
  { code: '2.5', title: 'Clinical Overview', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4E(R2)' },
  { code: '2.6', title: 'Nonclinical Written and Tabulated Summaries', module: 2, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '2.6.1', title: 'Introduction (Nonclinical Summary)', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4S(R2)' },
  { code: '2.6.2', title: 'Pharmacology Written Summary', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4S(R2)' },
  { code: '2.6.3', title: 'Pharmacology Tabulated Summary', module: 2, required: true, contentType: 'table', guidance: 'ICH M4S(R2)' },
  { code: '2.6.4', title: 'Pharmacokinetics Written Summary', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4S(R2)' },
  { code: '2.6.5', title: 'Pharmacokinetics Tabulated Summary', module: 2, required: true, contentType: 'table', guidance: 'ICH M4S(R2)' },
  { code: '2.6.6', title: 'Toxicology Written Summary', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4S(R2)' },
  { code: '2.6.7', title: 'Toxicology Tabulated Summary', module: 2, required: true, contentType: 'table', guidance: 'ICH M4S(R2)' },
  { code: '2.7', title: 'Clinical Summary', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '2.7.1', title: 'Summary of Biopharmaceutic Studies and Associated Analytical Methods', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '2.7.2', title: 'Summary of Clinical Pharmacology Studies', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '2.7.3', title: 'Summary of Clinical Efficacy', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '2.7.4', title: 'Summary of Clinical Safety', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '2.7.5', title: 'Literature References', module: 2, required: false, contentType: 'list', guidance: 'ICH M4E(R2)' },
  { code: '2.7.6', title: 'Synopses of Individual Studies', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },

  // Module 3 — Quality
  { code: '3.2.S', title: 'Drug Substance', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.S.1', title: 'General Information (Nomenclature, Structure, Properties)', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.S.2', title: 'Manufacture (Manufacturer, Process, Controls, Validation)', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q11' },
  { code: '3.2.S.3', title: 'Characterisation (Structure Elucidation, Impurities)', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q6A/Q6B' },
  { code: '3.2.S.4', title: 'Control of Drug Substance (Specification, Methods, Validation)', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q6A' },
  { code: '3.2.S.5', title: 'Reference Standards or Materials', module: 3, required: true, contentType: 'data', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.S.6', title: 'Container Closure System', module: 3, required: true, contentType: 'narrative', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.S.7', title: 'Stability', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q1A(R2)' },
  { code: '3.2.P', title: 'Drug Product', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P.1', title: 'Description and Composition of the Drug Product', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P.2', title: 'Pharmaceutical Development', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q8(R2)' },
  { code: '3.2.P.3', title: 'Manufacture (Batch Formula, Process, Controls, Validation)', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q8(R2)' },
  { code: '3.2.P.4', title: 'Control of Excipients', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P.5', title: 'Control of Drug Product (Specification, Methods, Validation)', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q6A' },
  { code: '3.2.P.6', title: 'Reference Standards or Materials', module: 3, required: true, contentType: 'data', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P.7', title: 'Container Closure System', module: 3, required: true, contentType: 'narrative', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P.8', title: 'Stability', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q1A(R2)' },
  { code: '3.2.A', title: 'Appendices (Facilities, Adventitious Agents, Excipients)', module: 3, required: false, contentType: 'mixed' },
  { code: '3.2.R', title: 'Regional Information (Quality)', module: 3, required: false, contentType: 'mixed' },
  { code: '3.3', title: 'Literature References (Quality)', module: 3, required: false, contentType: 'list' },

  // Module 4 — Nonclinical Study Reports
  { code: '4.2.1', title: 'Pharmacology', module: 4, required: true, contentType: 'mixed', guidance: 'ICH S7A/S7B' },
  { code: '4.2.1.1', title: 'Primary Pharmacodynamics', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.1.2', title: 'Secondary Pharmacodynamics', module: 4, required: false, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.1.3', title: 'Safety Pharmacology', module: 4, required: true, contentType: 'mixed', guidance: 'ICH S7A/S7B' },
  { code: '4.2.1.4', title: 'Pharmacodynamic Drug Interactions', module: 4, required: false, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.2', title: 'Pharmacokinetics', module: 4, required: true, contentType: 'mixed', guidance: 'ICH S3A/S3B' },
  { code: '4.2.2.1', title: 'Analytical Methods and Validation Reports', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.2.2', title: 'Absorption', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.2.3', title: 'Distribution', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.2.4', title: 'Metabolism', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.2.5', title: 'Excretion', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.2.6', title: 'Pharmacokinetic Drug Interactions (Nonclinical)', module: 4, required: false, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.2.7', title: 'Other Pharmacokinetic Studies', module: 4, required: false, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '4.2.3', title: 'Toxicology', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '4.2.3.1', title: 'Single-Dose Toxicity', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '4.2.3.2', title: 'Repeat-Dose Toxicity', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '4.2.3.3', title: 'Genotoxicity', module: 4, required: true, contentType: 'mixed', guidance: 'ICH S2(R1)' },
  { code: '4.2.3.4', title: 'Carcinogenicity', module: 4, required: false, contentType: 'mixed', guidance: 'ICH S1A/S1B/S1C(R2)' },
  { code: '4.2.3.5', title: 'Reproductive and Developmental Toxicity', module: 4, required: false, contentType: 'mixed', guidance: 'ICH S5(R3)' },
  { code: '4.2.3.6', title: 'Local Tolerance', module: 4, required: false, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '4.2.3.7', title: 'Other Toxicity Studies', module: 4, required: false, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '4.3', title: 'Literature References (Nonclinical)', module: 4, required: false, contentType: 'list' },

  // Module 5 — Clinical Study Reports
  { code: '5.2', title: 'Tabular Listing of All Clinical Studies', module: 5, required: false, contentType: 'table' },
  { code: '5.3', title: 'Clinical Study Reports', module: 5, required: false, contentType: 'mixed', guidance: 'ICH E3' },
  { code: '5.3.1', title: 'Reports of Biopharmaceutic Studies', module: 5, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '5.3.2', title: 'Reports of Studies Pertinent to Pharmacokinetics using Human Biomaterials', module: 5, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '5.3.3', title: 'Reports of Human Pharmacokinetic (PK) Studies', module: 5, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '5.3.4', title: 'Reports of Human Pharmacodynamic (PD) Studies', module: 5, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '5.3.5', title: 'Reports of Efficacy and Safety Studies', module: 5, required: false, contentType: 'mixed', guidance: 'ICH E3' },
  { code: '5.3.5.1', title: 'Study Reports of Controlled Clinical Studies', module: 5, required: false, contentType: 'mixed', guidance: 'ICH E3' },
  { code: '5.3.5.2', title: 'Study Reports of Uncontrolled Clinical Studies', module: 5, required: false, contentType: 'mixed', guidance: 'ICH E3' },
  { code: '5.3.5.3', title: 'Reports of Analyses of Data from More than One Study (ISS / ISE)', module: 5, required: false, contentType: 'mixed', guidance: 'FDA Integrated Summary of Safety/Efficacy guidance' },
  { code: '5.3.5.4', title: 'Other Clinical Study Reports', module: 5, required: false, contentType: 'mixed', guidance: 'ICH E3' },
  { code: '5.3.6', title: 'Reports of Post-Marketing Experience', module: 5, required: false, contentType: 'mixed' },
  { code: '5.3.7', title: 'Case Report Forms and Individual Patient Listings', module: 5, required: false, contentType: 'data', guidance: 'ICH E3' },
  { code: '5.4', title: 'Literature References (Clinical)', module: 5, required: false, contentType: 'list' },
];

// ─── Region-Specific Module 1 Templates ───────────────────────────────────────

const MODULE_1_TEMPLATES: Record<string, SectionDefinition[]> = {
  US: [
    { code: '1.1', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
    { code: '1.2', title: 'Administrative Forms', module: 1, required: true, contentType: 'form' },
    { code: '1.3', title: 'Prescribing Information / Labeling', module: 1, required: false, contentType: 'narrative' },
    { code: '1.4', title: 'References', module: 1, required: false, contentType: 'list' },
    { code: '1.5', title: 'Table of Contents', module: 1, required: true, contentType: 'list' },
  ],
  EU: [
    { code: '1.0', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
    { code: '1.2', title: 'Application Form', module: 1, required: true, contentType: 'form' },
    { code: '1.3.1', title: 'Summary of Product Characteristics (SmPC)', module: 1, required: true, contentType: 'narrative' },
    { code: '1.3.2', title: 'Package Leaflet', module: 1, required: true, contentType: 'narrative' },
    { code: '1.3.3', title: 'Labelling', module: 1, required: true, contentType: 'narrative' },
    { code: '1.4', title: 'Expert Reports', module: 1, required: false, contentType: 'narrative' },
    { code: '1.5', title: 'Specific Requirements', module: 1, required: false, contentType: 'mixed' },
  ],
  JP: [
    { code: '1.1', title: 'Cover Letter (Japan)', module: 1, required: true, contentType: 'narrative' },
    { code: '1.2', title: 'Application Form', module: 1, required: true, contentType: 'form' },
    { code: '1.5', title: 'Table of Contents', module: 1, required: true, contentType: 'list' },
    { code: '1.6', title: 'Certificate of Pharmaceutical Product (CPP)', module: 1, required: false, contentType: 'form' },
    { code: '1.12', title: 'Information on Local Agent', module: 1, required: true, contentType: 'form' },
    { code: '1.13', title: 'PMDA Specific Data', module: 1, required: false, contentType: 'mixed' },
  ],
  // Health Canada CTD Module 1 (per HC "Preparation of Drug Regulatory
  // Activities in eCTD Format" guidance). Canada uses a region-specific
  // Module 1 distinct from the ICH default; the Product Monograph is the
  // hallmark HC-specific labeling artifact.
  CA: [
    { code: '1.0', title: 'Correspondence / Cover Letter', module: 1, required: true, contentType: 'narrative' },
    { code: '1.1', title: 'Comprehensive Table of Contents', module: 1, required: true, contentType: 'list' },
    { code: '1.2', title: 'Administrative Information (HC/SC Application & Fee Forms)', module: 1, required: true, contentType: 'form' },
    { code: '1.3', title: 'Product Information (Product Monograph, Labels, Package Insert)', module: 1, required: true, contentType: 'narrative' },
    { code: '1.4', title: 'Health Canada Summaries', module: 1, required: false, contentType: 'mixed' },
    { code: '1.5', title: 'Environmental Assessment', module: 1, required: false, contentType: 'narrative' },
  ],
  DEFAULT: [
    { code: '1.1', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
    { code: '1.2', title: 'Administrative Forms', module: 1, required: true, contentType: 'form' },
    { code: '1.5', title: 'Table of Contents', module: 1, required: true, contentType: 'list' },
  ],
};

// ─── Normalizer Functions ─────────────────────────────────────────────────────

/**
 * Build a normalized CTD section blueprint for a given region and options.
 */
export function buildCTDBlueprint(
  id: string,
  name: string,
  options: NormalizationOptions
): SectionBlueprint {
  // Get region-specific Module 1
  const module1 = options.regionSpecificModule1
    ? (MODULE_1_TEMPLATES[options.region ?? 'DEFAULT'] ?? MODULE_1_TEMPLATES.DEFAULT)
    : MODULE_1_TEMPLATES.DEFAULT;

  // Start with common modules
  let sections = [...module1, ...CTD_COMMON_MODULES];

  // Apply clinical required override — marketing applications (NDA/BLA/MAA)
  // require the full clinical summary (2.7.*) and clinical study reports (5.2,
  // 5.3.*), including the ISS/ISE integrated analyses at 5.3.5.3.
  if (options.clinicalRequired) {
    sections = sections.map(s =>
      (s.code === '2.7' || s.code.startsWith('2.7.') ||
       s.code === '5.2' || s.code === '5.3' || s.code.startsWith('5.3.'))
        ? { ...s, required: true }
        : s
    );
  }

  // Apply nonclinical summary override — the 2.6.* written/tabulated summaries.
  if (options.nonclinicalSummaryRequired) {
    sections = sections.map(s =>
      (s.code === '2.6' || s.code.startsWith('2.6.')) ? { ...s, required: true } : s
    );
  }

  // Apply specific overrides
  if (options.requiredOverrides) {
    sections = sections.map(s =>
      s.code in options.requiredOverrides!
        ? { ...s, required: options.requiredOverrides![s.code] }
        : s
    );
  }

  // Sort by module then code
  sections.sort((a, b) => a.module - b.module || a.code.localeCompare(b.code));

  return { id, name, sections };
}

/**
 * Build an NDA/BLA-style blueprint (full CTD, all clinical required).
 */
export function buildMarketingAuthorizationBlueprint(
  id: string,
  name: string,
  region: string
): SectionBlueprint {
  return buildCTDBlueprint(id, name, {
    regionSpecificModule1: true,
    region,
    clinicalRequired: true,
    nonclinicalSummaryRequired: true,
  });
}

/**
 * Build an IND/CTA-style blueprint (CTD, clinical data optional).
 */
export function buildClinicalTrialBlueprint(
  id: string,
  name: string,
  region: string
): SectionBlueprint {
  return buildCTDBlueprint(id, name, {
    regionSpecificModule1: true,
    region,
    clinicalRequired: false,
    nonclinicalSummaryRequired: true,
  });
}

/**
 * Get the Module 1 template for a region.
 */
export function getModule1Template(region: string): SectionDefinition[] {
  return MODULE_1_TEMPLATES[region] ?? MODULE_1_TEMPLATES.DEFAULT;
}
