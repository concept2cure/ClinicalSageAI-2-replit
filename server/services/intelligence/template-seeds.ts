/**
 * Document template seed data.
 *
 * Closed-enum canonical templates for the major agency × document_type ×
 * submission_type tuples. Run via `seedTemplates()` after the migration
 * applies; idempotent on `template_code + version`.
 *
 * Coverage in v1:
 *   FDA  : IND, NDA, BLA, ANDA, 505(b)(2), 510(k), PMA, De Novo
 *   EMA  : MAA (Centralised), Type IA/IB/II variation
 *   PMDA : NDA (Japan)
 *   MHRA : GB MA, CTA
 *   HC   : NDS, ANDS, CTA
 *   Swissmedic: MAA (Switzerland)
 *
 * Document types covered: protocol, IB, CMC (Module 3), labeling, CER,
 * response_letter, briefing_package, meeting_minutes. The cross-agency
 * "section" template carries the canonical CTD outline.
 *
 * Section schemas are intentionally compact — required vs optional, ICH M4
 * / agency-guideline section codes, the headline content_guidance reviewers
 * expect, and the critical required_elements that trigger common review
 * questions if missing.
 *
 * @module server/services/intelligence/template-seeds
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import { runWithSystemTenantScope } from '../../db/tenantStore';

const log = createScopedLogger('template-seeds');

export const SEEDS_VERSION = '1.1.0';

// ─── Seed data types ────────────────────────────────────────────────────────

interface SeedSection {
  sectionCode: string;
  sectionTitle: string;
  ordering: number;
  required?: boolean;
  criticality?: 'blocking' | 'important' | 'supporting';
  contentGuidance?: string;
  requiredElements?: string[];
  agencyQuirks?: string;
  minWords?: number;
  maxWords?: number;
  requiredPhrases?: string[];
  forbiddenPhrases?: string[];
}

interface SeedTemplate {
  templateCode: string;
  templateName: string;
  agency: 'fda' | 'ema' | 'pmda' | 'mhra' | 'hc' | 'swissmedic' | 'cross_agency';
  documentType: 'protocol' | 'ib' | 'cmc' | 'labeling' | 'cer' | 'response_letter' | 'meeting_minutes' | 'section' | 'briefing_package' | 'other';
  submissionType?: string | null;
  modulePath?: string | null;
  description?: string;
  sourceReference?: string;
  agencySpecificNotes?: string;
  formattingRules?: Record<string, unknown>;
  sections: SeedSection[];
}

// ─── Cross-agency baselines ──────────────────────────────────────────────────

const CTD_MODULE_OUTLINE: SeedSection[] = [
  { sectionCode: '1', sectionTitle: 'Module 1 — Administrative information and prescribing information', ordering: 100, required: true, criticality: 'blocking', contentGuidance: 'Region-specific cover, forms, certifications, labeling, and risk-management.' },
  { sectionCode: '2.1', sectionTitle: 'Table of contents (CTD)', ordering: 200, required: true, criticality: 'important' },
  { sectionCode: '2.2', sectionTitle: 'Introduction', ordering: 300, required: true, criticality: 'important', minWords: 200, maxWords: 1500 },
  { sectionCode: '2.3', sectionTitle: 'Quality Overall Summary (QOS)', ordering: 400, required: true, criticality: 'blocking', contentGuidance: 'Summarises Module 3. Aligns with manufacturer specs, controls, stability.', requiredElements: ['drug substance', 'drug product', 'specifications', 'stability'] },
  { sectionCode: '2.4', sectionTitle: 'Nonclinical Overview', ordering: 500, required: true, criticality: 'blocking', minWords: 1500 },
  { sectionCode: '2.5', sectionTitle: 'Clinical Overview', ordering: 600, required: true, criticality: 'blocking', minWords: 2000, requiredElements: ['benefit-risk', 'unmet medical need'] },
  { sectionCode: '2.6', sectionTitle: 'Nonclinical Written and Tabulated Summaries', ordering: 700, required: true, criticality: 'important' },
  { sectionCode: '2.7', sectionTitle: 'Clinical Summary', ordering: 800, required: true, criticality: 'blocking' },
  { sectionCode: '3.2.S', sectionTitle: 'Drug Substance', ordering: 900, required: true, criticality: 'blocking', requiredElements: ['general information', 'manufacture', 'characterisation', 'control of drug substance', 'reference standards', 'container closure', 'stability'] },
  { sectionCode: '3.2.P', sectionTitle: 'Drug Product', ordering: 1000, required: true, criticality: 'blocking', requiredElements: ['description', 'pharmaceutical development', 'manufacture', 'control of excipients', 'control of drug product', 'reference standards', 'container closure', 'stability'] },
  { sectionCode: '3.2.A', sectionTitle: 'Appendices (Facilities, Adventitious Agents, Excipients)', ordering: 1100, required: true, criticality: 'important' },
  { sectionCode: '3.2.R', sectionTitle: 'Regional Information', ordering: 1200, required: true, criticality: 'important', agencyQuirks: 'Contents differ materially per region — FDA expects executed batch records here; EMA expects different annexes.' },
  { sectionCode: '4.2', sectionTitle: 'Study Reports (Pharmacology, PK, Toxicology)', ordering: 1300, required: true, criticality: 'blocking' },
  { sectionCode: '4.3', sectionTitle: 'Literature References (nonclinical)', ordering: 1400, required: false, criticality: 'supporting' },
  { sectionCode: '5.2', sectionTitle: 'Tabular Listing of All Clinical Studies', ordering: 1500, required: true, criticality: 'blocking' },
  { sectionCode: '5.3', sectionTitle: 'Clinical Study Reports', ordering: 1600, required: true, criticality: 'blocking' },
  { sectionCode: '5.3.5', sectionTitle: 'Reports of Efficacy and Safety Studies', ordering: 1700, required: true, criticality: 'blocking' },
  { sectionCode: '5.4', sectionTitle: 'Literature References (clinical)', ordering: 1800, required: false, criticality: 'supporting' },
];

const PROTOCOL_OUTLINE_ICH_E6: SeedSection[] = [
  { sectionCode: '1', sectionTitle: 'Protocol synopsis', ordering: 100, required: true, criticality: 'blocking', minWords: 300, maxWords: 3000, requiredElements: ['primary objective', 'primary endpoint', 'study population', 'sample size'] },
  { sectionCode: '2', sectionTitle: 'Background and rationale', ordering: 200, required: true, criticality: 'important', minWords: 800 },
  { sectionCode: '3', sectionTitle: 'Objectives and endpoints', ordering: 300, required: true, criticality: 'blocking', requiredElements: ['primary endpoint', 'secondary endpoint', 'statistical hypothesis'] },
  { sectionCode: '4', sectionTitle: 'Study design', ordering: 400, required: true, criticality: 'blocking', requiredElements: ['randomization', 'blinding', 'control arm'] },
  { sectionCode: '5', sectionTitle: 'Selection of study population', ordering: 500, required: true, criticality: 'blocking', requiredElements: ['inclusion criteria', 'exclusion criteria'] },
  { sectionCode: '6', sectionTitle: 'Treatment of subjects', ordering: 600, required: true, criticality: 'blocking' },
  { sectionCode: '7', sectionTitle: 'Efficacy assessments', ordering: 700, required: true, criticality: 'important' },
  { sectionCode: '8', sectionTitle: 'Safety assessments', ordering: 800, required: true, criticality: 'blocking', requiredElements: ['adverse events', 'serious adverse events', 'discontinuation criteria'] },
  { sectionCode: '9', sectionTitle: 'Statistics', ordering: 900, required: true, criticality: 'blocking', requiredElements: ['sample size justification', 'analysis populations', 'interim analyses'] },
  { sectionCode: '10', sectionTitle: 'Quality control and assurance', ordering: 1000, required: true, criticality: 'important' },
  { sectionCode: '11', sectionTitle: 'Ethics', ordering: 1100, required: true, criticality: 'blocking', requiredElements: ['informed consent', 'IRB/IEC approval'] },
  { sectionCode: '12', sectionTitle: 'Data handling and record keeping', ordering: 1200, required: true, criticality: 'important' },
  { sectionCode: '13', sectionTitle: 'Financing and insurance', ordering: 1300, required: false, criticality: 'supporting' },
  { sectionCode: '14', sectionTitle: 'Publication policy', ordering: 1400, required: false, criticality: 'supporting' },
  { sectionCode: '15', sectionTitle: 'References', ordering: 1500, required: true, criticality: 'supporting' },
];

const IB_OUTLINE: SeedSection[] = [
  { sectionCode: '1', sectionTitle: 'Summary', ordering: 100, required: true, criticality: 'blocking' },
  { sectionCode: '2', sectionTitle: 'Introduction', ordering: 200, required: true, criticality: 'important' },
  { sectionCode: '3', sectionTitle: 'Physical, chemical, and pharmaceutical properties and formulation', ordering: 300, required: true, criticality: 'blocking' },
  { sectionCode: '4', sectionTitle: 'Nonclinical studies', ordering: 400, required: true, criticality: 'blocking', requiredElements: ['nonclinical pharmacology', 'nonclinical pharmacokinetics', 'toxicology'] },
  { sectionCode: '5', sectionTitle: 'Effects in humans', ordering: 500, required: true, criticality: 'blocking', requiredElements: ['pharmacokinetics in humans', 'safety and efficacy', 'marketing experience'] },
  { sectionCode: '6', sectionTitle: 'Summary of data and guidance for the investigator', ordering: 600, required: true, criticality: 'blocking', requiredElements: ['identified risks', 'precautions'] },
];

// ─── Templates ──────────────────────────────────────────────────────────────

const SEED_TEMPLATES: SeedTemplate[] = [
  // ─── Cross-agency baselines ───────────────────────────────────────────────
  {
    templateCode: 'crossagency_section_ctd',
    templateName: 'CTD outline (cross-agency baseline)',
    agency: 'cross_agency',
    documentType: 'section',
    submissionType: null,
    sourceReference: 'ICH M4',
    description: 'Cross-agency CTD outline. Agency-specific variants extend this baseline with regional Module 1 content.',
    sections: CTD_MODULE_OUTLINE,
  },
  {
    templateCode: 'crossagency_protocol_ich_e6',
    templateName: 'Clinical protocol (ICH E6 outline)',
    agency: 'cross_agency',
    documentType: 'protocol',
    submissionType: null,
    sourceReference: 'ICH E6(R2)',
    sections: PROTOCOL_OUTLINE_ICH_E6,
  },
  {
    templateCode: 'crossagency_ib',
    templateName: 'Investigator Brochure (cross-agency)',
    agency: 'cross_agency',
    documentType: 'ib',
    submissionType: null,
    sourceReference: 'ICH E6(R2) §7',
    sections: IB_OUTLINE,
  },

  // ─── FDA submissions ──────────────────────────────────────────────────────
  {
    templateCode: 'fda_nda_module1',
    templateName: 'FDA NDA — Module 1 (administrative & prescribing)',
    agency: 'fda',
    documentType: 'section',
    submissionType: 'NDA',
    modulePath: '1',
    sourceReference: '21 CFR 314.50; FDA eCTD specification v3.2.2',
    agencySpecificNotes: 'FDA Form 356h required. Section 1.14 environmental assessment required unless categorical exclusion claimed.',
    sections: [
      { sectionCode: '1.1', sectionTitle: 'Forms (FDA 356h)', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: '1.2', sectionTitle: 'Cover letter', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: '1.3', sectionTitle: 'Administrative information', ordering: 300, required: true, criticality: 'blocking' },
      { sectionCode: '1.12', sectionTitle: 'Patent information / certifications', ordering: 400, required: true, criticality: 'blocking', contentGuidance: 'Patent certifications for ANDA / 505(b)(2); optional but recommended for NDA.' },
      { sectionCode: '1.14', sectionTitle: 'Environmental assessment', ordering: 500, required: true, criticality: 'important', requiredElements: ['categorical exclusion claim OR environmental assessment'] },
    ],
  },
  {
    templateCode: 'fda_510k_se',
    templateName: 'FDA 510(k) — Substantial Equivalence package',
    agency: 'fda',
    documentType: 'section',
    submissionType: '510k',
    sourceReference: '21 CFR 807 Subpart E; FDA eSTAR template',
    agencySpecificNotes: 'Must include predicate device comparison + SE matrix. Performance testing tied to predicate gaps.',
    sections: [
      { sectionCode: 'D1', sectionTitle: 'Device description and intended use', ordering: 100, required: true, criticality: 'blocking', requiredElements: ['indication for use', 'principle of operation'] },
      { sectionCode: 'SE1', sectionTitle: 'Predicate device identification', ordering: 200, required: true, criticality: 'blocking', requiredElements: ['predicate K-number', 'predicate name'] },
      { sectionCode: 'SE2', sectionTitle: 'Substantial equivalence comparison matrix', ordering: 300, required: true, criticality: 'blocking', requiredElements: ['indication comparison', 'technological characteristics comparison', 'performance testing'] },
      { sectionCode: 'B1', sectionTitle: 'Bench testing', ordering: 400, required: true, criticality: 'blocking' },
      { sectionCode: 'B2', sectionTitle: 'Biocompatibility (ISO 10993)', ordering: 500, required: true, criticality: 'blocking' },
      { sectionCode: 'S1', sectionTitle: 'Software documentation (if SaMD)', ordering: 600, required: false, criticality: 'important' },
      { sectionCode: 'L1', sectionTitle: 'Labeling (IFU, package insert)', ordering: 700, required: true, criticality: 'blocking' },
      { sectionCode: 'C1', sectionTitle: 'Clinical performance (if applicable)', ordering: 800, required: false, criticality: 'important' },
    ],
  },
  {
    templateCode: 'fda_pma',
    templateName: 'FDA PMA — Class III device application',
    agency: 'fda',
    documentType: 'section',
    submissionType: 'PMA',
    sourceReference: '21 CFR 814',
    agencySpecificNotes: 'Clinical data required. Manufacturing inspection module mandatory pre-approval.',
    sections: [
      { sectionCode: 'P1', sectionTitle: 'Device description', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: 'P2', sectionTitle: 'Indications for use', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: 'P3', sectionTitle: 'Manufacturing information', ordering: 300, required: true, criticality: 'blocking' },
      { sectionCode: 'P4', sectionTitle: 'Pre-clinical studies', ordering: 400, required: true, criticality: 'blocking' },
      { sectionCode: 'P5', sectionTitle: 'Clinical investigations', ordering: 500, required: true, criticality: 'blocking', requiredElements: ['primary endpoint', 'safety endpoint', 'IDE reference'] },
      { sectionCode: 'P6', sectionTitle: 'Risk analysis', ordering: 600, required: true, criticality: 'blocking' },
      { sectionCode: 'P7', sectionTitle: 'Proposed labeling', ordering: 700, required: true, criticality: 'blocking' },
    ],
  },
  {
    templateCode: 'fda_ind',
    templateName: 'FDA IND application',
    agency: 'fda',
    documentType: 'section',
    submissionType: 'IND',
    sourceReference: '21 CFR 312',
    sections: [
      { sectionCode: '1571', sectionTitle: 'Form FDA 1571', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: '1572', sectionTitle: 'Form FDA 1572 (Statement of Investigator)', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: 'PROT', sectionTitle: 'Protocol', ordering: 300, required: true, criticality: 'blocking' },
      { sectionCode: 'CMC', sectionTitle: 'Chemistry, manufacturing, and controls', ordering: 400, required: true, criticality: 'blocking' },
      { sectionCode: 'PHARM_TOX', sectionTitle: 'Pharmacology and toxicology', ordering: 500, required: true, criticality: 'blocking' },
      { sectionCode: 'PRIOR_HUMAN', sectionTitle: 'Previous human experience', ordering: 600, required: true, criticality: 'important' },
      { sectionCode: 'IB', sectionTitle: 'Investigator brochure', ordering: 700, required: true, criticality: 'blocking' },
    ],
  },

  // ─── EMA submissions ─────────────────────────────────────────────────────
  {
    templateCode: 'ema_maa_module1',
    templateName: 'EMA MAA — Module 1 (EU regional)',
    agency: 'ema',
    documentType: 'section',
    submissionType: 'MAA',
    modulePath: '1',
    sourceReference: 'EMA Notice to Applicants Volume 2B',
    agencySpecificNotes: 'PIP statement (1.6), RMP (1.5), and ERA (1.8) are mandatory. Centralised procedure uses EU forms, not FDA 356h.',
    sections: [
      { sectionCode: '1.0', sectionTitle: 'Cover letter', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: '1.2', sectionTitle: 'EU application form', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: '1.3', sectionTitle: 'Product information (SmPC, labelling, package leaflet)', ordering: 300, required: true, criticality: 'blocking', requiredElements: ['SmPC', 'package leaflet', 'labelling text'] },
      { sectionCode: '1.5', sectionTitle: 'Risk Management Plan (RMP)', ordering: 400, required: true, criticality: 'blocking', requiredElements: ['safety specification', 'pharmacovigilance plan', 'risk minimisation measures'] },
      { sectionCode: '1.6', sectionTitle: 'Paediatric Investigation Plan (PIP) compliance statement', ordering: 500, required: true, criticality: 'blocking', requiredElements: ['PIP decision number OR PIP waiver reference'] },
      { sectionCode: '1.8', sectionTitle: 'Environmental Risk Assessment (ERA)', ordering: 600, required: true, criticality: 'important' },
      { sectionCode: '1.10', sectionTitle: 'Information on orphan designation (if applicable)', ordering: 700, required: false, criticality: 'important' },
    ],
  },
  {
    templateCode: 'ema_variation_type_ib',
    templateName: 'EMA Type IB variation',
    agency: 'ema',
    documentType: 'section',
    submissionType: 'TYPE_IB',
    sourceReference: 'Regulation (EC) 1234/2008',
    agencySpecificNotes: 'Tell-and-do procedure — 30 day silent assent. Must classify under specific change category from Annex.',
    sections: [
      { sectionCode: 'V1', sectionTitle: 'Classification of the variation', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: 'V2', sectionTitle: 'Justification', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: 'V3', sectionTitle: 'Updated Module 3 sections', ordering: 300, required: true, criticality: 'blocking' },
      { sectionCode: 'V4', sectionTitle: 'Conditions to fulfil (per Annex)', ordering: 400, required: true, criticality: 'important' },
    ],
  },

  // ─── PMDA ─────────────────────────────────────────────────────────────────
  {
    templateCode: 'pmda_nda_module1',
    templateName: 'PMDA NDA — Module 1 (Japan)',
    agency: 'pmda',
    documentType: 'section',
    submissionType: 'NDA',
    modulePath: '1',
    sourceReference: 'PFSB Notification No. 0617001 (Japan eCTD)',
    agencySpecificNotes: 'Japanese-specific Module 1.13 (data from foreign clinical trials) typically required. Japanese-language summary documents in M2 expected.',
    sections: [
      { sectionCode: '1.1', sectionTitle: 'Application form', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: '1.2', sectionTitle: 'Certificates and attachments', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: '1.5', sectionTitle: 'Package insert (Japanese)', ordering: 300, required: true, criticality: 'blocking', requiredElements: ['Japanese-language draft'] },
      { sectionCode: '1.6', sectionTitle: 'Drug fee declaration', ordering: 400, required: true, criticality: 'important' },
      { sectionCode: '1.10', sectionTitle: 'Risk management plan (J-RMP)', ordering: 500, required: true, criticality: 'blocking' },
      { sectionCode: '1.13', sectionTitle: 'Foreign clinical data bridging', ordering: 600, required: false, criticality: 'important', contentGuidance: 'Required when pivotal data is foreign. Address ethnic sensitivity per ICH E5.' },
    ],
  },

  // ─── MHRA ─────────────────────────────────────────────────────────────────
  {
    templateCode: 'mhra_gb_ma_module1',
    templateName: 'MHRA GB Marketing Authorisation — Module 1',
    agency: 'mhra',
    documentType: 'section',
    submissionType: 'MAA',
    modulePath: '1',
    sourceReference: 'Human Medicines Regulations 2012; MHRA guidance post-EU exit',
    agencySpecificNotes: 'Post-Brexit GB-specific procedure. Reliance routes (ECDRP, MRDCP) bypass full review when EMA/EC has approved.',
    sections: [
      { sectionCode: '1.0', sectionTitle: 'Cover letter and procedure type (national / reliance / ECDRP)', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: '1.2', sectionTitle: 'GB application form', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: '1.3', sectionTitle: 'GB SmPC, PIL, labelling', ordering: 300, required: true, criticality: 'blocking' },
      { sectionCode: '1.5', sectionTitle: 'GB-specific RMP', ordering: 400, required: true, criticality: 'blocking' },
      { sectionCode: '1.6', sectionTitle: 'Paediatric plan statement', ordering: 500, required: false, criticality: 'important', contentGuidance: 'GB does not strictly require EU PIP; statement of paediatric considerations recommended.' },
    ],
  },

  // ─── Health Canada ────────────────────────────────────────────────────────
  {
    templateCode: 'hc_nds_module1',
    templateName: 'Health Canada NDS — Module 1',
    agency: 'hc',
    documentType: 'section',
    submissionType: 'NDS',
    modulePath: '1',
    sourceReference: 'Health Canada Guidance on eCTD for human drugs',
    sections: [
      { sectionCode: '1.0', sectionTitle: 'Cover letter', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: '1.2.1', sectionTitle: 'Application form (HC/SC 3011)', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: '1.3', sectionTitle: 'Product monograph (English and French)', ordering: 300, required: true, criticality: 'blocking', requiredElements: ['English product monograph', 'French product monograph'] },
      { sectionCode: '1.5.7', sectionTitle: 'Risk Management Plan (Canadian)', ordering: 400, required: false, criticality: 'important' },
    ],
  },
  {
    templateCode: 'hc_cta',
    templateName: 'Health Canada Clinical Trial Application',
    agency: 'hc',
    documentType: 'section',
    submissionType: 'CTA',
    sourceReference: 'Food and Drug Regulations Part C, Div 5',
    sections: [
      { sectionCode: 'CTA1', sectionTitle: 'Clinical trial application form (HC/SC 3011)', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: 'CTA2', sectionTitle: 'Protocol', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: 'CTA3', sectionTitle: 'Investigator brochure', ordering: 300, required: true, criticality: 'blocking' },
      { sectionCode: 'CTA4', sectionTitle: 'Quality information (Module 3 subset)', ordering: 400, required: true, criticality: 'blocking' },
      { sectionCode: 'CTA5', sectionTitle: 'Letter of attestation', ordering: 500, required: true, criticality: 'important' },
    ],
  },

  // ─── Swissmedic ───────────────────────────────────────────────────────────
  {
    templateCode: 'swissmedic_ma_module1',
    templateName: 'Swissmedic MA — Module 1 (Switzerland)',
    agency: 'swissmedic',
    documentType: 'section',
    submissionType: 'MAA',
    modulePath: '1',
    sourceReference: 'Swissmedic guidance HMV4',
    agencySpecificNotes: 'Largely aligned with EMA Module 1 but distinct application form and Swiss-specific labelling languages (DE/FR/IT).',
    sections: [
      { sectionCode: '1.0', sectionTitle: 'Cover letter', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: '1.2', sectionTitle: 'Swiss application form', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: '1.3', sectionTitle: 'Product information (German / French / Italian)', ordering: 300, required: true, criticality: 'blocking', requiredElements: ['German Fachinformation', 'French notice'] },
      { sectionCode: '1.5', sectionTitle: 'Swiss RMP', ordering: 400, required: false, criticality: 'important' },
    ],
  },

  // ─── Response letters (cross-agency) ─────────────────────────────────────
  {
    templateCode: 'crossagency_response_letter',
    templateName: 'Agency response letter (cross-agency)',
    agency: 'cross_agency',
    documentType: 'response_letter',
    submissionType: null,
    sections: [
      { sectionCode: 'R1', sectionTitle: 'Reference to agency request (number, date)', ordering: 100, required: true, criticality: 'blocking', requiredElements: ['agency reference number', 'request date'] },
      { sectionCode: 'R2', sectionTitle: 'Restated question(s)', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: 'R3', sectionTitle: 'Response (point-by-point)', ordering: 300, required: true, criticality: 'blocking', minWords: 200 },
      { sectionCode: 'R4', sectionTitle: 'Supporting data / analyses', ordering: 400, required: true, criticality: 'important' },
      { sectionCode: 'R5', sectionTitle: 'Updated documents (track changes)', ordering: 500, required: false, criticality: 'important' },
      { sectionCode: 'R6', sectionTitle: 'Conclusion / proposed labeling impact', ordering: 600, required: true, criticality: 'important' },
    ],
  },

  // ─── Authoring-grade CTD skeletons ───────────────────────────────────────
  // The outlines above are validation/intelligence granularity (one row for
  // all of 3.2.S). These four are the skeletons an author STARTS FROM in the
  // authoring surface: each row becomes a real section in the document tree.
  // Module 3 section codes match the Module 3 operating system's canonical
  // keys (module3-convergence-service SECTION_LABELS) VERBATIM, so a document
  // started here carries the same section identity the CMC compile, placement
  // and eCTD pipeline use. Structure and guidance only — a seeded section
  // starts empty and the author writes it; no fabricated prose.
  {
    templateCode: 'ctd_m25_clinical_overview',
    templateName: '2.5 Clinical Overview',
    agency: 'cross_agency',
    documentType: 'section',
    submissionType: null,
    modulePath: '2.5',
    sourceReference: 'ICH M4E(R2) §2.5',
    description:
      'The clinical "expert report": a critical analysis of the clinical data, the benefit–risk assessment, and the conclusions supporting the proposed labeling. Typically 30 pages or fewer.',
    sections: [
      { sectionCode: '2.5.1', sectionTitle: 'Product Development Rationale', ordering: 100, required: true, criticality: 'important', contentGuidance: 'Why this product, this indication, this programme: pharmacological class, scientific rationale, and how the clinical programme design follows from it. State any agency advice received and how it was addressed.', requiredElements: ['pharmacological class', 'development programme rationale', 'regulatory advice addressed'] },
      { sectionCode: '2.5.2', sectionTitle: 'Overview of Biopharmaceutics', ordering: 200, required: false, criticality: 'supporting', contentGuidance: 'Critical analysis of formulation-performance data: bioavailability, bioequivalence across programme formulations, food effect. Reference 2.7.1 for detail.', requiredElements: ['formulation bridging', 'BA/BE conclusions'] },
      { sectionCode: '2.5.3', sectionTitle: 'Overview of Clinical Pharmacology', ordering: 300, required: true, criticality: 'important', contentGuidance: 'PK, PD and their relationship in the target population: exposure, intrinsic/extrinsic factors, interactions, QT assessment. Conclusions, not study-by-study recitation — that is 2.7.2.', requiredElements: ['PK summary', 'exposure-response', 'special populations', 'interaction conclusions'] },
      { sectionCode: '2.5.4', sectionTitle: 'Overview of Efficacy', ordering: 400, required: true, criticality: 'blocking', contentGuidance: 'The critical efficacy argument: study designs and their adequacy, primary results with statistical rigour, clinical relevance of effect size, durability, and generalisability to the labeled population.', requiredElements: ['pivotal study results', 'effect size and clinical relevance', 'population generalisability'] },
      { sectionCode: '2.5.5', sectionTitle: 'Overview of Safety', ordering: 500, required: true, criticality: 'blocking', contentGuidance: 'The critical safety argument: extent of exposure, common and serious adverse events, deaths, discontinuations, laboratory findings, special safety topics, and safety in special populations.', requiredElements: ['extent of exposure', 'serious adverse events and deaths', 'special safety topics', 'special populations'] },
      { sectionCode: '2.5.6', sectionTitle: 'Benefits and Risks Conclusions', ordering: 600, required: true, criticality: 'blocking', contentGuidance: 'Integrated benefit–risk assessment supporting the proposed indication and labeling: therapeutic context, key benefits, key risks, risk management, and the explicit conclusion.', requiredElements: ['therapeutic context', 'benefit summary', 'risk summary and management', 'explicit benefit-risk conclusion'] },
      { sectionCode: '2.5.7', sectionTitle: 'Literature References', ordering: 700, required: false, criticality: 'supporting', contentGuidance: 'References cited in the Clinical Overview. Copies belong in Module 5.4.' },
    ],
  },
  {
    templateCode: 'ctd_m273_summary_clinical_efficacy',
    templateName: '2.7.3 Summary of Clinical Efficacy',
    agency: 'cross_agency',
    documentType: 'section',
    submissionType: null,
    modulePath: '2.7.3',
    sourceReference: 'ICH M4E(R2) §2.7.3',
    description:
      'Detailed factual summarisation of all clinical efficacy data for a single indication, study by study and across studies. Written to be read alongside 2.5.4.',
    sections: [
      { sectionCode: '2.7.3.1', sectionTitle: 'Background and Overview of Clinical Efficacy', ordering: 100, required: true, criticality: 'important', contentGuidance: 'The programme at a glance for this indication: contributing studies, their designs, populations, endpoints, and the analytic strategy across them.', requiredElements: ['contributing studies table', 'endpoint definitions', 'analysis populations'] },
      { sectionCode: '2.7.3.2', sectionTitle: 'Summary of Results of Individual Studies', ordering: 200, required: true, criticality: 'blocking', contentGuidance: 'Study-by-study factual results for every contributing study: disposition, baseline, primary and key secondary results with confidence intervals. Tables carry this section.', requiredElements: ['per-study results tables', 'primary endpoint results with CIs', 'disposition'] },
      { sectionCode: '2.7.3.3', sectionTitle: 'Comparison and Analyses of Results Across Studies', ordering: 300, required: true, criticality: 'blocking', contentGuidance: 'The across-study picture: consistency of effect, subgroup behaviour, pooled or meta analyses where prespecified, and reconciliation of any divergent results.', requiredElements: ['consistency analysis', 'subgroup results'] },
      { sectionCode: '2.7.3.4', sectionTitle: 'Analysis of Clinical Information Relevant to Dosing Recommendations', ordering: 400, required: true, criticality: 'important', contentGuidance: 'The dose story: dose-response and exposure-response for efficacy, the basis for the proposed dose and any adjustments (renal, hepatic, interactions, special populations).', requiredElements: ['dose-response evidence', 'proposed dose justification'] },
      { sectionCode: '2.7.3.5', sectionTitle: 'Persistence of Efficacy and/or Tolerance Effects', ordering: 500, required: true, criticality: 'important', contentGuidance: 'Long-term data: maintenance of effect, tolerance development, withdrawal and rebound. State the follow-up duration honestly, including its limits.', requiredElements: ['long-term efficacy data', 'follow-up duration'] },
      { sectionCode: '2.7.3.6', sectionTitle: 'Appendix', ordering: 600, required: false, criticality: 'supporting', contentGuidance: 'Supportive tables and figures referenced from the narrative sections.' },
    ],
  },
  {
    templateCode: 'ctd_m32s_drug_substance',
    templateName: '3.2.S Drug Substance',
    agency: 'cross_agency',
    documentType: 'cmc',
    submissionType: null,
    modulePath: '3.2.S',
    sourceReference: 'ICH M4Q(R1) §3.2.S',
    description:
      'The complete drug-substance quality section set, S.1 through S.7, with the same section identity the Module 3 operating system compiles and places. One set per substance and manufacturer.',
    sections: [
      { sectionCode: '3.2.S.1', sectionTitle: 'General Information', ordering: 100, required: true, criticality: 'important', contentGuidance: 'Nomenclature, structure, and general properties of the drug substance, drawn from the substance register.', requiredElements: ['nomenclature', 'structure', 'physicochemical properties'] },
      { sectionCode: '3.2.S.2', sectionTitle: 'Manufacture (Drug Substance)', ordering: 200, required: true, criticality: 'blocking', contentGuidance: 'Manufacturer(s), process description, process controls, critical steps and process validation for the drug substance.', requiredElements: ['manufacturer(s)', 'process description and controls', 'critical steps', 'process validation'] },
      { sectionCode: '3.2.S.3', sectionTitle: 'Characterisation', ordering: 300, required: true, criticality: 'important', contentGuidance: 'Structural elucidation and impurity characterisation, including biological activity where applicable.', requiredElements: ['structural elucidation', 'impurity profile'] },
      { sectionCode: '3.2.S.4', sectionTitle: 'Control of Drug Substance', ordering: 400, required: true, criticality: 'blocking', contentGuidance: 'Specification, analytical procedures, method validation, and batch analyses for the drug substance. Cite specifications and methods by their governed record identifiers.', requiredElements: ['specification table', 'analytical procedures', 'validation summaries', 'batch analyses'] },
      { sectionCode: '3.2.S.5', sectionTitle: 'Reference Standards (Drug Substance)', ordering: 500, required: false, criticality: 'supporting', contentGuidance: 'Reference standards or materials used for drug-substance testing, with certificates of analysis.', requiredElements: ['reference standard description', 'certificate of analysis'] },
      { sectionCode: '3.2.S.6', sectionTitle: 'Container Closure System (Drug Substance)', ordering: 600, required: false, criticality: 'supporting', contentGuidance: 'Container closure system for drug-substance storage and shipment, with suitability justification.', requiredElements: ['container/closure description', 'suitability justification'] },
      { sectionCode: '3.2.S.7', sectionTitle: 'Stability (Drug Substance)', ordering: 700, required: true, criticality: 'blocking', contentGuidance: 'Stability summary, conclusions, retest period, and the post-approval stability protocol and commitment. Cite studies from the stability register.', requiredElements: ['stability summary and conclusions', 'retest period', 'stability commitment'] },
    ],
  },
  {
    templateCode: 'ctd_m32p_drug_product',
    templateName: '3.2.P Drug Product',
    agency: 'cross_agency',
    documentType: 'cmc',
    submissionType: null,
    modulePath: '3.2.P',
    sourceReference: 'ICH M4Q(R1) §3.2.P',
    description:
      'The complete drug-product quality section set, P.1 through P.8, with the same section identity the Module 3 operating system compiles and places. One set per product presentation.',
    sections: [
      { sectionCode: '3.2.P.1', sectionTitle: 'Description & Composition', ordering: 100, required: true, criticality: 'important', contentGuidance: 'Dosage form description and full composition, including overages and their justification.', requiredElements: ['dosage form description', 'composition table', 'overage justification'] },
      { sectionCode: '3.2.P.2', sectionTitle: 'Pharmaceutical Development', ordering: 200, required: true, criticality: 'important', contentGuidance: 'The development story: formulation development, manufacturing process development, container-closure selection and microbiological attributes.', requiredElements: ['formulation development', 'process development', 'container-closure rationale'] },
      { sectionCode: '3.2.P.3', sectionTitle: 'Manufacture (Drug Product)', ordering: 300, required: true, criticality: 'blocking', contentGuidance: 'Manufacturer(s), batch formula, process description and controls, critical steps and process validation for the drug product.', requiredElements: ['batch formula', 'process description and controls', 'process validation'] },
      { sectionCode: '3.2.P.4', sectionTitle: 'Control of Excipients', ordering: 400, required: false, criticality: 'supporting', contentGuidance: 'Specifications and analytical procedures for excipients; justification for excipients of human or animal origin and novel excipients.', requiredElements: ['excipient specifications', 'novel/animal-origin justification'] },
      { sectionCode: '3.2.P.5', sectionTitle: 'Control of Drug Product', ordering: 500, required: true, criticality: 'blocking', contentGuidance: 'Specification, analytical procedures, method validation, batch analyses and impurity justification for the drug product.', requiredElements: ['specification table', 'analytical procedures', 'validation summaries', 'batch analyses'] },
      { sectionCode: '3.2.P.6', sectionTitle: 'Reference Standards (Drug Product)', ordering: 600, required: false, criticality: 'supporting', contentGuidance: 'Reference standards or materials used for drug-product testing.', requiredElements: ['reference standard description', 'certificate of analysis'] },
      { sectionCode: '3.2.P.7', sectionTitle: 'Container Closure System (Drug Product)', ordering: 700, required: false, criticality: 'supporting', contentGuidance: 'Container closure system for the drug product, with suitability evidence for the intended use.', requiredElements: ['container/closure description', 'suitability evidence'] },
      { sectionCode: '3.2.P.8', sectionTitle: 'Stability (Drug Product)', ordering: 800, required: true, criticality: 'blocking', contentGuidance: 'Stability summary and conclusions, shelf-life claim and storage statement, and the post-approval stability protocol and commitment.', requiredElements: ['stability summary', 'shelf-life claim and storage statement', 'stability commitment'] },
    ],
  },

  // ─── Briefing packages ───────────────────────────────────────────────────
  {
    templateCode: 'fda_pre_sub_briefing',
    templateName: 'FDA Pre-Submission briefing package (Q-Sub)',
    agency: 'fda',
    documentType: 'briefing_package',
    submissionType: null,
    sourceReference: 'FDA Q-Sub guidance (CDRH, 2023)',
    sections: [
      { sectionCode: 'Q1', sectionTitle: 'Cover letter (Q-Sub number, meeting type)', ordering: 100, required: true, criticality: 'blocking' },
      { sectionCode: 'Q2', sectionTitle: 'Device description and intended use', ordering: 200, required: true, criticality: 'blocking' },
      { sectionCode: 'Q3', sectionTitle: 'Specific questions for FDA', ordering: 300, required: true, criticality: 'blocking', minWords: 200, requiredElements: ['numbered question list'] },
      { sectionCode: 'Q4', sectionTitle: 'Background / development status', ordering: 400, required: true, criticality: 'important' },
      { sectionCode: 'Q5', sectionTitle: 'Sponsor proposal / rationale', ordering: 500, required: true, criticality: 'blocking' },
      { sectionCode: 'Q6', sectionTitle: 'Supporting data summaries', ordering: 600, required: false, criticality: 'important' },
    ],
  },
];

// ─── Seed runner ────────────────────────────────────────────────────────────

export async function seedTemplates(): Promise<{ inserted: number; updated: number; sections: number }> {
  let inserted = 0;
  let updated = 0;
  let sections = 0;

  for (const t of SEED_TEMPLATES) {
    // ONE transaction per template: the template row and its sections commit
    // together or not at all. These used to be independent auto-committed
    // statements (under a comment claiming atomicity), which made the boot
    // guard unsound: it counts template ROWS, so a row committed with zero or
    // partial sections passed the guard forever and nothing ever repaired it —
    // the picker's section_count>0 filter just made the template silently
    // vanish. An interrupted seed now leaves the template ABSENT, which is the
    // state the count guard exists to detect and re-run.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id FROM intelligence.document_templates WHERE template_code = $1 AND version = '1.0'`,
        [t.templateCode],
      );

      let templateId: string;
      if (existing.rows.length > 0) {
        templateId = existing.rows[0].id;
        await client.query(
          `UPDATE intelligence.document_templates
              SET template_name = $1, agency = $2, document_type = $3,
                  submission_type = $4, module_path = $5, description = $6,
                  source_reference = $7, agency_specific_notes = $8,
                  formatting_rules = $9, updated_at = NOW()
            WHERE id = $10`,
          [
            t.templateName, t.agency, t.documentType,
            t.submissionType ?? null, t.modulePath ?? null,
            t.description ?? null, t.sourceReference ?? null,
            t.agencySpecificNotes ?? null,
            JSON.stringify(t.formattingRules ?? {}),
            templateId,
          ],
        );
        updated += 1;
      } else {
        const insertResult = await client.query(
          `INSERT INTO intelligence.document_templates (
             template_code, template_name, version, agency, document_type,
             submission_type, module_path, description, source_reference,
             agency_specific_notes, formatting_rules, status
           ) VALUES ($1, $2, '1.0', $3, $4, $5, $6, $7, $8, $9, $10, 'active')
           RETURNING id`,
          [
            t.templateCode, t.templateName, t.agency, t.documentType,
            t.submissionType ?? null, t.modulePath ?? null,
            t.description ?? null, t.sourceReference ?? null,
            t.agencySpecificNotes ?? null,
            JSON.stringify(t.formattingRules ?? {}),
          ],
        );
        templateId = insertResult.rows[0].id;
        inserted += 1;
      }

      // Replace sections — atomic for real now: the DELETE and every INSERT
      // ride the same transaction, so a refresh can no longer be killed
      // between them and drop an existing template to zero sections.
      await client.query(`DELETE FROM intelligence.template_sections WHERE template_id = $1`, [templateId]);
      for (const s of t.sections) {
        await client.query(
          `INSERT INTO intelligence.template_sections (
             template_id, section_code, section_title, ordering, required, criticality,
             content_guidance, required_elements, citation_rules, agency_quirks,
             min_words, max_words, forbidden_phrases, required_phrases
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            templateId, s.sectionCode, s.sectionTitle, s.ordering,
            s.required ?? true, s.criticality ?? 'important',
            s.contentGuidance ?? null,
            JSON.stringify(s.requiredElements ?? []),
            JSON.stringify({}),
            s.agencyQuirks ?? null,
            s.minWords ?? null, s.maxWords ?? null,
            JSON.stringify(s.forbiddenPhrases ?? []),
            JSON.stringify(s.requiredPhrases ?? []),
          ],
        );
        sections += 1;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
  log.info(`Template seeds: inserted=${inserted} updated=${updated} sections=${sections}`);
  return { inserted, updated, sections };
}

/**
 * Boot-time guard: seed only when the store is missing seed templates.
 *
 * The global template store shipped EMPTY for the life of the feature because
 * seedTemplates() ran only when someone happened to POST
 * /api/regulatory-intelligence/templates/seed — so the authoring surface's
 * "Start from" picker had nothing to offer on every fresh estate. Startup now
 * fills an empty or incomplete store (count-guarded so a normal boot is one
 * SELECT); refreshing guidance for templates that already exist remains the
 * seed endpoint's job, deliberately — boot must never rewrite reference data
 * an operator refreshed on purpose.
 */
