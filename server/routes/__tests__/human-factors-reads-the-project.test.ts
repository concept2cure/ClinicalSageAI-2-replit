/**
 * The human-factors routes read and write the open project's HFE/UE file, and
 * refuse a project the caller's organization does not own (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-features-human-factors/).
 *
 * GET /api/human-factors returned the organization's first file
 * (`listHfFiles(orgId)`, then `files[0]`), and `hf_engineering_files` had no
 * project column, so a project's screen could not tell its own file from
 * another project's. 20261029 adds `program_id`. With a `program_id` each route
 * now asks the one ownership answer first, through `admitProject`
 * (server/lib/admit-project.ts over `programInOrganization`), as the Pre-Sub,
 * UDI and labeling reads do: 404 when the organization does not own the live
 * project, 503 when the check cannot run, and nothing read or written either
 * way. It then reads only that project's file and says so, `meta.scope:
 * 'program'`. A file with no project is the organization's unscoped file: no
 * project read returns it, and no project write lands in it. Without a
 * `program_id` the routes behave as before and say the scope is the
 * organization.
 *
 * Nothing here mocks the ownership answer or the file service. The real
 * `programInOrganization` and `hf-files-service` run against a database double
 * that answers each statement from a small table, by the statement's own
 * filters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** The caller organization's second project, which has no HFE/UE file. */
const OWN_EMPTY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** The caller organization's own project, soft-deleted. */
const DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type FileRow = {
  id: string; organization_id: number; program_id: string | null; device: string;
  framework: string; present: Record<string, boolean>; created_at: number;
};
type Write = { table: string; fileId?: unknown; programId?: unknown };

const h = vi.hoisted(() => {
  const state = {
    owner: new Map<string, number>(), deleted: new Set<string>(), ownershipDown: false,
    files: [] as FileRow[],
  };
  const writes: Write[] = [];
  let ownershipLookups = 0;
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }> => {
    if (/FROM regulatory_programs/.test(sql)) {
      ownershipLookups += 1;
      if (state.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      const [id, org] = args as [string, number];
      const live = !(state.deleted.has(id) && /deleted_at IS NULL/.test(sql));
      return { rows: state.owner.get(id) === org && live ? [{ id }] : [] };
    }
    if (/^\s*SELECT[\s\S]*FROM hf_engineering_files/.test(sql)) {
      const org = args[0] as number;
      // The project filter is a bind parameter: `($2::uuid IS NULL OR program_id = $2::uuid)`.
      const byProgram = /program_id = \$2/.test(sql) ? (args[1] as string | null) : null;
      const rows = state.files
        .filter((f) => f.organization_id === org && (byProgram === null || f.program_id === byProgram))
        .sort((a, b) => (/ORDER BY created_at LIMIT 1/.test(sql) ? a.created_at - b.created_at : b.created_at - a.created_at));
      return { rows: /LIMIT 1/.test(sql) ? rows.slice(0, 1) : rows };
    }
    if (/^\s*INSERT INTO hf_engineering_files/.test(sql)) {
      // (organization_id, device, framework, present, created_by, program_id)
      writes.push({ table: 'hf_engineering_files', programId: args[5] });
      const row = { id: 'hf-new', organization_id: args[0], device: args[1], framework: args[2], present: {}, program_id: args[5] };
      return { rows: [row] };
    }
    if (/^\s*UPDATE hf_engineering_files SET present/.test(sql)) {
      writes.push({ table: 'hf_engineering_files', fileId: args[1] });
      const file = state.files.find((f) => f.id === args[1] && f.organization_id === args[2]);
      return { rows: file ? [{ ...file, present: JSON.parse(String(args[0])) }] : [] };
    }
    if (/FROM c2c_hf_scenarios/.test(sql)) {
      return { rows: [{ id: `${String(args[1])}-s1`, task: `${String(args[1])} task`, useError: '', potentialHarmSeverity: 'minor', mitigated: false }] };
    }
    if (/^\s*INSERT INTO c2c_hf_scenarios/.test(sql)) {
      // (id, organization_id, file_id, task, use_error, potential_harm_severity, mitigated)
      writes.push({ table: 'c2c_hf_scenarios', fileId: args[2] });
      return { rows: [{ id: args[0], task: args[3], useError: args[4], potentialHarmSeverity: args[5], mitigated: args[6] }] };
    }
    return { rows: [] };
  });
  return { state, writes, query, lookups: () => ownershipLookups, resetLookups: () => { ownershipLookups = 0; } };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args) }),
  db: {},
}));
vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async () => ({ persisted: true })),
}));

