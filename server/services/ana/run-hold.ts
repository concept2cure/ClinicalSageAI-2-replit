/**
 * The round-boundary hold — where a live AnA turn waits while it is paused.
 *
 * ── Where this came from ─────────────────────────────────────────────────────
 * This is the while-paused loop of the stream's checkpoint
 * (routes/ana-ri/stream.ts), MOVED here, not copied: the stream now calls
 * {@link createRunHold} and has no wait loop of its own (row 74, slice S3).
 * With expiry 'resume' it is that loop, unchanged:
 *
 *   - status is read from the ROW each time (run-control.ts: the process
 *     holds no status), and a wait is woken by the control write, with a
 *     ceiling only so a missed wake cannot stall it;
 *   - the first waiter to see 'paused' announces {type:'paused', round}; the
 *     one that sees 'running' again announces {type:'resumed', round};
 *   - a dropped client stops the run (client_disconnected);
 *   - a pause that outlives the ceiling is resumed as abandoned — a server
 *     decision, recorded as one — measured from when the hold was entered,
 *     before the first read, exactly as the stream's `pauseStart` was.
 *
 * ── Why it moved ─────────────────────────────────────────────────────────────
 * One turn will hold in more than one place at once: the parent at its round
 * boundary and each sub-agent at its own (a later slice). Waiters that each
 * kept their own copy of that loop would disagree: every one would start its
 * own ten-minute clock, announce its own paused frame and count its own held
 * time. So the state is the HOLD's, shared by every waiter of the turn:
 *
 *   - one pause clock, opened by the first waiter that sees 'paused' (at the
 *     moment it entered) and closed by the first that sees it leave — or,
 *     if the run is still paused, by the last waiter to go (its own signal, a
 *     dropped client, an error): nobody is holding then, so nothing is being
 *     held, and the next hold starts its own clock as the stream's per-call
 *     `pauseStart` did;
 *   - one paused/resumed frame pair;
 *   - {@link RunHold.heldMs} is the union of the paused intervals, not a sum
 *     over waiters;
 *   - the abandoned-pause resume (or the end) runs once per pause.
 *
 * A waiter may bring its own signal: when it aborts, that waiter returns
 * 'cancelled' at once and the others keep waiting.
 *
 * A failure is thrown, never read as an answer: a wake that rejects leaves
 * the hold as `await runHandle.wake()` left the checkpoint, and a failed end
 * write (expiry 'end') is thrown rather than taken for a Continue that won.
 *
 * ── expiry 'end' ─────────────────────────────────────────────────────────────
 * For a turn whose person asked to be asked (Manual, a later slice), a hold
 * nobody answers must END the turn: resuming it would carry on unattended,
 * which is exactly what they asked not to happen ("Manual silently becomes
 * Auto"). So 'end' never resumes. At the ceiling it calls `endHeld` (a
 * guarded paused→finished write); if that wrote, the hold is expired for the
 * whole turn — every waiter returns 'expired', {@link RunHold.expiredSignal}
 * aborts, and one {type:'hold_expired'} frame is sent. If it wrote nothing, a
 * Continue got there first: re-read and carry on. Nothing in S3 asks for 'end'.
 *
 * Pure: every effect is an injected dependency, so it is tested without a
 * database (run-hold.test.ts).
 *
 * @module server/services/ana/run-hold
 */

import type { RunStatus } from './run-status.js';
import { MAX_PAUSE_MS } from './run-status.js';

/** The longest one wait lasts before the row is read again, if no wake arrives. */
export const RUN_HOLD_WAKE_CEILING_MS = 5_000;

/** What a waiter is told when it stops waiting. */
export type RunHoldOutcome = 'running' | 'cancelled' | 'expired' | 'disconnected';

/**
 * Said on the paused frame by the waiter that announces it. Absent, the frame
 * is today's {type:'paused', round}.
 */
export interface RunHoldAnnounce {
  reason: 'manual' | 'person';
  /** The steps waiting to run (Manual only). */
  next?: string[];
}

