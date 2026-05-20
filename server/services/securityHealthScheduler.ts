/**
 * Periodic security-posture monitor.
 *
 * The boot-time self-test (server/startup/security-self-test.ts) verifies
 * posture ONCE at process start. Anything that drifts mid-day — clamd
 * goes down, audit chain breaks, JWT secret somehow gets shorter (don't
 * laugh, env-var hotswap tooling exists) — won't be visible until
 * someone manually pings /api/admin/security-health.
 *
 * This scheduler re-runs the panel on a fixed interval, caches the
 * last result so the admin endpoint can serve it without re-running
 * the whole panel on every probe, and emits structured log entries
 * + Prometheus gauges so ops dashboards can alert.
 *
 * Lifecycle:
 *   - startSecurityHealthScheduler(pool) → starts the interval timer.
 *     Idempotent: calling twice is a no-op.
 *   - stopSecurityHealthScheduler() → clears the timer (used by
 *     graceful shutdown).
 *   - getLastSecurityHealthReport() → returns the cached result, or
 *     null if the scheduler hasn't run yet.
 *
 * Interval:
 *   - production: SECURITY_HEALTH_INTERVAL_MS env (default 5 minutes).
 *     Long enough that the EICAR-scan + chain-verify don't generate
 *     unnecessary load; short enough that drift is caught in one
 *     reasonable on-call window.
 *   - non-production: same env override; default 60s for faster
 *     feedback during dev.
 *   - test: SECURITY_HEALTH_DISABLE_SCHEDULER=true skips entirely.
 *
 * State-change logging:
 *   - First successful run logs the report at info.
 *   - Transitions (healthy → degraded, degraded → failing, recovery)
 *     log at warn / error respectively so log aggregators alert ONCE
 *     per state change rather than every interval.
 *   - Steady state logs at debug — high-frequency same-status entries
 *     don't bloat the log volume.
 */

import type { Pool } from 'pg';
import {
  runSecurityHealthChecks,
  type SecurityHealthReport,
} from './securityHealth';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('security-health-scheduler');

const DEFAULT_INTERVAL_PROD_MS = 5 * 60 * 1000;
const DEFAULT_INTERVAL_NONPROD_MS = 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let lastReport: SecurityHealthReport | null = null;
let lastReportAt: number | null = null;
let lastOverall: SecurityHealthReport['overall'] | null = null;
let runInFlight = false;

function intervalMs(): number {
  const override = Number(process.env.SECURITY_HEALTH_INTERVAL_MS);
  if (Number.isFinite(override) && override > 0) return override;
  return process.env.NODE_ENV === 'production'
    ? DEFAULT_INTERVAL_PROD_MS
    : DEFAULT_INTERVAL_NONPROD_MS;
}

async function runOnce(pool: Pool): Promise<void> {
  if (runInFlight) {
    // Don't pile up: if the previous run is still going (rare, but
    // possible on a slow clamd / chain-verify) skip this tick.
    return;
  }
  runInFlight = true;
  try {
    const report = await runSecurityHealthChecks(pool);
    const previous = lastOverall;
    lastReport = report;
    lastReportAt = Date.now();
    lastOverall = report.overall;

    const transitioned = previous !== null && previous !== report.overall;
    const failingCheckNames = report.checks
      .filter(c => c.status === 'fail')
      .map(c => c.name);

    if (transitioned) {
      const direction =
        report.overall === 'failing'
          ? 'error'
          : report.overall === 'degraded'
            ? 'warn'
            : 'info';
      const fn = log[direction];
      fn(`security posture transitioned ${previous} → ${report.overall}`, {
        previous,
        current: report.overall,
        failingChecks: failingCheckNames,
      });
    } else if (previous === null) {
      // first run
      log.info('initial security posture observed', {
        overall: report.overall,
        failingChecks: failingCheckNames,
      });
    } else {
      // steady state — keep at debug to avoid log spam
      log.debug('security posture unchanged', { overall: report.overall });
    }
  } catch (err) {
    log.error('security health scheduler run threw', {
      err: err instanceof Error ? err.message : String(err),
    });
  } finally {
    runInFlight = false;
  }
}

export function startSecurityHealthScheduler(pool: Pool): void {
  if (process.env.SECURITY_HEALTH_DISABLE_SCHEDULER === 'true') {
    log.info('scheduler disabled via SECURITY_HEALTH_DISABLE_SCHEDULER');
    return;
  }
  if (timer) return; // idempotent

  const ms = intervalMs();
  // Kick off an immediate first run (don't wait for the first tick).
  // Catch errors so an immediate failure doesn't take down boot.
  runOnce(pool).catch(() => {
    /* logged inside runOnce */
  });
  timer = setInterval(() => {
    runOnce(pool).catch(() => {
      /* logged inside runOnce */
    });
  }, ms);
  // The interval should NOT keep the event loop alive — if the
  // process is otherwise idle (e.g. during graceful shutdown) we
  // want it to exit.
  timer.unref?.();
  log.info('scheduler started', { intervalMs: ms });
}

export function stopSecurityHealthScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  // Don't clear the cached report — the admin endpoint may still
  // want to serve the last-known state after shutdown begins.
}

export function getLastSecurityHealthReport(): {
  report: SecurityHealthReport | null;
  ageMs: number | null;
} {
  if (!lastReport || !lastReportAt) {
    return { report: null, ageMs: null };
  }
  return { report: lastReport, ageMs: Date.now() - lastReportAt };
}

/**
 * Render the latest security health as Prometheus exposition text.
 * Returns a string suitable to append to the /api/metrics output.
 * Returns an empty string when no run has completed yet (avoid emitting
 * gauges with no data — Prometheus prefers no metric to a 0-with-no-
 * context).
 */
export function renderSecurityHealthMetrics(): string {
  const { report, ageMs } = getLastSecurityHealthReport();
  if (!report) return '';

  const lines: string[] = [];
  lines.push('# HELP security_health_overall Overall security posture (0=healthy, 1=degraded, 2=failing)');
  lines.push('# TYPE security_health_overall gauge');
  lines.push(
    `security_health_overall ${
      report.overall === 'healthy' ? 0 : report.overall === 'degraded' ? 1 : 2
    }`,
  );

  lines.push('# HELP security_health_check Per-check status (0=pass, 1=warn, 2=fail, 3=skipped)');
  lines.push('# TYPE security_health_check gauge');
  for (const check of report.checks) {
    const value =
      check.status === 'pass'
        ? 0
        : check.status === 'warn'
          ? 1
          : check.status === 'fail'
            ? 2
            : 3;
    const critical = check.critical ? '1' : '0';
    lines.push(
      `security_health_check{name="${check.name}",critical="${critical}"} ${value}`,
    );
  }

  if (ageMs != null) {
    lines.push('# HELP security_health_last_run_age_seconds Seconds since the last scheduler run');
    lines.push('# TYPE security_health_last_run_age_seconds gauge');
    lines.push(`security_health_last_run_age_seconds ${(ageMs / 1000).toFixed(0)}`);
  }

  return lines.join('\n') + '\n';
}

/** Test-only helpers. */
export const __testing = {
  reset() {
    if (timer) clearInterval(timer);
    timer = null;
    lastReport = null;
    lastReportAt = null;
    lastOverall = null;
    runInFlight = false;
  },
  setLastReport(report: SecurityHealthReport) {
    lastReport = report;
    lastReportAt = Date.now();
    lastOverall = report.overall;
  },
  intervalMs,
};
