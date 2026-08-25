import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createCsrIntelligenceRoutes } from '../csr-intelligence-routes';

function createMockPool() {
  const query = vi.fn(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.includes('COUNT(*)::int AS total,') && normalized.includes('processed_today')) {
      return { rows: [{ total: 12, processed_today: 2 }] };
    }
    if (
      normalized.includes('COUNT(*)::int AS total,') &&
      normalized.includes('therapeutic_area_count')
    ) {
      return {
        rows: [
          {
            total: 12,
            therapeutic_area_count: 3,
            unique_sponsors: 4,
            completed_reviews: 7,
          },
        ],
      };
    }
    if (normalized.includes('COALESCE(indication')) {
      return { rows: [{ area: 'Cardiology', count: 5, studies: 5, avg_sample: 120 }] };
    }
    if (normalized.includes('COALESCE(phase')) {
      return { rows: [{ phase: 'Phase III', count: 8 }] };
    }
    if (normalized.includes('AVG(sample_size)::int AS avg_sample')) {
      return { rows: [{ avg_sample: 98, avg_duration: 20 }] };
    }
    if (normalized.includes('SELECT phase, COUNT(*)::int AS cnt')) {
      return { rows: [{ phase: 'Phase III', cnt: 8 }] };
    }

    return { rows: [] };
  });

  return { query };
}

/**
 * Mount the router behind a stub that establishes the tenant the way the real
 * auth middleware does — `req.user.organizationId` is the first source
 * getSecureOrgId consults.
 *
 * `analyticsCache` is module-global, so every test here uses a DISTINCT org id.
 * Sharing one would let an earlier test's 30-second entry satisfy a later
 * test's request, and the suite would pass on a cache hit it never created.
 */
function appForOrg(pool: unknown, organizationId: string | null) {
  const app = express();
  app.use((req: any, _res, next) => {
    if (organizationId !== null) req.user = { id: 1, organizationId };
    next();
  });
  app.use('/api', createCsrIntelligenceRoutes(pool as any, { searchCSRs: vi.fn() }));
  return app;
}

describe('csr-intelligence-routes backend tuning', () => {
  it('caches analytics response for identical requests from the same tenant', async () => {
    const pool = createMockPool();
    const app = appForOrg(pool, 'tuning-analytics-org');

    const first = await request(app).get('/api/csr-intelligence/analytics');
    const second = await request(app).get('/api/csr-intelligence/analytics');

    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it('supports refresh=true to bypass stats cache', async () => {
    const pool = createMockPool();
    const app = appForOrg(pool, 'tuning-stats-org');

    const first = await request(app).get('/api/csr-intelligence/stats');
    const refresh = await request(app).get('/api/csr-intelligence/stats?refresh=true');

    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(refresh.status).toBe(200);
    expect(refresh.headers['x-cache']).toBe('MISS');
    expect(pool.query).toHaveBeenCalledTimes(6);
  });
});

/**
 * The CSR analytics cache must not serve one tenant's portfolio to another.
 *
 * ── The exposure ─────────────────────────────────────────────────────────────
 * The three cache keys were literals — `analytics:${type}`, `stats:overview`,
 * `insights:factual` — with no tenant component. The SQL underneath IS filtered
 * (csr_reports carries organization_id with RLS enabled and forced, and pool
 * instrumentation applies app.current_tenant_id LOCAL to each pooled statement
 * under RLS_ENFORCE=on), so each payload was computed FOR the requesting tenant
 * and then stored where every other tenant would find it for 30 seconds.
 *
 * What leaks is not only counts: `therapeuticAreas` is keyed by indication name
 * straight out of csr_reports.indication. On a platform holding unannounced
 * programmes, that list is the confidential part.
 *
 * ── Why the previous version of the first test above passed anyway ───────────
 * It mounted the router with NO auth middleware and asserted that a second
 * anonymous request got `X-Cache: HIT`. That is precisely the shared-bucket
 * behaviour being removed — the test encoded the leak as the expectation, which
 * is why it stayed green for as long as the defect existed. It now establishes a
 * tenant, and cross-tenant reuse is asserted against below.
 */
describe('csr-intelligence-routes tenant isolation', () => {
  it('does not serve org A its cached analytics to org B', async () => {
    const pool = createMockPool();

    const a = await request(appForOrg(pool, 'iso-analytics-a')).get(
      '/api/csr-intelligence/analytics',
    );
    const b = await request(appForOrg(pool, 'iso-analytics-b')).get(
      '/api/csr-intelligence/analytics',
    );

    expect(a.headers['x-cache']).toBe('MISS');
    // The assertion that fails on a shared key: B must compute its own answer.
    expect(b.headers['x-cache']).toBe('MISS');
    // Six queries, not three — B's request reached the database.
    expect(pool.query).toHaveBeenCalledTimes(6);
  });

  it('does not serve org A its cached stats to org B', async () => {
    const pool = createMockPool();

    const a = await request(appForOrg(pool, 'iso-stats-a')).get('/api/csr-intelligence/stats');
    const b = await request(appForOrg(pool, 'iso-stats-b')).get('/api/csr-intelligence/stats');

    expect(a.headers['x-cache']).toBe('MISS');
    expect(b.headers['x-cache']).toBe('MISS');
  });

  it('does not serve org A its cached insights to org B', async () => {
    const pool = createMockPool();

    const a = await request(appForOrg(pool, 'iso-insights-a')).get(
      '/api/csr-intelligence/factual-insights',
    );
    const b = await request(appForOrg(pool, 'iso-insights-b')).get(
      '/api/csr-intelligence/factual-insights',
    );

    expect(a.headers['x-cache']).toBe('MISS');
    expect(b.headers['x-cache']).toBe('MISS');
  });

  it('keeps serving the SAME tenant from cache — the fix must not disable caching', async () => {
    const pool = createMockPool();
    const app = appForOrg(pool, 'iso-same-tenant');

    await request(app).get('/api/csr-intelligence/analytics');
    const second = await request(app).get('/api/csr-intelligence/analytics');

    expect(second.headers['x-cache']).toBe('HIT');
  });

  it('never caches when no organization can be resolved', async () => {
    const pool = createMockPool();
    const app = appForOrg(pool, null); // no req.user at all

    const first = await request(app).get('/api/csr-intelligence/analytics');
    const second = await request(app).get('/api/csr-intelligence/analytics');

    // Falling back to a shared "anonymous" key would rebuild the very bucket
    // this change removes, and would be reached exactly when identity is least
    // certain. No key means no participation: both requests are computed.
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('MISS');
    expect(pool.query).toHaveBeenCalledTimes(6);
  });

  it('separates cache entries by analytics type as well as tenant', async () => {
    const pool = createMockPool();
    const app = appForOrg(pool, 'iso-type-org');

    const dashboard = await request(app).get('/api/csr-intelligence/analytics?type=dashboard');
    const trends = await request(app).get('/api/csr-intelligence/analytics?type=trends');

    expect(dashboard.headers['x-cache']).toBe('MISS');
    expect(trends.headers['x-cache']).toBe('MISS');
  });
});
