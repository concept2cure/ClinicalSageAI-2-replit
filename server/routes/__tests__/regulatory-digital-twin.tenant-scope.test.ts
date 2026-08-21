/**
 * The digital-twin simulation store is tenant-scoped, at the route layer.
 *
 * ── What this locks ──────────────────────────────────────────────────────────
 * `regulatory_twin_simulations` had no tenant column and the router queried it
 * with no predicate:
 *
 *     SELECT … FROM regulatory_twin_simulations ORDER BY created_at DESC LIMIT 100
 *
 * so GET /simulations returned every tenant's rows, GET /simulations/:id
 * returned any tenant's row to anyone holding the id, and GET /health reported
 * how many simulations every other customer had run. The stored
 * submission_profile carries submission type, therapeutic area and target
 * agencies — on a platform holding unannounced programmes, that is the
 * confidential part.
 *
 * Row-level security is the backstop (the column is added by
 * db/migrations/20260821_regulatory_twin_simulations_tenant_scope.sql and the
 * canonical sweep policies it), but RLS only filters for the non-superuser
 * runtime role and only when RLS_ENFORCE=on. The app-layer predicate is the
 * primary boundary, so it is asserted here on its own: every statement the
 * router issues against that table names the organization, and a request that
 * carries no verified organization is refused rather than served a wider view.
 *
 * ── Why the SQL text is inspected ────────────────────────────────────────────
 * Asserting on the response body would pass against a handler that queried
 * every tenant and filtered in JavaScript — which is not the property. What
 * matters is what reaches the database, so the mocked `db.execute` records the
 * statements and the assertions read them.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/** Every statement the router issued, in order. */
const issued: string[] = [];

vi.mock('../../db', () => ({
  db: {
    execute: vi.fn(async (query: any) => {
      // Drizzle's sql`` template exposes its fragments; join them so the
      // predicate is visible without needing a real dialect to compile it.
      const text = Array.isArray(query?.queryChunks)
        ? query.queryChunks
            .map((c: any) => (typeof c?.value === 'object' ? c.value.join('') : String(c?.value ?? '')))
            .join(' ')
        : String(query);
      issued.push(text);
      return { rows: [] };
    }),
  },
  pool: {},
}));

const ORG_A = 4242;

/**
 * Mount the router with a JWT-shaped identity, the way the global /api auth
 * gate leaves a request. `organizationId` on req.user is what getSecureOrgId
 * reads first; nothing here sets an x-organization-id header, which that helper
 * ignores anyway.
 */
async function appFor(user: Record<string, unknown> | null) {
  const { default: router } = await import('../regulatory-digital-twin');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) (req as any).user = user;
    next();
  });
  app.use('/api/regulatory-digital-twin', router);
  return app;
}

/** Statements touching the simulation store, ignoring everything else. */
function simulationStatements() {
  return issued.filter(s => s.includes('regulatory_twin_simulations'));
}

beforeEach(() => {
  issued.length = 0;
});

describe('regulatory_twin_simulations is queried per tenant', () => {
  it('GET /simulations filters by organization_id', async () => {
    const app = await appFor({ id: 1, organizationId: ORG_A });
    const res = await request(app).get('/api/regulatory-digital-twin/simulations');

    expect(res.status).toBe(200);
    const statements = simulationStatements();
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s).toMatch(/organization_id\s*=/);
    }
  });

  it('GET /simulations/:id filters by organization_id, so another tenant sees a 404', async () => {
    const app = await appFor({ id: 1, organizationId: ORG_A });
    const res = await request(app).get('/api/regulatory-digital-twin/simulations/sim_someone_elses');

    // The mocked db returns no rows, which is exactly what a scoped read of
    // another tenant's id produces.
    expect(res.status).toBe(404);
    const statements = simulationStatements();
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s).toMatch(/organization_id\s*=/);
    }
  });

  it('GET /health counts only the caller’s simulations', async () => {
    const app = await appFor({ id: 1, organizationId: ORG_A });
    const res = await request(app).get('/api/regulatory-digital-twin/health');

    expect(res.status).toBe(200);
    for (const s of simulationStatements()) {
      expect(s).toMatch(/organization_id\s*=/);
    }
  });

  it('POST /simulations stamps the tenant on the stored row', async () => {
    const app = await appFor({ id: 1, organizationId: ORG_A });
    const res = await request(app)
      .post('/api/regulatory-digital-twin/simulations')
      .send({
        // Same shape the determinism suite uses — the engine reads clinicalData.
        submission: {
          id: 'sub-1',
          type: 'NDA',
          therapeuticArea: 'oncology',
          indication: 'NSCLC',
          moduleContents: {},
          clinicalData: {
            pivotalTrials: 2,
            totalPatients: 800,
            primaryEndpointMet: true,
            pValue: 0.0005,
            effectSize: 0.6,
            safetySignals: ['mild neutropenia'],
            missingDataPercentage: 5,
          },
        },
        agencies: ['FDA'],
      });

    expect(res.status).toBe(200);
    const inserts = simulationStatements().filter(s => /INSERT\s+INTO/i.test(s));
    expect(inserts.length).toBe(1);
    expect(inserts[0]).toMatch(/organization_id/);
  });
});

describe('a request with no verified organization is refused, not widened', () => {
  /**
   * The pre-fix behaviour for a tenant-less request was a full-table read. Fail
   * closed is the only safe answer: no org, no rows, and no query at all.
   */
  it('GET /simulations answers 403 and issues no query', async () => {
    const app = await appFor(null);
    const res = await request(app).get('/api/regulatory-digital-twin/simulations');

    expect(res.status).toBe(403);
    expect(simulationStatements()).toEqual([]);
  });

  it('GET /simulations/:id answers 403 and issues no query', async () => {
    const app = await appFor(null);
    const res = await request(app).get('/api/regulatory-digital-twin/simulations/sim_anything');

    expect(res.status).toBe(403);
    expect(simulationStatements()).toEqual([]);
  });

  it('GET /health reports no count rather than a platform-wide total', async () => {
    const app = await appFor(null);
    const res = await request(app).get('/api/regulatory-digital-twin/health');

    expect(res.status).toBe(200);
    expect(res.body.simulationsStored).toBeNull();
    expect(simulationStatements()).toEqual([]);
  });
});
