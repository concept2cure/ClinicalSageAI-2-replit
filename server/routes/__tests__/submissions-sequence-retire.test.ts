/**
 * POST /api/submissions/sequences/:seqId/retire (P-86, founder 2026-11-01; launch row D7).
 *
 * The door for a sequence's signed retirement. It takes the signature's
 * actionId and nothing else: the signature carries the statement and its own
 * reason. The act is the service's (retireSequence); this pins what the door
 * answers: 400 for a malformed body, the record on success, 409
 * SEQUENCE_NOT_RETIRABLE with what keeps the sequence, 403 GOVERNED_REQUIRED
 * for a missing or wrong signature, 403 FORBIDDEN, and 409 INVALID_STATE.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-sequence-retire-secret-32chars';
});

const svc = vi.hoisted(() => ({ retireSequence: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return { ...actual, retireSequence: (...a: unknown[]) => svc.retireSequence(...a) };
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

const PATH = '/api/submissions/sequences/6/retire';

beforeEach(() => {
  svc.retireSequence.mockReset();
});

describe('the retire door', () => {
  it('refuses a body without the signature, and retires nothing', async () => {
    for (const body of [{}, { signatureActionId: '' }, { signatureActionId: 7 }, { signatureActionId: 'x'.repeat(129) }]) {
      const res = await request(app).post(PATH).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    expect(svc.retireSequence).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a sequence id', async () => {
    const res = await request(app).post('/api/submissions/sequences/abc/retire').send({ signatureActionId: 'act_1' });
    expect(res.status).toBe(400);
    expect(svc.retireSequence).not.toHaveBeenCalled();
  });

  it('hands only the signature to the service, with the session context, and answers the record', async () => {
    const record = {
      retired: true, sequenceId: 6, sequenceNumber: '0000', region: 'fda', retiredAt: '2026-11-09T08:00:00.000Z',
      signatureActionId: 'act_1', signatureId: 9, meaning: 'responsibility', reason: 'A content defect.', numberFreed: true,
    };
    svc.retireSequence.mockResolvedValue(record);
    const res = await request(app).post(PATH).send({ signatureActionId: 'act_1', reason: 'not taken from the body', sequenceId: 99 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
    expect(svc.retireSequence.mock.calls).toEqual([[{ sequenceId: 6, signatureActionId: 'act_1' }, expect.objectContaining({ userId: 3, organizationId: 7 })]]);
  });

  it.each([
    ['SEQUENCE_NOT_RETIRABLE', 409, 'Sequence 0001, numbered after 0000 in this submission, is still in use.'],
    ['GOVERNED_REQUIRED', 403, "A valid e-signature is required. Refused: the sign action declares intent 'freeze', not 'retire'."],
    ['FORBIDDEN', 403, 'You created sequence 0000, so you cannot sign its retirement.'],
    ['INVALID_STATE', 409, 'Sequence 0000 was retired on 2026-11-08 UTC by Riley Retirer. Nothing was changed.'],
  ] as const)('%s is %i, with the sentence', async (code, status, message) => {
    svc.retireSequence.mockRejectedValue(new SubmissionError(code, message));
    const res = await request(app).post(PATH).send({ signatureActionId: 'act_1' });
    expect(res.status).toBe(status);
    expect(res.body.error).toMatchObject({ code, message });
  });
});
