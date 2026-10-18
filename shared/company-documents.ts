import type { TemplateSpec } from './templates/template-spec';
export type { TemplateSpec } from './templates/template-spec';

/** Organization assets are presentation defaults and pointers to original Vault versions. */
export const COMPANY_LEGAL_KINDS = ['authorization', 'power_of_attorney', 'declaration', 'certificate', 'agreement', 'cover_letter', 'other'] as const;
export type CompanyLegalKind = typeof COMPANY_LEGAL_KINDS[number];
export interface CompanyLegalDocument {
  id: string;
  title: string;
  kind: CompanyLegalKind;
  programId: string;
  vaultDocumentId: string;
  contentHash: string;
  version: string;
  agencies: string[];
  countries: string[];
  submissionTypes: string[];
  language: string;
  effectiveOn: string | null;
  expiresOn: string | null;
  active: boolean;
  registeredAt: string;
  registeredBy: string;
  /** Read-time verdict; never accepted as a user-supplied approval. */
  transmitRefusal?: string | null;
}
export interface CompanyDocumentProfile {
  version: 1;
  revision: number;
  companyName: string;
  address: string;
  contact: string;
  registrationDetails: string;
  letterhead: TemplateSpec;
  importedFrom: string | null;
  applyToReports: boolean;
  applyToSubmissionCorrespondence: boolean;
  legalDocuments: CompanyLegalDocument[];
}
export interface CompanyDocumentsResponse {
  data: CompanyDocumentProfile;
  canManage: boolean;
}
export interface LegalDocumentContext {
  programId?: string | null;
  agency?: string | null;
  country?: string | null;
  submissionType?: string | null;
  today?: string;
}
const matches = (values: string[], value?: string | null) => values.length === 0 ||
  Boolean(value && values.some(v => v.trim().toLowerCase() === value.trim().toLowerCase()));

/** Explicit target matching. An empty scope means all; a missing target never matches a restricted scope. */
export function companyLegalDocumentRefusal(document: CompanyLegalDocument, context: LegalDocumentContext = {}): string | null {
  const today = context.today ?? new Date().toISOString().slice(0, 10);
  if (!document.active) return 'This library entry is archived.';
  if (document.effectiveOn && document.effectiveOn > today) return 'This document is not effective yet.';
  if (document.expiresOn && document.expiresOn < today) return 'This document has expired.';
  if (context.programId && context.programId.toLowerCase() !== document.programId.toLowerCase()) return 'Copy this document into the target program Vault and review that copy before filing.';
  if (!matches(document.agencies, context.agency)) return 'The selected agency is outside this document’s scope.';
  if (!matches(document.countries, context.country)) return 'The selected country or region is outside this document’s scope.';
  if (!matches(document.submissionTypes, context.submissionType)) return 'The selected submission type is outside this document’s scope.';
  if (document.transmitRefusal === undefined) return 'The current Vault approval could not be verified.';
  return document.transmitRefusal;
}

/** Rechecked by the existing Vault transmit gate, including after placement. */
export function companyLegalVersionDateRefusal(records: CompanyLegalDocument[], vaultId: string, contentHash: string, today = new Date().toISOString().slice(0, 10)): string | null {
  for (const record of records.filter(item => item.active && item.vaultDocumentId === vaultId)) {
    if (record.contentHash !== contentHash) return 'The company legal document no longer matches its registered content hash.';
    if (record.effectiveOn && record.effectiveOn > today) return 'The company legal document is not effective yet.';
    if (record.expiresOn && record.expiresOn < today) return 'The company legal document has expired.';
  }
  return null;
}

/** The canonical placement and transmission paths share target applicability.
 * Approval is checked separately when bytes are transmitted; a draft may be
 * placed for review, but it may never bypass its registered target scope. */
export function companyLegalVersionTargetRefusal(records: CompanyLegalDocument[], vaultId: string, context: LegalDocumentContext): string | null {
  for (const record of records.filter(item => item.active && item.vaultDocumentId.toLowerCase() === vaultId.toLowerCase())) {
    if (!context.programId) return 'The target program for this company legal document could not be verified.';
    const refusal = companyLegalDocumentRefusal({ ...record, transmitRefusal: null }, context);
    if (refusal) return refusal;
  }
  return null;
}
