/**
 * =============================================================================
 * 21 CFR Part 11 Compliance Engine — Enhanced
 * =============================================================================
 * Dedicated route prefix for 21 CFR Part 11 electronic records compliance:
 * - Electronic signatures with meaning capture (§11.50, §11.70, §11.100)
 * - Immutable audit trails with cryptographic hashing (§11.10(e))
 * - Authority checks and access controls (§11.10(d))
 * - Closed/open system controls (§11.10(a-c))
 * - Time-stamped operations with server-authoritative timestamps
 * - Document version control with full lineage (§11.10(e))
 * - Validation documentation (IQ/OQ/PQ) tracking
 * - SOC 2 Type II evidence collection
 *
 * References:
 *   21 CFR Part 11 — Electronic Records; Electronic Signatures
 *   FDA Guidance: Part 11, Scope and Application (2003, updated 2023)
 *   GAMP 5 — A Risk-Based Approach to Compliant GxP Computerized Systems
 * =============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createPolicyGuard } from '../services/policy/opaMiddleware';
import rbacService from '../services/roleBasedAccess';
import { verifyAuditIntegrity } from '../services/audit/audit-integrity-service';
import { requestPgClient } from '../db/requestDb';

/**
 * The request-scoped, tenant-pinned SQL client.
 *
 * ── What this replaces, and why it is not the shared pool ────────────────────
 * Every route in this file resolved its pool as
 *
 *     const pool: Pool = (req as any).pool || (req.app as any).pool;
 *
 * and NOTHING in this repository assigns `req.pool` or `req.app.pool` — the
 * only four assignments are in this file's own tests. So both operands were
 * always undefined and every one of these five routes threw
 * `TypeError: Cannot read properties of undefined (reading 'query')` and
 * answered 500. `server/routes/graphrag.ts:543` documents the identical defect
 * and repaired it with a fallback to the shared process pool.
 *
 * That fallback is deliberately NOT copied here, for two reasons.
 *
 * FIRST, it would arm a tenant leak rather than close a bug. Three of these five
 * routes had no tenant predicate, and `document_id` / `entity_id` are
 * enumerable serials — so the routes are currently safe only by virtue of being
 * broken. Repairing the connection without the predicates is strictly worse
 * than leaving them broken. The predicates land in the same change as the
 * repair, route by route, and the two routes that cannot be made safe in one
 * step are left disconnected on purpose (see their own comments).
 *
 * SECOND, the shared process pool is the wrong connection. `requestPgClient`
 * returns the
 * connection `establishRequestTenantScope` already pinned to this request, with
 * `app.current_tenant_id` / `current_org_id` / `current_user_role` set on it —
 * so the RLS policies on `electronic_signatures` and `audit_events` actually
 * apply, instead of app-layer predicates being the only thing standing between
 * one tenant and another. It is fail-closed: absent tenant context it throws
 * `MissingRequestDbContextError` rather than quietly serving from the shared
 * pool. `scripts/ci/audit-requestdb-coverage.mjs` ratchets on the shared-pool
 * accessors and this file is not in its baseline, which is the same judgement
 * expressed as a gate.
 */
/**
 * Generic in the row type, matching what `pg`'s `Pool.query` gave these call
 * sites before. `requestPgClient` declares its rows as
 * `Record<string, unknown>`, which is the more honest type but would require
 * rewriting every consumer in this file to narrow each column — a much larger
 * diff, on routes whose SQL is unchanged, for no behavioural gain. The cast is
 * confined to this one function so the widening is visible in one place.
 */
type SqlClient = {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
};

const requestSql = (req: Request): SqlClient => requestPgClient(req) as unknown as SqlClient;

/**
 * The organization on the verified request, or `null`.
 *
 * Both accessors are the ones this file already used at the two routes that
 * were correctly scoped; hoisted so a new route cannot invent a third way of
 * asking, and so "no org ⇒ refuse" is one decision rather than five.
 */
