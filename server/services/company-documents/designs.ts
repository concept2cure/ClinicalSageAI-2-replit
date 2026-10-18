import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import type { CompanyDocumentProfile, CompanyDocumentsResponse } from '../../../shared/company-documents';
import type { CompanyDesignCandidate, CompanyDesignDetail, CompanyDesignScope, CompanyDesignState,
  CompanyDesignSummary, CompanyVariantContext, CompanyDefaultDesignApproval } from '../../../shared/company-document-designs';
import { stableStringify } from '../../../shared/canonical-json';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';
import type { RequestSqlClient } from '../../db/requestDb';
import { governedReason } from '../../routes/governed-reason';
import { writeChainedAuditRow } from '../auditService';
import { getCurrentAccessibleProgramScope, readCurrentProgramActor, requireCurrentProgramAccess, requireProgramScopeStillCurrent } from '../c2c/current-program-access';
import { createTemplateInTransaction, getTemplate } from '../templates/templateStore';
import { readSubmissionSequenceForRequest } from '../submission-service/submission-request-read';
import { context, loadCompanyDocumentProfile, writeProfile } from './profile';
import { companyProfileHash } from './provenance';
import { readCompanyPresentationRevision, retainCompanyVariantPresentation } from './history';
import { CompanyDocumentsError, assertCompanyRevision, parseCompanyInput, profileUpdateSchema, validateCompanyLetterhead } from './validation';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const revisionSchema = z.number().int().nonnegative();
const candidateSchema = profileUpdateSchema.pick({ companyName: true, address: true, contact: true,
  registrationDetails: true, letterhead: true, importedFrom: true, applyToReports: true, applyToSubmissionCorrespondence: true });
const scopeSchema = z.object({ programId: z.string().uuid().nullable().default(null),
  market: z.string().trim().min(1).max(50).nullable().default(null),
  language: z.string().trim().min(1).max(50).nullable().default(null),
  subsidiary: z.string().trim().min(1).max(300).nullable().default(null) }).strict();
export const stageCompanyDesignSchema = z.object({ expectedRevision: revisionSchema, reason: governedReason,
  name: z.string().trim().min(1).max(200), scope: scopeSchema, candidate: candidateSchema }).strict();
export const reviewCompanyDesignSchema = z.object({ expectedHash: hashSchema, reason: governedReason }).strict();
export const publishCompanyDesignSchema = reviewCompanyDesignSchema.extend({ expectedRevision: revisionSchema }).strict();
export const activateCompanyDefaultDesignSchema = publishCompanyDesignSchema.extend({
  applyToReports: z.boolean(), applyToSubmissionCorrespondence: z.boolean(),
}).strict();

type DesignIdentity = Omit<CompanyDesignCandidate, 'letterhead'>;
interface DesignRow extends Record<string, unknown> {
  id: string; organization_id: number; template_id: string; name: string;
  program_id: string | null; market: CompanyDesignScope['market']; language: string | null; subsidiary: string | null;
  identity: DesignIdentity; sha256: string; state: CompanyDesignState; created_by: number; created_at: string | Date;
  reviewed_by: number | null; reviewed_at: string | Date | null; published_by: number | null; published_at: string | Date | null;
  published_revision: number | null; published_profile_hash: string | null;
}
type DesignContext = Awaited<ReturnType<typeof context>>;
const stamp = (value: string | Date | null) => value instanceof Date ? value.toISOString() : value;
function fail(code: string, message: string, status = 409): never { throw new CompanyDocumentsError(status, code, message); }
const scopeOf = (row: DesignRow): CompanyDesignScope => ({ programId: row.program_id, market: row.market, language: row.language, subsidiary: row.subsidiary });

