/**
 * Protocol Review & Comment API — Capability C2C-18c
 *
 * Governed protocol review workflow: assign reviewers (by review role), add
 * section-anchored severity-graded comments, resolve comments, record a reviewer
 * disposition, and read a derived consensus/readiness summary. Every mutation runs
 * BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped; the summary read needs
 * no transaction. Mounted at /api/protocol-reviews.
 *
 * @module server/routes/protocol-reviews
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  assignReviewerTx,
  addCommentTx,
  resolveCommentTx,
  setDispositionTx,
  getReviewSummary,
} from '../services/protocol-reviews/protocol-reviews-service';
import {
  recordReviewerAssigned, recordReviewComment, recordReviewDisposition,
} from '../services/protocol-reviews-metrics';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';

const router = Router();

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');

async function governed(
  req: Request,
  res: Response,
  command: string,
  reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Reviewer assignments ────────────────────────────────────────────────────

const reviewerSchema = z.object({
  reviewerName: z.string().min(1).max(300),
  reviewerUserId: z.number().int().positive().optional(),
  role: z.enum(['scientific', 'statistical', 'ethics', 'safety', 'regulatory', 'general']).optional(),
  dueDate: z.string().max(40).optional(),
  reason,
});
router.post('/documents/:id/reviewers', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = reviewerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: aid, role } = await assignReviewerTx(client, orgId, userId, id, parsed.data);
    recordReviewerAssigned(role);
    return { target: `protocol-document:${id}`, payload: { assignmentId: aid, role }, body: { documentId: id, assignmentId: aid } };
  });
});

// ─── Comments ────────────────────────────────────────────────────────────────

const commentSchema = z.object({
  comment: z.string().min(1).max(8000),
  assignmentId: z.number().int().positive().optional(),
  sectionRef: z.string().max(200).optional(),
  severity: z.enum(['blocking', 'major', 'minor', 'info']).optional(),
  reason,
});
router.post('/documents/:id/comments', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = commentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: cid, severity } = await addCommentTx(client, orgId, userId, id, parsed.data);
    recordReviewComment(severity ?? 'info');
    return { target: `protocol-document:${id}`, payload: { commentId: cid, severity }, body: { documentId: id, commentId: cid } };
  });
});

const resolveSchema = z.object({ reason });
router.patch('/comments/:id/resolve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = resolveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await resolveCommentTx(client, orgId, id);
    return { target: `protocol-review-comment:${id}`, body: { commentId: id, resolved: true } };
  });
});

// ─── Dispositions ────────────────────────────────────────────────────────────

const dispositionSchema = z.object({
  disposition: z.enum(['approve', 'approve_with_changes', 'reject', 'abstain']),
  reason,
});
router.patch('/assignments/:id/disposition', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = dispositionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId) => {
    const { disposition } = await setDispositionTx(client, orgId, id, parsed.data.disposition);
    recordReviewDisposition(disposition);
    return { target: `protocol-review-assignment:${id}`, payload: { disposition }, body: { assignmentId: id, disposition } };
  });
});

// ─── Read: consensus + readiness summary ─────────────────────────────────────

router.get('/documents/:id/summary', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getReviewSummary(orgId, id)); } catch (err) { fail(res, err); }
});

export default router;
