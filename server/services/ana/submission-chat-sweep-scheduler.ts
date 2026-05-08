/**
 * Periodic janitor for submission-chat rewrite proposals.
 *
 * Runs sweepExpiredProposals() across every org on a fixed interval so the
 * per-tenant POST /submission-chat/proposals/sweep endpoint stays a manual
 * escape hatch — normal expiration is handled here. Idempotent: safe to call
 * repeatedly, no-ops when nothing is past TTL.
 *
 * Lifecycle:
 *   - start() schedules a single timer; calling again is a no-op (idempotent)
 *   - stop() clears the timer (used in tests / graceful shutdown)
 *   - first sweep runs after a short startup delay so server boot isn't
 *     blocked behind a DB query, then every ANA_SUBMISSION_CHAT_SWEEP_INTERVAL_MS
 *     (default 1h) thereafter
 *
 * Disabled when:
 *   - NODE_ENV=test (avoid timers leaking between test files)
 *   - ANA_SUBMISSION_CHAT_SWEEP_DISABLED=true
 *   - the table doesn't exist yet (sweepExpiredProposals returns 0 silently)
 *
 * @module server/services/ana/submission-chat-sweep-scheduler
 */
import { sweepExpiredProposals } from './submission-chat-proposal-store.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STARTUP_DELAY_MS = 5 * 60 * 1000;     // 5 min before first tick

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let lastTick: { at: Date; expired: number } | null = null;

function isDisabled(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  const flag = (process.env.ANA_SUBMISSION_CHAT_SWEEP_DISABLED || '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(flag);
}

function readIntervalMs(): number {
  const raw = process.env.ANA_SUBMISSION_CHAT_SWEEP_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_MS;
}

async function tick(): Promise<void> {
  try {
    const result = await sweepExpiredProposals();
    lastTick = { at: new Date(), expired: result.expired };
    if (result.expired > 0) {
      console.log(
        `[submission-chat-sweep] expired ${result.expired} proposal${result.expired === 1 ? '' : 's'}`
      );
    }
  } catch (err: any) {
    console.warn(
      '[submission-chat-sweep] tick failed (will retry next interval):',
      err?.message || err
    );
  }
}

/**
 * Start the periodic sweep. Idempotent — calling start() while already
 * running is a no-op. Returns true if a timer was scheduled, false if
 * scheduling was skipped (test env / disabled / already running).
 */
export function startSubmissionChatSweepScheduler(): boolean {
  if (timer || startupTimer) return false;
  if (isDisabled()) return false;
  const intervalMs = readIntervalMs();

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void tick();
    timer = setInterval(() => {
      void tick();
    }, intervalMs);
    // Don't keep the process alive solely for this timer.
    if (typeof timer.unref === 'function') timer.unref();
  }, Math.min(STARTUP_DELAY_MS, intervalMs));
  if (typeof startupTimer.unref === 'function') startupTimer.unref();

  console.log(
    `[submission-chat-sweep] scheduled (interval=${intervalMs}ms, first=${Math.min(STARTUP_DELAY_MS, intervalMs)}ms)`
  );
  return true;
}

/** Stop the periodic sweep. Used in tests / graceful shutdown. */
export function stopSubmissionChatSweepScheduler(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Diagnostic — returns the last tick's outcome. Null if no tick has run yet. */
export function getSweepSchedulerStatus(): {
  running: boolean;
  intervalMs: number;
  lastTick: { at: string; expired: number } | null;
} {
  return {
    running: !!timer,
    intervalMs: readIntervalMs(),
    lastTick: lastTick
      ? { at: lastTick.at.toISOString(), expired: lastTick.expired }
      : null,
  };
}
