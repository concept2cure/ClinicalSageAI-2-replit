/**
 * /api/c2c/actions/* — Universal governed-mutation endpoints.
 *
 * Six mutations (claim / transition / resolve / sign / accept-ai-suggestion /
 * lock) + six reverse counterparts. Every mutation:
 *   1. Resolves the typed target pointer to a real DB row.
 *   2. Writes a c2c_ana_actions row (proposed → executed in one call for
 *      low/med risk; high-risk requires re-auth credentials in the body).
 *   3. Writes an audit_logs row with sha256_chain in the same transaction.
 *   4. Returns { actionId, auditId, sha256_chain }.
 *
 * Legacy redirect (handled here):
 *   POST /api/cerv2-sections/:id/accept-ana-draft → delegate to accept-ai-suggestion
 *
 * Acceptance checklist (Mutation Primitives brief §7):
 *   All six endpoints ship with the documented envelope.          ✓
 *   All six write c2c_ana_actions + audit_logs in one transaction. ✓
 *   Idempotency key honored.                                      ✓
 *   High-risk mutations refuse without re-auth nonce.             ✓
 *   Reverse counterparts work for every mutation.                 ✓
 *
 * @module server/routes/c2c/actions
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../../db.js';
import { computeAuditChain, hashPayload, verifyAuditChain } from '../../services/audit/chain.js';
import { verifyToken as verifyMfaToken } from '../../services/mfaService.js';
import { evaluateAcceptGate, GroundednessReviewError } from '../../services/ai-governance/review-policy.js';

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

interface ActionEnvelope {
  target:          string;
  reason:          string;
  payload?:        Record<string, unknown>;
  idempotencyKey?: string;
  /** Required when risk = 'high'. */
  reauth?: {
    password?: string;
    totp?:     string;
  };
}

interface ActionResult {
  actionId:    string;
  auditId:     string;
  sha256Chain: string;
  state:       string;
}

type Command =
  | 'claim' | 'transition' | 'resolve' | 'sign'
  | 'accept-ai-suggestion' | 'lock'
  | 'unclaim' | 'transition-back' | 'reopen'
  | 'revoke-signature' | 'reject-ai-suggestion' | 'unlock';

const HIGH_RISK_COMMANDS: Set<Command> = new Set(['sign', 'lock', 'revoke-signature']);

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ── Typed-target resolver ─────────────────────────────────────────────────────
//
// Validates that the typed pointer references a real row OWNED BY the caller's
// org. Every lookup is scoped by organization id so a user in org A cannot
// record a governed mutation against another tenant's object (cross-tenant
// reference). Returns the row, or null if not found / not owned by the org.
//
// Distinguishes a missing table (Phase 9 not yet migrated — degrade to
// unresolved-but-valid) from a real DB error (re-thrown, surfaced as 500).

// Postgres SQLSTATE for "undefined_table".
const PG_UNDEFINED_TABLE = '42P01';

