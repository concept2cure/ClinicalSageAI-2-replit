/**
 * POST /api/submissions/sequences/:seqId/shadow-review/waive (P-34, 2026-10-15).
 *
 * The door for the signed Shadow Review waiver. It takes the signature's
 * actionId and the failed run the waiver relies on, and nothing else — the
 * signature's own reason is the reason. The act is the service's
 * (waiveShadowReview); this pins what the door answers: 400 for a malformed
 * body, 403 GOVERNED_REQUIRED for a missing or wrong-intent signature, 409
 * SHADOW_WAIVER_NOT_ELIGIBLE with the reason when no waiver is offered, and the
 * precheck accepting the 'shadow-waiver' step.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-shadow-review-waive-secret-32c';
});

const svc = vi.hoisted(() => ({ waiveShadowReview: vi.fn(), precheckGovernedStep: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    waiveShadowReview: (...a: unknown[]) => svc.waiveShadowReview(...a),
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

const PATH = '/api/submissions/sequences/6/shadow-review/waive';

beforeEach(() => {
  svc.waiveShadowReview.mockReset();
  svc.precheckGovernedStep.mockReset();
});

describe('the waive door', () => {
  it('refuses a body without the signature or the failed run, and waives nothing', async () => {
    for (const body of [{}, { signatureActionId: 'act_1' }, { failedRunId: 4 }, { signatureActionId: '', failedRunId: 4 }, { signatureActionId: 'act_1', failedRunId: -1 }]) {
      const res = await request(app).post(PATH).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    expect(svc.waiveShadowReview).not.toHaveBeenCalled();
  });

  it('hands the signature and the failed run to the service, with the session context, and answers the record', async () => {
    const record = { sequenceId: 6, failedRunId: 4, failureCode: 'provider_unavailable', signatureActionId: 'act_1', signatureId: 9, waiver: { state: 'active' } };
    svc.waiveShadowReview.mockResolvedValue(record);
    const res = await request(app).post(PATH).send({ signatureActionId: 'act_1', failedRunId: 4 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
    expect(svc.waiveShadowReview).toHaveBeenCalledWith(
      { sequenceId: 6, signatureActionId: 'act_1', failedRunId: 4 },
      expect.objectContaining({ userId: 3, organizationId: 7 }),
    );
  });

  it('a missing or wrong-intent signature is 403 GOVERNED_REQUIRED', async () => {
    svc.waiveShadowReview.mockRejectedValue(
      new SubmissionError('GOVERNED_REQUIRED', "A valid e-signature is required. Refused: the sign action declares intent 'freeze', not 'shadow-waiver'."),
    );
    const res = await request(app).post(PATH).send({ signatureActionId: 'act_freeze', failedRunId: 4 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/not 'shadow-waiver'/) });
  });

  it('a sequence with no waiver on offer is 409 SHADOW_WAIVER_NOT_ELIGIBLE, with the reason', async () => {
    svc.waiveShadowReview.mockRejectedValue(
      new SubmissionError('SHADOW_WAIVER_NOT_ELIGIBLE', "Run #4 failed because the model's reply was not an assessment, which is not an AI provider outage."),
    );
    const res = await request(app).post(PATH).send({ signatureActionId: 'act_1', failedRunId: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'SHADOW_WAIVER_NOT_ELIGIBLE', message: expect.stringMatching(/not an AI provider outage/) });
  });
});

describe('the precheck asks the waiver rule before anyone signs', () => {
  it("accepts the 'shadow-waiver' step and answers 200 either way", async () => {
    svc.precheckGovernedStep.mockResolvedValue({ step: 'shadow-waiver', cleared: false, refusal: 'No Shadow Review has been attempted for this sequence.' });
    const res = await request(app).post('/api/submissions/sequences/6/governed-precheck').send({ step: 'shadow-waiver' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ step: 'shadow-waiver', cleared: false });
    expect(svc.precheckGovernedStep).toHaveBeenCalledWith(6, 'shadow-waiver', expect.objectContaining({ organizationId: 7 }), expect.anything());
  });
});
