/** Router/service adapter contract in isolation: a supplied pinned client is
 * authoritative even when no implicit pooled context exists. Native full
 * JWT/ALS/FORCE RLS proof lives in bla-ivd-request-connection.dbtest.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ query: vi.fn(), poolQuery: vi.fn() }));
vi.mock('../../db', () => ({ pool: { query: h.poolQuery }, db: {} }));
vi.mock('../../middleware/auth', () => ({ authenticateToken: (_req: unknown, _res: unknown, next: () => void) => next() }));
import blaRouter from '../biopharma/bla-workbench';
import ivdRouter from '../ivd-assessments';
import lifecycleRouter from '../ivd-lifecycle';

const PROGRAM = '11111111-2222-4333-8444-000000093590';
const ID = '11111111-2222-4333-8444-000000000007';
function app(withContext = true) {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { user: { id: 42, organizationId: 7, role: 'viewer' }, ...(withContext ? { dbClient: { query: h.query } } : {}) });
    next();
  });
  a.use('/bla', blaRouter); a.use('/ivd', ivdRouter); a.use('/lifecycle', lifecycleRouter); return a;
}
/* The one statement the shared pool answers: the ownership check a project-named
   IVD list asks first (admitProject over programInOrganization, D2 2026-10-29). */
const ownership = (sql: unknown) => /FROM regulatory_programs/.test(String(sql));
const readsOnPool = () => h.poolQuery.mock.calls.filter(([sql]) => !ownership(sql));
beforeEach(() => {
  vi.clearAllMocks();
  h.poolQuery.mockImplementation(async (sql: string, args: unknown[] = []) => {
    if (ownership(sql) && args[0] === PROGRAM && args[1] === 7) return { rows: [{ id: PROGRAM }] };
    throw new Error('Implicit pool is unavailable in this adapter test');
  });
  h.query.mockResolvedValue({ rows: [{ id: ID, organization_id: 7, org_id: 7, assessment_type: 'cdx_pairing',
    corpus_version: 'old-synthetic-version', inputs: {}, result: {}, program_id: PROGRAM }] });
});
describe('BLA and IVD reader adapters use their request client', () => {
  it.each([
    { path: `/bla/assessments?programId=${PROGRAM}&kind=comparability`, params: [7, PROGRAM, 'comparability'] },
    { path: `/bla/assessments/${ID}`, params: [ID, 7] },
    { path: `/ivd?program_id=${PROGRAM}&type=cdx_pairing`, params: [7, 'cdx_pairing', PROGRAM] },
    { path: `/ivd/${ID}`, params: [ID, 7] },
    { path: `/ivd/documents?program_id=${PROGRAM}&doc_type=fsn`, params: [7, 'fsn', PROGRAM] },
  ])('reads $path through the supplied pinned client', async ({ path, params }) => {
    const res = await request(app()).get(path);
    expect(res.status, JSON.stringify(res.body)).toBe(200); expect(h.query.mock.calls[0][1]).toEqual(params);
    expect(readsOnPool()).toEqual([]);
  });
  it('loads persisted drift inputs through the same request client', async () => {
    const res = await request(app()).post('/lifecycle/drift/detect').send({ currentVersion: 'new-synthetic-version' });
    expect(res.status, JSON.stringify(res.body)).toBe(200); expect(h.query).toHaveBeenCalled(); expect(readsOnPool()).toEqual([]);
  });
  it.each(['/bla/assessments', '/ivd', '/ivd/documents'])('refuses missing request context for %s without a pooled fallback', async path => {
    const res = await request(app(false)).get(path);
    expect(res.status).toBe(500); expect(h.poolQuery).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled();
  });
});
