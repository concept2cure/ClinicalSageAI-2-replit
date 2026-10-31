/**
 * The quality records' routes under /api/mdx/qms, mounted by mdx-qms.ts:
 * suppliers, internal audits and nonconforming products (decision P-48).
 *
 *   GET    /api/mdx/qms/suppliers                       list
 *   POST   /api/mdx/qms/suppliers                       create (pending)
 *   PATCH  /api/mdx/qms/suppliers/:id                   update (not the standing)
 *   POST   /api/mdx/qms/suppliers/:id/approval          sign the standing
 *   GET    /api/mdx/qms/internal-audits                 list audits
 *   POST   /api/mdx/qms/internal-audits                 create
 *   PATCH  /api/mdx/qms/internal-audits/:id             update
 *   GET    /api/mdx/qms/nonconforming                   list NC products
 *   POST   /api/mdx/qms/nonconforming                   create
 *   PATCH  /api/mdx/qms/nonconforming/:id/disposition   sign the disposition
 *
 * Moved out of mdx-qms.ts unchanged on 2026-10-29, when that file crossed the
 * repository's file-size ceiling (audit:repo-health:ceiling).
 *
 * @module server/routes/mdx-qms-records
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import { ok, created, clientError, orgRequired, notFoundInTenant, serverError } from '../lib/api-response';
import { requestConnectable } from '../db/requestDb';
import { recordAuditRow } from '../services/audit/audit-write-outcome';
import { requireEditorAccess } from '../middleware/orgMembership';
import { signedActAttempts, signGovernedAct } from './governed-signed-act';
import { governedReason } from './governed-reason';
import { NC_DISPOSITION_CODE_STATUS, NC_DISPOSITION_DECISIONS, recordNcDisposition } from '../services/qms/nonconformance-disposition';
import { SUPPLIER_APPROVAL_CODE_STATUS, SUPPLIER_APPROVAL_DECISIONS, recordSupplierApproval } from '../services/qms/supplier-approval';
import { scheduleInternalAuditTask, scheduleSupplierTasks, type InternalAuditTaskSource, type SupplierTaskSource } from '../services/qms/qms-record-tasks';
import { DECISION_ACT_MEANINGS } from '../services/part11/signature-meanings';
import { admitProject } from '../lib/admit-project';
import { getOrgId, getUserId, qmsClient, queryProject } from './mdx-qms-context';
import { recordNewNonconformance, recordNewSupplier } from '../services/qms/qms-record-create';

const router = Router();
const log = createScopedLogger('mdx-qms');

const CRITICALITY = ['critical', 'major', 'minor'] as const;
const SUPPLIER_STATUS = ['pending', 'approved', 'conditional', 'revoked'] as const;
const AUDIT_STATUS = ['planned', 'in_progress', 'closed', 'cancelled'] as const;

/* ─── Suppliers ─────────────────────────────────────────────── */

/* P1-31 / DP-34 (2026-10-01). The supplier, internal-audit, management-review
   and nonconforming-product writes below carry `requireEditorAccess`, as the
   document writes above have since 6582e3a3. They carried no role gate, so a
   viewer could qualify, requalify or revoke a supplier and disposition
   nonconforming product here; the deleted second QMS API (/api/qms) let it do
   the same with no audit row. Training acknowledgment stays open to every
   member: it records the caller's own read-and-understood, not a governed
   change. Pinned by qms-legacy-api-retired.test.ts. */

const supplierCreate = z.object({
  supplierName:        z.string().min(1).max(300),
  supplierCode:        z.string().max(60).optional().nullable(),
  scope:               z.string().max(1000).optional().nullable(),
  criticality:         z.enum(CRITICALITY),
  approvalStatus:      z.enum(SUPPLIER_STATUS).optional(),
  approvalDate:        z.string().date().optional().nullable(),
  reapprovalDate:      z.string().date().optional().nullable(),
  qualityAgreementId:  z.number().int().positive().optional().nullable(),
  lastAuditDate:       z.string().date().optional().nullable(),
  nextAuditDate:       z.string().date().optional().nullable(),
  isoCertifications:   z.array(z.string()).optional().nullable(),
});
const supplierPatch = supplierCreate.partial();

/* A supplier's quality agreement names a controlled document. Until 2026-10-29
   any integer was stored, including another organisation's document id; it is
   now admitted only for a live document of this organisation. Null clears it. */
