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
import type { LegacyLowerType } from '../../../shared/regulatory/submission-type-bridge.js';
import {
  estarSlots,
  slotApplicability,
  type DeviceFlagId,
  type DeviceFlags,
  type EstarSlot,
  type EstarType,
  type Necessity,
} from '../pathway-engines/estar/estar-mapper';

export type SubmissionType = Extract<LegacyLowerType,
  | 'ind' | 'nda' | 'bla' | 'anda'
  | '510k' | 'de_novo' | 'pma'
  | 'maa' | 'cta'
  | 'jnda'
  | 'mdr_td' | 'ivdr_td'>;

export interface RequiredDocument {
  /** Links to a document-template-library id where one exists. */
  templateId?: string;
  name: string;
  /**
   * Required for EVERY submission of this type. For an eSTAR-derived row this
   * is `necessity === 'always'`; a `conditional` row is required exactly when
   * its flag is set, which `assessRequirements` decides per device.
   */
  required: boolean;
  /** eSTAR-derived rows only: the estar-mapper slot this row projects. */
  estarSlotId?: string;
  /** eSTAR-derived rows only: how necessity is decided (estar-mapper `Necessity`). */
  necessity?: Necessity;
  /** For `conditional`: the device flag that decides it. */
  flag?: DeviceFlagId;
  /** For `when-applicable`: the device property that decides it, in words. */
  appliesWhen?: string;
  /** The regulation, statute, standard or guidance this row answers to. */
  authority?: string;
  /** Other document names that satisfy this one requirement. */
  alsoSatisfiedBy?: string[];
  /** A form whose presence also satisfies this row (e.g. the FDA 3601 user-fee cover sheet). */
  satisfiedByForm?: string;
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

/* ── 510(k) and De Novo: rows from the eSTAR slot registry ──────────────────
 *
 * These two rows used to be hand-written here, beside the canonical eSTAR
 * registry in server/services/pathway-engines/estar/estar-mapper.ts, and they
 * had drifted from it in the dangerous direction: no proposed labeling (21 CFR
 * 807.87(e)), no Indications for Use (FDA 3881), no Truthful and Accurate
 * Statement (807.87(k)), no user fee (FDA 3601), no 510(k) Statement as the
 * alternative to the Summary — and biocompatibility marked optional while the
 * mapper requires it. A 510(k) holding none of those assessed ready:true.
 *
 * So the rows are now a projection of `estarSlots()`: one row per slot, its
 * label, necessity, flag / appliesWhen and authority read from the registry.
 * Nothing about WHAT eSTAR requires is said in this file. What is said here is
 * only how a row links to things outside the registry: the document-template
 * library id, the alternative names for the summary-or-statement slot, and the
 * form that is filed outside the eSTAR PDF.
 */
const ESTAR_ROW_LINKS: Record<string, Pick<RequiredDocument, 'templateId' | 'alsoSatisfiedBy' | 'satisfiedByForm'>> = {
  'cover-letter': { templateId: 'cover_letter' },
  '510k-summary-or-statement': {
    templateId: 'k510_summary',
    alsoSatisfiedBy: ['510(k) Summary', '510(k) Statement'],
  },
  /* The 3601 is completed in the FDA user-fee system, which issues the payment
     identification number the eSTAR then cites; the cover sheet itself is not
     a section of the eSTAR. It is therefore also a form of the submission. */
  'user-fee-cover-sheet': { satisfiedByForm: 'FDA 3601' },
};

/** The container: eSTAR is mandatory for both, and both go through the CDRH Portal. */
const ESTAR_CONTAINER_FORM = 'eSTAR (submitted via CDRH Portal)';

function estarRow(slot: EstarSlot): RequiredDocument {
  return {
    ...ESTAR_ROW_LINKS[slot.id],
    name: slot.label,
    required: slot.necessity === 'always',
    estarSlotId: slot.id,
    necessity: slot.necessity,
    ...(slot.flag ? { flag: slot.flag } : {}),
    ...(slot.appliesWhen ? { appliesWhen: slot.appliesWhen } : {}),
    authority: slot.authority,
  };
}

function estarRows(type: EstarType, variant?: 'device' | 'ivd'): RequiredDocument[] {
  return estarSlots(type, variant).map(estarRow);
}

/** The container, then each form an always-required slot is filed as. */
function estarForms(rows: RequiredDocument[]): string[] {
  const forms = rows.filter((r) => r.required && r.satisfiedByForm).map((r) => r.satisfiedByForm!);
  return [ESTAR_CONTAINER_FORM, ...new Set(forms)];
}

const ROWS_510K = estarRows('510k');
const ROWS_DE_NOVO = estarRows('de_novo');

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
    requiredDocuments: ROWS_510K,
    requiredForms: estarForms(ROWS_510K),
    basis: 'FD&C Act §510(k); 21 CFR 807 Subpart E; eSTAR mandatory since 2023-10-01, via the CDRH Portal. Rows: the eSTAR slot registry (estar-mapper.ts)',
  },
  {
    submissionType: 'de_novo',
    label: 'De Novo Classification Request',
    market: 'us',
    family: 'estar',
    requiredDocuments: ROWS_DE_NOVO,
    requiredForms: estarForms(ROWS_DE_NOVO),
    basis: 'FD&C Act §513(f)(2); 21 CFR 860 Subpart D; eSTAR mandatory since 2025-10-01, via the CDRH Portal. Rows: the eSTAR slot registry (estar-mapper.ts)',
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
      // 2026-10-05 (g-ivdr-gspr-checklist): the IVDR's own Annex I checklist, not the MDR one.
      { templateId: 'ivdr_gspr_checklist', name: 'GSPR (Annex I) checklist', required: true },
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
  /**
   * Absent rows whose necessity turns on a device flag that was not supplied.
   * These block `ready`: not knowing whether a sterile device's sterilization
   * section is needed is not the same as not needing it. Always empty for
   * types whose rows are not flag-conditional.
   */
  undetermined: string[];
  /** Absent rows that turn on a device property no flag captures — for a human to confirm; they do not block. */
  checkApplicability: string[];
  presentRequiredCount: number;
  totalRequiredCount: number;
}

