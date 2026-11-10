/**
 * P-92 (founder, 2026-11-02; amended by P-108 1(b)): the door for a held FDA send's signed settlement, and its
 * precheck. Design: docs/evidence/RIM/2026-11-08-designs/p92-settle-held-fda-send.design.md §3.7, §10.3 A.8.
 *
 * POST /api/submissions/sequences/:seqId/held-send/settle takes the signature's actionId and the outcome, nothing
 * else: the signature carries the evidence, the statement and the reason. The precheck is answered at the route by
 * its own function (precheckGovernedStep is at complexity 15), as P-86's retirement is. The act and its rules are the
 * service's; this pins what the door answers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-held-send-settlement-secret-32';
});

const svc = vi.hoisted(() => ({ settleHeldSend: vi.fn(), precheckHeldSendSettlement: vi.fn(), precheckGovernedStep: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    settleHeldSend: (...a: unknown[]) => svc.settleHeldSend(...a),
    precheckHeldSendSettlement: (...a: unknown[]) => svc.precheckHeldSendSettlement(...a),
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

const ACT = '/api/submissions/sequences/6/held-send/settle';
const PRECHECK = '/api/submissions/sequences/6/governed-precheck';
const DOC = '0b000000-0000-4000-8000-000000000001';

beforeEach(() => {
  svc.settleHeldSend.mockReset();
  svc.precheckHeldSendSettlement.mockReset();
  svc.precheckGovernedStep.mockReset();
});

describe('the settlement door', () => {
  it('refuses a body without the signature or with an outcome it does not know, and settles nothing', async () => {
    for (const body of [{}, { signatureActionId: 'act_1' }, { signatureActionId: '', outcome: 'received' },
      { signatureActionId: 'act_1', outcome: 'rolled_back' }, { signatureActionId: 'x'.repeat(129), outcome: 'received' }]) {
      const res = await request(app).post(ACT).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    expect(svc.settleHeldSend).not.toHaveBeenCalled();
  });

  it('hands only the signature and the outcome to the service, with the session context', async () => {
    const record = { settled: true, sequenceId: 6, outcome: 'not-received', dispatchStatus: 'pending', transmittalId: 41 };
    svc.settleHeldSend.mockResolvedValue(record);
    const res = await request(app).post(ACT).send({ signatureActionId: 'act_1', outcome: 'not-received', evidence: { kind: 'platform-proof' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
    expect(svc.settleHeldSend.mock.calls).toEqual([[{ sequenceId: 6, signatureActionId: 'act_1', outcome: 'not-received' }, expect.objectContaining({ userId: 3, organizationId: 7 })]]);
  });

  it.each([
    ['HELD_SEND_NOT_SETTLEABLE', 409, "FDA's signed answer to this send is already kept on the platform, so it is not settled by a signature here."],
    ['GOVERNED_REQUIRED', 403, 'The signature does not settle this held send: it names another attempt of sequence 0000.'],
    ['FORBIDDEN', 403, 'You created sequence 0000, so you cannot sign the settlement of its held send.'],
    ['VALIDATION', 400, "An Ack2 or Ack3 records a send as received; FDA's written confirmation of non-receipt releases it."],
    ['INVALID_STATE', 409, "Whether sequence 0000's held send can be settled could not be checked, so nothing was changed. Try again."],
  ] as const)('%s is %i, with the sentence', async (code, status, message) => {
    svc.settleHeldSend.mockRejectedValue(new SubmissionError(code, message));
    const res = await request(app).post(ACT).send({ signatureActionId: 'act_1', outcome: 'received' });
    expect(res.status).toBe(status);
    expect(res.body.error).toMatchObject({ code, message });
  });
});

describe('the settlement precheck, answered at the route', () => {
  it('sends the step, the outcome, the kind and the document to its own function, never to precheckGovernedStep', async () => {
    const answer = { step: 'held-send-settlement', cleared: true, refusal: null, heldSend: { statement: 'words' } };
    svc.precheckHeldSendSettlement.mockResolvedValue(answer);
    const res = await request(app).post(PRECHECK).send({ step: 'held-send-settlement', outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: DOC });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(answer);
    expect(svc.precheckHeldSendSettlement.mock.calls).toEqual([[6, expect.objectContaining({ userId: 3, organizationId: 7 }), { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: DOC }]]);
    expect(svc.precheckGovernedStep).not.toHaveBeenCalled();
  });

  it('asks the overview with no outcome', async () => {
    svc.precheckHeldSendSettlement.mockResolvedValue({ step: 'held-send-settlement', cleared: true, refusal: null, heldSend: {} });
    const res = await request(app).post(PRECHECK).send({ step: 'held-send-settlement' });
    expect(res.status).toBe(200);
    expect(svc.precheckHeldSendSettlement.mock.calls[0][2]).toEqual({});
  });

  it.each<[Record<string, unknown>, string]>([
    [{ step: 'held-send-settlement', evidenceDocumentId: DOC }, 'a document without an outcome'],
    [{ step: 'held-send-settlement', outcome: 'received' }, 'received without a kind'],
    [{ step: 'held-send-settlement', outcome: 'received', evidenceKind: 'ack9' }, 'a kind it does not know'],
    [{ step: 'held-send-settlement', outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: 'not-a-uuid' }, 'a document that is not a Vault id'],
  ])('refuses %j (%s)', async (body) => {
    const res = await request(app).post(PRECHECK).send(body);
    expect(res.status).toBe(400);
    expect(svc.precheckHeldSendSettlement).not.toHaveBeenCalled();
  });
});
