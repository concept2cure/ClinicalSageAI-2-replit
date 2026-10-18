/**
 * /api/v1/regulatory/pathways answers from the canonical pathway advisor.
 *
 * It ran a second engine that gave EMA, PMDA and every other agency FDA's NDA
 * (or 510(k)) document list, quoted review timelines from no source, read
 * unmet need or orphan status as expedited eligibility, dropped an unknown
 * agency silently (200, recommendations []), and defaulted the product to a
 * drug and the agencies to FDA (2026-10-15).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateApiKeyMock } = vi.hoisted(() => ({ validateApiKeyMock: vi.fn() }));

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
vi.mock('../../services/endpoint-recommender-service.js', () => ({ getEndpointRecommenderService: () => ({}) }));
vi.mock('../../services/precedent-engine.js', () => ({ precedentEngine: {} }));

import express from 'express';
import request from 'supertest';

async function mountApp() {
  const { default: publicApiRouter } = await import('../public-api');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRouter);
  return app;
}
const call = async (query: string) =>
  request(await mountApp()).get(`/api/v1/regulatory/pathways${query}`).set('x-api-key', 'csai_test');

beforeEach(() => {
  vi.clearAllMocks();
  validateApiKeyMock.mockResolvedValue({ valid: true, organizationId: 7, scopes: ['regulatory:read'], keyId: 1 });
});

describe('GET /api/v1/regulatory/pathways', () => {
  it('requires the product type and agencies rather than assuming a drug at FDA', async () => {
    expect((await call('')).status).toBe(400);
    expect((await call('?productType=drug')).status).toBe(400);
    expect((await call('?targetAgencies=EMA')).status).toBe(400);
  });

  it('refuses an agency it has no pathway for, rather than dropping it', async () => {
    const res = await call('?productType=drug&targetAgencies=EMA,ANMAT');
    expect(res.status).toBe(422);
    expect(res.body.unsupportedAgencies).toEqual(['ANMAT']);
  });

  it('refuses a product type it has no pathway for', async () => {
    const res = await call('?productType=device&targetAgencies=FDA');
    expect(res.status).toBe(422);
    expect(res.body.unsupportedProductType).toBe('device');
  });

  it("answers each agency with that agency's own pathway", async () => {
    const res = await call('?productType=drug&targetAgencies=EMA,PMDA');
    expect(res.status).toBe(200);
    expect(res.body.recommendations.map((r: { market: string }) => r.market)).toEqual(['EU', 'JP']);
    const [eu, jp] = res.body.recommendations;
    expect(eu.agency).toMatch(/EMA/);
    expect(jp.agency).toMatch(/PMDA/);
    expect(JSON.stringify(res.body)).not.toMatch(/510\(k\)|NDA_FDA|months \(standard\)|months \(expedited\)/);
  });

  it('a biologic at FDA is a BLA', async () => {
    const res = await call('?productType=biologic&targetAgencies=FDA');
    expect(res.status).toBe(200);
    expect(res.body.recommendations[0].marketingApplication).toMatch(/BLA/);
  });
});
