/**
 * P-92 C3 (P-108 1(c); design §10.5 E (i)): the door for re-opening a settlement on FDA's verified answer, and its
 * precheck. POST /api/submissions/sequences/:seqId/held-send/reopen takes the signature's actionId and nothing else: the
 * signature carries the settlement, FDA's answer, the statement and the reason. The precheck is answered at the route by
 * its own function. The act and its rules are the service's; this pins the door.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-held-send-reopen-secret-32';
});

const svc = vi.hoisted(() => ({ recordHeldSendReopen: vi.fn(), precheckHeldSendReopen: vi.fn(), precheckGovernedStep: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    recordHeldSendReopen: (...a: unknown[]) => svc.recordHeldSendReopen(...a),
    precheckHeldSendReopen: (...a: unknown[]) => svc.precheckHeldSendReopen(...a),
    precheckGovernedStep: (...a: unknown[]) => svc.precheckGovernedStep(...a),
  };
});

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';
import { SubmissionError } from '../../services/submission-service/submission-service';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

const ACT = '/api/submissions/sequences/6/held-send/reopen';
const PRECHECK = '/api/submissions/sequences/6/governed-precheck';

beforeEach(() => {
  svc.recordHeldSendReopen.mockReset();
  svc.precheckHeldSendReopen.mockReset();
  svc.precheckGovernedStep.mockReset();
});

describe('the re-open door', () => {
  it('refuses a body without the signature, and re-opens nothing', async () => {
    for (const body of [{}, { signatureActionId: '' }, { signatureActionId: 'x'.repeat(129) }]) {
      const res = await request(app).post(ACT).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    expect(svc.recordHeldSendReopen).not.toHaveBeenCalled();
  });

  it('passes the sequence, the signature and the caller, and answers the record', async () => {
    svc.recordHeldSendReopen.mockResolvedValue({ reopened: true, sequenceId: 6, sequenceNumber: '0000', dispatchStatus: 'sent' });
    const res = await request(app).post(ACT).send({ signatureActionId: 'act_1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reopened: true, dispatchStatus: 'sent' });
    expect(svc.recordHeldSendReopen).toHaveBeenCalledWith({ sequenceId: 6, signatureActionId: 'act_1' }, expect.objectContaining({ organizationId: 7, userId: 3 }));
  });

  it("answers the act's refusal as 409 in its own words", async () => {
    svc.recordHeldSendReopen.mockRejectedValue(new SubmissionError('HELD_SEND_NOT_REOPENABLE', "Sequence 0000's settlement is already re-opened on FDA's answer. Nothing was changed."));
    const res = await request(app).post(ACT).send({ signatureActionId: 'act_1' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'HELD_SEND_NOT_REOPENABLE', message: "Sequence 0000's settlement is already re-opened on FDA's answer. Nothing was changed." });
  });
});

describe("the re-open's precheck, answered at the route", () => {
  it('sends the step to its own function, never to the generic precheck', async () => {
    svc.precheckHeldSendReopen.mockResolvedValue({ step: 'held-send-reopen', cleared: true, refusal: null, reopen: { sequenceNumber: '0000' } });
    const res = await request(app).post(PRECHECK).send({ step: 'held-send-reopen' });
    expect(res.status).toBe(200);
    expect(svc.precheckHeldSendReopen).toHaveBeenLastCalledWith(6, expect.objectContaining({ organizationId: 7, userId: 3 }));
    expect(svc.precheckGovernedStep).not.toHaveBeenCalled();
  });
});
