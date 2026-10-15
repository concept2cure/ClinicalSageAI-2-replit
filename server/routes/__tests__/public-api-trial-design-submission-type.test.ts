/**
 * /api/v1/trial-design/suggest needs the submission type it is asked about.
 *
 * It defaulted to NDA, so a device sponsor's query was answered with a drug
 * precedent strategy (2026-10-15).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateApiKeyMock, recommendStrategyMock, endpointRecsMock } = vi.hoisted(() => ({
  validateApiKeyMock: vi.fn(),
  recommendStrategyMock: vi.fn(),
  endpointRecsMock: vi.fn(),
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
vi.mock('../../services/regulatory-pathway-intelligence.js', () => ({ getRegulatoryPathwayIntelligence: () => ({}) }));
vi.mock('../../services/endpoint-recommender-service.js', () => ({
  getEndpointRecommenderService: () => ({ getComprehensiveEndpointRecommendations: endpointRecsMock }),
}));
vi.mock('../../services/precedent-engine.js', () => ({ precedentEngine: { recommendStrategy: recommendStrategyMock } }));

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
  validateApiKeyMock.mockResolvedValue({ valid: true, organizationId: 7, scopes: ['trial-design:read'], keyId: 1 });
  recommendStrategyMock.mockResolvedValue({ basis: 'no-precedents', recommendedStrategy: null });
  endpointRecsMock.mockResolvedValue([]);
});

describe('GET /api/v1/trial-design/suggest', () => {
  it('refuses a request that names no submission type, rather than assuming NDA', async () => {
    const res = await call('/api/v1/trial-design/suggest?indication=heart%20failure');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/submissionType is required/);
    expect(recommendStrategyMock).not.toHaveBeenCalled();
  });

  it('answers for the submission type it is given', async () => {
    const res = await call('/api/v1/trial-design/suggest?submissionType=510(k)');
    expect(res.status).toBe(200);
    expect(recommendStrategyMock.mock.calls[0][0]).toMatchObject({ submissionType: '510(k)' });
    expect(res.body.submissionType).toBe('510(k)');
  });
});
