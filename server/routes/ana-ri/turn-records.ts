/**
 * AnA turn records — read, verify and export, for the person who asked and for
 * an inspector.
 *
 *   GET /api/ana-ri/turn-records?thread_id=&run_id=&limit=   the records, newest first
 *   GET /api/ana-ri/turn-records/:id                 one record, re-verified now
 *   GET /api/ana-ri/turn-records/:id/export          a self-contained package an
 *                                                    inspector can check offline
 *
 * The record is written by the stream (services/ana/turn-record.ts) into an
 * append-only table and chained into the tenant's audit_logs. Nothing here
 * writes a record or changes one; the export writes one audit row saying who
 * exported what, and refuses to export when that row cannot be written
 * (§11.10(e): an export is itself an event on the record).
 *
 * Who may read: the person whose turn it was, and the organization's admins
 * and owners — the people who answer an inspector. A record in another
 * organization is 404: its existence is not confirmable from outside. A
 * colleague's record in the same organization is 403, as for a colleague's run.
 *
 * Every verdict is recomputed from the stored bytes on each read. A verdict is
 * never cached, and one that could not be computed is said to be unknown,
 * never reported as passing.
 *
 * @compliance 21 CFR Part 11 §11.10(b), (c), (e); EU Annex 11 §9.
 * @module server/routes/ana-ri/turn-records
 */

import type { Request, Response, Router } from 'express';

import { requestConnectable, requestPgClient } from '../../db/requestDb.js';
import { writeChainedAuditRow } from '../../services/auditService.js';
import { verifyTenantChainOnAdminScope } from '../../services/audit/tenant-chain-verdict.js';
import { TURN_RECORD_RESOURCE } from '../../services/ana/turn-record.js';
import {
  listTurnRecords,
  loadTurnRecord,
  verifyStoredTurnRecord,
  type StoredTurnRecord,
} from '../../services/ana/turn-record-verify.js';
import { extractRequestContext, sendError, sendSuccess } from './shared.js';

export const TURN_RECORD_EXPORT_ACTION = 'ana.turn.exported';
export const TURN_RECORD_EXPORT_FORMAT = 'ana-turn-record-export/1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Org roles that may read every record in their organization. */
const RECORD_READER_ROLES = new Set(['admin', 'owner']);

/** True when the caller may read any record in their organization. */
export function readsEveryRecord(user: { role?: unknown; roles?: unknown } | undefined): boolean {
  const roles: unknown[] = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : [user?.role];
  return roles.some((r) => typeof r === 'string' && RECORD_READER_ROLES.has(r.toLowerCase()));
}

/** The steps an inspector follows to check an exported package without this server. */
export const HOW_TO_VERIFY: readonly string[] = [
  'SHA-256 of record.recordText (UTF-8) equals record.recordSha256.',
  'Every { sha256 } the record references appears in texts, and SHA-256 of that text (UTF-8) equals it.',
  'chain.details.recordSha256 equals record.recordSha256.',
  'SHA-256 of JSON.stringify(chain.details) equals chain.payloadHash — the value the chain link was computed over.',
  "tenantChain is the server's walk of the organization's whole audit chain at export time; `npm run ops:verify-audit-chain` repeats it against the database.",
];

type Access =
  | { ok: true; orgId: number; userId: number | null; everyRecord: boolean }
  | { ok: false };

function accessOf(req: Request, res: Response): Access {
  const { orgId, userId } = extractRequestContext(req);
  if (orgId == null) {
    sendError(res, 401, 'Organization context required', null, 'ORG_REQUIRED');
    return { ok: false };
  }
  return { ok: true, orgId, userId, everyRecord: readsEveryRecord((req as any).user) };
}

/** Load one record the caller may read, or answer the refusal and return null. */
async function recordFor(req: Request, res: Response, access: Extract<Access, { ok: true }>): Promise<StoredTurnRecord | null> {
  const id = String(req.params.id);
  if (!UUID.test(id)) {
    sendError(res, 404, 'Turn record not found', null, 'TURN_RECORD_NOT_FOUND');
    return null;
  }
  const record = await loadTurnRecord(requestPgClient(req), access.orgId, id);
  if (!record) {
    sendError(res, 404, 'Turn record not found', null, 'TURN_RECORD_NOT_FOUND');
    return null;
  }
  if (!access.everyRecord && (access.userId == null || record.actorUserId !== access.userId)) {
    sendError(res, 403, "That turn record belongs to someone else's conversation", null, 'TURN_RECORD_NOT_YOURS');
    return null;
  }
  return record;
}

const metaOf = (r: StoredTurnRecord) => ({
  id: r.id,
  organizationId: r.organizationId,
  threadId: r.threadId,
  runId: r.runId,
  actorUserId: r.actorUserId,
  outcome: r.outcome,
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  schemaVersion: r.schemaVersion,
  createdAt: r.createdAt,
  recordSha256: r.recordSha256,
});

