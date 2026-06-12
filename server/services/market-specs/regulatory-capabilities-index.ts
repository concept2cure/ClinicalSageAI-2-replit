/**
 * Regulatory capabilities index — a single, discoverable catalog of the
 * deterministic regulatory capabilities the Submission Center exposes, each mapped
 * to its primary HTTP route and AnA tool.
 *
 * WHY THIS EXISTS: this layer grew to many modules/routes/tools. The incoming UI
 * (and AnA itself) needs ONE call to discover what's available and how to invoke it,
 * rather than hard-coding the surface. This is that index — reference data, kept in
 * lock-step with the routes/tools it lists.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/regulatory-capabilities-index
 */

export type CapabilityCategory =
  | 'reference'        // catalogs / datasheets
  | 'classification'   // determine class / pathway
  | 'evidence'         // evidence-document structures + matrices
  | 'oversight'        // reviewer questions / gap-checks
  | 'planning'         // blueprint / strategy / timelines
  | 'enforcement';     // deterministic checks / gates

export interface RegulatoryCapability {
  id: string;
  label: string;
  category: CapabilityCategory;
  description: string;
  /** Primary HTTP route (relative to /api/submissions), where one exists. */
  route?: string;
  /** AnA tool name, where one exists. */
  anaTool?: string;
  deterministic: boolean;
}

