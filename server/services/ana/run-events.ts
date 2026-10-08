/**
 * The live mirror of a turn's timeline: public.ana_run_events (AnA detach,
 * slice DT1; docs/design/ANA_DETACH_2026-10-08.md §3).
 *
 * ── One producer, a third sink ───────────────────────────────────────────────
 * `TurnTimeline.emitTimeline` stays the one producer. It appends each event to
 * the recorder, writes it as a `timeline` frame, and enqueues it here. This
 * module only carries what it is handed to the table: it computes nothing, and
 * the rows are the events the record will seal (§3.4).
 *
 * ── The queue ────────────────────────────────────────────────────────────────
 * Per run, ordered, flushed every RUN_EVENTS_FLUSH_MS or once RUN_EVENTS_BATCH
 * events wait, with one batch in flight. A failed batch is retried after 250 ms
 * and after 1 s, then dropped and logged at error level; the run is not failed
 * for it. The gap is visible by `seq` and by `ana_runs.timeline_seq`, and the
 * record still carries every event.
 *
 * ── Owner only, and in the run's own tenant scope ────────────────────────────
 * The INSERT names `owner_instance` in SQL, so another process can never write
 * this run's rows. Every flush opens the run's tenant scope itself: a timer
 * callback runs in the context that CREATED the timer, which may be another
 * tenant's request, and under RLS_ENFORCE=on that context would write zero
 * rows and report nothing (§1 row 13, DT1 test 8).
 *
 * ── Flush, then seal, then release ───────────────────────────────────────────
 * The guard trigger refuses an insert once the run has a sealed record, so the
 * owner AWAITS `close()` before it writes the record (`sealAfterMirror`). A
 * close that could not write everything stamps `timeline_seq` past the last
 * row, which marks the gap, and the record is sealed anyway: a record is never
 * withheld for a mirror. After the record, the rows go through the release
 * door, and `released_at` is written whatever came of the record.
 *
 * ── The cap ──────────────────────────────────────────────────────────────────
 * Seq 1–1,999 are mirrored; seq 2,000 is the truncation marker; nothing after
 * it. The CHECK on the table makes 2,000 a database fact (§3.5).
 *
 * @module server/services/ana/run-events
 */

import { runWithTenantScope } from '../../db/tenantStore.js';
import { createScopedLogger } from '../../utils/logger';
import {
  MIRROR_EVENT_CAP,
  MIRROR_TRUNCATED_SEQ,
  type MirroredTimelineEvent,
  type TimelineEvent,
} from '@shared/ana/turn-timeline';

const log = createScopedLogger('ana-run-events');

/** Flush interval for a run's queue. */
export const RUN_EVENTS_FLUSH_MS = 250;
/** Queue length that flushes without waiting for the interval. */
export const RUN_EVENTS_BATCH = 20;
/** The waits before each retry of a failed batch; after the last, it is dropped. */
export const RUN_EVENTS_RETRY_MS: readonly number[] = [250, 1_000];
/**
 * D-4: mirror rows of a run that ended with no record are expired after this
 * many days. Recommended; the period is the founder's call. The expiry door
 * refuses anything younger than its own copy of this number.
 */
export const RUN_EVENTS_RETENTION_DAYS = 90;

/** The one method this module uses. A pg Pool satisfies it. */
export interface RunEventsQuery {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** What `close()` found. */
export interface MirrorCloseResult {
  /** The highest seq the owner emitted for this run (uncapped). */
  emitted: number;
  /** Rows this mirror wrote, as the database counted them. */
  written: number;
  /** Events dropped after their retries ran out. */
  dropped: number;
}

export interface RunEventsMirror {
  readonly runId: string;
  /** Queue one event the producer emitted. Never throws, never waits. */
  enqueue(event: TimelineEvent): void;
  /** Flush everything queued and stamp the high-water mark. Idempotent. */
  close(): Promise<MirrorCloseResult>;
  /** After the record write: the release door when it was recorded, then `released_at`. Idempotent. */
  release(recorded: boolean): Promise<void>;
}

export interface OpenRunEventsMirrorInput {
  pool: RunEventsQuery;
  runId: string;
  organizationId: number;
  /** ana_runs.owner_instance of the process writing; the INSERT is guarded on it. */
  ownerInstance: string;
  /** Told the high-water mark after each enqueue (the heartbeat carries it). */
  onSeq?: (seq: number) => void;
  /** Test seam: the waits, so a test can run them without a real clock. */
  timing?: { flushMs?: number; retryMs?: readonly number[] };
}

/** The run's own tenant scope, opened per call, never inherited (§3.4). */
function inRunScope<T>(organizationId: number, caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope({ tenantId: String(organizationId), role: null, source: 'job', caller }, fn);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });

