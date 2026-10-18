import { Router } from 'express';
import { z } from 'zod';
import { companyDocumentsFailure, context, writeProfile } from '../services/company-documents/profile';
import { readCompanyPresentationRevision } from '../services/company-documents/history';
import { CompanyDocumentsError, parseCompanyInput } from '../services/company-documents/validation';
import { readCurrentProgramActor } from '../services/c2c/current-program-access';
import { writeChainedAuditRow } from '../services/auditService';

const router = Router();
router.put('/branding-policy', async (req, res) => {
  try {
    await context(req, 'permissions');
    const input = parseCompanyInput(z.object({ expectedRevision: z.number().int().nonnegative(),
      requireIndependentReview: z.boolean(), reason: z.string().trim().min(8).max(2000) }).strict(), req.body);
    res.json(await writeProfile(req, input.expectedRevision, input.reason, current => ({ ...current,
      brandingApprovalRequired: input.requireIndependentReview,
    }), { capability: 'permissions' }));
  } catch (error) { const failure = companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
router.get('/permissions', async (req, res) => {
  try {
    const ctx = await context(req, 'permissions');
    const { rows } = await ctx.q.query(`SELECT ou.user_id,u.name,u.email,ou.role,
      COALESCE(g.manage_brand,false) AS manage_brand,COALESCE(g.manage_legal,false) AS manage_legal
      FROM organization_users ou JOIN users u ON u.id=ou.user_id
      LEFT JOIN company_document_grants g ON g.organization_id=ou.organization_id AND g.user_id=ou.user_id
      WHERE ou.organization_id=$1 AND u.status='active' ORDER BY u.name,u.id`, [ctx.organizationId]);
    res.json({ data: rows });
  } catch (error) { const failure = companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
router.put('/permissions/:userId', async (req, res) => {
  try {
    const userId = parseCompanyInput(z.coerce.number().int().positive(), req.params.userId);
    const input = parseCompanyInput(z.object({ manageBrand: z.boolean(), manageLegal: z.boolean(), reason: z.string().trim().min(8).max(2000) }).strict(), req.body);
    const ctx = await context(req, 'permissions');
    await ctx.q.query('BEGIN');
    try {
      await ctx.q.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [ctx.organizationId]);
      await context(req, 'permissions', true);
      const target = await readCurrentProgramActor(ctx.q, { organizationId: ctx.organizationId, userId, forShare: true });
      if (['owner', 'admin'].includes(target.role)) throw new CompanyDocumentsError(409, 'ADMIN_COMPANY_RIGHTS_INHERITED', 'Owners and administrators inherit company-document rights through their organization role.');
      await ctx.q.query(`INSERT INTO company_document_grants (organization_id,user_id,manage_brand,manage_legal,updated_by)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id,user_id) DO UPDATE
        SET manage_brand=excluded.manage_brand,manage_legal=excluded.manage_legal,updated_by=excluded.updated_by,updated_at=now()`,
      [ctx.organizationId, userId, input.manageBrand, input.manageLegal, ctx.userId]);
      await writeChainedAuditRow(ctx.q, { tenantId: ctx.organizationId, userId: ctx.userId,
        action: 'company_documents.permissions_changed', resourceType: 'company_document_grant', resourceId: String(userId),
        reason: input.reason, details: { targetUserId: userId, manageBrand: input.manageBrand, manageLegal: input.manageLegal } });
      await ctx.q.query('COMMIT');
    } catch (error) { await ctx.q.query('ROLLBACK').catch(() => undefined); throw error; }
    res.json({ success: true, userId, manageBrand: input.manageBrand, manageLegal: input.manageLegal });
  } catch (error) { const failure = companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
router.get('/revisions', async (req, res) => {
  try {
    const ctx = await context(req, 'brand');
    const limit = parseCompanyInput(z.coerce.number().int().min(1).max(100).default(25), req.query.limit);
    const before = parseCompanyInput(z.coerce.number().int().nonnegative().optional(), req.query.before);
    const { rows } = await ctx.q.query(`SELECT revision,sha256,created_by,created_at,reason FROM company_document_revisions
      WHERE organization_id=$1 AND variant_id='00000000-0000-0000-0000-000000000000'
      AND ($2::integer IS NULL OR revision<$2) ORDER BY revision DESC LIMIT $3`, [ctx.organizationId, before ?? null, limit]);
    res.json({ data: rows, nextBefore: rows.length === limit ? rows.at(-1)?.revision : null });
  } catch (error) { const failure = companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
router.get('/revisions/:revision', async (req, res) => {
  try {
    const ctx = await context(req, 'brand');
    const revision = parseCompanyInput(z.coerce.number().int().nonnegative(), req.params.revision);
    res.json({ data: await readCompanyPresentationRevision(ctx.q, ctx.organizationId, revision) });
  } catch (error) { const failure = companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
router.post('/revisions/:revision/restore', async (req, res) => {
  try {
    const ctx = await context(req, 'brand');
    const revision = parseCompanyInput(z.coerce.number().int().nonnegative(), req.params.revision);
    const input = parseCompanyInput(z.object({ expectedRevision: z.number().int().nonnegative(), reason: z.string().trim().min(8).max(2000) }).strict(), req.body);
    const restored = await readCompanyPresentationRevision(ctx.q, ctx.organizationId, revision);
    const result = await writeProfile(req, input.expectedRevision, input.reason, current => ({ ...current,
      companyName: restored.companyName, address: restored.address, contact: restored.contact,
      registrationDetails: restored.registrationDetails, letterhead: restored.letterhead,
      importedFrom: restored.importedFrom, brandingAdopted: true,
    }), { capability: 'brand' });
    res.json(result);
  } catch (error) { const failure = companyDocumentsFailure(error); res.status(failure.status).json({ error: failure.code, message: failure.message }); }
});
export default router;
