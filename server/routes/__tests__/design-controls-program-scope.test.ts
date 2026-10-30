/**
 * /api/design-controls reads and writes the open project's design inputs, and
 * refuses a project the caller's organization does not own (D2, fold F1 slice A,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
 *
 * GET read the organization's whole design-input store, and the POST took no
 * project and had no editor gate, so a viewer could add a design input to the
 * design history file. 20261029c adds c2c_design_controls.program_id. With a
 * `program_id` the read now asks the one ownership answer first, through
 * admitProject (server/lib/admit-project.ts over programInOrganization), as the
 * human-factors read does: 404 when the organization does not own the live
 * project, 503 when the check cannot run, and nothing read either way. It then
 * reads only that project's inputs and says so, `meta.scope: 'program'`. An
 * input with no project is the organization's unscoped input, and no project
 * read returns it. Without a `program_id` the read is the organization's, as
 * before, and says so. The POST takes an editing role, admits the project in
 * its body the same way, and records it.
 *
 * Nothing here mocks the ownership answer. The real programInOrganization runs
 * against a database double that answers each statement from a small table, by
 * the statement's own filters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Input = { id: string; organization_id: number; program_id: string | null; req: string };

const h = vi.hoisted(() => {
  const state = {
    role: 'member' as string | undefined,
    owner: new Map<string, number>(), deleted: new Set<string>(), ownershipDown: false,
    inputs: [] as Input[],
  };
  const sent: Array<{ sql: string; args: unknown[] }> = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    sent.push({ sql, args });
    if (/FROM regulatory_programs/.test(sql)) {
      if (state.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      const [id, org] = args as [string, number];
      const live = !(state.deleted.has(id) && /deleted_at IS NULL/.test(sql));
      return { rows: state.owner.get(id) === org && live ? [{ id }] : [] };
    }
    if (/^\s*SELECT[\s\S]*FROM c2c_design_controls/.test(sql)) {
      const org = args[0] as number;
      const byProgram = /program_id = \$2/.test(sql) ? (args[1] as string) : undefined;
      const rows = state.inputs
        .filter((i) => i.organization_id === org && (byProgram === undefined || i.program_id === byProgram))
        .map((i) => ({ id: i.id, cat: 'functional', req: i.req, risk_ref: null, outputs: [], ver: null, ver_ref: null, val: null, val_ref: null }));
      return { rows };
    }
    if (/^\s*INSERT INTO c2c_design_controls/.test(sql)) {
      return { rows: [{ id: args[0], cat: args[2], req: args[3], risk_ref: args[4], outputs: [], ver: null, ver_ref: null, val: null, val_ref: null }] };
    }
    return { rows: [] };
  });
  return { state, sent, query };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args) }),
  db: {},
}));

import designControlsRouter from '../design-controls.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG, role: h.state.role };
    next();
  });
  a.use('/api/design-controls', designControlsRouter);
  return a;
}

const reads = () => h.sent.filter((s) => /FROM c2c_design_controls/.test(s.sql));
const inserts = () => h.sent.filter((s) => /^\s*INSERT INTO c2c_design_controls/.test(s.sql));

beforeEach(() => {
  h.sent.length = 0;
  h.state.role = 'member';
  h.state.ownershipDown = false;
  h.state.owner = new Map([[OWN, ORG], [FOREIGN, OTHER_ORG], [DELETED, ORG]]);
  h.state.deleted = new Set([DELETED]);
  h.state.inputs = [
    { id: 'DI-01', organization_id: ORG, program_id: OWN, req: 'The project\'s own input' },
    { id: 'DI-02', organization_id: ORG, program_id: null, req: 'An unscoped legacy input' },
    { id: 'DI-03', organization_id: ORG, program_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', req: 'Another project\'s input' },
    { id: 'DI-09', organization_id: OTHER_ORG, program_id: FOREIGN, req: 'Another organization\'s input' },
  ];
});

describe('GET /api/design-controls?program_id=', () => {
  it('reads only that project\'s inputs, after the ownership check, and says so', async () => {
    const res = await request(app()).get(`/api/design-controls?program_id=${OWN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(['DI-01']);
    expect(res.body.meta).toMatchObject({ count: 1, scope: 'program', programId: OWN });
    const order = h.sent.map((s) => (/FROM regulatory_programs/.test(s.sql) ? 'ownership' : /c2c_design_controls/.test(s.sql) ? 'read' : 'other'));
    expect(order).toEqual(['ownership', 'read']);
    expect(reads()[0].args).toEqual([ORG, OWN]);
    expect(reads()[0].sql).toMatch(/organization_id = \$1/);
  });

  it.each([
    ['another organization\'s project', FOREIGN],
    ['a missing project', MISSING],
    ['a deleted project', DELETED],
    ['a malformed id', 'not-a-uuid'],
  ])('refuses %s with 404 and reads nothing', async (_what, programId) => {
    const res = await request(app()).get(`/api/design-controls?program_id=${programId}`);
    expect(reads()).toEqual([]);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).toMatch(/Project not found/);
  });

  it('answers 503 when the ownership check cannot run, and reads nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).get(`/api/design-controls?program_id=${OWN}`);
    expect(reads()).toEqual([]);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('connection terminated');
  });

  it('a project read never returns the organization\'s unscoped inputs', async () => {
    const res = await request(app()).get(`/api/design-controls?program_id=${OWN}`);
    expect(res.body.data.some((r: { id: string }) => r.id === 'DI-02')).toBe(false);
  });

  it('without a project, reads the organization\'s inputs as before, and says the scope is the organization', async () => {
    const res = await request(app()).get('/api/design-controls');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(['DI-01', 'DI-02', 'DI-03']);
    expect(res.body.meta).toMatchObject({ count: 3, scope: 'organization' });
    expect(res.body.meta.programId).toBeUndefined();
    expect(h.sent.some((s) => /FROM regulatory_programs/.test(s.sql))).toBe(false);
    expect(reads()[0].args).toEqual([ORG]);
  });

  it('a viewer may still read', async () => {
    h.state.role = 'viewer';
    const res = await request(app()).get(`/api/design-controls?program_id=${OWN}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/design-controls', () => {
  const body = { req: 'Battery lasts a full 14-day wear period', cat: 'performance' };

  it('refuses a viewer with the editor gate\'s 403, and sends nothing', async () => {
    h.state.role = 'viewer';
    const res = await request(app()).post('/api/design-controls').send({ ...body, programId: OWN });
    expect(h.sent).toEqual([]);
    expect({ status: res.status, body: res.body as unknown }).toEqual({ status: 403, body: { error: 'Insufficient permissions' } });
  });

  it('records the project, after the ownership check', async () => {
    const res = await request(app()).post('/api/design-controls').send({ ...body, programId: OWN });
    expect(res.status).toBe(201);
    const order = h.sent.map((s) => (/FROM regulatory_programs/.test(s.sql) ? 'ownership' : /INSERT INTO c2c_design_controls/.test(s.sql) ? 'insert' : 'other'));
    expect(order).toEqual(['ownership', 'insert']);
    const [insert] = inserts();
    expect(insert.sql).toMatch(/program_id/);
    expect(insert.args[1]).toBe(ORG);
    // (id, organization_id, cat, req, risk_ref, outputs, program_id)
    expect(insert.args[6]).toBe(OWN);
    expect(res.body.meta).toMatchObject({ created: true, scope: 'program', programId: OWN });
  });

  it.each([
    ['another organization\'s project', FOREIGN],
    ['a missing project', MISSING],
    ['a deleted project', DELETED],
    ['a malformed id', 'not-a-uuid'],
    ['a non-string id', 42],
  ])('refuses %s with 404 and inserts nothing', async (_what, programId) => {
    const res = await request(app()).post('/api/design-controls').send({ ...body, programId });
    expect(inserts()).toEqual([]);
    expect(res.status).toBe(404);
  });

  it('answers 503 when the ownership check cannot run, and inserts nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).post('/api/design-controls').send({ ...body, programId: OWN });
    expect(inserts()).toEqual([]);
    expect(res.status).toBe(503);
  });

  it('without a project, records an organization input with no project, as before', async () => {
    const res = await request(app()).post('/api/design-controls').send(body);
    expect(res.status).toBe(201);
    expect(h.sent.some((s) => /FROM regulatory_programs/.test(s.sql))).toBe(false);
    const [insert] = inserts();
    expect(insert.args).toHaveLength(7);
    expect(insert.args[6]).toBeNull();
    expect(res.body.meta).toMatchObject({ created: true, scope: 'organization' });
  });
});
