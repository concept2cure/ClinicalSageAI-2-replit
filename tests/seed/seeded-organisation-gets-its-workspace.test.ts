/**
 * An organisation a seed script writes can create a program. HT-01, 2026-10-18.
 *
 * On a database provisioned from empty, the documented local setup
 * (docs/LOCAL_TESTING.md: db:provision, then seed-admin) left the seeded
 * organisation with no client workspace, so every "create program" answered
 * NO_CLIENT_WORKSPACE until deploy-migrate ran again and its repair sweep
 * (migrations/20260923_organization_default_client_workspace.sql) caught up.
 * Observed at aa4ee1e29 (docs/evidence/reviews/2026-10-13-market-readiness/
 * smoke-at-head.md). The application's creators call
 * ensureOrganizationDefaultWorkspace; these scripts write organisations in raw
 * SQL and now execute that same sweep (scripts/seed/organization-workspace.mjs).
 *
 * The scripts run here as written, in-process, against a PGlite database
 * carrying the real repair migration; the test reads the database afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  settle: (_how: string) => {},
}));

vi.mock('pg', () => {
  class Pool {
    async query(sql: string, params?: unknown[]) {
      // A query with no parameters may carry several statements (the repair
      // migration does); pg sends those over the simple protocol, PGlite's exec.
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
const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:5432/c2c';
const KEYS = [
  'DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'NODE_ENV',
  'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME', 'FOUNDER_EMAIL', 'FOUNDER_PASSWORD',
] as const;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  state.db = db;
  await db.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text NOT NULL, slug text UNIQUE NOT NULL, industry_mode text, tier text, status text);
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

/** Run a seed script as written, in this process, with only `env` set. */
async function runScript(script: string, env: Partial<Record<(typeof KEYS)[number], string>>) {
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
    await import(path.join(ROOT, script));
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

async function workspacesOf(slug: string) {
  const r = await db.query<{ name: string; slug: string; status: string; created_by_id: number | null; metadata: unknown }>(
    `SELECT w.name, w.slug, w.status, w.created_by_id, w.metadata
       FROM client_workspaces w JOIN organizations o ON o.id = w.organization_id
      WHERE o.slug = $1 ORDER BY w.id`,
    [slug],
  );
  return r.rows;
}

const OWN_WORKSPACE = {
  name: 'Concept2Cure Therapeutics',
  slug: 'concept2cure',
  status: 'active',
  created_by_id: null,
  metadata: { defaultForOrganization: true },
};

describe('a seeded organisation has its own workspace, so a program can be created', () => {
  it('seed-admin: the organisation it writes gets the marked workspace the anchor prefers', async () => {
    const { exits, out } = await runScript('scripts/seed-admin.mjs', {
      DATABASE_URL: LOCAL, ADMIN_EMAIL: 'tester@example.com', ADMIN_PASSWORD: 'a-local-password',
    });
    expect(exits, out).toEqual([]);
    expect(await workspacesOf('concept2cure')).toEqual([OWN_WORKSPACE]);
  });

  it('seed-founder: the same', async () => {
    const { exits, out } = await runScript('scripts/seed-founder.mjs', {
      DATABASE_URL: LOCAL, FOUNDER_EMAIL: 'founder@example.com', FOUNDER_PASSWORD: 'a-long-founder-password',
    });
    expect(exits, out).toEqual([]);
    expect(await workspacesOf('concept2cure')).toEqual([OWN_WORKSPACE]);
  });

  it('never gives an organisation that already has a workspace a second one', async () => {
    // A CRO that made a client workspace for its customer before the seed ran:
    // a second row would turn the anchor's unambiguous case into AMBIGUOUS.
    await db.query(`INSERT INTO organizations (name, slug) VALUES ('Concept2Cure Therapeutics', 'concept2cure')`);
    await db.query(`INSERT INTO client_workspaces (organization_id, name, slug, status) VALUES (1, 'Acme Bio', 'acme-bio', 'active')`);

    const { exits, out } = await runScript('scripts/seed-admin.mjs', {
      DATABASE_URL: LOCAL, ADMIN_EMAIL: 'tester@example.com', ADMIN_PASSWORD: 'a-local-password',
    });
    expect(exits, out).toEqual([]);
    expect((await workspacesOf('concept2cure')).map((w) => w.slug)).toEqual(['acme-bio']);
  });
});

describe('one writer: no seed script inserts a workspace of its own', () => {
  // The rule — only where an organisation has none, marked as its own — lives
  // in the repair migration and, for the application, in
  // ensureOrganizationDefaultWorkspace. A script that INSERTs its own row is
  // the parallel path that wrote unmarked "Default Workspace" rows before.
  const scripts = [
    'scripts/seed-admin.mjs',
    'scripts/seed-founder.mjs',
    'scripts/seed-ga-demo.mjs',
    ...fs.readdirSync(path.join(ROOT, 'scripts/seed/ga-demo.d')).map((f) => `scripts/seed/ga-demo.d/${f}`),
  ];
  it.each(scripts)('%s', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(src).not.toMatch(/INSERT\s+INTO\s+client_workspaces/i);
  });
});
