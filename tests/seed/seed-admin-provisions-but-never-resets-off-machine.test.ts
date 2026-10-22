/**
 * seed-admin, off this machine, creates an account; it never resets one.
 * 2026-10-15.
 *
 * The earlier change today refused the built-in password off this machine,
 * but with ADMIN_PASSWORD set the script still ran
 * `ON CONFLICT (email) DO UPDATE` on any database: an existing account's
 * password was overwritten and its lockout, disabled status and
 * must-change-password flag cleared, unattended and with no audit record;
 * without ADMIN_EMAIL the account it wrote was the founder's; and the
 * operator's password was printed to the console. On this machine the reset
 * stays: it is the documented way back into a local development database.
 *
 * The script runs here as written, in-process, against a PGlite database the
 * test reads afterwards; the guard that runs before any connection is run as
 * a real child process.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  db: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> },
  settle: (_how: string) => {},
}));

vi.mock('pg', () => {
  class Pool {
    async query(sql: string, params?: unknown[]) {
      // Parameterless SQL may carry several statements (the workspace repair
      // migration does); pg sends those over the simple protocol, PGlite's exec.
      if (params === undefined) {
        const results = await (state.db as unknown as PGlite).exec(sql);
        const last = results[results.length - 1];
        return { rows: last?.rows ?? [], rowCount: last?.affectedRows ?? 0 };
      }
      const r = await state.db.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    }
    async end() {
      state.settle('ended');
    }
  }
  return { default: { Pool }, Pool };
});

const ROOT = path.resolve(__dirname, '../..');
const REMOTE = 'postgresql://u:p@uat-db.example.invalid:5432/c2c';
const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:5432/c2c';
const KEYS = ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME', 'ADMIN_ORG_SLUG'] as const;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  state.db = db;
  await db.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text, slug text UNIQUE, industry_mode text, tier text, status text);
    CREATE TABLE users (
      id serial PRIMARY KEY, email text UNIQUE NOT NULL, name text, password_hash text, title text, department text,
      status text, default_organization_id int, failed_login_attempts int DEFAULT 0, password_changed_at timestamptz,
      locked_until timestamptz, must_change_password boolean DEFAULT false);
    CREATE TABLE organization_users (organization_id int, user_id int, role text, PRIMARY KEY (organization_id, user_id));
    CREATE TABLE client_workspaces (
      id serial PRIMARY KEY, organization_id int NOT NULL, name text NOT NULL, slug text NOT NULL,
      description text, status text, created_by_id int, metadata json, UNIQUE (organization_id, slug));
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('TRUNCATE client_workspaces, organization_users, users, organizations RESTART IDENTITY');
});

/** Seed an account the way an operator would find it: locked, disabled, a viewer. */
async function seedExistingAccount(email: string) {
  await db.query(`INSERT INTO organizations (name, slug) VALUES ('Customer', 'customer')`);
  await db.query(
    `INSERT INTO users (email, name, password_hash, status, default_organization_id, failed_login_attempts, locked_until, must_change_password)
     VALUES ($1, 'Existing Person', 'old-hash', 'disabled', 1, 5, '2030-01-01T00:00:00Z', true)`,
    [email],
  );
  await db.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, 1, 'viewer')`);
}

async function accountRow(email: string) {
  const r = await db.query<Record<string, unknown>>(
    `SELECT password_hash, status, failed_login_attempts, locked_until IS NOT NULL AS locked, must_change_password
       FROM users WHERE email = $1`,
    [email],
  );
  return r.rows[0];
}

/** Run scripts/seed-admin.mjs as written, in this process, with only `env` set. */
async function runSeedAdmin(env: Partial<Record<(typeof KEYS)[number], string>>) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const exits: number[] = [];
  const lines: string[] = [];
  const settled = new Promise<string>((resolve) => {
    state.settle = resolve;
  });
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exits.push(code ?? 0);
    state.settle('exit');
  }) as never);
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' ')));
  const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' ')));
  try {
    vi.resetModules();
    await import('../../scripts/seed-admin.mjs');
    await settled;
  } finally {
    exit.mockRestore();
    log.mockRestore();
    err.mockRestore();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return { exits, out: lines.join('\n') };
}

describe('seed-admin against a database that is not on this machine', () => {
  it('leaves an existing account exactly as it found it, and refuses', async () => {
    await seedExistingAccount('ops@customer.example');
    const r = await runSeedAdmin({
      DATABASE_URL: REMOTE,
      ADMIN_EMAIL: 'ops@customer.example',
      ADMIN_PASSWORD: 'a-real-secret-123',
      // Off this machine the organisation is named (2026-10-15).
      ADMIN_ORG_SLUG: 'customer',
    });
    expect(await accountRow('ops@customer.example')).toEqual({
      password_hash: 'old-hash',
      status: 'disabled',
      failed_login_attempts: 5,
      locked: true,
      must_change_password: true,
    });
    const roles = await db.query<{ role: string }>(`SELECT role FROM organization_users WHERE user_id = 1`);
    expect(roles.rows.map((x) => x.role)).toEqual(['viewer']);
    expect(r.exits).toEqual([1]);
    expect(r.out).toContain('ops@customer.example already exists');
  }, 60_000);

  it('creates a new account, and does not print the password it was given', async () => {
    await db.query(`INSERT INTO organizations (name, slug) VALUES ('Customer', 'customer')`);
    const r = await runSeedAdmin({
      DATABASE_URL: REMOTE,
      ADMIN_EMAIL: 'new-admin@customer.example',
      ADMIN_PASSWORD: 'a-real-secret-123',
      ADMIN_ORG_SLUG: 'customer',
    });
    expect(r.exits).toEqual([]);
    const row = await accountRow('new-admin@customer.example');
    expect(row?.status).toBe('active');
    expect(await bcrypt.compare('a-real-secret-123', String(row?.password_hash))).toBe(true);
    expect(r.out).not.toContain('a-real-secret-123');
  }, 60_000);

  it.each([
    ['another host', { DATABASE_URL: REMOTE }],
    ['a production process', { DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/x', NODE_ENV: 'production' }],
  ])('on %s it names the account it creates: no built-in identity', (_where, env) => {
    const r = spawnSync(process.execPath, ['scripts/seed-admin.mjs'], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ADMIN_PASSWORD: 'a-real-secret-123', ...env },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(`${r.stdout}\n${r.stderr}`).toContain('name the account to create with ADMIN_EMAIL');
    expect(r.status).toBe(1);
  }, 90_000);
});

describe('seed-admin against a database on this machine', () => {
  it('still resets the built-in development account (the documented way back in)', async () => {
    await seedExistingAccount('jm.smith@concept2cure.pro');
    const r = await runSeedAdmin({ DATABASE_URL: LOCAL });
    expect(r.exits).toEqual([]);
    const row = await accountRow('jm.smith@concept2cure.pro');
    expect(row).toMatchObject({ status: 'active', failed_login_attempts: 0, locked: false, must_change_password: false });
    expect(await bcrypt.compare('pass-word', String(row?.password_hash))).toBe(true);
    expect(r.out).toContain('pass-word');
  }, 60_000);
});
