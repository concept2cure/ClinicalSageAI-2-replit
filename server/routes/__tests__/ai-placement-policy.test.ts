/**
 * /api/ai-placement-policy — the governed route for a tenant's AI placement
 * policy (D6). The writer's transaction and validation are pinned in
 * services/ai-gateway/providers/__tests__/org-placement-writer.test.ts; this
 * pins who may reach it and where its organization comes from.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const writeOrgPlacementPolicy = vi.fn();
const readOrgPlacementPolicy = vi.fn();
const readDerivativeCustody = vi.fn();
const manageDerivativeCustody = vi.fn();
const reauth = vi.hoisted(() => ({ ok: true, calls: [] as Array<{ userId: number; proof: unknown }> }));
vi.mock('../c2c/actions', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyReauth: async (userId: number, proof: unknown) => {
    reauth.calls.push({ userId, proof });
    return { ok: reauth.ok };
  },
}));
vi.mock('../../services/ai-gateway/providers/org-placement-writer', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/ai-gateway/providers/org-placement-writer')>()),
  writeOrgPlacementPolicy: (...a: unknown[]) => writeOrgPlacementPolicy(...a),
  readOrgPlacementPolicy: (...a: unknown[]) => readOrgPlacementPolicy(...a),
  readDerivativeCustody: (...a: unknown[]) => readDerivativeCustody(...a),
  manageDerivativeCustody: (...a: unknown[]) => manageDerivativeCustody(...a),
}));
vi.mock('../../db', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/auth')>()),
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import placementRouter from '../ai-placement-policy';

// The request-scoped client the global auth gate attaches.
const REQUEST_CLIENT = { query: vi.fn(async (): Promise<{ rows: Array<Record<string, unknown>> }> => ({ rows: [] })) };

function appAs(user: Record<string, unknown> | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: unknown }).user = user;
    (req as unknown as { dbClient: unknown }).dbClient = REQUEST_CLIENT;
    next();
  });
  app.use('/api/ai-placement-policy', placementRouter);
  return app;
}

const ADMIN = { id: 5, organizationId: 42, role: 'admin', roles: ['admin', 'regulatory-author'] };
const MEMBER = { id: 6, organizationId: 42, role: 'member', roles: ['member', 'regulatory-author'] };
const POLICY = {
  residency: 'eu',
  zeroDataRetention: true,
  allowedSubstrates: ['frontier_private', 'self_hosted'],
  allowedProviders: null,
  publicSourceFrontier: false,
  publicSourceEgress: true,
};
const REASON = 'EU residency required by the MSA signed 2026-09-20.';

beforeEach(() => {
  writeOrgPlacementPolicy.mockReset();
  readOrgPlacementPolicy.mockReset();
  readDerivativeCustody.mockReset().mockResolvedValue({ policy: null, records: [] });
  manageDerivativeCustody.mockReset();
  reauth.ok = true;
  reauth.calls = [];
  REQUEST_CLIENT.query.mockReset().mockImplementation(async () => ({ rows: [{ role: 'admin' }] }));
});

describe('PUT /api/ai-placement-policy', () => {
  it('refuses a member who is not an admin or owner', async () => {
    const res = await request(appAs(MEMBER))
      .put('/api/ai-placement-policy')
      .send({ ...POLICY, reasonForChange: REASON });
    expect(res.status).toBe(403);
    expect(writeOrgPlacementPolicy).not.toHaveBeenCalled();
  });

  it('writes the caller’s own organization, as the caller', async () => {
    writeOrgPlacementPolicy.mockResolvedValue({ previousPolicy: null, policy: POLICY });
    const res = await request(appAs(ADMIN))
      .put('/api/ai-placement-policy')
      .send({ ...POLICY, reasonForChange: REASON });
    expect(res.status).toBe(200);
    const [conn, orgId, policy, reason, actor] = writeOrgPlacementPolicy.mock.calls[0];
    // The writer's transaction runs on the request's own connection.
    const client = await conn.connect();
    await client.query('SELECT 1');
    expect(REQUEST_CLIENT.query).toHaveBeenCalledWith('SELECT 1', undefined);
    expect(orgId).toBe(42);
    expect(policy).toEqual(POLICY);
    expect(reason).toBe(REASON);
    expect(actor).toMatchObject({ userId: 5 });
    expect(res.body).toMatchObject({ organizationId: 42, previousPolicy: null, policy: POLICY, audited: true });
  });

  it('refuses a body that names an organization — the tenant comes from the session only', async () => {
    const res = await request(appAs(ADMIN))
      .put('/api/ai-placement-policy')
      .send({ ...POLICY, organizationId: 7, reasonForChange: REASON });
    expect(res.status).toBe(422);
    expect(writeOrgPlacementPolicy).not.toHaveBeenCalled();
  });

  it('refuses a change with no reason', async () => {
    const res = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send(POLICY);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_POLICY');
    expect(writeOrgPlacementPolicy).not.toHaveBeenCalled();
  });

  it('says the policy was not changed when the write fails', async () => {
    writeOrgPlacementPolicy.mockRejectedValue(new Error('deadlock detected'));
    const res = await request(appAs(ADMIN))
      .put('/api/ai-placement-policy')
      .send({ ...POLICY, reasonForChange: REASON });
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('The placement policy was not changed.');
    expect(JSON.stringify(res.body)).not.toMatch(/deadlock/);
  });
});

describe('GET /api/ai-placement-policy', () => {
  it('reads the caller’s own organization', async () => {
    readOrgPlacementPolicy.mockResolvedValue(null);
    const res = await request(appAs(ADMIN)).get('/api/ai-placement-policy');
    expect(res.status).toBe(200);
    expect(readOrgPlacementPolicy.mock.calls[0][0]).toBe(REQUEST_CLIENT);
    expect(readOrgPlacementPolicy.mock.calls[0][1]).toBe(42);
    expect(res.body).toEqual({ organizationId: 42, policy: null, derivativeCustody: { policy: null, records: [] } });
  });

  it('refuses a caller with no organization', async () => {
    const res = await request(appAs({ id: 5, role: 'admin', roles: ['admin'] })).get('/api/ai-placement-policy');
    expect(res.status).toBe(403);
  });
});

describe('current derivative custody administration', () => {
  const policyAction = { action: 'derivative_policy', policy: {
    enabled: true, kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/11111111-1111-4111-8111-111111111111', maxLifetimeSeconds: 3600,
  }, reasonForChange: 'Enable the reviewed tenant custody workflow.' };

  it('reauthenticates the canonical administrator before passing only the typed action to custody', async () => {
    const view = { policy: { ...policyAction.policy, version: 1 }, records: [] };
    manageDerivativeCustody.mockResolvedValue(view);
    const proof = { password: 'synthetic-current-password', totp: '123456' };
    const res = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ ...policyAction, reauth: proof });
    expect(res.status).toBe(200);
    expect(reauth.calls).toEqual([{ userId: 5, proof }]);
    expect(manageDerivativeCustody).toHaveBeenCalledWith(expect.any(Object), 42, policyAction, expect.objectContaining({ userId: 5 }));
    expect(JSON.stringify(manageDerivativeCustody.mock.calls)).not.toContain(proof.password);
    expect(writeOrgPlacementPolicy).not.toHaveBeenCalled();
    expect(res.body).toEqual({ organizationId: 42, derivativeCustody: view, audited: true });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('refuses rejected fresh authentication before custody or ordinary policy writes', async () => {
    reauth.ok = false;
    const res = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send(policyAction);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
    expect(manageDerivativeCustody).not.toHaveBeenCalled();
    expect(writeOrgPlacementPolicy).not.toHaveBeenCalled();
  });

  it('normalizes the alternate MFA field into the canonical signer reauthentication contract', async () => {
    manageDerivativeCustody.mockResolvedValue({ policy: null, records: [] });
    const res = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ ...policyAction,
      reauth: { password: 'synthetic-current-password', totpCode: '123456' } });
    expect(res.status).toBe(200);
    expect(reauth.calls).toEqual([{ userId: 5, proof: { password: 'synthetic-current-password', totp: '123456' } }]);
  });

  it('refuses conflicting second-factor fields before authentication or mutation', async () => {
    const res = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ ...policyAction,
      reauth: { password: 'synthetic-current-password', totp: '123456', totpCode: '654321' } });
    expect(res.status).toBe(403);
    expect(reauth.calls).toEqual([]);
    expect(manageDerivativeCustody).not.toHaveBeenCalled();
  });

  it.each(['read', 'write'] as const)('refuses a stale administrator before a custody %s', async operation => {
    REQUEST_CLIENT.query.mockResolvedValue({ rows: [] });
    const app = appAs(ADMIN);
    const res = operation === 'read' ? await request(app).get('/api/ai-placement-policy')
      : await request(app).put('/api/ai-placement-policy').send(policyAction);
    expect(res.status).toBe(403);
    expect(readDerivativeCustody).not.toHaveBeenCalled();
    expect(manageDerivativeCustody).not.toHaveBeenCalled();
    expect(reauth.calls).toEqual([]);
  });

  it('rejects submitted authority claims and foreign identity fields before fresh authentication', async () => {
    const res = await request(appAs(ADMIN)).put('/api/ai-placement-policy')
      .send({ ...policyAction, organizationId: 99, userId: 999, humanConfirmed: true });
    expect(res.status).toBe(403);
    expect(manageDerivativeCustody).not.toHaveBeenCalled();
    expect(reauth.calls).toEqual([]);
  });

  it('withholds arbitrary custody/KMS error details and reauthentication material', async () => {
    manageDerivativeCustody.mockRejectedValue(new Error('private-key-or-source-canary'));
    const res = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ ...policyAction,
      reauth: { password: 'synthetic-current-password' } });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DERIVATIVE_CHANGE_UNCONFIRMED');
    expect(JSON.stringify(res.body)).not.toMatch(/private-key-or-source-canary|synthetic-current-password/);
  });
});
