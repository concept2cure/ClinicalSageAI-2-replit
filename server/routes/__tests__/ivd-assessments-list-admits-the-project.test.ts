/**
 * The IVD assessment workbench's two lists admit the project they name
 * (D2, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f2-ivd-completeness/).
 *
 * GET /api/ivd-assessments?program_id= and GET /api/ivd-assessments/documents
 * ?program_id= filtered by whatever project id the caller sent and never asked
 * whether the organization owns it: another organization's id read an empty
 * list, a "this project has nothing saved" answer about a project the caller
 * cannot see. Both now ask admitProject first (server/lib/admit-project.ts, over
 * programInOrganization): 404 for a foreign, missing, deleted or malformed
 * project, 503 when the check cannot run, and nothing listed either way. With
 * no project named they list the organization's records as before.
 *
 * The real programInOrganization runs against a pool double that answers the
 * ownership statement by its own filters; the lists run on the request client.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG = 7;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MISSING = '99999999-9999-4999-8999-999999999999';

const h = vi.hoisted(() => {
  const owner = new Map<string, { org: number; deleted: boolean }>();
  const state = { down: false };
  const poolQuery = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (!/FROM regulatory_programs/.test(sql)) throw new Error('The lists must not read through the shared pool');
    if (state.down) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
    const [id, org] = args as [string, number];
    const p = owner.get(id);
    return { rows: p && p.org === org && !(p.deleted && /deleted_at IS NULL/.test(sql)) ? [{ id }] : [] };
  });
  const listQuery = vi.fn(async (_sql: string, args: unknown[] = []) => ({
    rows: [{ id: 'saved-1', organization_id: args[0], program_id: args[args.length - 1] }],
  }));
  return { owner, state, poolQuery, listQuery };
});

vi.mock('../../db', () => ({ pool: { query: (sql: string, args?: unknown[]) => h.poolQuery(sql, args) }, db: {} }));
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import router from '../ivd-assessments';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: { id: 42, organizationId: ORG, role: 'member' }, dbClient: { query: h.listQuery } });
    next();
  });
  a.use('/api/ivd-assessments', router);
  return a;
}

beforeEach(() => {
  h.poolQuery.mockClear();
  h.listQuery.mockClear();
  h.state.down = false;
  h.owner.clear();
  h.owner.set(OWN, { org: ORG, deleted: false });
  h.owner.set(FOREIGN, { org: 8, deleted: false });
  h.owner.set(DELETED, { org: ORG, deleted: true });
});

const LISTS = [
  ['the assessments list', '/api/ivd-assessments'],
  ['the generated documents list', '/api/ivd-assessments/documents'],
] as const;

describe.each(LISTS)('%s', (_label, path) => {
  it.each([
    ['another organization\'s', FOREIGN],
    ['a missing', MISSING],
    ['a deleted', DELETED],
    ['a malformed', 'not-a-uuid'],
  ])('%s project: 404, and nothing is listed', async (_kind, id) => {
    const res = await request(app()).get(`${path}?program_id=${id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(JSON.stringify(res.body)).toContain('Project not found');
    expect(h.listQuery).not.toHaveBeenCalled();
  });

  it('when the ownership check cannot run: 503, and nothing is listed', async () => {
    h.state.down = true;
    const res = await request(app()).get(`${path}?program_id=${OWN}`);
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(h.listQuery).not.toHaveBeenCalled();
  });

  it('the organization\'s own project: asked once, then listed by that project on the request client', async () => {
    const res = await request(app()).get(`${path}?program_id=${OWN}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.poolQuery).toHaveBeenCalledTimes(1);
    expect(h.poolQuery.mock.calls[0][1]).toEqual([OWN, ORG]);
    expect(h.listQuery).toHaveBeenCalledTimes(1);
    expect(h.listQuery.mock.calls[0][1]).toEqual([ORG, OWN]);
    expect(res.body.rows).toEqual([{ id: 'saved-1', organization_id: ORG, program_id: OWN }]);
  });

  it('no project named: the organization\'s list, with no ownership check', async () => {
    const res = await request(app()).get(path);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.poolQuery).not.toHaveBeenCalled();
    expect(h.listQuery.mock.calls[0][1]).toEqual([ORG]);
  });
});
