/**
 * POST /api/submissions/sequences/:seqId/shadow-review/findings/:findingId/disposition
 * (P-35, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * The door for closing one open critical Shadow Review finding by a Part 11
 * signature. It takes the signature's actionId and the disposition — 'accepted'
 * (risk accepted) or 'fixed' — and nothing else: the signature's own reason is
 * the disposition's reason. The act is the service's (dispositionShadowFinding);
 * this pins what the door answers: 400 for a malformed body or id, 403
 * GOVERNED_REQUIRED for a missing, spent, void, wrong-intent or wrong-finding
 * signature, 409 SHADOW_FINDING_NOT_DISPOSABLE with the reason, the precheck
 * accepting the 'shadow-finding-disposition' step with the finding and the
 * disposition, and the findings read carrying the disposition record.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-shadow-finding-disposition-32c';
});

const svc = vi.hoisted(() => ({
  dispositionShadowFinding: vi.fn(),
  precheckGovernedStep: vi.fn(),
  getShadowReviewFindings: vi.fn(),
  withShadowFindingDispositions: vi.fn(),
}));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    dispositionShadowFinding: (...a: unknown[]) => svc.dispositionShadowFinding(...a),
    precheckGovernedStep: (...a: unknown[]) => svc.precheckGovernedStep(...a),
  };
});
vi.mock('../../services/shadow-review/shadow-review-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/shadow-review/shadow-review-service')>()),
  getShadowReviewFindings: (...a: unknown[]) => svc.getShadowReviewFindings(...a),
}));
vi.mock('../../services/ectd/shadow-finding-disposition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ectd/shadow-finding-disposition')>()),
  withShadowFindingDispositions: (...a: unknown[]) => svc.withShadowFindingDispositions(...a),
}));

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';
import { SubmissionError } from '../../services/submission-service/submission-service';

const app = express();
app.use(express.json());
/** The request's pinned connection, as the mount sets it (requestPgClient). */
const requestClient = { query: vi.fn() };
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  req.dbClient = requestClient;
  next();
});
app.use('/api/submissions', submissionsRouter);

const PATH = '/api/submissions/sequences/6/shadow-review/findings/41/disposition';

beforeEach(() => {
  for (const f of Object.values(svc)) f.mockReset();
});

describe('the disposition door', () => {
  it('refuses a malformed body or finding id, and dispositions nothing', async () => {
    for (const body of [
      {},
      { signatureActionId: 'act_1' },
      { disposition: 'accepted' },
      { signatureActionId: '', disposition: 'accepted' },
      { signatureActionId: 'act_1', disposition: 'waived' },
      { signatureActionId: 'act_1', disposition: 'open' },
    ]) {
      const res = await request(app).post(PATH).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    const badId = await request(app)
      .post('/api/submissions/sequences/6/shadow-review/findings/abc/disposition')
      .send({ signatureActionId: 'act_1', disposition: 'accepted' });
    expect(badId.status).toBe(400);
    expect(svc.dispositionShadowFinding).not.toHaveBeenCalled();
  });

  it('hands the sequence, the finding, the disposition and the signature to the service, with the session context', async () => {
    const record = {
      sequenceId: 6, findingId: 41, runId: 12, disposition: 'accepted', signatureActionId: 'act_1', signatureId: 9,
      dispositionRecord: { disposition: 'accepted', disposedBy: 3, disposedByName: 'Dana Reyes', reason: 'Risk accepted for the 30-day window.', signatureState: 'in-force' },
    };
    svc.dispositionShadowFinding.mockResolvedValue(record);
    const res = await request(app).post(PATH).send({ signatureActionId: 'act_1', disposition: 'accepted' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
    expect(svc.dispositionShadowFinding).toHaveBeenCalledWith(
      { sequenceId: 6, findingId: 41, disposition: 'accepted', signatureActionId: 'act_1' },
      expect.objectContaining({ userId: 3, organizationId: 7 }),
    );
  });

  it('a missing, wrong-intent or wrong-finding signature is 403 GOVERNED_REQUIRED', async () => {
    svc.dispositionShadowFinding.mockRejectedValue(
      new SubmissionError('GOVERNED_REQUIRED', 'A valid e-signature is required. Refused: the signature was given for finding #40, not finding #41.'),
    );
    const res = await request(app).post(PATH).send({ signatureActionId: 'act_40', disposition: 'accepted' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/not finding #41/) });
  });

  it('a finding that is not disposable is 409 SHADOW_FINDING_NOT_DISPOSABLE, with the reason', async () => {
    svc.dispositionShadowFinding.mockRejectedValue(
      new SubmissionError('SHADOW_FINDING_NOT_DISPOSABLE', 'Finding #41 cannot be marked fixed: no completed Shadow Review has run on this sequence since run #12.'),
    );
    const res = await request(app).post(PATH).send({ signatureActionId: 'act_1', disposition: 'fixed' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'SHADOW_FINDING_NOT_DISPOSABLE', message: expect.stringMatching(/cannot be marked fixed/) });
  });
});

describe('the precheck asks the disposition rule before anyone signs', () => {
  it("accepts the 'shadow-finding-disposition' step with the finding and the disposition, and answers 200 either way", async () => {
    svc.precheckGovernedStep.mockResolvedValue({ step: 'shadow-finding-disposition', cleared: false, refusal: 'Finding #41 cannot be marked fixed.' });
    const res = await request(app)
      .post('/api/submissions/sequences/6/governed-precheck')
      .send({ step: 'shadow-finding-disposition', findingId: 41, disposition: 'fixed' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ step: 'shadow-finding-disposition', cleared: false });
    expect(svc.precheckGovernedStep).toHaveBeenCalledWith(
      6, 'shadow-finding-disposition', expect.objectContaining({ organizationId: 7 }), expect.objectContaining({ findingId: 41, disposition: 'fixed' }),
    );
  });

  it('a disposition precheck that names no finding or no disposition is 400', async () => {
    for (const body of [
      { step: 'shadow-finding-disposition' },
      { step: 'shadow-finding-disposition', findingId: 41 },
      { step: 'shadow-finding-disposition', disposition: 'accepted' },
      { step: 'shadow-finding-disposition', findingId: 41, disposition: 'waived' },
    ]) {
      const res = await request(app).post('/api/submissions/sequences/6/governed-precheck').send(body);
      expect(res.status).toBe(400);
    }
    expect(svc.precheckGovernedStep).not.toHaveBeenCalled();
  });
});

describe('the findings read carries each disposition', () => {
  it('returns the findings with who closed each, how, when, why and under which signature', async () => {
    const rows = [{ id: 41, runId: 12, severity: 'critical', status: 'accepted' }];
    const enriched = [{
      ...rows[0],
      dispositionsOffered: [],
      laterCompletedRunId: null,
      disposition: {
        disposition: 'accepted', disposedBy: 3, disposedByName: 'Dana Reyes', disposedAt: '2026-10-15T10:00:00.000Z',
        reason: 'Risk accepted for the 30-day window.', signatureActionId: 'act_1', signatureId: 9, meaning: 'approval', signatureState: 'in-force',
      },
    }];
    svc.getShadowReviewFindings.mockResolvedValue(rows);
    svc.withShadowFindingDispositions.mockResolvedValue(enriched);
    const res = await request(app).get('/api/submissions/shadow-review/12/findings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(enriched);
    // Read on the request's own connection, never a second path to the database.
    expect(svc.withShadowFindingDispositions).toHaveBeenCalledWith(requestClient, { organizationId: 7, runId: 12 }, rows);
  });
});
