/**
 * The Module 3 signed section snapshots and provenance trail are append-only in
 * the database (GA security review 2026-10-05, DP-84; rows D2, D5, D6).
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * cmc_module3_section_versions holds the snapshot a section approval signs, and
 * cmc_provenance_events records who compiled, approved, placed, linked and
 * resolved what. Neither carried a trigger, and the runtime role held UPDATE
 * and DELETE on both: as app_service, under RLS, in its own tenant, a signed
 * snapshot and a provenance event were rewritten and deleted (UPDATE 1, DELETE
 * 1 each — docs/evidence/CMC-M3-GA/2026-10-05/19-module3-history-append-only/
 * red-runtime-role-before.txt).
 *
 * migrations/20261005c_cmc_module3_history_append_only.sql installs a row
 * trigger (UPDATE, DELETE) and a statement trigger (TRUNCATE) on each, reusing
 * public.domain_history_append_only(). No code path updates or deletes either
 * (census in the file's header), so nothing is admitted.
 *
 * ── How it runs ──────────────────────────────────────────────────────────────
 * As domain-history-append-only.dbtest.ts: writes and refused mutations go
 * through the application's own pool (APP_DATABASE_URL, app_service) inside a
 * request's tenant scope, with RLS on; TRUNCATE and the parent-section delete
 * run as the owner in a transaction that is always rolled back. The migration
 * is applied here (it is idempotent). Every row carries this file's probe
 * organisation, and the cleanup touches nothing else.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const ROOT = path.join(__dirname, '..', '..');
const MIGRATION = 'migrations/20261005c_cmc_module3_history_append_only.sql';
const PREREQ = 'migrations/20261001_domain_history_append_only.sql';
const TAG = 'dbtest-dp84';
const CALLER = 'tests/db/cmc-module3-history-append-only.dbtest.ts';
const PROJECT = `${TAG}-program`;

const STORES = ['cmc_module3_section_versions', 'cmc_provenance_events'] as const;
type Store = (typeof STORES)[number];

let owner: Pool;
let org: number;
let orgUuid: string;
let seq = 0;

type Outcome =
  | { ok: true; rowCount: number; rows: Array<Record<string, unknown>> }
  | { ok: false; message: string };

/** One statement as the runtime role, in the probe tenant's request scope. COMMITs only when `commit`. */
async function asRuntime(sql: string, params: unknown[] = [], commit = false): Promise<Outcome> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const scope = { tenantId: String(org), orgUuid, role: 'admin', source: 'request' as const, caller: CALLER };
  return runWithTenantScope(scope, async (): Promise<Outcome> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(sql, params);
      await client.query(commit ? 'COMMIT' : 'ROLLBACK');
      return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      client.release();
    }
  });
}

/** One statement as the owner, in a transaction that is ALWAYS rolled back. */
async function asOwnerRolledBack(sql: string, params: unknown[] = []): Promise<Outcome> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '10s'`);
    const r = await client.query(sql, params);
    return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

/** The trigger's refusal, or — for the runtime role under the grant ceiling — its missing privilege. */
const refused = (r: Outcome) => {
  expect(r.ok ? `applied (${r.rowCount} row(s))` : r.message, 'the change was applied').toMatch(
    /IMMUTABILITY_VIOLATION|permission denied for table/,
  );
};

/** A compiled section to hang a version on, owner-inserted. */
async function makeSection(): Promise<string> {
  const { rows } = await owner.query(
    `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, compiled_hash)
     VALUES ($1, $2, $3, '3.2.S.1', '{}'::jsonb, 'h') RETURNING id`,
    [org, PROJECT, `3.2.S.1.${process.pid}.${++seq}`],
  );
  return String(rows[0].id);
}

/** Append one row through the legitimate path — an INSERT as the runtime role, committed. */
async function append(store: Store, sectionId?: string): Promise<string> {
  const n = `${process.pid}-${++seq}`;
  const statements: Record<Store, [string, unknown[]]> = {
    cmc_module3_section_versions: [
      `INSERT INTO cmc_module3_section_versions (organization_id, section_id, project_id, version_number, snapshot_json, state, created_by)
       VALUES ($1, $2, $3, 1, '{"signed":true}'::jsonb, 'approved', $4) RETURNING id`,
      [org, sectionId, PROJECT, `${TAG}-${n}`],
    ],
    cmc_provenance_events: [
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1, $2, 'section', $3, 'approved', '{}'::jsonb, $4) RETURNING id`,
      [org, PROJECT, `${TAG}-${n}`, `${TAG}-${n}`],
    ],
  };
  const [sql, params] = statements[store];
  const r = await asRuntime(sql, params, true);
  if (!r.ok) throw new Error(`[${TAG}] the legitimate INSERT into ${store} was refused: ${r.message}`);
  expect(r.rowCount).toBe(1);
  return `id = '${String(r.rows[0].id)}'`;
}

