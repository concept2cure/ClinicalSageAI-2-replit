/**
 * The device writes that take a project id from the client refuse a project the
 * caller's organization does not own (D3, 2026-10-29;
 * docs/evidence/D3-DEVICE-WRITES-ADMIT-PROGRAM/2026-10-29/).
 *
 * ca88fa26 made the project-scoped reads of Pre-Sub, UDI and labeling ask
 * `programInOrganization` first (device-project-reads-admit-program.test.ts).
 * It left the writes as they were:
 *
 *   - `POST /api/mdx/udi` and `POST /api/mdx/labeling` stored the client's
 *     `programId` without asking whether the organization owns it;
 *   - `PATCH /api/mdx/udi/:id` and `PATCH /api/mdx/labeling/:id` accept the same
 *     field and moved a record to any project id, unchecked.
 *
 * The row stays in the caller's organization, so no other tenant could read it.
 * Only the database's keys stood behind these writes, and unevenly
 * (fk-probe.txt in the evidence): `udi_records.program_id` references
 * `regulatory_programs(id)` alone, so it admits another organization's project;
 * `labeling_documents` also has a same-organization key (20261013b), which
 * refuses it; both refuse a missing project; and neither refuses a deleted one.
 * Each refusal reached the caller as a 500. The double below has no keys: it
 * records what each route sends, which is the part the route controls.
 *
 * `POST /api/q-sub` already asked, in `createQSubmission`, and wrote nothing on
 * refusal. It answered 403 where the reads answer 404, and 500 where they answer
 * 503 when the check cannot run.
 *
 * Each write now answers as the read does: 404 "Project not found" when the
 * organization does not own the live project (another organization's, a
 * missing or a deleted one), 503 when the check cannot run, and no row in
 * either case. A write that names no project behaves as before.
 *
 * Nothing here mocks the ownership answer or the Q-Sub service. The real
 * `programInOrganization` and `createQSubmission` run against a recording
 * database double, so "no row written" is what the routes actually sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** The caller organization's own project, soft-deleted. */
const DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Sent = { kind: 'ownership' } | { kind: 'write'; table: string; programId: unknown };

const h = vi.hoisted(() => {
  const state = { owner: new Map<string, number>(), deleted: new Set<string>(), ownershipDown: false };
  /** Every ownership lookup and every row write, in the order they were sent. */
  const sent: Sent[] = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (/FROM regulatory_programs/.test(sql)) {
      sent.push({ kind: 'ownership' });
      if (state.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      const [id, org] = args as [string, number];
      // A deleted project is not admitted when the lookup asks for a live one.
      const live = !(state.deleted.has(id) && /deleted_at IS NULL/.test(sql));
      return { rows: state.owner.get(id) === org && live ? [{ id }] : [] };
    }
    const insert = /^\s*INSERT INTO (udi_records|labeling_documents)\b/.exec(sql);
    if (insert) {
      // Both INSERTs put organization_id in $1 and program_id in $2.
      sent.push({ kind: 'write', table: insert[1], programId: args[1] });
      return { rows: [{ id: 1, organization_id: args[0], program_id: args[1] }] };
    }
    const update = /^\s*UPDATE (udi_records|labeling_documents)\b/.exec(sql);
    if (update) {
      // The SET clause is built from the body: program_id is in it only when sent.
      const slot = /\bprogram_id = \$(\d+)/.exec(sql);
      const programId = slot ? args[Number(slot[1]) - 1] : undefined;
      sent.push({ kind: 'write', table: update[1], programId });
      // Both UPDATEs end with `WHERE id = $n-1 AND organization_id = $n`.
      return { rows: [{ id: 1, organization_id: args[args.length - 1], program_id: programId ?? null }] };
    }
    return { rows: [] };
  });
  /* createQSubmission inserts through Drizzle: db.insert(table).values(v).returning(). */
  const db = {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          sent.push({ kind: 'write', table: 'q_submissions', programId: v.programId });
          return [{ id: 'q-new', ...v }];
        },
      }),
    }),
  };
  return { state, sent, query, db };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args) }),
  db: h.db,
}));
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));

