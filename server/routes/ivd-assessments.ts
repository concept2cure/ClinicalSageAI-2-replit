/**
 * IVD assessment persistence routes — mounted at /api/ivd-assessments.
 *
 * Persists IVD lifecycle calculator results and generated post-market documents
 * as org-scoped, audited records (the "save" backend for the IVD UI surfaces).
 *
 *   GET  /                          list saved assessments (?type=&program_id=&limit=)
 *   POST /                          save an assessment
 *   GET  /:id                       single assessment
 *   DELETE /:id                     soft-delete
 *   GET  /documents                 list generated documents (?doc_type=&program_id=)
 *   POST /documents                 save a generated document
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import auditService from '../services/auditService';
import { corpusVersion } from '../services/ivd-knowledge/knowledge.service';
import {
  saveAssessment, listAssessments, getAssessment, deleteAssessment,
  saveGeneratedDocument, listGeneratedDocuments,
  isAssessmentType, isDocumentType, IVD_ASSESSMENT_TYPES, IVD_DOCUMENT_TYPES,
} from '../services/regulatory/ivd-assessments.service';

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): string | null {
  const raw = (req as any).user?.id;
  return raw === undefined || raw === null ? null : String(raw);
}
function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}
function pathParam(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}
const logger = createScopedLogger('ivd-assessments');

/* This file kept a private `fail()` that put `Error.message` in the response as
   `detail` — the exact disclosure server/lib/api-response.ts documents having
   removed from every other MDX endpoint. A Postgres failure here shipped its
   table, column and constraint names to whatever read the response: a browser
   devtools panel, a proxy log, a saved HAR. `serverError` logs the real message
   against the request id the caller is shown, and answers with a code, a
   sentence and that id — one way of doing this, not two. */
function orgGuard(req: Request, res: Response): number | null {
  const orgId = getOrgId(req);
  if (orgId === null) { res.status(403).json({ error: 'Organization context required' }); return null; }
  return orgId;
}

// ── Assessments ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try {
    const limitRaw = q(req, 'limit');
    const rows = await listAssessments(orgId, {
      assessmentType: q(req, 'type'),
      programId: q(req, 'program_id'),
      limit: limitRaw ? parseInt(limitRaw, 10) || undefined : undefined,
    });
    res.json({ rows, count: rows.length });
  } catch (e) { serverError(res, logger, 'listing IVD assessments', e); }
});

router.post('/', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!isAssessmentType(b.assessmentType)) {
    return res.status(422).json({ error: `assessmentType must be one of: ${IVD_ASSESSMENT_TYPES.join(', ')}` });
  }
  if (b.result === undefined || b.result === null) {
    return res.status(422).json({ error: 'result is required' });
  }
  try {
    const row = await saveAssessment(orgId, {
      assessmentType: b.assessmentType,
      title: b.title ?? null,
      inputs: b.inputs ?? {},
      result: b.result,
      verdict: b.verdict ?? null,
      // Stamp the corpus version unless the caller supplied one.
      corpusVersion: typeof b.corpusVersion === 'string' ? b.corpusVersion : corpusVersion(),
      engineVersion: b.engineVersion ?? null,
      createdBy: getUserId(req),
      ...(typeof b.programId === 'string' ? { programId: b.programId } : {}),
    } as any);
    await auditService.logAction({ tenantId: orgId, userId: getUserId(req) ?? undefined, action: 'ivd.assessment.save', resourceType: 'ivd_assessment', resourceId: row.id, details: { type: b.assessmentType } });
    res.status(201).json(row);
  } catch (e) { serverError(res, logger, 'saving the IVD assessment', e); }
});

router.get('/documents', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try {
    const rows = await listGeneratedDocuments(orgId, { docType: q(req, 'doc_type'), programId: q(req, 'program_id') });
    res.json({ rows, count: rows.length });
  } catch (e) { serverError(res, logger, 'listing generated IVD documents', e); }
});

router.post('/documents', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  const b = req.body ?? {};
  if (!isDocumentType(b.docType)) {
    return res.status(422).json({ error: `docType must be one of: ${IVD_DOCUMENT_TYPES.join(', ')}` });
  }
  if (b.payload === undefined || b.payload === null) {
    return res.status(422).json({ error: 'payload is required' });
  }
  try {
    const row = await saveGeneratedDocument(orgId, {
      docType: b.docType, title: b.title ?? null, payload: b.payload,
      status: b.status ?? 'draft', corpusVersion: corpusVersion(),
      createdBy: getUserId(req), programId: typeof b.programId === 'string' ? b.programId : null,
    });
    await auditService.logAction({ tenantId: orgId, userId: getUserId(req) ?? undefined, action: 'ivd.document.save', resourceType: 'ivd_generated_document', resourceId: row.id, details: { docType: b.docType } });
    res.status(201).json(row);
  } catch (e) { serverError(res, logger, 'saving the generated IVD document', e); }
});

router.get('/:id', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try {
    const row = await getAssessment(orgId, pathParam(req, 'id'));
    if (!row) return res.status(404).json({ error: 'Assessment not found' });
    res.json(row);
  } catch (e) { serverError(res, logger, 'loading the IVD assessment', e); }
});

router.delete('/:id', async (req, res) => {
  const orgId = orgGuard(req, res); if (orgId === null) return;
  try {
    const ok = await deleteAssessment(orgId, pathParam(req, 'id'));
    if (!ok) return res.status(404).json({ error: 'Assessment not found' });
    await auditService.logAction({ tenantId: orgId, userId: getUserId(req) ?? undefined, action: 'ivd.assessment.delete', resourceType: 'ivd_assessment', resourceId: pathParam(req, 'id') });
    res.json({ ok: true });
  } catch (e) { serverError(res, logger, 'deleting the IVD assessment', e); }
});

export default router;