/** GET /turn-records — the caller's records, or every record for an admin or owner. */
async function listRecords(req: Request, res: Response) {
  const access = accessOf(req, res);
  if (!access.ok) return;
  if (!access.everyRecord && access.userId == null) {
    return sendError(res, 403, 'A signed-in person is required', null, 'USER_REQUIRED');
  }
  const threadId = typeof req.query.thread_id === 'string' && req.query.thread_id ? req.query.thread_id : null;
  // The run a turn was served under — how a client that closed its connection
  // before the turn ended (Stop, a dropped network) learns what was filed.
  const runId = typeof req.query.run_id === 'string' && req.query.run_id ? req.query.run_id : null;
  const requestedActor = Number(req.query.actor_user_id);
  const actorUserId = access.everyRecord
    ? Number.isInteger(requestedActor) && requestedActor > 0 ? requestedActor : null
    : access.userId;
  try {
    const records = await listTurnRecords(requestPgClient(req), access.orgId, {
      threadId,
      runId,
      actorUserId,
      limit: Number(req.query.limit) || 100,
    });
    return sendSuccess(res, { records }, { count: records.length });
  } catch (err: any) {
    console.error('[turn-records] list failed:', err?.message);
    return sendError(res, 500, 'The turn records could not be read', null, 'TURN_RECORDS_UNAVAILABLE');
  }
}

/** GET /turn-records/:id — one record, re-verified from the stored bytes. */
async function readRecord(req: Request, res: Response) {
  const access = accessOf(req, res);
  if (!access.ok) return;
  try {
    const record = await recordFor(req, res, access);
    if (!record) return;
    const verdict = verifyStoredTurnRecord(record);
    const withTexts = req.query.texts === '1' || req.query.texts === 'true';
    return sendSuccess(res, {
      ...metaOf(record),
      record: JSON.parse(record.recordText),
      chain: record.chain,
      verdict,
      ...(withTexts ? { texts: Object.fromEntries(record.texts) } : {}),
    });
  } catch (err: any) {
    console.error('[turn-records] read failed:', err?.message);
    return sendError(res, 500, 'The turn record could not be read', null, 'TURN_RECORD_UNAVAILABLE');
  }
}

/** GET /turn-records/:id/export — recorded on the chain first, then handed over. */
async function exportRecord(req: Request, res: Response) {
  const access = accessOf(req, res);
  if (!access.ok) return;
  let record: StoredTurnRecord | null;
  try {
    record = await recordFor(req, res, access);
  } catch (err: any) {
    console.error('[turn-records] export read failed:', err?.message);
    return sendError(res, 500, 'The turn record could not be read', null, 'TURN_RECORD_UNAVAILABLE');
  }
  if (!record) return;

  const verdict = verifyStoredTurnRecord(record);
  // The whole tenant chain, walked now. A walk that could not run is
  // reported as unknown — an export never implies a check that did not happen.
  let tenantChain: { ok: boolean | null; rowsChecked?: number; brokenAt?: unknown; reason?: string };
  try {
    const walk = await verifyTenantChainOnAdminScope(access.orgId);
    tenantChain = { ok: walk.ok, rowsChecked: walk.rowsChecked, ...(walk.brokenAt ? { brokenAt: walk.brokenAt } : {}) };
  } catch (err: any) {
    console.error('[turn-records] tenant chain walk failed:', err?.message);
    tenantChain = { ok: null, reason: 'The audit chain could not be walked at export time.' };
  }

  const exportedAt = new Date().toISOString();
  // The export is recorded before anything leaves; no row, no export.
  const client = await requestConnectable(req).connect();
  try {
    await client.query('BEGIN');
    await writeChainedAuditRow(client, {
      tenantId: access.orgId,
      userId: access.userId ?? undefined,
      action: TURN_RECORD_EXPORT_ACTION,
      resourceType: TURN_RECORD_RESOURCE,
      resourceId: record.id,
      details: {
        recordSha256: record.recordSha256,
        format: TURN_RECORD_EXPORT_FORMAT,
        verdictOk: verdict.ok,
        tenantChainOk: tenantChain.ok,
        exportedAt,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[turn-records] export not recorded:', err?.message);
    return sendError(
      res,
      503,
      'The export was refused because it could not be recorded in the audit trail. Nothing was exported.',
      null,
      'TURN_RECORD_EXPORT_NOT_RECORDED',
    );
  } finally {
    client.release();
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ana-turn-${record.id}.json"`);
  res.setHeader('X-Turn-Record-Sha256', record.recordSha256);
  return res.send(
    JSON.stringify(
      {
        format: TURN_RECORD_EXPORT_FORMAT,
        exportedAt,
        exportedBy: { userId: access.userId },
        record: { ...metaOf(record), recordText: record.recordText },
        texts: Object.fromEntries(record.texts),
        chain: record.chain,
        verdict,
        tenantChain,
        howToVerify: HOW_TO_VERIFY,
      },
      null,
      2,
    ),
  );
}

/** Register the turn-record read endpoints on the given router. */
export function mountTurnRecordRoutes(router: Router): void {
  router.get('/turn-records', listRecords);
  router.get('/turn-records/:id', readRecord);
  router.get('/turn-records/:id/export', exportRecord);
}
