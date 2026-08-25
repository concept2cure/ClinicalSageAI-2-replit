/**
 * Proactive-digest heartbeat — the Redis-free stand-in for the 7 AM digest cron.
 *
 * The proactive digest is the platform's ONLY unprompted surface: every other
 * proactive signal (session briefing, deadline radar, contradiction watch,
 * MDX alerts) is computed inside a user's request — if nobody opens chat,
 * nobody is told anything. The digest reaches users through the notification
 * tray on a schedule. That schedule was a Bull cron (`0 7 * * 1-5`), and Bull
 * needs Redis: on a Redis-less deploy `initScheduledJobs` logged one warn and
 * no-opped, so AnA's entire unprompted surface was silently zero.
 *
 * This module is NOT a second digest implementation — it is a second TRIGGER
 * for the same `runProactiveDigest`, in the plain-setInterval pattern
 * submission-chat-sweep-scheduler proves works without Redis. It only starts
 * when the Bull queue did not come up, so there is exactly one trigger per
 * deploy shape.
 *
 * Cadence mirrors the cron: weekdays, from 07:00 UTC. The interval ticks more
 * often than the digest fires; two guards keep delivery at most once per org
 * per day:
 *   - DB idempotency: skip an org that already has a proactive_digest
 *     notification created in today's window — restart-safe, and also
 *     correct if Redis comes back and the cron fires first.
 *   - In-memory attempt tracking: an org whose digest ran but produced
 *     nothing material is not re-queried every tick all day.
 *
 * Fail-soft per org, loud per process: one org's failure never stops the
 * sweep, and the boot path warns explicitly when this fallback is standing in.
 *
 * @module server/services/digest/digest-heartbeat
 */

import { runProactiveDigest, PROACTIVE_DIGEST_CATEGORY } from './proactive-digest.js';
import { runWithSystemTenantScope } from '../../db/tenantStore';
import {
  recordBackgroundJobRun,
  registerBackgroundJob,
  BACKGROUND_JOB,
} from '../background-jobs-metrics';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 min — cadence of checks, not of digests
const STARTUP_DELAY_MS = 2 * 60 * 1000;     // 2 min before first tick

/** The cron this stands in for: weekdays at 07:00 UTC. */
const DIGEST_HOUR_UTC = 7;

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let lastTick: { at: Date; orgsChecked: number; digestsCreated: number } | null = null;

/** Orgs already attempted in a given UTC day (dayKey → attempted org ids). */
let attemptedDayKey = '';
const attemptedOrgs = new Set<number>();

function isDisabled(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  const flag = (process.env.ANA_DIGEST_HEARTBEAT_DISABLED || '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(flag);
}

function readIntervalMs(): number {
  const raw = process.env.ANA_DIGEST_HEARTBEAT_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_MS;
}

/** Pure: is `now` inside the digest window (weekday, at/after 07:00 UTC)? */
export function isWithinDigestWindow(now: Date): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  return now.getUTCHours() >= DIGEST_HOUR_UTC;
}

/** Pure: start of today's digest window (07:00 UTC of `now`'s UTC day). */
export function digestWindowStart(now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(DIGEST_HOUR_UTC, 0, 0, 0);
  return start;
}

function rolloverAttempts(dayKey: string): void {
  if (attemptedDayKey !== dayKey) {
    attemptedDayKey = dayKey;
    attemptedOrgs.clear();
  }
}

/**
 * One heartbeat pass. Exported for deterministic testing; production reaches
 * it only through the interval. `now` is injectable for the same reason.
 */
