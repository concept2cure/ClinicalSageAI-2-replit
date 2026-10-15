/**
 * POST /api/authoring-actions/contradiction-consequence names a real actor and
 * answers a refusal or a failure as one.
 *
 * A request with no user was attributed to 'system' on the decision, its
 * receipt and the consequence log, and every outcome — including "nothing was
 * created" — answered 200.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  getFinding: vi.fn(),
  executeConsequence: vi.fn(),
}));

vi.mock('../../services/contradiction-engine-service.js', () => ({
  contradictionEngineService: { getFinding: H.getFinding },
}));
vi.mock('../../services/contradiction-consequence-service.js', () => ({
  contradictionConsequenceService: { executeConsequence: H.executeConsequence },
}));

import authoringActionsRouter from '../authoring-actions';

function app(user: { userId?: unknown } = { userId: 7 }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).tenantId = 3;
    if (user.userId !== undefined) (req as any).userId = user.userId;
    next();
  });
  a.use('/api/authoring-actions', authoringActionsRouter);
  return a;
}

const BODY = { findingId: '6f1c2b1e-8a4d-4c55-9a51-0d2f3c4b5a69', consequenceType: 'contradiction_memo' };

beforeEach(() => {
  vi.clearAllMocks();
  H.getFinding.mockResolvedValue({ id: BODY.findingId, projectId: 12 });
});

describe('POST /contradiction-consequence', () => {
  it('refuses a request with no user rather than attributing it to "system"', async () => {
    const res = await request(app({})).post('/api/authoring-actions/contradiction-consequence').send(BODY);
    expect(res.status).toBe(401);
    expect(H.executeConsequence).not.toHaveBeenCalled();
  });

  it('refuses an actor that is not a user id', async () => {
    const res = await request(app({ userId: 'system' })).post('/api/authoring-actions/contradiction-consequence').send(BODY);
    expect(res.status).toBe(401);
    expect(H.executeConsequence).not.toHaveBeenCalled();
  });

  it('passes the signed-in user as the actor', async () => {
    H.executeConsequence.mockResolvedValue({
      success: true, consequenceObjectId: '4321', consequenceObjectType: 'contradiction_memo',
      decision: { id: 'dec-1' }, receipt: { id: 'rcpt-1' }, link: {},
    });
    const res = await request(app()).post('/api/authoring-actions/contradiction-consequence').send(BODY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'executed', consequenceObjectId: '4321', receiptId: 'rcpt-1' });
    expect(H.executeConsequence).toHaveBeenCalledWith(
      expect.objectContaining({ id: BODY.findingId }), 'contradiction_memo', '7', expect.objectContaining({ organizationId: 3 }));
  });

  it('answers an escalation as escalated, not executed', async () => {
    H.executeConsequence.mockResolvedValue({
      success: true, consequenceObjectId: 'dec-1', consequenceObjectType: 'escalation',
      decision: { id: 'dec-1' }, receipt: { id: 'rcpt-1' }, link: {},
    });
    const res = await request(app()).post('/api/authoring-actions/contradiction-consequence')
      .send({ ...BODY, consequenceType: 'escalation' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('escalated');
  });

  it('answers a refusal (nothing recorded) with 422', async () => {
    H.executeConsequence.mockResolvedValue({
      success: false, consequenceObjectId: null, consequenceObjectType: 'review_thread',
      decision: null, receipt: null, link: null,
      error: 'No review thread can be created: the platform has no record of that kind. Nothing was recorded.',
    });
    const res = await request(app()).post('/api/authoring-actions/contradiction-consequence')
      .send({ ...BODY, consequenceType: 'review_thread' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ status: 'failed', error: expect.stringMatching(/Nothing was recorded/) });
  });

  it('answers a failure part-way with 500 and what was already recorded', async () => {
    H.executeConsequence.mockResolvedValue({
      success: false, consequenceObjectId: '4321', consequenceObjectType: 'contradiction_memo',
      decision: { id: 'dec-1' }, receipt: null, link: null,
      error: 'Invalid transition: confirmed → executed',
    });
    const res = await request(app()).post('/api/authoring-actions/contradiction-consequence').send(BODY);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ status: 'failed', decisionId: 'dec-1', consequenceObjectId: '4321' });
  });
});
