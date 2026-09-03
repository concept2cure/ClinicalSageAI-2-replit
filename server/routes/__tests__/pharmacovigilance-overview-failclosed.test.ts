/**
 * GET /api/pharmacovigilance/overview — fail-CLOSED contract.
 *
 * The twin of pharmacovigilance-board-failclosed, and worse: the overview handler
 * ran four safety reads under Promise.allSettled and coerced every REJECTED read
 * to []. With totalEvents then 0, the complianceRate ternary yields 100 — so a
 * failed read published a fabricated "100% compliant, 0 overdue, 0 pending
 * signals" KPI snapshot to the pv-cockpit surface (HTTP 200, success:true),
 * defeating that surface's own error-vs-zero machinery. A safety KPI snapshot
 * must fail closed: any rejected read → 500, never a manufactured all-clear.
 *
 * The four services each map the legitimately-unprovisioned 42P01 case to []
 * internally, so a rejection reaching the route is always a real fault.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const getOverdueReports = vi.fn();
const getPendingSignals = vi.fn();
const getUpcomingReports = vi.fn();
const getAdverseEvents = vi.fn();
vi.mock('../../services/compliance/pharmacovigilanceService', () => ({
  getOverdueReports: (...a: unknown[]) => getOverdueReports(...a),
  getPendingSignals: (...a: unknown[]) => getPendingSignals(...a),
  getUpcomingReports: (...a: unknown[]) => getUpcomingReports(...a),
  getAdverseEvents: (...a: unknown[]) => getAdverseEvents(...a),
}));

import createPharmacovigilanceRoutes from '../pharmacovigilance-routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { tenantId: number }).tenantId = org;
    next();
  });
  app.use('/api/pharmacovigilance', createPharmacovigilanceRoutes());
  return app;
}

beforeEach(() => {
  getOverdueReports.mockReset();
  getPendingSignals.mockReset();
  getUpcomingReports.mockReset();
  getAdverseEvents.mockReset();
});

describe('GET /api/pharmacovigilance/overview — a failed read is never a masked 100% all-clear', () => {
  it('a rejected adverse-events read → 500, NOT 200 with complianceRate:100', async () => {
    getOverdueReports.mockResolvedValueOnce([]);
    getPendingSignals.mockResolvedValueOnce([]);
    getUpcomingReports.mockResolvedValueOnce([]);
    getAdverseEvents.mockRejectedValueOnce(new Error('ECONNRESET reading adverse_events'));
    const res = await request(appWith(7)).get('/api/pharmacovigilance/overview');
    expect(res.status).toBe(500);
    expect(res.body?.success).not.toBe(true);
    // The manufactured safety clearance must not appear on a failed read.
    expect(JSON.stringify(res.body)).not.toContain('"complianceRate":100');
  });

  it('a rejected overdue-reports read is equally fatal — one read down is unreadable', async () => {
    getOverdueReports.mockRejectedValueOnce(new Error('ETIMEDOUT reading regulatory_reports'));
    getPendingSignals.mockResolvedValueOnce([]);
    getUpcomingReports.mockResolvedValueOnce([]);
    getAdverseEvents.mockResolvedValueOnce([]);
    const res = await request(appWith(7)).get('/api/pharmacovigilance/overview');
    expect(res.status).toBe(500);
  });

  it('a genuinely empty overview (all four reads resolve []) still returns 200 — legit unprovisioned', async () => {
    getOverdueReports.mockResolvedValueOnce([]);
    getPendingSignals.mockResolvedValueOnce([]);
    getUpcomingReports.mockResolvedValueOnce([]);
    getAdverseEvents.mockResolvedValueOnce([]);
    const res = await request(appWith(7)).get('/api/pharmacovigilance/overview');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.kpis.overdueReports).toBe(0);
  });
});
