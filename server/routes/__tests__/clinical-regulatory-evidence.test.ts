/**
 * Clinical-Regulatory Intelligence Graph — route contract.
 *
 * These routes serve regulatory evidence that a user may cite in a submission,
 * so the contract they must hold is narrower than "returns 200":
 *
 *   1. FLAG OFF ⇒ 404, not an empty 200. An empty 200 would leave the surfaces
 *      rendering a corpus-empty state for a feature that is simply switched off,
 *      which reads to the user as "we searched and found nothing".
 *   2. FAIL CLOSED on missing tenant context — never an unscoped read.
 *   3. TENANT SCOPE COMES FROM JWT-BOUND CONTEXT ONLY. A query parameter must
 *      not be able to widen visibility to another organization.
 *   4. An un-ingested corpus reports real zeros WITH an explanation, never
 *      fabricated findings.
 *   5. Unknown enum filter values are dropped rather than passed through, so the
 *      service can't silently return a wider set than the user asked for.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The facade now counts the real cre_* spine through the shared pool. These are
// CONTRACT tests, so they drive the real facade over a stubbed EMPTY store —
// every query resolves to zero rows. (The previous facade returned its empty
// path whenever the drizzle handle was null, which made a dead database
// connection indistinguishable from an empty corpus; the new one reports a
// connection failure as a failure, so the tests must provide an actual empty
// store rather than a null handle.)
vi.mock('../../db', () => ({
  db: null,
  pool: {
    query: async (sql: string) =>
      /FROM cre_evidence_sources/.test(sql) && /COUNT\(\*\)/.test(sql)
        ? { rows: [{ scanned: 0, eligible: 0, structured: 0, verified: 0, cited: 0, freshness: null }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
  },
}));

import createClinicalRegulatoryEvidenceRoutes, {
  isGraphEnabled,
} from '../clinical-regulatory-evidence-routes';
import * as evidence from '../../services/clinical-regulatory-evidence/index.js';

/** Mount the router behind a stub that injects JWT-bound tenant context. */
function appWith(context: { organizationId?: number } | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (context) (req as unknown as { tenantContext: unknown }).tenantContext = context;
    next();
  });
  app.use('/api/clinical-regulatory-evidence', createClinicalRegulatoryEvidenceRoutes());
  return app;
}

const ORIGINAL_FLAG = process.env.ENABLE_CLINICAL_REGULATORY_GRAPH;

beforeEach(() => {
  process.env.ENABLE_CLINICAL_REGULATORY_GRAPH = 'true';
});
afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.ENABLE_CLINICAL_REGULATORY_GRAPH;
  else process.env.ENABLE_CLINICAL_REGULATORY_GRAPH = ORIGINAL_FLAG;
  vi.restoreAllMocks();
});

describe('feature flag', () => {
  it('defaults to off — a regulated evidence path is never on by omission', () => {
    delete process.env.ENABLE_CLINICAL_REGULATORY_GRAPH;
    expect(isGraphEnabled()).toBe(false);
  });

  it('404s every route when the flag is off, rather than returning an empty 200', async () => {
    process.env.ENABLE_CLINICAL_REGULATORY_GRAPH = 'false';
    const app = appWith({ organizationId: 7 });
    for (const path of [
      '/api/clinical-regulatory-evidence/coverage',
      '/api/clinical-regulatory-evidence/findings',
      '/api/clinical-regulatory-evidence/findings/f-1',
      '/api/clinical-regulatory-evidence/outcome?applicationNumber=X',
      '/api/clinical-regulatory-evidence/design-evidence?designNodeId=d1',
      '/api/clinical-regulatory-evidence/trace/t-1',
    ]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
    }
  });
});

