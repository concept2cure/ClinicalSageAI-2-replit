/**
 * /api/orchestration/checkpoints — read the PERSISTED approval-checkpoint
 * gates (shared/schema/orchestration.ts `approval_checkpoints`, written by
 * the PDEV workflow bridge and any future chain writers).
 *
 * The main orchestration router serves the in-memory execution engine; this
 * router is deliberately a separate, dependency-light module so the persisted
 * read stays mountable (and testable) without importing the whole Phase-3
 * service graph.
 *
 * Contract (consumed by the v2 Orchestration surface via useLive):
 *   GET /api/orchestration/checkpoints?limit=50
 *     → { data: [{ id, stepName, gateType, status, workflowRunId, runName,
 *          runStatus, requiredApproverRoles, requiredApproverCount,
 *          approvals, protectedAction, proposedAt, resolvedAt }],
 *         meta: { count } }
 *
 *   POST /api/orchestration/checkpoints/:id/decision
 *     body { decision, comment? } → records ONE approver's decision on a gate.
 *     Attributed and audited, quorum- and role-enforced — and explicitly NOT a
 *     21 CFR §11.50 electronic signature (see the block comment on the route).
 *
 * Org-scoped through the owning workflow_runs row (approval_checkpoints carries
 * no organization_id of its own). Fails closed to an empty envelope (42P01) on
 * the read when the store is not provisioned.
 *
 * @module server/routes/orchestration-checkpoints
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';

const router = Router();

/** Same resolution chain as routes/orchestration.ts, but null instead of throw. */
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw =
    r.tenantContext?.organizationId ?? r.organizationId ?? r.user?.organizationId;
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