import hfRouter from '../human-factors';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG };
    next();
  });
  a.use('/api/human-factors', hfRouter);
  return a;
}

const file = (id: string, org: number, program: string | null, device: string, created: number): FileRow => ({
  id, organization_id: org, program_id: program, device, framework: 'IEC 62366-1', present: {}, created_at: created,
});
const readFiles = () => h.query.mock.calls.filter(([sql]) => /FROM hf_engineering_files/.test(String(sql)));

beforeEach(() => {
  h.query.mockClear();
  h.writes.length = 0;
  h.resetLookups();
  h.state.ownershipDown = false;
  h.state.owner.clear();
  h.state.deleted.clear();
  for (const [id, org] of [[OWN, ORG], [OWN_EMPTY, ORG], [FOREIGN, OTHER_ORG], [DELETED, ORG]] as const) h.state.owner.set(id, org);
  h.state.deleted.add(DELETED);
  h.state.files = [
    // The organization's oldest file, and its newest: both recorded with no project.
    file('hf-old-unscoped', ORG, null, 'Old unscoped pump', 1),
    file('hf-own', ORG, OWN, 'Own pump', 2),
    file('hf-unscoped', ORG, null, 'Unscoped pump', 3),
    file('hf-foreign', OTHER_ORG, FOREIGN, 'Foreign pump', 4),
  ];
});

const REFUSED = [
  ['another organization\'s project', FOREIGN, 404],
  ['a project that does not exist', MISSING, 404],
  ['the organization\'s own deleted project', DELETED, 404],
  ['a value that is not a project id', 'not-a-project', 404],
] as const;

describe('GET /api/human-factors?program_id=: the open project\'s file, and only it', () => {
  it.each(REFUSED)('refuses %s (%s) with %i, and reads no file', async (_what, id, status) => {
    const res = await request(app()).get(`/api/human-factors?program_id=${id}`);
    expect(res.status).toBe(status);
    expect(readFiles()).toEqual([]);
  });

  it('answers 503 when ownership cannot be checked, and reads no file', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).get(`/api/human-factors?program_id=${OWN}`);
    expect(res.status).toBe(503);
    expect(readFiles()).toEqual([]);
  });

  it('reads the caller\'s own project\'s file, by organization and project, and says the scope is that project', async () => {
    const res = await request(app()).get(`/api/human-factors?program_id=${OWN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.device).toBe('Own pump');
    expect(res.body.data.scenarios.map((s: { task: string }) => s.task)).toEqual(['hf-own task']);
    expect(res.body.meta).toMatchObject({ scope: 'program', programId: OWN, count: 1 });
    expect(readFiles().every(([, args]) => (args as unknown[])[0] === ORG && (args as unknown[])[1] === OWN)).toBe(true);
  });

  it('gives a project with no file of its own no file, never the organization\'s unscoped one', async () => {
    const res = await request(app()).get(`/api/human-factors?program_id=${OWN_EMPTY}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta).toMatchObject({ scope: 'program', programId: OWN_EMPTY, count: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/Unscoped pump/);
  });

  it('leaves the read with no project as it was, and says the scope is the organization', async () => {
    const res = await request(app()).get('/api/human-factors');
    expect(res.status).toBe(200);
    expect(res.body.data.device).toBe('Unscoped pump');
    expect(res.body.meta).toMatchObject({ scope: 'organization' });
    expect(res.body.meta.programId).toBeUndefined();
    expect(h.lookups()).toBe(0);
  });
});

