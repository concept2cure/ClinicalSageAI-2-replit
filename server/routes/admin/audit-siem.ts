/**
 * SIEM audit feed — /api/admin/audit/siem
 *
 * An incremental, cursor-paginated pull API that lets a client's SOC tooling
 * (Splunk, Microsoft Sentinel, Elastic, Vector, Filebeat, …) ingest this
 * tenant's 21 CFR Part 11 audit trail. The existing /api/audit/export endpoint
 * produces a one-shot signed *bundle* for archival/evidence; this complements
 * it with a poll-friendly feed designed for automated collectors:
 *
 *   - Cursor is the monotonic `audit_events.id`; the collector passes the last
 *     id it saw as `?after=` and reads forward. The response advertises the
 *     next cursor in the `X-Audit-Next-Cursor` header.
 *   - Default output is NDJSON (one JSON object per line) — the lingua franca
 *     of log shippers. `?format=json` returns a JSON envelope instead.
 *   - Every record carries its hash-chain fields (recordHash / previousHash /
 *     sequenceNumber) so the SOC can independently verify tamper-evidence
 *     (§11.10(e)) without trusting the transport.
 *
 * Tenancy: the org id is sourced from the verified JWT (authedOrgId), NEVER
 * from request input — a collector can only ever read its own org's events.
 * We intentionally do NOT write an audit event per pull: a SIEM collector polls
 * continuously, and auditing the read would grow the trail unbounded (and feed
 * back into the very stream being read).
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../../auth';
import { requireRole } from '../../middleware/auth';
import { query } from '../../db';
import { requireAuthedOrgId } from '../../utils/authedOrgId';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('admin-audit-siem');
const router = Router();

router.use(authMiddleware);
// Admin-gated; the query is always org-bound (below), so a caller only ever
// reads their OWN org's trail. (The platform's runtime requireRole honours the
// first role plus a global `admin` override — matching the established admin
// route pattern; the extra roles are forward-compatible intent.)
const requireAdmin = requireRole('super_admin', 'platform_admin', 'admin', 'compliance_officer');

// A SIEM collector polls often; keep it generous but bounded per IP.
const siemRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
});

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

interface AuditRow {
  id: number;
  sequence_number: number | null;
  event_type: string;
  entity_type: string;
  entity_id: number | null;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  ip_address: string | null;
  timestamp: Date | string;
  timestamp_utc: Date | string;
  reason: string | null;
  regulatory_significant: boolean | null;
  gxp_relevant: boolean | null;
  record_hash: string | null;
  previous_hash: string | null;
  metadata: unknown;
}

function toEvent(row: AuditRow): Record<string, unknown> {
  return {
    id: row.id,
    sequenceNumber: row.sequence_number,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    ipAddress: row.ip_address,
    timestamp: row.timestamp,
    timestampUtc: row.timestamp_utc,
    reason: row.reason,
    regulatorySignificant: row.regulatory_significant ?? false,
    gxpRelevant: row.gxp_relevant ?? false,
    // Hash-chain integrity (21 CFR Part 11 §11.10(e)) — lets the SOC verify the
    // feed wasn't altered in transit/storage.
    recordHash: row.record_hash,
    previousHash: row.previous_hash,
    metadata: row.metadata ?? null,
  };
}

function parseIntParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// ─── Feed (incremental pull) ─────────────────────────────────────────────────
//
// GET /api/admin/audit/siem?after=<id>&limit=<n>&eventType=<t>&since=<iso>&format=ndjson|json
router.get('/siem', siemRateLimiter, requireAdmin, async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return; // 403 already sent
  const orgId = guard.orgId;

  try {
    // `after` is a pagination CURSOR (an audit_events.id), not a tenant id —
    // org scoping is fixed from the JWT above, so reading it from the query is
    // safe and is how a collector advances through the feed.
    const after = parseIntParam(req.query.after, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = parseIntParam(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const eventType =
      typeof req.query.eventType === 'string' && req.query.eventType.length > 0
        ? req.query.eventType.slice(0, 100)
        : null;
    const sinceRaw = typeof req.query.since === 'string' ? req.query.since : null;
    const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : null;
    const format = req.query.format === 'json' ? 'json' : 'ndjson';

    const params: unknown[] = [orgId, after];
    let sql =
      `SELECT id, sequence_number, event_type, entity_type, entity_id, user_id, user_name,
              user_role, ip_address, timestamp, timestamp_utc, reason, regulatory_significant,
              gxp_relevant, record_hash, previous_hash, metadata
         FROM audit_events
        WHERE organization_id = $1 AND id > $2`;
    if (eventType) {
      params.push(eventType);
      sql += ` AND event_type = $${params.length}`;
    }
    if (since) {
      params.push(since);
      sql += ` AND timestamp_utc >= $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY id ASC LIMIT $${params.length}`;

    const result = await query(sql, params);
    const rows = result.rows as AuditRow[];
    const events = rows.map(toEvent);
    const nextCursor = rows.length ? rows[rows.length - 1].id : after;

    // Collectors checkpoint on this cursor; `hasMore` tells them to poll again now.
    res.setHeader('X-Audit-Next-Cursor', String(nextCursor));
    res.setHeader('X-Audit-Count', String(events.length));
    res.setHeader('X-Audit-Has-More', rows.length === limit ? 'true' : 'false');

    if (format === 'json') {
      return res.json({ count: events.length, nextCursor, hasMore: rows.length === limit, events });
    }
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    const body = events.map(e => JSON.stringify(e)).join('\n');
    return res.send(events.length ? body + '\n' : '');
  } catch (err) {
    logger.error('SIEM audit feed failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to read audit feed.' });
  }
});

// ─── Head (lag detection) ────────────────────────────────────────────────────
//
// GET /api/admin/audit/siem/head — the org's current tip, so a collector can
// tell how far behind it is without paging the whole feed.
router.get('/siem/head', siemRateLimiter, requireAdmin, async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;
  const orgId = guard.orgId;

  try {
    const result = await query(
      `SELECT COALESCE(MAX(id), 0) AS latest_id,
              COALESCE(MAX(sequence_number), 0) AS latest_sequence,
              COUNT(*)::int AS total
         FROM audit_events
        WHERE organization_id = $1`,
      [orgId]
    );
    const row = (result.rows[0] ?? {}) as { latest_id?: number; latest_sequence?: number; total?: number };
    return res.json({
      latestId: Number(row.latest_id ?? 0),
      latestSequence: Number(row.latest_sequence ?? 0),
      total: Number(row.total ?? 0),
    });
  } catch (err) {
    logger.error('SIEM audit head failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to read audit head.' });
  }
});

export default router;
