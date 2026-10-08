/**
 * Live AnA runs, read without the socket that started them (AnA detach, slice
 * DT1; docs/design/ANA_DETACH_2026-10-08.md §3.7).
 *
 *   GET /api/ana-ri/runs?thread_id=<id>          the conversation's runs that are
 *                                                live, or released without a
 *                                                record; newest first; at most 5
 *   GET /api/ana-ri/runs?mine=live               the caller's live runs, in any
 *                                                conversation
 *   GET /api/ana-ri/runs/:runId/events?after=<seq>
 *                                                one run's state and its mirrored
 *                                                timeline rows after `seq`
 *
 * ── Who may read (D-1, decided: (b)) ─────────────────────────────────────────
 * The person who asked, and the organisation's admins and owners
 * (readsEveryRecord), until project access control exists. Not every reader of
 * the transcript: thread transcripts are organisation-readable, so that rule
 * would have meant the whole organisation. The sealed Summary keeps its own
 * rule (turn-records.ts, decision 6). One function, `runReadAccess`, applies
 * it to the single-run read; the two lists apply the same predicate in SQL.
 *
 *   no organisation, or the run is another organisation's   404
 *   a colleague's run, or a run with no person, for a member 403, with the sentence
 *
 * The organisation is in every statement's SQL, not only in a policy: a read
 * that is correct only because RLS happened to filter it breaks the day the
 * policy is not attached (as applyControl, run-control.ts).
 *
 * ── What a payload carries ───────────────────────────────────────────────────
 * Built by allow-list from named columns, never by spreading a row. Never:
 * owner_instance, pending_interjections, approval_decision, who took a control,
 * organization_id, user_id, surface, a tool name, or a tool-use id other than
 * the asker's own pending approval.
 *
 * ── The hand-over order ──────────────────────────────────────────────────────
 * The events are read first and the record second. The owner commits the
 * record before it releases the rows (run-events.ts sealAfterMirror), so a
 * reader never sees "no rows and no record" for a run that sealed (§4.3).
 *
 * Nothing here writes, except the throttled reaper every route runs first
 * (§2.4). The asker's watched stamp (`visible=1`) and the run's `hold` are
 * written from slice DT3; until then `hold` is null and nothing is stamped.
 *
 * @module server/routes/ana-ri/runs
 */

import type { Request, Response, Router } from 'express';

import { getPool } from '../../db.js';
import { buildHumanConfirmationRequiredResult } from '../../services/ana-ri/part11-governance.js';
import { readPendingApproval, reapOrphanedRunsThrottled } from '../../services/ana/run-control.js';
import { controlsOf } from '../../services/ana/turn-summary.js';
import { resolveOrgId, resolveUserId } from '../../types/auth-request.js';
import { planFromTaskChanges, type PlanChangeKind, type PlanStep } from '@shared/ana/plan-diff';
import type { MirroredTimelineEvent, TimelineControl } from '@shared/ana/turn-timeline';
import { readsEveryRecord } from './record-access.js';

/** At most this many events per read. */
export const RUN_EVENTS_PAGE = 200;
/** At most this many runs per conversation listing. */
export const THREAD_RUNS_LIMIT = 5;
/** The refusal a colleague reads (§3.7, U-15): they may still read the transcript, so not "this conversation". */
export const LIVE_PROGRESS_FORBIDDEN = "You don't have access to this conversation's live progress.";


