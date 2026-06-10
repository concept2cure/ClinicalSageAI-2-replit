/**
 * Submission requirements matrix — per submission TYPE, the required CTD modules,
 * document templates, and forms, plus a deterministic gap assessment.
 *
 * Where `market-submission-specs.ts` answers "how must I format/govern a filing in
 * market X" and `document-template-library.ts` gives each document's structure,
 * this answers "WHAT must a given submission type contain" — the required-document
 * matrix that drives the Planner. `assessRequirements` reports which required
 * documents/forms are present vs missing for a candidate set.
 *
 * HONESTY ABOUT CONTENT: requirements reflect the cited published expectations
 * (CTD/ICH M4 module structure; FDA application requirements; EU MAA/CTA; the device
 * regulations). They are the standard required-content backbone, not an exhaustive,
 * product-specific checklist — product- and phase-specific nuances still apply.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/submission-requirements
 */

import type { SubmissionFamily } from './market-submission-specs';

export type SubmissionType =
  | 'ind' | 'nda' | 'bla' | 'anda'           // FDA drug/biologic
  | '510k' | 'de_novo' | 'pma'               // FDA device
  | 'maa' | 'cta'                            // EU drug / clinical trial
  | 'jnda'                                   // Japan drug
  | 'mdr_td' | 'ivdr_td';                    // EU device / IVD technical documentation

export interface RequiredDocument {
  /** Links to a document-template-library id where one exists. */
  templateId?: string;
  name: string;
  required: boolean;
}

export interface SubmissionRequirement {
  submissionType: SubmissionType;
  label: string;
  market: string;
  family: SubmissionFamily;
  /** Required CTD modules (eCTD families) or technical-file chapters. */
  requiredModules?: string[];
  requiredDocuments: RequiredDocument[];
  requiredForms: string[];
  basis: string;
}

const CTD_MODULES = ['1', '2', '3', '4', '5'];

