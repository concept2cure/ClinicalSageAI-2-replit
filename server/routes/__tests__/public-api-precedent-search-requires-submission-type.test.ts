/**
 * /api/v1/precedent/search needs the submission type it is asked about, and the
 * API's own /docs says which parameters each endpoint requires.
 *
 * What the code used to do (until 2026-10-15): /precedent/search defaulted a
 * missing submissionType to 'NDA', so a device or biologic sponsor who left it
 * out was answered with NDA precedents. /docs listed submissionType for neither
 * /precedent/search nor /trial-design/suggest as required, and omitted it from
 * /trial-design/suggest altogether, though that route answers 400 without it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateApiKeyMock, searchMock } = vi.hoisted(() => ({
  validateApiKeyMock: vi.fn(),
  searchMock: vi.fn(),
}));

vi.mock('../../services/api-key-service.js', () => ({ validateApiKey: validateApiKeyMock }));
vi.mock('../../services/tenant/tenant-lifecycle.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/tenant/tenant-lifecycle')>();
  return {
    ...actual,
    getTenantAccessPosture: vi.fn(async () => ({
      organizationId: 7, state: 'active', decision: 'allow', code: 'TENANT_ACTIVE', reason: 'Active.',
    })),
  };
});
vi.mock('../../services/usage-metering.js', () => ({
  recordUsage: vi.fn(async () => {}),
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 10, limit: 10 })),
}));
// The remaining data services, stubbed only so the router's module graph loads.
vi.mock('../../services/csr-search-service.js', () => ({ csrSearchService: { searchCSRs: vi.fn() } }));
vi.mock('../../services/endpoint-recommender-service.js', () => ({
  getEndpointRecommenderService: () => ({ getComprehensiveEndpointRecommendations: vi.fn() }),
}));
vi.mock('../../services/precedent-engine.js', () => ({ precedentEngine: { search: searchMock } }));

import express from 'express';
import request from 'supertest';

async function mountApp() {
  const { default: publicApiRouter } = await import('../public-api');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRouter);
  return app;
}
const call = async (path: string) => request(await mountApp()).get(path).set('x-api-key', 'csai_test');

beforeEach(() => {
  vi.clearAllMocks();
  validateApiKeyMock.mockResolvedValue({ valid: true, organizationId: 7, scopes: ['precedent:read'], keyId: 1 });
  searchMock.mockResolvedValue([]);
});

describe('GET /api/v1/precedent/search', () => {
  it('refuses a request that names no submission type, rather than searching NDA precedents', async () => {
    const res = await call('/api/v1/precedent/search?indication=heart%20failure');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/submissionType is required/);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('searches the submission type it is given', async () => {
    const res = await call('/api/v1/precedent/search?indication=heart%20failure&submissionType=BLA');
    expect(res.status).toBe(200);
    expect(searchMock.mock.calls[0][0]).toMatchObject({ submissionType: 'BLA' });
    expect(res.body.query.submissionType).toBe('BLA');
  });
});

describe('GET /api/v1/docs', () => {
  it('lists submissionType as required where the route refuses without it', async () => {
    const res = await request(await mountApp()).get('/api/v1/docs');
    const entry = (p: string) =>
      (res.body.endpoints as Array<{ path: string; parameters: Record<string, { required?: boolean }> }>).find(
        (e) => e.path === p,
      );
    expect(entry('/api/v1/trial-design/suggest')?.parameters.submissionType).toMatchObject({ required: true });
    expect(entry('/api/v1/precedent/search')?.parameters.submissionType).toMatchObject({ required: true });
  });
});
