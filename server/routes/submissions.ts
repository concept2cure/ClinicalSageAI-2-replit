/**
 * Canonical submission core API (spec §8.3)
 *
 * The REST surface for the canonical core — the API the Phase-2 Builder and
 * Sequences workspaces render against, and that nothing previously exposed.
 * Mounted at /api/submissions with authenticateToken applied at mount time.
 *
 * Every handler resolves organizationId/userId from the authenticated session
 * only (never from body/params), validates with Zod, and is RBAC-gated.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  createSubmission,
  listSubmissions,
  getSubmission,
  createSequence,
  listSequences,
  transitionSequence,
  listLeaves,
  upsertLeaf,
  SubmissionError,
} from '../services/submission-service/submission-service';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('submissions-routes');
const router = Router();
const limiter = createRateLimiter();

interface Ctx {
  userId: number;
  organizationId: number;
}
function ctxOf(req: Request): Ctx | null {
  const user = (req as any).user;
  const userId = Number(user?.id);
  const organizationId = Number(user?.organizationId);
  if (!Number.isFinite(userId) || !Number.isFinite(organizationId)) return null;
  return { userId, organizationId };
}

function fail(res: Response, err: unknown): void {
  if (err instanceof SubmissionError) {
    const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'INVALID_STATE' ? 409 : 400;
    res.status(status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  logger.error('submissions route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Request failed.' } });
}

const idParam = (v: string | string[] | undefined) => {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

// ── Schemas ───────────────────────────────────────────────────────────────
const createSubmissionSchema = z.object({
  title: z.string().min(1).max(500),
  productName: z.string().max(500).optional(),
  applicationType: z.string().min(1).max(64),
  clientType: z.enum(['pharma', 'biotech', 'mdx', 'ivd']),
  primaryRegion: z.enum(['fda', 'eu', 'jp']),
  lifecycleStage: z.string().max(64).optional(),
});
const createSequenceSchema = z.object({
  region: z.enum(['fda', 'eu', 'jp']),
  sequenceNumber: z.string().regex(/^\d{4}$/, 'sequenceNumber must be 4 digits, e.g. "0000".'),
  type: z.enum(['original', 'amendment', 'response', 'variation', 'annual', 'withdrawal']).optional(),
});
const transitionSchema = z.object({
  status: z.enum(['assembling', 'validated', 'frozen', 'dispatched', 'draft']),
});
const upsertLeafSchema = z.object({
  leafId: z.coerce.number().int().positive().optional(),
  sectionCode: z.string().min(1).max(64),
  title: z.string().min(1).max(500),
  granularity: z.string().max(128).optional(),
  lifecycleOp: z.enum(['new', 'replace', 'append', 'delete']).optional(),
  documentTable: z.string().max(64).optional(),
  documentId: z.coerce.number().int().positive().optional(),
  parentLeafId: z.coerce.number().int().positive().optional(),
});

const AUTHOR = 'regulatory-author';

// ── Submissions ─────────────────────────────────────────────────────────────
router.get('/', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    res.json(await listSubmissions(ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = createSubmissionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.status(201).json(await createSubmission(parsed.data, ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:id', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await getSubmission(id, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Sequences ─────────────────────────────────────────────────────────────
router.get('/:id/sequences', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await listSequences(id, ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/sequences', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = createSequenceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.status(201).json(await createSequence({ submissionId: id, ...parsed.data }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sequences/:seqId/transition', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = transitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.json(await transitionSequence(seqId, parsed.data.status, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Builder leaves ──────────────────────────────────────────────────────────
router.get('/sequences/:seqId/leaves', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    res.json(await listLeaves(seqId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.put('/sequences/:seqId/leaves', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = upsertLeafSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.json(await upsertLeaf({ sequenceId: seqId, ...parsed.data }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