export const SUBMISSION_REQUIREMENTS: SubmissionRequirement[] = [
  {
    submissionType: 'ind',
    label: 'Investigational New Drug Application (IND)',
    market: 'us',
    family: 'ectd',
    requiredModules: ['1', '2', '3', '4', '5'],
    requiredDocuments: [
      { templateId: 'cover_letter', name: 'Cover letter', required: true },
      { name: "Investigator's Brochure (IB)", required: true },
      { name: 'Clinical protocol', required: true },
      { templateId: 'quality_overall_summary', name: 'CMC information (Module 3 / QOS)', required: true },
      { templateId: 'nonclinical_overview', name: 'Pharmacology/toxicology (Module 4 / nonclinical overview)', required: true },
    ],
    requiredForms: ['FDA 1571', 'FDA 1572', 'FDA 3674'],
    basis: 'FDA 21 CFR 312; ICH M4',
  },
  {
    submissionType: 'nda',
    label: 'New Drug Application (NDA)',
    market: 'us',
    family: 'ectd',
    requiredModules: CTD_MODULES,
    requiredDocuments: [
      { templateId: 'cover_letter', name: 'Cover letter', required: true },
      { templateId: 'quality_overall_summary', name: 'Quality Overall Summary (2.3)', required: true },
      { templateId: 'nonclinical_overview', name: 'Nonclinical Overview (2.4)', required: true },
      { templateId: 'clinical_overview', name: 'Clinical Overview (2.5)', required: true },
      { templateId: 'clinical_summary', name: 'Clinical Summary (2.7)', required: true },
    ],
    requiredForms: ['FDA 356h', 'FDA 3674', 'FDA 3397'],
    basis: 'FDA 21 CFR 314; ICH M4',
  },
  {
    submissionType: 'bla',
    label: 'Biologics License Application (BLA)',
    market: 'us',
    family: 'ectd',
    requiredModules: CTD_MODULES,
    requiredDocuments: [
      { templateId: 'cover_letter', name: 'Cover letter', required: true },
      { templateId: 'quality_overall_summary', name: 'Quality Overall Summary (2.3) incl. facilities/adventitious agents', required: true },
      { templateId: 'nonclinical_overview', name: 'Nonclinical Overview (2.4)', required: true },
      { templateId: 'clinical_overview', name: 'Clinical Overview (2.5)', required: true },
      { templateId: 'clinical_summary', name: 'Clinical Summary (2.7)', required: true },
    ],
    requiredForms: ['FDA 356h', 'FDA 3674'],
    basis: 'FDA 21 CFR 601; ICH M4',
  },
  {
    submissionType: 'anda',
    label: 'Abbreviated New Drug Application (ANDA)',
    market: 'us',
    family: 'ectd',
    requiredModules: ['1', '2', '3'],
    requiredDocuments: [
      { templateId: 'cover_letter', name: 'Cover letter', required: true },
      { templateId: 'quality_overall_summary', name: 'Quality Overall Summary (2.3)', required: true },
      { name: 'Bioequivalence data / biowaiver justification', required: true },
    ],
    requiredForms: ['FDA 356h', 'FDA 3674'],
    basis: 'FDA 21 CFR 314.94; GDUFA',
  },
  {
    submissionType: '510k',
    label: '510(k) Premarket Notification',
    market: 'us',
    family: 'estar',
    requiredDocuments: [
      { templateId: 'cover_letter', name: 'Cover letter', required: true },
      { templateId: 'k510_summary', name: '510(k) Summary', required: true },
      { name: 'Device description', required: true },
      { name: 'Substantial equivalence / predicate comparison', required: true },
      { name: 'Performance testing (bench / clinical as applicable)', required: true },
      { name: 'Biocompatibility evaluation (ISO 10993, as applicable)', required: false },
    ],
    requiredForms: ['eSTAR 510(k) template'],
    basis: 'FDA 21 CFR 807 Subpart E; eSTAR',
  },
  {
    submissionType: 'de_novo',
    label: 'De Novo Classification Request',
    market: 'us',
    family: 'estar',
    requiredDocuments: [
      { templateId: 'cover_letter', name: 'Cover letter', required: true },
      { name: 'Device description', required: true },
      { name: 'Classification summary / risk-to-health analysis', required: true },
      { name: 'Special controls proposal', required: true },
      { name: 'Performance testing', required: true },
    ],
    requiredForms: ['eSTAR De Novo template'],
    basis: 'FDA 21 CFR 860 Subpart D; eSTAR',
  },
  {
    submissionType: 'pma',
    label: 'Premarket Approval (PMA)',
    market: 'us',
    family: 'estar',
    requiredDocuments: [
      { templateId: 'cover_letter', name: 'Cover letter', required: true },
      { name: 'Device description and manufacturing', required: true },
      { name: 'Nonclinical/bench performance', required: true },
      { name: 'Clinical investigation data', required: true },
      { name: 'Benefit-risk determination', required: true },
    ],
    requiredForms: ['PMA application'],
    basis: 'FDA 21 CFR 814',
  },
  {
    submissionType: 'maa',
    label: 'Marketing Authorisation Application (EU MAA)',
    market: 'eu',
    family: 'ectd',
    requiredModules: CTD_MODULES,
    requiredDocuments: [
      { templateId: 'cover_letter', name: 'Cover letter', required: true },
      { templateId: 'quality_overall_summary', name: 'Quality Overall Summary (2.3)', required: true },
      { templateId: 'clinical_overview', name: 'Clinical Overview (2.5)', required: true },
      { templateId: 'smpc', name: 'Summary of Product Characteristics (SmPC)', required: true },
      { name: 'Package leaflet (PIL) and labelling', required: true },
      { name: 'Risk Management Plan (RMP)', required: true },
    ],
    requiredForms: ['eAF'],
    basis: 'Directive 2001/83/EC; Regulation (EC) 726/2004; ICH M4',
  },
  {
    submissionType: 'cta',
    label: 'Clinical Trial Application (EU CTIS)',
    market: 'eu',
    family: 'ctis',
    requiredDocuments: [
      { name: 'Part I — cover / application', required: true },
      { name: 'Clinical trial protocol', required: true },
      { name: "Investigator's Brochure (IB)", required: true },
      { templateId: 'impd', name: 'Investigational Medicinal Product Dossier (IMPD)', required: true },
      { name: 'Part II — subject information / informed consent (per member state)', required: true },
    ],
    requiredForms: ['CTIS application (Part I)', 'CTIS Part II national documents'],
    basis: 'Regulation (EU) 536/2014',
  },
  {
    submissionType: 'jnda',
    label: 'Japan New Drug Application (J-NDA)',
    market: 'jp',
    family: 'ectd',
    requiredModules: CTD_MODULES,
    requiredDocuments: [
      { name: 'Japanese application form (申請書)', required: true },
      { templateId: 'quality_overall_summary', name: 'Quality Overall Summary (2.3)', required: true },
      { templateId: 'clinical_overview', name: 'Clinical Overview (2.5)', required: true },
      { name: 'Bridging / ethnic-factor justification (ICH E5), where applicable', required: false },
      { name: 'Japanese package insert (添付文書)', required: true },
    ],
    requiredForms: ['Japanese CTD Application Form'],
    basis: 'Japan PMD Act; ICH M4 / E5',
  },
  {
    submissionType: 'mdr_td',
    label: 'EU MDR Technical Documentation',
    market: 'eu',
    family: 'eu_mdr',
    requiredModules: ['Annex II', 'Annex III'],
    requiredDocuments: [
      { name: 'Device description and specification', required: true },
      { templateId: 'gspr_checklist', name: 'GSPR (Annex I) checklist', required: true },
      { name: 'Risk management file (ISO 14971)', required: true },
      { name: 'Clinical evaluation report (CER)', required: true },
      { name: 'EU Declaration of Conformity', required: true },
      { name: 'Post-market surveillance / PMCF plan', required: true },
    ],
    requiredForms: ['EUDAMED actor/device/UDI registration'],
    basis: 'Regulation (EU) 2017/745 (MDR) Annex II/III',
  },
  {
    submissionType: 'ivdr_td',
    label: 'EU IVDR Technical Documentation',
    market: 'eu',
    family: 'eu_ivdr',
    requiredModules: ['Annex II', 'Annex III'],
    requiredDocuments: [
      { name: 'Device description and specification', required: true },
      { templateId: 'gspr_checklist', name: 'GSPR (Annex I) checklist', required: true },
      { name: 'Risk management file (ISO 14971)', required: true },
      { templateId: 'performance_evaluation_report', name: 'Performance Evaluation Report (PER)', required: true },
      { name: 'EU Declaration of Conformity', required: true },
      { name: 'Post-market surveillance / PMPF plan', required: true },
    ],
    requiredForms: ['EUDAMED actor/device/UDI registration'],
    basis: 'Regulation (EU) 2017/746 (IVDR) Annex II/III',
  },
];

