/**
 * Pins the /api/admin/security-health endpoint contract.
 *
 *   - Requires auth + admin role (router-level middleware).
 *   - Returns 200 when overall is healthy or degraded.
 *   - Returns 503 when overall is failing (page-able signal).
 *   - Response shape matches SecurityHealthReport.
 *   - Audit-event write on every call (admin observation is itself
 *     an event worth auditing — SOC review).
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mocks: auth + admin role pass through with a fake user; pool stubbed;
// securityHealth replaced with a controllable producer.
vi.mock('../../auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 1, organizationId: 7, role: 'admin' };
    req.userId = 1;
    req.userRole = 'admin';
    next();
  },
  requireAdminRole: (_req: any, _res: any, next: any) => next(),
}));

const fakePool: any = { query: vi.fn().mockResolvedValue({ rows: [] }) };
vi.mock('../../db.js', () => ({ getPool: () => fakePool, pool: fakePool }));

// Spy on the audit service so we can assert the route logged.
const auditLogAction = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/auditService', () => ({
  default: { logAction: auditLogAction },
}));

const runChecksMock = vi.fn();
vi.mock('../../services/securityHealth', () => ({
  runSecurityHealthChecks: runChecksMock,
}));

// The route prefers the scheduler's cached report. Mock it so we can
// flip between "no cache" and "fresh cache" per test.
const cachedReportMock = vi.fn();
vi.mock('../../services/securityHealthScheduler', () => ({
  getLastSecurityHealthReport: cachedReportMock,
}));

async function makeApp() {
  const router = (await import('../admin-security')).default;
  const app = express();
  app.use('/api/admin', router);
  return app;
}

beforeEach(() => {
  vi.resetModules();
  auditLogAction.mockClear();
  runChecksMock.mockReset();
  cachedReportMock.mockReset();
  // Default: no cached result, so the route runs the panel fresh.
  cachedReportMock.mockReturnValue({ report: null, ageMs: null });
});

describe('GET /api/admin/security-health', () => {
  it('returns 200 with the report when overall is healthy', async () => {
    runChecksMock.mockResolvedValueOnce({
      overall: 'healthy',
      checkedAt: '2026-05-13T00:00:00.000Z',
      checks: [
        { name: 'jwt_secret_strength', status: 'pass', critical: true, durationMs: 1 },
      ],
    });
    const app = await makeApp();
    const res = await request(app).get('/api/admin/security-health');
    expect(res.status).toBe(200);
    expect(res.body.overall).toBe('healthy');
    expect(res.body.checks).toHaveLength(1);
  });

  it('returns 200 (degraded ops still serve) when overall is degraded', async () => {
    runChecksMock.mockResolvedValueOnce({
      overall: 'degraded',
      checkedAt: '2026-05-13T00:00:00.000Z',
      checks: [],
    });
    const app = await makeApp();
    const res = await request(app).get('/api/admin/security-health');
    expect(res.status).toBe(200);
    expect(res.body.overall).toBe('degraded');
  });

  it('returns 503 (page on this) when overall is failing', async () => {
    runChecksMock.mockResolvedValueOnce({
      overall: 'failing',
      checkedAt: '2026-05-13T00:00:00.000Z',
      checks: [
        {
          name: 'jwt_secret_strength',
          status: 'fail',
          critical: true,
          reason: 'short secret',
          durationMs: 1,
        },
      ],
    });
    const app = await makeApp();
    const res = await request(app).get('/api/admin/security-health');
    expect(res.status).toBe(503);
    expect(res.body.overall).toBe('failing');
  });

  it('writes an audit event with the overall status (SOC visibility)', async () => {
    runChecksMock.mockResolvedValueOnce({
      overall: 'healthy',
      checkedAt: '2026-05-13T00:00:00.000Z',
      checks: [],
    });
    const app = await makeApp();
    await request(app).get('/api/admin/security-health');
    expect(auditLogAction).toHaveBeenCalledTimes(1);
    const entry = auditLogAction.mock.calls[0][0];
    expect(entry.action).toBe('admin_security_health_check');
    expect(entry.resourceType).toBe('security_event');
    expect(entry.details).toEqual({ overall: 'healthy' });
  });

  it('returns 500 when the check runner throws', async () => {
    runChecksMock.mockRejectedValueOnce(new Error('catastrophic'));
    const app = await makeApp();
    const res = await request(app).get('/api/admin/security-health');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Security-health/);
  });

  it('serves the scheduler cache when fresh, skipping a full panel run', async () => {
    const cachedReport = {
      overall: 'healthy' as const,
      checkedAt: '2026-05-13T00:00:00.000Z',
      checks: [
        { name: 'jwt_secret_strength', status: 'pass', critical: true, durationMs: 1 },
      ],
    };
    cachedReportMock.mockReturnValue({ report: cachedReport, ageMs: 30_000 });
    const app = await makeApp();
    const res = await request(app).get('/api/admin/security-health');
    expect(res.status).toBe(200);
    expect(res.body.overall).toBe('healthy');
    // Marker header so ops dashboards can tell cache from fresh.
    expect(res.headers['x-security-health-cached']).toBe('1');
    // Full panel was NOT re-run.
    expect(runChecksMock).not.toHaveBeenCalled();
  });

  it('bypasses cache when ?fresh=1 is passed', async () => {
    cachedReportMock.mockReturnValue({
      report: { overall: 'healthy', checkedAt: '2026-05-13T00:00:00.000Z', checks: [] },
      ageMs: 30_000,
    });
    runChecksMock.mockResolvedValueOnce({
      overall: 'degraded',
      checkedAt: '2026-05-13T00:00:01.000Z',
      checks: [],
    });
    const app = await makeApp();
    const res = await request(app).get('/api/admin/security-health?fresh=1');
    expect(res.status).toBe(200);
    expect(res.body.overall).toBe('degraded'); // fresh value, not cached
    expect(res.headers['x-security-health-cached']).toBeUndefined();
    expect(runChecksMock).toHaveBeenCalledTimes(1);
  });

  it('re-runs the panel when the cache is stale', async () => {
    cachedReportMock.mockReturnValue({
      report: { overall: 'healthy', checkedAt: '2026-05-13T00:00:00.000Z', checks: [] },
      // 10 minutes old — beyond the 5 minute MAX_CACHED_AGE_MS
      ageMs: 10 * 60 * 1000,
    });
    runChecksMock.mockResolvedValueOnce({
      overall: 'failing',
      checkedAt: '2026-05-13T00:00:01.000Z',
      checks: [],
    });
    const app = await makeApp();
    const res = await request(app).get('/api/admin/security-health');
    expect(res.status).toBe(503);
    expect(res.body.overall).toBe('failing');
    expect(res.headers['x-security-health-cached']).toBeUndefined();
    expect(runChecksMock).toHaveBeenCalledTimes(1);
  });
});
