/**
 * Template Catalog — which templates are OFFERED for a registry entry.
 *
 * Extracted from hardcoded logic in concept2cure.ts. Maps registry entries
 * to available document templates for section authoring. METADATA ONLY —
 * id, title, format, aiDraftable. It carries no section structure and it does
 * not decide which template applies.
 *
 * ── Which of the three "template" modules is this? ──────────────────────────
 * `DocumentTemplate` was exported by three modules in server/services/, with
 * three different shapes. Each now says what it owns and names the others:
 *
 *   · intelligence/template-registry.ts — WHICH template applies (DB-backed,
 *     async, most-specific-first resolution). Owns `DocumentTemplate`.
 *   · docx/templateRegistry.ts — what it LOOKS LIKE as a DOCX (static section
 *     blueprints for docxFactory). Owns `DocxTemplateBlueprint`.
 *   · THIS FILE — which are OFFERED, as metadata. Owns `CatalogTemplateEntry`.
 *
 * For the heading outlines this file deliberately lacks, see
 * `market-specs/document-template-library.ts`, keyed by the same ids.
 *
 * @module server/services/regulatory/templateCatalog
 */

import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import { US_BIOTECH_LIFECYCLE_METADATA } from '../market-specs/us-biotech-lifecycle-templates';
import { MEDICINAL_WORKING_METADATA } from '../market-specs/medicinal-working-templates';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogTemplateEntry {
  id: string;
  title: string;
  description: string;
  sectionCode?: string;
  format: 'narrative' | 'table' | 'form' | 'mixed';
  aiDraftable: boolean;
  category: string;
}

// ─── Template Definitions ─────────────────────────────────────────────────────

const CTD_TEMPLATES: CatalogTemplateEntry[] = [
  // FDA regional Module 1: the cover letter is 1.2; 1.1 is Forms.
  { id: 'cover_letter', title: 'Cover Letter', description: 'Regulatory submission cover letter', sectionCode: '1.2', format: 'narrative', aiDraftable: true, category: 'administrative' },
  { id: 'quality_overall_summary', title: 'Quality Overall Summary', description: 'Module 2.3 QOS per ICH M4Q', sectionCode: '2.3', format: 'narrative', aiDraftable: true, category: 'quality' },
  { id: 'nonclinical_overview', title: 'Nonclinical Overview', description: 'Module 2.4 nonclinical overview per ICH M4S', sectionCode: '2.4', format: 'narrative', aiDraftable: true, category: 'nonclinical' },
  { id: 'clinical_overview', title: 'Clinical Overview', description: 'Module 2.5 clinical overview per ICH M4E', sectionCode: '2.5', format: 'narrative', aiDraftable: true, category: 'clinical' },
  { id: 'clinical_summary', title: 'Clinical Summary', description: 'Module 2.7 clinical summary', sectionCode: '2.7', format: 'mixed', aiDraftable: true, category: 'clinical' },
  { id: 'drug_substance', title: 'Drug Substance', description: 'Source-supported Module 3.2.S narrative; mixed parts and original tables retain source preparation', sectionCode: '3.2.S', format: 'mixed', aiDraftable: true, category: 'quality' },
  { id: 'drug_product', title: 'Drug Product', description: 'Source-supported Module 3.2.P narrative; mixed parts and original tables retain source preparation', sectionCode: '3.2.P', format: 'mixed', aiDraftable: true, category: 'quality' },
];

const DEVICE_TEMPLATES: CatalogTemplateEntry[] = [
  { id: 'device_description', title: 'Device Description', description: 'Detailed device description and specifications', format: 'mixed', aiDraftable: true, category: 'device' },
  { id: 'predicate_comparison', title: 'Predicate Comparison', description: 'Substantial equivalence comparison table', format: 'table', aiDraftable: true, category: 'device' },
  { id: 'performance_testing', title: 'Performance Testing', description: 'Bench and clinical performance testing', format: 'mixed', aiDraftable: false, category: 'device' },
  { id: 'biocompatibility', title: 'Biocompatibility', description: 'ISO 10993 biocompatibility evaluation', format: 'mixed', aiDraftable: false, category: 'device' },
  { id: 'software_documentation', title: 'Software Documentation', description: 'IEC 62304 software lifecycle documentation', format: 'mixed', aiDraftable: false, category: 'device' },
];

