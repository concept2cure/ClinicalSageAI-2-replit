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
vi.mock('../../services/ai-gateway/providers/org-placement-writer', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/ai-gateway/providers/org-placement-writer')>()),
  writeOrgPlacementPolicy: (...a: unknown[]) => writeOrgPlacementPolicy(...a),
  readOrgPlacementPolicy: (...a: unknown[]) => readOrgPlacementPolicy(...a),
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

function appAs(user: Record<string, unknown> | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: unknown }).user = user;
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
    const [, orgId, policy, reason, actor] = writeOrgPlacementPolicy.mock.calls[0];
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
    expect(readOrgPlacementPolicy.mock.calls[0][1]).toBe(42);
    expect(res.body).toEqual({ organizationId: 42, policy: null });
  });

  it('refuses a caller with no organization', async () => {
    const res = await request(appAs({ id: 5, role: 'admin', roles: ['admin'] })).get('/api/ai-placement-policy');
    expect(res.status).toBe(403);
  });
});
