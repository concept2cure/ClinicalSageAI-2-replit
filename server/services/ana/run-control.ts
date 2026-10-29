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
import type { AnswerCheck } from './answer-grounding';
import { RunStopped } from './run-stopped.js';
import { sessionEndDetailOf, type SessionEndDetail } from '@shared/ana/stop-lines';
import { sessionIdOfToken } from '../session-inactivity.js';
import {
  expireOrphanedRunEvents,
  openRunEventsMirror,
  releaseSealedRunEvents,
  RUN_EVENTS_RETENTION_DAYS,
  type RunEventsMirror,
} from './run-events.js';
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

/**
 * Why a control request was refused. `REASON_REQUIRED`: an administrator's
 * cancel of a colleague's run states why (DT3 review, DP-82).
 * `AUDIT_REFUSED`: its chained audit row could not be written, so the cancel
 * was rolled back and nothing changed.
 */
export type ControlRefusal = 'NOT_FOUND' | 'NOT_YOURS' | 'TERMINAL' | 'INVALID' | 'REASON_REQUIRED' | 'AUDIT_REFUSED';

export interface ControlResult {
  ok: boolean;
  code?: ControlRefusal;
  status: RunStatus | null;
  /** Queue entries (steers and screen reports) not yet consumed, for the caller's snapshot. */
  pendingInterjections?: number;
  /** Set when the control was an organisation admin's cancel of a colleague's run (§2.5). */
  byRole?: 'admin';
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
  /**
   * Present only without a durable run row; a dropped socket, and since the
   * DT3 review an ended standing (with its RunStopped reason), can still stop
   * local work.
   */
  abortLocally?: (reason?: unknown) => void;
  /**
   * The run's live timeline mirror (run-events.ts; AnA detach DT1). Present
   * only on a durable run: a turn with no row has nothing to mirror into.
   */
  events?: RunEventsMirror;
  /**
   * Write the conversation and the question onto the run once they are known
   * (stampRunThread). Present only on a durable run.
   */
  stampThread?: (threadId: string, userMessageId: number | null) => Promise<boolean>;
  /**
   * Whether the session and the organisation that started this run still
   * stand (AnA detach §2.9): `session_ended`, with what the check found, when
   * either has ended or cannot be read; null while both do. Re-checked at
   * each round boundary on the credential the request was authenticated
   * with, which only this handle holds. Present on a run with a person — a
   * durable one, and since the DT3 review (IAM-35) a local-only one too.
   */
  standing?: () => Promise<RunStandingEnded | null>;
}

export { RunStopped, runStopDetailOf, runStopReasonOf } from './run-stopped.js';

/** This process, for `owner_instance`. */
const INSTANCE_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

interface LocalRun {
  controller: AbortController;
  /** The run's tenant: a shutdown writes each run in its own scope (§7). */
  organizationId: number;
  /** Resolvers waiting on a row change — the pause/approval wait. */
  waiters: Set<() => void>;
  /** The highest timeline seq emitted, carried by the heartbeat (ana_runs.timeline_seq). */
  timelineSeq: number;
}

const localRuns = new Map<string, LocalRun>();

/**
 * Wake everything waiting on this run, and abort it when its row says it was
 * stopped.
 *
 * `cancelled` (a person's Stop, an admin's, the session's end) and, since AnA
 * detach DT3, `failed` (the reaper, a shutdown, a hard unattended stop) abort
 * the owner; `finished` never does. The owner's own endHeldRun writes paused →
 * finished and drives this run so its waiters wake, and the turn must then
 * write its closing answer: an abort there would kill it. endRun drives
 * nothing and releases first. So no terminal write the owner makes about
 * itself aborts its own post-processing (§2.4).
 *
 * The abort carries the row's reason (RunStopped), so the turn records what
 * the row says.
 */
function driveLocalRun(
  runId: string,
  status: RunStatus,
  reason?: RunStoppedReason | null,
  detail?: SessionEndDetail | null,
): void {
  const local = localRuns.get(runId);
  if (!local) return;
  if ((status === 'cancelled' || status === 'failed') && !local.controller.signal.aborted) {
    local.controller.abort(new RunStopped(reason ?? (status === 'cancelled' ? 'cancelled' : 'orphaned'), detail ?? null));
  }
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
  /**
   * The conversation the CLIENT named. Never stamped as sent: beginRun verifies
   * it first (verifiedThreadId) and writes the verified id, or null.
   */
  threadId?: string | null;
  projectId?: string | null;
  surface: string;
  /** 'manual' | 'auto' | null (row 74), written at insert for a follower to read. */
  runPolicy?: 'manual' | 'auto' | null;
  /**
   * The bearer credential the request was authenticated with, held by the
   * handle alone so each round can re-check that the session still stands
   * (§2.9, RunHandle.standing). Never written anywhere.
   */
  sessionToken?: string | null;
}

/** D-3: at most this many live runs per (organisation, person), counted in beginRun's locked transaction. */
export const MAX_LIVE_RUNS_PER_PERSON = 3;

/** Why beginRun refused to open a run. */
export type RunRefusalCode = 'RUN_IN_PROGRESS' | 'RUN_LIMIT' | 'THREAD_FORBIDDEN';

/**
 * beginRun refused, before any row was written (§2.8).
 *
 *   RUN_IN_PROGRESS   a live run already holds this conversation; `runId` names it.
 *   RUN_LIMIT         the person already has MAX_LIVE_RUNS_PER_PERSON live runs.
 *   THREAD_FORBIDDEN  the conversation the client named is a colleague's. The
 *                     stream then runs without a durable run, and its own
 *                     getOrCreateThread refuses the turn as it always has.
 */
export class RunRefusedError extends Error {
  constructor(
    readonly code: RunRefusalCode,
    readonly runId?: string,
  ) {
    super(code);
    this.name = 'RunRefusedError';
  }
}

/** The person's lock and the conversation's lock: one key shape for every writer that takes them. */
const personLockKey = (org: number, user: number) => `ana_runs:user:${org}:${user}`;
const threadLockKey = (org: number, thread: string) => `ana_runs:thread:${org}:${thread}`;

/**
 * The conversation the client named, if the caller may use it — the rule of
 * chat-thread-helpers.ts resolveAccessibleThread, without minting: a thread of
 * THIS organization, owned by the caller or by nobody. A thread of another
 * organization resolves to nothing (null), so its existence is not confirmed;
 * a colleague's is refused. Read on the transaction's own client, inside the
 * person's lock, so the id that is stamped is the id that was checked.
 */
