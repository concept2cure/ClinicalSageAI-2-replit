/**
 * A task that cannot read the shared session store is not ready (MR-03 Stage 7 step 4, SEC-08).
 *
 * Sign-in sessions are coordinated across API tasks through Postgres
 * (session_activity; decision B6, no Redis). When a task cannot reach that
 * table, the session service judges each session from the task's own memory
 * and logs a warning (services/session-inactivity.ts): the idle timeout, the
 * concurrent-session limit and superseded sessions then hold per task, which is
 * the state U20 fixed. /readyz said nothing about it, so a deployment whose
 * database lacked the table, or whose runtime role could not read it, passed
 * its smoke test.
 *
 * Now /readyz reads the table the way the session service does, under the
 * system tenant scope, with the other round trips (cached, OPS-22), in
 * production. Outside production it is skipped, as the scanner is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/storage', () => ({
  getStorageProvider: () => ({ name: 's3', isAvailable: async () => true }),
}));
vi.mock('../../utils/virusScan', () => ({ pingClamdCached: async () => true }));

import { mountFastPathHealthEndpoints } from '../inline-endpoints';
import { setSchemaReadiness } from '../readiness-state';
import { setAnaReadiness } from '../ana-readiness-state';
import { getTenantScope } from '../../db/tenantStore';

const ENV_KEYS = ['NODE_ENV', 'READYZ_CACHE_MS', 'READYZ_TOKEN', 'CLAMAV_HOST', 'REDIS_URL', 'REDIS_TLS_URL'] as const;
let saved: Record<string, string | undefined> = {};

interface Seen {
  sql: string;
  scope: ReturnType<typeof getTenantScope>;
}
let seen: Seen[] = [];
let sessionStore: 'answers' | 'missing' = 'answers';

/** A pool that answers `select 1`, and the session table as `sessionStore` says. */
const pool = {
  query: async (sql: string) => {
    seen.push({ sql, scope: getTenantScope() });
    if (/session_activity/.test(sql) && sessionStore === 'missing') {
      throw new Error('relation "session_activity" does not exist');
    }
    return { rows: [] };
  },
} as never;

const sessionQueries = () => seen.filter((q) => /session_activity/.test(q.sql));

function appWithHealth() {
  const app = express();
  mountFastPathHealthEndpoints(app, pool);
  return app;
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ['READYZ_CACHE_MS', 'READYZ_TOKEN', 'REDIS_URL', 'REDIS_TLS_URL']) delete process.env[k];
  process.env.NODE_ENV = 'production';
  process.env.CLAMAV_HOST = '127.0.0.1';
  setSchemaReadiness('ready');
  setAnaReadiness('ready', 'test fixture: AnA provider pinned healthy');
  seen = [];
  sessionStore = 'answers';
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('/readyz and the shared session store', () => {
  it('production: a task that can read session_activity is ready, and says so', async () => {
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.sessions).toBe('ok');
  });

  it('production: a task that cannot read it is not ready, and the detail names the store and the cause', async () => {
    sessionStore = 'missing';
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.failed).toEqual(['sessions']);
    expect(res.body.dependencies).toMatchObject({ database: 'ok', sessions: 'down' });
    expect(res.body.sessionsDetail).toMatch(/session_activity/);
    expect(res.body.sessionsDetail).toMatch(/does not exist/);
  });

  it('reads the table as the session service does: organisation 0, under the system tenant scope', async () => {
    await request(appWithHealth()).get('/readyz');
    const [q] = sessionQueries();
    expect(q.sql).toMatch(/FROM session_activity WHERE organization_id = 0/);
    expect(q.scope).toMatchObject({ tenantId: '0', source: 'job', caller: 'ops:readyz:session-store' });
  });

  it('is one of the cached round trips: five hits, one read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    const app = appWithHealth();
    for (let i = 0; i < 5; i++) await request(app).get('/readyz');
    expect(sessionQueries().length).toBe(1);
    vi.setSystemTime(new Date('2026-11-11T12:00:05Z'));
    await request(app).get('/readyz');
    expect(sessionQueries().length).toBe(2);
  });

  it('the public body stays the verdict alone', async () => {
    sessionStore = 'missing';
    const app = express();
    // The peer of a supertest request is loopback; this stands in for one arriving through the ALB.
    app.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', { value: '10.10.101.17', configurable: true });
      next();
    });
    mountFastPathHealthEndpoints(app, pool);
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ready: false });
  });

  it('outside production it is skipped, and the table is not read', async () => {
    process.env.NODE_ENV = 'development';
    sessionStore = 'missing';
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.sessions).toBe('skipped');
    expect(sessionQueries()).toEqual([]);
  });
});