async function qualityAgreementRefusal(req: Request, orgId: number, documentId: number | null | undefined): Promise<string | null> {
  if (documentId == null) return null;
  const { rows } = await qmsClient(req).query(
    `SELECT id FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [documentId, orgId]);
  return rows.length === 1 ? null : 'qualityAgreementId must name a controlled document of this organization.';
}

router.get('/qms/suppliers', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const status = typeof req.query.status === 'string' && SUPPLIER_STATUS.includes(req.query.status as (typeof SUPPLIER_STATUS)[number])
    ? req.query.status : null;
  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (status) { args.push(status); filters.push(`approval_status = $${args.length}`); }
  try {
    const { rows } = await qmsClient(req).query(`SELECT * FROM qms_suppliers WHERE ${filters.join(' AND ')}
        ORDER BY supplier_name`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'supp-list', err); }
});

/* A supplier's standing is a signed decision (POST /qms/suppliers/:id/approval,
   services/qms/supplier-approval.ts, 2026-10-29). A create records it as
   pending, and an unsigned write that would set it is refused, not dropped. */
const SIGNED_STANDING = "A supplier's approval standing is a signed decision: approve, conditionally approve or revoke it with Approval in the register.";
const setsStanding = (s: { approvalStatus?: string | null; approvalDate?: string | null }, create: boolean) =>
  (s.approvalStatus != null && !(create && s.approvalStatus === 'pending')) || s.approvalDate != null;

router.post('/qms/suppliers', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = supplierCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  if (setsStanding(p, true)) return clientError(res, 422, `A new supplier is recorded as pending. ${SIGNED_STANDING} Nothing was recorded.`);
  try {
    const agreementRefusal = await qualityAgreementRefusal(req, orgId, p.qualityAgreementId);
    if (agreementRefusal) return clientError(res, 422, agreementRefusal);
    /* WO-16C #133: `meta.auditTrail` says whether the §11.10(e) entry naming who
       qualified the supplier landed with it. One writer with AnA's register_supplier. */
    const { row, auditTrail } = await recordNewSupplier(qmsClient(req), orgId, getUserId(req), p, requestConnectable(req));
    const actor = getUserId(req);
    if (actor) await scheduleSupplierTasks(orgId, row as SupplierTaskSource, [], actor);
    return created(res, row, { auditTrail });
  } catch (err) { return serverError(res, log, 'supp-create', err); }
});

router.patch('/qms/suppliers/:id', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = supplierPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  if (setsStanding(parsed.data, false)) return clientError(res, 422, `${SIGNED_STANDING} Nothing was changed.`);
  const COL: Record<string, string> = {
    supplierName: 'supplier_name', supplierCode: 'supplier_code', scope: 'scope',
    criticality: 'criticality', reapprovalDate: 'reapproval_date',
    qualityAgreementId: 'quality_agreement_id', lastAuditDate: 'last_audit_date',
    nextAuditDate: 'next_audit_date', isoCertifications: 'iso_certifications',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);
  try {
    const agreementRefusal = await qualityAgreementRefusal(req, orgId, parsed.data.qualityAgreementId);
    if (agreementRefusal) return clientError(res, 422, agreementRefusal);
    const { rows } = await qmsClient(req).query(`UPDATE qms_suppliers SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Supplier');
    /* A supplier's approval standing is a controlled QMS record, and changing it
       recorded no §11.10(e) row — while CREATING the same supplier, sixty lines
       above, has always recorded one. Found by the review of the #133 conversion
       of this file. The row is already committed, so this is a log beside it;
       `meta.auditTrail` says whether the log exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.supplier.update',
      resourceType: 'qms_supplier', resourceId: String(id),
      details: { changedFields: Object.keys(parsed.data) },
    }, requestConnectable(req));
    const actor = getUserId(req);
    if (actor) await scheduleSupplierTasks(orgId, rows[0] as SupplierTaskSource, Object.keys(parsed.data), actor);
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'supp-patch', err); }
});

/* A supplier's approval standing, signed (services/qms/supplier-approval.ts):
   through the one signing ceremony, as approval or responsibility. Its
   re-approval task completes when an approval is signed, and a revoked
   supplier owes no audit or re-approval (services/qms/qms-record-tasks.ts). */
/* An approval names when the supplier is next re-approved, after today (UTC);
   a revocation names none. */
const supplierApprovalBody = z.object({
  approvalStatus: z.enum(SUPPLIER_APPROVAL_DECISIONS),
  reapprovalDate: z.string().date().optional(),
}).refine((b) => (b.approvalStatus === 'revoked'
  ? b.reapprovalDate === undefined
  : b.reapprovalDate !== undefined && b.reapprovalDate > new Date().toISOString().slice(0, 10)), {
  message: 'Approving or conditionally approving names the next re-approval date, after today; revoking names none.',
});
router.post('/qms/suppliers/:id/approval', requireEditorAccess, signedActAttempts, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 400, 'id must be a positive integer. Nothing was signed.');
  const parsed = supplierApprovalBody.safeParse({ approvalStatus: req.body?.approvalStatus, reapprovalDate: req.body?.reapprovalDate || undefined });
  if (!parsed.success) {
    const custom = parsed.error.issues.find((issue) => issue.code === 'custom')?.message;
    return clientError(res, 400, `${custom ?? `A supplier's standing is set to one of ${SUPPLIER_APPROVAL_DECISIONS.join(', ')}.`} Nothing was signed.`, parsed.error.flatten().fieldErrors);
  }
  const decision = parsed.data.approvalStatus;
  const reapprovalDate = parsed.data.reapprovalDate ?? null;
  const target = `qms-supplier:${id}`;
  let row: Record<string, unknown> | null = null;
  await signGovernedAct(req, res, {
    domain: 'qms',
    target,
    meanings: DECISION_ACT_MEANINGS,
    codeStatus: SUPPLIER_APPROVAL_CODE_STATUS,
    run: async (client, orgId) => {
      row = await recordSupplierApproval(client, orgId, id, decision, reapprovalDate);
      return { target, payload: { approvalStatus: decision, reapprovalDate, supplierName: row.supplier_name }, body: { data: row } };
    },
    afterCommit: async (_result, orgId, userId) => {
      if (row) await scheduleSupplierTasks(orgId, row as unknown as SupplierTaskSource, decision === 'revoked' ? [] : ['approvalDate'], userId);
    },
  });
});

/* ─── Internal audits ───────────────────────────────────────── */

const auditCreate = z.object({
  auditNumber:    z.string().min(1).max(60),
  scope:          z.string().min(1).max(2000),
  auditStandard:  z.string().max(200).optional().nullable(),
  auditorTeam:    z.array(z.number().int().positive()).optional().nullable(),
  plannedDate:    z.string().date().optional().nullable(),
  status:         z.enum(AUDIT_STATUS).optional(),
});
const auditPatch = auditCreate.partial().extend({
  startedAt:      z.string().date().optional().nullable(),
  completedAt:    z.string().date().optional().nullable(),
  findingCount:   z.number().int().nonnegative().optional(),
  majorFindings:  z.number().int().nonnegative().optional(),
  minorFindings:  z.number().int().nonnegative().optional(),
  observations:   z.number().int().nonnegative().optional(),
});

router.get('/qms/internal-audits', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await qmsClient(req).query(`SELECT * FROM qms_internal_audits WHERE organization_id = $1
        ORDER BY planned_date DESC NULLS LAST, id DESC`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'audit-list', err); }
});

