/** Filing correspondence uses the existing Authoring creator, renderer and review/Vault path. */
import type { Request } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requestPgClient, type RequestSqlClient } from '../../db/requestDb';
import { governedActorId } from '../../middleware/orgMembership';
import { authedOrgId, usableOrgId } from '../../utils/authedOrgId';
import { canonicalRegionOf, toAgency } from '../../../shared/regulatory/region-identity';
import type { CompanyDocumentProfile } from '../../../shared/company-documents';
import type { CompanyCorrespondenceOrigin } from '../../../shared/company-correspondence';
import { readSubmissionSequenceForRequest, requireSubmissionReadStillCurrent } from '../submission-service/submission-request-read';
import { readSubmissionPackageIdentity, recordedPackageIdentitySnapshot } from '../ectd/package-identity';
import { readCurrentProgramActor } from '../c2c/current-program-access';
import { createDocumentFromDraft } from '../authoring/authoring-from-draft';
import { companyProfileHash, loadCompanyDocumentProfile, readCompanyDocumentProfile, CompanyDocumentsError } from './profile';
import { governedReason } from '../../routes/governed-reason';
import { parseCompanyInput } from './validation';
import { retainCompanyPresentationRevision } from './history';
import { readPublishedCompanyVariant } from './designs';

export const correspondenceDraftSchema = z.object({ sequenceId: z.number().int().positive(),
  variantId: z.string().uuid().optional(), title: z.string().trim().min(1).max(300), paragraphs: z.array(z.string().max(10000)).max(100).default([]), reason: governedReason }).strict();

function actor(req: Request) {
  const organizationId = usableOrgId(authedOrgId(req)), userId = governedActorId(req);
  if (!organizationId || !userId) throw new CompanyDocumentsError(403, 'AUTH_REQUIRED', 'An authenticated organization member is required.');
  return { organizationId, userId };
}

async function admittedOrigin(q: RequestSqlClient, principal: ReturnType<typeof actor>, sequenceId: number, profile: CompanyDocumentProfile) {
  const admitted = await readSubmissionSequenceForRequest(q, principal, sequenceId);
  const country = canonicalRegionOf(admitted.sequenceRegion);
  if (!country) throw new CompanyDocumentsError(422, 'MARKET_UNKNOWN', 'Identify the recorded filing market before preparing correspondence.');
  const records = await q.query(`SELECT s.title,e.sequence_number FROM submissions s JOIN ectd_sequences e ON e.submission_id=s.id AND e.organization_id=s.organization_id
    WHERE s.id=$1 AND e.id=$2 AND s.organization_id=$3 AND s.deleted_at IS NULL AND e.deleted_at IS NULL`,
  [admitted.submissionId, admitted.sequenceId, principal.organizationId]);
  const row = records.rows[0];
  if (records.rows.length !== 1 || typeof row?.title !== 'string' || typeof row.sequence_number !== 'string') {
    throw new CompanyDocumentsError(503, 'CORRESPONDENCE_CONTEXT_UNAVAILABLE', 'The recorded correspondence identity could not be verified.');
  }
  const identity = await readSubmissionPackageIdentity(q, principal.organizationId, admitted.submissionId, { region: admitted.sequenceRegion });
  if (identity.programId !== admitted.programId) throw new CompanyDocumentsError(409, 'CORRESPONDENCE_CONTEXT_CHANGED', 'The recorded filing project changed. Refresh before preparing correspondence.');
  await requireSubmissionReadStillCurrent(q, admitted);
  const agency = toAgency(country);
  if (!agency) throw new CompanyDocumentsError(422, 'AGENCY_UNKNOWN', 'Identify the recorded filing agency before preparing correspondence.');
  const origin: CompanyCorrespondenceOrigin = { version: 1, organizationId: principal.organizationId, programId: admitted.programId, projectId: admitted.projectId,
    submissionId: admitted.submissionId, sequenceId, sequenceNumber: row.sequence_number, submissionTitle: row.title,
    applicationType: admitted.applicationType, applicationNumber: identity.applicationNumber,
    applicantName: country === 'US' && !identity.applicantSponsorId ? null : identity.applicantName,
    country, agency, recipient: { authority: agency, basis: 'recorded_filing_market' },
    companyDocumentRevision: profile.revision, companyProfileHash: companyProfileHash(profile),
    companyBrandingApplied: Boolean(profile.variantId || profile.applyToSubmissionCorrespondence),
    ...(profile.variantId ? { variantId: profile.variantId, explicitSelection: true as const } : {}) };
  return { origin, packageIdentity: recordedPackageIdentitySnapshot(identity) };
}

