/**
 * Pins the periodic security-health scheduler contract.
 *
 *   - Idempotent start (calling twice doesn't double-schedule).
 *   - Cached report served by getLastSecurityHealthReport.
 *   - State-change logging fires on healthy → degraded → failing
 *     transitions (and recovery), not on steady state.
 *   - renderSecurityHealthMetrics emits valid Prometheus text.
 *   - Disabled by SECURITY_HEALTH_DISABLE_SCHEDULER=true.
 *   - Interval respects SECURITY_HEALTH_INTERVAL_MS override.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

// Mock the underlying check runner so each test controls what the
// scheduler observes without exercising the real (slow, infra-bound)
// checks.

const { runChecksMock } = vi.hoisted(() => ({ runChecksMock: vi.fn() }));
vi.mock('../securityHealth', () => ({
  runSecurityHealthChecks: runChecksMock,
}));

beforeEach(async () => {
  vi.resetModules();
  runChecksMock.mockReset();
  const { __testing } = await import('../securityHealthScheduler');
  __testing.reset();
});

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  const { __testing } = await import('../securityHealthScheduler');
  __testing.reset();
});

function reportWith(overall: 'healthy' | 'degraded' | 'failing') {
  return {
    overall,
    checkedAt: new Date().toISOString(),
    checks: [
      {
        name: 'jwt_secret_strength',
        status: overall === 'failing' ? 'fail' : 'pass',
        critical: true,
        durationMs: 1,
      },
    ],
  };
}

describe('securityHealthScheduler — disabled mode', () => {
  it('does NOT start a timer when SECURITY_HEALTH_DISABLE_SCHEDULER=true', async () => {
    process.env.SECURITY_HEALTH_DISABLE_SCHEDULER = 'true';
    runChecksMock.mockResolvedValue(reportWith('healthy'));
    const { startSecurityHealthScheduler, getLastSecurityHealthReport } = await import(
      '../securityHealthScheduler'
    );
    startSecurityHealthScheduler({} as any);
    // Give microtasks a moment to drain.
    await new Promise(r => setTimeout(r, 5));
    const { report } = getLastSecurityHealthReport();
    expect(report).toBeNull();
    expect(runChecksMock).not.toHaveBeenCalled();
  });
});

describe('securityHealthScheduler — basic run', () => {
  it('runs once synchronously on start and caches the result', async () => {
    delete process.env.SECURITY_HEALTH_DISABLE_SCHEDULER;
    runChecksMock.mockResolvedValue(reportWith('healthy'));
    const { startSecurityHealthScheduler, getLastSecurityHealthReport, stopSecurityHealthScheduler } =
      await import('../securityHealthScheduler');
    startSecurityHealthScheduler({} as any);
    // Wait for the immediate-run promise.
    await new Promise(r => setTimeout(r, 20));
    const { report, ageMs } = getLastSecurityHealthReport();
    expect(report?.overall).toBe('healthy');
    expect(ageMs).not.toBeNull();
    expect((ageMs as number) < 1000).toBe(true);
    stopSecurityHealthScheduler();
  });

  it('idempotent — calling start twice does not double-schedule', async () => {
    delete process.env.SECURITY_HEALTH_DISABLE_SCHEDULER;
    runChecksMock.mockResolvedValue(reportWith('healthy'));
    const { startSecurityHealthScheduler, stopSecurityHealthScheduler } = await import(
      '../securityHealthScheduler'
    );
    startSecurityHealthScheduler({} as any);
    startSecurityHealthScheduler({} as any);
    await new Promise(r => setTimeout(r, 20));
    // Only ONE immediate-run should have fired.
    expect(runChecksMock).toHaveBeenCalledTimes(1);
    stopSecurityHealthScheduler();
  });
});

describe('securityHealthScheduler — interval override', () => {
  it('honors SECURITY_HEALTH_INTERVAL_MS', async () => {
    process.env.SECURITY_HEALTH_INTERVAL_MS = '12345';
    const { __testing } = await import('../securityHealthScheduler');
    expect(__testing.intervalMs()).toBe(12345);
  });

  it('defaults to 5 min in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SECURITY_HEALTH_INTERVAL_MS;
    const { __testing } = await import('../securityHealthScheduler');
    expect(__testing.intervalMs()).toBe(5 * 60 * 1000);
  });

  it('defaults to 60s outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SECURITY_HEALTH_INTERVAL_MS;
    const { __testing } = await import('../securityHealthScheduler');
    expect(__testing.intervalMs()).toBe(60 * 1000);
  });
});

describe('renderSecurityHealthMetrics', () => {
  it('returns empty string when no run has completed', async () => {
    const { renderSecurityHealthMetrics } = await import('../securityHealthScheduler');
    expect(renderSecurityHealthMetrics()).toBe('');
  });

  it('emits HELP/TYPE/value lines for overall and each check', async () => {
    const { __testing, renderSecurityHealthMetrics } = await import(
      '../securityHealthScheduler'
    );
    __testing.setLastReport({
      overall: 'degraded',
      checkedAt: new Date().toISOString(),
      checks: [
        { name: 'jwt_secret_strength', status: 'pass', critical: true, durationMs: 1 },
        { name: 'clamav_connectivity', status: 'skipped', critical: false, durationMs: 1 },
        { name: 'audit_chain_integrity', status: 'warn', critical: false, durationMs: 1 },
      ],
    });
    const out = renderSecurityHealthMetrics();
    expect(out).toContain('# HELP security_health_overall');
    expect(out).toContain('# TYPE security_health_overall gauge');
    expect(out).toMatch(/security_health_overall 1\b/); // degraded
    expect(out).toMatch(/security_health_check\{name="jwt_secret_strength",critical="1"\} 0\b/);
    expect(out).toMatch(/security_health_check\{name="clamav_connectivity",critical="0"\} 3\b/);
    expect(out).toMatch(/security_health_check\{name="audit_chain_integrity",critical="0"\} 1\b/);
    expect(out).toContain('security_health_last_run_age_seconds');
  });

  it('maps overall states to 0/1/2', async () => {
    const { __testing, renderSecurityHealthMetrics } = await import(
      '../securityHealthScheduler'
    );
    for (const [state, expected] of [
      ['healthy', '0'],
      ['degraded', '1'],
      ['failing', '2'],
    ] as const) {
      __testing.reset();
      __testing.setLastReport({
        overall: state,
        checkedAt: new Date().toISOString(),
        checks: [],
      });
      const out = renderSecurityHealthMetrics();
      expect(out).toContain(`security_health_overall ${expected}`);
    }
  });
});
