/**
 * Integration tests for the EU MDR/IVDR CER routes mounted at /api/cer:
 *   POST /mdr/generate            — structured CER generation
 *   GET  /mdr/:reportId/validate  — GSPR/Annex conformance validation
 *   POST /reports/:cerId/evidence — attach clinical evidence
 *
 * Covers the auth gate, input validation, and — critically — that every path
 * FAILS CLOSED (never a fabricated success / auto-valid) when the underlying
 * data is absent. The DB is mocked (chainable, returns no rows) so the tests
 * don't depend on a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Chainable drizzle-like mock; every select resolves to [] (no rows). Built
// inside the factory because vi.mock is hoisted above top-level declarations.
vi.mock('../server/db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve([]),
    insert: () => chain,
    values: () => chain,
    returning: () => Promise.resolve([]),
    update: () => chain,
    set: () => chain,
    delete: () => chain,
    execute: () => Promise.resolve({ rows: [] }),
  };
  const query = () => Promise.resolve({ rows: [], rowCount: 0 });
  return { db: chain, pool: { query }, getPool: () => ({ query }) };
});

// Audit logging is a side effect we don't exercise here.
vi.mock('../server/services/auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue(undefined) },
}));

import cerRouter from '../server/routes/cer-routes';

function makeApp(opts: { withAuth?: boolean } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      (req as any).user = { id: 777, organizationId: 99 };
      next();
    });
  }
  app.use('/api/cer', cerRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CER MDR routes — auth gate', () => {
  it.each([
    ['post', '/api/cer/mdr/generate'],
    ['get', '/api/cer/mdr/CER-123/validate'],
    ['post', '/api/cer/reports/1/evidence'],
  ])('%s %s returns 403 without org context', async (method, url) => {
    const app = makeApp({ withAuth: false });
    const res = await (request(app) as any)[method](url).send({});
    expect(res.status).toBe(403);
  });
});

describe('POST /api/cer/mdr/generate', () => {
  it('rejects an invalid body with 400', async () => {
    const res = await request(makeApp()).post('/api/cer/mdr/generate').send({ deviceId: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown regulatory framework with 400', async () => {
    const res = await request(makeApp())
      .post('/api/cer/mdr/generate')
      .send({ deviceId: 5, regulatoryFramework: 'NOT_A_FRAMEWORK' });
    expect(res.status).toBe(400);
  });

  it('fails closed (422) for a non-existent device instead of fabricating a report', async () => {
    const res = await request(makeApp())
      .post('/api/cer/mdr/generate')
      .send({ deviceId: 999999, regulatoryFramework: 'MDR_2017_745' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/failed/i);
  });
});

describe('GET /api/cer/mdr/:reportId/validate', () => {
  it('rejects an unsafe report id with 400', async () => {
    const res = await request(makeApp()).get('/api/cer/mdr/..%2F..%2Fetc/validate');
    expect([400, 404]).toContain(res.status); // unsafe id rejected (never 200)
  });

  it('returns 404 (never auto-valid) when the report does not exist', async () => {
    const res = await request(makeApp()).get('/api/cer/mdr/CER-DOES-NOT-EXIST/validate');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/cer/reports/:cerId/evidence', () => {
  it('rejects a non-numeric CER id with 400', async () => {
    const res = await request(makeApp())
      .post('/api/cer/reports/abc/evidence')
      .send({ type: 'literature', title: 'X', findings: 'Y', relevance: 0.5, quality: 0.5 });
    expect(res.status).toBe(400);
  });

  it('rejects invalid evidence payload with 400', async () => {
    const res = await request(makeApp())
      .post('/api/cer/reports/1/evidence')
      .send({ type: 'not_a_type', title: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when attaching evidence to a CER not owned by the tenant', async () => {
    const res = await request(makeApp())
      .post('/api/cer/reports/123/evidence')
      .send({
        type: 'clinical_investigation',
        title: 'Pivotal trial',
        findings: 'Met primary endpoint',
        relevance: 0.9,
        quality: 0.8,
      });
    expect(res.status).toBe(404);
  });
});
