/**
 * POST /api/insights/predictions validates a readiness_trajectory input as the
 * shape the assembler reads (ReadinessTrajectoryInput), not a retired one.
 *
 * The route's schema still required predictedReviewTimeDays,
 * predictedDeficiencyCount and a numeric predictedApprovalProbability after the
 * engine's input changed: reviewClockDays and reviewClockBasis (nullable), an
 * unmetCriteriaCount, and a predictedApprovalProbability that is null whenever
 * no approval-probability model backs it (always, today). A correct input was
 * refused with 400, and a retired-shape input was accepted and assembled with
 * the review clock and the unmet-criteria count read as `undefined`.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 5, role: 'member', organizationId: 7 };
    req.userRole = 'member';
    next();
  },
}));

import insightsRouter from '../report-os-insights';

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRouter);

const META = { reportTypeId: 'prediction.readiness_trajectory', scopeType: 'project', scopeId: '11', generatedAt: '2026-10-15T00:00:00.000Z' };

/** A ReadinessTrajectoryInput exactly as the type declares it. */
const ENGINE_INPUT = {
  kind: 'readiness_trajectory',
  overallScore: 64,
  predictedApprovalProbability: null,
  reviewClockDays: 300,
  reviewClockBasis: 'PDUFA standard review goal for an original NDA',
  unmetCriteriaCount: 3,
};

type Block = { kind: string; label?: string; value?: unknown; text?: string };
const blocks = (body: any): Block[] => (body.data.sections as Array<{ blocks: Block[] }>).flatMap(s => s.blocks);
const metric = (body: any, label: string) => blocks(body).find(b => b.kind === 'metric' && b.label === label);

describe('POST /api/insights/predictions — readiness_trajectory', () => {
  it('accepts the engine input, with no approval probability, and renders the review clock and unmet criteria', async () => {
    const res = await request(app).post('/api/insights/predictions').send({ input: ENGINE_INPUT, meta: META });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(metric(res.body, 'Agency review clock for this pathway')?.value).toBe(300);
    expect(metric(res.body, 'Criteria not met or partially met')?.value).toBe(3);
    expect(metric(res.body, 'Approval probability')).toBeUndefined();
  });

  it('accepts a submission type with no review clock on record (both clock fields null)', async () => {
    const res = await request(app)
      .post('/api/insights/predictions')
      .send({ input: { ...ENGINE_INPUT, reviewClockDays: null, reviewClockBasis: null }, meta: META });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(blocks(res.body).some(b => b.kind === 'summary' && /No statutory review clock/.test(b.text ?? ''))).toBe(true);
  });

  it('refuses the retired shape instead of assembling "undefined" for the clock and the unmet count', async () => {
    const retired = {
      kind: 'readiness_trajectory',
      overallScore: 64,
      predictedApprovalProbability: 0.51,
      predictedReviewTimeDays: 300,
      predictedDeficiencyCount: 3,
    };
    const res = await request(app).post('/api/insights/predictions').send({ input: retired, meta: META });

    expect(res.status).toBe(400);
  });
});
