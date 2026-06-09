/**
 * Quality Management System (QMS) routes — mounted at /api/qms.
 *
 * Activates document control, training, supplier qualification, internal
 * audits, management review, and nonconforming-product management over the
 * previously-dormant qms_* tables.
 *
 *   Documents       GET/POST /documents · GET /documents/:id · POST /documents/:id/transition
 *   Training        POST /training · GET /training/compliance
 *   Suppliers       GET/POST /suppliers · POST /suppliers/:id/approval
 *   Audits          GET/POST /audits
 *   Mgmt review     GET/POST /management-reviews
 *   Nonconformance  GET/POST /nonconformances · POST /nonconformances/:id/disposition
 *   Summary         GET /summary
 *
 * All endpoints require an authenticated user with an organization context.
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import auditService from '../services/auditService';
import * as qms from '../services/qms/qms.service';

const router = Router();
router.use(authenticateToken);

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
function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}
function intParam(req: Request, key: string): number {
  const v = req.params[key];
  const raw = Array.isArray(v) ? v[0] : v;
  return parseInt(raw ?? '', 10);
}
function reqStr(body: any, key: string): string | null {
  return typeof body[key] === 'string' && body[key].trim().length > 0 ? body[key] : null;
}
function fail(res: Response, e: unknown): Response {
  if (e instanceof qms.InvalidTransitionError) return res.status(422).json({ error: e.message });
  const msg = e instanceof Error ? e.message : 'unknown';
  return res.status(500).json({ error: 'Operation failed', detail: msg });
}
function orgGuard(req: Request, res: Response): number | null {
  const orgId = getOrgId(req);
  if (orgId === null) { res.status(403).json({ error: 'Organization context required' }); return null; }
  return orgId;
}

// ─── Documents ──────────────────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try { const rows = await qms.listDocuments(orgId, { status: q(req, 'status'), docType: q(req, 'doc_type') }); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/documents', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  const docNumber = reqStr(b, 'docNumber'); const title = reqStr(b, 'title');
  if (!docNumber) return res.status(422).json({ error: 'docNumber is required' });
  if (!title) return res.status(422).json({ error: 'title is required' });
  if (!(qms.DOC_TYPES as readonly string[]).includes(b.docType)) {
    return res.status(422).json({ error: `docType must be one of: ${qms.DOC_TYPES.join(', ')}` });
  }
  try {
    const row = await qms.createDocument(orgId, { docNumber, title, docType: b.docType, category: b.category ?? null, version: b.version, authorId: getUserId(req) });
    await auditService.logAction({ tenantId: orgId, userId: getUserId(req) ?? undefined, action: 'qms.document.create', resourceType: 'qms_document', resourceId: row.id });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});
router.get('/documents/:id', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try { const row = await qms.getDocument(orgId, intParam(req, 'id')); if (!row) return res.status(404).json({ error: 'Document not found' }); res.json(row); }
  catch (e) { fail(res, e); }
});
router.post('/documents/:id/transition', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!(qms.DOC_STATES as readonly string[]).includes(b.to)) {
    return res.status(422).json({ error: `to must be one of: ${qms.DOC_STATES.join(', ')}` });
  }
  try {
    const row = await qms.transitionDocument(orgId, intParam(req, 'id'), b.to, getUserId(req));
    if (!row) return res.status(404).json({ error: 'Document not found' });
    await auditService.logAction({ tenantId: orgId, userId: getUserId(req) ?? undefined, action: 'qms.document.transition', resourceType: 'qms_document', resourceId: row.id, details: { to: b.to } });
    res.json(row);
  } catch (e) { fail(res, e); }
});

// ─── Training ───────────────────────────────────────────────────────────────
router.post('/training', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!Number.isInteger(b.documentId)) return res.status(422).json({ error: 'documentId is required' });
  if (!reqStr(b, 'documentVersion')) return res.status(422).json({ error: 'documentVersion is required' });
  const userId = Number.isInteger(b.userId) ? b.userId : getUserId(req);
  if (userId === null) return res.status(422).json({ error: 'userId is required' });
  try {
    const row = await qms.recordTraining(orgId, {
      userId, documentId: b.documentId, documentVersion: b.documentVersion,
      acknowledgmentMethod: b.acknowledgmentMethod ?? null, trainerId: b.trainerId ?? null,
      quizScore: b.quizScore ?? null, expiresAt: b.expiresAt ?? null,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});
router.get('/training/compliance', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try { res.json({ rows: await qms.trainingCompliance(orgId) }); } catch (e) { fail(res, e); }
});

// ─── Suppliers ──────────────────────────────────────────────────────────────
router.get('/suppliers', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try { const rows = await qms.listSuppliers(orgId, { status: q(req, 'status') }); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/suppliers', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!reqStr(b, 'supplierName')) return res.status(422).json({ error: 'supplierName is required' });
  if (!(qms.SUPPLIER_CRITICALITY as readonly string[]).includes(b.criticality)) {
    return res.status(422).json({ error: `criticality must be one of: ${qms.SUPPLIER_CRITICALITY.join(', ')}` });
  }
  try {
    const row = await qms.createSupplier(orgId, {
      supplierName: b.supplierName, supplierCode: b.supplierCode ?? null, scope: b.scope ?? null,
      criticality: b.criticality, isoCertifications: Array.isArray(b.isoCertifications) ? b.isoCertifications : undefined,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});
router.post('/suppliers/:id/approval', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!(qms.SUPPLIER_STATES as readonly string[]).includes(b.approvalStatus)) {
    return res.status(422).json({ error: `approvalStatus must be one of: ${qms.SUPPLIER_STATES.join(', ')}` });
  }
  try {
    const row = await qms.setSupplierApproval(orgId, intParam(req, 'id'), { approvalStatus: b.approvalStatus, approvalDate: b.approvalDate ?? null, reapprovalDate: b.reapprovalDate ?? null });
    if (!row) return res.status(404).json({ error: 'Supplier not found' });
    res.json(row);
  } catch (e) { fail(res, e); }
});

// ─── Internal audits ────────────────────────────────────────────────────────
router.get('/audits', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try { const rows = await qms.listAudits(orgId); res.json({ rows, count: rows.length }); } catch (e) { fail(res, e); }
});
router.post('/audits', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!reqStr(b, 'auditNumber')) return res.status(422).json({ error: 'auditNumber is required' });
  if (!reqStr(b, 'scope')) return res.status(422).json({ error: 'scope is required' });
  try {
    const row = await qms.createAudit(orgId, { auditNumber: b.auditNumber, scope: b.scope, auditStandard: b.auditStandard ?? null, plannedDate: b.plannedDate ?? null, auditorLeadId: b.auditorLeadId ?? null });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── Management reviews ─────────────────────────────────────────────────────
router.get('/management-reviews', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try { const rows = await qms.listManagementReviews(orgId); res.json({ rows, count: rows.length }); } catch (e) { fail(res, e); }
});
router.post('/management-reviews', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!reqStr(b, 'reviewDate')) return res.status(422).json({ error: 'reviewDate is required' });
  if (!reqStr(b, 'period')) return res.status(422).json({ error: 'period is required' });
  try {
    const row = await qms.createManagementReview(orgId, { reviewDate: b.reviewDate, period: b.period, chairId: b.chairId ?? getUserId(req), inputs: b.inputs ?? null, outputs: b.outputs ?? null });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── Nonconforming product ──────────────────────────────────────────────────
router.get('/nonconformances', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try { const rows = await qms.listNonconformances(orgId); res.json({ rows, count: rows.length }); } catch (e) { fail(res, e); }
});
router.post('/nonconformances', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!reqStr(b, 'ncNumber')) return res.status(422).json({ error: 'ncNumber is required' });
  if (!reqStr(b, 'description')) return res.status(422).json({ error: 'description is required' });
  try {
    const row = await qms.createNonconformance(orgId, { ncNumber: b.ncNumber, description: b.description, deviceName: b.deviceName ?? null, lotOrSerial: b.lotOrSerial ?? null, source: b.source ?? null, detectedBy: getUserId(req) });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});
router.post('/nonconformances/:id/disposition', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!(qms.NC_DISPOSITIONS as readonly string[]).includes(b.disposition)) {
    return res.status(422).json({ error: `disposition must be one of: ${qms.NC_DISPOSITIONS.join(', ')}` });
  }
  try {
    const row = await qms.setNcDisposition(orgId, intParam(req, 'id'), { disposition: b.disposition, rationale: b.rationale ?? null, capaLinked: b.capaLinked });
    if (!row) return res.status(404).json({ error: 'Nonconformance not found' });
    res.json(row);
  } catch (e) { fail(res, e); }
});

// ─── Compliance summary ─────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try { res.json(await qms.qmsComplianceSummary(orgId)); } catch (e) { fail(res, e); }
});

export default router;
