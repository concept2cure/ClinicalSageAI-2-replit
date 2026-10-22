/**
 * Two doors the Submission Center needed and the router lacked their contract
 * for (QA 2026-10-08, browser walk j6):
 *
 *  - DELETE /api/submissions/sequences/:seqId/leaves/:leafId — the Builder had
 *    no remove control. Its new one sends the reason, as a placement does
 *    (PX-1): a removal decides what leaves a regulator-facing sequence, so the
 *    door refuses one without a reason and hands the reason to the service,
 *    which records it on LEAF_REMOVED. A removal that returned a Validated
 *    sequence to Assembling says so on a header (a 204 has no body).
 *
 *  - POST /api/submissions/sequences/:seqId/governed-precheck — the client
 *    signed a freeze and only then learned the gate refused it. The precheck
 *    runs the step's own gates without a signature and answers 200 with the
 *    refusal: a refusal is the answer here, not an error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-leaf-remove-precheck-secret-32c';
});

const svc = vi.hoisted(() => ({ removeLeaf: vi.fn(), precheckGovernedStep: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    removeLeaf: (...a: unknown[]) => svc.removeLeaf(...a),
    precheckGovernedStep: (...a: unknown[]) => svc.precheckGovernedStep(...a),
  };
});

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  Object.defineProperty(req, 'ip', { value:'192.0.2.17' });
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

beforeEach(() => {
  svc.removeLeaf.mockReset();
  svc.precheckGovernedStep.mockReset();
  svc.removeLeaf.mockResolvedValue({ leafId: 63, auditTrail: { persisted: true, chained: true } });
});

describe('removing a leaf takes its reason', () => {
  it('refuses a removal with no reason, and removes nothing', async () => {
    const res = await request(app).delete('/api/submissions/sequences/5/leaves/63');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(svc.removeLeaf).not.toHaveBeenCalled();
  });

  it('passes the trimmed reason to the service and answers 204', async () => {
    const res = await request(app)
      .delete('/api/submissions/sequences/5/leaves/63')
      .send({ reason: '  Duplicate placement of the cover letter  ' });
    expect(res.status).toBe(204);
    // The route's ctx carries the request's address since f2f656eed (governed-export provenance and audit rows).
    expect(svc.removeLeaf).toHaveBeenCalledWith(63, 5, { userId: 3, organizationId: 7, ipAddress: '192.0.2.17' }, 'Duplicate placement of the cover letter');
    expect(res.headers['x-sequence-status-changed']).toBeUndefined();
  });

  it('says on a header when the removal returned a Validated sequence to Assembling', async () => {
    svc.removeLeaf.mockResolvedValue({
      leafId: 63,
      auditTrail: { persisted: true, chained: true },
      sequenceStatusChanged: { from: 'validated', to: 'assembling', auditTrail: { persisted: true } },
    });
    const res = await request(app)
      .delete('/api/submissions/sequences/5/leaves/63')
      .send({ reason: 'Duplicate placement of the cover letter' });
    expect(res.status).toBe(204);
    expect(res.headers['x-sequence-status-changed']).toBe('validated->assembling');
  });
});

describe('a governed step can be asked before it is signed', () => {
  it('answers the refusal with 200, from the step’s own gates', async () => {
    svc.precheckGovernedStep.mockResolvedValue({
      step: 'freeze',
      cleared: false,
      refusal: 'Dispatch gate blocks frozen: No completed Shadow Review has run for this sequence.',
    });
    const res = await request(app).post('/api/submissions/sequences/6/governed-precheck').send({ step: 'freeze' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cleared: false, refusal: expect.stringMatching(/Shadow Review/) });
    expect(svc.precheckGovernedStep).toHaveBeenCalledWith(6, 'freeze', { userId: 3, organizationId: 7, ipAddress: '192.0.2.17' }, expect.anything());
    // The options the route hands the step, key for key (toStrictEqual counts an
    // undefined key): a freeze names no transmit destination, no finding and no
    // disposition, and none is invented for it.
    expect(svc.precheckGovernedStep.mock.calls[0][3]).toStrictEqual({
      environment: undefined,
      applicationId: undefined,
      findingId: undefined,
      disposition: undefined,
    });
  });

  it('hands a finding disposition precheck the finding and the disposition it names (P-35)', async () => {
    svc.precheckGovernedStep.mockResolvedValue({ step: 'shadow-finding-disposition', cleared: true, refusal: null });
    const res = await request(app)
      .post('/api/submissions/sequences/6/governed-precheck')
      .send({ step: 'shadow-finding-disposition', findingId: 41, disposition: 'accepted' });
    expect(res.status).toBe(200);
    expect(svc.precheckGovernedStep.mock.calls[0].slice(0, 3)).toEqual([
      6, 'shadow-finding-disposition', { userId: 3, organizationId: 7, ipAddress: '192.0.2.17' },
    ]);
    expect(svc.precheckGovernedStep.mock.calls[0][3]).toStrictEqual({
      environment: undefined,
      applicationId: undefined,
      findingId: 41,
      disposition: 'accepted',
    });
  });

  it('refuses an unknown step', async () => {
    const res = await request(app).post('/api/submissions/sequences/6/governed-precheck').send({ step: 'publish' });
    expect(res.status).toBe(400);
    expect(svc.precheckGovernedStep).not.toHaveBeenCalled();
  });
});
