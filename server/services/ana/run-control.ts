/**
 * AnA run control — durable pause / resume / steer / cancel for a live turn.
 *
 * ── What this replaces, and why ──────────────────────────────────────────────
 * `run-control-registry.ts` held control in a process-local Map with a
 * 30-minute TTL. Its own docstring named the limit: the control request and the
 * SSE stream had to reach the same instance, so a multi-instance deployment
 * needed sticky routing. In practice that meant control 404'd after a restart
 * and, on a second instance, bound to nothing — "I stopped her" was a claim the
 * platform could not keep.
 *
 * ── The split, and why it is not a cache ─────────────────────────────────────
 * The ROW owns status, the queue (steers and screen reports) and the control
 * events. The PROCESS owns an AbortController and a wake latch, and holds no
 * status at all.
 *
 * That is deliberate and it is not a write-through cache. A cache would hold
 * status too, and the failure mode is the one the zero-duplication rule exists
 * for: control lands on instance B, the row says paused, instance A's cache
 * says running, the run keeps going while the UI says it stopped, and nothing
 * reports the disagreement. A handle that holds no status cannot disagree with
 * the row.
 *
 * The one thing the handle does answer locally is `cancelSignal.aborted`, and
 * that is not a cached status either — it is the abort itself, the same object
 * handed to the gateway and the tool dispatcher. It is read per streamed chunk,
 * so it must be synchronous; a status read there would be a database query per
 * token.
 *
 * ── Delivery ─────────────────────────────────────────────────────────────────
 * Control can be ACCEPTED anywhere — it is a row write — but only the instance
 * holding the AbortController can stop the work. So the owner listens:
 *
 *   NOTIFY   the control write and its notification are one round-trip. The
 *            owner's LISTEN client wakes, re-reads the row and drives its local
 *            handle. Sub-millisecond, no polling.
 *   poll     the DECLARED fallback when the listener cannot connect or errors.
 *            Bounded latency instead of none, and logged once when it engages
 *            so a degraded deployment is visible rather than merely slow.
 *
 * Polling alone would be the wrong shape: a cancel has to fire DURING a
 * sixty-second generation, so the interval would need to be a few hundred
 * milliseconds per active run — several queries a second per concurrent chat.
 *
 * Same-instance control, which is almost all of it, short-circuits to the local
 * handle immediately after the write and never waits for the round-trip.
 *
 * ── Tenant scope: which of these queries carries one, and how ───────────────
 * Pool access is scoped by AsyncLocalStorage, not by the connection: 
 * `poolInstrumentation.runQueryScoped` reads `getTenantScope()` AT QUERY TIME and
 * pins `app.current_tenant_id` from it, and once RLS_ENFORCE=on — which
 * production is the only permitted setting for — an unscoped query is rejected
 * fail-closed. So a query's correctness depends on the context it RUNS in, not
 * the context it was written in.
 *
 * That splits this module in two:
 *
 *   request-time   beginRun, applyControl, readRun, readStatus,
 *                  consumeInterjections, endRun, the handle's heartbeat. These
 *                  run inside the request's own scope from
 *                  `establishRequestTenantScope`, and inherit it correctly.
 *
 *   background     the LISTEN client, the poll fallback, the NOTIFY handler,
 *                  reapOrphanedRuns, and stopRunInternally when it is reached
 *                  from a socket 'close'. These have NO ambient request scope,
 *                  or worse, the WRONG one: setInterval and the pg notification
 *                  callback both carry the context they were created in, so the
 *                  poller armed by the first turn after boot would stay pinned
 *                  to that first tenant forever and silently return zero rows
 *                  for every other one. Zero rows is not an error, so nothing
 *                  would report it.
 *
 * Every background path therefore opens its own scope explicitly, the same way
 * the sweeps in server/jobs/ do. A cross-instance sweep takes the system scope
 * because it is genuinely estate-wide; a write about one known run takes that
 * run's own tenant rather than a super-admin bypass it does not need.
 *
 * ── Honesty about what is and is not exercised ───────────────────────────────
 * The row writes, the state machine, the ownership rules and the atomic drain
 * are covered by `__tests__/run-control.pglite.integration.test.ts`. PGlite is a
 * single in-process database and cannot host two servers, so the cross-instance
 * path — LISTEN client, NOTIFY handler, poll fallback, the reaper across tenants
 * and returning the LISTEN connection at shutdown — is covered separately by
 * `__tests__/run-control-cross-instance.dbtest.ts` (`npm run test:db`): two
 * module graphs as two instances, on a real server, as the non-superuser
 * runtime role with RLS enforcing. The poll fallback stays mandatory: it is the
 * path that is allowed to be the only one that works.
 *
 * @module server/services/ana/run-control
 */

import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';

import { runWithSystemTenantScope, runWithTenantScope } from '../../db/tenantStore.js';
import { createScopedLogger } from '../../utils/logger';
import {
  canTransitionRunStatus,
  isLiveRunStatus,
  LIVE_RUN_STATUSES,
  statusAfterControl,
  MAX_INTERJECTION_CHARS,
  STALE_AFTER_MS,
  type HumanControlEvent,
  type RunControlAction,
  type RunStatus,
  type RunStoppedReason,
} from './run-status.js';

const log = createScopedLogger('ana-run-control');

