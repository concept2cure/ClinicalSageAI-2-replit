/**
 * GET /api/mdx/postmarket — tenant isolation for CAPA records.
 *
 * capa_records has no organization_id column of its own; per its
 * migration (20260504_capa_mdr.sql) tenancy is derived entirely by
 * joining regulatory_programs.organization_id.
 *
 * The CAPA query used to read:
 *
 *   LEFT JOIN regulatory_programs p ON p.id::text = c.program_id::text
 *   WHERE p.organization_id = $1 OR p.organization_id IS NULL
 *
 * A LEFT JOIN yields NULL for `p.organization_id` whenever a CAPA's text
 * program_id fails to resolve to a program row — an orphaned record, a
 * program deleted after the CAPA was raised, or an id written in a
 * different id space. The `OR ... IS NULL` arm then admitted every one
 * of those rows into *every* organization's response.
 *
 * The join is now INNER with no NULL escape hatch: a CAPA that cannot be
 * attributed to a program inside the caller's organization is invisible
 * to that caller. Orphans surface nowhere rather than everywhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
/* Since P-122 the route reads through the request's executor after the caller's project access is resolved
   (mdx-postmarket.ts); the real access check and RLS are proven in
   tests/db/p122-quality-surveillance-reads.dbtest.ts. Here the access resolves to two projects. */
const ACCESSIBLE = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
vi.mock('../../db/requestDb', () => ({
  requestPgClient: () => ({ query: (...a: unknown[]) => query(...a) }),
  MissingRequestDbContextError: class extends Error {},
}));
vi.mock('../../middleware/orgMembership', () => ({ governedActorId: () => 5 }));
vi.mock('../../services/c2c/current-program-access', () => ({
  getCurrentAccessibleProgramScope: async (_q: unknown, input: { programId?: string | null }) => ({
    scope: 'verified-accessible-programs', programIds: input.programId ? [input.programId] : ACCESSIBLE, reconciliationRequired: false,
  }),
  requireProgramScopeStillCurrent: async () => undefined,
  ProgramReadAccessError: class extends Error {},
}));

import postmarketRouter from '../mdx-postmarket';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/mdx', postmarketRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/mdx/postmarket', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/mdx/postmarket');
    expect(res.status).toBe(403);
  });

  it('scopes CAPAs with an INNER JOIN and no NULL-org escape hatch', async () => {
    query.mockResolvedValue({ rows: [] });
    await request(appWith(42)).get('/api/mdx/postmarket');

    const capaSql = query.mock.calls
      .map((c) => String(c[0]))
      .find((sql) => sql.includes('capa_records'));

    expect(capaSql).toBeDefined();
    /* The precise defect: a LEFT JOIN whose NULL rows were then let
       through by an `IS NULL` disjunct. Both halves must stay gone. */
    expect(capaSql).not.toMatch(/LEFT\s+JOIN\s+regulatory_programs/i);
    expect(capaSql).not.toMatch(/organization_id\s+IS\s+NULL/i);
    expect(capaSql).toMatch(/JOIN\s+regulatory_programs/i);
    expect(capaSql).toMatch(/WHERE\s+p\.organization_id\s*=\s*\$1/i);
  });

  it('passes the caller org and the projects the caller can open, and nothing else, for CAPAs', async () => {
    query.mockResolvedValue({ rows: [] });
    await request(appWith(42)).get('/api/mdx/postmarket');

    const capaCall = query.mock.calls.find((c) => String(c[0]).includes('capa_records'));
    expect(capaCall?.[1]).toEqual([42, ACCESSIBLE]);
    expect(String(capaCall?.[0])).toMatch(/p\.id::text\s*=\s*ANY\(\$2::text\[\]\)/);
  });

  it('reads one project, and says so (P-122)', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(appWith(42)).get(`/api/mdx/postmarket?program_id=${ACCESSIBLE[0]}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ scope: 'program' });
    for (const call of query.mock.calls) expect(call[1]).toEqual([42, [ACCESSIBLE[0]]]);
  });

  it('refuses a malformed project id before reading anything', async () => {
    const res = await request(appWith(42)).get('/api/mdx/postmarket?program_id=not-a-project');
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns an empty feed rather than fabricated rows for a quiet tenant', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(appWith(42)).get('/api/mdx/postmarket');

    expect(res.status).toBe(200);
    expect(res.body.data.signals).toEqual([]);
    expect(res.body.data.capas).toEqual([]);
    /* Zero open signals must be reported as zero — the surface renders
       this as an explicit empty state, never as an all-clear derived
       from example content. */
    expect(res.body.data.metrics[0]).toMatchObject({ label: 'Open signals', metric: '0' });
    expect(res.body.meta).toMatchObject({ scope: 'organization' });
  });

  it('degrades to an empty feed when the vigilance tables are not migrated', async () => {
    const undefinedTable = Object.assign(new Error('relation does not exist'), {
      code: '42P01',
    });
    /* One rejection per query the route issues. A blanket
       mockRejectedValue leaves an extra rejected promise nobody
       consumes, which Vitest reports as an unhandled rejection. */
    query.mockRejectedValueOnce(undefinedTable); // vigilance_events
    query.mockRejectedValueOnce(undefinedTable); // capa_records

    const res = await request(appWith(42)).get('/api/mdx/postmarket');
    expect(res.status).toBe(200);
    expect(res.body.data.signals).toEqual([]);
  });
});