async function selectedPresentation(q: RequestSqlClient, principal: ReturnType<typeof actor>, sequenceId: number, profile: CompanyDocumentProfile, variantId?: string) {
  if (!variantId) return profile;
  const admitted = await readSubmissionSequenceForRequest(q, principal, sequenceId);
  const market = canonicalRegionOf(admitted.sequenceRegion);
  if (!market) throw new CompanyDocumentsError(422, 'MARKET_UNKNOWN', 'The recorded filing market is required to select stationery.');
  const variant = await readPublishedCompanyVariant(q, principal.organizationId, variantId, { userId: principal.userId, programId: admitted.programId, market });
  await requireSubmissionReadStillCurrent(q, admitted);
  return variant;
}

/** Caller supplies only a sequence ID; every filing fact is read through current admission. */
export async function prepareSubmissionCorrespondence(req: Request, sequenceId: number, profile: CompanyDocumentProfile, variantId?: string) {
  const principal = actor(req), q = requestPgClient(req);
  const presentation = await selectedPresentation(q, principal, sequenceId, profile, variantId);
  const retained = await admittedOrigin(q, principal, sequenceId, presentation);
  return { origin: retained.origin, profile: presentation, async assertCurrent(executor: RequestSqlClient = q) {
    const currentProfile = await selectedPresentation(executor, principal, sequenceId,
      variantId ? presentation : await loadCompanyDocumentProfile(principal.organizationId, executor), variantId);
    const current = await admittedOrigin(executor, principal, sequenceId, currentProfile);
    if (JSON.stringify(current) !== JSON.stringify(retained)) {
      throw new CompanyDocumentsError(409, 'CORRESPONDENCE_CONTEXT_CHANGED', 'The company presentation or filing identity changed. Refresh before preparing this correspondence.');
    }
    if (!variantId) await retainCompanyPresentationRevision(executor, principal.organizationId, currentProfile, principal.userId, 'Retain company presentation used by filing correspondence');
  } };
}

export function correspondenceFilingParagraphs(origin: CompanyCorrespondenceOrigin) {
  return [`To: ${origin.recipient.authority}`, `Applicant of record: ${origin.applicantName ?? 'Not recorded — resolve before filing'}`,
    `Application: ${origin.applicationType.toUpperCase()} · ${origin.applicationNumber ?? 'Agency application number not recorded'}`,
    `Submission: ${origin.submissionTitle} · sequence ${origin.sequenceNumber} · ${origin.country}`];
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export async function createSubmissionCorrespondenceDraft(req: Request, body: unknown) {
  const input = parseCompanyInput(correspondenceDraftSchema, body);
  const principal = actor(req), q = requestPgClient(req);
  const saved = await readCompanyDocumentProfile(req, false);
  const context = await prepareSubmissionCorrespondence(req, input.sequenceId, saved.data, input.variantId);
  const currentActor = await readCurrentProgramActor(q, principal);
  const paragraphs = [...correspondenceFilingParagraphs(context.origin), ...(input.paragraphs ?? []),
    'Draft correspondence: review facts and content, complete the established review and approval workflow, then file the approved PDF explicitly from Vault.'];
  const outcome = await createDocumentFromDraft({ pool, tenantId: principal.organizationId,
    actor: { id: String(principal.userId), email: typeof req.user?.email === 'string' ? req.user.email.toLowerCase() : null },
    audit: { pool, tenantId: principal.organizationId, actorId: String(principal.userId), actorRole: currentActor.role,
      actorEmail: typeof req.user?.email === 'string' ? req.user.email : 'unknown', ipAddress: req.ip ?? 'unknown', userAgent: req.headers['user-agent'] ?? 'unknown' } },
  { programId: context.origin.programId, title: input.title, module: 'M1', documentType: 'company_correspondence',
    sections: [{ code: 'correspondence', title: input.title, content: paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join('') }],
    provenance: { source: 'seed', note: 'Company correspondence working draft. Filing identity and company revision are server-verified; content requires human review.' } },
  { changeReason: input.reason, companyCorrespondence: { origin: context.origin, reserve: context.assertCurrent } });
  if (outcome.kind === 'refused') throw new CompanyDocumentsError(outcome.status, outcome.code ?? 'CORRESPONDENCE_DRAFT_REFUSED', outcome.error);
  return { authoringDocId: String(outcome.document.id), programId: context.origin.programId, submissionId: context.origin.submissionId,
    sequenceId: context.origin.sequenceId, companyDocumentRevision: context.origin.companyDocumentRevision,
    companyProfileHash: context.origin.companyProfileHash, documentStatus: 'draft' as const, filedInVault: false as const,
    ...(context.origin.variantId ? { variantId: context.origin.variantId } : {}),
    message: 'Correspondence saved as an Authoring draft. Review and approve it through the existing workflow before explicitly filing its PDF in Vault.' };
}
