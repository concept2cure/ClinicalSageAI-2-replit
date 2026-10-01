/**
 * GET /api/insights-canvas/overview — a failed portfolio read is an error, not
 * an empty organisation (review round 1, honest-state M5).
 *
 * The route swallowed a rejection of fetchOrgPortfolioSummary and answered 200
 * with leadProgram null, so the Reporting canvas said "No program readiness
 * yet" for a read that failed. Now: 503 PORTFOLIO_UNAVAILABLE with a static
 * sentence (the detail goes to the log only). An organisation that genuinely
 * has no program still gets the 200 empty.
 *
 * The router's own imports are real; the entitlement gate, the segment
 * derivation and the portfolio fetch are replaced, because the contract under
 * test is what the handler does with each outcome of the portfolio read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ summary: vi.fn(), gate: vi.fn(), segments: vi.fn() }));

vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/segment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/segment')>()),
  deriveOrgSegments: h.segments,
}));
vi.mock('../../services/report-os/portfolio/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/portfolio/fetch')>()),
  fetchOrgPortfolioSummary: h.summary,
}));

import createInsightsCanvasRoutes from '../insights-canvas-routes';

const app = express();
app.use('/api/insights-canvas', createInsightsCanvasRoutes());
const overview = () => request(app).get('/api/insights-canvas/overview');

const PROGRAM = {
  projectId: 12, name: 'ABC-101', code: 'ABC-101', indication: null, readinessScore: 64, confidence: 70,
  status: 'partial', riskLevel: 'medium', criticalBlockerCount: 1,
};

beforeEach(() => {
  h.gate.mockReset().mockResolvedValue({ entitled: false, feature: 'portfolio_rollup', requiredTier: 'enterprise', tier: 'standard' });
  h.segments.mockReset().mockResolvedValue(['pharma']);
  h.summary.mockReset();
});

describe('GET /overview and the portfolio read', () => {
  it('answers 503 PORTFOLIO_UNAVAILABLE when the portfolio read fails, never the empty answer', async () => {
    h.summary.mockRejectedValue(new Error('connection reset by peer at 10.0.3.7:5432'));
    const res = await overview();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'PORTFOLIO_UNAVAILABLE', message: expect.any(String) },
    });
    expect(res.body.error.message).not.toMatch(/connection reset|10\.0\.3\.7/);
    expect(res.body).not.toHaveProperty('data');
  });

  it('still answers 200 with leadProgram null for an organisation that has no program', async () => {
    h.summary.mockResolvedValue(null);
    const res = await overview();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.leadProgram).toBeNull();
    expect(res.body.data.reportTypes.length).toBeGreaterThan(0);
  });

  it('answers 200 with the flagship program when there are programs', async () => {
    h.summary.mockResolvedValue({ memberCount: 1, attentionRanked: [PROGRAM], truncated: false });
    const res = await overview();
    expect(res.status).toBe(200);
    expect(res.body.data.leadProgram).toMatchObject({ projectId: 12, readiness: 64 });
  });

  /* L189 (reporting review 2026-10-01): the lead said scope 'program' with a
     project id, and the canvas runs its reports over the scope it is given, so
     POST /runs computed them over the report program group whose serial id
     equalled the project id. */
  it('names the lead program as the project its readiness was computed for', async () => {
    h.summary.mockResolvedValue({ memberCount: 1, attentionRanked: [PROGRAM], truncated: false });
    const res = await overview();
    expect(res.body.data.leadProgram).toMatchObject({ scope: 'project', scopeId: '12', projectId: 12 });
  });
});
