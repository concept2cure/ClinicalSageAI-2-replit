/**
 * Audit Trail Ledger — read-model for the ui-v2 "audit-trail" surface.
 *
 * Serves the immutable, hash-chained 21 CFR Part 11 §11.10(e) audit ledger in
 * the exact display shape the AuditTrail surface renders
 * (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx → AUDIT_LOG /
 * AuditEntry in v2/fixtures/admin-data.ts).
 *
 * ── The one ledger (VSR-001 finding F-2, 2026-09-21) ─────────────────────────
 *
 * Every launch app — program intake, Vault ingest and filing, Submission
 * Center, QMS, Tasks, Authoring and the governed `c2c/actions` mutations —
 * writes its governed events to `audit_logs` through the one chained writer
 * (writeChainedAuditRow / recordGovernedAction → computeAuditChainSealed).
 * This route used to read only `audit_events`, which those apps never write,
 * so a user sent to "Audit trail" after governed work saw an empty ledger.
 *
 * The surface now reads `audit_logs` — the chained store the launch apps
 * write — and, because SCIM provisioning, projects-management and the IVDR
 * worker still record to `audit_events` (its own per-organisation chain,
 * db/migrations/20260222_audit_events_hash_chain.sql), those rows are merged
 * in as well. Every entry says which store it came from (`source`), so the
 * two chains are never presented as one.
 *
 * Tenant scoping: the organisation comes from the verified JWT
 * (requireAuthedOrgId), never from the request, and the read runs in a
 * transaction stamped with that tenant (setTenantContextTx) so the row level
 * security policy sees the same tenant the SQL predicate names — a pooled
 * connection under RLS_ENFORCE=on carries no tenant and would otherwise see
 * nothing.
 *
 * HONESTY (regulated product — Part 11 surface):
 *   • hash      = the REAL stored chain hash (audit_logs.sha256_chain or
 *                 audit_events.record_hash, full SHA-256 hex, never truncated
 *                 or fabricated). Only rows that carry one are returned.
 *   • prevHash  = for audit_events, the REAL stored previous_hash; for
 *                 audit_logs, the hash of the row's predecessor in the
 *                 tenant's chain (AUDIT_CHAIN_ORDER_ASC_SQL — the same order the
 *                 writer appends in and the verifier walks). The chain's first
 *                 row is encoded as the 'genesis' sentinel the surface's
 *                 terminal chain check looks for. A legacy audit_logs row
 *                 (written before the chain had an order key) may have
 *                 committed to another tenant's row instead; its link then
 *                 does not match, and the surface's link count says so rather
 *                 than being papered over. `GET /api/c2c/actions/verify-chain`
 *                 is the authoritative verdict.
 *   • sig       = a genuine 21 CFR §11.50 signed status. audit_events stores
 *                 one (signature_status = 'signed'); audit_logs does not carry
 *                 a signature status column, so its rows report sig=false and
 *                 a signing event shows through `kind: 'esign'`.
 *   • meaning   = the stored signature_meaning (audit_events) or the meaning
 *                 recorded in the governed row's payload; reason = the stored
 *                 reason. Nothing is invented. `event`, `target` and `kind` are
 *                 presentation derivations of real columns (documented at each
 *                 helper); when no truthful source exists a field falls back to
 *                 a real, lower-fidelity value (e.g. the humanized action) rather
 *                 than a fabricated one.
 *
 * @module routes/audit-trail-ledger.routes
 */

