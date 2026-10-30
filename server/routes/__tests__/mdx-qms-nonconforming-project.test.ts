/**
 * A non-conformance can be recorded against a project, and only one of the
 * caller organization's (D2 / D6, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-panels-keyed/).
 *
 * qms_nonconforming_products had no project column, so the Engineering screen
 * could show a project only the organization's whole NC log, and hid it.
 * 20261029d adds the key. POST /api/mdx/qms/nonconforming takes an optional
 * `programId`, admitted through the shared refusal (server/lib/admit-project.ts)
 * before anything is written, and stamps it. With no project named the record
 * is the organization's, unscoped, as every record was before.
 *
 * The ownership answer and the route are real; the database double records
 * every statement and answers the ownership check from its own map.
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
    if (/INSERT INTO qms_nonconforming_products/.test(sql)) {
      return { rows: [{ id: 41, nc_number: args[1] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { state, sent, query };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args), connect: async () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args), release: () => undefined }) },
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({ recordAuditRow: async () => ({ persisted: true, chained: true }) }));
// The QMS writes are editor-gated (6582e3a3e); the gate has its own tests.
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

const body = { ncNumber: 'NC-2026-014', description: 'Adhesive peel below specification', deviceName: 'Sensor patch' };
const inserts = () => h.sent.filter((s) => /INSERT INTO qms_nonconforming_products/.test(s.sql));
const ownershipChecks = () => h.sent.filter((s) => /FROM regulatory_programs/.test(s.sql));

beforeEach(() => {
  h.sent.length = 0;
  h.state.owner = new Map([[OWN, ORG], [FOREIGN, OTHER_ORG]]);
  h.state.ownershipDown = false;
});

describe('POST /api/mdx/qms/nonconforming — the project a record is filed under', () => {
  it("records it against the caller organization's own project, after asking", async () => {
    const res = await request(app()).post('/api/mdx/qms/nonconforming').send({ ...body, programId: OWN });
    expect(res.status).toBe(201);
    const [insert] = inserts();
    expect(insert.sql).toMatch(/program_id/);
    expect(insert.args).toContain(OWN);
    const order = h.sent.map((s) => (/regulatory_programs/.test(s.sql) ? 'ownership' : /INSERT INTO qms_nonconforming_products/.test(s.sql) ? 'insert' : 'other'));
    expect(order.indexOf('ownership')).toBeGreaterThan(-1);
    expect(order.indexOf('ownership')).toBeLessThan(order.indexOf('insert'));
  });

  it.each([
    ["another organization's project", FOREIGN],
    ['a project that does not exist', MISSING],
    ['an id that is not a project id', 'not-a-uuid'],
  ])('refuses %s with 404 "Project not found", and writes nothing', async (_label, programId) => {
    const res = await request(app()).post('/api/mdx/qms/nonconforming').send({ ...body, programId });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Project not found');
    expect(inserts()).toEqual([]);
  });

  it('answers 503 when ownership cannot be checked, and writes nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).post('/api/mdx/qms/nonconforming').send({ ...body, programId: OWN });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('VERIFICATION_UNAVAILABLE');
    expect(inserts()).toEqual([]);
  });

  it("with no project named, records the organization's unscoped record without asking, as before", async () => {
    const res = await request(app()).post('/api/mdx/qms/nonconforming').send(body);
    expect(res.status).toBe(201);
    expect(ownershipChecks()).toEqual([]);
    const [insert] = inserts();
    expect(insert.sql).toMatch(/program_id/);
    // organization, number, device, lot, source, description, detected_by, program
    expect(insert.args).toHaveLength(8);
    expect(insert.args[7]).toBeNull();
  });
});
