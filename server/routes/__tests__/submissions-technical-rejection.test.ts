/**
 * P-92 C4 (P-108 1(a); design §10.5 C): the door for FDA's failed Ack3, recorded on a sequence by a signed act, and its
 * precheck. POST /api/submissions/sequences/:seqId/technical-rejection takes the signature's actionId and nothing else:
 * the signature carries FDA's Ack3, the statement and the reason. The precheck is answered at the route by its own
 * function, as the settlement's and P-86's retirement are. The act and its rules are the service's; this pins the door.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-technical-rejection-secret-32';
});

const svc = vi.hoisted(() => ({ recordTechnicalRejection: vi.fn(), precheckTechnicalRejection: vi.fn(), precheckGovernedStep: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    recordTechnicalRejection: (...a: unknown[]) => svc.recordTechnicalRejection(...a),
    precheckTechnicalRejection: (...a: unknown[]) => svc.precheckTechnicalRejection(...a),
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

const ACT = '/api/submissions/sequences/6/technical-rejection';
const PRECHECK = '/api/submissions/sequences/6/governed-precheck';
const DOC = '0b000000-0000-4000-8000-000000000003';

beforeEach(() => {
  svc.recordTechnicalRejection.mockReset();
  svc.precheckTechnicalRejection.mockReset();
  svc.precheckGovernedStep.mockReset();
});

describe("the technical rejection's door", () => {
  it('refuses a body without the signature, and records nothing', async () => {
    for (const body of [{}, { signatureActionId: '' }, { signatureActionId: 'x'.repeat(129) }]) {
      const res = await request(app).post(ACT).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    expect(svc.recordTechnicalRejection).not.toHaveBeenCalled();
  });

  it('passes the sequence, the signature and the caller, and answers the record', async () => {
    svc.recordTechnicalRejection.mockResolvedValue({ recorded: true, sequenceId: 6, sequenceNumber: '0000', dispatchStatus: 'rejected' });
    const res = await request(app).post(ACT).send({ signatureActionId: 'act_1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ recorded: true, dispatchStatus: 'rejected' });
    expect(svc.recordTechnicalRejection).toHaveBeenCalledWith({ sequenceId: 6, signatureActionId: 'act_1' }, expect.objectContaining({ organizationId: 7, userId: 3 }));
  });

  it("answers the act's refusal as 409 in its own words", async () => {
    svc.recordTechnicalRejection.mockRejectedValue(new SubmissionError('TECHNICAL_REJECTION_NOT_RECORDABLE', 'Sequence 0000 is already recorded as rejected by FDA. Nothing was changed.'));
    const res = await request(app).post(ACT).send({ signatureActionId: 'act_1' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'TECHNICAL_REJECTION_NOT_RECORDABLE', message: 'Sequence 0000 is already recorded as rejected by FDA. Nothing was changed.' });
  });
});

describe("the technical rejection's precheck, answered at the route", () => {
  it('sends the step, with or without the Ack3, to its own function, never to the generic precheck', async () => {
    svc.precheckTechnicalRejection.mockResolvedValue({ step: 'technical-rejection', cleared: true, refusal: null, rejection: { sequenceNumber: '0000' } });
    for (const [body, choice] of [[{ step: 'technical-rejection' }, {}], [{ step: 'technical-rejection', evidenceDocumentId: DOC }, { evidenceDocumentId: DOC }]] as const) {
      const res = await request(app).post(PRECHECK).send(body);
      expect(res.status, JSON.stringify(body)).toBe(200);
      expect(svc.precheckTechnicalRejection).toHaveBeenLastCalledWith(6, expect.objectContaining({ organizationId: 7, userId: 3 }), choice);
    }
    expect(svc.precheckGovernedStep).not.toHaveBeenCalled();
  });

  it('refuses an evidence document that is not an id, and asks nothing', async () => {
    const res = await request(app).post(PRECHECK).send({ step: 'technical-rejection', evidenceDocumentId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(svc.precheckTechnicalRejection).not.toHaveBeenCalled();
  });
});