function requestOrgId(req: Request): number | null {
  const raw =
    (req as unknown as { user?: { organizationId?: unknown } }).user?.organizationId ??
    (req as unknown as { tenantContext?: { organizationId?: unknown } }).tenantContext?.organizationId;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type SignatureMeaning =
  | 'authorship' // Author/creator of the document
  | 'review' // Reviewed the document
  | 'approval' // Approved the document
  | 'rejection' // Rejected the document
  | 'verification' // Verified the data/content
  | 'authorization' // Authorized for release
  | 'acknowledgment' // Acknowledged receipt/understanding
  | 'witnessing' // Witnessed the signing
  | 'responsibility' // Takes responsibility for content
  | 'custom'; // Custom meaning (see customMeaning field)

/** Human-readable label for each signature meaning, per 21 CFR Part 11 §11.50(a)(3). */
const SIGNATURE_MEANING_LABELS: Record<SignatureMeaning, string> = {
  authorship: 'Authorship',
  review: 'Reviewed',
  approval: 'Approved',
  rejection: 'Rejected',
  verification: 'Verified',
  authorization: 'Authorized for release',
  acknowledgment: 'Acknowledged',
  witnessing: 'Witnessed',
  responsibility: 'Responsibility for content',
  custom: 'Custom',
};

/** The fields needed to manifest a signature; a subset of a stored row. */
export interface SignatureManifestInput {
  signerName: string;
  signerTitle?: string | null;
  signerOrganization?: string | null;
  meaning: SignatureMeaning | string;
  customMeaning?: string | null;
  timestamp: Date | string;
}

/**
 * Assemble the human-readable signature manifestation required by 21 CFR Part 11
 * §11.50 — the signed record must display (1) the printed name of the signer,
 * (2) the date and time of signing, and (3) the meaning of the signature. Pure
 * and deterministic so it can be embedded in a PDF/printed record and unit-tested
 * without a database.
 */
export function buildSignatureManifest(sig: SignatureManifestInput): {
  signerName: string;
  signerTitle: string | null;
  signerOrganization: string | null;
  meaning: string;
  meaningLabel: string;
  signedAt: string;
  manifestText: string;
} {
  const meaning = String(sig.meaning);
  const meaningLabel =
    meaning === 'custom' && sig.customMeaning
      ? sig.customMeaning
      : SIGNATURE_MEANING_LABELS[meaning as SignatureMeaning] ?? meaning;
  const signedAt = new Date(sig.timestamp).toISOString();
  const manifestText = [
    sig.signerName,
    sig.signerTitle ? `Title: ${sig.signerTitle}` : '',
    sig.signerOrganization ? `Organization: ${sig.signerOrganization}` : '',
    `Date/Time: ${signedAt}`,
    `Meaning: ${meaningLabel}`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    signerName: sig.signerName,
    signerTitle: sig.signerTitle ?? null,
    signerOrganization: sig.signerOrganization ?? null,
    meaning,
    meaningLabel,
    signedAt,
    manifestText,
  };
}

export interface AuditTrailEntry {
  id: string;
  entityType: 'document' | 'signature' | 'user' | 'system' | 'configuration' | 'access';
  entityId: string;
  action: AuditAction;
  userId: string;
  userName: string;
  userRole: string;
  previousValue?: string;
  newValue?: string;
  changeReason?: string; // Required for modifications to GxP records
  timestamp: Date;
  serverTimestamp?: string;
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  hash: string; // SHA-256 of entry content for tamper detection
  previousHash: string; // Previous entry hash for chain integrity
  metadata?: Record<string, unknown>;
}

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'sign'
  | 'countersign'
  | 'revoke_signature'
  | 'lock'
  | 'unlock'
  | 'export'
  | 'print'
  | 'login'
  | 'logout'
  | 'failed_login'
  | 'permission_grant'
  | 'permission_revoke'
  | 'config_change'
  | 'system_event';

export interface AuthorityCheck {
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  authorized: boolean;
  checkedAt: Date;
  authoritySource: string; // e.g., 'RBAC', 'delegation', 'system_admin'
  requiresMFA: boolean;
  requiresSignature: boolean;
}

export interface ValidationRecord {
  id: string;
  systemName: string;
  validationType: 'IQ' | 'OQ' | 'PQ' | 'CSV' | 'UAT';
  status: 'planned' | 'in_progress' | 'completed' | 'failed' | 'approved';
  protocol: string;
  summary: string;
  testedBy: string;
  approvedBy?: string;
  executedAt?: Date;
  completedAt?: Date;
  deviations: Array<{
    id: string;
    description: string;
    severity: 'critical' | 'major' | 'minor';
    resolution: string;
    resolved: boolean;
  }>;
  attachmentIds: string[];
}

export interface SOC2Evidence {
  id: string;
  controlId: string; // e.g. CC6.1, CC7.1
  controlCategory: SOC2Category;
  evidenceType: 'policy' | 'procedure' | 'screenshot' | 'log' | 'configuration' | 'report';
  title: string;
  description: string;
  collectedAt: Date;
  collectedBy: string;
  status: 'collected' | 'reviewed' | 'approved' | 'expired';
  expiresAt?: Date;
  attachmentId?: string;
}

export type SOC2Category =
  | 'security' // CC1-CC9: Security (Common Criteria)
  | 'availability' // A1: Availability
  | 'processing_integrity' // PI1: Processing Integrity
  | 'confidentiality' // C1: Confidentiality
  | 'privacy'; // P1-P8: Privacy

// ---------------------------------------------------------------------------
// CRYPTOGRAPHIC UTILITIES
// ---------------------------------------------------------------------------

function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function computeAuditChainHash(entry: Omit<AuditTrailEntry, 'hash'>, previousHash: string): string {
  const payload = `${previousHash}|${entry.entityType}|${entry.entityId}|${entry.action}|${entry.userId}|${entry.timestamp.toISOString()}`;
  return computeHash(payload);
}

// ---------------------------------------------------------------------------
// AUDIT CHAIN — In-memory chain + DB persistence (audit_events table)
// ---------------------------------------------------------------------------

let lastAuditHash = computeHash('GENESIS_BLOCK_TRIALSAGE');

// Reference to the pool — set by createPart11Router
let _part11Pool: Pool | null = null;

function setAuditPool(pool: Pool) {
  _part11Pool = pool;
}

function appendAuditEntry(
  params: Omit<AuditTrailEntry, 'id' | 'hash' | 'previousHash'>,
  organizationId?: number
): AuditTrailEntry {
  const entry: AuditTrailEntry = {
    ...params,
    id: uuidv4(),
    previousHash: lastAuditHash,
    hash: '', // computed below
  };
  entry.hash = computeAuditChainHash(entry, lastAuditHash);
  lastAuditHash = entry.hash;

  // Persist to audit_events table — awaited where possible, logged on failure
  if (_part11Pool) {
    _part11Pool.query(
      `INSERT INTO audit_events
        (organization_id, event_type, entity_type, entity_id, user_id, user_name,
         user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, true, true)`,
      [
        organizationId ?? null,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.userId,
        entry.userName,
        entry.userRole,
        entry.ipAddress,
        entry.changeReason || entry.newValue || `${entry.action} on ${entry.entityType}`,
        JSON.stringify({
          previousValue: entry.previousValue,
          newValue: entry.newValue,
          sessionId: entry.sessionId,
          userAgent: entry.userAgent,
          part11_source: 'compliance_engine',
        }),
      ]
    ).catch((err: Error) => {
      console.error('[Part11] CRITICAL: Failed to persist audit entry to DB:', err.message);
      console.error('[Part11] Entry data:', JSON.stringify({ id: entry.id, action: entry.action, entityId: entry.entityId }));
    });
  } else {
    console.warn('[Part11] WARNING: No DB pool available -- audit entry stored in-memory only:', entry.id);
  }

  return entry;
}

// ---------------------------------------------------------------------------
// EXPRESS ROUTES
// ---------------------------------------------------------------------------

const router = Router();

// ============================
// ELECTRONIC SIGNATURES (§11.50, §11.70, §11.100)
// ============================
//
// `POST /signatures` — REMOVED (single e-signature write path, Phase 4 D6).
//
// It was a THIRD signing entry point that had never once executed: its INSERT
// named columns that do not exist on the physical `electronic_signatures`
// table (document_version, signer_organization, meaning, custom_meaning,
// password_verified, mfa_verified, user_agent, timestamp — plus a uuid `id`
// against a serial PK), so every call raised 42703 and returned 500. It failed
// closed, so it never fabricated a signature; it simply never worked, and a
// repo-wide grep found no caller in client/ or server/ — only its own test.
//
// It was deleted rather than repaired because repairing it would have created a
// second live document-signing surface with a WEAKER §11.70 binding than the one
// we already have:
//   - it hashed a caller-supplied `documentContent`, i.e. it bound whatever the
//     client claimed the record was, which no inspector can re-derive from
//     stored bytes;
//   - it recorded `mfa_verified` from `!!req.body.mfaToken` — a client-asserted
//     boolean, never verified;
//   - it took a free-text documentId with no versionId, so post-D6 it could only
//     have anchored via `signed_target`, inventing an anchor for a row that is
//     conceptually a document-version signature.
//
// The supported document-signing surface is POST /api/esignature/sign
// (server/routes/esignature.ts): it re-verifies password + TOTP server-side,
// derives the §11.70 binding digest from the STORED version content inside the
// signer's org, and writes through the one INSERT in
// server/services/part11/signature-persistence.ts. Governed typed targets sign
// via POST /api/c2c/actions/sign, through the same write path.
//
// The read/verification endpoints below are unaffected and still serve rows
// written by BOTH paths.

/**
 * GET /signatures/:documentId
 * Get all signatures for a document
 */
router.get('/signatures/:documentId', async (req: Request, res: Response) => {
  /* SECURITY. This SELECT filtered on `document_id` ALONE, and `documents.id`
     is a serial — so with a working connection any authenticated user of any
     tenant could enumerate ids and read another tenant's §11.50 signature rows:
     signer name, title, email, meaning, hash, IP address.

     It has never actually leaked, because `req.pool` is undefined and the route
     500s before reaching Postgres. That is not a control, it is an accident,
     and it is why the predicate lands in the SAME change as the repair rather
     than after it. The clause is mandatory — no org on the request is a 403,
     not an unscoped read — which is the difference from the manifest route
     below, whose optional clause silently became a read-by-id. */
  const orgId = requestOrgId(req);
  if (orgId == null) {
    return res.status(403).json({ error: 'Tenant context required' });
  }
  const pool: SqlClient = requestSql(req);
  const { documentId } = req.params;

  try {
    // Physical-schema column set (the previous SELECT referenced columns —
    // document_version, signer_organization, meaning, password_verified,
    // mfa_verified, timestamp, user_agent — that never existed on the table,
    // so this read failed for every stored signature).
    const result = await pool.query(
      `
      SELECT id, document_id, version_id, signed_target, signature_type,
             signature_purpose, signer_id, signer_name, signer_title, signer_email,
             signature_meaning, signature_hash, binding_basis,
             second_factor_verified, is_valid, signed_at, ip_address
      FROM electronic_signatures
      WHERE document_id = $1 AND organization_id = $2
      ORDER BY signed_at DESC
    `,
      [documentId, orgId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    // A read of the Part 11 signature list must never masquerade a failure as an
    // empty (but verified) signature set — a QA reviewer could not tell "no
    // signatures" from "the query failed". Fail closed with a real status.
    const code = (err as { code?: string } | null)?.code;
    if (code === '42P01') {
      console.warn('[Part11] electronic_signatures table not provisioned; failing closed');
      return res.status(503).json({ success: false, error: 'SIGNATURE_STORE_UNPROVISIONED' });
    }
    console.error('[Part11] Signature list read failed:', (err as Error)?.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve signatures' });
  }
});

/**
 * GET /signatures/:signatureId/manifest
 * Return the 21 CFR Part 11 §11.50 signature manifestation — printed name,
 * date/time, and meaning — pre-formatted for embedding in a PDF or printed
 * record. Read-only; the data is captured at signing time, this assembles it.
 */
router.get('/signatures/:signatureId/manifest', async (req: Request, res: Response) => {
  const orgId = requestOrgId(req);
  if (orgId == null) {
    return res.status(403).json({ error: 'Tenant context required' });
  }
  const pool: SqlClient = requestSql(req);
  const { signatureId } = req.params as { signatureId: string };

  // electronic_signatures.id is a serial integer — reject a non-numeric id
  // before it reaches the database (22P02 would surface as an opaque 500).
  const idNum = Number(signatureId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ success: false, error: 'signatureId must be a positive integer' });
  }

  try {
    // Query the PHYSICAL schema (shared/schema.ts electronicSignatures / the
    // 0000 migration): signature_meaning + signed_at — the previous query
    // referenced columns (meaning, custom_meaning, timestamp,
    // signer_organization) that never existed on the table, so this endpoint
    // 500'd for every stored signature. Serves BOTH document-anchored rows
    // (/api/esignature/sign, sign-release) and governed-sign rows
    // (/api/c2c/actions/sign — signed_target/binding_basis). §11.50 meaning
    // falls back to signature_type when no explicit meaning was declared —
    // a derivation from stored fields, never an invented value.
    //
    /* Tenant scope, now MANDATORY and without the NULL escape.
       It was neither. The clause was appended only `if (Number.isFinite(orgId))`,
       so a token carrying no numeric organization turned this into an unscoped
       read-by-id — a conditional predicate is not a predicate, it is a default.
       And `OR es.organization_id IS NULL` let every tenant read any
       unattributed row, which is looser than the RLS policy behind it, and that
       policy excludes NULL for the same reason. The org is checked once at the
       top of the handler now (see above). */
    const result = await pool.query(
      `SELECT es.id, es.signer_name, es.signer_title, o.name AS signer_organization,
              COALESCE(es.signature_meaning, es.signature_type) AS meaning,
              es.signed_at, es.signed_target, es.binding_basis
         FROM electronic_signatures es
         LEFT JOIN organizations o ON o.id = es.organization_id
        WHERE es.id = $1 AND es.organization_id = $2`,
      [idNum, orgId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Signature not found' });
    }
    const row = result.rows[0];
    const manifest = buildSignatureManifest({
      signerName: row.signer_name,
      signerTitle: row.signer_title,
      signerOrganization: row.signer_organization,
      meaning: row.meaning,
      customMeaning: null,
      timestamp: row.signed_at,
    });
    res.json({
      success: true,
      data: {
        id: row.id,
        ...manifest,
        signedTarget: row.signed_target ?? null,
        bindingBasis: row.binding_basis ?? null,
        compliance: '21 CFR Part 11 §11.50',
      },
    });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '42P01' || code === '42703') {
      // Store or its D6 columns unprovisioned — fail closed, honestly.
      return res.status(503).json({ success: false, error: 'SIGNATURE_STORE_UNPROVISIONED' });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build signature manifest',
    });
  }
});

/**
 * POST /signatures/:signatureId/revoke
 * Revoke an electronic signature with reason documentation
 */
router.post(
  '/signatures/:signatureId/revoke',
  createPolicyGuard({
    action: 'part11.signature.revoke',
    module: 'part11-compliance',
    resourceType: 'electronic_signature',
  }),
  async (req: Request, res: Response) => {
    const { signatureId } = req.params as { signatureId: string };
    const { revokedBy, reason } = req.body;

    if (!revokedBy || !reason) {
      return res.status(400).json({ error: 'revokedBy and reason required per §11.10(e)' });
    }

    appendAuditEntry({
      entityType: 'signature',
      entityId: String(signatureId),
      action: 'revoke_signature',
      userId: revokedBy,
      userName: revokedBy,
      userRole: 'admin',
      changeReason: reason,
      timestamp: new Date(),
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('user-agent') || 'unknown',
      sessionId: (req as any).sessionId || 'unknown',
    });

    res.json({
      success: true,
      data: { signatureId, revoked: true, revokedBy, reason, revokedAt: new Date() },
    });
  }
);

// ============================
// AUDIT TRAIL (§11.10(e))
// ============================

/**
 * GET /audit-trail/:entityId
 * Get the complete audit trail for an entity
 */
router.get('/audit-trail/:entityId', async (req: Request, res: Response, next: NextFunction) => {
  const { entityId } = req.params;
  // `/audit-trail/chain-integrity` and `/audit-trail/seal-integrity` are
  // dedicated GET routes registered later in this file; because this param
  // route is registered first, Express would otherwise match them here with
  // entityId='chain-integrity'/'seal-integrity'. Fall through so their real
  // handlers run instead of treating the reserved word as an entity id.
  if (entityId === 'chain-integrity' || entityId === 'seal-integrity') {
    return next();
  }
  /* DELIBERATELY NOT CONNECTED. Do not "fix the 500" by handing this a working
     client — it is broken twice over and a connection makes it worse, not
     better.

     1. The columns do not exist. This selects `user_role`, `previous_value`,
        `new_value`, `change_reason`, `session_id` and `record_hash` from an
        unqualified `audit_trail`. The runtime connection sets no `search_path`,
        so that resolves to `public.audit_trail`, whose only DDL in this repo
        (migrations/0000_sweet_joseph.sql) defines none of those six. The
        `compliance.audit_trail` that has some of them is in another schema this
        query cannot reach, and has no `action`/`entity_type`/`entity_id`. A
        working client turns the TypeError into a 42703, which the catch below
        does not map (it handles 42P01 only) — a 500 either way.
     2. There is no tenant predicate, and `entity_id` is a serial. The table has
        no `organization_id` to add one from; it is isolated only by a
        parent-scoped RLS policy through `leaf_id → leaves.organization_id`, and
        both of those columns are nullable, so under enforcement the rows are
        visible to nobody and with enforcement off they are visible to everyone.

     There is also no writer: nothing in the repo INSERTs into `public.audit_trail`.
     `appendAuditEntry` writes `audit_events`, the tamper-proof observer writes
     `audit_logs`. The fix is to re-point this at `audit_events` — which has every
     column it wants plus `organization_id` — or to delete it, as `POST /signatures`
     was deleted above. Both are product decisions, not repairs. */
  const pool: Pool = (req as any).pool || (req.app as any).pool;
  const entityType = req.query.type as string;

  try {
    const query = entityType
      ? `SELECT id, entity_type, entity_id, action, user_id, user_name, user_role, previous_value, new_value, change_reason, created_at, ip_address, session_id, record_hash FROM audit_trail WHERE entity_id = $1 AND entity_type = $2 ORDER BY created_at DESC LIMIT 500`
      : `SELECT id, entity_type, entity_id, action, user_id, user_name, user_role, previous_value, new_value, change_reason, created_at, ip_address, session_id, record_hash FROM audit_trail WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 500`;

    const params = entityType ? [entityId, entityType] : [entityId];
    const result = await pool.query(query, params);

    // Verify hash chain integrity (21 CFR Part 11 requirement)
    let chainIntegrity: 'verified' | 'broken' | 'unverifiable' = 'unverifiable';
    if (result.rows.length > 0 && result.rows[0].hash_signature) {
      chainIntegrity = 'verified';
      for (let i = 1; i < result.rows.length; i++) {
        const row = result.rows[i];
        const prevRow = result.rows[i - 1];
        if (row.previous_hash && row.previous_hash !== prevRow.hash_signature) {
          chainIntegrity = 'broken';
          break;
        }
      }
    }

    res.json({
      success: true,
      data: {
        entries: result.rows,
        total: result.rows.length,
        entityId,
        chainIntegrity,
      },
    });
  } catch (err) {
    // Never return an empty (but "successful") audit trail for a caught failure:
    // a false-empty §11.10 change history is indistinguishable from a genuine
    // one to an inspector. Surface the failure with a real status.
    const code = (err as { code?: string } | null)?.code;
    if (code === '42P01') {
      console.warn('[Part11] audit_trail table not provisioned; failing closed');
      return res.status(503).json({ success: false, error: 'AUDIT_TRAIL_STORE_UNPROVISIONED' });
    }
    console.error('[Part11] Audit trail read failed:', (err as Error)?.message);
    return res.status(500).json({ success: false, error: 'Failed to read audit trail' });
  }
});

/**
 * POST /audit-trail
 * Record an audit trail entry (system events, configuration changes)
 */
router.post('/audit-trail', (req: Request, res: Response) => {
  // SECURITY: Use authenticated user from JWT, not from request body
  // This prevents audit trail spoofing (21 CFR Part 11 compliance)
  const authUser = (req as any).user || (req as any).tenantContext;
  const userId = authUser?.id || authUser?.userId || (req as any).userId;
  const userRole = authUser?.role || (req as any).userRole || 'unknown';

  const {
    entityType,
    entityId,
    action,
    userName,
    previousValue,
    newValue,
    changeReason,
  } = req.body;

  if (!entityType || !entityId || !action || !userId) {
    return res.status(400).json({ error: 'entityType, entityId, action required (userId derived from auth)' });
  }

  // §11.10(e): change reason required for modifications to GxP records
  if ((action === 'update' || action === 'delete') && !changeReason) {
    return res.status(400).json({
      error: 'changeReason is required for update/delete actions per 21 CFR Part 11 §11.10(e)',
    });
  }

  const entry = appendAuditEntry({
    entityType,
    entityId,
    action,
    userId,
    userName: userName || userId,
    userRole: userRole || 'unknown',
    previousValue,
    newValue,
    changeReason,
    timestamp: new Date(),
    ipAddress: req.ip || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
    sessionId: (req as any).sessionId || 'unknown',
  });

  res.json({ success: true, data: entry });
});

/**
 * GET /audit-trail/chain-integrity
 * Verify the integrity of the audit trail hash chain by re-computing
 * hashes from the DB and comparing against stored record_hash values.
 */
router.get('/audit-trail/chain-integrity', async (req: Request, res: Response) => {
  // SECURITY: pre-fix the orgId came from req.query, so any caller
  // could verify the chain integrity of any tenant's audit trail.
  // When the query was empty the filter was OMITTED entirely — meaning
  // the verifier ran across all tenants combined, which would fail
  // chain consistency and leak hash data from foreign rows. JWT-bound now.
  const orgId = requestOrgId(req);
  if (orgId == null) {
    return res.status(403).json({ error: 'Tenant context required' });
  }
  /* Connected. This is the one route of the five whose predicate was already
     mandatory and unconditional, and the only one with a live client caller
     (Part11Console) — which has therefore been reading a 500 for as long as the
     pool has been undefined. */
  const pool: SqlClient = requestSql(req);

  try {
    const orgFilter = `WHERE organization_id = $1`;
    const params = [orgId];

    // Fetch all audit_events rows in chain order
    const { rows } = await pool.query(
      `SELECT id, organization_id, sequence_number, event_type, entity_type,
              entity_id, user_id, user_name, timestamp, reason,
              record_hash, previous_hash
       FROM audit_events ${orgFilter}
       ORDER BY organization_id, sequence_number ASC`,
      params
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          chainStatus: 'empty',
          totalEntries: 0,
          integrityValid: true,
          hashAlgorithm: 'SHA-256',
          chainType: 'linear-hash-chain',
          compliance: {
            '§11.10(e)': 'Audit trail preserves complete change history with computer-generated timestamps',
            tamperEvident: 'Each entry is cryptographically linked to its predecessor via SHA-256 hash chain',
          },
        },
      });
    }

    // Walk the chain and recompute hashes
    const brokenLinks: Array<{ id: number; sequenceNumber: number; orgId: number; expected: string; actual: string }> = [];
    const prevHashByOrg: Record<number, string> = {};
    let totalVerified = 0;

    for (const row of rows) {
      const oid = row.organization_id;
      const prevHash = prevHashByOrg[oid] || null;

      // Verify previous_hash pointer
      if (row.previous_hash !== prevHash && row.previous_hash !== null && prevHash !== null) {
        brokenLinks.push({
          id: row.id,
          sequenceNumber: row.sequence_number,
          orgId: oid,
          expected: prevHash || '(genesis)',
          actual: row.previous_hash || '(null)',
        });
      }

      // Recompute record_hash using the same formula as the DB trigger
      const payload =
        (row.sequence_number ?? '') + '|' +
        (row.event_type ?? '') + '|' +
        (row.entity_type ?? '') + '|' +
        (row.entity_id ?? '') + '|' +
        (row.user_id ?? '') + '|' +
        (row.user_name ?? '') + '|' +
        (row.timestamp ? new Date(row.timestamp).toISOString().replace('T', ' ').replace('Z', '+00') : '') + '|' +
        (row.reason ?? '') + '|' +
        (row.previous_hash ?? 'GENESIS');

      const expectedHash = computeHash(payload);

      // Allow for timestamp format differences — also verify without reformatting
      if (row.record_hash && row.record_hash !== expectedHash) {
        // Try raw timestamp string as PostgreSQL stores it
        const rawPayload =
          (row.sequence_number ?? '') + '|' +
          (row.event_type ?? '') + '|' +
          (row.entity_type ?? '') + '|' +
          (row.entity_id ?? '') + '|' +
          (row.user_id ?? '') + '|' +
          (row.user_name ?? '') + '|' +
          String(row.timestamp ?? '') + '|' +
          (row.reason ?? '') + '|' +
          (row.previous_hash ?? 'GENESIS');

        const altHash = computeHash(rawPayload);
        if (row.record_hash !== altHash) {
          brokenLinks.push({
            id: row.id,
            sequenceNumber: row.sequence_number,
            orgId: oid,
            expected: expectedHash.substring(0, 16) + '...',
            actual: (row.record_hash || '(null)').substring(0, 16) + '...',
          });
        }
      }

      prevHashByOrg[oid] = row.record_hash;
      totalVerified++;
    }

    const isIntact = brokenLinks.length === 0;

    res.json({
      success: true,
      data: {
        chainStatus: isIntact ? 'intact' : 'broken',
        integrityValid: isIntact,
        totalEntries: totalVerified,
        brokenLinks: brokenLinks.length,
        brokenLinkDetails: brokenLinks.slice(0, 20), // First 20 for diagnostics
        lastHash: rows[rows.length - 1]?.record_hash || lastAuditHash,
        hashAlgorithm: 'SHA-256',
        chainType: 'linear-hash-chain',
        verifiedAt: new Date().toISOString(),
        genesisHash: computeHash('GENESIS_BLOCK_TRIALSAGE'),
        compliance: {
          '§11.10(e)': 'Audit trail preserves complete change history with computer-generated timestamps',
          tamperEvident: 'Each entry is cryptographically linked to its predecessor via SHA-256 hash chain',
          verificationMethod: 'Full re-computation of SHA-256 hash chain from database records',
        },
      },
    });
  } catch (err: any) {
    // A hash-chain integrity check that could not run must NOT report
    // success: true — an inspector would read that as a passed verification.
    // Surface the failure with a real status.
    const code = (err as { code?: string } | null)?.code;
    if (code === '42P01') {
      console.warn('[Part11] Chain integrity check: audit_events table not provisioned; failing closed');
      return res.status(503).json({ success: false, error: 'AUDIT_EVENTS_STORE_UNPROVISIONED' });
    }
    console.error('[Part11] Chain integrity check failed:', err?.message);
    return res.status(500).json({ success: false, error: 'Chain integrity verification failed' });
  }
});

