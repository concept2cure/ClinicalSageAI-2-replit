/**
 * Regulatory assessments REST surface — persist + retrieve RI/CDISC/eTMF verdict
 * snapshots per program (durable, tenant-scoped, audited, append-only).
 * Mounted at /api/regulatory-assessments with authenticateToken at mount time.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  createAssessment,
  listAssessments,
  getLatestAssessment,
  getAssessment,
  AssessmentError,
} from '../services/regulatory-assessments/regulatory-assessment-persistence';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('regulatory-assessments-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

interface Ctx {
  userId: number;
  organizationId: number;
}
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) return null;
  return { userId, organizationId };
}
function noAuth(res: Response) {
  return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
}
function fail(res: Response, err: unknown): void {
  logger.error('regulatory-assessments route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Assessment request failed.' } });
}

function submissionIdOf(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Record an assessment snapshot. Body: { submissionId, assessmentType, ready?, summary?, result }. */
router.post('/', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  const submissionId = submissionIdOf(b.submissionId);
  if (!submissionId || !b.assessmentType || typeof b.result !== 'object' || b.result == null) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (int), assessmentType and result (object) are required.' } });
  }
  try {
    const row = await createAssessment(
      { submissionId, assessmentType: String(b.assessmentType), ready: typeof b.ready === 'boolean' ? b.ready : undefined, summary: b.summary, result: b.result },
      ctx,
    );
    res.status(201).json(row);
  } catch (err) {
    fail(res, err);
  }
});

/** List a submission's assessments (newest first); ?submissionId= &type=. */
router.get('/', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.query.submissionId);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (query) is required.' } });
  try {
    res.json(await listAssessments(submissionId, ctx, { assessmentType: typeof req.query.type === 'string' ? req.query.type : undefined }));
  } catch (err) {
    fail(res, err);
  }
});

/** The latest assessment of a type for a submission; ?submissionId= &type=. */
router.get('/latest', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.query.submissionId);
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  if (!submissionId || !type) return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId and type (query) are required.' } });
  try {
    const row = await getLatestAssessment(submissionId, type, ctx);
    if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No assessment of that type for the submission.' } });
    res.json(row);
  } catch (err) {
    fail(res, err);
  }
});

/** Fetch one assessment by id. */
router.get('/:id', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  try {
    res.json(await getAssessment(id, ctx));
  } catch (err) {
    if (err instanceof AssessmentError) return res.status(404).json({ error: { code: err.code, message: err.message } });
    fail(res, err);
  }
});

export default router;
