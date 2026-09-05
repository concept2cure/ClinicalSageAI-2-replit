/**
 * IND cover letter assembler (eCTD Module 1.2).
 *
 * Generates the IND cover letter to FDA from submission + sponsor metadata —
 * the administrative letter that identifies the submission, states its purpose,
 * lists its contents, and is signed by the sponsor's authorized representative.
 * Deterministic: the letter date is an explicit input (defaults to the epoch)
 * so the same metadata renders byte-identically.
 *
 * Render it to an m1.2 leaf via renderCoverLetterPdf (ind-document-renderer).
 */

import {
  resolveToRegistryEntry,
  getSubmissionTypeContext,
  type SubmissionTypeContext,
} from '../../../shared/regulatory/submission-type-bridge.js';

export type IndSubmissionType =
  | 'original'
  | 'protocol_amendment'
  | 'information_amendment'
  | 'response_to_clinical_hold'
  | 'response_to_information_request'
  | 'annual_report'
  | 'safety_report';

export interface CoverLetterInput {
  sponsorName: string;
  sponsorAddress?: string;
  drugName: string;
  indication?: string;
  /** IND number if assigned; absent/null for an original IND. */
  indNumber?: string | null;
  submissionType: IndSubmissionType;
  /** Submission serial number (e.g. "0000"). */
  serialNumber?: string;
  /** FDA review division (e.g. "Division of Oncology 1"). */
  fdaDivision?: string;
  /** Purpose statement; a sensible default is used per submission type when absent. */
  purpose?: string;
  /** Items included in the submission (bulleted in the letter). */
  contents?: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  /** Letter date (ISO). Defaults to the epoch for deterministic rendering. */
  date?: string;
}

export interface CoverLetterModel {
  reportType: 'IND_COVER_LETTER';
  indNumber: string | null;
  submissionType: IndSubmissionType;
  /** The fully formatted letter body (ready to render to PDF). */
  body: string;
  /** Required fields that were missing (the letter still renders with placeholders). */
  gaps: string[];
}

const SUBMISSION_LABEL: Record<IndSubmissionType, string> = {
  original: 'Initial Investigational New Drug Application',
  protocol_amendment: 'Protocol Amendment',
  information_amendment: 'Information Amendment',
  response_to_clinical_hold: 'Complete Response to Clinical Hold',
  response_to_information_request: 'Response to Information Request',
  annual_report: 'Annual Report',
  safety_report: 'IND Safety Report',
};

const DEFAULT_PURPOSE: Record<IndSubmissionType, string> = {
  original:
    'On behalf of the sponsor, we are submitting this initial Investigational New Drug Application to support the initiation of clinical investigations.',
  protocol_amendment:
    'We are submitting this protocol amendment under 21 CFR 312.30.',
  information_amendment:
    'We are submitting this information amendment under 21 CFR 312.31.',
  response_to_clinical_hold:
    'We are submitting this complete response to the clinical hold under 21 CFR 312.42.',
  response_to_information_request:
    'We are submitting this response to the Agency’s information request.',
  annual_report:
    'We are submitting this annual report under 21 CFR 312.33.',
  safety_report:
    'We are submitting this IND safety report under 21 CFR 312.32.',
};

function fmtDate(iso?: string): string {
  // An absent or unparsable date used to render as "01 January 1970" on the
  // letter. It is a placeholder like the other unfilled fields.
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '[Date]';
  // Deterministic, locale-independent: "05 September 2026".
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Assemble the IND cover letter. Deterministic; `gaps` lists missing required
 * fields (the letter still renders, using bracketed placeholders).
 */
export function assembleCoverLetter(input: CoverLetterInput): CoverLetterModel {
  const gaps: string[] = [];
  const req = (val: string | undefined | null, label: string, placeholder: string): string => {
    if (val && val.trim().length > 0) return val.trim();
    gaps.push(label);
    return placeholder;
  };

  const sponsorName = req(input.sponsorName, 'sponsorName', '[Sponsor Name]');
  const drugName = req(input.drugName, 'drugName', '[Drug Name]');
  const signatoryName = req(input.signatoryName, 'signatoryName', '[Authorized Representative]');

  const label = SUBMISSION_LABEL[input.submissionType];
  const indLine = input.indNumber
    ? `IND ${input.indNumber} — ${drugName}`
    : `${label} — ${drugName}`;
  const indicationPart = input.indication ? ` for ${input.indication.trim()}` : '';
  const serialPart = input.serialNumber ? `, Serial Number ${input.serialNumber}` : '';

  const purpose = (input.purpose && input.purpose.trim()) || DEFAULT_PURPOSE[input.submissionType];

  const contents =
    input.contents && input.contents.length > 0
      ? input.contents.map((c) => `  • ${c}`).join('\n')
      : '  • [List of submission contents]';

  const contactName = input.contactName?.trim() || '[Contact Name]';
  const contactBits = [input.contactPhone?.trim(), input.contactEmail?.trim()].filter(Boolean).join(' / ');
  const contactLine = contactBits ? `${contactName} at ${contactBits}` : contactName;

  const body = [
    sponsorName,
    input.sponsorAddress?.trim() || '[Sponsor Address]',
    '',
    fmtDate(input.date),
    '',
    'Food and Drug Administration',
    'Center for Drug Evaluation and Research',
    input.fdaDivision?.trim() || '[Review Division]',
    '',
    `RE: ${indLine}${indicationPart}`,
    `    ${label}${serialPart}`,
    '',
    'Dear Sir or Madam:',
    '',
    purpose,
    '',
    'This submission contains the following:',
    contents,
    '',
    `Should you have any questions regarding this submission, please contact ${contactLine}.`,
    '',
    'Sincerely,',
    '',
    '',
    signatoryName,
    input.signatoryTitle?.trim() || '[Title]',
    sponsorName,
  ].join('\n');

  return {
    reportType: 'IND_COVER_LETTER',
    indNumber: input.indNumber ?? null,
    submissionType: input.submissionType,
    body,
    gaps,
  };
}

/**
 * Resolve a top-level regulatory type string (e.g. 'IND', 'US_IND', 'ind')
 * through the canonical submission-type bridge and return structured context.
 *
 * Useful for callers who need to confirm the regulatory scope or enrich the
 * cover letter metadata (agency, region, display name) before generation.
 * Returns null for unrecognized types.
 */
export function resolveRegulatoryContext(regulatoryType: string): SubmissionTypeContext | null {
  return getSubmissionTypeContext(regulatoryType);
}

/**
 * Validate that a regulatory type string resolves to an IND-family entry
 * in the canonical registry. Returns the registry entry or null if the type
 * is unrecognized or not IND-related.
 */
export function validateIndRegulatoryType(regulatoryType: string): { registryId: string; displayName: string } | null {
  const entry = resolveToRegistryEntry(regulatoryType);
  if (!entry) return null;
  // Accept entries whose application family is clinical_trial (IND, CTA, CTN, etc.)
  if (entry.applicationFamily !== 'clinical_trial') return null;
  return { registryId: entry.id, displayName: entry.displayName };
}