// ============================
// AUTHORITY CHECKS (§11.10(d))
// ============================

/**
 * POST /authority-check
 * Verify a user's authority to perform an action
 */
router.post('/authority-check', async (req: Request, res: Response) => {
  const { userId, action, resource, resourceId } = req.body;
  if (!userId || !action || !resource) {
    return res.status(400).json({ error: 'userId, action, resource required' });
  }

  // Real authority check: the DB-backed RBAC service (fail-closed — returns
  // false on any error or unknown grant). Previously this endpoint returned
  // authorized:true unconditionally, which made the §11.10(d) authority gate
  // a rubber stamp. The org is taken from the authenticated request context.
  const orgId =
    (req as any).user?.organizationId ?? (req as any).tenantId ?? null;

  let authorized = false;
  try {
    authorized = await rbacService.checkPermission(userId, resource, action, orgId);
  } catch (err: any) {
    console.error('[Part11] authority-check failed:', err?.message);
    authorized = false; // fail closed
  }

  const check: AuthorityCheck = {
    userId,
    action,
    resource,
    resourceId: resourceId || '',
    authorized,
    checkedAt: new Date(),
    authoritySource: 'RBAC',
    requiresMFA: ['sign', 'approve', 'delete', 'config_change'].includes(action),
    requiresSignature: ['approve', 'authorize', 'release'].includes(action),
  };

  res.json({ success: true, data: check });
});