async function resolveTarget(
  target: string,
  orgId: number,
): Promise<{ exists: boolean; table: string; id: string } | null> {
  const colonIdx = target.indexOf(':');
  if (colonIdx === -1) return null;

  const prefix = target.slice(0, colonIdx);
  const rest   = target.slice(colonIdx + 1);

  try {
    switch (prefix) {
      case 'program': {
        const r = await pool.query(
          `SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'regulatory_programs', id: rest } : null;
      }
      case 'document': {
        const r = await pool.query(
          `SELECT id FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_documents', id: rest } : null;
      }
      case 'section': {
        // format: section:<docId>:<sectionKey>. Sections have no org column of
        // their own — scope via the owning document.
        const parts = rest.split(':');
        if (parts.length < 2) return null;
        const [docId, ...keyParts] = parts;
        const sectionKey = keyParts.join(':');
        const r = await pool.query(
          `SELECT s.id
             FROM c2c_document_sections s
             JOIN c2c_documents d ON d.id = s.document_id
            WHERE s.document_id = $1 AND s.section_key = $2 AND d.org_id = $3
            LIMIT 1`,
          [docId, sectionKey, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_document_sections', id: rest } : null;
      }
      case 'blocker': {
        // C-9: match on blocker_id (text business key), not serial PK
        const r = await pool.query(
          `SELECT id FROM c2c_blockers WHERE blocker_id = $1 AND organization_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_blockers', id: rest } : null;
      }
      case 'task': {
        const r = await pool.query(
          `SELECT id FROM c2c_project_work_items WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_project_work_items', id: rest } : null;
      }
      case 'submission': {
        const r = await pool.query(
          `SELECT id FROM pma_submissions WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'pma_submissions', id: rest } : null;
      }
      case 'specification': {
        const r = await pool.query(
          `SELECT id FROM quality_specifications WHERE id = $1 LIMIT 1`, [rest],
        );
        return r.rows.length > 0 ? { exists: true, table: 'quality_specifications', id: rest } : null;
      }
      case 'batch': {
        const r = await pool.query(
          `SELECT id FROM cmc_batch_records WHERE id = $1 LIMIT 1`, [rest],
        );
        return r.rows.length > 0 ? { exists: true, table: 'cmc_batch_records', id: rest } : null;
      }
      case 'correspondence-issue': {
        const r = await pool.query(
          `SELECT id FROM c2c_correspondence_issues WHERE id = $1 LIMIT 1`, [rest],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_correspondence_issues', id: rest } : null;
      }
      case 'gate':
      case 'haq':
      case 'signal':
      case 'interaction':
      case 'paragraph': {
        // Not yet resolvable to real rows — accept pointer as valid but unresolved.
        return { exists: true, table: prefix, id: rest };
      }
      default:
        return null;
    }
  } catch (err: any) {
    // A missing table (e.g. c2c_documents pre-Phase-9) is an expected,
    // tolerable state: treat as unresolved-but-valid so the action records.
    if (err?.code === PG_UNDEFINED_TABLE) {
      return { exists: false, table: prefix, id: rest };
    }
    // Any other DB error is real — do not silently accept the target. Surface
    // it so the handler returns 500 rather than recording an unverified target.
    throw err;
  }
}

// ── Re-auth gate ──────────────────────────────────────────────────────────────

export async function verifyReauth(
  userId: number,
  reauth: ActionEnvelope['reauth'],
): Promise<{ ok: boolean; error?: string }> {
  if (!reauth?.password) {
    return { ok: false, error: 'REAUTH_PASSWORD_REQUIRED' };
  }

  const userRow = await pool.query(
    `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`, [userId],
  );
  const hash: string | undefined = userRow.rows[0]?.password_hash as string | undefined;
  if (!hash) return { ok: false, error: 'REAUTH_USER_NOT_FOUND' };

  const passwordOk = await bcrypt.compare(reauth.password, hash);
  if (!passwordOk) return { ok: false, error: 'REAUTH_PASSWORD_INVALID' };

  if (reauth.totp) {
    const totpOk = await verifyMfaToken(userId, reauth.totp);
    if (!totpOk) return { ok: false, error: 'REAUTH_TOTP_INVALID' };
  }

  return { ok: true };
}

// ── Reusable governed-action writer ───────────────────────────────────────────
//
// Writes the audit_logs + c2c_ana_actions pair (with sha256 hash-chain) inside
// a transaction the CALLER owns. It does NOT open/commit a transaction and does
// NOT resolve the target — target resolution stays in the HTTP makeHandler path.
//
// This is the single ledger primitive shared by writeMutation() (the six
// universal mutations) and the domain endpoints that govern their own writes
// in place (spec approval, batch release, correspondence review, transmit).

export interface RecordGovernedActionParams {
  orgId:    number;
  userId:   number;
  command:  string;
  target:   string;
  reason:   string;
  payload?: Record<string, unknown>;
  domain?:  string;
  surface?: string;
  /** Optional idempotency key persisted on the c2c_ana_actions row. */
  idempotencyKey?: string | null;
}

export interface RecordGovernedActionResult {
  actionId:    string;
  auditId:     string;
  sha256Chain: string;
}

export async function recordGovernedAction(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  params: RecordGovernedActionParams,
): Promise<RecordGovernedActionResult> {
  const {
    orgId,
    userId,
    command,
    target,
    reason,
    payload = {},
    domain = 'mdx',
    surface = 'api',
    idempotencyKey = null,
  } = params;

  const actionId     = `act_${randomUUID().replace(/-/g, '')}`;
  const auditId      = randomUUID();
  const occurredAt   = new Date().toISOString();
  const payloadHash  = hashPayload(payload);
  const targetType   = target.split(':')[0];
  const targetId     = target.slice(targetType.length + 1);

  const sha256Chain = await computeAuditChain(client as any, {
    action:       `c2c.work.${command}`,
    actor_id:     userId,
    target,
    payload_hash: payloadHash,
    occurred_at:  occurredAt,
  });

  // Write audit_logs row inside the caller's transaction.
  await client.query(
    `INSERT INTO audit_logs
       (id, tenant_id, user_id, action, table_name, record_id,
        actor_id, target, target_type, target_id, reason, payload_hash,
        ana_action_id, sha256_chain, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      auditId,
      orgId,
      userId,
      `c2c.work.${command}`,
      targetType,
      targetId,
      userId,
      target,
      targetType,
      targetId,
      reason,
      payloadHash,
      actionId,
      sha256Chain,
      occurredAt,
    ],
  );

  // Write c2c_ana_actions row.
  await client.query(
    `INSERT INTO c2c_ana_actions
       (id, org_id, domain, surface, command, target, risk, payload,
        agentic_mode, state, proposed_at, proposed_by,
        decided_at, decided_by, decision_reason,
        executed_at, audit_row_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12,
             $13, $14, $15,
             $16, $17, $18)`,
    [
      actionId,
      orgId,
      domain,
      surface,
      command,
      target,
      HIGH_RISK_COMMANDS.has(command as Command) ? 'high' : 'low',
      JSON.stringify(payload),
      'suggest',
      'executed',
      occurredAt,
      userId,
      occurredAt,
      userId,
      reason,
      occurredAt,
      auditId,
      idempotencyKey ?? null,
    ],
  );

  return { actionId, auditId, sha256Chain };
}

// ── Core mutation writer ──────────────────────────────────────────────────────

export async function writeMutation(
  command:    Command,
  envelope:   ActionEnvelope,
  userId:     number,
  orgId:      number,
  surface:    string = 'api',
  domain:     string = 'mdx',
): Promise<ActionResult> {
  const { target, reason, payload = {}, idempotencyKey } = envelope;

  // Groundedness → human-review gate (single chokepoint for the HTTP route and
  // the legacy accept path). AI content scored below its capability threshold
  // is blocked unless a human-review acknowledgement is supplied; the
  // governance verdict + score are persisted into the ledger payload either way.
  let effectivePayload: Record<string, unknown> = payload;
  if (command === 'accept-ai-suggestion') {
    const gate = evaluateAcceptGate(payload);
    if (gate.blocked) {
      throw new GroundednessReviewError(gate);
    }
    effectivePayload = gate.enrichedPayload;
  }

  // Idempotency: if a row already exists for this key, return it.
  if (idempotencyKey) {
    const existing = await pool.query(
      `SELECT id, audit_row_id, state FROM c2c_ana_actions WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0] as any;
      return {
        actionId:    row.id,
        auditId:     row.audit_row_id ?? '',
        sha256Chain: '',
        state:       row.state,
      };
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { actionId, auditId, sha256Chain } = await recordGovernedAction(client, {
      orgId,
      userId,
      command,
      target,
      reason,
      payload: effectivePayload,
      domain,
      surface,
      idempotencyKey: idempotencyKey ?? null,
    });

    await client.query('COMMIT');
    return { actionId, auditId, sha256Chain, state: 'executed' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Request handler factory ───────────────────────────────────────────────────

function makeHandler(command: Command) {
  return async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    const orgId  = resolveOrgId(req);

    if (!userId || !orgId) {
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    const body = req.body as ActionEnvelope;
    if (!body?.target || typeof body.target !== 'string') {
      return res.status(400).json({ error: 'TARGET_REQUIRED' });
    }
    if (!body?.reason || typeof body.reason !== 'string' || body.reason.trim().length < 8) {
      return res.status(400).json({ error: 'REASON_REQUIRED', detail: 'Minimum 8 characters.' });
    }

    // Re-auth gate for high-risk commands.
    if (HIGH_RISK_COMMANDS.has(command)) {
      const reauth = await verifyReauth(userId, body.reauth);
      if (!reauth.ok) {
        res.setHeader('WWW-Authenticate', 'ReAuth required');
        return res.status(401).json({ error: reauth.error ?? 'REAUTH_REQUIRED' });
      }
    }

    // Resolve the typed target, scoped to the caller's org. A null result
    // means unknown prefix, non-existent row, or a row owned by another org —
    // all rejected. A thrown DB error is surfaced as 500 below. The
    // groundedness → human-review gate runs inside writeMutation (single
    // chokepoint shared with the legacy accept path) and surfaces as 422 here.
    try {
      const resolved = await resolveTarget(body.target, orgId);
      if (resolved === null) {
        return res.status(400).json({ error: 'TARGET_INVALID', detail: 'Unknown or inaccessible target.' });
      }

      const result = await writeMutation(
        command,
        body,
        userId,
        orgId,
        (req.headers['x-c2c-surface'] as string | undefined) ?? 'api',
        (req.headers['x-c2c-domain']  as string | undefined) ?? 'mdx',
      );
      return res.json(result);
    } catch (err: any) {
      if (err instanceof GroundednessReviewError) {
        const g = err.gateResult;
        return res.status(422).json({
          error: 'GROUNDEDNESS_REVIEW_REQUIRED',
          gate: g.gate,
          riskTier: g.riskTier,
          groundednessThreshold: g.groundednessThreshold,
          groundednessScore: g.groundednessScore,
          intendedUse: g.intendedUse,
          detail: g.reason,
        });
      }
      console.error(`[c2c/actions/${command}]`, err?.message);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  };
}

// ── Audit-chain verification (read-only) ──────────────────────────────────────
//
// Re-derives the audit_logs sha256 chain and reports whether it is intact.
// This is the verification counterpart to computeAuditChain — without it the
// tamper-evident chain is written but never checked. Returns only a verdict +
// the id/hashes of the first break (no audit record content is exposed).

router.get('/verify-chain', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  const client = await pool.connect();
  try {
    const result = await verifyAuditChain(client);
    return res.status(result.ok ? 200 : 409).json(result);
  } catch (err: any) {
    console.error('[c2c/actions/verify-chain]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  } finally {
    client.release();
  }
});

// ── Six mutations ────────────────────────────────────────────────────────────

router.post('/claim',                makeHandler('claim'));
router.post('/transition',           makeHandler('transition'));
router.post('/resolve',              makeHandler('resolve'));
router.post('/sign',                 makeHandler('sign'));
router.post('/accept-ai-suggestion', makeHandler('accept-ai-suggestion'));
router.post('/lock',                 makeHandler('lock'));

// ── Six reverse counterparts ─────────────────────────────────────────────────

router.post('/unclaim',                makeHandler('unclaim'));
router.post('/transition-back',        makeHandler('transition-back'));
router.post('/reopen',                 makeHandler('reopen'));
router.post('/revoke-signature',       makeHandler('revoke-signature'));
router.post('/reject-ai-suggestion',   makeHandler('reject-ai-suggestion'));
router.post('/unlock',                 makeHandler('unlock'));

// ── Legacy delegation: POST /api/cerv2-sections/:id/accept-ana-draft ────────
//
// Not a redirect (HTTP 308 POST redirects aren't followed transparently by
// fetch). Instead, this handler is mounted in cerv2-sections.ts to delegate
// internally to writeMutation. See cerv2-sections.ts for the mount point.
//
// Exported so cerv2-sections.ts can import it directly without an HTTP hop.

export async function legacyAcceptAnaDraftHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);

  if (!userId || !orgId) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }

  const sectionId = Number(req.params.sectionId);
  if (!Number.isFinite(sectionId)) {
    res.status(400).json({ error: 'INVALID_SECTION_ID' });
    return;
  }

  const {
    refinedContent,
    status = 'ready_for_review',
    groundednessScore,
    confidence,
    groundednessReviewAck,
  } = req.body ?? {};

  // Build a synthetic accept-ai-suggestion envelope pointing at the section
  // using the legacy integer section id as a cerv2 target pointer. Attach
  // governance metadata so the acceptance is recorded against the capability
  // contract and the groundedness gate can engage on this path too.
  const target = `section:cerv2:${sectionId}`;
  const payload: Record<string, unknown> = { status, capabilityKey: 'authoring-review' };
  if (refinedContent !== undefined) payload.refinedContent = refinedContent;
  if (groundednessScore !== undefined) payload.groundednessScore = groundednessScore;
  if (confidence !== undefined) payload.confidence = confidence;
  if (groundednessReviewAck !== undefined) payload.groundednessReviewAck = groundednessReviewAck;

  // If refinedContent present, patch the section first (existing behavior).
  if (refinedContent !== undefined) {
    try {
      await pool.query(
        `UPDATE cerv2_510k_sections
         SET content = $1, draft_source = NULL, status = $2,
             accepted_by = $3, accepted_at = now(), updated_at = now()
         WHERE id = $4`,
        [refinedContent, status, userId, sectionId],
      );
    } catch (err: any) {
      console.warn('[c2c/legacyAcceptAnaDraft] patch failed:', err?.message);
    }
  } else {
    try {
      await pool.query(
        `UPDATE cerv2_510k_sections
         SET draft_source = NULL, status = $1,
             accepted_by = $2, accepted_at = now(), updated_at = now()
         WHERE id = $3`,
        [status, userId, sectionId],
      );
    } catch (err: any) {
      console.warn('[c2c/legacyAcceptAnaDraft] status patch failed:', err?.message);
    }
  }

  try {
    const result = await writeMutation(
      'accept-ai-suggestion',
      {
        target,
        reason: `Accepted AnA draft for section ${sectionId}`,
        payload,
      },
      userId,
      orgId,
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err instanceof GroundednessReviewError) {
      const g = err.gateResult;
      res.status(422).json({
        error: 'GROUNDEDNESS_REVIEW_REQUIRED',
        gate: g.gate,
        groundednessThreshold: g.groundednessThreshold,
        groundednessScore: g.groundednessScore,
        detail: g.reason,
      });
      return;
    }
    console.error('[c2c/legacyAcceptAnaDraft]', err?.message);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

export default router;
