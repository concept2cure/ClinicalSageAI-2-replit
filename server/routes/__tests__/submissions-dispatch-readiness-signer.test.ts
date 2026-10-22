/**
 * GET /api/submissions/sequences/:seqId/dispatch-readiness — `signer` is the
 * sign step's own answer.
 *
 * The Dispatch tab tells a sequence's creator, before a password is typed, that
 * a colleague must sign its freeze and dispatch. The route used to re-derive
 * that from resolveTargetAuthors itself — a second copy of the author rule that
 * no test covered at all. It now asks signerIndependenceOf, the dry-run of the
 * check the sign step enforces. These pin that the route asks it, for THIS
 * sequence, organization and user, and passes its answer through unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-dispatch-readiness-signer-32ch';
});

const h = vi.hoisted(() => ({
  verdict: 'independent' as string,
  sequence: { status: 'frozen', region: 'fda', dispatchStatus: null as string | null | undefined },
  read: vi.fn(),
  calls: [] as Array<[string, number, number]>,
}));

vi.mock('../../services/submission-service/submission-service', async original => ({
  ...await original<object>(), getSequence: h.read,
}));

vi.mock('../../services/ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({
    sequenceId: 11,
    gate: { cleared: false, blockers: ['The release signature is unsigned.'] },
    freezeGate: { cleared: true, blockers: [] },
    dispatchGateOnSigning: { cleared: true, blockers: [] },
  }),
}));

vi.mock('../../services/governance/separation-of-duties', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/governance/separation-of-duties')>()),
  signerIndependenceOf: async (target: string, orgId: number, signerId: number) => {
    h.calls.push([target, orgId, signerId]);
    return h.verdict;
  },
}));

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

beforeEach(() => {
  h.verdict = 'independent';
  h.calls.length = 0;
  h.sequence = { status: 'frozen', region: 'fda', dispatchStatus: null };
  h.read.mockReset(); h.read.mockImplementation(async () => ({ ...h.sequence }));
});

describe('dispatch-readiness reports the sign step\'s own answer for this signer', () => {
  it('asks the sign step\'s check, for this sequence, organization and user', async () => {
    const res = await request(app).get('/api/submissions/sequences/11/dispatch-readiness');
    expect(res.status).toBe(200);
    expect(h.calls, 'the route answered without asking the enforcing check').toEqual([['ectd-sequence:11', 7, 3]]);
    expect(h.read).toHaveBeenCalledWith(11, expect.objectContaining({ organizationId: 7, userId: 3 }));
  });

  it.each(['author', 'independent', 'unresolved', 'unverified'])('passes "%s" through unchanged', async (verdict) => {
    h.verdict = verdict;
    const res = await request(app).get('/api/submissions/sequences/11/dispatch-readiness');
    expect(res.body.signer).toEqual({ state: verdict });
  });

  it('still returns the assessment it was always answering with', async () => {
    const res = await request(app).get('/api/submissions/sequences/11/dispatch-readiness');
    expect(res.body.gate).toEqual({ cleared: false, blockers: ['The release signature is unsigned.'] });
    expect(res.body.dispatchGateOnSigning).toEqual({ cleared: true, blockers: [] });
  });
  it.each([null, 'pending', 'rejected', 'transmitting', 'sent', 'acknowledged', undefined])('reports canonical FDA dispatch renewal eligibility for %s', async dispatchStatus => {
    h.sequence = { status: 'dispatched', region: 'fda', dispatchStatus };
    const res = await request(app).get('/api/submissions/sequences/11/dispatch-readiness');
    const eligible = dispatchStatus === null || dispatchStatus === 'pending' || dispatchStatus === 'rejected';
    expect(res.status).toBe(200);
    expect(res.body.dispatchAuthorization).toMatchObject({ reauthorizing: true, eligible });
    expect(res.body.dispatchAuthorization.refusal === null).toBe(eligible);
  });

});