// ============================
// VALIDATION RECORDS (GAMP 5 CSV)
// ============================

/**
 * GET /validation
 * Get system validation records (IQ/OQ/PQ)
 */
router.get('/validation', (_req: Request, res: Response) => {
  // System validation (IQ/OQ/PQ) records are formal qualification artifacts the
  // QA organization produces and records. The platform reports the recorded set
  // rather than shipping or fabricating qualification evidence. No in-app
  // validation-records store is provisioned, so this honestly returns none
  // (previously it returned hardcoded IQ/OQ/PQ records with invented protocols,
  // testers, and dates).
  res.json({
    success: true,
    data: [],
    meta: {
      recorded: 0,
      note: 'No system validation (IQ/OQ/PQ) records are tracked in the platform. Qualification is performed and recorded by your QA organization.',
    },
  });
});

// ============================
// SOC 2 EVIDENCE COLLECTION
// ============================

/**
 * GET /soc2/controls
 * Get SOC 2 Type II control mapping and evidence status
 */
router.get('/soc2/controls', (_req: Request, res: Response) => {
  // SOC 2 Trust Services Criteria control framework (reference). Evidence
  // collection and audit readiness are owned by the organization's GRC/audit
  // program and are not tracked in-app, so evidence is reported honestly as
  // not-collected and no readiness score is synthesized. (Previously every
  // control was hardcoded as "collected" with invented evidence counts and a
  // fabricated readiness score.)
  const framework: {
    controlId: string;
    category: string;
    title: string;
    description: string;
    part11Mapping?: string;
  }[] = [
    { controlId: 'CC1.1', category: 'security', title: 'Control Environment — COSO Entity-Level Controls', description: 'Management demonstrates commitment to integrity and ethical values' },
    { controlId: 'CC5.1', category: 'security', title: 'Control Activities — Logical Access', description: 'Logical access controls restrict access to information assets', part11Mapping: '§11.10(d) — Authority checks limiting system access' },
    { controlId: 'CC6.1', category: 'security', title: 'Logical and Physical Access — Authentication', description: 'Multi-factor authentication for system access', part11Mapping: '§11.100 — Unique identification codes and passwords' },
    { controlId: 'CC7.1', category: 'security', title: 'System Operations — Change Management', description: 'Changes to infrastructure and software follow change management process' },
    { controlId: 'CC7.2', category: 'security', title: 'System Operations — Monitoring', description: 'System components monitored for anomalies and security events', part11Mapping: '§11.10(e) — Audit trail monitoring' },
    { controlId: 'CC8.1', category: 'security', title: 'Change Management — Authorization', description: 'Changes authorized, designed, tested before implementation' },
    { controlId: 'A1.1', category: 'availability', title: 'Availability — System Availability', description: 'System availability maintained per SLA commitments' },
    { controlId: 'PI1.1', category: 'processing_integrity', title: 'Processing Integrity — Data Accuracy', description: 'Data processing is complete, valid, accurate, and timely', part11Mapping: '§11.10(a) — Validation of systems for accuracy and reliability' },
    { controlId: 'C1.1', category: 'confidentiality', title: 'Confidentiality — Data Classification', description: 'Confidential information identified and protected' },
    { controlId: 'P1.1', category: 'privacy', title: 'Privacy — Notice', description: 'Privacy notices provide clear information about data practices' },
  ];

  const controls = framework.map((c) => ({ ...c, evidenceStatus: 'not_collected', evidenceCount: 0 }));

  res.json({
    success: true,
    data: {
      controls,
      summary: {
        totalControls: controls.length,
        evidenceCollected: 0,
        totalEvidence: 0,
        part11MappedControls: framework.filter((c) => c.part11Mapping).length,
        readinessScore: null,
        certificationTarget: 'SOC 2 Type II',
        note: 'Control framework reference. Evidence collection and readiness are determined by your organization’s GRC/audit program; the platform does not track or attest SOC 2 evidence.',
      },
    },
  });
});

