/**
 * Template Catalog — Registry-driven document template mappings.
 *
 * Extracted from hardcoded logic in concept2cure.ts. Maps registry entries
 * to available document templates for section authoring.
 *
 * @module server/services/regulatory/templateCatalog
 */

import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentTemplate {
  id: string;
  title: string;
  description: string;
  sectionCode?: string;
  format: 'narrative' | 'table' | 'form' | 'mixed';
  aiDraftable: boolean;
  category: string;
}

// ─── Template Definitions ─────────────────────────────────────────────────────

const CTD_TEMPLATES: DocumentTemplate[] = [
  { id: 'cover_letter', title: 'Cover Letter', description: 'Regulatory submission cover letter', sectionCode: '1.1', format: 'narrative', aiDraftable: true, category: 'administrative' },
  { id: 'quality_overall_summary', title: 'Quality Overall Summary', description: 'Module 2.3 QOS per ICH M4Q', sectionCode: '2.3', format: 'narrative', aiDraftable: true, category: 'quality' },
  { id: 'nonclinical_overview', title: 'Nonclinical Overview', description: 'Module 2.4 nonclinical overview per ICH M4S', sectionCode: '2.4', format: 'narrative', aiDraftable: true, category: 'nonclinical' },
  { id: 'clinical_overview', title: 'Clinical Overview', description: 'Module 2.5 clinical overview per ICH M4E', sectionCode: '2.5', format: 'narrative', aiDraftable: true, category: 'clinical' },
  { id: 'clinical_summary', title: 'Clinical Summary', description: 'Module 2.7 clinical summary', sectionCode: '2.7', format: 'mixed', aiDraftable: true, category: 'clinical' },
  { id: 'drug_substance', title: 'Drug Substance', description: 'Module 3.2.S drug substance documentation', sectionCode: '3.2.S', format: 'mixed', aiDraftable: false, category: 'quality' },
  { id: 'drug_product', title: 'Drug Product', description: 'Module 3.2.P drug product documentation', sectionCode: '3.2.P', format: 'mixed', aiDraftable: false, category: 'quality' },
];

const DEVICE_TEMPLATES: DocumentTemplate[] = [
  { id: 'device_description', title: 'Device Description', description: 'Detailed device description and specifications', format: 'mixed', aiDraftable: true, category: 'device' },
  { id: 'predicate_comparison', title: 'Predicate Comparison', description: 'Substantial equivalence comparison table', format: 'table', aiDraftable: true, category: 'device' },
  { id: 'performance_testing', title: 'Performance Testing', description: 'Bench and clinical performance testing', format: 'mixed', aiDraftable: false, category: 'device' },
  { id: 'biocompatibility', title: 'Biocompatibility', description: 'ISO 10993 biocompatibility evaluation', format: 'mixed', aiDraftable: false, category: 'device' },
  { id: 'software_documentation', title: 'Software Documentation', description: 'IEC 62304 software lifecycle documentation', format: 'mixed', aiDraftable: false, category: 'device' },
];

const EU_SPECIFIC_TEMPLATES: DocumentTemplate[] = [
  { id: 'smpc', title: 'Summary of Product Characteristics', description: 'SmPC per QRD template', format: 'narrative', aiDraftable: true, category: 'eu_regional' },
  { id: 'pil', title: 'Package Leaflet', description: 'Patient information leaflet per QRD template', format: 'narrative', aiDraftable: true, category: 'eu_regional' },
  { id: 'rmp', title: 'Risk Management Plan', description: 'EU RMP per GVP Module V', format: 'mixed', aiDraftable: false, category: 'safety' },
  { id: 'impd', title: 'Investigational Medicinal Product Dossier', description: 'IMPD for EU CTA', format: 'mixed', aiDraftable: false, category: 'eu_regional' },
];

// ─── Catalog Registry ─────────────────────────────────────────────────────────

const TEMPLATE_SETS: Record<string, DocumentTemplate[]> = {
  ctd: CTD_TEMPLATES,
  device: DEVICE_TEMPLATES,
  eu_specific: EU_SPECIFIC_TEMPLATES,
};

const REGISTRY_TO_TEMPLATE_SETS: Record<string, string[]> = {
  US_IND: ['ctd'],
  US_NDA: ['ctd'],
  US_BLA: ['ctd'],
  US_ANDA: ['ctd'],
  US_505B2: ['ctd'],
  US_510K: ['device'],
  US_PMA: ['device'],
  US_DE_NOVO: ['device'],
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
export function getTemplatesForType(registryIdOrLegacy: string): DocumentTemplate[] {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  const sets = REGISTRY_TO_TEMPLATE_SETS[registryId] ?? ['ctd'];

  const templates: DocumentTemplate[] = [];
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
export function searchTemplates(query: string, registryIdOrLegacy?: string): DocumentTemplate[] {
  const q = query.toLowerCase();
  const templates = registryIdOrLegacy
    ? getTemplatesForType(registryIdOrLegacy)
    : [...CTD_TEMPLATES, ...DEVICE_TEMPLATES, ...EU_SPECIFIC_TEMPLATES];

  return templates.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.category.toLowerCase().includes(q)
  );
}