describe('tenant scoping — fails closed', () => {
  it('401s when no tenant context is present', async () => {
    const res = await request(appWith(null)).get('/api/clinical-regulatory-evidence/findings');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Organization context required/);
  });

  it('401s when the context carries a non-positive organization id', async () => {
    const res = await request(appWith({ organizationId: 0 })).get(
      '/api/clinical-regulatory-evidence/findings',
    );
    expect(res.status).toBe(401);
  });

  it('ignores an organizationId supplied in the query string', async () => {
    const spy = vi.spyOn(evidence, 'searchFindings');
    await request(appWith({ organizationId: 7 })).get(
      '/api/clinical-regulatory-evidence/findings?organizationId=999',
    );
    // The scope handed to the facade is the JWT-bound org, never the query's.
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].organizationId).toBe(7);
  });

  it('cannot be reached unscoped even if a route is called directly', async () => {
    await expect(
      evidence.searchFindings({ organizationId: 0 } as never, {}),
    ).rejects.toThrow(/Organization context required/);
  });
});

describe('honest empty corpus', () => {
  it('reports real zeros with an explanation, not fabricated findings', async () => {
    const res = await request(appWith({ organizationId: 7 })).get(
      '/api/clinical-regulatory-evidence/findings',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.findings).toEqual([]);
    expect(res.body.data.coverage.scanned).toBe(0);
    expect(res.body.data.coverage.exclusionNote).toMatch(/has been ingested/i);
    expect(res.body.data.insufficientEvidence).toMatchObject({ usable: 0, total: 0 });
  });

  it('returns coverage with every count present, so a denominator is always available', async () => {
    const res = await request(appWith({ organizationId: 7 })).get(
      '/api/clinical-regulatory-evidence/coverage',
    );
    expect(res.status).toBe(200);
    for (const k of ['scanned', 'eligible', 'structured', 'verified', 'cited']) {
      expect(typeof res.body.data[k], k).toBe('number');
    }
  });

  it('404s an unknown finding and an unknown trace — absent and invisible look alike', async () => {
    const app = appWith({ organizationId: 7 });
    expect((await request(app).get('/api/clinical-regulatory-evidence/findings/nope')).status).toBe(404);
    expect((await request(app).get('/api/clinical-regulatory-evidence/trace/nope')).status).toBe(404);
  });

  it('reports no verified outcome as null, never as an inferred outcome', async () => {
    const res = await request(appWith({ organizationId: 7 })).get(
      '/api/clinical-regulatory-evidence/outcome?applicationNumber=NDA%20000000',
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

describe('§8.1 constraint parsing', () => {
  it('passes recognized constraints through to the facade', async () => {
    const spy = vi.spyOn(evidence, 'searchFindings');
    await request(appWith({ organizationId: 7 })).get(
      '/api/clinical-regulatory-evidence/findings?discipline=clinical&ctdSection=2.7.3&verification=source_verified&text=endpoint',
    );
    expect(spy.mock.calls[0][1]).toMatchObject({
      discipline: 'clinical',
      ctdSection: '2.7.3',
      verification: 'source_verified',
      text: 'endpoint',
    });
  });

  it('drops an unrecognized enum value rather than forwarding it', async () => {
    const spy = vi.spyOn(evidence, 'searchFindings');
    await request(appWith({ organizationId: 7 })).get(
      '/api/clinical-regulatory-evidence/findings?discipline=not-a-discipline&verification=bogus',
    );
    // Forwarding an unknown filter would silently widen the result set while the
    // user believed they had constrained it.
    expect(spy.mock.calls[0][1]!.discipline).toBeUndefined();
    expect(spy.mock.calls[0][1]!.verification).toBeUndefined();
  });

  it('requires the identifiers the panels are keyed to', async () => {
    const app = appWith({ organizationId: 7 });
    expect((await request(app).get('/api/clinical-regulatory-evidence/outcome')).status).toBe(400);
    expect((await request(app).get('/api/clinical-regulatory-evidence/design-evidence')).status).toBe(400);
    expect((await request(app).post('/api/clinical-regulatory-evidence/stress-test').send({})).status).toBe(400);
  });
});
