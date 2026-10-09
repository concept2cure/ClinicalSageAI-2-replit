/**
 * Tests for the first-run install setup endpoint (routes/setup.ts).
 * Mocks the DB so the user-count gate and the create transaction run offline.
 *
 * The fake transaction records every statement it is asked to run, in order —
 * inserts and selects BY TABLE NAME, raw statements (`tx.execute`) as their
 * rendered SQL and params — so the create path is asserted for what it writes
 * and under which tenant, not only for its status code. `db` itself has no
 * `insert` and no `execute`: a write moved out of the transaction fails here
 * instead of passing unobserved.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Op =
  | { op: 'insert'; table: string; values: any; onConflictDoNothing: boolean }
  | { op: 'select'; table: string }
  | { op: 'execute'; sql: string; params: unknown[] };

const state = vi.hoisted(() => ({
  userRows: 0,
  ops: [] as Op[],
  /** Table whose insert the fake rejects, as RLS refuses a write in production. */
  refuseInsertInto: null as string | null,
}));

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  // Built from fragments (not a literal) so secret scanners don't flag this
  // test value; config.jwt requires >= 32 chars.
  process.env.JWT_SECRET = process.env.JWT_SECRET || `test-jwt-${'x'.repeat(32)}`;
  // No credentials in this URL — the DB is fully mocked below; this only keeps
  // config resolution happy and avoids tripping secret scanners.
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

vi.mock('../../db', async () => {
  const { getTableName } = await import('drizzle-orm');
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const rowFor = (table: string): Record<string, unknown> => {
    if (table === 'organizations') return { id: 1, uuid: 'org-uuid-1', name: 'Acme Bio', slug: 'acme-bio' };
    if (table === 'users') return { id: 7, email: 'founder@acme.test', name: 'founder' };
    if (table === 'client_workspaces') return { id: 42 };
    return {};
  };
  const insert = (table: any): any => {
    const name = getTableName(table);
    const rec = { op: 'insert' as const, table: name, values: undefined as any, onConflictDoNothing: false };
    state.ops.push(rec);
    const settle = () =>
      state.refuseInsertInto === name
        ? Promise.reject(new Error(`new row violates row-level security policy for table "${name}"`))
        : Promise.resolve([rowFor(name)]);
    const chain: any = {
      values: (v: unknown) => ((rec.values = v), chain),
      onConflictDoNothing: () => ((rec.onConflictDoNothing = true), chain),
      returning: () => settle(),
      then: (ok: any, fail: any) => settle().then(ok, fail),
    };
    return chain;
  };
  // A new organisation has no workspace yet.
  const select = () => ({
    from: (table: any) => {
      state.ops.push({ op: 'select', table: getTableName(table) });
      return { where: () => Promise.resolve([]) };
    },
  });
  const execute = async (query: any) => {
    const { sql, params } = dialect.sqlToQuery(query);
    state.ops.push({ op: 'execute', sql, params });
    return { rows: [] };
  };
  const db = {
    select: () => ({ from: () => Promise.resolve([{ count: state.userRows }]) }),
    transaction: async (cb: any) => cb({ insert, select, execute }),
  };
  return { db, pool: {}, getPool: () => ({}), getDb: () => db };
});

// The session registry's Redis tier is away; the memory tier answers. The
// bootstrap token must open its session through openSession like every other
// sign-in (P1-38), so the door is spied on, not replaced.
vi.mock('../../services/ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => false, getRedisClient: () => null }));
vi.mock('../../services/session-inactivity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/session-inactivity')>();
  return { ...actual, openSession: vi.fn(actual.openSession) };
});

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import setupRouter from '../setup';
import { DEFAULT_IDLE_MINUTES, openSession } from '../../services/session-inactivity';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/setup', setupRouter);
  return app;
}

