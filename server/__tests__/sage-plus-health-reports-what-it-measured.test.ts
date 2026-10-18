/**
 * The SagePlus health probe reports what it MEASURED, not a constant.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `healthCheck()` returned `status: 'operational'` unconditionally. The probe
 * result went into `databaseConnected`, the failure went into the log, and the
 * status said "operational" either way.
 *
 * routes/health.ts makes that field a conjunct of the deep check's verdict:
 *
 *     sagePlusResult.status === 'operational' && …
 *     res.status(isHealthy ? 200 : 503)
 *
 * A conjunct that is always true contributes nothing. So the line was dead and
 * `services.sagePlus.status` read "operational" to any monitor while this
 * service could not reach the database.
 *
 * ── Why the existing suite did not catch it ──────────────────────────────────
 * `server/routes/__tests__/health-5xx-containment.test.ts` mocks this function
 * as a REJECTION to drive the SagePlus-degraded path. That proves
 * routes/health.ts's catch branch — which is real and worth keeping — but this
 * function never throws; it catches internally. The state that suite asserts is
 * one the production code cannot produce, so it passed throughout.
 *
 * These cases exercise the REAL function against the three states its database
 * dependency can actually be in.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { poolRef, queryMock, logError } = vi.hoisted(() => ({
  poolRef: { current: {} as unknown },
  queryMock: vi.fn(),
  logError: vi.fn(),
}));

// `pool` is read as a live binding, so the mock exposes it as a getter the
// cases can repoint — including to null, which runtime.ts genuinely produces
// when neither DATABASE_URL nor DATABASE_NEON_NEW_SECRET is set.
vi.mock('../db', () => ({
  get pool() {
    return poolRef.current;
  },
  query: queryMock,
}));

vi.mock('../utils/logger', () => ({
  createContextLogger: () => ({
    error: logError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

const loadHealthCheck = async () => (await import('../sage-plus-service')).healthCheck;

describe('SagePlus healthCheck reports the state it measured', () => {
  beforeEach(() => {
    vi.resetModules();
    queryMock.mockReset();
    logError.mockReset();
    poolRef.current = {};
  });

  it('operational when the database answers', async () => {
    queryMock.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const healthCheck = await loadHealthCheck();

    const res = await healthCheck();

    expect(res.status).toBe('operational');
    expect(res.databaseConnected).toBe(true);
    expect(logError).not.toHaveBeenCalled();
  });

  it('degraded — NOT operational — when the database probe throws', async () => {
    // The case the old code reported as healthy. This is the whole finding.
    queryMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND db.internal'));
    const healthCheck = await loadHealthCheck();

    const res = await healthCheck();

    expect(res.status).toBe('degraded');
    expect(res.databaseConnected).toBe(false);
    // The failure is still logged — the fix moved the verdict, not the detail.
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('degraded when the database answers but returns no rows', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const healthCheck = await loadHealthCheck();

    const res = await healthCheck();

    expect(res.status).toBe('degraded');
    expect(res.databaseConnected).toBe(false);
  });

  it('not_configured when there is no pool at all, so a dev environment is not an outage', async () => {
    // runtime.ts leaves `pool` null with no DATABASE_URL. Reporting that as
    // 'degraded' would turn every unconfigured environment's deep health check
    // into a 503; routes/health.ts treats the database's own 'not_configured'
    // as healthy for the same reason, and this vocabulary matches it.
    poolRef.current = null;
    const healthCheck = await loadHealthCheck();

    const res = await healthCheck();

    expect(res.status).toBe('not_configured');
    expect(res.databaseConnected).toBe(false);
    // No pool is not a failure, so nothing is logged as an error and the
    // database is never probed.
    expect(queryMock).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('never returns a failure detail, so driver text cannot reach a health payload', async () => {
    // routes/health.ts keeps driver text out of the body with its own
    // probeFailed ("the detail is in the server log") and its suite asserts
    // that. A message field here would be a second, unguarded route for
    // `getaddrinfo ENOTFOUND …` into a public response.
    queryMock.mockRejectedValue(new Error('SENTINEL-DRIVER-TEXT password authentication failed'));
    const healthCheck = await loadHealthCheck();

    const res = await healthCheck();

    expect(JSON.stringify(res)).not.toContain('SENTINEL-DRIVER-TEXT');
    expect(Object.keys(res).sort()).toEqual(['databaseConnected', 'status', 'timestamp']);
  });
});
