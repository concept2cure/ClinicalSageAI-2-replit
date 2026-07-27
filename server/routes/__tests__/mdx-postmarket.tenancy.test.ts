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
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

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

  it('passes the caller org as the only tenancy parameter for CAPAs', async () => {
    query.mockResolvedValue({ rows: [] });
    await request(appWith(42)).get('/api/mdx/postmarket');

    const capaCall = query.mock.calls.find((c) => String(c[0]).includes('capa_records'));
    expect(capaCall?.[1]).toEqual([42]);
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