/** Postgres channel the control write notifies on. */
export const RUN_CONTROL_CHANNEL = 'ana_run_control';

/** Poll interval for the fallback path. Bounded latency, not none. */
export const POLL_FALLBACK_MS = 2_000;

/** A run as the row holds it. */
export interface RunRow {
  id: string;
  organizationId: number;
  userId: number | null;
  threadId: string | null;
  status: RunStatus;
  ownerInstance: string;
  currentRound: number;
  /**
   * The queue the next checkpoint drains. An entry with no `kind` is a steer:
   * rows queued before screen reports existed carry none, and must still be
   * read as what they were.
   */
  pendingInterjections: Array<{
    text: string;
    at: string;
    byUserId?: number | null;
    kind?: RunQueueEntryKind;
  }>;
  controlEvents: HumanControlEvent[];
  stoppedReason: RunStoppedReason | null;
}

/** Why a control request was refused. */
export type ControlRefusal = 'NOT_FOUND' | 'NOT_YOURS' | 'TERMINAL' | 'INVALID';

export interface ControlResult {
  ok: boolean;
  code?: ControlRefusal;
  status: RunStatus | null;
  /** Queue entries (steers and screen reports) not yet consumed, for the caller's snapshot. */
  pendingInterjections?: number;
}

/**
 * The per-process half of a run. Holds no status — see the module docstring.
 */
export interface RunHandle {
  readonly runId: string;
  /** Aborted when the run is cancelled. Given to the gateway and the tools. */
  readonly cancelSignal: AbortSignal;
  /** Resolves when the row changed, or after `timeoutMs`. The pause wait. */
  wake(timeoutMs: number): Promise<void>;
  /** Refresh `heartbeat_at` so the reaper does not orphan a live run. */
  heartbeat(round: number): Promise<void>;
}

/** This process, for `owner_instance`. */
const INSTANCE_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

interface LocalRun {
  controller: AbortController;
  /** Resolvers waiting on a row change — the pause/approval wait. */
  waiters: Set<() => void>;
}

const localRuns = new Map<string, LocalRun>();

/** Wake everything waiting on this run, and abort it if it was cancelled. */
function driveLocalRun(runId: string, status: RunStatus): void {
  const local = localRuns.get(runId);
  if (!local) return;
  if (status === 'cancelled') local.controller.abort();
  const waiters = [...local.waiters];
  local.waiters.clear();
  for (const resolve of waiters) resolve();
}

function toRow(r: Record<string, any>): RunRow {
  return {
    id: r.id,
    organizationId: Number(r.organization_id),
    userId: r.user_id == null ? null : Number(r.user_id),
    threadId: r.thread_id ?? null,
    status: r.status as RunStatus,
    ownerInstance: r.owner_instance,
    currentRound: Number(r.current_round ?? 0),
    pendingInterjections: Array.isArray(r.pending_interjections) ? r.pending_interjections : [],
    controlEvents: Array.isArray(r.control_events) ? r.control_events : [],
    stoppedReason: (r.stopped_reason as RunStoppedReason) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export interface BeginRunInput {
  pool: Pool;
  organizationId: number;
  userId: number | null;
  threadId?: string | null;
  projectId?: string | null;
  surface: string;
}

/**
 * Open a run and return its process-local handle.
 *
 * `organizationId` is required and the column is NOT NULL. A caller that cannot
 * resolve one must not open a run at all — see the stream route, which then
 * emits no `run_started` rather than handing the client control buttons that
 * would 404. Failing closed and visibly beats a nullable tenant column, which
 * is the `ana_deep_investigations` mistake this table deliberately does not
 * repeat.
 */
export async function beginRun(input: BeginRunInput): Promise<{ runId: string; handle: RunHandle }> {
  const runId = `run_${randomUUID()}`;
  await input.pool.query(
    `INSERT INTO ana_runs (id, organization_id, user_id, thread_id, project_id, surface, status, owner_instance)
     VALUES ($1, $2, $3, $4, $5, $6, 'running', $7)`,
    [
      runId,
      input.organizationId,
      input.userId,
      input.threadId ?? null,
      input.projectId ?? null,
      input.surface,
      INSTANCE_ID,
    ],
  );

  const local: LocalRun = { controller: new AbortController(), waiters: new Set() };
  localRuns.set(runId, local);
  void startRunControlListener(input.pool);

  const handle: RunHandle = {
    runId,
    cancelSignal: local.controller.signal,
    wake: (timeoutMs: number) =>
      new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          local.waiters.delete(finish);
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        timer.unref?.();
        local.waiters.add(finish);
      }),
    heartbeat: async (round: number) => {
      await input.pool
        .query(`UPDATE ana_runs SET heartbeat_at = now(), current_round = $2 WHERE id = $1`, [
          runId,
          round,
        ])
        .catch(err => log.warn(`[ana-run-control] heartbeat failed for ${runId}: ${err?.message}`));
    },
  };

  return { runId, handle };
}

/**
 * A handle with an abort signal and nothing durable behind it.
 *
 * For a turn that could not open a run row — no resolvable tenant, or the
 * insert failed. Stop must still stop the work: the signal is what the gateway
 * and the tool dispatcher hold, and it does not need a row to function. What is
 * lost is everything the row provides — pause, steer, cross-instance control,
 * and the audit record — which is why the route emits no `run_started` in that
 * case and the client offers only Stop.
 *
 * Named so it cannot be mistaken for the real thing at a call site.
 */
