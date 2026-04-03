/**
 * Project Document Toolkit
 *
 * Maps submission types to their required document templates, regulatory
 * knowledge, and AnA context. When a project is created with a specific
 * submission type (BLA, NDA, IND, 510K, etc.), this toolkit provides:
 *
 * 1. Document catalog — which documents are required/recommended
 * 2. Template family — which DOCX templates to load
 * 3. Regulatory context — which regulations apply
 * 4. AnA enrichment — what AnA should know about this project type
 *
 * This is the bridge between "user creates a BLA project" and
 * "the platform loads BLA-specific tools."
 */

export const PROJECT_DOCUMENT_TOOLKIT_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════
// Submission Type → Document Catalog Mapping
// ═══════════════════════════════════════════════════════════════════════

export interface DocumentRequirement {
  /** Document type identifier */
  docType: string;
  /** Human-readable document name */
  name: string;
  /** CTD module this document belongs to */
  ctdModule: string;
  /** CTD section reference */
  ctdSection: string;
  /** Whether this document is required or recommended */
  required: boolean;
  /** Brief description of what this document contains */
  description: string;
  /** Template family to use for generation */
  templateFamily: string;
  /** Tags for categorization */
  tags: string[];
}

export interface ProjectDocumentToolkit {
  /** Submission type this toolkit serves */
  submissionType: string;
  /** Human-readable name */
  displayName: string;
  /** Primary regulatory authority */
  primaryAuthority: string;
  /** Applicable regulations/guidelines */
  regulations: string[];
  /** Required and recommended documents */
  documents: DocumentRequirement[];
  /** Template family for DOCX generation */
  templateFamily: string;
  /** AnA context enrichment for this project type */
  anaContext: string;
  /** Key focus areas for this submission type */
  focusAreas: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// Document Catalogs by Submission Type
// ═══════════════════════════════════════════════════════════════════════

const BLA_DOCUMENTS: DocumentRequirement[] = [
  { docType: 'ectd_cover_letter', name: 'eCTD Cover Letter', ctdModule: 'm1', ctdSection: 'm1.1', required: true, description: 'Cover letter for BLA submission to FDA', templateFamily: 'bla', tags: ['ectd', 'module-1', 'cover-letter'] },
  { docType: 'clinical_overview', name: 'Clinical Overview', ctdModule: 'm2', ctdSection: 'm2.5', required: true, description: 'High-level summary of clinical data for biologic', templateFamily: 'bla', tags: ['clinical', 'module-2', 'overview'] },
  { docType: 'nonclinical_overview', name: 'Nonclinical Overview', ctdModule: 'm2', ctdSection: 'm2.4', required: true, description: 'Summary of nonclinical pharmacology and toxicology', templateFamily: 'bla', tags: ['nonclinical', 'module-2', 'overview'] },
  { docType: 'quality_overall_summary', name: 'Quality Overall Summary', ctdModule: 'm2', ctdSection: 'm2.3', required: true, description: 'CMC quality summary for biologic manufacturing', templateFamily: 'bla', tags: ['quality', 'cmc', 'module-2'] },
  { docType: 'csr_synopsis', name: 'CSR Synopsis', ctdModule: 'm5', ctdSection: 'm5.3', required: true, description: 'Clinical study report synopsis', templateFamily: 'bla', tags: ['clinical', 'module-5', 'csr'] },
  { docType: 'cmc_drug_substance', name: 'Drug Substance (Biologic)', ctdModule: 'm3', ctdSection: 'm3.2.S', required: true, description: 'Drug substance characterization for biologic product', templateFamily: 'ind', tags: ['cmc', 'module-3', 'drug-substance'] },
  { docType: 'cmc_drug_product', name: 'Drug Product', ctdModule: 'm3', ctdSection: 'm3.2.P', required: true, description: 'Drug product formulation and manufacturing', templateFamily: 'ind', tags: ['cmc', 'module-3', 'drug-product'] },
  { docType: 'clinical_benefit_risk', name: 'Benefit-Risk Assessment', ctdModule: 'm2', ctdSection: 'm2.5', required: true, description: 'Integrated benefit-risk analysis for biologic', templateFamily: 'ind', tags: ['clinical', 'benefit-risk'] },
  { docType: 'protocol_synopsis', name: 'Protocol Synopsis', ctdModule: 'm5', ctdSection: 'm5.3', required: false, description: 'Clinical trial protocol design synopsis', templateFamily: 'ind', tags: ['clinical', 'protocol'] },
  { docType: 'ib_change_summary', name: 'IB Change Summary', ctdModule: 'm5', ctdSection: 'm5.2', required: false, description: "Investigator's brochure update summary", templateFamily: 'ind', tags: ['clinical', 'ib'] },
];

const NDA_DOCUMENTS: DocumentRequirement[] = [
  { docType: 'ectd_cover_letter', name: 'eCTD Cover Letter', ctdModule: 'm1', ctdSection: 'm1.1', required: true, description: 'Cover letter for NDA submission', templateFamily: 'nda', tags: ['ectd', 'module-1'] },
  { docType: 'clinical_overview', name: 'Clinical Overview', ctdModule: 'm2', ctdSection: 'm2.5', required: true, description: 'Clinical data summary for small molecule drug', templateFamily: 'nda', tags: ['clinical', 'module-2'] },
  { docType: 'nonclinical_overview', name: 'Nonclinical Overview', ctdModule: 'm2', ctdSection: 'm2.4', required: true, description: 'Nonclinical study summary', templateFamily: 'nda', tags: ['nonclinical', 'module-2'] },
  { docType: 'quality_overall_summary', name: 'Quality Overall Summary', ctdModule: 'm2', ctdSection: 'm2.3', required: true, description: 'CMC quality summary', templateFamily: 'nda', tags: ['quality', 'cmc', 'module-2'] },
  { docType: 'csr_synopsis', name: 'CSR Synopsis', ctdModule: 'm5', ctdSection: 'm5.3', required: true, description: 'Clinical study report synopsis', templateFamily: 'nda', tags: ['clinical', 'module-5'] },
  { docType: 'cmc_drug_substance', name: 'Drug Substance', ctdModule: 'm3', ctdSection: 'm3.2.S', required: true, description: 'Active ingredient characterization', templateFamily: 'ind', tags: ['cmc', 'module-3'] },
  { docType: 'cmc_drug_product', name: 'Drug Product', ctdModule: 'm3', ctdSection: 'm3.2.P', required: true, description: 'Finished dosage form description', templateFamily: 'ind', tags: ['cmc', 'module-3'] },
  { docType: 'clinical_benefit_risk', name: 'Benefit-Risk Assessment', ctdModule: 'm2', ctdSection: 'm2.5', required: true, description: 'Integrated benefit-risk analysis', templateFamily: 'ind', tags: ['clinical', 'benefit-risk'] },
];

const IND_DOCUMENTS: DocumentRequirement[] = [
  { docType: 'ectd_cover_letter', name: 'eCTD Cover Letter', ctdModule: 'm1', ctdSection: 'm1.1', required: true, description: 'IND cover letter', templateFamily: 'ind', tags: ['ectd', 'module-1'] },
  { docType: 'fda_1571', name: 'FDA Form 1571', ctdModule: 'm1', ctdSection: 'm1.1', required: true, description: 'IND application form', templateFamily: 'ind', tags: ['fda-form', 'module-1'] },
  { docType: 'clinical_overview', name: 'Clinical Overview', ctdModule: 'm2', ctdSection: 'm2.5', required: false, description: 'Clinical data overview (if available)', templateFamily: 'ind', tags: ['clinical', 'module-2'] },
  { docType: 'nonclinical_overview', name: 'Nonclinical Overview', ctdModule: 'm2', ctdSection: 'm2.4', required: true, description: 'Nonclinical pharmacology/toxicology', templateFamily: 'ind', tags: ['nonclinical', 'module-2'] },
  { docType: 'quality_overall_summary', name: 'Quality Overall Summary', ctdModule: 'm2', ctdSection: 'm2.3', required: true, description: 'CMC quality summary for IND', templateFamily: 'ind', tags: ['quality', 'module-2'] },
  { docType: 'cmc_drug_substance', name: 'Drug Substance', ctdModule: 'm3', ctdSection: 'm3.2.S', required: true, description: 'Drug substance characterization', templateFamily: 'ind', tags: ['cmc', 'module-3'] },
  { docType: 'cmc_drug_product', name: 'Drug Product', ctdModule: 'm3', ctdSection: 'm3.2.P', required: true, description: 'Drug product description', templateFamily: 'ind', tags: ['cmc', 'module-3'] },
  { docType: 'protocol_synopsis', name: 'Protocol Synopsis', ctdModule: 'm5', ctdSection: 'm5.3', required: true, description: 'Clinical trial protocol', templateFamily: 'ind', tags: ['clinical', 'protocol'] },
  { docType: 'ib_change_summary', name: 'IB Change Summary', ctdModule: 'm5', ctdSection: 'm5.2', required: false, description: "Investigator's brochure", templateFamily: 'ind', tags: ['clinical', 'ib'] },
  { docType: 'clinical_benefit_risk', name: 'Benefit-Risk Assessment', ctdModule: 'm2', ctdSection: 'm2.5', required: false, description: 'Benefit-risk analysis', templateFamily: 'ind', tags: ['clinical', 'benefit-risk'] },
];

const DEVICE_510K_DOCUMENTS: DocumentRequirement[] = [
  { docType: '510k_cover_letter', name: '510(k) Cover Letter', ctdModule: 'm1', ctdSection: 'm1.1', required: true, description: 'Cover letter for 510(k) submission', templateFamily: '510k', tags: ['510k', 'cover-letter'] },
  { docType: '510k_summary', name: '510(k) Summary (§807.92)', ctdModule: 'm1', ctdSection: 'm1.2', required: true, description: 'Summary per 21 CFR 807.92', templateFamily: '510k', tags: ['510k', 'summary'] },
  { docType: '510k_device_description', name: 'Device Description', ctdModule: 'm1', ctdSection: 'm1.3', required: true, description: 'Detailed device description and intended use', templateFamily: '510k', tags: ['510k', 'device'] },
  { docType: '510k_se_comparison', name: 'Substantial Equivalence Comparison', ctdModule: 'm1', ctdSection: 'm1.4', required: true, description: 'Predicate comparison matrix', templateFamily: '510k', tags: ['510k', 'se-comparison', 'predicate'] },
  { docType: '510k_biocompatibility', name: 'Biocompatibility Evaluation', ctdModule: 'm1', ctdSection: 'm1.5', required: true, description: 'ISO 10993 biocompatibility assessment', templateFamily: '510k', tags: ['510k', 'biocompatibility'] },
];

const PMA_DOCUMENTS: DocumentRequirement[] = [
  { docType: 'pma_cover_letter', name: 'PMA Cover Letter', ctdModule: 'm1', ctdSection: 'm1.1', required: true, description: 'PMA submission cover letter', templateFamily: '510k', tags: ['pma', 'cover-letter'] },
  { docType: 'pma_device_description', name: 'Device Description', ctdModule: 'm1', ctdSection: 'm1.3', required: true, description: 'Detailed device description for PMA', templateFamily: '510k', tags: ['pma', 'device'] },
  { docType: 'pma_clinical_data', name: 'Clinical Data Summary', ctdModule: 'm5', ctdSection: 'm5.3', required: true, description: 'Summary of clinical trial data', templateFamily: '510k', tags: ['pma', 'clinical'] },
  { docType: '510k_biocompatibility', name: 'Biocompatibility Evaluation', ctdModule: 'm4', ctdSection: 'm4.2', required: true, description: 'Biocompatibility per ISO 10993', templateFamily: '510k', tags: ['pma', 'biocompatibility'] },
];

const CER_DOCUMENTS: DocumentRequirement[] = [
  { docType: 'cer_evaluation_plan', name: 'Clinical Evaluation Plan', ctdModule: 'annex', ctdSection: 'CEP', required: true, description: 'Clinical evaluation plan per EU MDR', templateFamily: 'cer', tags: ['cer', 'mdr', 'evaluation-plan'] },
  { docType: 'cer_literature_analysis', name: 'Literature Analysis', ctdModule: 'annex', ctdSection: 'CER-lit', required: true, description: 'Systematic literature review and analysis', templateFamily: 'cer', tags: ['cer', 'mdr', 'literature'] },
  { docType: 'cer_state_of_art', name: 'State of the Art', ctdModule: 'annex', ctdSection: 'CER-sota', required: true, description: 'Current knowledge and state of the art', templateFamily: 'cer', tags: ['cer', 'mdr', 'state-of-art'] },
  { docType: 'cer_benefit_risk_pmcf', name: 'Benefit-Risk & PMCF', ctdModule: 'annex', ctdSection: 'CER-br', required: true, description: 'Benefit-risk analysis and PMCF plan', templateFamily: 'cer', tags: ['cer', 'mdr', 'benefit-risk', 'pmcf'] },
];

// ═══════════════════════════════════════════════════════════════════════
// Submission Type → Toolkit Mapping
// ═══════════════════════════════════════════════════════════════════════

const TOOLKIT_MAP: Record<string, Omit<ProjectDocumentToolkit, 'submissionType'>> = {
  BLA: {
    displayName: 'Biologics License Application',
    primaryAuthority: 'FDA',
    regulations: ['21 CFR 600-680', 'ICH CTD', 'ICH M4', 'FDA BLA guidance'],
    documents: BLA_DOCUMENTS,
    templateFamily: 'bla',
    anaContext: 'This is a BLA (Biologics License Application) project targeting FDA approval for a biological product. Focus on biological product characterization, manufacturing process validation, clinical immunogenicity data, potency assays, and BLA-specific regulatory strategy. All documents must comply with eCTD format and 21 CFR Part 600-680.',
    focusAreas: ['Biological characterization', 'Manufacturing process', 'Immunogenicity', 'Potency assays', 'Comparability studies'],
  },
  NDA: {
    displayName: 'New Drug Application',
    primaryAuthority: 'FDA',
    regulations: ['21 CFR 314', 'ICH CTD', 'ICH M4', 'FDA NDA guidance'],
    documents: NDA_DOCUMENTS,
    templateFamily: 'nda',
    anaContext: 'This is an NDA (New Drug Application) project targeting FDA approval for a small molecule drug. Focus on clinical efficacy/safety data, CMC quality, bioequivalence (if applicable), labeling, and NDA-specific regulatory strategy. All documents must comply with eCTD format.',
    focusAreas: ['Clinical efficacy', 'Safety profile', 'CMC quality', 'Bioequivalence', 'Labeling'],
  },
  IND: {
    displayName: 'Investigational New Drug Application',
    primaryAuthority: 'FDA',
    regulations: ['21 CFR 312', 'ICH CTD', 'ICH E6(R2) GCP', 'FDA IND guidance'],
    documents: IND_DOCUMENTS,
    templateFamily: 'ind',
    anaContext: 'This is an IND (Investigational New Drug) application project. Focus on pre-clinical safety, CMC for clinical supply, clinical protocol design, FDA Form 1571/1572/3674, and phase-appropriate IND strategy. Pre-IND meeting preparation is critical.',
    focusAreas: ['Pre-clinical safety', 'CMC clinical supply', 'Protocol design', 'FDA forms', 'Phase planning'],
  },
  '510K': {
    displayName: '510(k) Premarket Notification',
    primaryAuthority: 'FDA',
    regulations: ['21 CFR 807', 'FDA 510(k) guidance', 'ISO 10993', 'IEC 60601'],
    documents: DEVICE_510K_DOCUMENTS,
    templateFamily: '510k',
    anaContext: 'This is a 510(k) premarket notification project for a medical device. Focus on predicate device identification, substantial equivalence comparison, device description, performance testing, biocompatibility (ISO 10993), and 510(k) submission strategy.',
    focusAreas: ['Predicate identification', 'Substantial equivalence', 'Performance testing', 'Biocompatibility', 'Device description'],
  },
  PMA: {
    displayName: 'Premarket Approval Application',
    primaryAuthority: 'FDA',
    regulations: ['21 CFR 814', 'FDA PMA guidance', 'ISO 10993', 'ISO 14971'],
    documents: PMA_DOCUMENTS,
    templateFamily: '510k',
    anaContext: 'This is a PMA (Premarket Approval) project for a Class III medical device. Focus on clinical trial data, manufacturing quality, risk management (ISO 14971), biocompatibility, and PMA-specific regulatory strategy. Higher evidence bar than 510(k).',
    focusAreas: ['Clinical trial data', 'Risk management', 'Manufacturing quality', 'Post-market surveillance', 'Advisory panel prep'],
  },
  DE_NOVO: {
    displayName: 'De Novo Classification Request',
    primaryAuthority: 'FDA',
    regulations: ['21 CFR 860', 'FDA De Novo guidance', 'ISO 14971'],
    documents: DEVICE_510K_DOCUMENTS,
    templateFamily: '510k',
    anaContext: 'This is a De Novo classification request for a novel medical device without a predicate. Focus on risk-benefit analysis, proposed classification, special controls, and performance standards for a new device type.',
    focusAreas: ['Novel device classification', 'Risk-benefit analysis', 'Special controls', 'Performance standards'],
  },
  MAA: {
    displayName: 'Marketing Authorization Application (EU)',
    primaryAuthority: 'EMA',
    regulations: ['EU Regulation 726/2004', 'ICH CTD', 'EMA guidance', 'EU GMP Annex'],
    documents: NDA_DOCUMENTS,
    templateFamily: 'nda',
    anaContext: 'This is an MAA (Marketing Authorization Application) project targeting EMA approval in the EU. Focus on European regulatory requirements, rapporteur interaction, EU-specific labeling (SmPC, PIL), and centralized/decentralized procedure strategy.',
    focusAreas: ['EU regulatory pathway', 'SmPC/PIL', 'Rapporteur engagement', 'Pharmacovigilance', 'Risk Management Plan'],
  },
  IVDR: {
    displayName: 'In Vitro Diagnostic Regulation (EU)',
    primaryAuthority: 'EMA/Notified Body',
    regulations: ['EU IVDR 2017/746', 'ISO 13485', 'EN ISO 14971'],
    documents: CER_DOCUMENTS,
    templateFamily: 'cer',
    anaContext: 'This is an IVDR project for an in vitro diagnostic device under EU IVDR 2017/746. Focus on performance evaluation, clinical evidence, risk classification, notified body interactions, and EU-specific technical documentation.',
    focusAreas: ['Performance evaluation', 'Clinical evidence', 'Risk classification', 'Technical documentation', 'Notified body submission'],
  },
  EUA: {
    displayName: 'Emergency Use Authorization',
    primaryAuthority: 'FDA',
    regulations: ['21 USC 360bbb-3', 'FDA EUA guidance'],
    documents: IND_DOCUMENTS.slice(0, 5),
    templateFamily: 'ind',
    anaContext: 'This is an EUA (Emergency Use Authorization) project. Focus on expedited review requirements, available safety/efficacy data, manufacturing at scale, and EUA-specific regulatory strategy.',
    focusAreas: ['Expedited review', 'Available efficacy data', 'Manufacturing scale-up', 'Risk communication'],
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the full document toolkit for a submission type.
 * Returns null if the submission type is not recognized.
 */
export function getProjectDocumentToolkit(submissionType: string): ProjectDocumentToolkit | null {
  const normalized = submissionType.toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const config = TOOLKIT_MAP[normalized];
  if (!config) return null;
  return { submissionType: normalized, ...config };
}

/**
 * Get all supported submission types with their display names.
 */
export function getSupportedSubmissionTypes(): Array<{ type: string; displayName: string; authority: string }> {
  return Object.entries(TOOLKIT_MAP).map(([type, config]) => ({
    type,
    displayName: config.displayName,
    authority: config.primaryAuthority,
  }));
}

/**
 * Get required documents for a submission type.
 */
export function getRequiredDocuments(submissionType: string): DocumentRequirement[] {
  const toolkit = getProjectDocumentToolkit(submissionType);
  return toolkit?.documents.filter(d => d.required) ?? [];
}

/**
 * Get the AnA context enrichment string for a submission type.
 * This is injected into the AI system prompt when the project is active.
 */
export function getSubmissionTypeAnaContext(submissionType: string): string | null {
  const toolkit = getProjectDocumentToolkit(submissionType);
  return toolkit?.anaContext ?? null;
}

/**
 * Get the template family for a submission type (for DOCX factory).
 */
export function getTemplateFamily(submissionType: string): string | null {
  const toolkit = getProjectDocumentToolkit(submissionType);
  return toolkit?.templateFamily ?? null;
}

/**
 * Build a document checklist for a project — shows which documents
 * are required, which exist, and which are missing.
 */
export function buildDocumentChecklist(
  submissionType: string,
  existingDocTypes: string[]
): Array<{
  docType: string;
  name: string;
  ctdSection: string;
  required: boolean;
  exists: boolean;
  templateFamily: string;
}> {
  const toolkit = getProjectDocumentToolkit(submissionType);
  if (!toolkit) return [];

  const existingSet = new Set(existingDocTypes.map(t => t.toLowerCase()));

  return toolkit.documents.map(doc => ({
    docType: doc.docType,
    name: doc.name,
    ctdSection: doc.ctdSection,
    required: doc.required,
    exists: existingSet.has(doc.docType.toLowerCase()),
    templateFamily: doc.templateFamily,
  }));
}
