/**
 * GET /api/c2c/documents/:id/sections/:key/versions — a section's own Part-11
 * history, read from c2c_document_section_versions.
 *
 * The dossier drawer's Activity tab now renders this instead of events the
 * browser wrote about itself. What must hold: the caller's tenant owns the
 * document (404 otherwise, never another tenant's history), the version read is
 * scoped to that tenant in its own SQL, and the author and reason come back as
 * the trigger recorded them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a), connect: vi.fn() } }));
/* Project access (F1, 2026-11-05): the document is read only if its program is one the caller can open. Those reads
   are answered from seats (support/current-member.ts); the rule itself is proven on PostgreSQL in
   documents-project-scope.pglite.test.ts. */
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});

import documentsRouter from '../documents';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const PROGRAM = '11111111-1111-4111-8111-111111111111';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 1 };
    next();
  });
  app.use('/api/c2c/documents', documentsRouter);
  return app;
}

beforeEach(() => {
  query.mockReset();
  clearSeats();
  seatMember(7, 1, 'member');
  seatProgram(7, PROGRAM);
});

describe('GET /api/c2c/documents/:id/sections/:key/versions', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/c2c/documents/d1/sections/11/versions');
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('404 when the document is not the caller tenant’s — no history read at all', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get('/api/c2c/documents/d1/sections/11/versions');
    expect(res.status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['d1', 7, [PROGRAM]]);
  });

  it('scopes the version read to the tenant in its own SQL and returns author + reason', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', project_id: PROGRAM, status: 'draft' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 5, version: 2, author_id: 12, author_kind: 'human', reason: 'Bench data', occurred_at: new Date('2026-09-01T00:00:00Z'), author_name: 'Dana' }],
      });
    const res = await request(appWith(7)).get('/api/c2c/documents/d1/sections/11/versions');
    expect(res.status).toBe(200);
    const [sql, args] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/d\.org_id = \$3/);
    expect(args).toEqual(['d1', '11', 7]);
    expect(res.body.data).toEqual([
      { id: '5', version: 2, authorId: 12, authorName: 'Dana', authorKind: 'human', reason: 'Bench data', occurredAt: '2026-09-01T00:00:00.000Z' },
    ]);
  });
});