function summary(row: DesignRow): CompanyDesignSummary {
  return { id: row.id, name: row.name, templateId: row.template_id, scope: scopeOf(row), state: row.state,
    sha256: row.sha256, createdBy: row.created_by, createdAt: stamp(row.created_at)!,
    reviewedBy: row.reviewed_by, reviewedAt: stamp(row.reviewed_at), publishedBy: row.published_by,
    publishedAt: stamp(row.published_at), publishedRevision: row.published_revision, publishedProfileHash: row.published_profile_hash };
}
export function companyDesignCandidate(profile: CompanyDocumentProfile): CompanyDesignCandidate {
  return { companyName: profile.companyName, address: profile.address, contact: profile.contact,
    registrationDetails: profile.registrationDetails, letterhead: profile.letterhead, importedFrom: profile.importedFrom,
    applyToReports: profile.applyToReports, applyToSubmissionCorrespondence: profile.applyToSubmissionCorrespondence };
}
export function companyDesignHash(name: string, scope: CompanyDesignScope, candidate: CompanyDesignCandidate): string {
  return createHash('sha256').update(stableStringify({ version: 1, name, scope, candidate })).digest('hex');
}

function detail(row: DesignRow, candidate: CompanyDesignCandidate, current: CompanyDocumentProfile, ctx: DesignContext): CompanyDesignDetail {
  const saved = companyDesignCandidate(current);
  const changedFields = (Object.keys(saved) as Array<keyof CompanyDesignCandidate>).filter(key => stableStringify(saved[key]) !== stableStringify(candidate[key]));
  const reviewBlocker = !ctx.capabilities.manageBrand ? 'Company brand management permission is required.'
    : row.state !== 'draft' ? 'Only a draft design can be reviewed.'
    : row.created_by === ctx.userId ? 'A different company brand manager must review the design.' : null;
  const publishBlocker = !ctx.capabilities.manageBrand ? 'Company brand management permission is required.'
    : row.state !== 'reviewed' ? 'The exact design must be independently reviewed before publication.' : null;
  const activationBlocker = !ctx.capabilities.manageBrand ? 'Company brand management permission is required.'
    : row.state !== 'published' ? 'Publish the independently reviewed design before activating it as the organization default.'
    : Object.values(scopeOf(row)).some(value => value !== null) ? 'Only an unrestricted organization-wide design can become the organization default.'
    : null;
  return { design: summary(row), candidate, changedFields, canReview: reviewBlocker === null,
    canPublish: publishBlocker === null, reviewBlocker, publishBlocker,
    canActivateDefault: activationBlocker === null, activationBlocker };
}

function normalizedScope(input: z.infer<typeof scopeSchema>): CompanyDesignScope {
  const market = input.market ? canonicalRegionOf(input.market) ?? null : null;
  if (input.market && !market) fail('COMPANY_DESIGN_MARKET_UNKNOWN', 'Select a recognized filing market or leave this variant unrestricted.', 400);
  let language: string | null = null;
  try { language = input.language ? Intl.getCanonicalLocales(input.language)[0] : null; }
  catch { fail('COMPANY_DESIGN_LANGUAGE_INVALID', 'Use a valid language tag such as en, fr-CA or ja.', 400); }
  return { programId: input.programId?.toLowerCase() ?? null, market, language, subsidiary: input.subsidiary };
}

async function admitScope(q: RequestSqlClient, ctx: Pick<DesignContext, 'organizationId' | 'userId'>, scope: CompanyDesignScope, forShare = false) {
  if (scope.programId) await requireCurrentProgramAccess(q, { organizationId: ctx.organizationId, userId: ctx.userId,
    programId: scope.programId, ...(forShare ? { forShare: true } : {}) });
}

async function readRow(q: RequestSqlClient, organizationId: number, id: string, lock = false): Promise<DesignRow> {
  const { rows } = await q.query(`SELECT * FROM company_document_designs WHERE id=$1::uuid AND organization_id=$2${lock ? ' FOR UPDATE' : ''}`, [id, organizationId]);
  if (rows.length !== 1) fail('COMPANY_DESIGN_NOT_FOUND', 'The company design was not found.', 404);
  return rows[0] as DesignRow;
}

