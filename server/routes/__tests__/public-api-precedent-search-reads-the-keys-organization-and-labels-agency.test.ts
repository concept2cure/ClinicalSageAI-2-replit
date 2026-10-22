/**
 * /api/v1/precedent/search reads the API key's organization, and an agency
 * filter says which precedents record no agency instead of passing them as
 * matches.
 *
 * What the route used to do (until 2026-10-22): it called
 * precedentEngine.search(input) with no organization, so the engine's
 * isolation answered public precedents only and silently omitted the caller's
 * own private ones; and the agency filter kept every precedent with no agency
 * recorded (`!p.agency || …`), so an answer filtered to EMA carried precedents
 * nobody recorded as EMA's, unlabelled.
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
vi.mock('../../services/csr-search-service.js', () => ({ csrSearchService: { searchCSRs: vi.fn() } }));
vi.mock('../../services/endpoint-recommender-service.js', () => ({
  getEndpointRecommenderService: () => ({ getComprehensiveEndpointRecommendations: vi.fn() }),
}));
vi.mock('../../services/precedent-engine.js', () => ({ precedentEngine: { search: searchMock } }));

import express from 'express';
import request from 'supertest';

async function call(path: string) {
  const { default: publicApiRouter } = await import('../public-api');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRouter);
  return request(app).get(path).set('x-api-key', 'csai_test');
}

beforeEach(() => {
  vi.clearAllMocks();
  validateApiKeyMock.mockResolvedValue({ valid: true, organizationId: 7, scopes: ['precedent:read'], keyId: 1 });
  searchMock.mockResolvedValue([
    { id: 'p-ema', submissionType: 'BLA', agency: 'EMA' },
    { id: 'p-fda', submissionType: 'BLA', agency: 'FDA' },
    { id: 'p-none', submissionType: 'BLA' },
  ]);
});

describe('GET /api/v1/precedent/search', () => {
  it("searches as the API key's organization", async () => {
    const res = await call('/api/v1/precedent/search?indication=asthma&submissionType=BLA');
    expect(res.status).toBe(200);
    expect(searchMock.mock.calls[0][1], "the key's organization was not passed, so its private precedents were omitted").toBe(7);
  });

  it('does not pass a precedent with no agency recorded as an agency match; it labels it', async () => {
    const res = await call('/api/v1/precedent/search?indication=asthma&submissionType=BLA&agency=EMA');
    expect(res.status).toBe(200);
    const byId = Object.fromEntries((res.body.precedents as Array<{ id: string; agencyMatch?: string }>).map((p) => [p.id, p]));
    expect(byId['p-fda'], "another agency's precedent was returned").toBeUndefined();
    expect(byId['p-ema']?.agencyMatch).toBe('matched');
    expect(byId['p-none']?.agencyMatch, 'a precedent with no agency was returned as a match, unlabelled').toBe('not_recorded');
    expect(res.body.agencyNotRecorded).toBe(1);
  });

  it('control: with no agency filter nothing is labelled or dropped', async () => {
    const res = await call('/api/v1/precedent/search?indication=asthma&submissionType=BLA');
    expect((res.body.precedents as unknown[]).length).toBe(3);
    expect((res.body.precedents as Array<{ agencyMatch?: string }>)[0].agencyMatch).toBeUndefined();
  });
});
