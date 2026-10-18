import type { CompanyLegalDocument, CompanyLegalKind } from './company-documents';
import { canonicalRegionOf, REGION_IDENTITY } from './regulatory/region-identity';
import { GLOBAL_REGISTRY, resolveToRegistryId } from './regulatory/submission-type-bridge';

/** Human-reviewed evidence is separate from Vault approval and cryptographic trust. */
export interface CompanyLegalEvidenceRef {
  vaultDocumentId: string;
  programId: string;
  version: string;
  contentHash: string;
}
/** Immutable source for an explicit first-party copy; never inferred from a hash alone. */
export interface CompanyLegalOriginalSource extends CompanyLegalEvidenceRef { registryId: string }
export interface CompanyLegalAuthority {
  signatoryName: string;
  role: string;
  delegationLegalDocumentId: string | null;
  evidence: CompanyLegalEvidenceRef[];
  reviewedBy: string;
  reviewedAt: string;
}
export interface CompanyLegalSignatureEvidence {
  method: 'external_tool' | 'manual_evidence';
  result: 'valid' | 'invalid' | 'inconclusive';
  tool: string;
  verifiedAt: string;
  evidence: CompanyLegalEvidenceRef;
  reviewedBy: string;
  recordedAt: string;
  /** No manual entry may claim the application cryptographically verified it. */
  verification: 'recorded_external_evidence';
}
export interface CompanyLegalWorkflow {
  custodianUserId: string | null;
  reminderDays: number[];
  replacementId: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
  authority: CompanyLegalAuthority | null;
  signatureEvidence: CompanyLegalSignatureEvidence | null;
  translationOfId: string | null;
  certifiedTranslationEvidence: CompanyLegalEvidenceRef | null;
  updatedAt: string;
  updatedBy: string;
}
export interface CompanyLegalRequirement {
  id: string;
  /** Filing-bound reviews are admitted server-side; absent means organization policy. */
  sequenceId?: number | null;
  programId?: string | null;
  /** A sequence review may specialize an organization policy without rewriting it. */
  policyId?: string | null;
  title: string;
  source: 'regional' | 'customer';
  regionalCode: string | null;
  kind: CompanyLegalKind;
  agencies: string[];
  countries: string[];
  submissionTypes: string[];
  language: string | null;
  sectionCode: string | null;
  applicability: 'required' | 'not_applicable' | 'unresolved';
  rationale: string;
  legalDocumentIds: string[];
  requiresAuthority?: boolean;
  requiresSignatureEvidence?: boolean;
  requiresCertifiedTranslation?: boolean;
  /** Generated suggestions have no review. Saved reviews use the actual actor and time. */
  reviewedBy: string | null;
  reviewedAt: string | null;
}
export interface CompanyLegalWorkflowInput {
  custodianUserId: string | null;
  reminderDays: number[];
  replacementId: string | null;
  revocation?: { reason: string } | null;
  authority: { signatoryName: string; role: string; delegationLegalDocumentId: string | null; evidenceVaultDocumentIds: string[] } | null;
  signatureEvidence: { method: 'external_tool' | 'manual_evidence'; result: 'valid' | 'invalid' | 'inconclusive'; tool: string; verifiedAt: string; evidenceVaultDocumentId: string } | null;
  translationOfId: string | null;
  certifiedTranslationEvidenceVaultDocumentId: string | null;
}
export interface CompanyLegalRenewal {
  status: 'unassigned' | 'not_due' | 'due' | 'expired' | 'revoked' | 'archived' | 'no_expiry';
  daysRemaining: number | null;
  dueOn: string | null;
}
export interface CompanyLegalLifecycleResponse {
  document: CompanyLegalDocument;
  renewal: CompanyLegalRenewal;
  placements: Array<{ leafId: number; submissionId: number; submissionTitle: string | null; sequenceId: number; sequenceNumber: string | null; sectionCode: string; sequenceStatus: string | null; dispatchStatus: string | null; operation: string }>;
  estarUses?: Array<{ record: 'artifact' | 'audit'; recordId: string; exportedAt: string; slot: string | null; chapter: string | null; fileName: string | null; retainedAs: { documentId: string; documentCode: string | null; version: string | null } | null }>;
  cmcEvidence?: Array<{ linkId: string; sourceType: string; sourceKey: string; sections: string[] }>;
  /** Exact-version evidence may be withheld after its project access is removed. */
  evidenceUnavailable: boolean;
}
export interface CompanyLegalReadinessItem {
  requirement: CompanyLegalRequirement;
  status: 'unresolved' | 'not_applicable' | 'missing' | 'blocked' | 'ready';
  matchedDocumentIds: string[];
  findings: string[];
}
export interface CompanyLegalReadinessResponse {
  target: { programId: string; submissionId: number; sequenceId: number; agency: string; country: string; submissionType: string };
  coverage: 'regional_marketing_checklist' | 'customer_review_required';
  ready: boolean;
  items: CompanyLegalReadinessItem[];
  findings: string[];
  disclaimer: string;
}
export type CompanyScopeKind = 'agency' | 'country' | 'submissionType';
export function normalizeCompanyCountry(value: string): string | null {
  // Human-facing spellings accompany the canonical platform vocabulary.
  const aliases: Record<string, string> = { 'health canada': 'CA', 'united states': 'US', 'united kingdom': 'UK', 'european union': 'EU', 'south korea': 'KR', japan: 'JP', china: 'CN', australia: 'AU', switzerland: 'CH', brazil: 'BR', india: 'IN', singapore: 'SG', canada: 'CA' };
  return canonicalRegionOf(aliases[value.trim().toLowerCase()] ?? value) ?? null;
}
export function normalizeCompanyAgency(value: string): string | null {
  const region = normalizeCompanyCountry(value);
  return region ? REGION_IDENTITY[region as keyof typeof REGION_IDENTITY].agency : null;
}
export function normalizeCompanySubmissionType(value: string): string | null { return resolveToRegistryId(value); }
export function normalizeCompanyScope(value: string, kind: CompanyScopeKind): string | null {
  return kind === 'agency' ? normalizeCompanyAgency(value) : kind === 'country' ? normalizeCompanyCountry(value) : normalizeCompanySubmissionType(value);
}
/** New registrations use known vocabulary; existing unknown records remain restricted on reads. */
export function normalizeCompanyScopes(input: { agencies: string[]; countries: string[]; submissionTypes: string[] }) {
  const normalized = (values: string[], kind: CompanyScopeKind) => [...new Set(values.map(value => {
    const result = normalizeCompanyScope(value, kind);
    if (!result) throw new Error(`Choose a recognized ${kind} from the company-document scope catalog.`);
    return result;
  }))];
  return { agencies: normalized(input.agencies, 'agency'), countries: normalized(input.countries, 'country'), submissionTypes: normalized(input.submissionTypes, 'submissionType') };
}
/** Backward-compatible read matching; unknown legacy labels remain restricted. */
export function companyScopeMatches(values: string[], target: string | null | undefined, kind: CompanyScopeKind): boolean {
  if (values.length === 0) return true;
  if (!target) return false;
  const normalized = normalizeCompanyScope(target, kind);
  return values.some(value => {
    const candidate = normalizeCompanyScope(value, kind);
    return candidate && normalized ? candidate === normalized : value.trim().toLowerCase() === target.trim().toLowerCase();
  });
}
export const COMPANY_SCOPE_CATALOG = {
  agencies: Object.values(REGION_IDENTITY).map(item => ({ value: item.agency, label: item.agency.replaceAll('_', ' '), country: item.code })),
  countries: Object.values(REGION_IDENTITY).map(item => ({ value: item.code, label: `${item.code} — ${item.agency.replaceAll('_', ' ')}` })),
  submissionTypes: GLOBAL_REGISTRY.filter(item => item.active).map(item => ({ value: item.id, label: item.displayName, country: item.region })),
};
function renewalStatus(document: CompanyLegalDocument, daysRemaining: number | null, maxReminder: number): CompanyLegalRenewal['status'] {
  if (document.workflow?.revokedAt) return 'revoked';
  if (!document.active) return 'archived';
  if (!document.expiresOn) return 'no_expiry';
  if (daysRemaining !== null && daysRemaining < 0) return 'expired';
  if (!document.workflow?.custodianUserId) return 'unassigned';
  return daysRemaining !== null && daysRemaining <= maxReminder ? 'due' : 'not_due';
}
export function companyLegalRenewal(document: CompanyLegalDocument, today = new Date().toISOString().slice(0, 10)): CompanyLegalRenewal {
  const workflow = document.workflow;
  const daysRemaining = document.expiresOn ? Math.floor((Date.parse(`${document.expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
  const maxReminder = Math.max(0, ...(workflow?.reminderDays ?? []));
  const dueOn = document.expiresOn ? new Date(Date.parse(`${document.expiresOn}T00:00:00Z`) - maxReminder * 86400000).toISOString().slice(0, 10) : null;
  return { status: renewalStatus(document, daysRemaining, maxReminder), daysRemaining, dueOn };
}