interface RunHoldCommonDeps {
  /** The run's status as the ROW has it (null when the row is gone). */
  readStatus(): Promise<RunStatus | null>;
  /** Resolves on a change to the run, or after `ms`. */
  wake(ms: number): Promise<void>;
  /** Send a control frame to the client. */
  emit(frame: Record<string, unknown>): void;
  /** Whether the client has gone. */
  clientGone(): boolean;
  /** Stop the run because the client went (not a person's decision). */
  stopForDisconnect(): Promise<void>;
  now?: () => number;
  maxPauseMs?: number;
}

export type RunHoldDeps = RunHoldCommonDeps &
  (
    | {
        /** At the ceiling, resume the run as abandoned and carry on (today). */
        expiry: 'resume';
        resumeAbandoned(): Promise<void>;
      }
    | {
        /** At the ceiling, end the turn. Never resumes. */
        expiry: 'end';
        /** paused→finished, guarded; false when the run had already left 'paused'. */
        endHeld(): Promise<boolean>;
      }
  );

export interface RunHold {
  /**
   * Wait while the run is paused. Returns 'running' when the turn may go on
   * (resumed, never paused, or ended some way that is not a cancel),
   * 'cancelled' when the run was cancelled or this waiter's signal aborted,
   * 'disconnected' when the client went, and 'expired' when an 'end' hold ran
   * out — for every waiter, from then on.
   */
  hold(round: number, announce?: RunHoldAnnounce, signal?: AbortSignal): Promise<RunHoldOutcome>;
  /** True once an 'end' hold has expired. */
  expired(): boolean;
  /** Aborted when an 'end' hold expires. */
  readonly expiredSignal: AbortSignal;
  /** Time the run has spent paused while anyone was holding, as one union of intervals. */
  heldMs(): number;
}

/** One pause, shared by everyone waiting on it. */
interface PauseInterval {
  start: number;
  /** The frame that announced it, repeated if it expires. */
  announced?: { round: number; next?: string[] };
  /** The one abandoned-pause resume (expiry 'resume'). */
  resuming?: Promise<void>;
  /** The one end attempt in flight (expiry 'end'). */
  ending?: Promise<boolean>;
}

/** What happened at the ceiling. */
type DeadlineOutcome = 'running' | 'expired' | 'reread';

/** A read of the row, with what the hold looked like when it was issued. */
interface RowRead {
  status: RunStatus | null;
  /** Pauses closed when the read was issued: a 'paused' older than a close may be stale. */
  mark: number;
  /** When it was issued: a pause first seen by this read is timed from here. */
  at: number;
}

/** One turn's hold. Public members are arrow properties, so they survive being passed around. */
class TurnHold implements RunHold {
  private readonly now: () => number;
  private readonly maxPauseMs: number;
  private readonly expiredCtl = new AbortController();
  private current: PauseInterval | null = null;
  private closes = 0;
  private closedMs = 0;
  /** Waiters inside hold() now. */
  private waiters = 0;
  private announced = false;
  private isExpired = false;

  constructor(private readonly deps: RunHoldDeps) {
    this.now = deps.now ?? Date.now;
    this.maxPauseMs = deps.maxPauseMs ?? MAX_PAUSE_MS;
  }

  get expiredSignal(): AbortSignal {
    return this.expiredCtl.signal;
  }

  readonly expired = (): boolean => this.isExpired;

  readonly heldMs = (): number => this.closedMs + (this.current ? this.now() - this.current.start : 0);

  readonly hold = async (round: number, announce?: RunHoldAnnounce, signal?: AbortSignal): Promise<RunHoldOutcome> => {
    if (this.isExpired) return 'expired';
    if (signal?.aborted) return 'cancelled';
    this.waiters++;
    try {
      return await this.waitWhilePaused(round, announce, signal);
    } finally {
      // The last waiter out stops the clock, however it left: nobody is holding now.
      if (--this.waiters === 0 && this.current) this.closePause(this.current);
    }
  };

