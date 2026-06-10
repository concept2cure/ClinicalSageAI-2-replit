/**
 * Tenant-isolation contract test — Client Branding family.
 *
 * Regression guard for a cross-tenant IDOR on per-org branding assets:
 * server/routes/client-branding.ts let /upload-logo and /upload-letterhead
 * take organizationId from the body and /logo/:orgId from the path, so an
 * authenticated user could overwrite or read another tenant's branding. The
 * org must come from the JWT, and logo retrieval must reject a path-org
 * mismatch.
 *
 * The router relies on the global /api auth gate, so auth is injected here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { ORG_A, TARGET_ORG, store, authState } = vi.hoisted(() => ({
  ORG_A: 7,
  TARGET_ORG: 999,
  store: {
    query: vi.fn(async () => [] as any[]),
    insert: vi.fn(async () => ({ id: 1 })),
    update: vi.fn(async () => ({ id: 1 })),
  },
  authState: { orgId: 7 as number | null },
}));

vi.mock('../../utils/feature-persistence', () => ({
  createFeatureStore: () => store,
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.orgId = ORG_A;
  store.query.mockResolvedValue([]);
  const router = (await import('../../routes/client-branding')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  app.use('/api/client-branding', router);
});

const storeOrgArgs = () =>
  [...store.query.mock.calls, ...store.insert.mock.calls, ...store.update.mock.calls].flat();

describe('Tenant isolation — branding writes', () => {
  it('POST /upload-logo writes the JWT org, not a spoofed body org', async () => {
    const res = await request(app)
      .post('/api/client-branding/upload-logo')
      .send({ organizationId: TARGET_ORG, logoBase64: 'data:image/png;base64,AAAA' });
    expect(res.status).toBe(200);
    expect(store.query).toHaveBeenCalledWith(ORG_A, 'settings');
    expect(storeOrgArgs()).not.toContain(TARGET_ORG);
  });

  it('POST /upload-letterhead writes the JWT org, not a spoofed body org', async () => {
    const res = await request(app)
      .post('/api/client-branding/upload-letterhead')
      .send({ organizationId: TARGET_ORG, letterheadBase64: 'PDFDATA' });
    expect(res.status).toBe(200);
    expect(store.query).toHaveBeenCalledWith(ORG_A, 'settings');
    expect(storeOrgArgs()).not.toContain(TARGET_ORG);
  });
});

describe('Tenant isolation — branding reads', () => {
  it('GET /logo/:orgId 404s when the path org is not the caller org', async () => {
    const res = await request(app).get(`/api/client-branding/logo/${TARGET_ORG}`);
    expect(res.status).toBe(404);
    expect(store.query).not.toHaveBeenCalled();
  });

  it('GET /logo/:orgId serves the caller own logo', async () => {
    store.query.mockResolvedValue([{ logoBase64: 'data:image/png;base64,AAAA' }]);
    const res = await request(app).get(`/api/client-branding/logo/${ORG_A}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });
});

describe('Tenant isolation — branding auth', () => {
  it('403s without an authenticated org', async () => {
    authState.orgId = null;
    await request(app)
      .post('/api/client-branding/upload-logo')
      .send({ logoBase64: 'data:image/png;base64,AAAA' })
      .expect(403);
    await request(app).get(`/api/client-branding/logo/${ORG_A}`).expect(403);
    expect(store.insert).not.toHaveBeenCalled();
  });
});