const INSERT_EVENTS = `INSERT INTO ana_run_events (organization_id, run_id, seq, at, event)
SELECT r.organization_id, r.id, v.seq, v.at, v.event
  FROM ana_runs r, unnest($2::int[], $3::timestamptz[], $4::jsonb[]) AS v(seq, at, event)
 WHERE r.id = $1 AND r.organization_id = $5 AND r.owner_instance = $6
ON CONFLICT (run_id, seq) DO NOTHING`;

export function openRunEventsMirror(input: OpenRunEventsMirrorInput): RunEventsMirror {
  return new RunEventsQueue(input);
}

/** One run's ordered queue: one batch in flight, retried, then dropped (module docstring). */
class RunEventsQueue implements RunEventsMirror {
  readonly runId: string;
  private readonly queue: MirroredTimelineEvent[] = [];
  private readonly flushMs: number;
  private readonly retryMs: readonly number[];
  private emitted = 0;
  private written = 0;
  private dropped = 0;
  private truncated = false;
  private closed = false;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private closing: Promise<MirrorCloseResult> | null = null;
  private releasing: Promise<void> | null = null;

  constructor(private readonly input: OpenRunEventsMirrorInput) {
    this.runId = input.runId;
    this.flushMs = input.timing?.flushMs ?? RUN_EVENTS_FLUSH_MS;
    this.retryMs = input.timing?.retryMs ?? RUN_EVENTS_RETRY_MS;
  }

  enqueue(event: TimelineEvent): void {
    if (this.closed) return;
    this.emitted = Math.max(this.emitted, event.seq);
    try {
      this.input.onSeq?.(this.emitted);
    } catch {
      /* the heartbeat's copy of the mark is advisory */
    }
    if (event.seq > MIRROR_EVENT_CAP) {
      if (this.truncated) return;
      this.truncated = true;
      this.queue.push({ kind: 'truncated', seq: MIRROR_TRUNCATED_SEQ, at: event.at, round: event.round });
    } else {
      this.queue.push(event);
    }
    this.schedule(this.queue.length >= RUN_EVENTS_BATCH ? 0 : this.flushMs);
  }

  close(): Promise<MirrorCloseResult> {
    this.closed = true;
    this.closing ??= this.drainAndStamp();
    return this.closing;
  }

  release(recorded: boolean): Promise<void> {
    this.releasing ??= this.releaseOnce(recorded);
    return this.releasing;
  }

  private async drainAndStamp(): Promise<MirrorCloseResult> {
    this.clearTimer();
    // The batch in flight, then whatever is still queued.
    while (this.inFlight || this.queue.length > 0) await this.flush();
    // The high-water mark, exact at the end. Past the last row when a batch
    // was dropped, which is the gap a reader sees (§3.6).
    const { runId, organizationId, pool } = this.input;
    await inRunScope(organizationId, 'ana-run-events:close', () =>
      pool.query(
        `UPDATE ana_runs SET timeline_seq = GREATEST(timeline_seq, $3)
          WHERE id = $1 AND organization_id = $2`,
        [runId, organizationId, this.emitted],
      ),
    ).catch((err: any) => log.error(`[ana-run-events] could not stamp timeline_seq for ${runId}: ${err?.message}`));
    return { emitted: this.emitted, written: this.written, dropped: this.dropped };
  }

  private async releaseOnce(recorded: boolean): Promise<void> {
    const { runId, organizationId, pool } = this.input;
    if (recorded) await releaseSealedRunEvents(pool, organizationId, runId);
    await inRunScope(organizationId, 'ana-run-events:released', () =>
      pool.query(
        `UPDATE ana_runs SET released_at = now(), updated_at = now()
          WHERE id = $1 AND organization_id = $2 AND released_at IS NULL`,
        [runId, organizationId],
      ),
    ).catch((err: any) => log.error(`[ana-run-events] could not write released_at for ${runId}: ${err?.message}`));
  }

