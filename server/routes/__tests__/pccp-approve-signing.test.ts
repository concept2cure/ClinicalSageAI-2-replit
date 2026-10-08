/**
 * POST /api/pccp/plans/:planId/approve — approving a PCCP is a signed act.
 *
 * Approval locks the plan as the device's authorized change envelope. The
 * route used to record `approvedBy: 'system'` when no user was on the request,
 * store whatever `signatureId` string the client sent (never checked) on the
 * locked plan, and require no password, second factor, authority or reason.
 * It now runs the platform's one signing ceremony, as the RBM approve route
 * does. These cases pin each refusal, and that what is recorded is the
 * verified signer — never 'system', never a client-supplied signature id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  reverify: vi.fn(),
  role: vi.fn(),
  approvePlan: vi.fn(),
  user: { id: 12 as unknown, organizationId: 7 } as Record<string, unknown> | null,
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    if (h.user) (req as unknown as { user: unknown }).user = h.user;
    next();
  },
}));
vi.mock('../../services/part11/reverify-signer', () => ({ reverifySigner: (...a: unknown[]) => h.reverify(...a) }));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: (...a: unknown[]) => h.role(...a) }));
vi.mock('../../services/ai-ml-pccp/pccp.service', () => ({
  getPlan: async () => ({ id: 'plan-1', status: 'under_review', locked: false }),
  approvePlan: (...a: unknown[]) => h.approvePlan(...a),
  listPlansForProgram: vi.fn(), createPlan: vi.fn(), updatePlan: vi.fn(), getModifications: vi.fn(),
  addModification: vi.fn(), removeModification: vi.fn(), supersedePlan: vi.fn(), validatePlan: vi.fn(),
}));
vi.mock('../../db', () => ({ db: {} }));

import pccpRouter from '../pccp';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/pccp', pccpRouter);
  return a;
}

const GOOD = { reason: 'Validated envelope', password: 'pw' };

beforeEach(() => {
  h.user = { id: 12, organizationId: 7 };
  h.reverify.mockReset().mockResolvedValue({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
  h.role.mockReset().mockResolvedValue('admin');
  h.approvePlan.mockReset().mockResolvedValue({ plan: { id: 'plan-1' }, validation: {}, publish: {} });
});

describe('POST /api/pccp/plans/:planId/approve', () => {
  it('refuses without a reason and password — no approval attempted', async () => {
    const res = await request(app()).post('/api/pccp/plans/plan-1/approve').send({ signatureId: 'anything' });
    expect(res.status).toBe(422);
    expect(h.approvePlan).not.toHaveBeenCalled();
  });

  it('refuses a signer whose password does not re-verify', async () => {
    h.reverify.mockResolvedValue({ ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'bad password' });
    const res = await request(app()).post('/api/pccp/plans/plan-1/approve').send(GOOD);
    expect(res.status).toBe(401);
    expect(h.approvePlan).not.toHaveBeenCalled();
  });

  it('refuses a verified signer without signing authority', async () => {
    h.role.mockResolvedValue('member');
    const res = await request(app()).post('/api/pccp/plans/plan-1/approve').send(GOOD);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PCCP_NO_SIGNING_AUTHORITY');
    expect(h.approvePlan).not.toHaveBeenCalled();
  });

  // P-27 (2026-10-08): one signing-authority policy (checkSigningAuthority).
  // This route asked authority only after the password, so a role that may not
  // sign could still test a password here; and a role lookup that failed threw.
  it('asks signing authority before the password: a role that may not sign tests no password', async () => {
    h.role.mockResolvedValue('member');
    h.reverify.mockResolvedValue({ ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'bad password' });
    const res = await request(app()).post('/api/pccp/plans/plan-1/approve').send(GOOD);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PCCP_NO_SIGNING_AUTHORITY');
    expect(h.reverify).not.toHaveBeenCalled();
  });

  it('refuses, unverified, when the signer role cannot be read — and asks for no password', async () => {
    h.role.mockRejectedValue(new Error('membership read failed'));
    const res = await request(app()).post('/api/pccp/plans/plan-1/approve').send(GOOD);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SIGNING_AUTHORITY_UNVERIFIED');
    expect(h.reverify).not.toHaveBeenCalled();
    expect(h.approvePlan).not.toHaveBeenCalled();
  });

  it('refuses when no user is on the request — never approves as "system"', async () => {
    h.user = { organizationId: 7 };
    const res = await request(app()).post('/api/pccp/plans/plan-1/approve').send(GOOD);
    expect(res.status).toBe(401);
    expect(h.approvePlan).not.toHaveBeenCalled();
  });

  it('records the verified signer and the reason, and ignores a client signature id', async () => {
    const res = await request(app()).post('/api/pccp/plans/plan-1/approve').send({ ...GOOD, signatureId: 'forged-id' });
    expect(res.status).toBe(200);
    const args = h.approvePlan.mock.calls[0][0] as Record<string, unknown>;
    expect(args.approvedBy).toBe('12');
    expect(args.reason).toBe('Validated envelope');
    expect(args).not.toHaveProperty('signatureId');
  });

  it('reports an approval that could not be audited as not applied', async () => {
    h.approvePlan.mockResolvedValue({ error: 'AUDIT_WRITE_FAILED' });
    const res = await request(app()).post('/api/pccp/plans/plan-1/approve').send(GOOD);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUDIT_WRITE_FAILED');
  });
});