export function localOnlyRunHandle(): RunHandle {
  const controller = new AbortController();
  return {
    runId: '',
    cancelSignal: controller.signal,
    wake: async () => {},
    heartbeat: async () => {},
    abortLocally: () => controller.abort(),
  } as RunHandle & { abortLocally: () => void };
}

/**
 * Close a run.
 *
 * Guarded on a live status for the same reason the deep-investigation
 * completion write is: a run cancelled while the loop was still unwinding must
 * not be rewritten to 'finished' by whichever writer happens to finish last. A
 * cancelled run reporting a completed turn is worse than one reporting nothing.
 */
export async function endRun(
  pool: Pool,
  runId: string,
  status: Extract<RunStatus, 'finished' | 'failed'>,
  stoppedReason: RunStoppedReason,
): Promise<void> {
  // Write first, release after. Releasing first meant a failed write left a row
  // saying `running` with the only AbortController for it already discarded —
  // a run advertising itself as live that nothing in this process could stop.
  await pool
    .query(
      `UPDATE ana_runs
       SET status = $2, stopped_reason = $3, finished_at = now(), updated_at = now()
       WHERE id = $1 AND status IN ('running','paused','awaiting_approval')`,
      [runId, status, stoppedReason],
    )
    .catch(err => log.error(`[ana-run-control] endRun failed for ${runId}: ${err?.message}`))
    .finally(() => releaseLocalRun(runId));
}

/**
 * Forget this process's half of a run.
 *
 * Every exit path must reach this. `endRun` was once the only caller, so a run
 * that ended by disconnect — which settles the row without calling endRun —
 * leaked its LocalRun and its AbortController for the lifetime of the process.
 */
export function releaseLocalRun(runId: string): void {
  localRuns.delete(runId);
}