/** The one method these routes use. A pg Pool satisfies it. */
export interface RunsQuery {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** The run columns any read may use. Named, never `*`. */

interface RunRowRead {
  id: string;
  user_id: number | null;
  thread_id: string | null;
  user_message_id: number | null;
  status: string;
  stopped_reason: string | null;
  current_round: number | null;
  run_policy: string | null;
  hold: unknown;
  control_events: unknown;
  created_at: unknown;
  heartbeat_at: unknown;
  released_at: unknown;
  timeline_seq: number | null;
}

type RunAccess =
  | { ok: true; row: RunRowRead; organizationId: number; userId: number | null; asker: boolean; admin: boolean }
  | { ok: false; status: 404 | 403 };

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const isAsker = (rowUserId: unknown, userId: number | null) =>
  rowUserId !== null && rowUserId !== undefined && userId !== null && Number(rowUserId) === userId;

/**
 * May this caller read this run's live progress? The one rule (D-1(b)).
 * A row with no person is the admins' alone: nobody else is its asker.
 */
export async function runReadAccess(req: Request, runId: string, pool: RunsQuery): Promise<RunAccess> {
  const organizationId = resolveOrgId(req);
  if (organizationId === null) return { ok: false, status: 404 };
  const { rows } = await pool.query(`SELECT id, user_id, thread_id, user_message_id, status, stopped_reason, current_round,
  run_policy, hold, control_events, created_at, heartbeat_at, released_at, timeline_seq FROM ana_runs WHERE id = $1 AND organization_id = $2`, [
    runId,
    organizationId,
  ]);
  const row = rows[0] as RunRowRead | undefined;
  if (!row) return { ok: false, status: 404 };
  const userId = resolveUserId(req);
  const asker = isAsker(row.user_id, userId);
  const admin = readsEveryRecord((req as any).user);
  if (!asker && !admin) return { ok: false, status: 403 };
  return { ok: true, row, organizationId, userId, asker, admin };
}

function refuse(res: Response, status: 404 | 403): void {
  if (status === 404) {
    res.status(404).json({ ok: false, code: 'RUN_NOT_FOUND', error: 'Run not found' });
  } else {
    res.status(403).json({ ok: false, code: 'RUN_NOT_YOURS', error: LIVE_PROGRESS_FORBIDDEN });
  }
}

/** One run as a listing shows it. Allow-listed. */
function listedRun(r: Record<string, any>) {
  return {
    runId: String(r.id),
    threadId: r.thread_id ?? null,
    ...(r.thread_title !== undefined ? { threadTitle: r.thread_title ?? null } : {}),
    userMessageId: r.user_message_id ?? null,
    status: String(r.status),
    stoppedReason: r.stopped_reason ?? null,
    runPolicy: r.run_policy ?? null,
    startedAt: iso(r.created_at),
    lastBeatAt: iso(r.heartbeat_at),
    releasedAt: iso(r.released_at),
  };
}

/** The asker's pending approval, as the `approval_required` frame carries it. Null for anyone else. */
async function approvalFor(pool: RunsQuery, access: Extract<RunAccess, { ok: true }>) {
  if (!access.asker || access.userId === null || access.row.status !== 'awaiting_approval') return null;
  const pending = await readPendingApproval(pool, access.row.id, access.organizationId, access.userId);
  if (!pending) return null;
  const proposal = buildHumanConfirmationRequiredResult(pending.command, pending.params, pending.tier as never);
  return {
    runId: access.row.id,
    toolUseId: pending.toolUseId,
    action: proposal.action,
    openModal: proposal.openModal,
    data: proposal.data,
    message: proposal.message,
  };
}

const TASK_CHANGES: ReadonlySet<string> = new Set<PlanChangeKind>(['added', 'started', 'completed', 'removed']);

/** The plan the mirror's task events leave (planFromTaskChanges), or null when it holds none. */
function planOf(taskEvents: Array<Record<string, any>>): PlanStep[] | null {
  const changes = taskEvents
    .filter((e) => typeof e?.task === 'string' && typeof e?.title === 'string' && TASK_CHANGES.has(e?.change))
    .map((e) => ({ task: e.task as string, change: e.change as PlanChangeKind, title: e.title as string }));
  return changes.length > 0 ? planFromTaskChanges(changes) : null;
}

/**
 * What the mirror and the record hold for one run, events first and the
 * record second (the hand-over order, module docstring).
 */
async function readMirror(pool: RunsQuery, runId: string, organizationId: number, after: number) {
  const { rows: events } = await pool.query(
    `SELECT seq, event FROM ana_run_events
      WHERE run_id = $1 AND organization_id = $2 AND seq > $3
      ORDER BY seq LIMIT $4`,
    [runId, organizationId, after, RUN_EVENTS_PAGE],
  );
  const { rows: tasks } = await pool.query(
    `SELECT event FROM ana_run_events
      WHERE run_id = $1 AND organization_id = $2 AND event->>'kind' = 'task'
      ORDER BY seq`,
    [runId, organizationId],
  );
  const { rows: max } = await pool.query(
    `SELECT COALESCE(max(seq), 0)::int AS max_seq FROM ana_run_events WHERE run_id = $1 AND organization_id = $2`,
    [runId, organizationId],
  );
  const { rows: sealed } = await pool.query(
    `SELECT id, assistant_message_id FROM ana_turn_records
      WHERE organization_id = $1 AND run_id = $2
      ORDER BY created_at LIMIT 1`,
    [organizationId, runId],
  );
  return {
    events: events.map((r: { event: MirroredTimelineEvent }) => r.event),
    plan: planOf(tasks.map((r: { event: Record<string, any> }) => r.event)),
    maxSeq: Number(max[0]?.max_seq ?? 0),
    sealed: sealed[0]
      ? { recordId: String(sealed[0].id), assistantMessageId: sealed[0].assistant_message_id ?? null }
      : null,
  };
}

async function threadTitleOf(pool: RunsQuery, threadId: string | null, organizationId: number): Promise<string | null> {
  if (!threadId) return null;
  const { rows } = await pool.query(`SELECT title FROM chat_threads WHERE id = $1 AND organization_id = $2`, [
    threadId,
    organizationId,
  ]);
  return rows[0]?.title ?? null;
}

/** The open hold, `{ reason, next }`, or null. Written from slice DT3. */
function holdOf(raw: unknown): { reason: unknown; next: unknown } | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  return { reason: h.reason ?? null, next: h.next ?? null };
}