  private async waitWhilePaused(round: number, announce?: RunHoldAnnounce, signal?: AbortSignal): Promise<RunHoldOutcome> {
    // Issued before the first read: a pause this waiter opens is timed from
    // here, as the stream's pauseStart was.
    let seen = await this.read();
    let endDue = true;
    while (seen.status === 'paused') {
      if (this.isExpired) return 'expired';
      if (seen.mark !== this.closes) {
        // Another waiter saw the last pause end after this read was issued.
        // Read again before announcing anything.
        seen = await this.read();
        continue;
      }
      const pause = (this.current ??= { start: seen.at });
      this.announcePaused(pause, round, announce);
      if (this.deps.clientGone()) {
        await this.deps.stopForDisconnect();
        return 'disconnected';
      }
      if (endDue && this.now() - pause.start > this.maxPauseMs) {
        const outcome = await this.atDeadline(pause, round);
        if (outcome !== 'reread') return outcome === 'expired' ? 'expired' : this.leave('running', round);
        endDue = false; // a Continue won: wait once before trying again
      } else {
        endDue = true;
        if ((await this.waitForChange(signal)) === 'aborted') return 'cancelled';
      }
      seen = await this.read();
    }
    return this.leave(seen.status, round);
  }

  private async read(): Promise<RowRead> {
    const mark = this.closes;
    const at = this.now();
    return { status: await this.deps.readStatus(), mark, at };
  }

  private closePause(pause: PauseInterval): void {
    if (this.current !== pause) return;
    this.closedMs += this.now() - pause.start;
    this.current = null;
    this.closes++;
  }

  private announcePaused(pause: PauseInterval, round: number, announce?: RunHoldAnnounce): void {
    if (this.announced) return;
    this.announced = true;
    const next = announce?.next ? { next: announce.next } : {};
    pause.announced = { round, ...next };
    this.deps.emit({ type: 'paused', round, ...(announce ? { reason: announce.reason } : {}), ...next });
  }

  /** Leave the hold: close the pause if it is still open, and announce the resume. */
  private leave(status: RunStatus | null, round: number): RunHoldOutcome {
    if (this.isExpired) return 'expired';
    if (this.current) this.closePause(this.current);
    if (this.announced && status === 'running') {
      this.deps.emit({ type: 'resumed', round });
      this.announced = false;
    }
    return status === 'cancelled' ? 'cancelled' : 'running';
  }

  /** The ceiling was reached: resume as abandoned, or try to end the turn. Once per pause. */
  private async atDeadline(pause: PauseInterval, round: number): Promise<DeadlineOutcome> {
    const deps = this.deps;
    if (deps.expiry === 'resume') {
      pause.resuming ??= deps.resumeAbandoned();
      await pause.resuming;
      return 'running';
    }
    pause.ending ??= deps.endHeld();
    if (await pause.ending) {
      this.expire(pause, round);
      return 'expired';
    }
    // A Continue won the race: the next attempt, if one is due, is a new write.
    pause.ending = undefined;
    return 'reread';
  }

  private expire(pause: PauseInterval, round: number): void {
    if (this.isExpired) return;
    this.isExpired = true;
    this.closePause(pause);
    this.expiredCtl.abort();
    this.deps.emit({ type: 'hold_expired', ...(pause.announced ?? { round }) });
  }

  /** One wait: the wake, this waiter's signal, or the turn-wide expiry, whichever comes first. */
  private waitForChange(signal?: AbortSignal): Promise<'woke' | 'aborted'> {
    if (signal?.aborted) return Promise.resolve('aborted');
    const expiredSignal = this.expiredCtl.signal;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        expiredSignal.removeEventListener('abort', onWake);
      };
      const onAbort = () => {
        cleanup();
        resolve('aborted');
      };
      const onWake = () => {
        cleanup();
        resolve('woke');
      };
      const onWakeFailed = (err: unknown) => {
        cleanup();
        reject(err);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      // An expiry wakes every waiter at once; each then reads it and returns 'expired'.
      expiredSignal.addEventListener('abort', onWake, { once: true });
      // A wake that fails is thrown, as the stream's `await runHandle.wake()` threw.
      void this.deps.wake(RUN_HOLD_WAKE_CEILING_MS).then(onWake, onWakeFailed);
    });
  }
}

/** One hold per turn, shared by everything that waits at a round boundary in it. */
export function createRunHold(deps: RunHoldDeps): RunHold {
  return new TurnHold(deps);
}
