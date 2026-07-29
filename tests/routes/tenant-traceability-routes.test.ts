/**
 * Integration tests for the QMP Traceability Matrix routes
 * (server/routes/tenant-traceability.ts).
 *
 * Purpose: lock in the route's observable control-flow contract BEFORE removing
 * the file's `// @ts-nocheck` and fixing its 17 latent type errors, so the type
 * cleanup can be proven behavior-preserving. See FORENSIC_CODE_AUDIT_2026-05-29.md
 * (MEDIUM: @ts-nocheck cleanup).
 *
 * The Drizzle access layer (getDb) and tenant-context middleware are mocked so the
 * tests exercise the route handlers' branching (validation 400s, not-found 404s,
 * org-context gate, success shapes) without a database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mock tenant-context middleware: attach an org context and pass through ──────
let attachOrgContext = true;
vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (req: any, _res: any, next: any) => {
    if (attachOrgContext) {
      req.tenantContext = { organizationId: 99, userId: 7, role: 'admin' };
    }
    next();
  },
  requireOrganizationContext: (req: any, res: any, next: any) => {
    if (!req.tenantContext?.organizationId) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    next();
  },
}));

// ── Mock getDb with a configurable chainable query builder ─────────────────────
// Each query resolves to `nextRows`. Chain methods return the same thenable so any
// ordering of .from().where().leftJoin().limit() works; awaiting yields nextRows,
// and .then(fn) (used by the routes) maps over it too.
let nextRows: any[] = [];
const insertReturning = vi.fn();

function makeChain() {
  const rows = nextRows;
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    set: () => chain,
    values: () => chain,
    update: () => chain,
    delete: () => chain,
    insert: () => chain,
    returning: () => insertReturning(),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

vi.mock('../../server/db/tenantDbHelper', () => ({
  getDb: () => makeChain(),
  default: () => makeChain(),
}));

// db import is unused by the handlers' logic paths but imported at module load
vi.mock('../../server/db', () => ({ db: {}, pool: {}, getPool: () => ({}) }));

// Safety net: stub the lazy db client module so no real pg/drizzle wiring loads
// transitively if the tenantContext mock is bypassed during resolution.
vi.mock('../../server/middleware/lazyRequestDbClient', () => ({
  LazyRequestDbClient: class {},
}));

import traceabilityRouter from '../../server/routes/tenant-traceability';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/traceability', traceabilityRouter);
  return app;
}

beforeEach(() => {
  attachOrgContext = true;
  nextRows = [];
  insertReturning.mockReset();
  insertReturning.mockResolvedValue([]);
});

describe('tenant-traceability · org-context gate', () => {
  it('returns 403 when no organization context is present', async () => {
    attachOrgContext = false;
    const res = await request(makeApp()).get('/api/traceability/1');
    expect(res.status).toBe(403);
  });
});

describe('tenant-traceability · GET /:qmpId', () => {
  it('400s on a non-numeric qmpId', async () => {
    const res = await request(makeApp()).get('/api/traceability/not-a-number');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid QMP ID/i);
  });

  it('returns items for a valid qmpId', async () => {
    nextRows = [{ qmp_traceability_matrix: { id: 1 } }];
    const res = await request(makeApp()).get('/api/traceability/42');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe('tenant-traceability · GET /item/:id', () => {
  it('400s on a non-numeric id', async () => {
    const res = await request(makeApp()).get('/api/traceability/item/abc');
    expect(res.status).toBe(400);
  });

  it('404s when the item does not exist', async () => {
    nextRows = [];
    const res = await request(makeApp()).get('/api/traceability/item/5');
    expect(res.status).toBe(404);
  });

  it('returns the item when found', async () => {
    nextRows = [{ id: 5, requirementId: 'REQ-1' }];
    const res = await request(makeApp()).get('/api/traceability/item/5');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 5);
  });
});

describe('tenant-traceability · POST /', () => {
  it('400s on invalid body (fails zod validation)', async () => {
    const res = await request(makeApp()).post('/api/traceability').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid traceability item data/i);
  });

  it('404s when the referenced QMP is not found for the tenant', async () => {
    nextRows = []; // QMP lookup returns nothing
    const res = await request(makeApp())
      .post('/api/traceability')
      // Full valid body so zod passes and the handler reaches the QMP-ownership
      // lookup that returns the 404. The insert schema requires the notNull
      // columns: organizationId, qmpId, requirementId, requirementText.
      .send({
        organizationId: 99,
        qmpId: 1,
        requirementId: 'REQ-1',
        requirementText: 'The system shall.',
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/QMP not found/i);
  });
});

describe('tenant-traceability · PUT /:id', () => {
  it('400s on a non-numeric id', async () => {
    const res = await request(makeApp()).put('/api/traceability/xyz').send({});
    expect(res.status).toBe(400);
  });
});

describe('tenant-traceability · DELETE /:id', () => {
  it('400s on a non-numeric id', async () => {
    const res = await request(makeApp()).delete('/api/traceability/xyz');
    expect(res.status).toBe(400);
  });

  it('404s when the item to delete does not exist', async () => {
    nextRows = [];
    const res = await request(makeApp()).delete('/api/traceability/5');
    expect(res.status).toBe(404);
  });
});

describe('tenant-traceability · PUT /verify-batch/:qmpId', () => {
  it('400s on a non-numeric qmpId', async () => {
    const res = await request(makeApp()).put('/api/traceability/verify-batch/abc').send({});
    expect(res.status).toBe(400);
  });

  it('400s when itemIds is not a non-empty array', async () => {
    const res = await request(makeApp())
      .put('/api/traceability/verify-batch/1')
      .send({ itemIds: [], verificationStatus: 'verified' });
    expect(res.status).toBe(400);
  });

  it('400s on an invalid verificationStatus', async () => {
    const res = await request(makeApp())
      .put('/api/traceability/verify-batch/1')
      .send({ itemIds: [1], verificationStatus: 'bogus' });
    expect(res.status).toBe(400);
  });
});

describe('tenant-traceability · GET /stats/:qmpId', () => {
  it('400s on a non-numeric qmpId', async () => {
    const res = await request(makeApp()).get('/api/traceability/stats/abc');
    expect(res.status).toBe(400);
  });

  it('computes completion stats over the returned items', async () => {
    nextRows = [
      { verificationStatus: 'verified' },
      { verificationStatus: 'verified' },
      { verificationStatus: 'failed' },
      { verificationStatus: 'pending' },
    ];
    const res = await request(makeApp()).get('/api/traceability/stats/1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 4,
      verified: 2,
      failed: 1,
      pending: 1,
      completionPercentage: 50,
    });
  });
});
