/**
 * A rate limit is the deployment's, not one task's (P-129, MR-03 Stage 7 steps 2–3; SEC-08, OPS-20).
 *
 * Production runs the API as more than one task, coordinated through Postgres
 * with no Redis (B6). The sign-in and document limits were counted in each
 * task's memory, so a client spread over two tasks got each task's allowance.
 * In production they are now counted in public.rate_limit_counters.
 *
 * Each "task" is a fresh module graph (vi.resetModules): its own copy of the
 * limiter and its memory, its own pool. All share one real PostgreSQL, as the
 * tasks share RDS, and run as the non-superuser runtime role with
 * RLS_ENFORCE=on and the table's tenant policy, using the migration's own DDL.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, type SchedulerDb } from './scheduler-harness';

vi.mock('../../server/services/ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => false, getRedisClient: () => null }));

const DDL = fs.readFileSync(path.resolve(__dirname, '../../migrations/20261112b_rate_limit_counters.sql'), 'utf8');
const AUTH_CEILING = 5;

let env: SchedulerDb;
const pools: Array<{ end(): Promise<void> }> = [];

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dbrlc', DDL, ['rate_limit_counters']);
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  for (const p of pools) await p.end().catch(() => undefined);
  if (env) await env.destroy();
});

/** A server task: a fresh limiter module, with nothing in its memory, in front of a sign-in that always fails. */
async function task() {
  vi.resetModules();
  // The pool first, outside production: production's pool requires TLS, which this
  // database does not offer. The limiters then load in production, as a task's do.
  vi.unstubAllEnvs();
  const runtime = await import('../../server/db/runtime');
  pools.push(runtime.getPool() as unknown as { end(): Promise<void> });
  vi.stubEnv('NODE_ENV', 'production');
  const [{ createRedisRateLimiter }, { signInLimits }] = await Promise.all([
    import('../../server/middleware/redisRateLimiter'),
    import('../../server/middleware/sign-in-limits'),
  ]);
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api', createRedisRateLimiter({ rules: { auth: { windowMs: 60_000, maxRequests: AUTH_CEILING, message: 'Too many authentication attempts.' } } }));
  app.post('/api/auth/login', signInLimits.login, (_req, res) => res.status(401).json({ error: 'Invalid credentials' }));
  app.post('/api/things', (_req, res) => res.json({ ok: true }));
  return app;
}

const from = (address: string) => ({ 'X-Forwarded-For': address });

describe('rate limits across server tasks, on PostgreSQL as the runtime role with RLS enforcing', () => {
  it('runs as a role that is neither a superuser nor exempt from RLS', async () => {
    const { rows } = await env.owner.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1', [env.runtimeRole]);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('a client that spends the auth bucket on task A is refused on task B', async () => {
    const a = await task();
    const b = await task();
    const address = '198.51.100.10';
    const seen: number[] = [];
    for (let i = 0; i < AUTH_CEILING; i++) {
      seen.push((await request(i % 2 === 0 ? a : b).post('/api/auth/login').set(from(address)).send({ email: `x${i}@acme.test`, password: 'guess' })).status);
    }
    expect(seen).toEqual(Array(AUTH_CEILING).fill(401));
    const next = await request(b).post('/api/auth/login').set(from(address)).send({ email: 'y@acme.test', password: 'guess' });
    expect(next.status).toBe(429);
    expect(Number(next.headers['retry-after'])).toBeGreaterThan(0);
    // Another address is untouched.
    expect((await request(a).post('/api/auth/login').set(from('198.51.100.11')).send({ email: 'z@acme.test', password: 'guess' })).status).toBe(401);
  });

  it('the per-account sign-in limit counts one account across tasks', async () => {
    const { SIGN_IN_LIMITS } = await import('../../server/config/platform-limits');
    const max = SIGN_IN_LIMITS.loginFailuresPerAccount.max;
    const a = await task();
    const b = await task();
    const statuses: number[] = [];
    // A fresh address per attempt keeps the per-address bucket out of it: only the account is counted.
    for (let i = 0; i <= max; i++) {
      statuses.push((await request(i % 2 === 0 ? a : b).post('/api/auth/login').set(from(`203.0.113.${i + 1}`)).send({ email: 'Target@Acme.test', password: 'guess' })).status);
    }
    expect(statuses.slice(0, max).every((s) => s === 401), JSON.stringify(statuses)).toBe(true);
    expect(statuses[max]).toBe(429);
  });

  it('the rows are the estate’s: organization 0, and no tenant scope reads them', async () => {
    const { rows } = await env.owner.query(`SELECT DISTINCT organization_id FROM ${env.t('rate_limit_counters')}`);
    expect(rows).toEqual([{ organization_id: 0 }]);
    const runtime = await import('../../server/db/runtime');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const seen = await runWithTenantScope({ tenantId: '7', role: null, source: 'request', caller: 'test:tenant-read' }, () =>
      runtime.getPool().query('SELECT count(*)::int AS n FROM rate_limit_counters'));
    expect(seen.rows[0].n).toBe(0);
  });

  it('a store that cannot be read refuses the sign-in category rather than counting per task', async () => {
    const a = await task();
    await env.owner.query(`REVOKE INSERT, UPDATE ON ${env.t('rate_limit_counters')} FROM ${env.runtimeRole}`);
    try {
      const res = await request(a).post('/api/auth/login').set(from('198.51.100.99')).send({ email: 'w@acme.test', password: 'guess' });
      expect(res.status).toBe(503);
      // A category outside the shared set is not affected.
      expect((await request(a).post('/api/things').set(from('198.51.100.99'))).status).toBe(200);
    } finally {
      await env.owner.query(`GRANT INSERT, UPDATE ON ${env.t('rate_limit_counters')} TO ${env.runtimeRole}`);
    }
  });
});