/** Read a run, scoped to the tenant. */
export async function readRun(
  pool: Pool,
  runId: string,
  organizationId: number,
): Promise<RunRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM ana_runs WHERE id = $1 AND organization_id = $2`,
    [runId, organizationId],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/** The live status of a run this process owns, or null if the row is gone. */
export async function readStatus(pool: Pool, runId: string): Promise<RunStatus | null> {
  const { rows } = await pool.query(`SELECT status FROM ana_runs WHERE id = $1`, [runId]);
  return rows[0] ? (rows[0].status as RunStatus) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What can wait in a run's queue for the next round boundary.
 *
 *   steer          the PERSON redirected her. A human control: written to
 *                  control_events at acceptance, announced back to them as
 *                  "You steered AnA", and it resumes a paused run.
 *   screen_report  the APP observed something on the person's screen — a move
 *                  AnA made that did not land. Nobody decided anything, so it
 *                  is none of the above: not in the control lineage, not shown
 *                  as the person's words, and a paused run stays paused.
 *   move_landed    the APP confirms a move landed. No text reaches the model;
 *                  it only tells the checkpoint that move is settled (see
 *                  `moveId`). Same rules as a screen report otherwise.
 *
 * All three ride one queue so a single atomic drain hands the checkpoint
 * everything waiting, in the order it arrived.
 */
export type RunQueueEntryKind = 'steer' | 'screen_report' | 'move_landed';

/** One drained queue entry, with the kind the checkpoint routes on. */
export interface RunQueueEntry {
  kind: RunQueueEntryKind;
  /** Empty for `move_landed`, which carries nothing for the model to read. */
  text: string;
  /**
   * The move this entry settles — the tool-use id the server sent with the
   * drive event. Present on `move_landed` always, on a `screen_report` when the
   * report is about one move. The checkpoint waits on these (stream.ts).
   */
  moveId?: string;
}

/** The shape of a move id: a tool-use id, as the drive events carry it. */
export const MOVE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

/** A move id from outside, or undefined when it is not one. */
export function readMoveId(raw: unknown): string | undefined {
  return typeof raw === 'string' && MOVE_ID_PATTERN.test(raw) ? raw : undefined;
}

/**
 * Screen-report text cap. Smaller than a steer's: a report is one sentence the
 * app composed about a move that failed, and anything longer is not a report.
 * It reaches the model as an operator-channel turn, so the bound is also a
 * bound on what an on-screen string can carry into her prompt.
 */
export const MAX_SCREEN_REPORT_CHARS = 1_000;

export interface ApplyControlInput {
  pool: Pool;
  runId: string;
  organizationId: number;
  userId: number | null;
  /**
   * A human control, or `screen_report` — which is accepted here, under the
   * same ownership and live-status rules, but is deliberately NOT a
   * RunControlAction: HumanControlEvent is typed on that union, and an app
   * observation must not be recordable as a human decision in the lineage the
   * dossier reads. `move_landed` likewise (queueAppEntry).
   */
  action: RunControlAction | 'screen_report' | 'move_landed';
  message?: string;
  /** The move a `screen_report` or `move_landed` settles (readMoveId). */
  moveId?: string;
}

/**
 * Accept a control action against a run.
 *
 * Authorization, and why the two refusals differ:
 *
 *   another ORG's run   → NOT_FOUND. Its existence must not be confirmable
 *                         from outside the tenant.
 *   another USER's run  → NOT_YOURS. Inside a tenant the row is not a secret,
 *                         but taking a colleague's run is a different act, and
 *                         "not found" would be a lie the caller could disprove
 *                         by watching the run continue.
 *
 * The control event is written at the MOMENT of acceptance, not at the end of
 * the turn. The registry accumulated them in a process-local array until the
 * turn finished, so a crash lost every human decision taken during it. A
 * `screen_report` writes none — it is not a human decision (queueScreenReport).
 *
 * Every control write is guarded on the status that was read, so two controls
 * racing cannot both apply — the loser sees zero rows and reports the status
 * that actually won rather than the one it hoped for. A screen report moves no
 * status, and is guarded on the run still being live instead.
 */
export async function applyControl(input: ApplyControlInput): Promise<ControlResult> {
  const { pool, runId, organizationId, userId, action } = input;

  // Scoped in the SQL, not only in JS: the predicate is the isolation, and a
  // read that is correct only because a policy happened to filter it is a read
  // that breaks the day the policy is not attached.
  const { rows } = await pool.query(
    `SELECT * FROM ana_runs WHERE id = $1 AND organization_id = $2`,
    [runId, organizationId],
  );
  const raw = rows[0];
  if (!raw) return { ok: false, code: 'NOT_FOUND', status: null };
  const row = toRow(raw);
  // Ownership needs an owner on BOTH sides. The earlier form skipped the check
  // whenever either side was null, which fails OPEN twice over: an unattributed
  // run became controllable by every member of the org, and an unattributed
  // caller could control anyone's. `user_id` stays nullable for non-interactive
  // surfaces that have no person behind them — and those are precisely the runs
  // no person should be able to seize.
  if (row.userId === null || userId === null || row.userId !== userId) {
    return { ok: false, code: 'NOT_YOURS', status: row.status };
  }
  if (!isLiveRunStatus(row.status)) {
    return { ok: false, code: 'TERMINAL', status: row.status };
  }

  // Past the ownership and live checks, and before any control event is built:
  // a screen report is held to the same "your run, still live" rule as a steer,
  // and to nothing else a steer implies.
  if (action === 'screen_report') {
    return queueScreenReport(pool, row, input.message ?? '', readMoveId(input.moveId));
  }
  if (action === 'move_landed') {
    const moveId = readMoveId(input.moveId);
    if (!moveId) return { ok: false, code: 'INVALID', status: row.status };
    return queueAppEntry(pool, row, { text: '', at: new Date().toISOString(), kind: 'move_landed', moveId });
  }

  const at = new Date().toISOString();
  const trimmed = (input.message ?? '').trim().slice(0, MAX_INTERJECTION_CHARS);
  const event: HumanControlEvent = {
    action,
    round: row.currentRound,
    at,
    byUserId: userId,
    ...(trimmed ? { message: trimmed } : {}),
  };

  return action === 'interject'
    ? queueSteer(pool, row, event, trimmed)
    : changeStatus(pool, row, event);
}

/**
 * Queue a steer, and resume if the run was held.
 *
 * A steer accepted while paused ALSO resumes — as an explicit transition, not a
 * side effect: the person redirected her expecting her to act on it.
 */
async function queueSteer(
  pool: Pool,
  row: RunRow,
  event: HumanControlEvent,
  text: string,
): Promise<ControlResult> {
  if (!text) return { ok: false, code: 'INVALID', status: row.status };
  const next: RunStatus = row.status === 'paused' ? 'running' : row.status;
  const { rowCount } = await pool.query(
    `UPDATE ana_runs
     SET pending_interjections = pending_interjections || $2::jsonb,
         control_events = control_events || $3::jsonb,
         status = $4,
         updated_at = now()
     WHERE id = $1 AND status = $5`,
    [
      row.id,
      JSON.stringify([{ text, at: event.at, byUserId: event.byUserId ?? null, kind: 'steer' }]),
      JSON.stringify([event]),
      next,
      row.status,
    ],
  );
  if (!rowCount) return { ok: false, code: 'TERMINAL', status: await readStatus(pool, row.id) };
  await notifyAndDrive(pool, row.id, next);
  return { ok: true, status: next, pendingInterjections: row.pendingInterjections.length + 1 };
}

/**
 * Queue what the app observed on the person's screen, for the next round.
 *
 * It used to ride `interject`, and so became three false things at once: a
 * control event saying the PERSON typed it (the Part 11 lineage misattributing
 * an app observation to a human), an `interjected` announcement the client
 * renders as "You steered AnA:", and a resume of a run the person had paused.
 * So this writes the queue entry and nothing else — no control event, no
 * status change.
 *
 * Guarded on the run still being LIVE, not on the exact status that was read
 * as the controls are. A control's guard is its transition's precondition; a
 * report makes no transition, so the status it read is no precondition of it.
 * Guarded on that status, a Pause pressed between this read and write made the
 * report lose a race it was never in — refused as TERMINAL on a live run, and
 * AnA, once resumed, never told that her move had failed. A run that settled in
 * between still refuses it rather than taking a report no round will ever read.
 * The status and queue length come back from the write itself, because the
 * ones read before it may be the very ones that moved.
 *
 * The wake is still sent. Nothing that is waiting acts on it — a paused
 * checkpoint re-reads 'paused' and goes back to waiting — but it keeps one
 * delivery path for everything in the queue, and it is harmless with the
 * status unchanged.
 */
async function queueScreenReport(
  pool: Pool,
  row: RunRow,
  message: string,
  moveId: string | undefined,
): Promise<ControlResult> {
  const text = message.trim().slice(0, MAX_SCREEN_REPORT_CHARS);
  if (!text) return { ok: false, code: 'INVALID', status: row.status };
  return queueAppEntry(pool, row, {
    text,
    at: new Date().toISOString(),
    kind: 'screen_report',
    ...(moveId ? { moveId } : {}),
  });
}

/**
 * The one writer for what the APP puts on a run's queue — a screen report or a
 * move's landing. Neither is a human decision, so neither touches
 * control_events or status; both are guarded on the run still being live, for
 * the reason queueScreenReport gives.
 */
async function queueAppEntry(
  pool: Pool,
  row: RunRow,
  entry: { text: string; at: string; kind: 'screen_report' | 'move_landed'; moveId?: string },
): Promise<ControlResult> {
  const { rows } = await pool.query(
    `UPDATE ana_runs
     SET pending_interjections = pending_interjections || $2::jsonb,
         updated_at = now()
     WHERE id = $1 AND status = ANY($3::text[])
     RETURNING status, jsonb_array_length(pending_interjections) AS queued`,
    [row.id, JSON.stringify([entry]), [...LIVE_RUN_STATUSES]],
  );
  const written = rows[0];
  if (!written) return { ok: false, code: 'TERMINAL', status: await readStatus(pool, row.id) };
  const status = written.status as RunStatus;
  await notifyAndDrive(pool, row.id, status);
  return { ok: true, status, pendingInterjections: Number(written.queued) };
}

/** Move the run to the status this control implies, if the machine allows it. */
async function changeStatus(
  pool: Pool,
  row: RunRow,
  event: HumanControlEvent,
): Promise<ControlResult> {
  const next = statusAfterControl(event.action);
  if (!next || !canTransitionRunStatus(row.status, next)) {
    return { ok: false, code: 'INVALID', status: row.status };
  }
  const { rowCount } = await pool.query(
    `UPDATE ana_runs
     SET status = $2,
         control_events = control_events || $3::jsonb,
         stopped_reason = CASE WHEN $2 = 'cancelled' THEN 'cancelled' ELSE stopped_reason END,
         finished_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE finished_at END,
         updated_at = now()
     WHERE id = $1 AND status = $4`,
    [row.id, next, JSON.stringify([event]), row.status],
  );
  if (!rowCount) return { ok: false, code: 'TERMINAL', status: await readStatus(pool, row.id) };
  await notifyAndDrive(pool, row.id, next);
  return { ok: true, status: next, pendingInterjections: row.pendingInterjections.length };
}


/**
 * Stop a run for a reason that is not a human decision.
 *
 * A dropped socket is not a person pressing stop, and the audit must not say it
 * was — so this writes `client_disconnected` (or `orphaned`) and records no
 * control event. It still aborts, because the work should stop either way.
 */
export async function stopRunInternally(
  pool: Pool,
  runId: string,
  reason: Extract<RunStoppedReason, 'client_disconnected' | 'orphaned'>,
  organizationId?: number,
): Promise<void> {
  // The abort is local and needs no database, so it happens first and happens
  // regardless: a socket that dropped should stop the work even if the row
  // write below cannot be made.
  driveLocalRun(runId, 'cancelled');
  // An EventEmitter listener runs in the context of whoever called emit, not
  // the context it was registered in, so a 'close' handler cannot rely on
  // inheriting the request's tenant scope. The run's own tenant is passed in
  // and used — never the super-admin scope, which this write does not need.
  const scoped = <T>(fn: () => Promise<T>): Promise<T> =>
    organizationId === undefined
      ? fn()
      : runWithTenantScope(
          {
            tenantId: String(organizationId),
            role: null,
            source: 'request',
            caller: 'ana-run-control:disconnect',
          },
          fn,
        );
  await scoped(() =>
    pool
      .query(
      `UPDATE ana_runs
       SET status = 'cancelled', stopped_reason = $2, finished_at = now(), updated_at = now()
       WHERE id = $1 AND status IN ('running','paused','awaiting_approval')`,
        [runId, reason],
      )
      .catch(err =>
        log.error(`[ana-run-control] internal stop failed for ${runId}: ${err?.message}`),
      ),
  );
}

/**
 * Drain the queue — steers and screen reports together — atomically.
 *
 * One statement. The CTE takes the row lock and reads the pre-image; the UPDATE
 * clears it and `RETURNING` hands back what the CTE saw. Two concurrent drains
 * cannot both see the same entry — the second blocks on the lock, re-reads the
 * updated row under READ COMMITTED, finds it empty and returns nothing. A steer
 * applied twice is a redirect the person issued once.
 *
 * Both kinds come out of the one drain, each tagged, so the checkpoint can
 * route them differently without a second read that could race the first. An
 * entry with no `kind` was queued before screen reports existed, when the
 * queue held nothing but steers, and is returned as one.
 */
export async function consumeInterjections(pool: Pool, runId: string): Promise<RunQueueEntry[]> {
  const { rows } = await pool.query(
    `WITH locked AS (
       SELECT id, pending_interjections AS before
       FROM ana_runs
       WHERE id = $1 AND pending_interjections <> '[]'::jsonb
       FOR UPDATE
     )
     UPDATE ana_runs r
     SET pending_interjections = '[]'::jsonb, updated_at = now()
     FROM locked l
     WHERE r.id = l.id
     RETURNING l.before AS drained`,
    [runId],
  );
  const drained = rows[0]?.drained;
  if (!Array.isArray(drained)) return [];
  const out: RunQueueEntry[] = [];
  for (const i of drained) {
    const moveId = readMoveId(i?.moveId);
    if (i?.kind === 'move_landed') {
      // Nothing to read, only a move to settle — so it needs its id.
      if (moveId) out.push({ kind: 'move_landed', text: '', moveId });
      continue;
    }
    const text = String(i?.text ?? '').trim();
    if (!text) continue;
    out.push({
      kind: i?.kind === 'screen_report' ? 'screen_report' : 'steer',
      text,
      ...(moveId && i?.kind === 'screen_report' ? { moveId } : {}),
    });
  }
  return out;
}

/** Notify other instances, and drive this one immediately. */
async function notifyAndDrive(pool: RunControlQuery, runId: string, status: RunStatus): Promise<void> {
  // Same-instance first: almost all control is local, and waiting for the
  // round-trip would add latency to the common case for no reason.
  driveLocalRun(runId, status);
  await pool
    .query(`SELECT pg_notify($1, $2)`, [RUN_CONTROL_CHANNEL, runId])
    .catch(err => log.warn(`[ana-run-control] pg_notify failed for ${runId}: ${err?.message}`));
}

/**
 * Fail every live run this process no longer heartbeats.
 *
 * A restart leaves rows saying `running` with nobody executing them. Reporting
 * those as live is the lie `check_deep_investigation` already refuses to tell;
 * this is the same refusal for chat runs.
 */
export async function reapOrphanedRuns(pool: Pool, staleAfterMs = STALE_AFTER_MS): Promise<number> {
  // System scope, explicitly. This sweep is estate-wide by design — the runs
  // that most need reaping belong to an instance that is gone — and it is
  // called opportunistically from inside a request, whose tenant scope would
  // silently reduce it to that one org and return a reassuring small number.
  const { rowCount } = await runWithSystemTenantScope('ana-run-control:reap', () =>
    pool.query(
    `UPDATE ana_runs
     SET status = 'failed', stopped_reason = 'orphaned', finished_at = now(), updated_at = now()
     WHERE status IN ('running','paused','awaiting_approval')
       AND heartbeat_at < now() - make_interval(secs => $1)`,
      [Math.round(staleAfterMs / 1000)],
    ),
  );
  return rowCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-instance delivery
// ─────────────────────────────────────────────────────────────────────────────

let listenerStarted = false;
let pollTimer: NodeJS.Timeout | null = null;
/**
 * The dedicated LISTEN connection, held for the life of the process. Kept so it
 * can be RETURNED: a checked-out client is one `pool.end()` waits on forever, so
 * without `stopRunControlListener` a graceful shutdown after the first AnA turn
 * never reached `process.exit` and the deploy's SIGTERM ended in a SIGKILL.
 */
let listenerClient: PoolClient | null = null;

/**
 * Start listening for control from other instances. Idempotent.
 *
 * NOTIFY is the primary path. If the dedicated client cannot connect or errors,
 * this drops to a poll and says so at error level — a degraded deployment
 * should be visible, not merely slower.
 */
export async function startRunControlListener(pool: Pool): Promise<void> {
  if (listenerStarted) return;
  listenerStarted = true;

  try {
    // Every query below is estate-wide — a notification names a run, not a
    // tenant, and the poller asks about whatever this process happens to own.
    // Opened under the system scope explicitly, because the alternative is what
    // it inherits: setInterval and the pg notification callback both carry the
    // context they were CREATED in, so arming from inside the first turn after
    // boot would pin every later firing to that first tenant, and RLS would
    // return zero rows for every other one — silently, because zero rows is not
    // an error.
    const client = await runWithSystemTenantScope('ana-run-control:listen', () => pool.connect());
    if (!listenerStarted) {
      // Stopped while the connection was opening — shutdown got here first.
      client.release(true);
      return;
    }
    listenerClient = client;
    client.on('notification', msg => {
      if (msg.channel !== RUN_CONTROL_CHANNEL || !msg.payload) return;
      void refreshFromRow(pool, msg.payload);
    });
    client.on('error', err => {
      log.error(
        `[ana-run-control] LISTEN client errored (${err?.message}); falling back to polling. ` +
          'Control still lands, with poll-interval latency instead of immediate.',
      );
      // A broken connection goes back to the pool destroyed, not kept, so it
      // neither blocks pool.end() nor is handed to the next caller.
      if (listenerClient === client) {
        listenerClient = null;
        client.release(err instanceof Error ? err : true);
      }
      startPollFallback(pool);
    });
    await client.query(`LISTEN ${RUN_CONTROL_CHANNEL}`);
    log.info('[ana-run-control] listening for cross-instance control');
  } catch (err: any) {
    // Connected but LISTEN failed: the connection is not listening and must not
    // stay checked out, or it blocks pool.end() exactly as a healthy one would.
    if (listenerClient) {
      listenerClient.release(err instanceof Error ? err : true);
      listenerClient = null;
    }
    log.error(
      `[ana-run-control] could not open a LISTEN client (${err?.message}); polling instead. ` +
        'Control still lands, with poll-interval latency instead of immediate.',
    );
    startPollFallback(pool);
  }
}

function startPollFallback(pool: Pool): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (localRuns.size === 0) return;
    // Scoped per firing, not per arming. A setInterval callback inherits the
    // context the timer was CREATED in, which here is whichever request first
    // failed to open a listener — so without this the poller would ask about
    // every run this process owns while pinned to one tenant, and quietly see
    // none of the others.
    void runWithSystemTenantScope('ana-run-control:poll', () =>
      pool.query(`SELECT id, status FROM ana_runs WHERE id = ANY($1::text[])`, [
        [...localRuns.keys()],
      ]),
    )
      .then(({ rows }) => {
        for (const r of rows) driveLocalRun(r.id, r.status as RunStatus);
      })
      // Not swallowed. This is the path that is ALLOWED to be the only one that
      // works, so a failure here is control silently not arriving — the exact
      // thing the durable record was built to stop being possible.
      .catch(err =>
        log.error(`[ana-run-control] poll fallback query failed: ${err?.message}`),
      );
  }, POLL_FALLBACK_MS);
  pollTimer.unref?.();
}

async function refreshFromRow(pool: Pool, runId: string): Promise<void> {
  if (!localRuns.has(runId)) return; // not ours
  // The notification carries a run id and no tenant, and this callback runs in
  // the LISTEN socket's creation context rather than the notifying request's —
  // so it opens its own system scope rather than inheriting a stale one.
  const status = await runWithSystemTenantScope('ana-run-control:notify', () =>
    readStatus(pool, runId),
  ).catch(err => {
    log.error(`[ana-run-control] notify refresh failed for ${runId}: ${err?.message}`);
    return null;
  });
  if (status) driveLocalRun(runId, status);
}

/**
 * Stop cross-instance delivery: return the LISTEN connection and stop the
 * poller. Called by graceful shutdown BEFORE the pool is closed, the same way
 * the audit chain monitor is stopped — `pool.end()` waits for every checked-out
 * client, and this one is never checked in on its own.
 *
 * Destroyed rather than recycled: a pooled connection still LISTENing would
 * deliver this channel's notifications to whoever borrowed it next.
 */
export function stopRunControlListener(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  const client = listenerClient;
  listenerClient = null;
  listenerStarted = false;
  client?.release(true);
}

/** Test seam: forget this process's local runs and stop delivery. */
export function _resetLocalRunsForTest(): void {
  localRuns.clear();
  stopRunControlListener();
}

/**
 * Resume a run whose pause outlived the ceiling.
 *
 * Deliberately NOT routed through `applyControl`: nobody decided this, so it
 * writes no control event and is attributed to no user. Recording an abandoned
 * pause as a person pressing resume would put a decision nobody made into the
 * lineage the dossier reads — the same distinction `stopRunInternally` draws
 * for a dropped socket.
 */
export async function resumeAbandonedRun(pool: Pool, runId: string): Promise<void> {
  await pool
    .query(`UPDATE ana_runs SET status = 'running', updated_at = now() WHERE id = $1 AND status = 'paused'`, [
      runId,
    ])
    .catch(err => log.warn(`[ana-run-control] abandoned resume failed for ${runId}: ${err?.message}`));
  driveLocalRun(runId, 'running');
}

/**
 * Hold a running run for its person: running → paused (row 74).
 *
 * For a turn whose person asked to be asked before each further step
 * (Manual). Like resumeAbandonedRun, it is not routed through applyControl and
 * writes no control event: nobody pressed pause — the person chose the policy,
 * and the policy is recorded on the turn, not as a pause they did not make.
 * Their answer (resume, steer, cancel) goes through applyControl as usual and
 * is recorded as theirs. False when the run was not running.
 */
export async function holdForPerson(pool: RunControlQuery, runId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE ana_runs SET status = 'paused', updated_at = now() WHERE id = $1 AND status = 'running'`,
    [runId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * End a held run nobody came back to: paused → finished, stopped_reason
 * 'hold_expired' (row 74).
 *
 * The counterpart of resumeAbandonedRun for a turn that must not carry on
 * unattended: where that one resumes, this one ends. A server decision, so no
 * control event. Guarded on 'paused', so a resume that landed first wins and
 * this returns false; afterwards applyControl refuses TERMINAL and the turn's
 * own endRun is a no-op. Everything waiting on the run in this process is
 * woken — its cancel signal is not aborted, because nobody cancelled it.
 *
 * A failed write is thrown, where resumeAbandonedRun logs and carries on.
 * Carrying on is that one's safe default; here false would read as "a
 * Continue landed first" and keep a turn waiting that nobody may be coming
 * back to, with its row in a state nobody knows. The turn ends on the error.
 */
export async function endHeldRun(pool: RunControlQuery, runId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE ana_runs
     SET status = 'finished', stopped_reason = 'hold_expired', finished_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'paused'`,
    [runId],
  );
  if (!rowCount) return false;
  await notifyAndDrive(pool, runId, 'finished');
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval — holding a run at a governed action until a person decides
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What AnA is asking permission to do, as the row holds it.
 *
 * Named for the TOOL CALL it holds, not for "an approval": the workflow layer
 * has its own pending approval — a reviewer's step on a document — and one
 * exported noun meaning both is how a reader greps the name and lands in the
 * wrong module (`ci:duplicate-exported-types`).
 */
export interface PendingToolApproval {
  /** The tool call this is for. Binds the decision to one proposal. */
  toolUseId: string;
  command: string;
  params: Record<string, unknown>;
  /** 'reason' | 'esignature' — what the person must supply. */
  tier: string;
  requestedAt: string;
  /** The reason AnA gave for proposing it, if she gave one. */
  rationale?: string;
  /** A tool (not a platform command) only: the context the loop would have run it with. The route runs it from this, never the body. */
  toolContext?: {
    projectId: number | null;
    projectRef: string | null;
    servingModel: { provider?: string | null; model?: string | null; requestId?: string | null } | null;
    /** The conversation and turn that proposed it (PF-10 S5); absent on a run held before. */
    threadId?: string | null;
    turnId?: string | null;
  };
  /**
   * The model call whose tool_use proposed this action (servedModelOf), for a
   * platform command and a tool alike. The governed-action route runs the action
   * with it, so the Part 11 row names the gateway request (agentAuditDetails).
   */
  proposedBy?: { provider: string | null; model: string | null; requestId: string | null } | null;
}

/** What the person decided, and what came of it. */
export interface ApprovalDecision {
  toolUseId: string;
  decided: 'approved' | 'denied';
  decidedAt: string;
  byUserId: number | null;
  /** Their reason-for-change, recorded verbatim. */
  reasonForChange?: string;
  /** The executed command's result, when it ran. */
  result?: unknown;
  /** Why it did not run — a denial, a timeout, a failure. */
  error?: string;
}

/**
 * Hold the run at a governed action.
 *
 * Guarded on `running` so a run already cancelled cannot be moved into an
 * approval gate it will never leave — and so a second tool in the same round
 * cannot open a second gate over the first, which would leave the person
 * authorising one thing while the row described another.
 */
export async function requestApproval(
  pool: Pool,
  runId: string,
  pending: PendingToolApproval,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE ana_runs
     SET status = 'awaiting_approval',
         pending_approval = $2::jsonb,
         approval_decision = NULL,
         updated_at = now()
     WHERE id = $1 AND status = 'running'`,
    [runId, JSON.stringify(pending)],
  );
  if (!rowCount) return false;
  await notifyAndDrive(pool, runId, 'awaiting_approval');
  return true;
}