// Built from fragments (not a literal) so secret scanners don't flag this test
// fixture. Satisfies the password policy: upper, lower, digit, special, 12+ chars.
const VALID = {
  email: 'founder@acme.test',
  password: `Aa1!${'x'.repeat(8)}`,
  organizationName: 'Acme Bio',
};

/** One line per statement, so an ordering failure prints the whole sequence. */
const trace = () =>
  state.ops.map((o) =>
    o.op === 'execute' ? `execute ${o.sql} ${JSON.stringify(o.params)}` : `${o.op} ${o.table}`,
  );

describe('first-run setup — /api/setup', () => {
  beforeEach(() => {
    state.userRows = 0;
    state.ops = [];
    state.refuseInsertInto = null;
    vi.mocked(openSession).mockClear();
  });

  it('GET /status reports not-initialized on an empty install', async () => {
    const res = await request(makeApp()).get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body.initialized).toBe(false);
  });

  it('GET /status reports initialized once a user exists', async () => {
    state.userRows = 3;
    const res = await request(makeApp()).get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body.initialized).toBe(true);
  });

  it('POST /initialize rejects a missing organization name', async () => {
    const res = await request(makeApp())
      .post('/api/setup/initialize')
      .send({ email: VALID.email, password: VALID.password });
    expect(res.status).toBe(400);
  });

  it('POST /initialize rejects a weak password', async () => {
    const res = await request(makeApp())
      .post('/api/setup/initialize')
      .send({ ...VALID, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('POST /initialize creates the first org + admin on an empty install', async () => {
    const res = await request(makeApp()).post('/api/setup/initialize').send(VALID);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.organization.id).toBe(1);
  });

  it('POST /initialize mints the bootstrap token as a registered session: openSession, and sid / sst / idl in the token (P1-38)', async () => {
    const res = await request(makeApp()).post('/api/setup/initialize').send(VALID);
    expect(res.status).toBe(201);
    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET as string) as Record<string, unknown>;
    expect(claims.type).toBe('access');
    expect(typeof claims.sid, 'the setup token carries no session id: it was minted outside openSession').toBe('string');
    expect(typeof claims.sst).toBe('number');
    // The new organisation has no settings yet: the platform's default window.
    expect(claims.idl).toBe(DEFAULT_IDLE_MINUTES * 60);
    expect(openSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(openSession).mock.calls[0][0]).toBe(7);
  });

  it('POST /initialize writes the org, its admin, and the org\'s own workspace under the org\'s tenant, in one transaction', async () => {
    const res = await request(makeApp()).post('/api/setup/initialize').send(VALID);
    expect(res.status).toBe(201);

    expect(trace()).toEqual([
      'insert organizations',
      'insert users',
      'insert organization_users',
      // The new organisation becomes the tenant BEFORE the workspace is
      // counted or written — the count must not read through another tenant.
      `execute SELECT set_config('app.current_tenant_id', $1, true) ["1"]`,
      'select client_workspaces',
      'insert client_workspaces',
    ]);
    const workspace = state.ops.find((o) => o.op === 'insert' && o.table === 'client_workspaces') as Extract<Op, { op: 'insert' }>;
    expect(workspace.values).toMatchObject({
      organizationId: 1,
      createdById: 7,
      name: 'Acme Bio',
      slug: 'acme-bio',
      status: 'active',
      metadata: { defaultForOrganization: true },
    });
    expect(workspace.onConflictDoNothing).toBe(true);
  });

  it('POST /initialize fails closed when the workspace write is refused — no 201, no token', async () => {
    state.refuseInsertInto = 'client_workspaces';
    const res = await request(makeApp()).post('/api/setup/initialize').send(VALID);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SETUP_FAILED');
    expect(res.body.token).toBeUndefined();
  });

  it('POST /initialize is self-closing once a user exists', async () => {
    state.userRows = 1;
    const res = await request(makeApp()).post('/api/setup/initialize').send(VALID);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_INITIALIZED');
    expect(state.ops).toEqual([]);
  });
});