/** GET /runs/:runId/events?after=<seq> */
async function readRunEvents(req: Request, res: Response, pool: RunsQuery): Promise<void> {
  const runId = String(req.params.runId);
  const afterRaw = Number.parseInt(String(req.query.after ?? '0'), 10);
  const after = Number.isFinite(afterRaw) && afterRaw > 0 ? afterRaw : 0;

  await reapOrphanedRunsThrottled(pool as never);
  const access = await runReadAccess(req, runId, pool);
  if (!access.ok) return refuse(res, access.status);
  const { row, organizationId } = access;
  const mirror = await readMirror(pool, runId, organizationId, after);
  const controls: TimelineControl[] | null = controlsOf(Array.isArray(row.control_events) ? row.control_events : null);

  res.status(200).json({
    runId: row.id,
    threadId: row.thread_id ?? null,
    threadTitle: await threadTitleOf(pool, row.thread_id, organizationId),
    userMessageId: row.user_message_id ?? null,
    status: row.status,
    stoppedReason: row.stopped_reason ?? null,
    round: Number(row.current_round ?? 0),
    runPolicy: row.run_policy ?? null,
    hold: holdOf(row.hold),
    plan: mirror.plan,
    startedAt: iso(row.created_at),
    // Written from slice DT3 (detach); nothing detaches in DT1.
    detachedAt: null,
    unattendedStopsAt: null,
    lastBeatAt: iso(row.heartbeat_at),
    releasedAt: iso(row.released_at),
    serverNow: new Date().toISOString(),
    highWater: Math.max(Number(row.timeline_seq ?? 0), mirror.maxSeq),
    events: mirror.events,
    controls,
    sealed: mirror.sealed,
    approval: await approvalFor(pool, access),
    // The asker controls the run; an admin may cancel it and nothing else
    // (admin cancel is accepted from slice DT3). Admins never approve (P-A).
    canControl: true,
    controlScope: access.asker ? 'all' : 'cancel',
  });
}

