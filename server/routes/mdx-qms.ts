/**
 * QMS routes — 21 CFR 820 / QMSR (effective Feb 2026) + ISO 13485.
 * Covers document control, training records, supplier management,
 * internal audits, management reviews, nonconforming products.
 *
 *   GET    /api/mdx/qms/documents                      list controlled docs
 *   POST   /api/mdx/qms/documents                       create
 *   GET    /api/mdx/qms/documents/:id                   single
 *   PATCH  /api/mdx/qms/documents/:id                   partial update
 *   POST   /api/mdx/qms/documents/:id/approve           approve + flip effective
 *   POST   /api/mdx/qms/documents/:id/training-ack      user acknowledges training
 *   GET    /api/mdx/qms/training                        list training records
 *   GET    /api/mdx/qms/training/expiring               periodic refresh due
 *
 *   GET    /api/mdx/qms/suppliers                       list
 *   POST   /api/mdx/qms/suppliers                       create
 *   PATCH  /api/mdx/qms/suppliers/:id                   update
 *
 *   GET    /api/mdx/qms/internal-audits                 list audits
 *   POST   /api/mdx/qms/internal-audits                 create
 *   PATCH  /api/mdx/qms/internal-audits/:id             update
 *
 *   GET    /api/mdx/qms/management-reviews              list reviews
 *   POST   /api/mdx/qms/management-reviews              create
 *
 *   GET    /api/mdx/qms/nonconforming                   list NC products
 *   POST   /api/mdx/qms/nonconforming                   create
 *   PATCH  /api/mdx/qms/nonconforming/:id/disposition   set disposition
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import auditService from '../services/auditService';

const router = Router();
const log = createScopedLogger('mdx-qms');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const DOC_TYPE = ['sop', 'wi', 'form', 'spec', 'policy', 'manual', 'protocol'] as const;
const DOC_STATUS = ['draft', 'in_review', 'effective', 'superseded', 'retired'] as const;
const CRITICALITY = ['critical', 'major', 'minor'] as const;
const SUPPLIER_STATUS = ['pending', 'approved', 'conditional', 'revoked'] as const;
const AUDIT_STATUS = ['planned', 'in_progress', 'closed', 'cancelled'] as const;
const DISPOSITION = ['use_as_is', 'rework', 'regrade', 'scrap', 'return_to_supplier', 'pending'] as const;

/* ─── Documents ─────────────────────────────────────────────── */

const docListQuery = z.object({
  doc_type: z.enum(DOC_TYPE).optional(),
  status:   z.enum(DOC_STATUS).optional(),
  category: z.string().max(60).optional(),
});
const docCreate = z.object({
  docNumber:        z.string().min(1).max(60),
  title:            z.string().min(1).max(300),
  docType:          z.enum(DOC_TYPE),
  category:         z.string().max(60).optional().nullable(),
  version:          z.string().max(20).optional(),
  status:           z.enum(DOC_STATUS).optional(),
  effectiveDate:    z.string().date().optional().nullable(),
  nextReviewDate:   z.string().date().optional().nullable(),
  artifactId:       z.number().int().positive().optional().nullable(),
});
const docPatch = docCreate.partial();

router.get('/qms/documents', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = docListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { doc_type, status, category } = parsed.data;
  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (doc_type) { args.push(doc_type); filters.push(`doc_type = $${args.length}`); }
  if (status)   { args.push(status);   filters.push(`status = $${args.length}`); }
  if (category) { args.push(category); filters.push(`category = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_documents WHERE ${filters.join(' AND ')}
        ORDER BY doc_number`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'doc-list', err); }
});

router.post('/qms/documents', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = docCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_documents (
         organization_id, doc_number, title, doc_type, category, version, status,
         effective_date, next_review_date, author_id, artifact_id
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'1.0'),COALESCE($7,'draft'),$8,$9,$10,$11)
       RETURNING *`,
      [
        orgId, p.docNumber, p.title, p.docType, p.category ?? null,
        p.version ?? null, p.status ?? null,
        p.effectiveDate ?? null, p.nextReviewDate ?? null, getUserId(req), p.artifactId ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') return clientError(res, 409, 'A document with that number already exists in this org');
    return serverError(res, log, 'doc-create', err);
  }
});

router.get('/qms/documents/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Document');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'doc-get', err); }
});

router.patch('/qms/documents/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = docPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    docNumber: 'doc_number', title: 'title', docType: 'doc_type',
    category: 'category', version: 'version', status: 'status',
    effectiveDate: 'effective_date', nextReviewDate: 'next_review_date',
    artifactId: 'artifact_id',
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
    const { rows } = await pool.query(
      `UPDATE qms_documents SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Document');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'doc-patch', err); }
});