const REWRITE: Record<Store, string> = {
  cmc_module3_section_versions: `snapshot_json = '{"rewritten":true}'::jsonb`,
  cmc_provenance_events: `created_by = 'someone-else'`,
};

/** Remove this file's rows, as the owner, with the guards off for this transaction only. */
async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    const { rows: guards } = await client.query<{ rel: string; tgname: string }>(
      `SELECT c.relname AS rel, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[])
          AND t.tgname = 'trg_' || c.relname || '_append_only'`,
      [STORES],
    );
    for (const g of guards) await client.query(`ALTER TABLE public.${g.rel} DISABLE TRIGGER ${g.tgname}`);
    await client.query('DELETE FROM cmc_module3_section_versions WHERE organization_id = $1', [org]);
    await client.query('DELETE FROM cmc_provenance_events WHERE organization_id = $1', [org]);
    for (const g of guards) await client.query(`ALTER TABLE public.${g.rel} ENABLE TRIGGER ${g.tgname}`);
    await client.query('DELETE FROM cmc_module3_sections WHERE organization_id = $1', [org]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(fs.readFileSync(path.join(ROOT, PREREQ), 'utf8'));
  await owner.query(fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8'));
  const o = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $1)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [TAG],
  );
  org = Number(o.rows[0].id);
  orgUuid = String(o.rows[0].uuid);
  await cleanup();
}, 60_000);

afterAll(async () => {
  if (owner && org) {
    await cleanup();
    await owner.query('DELETE FROM organizations WHERE id = $1', [org]);
  }
  await owner?.end();
});

describe('the probe runs as the runtime role, under RLS', () => {
  it('is app_service-shaped: not the owner, not a superuser, no BYPASSRLS, RLS enforced', async () => {
    const r = await asRuntime(
      `SELECT current_user AS who, r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce', true) AS rls
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    if (!r.ok) throw new Error(r.message);
    const ownerRole = (await owner.query('SELECT current_user AS who')).rows[0].who;
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false, rls: 'on' });
    expect(r.rows[0].who).not.toBe(ownerRole);
  });
});

describe.each(STORES)('%s (DP-84)', (store) => {
  const parent = async () => (store === 'cmc_module3_section_versions' ? makeSection() : undefined);

  it('accepts an INSERT from the runtime role — the one path every writer uses', async () => {
    const where = await append(store, await parent());
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM ${store} WHERE ${where}`);
    expect(rows[0].n).toBe(1);
  });

  it('refuses an UPDATE from the runtime role', async () => {
    const where = await append(store, await parent());
    refused(await asRuntime(`UPDATE ${store} SET ${REWRITE[store]} WHERE ${where}`));
  });

  it('refuses a DELETE from the runtime role', async () => {
    const where = await append(store, await parent());
    refused(await asRuntime(`DELETE FROM ${store} WHERE ${where}`));
  });

  it('refuses an UPDATE and a DELETE even by the owner', async () => {
    const where = await append(store, await parent());
    refused(await asOwnerRolledBack(`UPDATE ${store} SET ${REWRITE[store]} WHERE ${where}`));
    refused(await asOwnerRolledBack(`DELETE FROM ${store} WHERE ${where}`));
  });

  it('refuses a TRUNCATE, even by the owner', async () => {
    refused(await asOwnerRolledBack(`TRUNCATE ${store}`));
  });

  it('is installed under its own names, enabled', async () => {
    const { rows } = await owner.query(
      `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal ORDER BY tgname`,
      [`public.${store}`],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { tgname: `trg_${store}_append_only`, tgenabled: 'O' },
        { tgname: `trg_${store}_no_truncate`, tgenabled: 'O' },
      ]),
    );
  });
});

describe('a section cannot take its signed snapshots with it', () => {
  it('deleting a section that has a signed version is refused (the ON DELETE CASCADE meets the trigger)', async () => {
    const section = await makeSection();
    await append('cmc_module3_section_versions', section);
    refused(await asOwnerRolledBack('DELETE FROM cmc_module3_sections WHERE id = $1', [section]));
  });

  it('a section with no signed version can still be deleted', async () => {
    const section = await makeSection();
    const r = await asOwnerRolledBack('DELETE FROM cmc_module3_sections WHERE id = $1', [section]);
    expect(r.ok && r.rowCount).toBe(1);
  });
});

describe('the migration replays (CLAUDE.md Rule 1)', () => {
  it('applies twice with no error and leaves one trigger of each name', async () => {
    await owner.query(fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8'));
    await owner.query(fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8'));
    const { rows } = await owner.query(
      `SELECT tgname, count(*)::int AS n FROM pg_trigger
        WHERE tgrelid IN ('public.cmc_module3_section_versions'::regclass, 'public.cmc_provenance_events'::regclass)
          AND NOT tgisinternal GROUP BY tgname ORDER BY tgname`,
    );
    expect(rows.map((r) => r.n)).toEqual(rows.map(() => 1));
    expect(rows).toHaveLength(4);
  });
});