export async function runDigestHeartbeatTick(
  now: Date = new Date()
): Promise<{ orgsChecked: number; digestsCreated: number; skipped: 'outside_window' | null }> {
  if (!isWithinDigestWindow(now)) {
    return { orgsChecked: 0, digestsCreated: 0, skipped: 'outside_window' };
  }
  rolloverAttempts(now.toISOString().slice(0, 10));

  const { pool } = await import('../../db/runtime.js');

  // Estate-wide enumeration belongs to no single tenant (same scope, same
  // reasoning as scheduled-jobs' own org enumeration).
  const { rows } = await runWithSystemTenantScope('digest-heartbeat:enumerate-orgs', () =>
    pool.query<{ id: number }>(`SELECT id FROM organizations WHERE status = 'active'`)
  );

  const windowStart = digestWindowStart(now);
  let orgsChecked = 0;
  let digestsCreated = 0;

  for (const { id: orgId } of rows) {
    if (attemptedOrgs.has(orgId)) continue;
    orgsChecked++;
    try {
      // DB idempotency: at most one digest per org per day, whoever fired it.
      const existing = await runWithSystemTenantScope('digest-heartbeat:idempotency', () =>
        pool.query(
          `SELECT 1 FROM mdx_notifications
            WHERE organization_id = $1 AND category = $2 AND created_at >= $3
            LIMIT 1`,
          [orgId, PROACTIVE_DIGEST_CATEGORY, windowStart]
        )
      );
      if (existing.rows.length > 0) {
        attemptedOrgs.add(orgId);
        continue;
      }

      const result = await runProactiveDigest(orgId, undefined, now);
      // quiet_hours is the one skip that must RETRY on a later tick — the org's
      // own quiet window can end while today's digest window is still open.
      if (result.skipped !== 'quiet_hours') {
        attemptedOrgs.add(orgId);
      }
      if (result.created) digestsCreated++;
    } catch (err) {
      // Fail-soft per org: one org's failure never starves the rest. Not
      // marked attempted — a transient failure retries on the next tick.
      console.warn(
        `[digest-heartbeat] digest failed for org ${orgId} (will retry next tick):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return { orgsChecked, digestsCreated, skipped: null };
}

async function tick(): Promise<void> {
  try {
    const result = await runDigestHeartbeatTick();
    lastTick = {
      at: new Date(),
      orgsChecked: result.orgsChecked,
      digestsCreated: result.digestsCreated,
    };
    recordBackgroundJobRun(BACKGROUND_JOB.PROACTIVE_DIGEST_HEARTBEAT, {
      ok: true,
      processed: result.digestsCreated,
    });
    if (result.digestsCreated > 0) {
      console.log(
        `[digest-heartbeat] created ${result.digestsCreated} digest notification(s) across ${result.orgsChecked} org(s)`
      );
    }
  } catch (err: any) {
    recordBackgroundJobRun(BACKGROUND_JOB.PROACTIVE_DIGEST_HEARTBEAT, { ok: false, error: err });
    console.warn(
      '[digest-heartbeat] tick failed (will retry next interval):',
      err?.message || err
    );
  }
}

/**
 * Start the heartbeat. Idempotent; returns false when skipped (already
 * running, test env, or explicitly disabled). Callers decide WHEN it is
 * needed — the boot path starts it only when the Bull scheduler queue did
 * not come up, so a Redis deploy keeps exactly one digest trigger.
 */
export function startDigestHeartbeat(): boolean {
  if (timer || startupTimer) return false;
  if (isDisabled()) return false;
  const intervalMs = readIntervalMs();
  // Pre-register so the heartbeat exists (never-run state) from start, letting
  // ops distinguish "wedged since boot" from "never scheduled".
  registerBackgroundJob(BACKGROUND_JOB.PROACTIVE_DIGEST_HEARTBEAT);

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void tick();
    timer = setInterval(() => {
      void tick();
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }, Math.min(STARTUP_DELAY_MS, intervalMs));
  if (typeof startupTimer.unref === 'function') startupTimer.unref();

  console.log(
    `[digest-heartbeat] scheduled (interval=${intervalMs}ms, first=${Math.min(STARTUP_DELAY_MS, intervalMs)}ms, window=weekdays >= 0${DIGEST_HOUR_UTC}:00 UTC)`
  );
  return true;
}

/** Stop the heartbeat. Used in tests / graceful shutdown. */
export function stopDigestHeartbeat(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Diagnostic — the last tick's outcome. Null if no tick has run yet. */
export function getDigestHeartbeatStatus(): {
  running: boolean;
  intervalMs: number;
  lastTick: { at: string; orgsChecked: number; digestsCreated: number } | null;
} {
  return {
    running: !!timer,
    intervalMs: readIntervalMs(),
    lastTick: lastTick
      ? {
          at: lastTick.at.toISOString(),
          orgsChecked: lastTick.orgsChecked,
          digestsCreated: lastTick.digestsCreated,
        }
      : null,
  };
}

/** Test helper — reset the per-day attempt tracking (simulates a new process). */
export function __resetDigestHeartbeatStateForTests(): void {
  attemptedDayKey = '';
  attemptedOrgs.clear();
  lastTick = null;
}