export async function seedTemplatesIfMissing(): Promise<
  { ran: true; inserted: number; updated: number; sections: number } | { ran: false; present: number }
> {
  // SYSTEM scope: intelligence.document_templates is platform reference data —
  // no tenant column, no RLS policy (verified against a provisioned database) —
  // so there is no tenant dimension here and no authority derived from a caller
  // argument. Same reasoning as FeatureToggleService.initializeFeatureToggle,
  // and the opposite of SentinelScheduler.scheduleOrg, which takes an
  // organizationId and so scopes at its job boundary instead.
  //
  // Without it this boot-time seed is refused under RLS_ENFORCE=on
  // ("[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope"),
  // which left the "Start from" template picker empty on every enforcing
  // estate — the exact emptiness this function exists to prevent.
  return runWithSystemTenantScope('template-seeds:seed-if-missing', async () => {
    const codes = SEED_TEMPLATES.map((t) => t.templateCode);
    const present = await pool.query(
      `SELECT count(*)::int AS n FROM intelligence.document_templates
        WHERE template_code = ANY($1) AND version = '1.0'`,
      [codes],
    );
    const n: number = present.rows[0]?.n ?? 0;
    if (n >= codes.length) return { ran: false as const, present: n };
    const result = await seedTemplates();
    return { ran: true as const, ...result };
  });
}
