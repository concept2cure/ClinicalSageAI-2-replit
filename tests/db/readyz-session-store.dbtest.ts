/**
 * /readyz's session-store read, against a real PostgreSQL (MR-03 Stage 7 step 4, SEC-08).
 *
 * The unit suite (server/startup/__tests__/readyz-session-store.test.ts) shows
 * the verdict with a stub pool. This shows the read itself, in production's
 * shape: the non-superuser runtime role, RLS_ENFORCE=on, the table's tenant
 * policy, the migration's own DDL. It answers three things a stub cannot:
 *   - the read passes on a provisioned database, so the check does not turn a
 *     healthy deployment unready;
 *   - a database without the table is reported down, by name;
 *   - so is a runtime role that cannot read it.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, type SchedulerDb } from './scheduler-harness';

const DDL = fs.readFileSync(path.resolve(__dirname, '../../migrations/20261001e_session_activity.sql'), 'utf8');

let env: SchedulerDb;
let pool: Pool;
let probeSessionStore: typeof import('../../server/startup/readyz').probeSessionStore;
let savedNodeEnv: string | undefined;

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dbrdyz', DDL, ['session_activity']);
  // After the harness: the runtime pool is built at import from the environment it sets.
  pool = (await import('../../server/db/runtime')).getPool() as unknown as Pool;
  ({ probeSessionStore } = await import('../../server/startup/readyz'));
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  if (env) await env.destroy();
});

beforeEach(() => {
  savedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
});
afterEach(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});

describe("/readyz's session-store read, as the runtime role with RLS enforcing", () => {
  it('runs as a role that is neither a superuser nor exempt from RLS', async () => {
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const { rows } = await runWithSystemTenantScope('test:readyz-session-store:role', () =>
      pool.query('SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'),
    );
    expect(rows[0]).toMatchObject({ role: env.runtimeRole, rolsuper: false, rolbypassrls: false });
  });

  it('a provisioned database: the store answers', async () => {
    expect(await probeSessionStore(pool)).toEqual({ status: 'ok' });
  });

  it('a database without the table: down, and the detail says which table', async () => {
    await env.owner.query(`ALTER TABLE ${env.t('session_activity')} RENAME TO session_activity_absent`);
    try {
      const verdict = await probeSessionStore(pool);
      expect(verdict.status).toBe('down');
      expect(verdict.detail).toMatch(/session_activity could not be read/);
      expect(verdict.detail).toMatch(/does not exist/);
    } finally {
      await env.owner.query(`ALTER TABLE ${env.t('session_activity_absent')} RENAME TO session_activity`);
    }
    expect(await probeSessionStore(pool)).toEqual({ status: 'ok' });
  });

  it('a runtime role that cannot read the table: down', async () => {
    await env.owner.query(`REVOKE SELECT ON ${env.t('session_activity')} FROM ${env.runtimeRole}`);
    try {
      const verdict = await probeSessionStore(pool);
      expect(verdict.status).toBe('down');
      expect(verdict.detail).toMatch(/permission denied/);
    } finally {
      await env.owner.query(`GRANT SELECT ON ${env.t('session_activity')} TO ${env.runtimeRole}`);
    }
    expect(await probeSessionStore(pool)).toEqual({ status: 'ok' });
  });

  it('outside production it is skipped, and nothing is read', async () => {
    process.env.NODE_ENV = 'test';
    await env.owner.query(`ALTER TABLE ${env.t('session_activity')} RENAME TO session_activity_absent`);
    try {
      expect(await probeSessionStore(pool)).toEqual({ status: 'skipped' });
    } finally {
      await env.owner.query(`ALTER TABLE ${env.t('session_activity_absent')} RENAME TO session_activity`);
    }
  });
});
