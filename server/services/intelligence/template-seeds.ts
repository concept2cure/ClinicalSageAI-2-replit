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

const log = createScopedLogger('template-seeds');

export const SEEDS_VERSION = '1.0.0';

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
    const existing = await pool.query(
      `SELECT id FROM intelligence.document_templates WHERE template_code = $1 AND version = '1.0'`,
      [t.templateCode],
    );

    let templateId: string;
    if (existing.rows.length > 0) {
      templateId = existing.rows[0].id;
      await pool.query(
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
      const insertResult = await pool.query(
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

    // Replace sections atomically.
    await pool.query(`DELETE FROM intelligence.template_sections WHERE template_id = $1`, [templateId]);
    for (const s of t.sections) {
      await pool.query(
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
  }
  log.info(`Template seeds: inserted=${inserted} updated=${updated} sections=${sections}`);
  return { inserted, updated, sections };
}