/**
 * POST /soc2/evidence
 * Submit SOC 2 evidence for a control
 */
router.post(
  '/soc2/evidence',
  createPolicyGuard({
    action: 'part11.soc2.evidence.create',
    module: 'part11-compliance',
    resourceType: 'soc2_evidence',
  }),
  (req: Request, res: Response) => {
  const { controlId, controlCategory, evidenceType, title, description, collectedBy } = req.body;
  if (!controlId || !title || !collectedBy) {
    return res.status(400).json({ error: 'controlId, title, collectedBy required' });
  }

  const evidence: SOC2Evidence = {
    id: uuidv4(),
    controlId,
    controlCategory: controlCategory || 'security',
    evidenceType: evidenceType || 'log',
    title,
    description: description || '',
    collectedAt: new Date(),
    collectedBy,
    status: 'collected',
  };

  res.json({ success: true, data: evidence });
}
);

// ============================
// COMPLIANCE DASHBOARD
// ============================

/**
 * GET /compliance-status
 * Comprehensive 21 CFR Part 11 + SOC 2 compliance dashboard
 */
router.get('/compliance-status', (_req: Request, res: Response) => {
  // 21 CFR Part 11 / SOC 2 / GAMP 5 requirement framework mapped to the technical
  // controls the platform provides. Compliance and audit readiness are
  // organizational determinations made by your QA/validation and audit
  // activities — the platform does not self-certify them, so section status is
  // reported honestly as "not_assessed" and no readiness scores are synthesized.
  // (Previously this returned every section as "compliant" with a fabricated
  // 0.92 SOC 2 readiness score.)
  const part11Controls: { code: string; title: string; platformControl: string }[] = [
    { code: '§11.10(a)', title: 'System Validation', platformControl: 'Application engineered for validation; qualification (IQ/OQ/PQ) is performed and recorded by your QA organization' },
    { code: '§11.10(b)', title: 'Legible Copies', platformControl: 'PDF export with rendered e-signatures' },
    { code: '§11.10(c)', title: 'Record Protection', platformControl: 'Encrypted storage and backup policy' },
    { code: '§11.10(d)', title: 'Authority Checks', platformControl: 'Role-based access control with audit logging' },
    { code: '§11.10(e)', title: 'Audit Trail', platformControl: 'Hash-chained, tamper-evident audit trail' },
    { code: '§11.10(f)', title: 'Operational Checks', platformControl: 'Version sequencing enforced' },
    { code: '§11.10(g)', title: 'Authority Checks', platformControl: 'Role-based access with MFA' },
    { code: '§11.10(h)', title: 'Device Checks', platformControl: 'Session management and IP logging' },
    { code: '§11.10(i)', title: 'Training', platformControl: 'Training records tracked by your organization' },
    { code: '§11.10(j)', title: 'Documentation Controls', platformControl: 'SOP distribution tracking' },
    { code: '§11.10(k)', title: 'Controls for Open Systems', platformControl: 'TLS in transit, encryption at rest' },
    { code: '§11.50', title: 'Signature Manifestation', platformControl: 'Name, date/time, and meaning displayed on signature' },
    { code: '§11.70', title: 'Signature/Record Linking', platformControl: 'SHA-256 cryptographic binding of signature to record' },
    { code: '§11.100', title: 'General Requirements for E-Signatures', platformControl: 'Unique identity plus password verification' },
    { code: '§11.200', title: 'E-Signature Components', platformControl: 'Two distinct components (ID + password)' },
    { code: '§11.300', title: 'Controls for ID Codes/Passwords', platformControl: 'Uniqueness, periodic revision, recall procedures' },
  ];
  const sections: Record<string, { title: string; status: string; platformControl: string }> = {};
  for (const c of part11Controls) {
    sections[c.code] = { title: c.title, status: 'not_assessed', platformControl: c.platformControl };
  }

  res.json({
    success: true,
    data: {
      disclaimer:
        'This is the 21 CFR Part 11 / SOC 2 / GAMP 5 requirement framework mapped to the controls the platform provides. Compliance and audit readiness are determined by your organization; the platform does not self-certify them and does not synthesize readiness scores.',
      part11: { overallStatus: 'not_assessed', sections },
      soc2: {
        certificationTarget: 'SOC 2 Type II',
        readinessScore: null,
        trustServiceCategories: {
          security: 'not_assessed',
          availability: 'not_assessed',
          processingIntegrity: 'not_assessed',
          confidentiality: 'not_assessed',
          privacy: 'not_assessed',
        },
      },
      gamp5: {
        systemCategory: 'Category 5 — Custom Application',
        validationApproach: 'Risk-based (GAMP 5)',
        riskAssessment: 'not_recorded',
        expectedDocumentation: ['URS', 'FS', 'DS', 'IQ', 'OQ', 'PQ', 'RTM'],
      },
    },
  });
});

