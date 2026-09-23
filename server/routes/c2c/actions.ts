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
 * `sign` additionally persists a 21 CFR Part 11 electronic_signatures row in
 * the SAME transaction as the ledger pair (single e-signature write path — see
 * server/services/part11/signature-persistence.ts). A governed sign lands in
 * both substrates or in neither. Its reverse counterpart `revoke-signature`
 * closes the §11.70 supersession chain in that same transaction: it marks the
 * revoked signature superseded and records the revocation as its own
 * attributable row, or — when no live signature is anchored to the target —
 * refuses (409 REVOCATION_TARGET_UNRESOLVED) and writes nothing at all.
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
import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import {
  computeAuditChainSealed,
  hashPayload,
  verifyAuditChain,
  AuditChainPartialViewError,
  AuditChainSchemaMissingError,
} from '../../services/audit/chain.js';
import { withTenantConnection } from '../../db/withTenantConnection.js';
import { setTenantContextTx } from '../../services/tenant/governed-tenant-context.js';
import {
  reverifySigner,
  type ReverifySignerDeps,
  type SignerRefused,
} from '../../services/part11/reverify-signer.js';
import { signerReverificationDeps } from '../../services/part11/reverify-signer-deps.js';
import { evaluateAcceptGate, GroundednessReviewError } from '../../services/ai-governance/review-policy.js';
import {
  assertSignerIsNotAuthor,
  SeparationOfDutiesAuthorUnresolvedError,
  SeparationOfDutiesError,
  SeparationOfDutiesUnverifiedError,
} from '../../services/governance/separation-of-duties.js';
import { can } from '../../services/governance/permissions.js';
import {
  persistGovernedSignSignature,
  persistGovernedSignatureRevocation,
  SignatureRevocationUnresolvedError,
} from '../../services/part11/signature-persistence.js';

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
  | 'revoke-signature' | 'reject-ai-suggestion' | 'unlock'
  // Submission-gateway operator-initiated rollback. Counterpart to `sign` for
  // FDA ESG transmittals: the kit cannot un-send bytes to FDA, but the audit
  // trail records the rollback alongside a WebTrader retraction. See
  // server/services/submission-gateways/fda-esg.ts#rollbackTransmittal and
  // docs/runbooks/fda-esg-production-uat.md §11 (FIX 6).
  | 'transmittal_rollback';

const HIGH_RISK_COMMANDS: Set<Command> = new Set(['sign', 'lock', 'revoke-signature', 'transmittal_rollback']);

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

/**
 * `rowBacked` is true only when an org-scoped row was actually found. A pointer
 * type with no table yet, or a table not migrated, is accepted for claim /
 * transition bookkeeping but is NOT row-backed, and a Part 11 signature or a
 * lock must attach to a real record (checked by the handler).
 */
type ResolvedTarget = { exists: boolean; table: string; id: string; rowBacked: boolean };

async function resolveTarget(
  target: string,
  orgId: number,
): Promise<ResolvedTarget | null> {
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
        return r.rows.length > 0 ? { exists: true, table: 'regulatory_programs', id: rest, rowBacked: true } : null;
      }
      case 'document': {
        const r = await pool.query(
          `SELECT id FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_documents', id: rest, rowBacked: true } : null;
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
        return r.rows.length > 0 ? { exists: true, table: 'c2c_document_sections', id: rest, rowBacked: true } : null;
      }
      case 'blocker': {
        // C-9: match on blocker_id (text business key), not serial PK
        const r = await pool.query(
          `SELECT id FROM c2c_blockers WHERE blocker_id = $1 AND org_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_blockers', id: rest, rowBacked: true } : null;
      }
      case 'task': {
        const r = await pool.query(
          `SELECT id FROM c2c_project_work_items WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_project_work_items', id: rest, rowBacked: true } : null;
      }
      case 'submission': {
        const r = await pool.query(
          `SELECT id FROM pma_submissions WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'pma_submissions', id: rest, rowBacked: true } : null;
      }
      case 'ectd-sequence': {
        // eCTD sequence freeze/dispatch e-signature target (the SUBMIT step).
        const r = await pool.query(
          `SELECT id FROM ectd_sequences WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'ectd_sequences', id: rest, rowBacked: true } : null;
      }
      case 'specification': {
        const r = await pool.query(
          // Tenant-scoped (2026-09-22): this looked up by id alone, so a user in
          // one organization could act on — and sign — another's specification.
          `SELECT id FROM quality_specifications WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'quality_specifications', id: rest, rowBacked: true } : null;
      }
      case 'batch': {
        const r = await pool.query(
          `SELECT id FROM cmc_batch_records WHERE id = $1 AND organization_id = $2 LIMIT 1`, [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'cmc_batch_records', id: rest, rowBacked: true } : null;
      }
      case 'correspondence-issue': {
        const r = await pool.query(
          `SELECT i.id FROM c2c_correspondence_issues i
             JOIN c2c_correspondence c ON c.id = i.correspondence_id
            WHERE i.id = $1 AND c.organization_id = $2 LIMIT 1`, [rest, orgId],
        );
        return r.rows.length > 0 ? { exists: true, table: 'c2c_correspondence_issues', id: rest, rowBacked: true } : null;
      }
      case 'gate':
      case 'haq':
      case 'signal':
      case 'interaction':
      case 'paragraph': {
        // Not yet resolvable to real rows — accept pointer as valid but unresolved.
        // Not row-backed: it may be claimed or transitioned, never signed or locked.
        return { exists: true, table: prefix, id: rest, rowBacked: false };
      }
      default:
        return null;
    }
  } catch (err: any) {
    // A missing table (e.g. c2c_documents pre-Phase-9) is an expected,
    // tolerable state: treat as unresolved-but-valid so the action records.
    if (err?.code === PG_UNDEFINED_TABLE) {
      return { exists: false, table: prefix, id: rest, rowBacked: false };
    }
    // Any other DB error is real — do not silently accept the target. Surface
    // it so the handler returns 500 rather than recording an unverified target.
    throw err;
  }
}

