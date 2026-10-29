/**
 * The device reads a project screen makes refuse a project the caller's
 * organization does not own (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/device-features-reach-three/).
 *
 * Pre-Sub (`GET /api/q-sub`), UDI (`GET /api/mdx/udi/summary`, `GET /api/mdx/udi`)
 * and labeling (`GET /api/mdx/labeling`) each filter by `program_id`, and each
 * also filters every row by the caller's organization, so another tenant's rows
 * never came back. But none asked whether the caller owns the project it was
 * given. Another organization's project, or one that does not exist, came back
 * `200` with no rows, which a project screen draws as "this project has none".
 * And a project-ownership lookup that could not run was never made, so it could
 * not be reported.
 *
 * Each read now asks `programInOrganization` (server/services/c2c/program-access.ts,
 * the one ownership answer) first, as mdx-engineering.ts already does for the
 * engineering read: not owned is 404 and nothing is read; could not check is 503.
 * The organization-wide read without `program_id` is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const h = vi.hoisted(() => {
  const state = { owner: new Map<string, number>(), ownershipDown: false };
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (/FROM regulatory_programs/.test(sql)) {
      if (state.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      const [id, org] = args as [string, number];
      return { rows: state.owner.get(id) === org ? [{ id }] : [] };
    }
    return { rows: [] };
  });
  const listQSubsForOrg = vi.fn(async (_org: number, _filters: { programId?: string }) => [{ id: 'q-1' }]);
  return { state, query, listQSubsForOrg };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args) }),
  db: {},
}));
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/q-sub/q-sub.service', () => ({
  listQSubsForOrg: (org: number, filters: { programId?: string }) => h.listQSubsForOrg(org, filters),
  getQSubDetail: vi.fn(),
  createQSubmission: vi.fn(),
  setCommitmentRolledIn: vi.fn(),
  TenantAccessError: class TenantAccessError extends Error {},
}));

import qSubRouter from '../../routes/q-sub';
import udiRouter from '../../routes/mdx-udi';
import labelingRouter from '../../routes/mdx-labeling';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG };
    next();
  });
  a.use('/api/q-sub', qSubRouter);
  a.use('/api/mdx', udiRouter);
  a.use('/api/mdx', labelingRouter);
  return a;
}

/** Whether the read's own data was asked for: the rows a project screen would draw. */
const dataQueried = (table: string) => h.query.mock.calls.some(([sql]) => new RegExp(`FROM ${table}\\b`).test(String(sql)));

const READS = [
  { name: 'Pre-Sub list', path: '/api/q-sub', read: () => h.listQSubsForOrg.mock.calls.length > 0,
    scopedTo: (id: string) => h.listQSubsForOrg.mock.calls.some(([org, f]) => org === ORG && (f as { programId?: string }).programId === id) },
  { name: 'UDI summary', path: '/api/mdx/udi/summary', read: () => dataQueried('udi_records'),
    scopedTo: (id: string) => h.query.mock.calls.some(([sql, args]) => /FROM udi_records/.test(String(sql)) && (args as unknown[])[0] === ORG && (args as unknown[]).includes(id)) },
  { name: 'UDI records', path: '/api/mdx/udi', read: () => dataQueried('udi_records'),
    scopedTo: (id: string) => h.query.mock.calls.some(([sql, args]) => /FROM udi_records/.test(String(sql)) && (args as unknown[])[0] === ORG && (args as unknown[]).includes(id)) },
  { name: 'labeling documents', path: '/api/mdx/labeling', read: () => dataQueried('labeling_documents'),
    scopedTo: (id: string) => h.query.mock.calls.some(([sql, args]) => /FROM labeling_documents/.test(String(sql)) && (args as unknown[])[0] === ORG && (args as unknown[]).includes(id)) },
] as const;

beforeEach(() => {
  h.query.mockClear();
  h.listQSubsForOrg.mockClear();
  h.state.ownershipDown = false;
  h.state.owner.clear();
  h.state.owner.set(OWN, ORG);
  h.state.owner.set(FOREIGN, OTHER_ORG);
});

describe.each(READS)('$name: the project it is given must be the caller organization\'s', (r) => {
  it('refuses another organization\'s project with 404, and reads none of its rows', async () => {
    const res = await request(app()).get(`${r.path}?program_id=${FOREIGN}`);
    expect(res.status).toBe(404);
    expect(r.read()).toBe(false);
  });

  it('refuses a project that does not exist with 404, rather than an empty list', async () => {
    const res = await request(app()).get(`${r.path}?program_id=${MISSING}`);
    expect(res.status).toBe(404);
    expect(r.read()).toBe(false);
  });

  it('answers 503 when ownership cannot be checked, and reads nothing', async () => {
    h.state.ownershipDown = true;
    const res = await request(app()).get(`${r.path}?program_id=${OWN}`);
    expect(res.status).toBe(503);
    expect(r.read()).toBe(false);
  });

  it('reads the caller\'s own project, by organization and project', async () => {
    const res = await request(app()).get(`${r.path}?program_id=${OWN}`);
    expect(res.status).toBe(200);
    expect(r.scopedTo(OWN)).toBe(true);
  });

  it('leaves the organization-wide read, with no project, as it was', async () => {
    const res = await request(app()).get(r.path);
    expect(res.status).toBe(200);
    expect(h.query.mock.calls.some(([sql]) => /FROM regulatory_programs/.test(String(sql)))).toBe(false);
  });
});
