/**
 * POST …/governance/decisions/:decisionId/transition answers a refusal as a
 * refusal (409 / 422, with the reason), a missing decision as 404, and a
 * failure as a 500 with a fixed message.
 *
 * What the code used to do (until 2026-10-15): every `success: false` from the
 * lifecycle was `sendError(res, 400, result.error)` — a move the decision's
 * recorded state does not allow, an action missing what it needs, a decision
 * that is not there, a decision that moved but whose transition event was not
 * written, and a database error alike. The last carried the driver's message
 * (the repository returns `err.message`) to the client under a "bad request".
 *
 * The real route, controller and repository run; only the decision store, the
 * pool and the request middleware are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { st } = vi.hoisted(() => ({
  st: {
    row: null as null | { id: string; actionState: string },
    lookupError: null as null | Error,
    eventWriteFails: false,
  },
}));

vi.mock('../../../db', () => ({
  db: {},
  pool: {
    query: vi.fn(async () => {
      if (st.eventWriteFails) throw new Error('relation "governed_decision_transitions" is locked');
      return { rows: [], rowCount: 1 };
    }),
  },
}));
vi.mock('../../../services/decision-record-service', () => ({
  decisionRecordService: {
    getByDecisionCode: vi.fn(async () => {
      if (st.lookupError) throw st.lookupError;
      return st.row;
    }),
    getById: vi.fn(async () => null),
    transition: vi.fn(async (_id: string, input: { actionState: string }) => (st.row ? { ...st.row, actionState: input.actionState } : null)),
  },
}));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../project-access', () => ({ verifyProjectAccess: vi.fn(async () => true) }));

import router from '../governance-ops';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { userId: 7, organizationId: 1 });
  next();
});
app.use('/api/concept2cure', router);

const transition = (body: Record<string, unknown>) =>
  request(app).post('/api/concept2cure/projects/10/governance/decisions/dec-1/transition').send(body);

beforeEach(() => {
  st.row = { id: 'row-1', actionState: 'under_review' };
  st.lookupError = null;
  st.eventWriteFails = false;
});

describe('a refused transition is answered as a refusal, with the reason', () => {
  it('409 for a move the decision\'s recorded state does not allow', async () => {
    st.row = { id: 'row-1', actionState: 'superseded' };
    const res = await transition({ action: 'approve' });
    expect(res.status, 'a lifecycle refusal was answered 400').toBe(409);
    expect(res.body.error.message).toMatch(/Invalid transition: superseded → approved/);
  });

  it('422 for an action missing what it needs', async () => {
    const res = await transition({ action: 'reject' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Rejection requires a reason');
  });

  it('404 for a decision that is not on record', async () => {
    st.row = null;
    const res = await transition({ action: 'approve' });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Decision not found');
  });
});

describe('a failed transition is a 500 with a fixed message', () => {
  it('a database error — its text is not in the body', async () => {
    st.lookupError = new Error('connection to db-prod-7.internal:5432 terminated unexpectedly');
    const res = await transition({ action: 'approve' });
    expect(res.status, 'a database failure was answered 400 with the driver text').toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/db-prod-7|terminated/);
  });

  it('a decision that moved but whose transition event was not written', async () => {
    st.eventWriteFails = true;
    const res = await transition({ action: 'approve' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/governed_decision_transitions|locked/);
  });

  it('a completed transition is 200 (control)', async () => {
    const res = await transition({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ success: true, previousState: 'under_review', newState: 'approved' });
  });
});
