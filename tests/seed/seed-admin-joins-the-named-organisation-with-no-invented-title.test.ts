/**
 * seed-admin attaches the account it creates to the organisation the operator
 * names, and records no title nobody stated. 2026-10-15.
 *
 * Off this machine it created an organisation 'concept2cure' ("Concept2Cure
 * Therapeutics", tier enterprise) on the target stack and made the new
 * administrator a member of that instead of the stack's own; every account it
 * created was titled "Chief Science Officer", department "Executive
 * Leadership"; and an account the operator named but gave no ADMIN_NAME was
 * named "JM Smith", a real person. Now ADMIN_ORG_SLUG names an existing
 * organisation (required off this machine; on it the development organisation
 * stays the default), title and department are left unrecorded, and an
 * unnamed holder is shown by the address the operator gave.
 *
 * The script runs here as written, in-process, against a PGlite database the
 * test reads afterwards; the guard that runs before any connection is run as
 * a real child process.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  db: null as unknown as {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
    exec: (sql: string) => Promise<Array<{ rows: unknown[]; affectedRows?: number }>>;
  },
  settle: (_how: string) => {},
}));

vi.mock('pg', () => {
  class Pool {
    async query(sql: string, params?: unknown[]) {
      // A query with no parameters may carry several statements (seed-admin runs
      // the workspace repair migration through ensureOrganizationWorkspace); pg
      // sends those over the simple protocol, which is PGlite's exec.
      if (params === undefined) {
        const results = await state.db.exec(sql);
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
const KEYS = [
  'DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME', 'ADMIN_ORG_SLUG',
] as const;

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
      id serial PRIMARY KEY, organization_id int NOT NULL REFERENCES organizations(id), name text NOT NULL,
      slug text NOT NULL, description text, status text, created_by_id int, metadata json,
      CONSTRAINT unique_org_slug UNIQUE (organization_id, slug));
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('TRUNCATE client_workspaces, organization_users, users, organizations RESTART IDENTITY');
});

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

/** The account as the product would show it: name, title, department, home organisation and memberships. */
async function account(email: string) {
  const r = await db.query<Record<string, unknown>>(
    `SELECT u.name, u.title, u.department, o.slug AS home,
            (SELECT array_agg(m.slug ORDER BY m.slug) FROM organization_users ou
               JOIN organizations m ON m.id = ou.organization_id WHERE ou.user_id = u.id) AS memberships
       FROM users u LEFT JOIN organizations o ON o.id = u.default_organization_id
      WHERE u.email = $1`,
    [email],
  );
  return r.rows;
}

/** The client workspaces as organisation slug and workspace slug: the one seed-admin's repair sweep gives the organisation. */
const workspaces = async () =>
  (
    await db.query<{ org: string; slug: string }>(
      `SELECT o.slug AS org, w.slug FROM client_workspaces w JOIN organizations o ON o.id = w.organization_id ORDER BY o.slug, w.slug`,
    )
  ).rows;

const slugs = async () => (await db.query<{ slug: string }>(`SELECT slug FROM organizations ORDER BY slug`)).rows.map((r) => r.slug);

describe('seed-admin against a database that is not on this machine', () => {
  it('joins the organisation ADMIN_ORG_SLUG names, creates none, and records no title', async () => {
    await db.query(`INSERT INTO organizations (name, slug) VALUES ('Customer Bio', 'customer-bio')`);
    const r = await runSeedAdmin({
      DATABASE_URL: REMOTE,
      ADMIN_EMAIL: 'admin@customer.example',
      ADMIN_PASSWORD: 'a-real-secret-123',
      ADMIN_ORG_SLUG: 'customer-bio',
    });
    expect(r.exits).toEqual([]);
    expect(await account('admin@customer.example')).toEqual([
      {
        name: 'admin@customer.example',
        title: null,
        department: null,
        home: 'customer-bio',
        memberships: ['customer-bio'],
      },
    ]);
    expect(await slugs()).toEqual(['customer-bio']);
    expect(await workspaces()).toEqual([{ org: 'customer-bio', slug: 'customer-bio' }]);
  }, 60_000);

  it('refuses an organisation that is not there, and writes nothing', async () => {
    const r = await runSeedAdmin({
      DATABASE_URL: REMOTE,
      ADMIN_EMAIL: 'admin@customer.example',
      ADMIN_PASSWORD: 'a-real-secret-123',
      ADMIN_ORG_SLUG: 'no-such-org',
    });
    expect(r.exits).toEqual([1]);
    expect(r.out).toContain('no organisation with slug "no-such-org"');
    expect(await account('admin@customer.example')).toEqual([]);
    expect(await slugs()).toEqual([]);
    expect(await workspaces()).toEqual([]);
  }, 60_000);

  it('with no ADMIN_ORG_SLUG, refuses before connecting: no built-in organisation', () => {
    const r = spawnSync(process.execPath, ['scripts/seed-admin.mjs'], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DATABASE_URL: REMOTE,
        ADMIN_EMAIL: 'admin@customer.example',
        ADMIN_PASSWORD: 'a-real-secret-123',
      },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(`${r.stdout}\n${r.stderr}`).toContain('name the organisation the account joins with ADMIN_ORG_SLUG');
    expect(r.status).toBe(1);
  }, 90_000);
});

describe('seed-admin against a database on this machine', () => {
  it('keeps the development organisation as the default, and records no title', async () => {
    const r = await runSeedAdmin({ DATABASE_URL: LOCAL });
    expect(r.exits).toEqual([]);
    expect(await account('jm.smith@concept2cure.pro')).toEqual([
      { name: 'JM Smith', title: null, department: null, home: 'concept2cure', memberships: ['concept2cure'] },
    ]);
    expect(await workspaces()).toEqual([{ org: 'concept2cure', slug: 'concept2cure' }]);
  }, 60_000);
});