/** GET /runs?thread_id=… | ?mine=live */
async function listRuns(req: Request, res: Response, pool: RunsQuery): Promise<void> {
  const threadId = typeof req.query.thread_id === 'string' && req.query.thread_id ? req.query.thread_id : null;
  const mine = req.query.mine === 'live';
  if (!threadId && !mine) {
    res.status(400).json({ ok: false, code: 'RUNS_QUERY_REQUIRED', error: 'Name a conversation (thread_id) or ask for mine=live.' });
    return;
  }
  await reapOrphanedRunsThrottled(pool as never);
  const organizationId = resolveOrgId(req);
  if (organizationId === null) return refuse(res, 404);
  const userId = resolveUserId(req);
  const admin = readsEveryRecord((req as any).user);

  if (mine) {
    if (userId === null) {
      res.status(200).json({ runs: [], serverNow: new Date().toISOString() });
      return;
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.thread_id, r.user_message_id, r.status, r.stopped_reason, r.run_policy,
              r.created_at, r.heartbeat_at, r.released_at, t.title AS thread_title
         FROM ana_runs r
         LEFT JOIN chat_threads t ON t.id = r.thread_id AND t.organization_id = r.organization_id
        WHERE r.organization_id = $1 AND r.user_id = $2 AND r.status IN ('running','paused','awaiting_approval')
        ORDER BY r.created_at DESC
        LIMIT 20`,
      [organizationId, userId],
    );
    res.status(200).json({ runs: rows.map(listedRun), serverNow: new Date().toISOString() });
    return;
  }

  // The asker's own runs; every run of the conversation for an admin. A
  // member who is neither sees none, which is not a refusal: the conversation
  // may simply have no run of theirs.
  if (!admin && userId === null) {
    res.status(200).json({ runs: [], serverNow: new Date().toISOString() });
    return;
  }
  // $3 is the person for a member, NULL for an admin (every run).
  const params: unknown[] = [organizationId, threadId, admin ? null : userId, THREAD_RUNS_LIMIT];
  const { rows } = await pool.query(
    `SELECT r.id, r.thread_id, r.user_message_id, r.status, r.stopped_reason, r.run_policy,
            r.created_at, r.heartbeat_at, r.released_at
       FROM ana_runs r
      WHERE r.organization_id = $1 AND r.thread_id = $2 AND ($3::integer IS NULL OR r.user_id = $3)
        AND (r.status IN ('running','paused','awaiting_approval')
             OR (r.released_at IS NOT NULL AND NOT EXISTS (
                   SELECT 1 FROM ana_turn_records t
                    WHERE t.organization_id = r.organization_id AND t.run_id = r.id)))
      ORDER BY r.created_at DESC
      LIMIT $4`,
    params,
  );
  res.status(200).json({ runs: rows.map(listedRun), serverNow: new Date().toISOString() });
}

/** Wrap a handler so a failure is a 500 with words, never an empty result. */
const guarded =
  (fn: (req: Request, res: Response, pool: RunsQuery) => Promise<void>, pool: () => RunsQuery) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res, pool());
    } catch (err: any) {
      console.error('[AnA RI runs] read failed:', err?.message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, code: 'RUN_READ_FAILED', error: 'The run could not be read. Please retry.' });
      }
    }
  };

/** Register the live run reads. `pool` is a seam for the route tests. */
export function mountRunReadRoutes(router: Router, opts: { pool?: () => RunsQuery } = {}): void {
  const pool = opts.pool ?? (() => getPool() as unknown as RunsQuery);
  router.get('/runs', guarded(listRuns, pool));
  router.get('/runs/:runId/events', guarded(readRunEvents, pool));
}
