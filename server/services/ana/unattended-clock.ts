/**
 * The owner's clock for a detached turn nobody is watching (AnA detach DT3,
 * docs/design/ANA_DETACH_2026-10-08.md §2.6, D-2).
 *
 * Armed when the page that started the turn closes and the turn goes on
 * (`detach`). From then on it reads the run row's `last_watched_at` — stamped
 * by the asker's own visible poll (routes/ana-ri/runs.ts) — and asks the one
 * function that says when an unwatched turn stops (shared/ana/run-detach.ts
 * unattendedDeadline): 15 minutes after watching stopped, never later than 40
 * minutes from the turn's start. A watch moves the deadline; the cap does not.
 *
 * When the deadline comes:
 *   - `directive()` answers the limit's reason, so the loop's stopWhen makes
 *     the next model call the closing answer — at the next round boundary;
 *   - a timer gives that closing answer DETACHED_CLOSE_GRACE_MS (2 minutes),
 *     for a round that is inside a hung tool or a stalled provider. Past it,
 *     `hardStop` aborts the turn (the stream writes the row and aborts with
 *     RunStopped, run-control.ts).
 *
 * A turn that ends before then calls `stop()`, which clears both timers.
 *
 * Every effect is injected — the row read, the hard stop, the clock and the
 * timers — so it is tested with fake timers and no database
 * (__tests__/unattended-clock.test.ts). A row read that fails keeps the last
 * reading: the clock never resets on a read it could not make, so it fails
 * toward stopping.
 *
 * @module server/services/ana/unattended-clock
 */

import {
  DETACHED_CLOSE_GRACE_MS,
  unattendedDeadline,
  type UnattendedDeadline,
  type UnattendedReason,
} from '@shared/ana/run-detach';

/** How often the clock re-reads the watched stamp while armed, at most. */
export const UNATTENDED_POLL_MS = 15_000;

export interface UnattendedClockDeps {
  /** When the turn started (epoch ms, server clock). */
  startedAt: number;
  /** The run row's `last_watched_at`, epoch ms, or null when never stamped. */
  readLastWatched(): Promise<number | null>;
  /** The grace ran out: stop the turn now, with this reason. */
  hardStop(reason: UnattendedReason): void;
  now?: () => number;
  pollMs?: number;
  graceMs?: number;
}

export class UnattendedClock {
  private readonly now: () => number;
  private readonly pollMs: number;
  private readonly graceMs: number;
  private detachedAt: number | null = null;
  private lastWatched: number | null = null;
  private due: UnattendedReason | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly deps: UnattendedClockDeps) {
    this.now = deps.now ?? Date.now;
    this.pollMs = deps.pollMs ?? UNATTENDED_POLL_MS;
    this.graceMs = deps.graceMs ?? DETACHED_CLOSE_GRACE_MS;
  }

  /** The page closed at `at` and the turn went on: start counting. Once. */
  detach(at: number): void {
    if (this.stopped || this.detachedAt !== null) return;
    this.detachedAt = at;
    this.schedule(0);
  }

  /** Whether the turn has detached. */
  isDetached(): boolean {
    return this.detachedAt !== null;
  }

  /** The limit as it stands: when, and why. Null until detached. */
  deadline(): UnattendedDeadline | null {
    return unattendedDeadline({ startedAtMs: this.deps.startedAt, detachedAtMs: this.detachedAt, lastWatchedAtMs: this.lastWatched });
  }

  /** The loop's answer: the limit's reason once it has come, else null. */
  readonly directive = (): UnattendedReason | null => this.due;

  /** The last watched stamp the clock read (epoch ms), or null. */
  lastWatchedAt(): number | null {
    return this.lastWatched;
  }

  /** Re-read the watched stamp now (a round boundary, or the timer). */
  async refresh(): Promise<void> {
    if (this.detachedAt === null || this.stopped) return;
    try {
      const read = await this.deps.readLastWatched();
      if (read !== null && (this.lastWatched === null || read > this.lastWatched)) this.lastWatched = read;
    } catch {
      // Keep the last reading: never reset the clock on a read that failed.
    }
    this.evaluate();
  }

  /** The turn ended: clear every timer. */
  stop(): void {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.pollTimer = null;
    this.graceTimer = null;
  }

  private evaluate(): void {
    if (this.stopped || this.due) return;
    const d = this.deadline();
    if (!d) return;
    const left = d.at - this.now();
    if (left > 0) {
      this.schedule(Math.min(this.pollMs, left));
      return;
    }
    this.due = d.reason;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    const reason = d.reason;
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      if (!this.stopped) this.deps.hardStop(reason);
    }, this.graceMs);
    this.graceTimer.unref?.();
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.refresh();
    }, ms);
    this.pollTimer.unref?.();
  }
}
