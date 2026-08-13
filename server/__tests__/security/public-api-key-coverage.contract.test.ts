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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the API-key service so importing the router never pulls in the DB pool.
// It always rejects — an unauthenticated request must be blocked BEFORE any
// data handler runs, so the validator result here only needs to be "not valid".
const { validateApiKeyMock, getTenantAccessPostureMock } = vi.hoisted(() => ({
  validateApiKeyMock: vi.fn(async () => ({ valid: false, reason: 'API key not found' }) as any),
  getTenantAccessPostureMock: vi.fn(async () => null as any),
}));
vi.mock('../../services/api-key-service.js', () => ({ validateApiKey: validateApiKeyMock }));

// The tenant lifecycle posture. `/api/v1` is allowlisted from the auth boundary
// (it authenticates with X-API-Key, not a session), so it never reaches
// `enforceTenantLifecycle` — the public API has to consult the posture itself or
// the guard leaves a hole exactly its shape. `decisionPermitsMethod` is the real
// implementation; only the DB-backed lookup is stubbed.
vi.mock('../../services/tenant/tenant-lifecycle.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/tenant/tenant-lifecycle')>();
  return { ...actual, getTenantAccessPosture: getTenantAccessPostureMock };
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Tenant lifecycle on the API-key surface.
//
// The gap this pins: an organization suspended for non-payment, a terminated
// contract or a security incident kept full programmatic read AND write access
// through /api/v1, using a key that is itself still 'active' — because key
// status and ORGANISATION status are different facts, and `validateApiKey` only
// ever checked the former.
// ─────────────────────────────────────────────────────────────────────────────

const posture = (over: Record<string, unknown> = {}) => ({
  organizationId: 42,
  state: 'active',
  decision: 'allow',
  code: 'TENANT_ACTIVE',
  reason: 'Active.',
  ...over,
});

describe('/api/v1 respects the tenant lifecycle posture', () => {
  beforeEach(() => {
    validateApiKeyMock.mockResolvedValue({
      valid: true,
      organizationId: 42,
      scopes: ['csr:read', 'regulatory:read'],
      keyId: 1,
    });
    getTenantAccessPostureMock.mockResolvedValue(posture());
  });

  it('lets an active tenant through', async () => {
    const app = await mountApp();
    const res = await request(app).get('/api/v1/csr/search').set('x-api-key', 'csai_valid');
    expect(res.status).not.toBe(403);
    expect(getTenantAccessPostureMock).toHaveBeenCalledWith(42);
  });

  it('REFUSES a suspended organization even with a valid, active key', async () => {
    getTenantAccessPostureMock.mockResolvedValue(
      posture({ decision: 'deny', state: 'suspended', code: 'TENANT_SUSPENDED', reason: 'nope' })
    );
    const app = await mountApp();
    const res = await request(app).get('/api/v1/csr/search').set('x-api-key', 'csai_valid');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('TENANT_SUSPENDED');
    // Machine-readable, so an integration can branch rather than parse prose.
    expect(res.body.tenantState).toBe('suspended');
  });

  it('lets a past-due organization keep READING', async () => {
    // read_only, not deny: the customer keeps programmatic access to their own
    // regulatory record while new work is blocked.
    getTenantAccessPostureMock.mockResolvedValue(
      posture({ decision: 'read_only', state: 'past_due', code: 'TENANT_PAST_DUE' })
    );
    const app = await mountApp();
    const res = await request(app).get('/api/v1/csr/search').set('x-api-key', 'csai_valid');
    expect(res.status).not.toBe(403);
  });

  it('fails CLOSED when the posture cannot be read', async () => {
    // A suspension must not lapse because a lookup failed — same doctrine as
    // the session path.
    getTenantAccessPostureMock.mockResolvedValue(null);
    const app = await mountApp();
    const res = await request(app).get('/api/v1/csr/search').set('x-api-key', 'csai_valid');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('TENANT_STATE_UNVERIFIED');
  });

  it('checks the posture on EVERY data route, not just one', async () => {
    getTenantAccessPostureMock.mockResolvedValue(
      posture({ decision: 'deny', state: 'suspended', code: 'TENANT_SUSPENDED' })
    );
    for (const route of DATA_ROUTES) {
      const app = await mountApp();
      const res = await request(app).get(route).set('x-api-key', 'csai_valid');
      expect(res.status, `${route} should refuse a suspended tenant`).toBe(403);
    }
  });
});
