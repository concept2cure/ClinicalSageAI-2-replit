/**
 * GET /api/report-os/portfolio/org — an entitled organisation with no
 * programs is an empty answer, not a missing resource (launch sweep findings
 * 42, 6 and 7).
 *
 * It answered 404 {"error":"No programs found for this organization"} with no
 * machine code, which AnA Command rendered as "the rollup didn't respond …
 * sign in and retry, or check your plan". Now `200 { data: null }` — never an
 * aggregate over no rows, which would compute a 0% average readiness.
 *
 * The router's own imports are real; the database facade, the auth middleware,
 * the entitlement gate and the portfolio fetch are replaced, because the
 * contract under test is what the handler does with a null summary.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
const gate = vi.hoisted(() => vi.fn());
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: gate,
}));
const summary = vi.hoisted(() => vi.fn());
vi.mock('../../services/report-os/portfolio/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/portfolio/fetch')>()),
  fetchOrgPortfolioSummary: summary,
}));

import reportOsRouter from '../report-os';

const app = express();
app.use('/api/report-os', reportOsRouter);

beforeEach(() => {
  gate.mockReset().mockResolvedValue({ entitled: true });
  summary.mockReset();
});

describe('GET /portfolio/org', () => {
  it('answers 200 with data: null when the organisation has no programs', async () => {
    summary.mockResolvedValue(null);
    const res = await request(app).get('/api/report-os/portfolio/org');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
  });

  it('still answers the summary when there are programs', async () => {
    summary.mockResolvedValue({ organizationId: 7, truncated: false, attentionRanked: [{ projectId: 1 }] });
    const res = await request(app).get('/api/report-os/portfolio/org');
    expect(res.status).toBe(200);
    expect(res.body.data.attentionRanked).toHaveLength(1);
  });

  it('still refuses an organisation the plan gate refuses', async () => {
    gate.mockResolvedValue({ entitled: false, requiredTier: 'enterprise', feature: 'portfolio.board_pack', tier: 'free' });
    const res = await request(app).get('/api/report-os/portfolio/org');
    expect(res.status).toBe(403);
    expect(summary).not.toHaveBeenCalled();
  });

  it('answers a failed read with 500, never with the empty answer', async () => {
    summary.mockRejectedValue(new Error('connection reset'));
    const res = await request(app).get('/api/report-os/portfolio/org');
    expect(res.status).toBe(500);
    expect(res.body).not.toEqual({ data: null });
  });
});
