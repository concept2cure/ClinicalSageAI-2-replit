/**
 * Drift Sentinel sweep
 *
 * Periodically re-checks every program that has fact bindings, flagging values
 * that diverged from their canonical fact and handing each divergence to the
 * existing cascade (change-router). This is the scheduled counterpart to the
 * on-demand POST /api/regulatory-graph/programs/:programId/drift/scan route.
 *
 * Standalone job module (mirrors server/jobs/retentionCron.js): it is not
 * auto-registered at boot. To schedule it, call startDriftSentinelSchedule()
 * from server startup behind ENABLE_DRIFT_SENTINEL=true, or invoke
 * runDriftSentinelSweep() from an external scheduler / cron. Each program runs
 * independently and best-effort, so one program's failure does not stop the rest.
 */

import { db } from '../db';
import { factBindings } from '../../shared/schema/living-record-spine';
import { runDriftSentinel } from '../services/living-record/reconciliation-engine';

export interface DriftSweepSummary {
  programs: number;
  driftDetected: number;
  healed: number;
  errors: number;
}

/** One sweep across every program that has at least one fact binding. */
export async function runDriftSentinelSweep(): Promise<DriftSweepSummary> {
  const rows = await db
    .selectDistinct({ programId: factBindings.programId })
    .from(factBindings);

  const summary: DriftSweepSummary = { programs: rows.length, driftDetected: 0, healed: 0, errors: 0 };
  for (const r of rows) {
    try {
      const report = await runDriftSentinel(r.programId);
      summary.driftDetected += report.driftDetected;
      summary.healed += report.healed;
    } catch {
      summary.errors += 1; // per-program best-effort; keep sweeping
    }
  }
  return summary;
}

const DEFAULT_INTERVAL_MS = 1000 * 60 * 60; // hourly
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic sweep. No-op unless ENABLE_DRIFT_SENTINEL=true, so it never
 * changes default boot behavior. Idempotent. The timer is unref'd so it does not
 * hold the process open.
 */
export function startDriftSentinelSchedule(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (process.env.ENABLE_DRIFT_SENTINEL !== 'true') return;
  if (timer) return;
  timer = setInterval(() => {
    void runDriftSentinelSweep().catch(() => {
      /* swept best-effort; route-level scans surface detail */
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopDriftSentinelSchedule(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
