/**
 * P-99 C2 (F1, rows D7 and D2): the door for putting a sent sequence's send on record, read back from the package it
 * sent, and its precheck. POST /api/submissions/sequences/:seqId/sent-record/rederive takes the person's reason and the
 * manifestSha256 of the read-back they read, and nothing else: no signature, since the content is the kept bytes'. The
 * precheck is answered at the route by its own function. The act and its rules are the service's; this pins the door.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-sent-record-secret-32-chars';
});

const svc = vi.hoisted(() => ({ rederiveSentRecord: vi.fn(), precheckSentRecord: vi.fn(), precheckGovernedStep: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    rederiveSentRecord: (...a: unknown[]) => svc.rederiveSentRecord(...a),
    precheckSentRecord: (...a: unknown[]) => svc.precheckSentRecord(...a),
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

const ACT = '/api/submissions/sequences/6/sent-record/rederive';
const PRECHECK = '/api/submissions/sequences/6/governed-precheck';

beforeEach(() => {
  svc.rederiveSentRecord.mockReset();
  svc.precheckSentRecord.mockReset();
  svc.precheckGovernedStep.mockReset();
});

const SHA = 'a'.repeat(64);

describe('the read-back door', () => {
  it('refuses a body without a reason or the read-back it records, and records nothing', async () => {
    for (const body of [{}, { reason: 'x'.repeat(10) }, { manifestSha256: SHA }, { reason: '', manifestSha256: SHA },
      { reason: 'x'.repeat(10), manifestSha256: 'not-a-sha' }, { reason: 'x'.repeat(2001), manifestSha256: SHA }]) {
      const res = await request(app).post(ACT).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    expect(svc.rederiveSentRecord).not.toHaveBeenCalled();
  });

  it('passes the sequence, the caller, the reason and the read-back, and answers the record', async () => {
    svc.rederiveSentRecord.mockResolvedValue({ recorded: true, sequenceId: 6, sequenceNumber: '0000', leafCount: 2 });
    const res = await request(app).post(ACT).send({ reason: 'Recording what 0000 carried.', manifestSha256: SHA });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ recorded: true, sequenceId: 6 });
    expect(svc.rederiveSentRecord).toHaveBeenCalledWith(6, expect.objectContaining({ organizationId: 7, userId: 3 }), { reason: 'Recording what 0000 carried.', manifestSha256: SHA });
  });

  it("answers the act's refusal as 409 in its own words, and an uncoded error as 500", async () => {
    svc.rederiveSentRecord.mockRejectedValue(new SubmissionError('SENT_RECORD_NOT_RESTORABLE', "Sequence 0000's send is already on record (9 November 2026). Nothing was changed."));
    const refused = await request(app).post(ACT).send({ reason: 'Recording what 0000 carried.', manifestSha256: SHA });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: 'SENT_RECORD_NOT_RESTORABLE', message: "Sequence 0000's send is already on record (9 November 2026). Nothing was changed." });
    svc.rederiveSentRecord.mockRejectedValue(new Error('boom'));
    expect((await request(app).post(ACT).send({ reason: 'Recording what 0000 carried.', manifestSha256: SHA })).status).toBe(500);
  });
});

describe("the read-back's precheck, answered at the route", () => {
  it('sends the step to its own function, never to the generic precheck', async () => {
    svc.precheckSentRecord.mockResolvedValue({ step: 'sent-record', cleared: true, refusal: null, sentRecord: { sequenceNumber: '0000' } });
    const res = await request(app).post(PRECHECK).send({ step: 'sent-record' });
    expect(res.status).toBe(200);
    expect(svc.precheckSentRecord).toHaveBeenLastCalledWith(6, expect.objectContaining({ organizationId: 7, userId: 3 }));
    expect(svc.precheckGovernedStep).not.toHaveBeenCalled();
  });
});