describe('POST /api/human-factors: a file created for a project records it', () => {
  it('records the caller\'s own project on the new file', async () => {
    const res = await request(app()).post('/api/human-factors').send({ device: 'New pump', programId: OWN });
    expect(res.status).toBe(201);
    expect(h.writes).toEqual([{ table: 'hf_engineering_files', programId: OWN }]);
    expect(res.body.meta).toMatchObject({ scope: 'program', programId: OWN });
  });

  it.each(REFUSED)('refuses %s (%s) with %i, and creates no file', async (_what, id, status) => {
    const res = await request(app()).post('/api/human-factors').send({ device: 'New pump', programId: id });
    expect(res.status).toBe(status);
    expect(h.writes).toEqual([]);
  });

  it('answers 503 when ownership cannot be checked, and creates no file', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).post('/api/human-factors').send({ device: 'New pump', programId: OWN });
    expect(res.status).toBe(503);
    expect(h.writes).toEqual([]);
  });

  it('creates an unscoped file, as before, when no project is named', async () => {
    const res = await request(app()).post('/api/human-factors').send({ device: 'New pump' });
    expect(res.status).toBe(201);
    expect(h.writes).toEqual([{ table: 'hf_engineering_files', programId: null }]);
    expect(res.body.meta).toMatchObject({ scope: 'organization' });
    expect(h.lookups()).toBe(0);
  });
});

describe('the writes into a file take the project\'s file, never the organization\'s', () => {
  it('a use scenario for a project attaches to that project\'s file', async () => {
    const res = await request(app()).post('/api/human-factors/scenarios').send({ task: 'Bolus entry', programId: OWN });
    expect(res.status).toBe(201);
    expect(h.writes).toEqual([{ table: 'c2c_hf_scenarios', fileId: 'hf-own' }]);
  });

  it('a use scenario for a project with no file is refused (409), and lands in no unscoped file', async () => {
    const res = await request(app()).post('/api/human-factors/scenarios').send({ task: 'Bolus entry', programId: OWN_EMPTY });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_FILE');
    expect(h.writes).toEqual([]);
  });

  it('an element tick for a project is written to that project\'s file', async () => {
    const res = await request(app()).patch('/api/human-factors/elements').send({ element: 'useEnvironments', present: true, programId: OWN });
    expect(res.status).toBe(200);
    expect(h.writes).toEqual([{ table: 'hf_engineering_files', fileId: 'hf-own' }]);
    expect(res.body.meta).toMatchObject({ scope: 'program', programId: OWN });
  });

  it('an element tick for a project with no file is refused (409), and changes no unscoped file', async () => {
    const res = await request(app()).patch('/api/human-factors/elements').send({ element: 'useEnvironments', present: true, programId: OWN_EMPTY });
    expect(res.status).toBe(409);
    expect(h.writes).toEqual([]);
  });

  it.each([
    ['POST /scenarios', () => request(app()).post('/api/human-factors/scenarios').send({ task: 'Bolus entry', programId: FOREIGN })],
    ['PATCH /elements', () => request(app()).patch('/api/human-factors/elements').send({ element: 'useEnvironments', present: true, programId: FOREIGN })],
  ] as const)('%s refuses another organization\'s project with 404, and writes nothing', async (_route, send) => {
    const res = await send();
    expect(res.status).toBe(404);
    expect(h.writes).toEqual([]);
  });

  it('with no project named, a use scenario still attaches to the organization\'s oldest file, as before', async () => {
    const res = await request(app()).post('/api/human-factors/scenarios').send({ task: 'Bolus entry' });
    expect(res.status).toBe(201);
    expect(h.writes).toEqual([{ table: 'c2c_hf_scenarios', fileId: 'hf-old-unscoped' }]);
    expect(h.lookups()).toBe(0);
  });
});