// ── Lookups + assessment (pure) ───────────────────────────────────────────────

const BY_TYPE = new Map(SUBMISSION_REQUIREMENTS.map((r) => [r.submissionType, r]));

export function getRequirements(type: string): SubmissionRequirement | undefined {
  return BY_TYPE.get(type as SubmissionType);
}

export function submissionTypes(): SubmissionType[] {
  return SUBMISSION_REQUIREMENTS.map((r) => r.submissionType);
}

export interface RequirementsAssessment {
  submissionType: SubmissionType;
  ready: boolean;
  missingDocuments: string[];
  missingForms: string[];
  presentRequiredCount: number;
  totalRequiredCount: number;
}

/**
 * Assess a candidate set against a submission type's requirements. A required
 * document counts as present when its templateId (preferred) or its name is in
 * `present`. Optional documents never block readiness.
 */
export function assessRequirements(
  type: string,
  present: { templateIds?: string[]; documentNames?: string[]; forms?: string[] }
): RequirementsAssessment | undefined {
  const req = getRequirements(type);
  if (!req) return undefined;

  const presentTemplates = new Set(present.templateIds ?? []);
  const presentNames = new Set((present.documentNames ?? []).map((n) => n.toLowerCase()));
  const presentForms = new Set((present.forms ?? []).map((f) => f.toLowerCase()));

  const requiredDocs = req.requiredDocuments.filter((d) => d.required);
  const missingDocuments: string[] = [];
  for (const d of requiredDocs) {
    const byTemplate = d.templateId ? presentTemplates.has(d.templateId) : false;
    const byName = presentNames.has(d.name.toLowerCase());
    if (!byTemplate && !byName) missingDocuments.push(d.name);
  }

  const missingForms = req.requiredForms.filter((f) => !presentForms.has(f.toLowerCase()));

  return {
    submissionType: req.submissionType,
    ready: missingDocuments.length === 0 && missingForms.length === 0,
    missingDocuments,
    missingForms,
    presentRequiredCount: requiredDocs.length - missingDocuments.length,
    totalRequiredCount: requiredDocs.length,
  };
}

export default {
  SUBMISSION_REQUIREMENTS,
  getRequirements,
  submissionTypes,
  assessRequirements,
};
