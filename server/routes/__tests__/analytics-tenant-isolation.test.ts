/**
 * Analytics tenant-isolation contract.
 *
 * csr_reports is org-scoped tenant data, but the analytics endpoints used to
 * aggregate it with NO organization filter — one tenant's CSR titles, sponsors,
 * endpoints and counts leaked into another tenant's dashboard/export, and the
 * protocol-analysis "similar CSRs" ran a cross-tenant LIKE. These tests pin the
 * fix: every csr_reports read is scoped to the caller's org, and with NO org
 * context the endpoints refuse (403) rather than fall back to a cross-tenant
 * query. The per-query `WHERE organization_id = $org` scoping is applied in the
 * handler and enforced by the typecheck; here we lock the refuse-without-org
 * boundary and prove a with-org request proceeds to the (scoped) reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/** A drizzle-shaped chainable stub: every builder method returns the chain, and
 *  awaiting it resolves to `rows`. Records each `.where(...)` call so a test can
 *  assert the handler reached the scoped reads. */
const whereCalls: unknown[] = [];
function makeDb(rows: unknown[]) {
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(rows);
        if (prop === 'where') return (...args: unknown[]) => { whereCalls.push(args); return chain; };
        return () => chain;
      },
    },
  );
  return { select: () => chain, execute: () => Promise.resolve(rows) };
}

vi.mock('../../db', () => ({ db: makeDb([]) }));
// Keep the analyzer service imports inert — these tests never hit them.
vi.mock('../../protocol-analyzer-service', () => ({ protocolAnalyzerService: {} }));
vi.mock('../../protocol-optimizer-service', () => ({ protocolOptimizerService: {} }));
vi.mock('../../openai-service', () => ({ analyzeText: vi.fn() }));

import analyticsRouter from '../analytics-routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/analytics', analyticsRouter);
  return app;
}

beforeEach(() => {
  whereCalls.length = 0;
});

describe('analytics tenant isolation — csr_reports is org-scoped', () => {
  it('GET /dashboard refuses (403) without org context — never aggregates across tenants', async () => {
    const res = await request(appWith(null)).get('/api/analytics/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_REQUIRED');
    expect(whereCalls.length).toBe(0); // refused before any read
  });

  it('GET /dashboard with org context proceeds to the scoped reads', async () => {
    const res = await request(appWith(7)).get('/api/analytics/dashboard');
    expect(res.status).toBe(200);
    // Every csr_reports aggregation is scoped → at least one WHERE was applied.
    expect(whereCalls.length).toBeGreaterThan(0);
  });

  it('GET /export refuses (403) without org context', async () => {
    const res = await request(appWith(null)).get('/api/analytics/export?type=summary&format=json');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_REQUIRED');
    expect(whereCalls.length).toBe(0);
  });

  it('GET /export with org context proceeds to the scoped reads', async () => {
    const res = await request(appWith(7)).get('/api/analytics/export?type=summary&format=json');
    expect(res.status).not.toBe(403);
    expect(whereCalls.length).toBeGreaterThan(0);
  });
});