router.post('/qms/internal-audits', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = auditCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await qmsClient(req).query(`INSERT INTO qms_internal_audits (
         organization_id, audit_number, scope, audit_standard,
         auditor_lead_id, auditor_team, planned_date, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'planned'))
       RETURNING *`,
      [
        orgId, p.auditNumber, p.scope, p.auditStandard ?? null,
        getUserId(req), p.auditorTeam ?? null, p.plannedDate ?? null, p.status ?? null,
      ],
    );
    /* An internal audit is ISO 13485 §8.2.4 evidence and its creation recorded no
       §11.10(e) row. Found by the review of the #133 conversion of this file. The
       audit row is already committed, so this is a log beside it;
       `meta.auditTrail` says whether the log exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.internal_audit.create',
      resourceType: 'qms_internal_audit', resourceId: String(rows[0].id),
      details: { auditNumber: p.auditNumber, auditStandard: p.auditStandard ?? null, scope: p.scope },
    }, requestConnectable(req));
    const actor = getUserId(req);
    if (actor) await scheduleInternalAuditTask(orgId, rows[0] as InternalAuditTaskSource, actor);
    return created(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'audit-create', err); }
});

router.patch('/qms/internal-audits/:id', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = auditPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    auditNumber: 'audit_number', scope: 'scope', auditStandard: 'audit_standard',
    auditorTeam: 'auditor_team', plannedDate: 'planned_date', startedAt: 'started_at',
    completedAt: 'completed_at', status: 'status', findingCount: 'finding_count',
    majorFindings: 'major_findings', minorFindings: 'minor_findings',
    observations: 'observations',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);
  try {
    const { rows } = await qmsClient(req).query(`UPDATE qms_internal_audits SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Audit');
    /* Changing an internal audit's findings or closure recorded no §11.10(e) row.
       Found by the review of the #133 conversion of this file. The row is already
       committed, so this is a log beside it; `meta.auditTrail` says whether it
       exists. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.internal_audit.update',
      resourceType: 'qms_internal_audit', resourceId: String(id),
      details: { changedFields: Object.keys(parsed.data) },
    }, requestConnectable(req));
    const actor = getUserId(req);
    if (actor) await scheduleInternalAuditTask(orgId, rows[0] as InternalAuditTaskSource, actor);
    return ok(res, rows[0], { auditTrail });
  } catch (err) { return serverError(res, log, 'audit-patch', err); }
});

/* ─── Nonconforming products ────────────────────────────────── */

const ncCreate = z.object({
  ncNumber:       z.string().min(1).max(60),
  deviceName:     z.string().max(300).optional().nullable(),
  lotOrSerial:    z.string().max(120).optional().nullable(),
  source:         z.string().max(60).optional().nullable(),
  description:    z.string().min(1).max(4000),
  /* The project the record is filed under (D2 / D6, 2026-10-29; 20261029d).
     Admitted through admitProject before anything is written, so any string
     that is not this organization's live project is 404 "Project not found".
     Absent or null: the organization's unscoped record, as before. */
  programId:      z.string().max(64).optional().nullable(),
});
const ncDispoBody = z.object({ disposition: z.enum(NC_DISPOSITION_DECISIONS) });

router.get('/qms/nonconforming', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  // `?program_id=`: the records filed under one project (QP2), admitted as a write's project is.
  const programId = await queryProject(req, res); if (programId === false) return res;
  try {
    const { rows } = await qmsClient(req).query(`SELECT * FROM qms_nonconforming_products WHERE organization_id = $1
        AND ($2::uuid IS NULL OR program_id = $2::uuid) ORDER BY detected_at DESC LIMIT 500`,
      [orgId, programId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'nc-list', err); }
});

router.post('/qms/nonconforming', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = ncCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  const programId = p.programId || null;
  try {
    /* A named project must be this organization's before the record is filed
       under it (server/lib/admit-project.ts): 404 or 503, and nothing is
       written. The program key (20261029d) holds every other writer to the
       same rule. Engineering reads a project's records by this column. */
    if (!(await admitProject(res, log, programId, orgId))) return;
    /* Recording a nonconforming product is §8.3 / 21 CFR 820.90 evidence: the
       record carries its §11.10(e) row, and `meta.auditTrail` says whether it
       exists. One writer with AnA's log_nonconforming_product. */
    const { row, auditTrail } = await recordNewNonconformance(qmsClient(req), orgId, getUserId(req), { ...p, programId }, requestConnectable(req));
    return created(res, row, { auditTrail });
  } catch (err) { return serverError(res, log, 'nc-create', err); }
});

