/**
 * BP-W0-7 — a document must stay retrievable after it leaves draft.
 *
 * The report was "frozen documents are unreachable under all status filters".
 * They were, and so was everything else past draft: `GET /docs` compared
 * `d.status = $n` case-sensitively against a vocabulary this router writes in
 * two cases (`'draft'` on insert; `'IN_REVIEW'`, `'APPROVED'`, `'FROZEN'` on the
 * lifecycle transitions), while the editor's dropdown sent lower case for all of
 * them. So `status=in_review` and `status=approved` matched nothing, and FROZEN
 * had no dropdown option at all.
 *
 * These assertions run against actual PGlite request SQL and check the SQL and parameters
 * the handler BUILDS, because that is where the defect lived — a case-sensitive
 * predicate. A test that mocked the rows back would have passed against the
 * broken code, since a fabricated response never applies the filter it is being asked about.
 */
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JourneyDb } from '../../../tests/golden-journeys/harness';
import { DOC, READ_SECRET, createCurrentReadDb, currentReadApp, observedReadClient,
  readToken, type ReadObservation } from './_authoring-current-read-fixture';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool }));
process.env.JWT_SECRET = READ_SECRET;
process.env.JWT_SECRET_DEV = READ_SECRET;
let jdb: JourneyDb;
let app: express.Express;
let bearer: string;
const observation: ReadObservation = { sql: [] };
const get = (path: string) => request(app).get(`/api/authoring/docs${path}`).set('Authorization', `Bearer ${bearer}`);
function listSql() {
  const sql = observation.sql.find(sql => sql.includes('FROM authoring_documents d') && sql.includes('d.title'));
  if (!sql) throw new Error('admitted list projection was never issued');
  return sql;
}
beforeAll(async () => {
  jdb = await createCurrentReadDb(); h.db = jdb.db; h.pool = observedReadClient(jdb, observation);
  const { default: router } = await import('../authoring.router');
  app = currentReadApp(router, jdb, observation); bearer = await readToken();
}, 180_000);
afterAll(async () => { await jdb?.close(); });
beforeEach(async () => { observation.sql = []; });

describe('BP-W0-7 — GET /docs status filter', () => {
  it('compares status case-insensitively, so lower-case filters reach upper-case rows', async () => {
    const res = await get('?status=frozen'); expect(res.status).toBe(200);
    expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([DOC.empty]);
    expect(listSql()).toContain('upper(d.status) = upper(');
    expect(listSql()).not.toMatch(/AND d\.status = \$/);
  });
  it('the same holds for in_review and approved, which also matched nothing', async () => {
    for (const status of ['in_review', 'approved']) {
      await jdb.pool.query('UPDATE authoring_documents SET status=$2 WHERE id=$1', [DOC.full, status.toUpperCase()]);
      try {
        observation.sql = []; const res = await get(`?status=${status}`);
        expect(res.status).toBe(200); expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([DOC.full]);
        expect(listSql()).toContain('upper(d.status) = upper(');
      } finally { await jdb.pool.query("UPDATE authoring_documents SET status='draft' WHERE id=$1", [DOC.full]); }
    }
  });
  it('status=all disables the bound status filter, so no state can orphan a document', async () => {
    const res = await get('?status=all'); expect(res.status).toBe(200);
    expect(listSql()).toContain('$7::text IS NULL OR upper(d.status) = upper($7::text)');
    expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining([DOC.full, DOC.empty]));
  });
  it('an absent status lists every accessible state instead of silently defaulting to draft', async () => {
    const res = await get(''); expect(res.status).toBe(200);
    expect(listSql()).toContain('$7::text IS NULL OR upper(d.status) = upper($7::text)');
    expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining([DOC.full, DOC.empty]));
  });
  it('other filters are unaffected', async () => {
    const res = await get('?status=frozen&module=M3'); expect(res.status).toBe(200);
    expect(listSql()).toContain('d.module = $');
    expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([DOC.empty]);
  });
  it('binds module and product filter text without turning it into executable SQL', async () => {
    for (const field of ['module', 'product_code']) {
      const res = await get(`?${field}=${encodeURIComponent("M3' OR TRUE --")}`);
      expect(res.status).toBe(200); expect(res.body.documents).toEqual([]);
      expect(listSql()).not.toContain("M3' OR TRUE --");
    }
  });
});