const EU_SPECIFIC_TEMPLATES: CatalogTemplateEntry[] = [
  { id: 'smpc', title: 'Summary of Product Characteristics', description: 'SmPC per QRD template', format: 'narrative', aiDraftable: true, category: 'eu_regional' },
  { id: 'pil', title: 'Package Leaflet', description: 'Patient information leaflet per QRD template', format: 'narrative', aiDraftable: true, category: 'eu_regional' },
  { id: 'rmp', title: 'Risk Management Plan', description: 'EU RMP per GVP Module V', format: 'mixed', aiDraftable: false, category: 'safety' },
  { id: 'impd', title: 'Investigational Medicinal Product Dossier', description: 'IMPD for EU CTA', format: 'mixed', aiDraftable: false, category: 'eu_regional' },
];

// ─── Catalog Registry ─────────────────────────────────────────────────────────

const TEMPLATE_SETS: Record<string, CatalogTemplateEntry[]> = {
  clinical_documents: [
    { id: 'protocol', title: 'Clinical trial protocol', description: 'Working protocol from reviewed sources; approvals and generated schedules retain source preparation', format: 'mixed', aiDraftable: true, category: 'clinical' },
    { id: 'investigators_brochure', title: "Investigator's brochure", description: 'Narrative synthesis of supplied nonclinical, clinical and quality sources; not original study reports', format: 'mixed', aiDraftable: true, category: 'clinical' },
    { id: 'statistical_analysis_plan', title: 'Statistical analysis plan', description: 'Source-supported planned analyses; calculations require reviewed deterministic outputs', format: 'narrative', aiDraftable: true, category: 'clinical' },
    { id: 'informed_consent', title: 'Specimen informed consent form', description: 'Working participant information for ethics review; executed signatures remain original site records', format: 'mixed', aiDraftable: true, category: 'clinical' },
    { id: 'dsur', title: 'Development safety update report', description: 'Narrative assessment from reviewed safety sources; original listings, tables and appendices retain source preparation', format: 'mixed', aiDraftable: true, category: 'safety' },
    { id: 'pbrer', title: 'Periodic benefit-risk evaluation report', description: 'Narrative from reviewed safety and efficacy outputs; confirm applicability and retain original tabulations and appendices', format: 'mixed', aiDraftable: true, category: 'safety' },
    { id: 'clinical_study_report', title: 'Clinical Study Report', description: 'Full ICH E3 working report; original outputs and appendices require manual source preparation', sectionCode: '5.3.5.1', format: 'mixed', aiDraftable: true, category: 'clinical' },
    { id: 'blank_crf', title: 'Blank CRF design/specification', description: 'Working design for blank case report forms; not completed subject records', format: 'mixed', aiDraftable: true, category: 'clinical' },
    { id: 'crf_annotation_worksheet', title: 'CRF annotation worksheet', description: 'Working annotation planning from verified source specifications', format: 'mixed', aiDraftable: true, category: 'clinical' },
  ],
  us_biotech_lifecycle: US_BIOTECH_LIFECYCLE_METADATA,
  medicinal_working: MEDICINAL_WORKING_METADATA,
  nonclinical_working: MEDICINAL_WORKING_METADATA.filter(template => template.id === 'nonclinical_study_report'),
  ctd: CTD_TEMPLATES,
  device: DEVICE_TEMPLATES,
  eu_specific: EU_SPECIFIC_TEMPLATES,
  k510_summary: [{ id: 'k510_summary', title: '510(k) summary', description: 'Evidence-based narrative summary; not the eSTAR form or a substantial-equivalence decision', format: 'narrative', aiDraftable: true, category: 'device' }],
  ivdr_per: [{ id: 'performance_evaluation_report', title: 'Performance evaluation report', description: 'Narrative synthesis of supplied scientific validity, analytical and clinical performance evidence; not an evidence assessment', format: 'narrative', aiDraftable: true, category: 'device' }],
  mdr_gspr: [{ id: 'gspr_checklist', title: 'MDR GSPR checklist', description: 'Preparation groups for the applicable MDR checklist and evidence references', format: 'table', aiDraftable: false, category: 'device' }],
  ivdr_gspr: [{ id: 'ivdr_gspr_checklist', title: 'IVDR GSPR checklist', description: 'Preparation groups for the applicable IVDR checklist and evidence references', format: 'table', aiDraftable: false, category: 'device' }],
};

