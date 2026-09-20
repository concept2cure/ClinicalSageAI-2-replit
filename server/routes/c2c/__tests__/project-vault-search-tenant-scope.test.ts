/**
 * The vault full-text search must carry its tenant boundary IN the statement.
 *
 * `GET /api/c2c/project-vault/:id/search` reads vault.documents with
 * `d.program_id = $1`. vault.documents has no organization_id to filter on —
 * its own RLS is program-scoped through core.can_access_program(program_id) —
 * so for a while the only thing standing between one tenant and another's
 * documents was the regulatory_programs ownership SELECT twenty lines earlier.
 * That check is real and the endpoint was not exploitable, but `ci:tenant-isolation`
 * flagged both queries and was right to: a query whose safety lives in a
 * different statement loses it the first time someone moves or copies it.
 *
 * Proven against a real Postgres 16 before this test was written — with the
 * EXISTS removed, org 1 passing org 2's program id counts org 2's document
 * (leaked=1); with it, 0. These cases pin the predicate so it cannot quietly
 * come back out.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const queries: Array<{ sql: string; params: unknown[] }> = [];

vi.mock('../../../db.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      // The ownership pre-check must find the program, or the route 404s before
      // it ever reaches the reads this test is about.
      if (/FROM regulatory_programs\s*\n?\s*WHERE id = \$1/.test(sql)) {
        return { rows: [{ id: 'p' }], rowCount: 1 };
      }
      if (/count\(\*\)::int AS total/.test(sql)) return { rows: [{ total: 0 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  },
}));

import express from 'express';
import request from 'supertest';
import createProjectVaultRoutes from '../project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const ORG = 7;

function app() {
  const a = express();
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { organizationId: ORG };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const search = (q = 'stability') =>
  request(app()).get(`/api/c2c/project-vault/${PROGRAM}/search`).query({ q });

/** The two reads this file is about: count and rows over vault.documents. */
const vaultReads = () => queries.filter(c => /FROM vault\.documents d/.test(c.sql));

beforeEach(() => {
  queries.length = 0;
});

describe('vault search carries the org predicate in-statement', () => {
  it('runs both reads — the count and the rows', async () => {
    await search();
    expect(vaultReads()).toHaveLength(2);
  });

  it('every vault read names the caller organization in its own SQL', async () => {
    await search();
    for (const { sql } of vaultReads()) {
      expect(sql).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM regulatory_programs rp/);
      expect(sql).toMatch(/rp\.organization_id = \$2/);
    }
  });

  it('binds the caller organization, not a value from the request', async () => {
    await search();
    for (const { params } of vaultReads()) {
      expect(params[0]).toBe(PROGRAM);
      expect(params[1]).toBe(ORG);
    }
  });

  it('counts over exactly the set it returns rows from', async () => {
    await search();
    const [counted, rows] = vaultReads();
    // Both are built from the same `searchWhere`, so the predicate text after
    // WHERE must be identical — a total taken over a different set is a wrong
    // number, not a display detail.
    const whereOf = (s: string) => s.slice(s.indexOf('WHERE')).replace(/ORDER BY[\s\S]*$/, '').trim();
    expect(whereOf(counted.sql)).toBe(whereOf(rows.sql));
  });

  it('does not reach the store at all for an empty query', async () => {
    const res = await search('');
    expect(res.body.data.reason).toBe('EMPTY_QUERY');
    expect(vaultReads()).toHaveLength(0);
  });
});
