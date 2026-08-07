/**
 * Background-jobs heartbeat registry + metrics (ops observability).
 *
 * The platform runs several unattended background workers (periodic sweeps,
 * cron/queue processors, the audit-chain monitor). Under RLS_ENFORCE=on a
 * worker that loses its tenant scope fails CLOSED and silently stops doing its
 * job — which is exactly the class of production-only outage that motivated
 * this module. A silent sweep is indistinguishable from a healthy idle one
 * without a heartbeat, so every such worker now reports the outcome of each
 * tick here, and the signal is surfaced two ways:
 *
 *   - /api/metrics  → Prometheus gauges/counters (renderBackgroundJobsMetrics),
 *     so Alertmanager can page when a critical job has not SUCCEEDED within its
 *     expected window (see infra/alerts/background-jobs.yml).
 *   - /api/health/jobs → JSON heartbeats with a staleness verdict, for humans.
 *
 * Mirrors the fcoi-metrics / ana-ri-metrics convention: no external deps,
 * hand-rolled Prometheus text, in-memory state since process start. Workers
 * import this module and call recordBackgroundJobRun at their tick chokepoint;
 * the central /api/metrics endpoint renders it. This module imports NOTHING
 * from the workers (one-way dependency, no cycles).
 *
 * @module server/services/background-jobs-metrics
 */

/**
 * Canonical job names. Kept as a const so workers and the alert rules in
 * infra/alerts/background-jobs.yml agree on the exact `job` label — a typo on
 * either side would silently detach an alert from its metric.
 */
export const BACKGROUND_JOB = {
  AUDIT_CHAIN_MONITOR: 'audit-chain-monitor',
  REPORT_SUBSCRIPTION_SWEEP: 'report-subscription-sweep',
  SCHEDULED_JOBS: 'scheduled-jobs',
  SUBMISSION_CHAT_SWEEP: 'submission-chat-sweep',
  SENTINEL_SCAN: 'sentinel-scan',
} as const;

export type BackgroundJobName = string;

export interface JobHeartbeat {
  /** Stable job identifier used as the Prometheus `job` label. */
  name: BackgroundJobName;
  /** Epoch ms of the most recent run attempt (success or failure), or null. */
  lastRunAt: number | null;
  /** Epoch ms of the most recent SUCCESSFUL run, or null. */
  lastSuccessAt: number | null;
  /** Whether the most recent run succeeded. */
  lastRunOk: boolean;
  /** Items processed on the most recent run (0 when not reported). */
  lastProcessed: number;
  /** Monotonic counters since process start. */
  successes: number;
  failures: number;
  /** Truncated message from the most recent failure (never PII). */
  lastError: string | null;
}

interface JobState {
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastRunOk: boolean;
  lastProcessed: number;
  successes: number;
  failures: number;
  lastError: string | null;
}

const jobs = new Map<BackgroundJobName, JobState>();

function ensure(name: BackgroundJobName): JobState {
  let s = jobs.get(name);
  if (!s) {
    s = {
      lastRunAt: null,
      lastSuccessAt: null,
      lastRunOk: false,
      lastProcessed: 0,
      successes: 0,
      failures: 0,
      lastError: null,
    };
    jobs.set(name, s);
  }
  return s;
}

/** Keep error strings short and non-sensitive on a metrics/health surface. */
function truncateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? 'unknown');
  return msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
}

/**
 * Record the outcome of one background-job tick. Call this at the worker's tick
 * chokepoint — once per run, on BOTH the success and the failure path — so the
 * heartbeat reflects "the worker is alive and doing its job", not merely "the
 * worker was scheduled".
 */
export function recordBackgroundJobRun(
  name: BackgroundJobName,
  outcome: { ok: boolean; processed?: number; error?: unknown },
): void {
  const s = ensure(name);
  const now = Date.now();
  s.lastRunAt = now;
  s.lastRunOk = outcome.ok;
  s.lastProcessed = Number.isFinite(outcome.processed) ? Number(outcome.processed) : 0;
  if (outcome.ok) {
    s.lastSuccessAt = now;
    s.successes += 1;
    s.lastError = null;
  } else {
    s.failures += 1;
    s.lastError = outcome.error != null ? truncateError(outcome.error) : 'unspecified failure';
  }
}

/** Pre-register a job so its heartbeat exists (lastRunAt=null) before its first
 * tick — lets alerts distinguish "never ran" from "not registered". */
export function registerBackgroundJob(name: BackgroundJobName): void {
  ensure(name);
}

/** All heartbeats as a stable, JSON-serialisable snapshot (for /api/health/jobs). */
export function getBackgroundJobHeartbeats(): JobHeartbeat[] {
  return Array.from(jobs.entries())
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Staleness verdict for a single job: is its last SUCCESS older than
 * `maxAgeMs`? A job that has never succeeded is stale once it has been
 * registered (so a worker wedged from the first tick still alarms). `now` is
 * injectable for tests.
 */
export function isJobStale(name: BackgroundJobName, maxAgeMs: number, now: number = Date.now()): boolean {
  const s = jobs.get(name);
  if (!s) return false; // not registered — not this surface's concern
  if (s.lastSuccessAt == null) return true;
  return now - s.lastSuccessAt > maxAgeMs;
}

/** Prometheus text for /api/metrics. One series-set per registered job. */
export function renderBackgroundJobsMetrics(): string[] {
  const lines: string[] = [];
  const entries = getBackgroundJobHeartbeats();

  lines.push('# HELP background_job_last_run_timestamp_seconds Unix time of the most recent run attempt');
  lines.push('# TYPE background_job_last_run_timestamp_seconds gauge');
  for (const j of entries) {
    lines.push(`background_job_last_run_timestamp_seconds{job="${j.name}"} ${j.lastRunAt != null ? (j.lastRunAt / 1000).toFixed(3) : 0}`);
  }

  lines.push('# HELP background_job_last_success_timestamp_seconds Unix time of the most recent successful run');
  lines.push('# TYPE background_job_last_success_timestamp_seconds gauge');
  for (const j of entries) {
    lines.push(`background_job_last_success_timestamp_seconds{job="${j.name}"} ${j.lastSuccessAt != null ? (j.lastSuccessAt / 1000).toFixed(3) : 0}`);
  }

  lines.push('# HELP background_job_up 1 if the most recent run succeeded, else 0');
  lines.push('# TYPE background_job_up gauge');
  for (const j of entries) {
    lines.push(`background_job_up{job="${j.name}"} ${j.lastRunOk ? 1 : 0}`);
  }

  lines.push('# HELP background_job_runs_total Total background-job runs since process start, by outcome');
  lines.push('# TYPE background_job_runs_total counter');
  for (const j of entries) {
    lines.push(`background_job_runs_total{job="${j.name}",outcome="success"} ${j.successes}`);
    lines.push(`background_job_runs_total{job="${j.name}",outcome="failure"} ${j.failures}`);
  }

  lines.push('# HELP background_job_last_run_processed Items processed on the most recent run');
  lines.push('# TYPE background_job_last_run_processed gauge');
  for (const j of entries) {
    lines.push(`background_job_last_run_processed{job="${j.name}"} ${j.lastProcessed}`);
  }

  return lines;
}

/** Test seam — clears all heartbeats. */
export function resetBackgroundJobsMetrics(): void {
  jobs.clear();
}
