/**
 * A new organisation starts with an empty precedent library.
 *
 * POST /api/tenants seeded every regulatory-precedent-intelligence library
 * into each organisation it created — patterns carrying uncited rates
 * ("frequencyRate 0.18", "55% resolution success"), calibration accuracy its
 * own file called placeholders — which the pre-submission gate then scored.
 * ADR 0013: the library is the organisation's own record, and starts empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost:5432/test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ seedAll: vi.fn(async () => ({})), provision: vi.fn(async () => undefined) }));

vi.mock('postgres', () => ({
  default: () => (strings: TemplateStringsArray) =>
    Promise.resolve(/INSERT INTO organizations/.test(strings.join('?')) ? [{ id: 99, name: 'Acme Bio', slug: 'acme-bio' }] : []),
}));
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 11, organizationId: 1, role: 'super_admin' };
    next();
  },
}));
vi.mock('../../middleware/requirePlatformAdmin', () => ({
  requirePlatformAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  resolvePlatformAdmin: vi.fn(async () => true),
}));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn(async () => undefined) }));
vi.mock('../../services/entitlements/launch-scope.js', () => ({ provisionLaunchModules: h.provision }));
vi.mock('../../services/regulatory-precedent-intelligence', () => ({ seedAllRegulatoryPatterns: h.seedAll }));

import tenantsRouter from '../tenants-simple';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/tenants', () => {
  it('creates the organisation and seeds no precedent library into it', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/tenants', tenantsRouter);
    const r = await request(app).post('/api/tenants').send({ name: 'Acme Bio', slug: 'acme-bio' });
    expect(r.status).toBe(201);
    expect(h.provision).toHaveBeenCalledWith(99, expect.anything());
    // The seed ran fire-and-forget after the response: give it the chance.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.seedAll).not.toHaveBeenCalled();
  });
});
