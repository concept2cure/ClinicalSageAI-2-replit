/**
 * Engineering's design-controls trace is the open project's (D2, fold F1 slice
 * A, plan item 3, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
 *
 * GET /api/mdx/engineering/:programId read c2c_design_controls by organization
 * only and reported `meta.scopes.trace: 'organization'`, so the Engineering
 * screen hid the trace panel behind "Shown once this screen reads this
 * project's records" (10bbeeeea). 20261029c gives the store a program key. The
 * trace now reads the admitted project's inputs only and reports 'program', so
 * the screen draws the panel again with no client change. An input of another
 * project, or one recorded with no project, is never in it.
 *
 * The ownership answer and the route are real. The database double answers
 * each statement by its own filters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIBLING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Input = { id: string; organization_id: number; program_id: string | null; req: string };

const h = vi.hoisted(() => {
  const state = { owner: new Map<string, number>(), inputs: [] as Input[], traceDown: null as null | { code: string } };
  const sent: Array<{ sql: string; args: unknown[] }> = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    sent.push({ sql, args });
    if (/FROM regulatory_programs/.test(sql)) {
      const [id, org] = args as [string, number];
      return { rows: state.owner.get(id) === org ? [{ id }] : [] };
    }
    if (/FROM c2c_design_controls/.test(sql)) {
      if (state.traceDown) throw Object.assign(new Error('column "program_id" does not exist'), state.traceDown);
      const org = args[0] as number;
      const byProgram = /program_id = \$2/.test(sql) ? (args[1] as string) : undefined;
      return {
        rows: state.inputs
          .filter((i) => i.organization_id === org && (byProgram === undefined || i.program_id === byProgram))
          .map((i) => ({ id: i.id, cat: 'performance', req: i.req, risk_ref: null, outputs: [], ver: 'pass', ver_ref: 'VER-1', val: 'pass', val_ref: 'VAL-1' })),
      };
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

import engineeringRouter from '../mdx-engineering';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG, role: 'viewer' };
    next();
  });
  a.use('/api/mdx', engineeringRouter);
  return a;
}

const traceReads = () => h.sent.filter((s) => /FROM c2c_design_controls/.test(s.sql));

beforeEach(() => {
  h.sent.length = 0;
  h.state.traceDown = null;
  h.state.owner = new Map([[OWN, ORG], [SIBLING, ORG], [FOREIGN, OTHER_ORG]]);
  h.state.inputs = [
    { id: 'DI-OWN-1', organization_id: ORG, program_id: OWN, req: 'This project\'s requirement' },
    { id: 'DI-SIB-1', organization_id: ORG, program_id: SIBLING, req: 'A sibling project\'s requirement' },
    { id: 'DI-NONE-1', organization_id: ORG, program_id: null, req: 'An unscoped legacy requirement' },
    { id: 'DI-FOR-1', organization_id: OTHER_ORG, program_id: FOREIGN, req: 'Another organization\'s requirement' },
  ];
});

describe('GET /api/mdx/engineering/:programId — the design-controls trace', () => {
  it('reads the project\'s own design inputs, after the ownership check, and reports the panel keyed to the project', async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.trace.map((t: { id: string }) => t.id)).toEqual(['DI-OWN-1']);
    expect(res.body.meta.scopes.trace).toBe('program');
    const [read] = traceReads();
    expect(read.sql).toMatch(/organization_id = \$1 AND program_id = \$2/);
    expect(read.args).toEqual([ORG, OWN]);
    const order = h.sent.map((s) => (/regulatory_programs/.test(s.sql) ? 'ownership' : /c2c_design_controls/.test(s.sql) ? 'trace' : 'other'));
    expect(order.indexOf('ownership')).toBeLessThan(order.indexOf('trace'));
  });

  it('never shows another project\'s inputs or the organization\'s unscoped ones', async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    const ids = res.body.data.trace.map((t: { id: string }) => t.id);
    expect(ids).not.toContain('DI-SIB-1');
    expect(ids).not.toContain('DI-NONE-1');
    expect(ids).not.toContain('DI-FOR-1');
  });

  it('a project with no design inputs of its own reads an empty trace, still keyed to it', async () => {
    h.state.inputs = h.state.inputs.filter((i) => i.program_id !== SIBLING);
    const res = await request(app()).get(`/api/mdx/engineering/${SIBLING}`);
    expect(res.body.data.trace).toEqual([]);
    expect(res.body.meta.scopes.trace).toBe('program');
    expect(res.body.meta.unavailable).not.toContain('trace');
  });

  it('another organization\'s project is refused before the trace is read', async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${FOREIGN}`);
    expect(res.status).toBe(404);
    expect(traceReads()).toEqual([]);
  });

  it('a store without the program key is a failed panel, not an empty one', async () => {
    h.state.traceDown = { code: '42703' };
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.trace).toEqual([]);
    expect(res.body.meta.unavailable).toContain('trace');
  });

  /* Non-conformances and documents were narrowed the same day
     (mdx-engineering-panels-by-project.test.ts); DHF and change requests stay
     the organization's, for the reasons in the route header. */
  it('the two panels still read by organization are reported as the organization\'s', async () => {
    const res = await request(app()).get(`/api/mdx/engineering/${OWN}`);
    expect(res.body.meta.scopes).toMatchObject({ risks: 'program', trace: 'program', dhf: 'organization', ecrs: 'organization', issues: 'program', documents: 'program' });
  });
});