import qSubRouter from '../../routes/q-sub';
import udiRouter from '../../routes/mdx-udi';
import labelingRouter from '../../routes/mdx-labeling';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    // An editing role: the UDI writes sit behind requireEditorAccess.
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG, role: 'admin' };
    next();
  });
  a.use('/api/q-sub', qSubRouter);
  a.use('/api/mdx', udiRouter);
  a.use('/api/mdx', labelingRouter);
  return a;
}

const writes = () => h.sent.filter((s): s is Extract<Sent, { kind: 'write' }> => s.kind === 'write');
const ownershipAsked = () => h.sent.some((s) => s.kind === 'ownership');

type Method = 'post' | 'patch';
const send = (method: Method, path: string, body: Record<string, unknown>) =>
  method === 'post' ? request(app()).post(path).send(body) : request(app()).patch(path).send(body);

const WRITES: ReadonlyArray<{
  name: string; method: Method; path: string; table: string; created: number;
  body: (programId: string) => Record<string, unknown>;
  /** The project-scoped read of the same records, whose refusal the write must match. */
  read: string;
}> = [
  { name: 'POST /api/mdx/udi', method: 'post', path: '/api/mdx/udi', table: 'udi_records', created: 201,
    body: (programId) => ({ programId, deviceName: 'CGM v2', udiDi: '00819000000001', issuingAgency: 'GS1' }),
    read: '/api/mdx/udi' },
  { name: 'PATCH /api/mdx/udi/:id', method: 'patch', path: '/api/mdx/udi/1', table: 'udi_records', created: 200,
    body: (programId) => ({ programId }),
    read: '/api/mdx/udi' },
  { name: 'POST /api/mdx/labeling', method: 'post', path: '/api/mdx/labeling', table: 'labeling_documents', created: 201,
    body: (programId) => ({ programId, deviceName: 'CGM v2', docKind: 'ifu' }),
    read: '/api/mdx/labeling' },
  { name: 'PATCH /api/mdx/labeling/:id', method: 'patch', path: '/api/mdx/labeling/1', table: 'labeling_documents', created: 200,
    body: (programId) => ({ programId }),
    read: '/api/mdx/labeling' },
  { name: 'POST /api/q-sub', method: 'post', path: '/api/q-sub', table: 'q_submissions', created: 201,
    body: (programId) => ({ programId, qSubType: 'presub', title: 'Pre-Sub for CGM v2' }),
    read: '/api/q-sub' },
];

beforeEach(() => {
  h.query.mockClear();
  h.sent.length = 0;
  h.state.ownershipDown = false;
  h.state.owner.clear();
  h.state.owner.set(OWN, ORG);
  h.state.owner.set(FOREIGN, OTHER_ORG);
  h.state.owner.set(DELETED, ORG);
  h.state.deleted.clear();
  h.state.deleted.add(DELETED);
});

describe.each(WRITES)('$name: the project a record is filed under must be the caller organization\'s', (w) => {
  it('refuses another organization\'s project with 404, and writes no row', async () => {
    const res = await send(w.method, w.path, w.body(FOREIGN));
    expect(writes()).toEqual([]);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
  });

  it('refuses a project that does not exist with 404, and writes no row', async () => {
    const res = await send(w.method, w.path, w.body(MISSING));
    expect(writes()).toEqual([]);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
  });

  it('refuses the organization\'s own deleted project with 404, and writes no row', async () => {
    const res = await send(w.method, w.path, w.body(DELETED));
    expect(writes()).toEqual([]);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
  });

  it('answers 503 when ownership cannot be checked, and writes no row', async () => {
    h.state.ownershipDown = true;
    const res = await send(w.method, w.path, w.body(OWN));
    expect(writes()).toEqual([]);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('VERIFICATION_UNAVAILABLE');
  });

  it('refuses in the same words as the project read of the same records', async () => {
    const write404 = await send(w.method, w.path, w.body(FOREIGN));
    const read404 = await request(app()).get(`${w.read}?program_id=${FOREIGN}`);
    expect(read404.status).toBe(404);
    expect({ status: write404.status, body: write404.body }).toEqual({ status: read404.status, body: read404.body });

    h.state.ownershipDown = true;
    const write503 = await send(w.method, w.path, w.body(OWN));
    const read503 = await request(app()).get(`${w.read}?program_id=${OWN}`);
    expect(read503.status).toBe(503);
    expect({ status: write503.status, body: write503.body }).toEqual({ status: read503.status, body: read503.body });
  });

  it('files the record under the caller\'s own project, after asking', async () => {
    const res = await send(w.method, w.path, w.body(OWN));
    expect(res.status).toBe(w.created);
    expect(writes()).toEqual([{ kind: 'write', table: w.table, programId: OWN }]);
    const asked = h.sent.findIndex((s) => s.kind === 'ownership');
    const wrote = h.sent.findIndex((s) => s.kind === 'write');
    expect(asked).toBeGreaterThanOrEqual(0);
    expect(asked).toBeLessThan(wrote);
  });
});