import { Router, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';

import { createScopedLogger } from '../utils/logger.js';
import { requireAuthedOrgId } from '../utils/authedOrgId';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context.js';
import { AUDIT_CHAIN_HEAD_ORDER_SQL, AUDIT_CHAIN_ORDER_ASC_SQL } from '../services/audit/chain.js';

const logger = createScopedLogger('audit-trail-ledger-routes');

export type AuditLedgerSource = 'audit_logs' | 'audit_events';

// ─── Display shape (mirrors AuditEntry in v2/fixtures/admin-data.ts) ──────────
export interface AuditLedgerEntry {
  id: string;
  when: string;
  /** ISO-8601 instant the event was recorded; the merge order key. */
  at: string;
  actor: string;
  event: string;
  target: string;
  kind: string;
  sig: boolean;
  hash: string;
  prevHash: string;
  ip: string;
  reason: string | null;
  meaning: string | null;
  /** Which chained store the entry was read from. */
  source: AuditLedgerSource;
  /** The store's own order key: audit_logs.chain_seq (null for a legacy row) or audit_events.sequence_number. */
  seq: number | null;
}

// ─── Pure helpers (presentation derivations of REAL columns) ──────────────────

/** First non-empty string value found under `keys` in a JSON `metadata` object. */
function metaString(meta: unknown, keys: string[]): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** Turn a dotted/underscored event_type token into a Title Case label. */
function humanizeEventType(eventType: unknown): string {
  const raw = typeof eventType === 'string' ? eventType.trim() : '';
  if (!raw) return 'Event';
  const words = raw
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length > 0 ? words.join(' ') : 'Event';
}

/**
 * Deterministic bucket of the REAL event_type / signature status into one of the
 * surface's fixed AUDIT_KINDS ids (esign|submission|validation|review|vault|
 * authoring|admin). This is a presentation classification of real data — the
 * same kind of derivation the existing formatAuditRow does for severity /
 * component — never a stored column and never fabricated. 'admin' is the
 * catch-all, matching the fixture's use of that kind for uncategorized events.
 */
const SIGN_TOKENS = new Set([
  'sign', 'signed', 'signing', 'signature', 'signatures', 'esign', 'esignature',
  'countersign', 'countersigned',
]);
const KIND_KEYWORDS: Array<[string, string[]]> = [
  ['submission', ['submit', 'submission', 'ectd', 'dispatch', 'gateway', 'esg', 'transmit', 'filing', 'sequence', 'leaf']],
  ['validation', ['validat', 'evalidator', 'preflight', 'conformance', 'verif', 'qc']],
  ['review', ['review', 'comment', 'reject', 'approv']],
  ['vault', ['upload', 'vault', 'document', 'dataset', 'lock', 'file', 'archive']],
  ['authoring', ['draft', 'author', 'generat', 'write', 'rewrite', 'edit', 'section', 'render']],
];

function deriveKind(eventType: unknown, signatureStatus: unknown): string {
  const status = String(signatureStatus ?? '').toLowerCase();
  const et = String(eventType ?? '').toLowerCase();
  const tokens = et.split(/[^a-z0-9]+/).filter((t) => t.length > 0);
  if (status === 'signed' || tokens.some((t) => SIGN_TOKENS.has(t)) || et.includes('signature')) {
    return 'esign';
  }
  for (const [kind, keys] of KIND_KEYWORDS) {
    if (keys.some((k) => et.includes(k))) return kind;
  }
  return 'admin';
}

/** Real audit_events target: a metadata label if stored, else entity_type[+entity_id]. */
function deriveEventTarget(row: Record<string, unknown>): string {
  const fromMeta = metaString(row.metadata, [
    'target', 'entityName', 'projectName', 'projectId', 'applicationNumber',
  ]);
  if (fromMeta) return fromMeta;
  const entityType =
    typeof row.entity_type === 'string' && row.entity_type.trim().length > 0
      ? row.entity_type.trim()
      : 'system';
  const idNum = row.entity_id == null ? 0 : Number(row.entity_id);
  return Number.isFinite(idNum) && idNum > 0 ? `${entityType} ${idNum}` : entityType;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  return '';
}

function seqOf(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ─── Row → entry ──────────────────────────────────────────────────────────────

function auditLogEntry(row: Record<string, unknown>): AuditLedgerEntry {
  const payload = row.new_values;
  const actorId = row.actor_id == null ? null : Number(row.actor_id);
  return {
    id: `AUD-${String(row.id)}`,
    when: typeof row.when_display === 'string' ? row.when_display : '',
    at: isoOf(row.occurred_at),
    actor:
      nonEmpty(row.user_name) ??
      nonEmpty(row.user_email) ??
      (actorId != null && Number.isFinite(actorId) ? `user ${actorId}` : 'System'),
    event: metaString(payload, ['description', 'summary', 'title', 'message']) ?? humanizeEventType(row.action),
    target:
      nonEmpty(row.target) ??
      `${nonEmpty(row.table_name) ?? 'system'}${nonEmpty(row.record_id) ? ` ${String(row.record_id).trim()}` : ''}`,
    kind: deriveKind(row.action, null),
    // audit_logs carries no §11.50 signature status; see the header.
    sig: false,
    hash: String(row.sha256_chain),
    prevHash: row.prev_hash == null ? 'genesis' : String(row.prev_hash),
    ip: nonEmpty(row.ip_address) ?? '',
    reason: nonEmpty(row.reason),
    meaning: metaString(payload, ['meaning', 'signatureMeaning', 'signature_meaning']),
    source: 'audit_logs',
    seq: seqOf(row.chain_seq),
  };
}

function auditEventEntry(row: Record<string, unknown>): AuditLedgerEntry {
  return {
    id: `AUD-${String(row.id)}`,
    when: typeof row.when_display === 'string' ? row.when_display : '',
    at: isoOf(row.at),
    actor: nonEmpty(row.user_name) ?? 'System',
    event:
      metaString(row.metadata, ['description', 'summary', 'title', 'message']) ??
      humanizeEventType(row.event_type),
    target: deriveEventTarget(row),
    kind: deriveKind(row.event_type, row.signature_status),
    sig: String(row.signature_status ?? '').toLowerCase() === 'signed',
    // REAL chain values. record_hash is guaranteed non-null by the WHERE
    // filter; a NULL previous_hash is the org's genesis row, encoded as the
    // 'genesis' sentinel the surface's terminal chain check looks for.
    hash: String(row.record_hash),
    prevHash: row.previous_hash == null ? 'genesis' : String(row.previous_hash),
    ip: nonEmpty(row.ip_address) ?? '',
    reason: nonEmpty(row.reason),
    meaning: nonEmpty(row.signature_meaning),
    source: 'audit_events',
    seq: seqOf(row.sequence_number),
  };
}

// ─── SQL ──────────────────────────────────────────────────────────────────────

/**
 * The tenant's chained audit_logs rows, newest first, each with the hash of
 * its predecessor in the tenant's chain. The window runs over the tenant's
 * rows only (the WHERE is applied before it), so nothing of another tenant is
 * read; the prev_hash of the chain's first row is NULL → 'genesis'.
 */
const AUDIT_LOGS_SQL = `
  WITH chained AS (
    SELECT a.id, a.action, a.actor_id, a.target, a.table_name, a.record_id, a.reason,
           a.ip_address, a.new_values, a.occurred_at, a.sha256_chain, a.chain_seq,
           LAG(a.sha256_chain) OVER (ORDER BY ${AUDIT_CHAIN_ORDER_ASC_SQL}) AS prev_hash
      FROM audit_logs a
     WHERE a.tenant_id = $1
       AND a.sha256_chain IS NOT NULL
  )
  SELECT c.id, c.action, c.actor_id, c.target, c.table_name, c.record_id, c.reason,
         c.ip_address, c.new_values, c.occurred_at, c.sha256_chain, c.chain_seq, c.prev_hash,
         to_char(c.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS when_display,
         u.name  AS user_name,
         u.email AS user_email
    FROM chained c
    LEFT JOIN users u ON u.id = c.actor_id
   ORDER BY ${AUDIT_CHAIN_HEAD_ORDER_SQL}
   LIMIT $2`;

const AUDIT_EVENTS_SQL = `
  SELECT id,
         event_type,
         entity_type,
         entity_id,
         user_name,
         ip_address,
         "timestamp" AS at,
         to_char("timestamp", 'YYYY-MM-DD HH24:MI') AS when_display,
         reason,
         signature_status,
         signature_meaning,
         record_hash,
         previous_hash,
         sequence_number,
         metadata
    FROM audit_events
   WHERE organization_id = $1
     AND record_hash IS NOT NULL
   ORDER BY sequence_number DESC NULLS LAST, id DESC
   LIMIT $2`;

export interface AuditLedgerResponse {
  success: true;
  data: AuditLedgerEntry[];
  /** How many entries each store contributed to `data`. */
  sources: Record<AuditLedgerSource, number>;
}

/**
 * Read both stores for one tenant and merge newest-first. Exported so the
 * read-model is testable against a real (PGlite) database without HTTP.
 */
export async function readAuditLedger(
  client: Pick<PoolClient, 'query'>,
  orgId: number,
  limit: number,
): Promise<AuditLedgerResponse> {
  const [logs, events] = await Promise.all([
    client.query(AUDIT_LOGS_SQL, [orgId, limit]),
    client.query(AUDIT_EVENTS_SQL, [orgId, limit]),
  ]);
  const merged = [
    ...logs.rows.map((r: Record<string, unknown>) => auditLogEntry(r)),
    ...events.rows.map((r: Record<string, unknown>) => auditEventEntry(r)),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
  const sources: Record<AuditLedgerSource, number> = { audit_logs: 0, audit_events: 0 };
  for (const e of merged) sources[e.source] += 1;
  return { success: true, data: merged, sources };
}

// ─── Router Factory ───────────────────────────────────────────────────────────

/**
 * Mount: app.use('/api/audit-trail', authenticateToken, createAuditTrailLedgerRoutes(pool));
 * The mount supplies authenticateToken (populating req.user) and the shared pg Pool.
 */
export default function createAuditTrailLedgerRoutes(pool: Pick<Pool, 'connect'>): Router {
  const router = Router();

  /**
   * GET /api/audit-trail/ledger?limit=200
   *
   * Org-scoped, newest-first slice of the hash-chained audit ledger in the
   * AuditEntry display shape, merged from audit_logs (the launch apps'
   * governed writes) and audit_events (SCIM / projects-management / IVDR),
   * each entry labelled with its `source`. Response:
   * { success: true, data: AuditLedgerEntry[], sources: { audit_logs, audit_events } }.
   */
  router.get('/ledger', async (req: Request, res: Response) => {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return; // 403 already sent — tenant context is mandatory

    const limit = Math.min(
      1000,
      Math.max(1, Number.parseInt(String(req.query.limit ?? '200'), 10) || 200),
    );

    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await setTenantContextTx(client, guard.orgId);
      const ledger = await readAuditLedger(client, guard.orgId, limit);
      await client.query('COMMIT');
      return res.json(ledger);
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      const code =
        typeof error === 'object' && error !== null
          ? (error as { code?: unknown }).code
          : undefined;
      // Fail closed on a missing table/column (schema not migrated in this env):
      // 42P01 undefined_table, 42703 undefined_column. Never return an empty
      // ledger as if it were a verified "no events" state — a 503 lets the
      // surface show its could-not-read state instead of a false-empty
      // Part 11 trail.
      if (code === '42P01' || code === '42703') {
        logger.warn('audit ledger schema unavailable; failing closed', {
          code: String(code),
        });
        return res.status(503).json({ success: false, error: 'AUDIT_TABLE_MISSING' });
      }
      logger.error('audit ledger read failed', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to read audit ledger' });
    } finally {
      client?.release();
    }
  });

  return router;
}