/* A disposition is a signed decision (services/qms/nonconformance-disposition.ts,
   2026-10-29): through the one signing ceremony, with the signer's reason
   recorded as its rationale, and only on an open record. It was an unsigned
   PATCH with an optional rationale, and a second one overwrote the first. */
router.patch('/qms/nonconforming/:id/disposition', requireEditorAccess, signedActAttempts, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 400, 'id must be a positive integer. Nothing was signed.');
  const parsed = ncDispoBody.safeParse({ disposition: req.body?.disposition });
  if (!parsed.success) {
    return clientError(res, 400, `A disposition is one of ${NC_DISPOSITION_DECISIONS.join(', ')}. Nothing was signed.`, parsed.error.flatten().fieldErrors);
  }
  const target = `qms-nonconforming:${id}`;
  await signGovernedAct(req, res, {
    domain: 'qms',
    target,
    meanings: DECISION_ACT_MEANINGS,
    codeStatus: NC_DISPOSITION_CODE_STATUS,
    run: async (client, orgId) => {
      // The ceremony has already admitted the reason; it is the disposition's rationale.
      const rationale = governedReason.parse(req.body?.reason);
      const row = await recordNcDisposition(client, orgId, id, parsed.data.disposition, rationale);
      return { target, payload: { disposition: parsed.data.disposition, ncNumber: row.nc_number }, body: { data: row } };
    },
  });
});

export default router;
