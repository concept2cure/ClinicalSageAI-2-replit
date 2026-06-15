/**
 * Contract test — /api/v1 public API key coverage (Security M-6).
 *
 * Pins the invariant that EVERY data route under /api/v1 is gated behind
 * `requireApiKey`. The public-api router applies `router.use(requireApiKey)`
 * at a single point; any DATA route registered ABOVE that line would be
 * unauthenticated. This test mounts the real router and asserts that
 * representative data endpoints reject an unauthenticated request
 * (no `x-api-key`) with 401 — so it FAILS if someone later adds a data
 * route above the `requireApiKey` line.
 *
 * The intentionally-public endpoints (/health, /docs) are asserted to remain
 * reachable WITHOUT a key, so the test also catches the opposite mistake of
 * accidentally gating them.
 *
 * Deterministic: the API-key service and all downstream data services are
 * mocked, so the test never touches the DB or network. `validateApiKey` is
 * stubbed to always reject — the point under test is the PRESENCE of the gate,
 * not key validation logic (covered elsewhere).
 */

import { describe, it, expect, vi } from 'vitest';

// Stub the API-key service so importing the router never pulls in the DB pool.
// It always rejects — an unauthenticated request must be blocked BEFORE any
// data handler runs, so the validator result here only needs to be "not valid".
vi.mock('../../services/api-key-service.js', () => ({
  validateApiKey: vi.fn(async () => ({ valid: false, reason: 'API key not found' })),
}));

// Stub usage metering and every data service the router wires in, so the module
// graph loads without DB/network and a leaked (ungated) handler would still 200
// rather than crash — making a coverage regression show up as a FAILED auth
// assertion rather than a 500.
vi.mock('../../services/usage-metering.js', () => ({
  recordUsage: vi.fn(async () => {}),
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 1, limit: 1 })),
}));
vi.mock('../../services/csr-search-service.js', () => ({
  csrSearchService: { searchCSRs: vi.fn(async () => ({ csrs: [], results_count: 0 })) },
}));
vi.mock('../../services/regulatory-pathway-intelligence.js', () => ({
  getRegulatoryPathwayIntelligence: () => ({ recommendPathway: vi.fn(() => ({})) }),
}));
vi.mock('../../services/endpoint-recommender-service.js', () => ({
  getEndpointRecommenderService: () => ({
    getComprehensiveEndpointRecommendations: vi.fn(async () => ({})),
  }),
}));
vi.mock('../../services/precedent-engine.js', () => ({
  precedentEngine: {
    search: vi.fn(async () => []),
    recommendStrategy: vi.fn(async () => ({})),
  },
}));

import express from 'express';
import request from 'supertest';

async function mountApp() {
  const { default: publicApiRouter } = await import('../../routes/public-api');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRouter);
  return app;
}

// Representative DATA routes — these MUST require an API key. If a new data
// route is added above the `requireApiKey` line in public-api.ts, add it here;
// but the existing set already guards the gate's position relative to them.
const DATA_ROUTES = [
  '/api/v1/csr/search',
  '/api/v1/regulatory/pathways',
  '/api/v1/endpoints/recommend',
  '/api/v1/precedent/search',
  '/api/v1/trial-design/suggest',
];

// Intentionally public — must stay reachable WITHOUT a key.
const PUBLIC_ROUTES = ['/api/v1/health', '/api/v1/docs'];

describe('/api/v1 API-key coverage (M-6)', () => {
  it.each(DATA_ROUTES)(
    'rejects unauthenticated %s without an x-api-key (401)',
    async (route) => {
      const app = await mountApp();
      const res = await request(app).get(route);
      // Gate must run before any data handler: 401 (no key) is required.
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('API key required');
    },
  );

  it.each(DATA_ROUTES)(
    'rejects %s when an invalid x-api-key is supplied (401)',
    async (route) => {
      const app = await mountApp();
      const res = await request(app).get(route).set('x-api-key', 'csai_not-a-real-key');
      expect(res.status).toBe(401);
      // Past the "key required" check, into validateApiKey (mocked invalid).
      expect(res.body.error).toBe('Invalid API key');
    },
  );

  it.each(PUBLIC_ROUTES)('leaves %s publicly reachable without a key', async (route) => {
    const app = await mountApp();
    const res = await request(app).get(route);
    expect(res.status).toBe(200);
  });
});
