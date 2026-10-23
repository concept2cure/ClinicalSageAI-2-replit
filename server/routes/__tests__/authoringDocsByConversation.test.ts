/**
 * GET /api/authoring/docs?conversationId= — the documents a conversation built.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md §4.3, slice 11. A conversation finds the
 * documents AnA built in it from each document's own provenance
 * ({ source: 'ana', conversationId }), not from a capped copy of a tool result
 * in the saved trace: on 2026-10-08 a real browser showed a reopened
 * conversation with no document at all because that copy had cut the id off.
 * Checks the SQL the handler builds, the place a filter lives or does not.
 */
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JourneyDb } from '../../../tests/golden-journeys/harness';
import { DOC, PROGRAM, READ_SECRET, createCurrentReadDb, currentReadApp, observedReadClient,
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

const CONVERSATION = 'ana-ri_1791422302138_3qisj9qga';
beforeEach(async () => {
  await jdb.pool.query('UPDATE authoring_documents SET provenance=$2 WHERE id=$1',
    [DOC.partial, { source: 'ana', conversationId: CONVERSATION }]);
});
describe('the documents a conversation built', () => {
  it('filters on the recorded conversation as a bound value evaluated by actual SQL', async () => {
    const res = await get(`?conversationId=${CONVERSATION}`); expect(res.status).toBe(200);
    expect(listSql()).toMatch(/to_jsonb\(d\)->'provenance'->>'conversationId' = \$/);
    expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([DOC.partial]);
    const other = await get('?conversationId=another-conversation'); expect(other.status).toBe(200); expect(other.body.documents).toEqual([]);
  });
  it('narrows to what AnA drafted in the admitted program with no source value to inject', async () => {
    const res = await get(`?source=ana&programId=${PROGRAM}`); expect(res.status).toBe(200);
    expect(listSql()).toContain("to_jsonb(d)->'provenance'->>'source' = 'ana'");
    expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([DOC.partial]);
  });
  it('returns the recorded conversation and source so the list can say where it came from', async () => {
    const res = await get(''); expect(res.status).toBe(200);
    expect(listSql()).toContain('AS conversation_id'); expect(listSql()).toContain('AS provenance_source');
    expect(res.body.documents.find((d: { id: string }) => d.id === DOC.partial)).toMatchObject({ conversation_id: CONVERSATION, provenance_source: 'ana' });
  });
  it('disables the bound provenance filters when none is asked for', async () => {
    const res = await get(''); expect(res.status).toBe(200);
    expect(listSql()).toContain('$9::text IS NULL OR'); expect(listSql()).toContain('NOT $10::boolean OR');
    expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining([DOC.full, DOC.empty]));
  });
});
