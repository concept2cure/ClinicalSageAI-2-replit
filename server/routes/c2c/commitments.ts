/**
 * /api/c2c/commitments/* — regulatory commitment tracking.
 *
 * Extract source-anchored inbound + outbound commitments from documents, track
 * them as Claims with a deadline + owner + provenance, and govern status
 * changes with a 21 CFR Part 11 audit entry. Reuses the platform spine
 * (AI gateway extraction, audit hash-chain). UI hook for the commitments surface.
 *
 * @module server/routes/c2c/commitments
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../../db.js';
import { computeAuditChain, hashPayload } from '../../services/audit/chain.js';
import {
  extractCommitments,
  createCommitment,
  listCommitments,
  updateCommitmentStatus,
  type CommitmentDirection,
  type CommitmentStatus,
} from '../../services/commitments/commitments-service.js';

const router = Router();

function resolveUserId(req: Request): number | null {
  const raw = (req as any).userId ?? (req as any).user?.id;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveOrgId(req: Request): number | null {
  const raw =
    (req as any).organizationId ??
    (req as any).tenantId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).user?.organizationId;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** GET /api/c2c/commitments — list, filterable by projectId/direction/status. */
router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const rows = await listCommitments(orgId, {
      projectId: req.query.projectId ? Number(req.query.projectId) : undefined,
      direction: req.query.direction as CommitmentDirection | undefined,
      status: req.query.status as CommitmentStatus | undefined,
    });
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('[c2c/commitments/list]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** POST /api/c2c/commitments — create a single commitment manually. */
router.post('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const b = req.body ?? {};
  if (!b.title || typeof b.title !== 'string') {
    return res.status(400).json({ error: 'TITLE_REQUIRED' });
  }
  try {
    const { id } = await createCommitment({
      organizationId: orgId,
      projectId: b.projectId ?? null,
      createdBy: userId,
      extractedBy: 'human',
      commitment: {
        direction: b.direction === 'outbound' ? 'outbound' : 'inbound',
        commitmentType: b.commitmentType ?? 'other',
        authority: b.authority ?? null,
        title: b.title,
        description: b.description ?? null,
        sourceQuote: b.sourceQuote ?? null,
        sourceLocator: b.sourceLocator ?? null,
        sourceDocumentId: b.sourceDocumentId ?? null,
        owner: b.owner ?? null,
        dueDate: b.dueDate ?? null,
        dueDateText: b.dueDateText ?? null,
        groundedness: 1,
      },
    });
    return res.json({ success: true, data: { id } });
  } catch (err: any) {
    if (err?.message === 'COMMITMENTS_TABLE_MISSING') return res.status(503).json({ error: 'COMMITMENTS_TABLE_MISSING' });
    console.error('[c2c/commitments/create]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/c2c/commitments/extract — extract commitments from document text.
 * Body: { text, documentId?, projectId?, persist? (default true) }.
 * Extracted commitments persist as status='proposed', needs_review=true.
 */
router.post('/extract', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const text = String(req.body?.text ?? '');
  if (text.trim().length < 20) return res.status(400).json({ error: 'TEXT_REQUIRED', detail: 'Provide document text to extract from.' });
  const persist = req.body?.persist !== false;
  try {
    const extracted = await extractCommitments(text, { documentId: req.body?.documentId });
    let created: string[] = [];
    if (persist && extracted.length > 0) {
      for (const c of extracted) {
        try {
          const { id } = await createCommitment({
            organizationId: orgId,
            projectId: req.body?.projectId ?? null,
            createdBy: userId,
            extractedBy: 'ana',
            commitment: { ...c, sourceDocumentId: req.body?.documentId ?? null },
          });
          created.push(id);
        } catch (e: any) {
          if (e?.message === 'COMMITMENTS_TABLE_MISSING') break;
        }
      }
    }
    return res.json({
      success: true,
      data: { extracted, createdIds: created, count: extracted.length, persisted: created.length },
    });
  } catch (err: any) {
    console.error('[c2c/commitments/extract]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * PATCH /api/c2c/commitments/:id/status — governed status change.
 * Body: { status, reason (>=8), clearReview?, linkedTaskId? }. Writes a Part 11 audit.
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const status = String(req.body?.status ?? '') as CommitmentStatus;
  const reason = String(req.body?.reason ?? '');
  if (!status) return res.status(400).json({ error: 'STATUS_REQUIRED' });
  if (reason.trim().length < 8) return res.status(400).json({ error: 'REASON_REQUIRED', detail: 'Minimum 8 characters.' });
  try {
    const updated = await updateCommitmentStatus(orgId, String(req.params.id), status, {
      clearReview: req.body?.clearReview === true,
      linkedTaskId: typeof req.body?.linkedTaskId === 'string' ? req.body.linkedTaskId : undefined,
    });
    if (!updated) return res.status(404).json({ error: 'COMMITMENT_NOT_FOUND' });
    await writeCommitmentAudit(orgId, userId, String(req.params.id), status, reason).catch(() => undefined);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err?.message === 'COMMITMENTS_TABLE_MISSING') return res.status(503).json({ error: 'COMMITMENTS_TABLE_MISSING' });
    console.error('[c2c/commitments/status]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** Best-effort 21 CFR Part 11 audit (hash-chained) for a commitment status change. */
async function writeCommitmentAudit(
  orgId: number, userId: number | null, id: string, status: string, reason: string,
): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const occurredAt = new Date().toISOString();
    const payloadHash = hashPayload({ id, status });
    const target = `commitment:${id}`;
    const sha256Chain = await computeAuditChain(client as any, {
      action: 'c2c.commitment.status', actor_id: userId, target, payload_hash: payloadHash, occurred_at: occurredAt,
    });
    await client.query(
      `INSERT INTO audit_logs
         (id, tenant_id, user_id, action, table_name, record_id, actor_id, target,
          target_type, target_id, reason, payload_hash, ana_action_id, sha256_chain, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [randomUUID(), orgId, userId, 'c2c.commitment.status', 'c2c_commitments', id, userId,
       target, 'commitment', id, reason, payloadHash, null, sha256Chain, occurredAt],
    );
    await client.query('COMMIT');
  } catch {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
  } finally {
    client.release();
  }
}

export default router;