async function readCandidate(q: RequestSqlClient, row: DesignRow, lock = false): Promise<CompanyDesignCandidate> {
  let candidate: CompanyDesignCandidate;
  if (row.state === 'published') {
    if (!row.published_revision) fail('COMPANY_DESIGN_UNVERIFIED', 'The published company design has no retained presentation reference.');
    const profile = await readCompanyPresentationRevision(q, row.organization_id, row.published_revision, row.id);
    if (companyProfileHash(profile) !== row.published_profile_hash) fail('COMPANY_DESIGN_UNVERIFIED', 'The retained company design does not match its publication hash.');
    candidate = companyDesignCandidate(profile);
  } else {
    const template = await getTemplate(row.organization_id, row.template_id, q, lock);
    if (!template) fail('COMPANY_DESIGN_TEMPLATE_UNAVAILABLE', 'The canonical template for this design is unavailable. Stage a new design before continuing.');
    candidate = { ...row.identity, letterhead: template.spec };
  }
  if (companyDesignHash(row.name, scopeOf(row), candidate) !== row.sha256) {
    fail('COMPANY_DESIGN_CHANGED', 'The design differs from the exact version submitted for review. Stage a new design before continuing.');
  }
  return candidate;
}

async function transaction<T>(req: Request, expectedRevision: number | undefined, work: (ctx: DesignContext, profile: CompanyDocumentProfile) => Promise<T>): Promise<T> {
  const ctx = await context(req, 'brand');
  await ctx.q.query('BEGIN');
  try {
    const lock = await ctx.q.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [ctx.organizationId]);
    if (lock.rows.length !== 1) fail('ORGANIZATION_NOT_FOUND', 'Organization not found.', 404);
    const current = await context(req, 'brand', true);
    const profile = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q, false);
    if (expectedRevision !== undefined) assertCompanyRevision(profile, expectedRevision);
    const result = await work(current, profile);
    await ctx.q.query('COMMIT');
    return result;
  } catch (error) {
    await ctx.q.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function auditDesign(ctx: DesignContext, action: string, row: DesignRow, reason: string) {
  await writeChainedAuditRow(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId,
    action: `company_documents.design_${action}`, resourceType: 'company_document_design', resourceId: row.id,
    reason, details: { designId: row.id, templateId: row.template_id, sha256: row.sha256, state: row.state,
      programId: row.program_id, publishedRevision: row.published_revision, publishedProfileHash: row.published_profile_hash } });
}

export async function stageCompanyDesign(req: Request, body: unknown): Promise<CompanyDesignDetail> {
  await context(req, 'brand');
  const input = parseCompanyInput(stageCompanyDesignSchema, body);
  const scope = normalizedScope(input.scope);
  const letterhead = await validateCompanyLetterhead(input.candidate.letterhead);
  letterhead.brand.organizationName = input.candidate.companyName;
  const candidate = { ...input.candidate, letterhead };
  return transaction(req, input.expectedRevision, async (ctx, profile) => {
    await admitScope(ctx.q, ctx, scope, true);
    const template = await createTemplateInTransaction(ctx.q, { orgId: ctx.organizationId, userId: ctx.userId,
      name: input.name, projectId: scope.programId, spec: candidate.letterhead, verified: false }, input.reason);
    const identity: DesignIdentity = { companyName: candidate.companyName, address: candidate.address,
      contact: candidate.contact, registrationDetails: candidate.registrationDetails, importedFrom: candidate.importedFrom,
      applyToReports: candidate.applyToReports, applyToSubmissionCorrespondence: candidate.applyToSubmissionCorrespondence };
    const { rows } = await ctx.q.query(`INSERT INTO company_document_designs
      (id,organization_id,template_id,name,program_id,market,language,subsidiary,identity,sha256,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *`,
    [randomUUID(), ctx.organizationId, template.id, input.name, scope.programId, scope.market, scope.language,
      scope.subsidiary, JSON.stringify(identity), companyDesignHash(input.name, scope, candidate), ctx.userId]);
    const row = rows[0] as DesignRow;
    await auditDesign(ctx, 'staged', row, input.reason);
    return detail(row, candidate, profile, ctx);
  });
}

