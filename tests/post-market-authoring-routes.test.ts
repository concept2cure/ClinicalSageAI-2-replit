/**
 * Integration tests for the post-market authoring routes mounted at
 * /api/post-market:
 *   POST /programs/:programId/documents/pmcf-plan/generate
 *   POST /programs/:programId/documents/:documentType/generate
 *
 * Covers the auth gate, program-access scoping, and input validation. The DB is
 * mocked (chainable) and auth middleware is a pass-through so the tests don't
 * need a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Shared mutable holder for what `select(...).limit()` resolves to (used to
// toggle program-access pass/deny). Hoisted so the vi.mock factory can close
// over it safely.
const h = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock('../server/db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(h.rows),
    insert: () => chain,
    values: () => chain,
    returning: () => Promise.resolve(h.rows),
    update: () => chain,
    set: () => chain,
    delete: () => chain,
    execute: () => Promise.resolve({ rows: [] }),
  };
  const query = () => Promise.resolve({ rows: [], rowCount: 0 });
  return { db: chain, pool: { query }, getPool: () => ({ query }) };
});

vi.mock('../server/middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../server/services/auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue(undefined) },
}));

import { postMarketRouter } from '../server/routes/gspr-postmarket';

function makeApp(withAuth = true) {
  const app = express();
  app.use(express.json());
  if (withAuth) {
    app.use((req, _res, next) => {
      (req as any).user = { id: 7, organizationId: 99 };
      next();
    });
  }
  app.use('/api/post-market', postMarketRouter);
  return app;
}

beforeEach(() => {
  h.rows = [];
  vi.clearAllMocks();
});

describe('post-market authoring — auth gate', () => {
  it.each([
    '/api/post-market/programs/p1/documents/pmcf-plan/generate',
    '/api/post-market/programs/p1/documents/pms_plan/generate',
  ])('POST %s returns 403 without org context', async url => {
    const res = await request(makeApp(false)).post(url).send({ deviceName: 'X' });
    expect(res.status).toBe(403);
  });
});

describe('post-market authoring — program access scoping', () => {
  it('returns 403 when the program is not owned by the tenant', async () => {
    h.rows = []; // requireProgramAccess finds no program row
    const res = await request(makeApp())
      .post('/api/post-market/programs/not-mine/documents/pms_plan/generate')
      .send({ deviceName: 'Acme Pump' });
    expect(res.status).toBe(403);
  });
});

describe('post-market authoring — input validation (program access granted)', () => {
  beforeEach(() => {
    h.rows = [{ id: 'p1' }]; // requireProgramAccess passes
  });

  it('rejects an unknown documentType with 422', async () => {
    const res = await request(makeApp())
      .post('/api/post-market/programs/p1/documents/not_a_type/generate')
      .send({ deviceName: 'Acme Pump' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/documentType must be one of/i);
  });

  it('rejects when neither deviceName nor relatedCerReportId is provided', async () => {
    const res = await request(makeApp())
      .post('/api/post-market/programs/p1/documents/pms_plan/generate')
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/deviceName or relatedCerReportId/i);
  });

  it('rejects an invalid regulation with 422', async () => {
    const res = await request(makeApp())
      .post('/api/post-market/programs/p1/documents/sscp/generate')
      .send({ deviceName: 'Acme Pump', regulation: 'FDA' });
    expect(res.status).toBe(422);
  });

  it('rejects a non-integer relatedCerReportId with 422', async () => {
    const res = await request(makeApp())
      .post('/api/post-market/programs/p1/documents/psur/generate')
      .send({ relatedCerReportId: 'abc' });
    expect(res.status).toBe(422);
  });

  it('accepts hyphenated document types (pmcf-evaluation → pmcf_evaluation)', async () => {
    // Reaches the generator (program access ok, valid input); with the mocked
    // DB this resolves without throwing a validation 422.
    const res = await request(makeApp())
      .post('/api/post-market/programs/p1/documents/pmcf-evaluation/generate')
      .send({ deviceName: 'Acme Pump' });
    expect(res.status).not.toBe(422);
  });
});