export const REGULATORY_CAPABILITIES: RegulatoryCapability[] = [
  // Reference catalogs.
  { id: 'market_specs', label: 'Market submission specs', category: 'reference', description: 'Per-market-per-format governance + formatting datasheet (15 specs across 11 eCTD markets + eSTAR/MDR/IVDR/CTIS).', route: 'GET /market-specs', anaTool: 'get_market_submission_spec', deterministic: true },
  { id: 'document_templates', label: 'Document templates', category: 'reference', description: 'Canonical section skeletons of the key submission documents (CTD M2 summaries, 510(k) Summary, SmPC, GSPR, PER, IMPD, IB, CSR, RMP, PBRER).', route: 'GET /document-templates', anaTool: 'get_document_template', deterministic: true },
  { id: 'validation_rules', label: 'eCTD validation rule corpus', category: 'reference', description: 'Named, sourced eCTD validation criteria wired to the dispatch gate.', route: 'GET /validation-rules', anaTool: 'list_validation_rules', deterministic: true },
  { id: 'regulatory_timelines', label: 'Regulatory timelines', category: 'planning', description: 'Published review-clock goals + milestones per pathway.', route: 'GET /device/timeline', anaTool: 'get_regulatory_timeline', deterministic: true },

  // Classification.
  { id: 'device_classification', label: 'Device classification', category: 'classification', description: 'MDR/IVDR Annex VIII rule-based class + FDA pathway heuristic.', route: 'POST /device/classify', anaTool: 'classify_device', deterministic: true },
  { id: 'combination_product', label: 'Combination product assessment', category: 'classification', description: '21 CFR Part 3 PMOA → FDA lead center (CDER/CBER/CDRH) + EU Article 117 consideration.', route: 'POST /combination-product/assess', anaTool: 'assess_combination_product', deterministic: true },

  // Planning / requirements / eligibility.
  { id: 'submission_requirements', label: 'Submission requirements matrix', category: 'planning', description: 'Per submission type: required modules/documents/forms + gap assessment.', route: 'GET /requirements', anaTool: 'get_submission_requirements', deterministic: true },
  { id: 'pathway_eligibility', label: 'Expedited-pathway eligibility', category: 'planning', description: 'Designation criteria (Breakthrough/Fast Track/PRIME/SAKIGAKE…) + eligibility check.', route: 'GET /designations', anaTool: 'assess_pathway_eligibility', deterministic: true },
  { id: 'change_classification', label: 'Post-submission change classification', category: 'planning', description: 'FDA supplement / EU variation category catalog + flag-driven classifier.', route: 'GET /change-categories', anaTool: 'classify_post_submission_change', deterministic: true },
  { id: 'global_strategy', label: 'Global multi-region device strategy', category: 'planning', description: 'Shared (build-once) vs region-specific evidence across FDA/EU-MDR/EU-IVDR/PMDA.', route: 'GET /device/global-strategy', anaTool: 'build_global_device_strategy', deterministic: true },
  { id: 'device_blueprint', label: 'Device submission blueprint', category: 'planning', description: 'One-call reverse-workflow synthesis: classification + requirements + evidence modules + reviewer checklist + readiness scorecard.', route: 'POST /device/blueprint', anaTool: 'build_device_blueprint', deterministic: true },

  // Evidence structures + matrices.
  { id: 'device_evidence_structure', label: 'CER / PER / RMF structure', category: 'evidence', description: 'MEDDEV 2.7/1 CER, IVDR Annex XIII PER, ISO 14971 RMF section structures + gap assessment.', route: 'GET /device/cer/structure', anaTool: 'assess_device_evidence_structure', deterministic: true },
  { id: 'biocompatibility', label: 'Biocompatibility endpoints', category: 'evidence', description: 'ISO 10993-1 endpoints by contact category.', route: 'POST /device/biocompatibility', anaTool: 'get_biocompatibility_endpoints', deterministic: true },
  { id: 'electrical_safety', label: 'Electrical safety', category: 'evidence', description: 'Applicable IEC 60601 standards + test categories from device facts.', route: 'POST /device/electrical-safety', anaTool: 'get_electrical_standards', deterministic: true },
  { id: 'sterilization', label: 'Sterilization', category: 'evidence', description: 'ISO 11135/11137/17665 method standard + SAL + validation elements.', route: 'POST /device/sterilization', anaTool: 'get_sterilization_requirements', deterministic: true },
  { id: 'pathway_manifest', label: 'Pathway manifest', category: 'evidence', description: 'Assembled table-of-contents for any non-eCTD pathway.', route: 'GET /sequences/:seqId/pathway-manifest', anaTool: 'build_pathway_manifest', deterministic: true },
  { id: 'quality_system', label: 'Quality management system', category: 'evidence', description: 'ISO 13485:2016 clause structure + FDA QSR/QMSR mapping + readiness.', route: 'GET /device/qms/structure', anaTool: 'assess_qms', deterministic: true },
  { id: 'device_labeling', label: 'Device labeling requirements', category: 'reference', description: 'FDA 21 CFR 801 / MDR Annex I §23 label + IFU elements + ISO 15223-1 symbols from device facts.', route: 'POST /device/labeling', anaTool: 'get_device_labeling', deterministic: true },

  // Oversight.
  { id: 'reviewer_checklist', label: 'Shadow-reviewer checklist', category: 'oversight', description: 'Section-anchored reviewer questions per device submission type.', route: 'GET /device/reviewer-checklist', anaTool: 'get_device_reviewer_checklist', deterministic: true },
  { id: 'stored_cer', label: 'Stored-CER assessment', category: 'oversight', description: 'Gap-check a persisted cer_reports/cer_sections record against the canonical CER structure.', route: 'GET /device/cer/:reportId/assess-stored', anaTool: 'assess_stored_cer', deterministic: true },

  // Enforcement.
  { id: 'market_formatting', label: 'Market formatting validation', category: 'enforcement', description: 'Enforce a market spec’s formatting rules against file descriptors.', route: 'POST /market-specs/:specId/validate', anaTool: 'validate_market_formatting', deterministic: true },
  { id: 'udi', label: 'UDI validation', category: 'enforcement', description: 'GS1 check digit + GTIN-14 + AI parsing → GUDID/EUDAMED components.', route: 'POST /device/udi/validate', anaTool: 'validate_udi', deterministic: true },
  { id: 'dispatch_readiness', label: 'Dispatch readiness gate', category: 'enforcement', description: 'Server-computed, tamper-proof eCTD dispatch gate.', route: 'GET /sequences/:seqId/dispatch-readiness', anaTool: 'assess_dispatch_readiness', deterministic: true },
];

export function capabilitiesByCategory(): Record<CapabilityCategory, RegulatoryCapability[]> {
  const out = { reference: [], classification: [], evidence: [], oversight: [], planning: [], enforcement: [] } as Record<CapabilityCategory, RegulatoryCapability[]>;
  for (const c of REGULATORY_CAPABILITIES) out[c.category].push(c);
  return out;
}

export interface CapabilitiesIndex {
  total: number;
  byCategory: Record<CapabilityCategory, number>;
  capabilities: RegulatoryCapability[];
}

export function regulatoryCapabilitiesIndex(): CapabilitiesIndex {
  const grouped = capabilitiesByCategory();
  const byCategory = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])) as Record<CapabilityCategory, number>;
  return { total: REGULATORY_CAPABILITIES.length, byCategory, capabilities: REGULATORY_CAPABILITIES };
}

export default { REGULATORY_CAPABILITIES, capabilitiesByCategory, regulatoryCapabilitiesIndex };
