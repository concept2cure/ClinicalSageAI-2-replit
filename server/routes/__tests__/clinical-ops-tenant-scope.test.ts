/**
 * Clinical operations — the tenant predicate was a default.
 *
 * `getOrgId` returned null for a request with no tenant on it, and every query
 * in this router spelled its predicate as an OR against a null check on that
 * parameter — which is TRUE when the parameter is null. So a context-less
 * request did not read the WRONG organization's clinical operations. It read
 * EVERY organization's: studies, sites, enrollment, monitoring visits,
 * protocol deviations and milestones, across the whole database.
 *
 * The two UPDATE endpoints were worse. Their guard was appended only
 * `if (orgId)`, so without a tenant the statement ran as `WHERE id = $1`
 * alone — enough to change another sponsor's study record or set a site's
 * status.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import createClinicalOperationsRoutes from '../clinical-operations-routes';

const query = vi.fn();

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).tenantId = org;
    next();
  });
  app.use('/api/clinical-operations', createClinicalOperationsRoutes({ query } as any));
  return app;
}

/** Every SQL statement the handler issued. */
const statements = () => query.mock.calls.map((c: unknown[]) => String(c[0]));

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe('the clinical-operations router refuses without organization context', () => {
  const cases: Array<[string, 'get' | 'post' | 'put', string, Record<string, unknown> | undefined]> = [
    ['studies list', 'get', '/api/clinical-operations/studies', undefined],
    ['portfolio overview', 'get', '/api/clinical-operations/overview', undefined],
    ['study update', 'put', '/api/clinical-operations/studies/6f1d7d2e-3b4a-4f5c-8d9e-0a1b2c3d4e5f', { status: 'active' }],
    ['site status update', 'put', '/api/clinical-operations/sites/12/status', { status: 'active' }],
  ];

  for (const [label, method, path, body] of cases) {
    it(`403s on the ${label} rather than reading or writing across tenants`, async () => {
      const req = request(appWith(null))[method](path);
      const res = body ? await req.send(body) : await req;

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CLINOPS_ORG_REQUIRED');
      // Nothing reached the database on nobody's behalf.
      expect(query).not.toHaveBeenCalled();
    });
  }
});

describe('every tenant predicate is unconditional', () => {
  it('scopes the studies list to the caller organization, with no null escape', async () => {
    await request(appWith(7)).get('/api/clinical-operations/studies');

    const projection = statements().find((s) => s.includes('AS "studyId"'));
    expect(projection).toBeTruthy();
    expect(projection).toContain('org_id = $1');
    // The escape that made the predicate optional.
    expect(projection).not.toMatch(/IS NULL OR/);
    expect(query.mock.calls[0][1]).toContain(7);
  });

  it('scopes the study UPDATE — the statement can never be WHERE id alone', async () => {
    await request(appWith(7))
      .put('/api/clinical-operations/studies/6f1d7d2e-3b4a-4f5c-8d9e-0a1b2c3d4e5f')
      .send({ status: 'active' });

    const update = statements().find((s) => s.includes('UPDATE clinical_ops.studies'));
    expect(update).toBeTruthy();
    expect(update).toMatch(/WHERE id = \$1 AND org_id = \$\d+/);
  });

  it('scopes the site-status UPDATE the same way', async () => {
    await request(appWith(7))
      .put('/api/clinical-operations/sites/12/status')
      .send({ status: 'active' });

    const update = statements().find((s) => s.includes('UPDATE clinical_ops.sites'));
    expect(update).toBeTruthy();
    expect(update).toMatch(/WHERE id = \$1 AND org_id = \$\d+/);
  });

  it('leaves no null-escape anywhere in the router’s SQL', async () => {
    // Exercise the read paths that build their predicates from sub-selects.
    await request(appWith(7)).get('/api/clinical-operations/studies/6f1d7d2e-3b4a-4f5c-8d9e-0a1b2c3d4e5f/deviations');
    await request(appWith(7)).get('/api/clinical-operations/studies/6f1d7d2e-3b4a-4f5c-8d9e-0a1b2c3d4e5f/enrollment');

    for (const sql of statements()) {
      expect(sql).not.toMatch(/IS NULL OR/);
    }
    expect(statements().length).toBeGreaterThan(0);
  });
});