// ── Re-auth gate ──────────────────────────────────────────────────────────────

/** The canonical refusal, in the REAUTH_* vocabulary this route's clients read. */
const REAUTH_ERROR: Record<SignerRefused['code'], string> = {
  PASSWORD_REQUIRED: 'REAUTH_PASSWORD_REQUIRED',
  PASSWORD_VERIFICATION_FAILED: 'REAUTH_PASSWORD_INVALID',
  MFA_TOKEN_REQUIRED: 'REAUTH_TOTP_REQUIRED',
  MFA_VERIFICATION_FAILED: 'REAUTH_TOTP_INVALID',
  MFA_STATE_UNKNOWN: 'REAUTH_MFA_STATE_UNKNOWN',
  ACCOUNT_LOCKED: 'REAUTH_ACCOUNT_LOCKED',
  ACCOUNT_STATE_UNKNOWN: 'REAUTH_ACCOUNT_STATE_UNKNOWN',
};

/**
 * §11.200 re-authentication for every high-risk governed action: the release
 * signature, CMC batch release, Module 3 approval, 510(k) eSTAR filing, gateway
 * transmittals.
 *
 * The rule is the canonical one (services/part11/reverify-signer): the password
 * always, and the second factor whenever the signer has one enrolled. It used
 * to verify a TOTP only when the caller chose to send one, so a signer who had
 * enrolled an authenticator could sign with the password alone here while the
 * QMS approval and /api/esignature/sign refused the same signature.
 *
 * One rule is added on top: a code that is presented must verify, even for a
 * signer with no second factor enrolled (where the canonical rule does not look
 * at it). Five callers record the signature's factors from the request —
 * 'password+totp' whenever a code is present — and this keeps that record true.
 */