export async function reviewCompanyDesign(req: Request, id: string, body: unknown): Promise<CompanyDesignDetail> {
  const input = parseCompanyInput(reviewCompanyDesignSchema, body);
  return transaction(req, undefined, async (ctx, profile) => {
    const row = await readRow(ctx.q, ctx.organizationId, id, true);
    await admitScope(ctx.q, ctx, scopeOf(row), true);
    if (row.state !== 'draft') fail('COMPANY_DESIGN_STATE', 'Only a draft design can be reviewed.');
    if (row.created_by === ctx.userId) fail('COMPANY_DESIGN_INDEPENDENT_REVIEW', 'A different company brand manager must review this design.', 403);
    if (input.expectedHash !== row.sha256) fail('COMPANY_DESIGN_REVIEW_STALE', 'Reload the exact design proof before reviewing it.');
    const candidate = await readCandidate(ctx.q, row, true);
    const { rows } = await ctx.q.query(`UPDATE company_document_designs SET state='reviewed',reviewed_by=$3,reviewed_at=now()
      WHERE id=$1 AND organization_id=$2 AND state='draft' RETURNING *`, [id, ctx.organizationId, ctx.userId]);
    if (rows.length !== 1) fail('COMPANY_DESIGN_STATE', 'The design state changed. Reload it before continuing.');
    const reviewed = rows[0] as DesignRow;
    await auditDesign(ctx, 'reviewed', reviewed, input.reason);
    return detail(reviewed, candidate, profile, ctx);
  });
}

export async function publishCompanyDesign(req: Request, id: string, body: unknown): Promise<CompanyDesignDetail> {
  const input = parseCompanyInput(publishCompanyDesignSchema, body);
  return transaction(req, input.expectedRevision, async (ctx, current) => {
    const row = await readRow(ctx.q, ctx.organizationId, id, true);
    await admitScope(ctx.q, ctx, scopeOf(row), true);
    if (row.state !== 'reviewed' || !row.reviewed_by || row.reviewed_by === row.created_by) {
      fail('COMPANY_DESIGN_NOT_REVIEWED', 'An independent brand manager must review the exact design before publication.');
    }
    if (input.expectedHash !== row.sha256) fail('COMPANY_DESIGN_REVIEW_STALE', 'The publication request does not match the reviewed design hash.');
    const candidate = await readCandidate(ctx.q, row, true);
    const published: CompanyDocumentProfile = { version: 1, revision: 1, variantId: row.id, ...candidate,
      brandingAdopted: true, legalDocuments: [] };
    await retainCompanyVariantPresentation(ctx.q, { organizationId: ctx.organizationId, profile: published,
      userId: ctx.userId, reason: input.reason, variantId: row.id });
    const { rows } = await ctx.q.query(`UPDATE company_document_designs SET state='published',published_by=$3,
      published_at=now(),published_revision=$4,published_profile_hash=$5
      WHERE id=$1 AND organization_id=$2 AND state='reviewed' RETURNING *`,
    [id, ctx.organizationId, ctx.userId, published.revision, companyProfileHash(published)]);
    if (rows.length !== 1) fail('COMPANY_DESIGN_STATE', 'The design state changed. Reload it before continuing.');
    const result = rows[0] as DesignRow;
    await auditDesign(ctx, 'published', result, input.reason);
    return detail(result, candidate, current, ctx);
  });
}

/** Approval follows the presented identity and normalized style across default revisions.
 * Automatic-use preferences and legal-library changes do not alter stationery approval. */
export function companyDefaultPresentationHash(profile: CompanyDocumentProfile): string {
  return companyProfileHash({ ...profile, revision: 0 });
}

/** Internal trusted resolver: callers supply their admitted transaction and organization.
 * Scoped stationery must never be promoted to an unrestricted organization default. */