async function verifiedThreadId(
  client: RunControlQuery,
  organizationId: number,
  userId: number | null,
  threadId: string | null | undefined,
): Promise<string | null> {
  if (!threadId) return null;
  const { rows } = await client.query(
    `SELECT id, user_id FROM chat_threads WHERE id = $1 AND organization_id = $2`,
    [threadId, organizationId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.user_id !== null && row.user_id !== undefined && (userId === null || Number(row.user_id) !== userId)) {
    throw new RunRefusedError('THREAD_FORBIDDEN');
  }
  return String(row.id);
}

/**
 * The checkpoint's beat (DT1 §2.3), one write in flight per run: keepalive and
 * round boundaries can overlap on a slow pool, so the newest round is carried
 * forward rather than every intermediate one queued.
 */
function boundedRunHeartbeat(pool: RunControlQuery, runId: string, local: LocalRun): (round: number) => Promise<void> {
  // Keepalive and round boundaries can overlap on a slow pool. Admit one
  // write, then carry the newest requested beat forward without queuing every
  // intermediate round. This is pending work only; the row still owns status.
  let pendingHeartbeat: Promise<void> | null = null;
  let latestHeartbeatRound = 0;
  let heartbeatDirty = false;

  return (round: number) => {
    if (localRuns.get(runId) !== local) return Promise.resolve();
    latestHeartbeatRound = round;
    if (pendingHeartbeat) {
      heartbeatDirty = true;
      return pendingHeartbeat;
    }
    heartbeatDirty = false;
    // Register before invoking the pool, including synchronous reentry.
    pendingHeartbeat = Promise.resolve().then(async () => {
      let roundToWrite = round;
      try {
        while (localRuns.get(runId) === local) {
          try {
            // The process heartbeat's statement for this one run, plus the
            // round and the timeline high-water mark (DT1 §2.3).
            // Owner-guarded like it, so it cannot beat a row this process no
            // longer owns back to life.
            await pool.query(
              `UPDATE ana_runs
                  SET heartbeat_at = now(), current_round = $2, timeline_seq = GREATEST(timeline_seq, $4)
                WHERE id = $1 AND owner_instance = $3 AND status IN ('running','paused','awaiting_approval')`,
              [runId, roundToWrite, INSTANCE_ID, local.timelineSeq],
            );
          } catch (err: any) {
            log.warn(`[ana-run-control] heartbeat failed for ${runId}: ${err?.message}`);
          }
          if (!heartbeatDirty) break;
          roundToWrite = latestHeartbeatRound;
          heartbeatDirty = false;
        }
      } finally {
        // Clear admission in the same continuation as the final queue check.
        // A call at settlement must open fresh work, never join a drained beat.
        pendingHeartbeat = null;
      }
    });
    return pendingHeartbeat;
  };
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
 *
 * ── One transaction, two locks (AnA detach §2.8, D-3) ────────────────────────
 *   1. The person's advisory lock; count their live runs in the organisation
 *      and refuse RUN_LIMIT at MAX_LIVE_RUNS_PER_PERSON. A row whose heartbeat
 *      is past STALE_AFTER_MS is not counted: its process is gone and the
 *      reaper will fail it, and a crashed deploy must not lock a person out.
 *   2. The client's thread id, verified (verifiedThreadId) and never stamped as
 *      sent. Then the conversation's lock; fail that conversation's stale rows
 *      (notified after commit, as the reaper does); refuse RUN_IN_PROGRESS if a
 *      live run still holds it.
 *   3. Insert the run with the verified thread id, or null for a new
 *      conversation (stampRunThread writes it once the thread is minted).
 * Locks rather than a partial unique index: such an index would fail to build
 * on any database already holding two live rows for one thread (RULE 1
 * replay). The locks need no schema. Both refusals come before the question is
 * saved, and write nothing.
 */
export async function beginRun(
  input: BeginRunInput,
): Promise<{ runId: string; handle: RunHandle; /** The conversation verified here, or null for a new one (stamped later). */ threadId: string | null }> {
  const runId = `run_${randomUUID()}`;
  const org = input.organizationId;
  const staleSecs = Math.round(STALE_AFTER_MS / 1000);
  let reapedOnThread: string[] = [];
  let verifiedThread: string | null | undefined;

  const client = await input.pool.connect();
  try {
    await client.query('BEGIN');
    if (input.userId !== null) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [personLockKey(org, input.userId)]);
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM ana_runs
          WHERE organization_id = $1 AND user_id = $2 AND status IN ('running','paused','awaiting_approval')
            AND heartbeat_at >= now() - make_interval(secs => $3)`,
        [org, input.userId, staleSecs],
      );
      if (Number(rows[0]?.n ?? 0) >= MAX_LIVE_RUNS_PER_PERSON) throw new RunRefusedError('RUN_LIMIT');
    }
    const threadId = await verifiedThreadId(client, org, input.userId, input.threadId);
    verifiedThread = threadId;
    if (threadId) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [threadLockKey(org, threadId)]);
      const reaped = await client.query(
        `UPDATE ana_runs
            SET status = 'failed', stopped_reason = 'orphaned', finished_at = now(), updated_at = now()
          WHERE organization_id = $1 AND thread_id = $2 AND status IN ('running','paused','awaiting_approval')
            AND heartbeat_at < now() - make_interval(secs => $3)
          RETURNING id`,
        [org, threadId, staleSecs],
      );
      reapedOnThread = reaped.rows.map((r: { id: string }) => r.id);
      const { rows: holding } = await client.query(
        `SELECT id FROM ana_runs
          WHERE organization_id = $1 AND thread_id = $2 AND status IN ('running','paused','awaiting_approval')
          ORDER BY created_at DESC LIMIT 1`,
        [org, threadId],
      );
      if (holding[0]) throw new RunRefusedError('RUN_IN_PROGRESS', String(holding[0].id));
    }
    await client.query(
      `INSERT INTO ana_runs (id, organization_id, user_id, thread_id, project_id, surface, status, owner_instance, run_policy, started_session_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'running', $7, $8, $9)`,
      [
        runId,
        org,
        input.userId,
        threadId,
        input.projectId ?? null,
        input.surface,
        INSTANCE_ID,
        input.runPolicy ?? null,
        // The session that started it (its sid, never the token): a sign-out
        // of that session stops this run and no other (stopRunsFor).
        sessionIdOfToken(input.sessionToken ?? null),
      ],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  if (reapedOnThread.length > 0) await notifyRuns(input.pool, reapedOnThread);

  const local: LocalRun = { controller: new AbortController(), organizationId: org, waiters: new Set(), timelineSeq: 0 };
  localRuns.set(runId, local);
  armRunHeartbeat(input.pool);
  void startRunControlListener(input.pool);

  const handle: RunHandle = {
    runId,
    cancelSignal: local.controller.signal,
    wake: (timeoutMs: number) => waitOnRun(local, timeoutMs),
    heartbeat: boundedRunHeartbeat(input.pool, runId, local),
    events: openRunEventsMirror({
      pool: input.pool,
      runId,
      organizationId: org,
      ownerInstance: INSTANCE_ID,
      onSeq: seq => {
        local.timelineSeq = seq;
      },
    }),
    stampThread: (threadId: string, userMessageId: number | null) =>
      stampRunThread(input.pool, { runId, organizationId: org, threadId, userMessageId }),
    ...(input.userId !== null
      ? { standing: () => runStanding({ token: input.sessionToken ?? null, userId: input.userId as number, organizationId: org }) }
      : {}),
  };

  return { runId, handle, threadId: verifiedThread ?? null };
}

/** A wait on a run this process owns, cut short by any control that drives it (driveLocalRun wakes `waiters`). */
function waitOnRun(local: LocalRun, timeoutMs: number): Promise<void> {
  return new Promise<void>(resolve => {
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
  });
}

/**
 * Write a run's conversation and question once the stream knows them (§2.8).
 *
 * For a new conversation the run was opened with no thread (the thread is
 * minted after beginRun, by getOrCreateThread), so without this its row kept
 * `thread_id` null forever: unlistable by thread for rejoin, and outside the
 * one-run-per-conversation rule. Under the conversation's lock, and guarded so
 * the id is written only when the row has none and no other live run holds the
 * conversation; a row that already carries this thread gets its question.
 * False when nothing was written (logged by the caller's choice, not here).
 */
export async function stampRunThread(
  pool: Pool,
  input: { runId: string; organizationId: number; threadId: string; userMessageId: number | null },
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      threadLockKey(input.organizationId, input.threadId),
    ]);
    const { rowCount } = await client.query(
      `UPDATE ana_runs r
          SET thread_id = $3, user_message_id = $4, updated_at = now()
        WHERE r.id = $1 AND r.organization_id = $2
          AND (
            r.thread_id = $3
            OR (r.thread_id IS NULL AND NOT EXISTS (
                  SELECT 1 FROM ana_runs o
                   WHERE o.organization_id = $2 AND o.thread_id = $3 AND o.id <> $1
                     AND o.status IN ('running','paused','awaiting_approval')))
          )`,
      [input.runId, input.organizationId, input.threadId, input.userMessageId],
    );
    await client.query('COMMIT');
    return (rowCount ?? 0) > 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** A round-boundary check that found the turn's authority ended: the reason, and what it found (DT3 review, DP-83). */
export interface RunStandingEnded {
  reason: 'session_ended';
  detail: SessionEndDetail;
}

const standingEnded = (cause: SessionEndDetail['cause']): RunStandingEnded => ({ reason: 'session_ended', detail: { cause } });

/** sessionEndReasonFor's reason, as the cause the record names. */
const STANDING_CAUSE: Record<string, SessionEndDetail['cause']> = {
  session_ended: 'credential_ended',
  membership_revoked: 'membership_ended',
  tenant_inactive: 'org_unavailable',
};

/**
 * Does the session that started a run, and its organisation, still stand
 * (AnA detach §2.9)? The checks every open socket re-runs
 * (socket/sessionRecheck.ts sessionEndReasonFor, reused rather than copied):
 * verifyLiveToken(token, …, { activity: false }) — revocation, an inactive
 * account, a password change, sign-out everywhere, the idle, lifetime and
 * superseded windows — then a live membership, then
 * shouldProcessTenantInBackground, which permits only an `allow` posture, so
 * a suspended, inactive or pending_deletion organisation stops the turn. The
 * re-check is not the person acting, so it is not the session's activity.
 *
 * Fails closed: a missing credential, a check that names a reason, and a check
 * that cannot be read are all 'session_ended' — with what was found, so the
 * row and the record say it (DT3 review, DP-83: a credential that expired
 * while the person stayed signed in, or an organisation gone read-only, is
 * not "the session ended"): the credential, the membership, the
 * organisation, or a check that could not be made.
 */
export async function runStanding(subject: {
  token: string | null;
  userId: number;
  organizationId: number;
}): Promise<RunStandingEnded | null> {
  if (!subject.token) return standingEnded('standing_unreadable');
  try {
    const { sessionEndReasonFor } = await import('../../socket/sessionRecheck.js');
    const reason = await sessionEndReasonFor({
      token: subject.token,
      userId: subject.userId,
      organizationId: subject.organizationId,
    });
    return reason ? standingEnded(STANDING_CAUSE[reason] ?? 'standing_unreadable') : null;
  } catch (err: any) {
    log.warn(`[ana-run-control] standing check could not be read; the run stops: ${err?.message}`);
    return standingEnded('standing_unreadable');
  }
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
export function localOnlyRunHandle(
  /**
   * The person and the credential, when the request identified one: the
   * handle then carries the same round-boundary standing check a durable run
   * has (DT3 review, IAM-35), so a turn with no row still stops when its
   * person's authority ends — it is the only stop that cannot reach it
   * through a row.
   */
  subject?: { token: string | null; userId: number; organizationId: number } | null,
): RunHandle {
  const controller = new AbortController();
  return {
    runId: '',
    cancelSignal: controller.signal,
    wake: async () => {},
    heartbeat: async () => {},
    abortLocally: (reason?: unknown) => controller.abort(reason),
    ...(subject ? { standing: () => runStanding(subject) } : {}),
  };
}

/**
 * Close a run.
 *
 * Guarded on a live status for the same reason the deep-investigation
 * completion write is: a run cancelled while the loop was still unwinding must
 * not be rewritten to 'finished' by whichever writer happens to finish last. A
 * cancelled run reporting a completed turn is worse than one reporting nothing.
 *
 * Says which writer won (AnA detach DT3 review): `ended` when this write ended
 * the run; `already_ended` when another writer had (a shutdown, an admin, the
 * session's end, the reaper, the unattended limit), which a stop that writes
 * its row before its abort reaches the owner can do as the turn finishes —
 * the turn then reads the row's reason (readRunEnding) and ends as that stop,
 * so its record never says "answered" for a row that says stopped;
 * `write_failed` when the write could not be made (logged).
 */
export type EndRunOutcome = 'ended' | 'already_ended' | 'write_failed';

export async function endRun(
  pool: Pool,
  runId: string,
  status: Extract<RunStatus, 'finished' | 'failed'>,
  stoppedReason: RunStoppedReason,
): Promise<EndRunOutcome> {
  // Write first, release after. Releasing first meant a failed write left a row
  // saying `running` with the only AbortController for it already discarded —
  // a run advertising itself as live that nothing in this process could stop.
  try {
    const { rowCount } = await pool.query(
      `UPDATE ana_runs
       SET status = $2, stopped_reason = $3, finished_at = now(), updated_at = now(), hold = NULL
       WHERE id = $1 AND status IN ('running','paused','awaiting_approval')`,
      [runId, status, stoppedReason],
    );
    return (rowCount ?? 0) > 0 ? 'ended' : 'already_ended';
  } catch (err: any) {
    log.error(`[ana-run-control] endRun failed for ${runId}: ${err?.message}`);
    return 'write_failed';
  } finally {
    releaseLocalRun(runId);
  }
}

/**
 * How a run's row says it ended, when another writer ended it: its stop
 * reason for a `cancelled` or `failed` row, null for a row still live,
 * `finished`, or gone. Read by the owner after endRun answered `already_ended`.
 */
export async function readRunEnding(
  pool: RunControlQuery,
  runId: string,
): Promise<{ stoppedReason: RunStoppedReason; detail: SessionEndDetail | null } | null> {
  const state = await readRunState(pool, runId);
  if (!state || (state.status !== 'cancelled' && state.status !== 'failed') || !state.stoppedReason) return null;
  return { stoppedReason: state.stoppedReason, detail: state.detail };
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

/** A run's status and why it stopped, as the owner drives its local half from them (§2.4). */
async function readRunState(
  pool: RunControlQuery,
  runId: string,
): Promise<{ status: RunStatus; stoppedReason: RunStoppedReason | null; detail: SessionEndDetail | null } | null> {
  const { rows } = await pool.query(`SELECT status, stopped_reason, stopped_detail FROM ana_runs WHERE id = $1`, [runId]);
  return rows[0]
    ? {
        status: rows[0].status as RunStatus,
        stoppedReason: (rows[0].stopped_reason as RunStoppedReason) ?? null,
        detail: sessionEndDetailOf(rows[0].stopped_detail),
      }
    : null;
}

/**
 * The page that started the run closed and the turn went on (§2.1): stamp
 * `detached_at` once, by the owner. A follower reads it, with
 * `last_watched_at`, to say when an unwatched turn stops (shared/ana/run-detach.ts).
 */
export async function markRunDetached(pool: RunControlQuery, runId: string, at: Date): Promise<void> {
  await pool.query(
    `UPDATE ana_runs SET detached_at = COALESCE(detached_at, $2::timestamptz), updated_at = now()
      WHERE id = $1 AND owner_instance = $3`,
    [runId, at.toISOString(), INSTANCE_ID],
  );
}

/** When the asker's poll last stamped this run watched (epoch ms), or null when never. */
export async function readLastWatched(pool: RunControlQuery, runId: string): Promise<number | null> {
  const { rows } = await pool.query(`SELECT last_watched_at FROM ana_runs WHERE id = $1`, [runId]);
  const v = rows[0]?.last_watched_at;
  if (v === null || v === undefined) return null;
  const ms = (v instanceof Date ? v : new Date(String(v))).getTime();
  return Number.isFinite(ms) ? ms : null;
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
  /**
   * The caller is an admin or owner of the organisation (record-access.ts
   * readsEveryRecord). It admits a `cancel` of a colleague's run, and nothing
   * else (AnA detach §2.5): pause, resume, steer and approvals stay the
   * asker's.
   */
  callerIsAdmin?: boolean;
  /**
   * Why an administrator is stopping a colleague's turn. Required for that
   * cancel, and recorded on its control event and its chained audit row
   * (DT3 review, DP-82); ignored for every other control.
   */
  reason?: string;
  /** Where the control came from, for the admin cancel's audit row. */
  requestMeta?: { ipAddress?: string; userAgent?: string };
}

/** The most an administrator's stated reason keeps (the audit row's reason column and the event). */
export const MAX_ADMIN_CANCEL_REASON_CHARS = 500;

/** An administrator's reason as it is recorded, or null when none was given. */
function adminCancelReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, MAX_ADMIN_CANCEL_REASON_CHARS);
  return trimmed ? trimmed : null;
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
/**
 * Who may take this control on this run: its asker (any control), an
 * organisation admin or owner (a cancel and nothing else), or nobody.
 *
 * Ownership needs an owner on BOTH sides. The earlier form skipped the check
 * whenever either side was null, which fails OPEN twice over: an unattributed
 * run became controllable by every member of the org, and an unattributed
 * caller could control anyone's. `user_id` stays nullable for non-interactive
 * surfaces that have no person behind them — and those are precisely the runs
 * no person should be able to seize.
 *
 * An admin or owner may stop any run of their organisation — cancel only,
 * never approve (AnA detach §2.5). The organisation is in applyControl's SQL,
 * so another organisation's admin got NOT_FOUND already. Attributed to the
 * admin, with byRole, in control_events: the decision lineage says who
 * stopped it.
 */
function controlAuthority(
  runUserId: number | null,
  input: Pick<ApplyControlInput, 'userId' | 'action' | 'callerIsAdmin'>,
): 'asker' | 'admin_cancel' | null {
  const { userId } = input;
  if (userId === null) return null;
  if (runUserId !== null && runUserId === userId) return 'asker';
  return input.callerIsAdmin === true && input.action === 'cancel' ? 'admin_cancel' : null;
}

export async function applyControl(input: ApplyControlInput): Promise<ControlResult> {
  const { pool, runId, organizationId, action } = input;

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
  const authority = controlAuthority(row.userId, input);
  if (!authority) {
    return { ok: false, code: 'NOT_YOURS', status: row.status };
  }
  const adminCancel = authority === 'admin_cancel';
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

  // An administrator overriding a colleague takes its own path (DT3 review,
  // DP-82): a reason, and the chained audit row in the cancel's transaction.
  if (adminCancel) return cancelAsAdministrator(pool, row, input);

  const event = controlEventOf(row, action, input, null);
  if (action === 'interject') return queueSteer(pool, row, event, event.message ?? '');
  return changeStatus(pool, row, event);
}

/** The control event a person's action records: who, when, at which round, what they said, and an administrator's reason. */
function controlEventOf(
  row: RunRow,
  action: HumanControlEvent['action'],
  input: Pick<ApplyControlInput, 'userId' | 'message'>,
  adminReason: string | null,
): HumanControlEvent {
  const trimmed = (input.message ?? '').trim().slice(0, MAX_INTERJECTION_CHARS);
  return {
    action,
    round: row.currentRound,
    at: new Date().toISOString(),
    byUserId: input.userId,
    ...(adminReason ? { byRole: 'admin' as const, reason: adminReason } : {}),
    ...(trimmed ? { message: trimmed } : {}),
  };
}

/**
 * An administrator's cancel of a colleague's run, and its chained audit row,
 * in ONE transaction (DT3 review, DP-82): the row names the administrator,
 * whose run it was, its conversation, and the reason given. A row the chain
 * refuses rolls the cancel back — the run goes on, nothing is written, and
 * the administrator is told and can try again — so the ledger never lacks an
 * override that happened. The asker's own Stop does not come this way.
 */
async function cancelAsAdministrator(pool: Pool, row: RunRow, input: ApplyControlInput): Promise<ControlResult> {
  // The administrator says why, as the membership writers require
  // (membership-change.ts). Asked before anything is written.
  const reason = adminCancelReason(input.reason);
  if (!reason) return { ok: false, code: 'REASON_REQUIRED', status: row.status };
  if (!canTransitionRunStatus(row.status, 'cancelled')) {
    return { ok: false, code: 'INVALID', status: row.status };
  }
  const event = controlEventOf(row, 'cancel', input, reason);
  const meta = input.requestMeta;
  const { writeChainedAuditRow } = await import('../auditService.js');
  const client = await pool.connect();
  let open = false;
  try {
    await client.query('BEGIN');
    open = true;
    const { rowCount } = await client.query(
      `UPDATE ana_runs
       SET status = 'cancelled',
           control_events = control_events || $2::jsonb,
           stopped_reason = 'admin_cancelled',
           finished_at = now(),
           hold = NULL,
           updated_at = now()
       WHERE id = $1 AND status = $3`,
      [row.id, JSON.stringify([event]), row.status],
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      open = false;
      return { ok: false, code: 'TERMINAL', status: await readStatus(pool, row.id) };
    }
    try {
      await writeChainedAuditRow(client, {
        tenantId: row.organizationId,
        userId: event.byUserId ?? undefined,
        action: 'ana.run.admin_cancelled',
        resourceType: 'ana_run',
        resourceId: row.id,
        reason: event.reason ?? null,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        details: {
          runId: row.id,
          byRole: 'admin',
          stoppedReason: 'admin_cancelled',
          ownerUserId: row.userId,
          threadId: row.threadId,
          reason: event.reason ?? null,
        },
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      open = false;
      log.error(`[ana-run-control] admin cancel of ${row.id} rolled back: its audit row was refused: ${err?.message}`);
      return { ok: false, code: 'AUDIT_REFUSED', status: row.status };
    }
    await client.query('COMMIT');
    open = false;
  } catch (err) {
    if (open) await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  await notifyAndDrive(pool, row.id, 'cancelled', 'admin_cancelled');
  return { ok: true, status: 'cancelled', pendingInterjections: row.pendingInterjections.length, byRole: 'admin' };
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
         hold = CASE WHEN $4 = 'running' THEN NULL ELSE hold END,
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
  // An admin's cancel goes through cancelAsAdministrator, with its audit row;
  // this is the asker's own control.
  const cancelReason: RunStoppedReason = 'cancelled';
  const { rowCount } = await pool.query(
    `UPDATE ana_runs
     SET status = $2,
         control_events = control_events || $3::jsonb,
         stopped_reason = CASE WHEN $2 = 'cancelled' THEN $5 ELSE stopped_reason END,
         finished_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE finished_at END,
         hold = CASE WHEN $2 = 'paused' THEN hold ELSE NULL END,
         updated_at = now()
     WHERE id = $1 AND status = $4`,
    [row.id, next, JSON.stringify([event]), row.status, cancelReason],
  );
  if (!rowCount) return { ok: false, code: 'TERMINAL', status: await readStatus(pool, row.id) };
  await notifyAndDrive(pool, row.id, next, next === 'cancelled' ? cancelReason : null);
  return { ok: true, status: next, pendingInterjections: row.pendingInterjections.length };
}


/** The reasons a server path (not a person, not the turn's loop) stops a run with. */
export type InternalStopReason = Extract<
  RunStoppedReason,
  'client_disconnected' | 'orphaned' | 'server_shutdown' | 'session_ended' | 'unattended_limit' | 'budget_exhausted'
>;

/**
 * The status each internal stop writes. `failed` for the server's own ends —
 * the process going away or the limit on unwatched work — as the reaper
 * writes; `cancelled` for a page that went (a non-detachable turn) and for a
 * session that ended, the conservative reading of "the person is no longer
 * here" (§2.9). Before DT3 every reason wrote `cancelled`.
 */
const INTERNAL_STOP_STATUS: Record<InternalStopReason, Extract<RunStatus, 'cancelled' | 'failed'>> = {
  client_disconnected: 'cancelled',
  session_ended: 'cancelled',
  orphaned: 'failed',
  server_shutdown: 'failed',
  unattended_limit: 'failed',
  budget_exhausted: 'failed',
};

/** A write about one known run, in that run's own tenant (never the super-admin scope it does not need). */
function inRunTenant<T>(organizationId: number | undefined, caller: string, fn: () => Promise<T>): Promise<T> {
  return organizationId === undefined
    ? fn()
    : runWithTenantScope({ tenantId: String(organizationId), role: null, source: 'request', caller }, fn);
}

/**
 * Stop a run for a reason that is not a human decision.
 *
 * A dropped socket is not a person pressing stop, and the audit must not say it
 * was — so this writes the reason and records no control event. It still
 * aborts, because the work should stop either way.
 *
 * `client_disconnected` aborts FIRST: it is a non-detachable turn whose page is
 * gone, and the abort is local and needs no database. Every other reason
 * writes FIRST and aborts after (whatever came of the write): the turn's own
 * unwinding reaches endRun, and a row written by that endRun before this one
 * would make the record and the row disagree. The abort carries the reason
 * (RunStopped), so the turn's record says what the row says.
 */
export async function stopRunInternally(
  pool: Pool,
  runId: string,
  reason: InternalStopReason,
  organizationId?: number,
  /** For a session_ended stop: what ended it, written to stopped_detail and carried by the abort (DT3 review, DP-83). */
  detail?: SessionEndDetail | null,
): Promise<void> {
  const status = INTERNAL_STOP_STATUS[reason];
  const stoppedDetail = detail ? JSON.stringify({ cause: detail.cause, byUserId: detail.byUserId ?? null }) : null;
  // An EventEmitter listener runs in the context of whoever called emit, not
  // the context it was registered in, so a 'close' handler cannot rely on
  // inheriting the request's tenant scope. The run's own tenant is passed in.
  const write = () =>
    inRunTenant(organizationId, 'ana-run-control:internal-stop', () =>
      pool.query(
        `UPDATE ana_runs
         SET status = $3, stopped_reason = $2, stopped_detail = COALESCE($4::jsonb, stopped_detail),
             finished_at = now(), updated_at = now(), hold = NULL
         WHERE id = $1 AND status IN ('running','paused','awaiting_approval')`,
        [runId, reason, status, stoppedDetail],
      ),
    ).catch(err => log.error(`[ana-run-control] internal stop failed for ${runId}: ${err?.message}`));
  if (reason === 'client_disconnected') {
    driveLocalRun(runId, status, reason);
    await write();
    return;
  }
  try {
    await write();
  } finally {
    driveLocalRun(runId, status, reason, detail ?? null);
  }
}

/** Which live runs a session's or an organisation's end stops (stopRunsFor). */
export interface RunStopScope {
  /** Only this organisation's runs. Absent: the person's runs in every organisation. */
  organizationId?: number | null;
  /** Only this person's runs. */
  userId?: number | null;
  /**
   * Only the runs this session started (ana_runs.started_session_id): a
   * sign-out ends one session, not the person's others (DT3 review). Needs a
   * person.
   */
  sessionId?: string | null;
}

/**
 * Stop the live runs of a person, of one of their sessions, or of an
 * organisation, because the session or the organisation that started them
 * ended (AnA detach §2.9).
 *
 * Writes `cancelled`/`session_ended` and what ended it (`stopped_detail`:
 * the cause and who did it) on the matching live rows, guarded on a live
 * status; writes no control event (nobody decided to stop AnA); notifies each
 * run, so every owner — on any instance — aborts with
 * RunStopped('session_ended', detail); and writes one audit row per
 * organisation, `ana.runs.ended_with_session`, naming the cause, the actor and
 * the runs it stopped, so the act that ended the session is linked in the
 * ledger to the work it ended. Returns the runs it stopped.
 *
 * Two statements, never one with an optional organisation predicate
 * (ci:tenant-isolation): an organisation's (or a member's) stop is keyed on
 * that organisation, in its scope; a person's stop across every organisation
 * is keyed on the person, in the system scope, as the reaper is.
 *
 * Called from sign-out, endEverySessionOf, a password change or reset, a
 * deactivation, SCIM deprovisioning, a member's removal, an organisation's
 * suspension or deletion request, and purgeTenant (first, before any table).
 * Never throws: a hook that failed to stop runs leaves the round-boundary
 * check (RunHandle.standing) as the backstop, and the caller's own act must
 * not fail for it.
 */
export async function stopRunsFor(pool: Pool, scope: RunStopScope, detail: SessionEndDetail): Promise<string[]> {
  const org = scope.organizationId ?? null;
  const user = scope.userId ?? null;
  const session = scope.sessionId ?? null;
  if (org === null && user === null) return [];
  if (session !== null && user === null) return [];
  const reason: RunStoppedReason = 'session_ended';
  const stoppedDetail = JSON.stringify({ cause: detail.cause, byUserId: detail.byUserId ?? null });
  try {
    const stopped: Array<{ id: string; organizationId: number }> =
      org !== null
        ? await inRunTenant(org, 'ana-run-control:session-end', async () => {
            const { rows } = await pool.query(
              `UPDATE ana_runs
                  SET status = 'cancelled', stopped_reason = $4, stopped_detail = $5::jsonb,
                      finished_at = now(), updated_at = now(), hold = NULL
                WHERE organization_id = $1
                  AND status IN ('running','paused','awaiting_approval')
                  AND ($2::integer IS NULL OR user_id = $2)
                  AND ($3::text IS NULL OR started_session_id = $3)
                RETURNING id, organization_id`,
              [org, user, session, reason, stoppedDetail],
            );
            return rowsStopped(rows);
          })
        : await runWithSystemTenantScope('ana-run-control:session-end', async () => {
            // tenant-isolation-safe: one person's runs in every organisation they belong to — a person's session (sign-out, a password change, a deactivation) is the account's, not one tenant's (AnA detach §2.9); keyed on user_id and never on an organisation the caller chose.
            const { rows } = await pool.query(
              `UPDATE ana_runs
                  SET status = 'cancelled', stopped_reason = $3, stopped_detail = $4::jsonb,
                      finished_at = now(), updated_at = now(), hold = NULL
                WHERE user_id = $1
                  AND status IN ('running','paused','awaiting_approval')
                  AND ($2::text IS NULL OR started_session_id = $2)
                RETURNING id, organization_id`,
              [user, session, reason, stoppedDetail],
            );
            return rowsStopped(rows);
          });
    const ids = stopped.map(r => r.id);
    if (ids.length === 0) return [];
    for (const id of ids) driveLocalRun(id, 'cancelled', reason, detail);
    await runWithSystemTenantScope('ana-run-control:notify-session-end', () =>
      pool.query(`SELECT pg_notify($1, id) FROM unnest($2::text[]) AS id`, [RUN_CONTROL_CHANNEL, ids]),
    ).catch(err => log.warn(`[ana-run-control] pg_notify of stopped runs failed: ${err?.message}`));
    await recordRunsEndedWithSession(stopped, user, detail);
    log.info(`[ana-run-control] stopped ${ids.length} live run(s): ${reason} (${detail.cause})`);
    return ids;
  } catch (err: any) {
    log.error(`[ana-run-control] stopping runs (${reason}, ${detail.cause}) failed: ${err?.message}`);
    return [];
  }
}

function rowsStopped(rows: Array<{ id: unknown; organization_id: unknown }> | undefined): Array<{ id: string; organizationId: number }> {
  return (rows ?? []).map(r => ({ id: String(r.id), organizationId: Number(r.organization_id) }));
}

/**
 * The ledger's link from the act that ended a session to the AnA work it
 * ended (DT3 review): one chained audit row per organisation, in that
 * organisation's scope. Its outcome is checked and a lost row is logged at
 * error level; the stop itself has already happened and is not undone.
 */
async function recordRunsEndedWithSession(
  stopped: ReadonlyArray<{ id: string; organizationId: number }>,
  userId: number | null,
  detail: SessionEndDetail,
): Promise<void> {
  const byOrg = new Map<number, string[]>();
  for (const r of stopped) byOrg.set(r.organizationId, [...(byOrg.get(r.organizationId) ?? []), r.id]);
  const { default: auditService } = await import('../auditService.js');
  for (const [organizationId, runIds] of byOrg) {
    const audit = await inRunTenant(organizationId, 'ana-run-control:session-end-audit', () =>
      auditService.logAction({
        tenantId: organizationId,
        userId: detail.byUserId ?? userId ?? undefined,
        action: 'ana.runs.ended_with_session',
        resourceType: 'ana_run',
        resourceId: runIds[0],
        details: { cause: detail.cause, byUserId: detail.byUserId ?? null, ownerUserId: userId, stoppedReason: 'session_ended', runIds },
      }),
    ).catch((err: any) => ({ persisted: false, chained: false, error: err?.message }));
    if (!audit.persisted || !audit.chained) {
      log.error(
        `[ana-run-control] ${runIds.length} run(s) of org ${organizationId} stopped (${detail.cause}) but the audit row was not written: ${'error' in audit ? audit.error : 'not chained'}`,
      );
    }
  }
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
async function notifyAndDrive(
  pool: RunControlQuery,
  runId: string,
  status: RunStatus,
  reason?: RunStoppedReason | null,
): Promise<void> {
  // Same-instance first: almost all control is local, and waiting for the
  // round-trip would add latency to the common case for no reason.
  driveLocalRun(runId, status, reason);
  await pool
    .query(`SELECT pg_notify($1, $2)`, [RUN_CONTROL_CHANNEL, runId])
    .catch(err => log.warn(`[ana-run-control] pg_notify failed for ${runId}: ${err?.message}`));
}

/** Wake each run's owner, wherever it is: one statement, one notification per run. */
async function notifyRuns(pool: RunControlQuery, runIds: string[]): Promise<void> {
  if (runIds.length === 0) return;
  for (const id of runIds) driveLocalRun(id, 'failed', 'orphaned');
  await runWithSystemTenantScope('ana-run-control:notify-reaped', () =>
    pool.query(`SELECT pg_notify($1, id) FROM unnest($2::text[]) AS id`, [RUN_CONTROL_CHANNEL, runIds]),
  ).catch(err => log.warn(`[ana-run-control] pg_notify of reaped runs failed: ${err?.message}`));
}

/** Only pending sweeps are shared, independently by pool and effective SQL cutoff. */
const orphanSweeps = new WeakMap<Pool, Map<number, Promise<number>>>();

/**
 * Fail every live run this process no longer heartbeats.
 *
 * A restart leaves rows saying `running` with nobody executing them. Reporting
 * those as live is the lie `check_deep_investigation` already refuses to tell;
 * this is the same refusal for chat runs.
 *
 * AnA detach DT1 (§2.4) adds, with the statement and threshold unchanged:
 *   - each reaped run is notified, so an owner that is alive but partitioned
 *     learns its row ended (acting on it is DT3's);
 *   - the mirror sweep (sweepRunEvents), at most once per REAP_SWEEP_MS per
 *     process: the rows of runs whose record exists go through the release
 *     door, and those of runs that ended with no record through the expiry
 *     door once past retention.
 * Returns how many runs it failed.
 */
export async function reapOrphanedRuns(pool: Pool, staleAfterMs = STALE_AFTER_MS): Promise<number> {
  const seconds = Math.round(staleAfterMs / 1000);
  const pending = orphanSweeps.get(pool) ?? new Map<number, Promise<number>>();
  orphanSweeps.set(pool, pending);
  const existing = pending.get(seconds);
  if (existing) return existing;
  // System scope, explicitly. This sweep is estate-wide by design — the runs
  // that most need reaping belong to an instance that is gone — and it is
  // called opportunistically from inside a request, whose tenant scope would
  // silently reduce it to that one org and return a reassuring small number.
  // Register admission before invoking the pool, including a reentrant or
  // synchronous failure. Settlement always admits the next fresh sweep. The
  // whole pass is shared: the reap, the wake-up of each reaped run's owner, and
  // (AnA detach DT1) the throttled mirror sweep.
  const sweep = Promise.resolve()
    .then(() => runWithSystemTenantScope('ana-run-control:reap', () =>
      pool.query(
      `UPDATE ana_runs
       SET status = 'failed', stopped_reason = 'orphaned', finished_at = now(), updated_at = now()
       WHERE status IN ('running','paused','awaiting_approval')
         AND heartbeat_at < now() - make_interval(secs => $1)
       RETURNING id`,
        [seconds],
      ),
    ))
    .then(async ({ rows, rowCount }) => {
      const reaped = (rows ?? []).map((r: { id: string }) => r.id);
      await notifyRuns(pool, reaped);
      if (Date.now() - lastEventSweepAt >= REAP_SWEEP_MS) {
        lastEventSweepAt = Date.now();
        await sweepRunEvents(pool).catch(err =>
          log.error(`[ana-run-control] run-event sweep failed: ${err?.message}`),
        );
      }
      // rowCount where the driver reports it; PGlite does not, and the rows are the count.
      return rowCount ?? reaped.length;
    })
    .finally(() => {
      pending.delete(seconds);
      if (pending.size === 0) orphanSweeps.delete(pool);
    });
  pending.set(seconds, sweep);
  return sweep;
}

/** How often, per process, the reaper also sweeps the mirror, and the read routes may reap. */
export const REAP_SWEEP_MS = 30_000;
let lastEventSweepAt = 0;
let lastRouteReapAt = 0;

/**
 * The reaper as the run read routes call it (§3.7): at most once per
 * REAP_SWEEP_MS per process, and never failing the read. Returns how many runs
 * it failed, 0 when throttled.
 */
export async function reapOrphanedRunsThrottled(pool: Pool): Promise<number> {
  if (Date.now() - lastRouteReapAt < REAP_SWEEP_MS) return 0;
  lastRouteReapAt = Date.now();
  return reapOrphanedRuns(pool).catch(err => {
    log.error(`[ana-run-control] reaper (read route) failed: ${err?.message}`);
    return 0;
  });
}

/**
 * The reaper's mirror pass. Finding the rows is estate-wide (system scope);
 * each door is then called in the run's own tenant scope, which the release
 * door requires (run-events.ts). Bounded per pass; the next pass takes the rest.
 */
async function sweepRunEvents(pool: Pool): Promise<void> {
  const { rows: sealed } = await runWithSystemTenantScope('ana-run-control:release-sweep', () =>
    pool.query(
      `SELECT DISTINCT e.organization_id, e.run_id
         FROM ana_run_events e
        WHERE EXISTS (SELECT 1 FROM ana_turn_records t
                       WHERE t.organization_id = e.organization_id AND t.run_id = e.run_id)
        LIMIT 100`,
    ),
  );
  for (const r of sealed) await releaseSealedRunEvents(pool, Number(r.organization_id), String(r.run_id));

  const { rows: expiring } = await runWithSystemTenantScope('ana-run-control:expiry-sweep', () =>
    pool.query(
      `SELECT DISTINCT organization_id FROM ana_run_events
        WHERE written_at < now() - make_interval(days => $1)
        LIMIT 100`,
      [RUN_EVENTS_RETENTION_DAYS],
    ),
  );
  for (const r of expiring) await expireOrphanedRunEvents(pool, Number(r.organization_id));
}

// ─────────────────────────────────────────────────────────────────────────────
// The process heartbeat (AnA detach §2.3)
// ─────────────────────────────────────────────────────────────────────────────

/** One beat per process for every run it owns; today's keepalive interval. */
export const RUN_HEARTBEAT_MS = 15_000;
let heartbeatTimer: NodeJS.Timeout | null = null;
let heartbeatPool: RunControlQuery | null = null;

/**
 * Arm the process heartbeat. Idempotent; called by every beginRun, idle while
 * this process owns no run.
 *
 * It used to ride the SSE keepalive, which is cleared when the socket closes —
 * so a run's heartbeat depended on a page staying open. It now depends on the
 * process alone, which is what the reaper's staleness actually asks about.
 */
function armRunHeartbeat(pool: RunControlQuery): void {
  heartbeatPool = pool;
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    void beatOwnedRuns();
  }, RUN_HEARTBEAT_MS);
  heartbeatTimer.unref?.();
}

/**
 * Beat every run this process owns, with its timeline high-water mark.
 *
 * System scope per firing, never the context that armed the timer (the first
 * turn after boot's tenant), or RLS would hide every other tenant's run and
 * they would be reaped while alive. `owner_instance` in SQL: a process can
 * never beat another's run back to life. Returns the rows it beat.
 */
export async function beatOwnedRuns(): Promise<number> {
  const pool = heartbeatPool;
  if (!pool || localRuns.size === 0) return 0;
  const ids = [...localRuns.keys()];
  const seqs = ids.map(id => localRuns.get(id)?.timelineSeq ?? 0);
  try {
    const { rowCount } = await runWithSystemTenantScope('ana-run-control:heartbeat', () =>
      pool.query(
        `UPDATE ana_runs AS r
            SET heartbeat_at = now(), timeline_seq = GREATEST(r.timeline_seq, v.seq)
           FROM unnest($1::text[], $2::int[]) AS v(id, seq)
          WHERE r.id = v.id
            AND r.owner_instance = $3
            AND r.status IN ('running','paused','awaiting_approval')`,
        [ids, seqs, INSTANCE_ID],
      ),
    );
    return rowCount ?? 0;
  } catch (err: any) {
    // Logged, never thrown: a missed beat is retried in RUN_HEARTBEAT_MS, and
    // five minutes of them is what the reaper reads as a dead owner.
    log.error(`[ana-run-control] process heartbeat failed for ${ids.length} run(s): ${err?.message}`);
    return 0;
  }
}

function stopRunHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Restart honesty (AnA detach §7, DT3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * End every run this process owns, honestly, BEFORE the drain (§7): write
 * `failed`/`server_shutdown` on each owned live row, in that run's own tenant
 * scope, then abort each with RunStopped('server_shutdown'). The turns then
 * unwind inside the drain: a turn that was about to finish records
 * `stopped`/`server_shutdown`, matching its row, never `answered`. A turn
 * that cannot finish in the window leaves its row terminal and its mirrored
 * steps kept. Returns the runs it ended.
 */
export async function settleOwnedRunsForShutdown(pool: Pool): Promise<string[]> {
  const byOrg = new Map<number, string[]>();
  for (const [id, local] of localRuns) {
    const ids = byOrg.get(local.organizationId) ?? [];
    ids.push(id);
    byOrg.set(local.organizationId, ids);
  }
  const ended: string[] = [];
  for (const [org, ids] of byOrg) {
    try {
      const { rows } = await inRunTenant(org, 'ana-run-control:shutdown', () =>
        pool.query(
          `UPDATE ana_runs
              SET status = 'failed', stopped_reason = 'server_shutdown', finished_at = now(), updated_at = now(), hold = NULL
            WHERE id = ANY($1::text[]) AND owner_instance = $2 AND status IN ('running','paused','awaiting_approval')
            RETURNING id`,
          [ids, INSTANCE_ID],
        ),
      );
      for (const r of rows ?? []) ended.push(String(r.id));
    } catch (err: any) {
      // The rows stay live and the reaper ends them as orphaned; the turns are
      // still stopped below, so nothing runs past the process.
      log.error(`[ana-run-control] shutdown could not end ${ids.length} run(s) of org ${org}: ${err?.message}`);
    }
    for (const id of ids) driveLocalRun(id, 'failed', 'server_shutdown');
  }
  if (ended.length > 0) log.info(`[ana-run-control] shutdown ended ${ended.length} live run(s) as server_shutdown`);
  return ended;
}

/**
 * Stop every run this process owns, locally, with RunStopped('server_shutdown'),
 * writing nothing (DT3 review, INF-41): the shutdown's deadline passed before
 * settleOwnedRunsForShutdown's writes came back. Nothing runs past the
 * process; a row left live is ended by the reaper as `orphaned`. Returns how
 * many it stopped.
 */
export function abortOwnedRunsForShutdown(): number {
  let stopped = 0;
  for (const [id, local] of localRuns) {
    if (local.controller.signal.aborted) continue;
    driveLocalRun(id, 'failed', 'server_shutdown');
    stopped += 1;
  }
  return stopped;
}

/** This process's `owner_instance`, for a test that must write as another instance would not. */
export function runOwnerInstance(): string {
  return INSTANCE_ID;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-instance delivery
// ─────────────────────────────────────────────────────────────────────────────

let listenerStarted = false;
let listenerGeneration = 0;
let pollTimer: NodeJS.Timeout | null = null;
/**
 * The dedicated LISTEN connection, held for the life of the process. Kept so it
 * can be RETURNED: a checked-out client is one `pool.end()` waits on forever, so
 * without `stopRunControlListener` a graceful shutdown after the first AnA turn
 * never reached `process.exit` and the deploy's SIGTERM ended in a SIGKILL.
 */
let listenerClient: PoolClient | null = null;

function isCurrentListener(generation: number): boolean {
  return listenerStarted && listenerGeneration === generation;
}

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
  const generation = ++listenerGeneration;
  // Admission belongs to this listener lifetime, independently for each run.
  const pendingRefreshes = new Map<string, { dirty: boolean }>();

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
    if (!isCurrentListener(generation)) {
      // Stopped while the connection was opening — shutdown got here first.
      client.release(true);
      return;
    }
    listenerClient = client;
    client.on('notification', msg => {
      if (!isCurrentListener(generation) || listenerClient !== client) return;
      if (msg.channel !== RUN_CONTROL_CHANNEL || !msg.payload) return;
      void refreshFromRow(pool, msg.payload, generation, pendingRefreshes);
    });
    client.on('error', err => {
      if (!isCurrentListener(generation) || listenerClient !== client) return;
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
      startPollFallback(pool, generation);
    });
    await client.query(`LISTEN ${RUN_CONTROL_CHANNEL}`);
    if (isCurrentListener(generation) && listenerClient === client) {
      log.info('[ana-run-control] listening for cross-instance control');
    }
  } catch (err: any) {
    // A stopped listener's failure must not release the restarted client's
    // connection or rearm its old pool's fallback.
    if (!isCurrentListener(generation)) return;
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
    startPollFallback(pool, generation);
  }
}

function startPollFallback(pool: Pool, generation: number): void {
  if (pollTimer || !isCurrentListener(generation)) return;
  // A slow database must not accumulate a new control read every two seconds.
  // This admission belongs to one listener lifetime; an old read settling
  // after restart cannot admit work into the new lifetime.
  let inFlight = false;
  const poll = async () => {
    if (!isCurrentListener(generation) || inFlight || localRuns.size === 0) return;
    inFlight = true;
    // Scoped per firing, not per arming. A setInterval callback inherits the
    // context the timer was CREATED in, which here is whichever request first
    // failed to open a listener — so without this the poller would ask about
    // every run this process owns while pinned to one tenant, and quietly see
    // none of the others.
    try {
      const { rows } = await runWithSystemTenantScope('ana-run-control:poll', () =>
        pool.query(`SELECT id, status, stopped_reason, stopped_detail FROM ana_runs WHERE id = ANY($1::text[])`, [
          [...localRuns.keys()],
        ]),
      );
      if (isCurrentListener(generation)) {
        for (const r of rows) {
          driveLocalRun(r.id, r.status as RunStatus, (r.stopped_reason as RunStoppedReason) ?? null, sessionEndDetailOf(r.stopped_detail));
        }
      }
      // Not swallowed. This is the path that is ALLOWED to be the only one that
      // works, so a failure here is control silently not arriving — the exact
      // thing the durable record was built to stop being possible.
    } catch (err: any) {
      log.error(`[ana-run-control] poll fallback query failed: ${err?.message}`);
    } finally {
      inFlight = false;
    }
  };
  pollTimer = setInterval(() => { void poll(); }, POLL_FALLBACK_MS);
  pollTimer.unref?.();
}

async function refreshFromRow(
  pool: Pool,
  runId: string,
  generation: number,
  pendingRefreshes: Map<string, { dirty: boolean }>,
): Promise<void> {
  if (!isCurrentListener(generation) || !localRuns.has(runId)) return;
  const pending = pendingRefreshes.get(runId);
  if (pending) {
    // Do not drop a newer Stop behind a read that already observed running.
    pending.dirty = true;
    return;
  }
  const refresh = { dirty: false };
  pendingRefreshes.set(runId, refresh);
  // The notification carries a run id and no tenant, and this callback runs in
  // the LISTEN socket's creation context rather than the notifying request's —
  // so it opens its own system scope rather than inheriting a stale one.
  try {
    do {
      refresh.dirty = false;
      const state = await runWithSystemTenantScope('ana-run-control:notify', () =>
        readRunState(pool, runId),
      ).catch(err => {
        log.error(`[ana-run-control] notify refresh failed for ${runId}: ${err?.message}`);
        return null;
      });
      if (state && isCurrentListener(generation)) driveLocalRun(runId, state.status, state.stoppedReason, state.detail);
    } while (refresh.dirty && isCurrentListener(generation) && localRuns.has(runId));
  } finally {
    pendingRefreshes.delete(runId);
  }
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
  stopRunHeartbeat();
  listenerStarted = false;
  listenerGeneration += 1;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  const client = listenerClient;
  listenerClient = null;
  client?.release(true);
}

/** Test seam: forget this process's local runs and stop delivery. */
export function _resetLocalRunsForTest(): void {
  localRuns.clear();
  stopRunControlListener();
  heartbeatPool = null;
  lastEventSweepAt = 0;
  lastRouteReapAt = 0;
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
    .query(`UPDATE ana_runs SET status = 'running', hold = NULL, updated_at = now() WHERE id = $1 AND status = 'paused'`, [
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
export async function holdForPerson(
  pool: RunControlQuery,
  runId: string,
  next: string[] = [],
): Promise<boolean> {
  // The hold is written with the pause, so a follower never reads a Manual
  // hold as a person's pause (AnA detach DT3: "Run this step / Do this
  // instead" on another device). It is cleared when the hold is left.
  const { rowCount } = await pool.query(
    `UPDATE ana_runs SET status = 'paused', hold = $2::jsonb, updated_at = now() WHERE id = $1 AND status = 'running'`,
    [runId, JSON.stringify({ reason: 'manual', next })],
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
     SET status = 'finished', stopped_reason = 'hold_expired', finished_at = now(), updated_at = now(), hold = NULL
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
  /**
   * The check of the prose this proposal would store, against what AnA
   * consulted before she wrote it (proposal-check.ts): shown in the sign-off
   * dialog, and named on the sign-off audit row (governedActionTrace). Absent
   * when the proposal stores no prose.
   */
  check?: AnswerCheck;
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

/**
 * What the run is waiting on, if anything — for the person who asked.
 *
 * Scoped to the asker in the SQL (`user_id = $3`), not only to the org. Scoped
 * to the org alone, any member who knew a run's id and toolUseId could read the
 * held action and then approve or decline it: the same seizure `applyControl`
 * refuses as NOT_YOURS, through the one door it did not cover. NULL = n is never
 * true, so a run with no owner (a non-interactive surface) is held for no one.
 * There is no admin override. A caller that needs to tell "held for someone
 * else" from "nothing held" asks isRunAwaitingApproval, which returns no payload.
 */
export async function readPendingApproval(
  pool: RunControlQuery,
  runId: string,
  organizationId: number,
  userId: number,
): Promise<PendingToolApproval | null> {
  const { rows } = await pool.query(
    `SELECT pending_approval FROM ana_runs
     WHERE id = $1 AND organization_id = $2 AND user_id = $3 AND status = 'awaiting_approval'`,
    [runId, organizationId, userId],
  );
  return (rows[0]?.pending_approval as PendingToolApproval) ?? null;
}

// The claim on a held approval (DT3 review 4.3) lives in run-approval-claim.ts,
// re-exported here with the rest of the approval this module holds.
export { approvalClaimed, claimApproval, releaseApprovalClaim, type ApprovalClaim } from './run-approval-claim.js';

/**
 * Whether a run of this org is waiting on an approval, whoever asked. Only for
 * choosing the refusal — 403 for a colleague, 404 for nothing to decide — once
 * readPendingApproval has already refused; it returns nothing that was held.
 */
export async function isRunAwaitingApproval(
  pool: RunControlQuery,
  runId: string,
  organizationId: number,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM ana_runs
     WHERE id = $1 AND organization_id = $2 AND status = 'awaiting_approval'`,
    [runId, organizationId],
  );
  return rows.length > 0;
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
 *
 * Guarded on the ASKER as well (`user_id = byUserId`): a person decides only a
 * run they started. The org predicate alone let any member of the tenant who
 * knew the toolUseId approve or decline a colleague's held step. NULL = n is
 * never true, so a run with no owner is decided by no person, and there is no
 * admin override.
 *
 * The one decision with no person behind it is the stream's own approval
 * window closing (`byUserId: null`). That may only DENY — it runs nothing — so
 * an approval with no decider matches no row, rather than skipping the owner
 * predicate.
 */
export async function recordApprovalDecision(
  pool: RunControlQuery,
  runId: string,
  organizationId: number,
  decision: ApprovalDecision,
): Promise<boolean> {
  const byPerson = decision.byUserId !== null;
  if (!byPerson && decision.decided !== 'denied') return false;
  const params: unknown[] = [runId, JSON.stringify(decision), decision.toolUseId, organizationId];
  // $5 is the decider, or NULL for the approval window closing (deny only, above).
  params.push(byPerson ? decision.byUserId : null);
  // The window's deny never takes an approval its person has claimed (DT3
  // review, 4.3): the governed-action route is carrying it out under their
  // signature, and its decision is the one this run will record.
  const { rowCount } = await pool.query(
    `UPDATE ana_runs
     SET status = 'running',
         approval_decision = $2::jsonb,
         pending_approval = NULL,
         updated_at = now()
     WHERE id = $1
       AND organization_id = $4
       AND ($5::integer IS NULL OR user_id = $5)
       AND ($5::integer IS NOT NULL OR pending_approval ->> 'claimedAt' IS NULL)
       AND status = 'awaiting_approval'
       AND pending_approval ->> 'toolUseId' = $3`,
    params,
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
