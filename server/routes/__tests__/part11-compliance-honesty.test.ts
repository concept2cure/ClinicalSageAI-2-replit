/**
 * API-honesty regression: regulated Part 11 reads must surface a real error
 * status when the underlying query fails — never HTTP 200 with an empty
 * (but "successful") payload. See defect API-BACKEND-1.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import part11Router from '../part11-compliance';

/** Mount the router with an injected pool whose query() always rejects. */
function appWithFailingPool(err: Error) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).pool = { query: () => Promise.reject(err) };
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

  it('GET /audit-trail/:entityId returns 500 on a generic query failure', async () => {
    const app = appWithFailingPool(new Error('boom'));
    const res = await request(app).get('/audit-trail/entity-1');
    expect(res.status).toBe(500);
    // Must NOT be a 200 empty audit trail.
    expect(res.body?.data?.entries).toBeUndefined();
  });

  it('GET /audit-trail/:entityId returns 503 when the store is unprovisioned', async () => {
    const err: any = new Error('relation "audit_trail" does not exist');
    err.code = '42P01';
    const app = appWithFailingPool(err);
    const res = await request(app).get('/audit-trail/entity-1');
    expect(res.status).toBe(503);
  });
});
