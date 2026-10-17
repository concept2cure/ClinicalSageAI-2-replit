/**
 * /api/statistical-defensibility judges what it was given, and says whether its
 * verdict reached the decision ledger.
 *
 * POST /sample-size filled a missing power with 0.8, effect size with 0.5,
 * alpha with 0.05, dropout rate with 0.15 (a stated 0 too: `0 || 0.15`) and
 * endpoint type with 'continuous', then judged them — a request that stated no
 * power was told "Adequately powered". POST /assess wrote its verdict to the
 * decision ledger and, when that write failed, logged a warning and answered as
 * though nothing had been asked: the response simply had no decisionRecord.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('../../services/operating-system-integration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/operating-system-integration')>()),
  OperatingSystemIntegration: { getInstance: () => ({ captureFromDefensibilityAssessment: H.capture }) },
}));

import router from '../statistical-defensibility';
import { statisticalDefensibilityService } from '../../services/statistical-defensibility-service';

function app(user: Record<string, unknown> | null = { id: 41, organizationId: 3 }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    if (user) (req as any).user = user;
    next();
  });
  a.use('/api/statistical-defensibility', router);
  return a;
}

const ASSESSED = {
  status: 'assessed',
  engine: 'deterministic',
  sampleSize: 128,
  power: 0.8,
  judgment: {
    overallVerdict: 'marginal',
    overallRisk: 'moderate',
    actionRecommendation: 'proceed_with_conditions',
    dimensions: [{ name: 'Power', verdict: 'marginal', score: 60, rationale: 'r', flags: [] }],
    escalationReasons: [],
  },
};

beforeEach(() => {
  H.capture.mockReset();
  vi.spyOn(statisticalDefensibilityService, 'assessDefensibility').mockResolvedValue(ASSESSED as never);
});

describe('POST /sample-size', () => {
  it('refuses to judge a design whose power, effect, alpha, dropout and endpoint type were not stated', async () => {
    const res = await request(app()).post('/api/statistical-defensibility/sample-size').send({
      indication: 'NSCLC',
      phase: '3',
      plannedSampleSize: 450,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error).toMatch(/Missing or invalid: endpointType, effectSize, alpha, power, dropoutRate\./);
    expect(res.body.data).toBeUndefined();
  });

  it('judges a stated dropout of 0 as 0, not as 15%', async () => {
    const res = await request(app()).post('/api/statistical-defensibility/sample-size').send({
      indication: 'NSCLC',
      phase: '3',
      plannedSampleSize: 450,
      endpointType: 'continuous',
      effectSize: 0.4,
      alpha: 0.05,
      power: 0.9,
      dropoutRate: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.issues).toContain('Dropout rate of 0% may be optimistic for a Phase 3 study');
  });
});

describe('POST /assess — the decision ledger', () => {
  it('says the verdict was not recorded when the ledger write failed', async () => {
    H.capture.mockImplementation(async () => {
      throw new Error('connection terminated unexpectedly');
    });
    const res = await request(app()).post('/api/statistical-defensibility/assess').send({ projectId: 12 });
    expect(res.status).toBe(200);
    expect(res.body.decisionCapture).toEqual({
      recorded: false,
      reason: 'capture_failed',
      error: expect.stringMatching(/decision ledger/),
    });
    expect(JSON.stringify(res.body)).not.toContain('connection terminated');
  });

  it('says the verdict was not recorded when no project was named', async () => {
    const res = await request(app()).post('/api/statistical-defensibility/assess').send({});
    expect(res.status).toBe(200);
    expect(res.body.decisionCapture).toEqual({
      recorded: false,
      reason: 'no_project_context',
      message: expect.stringMatching(/not recorded in the decision ledger/),
    });
    expect(H.capture).not.toHaveBeenCalled();
  });

  it('names the decision it recorded', async () => {
    H.capture.mockResolvedValue({ id: 'd-7' });
    const res = await request(app()).post('/api/statistical-defensibility/assess').send({ projectId: 12 });
    expect(res.body.decisionCapture).toEqual({ recorded: true, decisionId: 'd-7' });
    const [ctx] = H.capture.mock.calls[0] as [Record<string, unknown>];
    expect(ctx).not.toHaveProperty('confidence');
    expect(ctx.createdById).toBe(41);
  });
});