export async function verifyReauth(
  userId: number,
  reauth: ActionEnvelope['reauth'],
  deps: ReverifySignerDeps = signerReverificationDeps(),
): Promise<{ ok: boolean; error?: string }> {
  const verified = await reverifySigner(
    userId,
    { password: reauth?.password, mfaToken: reauth?.totp },
    deps,
  );
  if (!verified.ok) return { ok: false, error: REAUTH_ERROR[verified.code] };

  if (reauth?.totp && !verified.secondFactorVerified) {
    const presentedCodeVerifies = await deps.verifyMfaToken(userId, reauth.totp).catch(() => false);
    if (!presentedCodeVerifies) return { ok: false, error: 'REAUTH_TOTP_INVALID' };
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

  const { sha256Chain, hmacSeal } = await computeAuditChainSealed(client as any, {
    tenant_id:    orgId,
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
        ana_action_id, sha256_chain, occurred_at, hmac_seal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
      hmacSeal,
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
  /**
   * Optional caller-owned transaction client. When supplied, the governed-action
   * writes run on THIS client (no own BEGIN/COMMIT/release) so the audit commits
   * or rolls back ATOMICALLY with the caller's mutation. The caller owns the
   * transaction lifecycle. When omitted, writeMutation manages its own
   * transaction (the default, unchanged).
   */
  externalClient?: PoolClient,
  /**
   * Request-derived context for the Part 11 signature row a `sign` command
   * persists (see below). Only attribution metadata — never credentials.
   */
  signContext?: { ipAddress?: string | null },
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

  // Idempotency: if a row already exists for this key, return it. Read via the
  // caller's transaction client when one was supplied so the check participates in
  // the same transaction as the write.
  const reader: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> } =
    externalClient ?? pool;
  if (idempotencyKey) {
    const existing = await reader.query(
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

  // The governed writes for one action, run on whichever client owns the
  // transaction. For `sign` this is the SINGLE e-signature write path: the
  // sha256-chained ledger pair AND the Part 11 electronic_signatures row are
  // written on the SAME client, so a governed sign lands in both substrates or
  // in neither (a Part 11 inspector querying electronic_signatures sees every
  // governed sign). persistGovernedSignSignature throws → the transaction rolls
  // back → no ledger row without a signature row, and vice versa.
  const executeGovernedWrites = async (
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  ): Promise<RecordGovernedActionResult> => {
    const recorded = await recordGovernedAction(client, {
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
    if (command === 'sign' || command === 'revoke-signature') {
      // Attribution honesty: record only the re-auth factors verifyReauth
      // actually verified for this envelope (password always for the HTTP
      // path; TOTP only when supplied). A programmatic call without re-auth
      // credentials is recorded as 'session', never as a password check that
      // did not happen.
      const reauth = envelope.reauth;
      const signatureParams = {
        orgId,
        userId,
        target,
        reason,
        payload: effectivePayload,
        actionId: recorded.actionId,
        auditId: recorded.auditId,
        sha256Chain: recorded.sha256Chain,
        authenticationMethod: reauth?.password
          ? (reauth?.totp ? 'password+totp' : 'password')
          : 'session',
        secondFactorVerified: Boolean(reauth?.totp),
        ipAddress: signContext?.ipAddress ?? null,
        occurredAt: new Date(),
      };
      if (command === 'sign') {
        await persistGovernedSignSignature(client, signatureParams);
      } else {
        // §11.70 supersession, on the SAME client as the revocation's ledger
        // pair: the revoked signature is marked superseded and the revocation
        // is itself recorded as an attributable row. An unresolvable target
        // throws → the whole revocation rolls back (a governed revocation
        // lands in ledger AND electronic_signatures, or in neither).
        await persistGovernedSignatureRevocation(client, signatureParams);
      }
    }
    return recorded;
  };

  // Caller-owned transaction: run the governed-action writes on their client so
  // the audit and the caller's mutation commit or roll back together. No
  // BEGIN/COMMIT/release here — the caller owns the transaction lifecycle.
  if (externalClient) {
    await setTenantContextTx(externalClient, orgId);
    const { actionId, auditId, sha256Chain } = await executeGovernedWrites(externalClient);
    return { actionId, auditId, sha256Chain, state: 'executed' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Stamp tenant context transaction-locally so the governed-action inserts
    // (audit_logs, c2c_ana_actions — both org-keyed) satisfy row-level security
    // when RLS_ENFORCE=on. Without this the flagship governed-write path would
    // fail the RLS WITH CHECK the moment enforcement is flipped on. Matches the
    // research/protocol governed family (e.g. effort-certification.ts).
    await setTenantContextTx(client, orgId);

    const { actionId, auditId, sha256Chain } = await executeGovernedWrites(client);

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

      // Separation of duties (un-disableable): the signer/approver must not be
      // the author/owner of the target. Admin may only tighten (four-eyes),
      // never loosen — so this is a hard code path, not a permission row.
      if ((command === 'sign' || command === 'lock') && !resolved.rowBacked) {
        return res.status(400).json({
          error: 'TARGET_NOT_SIGNABLE',
          detail: 'A signature or lock must attach to a real record in this organization; this target does not resolve to one.',
        });
      }
      if (command === 'sign' || command === 'lock') {
        await assertSignerIsNotAuthor(body.target, orgId, userId, { command, meaning: body.payload?.meaning });
      }

      // RBAC authority gate (dark-launched behind GOVERNANCE_RBAC_ENFORCE).
      // The actor's role must hold the permission for the action x target type,
      // evaluated against the permission-atom engine (defaults + per-org grants).
      // Off by default so it is validated against real role data before it gates
      // live signing; enforcement is the projection of permission, not the task.
      if (
        process.env.GOVERNANCE_RBAC_ENFORCE === 'true' &&
        (command === 'sign' || command === 'lock')
      ) {
        const actorRole = String((req as any).userRole ?? (req as any).user?.role ?? '');
        const resourceType = body.target.split(':')[0];
        if (!(await can(orgId, actorRole, { action: command, resourceType }))) {
          return res.status(403).json({
            error: 'NOT_AUTHORIZED',
            detail: `Your role does not hold ${command} permission for ${resourceType}.`,
          });
        }
      }

      const result = await writeMutation(
        command,
        body,
        userId,
        orgId,
        (req.headers['x-c2c-surface'] as string | undefined) ?? 'api',
        (req.headers['x-c2c-domain']  as string | undefined) ?? 'mdx',
        undefined,
        {
          // Honest attribution on the Part 11 signature row a `sign` persists:
          // the real client IP when resolvable, null otherwise (never fabricated).
          ipAddress:
            (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
            req.socket?.remoteAddress ||
            null,
        },
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
      if (err instanceof SeparationOfDutiesError) {
        return res.status(403).json({ error: err.code, detail: err.message });
      }
      if (err instanceof SeparationOfDutiesAuthorUnresolvedError) {
        // The check ran, but the record has no recorded author (or its type has
        // none modelled), so independence cannot be shown. A retry will not fix it.
        return res.status(409).json({ error: err.code, detail: err.message });
      }
      if (err instanceof SeparationOfDutiesUnverifiedError) {
        // The check did not run, which is not the same as the check refusing.
        // 503, not 403: the user is not the problem, and a retry may succeed.
        // The error's own message carries the failed lookup's cause, which is
        // internal; it goes to the log, and the caller gets an authored
        // sentence (ci:server-error-leaks, 2026-09-23).
        console.error(`[c2c/actions/${command}]`, err.message);
        return res.status(503).json({
          error: err.code,
          detail:
            'Separation of duties could not be verified, so nothing was signed. Try again; if this continues, contact your administrator.',
        });
      }
      if (err instanceof SignatureRevocationUnresolvedError) {
        // Nothing was written (the transaction rolled back). Say so plainly
        // rather than returning an opaque 500 that reads as "maybe it worked".
        return res.status(409).json({ error: err.code, detail: err.message });
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
//
// The chain is one chain per tenant (see services/audit/chain.ts), and this
// verifies EVERY tenant's chain. A pooled connection under RLS_ENFORCE=on
// carries no tenant and would see no rows — a false pass — so the walk runs
// on a super-admin-scoped connection (the pattern system jobs use), and the
// verifier itself refuses a tenant-scoped view (AuditChainPartialViewError).

router.get('/verify-chain', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  try {
    const result = await withTenantConnection(
      { tenantId: '0', role: 'app_super_admin', source: 'request', caller: 'c2c/actions/verify-chain' },
      (client) => verifyAuditChain(client),
    );
    return res.status(result.ok ? 200 : 409).json(result);
  } catch (err: any) {
    if (err instanceof AuditChainPartialViewError || err instanceof AuditChainSchemaMissingError) {
      // The chain could not be verified — say so; never an empty "ok". The
      // error's message names a migration and a database setting, so it goes
      // to the log, not the body (ci:server-error-leaks, 2026-09-23).
      console.error('[c2c/actions/verify-chain]', err.message);
      return res.status(503).json({
        error: err.code,
        detail: 'The audit chain could not be verified, so no result is given.',
      });
    }
    console.error('[c2c/actions/verify-chain]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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

// ── Legacy delegation handler: REMOVED ─────────────────────────────────────
//
// `legacyAcceptAnaDraftHandler` lived here, ~70 lines, exported and never
// imported: a repo-wide grep for the symbol returned exactly one hit, its own
// definition. Its comment claimed "this handler is mounted in
// cerv2-sections.ts"; that was false — cerv2-sections.ts:547 has its own
// independent implementation, and that one IS correctly org-scoped on both the
// SELECT and the UPDATE.
//
// It mattered because the dead copy carried an unscoped cross-tenant write:
//   UPDATE cerv2_510k_sections SET content=..., status=..., accepted_by=...
//    WHERE id = $4
// matching on section id alone, with orgId resolved and then unused. It was not
// exploitable only by the accident of never being mounted — a loaded write that
// would have become a P0 the moment anyone wired it up. Deleted rather than
// fixed, because the correct implementation already exists elsewhere.

export default router;