const REGISTRY_TO_TEMPLATE_SETS: Record<string, string[]> = {
  US_IND: ['ctd', 'clinical_documents', 'nonclinical_working'],
  US_NDA: ['ctd', 'clinical_documents', 'medicinal_working'],
  US_BLA: ['ctd', 'clinical_documents', 'medicinal_working'],
  US_ANDA: ['ctd'],
  US_505B2: ['ctd', 'clinical_documents', 'medicinal_working'],
  US_351K: ['ctd', 'clinical_documents', 'medicinal_working'],
  US_IND_AMENDMENT: ['ctd', 'clinical_documents'],
  US_NDA_SUPP: ['ctd', 'clinical_documents'],
  US_BLA_SUPP: ['ctd', 'clinical_documents'],
  ICH_PROTOCOL: ['clinical_documents'],
  ICH_IB: ['clinical_documents'],
  ICH_SAP: ['clinical_documents'],
  ICH_ICF: ['clinical_documents'],
  ICH_CSR: ['clinical_documents'],
  ICH_DSUR: ['clinical_documents'],
  US_510K: ['device', 'k510_summary'],
  US_PMA: ['device'],
  US_DE_NOVO: ['device'],
  EU_MDR_TECHDOC: ['mdr_gspr'],
  EU_IVDR: ['ivdr_per', 'ivdr_gspr'],
  EU_PER: ['ivdr_per'],
  EU_MAA: ['ctd', 'eu_specific'],
  EU_CTA: ['ctd', 'eu_specific'],
  CA_NDS: ['ctd'],
  JP_MKT_APPROVAL: ['ctd'],
  CN_CTA: ['ctd'],
  CN_MAA: ['ctd'],
};

// ─── Query Functions ──────────────────────────────────────────────────────────

/**
 * Get available templates for a registry entry.
 */
export function getTemplatesForType(registryIdOrLegacy: string): CatalogTemplateEntry[] {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  const sets = REGISTRY_TO_TEMPLATE_SETS[registryId] ?? ['ctd'];

  const templates: CatalogTemplateEntry[] = [];
  for (const setId of sets) {
    const set = TEMPLATE_SETS[setId];
    if (set) templates.push(...set);
  }

  return templates;
}

/**
 * Get all available template categories.
 */
export function getTemplateCategories(): string[] {
  const cats = new Set<string>();
  for (const templates of Object.values(TEMPLATE_SETS)) {
    for (const t of templates) {
      cats.add(t.category);
    }
  }
  return [...cats].sort();
}

/**
 * Search templates by query.
 */
export function searchTemplates(query: string, registryIdOrLegacy?: string): CatalogTemplateEntry[] {
  const q = query.toLowerCase();
  const templates = registryIdOrLegacy
    ? getTemplatesForType(registryIdOrLegacy)
    : [...new Map(Object.values(TEMPLATE_SETS).flat().map(template => [template.id, template])).values()];

  return templates.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.category.toLowerCase().includes(q)
  );
}
