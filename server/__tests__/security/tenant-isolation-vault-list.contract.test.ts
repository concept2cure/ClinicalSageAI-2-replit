/**
 * Tenant-isolation contract test — misc-inline vault endpoints.
 *
 * Regression guard for a cross-tenant document leak: GET /api/vault/list and
 * GET /api/vault/statistics queried `documents` with no organization filter,
 * returning every tenant's documents/counts. Both now require the authed org
 * (getSecureOrgId) and filter `WHERE organization_id = $1`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { ORG_A, calls, authState } = vi.hoisted(() => ({
  ORG_A: 7,
  calls: [] as Array<{ sql: string; params: any[] }>,
  authState: { orgId: 7 as number | null },
}));

const mockPool = {
  query: vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (/COUNT/i.test(sql)) return { rows: [{ total: 0, total_documents: 0 }] };
    return { rows: [] };
  }),
} as any;

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  calls.length = 0;
  authState.orgId = ORG_A;

  const { createMiscInlineRoutes } = await import('../../routes/misc-inline-routes');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  const passthroughAuth = (_req: Request, _res: Response, next: NextFunction) => next();
  app.use('/api', createMiscInlineRoutes(mockPool, passthroughAuth));
});

const docQueries = () => calls.filter(c => /FROM documents/i.test(c.sql));

describe('Tenant isolation — vault/list', () => {
  it('scopes every documents query to the authed org', async () => {
    const res = await request(app).get('/api/vault/list');
    expect(res.status).toBe(200);
    const docs = docQueries();
    expect(docs.length).toBeGreaterThan(0);
    for (const c of docs) {
      expect(c.sql).toMatch(/organization_id = \$1/);
      expect(c.params[0]).toBe(String(ORG_A));
    }
  });

  it('vault/statistics is org-scoped too', async () => {
    const res = await request(app).get('/api/vault/statistics');
    expect(res.status).toBe(200);
    for (const c of docQueries()) {
      expect(c.sql).toMatch(/organization_id = \$1/);
      expect(c.params[0]).toBe(String(ORG_A));
    }
  });

  it('401s without org context and never touches documents', async () => {
    authState.orgId = null;
    await request(app).get('/api/vault/list').expect(401);
    await request(app).get('/api/vault/statistics').expect(401);
    expect(docQueries()).toHaveLength(0);
  });
});
