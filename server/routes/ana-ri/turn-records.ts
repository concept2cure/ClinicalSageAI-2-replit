/**
 * AnA turn records — read, verify and export, for the person who asked and for
 * an inspector.
 *
 *   GET /api/ana-ri/turn-records?thread_id=&run_id=&limit=   the records, newest first
 *   GET /api/ana-ri/turn-records/:id                 one record, re-verified now
 *   GET /api/ana-ri/turn-records/:id/summary         the turn's Summary: what AnA did,
 *                                                    redacted by construction (S4)
 *   GET /api/ana-ri/turn-records/:id/export          a self-contained package an
 *                                                    inspector can check offline
 *
 * The record is written by the stream (services/ana/turn-record.ts) into an
 * append-only table and chained into the tenant's audit_logs. Nothing here
 * writes a record or changes one; the export writes one audit row saying who
 * exported what, and refuses to export when that row cannot be written
 * (§11.10(e): an export is itself an event on the record).
 *
 * Who may read the full record (its texts, its export): the person whose turn
 * it was, and the organization's admins and owners — the people who answer an
 * inspector. A record in another organization is 404: its existence is not
 * confirmable from outside. A colleague's record in the same organization is
 * 403, as for a colleague's run.
 *
 * Who may read a turn's Summary: anyone who may read the conversation's
 * transcript — the organisation's own thread (decision 6 of ANA-SUMMARY, as
 * the product owner took it on 2026-10-08). The Summary holds nothing the
 * Summary never contains (turn-summary.ts), and the transcript already shows
 * the answer and its steps. A turn with no conversation has no transcript, so
 * its Summary keeps the record's rule. A thread's record listing follows the
 * same rule, so a colleague's reloaded conversation finds each turn's record,
 * without being told who asked.
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
import { sendAuditedExport, walkTenantChain } from '../../services/audit/audited-export.js';
import { TURN_RECORD_RESOURCE } from '../../services/ana/turn-record.js';
import {
  listTurnRecords,
  loadTurnRecord,
  verifyStoredTurnRecord,
  type ListedTurnRecord,
  type StoredTurnRecord,
} from '../../services/ana/turn-record-verify.js';
import { buildTurnSummary } from '../../services/ana/turn-summary.js';
import { resolveThreadStore } from '../../services/chat-thread-helpers.js';
import { readsEveryRecord } from './record-access.js';
import { extractRequestContext, sendError, sendSuccess } from './shared.js';

export const TURN_RECORD_EXPORT_ACTION = 'ana.turn.exported';
export const TURN_RECORD_EXPORT_FORMAT = 'ana-turn-record-export/1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** The asker, or someone who reads every record: who may have the full record. */
const holdsFullRecord = (access: Extract<Access, { ok: true }>, actorUserId: number | null) =>
  access.everyRecord || (access.userId != null && actorUserId === access.userId);

/** The conversation's transcript is readable in this organisation (chat-thread-helpers.ts resolveThreadStore). */
async function transcriptReadable(req: Request, orgId: number, threadId: string | null): Promise<boolean> {
  return threadId ? (await resolveThreadStore(threadId, orgId, requestPgClient(req))) !== null : false;
}

/**
 * Load one record the caller may read, or answer the refusal and return null.
 * `reach` is what is being read: the full record (the asker and admins), or
 * its Summary (anyone who may read the conversation's transcript).
 */
async function recordFor(
  req: Request,
  res: Response,
  access: Extract<Access, { ok: true }>,
  reach: 'record' | 'summary' = 'record',
): Promise<StoredTurnRecord | null> {
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
  if (holdsFullRecord(access, record.actorUserId)) return record;
  if (reach === 'summary' && (await transcriptReadable(req, access.orgId, record.threadId))) return record;
  sendError(
    res,
    403,
    reach === 'summary'
      ? "This turn's record is visible to the person who asked and to administrators."
      : 'The full record is available to the person who asked and to administrators.',
    null,
    'TURN_RECORD_NOT_YOURS',
  );
  return null;
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

/** A listed record as a caller who is not its asker sees it: not told who asked. */
const listedFor = (access: Extract<Access, { ok: true }>) => (r: ListedTurnRecord) =>
  holdsFullRecord(access, r.actorUserId)
    ? r
    : {
        id: r.id,
        threadId: r.threadId,
        assistantMessageId: r.assistantMessageId,
        outcome: r.outcome,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        recordSha256: r.recordSha256,
      };

/**
 * Whose records a listing returns: one person's for an admin who asks for
 * one, every one for an admin who does not; for anyone else their own — or,
 * within one conversation whose transcript they may read, the whole
 * conversation's (decision 6).
 */
async function listedActor(req: Request, access: Extract<Access, { ok: true }>, threadId: string | null, runId: string | null) {
  if (access.everyRecord) {
    const requested = Number(req.query.actor_user_id);
    return Number.isInteger(requested) && requested > 0 ? requested : null;
  }
  const wholeThread = !runId && (await transcriptReadable(req, access.orgId, threadId));
  return wholeThread ? null : access.userId;
}

/**
 * GET /turn-records — the caller's records, or every record for an admin or
 * owner. Within one conversation whose transcript the caller may read, every
 * turn's record, so a reloaded conversation can open each turn's Summary.
 */
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
  try {
    const actorUserId = await listedActor(req, access, threadId, runId);
    const records = (
      await listTurnRecords(requestPgClient(req), access.orgId, {
        threadId,
        runId,
        actorUserId,
        limit: Number(req.query.limit) || 100,
      })
    ).map(listedFor(access));
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

/**
 * GET /turn-records/:id/summary — the turn's Summary, re-verified from the
 * stored bytes on this read. Built by allow-list (turn-summary.ts); never the
 * record's metadata, which names the organisation and the person.
 */
async function readSummary(req: Request, res: Response) {
  const access = accessOf(req, res);
  if (!access.ok) return;
  try {
    const record = await recordFor(req, res, access, 'summary');
    if (!record) return;
    return sendSuccess(res, buildTurnSummary(record, verifyStoredTurnRecord(record)));
  } catch (err: any) {
    console.error('[turn-records] summary read failed:', err?.message);
    return sendError(res, 500, "The turn's summary could not be read", null, 'TURN_SUMMARY_UNAVAILABLE');
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
  const tenantChain = await walkTenantChain(access.orgId);
  const exportedAt = new Date().toISOString();
  // Recorded on the chain before anything leaves; no row, no export.
  return sendAuditedExport(requestConnectable(req), res, {
    tenantId: access.orgId,
    userId: access.userId,
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
    filename: `ana-turn-${record.id}.json`,
    headers: { 'X-Turn-Record-Sha256': record.recordSha256 },
    refusalCode: 'TURN_RECORD_EXPORT_NOT_RECORDED',
    body: {
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
  });
}

/** Register the turn-record read endpoints on the given router. */
export function mountTurnRecordRoutes(router: Router): void {
  router.get('/turn-records', listRecords);
  router.get('/turn-records/:id', readRecord);
  router.get('/turn-records/:id/summary', readSummary);
  router.get('/turn-records/:id/export', exportRecord);
}