router.post('/qms/documents/:id/approve', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const effectiveDate = typeof req.body?.effectiveDate === 'string' ? req.body.effectiveDate : null;
  try {
    const { rows } = await pool.query(
      `UPDATE qms_documents
          SET status = 'effective',
              approver_id = $3,
              approved_at = NOW(),
              effective_date = COALESCE($4::date, effective_date, NOW()::date),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
          AND status IN ('draft','in_review')
          AND deleted_at IS NULL
        RETURNING *`,
      [id, orgId, userId, effectiveDate],
    );
    if (rows.length === 0) return clientError(res, 409, 'Document not found, or not in draft/in_review state');
    void auditService.logAction({
      tenantId: orgId, userId: userId ?? undefined, action: 'mdx.qms.document.approve',
      resourceType: 'qms_document', resourceId: id,
    });
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'doc-approve', err); }
});

router.post('/qms/documents/:id/training-ack', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    /* Tenant gate. */
    const doc = await pool.query<{ version: string }>(
      `SELECT version FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (doc.rows.length === 0) return notFoundInTenant(res, 'Document');
    const method = typeof req.body?.method === 'string' ? req.body.method : 'attestation';
    const quizScore = typeof req.body?.quizScore === 'number' ? Math.round(req.body.quizScore) : null;
    const { rows } = await pool.query(
      `INSERT INTO qms_training_records (
         organization_id, user_id, document_id, document_version,
         acknowledgment_method, quiz_score, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '365 days')
       RETURNING *`,
      [orgId, userId, id, doc.rows[0].version, method, quizScore],
    );
    void auditService.logAction({
      tenantId: orgId, userId: userId ?? undefined, action: 'mdx.qms.training.acknowledge',
      resourceType: 'qms_document', resourceId: id, details: { method, quizScore },
    });
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'training-ack', err); }
});

router.get('/qms/training', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_training_records WHERE organization_id = $1
        ORDER BY acknowledged_at DESC LIMIT 500`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'training-list', err); }
});

router.get('/qms/training/expiring', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const withinDays = Math.max(1, Math.min(365, Number(req.query.within) || 60));
  try {
    const { rows } = await pool.query(
      `SELECT t.*, d.title AS document_title, d.doc_number
         FROM qms_training_records t
         JOIN qms_documents d ON d.id = t.document_id
        WHERE t.organization_id = $1
          AND t.expires_at IS NOT NULL
          AND t.expires_at < NOW() + ($2 || ' days')::interval
        ORDER BY t.expires_at ASC LIMIT 500`,
      [orgId, withinDays],
    );
    return ok(res, rows, { count: rows.length, withinDays });
  } catch (err) { return serverError(res, log, 'training-expiring', err); }
});

/* ─── Suppliers ─────────────────────────────────────────────── */

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

router.get('/qms/suppliers', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const status = typeof req.query.status === 'string' && SUPPLIER_STATUS.includes(req.query.status as (typeof SUPPLIER_STATUS)[number])
    ? req.query.status : null;
  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (status) { args.push(status); filters.push(`approval_status = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_suppliers WHERE ${filters.join(' AND ')}
        ORDER BY supplier_name`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'supp-list', err); }
});

router.post('/qms/suppliers', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = supplierCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_suppliers (
         organization_id, supplier_name, supplier_code, scope, criticality,
         approval_status, approval_date, reapproval_date, quality_agreement_id,
         last_audit_date, next_audit_date, iso_certifications
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,'pending'),$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        orgId, p.supplierName, p.supplierCode ?? null, p.scope ?? null, p.criticality,
        p.approvalStatus ?? null, p.approvalDate ?? null, p.reapprovalDate ?? null,
        p.qualityAgreementId ?? null, p.lastAuditDate ?? null, p.nextAuditDate ?? null,
        p.isoCertifications ?? null,
      ],
    );
    void auditService.logAction({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.supplier.qualify',
      resourceType: 'qms_supplier', resourceId: rows[0]?.id,
      details: { supplierName: p.supplierName, criticality: p.criticality },
    });
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'supp-create', err); }
});

