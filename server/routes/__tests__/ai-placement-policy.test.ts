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
const learning = vi.hoisted(() => ({ read: vi.fn(), directory: vi.fn(), policy: vi.fn(), contribute: vi.fn(), prepare: vi.fn(), install: vi.fn() }));
vi.mock('../../services/intelligence/ana-failure-learning', async original => ({
  ...await original<typeof import('../../services/intelligence/ana-failure-learning')>(), readLearningContributionMetadata: (...args: unknown[]) => learning.read(...args),
}));
vi.mock('../../services/qms/changeControl.service', async original => ({
  ...await original<typeof import('../../services/qms/changeControl.service')>(), listReviewedLearningLibrary: (...args: unknown[]) => learning.directory(...args),
}));
vi.mock('../../services/tenant/tenant-settings-writer', async original => ({
  ...await original<typeof import('../../services/tenant/tenant-settings-writer')>(),
  writeLearningContributionPolicy: (...args: unknown[]) => learning.policy(...args), writeLearningPatternContribution: (...args: unknown[]) => learning.contribute(...args),
}));
vi.mock('../../services/qms/controlled-document-service', async original => ({
  ...await original<typeof import('../../services/qms/controlled-document-service')>(), prepareReviewedLearningCandidate: (...args: unknown[]) => learning.prepare(...args),
}));
vi.mock('../../services/account-skill-bundles', async original => ({
  ...await original<typeof import('../../services/account-skill-bundles')>(), installReviewedLearningSkill: (...args: unknown[]) => learning.install(...args),
}));
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
  for (const mock of Object.values(learning)) mock.mockReset();
  learning.read.mockResolvedValue({ policy: { enabled: false, version: 0 }, classes: [], sources: [] });
  learning.directory.mockResolvedValue([]);
  writeOrgPlacementPolicy.mockReset();
  readOrgPlacementPolicy.mockReset();
  readDerivativeCustody.mockReset().mockResolvedValue({ policy: null, records: [] });
  manageDerivativeCustody.mockReset();
  reauth.ok = true;
  reauth.calls = [];
  REQUEST_CLIENT.query.mockReset().mockImplementation(async () => ({ rows: [{ role: 'admin' }] }));
});

describe('learning administration uses current actor and fresh reauthentication', () => {
  const input = { enabled: true, expectedVersion: 0, reasonForChange: 'Administrator reviewed contribution boundaries.' };
  it.each(['learning_policy', 'learning_contribute', 'learning_prepare', 'learning_install'])('holds %s before its writer when reauthentication fails', async action => {
    reauth.ok = false;
    const result = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ action, ...input, reauth: { password: 'synthetic' } });
    expect(result.status).toBe(401);
    for (const mock of [learning.policy, learning.contribute, learning.prepare, learning.install]) expect(mock).not.toHaveBeenCalled();
  });
  it('passes only canonical tenant and actor and strips actual reauthentication from policy data', async () => {
    learning.policy.mockResolvedValue({ enabled: true, version: 1 });
    const result = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ action: 'learning_policy', ...input,
      reauth: { password: 'synthetic', totp: '123456' } });
    expect(result.status).toBe(200);
    expect(learning.policy).toHaveBeenCalledWith(expect.anything(), 42, 5, input);
    expect(reauth.calls).toEqual([{ userId: 5, proof: { password: 'synthetic', totp: '123456' } }]);
    expect(JSON.stringify(result.body)).not.toContain('synthetic');
  });
  it('passes the selected immutable public version through the actual install adapter', async () => {
    const selected = { libraryVersionId: '11111111-1111-4111-8111-111111111111', expectedArtifactSha256: 'a'.repeat(64), reasonForChange: input.reasonForChange };
    learning.install.mockResolvedValue({ id: 4 });
    const result = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ action: 'learning_install', ...selected, reauth: { password: 'synthetic' } });
    expect(result.status).toBe(200);
    expect(learning.install).toHaveBeenCalledWith(expect.anything(), 42, expect.objectContaining({ userId: 5 }), selected);
  });
  it('withholds raw storage errors from a learning writer', async () => {
    learning.policy.mockRejectedValue(new Error('private-tenant-donor-canary'));
    const result = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ action: 'learning_policy', ...input, reauth: { password: 'synthetic' } });
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toMatch(/private-tenant-donor-canary|synthetic/);
  });
  it('blocks a revoked administrator before reading contributions or authenticating', async () => {
    REQUEST_CLIENT.query.mockResolvedValue({ rows: [] });
    const result = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send({ action: 'learning_policy', ...input });
    expect(result.status).toBe(403); expect(reauth.calls).toEqual([]); expect(learning.policy).not.toHaveBeenCalled();
  });
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
    expect(res.body).toEqual({ organizationId: 42, policy: null, derivativeCustody: { policy: null, records: [] },
      learningContribution: { policy: { enabled: false, version: 0 }, classes: [], sources: [], library: [], canCurate: false } });
    expect(learning.read).toHaveBeenCalledWith(REQUEST_CLIENT, 42, 5);
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


describe('current administration immediately before password verification', () => {
  it.each([
    { action: 'learning_policy', enabled: true, expectedVersion: 0, reasonForChange: 'Contribute reviewed generic patterns.', reauth: { password: 'synthetic' } },
    { action: 'derivative_policy', policy: { enabled: true, kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/11111111-1111-4111-8111-111111111111', maxLifetimeSeconds: 3600 }, reasonForChange: 'Manage derivative custody.', reauth: { password: 'synthetic' } },
  ])('refuses lost authority after initial admission without checking a password or mutating: $action', async body => {
    REQUEST_CLIENT.query.mockResolvedValueOnce({ rows: [{ role: 'admin' }] }).mockResolvedValueOnce({ rows: [] });
    const result = await request(appAs(ADMIN)).put('/api/ai-placement-policy').send(body);
    expect(result.status).toBe(403); expect(result.body.error.code).toBe('CURRENT_ADMIN_REQUIRED');
    expect(reauth.calls).toEqual([]); expect(learning.policy).not.toHaveBeenCalled(); expect(manageDerivativeCustody).not.toHaveBeenCalled();
  });
});
