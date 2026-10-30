/**
 * The ISO 14971 risk routes admit the project a request names, and their writes
 * take an editing role (D2, fold F1 slice A, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
 *
 * mdx-risk-management.ts never asked whether the caller's organization owns the
 * project it was given. GET /risk-items?program_id= and GET /risk-summary/:id
 * filtered by it, which over another organization's project answered an empty
 * register, not a refusal. POST /risk-items and PATCH /risk-items/:id stored the
 * body's programId unchecked. And no write had an editor gate, so a viewer could
 * add hazards and controls and change their status.
 *
 * Each route that takes a project now asks the one ownership answer first,
 * through admitProject (server/lib/admit-project.ts over programInOrganization),
 * as the UDI, labeling and human-factors routes do: 404 when the organization
 * does not own the live project, 503 when the check cannot run, and nothing
 * read or written either way. The project is stored only after that check.
 * Every write refuses a viewer before the handler runs, with the UDI write's
 * 403, and sends nothing. The reads stay open to every member.
 *
 * Nothing here mocks the ownership answer. The real programInOrganization runs
 * against a database double that answers each statement by its own filters.
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

const h = vi.hoisted(() => {
  const state = {
    role: 'member' as string | undefined,
    owner: new Map<string, number>(), deleted: new Set<string>(), ownershipDown: false,
  };
  const sent: Array<{ sql: string; args: unknown[] }> = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }> => {
    sent.push({ sql, args });
    if (/FROM regulatory_programs/.test(sql)) {
      if (state.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      const [id, org] = args as [string, number];
      const live = !(state.deleted.has(id) && /deleted_at IS NULL/.test(sql));
      return { rows: state.owner.get(id) === org && live ? [{ id }] : [] };
    }
    if (/COUNT\(\*\)/.test(sql)) {
      return { rows: [{ total: 2, open: 1, high_residual: 0, accepted: 1, avg_initial: '9.00', avg_residual: '6.00' }] };
    }
    return { rows: [{ id: 1, organization_id: ORG, program_id: OWN, status: 'open' }], rowCount: 1 };
  });
  return { state, sent, query };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args) }),
  db: {},
}));

import riskRouter from '../mdx-risk-management';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG, role: h.state.role };
    next();
  });
  a.use('/api/mdx', riskRouter);
  return a;
}

const ownership = () => h.sent.filter((s) => /FROM regulatory_programs/.test(s.sql));
const riskReads = () => h.sent.filter((s) => /FROM risk_items/.test(s.sql) && !/^\s*(INSERT|UPDATE)/i.test(s.sql));
const writes = () => h.sent.filter((s) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(s.sql));
const item = { hazard: 'Sensor drift', harm: 'Mis-dosing', severity: 3, probability: 2 };

beforeEach(() => {
  h.sent.length = 0;
  h.state.role = 'member';
  h.state.ownershipDown = false;
  h.state.owner = new Map([[OWN, ORG], [FOREIGN, OTHER_ORG], [DELETED, ORG]]);
  h.state.deleted = new Set([DELETED]);
});

const REFUSED: Array<[string, string]> = [
  ['another organization\'s project', FOREIGN],
  ['a missing project', MISSING],
  ['a deleted project', DELETED],
];

describe('GET /api/mdx/risk-items?program_id=', () => {
  it('reads that project\'s register after the ownership check, and says so', async () => {
    const res = await request(app()).get(`/api/mdx/risk-items?program_id=${OWN}`);
    expect(res.status).toBe(200);
    expect(ownership()).toHaveLength(1);
    expect(h.sent.indexOf(ownership()[0])).toBeLessThan(h.sent.indexOf(riskReads()[0]));
    expect(riskReads()[0].args.slice(0, 2)).toEqual([ORG, OWN]);
    expect(res.body.meta).toMatchObject({ scope: 'program', programId: OWN });
  });

  it.each(REFUSED)('refuses %s with 404 and reads nothing', async (_what, programId) => {
    const res = await request(app()).get(`/api/mdx/risk-items?program_id=${programId}`);
    expect(riskReads()).toEqual([]);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Project not found');
  });

  it('answers 503 when the ownership check cannot run, and reads nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).get(`/api/mdx/risk-items?program_id=${OWN}`);
    expect(riskReads()).toEqual([]);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('connection terminated');
  });

  it('without a project, reads the organization\'s register as before and says so', async () => {
    const res = await request(app()).get('/api/mdx/risk-items');
    expect(res.status).toBe(200);
    expect(ownership()).toEqual([]);
    expect(res.body.meta).toMatchObject({ scope: 'organization' });
  });

  it('a viewer may still read', async () => {
    h.state.role = 'viewer';
    expect((await request(app()).get(`/api/mdx/risk-items?program_id=${OWN}`)).status).toBe(200);
  });
});

describe('GET /api/mdx/risk-summary/:programId', () => {
  it('summarizes the project after the ownership check', async () => {
    const res = await request(app()).get(`/api/mdx/risk-summary/${OWN}`);
    expect(res.status).toBe(200);
    expect(ownership()).toHaveLength(1);
    expect(res.body.data).toMatchObject({ total: 2, accepted: 1 });
  });

  it.each(REFUSED)('refuses %s with 404 and reads nothing', async (_what, programId) => {
    const res = await request(app()).get(`/api/mdx/risk-summary/${programId}`);
    expect(riskReads()).toEqual([]);
    expect(res.status).toBe(404);
  });

  it('answers 503 when the ownership check cannot run, and reads nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).get(`/api/mdx/risk-summary/${OWN}`);
    expect(riskReads()).toEqual([]);
    expect(res.status).toBe(503);
  });
});

describe('POST /api/mdx/risk-items', () => {
  it('stores the project only after the ownership check', async () => {
    const res = await request(app()).post('/api/mdx/risk-items').send({ ...item, programId: OWN });
    expect(res.status).toBe(201);
    const [insert] = writes();
    expect(ownership()).toHaveLength(1);
    expect(h.sent.indexOf(ownership()[0])).toBeLessThan(h.sent.indexOf(insert));
    expect(insert.args.slice(0, 2)).toEqual([ORG, OWN]);
  });

  it.each(REFUSED)('refuses %s with 404 and inserts nothing', async (_what, programId) => {
    const res = await request(app()).post('/api/mdx/risk-items').send({ ...item, programId });
    expect(writes()).toEqual([]);
    expect(res.status).toBe(404);
  });

  it('answers 503 when the ownership check cannot run, and inserts nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).post('/api/mdx/risk-items').send({ ...item, programId: OWN });
    expect(writes()).toEqual([]);
    expect(res.status).toBe(503);
  });

  it('without a project, inserts an organization hazard with no project, as before', async () => {
    const res = await request(app()).post('/api/mdx/risk-items').send(item);
    expect(res.status).toBe(201);
    expect(ownership()).toEqual([]);
    expect(writes()[0].args.slice(0, 2)).toEqual([ORG, null]);
  });
});

describe('PATCH /api/mdx/risk-items/:id', () => {
  it('moves a hazard to a project only after the ownership check', async () => {
    const res = await request(app()).patch('/api/mdx/risk-items/1').send({ programId: OWN });
    expect(res.status).toBe(200);
    const [update] = writes();
    expect(ownership()).toHaveLength(1);
    expect(h.sent.indexOf(ownership()[0])).toBeLessThan(h.sent.indexOf(update));
    expect(update.sql).toMatch(/program_id = \$1/);
    expect(update.args[0]).toBe(OWN);
  });

  it.each(REFUSED)('refuses a move to %s with 404 and updates nothing', async (_what, programId) => {
    const res = await request(app()).patch('/api/mdx/risk-items/1').send({ programId });
    expect(writes()).toEqual([]);
    expect(res.status).toBe(404);
  });

  it('answers 503 when the ownership check cannot run, and updates nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).patch('/api/mdx/risk-items/1').send({ programId: OWN });
    expect(writes()).toEqual([]);
    expect(res.status).toBe(503);
  });

  it('a change that names no project asks no ownership question', async () => {
    const res = await request(app()).patch('/api/mdx/risk-items/1').send({ severity: 4 });
    expect(res.status).toBe(200);
    expect(ownership()).toEqual([]);
  });

  it('clearing the project asks no ownership question', async () => {
    const res = await request(app()).patch('/api/mdx/risk-items/1').send({ programId: null });
    expect(res.status).toBe(200);
    expect(ownership()).toEqual([]);
  });
});

type Method = 'post' | 'patch';
const WRITES: Array<{ method: Method; path: string; body: Record<string, unknown> }> = [
  { method: 'post', path: '/api/mdx/risk-items', body: item },
  { method: 'patch', path: '/api/mdx/risk-items/1', body: { severity: 4 } },
  /* Accepting residual risk is a signed act and also takes an editor; its
     refusal of a viewer is pinned in mdx-risk-accept-residual-signature.test.ts. */
  { method: 'patch', path: '/api/mdx/risk-items/1', body: { status: 'mitigating' } },
  { method: 'post', path: '/api/mdx/risk-items/1/controls', body: { description: 'Dual-sensor cross-check', controlType: 'protective_measure' } },
  { method: 'patch', path: '/api/mdx/risk-controls/1', body: { status: 'implemented' } },
];

describe.each(WRITES)('$method $path takes an editing role', ({ method, path, body }) => {
  it('refuses a viewer with the UDI write\'s 403 and sends nothing', async () => {
    h.state.role = 'viewer';
    const res = await request(app())[method](path).send(body);
    expect(h.sent).toEqual([]);
    expect({ status: res.status, body: res.body as unknown }).toEqual({ status: 403, body: { error: 'Insufficient permissions' } });
  });

  it('lets an editor through', async () => {
    const res = await request(app())[method](path).send(body);
    expect(res.status).toBeLessThan(300);
    expect(writes().length).toBeGreaterThan(0);
  });
});