/**
 * The one method the approval helpers below use. A Pool satisfies it, and so
 * does the request-scoped client (db/requestDb requestPgClient) — which is what
 * the governed-action route passes, so the read and the release run on the
 * caller's own tenant-scoped connection.
 */
export interface RunControlQuery {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** What the run is currently waiting on, if anything. */
export async function readPendingApproval(
  pool: RunControlQuery,
  runId: string,
  organizationId: number,
): Promise<PendingToolApproval | null> {
  const { rows } = await pool.query(
    `SELECT pending_approval FROM ana_runs
     WHERE id = $1 AND organization_id = $2 AND status = 'awaiting_approval'`,
    [runId, organizationId],
  );
  return (rows[0]?.pending_approval as PendingToolApproval) ?? null;
}

/**
 * Record what the person decided and release the run.
 *
 * Guarded on `awaiting_approval` AND on the toolUseId the row is actually
 * holding: a decision must attach to the proposal it was shown, never to
 * whatever the run moved on to. Without that, a signature collected for one
 * action could be applied to another — which is the failure mode an e-signature
 * exists to make impossible.
 *
 * Guarded on `organization_id` for the same reason one level up: a decision
 * must attach to a run of the tenant that made it. Every caller runs the
 * org-scoped `readPendingApproval` first, so this was not reachable
 * cross-tenant — but the safety lived in a different statement, and this one
 * carried no tenant predicate of its own. With RLS_ENFORCE off the policy is
 * inert, so the statement is the only place the boundary can live. Under
 * RLS_ENFORCE=on the request's scoped client enforces it as well; this is the
 * layer that does not depend on that switch. Ledger L206.
 */
export async function recordApprovalDecision(
  pool: RunControlQuery,
  runId: string,
  organizationId: number,
  decision: ApprovalDecision,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE ana_runs
     SET status = 'running',
         approval_decision = $2::jsonb,
         pending_approval = NULL,
         updated_at = now()
     WHERE id = $1
       AND organization_id = $4
       AND status = 'awaiting_approval'
       AND pending_approval ->> 'toolUseId' = $3`,
    [runId, JSON.stringify(decision), decision.toolUseId, organizationId],
  );
  if (!rowCount) return false;
  await notifyAndDrive(pool, runId, 'running');
  return true;
}

/** The decision for this tool call, once one has been recorded. */
export async function readApprovalDecision(
  pool: Pool,
  runId: string,
  toolUseId: string,
): Promise<ApprovalDecision | null> {
  const { rows } = await pool.query(
    `SELECT approval_decision FROM ana_runs
     WHERE id = $1 AND approval_decision ->> 'toolUseId' = $2`,
    [runId, toolUseId],
  );
  return (rows[0]?.approval_decision as ApprovalDecision) ?? null;
}
