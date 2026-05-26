/**
 * Tenant-isolation contract test — Cortex advisory.
 *
 * GET /api/cortex/advisory/:projectId fetched the project by id with no org
 * filter — an authed user could get advisory analysis for another tenant's
 * project. It now requires the authed org and scopes the project lookup by
 * organization_id (404 otherwise).
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

vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // Foreign/own project lookup returns no rows so the handler short-circuits
      // with 404 — keeps the test off the downstream analysis code path.
      return { rows: [] };
    }),
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  calls.length = 0;
  authState.orgId = ORG_A;

  const mod = await import('../../routes/cortexAdvisoryRoutes');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  app.use('/api/cortex', (mod as any).default);
});

const projectReads = () => calls.filter(c => /FROM projects/i.test(c.sql));

describe('Tenant isolation — Cortex advisory', () => {
  it('scopes the project lookup to the authed org', async () => {
    await request(app).get('/api/cortex/advisory/123');
    const reads = projectReads();
    expect(reads.length).toBeGreaterThan(0);
    expect(reads[0].sql).toMatch(/organization_id = \$2/);
    expect(reads[0].params).toEqual(['123', ORG_A]);
  });

  it('403s without org context and never reads a project', async () => {
    authState.orgId = null;
    await request(app).get('/api/cortex/advisory/123').expect(403);
    expect(projectReads()).toHaveLength(0);
  });
});
