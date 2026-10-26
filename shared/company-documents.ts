import type { TemplateSpec } from './templates/template-spec';
import type { CompanyLegalOriginalSource, CompanyLegalRequirement, CompanyLegalWorkflow } from './company-legal-workflows';
import { companyScopeMatches } from './company-legal-workflows';
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
  /** Server-derived immutable ingest lineage; approval never travels with a copy. */
  sourceOriginal?: CompanyLegalOriginalSource;
  workflow?: CompanyLegalWorkflow;
  /** Read-time verdict; never accepted as a user-supplied approval. */
  transmitRefusal?: string | null;
}
export interface CompanyDocumentProfile {
  version: 1;
  revision: number;
  /** Owners/admins may require independent review of the organization default. */
  brandingApprovalRequired?: boolean;
  /** Server-set pointer to an explicitly activated, published org-wide design. */
  approvedDefaultDesignId?: string | null;
  companyName: string;
  address: string;
  contact: string;
  registrationDetails: string;
  letterhead: TemplateSpec;
  importedFrom: string | null;
  applyToReports: boolean;
  applyToSubmissionCorrespondence: boolean;
  legalDocuments: CompanyLegalDocument[];
  legalRequirements?: CompanyLegalRequirement[];
  /** A legal-library change alone never retires a legacy brand. */
  brandingAdopted?: boolean;
  /** Present only for an explicitly selected, published stationery variant. */
  variantId?: string;
}
export interface CompanyDocumentCapabilities {
  manageBrand: boolean;
  manageLegal: boolean;
  managePermissions: boolean;
}
export interface CompanyDocumentsResponse {
  data: CompanyDocumentProfile;
  canManage: boolean;
  capabilities?: CompanyDocumentCapabilities;
  /** Explicitly false only when a caller requested a presentation-only read. */
  legalDocumentsIncluded?: boolean;
}
export interface LegalDocumentContext {
  programId?: string | null;
  agency?: string | null;
  country?: string | null;
  submissionType?: string | null;
  today?: string;
}
function workflowRefusal(document: CompanyLegalDocument): string | null {
  if (document.workflow?.revokedAt) return 'This company legal document has been revoked.';
  if (document.workflow?.signatureEvidence?.result === 'invalid') return 'The recorded external signature evidence is invalid.';
  return null;
}

/** Explicit target matching. An empty scope means all; a missing target never matches a restricted scope. */
export function companyLegalDocumentRefusal(document: CompanyLegalDocument, context: LegalDocumentContext = {}): string | null {
  const today = context.today ?? new Date().toISOString().slice(0, 10);
  const workflow = workflowRefusal(document);
  if (workflow) return workflow;
  if (!document.active) return 'This library entry is archived.';
  if (document.effectiveOn && document.effectiveOn > today) return 'This document is not effective yet.';
  if (document.expiresOn && document.expiresOn < today) return 'This document has expired.';
  if (context.programId && context.programId.toLowerCase() !== document.programId.toLowerCase()) return 'Copy this document into the target project’s Vault and review that copy before filing.';
  if (!companyScopeMatches(document.agencies, context.agency, 'agency')) return 'The selected agency is outside this document’s scope.';
  if (!companyScopeMatches(document.countries, context.country, 'country')) return 'The selected country or region is outside this document’s scope.';
  if (!companyScopeMatches(document.submissionTypes, context.submissionType, 'submissionType')) return 'The selected submission type is outside this document’s scope.';
  if (document.transmitRefusal === undefined) return 'The current Vault approval could not be verified.';
  return document.transmitRefusal;
}

/** Rechecked by the existing Vault transmit gate, including after placement. */
export function companyLegalVersionDateRefusal(records: CompanyLegalDocument[], vaultId: string, contentHash: string, today = new Date().toISOString().slice(0, 10)): string | null {
  for (const record of records.filter(item => item.vaultDocumentId.toLowerCase() === vaultId.toLowerCase())) {
    const workflow = workflowRefusal(record);
    if (workflow) return workflow;
    if (!record.active) continue;
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
  for (const record of records.filter(item => item.vaultDocumentId.toLowerCase() === vaultId.toLowerCase())) {
    const workflow = workflowRefusal(record);
    if (workflow) return workflow;
    if (!record.active) continue;
    if (!context.programId) return 'The target project for this company legal document could not be verified.';
    const refusal = companyLegalDocumentRefusal({ ...record, transmitRefusal: null }, context);
    if (refusal) return refusal;
  }
  return null;
}
