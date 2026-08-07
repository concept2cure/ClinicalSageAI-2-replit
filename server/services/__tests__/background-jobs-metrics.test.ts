import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordBackgroundJobRun,
  registerBackgroundJob,
  getBackgroundJobHeartbeats,
  isJobStale,
  renderBackgroundJobsMetrics,
  resetBackgroundJobsMetrics,
  BACKGROUND_JOB,
} from '../background-jobs-metrics.js';

describe('background-jobs-metrics', () => {
  beforeEach(() => resetBackgroundJobsMetrics());

  it('registers a job with a never-run heartbeat', () => {
    registerBackgroundJob(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR);
    const [hb] = getBackgroundJobHeartbeats();
    expect(hb.name).toBe('audit-chain-monitor');
    expect(hb.lastRunAt).toBeNull();
    expect(hb.lastSuccessAt).toBeNull();
    expect(hb.successes).toBe(0);
    expect(hb.failures).toBe(0);
  });

  it('records a successful run: timestamps, counters, processed', () => {
    recordBackgroundJobRun(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP, { ok: true, processed: 4 });
    const [hb] = getBackgroundJobHeartbeats();
    expect(hb.lastRunOk).toBe(true);
    expect(hb.successes).toBe(1);
    expect(hb.failures).toBe(0);
    expect(hb.lastProcessed).toBe(4);
    expect(hb.lastSuccessAt).not.toBeNull();
    expect(hb.lastError).toBeNull();
  });

  it('records a failure: counter increments, error truncated, no success timestamp', () => {
    recordBackgroundJobRun(BACKGROUND_JOB.SCHEDULED_JOBS, {
      ok: false,
      error: new Error('boom'),
    });
    const [hb] = getBackgroundJobHeartbeats();
    expect(hb.lastRunOk).toBe(false);
    expect(hb.failures).toBe(1);
    expect(hb.lastSuccessAt).toBeNull();
    expect(hb.lastError).toBe('boom');
  });

  it('a later success clears the last-error but keeps the failure counter', () => {
    recordBackgroundJobRun(BACKGROUND_JOB.SENTINEL_SCAN, { ok: false, error: 'x' });
    recordBackgroundJobRun(BACKGROUND_JOB.SENTINEL_SCAN, { ok: true });
    const [hb] = getBackgroundJobHeartbeats();
    expect(hb.successes).toBe(1);
    expect(hb.failures).toBe(1);
    expect(hb.lastRunOk).toBe(true);
    expect(hb.lastError).toBeNull();
  });

  it('truncates overly long error messages to 200 chars', () => {
    recordBackgroundJobRun(BACKGROUND_JOB.SCHEDULED_JOBS, { ok: false, error: 'e'.repeat(500) });
    const [hb] = getBackgroundJobHeartbeats();
    expect(hb.lastError!.length).toBe(200);
    expect(hb.lastError!.endsWith('...')).toBe(true);
  });

  describe('isJobStale', () => {
    it('is false right after a success', () => {
      recordBackgroundJobRun(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, { ok: true });
      expect(isJobStale(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, 60_000)).toBe(false);
    });

    it('is true when the last success is older than maxAge (injected clock)', () => {
      recordBackgroundJobRun(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, { ok: true });
      const future = Date.now() + 20 * 60 * 1000; // 20 min later
      expect(isJobStale(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR, 15 * 60 * 1000, future)).toBe(true);
    });

    it('is true for a registered-but-never-succeeded job', () => {
      registerBackgroundJob(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP);
      expect(isJobStale(BACKGROUND_JOB.REPORT_SUBSCRIPTION_SWEEP, 60_000)).toBe(true);
    });

    it('is false for an unregistered job (not this surface’s concern)', () => {
      expect(isJobStale('never-registered', 60_000)).toBe(false);
    });
  });

  describe('renderBackgroundJobsMetrics', () => {
    it('emits the never-run sentinel (0) for last_success before any run', () => {
      registerBackgroundJob(BACKGROUND_JOB.AUDIT_CHAIN_MONITOR);
      const text = renderBackgroundJobsMetrics().join('\n');
      expect(text).toContain(
        'background_job_last_success_timestamp_seconds{job="audit-chain-monitor"} 0',
      );
      expect(text).toContain('background_job_up{job="audit-chain-monitor"} 0');
    });

    it('emits up=1 and both outcome counters after a success', () => {
      recordBackgroundJobRun(BACKGROUND_JOB.SENTINEL_SCAN, { ok: true, processed: 2 });
      const text = renderBackgroundJobsMetrics().join('\n');
      expect(text).toContain('background_job_up{job="sentinel-scan"} 1');
      expect(text).toContain('background_job_runs_total{job="sentinel-scan",outcome="success"} 1');
      expect(text).toContain('background_job_runs_total{job="sentinel-scan",outcome="failure"} 0');
      expect(text).toContain('background_job_last_run_processed{job="sentinel-scan"} 2');
    });

    it('includes HELP/TYPE header lines for each metric family', () => {
      recordBackgroundJobRun(BACKGROUND_JOB.SCHEDULED_JOBS, { ok: true });
      const text = renderBackgroundJobsMetrics().join('\n');
      expect(text).toContain('# TYPE background_job_last_run_timestamp_seconds gauge');
      expect(text).toContain('# TYPE background_job_runs_total counter');
    });
  });
});