export async function readApprovedCompanyDefaultDesign(q: RequestSqlClient, organizationId: number,
  designId: string): Promise<CompanyDefaultDesignApproval> {
  if (!z.string().uuid().safeParse(designId).success) {
    fail('COMPANY_DEFAULT_APPROVAL_REQUIRED', 'Activate an independently reviewed, published organization-wide design before requiring default branding approval.');
  }
  const row = await readRow(q, organizationId, designId);
  if (row.state !== 'published' || !row.published_revision || !row.reviewed_by || row.reviewed_by === row.created_by || !row.published_by) {
    fail('COMPANY_DEFAULT_NOT_APPROVED', 'The organization default must reference an independently reviewed and published company design.');
  }
  if (Object.values(scopeOf(row)).some(value => value !== null)) {
    fail('COMPANY_DEFAULT_SCOPED_DESIGN', 'Only an unrestricted organization-wide design can become the organization default.');
  }
  const candidate = await readCandidate(q, row);
  return { designId: row.id, designHash: row.sha256, publishedRevision: row.published_revision,
    presentationHash: companyDefaultPresentationHash({ version: 1, revision: 0, ...candidate, legalDocuments: [] }), candidate };
}

/** Canonical company writers call this inside their organization-locked transaction.
 * The reference and retained presentation are server-verified, never client approval claims. */
export async function validateApprovedCompanyDefault(q: RequestSqlClient, organizationId: number,
  profile: CompanyDocumentProfile): Promise<void> {
  const approved = await readApprovedCompanyDefaultDesign(q, organizationId, profile.approvedDefaultDesignId ?? '');
  if (companyDefaultPresentationHash(profile) !== approved.presentationHash) {
    fail('COMPANY_DEFAULT_APPROVAL_MISMATCH', 'The company identity, logo or letterhead differs from its reviewed default. Publish and explicitly activate the new organization-wide design first.');
  }
}

/** Explicit activation is a canonical default-profile write, separate from publication. */
export async function activateCompanyDefaultDesign(req: Request, id: string, body: unknown): Promise<CompanyDocumentsResponse> {
  const input = parseCompanyInput(activateCompanyDefaultDesignSchema, body);
  const ctx = await context(req, 'brand');
  const approved = await readApprovedCompanyDefaultDesign(ctx.q, ctx.organizationId, id);
  if (approved.designHash !== input.expectedHash) fail('COMPANY_DESIGN_REVIEW_STALE', 'Reload the published design before activating it as the organization default.');
  return writeProfile(req, input.expectedRevision, input.reason, before => {
    const after: CompanyDocumentProfile = { ...before, ...approved.candidate, brandingAdopted: true,
      approvedDefaultDesignId: approved.designId, applyToReports: input.applyToReports,
      applyToSubmissionCorrespondence: input.applyToSubmissionCorrespondence };
    delete after.variantId;
    return after;
  }, { capability: 'brand', beforeCommit: async (q, _before, after) => {
    const current = await readApprovedCompanyDefaultDesign(q, ctx.organizationId, id);
    if (current.designHash !== input.expectedHash || current.presentationHash !== companyDefaultPresentationHash(after)) {
      fail('COMPANY_DESIGN_REVIEW_STALE', 'The published design changed before activation. Reload it before continuing.');
    }
    await validateApprovedCompanyDefault(q, ctx.organizationId, after);
    await writeChainedAuditRow(q, { organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'company_documents.design_default_activated', resourceType: 'company_document_design', resourceId: id,
      reason: input.reason, details: { designId: id, designHash: current.designHash, publishedRevision: current.publishedRevision,
        defaultRevision: after.revision, presentationHash: current.presentationHash,
        applyToReports: after.applyToReports, applyToSubmissionCorrespondence: after.applyToSubmissionCorrespondence } });
  } });
}

export async function readCompanyDesign(req: Request, id: string): Promise<CompanyDesignDetail> {
  const ctx = await context(req);
  const row = await readRow(ctx.q, ctx.organizationId, id);
  await admitScope(ctx.q, ctx, scopeOf(row));
  const candidate = await readCandidate(ctx.q, row);
  const profile = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q, false);
  await context(req);
  await admitScope(ctx.q, ctx, scopeOf(row));
  return detail(row, candidate, profile, ctx);
}

