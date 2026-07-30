/**
 * Schema contract: the artifacts migration is safe against all three states the
 * name can be in.
 *
 * Two shipped paths address `artifacts` — a fire-and-forget INSERT in
 * server/routes/chat-actions.ts and the "Recent artifacts" read in
 * server/routes/workspace-summary.ts — and NOTHING in this repository creates it.
 * But the databases disagree about what that means:
 *
 *   • A freshly provisioned database has no `artifacts` at all, so every INSERT
 *     failed "relation does not exist" into a swallowed catch.
 *   • Long-lived databases have a VIEW of that name, applied out-of-band and
 *     never committed. It is invisible to the repo and cannot be rebuilt.
 *
 * The first revision of the migration assumed absence. On a database with the
 * view, `CREATE TABLE IF NOT EXISTS` silently no-opped (the name was taken) and
 * the follow-on `CREATE INDEX` died with "cannot create index on relation
 * artifacts / This operation is not supported for views" — caught by the Neon
 * preview job, which is the only gate that runs against a production-shaped
 * schema.
 *
 * These tests execute the REAL migration file against a real Postgres in each
 * state. They are not source greps: a source grep would have happily confirmed
 * the broken version, because the bug was in what the SQL did, not in what it
 * said.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(REPO_ROOT, 'db/migrations/20260728_artifacts_table.sql');
const sql = () => fs.readFileSync(MIGRATION, 'utf8');

let pg: PGlite;
beforeEach(async () => {
  pg = new PGlite();
});
afterEach(async () => {
  await pg?.close();
});

const relkind = async () => {
  const r = await pg.query<{ relkind: string }>(
    `SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'artifacts'`
  );
  return r.rows[0]?.relkind ?? null;
};
const countIndexes = async () => {
  const r = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'artifacts'`
  );
  return Number(r.rows[0]?.n ?? 0);
};
const countPolicies = async () => {
  const r = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'artifacts'`
  );
  return Number(r.rows[0]?.n ?? 0);
};

describe('artifacts migration — name is free', () => {
  it('creates the table, its index and its tenant policy', async () => {
    await pg.exec(sql());
    expect(await relkind()).toBe('r');
    expect(await countIndexes()).toBeGreaterThanOrEqual(2); // PK + org/created
    expect(await countPolicies()).toBe(1);
  }, 60_000);

  it('accepts the writer\'s exact statement, including its ON CONFLICT', async () => {
    await pg.exec(sql());
    const ins = `INSERT INTO artifacts (id, org_id, project_id, type, title, status, payload, created_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT (id) DO NOTHING`;
    const args = ['val-1', 7, null, 'validation_report', 'V', 'queued', '{}', '42'];
    await pg.query(ins, args);
    await pg.query(ins, args); // the idempotency the fire-and-forget writer relies on
    const r = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM artifacts`);
    expect(Number(r.rows[0].n)).toBe(1);
  }, 60_000);

  it('serves the reader\'s exact query', async () => {
    await pg.exec(sql());
    await pg.query(
      `INSERT INTO artifacts (id, org_id, type, title, status, payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      ['val-2', 7, 'outline', 'T', 'generated', '{}']
    );
    const r = await pg.query(
      `SELECT id, type, title, status, project_id, created_at FROM artifacts
        WHERE org_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [7]
    );
    expect(r.rows).toHaveLength(1);
  }, 60_000);
});

describe('artifacts migration — already a real table', () => {
  it('re-runs without error and leaves exactly one policy', async () => {
    await pg.exec(sql());
    await pg.exec(sql());
    expect(await relkind()).toBe('r');
    expect(await countPolicies()).toBe(1);
  }, 60_000);
});

describe('artifacts migration — a VIEW already owns the name', () => {
  // This is the state that broke CI. Indexes and RLS policies are not supported
  // on views, so the migration must recognise the relkind and stop rather than
  // barrelling into DDL Postgres will reject.
  const seedView = async () => {
    await pg.exec(`CREATE TABLE src (id text, org_id int, created_at timestamptz DEFAULT now());`);
    await pg.exec(`CREATE VIEW artifacts AS SELECT id, org_id, created_at FROM src;`);
  };

  it('completes without error instead of failing the deploy', async () => {
    await seedView();
    await expect(pg.exec(sql())).resolves.toBeDefined();
  }, 60_000);

  it('leaves the view completely untouched', async () => {
    await seedView();
    await pg.exec(sql());
    // Still a view — not replaced, not dropped, not converted.
    expect(await relkind()).toBe('v');
    // And no DDL was attempted against it.
    expect(await countIndexes()).toBe(0);
    expect(await countPolicies()).toBe(0);
  }, 60_000);

  it('is re-runnable in that state too', async () => {
    await seedView();
    await pg.exec(sql());
    await expect(pg.exec(sql())).resolves.toBeDefined();
    expect(await relkind()).toBe('v');
  }, 60_000);
});