export interface RequirementsCandidate {
  templateIds?: string[];
  documentNames?: string[];
  forms?: string[];
  /**
   * The device's answers to the seven intake flags (eSTAR types only). An
   * unanswered flag leaves its conditional rows undetermined, and an
   * undetermined absent row keeps `ready` false.
   */
  flags?: DeviceFlags;
  /** eSTAR family for a 510(k): the IVD eSTAR asks for analytical performance. Omitted means 'device'. */
  variant?: 'device' | 'ivd';
}

type RowApplicability = 'required' | 'not-applicable' | 'undetermined' | 'when-applicable';

/** Static rows: `required` decides. eSTAR rows: the mapper's own applicability rule decides. */
function rowApplicability(d: RequiredDocument, flags: DeviceFlags | undefined): RowApplicability {
  if (!d.necessity) return d.required ? 'required' : 'not-applicable';
  return slotApplicability({ necessity: d.necessity, flag: d.flag }, flags);
}

/**
 * Assess a candidate set against a submission type's requirements. A row counts
 * as present when its templateId (preferred), its eSTAR slot id, its name, one
 * of its alternative names, or the form it is filed as is in `present`.
 *
 * For 510(k) and De Novo the necessity of each row is the eSTAR mapper's: an
 * always row is required, a conditional row is required when its flag is set
 * and UNDETERMINED when the flag is not supplied (blocking `ready`), and a
 * when-applicable row is reported for confirmation without blocking.
 */
export function assessRequirements(type: string, present: RequirementsCandidate): RequirementsAssessment | undefined {
  const base = getRequirements(type);
  if (!base) return undefined;
  const req: SubmissionRequirement =
    base.submissionType === '510k' && present.variant === 'ivd'
      ? { ...base, requiredDocuments: estarRows('510k', 'ivd') }
      : base;

  const presentTemplates = new Set(present.templateIds ?? []);
  const presentNames = new Set((present.documentNames ?? []).map((n) => n.toLowerCase()));
  const presentForms = new Set((present.forms ?? []).map((f) => f.toLowerCase()));

  const isPresent = (d: RequiredDocument): boolean =>
    (d.templateId !== undefined && presentTemplates.has(d.templateId)) ||
    (d.estarSlotId !== undefined && presentTemplates.has(d.estarSlotId)) ||
    [d.name, ...(d.alsoSatisfiedBy ?? [])].some((n) => presentNames.has(n.toLowerCase())) ||
    (d.satisfiedByForm !== undefined && presentForms.has(d.satisfiedByForm.toLowerCase()));

  const missingDocuments: string[] = [];
  const undetermined: string[] = [];
  const checkApplicability: string[] = [];
  let totalRequiredCount = 0;
  for (const d of req.requiredDocuments) {
    const applicability = rowApplicability(d, present.flags);
    if (applicability === 'required') totalRequiredCount += 1;
    if (isPresent(d)) continue;
    if (applicability === 'required') missingDocuments.push(d.name);
    else if (applicability === 'undetermined') undetermined.push(d.name);
    else if (applicability === 'when-applicable') checkApplicability.push(d.name);
  }

  const missingForms = req.requiredForms.filter((f) => !presentForms.has(f.toLowerCase()));

  return {
    submissionType: req.submissionType,
    ready: missingDocuments.length === 0 && missingForms.length === 0 && undetermined.length === 0,
    missingDocuments,
    missingForms,
    undetermined,
    checkApplicability,
    presentRequiredCount: totalRequiredCount - missingDocuments.length,
    totalRequiredCount,
  };
}

export default {
  SUBMISSION_REQUIREMENTS,
  getRequirements,
  submissionTypes,
  assessRequirements,
};
