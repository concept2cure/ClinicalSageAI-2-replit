/**
 * Tenant-isolation contract test — folder management.
 *
 * GET /api/folders read its org from req.query (defaulting to org 1), and the
 * PATCH/DELETE /folders/:id handlers mutated document_folders by id with no
 * org check — cross-tenant folder list / rename / delete. All now derive the
 * org from the JWT (403 otherwise) and scope every query by organization_id.
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

vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/COUNT/i.test(sql)) return { rows: [{ count: '0' }] };
      if (/DELETE/i.test(sql)) return { rows: [{ id: 'f1' }] };
      if (/SELECT id FROM document_folders/i.test(sql)) return { rows: [{ id: 'f1' }] };
      return { rows: [] };
    }),
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  calls.length = 0;
  authState.orgId = ORG_A;

  const mod = await import('../../routes/folder-management.js');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  app.use('/api', (mod as any).default);
});

const folderQueries = () => calls.filter(c => /document_folders/i.test(c.sql));

describe('Tenant isolation — folders', () => {
  it('GET /folders lists only the authed org (no query-param org)', async () => {
    const res = await request(app).get('/api/folders?organizationId=999');
    expect(res.status).toBe(200);
    const q = folderQueries();
    expect(q.length).toBeGreaterThan(0);
    for (const c of q) {
      expect(c.sql).toMatch(/organization_id = \$1/);
      expect(c.params[0]).toBe(ORG_A);
    }
    expect(calls.flatMap(c => c.params)).not.toContain('999');
  });

  it('DELETE /folders/:id scopes ownership + delete by org', async () => {
    const res = await request(app).delete('/api/folders/f1');
    expect(res.status).toBe(200);
    const del = calls.find(c => /DELETE FROM document_folders/i.test(c.sql));
    expect(del).toBeTruthy();
    expect(del!.sql).toMatch(/organization_id = \$2/);
    expect(del!.params).toContain(ORG_A);
  });

  it('403s without org context on read and mutate', async () => {
    authState.orgId = null;
    await request(app).get('/api/folders').expect(403);
    await request(app).patch('/api/folders/f1').send({ name: 'x' }).expect(403);
    await request(app).delete('/api/folders/f1').expect(403);
    expect(folderQueries()).toHaveLength(0);
  });
});