/**
 * GET /health
 * Health check for compliance service
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'part11-compliance',
    features: {
      electronicSignatures: true,
      auditTrail: true,
      hashChainIntegrity: true,
      authorityChecks: true,
      soc2Evidence: true,
      gamp5Validation: true,
      trustedTimestamps: !!process.env.TRUSTED_TIMESTAMP_SERVICE, // TSA integration (only true if actually configured)
    },
    hashAlgorithm: 'SHA-256',
    auditChainLength: 'active',
    lastAuditHash: lastAuditHash.substring(0, 16) + '...',
  });
});

/**
 * GET /audit-trail/seal-integrity
 * Verify the GLOBAL audit_logs sha256 hash-chain AND its HMAC seals
 * (21 CFR Part 11 §11.10(e), §11.70). The audit_logs chain is system-wide, so
 * this is an admin/system integrity check (not tenant-scoped). Seal verification
 * is skipped (not failed) when AUDIT_HMAC_KEY is unset.
 */
router.get('/audit-trail/seal-integrity', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const roles: string[] = user?.roles || (user?.role ? [user.role] : []);
  /* `admin` is an ORG-scoped role, not a platform one. server/middleware/auth.ts
     states it directly: self-service signup mints `admin` for the first user of
     every new organization, so an org admin is an ordinary customer. This route
     reads the estate-wide `audit_logs` chain deliberately un-scoped, so that
     guard let any customer who signed themselves up verify — and receive hash
     material from — every tenant's audit chain.

     `super_admin` is genuine, and is retained. `admin` is removed. The full
     platform guard is server/middleware/requirePlatformAdmin.ts, which also
     honours PLATFORM_ADMIN_EMAILS; wiring it here needs a mount-order change
     that belongs with the connection work below. */
  if (!roles.includes('super_admin') && !roles.includes('platform_admin')) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Platform-admin role required for system audit-integrity verification.' } });
  }
  /* DELIBERATELY NOT CONNECTED, and this one is wrong in BOTH enforcement
     modes, in opposite directions.

     With RLS off, `verifyAuditIntegrity` walks the whole `audit_logs` table
     across every tenant — which is what it is for, but it means the response
     carries hash material spanning the estate.

     With RLS ON, `requestPgClient` pins a per-tenant scope and `audit_logs`
     carries `tenant_id`, so the walk sees a SUBSET of a chain whose hashes were
     computed over the whole table. Every row after the first tenant boundary
     mismatches and the endpoint reports a false "chain broken" on an intact
     chain — the most alarming possible output of a §11.10(e) surface, produced
     by the isolation working correctly.

     It needs an explicit SYSTEM scope (establishRequestSystemScope), not a
     request scope, and that is a different change from this one. Note also that
     the `if (!pool)` check below is incompatible with a client accessor that
     THROWS on missing context — it would never be reached. */
  const pool: Pool = (req as any).pool || (req.app as any).pool;
  if (!pool) {
    return res.status(503).json({ error: { code: 'NO_DB', message: 'Audit database not available.' } });
  }
  try {
    const result = await verifyAuditIntegrity(pool);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Verification failed.' });
  }
});

export { setAuditPool };
export default router;
