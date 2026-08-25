/**
 * API-honesty regression: regulated Part 11 reads must surface a real error
 * status when the underlying query fails — never HTTP 200 with an empty
 * (but "successful") payload. See defect API-BACKEND-1.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import part11Router from '../part11-compliance';

/**
 * Mount the router with an injected request-scoped client whose query() always
 * rejects.
 *
 * `req.dbClient`, not `req.pool`. These tests injected `req.pool`, which is the
 * property the routes USED to read — and which nothing in production ever
 * assigns, so every one of these routes 500'd on `pool.query` of undefined
 * before reaching any of the behaviour asserted here. The tests passed against
 * a code path that could not execute. `dbClient` is what
 * `establishRequestTenantScope` really attaches.
 *
 * A tenant is supplied because these reads now REQUIRE one — an unscoped read
 * of another tenant's signatures is the defect that repairing the connection
 * would otherwise have armed.
 */
function appWithFailingPool(err: Error) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).dbClient = { query: () => Promise.reject(err) };
    (req as any).user = { organizationId: 7 };
    next();
  });
  app.use('/', part11Router);
  return app;
}

describe('Part 11 reads fail closed on query error (no false-empty 200)', () => {
  it('GET /signatures/:documentId returns 500 on a generic query failure', async () => {
    const app = appWithFailingPool(new Error('boom'));
    const res = await request(app).get('/signatures/doc-123');
    expect(res.status).toBe(500);
    expect(res.body?.success).not.toBe(true);
  });

  it('GET /signatures/:documentId returns 503 when the store is unprovisioned', async () => {
    const err: any = new Error('relation "electronic_signatures" does not exist');
    err.code = '42P01';
    const app = appWithFailingPool(err);
    const res = await request(app).get('/signatures/doc-123');
    expect(res.status).toBe(503);
    expect(res.body?.success).not.toBe(true);
  });

  /* `/audit-trail/:entityId` is DELIBERATELY still unconnected — see the long
     comment on the route. It selects six columns that exist on no table it can
     reach, and has no tenant column to build a predicate from, so connecting it
     would turn a TypeError into a 42703 and arm an unscoped read of an
     enumerable serial at the same time.

     Its "fail closed" behaviour therefore cannot be exercised: the handler
     never reaches a query. What CAN be asserted, and is asserted here, is the
     part that still matters — it does not answer 200 with an empty audit
     trail, which is the defect this file exists for. The 503-on-42P01 case is
     unreachable until the route is re-pointed at `audit_events` or deleted. */
  it('GET /audit-trail/:entityId still refuses rather than serving an empty trail', async () => {
    const app = appWithFailingPool(new Error('boom'));
    const res = await request(app).get('/audit-trail/entity-1');
    expect(res.status).toBeGreaterThanOrEqual(500);
    // Must NOT be a 200 empty audit trail.
    expect(res.body?.data?.entries).toBeUndefined();
  });
});