router.patch('/qms/suppliers/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = supplierPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    supplierName: 'supplier_name', supplierCode: 'supplier_code', scope: 'scope',
    criticality: 'criticality', approvalStatus: 'approval_status',
    approvalDate: 'approval_date', reapprovalDate: 'reapproval_date',
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
    const { rows } = await pool.query(
      `UPDATE qms_suppliers SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Supplier');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'supp-patch', err); }
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
    const { rows } = await pool.query(
      `SELECT * FROM qms_internal_audits WHERE organization_id = $1
        ORDER BY planned_date DESC NULLS LAST, id DESC`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'audit-list', err); }
});

router.post('/qms/internal-audits', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = auditCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_internal_audits (
         organization_id, audit_number, scope, audit_standard,
         auditor_lead_id, auditor_team, planned_date, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'planned'))
       RETURNING *`,
      [
        orgId, p.auditNumber, p.scope, p.auditStandard ?? null,
        getUserId(req), p.auditorTeam ?? null, p.plannedDate ?? null, p.status ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'audit-create', err); }
});

router.patch('/qms/internal-audits/:id', async (req: Request, res: Response) => {
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
    const { rows } = await pool.query(
      `UPDATE qms_internal_audits SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Audit');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'audit-patch', err); }
});

/* ─── Management reviews ────────────────────────────────────── */

const mrCreate = z.object({
  reviewDate:        z.string().date(),
  period:            z.string().min(1).max(40),
  attendees:         z.array(z.number().int().positive()).optional().nullable(),
  inputs:            z.record(z.unknown()).optional().nullable(),
  outputs:           z.record(z.unknown()).optional().nullable(),
  minutesArtifactId: z.number().int().positive().optional().nullable(),
});

router.get('/qms/management-reviews', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_management_reviews WHERE organization_id = $1
        ORDER BY review_date DESC`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'mr-list', err); }
});

router.post('/qms/management-reviews', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = mrCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_management_reviews (
         organization_id, review_date, period, chair_id, attendees, inputs, outputs,
         minutes_artifact_id
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
       RETURNING *`,
      [
        orgId, p.reviewDate, p.period, getUserId(req),
        p.attendees ?? null,
        JSON.stringify(p.inputs ?? {}),
        JSON.stringify(p.outputs ?? {}),
        p.minutesArtifactId ?? null,
      ],
    );
    void auditService.logAction({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.management_review.signoff',
      resourceType: 'qms_management_review', resourceId: rows[0]?.id,
      details: { period: p.period },
    });
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'mr-create', err); }
});

/* ─── Nonconforming products ────────────────────────────────── */

const ncCreate = z.object({
  ncNumber:       z.string().min(1).max(60),
  deviceName:     z.string().max(300).optional().nullable(),
  lotOrSerial:    z.string().max(120).optional().nullable(),
  source:         z.string().max(60).optional().nullable(),
  description:    z.string().min(1).max(4000),
});
const ncDispoBody = z.object({
  disposition:           z.enum(DISPOSITION),
  dispositionRationale:  z.string().max(4000).optional().nullable(),
});

router.get('/qms/nonconforming', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM qms_nonconforming_products WHERE organization_id = $1
        ORDER BY detected_at DESC LIMIT 500`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'nc-list', err); }
});

router.post('/qms/nonconforming', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = ncCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO qms_nonconforming_products (
         organization_id, nc_number, device_name, lot_or_serial, source, description,
         detected_by, disposition
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       RETURNING *`,
      [
        orgId, p.ncNumber, p.deviceName ?? null, p.lotOrSerial ?? null,
        p.source ?? null, p.description, getUserId(req),
      ],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'nc-create', err); }
});

router.patch('/qms/nonconforming/:id/disposition', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = ncDispoBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const { rows } = await pool.query(
      `UPDATE qms_nonconforming_products
          SET disposition = $3,
              disposition_rationale = $4,
              disposition_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [id, orgId, parsed.data.disposition, parsed.data.dispositionRationale ?? null],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'NC record');
    void auditService.logAction({
      tenantId: orgId, userId: getUserId(req) ?? undefined,
      action: 'mdx.qms.nonconforming.disposition',
      resourceType: 'qms_nonconforming_product', resourceId: id,
      details: { disposition: parsed.data.disposition },
    });
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'nc-disposition', err); }
});

export default router;
