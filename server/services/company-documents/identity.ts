import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { canonicalRegionOf, toAgency } from '../../../shared/regulatory/region-identity';
import { readSubmissionSequenceForRequest, requireSubmissionReadStillCurrent } from '../submission-service/submission-request-read';
import { writeChainedAuditRow } from '../auditService';
import { context, loadCompanyDocumentProfile } from './profile';
import { companyProfileHash } from './provenance';
import { CompanyDocumentsError, parseCompanyInput } from './validation';
import { readPublishedCompanyVariant } from './designs';

const normalized = (value: string) => value.normalize('NFKC').trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase('en');
const recordedText = (value: unknown): string | null => typeof value === 'string' ? value : null;
export function compareCompanyFilingIdentity(company: { companyName: string; address: string }, filing: { applicantName: string | null; sponsorAddress: string | null }) {
  const differences: Array<{ field: 'name' | 'address'; companyValue: string; filingValue: string | null; missing: boolean }> = [];
  for (const [field, companyValue, filingValue] of [
    ['name', company.companyName, filing.applicantName], ['address', company.address, filing.sponsorAddress],
  ] as const) {
    if (!companyValue.trim() || !filingValue?.trim() || normalized(companyValue) !== normalized(filingValue)) {
      differences.push({ field, companyValue, filingValue, missing: !companyValue.trim() || !filingValue?.trim() });
    }
  }
  return differences;
}
export async function readCompanyFilingIdentity(req: Request, sequenceId: number, variantId?: string) {
  const ctx = await context(req);
  const target = await readSubmissionSequenceForRequest(ctx.q, ctx, sequenceId);
  const { rows } = await ctx.q.query(`SELECT o.name AS applicant_name,p.sponsor_address,p.application_number
    FROM organizations o JOIN regulatory_programs p ON p.organization_id=o.id
    WHERE o.id=$1 AND p.id=$2 AND p.deleted_at IS NULL`, [ctx.organizationId, target.programId]);
  if (rows.length !== 1) throw new CompanyDocumentsError(409, 'FILING_IDENTITY_UNAVAILABLE', 'The recorded filing identity could not be verified.');
  const country = canonicalRegionOf(target.sequenceRegion);
  const profile = variantId ? await readPublishedCompanyVariant(ctx.q, ctx.organizationId, variantId,
    { userId: ctx.userId, programId: target.programId, market: country })
    : await loadCompanyDocumentProfile(ctx.organizationId, ctx.q, false);
  const filing = { applicantName: recordedText(rows[0].applicant_name),
    sponsorAddress: recordedText(rows[0].sponsor_address),
    applicationNumber: recordedText(rows[0].application_number),
    programId: target.programId, submissionId: target.submissionId, sequenceId: target.sequenceId,
    applicationType: target.applicationType, country, agency: country ? toAgency(country) : null };
  const profileHash = companyProfileHash(profile);
  // Bind the review to the selected presentation, even when two variants have
  // identical visual content and revision numbers. The profile hash describes
  // content; the filing-context hash also records which presentation was chosen.
  const filingHash = createHash('sha256').update(JSON.stringify({ filing,
    presentationVariantId: profile.variantId ?? null })).digest('hex');
  const differences = compareCompanyFilingIdentity(profile, filing);
  const reviews = await ctx.q.query(`SELECT company_role,reason,reviewed_by,reviewed_at FROM company_document_identity_reviews
    WHERE organization_id=$1 AND sequence_id=$2 AND profile_sha256=$3 AND filing_sha256=$4
    ORDER BY reviewed_at DESC,id DESC LIMIT 1`, [ctx.organizationId, target.sequenceId, profileHash, filingHash]);
  await requireSubmissionReadStillCurrent(ctx.q, target);
  const review = reviews.rows[0] ?? null;
  const unresolvedFields = [!country && 'filing market', !filing.applicationNumber?.trim() && 'application number'].filter(Boolean);
  const status = differences.some(difference => difference.missing) || unresolvedFields.length ? 'unresolved'
    : !differences.length ? 'consistent' : review ? 'reviewed_difference' : 'needs_review';
  return { ctx, target, profile, data: { sequenceId: target.sequenceId, profileRevision: profile.revision,
    variantId: profile.variantId ?? null,
    profileHash, filingHash, filing, differences, unresolvedFields, review, status,
    explanation: 'Company presentation is compared with recorded filing facts. A reviewed role difference does not change the applicant, sponsor or agency records.' } };
}
const reviewSchema = z.object({ sequenceId: z.number().int().positive(), expectedRevision: z.number().int().nonnegative(),
  variantId: z.string().uuid().optional(),
  profileHash: z.string().regex(/^[a-f0-9]{64}$/), filingHash: z.string().regex(/^[a-f0-9]{64}$/),
  companyRole: z.enum(['sponsor', 'applicant', 'legal_manufacturer', 'local_representative', 'parent_brand']),
  reason: z.string().trim().min(8).max(2000) }).strict();
export async function reviewCompanyFilingIdentity(req: Request, body: unknown) {
  const input = parseCompanyInput(reviewSchema, body);
  const ctx = await context(req, 'legal');
  await ctx.q.query('BEGIN');
  try {
    await ctx.q.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [ctx.organizationId]);
    await context(req, 'legal', true);
    const current = await readCompanyFilingIdentity(req, input.sequenceId, input.variantId);
    if (current.profile.revision !== input.expectedRevision || current.data.profileHash !== input.profileHash || current.data.filingHash !== input.filingHash) {
      throw new CompanyDocumentsError(409, 'FILING_IDENTITY_CHANGED', 'The company or filing identity changed. Review the current comparison before recording the role difference.');
    }
    if (current.data.status === 'unresolved') throw new CompanyDocumentsError(422, 'FILING_IDENTITY_INCOMPLETE', 'Complete the missing company and filing identity before acknowledging a role difference.');
    const result = await ctx.q.query(`INSERT INTO company_document_identity_reviews
      (organization_id,sequence_id,profile_revision,profile_sha256,filing_sha256,company_role,reason,reviewed_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [ctx.organizationId, current.target.sequenceId, current.profile.revision, input.profileHash, input.filingHash, input.companyRole, input.reason, ctx.userId]);
    await writeChainedAuditRow(ctx.q, { tenantId: ctx.organizationId, userId: ctx.userId,
      action: 'company_documents.identity_review', resourceType: 'submission_sequence', resourceId: String(current.target.sequenceId),
      reason: input.reason, details: { reviewId: result.rows[0].id, profileRevision: current.profile.revision,
        profileHash: input.profileHash, filingHash: input.filingHash, companyRole: input.companyRole, variantId: current.profile.variantId ?? null } });
    await requireSubmissionReadStillCurrent(ctx.q, current.target);
    await ctx.q.query('COMMIT');
    return (await readCompanyFilingIdentity(req, input.sequenceId, input.variantId)).data;
  } catch (error) { await ctx.q.query('ROLLBACK').catch(() => undefined); throw error; }
}