  /** Write what is queued now, one batch in flight; resolves when it is written or dropped. */
  private flush(): Promise<void> {
    this.clearTimer();
    if (this.inFlight) return this.inFlight;
    if (this.queue.length === 0) return Promise.resolve();
    const batch = this.queue.splice(0, this.queue.length);
    this.inFlight = this.writeBatch(batch).finally(() => {
      this.inFlight = null;
      // Events that arrived while the batch was in flight go next.
      if (this.queue.length > 0 && !this.closed) this.schedule(this.queue.length >= RUN_EVENTS_BATCH ? 0 : this.flushMs);
    });
    return this.inFlight;
  }

  private schedule(ms: number): void {
    if (this.timer || this.inFlight) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async writeBatch(batch: MirroredTimelineEvent[]): Promise<void> {
    const { runId, organizationId, ownerInstance, pool } = this.input;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await inRunScope(organizationId, 'ana-run-events:flush', () =>
          pool.query(INSERT_EVENTS, [
            runId,
            batch.map((e) => e.seq),
            batch.map((e) => e.at),
            batch.map((e) => JSON.stringify(e)),
            organizationId,
            ownerInstance,
          ]),
        );
        this.written += r.rowCount ?? 0;
        return;
      } catch (err: any) {
        if (attempt >= this.retryMs.length) {
          this.dropped += batch.length;
          log.error(
            `[ana-run-events] dropped seq ${batch[0].seq}–${batch[batch.length - 1].seq} of ${runId} after ${attempt + 1} attempts: ${err?.message}. ` +
              'The record keeps every event; the gap shows by seq and timeline_seq.',
          );
          return;
        }
        await sleep(this.retryMs[attempt]);
      }
    }
  }
}

/**
 * Flush, then seal, then release (§3.4): the order the guard trigger requires.
 * `write` is the record write; whatever it answers, the mirror is released.
 * With no mirror (a turn with no durable run), it is the write alone.
 */
export async function sealAfterMirror<T extends { status: string }>(
  mirror: RunEventsMirror | null | undefined,
  write: () => Promise<T>,
): Promise<T> {
  if (mirror) {
    // close() logs its own failures and resolves; a record is never withheld for a mirror.
    await mirror.close().catch(() => undefined);
  }
  const status = await write();
  if (mirror) await mirror.release(status.status === 'recorded').catch(() => undefined);
  return status;
}

/** A refusal the door raises on purpose, as opposed to a failure. */
const isLegalHold = (err: any) => String(err?.message ?? '').startsWith('RUN_EVENTS_LEGAL_HOLD');

/**
 * Door 1: delete a sealed run's rows, in the run's own scope. Null when the
 * door refused or failed (logged); the rows are then kept for the reaper's
 * pass, or, under a legal hold, for as long as the hold stands.
 */
export async function releaseSealedRunEvents(
  pool: RunEventsQuery,
  organizationId: number,
  runId: string,
): Promise<number | null> {
  try {
    const { rows } = await inRunScope(organizationId, 'ana-run-events:release', () =>
      pool.query('SELECT public.release_sealed_run_events($1, $2) AS n', [organizationId, runId]),
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err: any) {
    if (isLegalHold(err)) {
      log.warn(`[ana-run-events] ${runId} kept: organization ${organizationId} is under a legal hold.`);
    } else {
      log.error(`[ana-run-events] release of ${runId} failed: ${err?.message}`);
    }
    return null;
  }
}

/** Door 2: expire one organisation's rows of runs that ended with no record (D-4). */
export async function expireOrphanedRunEvents(
  pool: RunEventsQuery,
  organizationId: number,
  retentionDays = RUN_EVENTS_RETENTION_DAYS,
): Promise<number | null> {
  try {
    const { rows } = await inRunScope(organizationId, 'ana-run-events:expire', () =>
      pool.query(
        'SELECT public.expire_orphaned_run_events($1, now() - make_interval(days => $2)) AS n',
        [organizationId, retentionDays],
      ),
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err: any) {
    if (isLegalHold(err)) return null;
    log.error(`[ana-run-events] expiry for organization ${organizationId} failed: ${err?.message}`);
    return null;
  }
}
