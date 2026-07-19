/**
 * Audit Trail Ledger — read-model for the ui-v2 "audit-trail" surface.
 *
 * Serves the immutable, hash-chained 21 CFR Part 11 §11.10(e) audit ledger in
 * the exact display shape the AuditTrail surface renders
 * (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx → AUDIT_LOG /
 * AuditEntry in v2/fixtures/admin-data.ts).
 *
 * Source of truth is the org-scoped, tamper-evident `audit_events` table — the
 * SIEM / export-facing audit table whose per-organization SHA-256 hash chain
 * (record_hash / previous_hash / sequence_number) is auto-populated by the
 * `trg_audit_events_hash_chain` BEFORE INSERT trigger + backfill
 * (db/migrations/20260222_audit_events_hash_chain.sql). The genesis row per org
 * has previous_hash = NULL.
 *
 * HONESTY (regulated product — Part 11 surface):
 *   • hash      = the REAL stored record_hash (full SHA-256 hex, never truncated
 *                 or fabricated). Only rows that actually carry a computed
 *                 record_hash are returned, so the chain the surface verifies
 *                 (prevHash === next.hash) is real and contiguous.
 *   • prevHash  = the REAL stored previous_hash; a NULL previous_hash IS the
 *                 org's genesis row, encoded as the 'genesis' sentinel the
 *                 surface's terminal chain check looks for.
 *   • sig       = a genuine 21 CFR §11.50 signed status (signature_status =
 *                 'signed'), NOT the integrity/HMAC seal — an unsigned or
 *                 non-authoritative ('unverified') record reports sig=false.
 *   • meaning   = the stored signature_meaning; reason = the stored reason.
 * Nothing is invented. `event`, `target`, and `kind` are presentation
 * derivations of real columns (documented at each helper); when no truthful
 * source exists a field falls back to a real, lower-fidelity value (e.g. the
 * humanized event_type) rather than a fabricated one.
 *
 * @module routes/audit-trail-ledger.routes
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';

import { createScopedLogger } from '../utils/logger.js';
import { requireAuthedOrgId } from '../utils/authedOrgId';

const logger = createScopedLogger('audit-trail-ledger-routes');

// ─── Display shape (mirrors AuditEntry in v2/fixtures/admin-data.ts) ──────────
interface AuditLedgerEntry {
  id: string;
  when: string;
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
  ['submission', ['submit', 'submission', 'ectd', 'dispatch', 'gateway', 'esg', 'transmit', 'filing', 'sequence']],
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

/** Real event target: a metadata label if stored, else entity_type[+entity_id]. */
function deriveTarget(row: Record<string, unknown>): string {
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

// ─── Router Factory ───────────────────────────────────────────────────────────

/**
 * Mount: app.use('/api/audit-trail', authenticateToken, createAuditTrailLedgerRoutes(pool));
 * The mount supplies authenticateToken (populating req.user) and the shared pg Pool.
 */
export default function createAuditTrailLedgerRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/audit-trail/ledger?limit=200
   *
   * Org-scoped, newest-first slice of the hash-chained audit ledger in the
   * AuditEntry display shape. Only rows carrying a real record_hash are
   * returned, so consecutive entries satisfy prevHash === next.hash and the
   * oldest genuine genesis row surfaces prevHash === 'genesis'. Response:
   * { success: true, data: AuditLedgerEntry[] }.
   */
  router.get('/ledger', async (req: Request, res: Response) => {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return; // 403 already sent — tenant context is mandatory

    const limit = Math.min(
      1000,
      Math.max(1, Number.parseInt(String(req.query.limit ?? '200'), 10) || 200),
    );

    try {
      const result = await pool.query(
        `SELECT id,
                event_type,
                entity_type,
                entity_id,
                user_name,
                ip_address,
                to_char("timestamp", 'YYYY-MM-DD HH24:MI') AS when_display,
                reason,
                signature_status,
                signature_meaning,
                record_hash,
                previous_hash,
                metadata
           FROM audit_events
          WHERE organization_id = $1
            AND record_hash IS NOT NULL
          ORDER BY sequence_number DESC NULLS LAST, id DESC
          LIMIT $2`,
        [guard.orgId, limit],
      );

      const data: AuditLedgerEntry[] = result.rows.map((row: Record<string, unknown>): AuditLedgerEntry => {
        const sig = String(row.signature_status ?? '').toLowerCase() === 'signed';
        const meaning =
          typeof row.signature_meaning === 'string' && row.signature_meaning.trim().length > 0
            ? row.signature_meaning.trim()
            : null;
        const reason =
          typeof row.reason === 'string' && row.reason.trim().length > 0
            ? row.reason.trim()
            : null;
        return {
          id: `AUD-${String(row.id)}`,
          when: typeof row.when_display === 'string' ? row.when_display : '',
          actor:
            typeof row.user_name === 'string' && row.user_name.trim().length > 0
              ? row.user_name.trim()
              : 'System',
          event:
            metaString(row.metadata, ['description', 'summary', 'title', 'message']) ??
            humanizeEventType(row.event_type),
          target: deriveTarget(row),
          kind: deriveKind(row.event_type, row.signature_status),
          sig,
          // REAL chain values. record_hash is guaranteed non-null by the WHERE
          // filter; a NULL previous_hash is the org's genesis row, encoded as the
          // 'genesis' sentinel the surface's terminal chain check looks for.
          hash: String(row.record_hash),
          prevHash: row.previous_hash == null ? 'genesis' : String(row.previous_hash),
          ip:
            typeof row.ip_address === 'string' && row.ip_address.trim().length > 0
              ? row.ip_address.trim()
              : '',
          reason,
          meaning,
        };
      });

      return res.json({ success: true, data });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null
          ? (error as { code?: unknown }).code
          : undefined;
      // Fail closed on a missing table/column (schema not migrated in this env):
      // 42P01 undefined_table, 42703 undefined_column. Never return an empty
      // ledger as if it were a verified "no events" state — a 503 lets the
      // surface keep its Sample-data fixture instead of showing a false-empty
      // Part 11 trail.
      if (code === '42P01' || code === '42703') {
        logger.warn('audit_events hash-chain schema unavailable; failing closed', {
          code: String(code),
        });
        return res.status(503).json({ success: false, error: 'AUDIT_TABLE_MISSING' });
      }
      logger.error('audit ledger read failed', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to read audit ledger' });
    }
  });

  return router;
}
