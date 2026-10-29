/**
 * A change request can be raised against a project, and only one of the caller
 * organization's (founder decision P-60, D2 / D6, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-per-product/).
 *
 * qms_change_controls had no project column, so a product's Engineering screen
 * could not show that product's design changes. 20261029l adds the key.
 * POST /api/mdx/qms/changes takes an optional `programId`, admitted before the
 * handler runs (admitBodyProject, server/routes/mdx-qms-context.ts, through the
 * shared refusal in server/lib/admit-project.ts), and createChange stamps it. With no project named the change is the
 * organization's, as every change was before.
 *
 * The ownership answer, the route and the service are real; the database
 * double records every statement and answers the ownership check from its map.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 9;
const OTHER_ORG = 10;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const h = vi.hoisted(() => {
  const state = { owner: new Map<string, number>(), ownershipDown: false };
  const sent: Array<{ sql: string; args: unknown[] }> = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> => {
    sent.push({ sql, args });
    if (/FROM regulatory_programs/.test(sql)) {
      if (state.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      const [id, org] = args as [string, number];
      const rows = state.owner.get(id) === org ? [{ id }] : [];
      return { rows, rowCount: rows.length };
    }
    if (/INSERT INTO qms_change_controls/.test(sql)) {
      return { rows: [{ id: 41, change_number: args[1], classification: 'minor', status: 'proposed' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { state, sent, query };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args), connect: async () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args), release: () => undefined }) },
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({ recordAuditRow: async () => ({ persisted: true, chained: true }) }));
// The QMS writes are editor-gated (DP-60); the gate has its own tests.
vi.mock('../../middleware/orgMembership', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/orgMembership')>()),
  requireEditorAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import mdxQmsRouter from '../mdx-qms';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: ORG, id: 7 };
    Object.assign(req, { dbClient: { query: (sql: string, args?: unknown[]) => h.query(sql, args) } });
    next();
  });
  a.use('/api/mdx', mdxQmsRouter);
  return a;
}

const body = { changeNumber: 'CC-2026-031', title: 'Tighten adhesive peel specification', changeType: 'specification', reason: 'Field complaints on peel strength' };
const inserts = () => h.sent.filter((s) => /INSERT INTO qms_change_controls/.test(s.sql));
const ownershipChecks = () => h.sent.filter((s) => /FROM regulatory_programs/.test(s.sql));
/** The value the INSERT writes into program_id, read from its column list. */
const programWritten = (insert: { sql: string; args: unknown[] }): unknown => {
  const cols = /INSERT INTO qms_change_controls \(([^)]*)\)/.exec(insert.sql)?.[1].split(',').map((c) => c.trim()) ?? [];
  const at = cols.indexOf('program_id');
  return at < 0 ? 'NOT WRITTEN' : insert.args[at];
};

beforeEach(() => {
  h.sent.length = 0;
  h.state.owner = new Map([[OWN, ORG], [FOREIGN, OTHER_ORG]]);
  h.state.ownershipDown = false;
});

describe('POST /api/mdx/qms/changes — the project a change is raised against', () => {
  it("records it against the caller organization's own project, after asking", async () => {
    const res = await request(app()).post('/api/mdx/qms/changes').send({ ...body, programId: OWN });
    expect(res.status).toBe(201);
    const [insert] = inserts();
    expect(programWritten(insert)).toBe(OWN);
    const order = h.sent.map((s) => (/regulatory_programs/.test(s.sql) ? 'ownership' : /INSERT INTO qms_change_controls/.test(s.sql) ? 'insert' : 'other'));
    expect(order.indexOf('ownership')).toBeGreaterThan(-1);
    expect(order.indexOf('ownership')).toBeLessThan(order.indexOf('insert'));
  });

  it.each([
    ["another organization's project", FOREIGN],
    ['a project that does not exist', MISSING],
    ['an id that is not a project id', 'not-a-uuid'],
  ])('refuses %s with 404 "Project not found", and writes nothing', async (_label, programId) => {
    const res = await request(app()).post('/api/mdx/qms/changes').send({ ...body, programId });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Project not found');
    expect(inserts()).toEqual([]);
  });

  it('answers 503 when ownership cannot be checked, and writes nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).post('/api/mdx/qms/changes').send({ ...body, programId: OWN });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('VERIFICATION_UNAVAILABLE');
    expect(inserts()).toEqual([]);
  });

  it("with no project named, records the organization's change without asking, as before", async () => {
    const res = await request(app()).post('/api/mdx/qms/changes').send(body);
    expect(res.status).toBe(201);
    expect(ownershipChecks()).toEqual([]);
    const [insert] = inserts();
    expect(programWritten(insert)).toBeNull();
  });

  it('an edit cannot move a change onto a project: PATCH writes no program_id', async () => {
    await request(app()).patch('/api/mdx/qms/changes/41').send({ title: 'Retitled', programId: OWN });
    const updates = h.sent.filter((s) => /UPDATE qms_change_controls/.test(s.sql));
    for (const u of updates) expect(u.sql).not.toMatch(/program_id/);
  });
});
