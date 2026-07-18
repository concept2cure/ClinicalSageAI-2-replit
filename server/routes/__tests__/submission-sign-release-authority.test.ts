/**
 * 21 CFR Part 11 §11.10(g) signing-authority gate on the submission release
 * signing route (POST /api/submissions/:id/sign-release).
 *
 * Identity ≠ authority: a credential-verified signer may apply a release
 * signature only if their organization role carries signing authority. The role
 * is resolved from the persisted membership record (mocked here) and gated by
 * the shared `isSigningAuthorized` policy. The gate fires before any run probing
 * or body parsing, so these tests exercise it directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const resolveSignerOrgRole = vi.hoisted(() => vi.fn());
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));

import signReleaseRouter from '../submission-sign-release';

function appWith(user: { id: number; organizationId: number } | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: unknown }).user = user;
    next();
  });
  app.use('/api/submissions', signReleaseRouter);
  return app;
}

beforeEach(() => resolveSignerOrgRole.mockReset());

describe('POST /api/submissions/:id/sign-release — signing-authority gate', () => {
  it('403s a credential-holder whose org role lacks signing authority', async () => {
    resolveSignerOrgRole.mockResolvedValueOnce('viewer'); // not a signing role
    const res = await request(appWith({ id: 5, organizationId: 7 }))
      .post('/api/submissions/SUB-1/sign-release')
      .send({ runId: 'r1', password: 'pw', signatureMeaning: 'approval', reason: 'release' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESIGNATURE_NO_AUTHORITY');
    // The authority role was resolved for the JWT signer + org, not the body.
    expect(resolveSignerOrgRole).toHaveBeenCalledWith(5, 7);
  });

  it('403s when the user is not a member of the org (null role — fail closed)', async () => {
    resolveSignerOrgRole.mockResolvedValueOnce(null);
    const res = await request(appWith({ id: 5, organizationId: 7 }))
      .post('/api/submissions/SUB-1/sign-release')
      .send({ runId: 'r1', password: 'pw', signatureMeaning: 'approval', reason: 'release' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESIGNATURE_NO_AUTHORITY');
  });

  it('lets an authorized role past the gate (fails later on the run, not 403)', async () => {
    resolveSignerOrgRole.mockResolvedValueOnce('approver'); // a signing role
    const res = await request(appWith({ id: 5, organizationId: 7 }))
      .post('/api/submissions/SUB-1/sign-release')
      .send({ runId: 'r1', password: 'pw', signatureMeaning: 'approval', reason: 'release' });
    // Past the authority gate: no longer 403 for authority (the run doesn't
    // exist, so it collapses to 404 — the point is the gate did not block it).
    expect(res.status).not.toBe(403);
  });

  it('401s without an authenticated user (never reaches the authority gate)', async () => {
    const res = await request(appWith(null))
      .post('/api/submissions/SUB-1/sign-release')
      .send({ runId: 'r1', password: 'pw', signatureMeaning: 'approval', reason: 'release' });
    expect(res.status).toBe(401);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
});
