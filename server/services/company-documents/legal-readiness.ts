import type { Request } from 'express';
import { companyLegalDocumentRefusal, type CompanyLegalDocument, type CompanyLegalKind, type LegalDocumentContext } from '../../../shared/company-documents';
import { COMPANY_SCOPE_CATALOG, companyScopeMatches, normalizeCompanySubmissionType,
  type CompanyLegalReadinessResponse, type CompanyLegalReadinessItem, type CompanyLegalRequirement } from '../../../shared/company-legal-workflows';
import { canonicalRegionOf, REGION_IDENTITY, toAgency } from '../../../shared/regulatory/region-identity';
import { resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge';
import { REGIONAL_MODULE1_REQUIREMENTS, type RegulatoryMarket } from '../global-ri/regional-module1-requirements';
import { readSubmissionSequenceForRequest, requireSubmissionReadStillCurrent } from '../submission-service/submission-request-read';
import { context, loadCompanyDocumentProfile, readCompanyDocumentProfile, CompanyDocumentsError } from './profile';
import { companyLegalEvidenceRefusal } from './legal-evidence';

/** Explicit reviewed mappings only: document titles are never used as evidence. */
const LEGAL_COMPONENT_KINDS: Record<string, CompanyLegalKind> = {
  us_cover_letter: 'cover_letter', us_debarment: 'declaration', us_financial_disclosure: 'declaration', us_3674: 'certificate',
  eu_cover_letter: 'cover_letter', eu_expert_declarations: 'declaration', jp_gmp: 'certificate', jp_manufacturer_certificate: 'certificate',
  ca_cover_letter: 'cover_letter', ca_cpid: 'certificate', uk_cover_letter: 'cover_letter', au_cover_letter: 'cover_letter',
  ch_cover_letter: 'cover_letter', ch_gmp: 'certificate', cn_certificates: 'certificate',
};
export function companyLegalRequirementCatalog() {
  return {
    scopes: COMPANY_SCOPE_CATALOG,
    requirements: Object.values(REGION_IDENTITY).flatMap(identity => {
      const market = String(identity.agency).toUpperCase() as RegulatoryMarket;
      return (REGIONAL_MODULE1_REQUIREMENTS[market] ?? []).map(component => ({ ...component,
        agency: identity.agency, country: identity.code, kind: LEGAL_COMPONENT_KINDS[component.code] ?? null,
        coverage: 'initial_marketing_application' as const }));
    }),
  };
}
export function isInitialMarketingApplication(applicationType: string, country: string): boolean {
  const entry = resolveToRegistryEntry(applicationType);
  return Boolean(entry && entry.applicationFamily === 'marketing_authorization' && entry.region === country &&
    entry.dossierStandard === 'eCTD' && !entry.parentApplicationType);
}
export function regionalLegalRequirementId(code: string, submissionType: string, sequenceId?: number | null): string { return `regional:${code}:${normalizeCompanySubmissionType(submissionType) ?? submissionType}${sequenceId ? `:sequence:${sequenceId}` : ''}`; }
export function regionalLegalRequirements(target: LegalDocumentContext & { sequenceId?: number }): CompanyLegalRequirement[] {
  if (!target.country || !target.submissionType || !isInitialMarketingApplication(target.submissionType, target.country)) return [];
  return companyLegalRequirementCatalog().requirements.filter(item => item.country === target.country && item.kind).map(item => ({
    id: regionalLegalRequirementId(item.code, target.submissionType!, target.sequenceId), sequenceId: target.sequenceId ?? null, programId: target.programId ?? null,
    title: item.label, source: 'regional', regionalCode: item.code,
    kind: item.kind!, agencies: [item.agency], countries: [item.country], submissionTypes: [normalizeCompanySubmissionType(target.submissionType!)!],
    language: null, sectionCode: item.section, applicability: 'unresolved',
    rationale: 'Review applicability and explicitly map approved legal versions for this filing type.', legalDocumentIds: [], reviewedBy: null, reviewedAt: null,
  }));
}
function applies(requirement: CompanyLegalRequirement, target: LegalDocumentContext & { sequenceId?: number }): boolean {
  if (requirement.sequenceId && requirement.sequenceId !== target.sequenceId) return false;
  if (requirement.programId && requirement.programId !== target.programId) return false;
  return companyScopeMatches(requirement.agencies, target.agency, 'agency') && companyScopeMatches(requirement.countries, target.country, 'country') &&
    companyScopeMatches(requirement.submissionTypes, target.submissionType, 'submissionType');
}
interface ReadinessInput {
  target: CompanyLegalReadinessResponse['target']; documents: CompanyLegalDocument[]; requirements: CompanyLegalRequirement[];
  placements: Array<{ documentId: string; contentHash: string; sectionCode: string; operation?: string }>; today?: string;
  evidenceRefusals?: Record<string, string | null>;
  includeRegionalSuggestions?: boolean;
}
function authorityRefusal(requirement: CompanyLegalRequirement, document: CompanyLegalDocument, input: ReadinessInput): string | null {
  if (!requirement.requiresAuthority) return null;
  const authority = document.workflow?.authority;
  if (!authority?.signatoryName || !authority.evidence.length) return 'Reviewed signing-authority evidence is required.';
  if (!authority.delegationLegalDocumentId) return null;
  const delegated = input.documents.find(item => item.id === authority.delegationLegalDocumentId);
  return !delegated || companyLegalDocumentRefusal(delegated, { ...input.target, today: input.today })
    ? 'Its delegated authority is unavailable or not currently usable for this filing.' : null;
}
function supportingReviewRefusal(requirement: CompanyLegalRequirement, document: CompanyLegalDocument, input: ReadinessInput): string | null {
  const workflow = document.workflow;
  if (requirement.requiresSignatureEvidence && (!workflow?.signatureEvidence || workflow.signatureEvidence.result !== 'valid')) return 'Reviewed external evidence reporting a valid signature is required.';
  const translation = certifiedTranslationRefusal(requirement, document, input);
  if (translation) return translation;
  const needsEvidence = [requirement.requiresAuthority, requirement.requiresSignatureEvidence, requirement.requiresCertifiedTranslation].some(Boolean);
  if (needsEvidence && input.evidenceRefusals?.[document.id] !== null) return input.evidenceRefusals?.[document.id] ?? 'Current supporting evidence could not be verified.';
  return null;
}
function certifiedTranslationRefusal(requirement: CompanyLegalRequirement, document: CompanyLegalDocument, input: ReadinessInput): string | null {
  if (!requirement.requiresCertifiedTranslation) return null;
  const workflow = document.workflow;
  if (!workflow?.translationOfId || !workflow.certifiedTranslationEvidence) return 'A linked legal original and certified-translation evidence are required.';
  const original = input.documents.find(item => item.id === workflow.translationOfId);
  if (!original) return 'The linked translation original is unavailable in this project.';
  const refusal = companyLegalDocumentRefusal({ ...original, active: true }, { ...input.target, today: input.today });
  return refusal ? `The linked translation original cannot support this filing. ${refusal}` : null;
}
function documentRequirementRefusal(requirement: CompanyLegalRequirement, document: CompanyLegalDocument, input: ReadinessInput): string | null {
  const refusal = companyLegalDocumentRefusal(document, { ...input.target, today: input.today });
  if (refusal) return refusal;
  if (document.kind !== requirement.kind) return 'Its registered document kind does not match this requirement.';
  if (requirement.language && document.language.toLowerCase() !== requirement.language.toLowerCase()) return 'The required language does not match its registered language.';
  const evidence = authorityRefusal(requirement, document, input) ?? supportingReviewRefusal(requirement, document, input);
  if (evidence) return evidence;
  const placed = input.placements.some(placement => placement.documentId.toLowerCase() === document.vaultDocumentId.toLowerCase() &&
    placement.contentHash.toLowerCase() === document.contentHash.toLowerCase() && placement.operation !== 'delete' &&
    (!requirement.sectionCode || placement.sectionCode.replace(/^m/i, '') === requirement.sectionCode.replace(/^m/i, '')));
  return placed ? null : 'Place this exact version in the requirement’s sequence section.';
}
function assessRequirement(requirement: CompanyLegalRequirement, input: ReadinessInput): CompanyLegalReadinessItem {
  const visibleIds = requirement.legalDocumentIds.filter(id => input.documents.some(document => document.id === id && document.programId === input.target.programId));
  const row: CompanyLegalReadinessItem = { requirement: { ...requirement, legalDocumentIds: visibleIds }, status: 'unresolved', matchedDocumentIds: [], findings: [] };
  if (!requirement.reviewedBy || !requirement.reviewedAt || requirement.applicability === 'unresolved') {
    row.findings.push('Applicability has not been resolved by a recorded legal review.'); return row;
  }
  if (requirement.applicability === 'not_applicable') { row.status = 'not_applicable'; return row; }
  if (!visibleIds.length) { row.status = 'missing'; row.findings.push('Map an exact legal-library version from this project to this requirement.'); return row; }
  for (const id of visibleIds) {
    const document = input.documents.find(item => item.id === id)!;
    const refusal = documentRequirementRefusal(requirement, document, input);
    if (refusal) row.findings.push(`${document.title}: ${refusal}`);
    else row.matchedDocumentIds.push(id);
  }
  row.status = row.findings.length ? 'blocked' : row.matchedDocumentIds.length ? 'ready' : 'missing';
  return row;
}
/** A library match is separate from actual placement in the retained sequence. */
export function assessCompanyLegalReadiness(input: ReadinessInput): CompanyLegalReadinessResponse {
  const target = { ...input.target, today: input.today };
  const defaults = input.includeRegionalSuggestions === false ? [] : regionalLegalRequirements(target);
  const applicable = input.requirements.filter(item => applies(item, target));
  const reviewed = applicable.filter(item => !applicable.some(specialized => specialized.sequenceId === target.sequenceId && specialized.policyId === item.id));
  const replacementFor = (item: CompanyLegalRequirement) => reviewed.find(saved => saved.id === item.id) ??
    reviewed.find(saved => !saved.sequenceId && saved.source === 'regional' && saved.regionalCode === item.regionalCode);
  const requirements = [...defaults.map(item => replacementFor(item) ?? item),
    ...reviewed.filter(item => !defaults.some(initial => replacementFor(initial)?.id === item.id))];
  const findings: string[] = [];
  if (!defaults.length) findings.push('No regional legal-companion checklist is modeled for this filing type. Record and review customer requirements before claiming completeness.');
  if (!requirements.length) findings.push('No reviewed legal requirements are recorded for this target.');
  const items = requirements.map(requirement => assessRequirement(requirement, input));
  return { target: input.target, coverage: defaults.length ? 'regional_marketing_checklist' : 'customer_review_required',
    ready: requirements.length > 0 && items.every(item => item.status === 'ready' || item.status === 'not_applicable'), items, findings,
    disclaimer: 'Legal-companion readiness only. This does not establish agency acceptance, legal advice, full Module 1 completeness or cryptographic signature validity. Other filing and dispatch gates remain separate.' };
}
export async function readCompanyLegalReadiness(req: Request, sequenceId: number): Promise<CompanyLegalReadinessResponse> {
  const ctx = await context(req);
  const target = await readSubmissionSequenceForRequest(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId }, sequenceId);
  const country = canonicalRegionOf(target.sequenceRegion);
  const agency = country ? toAgency(country) : null;
  if (!country || !agency) throw new CompanyDocumentsError(422, 'MARKET_UNKNOWN', 'Record the filing market before evaluating company legal documents.');
  const saved = await readCompanyDocumentProfile(req);
  const profile = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q);
  const documents = saved.data.legalDocuments.filter(item => item.programId === target.programId);
  const evidenceRefusals: Record<string, string | null> = {};
  for (const document of documents) {
    try { evidenceRefusals[document.id] = await companyLegalEvidenceRefusal(ctx.q, ctx, document); }
    catch (error) { if (error instanceof CompanyDocumentsError && error.status === 409) evidenceRefusals[document.id] = error.message; else throw error; }
  }
  const placements = await ctx.q.query(`SELECT l.document_uuid::text AS document_id,l.document_content_sha256 AS content_hash,l.section_code,l.lifecycle_op
    FROM submission_leaves l WHERE l.organization_id=$1 AND l.sequence_id=$2 AND l.deleted_at IS NULL AND l.document_table='vault_documents'`, [ctx.organizationId, target.sequenceId]);
  const result = assessCompanyLegalReadiness({ target: { programId: target.programId, submissionId: target.submissionId, sequenceId: target.sequenceId,
    country, agency, submissionType: target.applicationType }, documents, evidenceRefusals,
    requirements: profile.legalRequirements ?? [], placements: placements.rows.map(row => ({ documentId: String(row.document_id), contentHash: String(row.content_hash), sectionCode: String(row.section_code), operation: String(row.lifecycle_op) })) });
  await requireSubmissionReadStillCurrent(ctx.q, target);
  return result;
}