export async function listCompanyDesigns(req: Request, query: unknown) {
  const input = parseCompanyInput(z.object({ state: z.enum(['draft', 'reviewed', 'published']).optional(),
    programId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(25),
    before: z.string().uuid().optional(), sequenceId: z.coerce.number().int().positive().optional() }).strict(), query);
  const ctx = await context(req);
  const access = await getCurrentAccessibleProgramScope(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId });
  if (input.programId) await requireCurrentProgramAccess(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: input.programId });
  const filing = input.sequenceId ? await readSubmissionSequenceForRequest(ctx.q,
    { organizationId: ctx.organizationId, userId: ctx.userId }, input.sequenceId) : null;
  const { rows } = await ctx.q.query(`SELECT d.* FROM company_document_designs d
    WHERE d.organization_id=$1 AND (d.program_id IS NULL OR d.program_id=ANY($2::uuid[]))
      AND ($3::text IS NULL OR d.state=$3) AND ($4::uuid IS NULL OR d.program_id IS NULL OR d.program_id=$4)
      AND ($5::uuid IS NULL OR (d.created_at,d.id)<(SELECT c.created_at,c.id FROM company_document_designs c
        WHERE c.id=$5 AND c.organization_id=$1 AND (c.program_id IS NULL OR c.program_id=ANY($2::uuid[]))))
      AND ($7::uuid IS NULL OR ((d.program_id IS NULL OR d.program_id=$7) AND (d.market IS NULL OR d.market=$8)
        AND d.language IS NULL AND d.subsidiary IS NULL))
    ORDER BY d.created_at DESC,d.id DESC LIMIT $6`,
  [ctx.organizationId, access.programIds, input.state ?? null, input.programId ?? null, input.before ?? null, input.limit + 1,
    filing?.programId ?? null, filing ? canonicalRegionOf(filing.sequenceRegion) : null]);
  const selected = rows.slice(0, input.limit) as DesignRow[];
  await requireProgramScopeStillCurrent(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId }, access);
  return { data: selected.map(summary), nextBefore: rows.length > input.limit ? selected.at(-1)!.id : null };
}

function assertVariantScope(scope: CompanyDesignScope, target: CompanyVariantContext): void {
  if (scope.programId && scope.programId !== target.programId?.toLowerCase()) fail('COMPANY_VARIANT_SCOPE', 'This stationery variant requires its admitted project.');
  if (scope.market && scope.market !== canonicalRegionOf(target.market ?? '')) fail('COMPANY_VARIANT_SCOPE', 'This stationery variant does not match the admitted filing market.');
  if (scope.language && scope.language.toLowerCase() !== target.language?.trim().toLowerCase()) fail('COMPANY_VARIANT_SCOPE', 'Select the recorded language required by this stationery variant.');
  if (scope.subsidiary && scope.subsidiary.toLowerCase() !== target.subsidiary?.trim().toLowerCase()) fail('COMPANY_VARIANT_SCOPE', 'This stationery variant does not match the admitted company entity.');
}

/** Exact selection only. The historical presentation and its reviewed scope are verified independently. */
export async function readPublishedCompanyVariant(q: RequestSqlClient, organizationId: number, id: string,
  target: CompanyVariantContext): Promise<CompanyDocumentProfile> {
  parseCompanyInput(z.string().uuid(), id);
  if (!Number.isSafeInteger(target.userId) || target.userId <= 0) fail('COMPANY_VARIANT_ACTOR_REQUIRED', 'An authenticated organization member must select company stationery.', 403);
  await readCurrentProgramActor(q, { organizationId, userId: target.userId });
  const row = await readRow(q, organizationId, id);
  if (row.state !== 'published' || !row.published_revision) fail('COMPANY_VARIANT_NOT_PUBLISHED', 'This stationery variant has not been independently reviewed and published.');
  assertVariantScope(scopeOf(row), target);
  await admitScope(q, { organizationId, userId: target.userId }, scopeOf(row));
  if (target.programId) await requireCurrentProgramAccess(q, { organizationId, userId: target.userId, programId: target.programId });
  const candidate = await readCandidate(q, row);
  await readCurrentProgramActor(q, { organizationId, userId: target.userId });
  await admitScope(q, { organizationId, userId: target.userId }, scopeOf(row));
  if (target.programId) await requireCurrentProgramAccess(q, { organizationId, userId: target.userId, programId: target.programId });
  return { version: 1, revision: row.published_revision, variantId: row.id, ...candidate, brandingAdopted: true, legalDocuments: [] };
}
