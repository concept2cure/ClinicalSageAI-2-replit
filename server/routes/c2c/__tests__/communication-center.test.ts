/**
 * The submission-center item routes (ledger L161): they were written behind a
 * registrar nothing called, so the table had no reachable reader. This pins
 * that the router answers, fails closed when its tables are missing, refuses
 * an illegal lifecycle transition without writing, and 404s an unknown item —
 * plus the two helpers whose only other implementation was deleted with the
 * dead module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const poolQuery = vi.fn();
const dbInsert = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  db: { insert: (...a: unknown[]) => dbInsert(...a) },
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireOrganizationContext: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const createNotification = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('../notifications', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock('../../../services/governed-ana-execution.js', () => ({
  buildCanonicalGovernedState: async () => ({ decision: 'allow' }),
}));

type Mod = typeof import('../communication-center');
// The router caches its schema probe at module level ('ready' after the first
// success), so every test gets a fresh module: its first pool.query is always
// the probe, and the fail-closed case cannot be masked by an earlier pass.
let mod: Mod;
beforeEach(async () => {
  vi.resetModules();
  mod = await import('../communication-center');
});

const ALL_TABLES = [
  'concept2cure_authority_profiles',
  'concept2cure_agency_communications',
  'concept2cure_publishops_services',
  'concept2cure_submission_center_items',
];
const ITEM_ROW = {
  item_id: 'sci_1', title: 'Initial NDA', authority: 'FDA', submission_type: 'NDA',
  sequence_number: '0000', gateway_profile: null, status: 'draft', ectd_path: null,
  dispatch_ready: false, metadata: {}, created_by: 'a@b.c',
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { userId: 5, userEmail: 'a@b.c', tenantContext: { organizationId: 7 } });
    next();
  });
  a.use('/api/concept2cure', mod.default);
  return a;
}

/** pool.query answers in order: the schema probe, then whatever the handler asks. */
function wire(answers: Array<{ rows: unknown[] }>) {
  poolQuery.mockReset();
  for (const a of answers) poolQuery.mockResolvedValueOnce(a);
}
const tables = (names: string[]) => ({ rows: names.map((table_name) => ({ table_name })) });

beforeEach(() => {
  createNotification.mockClear();
  dbInsert.mockReset();
  // logAuditEntry awaits db.insert(...).values(...); the task writer chains .returning().
  const chain = { returning: async () => [{ id: 11 }], then: (r: (v: unknown) => void) => r(undefined) };
  dbInsert.mockReturnValue({ values: () => chain });
});

describe('helpers the dead module duplicated', () => {
  it('parses project ids with and without the proj_ prefix', () => {
    expect(mod.parseProjectParam('proj_42')).toBe(42);
    expect(mod.parseProjectParam('7')).toBe(7);
    expect(() => mod.parseProjectParam('proj_bad')).toThrow('Invalid project ID');
    expect(() => mod.parseProjectParam(undefined)).toThrow('Invalid project ID');
  });
  it('applies visibility-tier gating by role', () => {
    expect(mod.canViewVisibilityTier('shared_client_c2c', 'client_reviewer')).toBe(true);
    expect(mod.canViewVisibilityTier('publishops_only', 'client_reviewer')).toBe(false);
    expect(mod.canViewVisibilityTier('publishops_only', 'managed_publishops_operator')).toBe(true);
    expect(mod.canViewVisibilityTier('restricted_legal_sensitive', 'legal_counsel')).toBe(true);
    expect(mod.canViewVisibilityTier('restricted_legal_sensitive', 'client_reviewer')).toBe(false);
    expect(mod.canViewVisibilityTier('c2c_internal', 'c2c_analyst')).toBe(true);
    expect(mod.canViewVisibilityTier('c2c_internal', 'client_reviewer')).toBe(false);
    expect(mod.canViewVisibilityTier('c2c_internal', 'admin')).toBe(true);
    expect(mod.canViewVisibilityTier('client_internal', 'client_reviewer')).toBe(true);
    expect(mod.canViewVisibilityTier('unknown_tier' as never, 'admin')).toBe(false);
  });
});

describe('GET /projects/:projectId/submission-center/items', () => {
  it('lists the project\'s items with the lifecycle states in meta', async () => {
    wire([tables(ALL_TABLES), { rows: [ITEM_ROW] }]);
    const res = await request(app()).get('/api/concept2cure/projects/proj_3/submission-center/items');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: 'sci_1', projectId: 3, organizationId: 7, status: 'draft' });
    expect(res.body.meta.states).toContain('draft');
    const [sqlText, params] = poolQuery.mock.calls[1] as [string, unknown[]];
    expect(sqlText).toMatch(/FROM concept2cure_submission_center_items/);
    expect(params).toEqual([7, 3]);
  });

  it('fails closed with 503 naming the missing table, and reads nothing', async () => {
    wire([tables(ALL_TABLES.slice(0, 3))]);
    const res = await request(app()).get('/api/concept2cure/projects/3/submission-center/items');
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/concept2cure_submission_center_items/);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /projects/:projectId/submission-center/items/:itemId/status', () => {
  it('refuses an illegal transition with 400 and writes nothing', async () => {
    wire([tables(ALL_TABLES), { rows: [ITEM_ROW] }]);
    const res = await request(app())
      .patch('/api/concept2cure/projects/3/submission-center/items/sci_1/status')
      .send({ status: 'accepted_by_authority' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid submission status transition: draft -> accepted_by_authority/);
    expect(poolQuery.mock.calls.some(([q]) => /UPDATE/.test(String(q)))).toBe(false);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('404s an item that is not in this org and project', async () => {
    wire([tables(ALL_TABLES), { rows: [] }]);
    const res = await request(app())
      .patch('/api/concept2cure/projects/3/submission-center/items/sci_9/status')
      .send({ status: 'preparing' });
    expect(res.status).toBe(404);
  });

  it('applies a legal transition, audits it, and notifies through the one writer only past ready_for_publish', async () => {
    wire([tables(ALL_TABLES), { rows: [ITEM_ROW] }, { rows: [] }]);
    const res = await request(app())
      .patch('/api/concept2cure/projects/3/submission-center/items/sci_1/status')
      .send({ status: 'preparing' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('preparing');
    const update = poolQuery.mock.calls.find(([q]) => /UPDATE concept2cure_submission_center_items/.test(String(q)));
    expect(update).toBeTruthy();
    expect((update as [string, unknown[]])[1].slice(0, 1)).toEqual(['preparing']);
    expect(createNotification).not.toHaveBeenCalled();
    expect(dbInsert).toHaveBeenCalled(); // the audit row
  });
});
