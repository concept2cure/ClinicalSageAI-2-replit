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
const CTD_COMMON_MODULES: SectionDefinition[] = [
  // Module 2 — Common Technical Document Summaries
  { code: '2.1', title: 'Table of Contents (CTD)', module: 2, required: true, contentType: 'list' },
  { code: '2.2', title: 'Introduction', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4' },
  { code: '2.3', title: 'Quality Overall Summary', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4Q(R1)' },
  { code: '2.4', title: 'Nonclinical Overview', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4S(R2)' },
  { code: '2.5', title: 'Clinical Overview', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4E(R2)' },
  { code: '2.6', title: 'Nonclinical Written and Tabulated Summaries', module: 2, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '2.7', title: 'Clinical Summary', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },

  // Module 3 — Quality
  { code: '3.2.S', title: 'Drug Substance', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P', title: 'Drug Product', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.A', title: 'Appendices (Quality)', module: 3, required: false, contentType: 'mixed' },
  { code: '3.2.R', title: 'Regional Information (Quality)', module: 3, required: false, contentType: 'mixed' },
  { code: '3.3', title: 'Literature References (Quality)', module: 3, required: false, contentType: 'list' },

  // Module 4 — Nonclinical Study Reports
  { code: '4.2.1', title: 'Pharmacology', module: 4, required: true, contentType: 'mixed', guidance: 'ICH S7A/S7B' },
  { code: '4.2.2', title: 'Pharmacokinetics', module: 4, required: true, contentType: 'mixed', guidance: 'ICH S3A/S3B' },
  { code: '4.2.3', title: 'Toxicology', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '4.3', title: 'Literature References (Nonclinical)', module: 4, required: false, contentType: 'list' },

  // Module 5 — Clinical Study Reports
  { code: '5.2', title: 'Tabular Listing of Clinical Studies', module: 5, required: false, contentType: 'table' },
  { code: '5.3', title: 'Clinical Study Reports', module: 5, required: false, contentType: 'mixed', guidance: 'ICH E3' },
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

  // Apply clinical required override
  if (options.clinicalRequired) {
    sections = sections.map(s =>
      (s.code === '2.7' || s.code === '5.2' || s.code === '5.3')
        ? { ...s, required: true }
        : s
    );
  }

  // Apply nonclinical summary override
  if (options.nonclinicalSummaryRequired) {
    sections = sections.map(s =>
      s.code === '2.6' ? { ...s, required: true } : s
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