// Mounted at /api/orchestration/checkpoints (its own sub-prefix), so the
// list lives at the router root.
router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (orgId == null) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

  try {
    const { rows } = await pool.query(
      `SELECT c.id,
              c.step_name               AS "stepName",
              c.gate_type               AS "gateType",
              c.status,
              c.workflow_run_id         AS "workflowRunId",
              r.display_name            AS "runName",
              r.status                  AS "runStatus",
              c.required_approver_roles AS "requiredApproverRoles",
              c.required_approver_count AS "requiredApproverCount",
              c.approvals,
              c.protected_action        AS "protectedAction",
              c.proposed_at             AS "proposedAt",
              c.resolved_at             AS "resolvedAt"
         FROM approval_checkpoints c
         JOIN workflow_runs r ON r.id = c.workflow_run_id
        WHERE r.organization_id = $1
        ORDER BY c.proposed_at DESC
        LIMIT $2`,
      [orgId, limit],
    );
    return res.json({ data: rows, meta: { count: rows.length } });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '42P01') {
      // Store not provisioned — fail closed so the surface keeps its fixture.
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    console.error('[orchestration/checkpoints] GET /checkpoints', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/checkpoints/:id/decision
//   body: { decision: 'approved' | 'rejected' | 'escalated' | 'needs_revision',
//           comment?: string }
//
// Record ONE approver's decision on a human-in-the-loop gate.
//
// ── What this is, and what it is NOT ─────────────────────────────────────────
// This records an ATTRIBUTED, AUDITED approval decision. It is NOT a 21 CFR
// §11.50 electronic signature: no signer identity is re-verified at the moment
// of signing, and nothing is cryptographically bound to a frozen record. The
// platform's real signature path is server/routes/authoring.router.ts, which is
// PIN-verified and sealed against a frozen document version.
//
// That distinction is the whole reason this route is written the way it is. The
// surface previously wrote the decision into local React state with a fabricated
// `when: 'just now'` and rendered "✓ Approved" — a completed, timestamped
// approval that existed nowhere. In a regulated product that is the most
// dangerous affordance on the surface, because the gate is what stands between
// a proposal and a protected action. Recording nothing is safer than that;
// recording an attributed, audited, quorum-enforced decision is better than
// either, PROVIDED it never claims to be a signature. The response and the UI
// copy both say plainly which one it is.
//
// ── Governance actually enforced here ────────────────────────────────────────
//   • tenant  — via JOIN workflow_runs, the same scoping the GET above uses;
//               approval_checkpoints has no organization_id of its own.
//   • roles   — when required_approver_roles is non-empty the caller must hold
//               one of them. A gate that names its approvers and then accepts
//               anyone is not a gate.
//   • quorum  — status flips to 'approved' only once the number of DISTINCT
//               approving approvers reaches required_approver_count.
//   • one decision per approver — a second submission is refused, so one person
//               cannot satisfy a 2-of-3 quorum alone.
//   • time    — decidedAt is the database clock, never a client-supplied value.
//
// ── The rejection asymmetry, stated rather than papered over ─────────────────
// workflow_step_status is ('proposed','awaiting_review','approved','executed',
// 'failed','skipped'). There is no 'rejected' member. 'failed' means the step
// failed to execute, which is a different fact. So a rejection is recorded in
// the approvals array and in rejection_reason, and the gate's status is left
// where it is — genuinely still unresolved, which is the truth. The response
// returns `statusChanged: false` so the client cannot imply otherwise.
// ═══════════════════════════════════════════════════════════════════════════════

/** Decisions an approver may record — mirrors ApprovalRecord['decision']. */
const DECISIONS = new Set(['approved', 'rejected', 'escalated', 'needs_revision']);

/** Statuses that can still take a decision; anything else is already resolved. */
const OPEN_STATUSES = new Set(['proposed', 'awaiting_review']);

const MAX_COMMENT_CHARS = 5_000;

router.post('/:id/decision', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (orgId == null) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const r = req as any;
  const actorId = String(r.user?.userId ?? r.user?.id ?? '');
  if (!actorId) {
    return res.status(401).json({ error: 'Authenticated user required' });
  }
  const actorName = String(r.user?.name ?? r.user?.email ?? 'Unknown user');
  const actorRole = String(r.user?.role ?? '').toLowerCase();

  const checkpointId = String(req.params.id ?? '');
  // uuid PK — reject anything that is not one before it reaches Postgres, so a
  // malformed id is a 400 rather than a 22P02 surfaced as a 500.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkpointId)) {
    return res.status(400).json({ error: 'Invalid checkpoint id' });
  }

  const decision = String(req.body?.decision ?? '');
  if (!DECISIONS.has(decision)) {
    return res.status(400).json({
      error: `decision must be one of: ${[...DECISIONS].join(', ')}`,
    });
  }

  const rawComment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
  if (rawComment.length > MAX_COMMENT_CHARS) {
    return res.status(413).json({ error: `comment exceeds ${MAX_COMMENT_CHARS} characters` });
  }
  // A rejection without a reason is not reviewable later.
  if (decision === 'rejected' && !rawComment) {
    return res.status(400).json({ error: 'A rejection requires a comment explaining it' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // The row lock matters: the quorum count below is read-then-written, so two
    // approvers landing together must serialize or a 2-of-3 gate can be closed
    // by two racing writes that each saw one prior approval.
    //
    // Tenancy is an EXISTS rather than a JOIN so that the lock scope stays
    // exactly one table. `FOR UPDATE` locks every table in the FROM clause, so
    // the join form would also have locked the workflow_runs row and serialized
    // approvers working on DIFFERENT gates of the same run. The subquery is not
    // in the FROM, so only approval_checkpoints is locked — the same scope the
    // explicit `OF c` gave, without the `FOR UPDATE OF` token that
    // scripts/ci/check-unbacked-tables.mjs used to misread as a write against a
    // table named "of" — its REF_RE matched the UPDATE keyword and captured the
    // next identifier, with no way to see the preceding FOR. Fixed by a
    // lookbehind in that script; see issue #1302. Note the wording here is
    // deliberate: this file's `//` comments are NOT stripped by that scanner
    // (it strips only block and SQL comments), so spelling the trigger out in
    // prose would recreate the phantom it describes.
    const { rows } = await client.query(
      `SELECT c.id, c.status, c.approvals, c.required_approver_count AS "requiredCount",
              c.required_approver_roles AS "requiredRoles", c.protected_action AS "protectedAction",
              c.step_name AS "stepName"
         FROM approval_checkpoints c
        WHERE c.id = $1
          AND EXISTS (
                SELECT 1 FROM workflow_runs r
                 WHERE r.id = c.workflow_run_id AND r.organization_id = $2
              )
        FOR UPDATE`,
      [checkpointId, orgId],
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Checkpoint not found' });
    }

    const cp = rows[0] as {
      status: string;
      approvals: Array<Record<string, unknown>> | null;
      requiredCount: number | null;
      requiredRoles: string[] | null;
      protectedAction: string;
      stepName: string;
    };

    if (!OPEN_STATUSES.has(cp.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Gate is ${cp.status}; only a proposed or awaiting_review gate can take a decision`,
      });
    }

    const requiredRoles = (cp.requiredRoles ?? []).map(x => String(x).toLowerCase());
    if (requiredRoles.length && !requiredRoles.includes(actorRole)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: `This gate requires one of: ${requiredRoles.join(', ')}`,
      });
    }

    const existing = Array.isArray(cp.approvals) ? cp.approvals : [];
    if (existing.some(a => String((a as { approverId?: unknown }).approverId ?? '') === actorId)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You have already recorded a decision on this gate' });
    }

    // decidedAt comes from the database clock. A client-supplied timestamp on a
    // governed approval is exactly the fabrication this route exists to remove.
    const { rows: nowRows } = await client.query('SELECT NOW() AS now');
    const decidedAt = new Date(nowRows[0].now).toISOString();

    const record = {
      approverId: actorId,
      approverName: actorName,
      approverRole: actorRole || 'user',
      decision,
      ...(rawComment ? { comment: rawComment } : {}),
      decidedAt,
    };

    const nextApprovals = [...existing, record];
    const approvedCount = nextApprovals.filter(
      a => String((a as { decision?: unknown }).decision ?? '') === 'approved',
    ).length;
    const requiredCount = Math.max(1, Number(cp.requiredCount ?? 1) || 1);
    const quorumMet = decision === 'approved' && approvedCount >= requiredCount;

    await client.query(
      `UPDATE approval_checkpoints
          SET approvals        = $2::json,
              status           = CASE WHEN $3::boolean THEN 'approved'::workflow_step_status ELSE status END,
              resolved_at      = CASE WHEN $3::boolean THEN NOW() ELSE resolved_at END,
              review_started_at = COALESCE(review_started_at, NOW()),
              rejection_reason = CASE WHEN $4::text <> '' THEN $4::text ELSE rejection_reason END
        WHERE id = $1`,
      [checkpointId, JSON.stringify(nextApprovals), quorumMet, decision === 'rejected' ? rawComment : ''],
    );

    // 21 CFR Part 11 §11.10(e), same transaction as the decision it describes.
    // `signature` is recorded as false so the trail never implies this was one.
    await client.query(
      `INSERT INTO audit_events
         (organization_id, event_type, entity_type, entity_id, user_id, user_name,
          user_role, ip_address, timestamp, reason, metadata,
          regulatory_significant, gxp_relevant, created_at)
       VALUES ($1, 'orchestration.gate_decision', 'approval_checkpoint', 0, $2, $3, $4, $5,
               NOW(), $6, $7, true, true, NOW())`,
      [
        orgId,
        Number.isFinite(Number(actorId)) && Number(actorId) > 0 ? Number(actorId) : null,
        actorName,
        actorRole || 'user',
        req.ip ?? '',
        `Gate decision: ${decision} on "${cp.stepName}"`,
        JSON.stringify({
          checkpointId,
          decision,
          protectedAction: cp.protectedAction,
          approvedCount,
          requiredCount,
          quorumMet,
          isElectronicSignature: false,
        }),
      ],
    );

    await client.query('COMMIT');

    return res.json({
      data: {
        checkpointId,
        decision,
        decidedAt,
        approvedCount,
        requiredCount,
        /** True only when this decision closed the gate. */
        statusChanged: quorumMet,
        status: quorumMet ? 'approved' : cp.status,
        /** Stated explicitly so no caller can present this as a signature. */
        isElectronicSignature: false,
      },
    });
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({ error: 'APPROVAL_CHECKPOINT_STORE_MISSING' });
    }
    console.error('[orchestration/checkpoints] POST /:id/decision', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  } finally {
    client.release();
  }
});

export default router;
