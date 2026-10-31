/**
 * GET /api/insights-canvas/overview carries the device section (D2, fold F4,
 * 2026-10-30; decision P-61 item 3: device analytics joins Reporting &
 * analytics at its tier, and reads accessible projects only).
 *
 * The section's figures are readDevicePortfolio's (device-portfolio.pglite.test.ts
 * runs its SQL); this pins what the route hands it and what it does with each
 * outcome: the reader's accessible projects and nothing wider, the request's own
 * connection, and a failed read stated as unavailable, never as an empty
 * section, without failing the rest of the canvas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ summary: vi.fn(), device: vi.fn(), accessible: vi.fn() }));

vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: h.accessible,
}));
vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: async () => ({ entitled: false, feature: 'portfolio_rollup', requiredTier: 'enterprise', tier: 'standard', tierResolved: true }),
}));
vi.mock('../../services/report-os/segment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/segment')>()),
  deriveOrgSegments: async () => ['device'],
  deriveProjectSegments: async () => null,
}));
vi.mock('../../services/report-os/portfolio/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/portfolio/fetch')>()),
  fetchOrgPortfolioSummary: h.summary,
}));
vi.mock('../../services/report-os/device-portfolio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/device-portfolio')>()),
  readDevicePortfolio: h.device,
}));

import createInsightsCanvasRoutes from '../insights-canvas-routes';

const requestClient = { query: vi.fn(async () => ({ rows: [] })) };
const app = express();
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: 'manager', organizationId: 7 };
  (req as unknown as { dbClient: unknown }).dbClient = requestClient;
  next();
});
app.use('/api/insights-canvas', createInsightsCanvasRoutes());
const overview = () => request(app).get('/api/insights-canvas/overview');

const COMPUTED = {
  state: 'computed', projectCount: 2, byStatus: [{ status: 'active', count: 2 }],
  pace: { months: ['2026-10'], counts: [1], total: 1 },
  anaDrafts: { state: 'computed', accepted: 1, pending: 1, acceptanceRate: 50 },
};

beforeEach(() => {
  h.summary.mockReset().mockResolvedValue(null);
  h.accessible.mockReset().mockResolvedValue([3, 11]);
  h.device.mockReset().mockResolvedValue(COMPUTED);
});

describe('the overview\'s device section', () => {
  it('is read over the reader\'s accessible projects, on the request\'s own connection', async () => {
    const res = await overview();
    expect(res.status).toBe(200);
    expect(res.body.data.device).toEqual(COMPUTED);
    expect(h.device).toHaveBeenCalledTimes(1);
    const [client, organizationId, projectIds, now] = h.device.mock.calls[0];
    expect(client).toBe(requestClient);
    expect(organizationId).toBe(7);
    expect(projectIds).toEqual([3, 11]);
    expect(now).toBeInstanceOf(Date);
  });

  it('is read even when the reader can open no project, and says so as the engine does', async () => {
    h.accessible.mockResolvedValue([]);
    h.device.mockResolvedValue({ state: 'none' });
    const res = await overview();
    expect(res.status).toBe(200);
    expect(h.device.mock.calls[0][2]).toEqual([]);
    expect(res.body.data.device).toEqual({ state: 'none' });
  });

  it('a failed device read is unavailable, with no detail and nothing else of the canvas withdrawn', async () => {
    h.device.mockRejectedValue(new Error('relation "regulatory_programs" does not exist at 10.0.3.7'));
    const res = await overview();
    expect(res.status).toBe(200);
    expect(res.body.data.device).toEqual({ state: 'unavailable' });
    expect(JSON.stringify(res.body)).not.toMatch(/10\.0\.3\.7|does not exist/);
    expect(res.body.data.reportTypes.length).toBeGreaterThan(0);
  });

  it('a failed portfolio read is still the 503 it was: the device section does not stand in for it', async () => {
    h.summary.mockRejectedValue(new Error('connection reset'));
    const res = await overview();
    expect(res.status).toBe(503);
    expect(res.body).not.toHaveProperty('data');
  });
});