/* A write that names no project. On UDI and labeling the field is optional and
   nullable today: an organization-level record on create, and on PATCH either
   no change to the project or an explicit unassign. None of these asks the
   ownership question, and each stores what it stored before. */
const NO_PROJECT: ReadonlyArray<{
  name: string; method: Method; path: string; table: string; created: number;
  body: Record<string, unknown>; stores: unknown;
}> = [
  { name: 'POST /api/mdx/udi with no programId', method: 'post', path: '/api/mdx/udi', table: 'udi_records', created: 201,
    body: { deviceName: 'CGM v2', udiDi: '00819000000001', issuingAgency: 'GS1' }, stores: null },
  { name: 'POST /api/mdx/udi with programId null', method: 'post', path: '/api/mdx/udi', table: 'udi_records', created: 201,
    body: { programId: null, deviceName: 'CGM v2', udiDi: '00819000000001', issuingAgency: 'GS1' }, stores: null },
  { name: 'PATCH /api/mdx/udi/:id that leaves the project alone', method: 'patch', path: '/api/mdx/udi/1', table: 'udi_records', created: 200,
    body: { deviceName: 'CGM v3' }, stores: undefined },
  { name: 'PATCH /api/mdx/udi/:id with programId null (unassign)', method: 'patch', path: '/api/mdx/udi/1', table: 'udi_records', created: 200,
    body: { programId: null }, stores: null },
  { name: 'POST /api/mdx/labeling with no programId', method: 'post', path: '/api/mdx/labeling', table: 'labeling_documents', created: 201,
    body: { deviceName: 'CGM v2', docKind: 'ifu' }, stores: null },
  { name: 'POST /api/mdx/labeling with programId null', method: 'post', path: '/api/mdx/labeling', table: 'labeling_documents', created: 201,
    body: { programId: null, deviceName: 'CGM v2', docKind: 'ifu' }, stores: null },
  { name: 'PATCH /api/mdx/labeling/:id that leaves the project alone', method: 'patch', path: '/api/mdx/labeling/1', table: 'labeling_documents', created: 200,
    body: { deviceName: 'CGM v3' }, stores: undefined },
  { name: 'PATCH /api/mdx/labeling/:id with programId null (unassign)', method: 'patch', path: '/api/mdx/labeling/1', table: 'labeling_documents', created: 200,
    body: { programId: null }, stores: null },
];

describe.each(NO_PROJECT)('$name behaves as before', (c) => {
  it('writes the record without asking about a project', async () => {
    const res = await send(c.method, c.path, c.body);
    expect(res.status).toBe(c.created);
    expect(writes()).toEqual([{ kind: 'write', table: c.table, programId: c.stores }]);
    expect(ownershipAsked()).toBe(false);
  });
});

describe('POST /api/q-sub with no programId behaves as before', () => {
  it('is refused as invalid (the project is required), with no lookup and no row', async () => {
    const res = await send('post', '/api/q-sub', { qSubType: 'presub', title: 'Pre-Sub for CGM v2' });
    expect(res.status).toBe(422);
    expect(writes()).toEqual([]);
    expect(ownershipAsked()).toBe(false);
  });
});
