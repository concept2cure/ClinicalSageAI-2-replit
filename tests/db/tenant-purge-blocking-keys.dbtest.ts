/**
 * A tenant purge gets to the end: no key with no delete action stops it, it
 * takes none of another tenant's rows, and the export it relies on returns
 * every row it then erases and none of another tenant's (D6, 2026-10-29;
 * docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/).
 *
 * The purge deletes PURGE_CHILD_TABLES in order in one transaction. On the
 * install-fresh + deploy-migrate schema, 105 foreign keys with no delete action
 * pointed from tables it never deleted (or deleted later) into projects,
 * client_workspaces, documents and regulatory_programs. One such row and the
 * referenced DELETE failed with 23503 and the whole erasure rolled back.
 * ci:purge-coverage now walks the list as a sequence; this suite runs it.
 *
 * From the catalog, every table that names a row the purge deletes through a
 * key with no delete action (or SET NULL on a NOT NULL column) gets one row for
 * tenant A and one for tenant B, each naming its own tenant's parents through
 * every such key (tenant-purge-row-seeder.ts). Then:
 *   - A's export, run the way the route runs it (A's scope, RLS enforced) and
 *     as the owner (no RLS, so only the predicate decides), holds each of A's
 *     rows the purge will erase and none of B's, table by table;
 *   - the purge of A, run the way the route runs it, succeeds;
 *   - every one of A's rows in a table the purge erases is gone, and every one
 *     of B's rows is still there, table by table.
 * A wrong PURGE_PARENT_SCOPED predicate fails the last two either way: too
 * narrow keeps A's row (and the export misses it), too wide takes B's.
 *
 * The tables the purge does not erase (PURGE_REFERRERS_NOT_ERASED,
 * PURGE_RETAINED_RECORDS) are seeded one at a time for tenant C instead: the
 * purge of C is refused or aborts, rolls back, and C's project is still there.
 * That is today's behaviour, pinned until the founder decides their retention.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import * as offboarding from '../../server/services/tenant/tenant-offboarding';
import { exportTenantFull } from '../../server/services/tenant-export/tenant-full-export.service';
import { companyExportSnapshot } from '../../server/services/tenant-export/company-export-snapshot';
import { EXPORT_DERIVED_TABLES } from '../../server/services/tenant/purge-parent-scope';
import { TenantRowSeeder, qualified, removeSeeded, stillThere, type SeededRow } from './tenant-purge-row-seeder';

const { purgeTenant, PURGE_CHILD_TABLES, PURGE_PARENT_SCOPED, PURGE_RETAINED_RECORDS } = offboarding;
const NOT_ERASED: Readonly<Record<string, string>> =
  (offboarding as { PURGE_REFERRERS_NOT_ERASED?: Readonly<Record<string, string>> }).PURGE_REFERRERS_NOT_ERASED ?? {};

const A = 90861;
const B = 90862;
const C = 90863;
const TAG = `pbk_${process.pid}_${Date.now().toString(36)}`;
const CALLER = 'tests/db/tenant-purge-blocking-keys.dbtest.ts';
/** RLS enabled, no policy: deny-all to every application role (see the export case). */
const DENY_ALL = ['public.csr_endpoint_results', 'public.ctd_module_sections', 'public.ctd_documents'];

/** Every table the purge deletes: each listed table, and what ON DELETE CASCADE reaches from it. */
const PURGED_SQL = `
WITH RECURSIVE purged(oid) AS (
  SELECT to_regclass(t)::oid FROM unnest($1::text[]) t WHERE to_regclass(t) IS NOT NULL
  UNION
  SELECT con.conrelid FROM purged JOIN pg_constraint con
      ON con.confrelid = purged.oid AND con.contype = 'f' AND con.confdeltype = 'c'
)
SELECT n.nspname || '.' || c.relname AS t
  FROM purged JOIN pg_class c ON c.oid = purged.oid JOIN pg_namespace n ON n.oid = c.relnamespace`;

/** Every table holding a key with no delete action (or SET NULL on NOT NULL) into one of them. */
const REFERRERS_SQL = `
SELECT DISTINCT cn.nspname || '.' || c.relname AS t
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace cn ON cn.oid = c.relnamespace
  JOIN pg_class p ON p.oid = con.confrelid JOIN pg_namespace pn ON pn.oid = p.relnamespace
 WHERE con.contype = 'f' AND con.conrelid <> con.confrelid
   AND pn.nspname || '.' || p.relname = ANY ($1::text[])
   AND (con.confdeltype IN ('a', 'r')
        OR (con.confdeltype IN ('n', 'd') AND EXISTS (
              SELECT 1 FROM unnest(COALESCE(con.confdelsetcols, con.conkey)) k(n)
                JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n WHERE a.attnotnull)))
 ORDER BY 1`;

let owner: Pool;
let purged: Set<string>;
let referrers: string[];
let held: string[];
const users = new Map<number, number>();
const seeders = new Map<number, TenantRowSeeder>();
const reference = new Map<string, Record<string, unknown>>();
const unseedable: string[] = [];
const allRows: SeededRow[] = [];

const isHeld = (t: string) => {
  const bare = t.replace(/^public\./, '');
  return Object.prototype.hasOwnProperty.call(NOT_ERASED, bare)
    || Object.prototype.hasOwnProperty.call(PURGE_RETAINED_RECORDS, bare);
};
const keyOf = (row: Record<string, unknown>, cols: string[]) => JSON.stringify(cols.map((c) => String(row[c])));
const label = (t: string) => t.replace(/^public\./, '');

async function readyForPurge(org: number): Promise<void> {
  await owner.query(
    `UPDATE organizations SET status = 'pending_deletion', purged_at = NULL, deletion_requested_at = now() - interval '40 days',
       purge_eligible_at = now() - interval '1 day' WHERE id = $1`, [org]);
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [org]);
  await owner.query(
    `INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by) VALUES ($1, $2, 1, 1, NULL)`,
    [org, `${TAG}-${org}`]);
}

/** The purge as the route runs it: the runtime pool, in the platform scope. */
async function purge(org: number) {
  const { pool: runtime } = await import('../../server/db');
  const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
  return runWithSystemTenantScope(CALLER, () => purgeTenant(runtime, {
    organizationId: org, purgedByUserId: users.get(org)!, preconditions: { finalExportDigest: `${TAG}-${org}` },
  }));
}

/** label → keys of the exported rows, for the tables whose seeded rows have a primary key. */
async function exportedKeys(read: () => Promise<Awaited<ReturnType<typeof exportTenantFull>>>, keyCols: Map<string, string[]>) {
  const out = await read();
  expect(out.coverage.tablesFailed).toEqual([]);
  const keys = new Map<string, Set<string>>();
  for (const t of out.tables) {
    const cols = keyCols.get(qualified(t.table));
    if (cols) keys.set(qualified(t.table), new Set(t.rows.map((r) => keyOf(r, cols))));
  }
  return keys;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  for (const org of [A, B, C]) {
    await owner.query(`INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')`, [org, `${TAG}-${org}`]);
    const u = await owner.query(
      `INSERT INTO users (email, name, password_hash, default_organization_id) VALUES ($1, 'Purge Fixture', 'x', $2) RETURNING id`,
      [`${TAG}-${org}@example.invalid`, org]);
    users.set(org, Number(u.rows[0].id));
    await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [org, users.get(org)]);
  }
  const listed = [...new Set([...PURGE_CHILD_TABLES, ...Object.keys(PURGE_PARENT_SCOPED)])].map(qualified);
  purged = new Set((await owner.query<{ t: string }>(PURGED_SQL, [listed])).rows.map((r) => r.t));
  const all = (await owner.query<{ t: string }>(REFERRERS_SQL, [[...purged]])).rows.map((r) => r.t);
  held = all.filter(isHeld);
  // And every table the shared predicate map scopes, so each predicate is run
  // against two tenants' rows (the purge's and the export's).
  const scopedHere = (await owner.query<{ t: string }>(
    `SELECT t FROM unnest($1::text[]) t WHERE to_regclass(t) IS NOT NULL`,
    [Object.keys(PURGE_PARENT_SCOPED).filter((t) => !EXPORT_DERIVED_TABLES.includes(t)).map(qualified)],
  )).rows.map((r) => r.t);
  referrers = [...new Set([...all, ...scopedHere])].filter((t) => !isHeld(t)).sort();
  for (const org of [A, B, C]) {
    seeders.set(org, new TenantRowSeeder({ db: owner, organizationId: org, userId: users.get(org)!, exercised: purged, reference, tag: TAG }));
  }
  for (const t of referrers) {
    for (const org of [A, B]) {
      try {
        await seeders.get(org)!.seed(t);
      } catch (error) {
        unseedable.push(`${t} (${org === A ? 'A' : 'B'}): ${(error as Error).message.slice(0, 160)}`);
      }
    }
  }
  for (const org of [A, B]) allRows.push(...seeders.get(org)!.rows);
  console.info(`[${CALLER}] ${referrers.length} tables seeded for each of A and B (${allRows.length} rows with their parents); ${held.length} held tables for C`);
  const without = [...new Set(seeders.get(A)!.withoutOptionalKeys)];
  if (without.length) console.info(`[${CALLER}] seeded without their optional keys:\n  ${without.join('\n  ')}`);
}, 300_000);

afterAll(async () => {
  if (!owner) return;
  for (const org of [A, B, C]) allRows.push(...(seeders.get(org)?.rows ?? []).filter((r) => !allRows.includes(r)));
  await removeSeeded(owner, allRows);
  const client = await owner.connect();
  try {
    await client.query("SET session_replication_role = 'replica'");
    for (const org of [A, B, C]) {
      await client.query('DELETE FROM audit_logs WHERE tenant_id = $1', [org]).catch(() => undefined);
      await client.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [org]);
      await client.query('DELETE FROM organization_users WHERE organization_id = $1', [org]);
      await client.query('DELETE FROM users WHERE id = $1', [users.get(org)]);
      await client.query('DELETE FROM organizations WHERE id = $1', [org]);
    }
  } finally {
    await client.query("SET session_replication_role = 'origin'");
    client.release();
  }
  await owner.end();
}, 300_000);

describe('a tenant with a row in every table that names a purged row with no delete action', () => {
  it('has that row, and so does the other tenant: every such table is seeded for both', () => {
    expect(referrers.length).toBeGreaterThan(50);
    expect(unseedable).toEqual([]);
    for (const t of referrers) {
      for (const org of [A, B]) {
        expect(seeders.get(org)!.rows.some((r) => r.table === t), `${t} for ${org}`).toBe(true);
      }
    }
  });

  it("A's export holds each of A's rows the purge will erase and none of B's, table by table, in A's scope and as the owner", async () => {
    const keyCols = new Map<string, string[]>();
    for (const r of allRows) if (!keyCols.has(r.table)) keyCols.set(r.table, Object.keys(r.key));
    const { pool: runtime } = await import('../../server/db');
    const { runWithOrgJobScope } = await import('../../server/db/tenantStore');
    const scoped = await exportedKeys(
      () => runWithOrgJobScope(A, CALLER, () => companyExportSnapshot(runtime, A, (c) => exportTenantFull(c, A))), keyCols);
    const unscoped = await exportedKeys(() => exportTenantFull(owner, A), keyCols);
    const missing: string[] = [];
    const leaked: string[] = [];
    for (const r of allRows) {
      const cols = keyCols.get(r.table)!;
      const k = JSON.stringify(cols.map((c) => r.key[c]));
      for (const [how, keys] of [['scoped', scoped], ['owner', unscoped]] as const) {
        const has = keys.get(r.table)?.has(k) ?? false;
        // Checked for leaks only:
        //   - vault.* in a tenant scope: read only by a member of the project
        //     (core.can_access_program), and this scope has no user;
        //   - DENY_ALL: row-level security on with no policy, so no application
        //     role reads or writes a row, and the export has no predicate for
        //     them (purge-parent-scope.ts says why).
        const notReturned = (how === 'scoped' && r.table.startsWith('vault.')) || DENY_ALL.includes(r.table);
        if (r.organizationId === A && purged.has(r.table) && !has && !notReturned) missing.push(`${how}: ${label(r.table)}`);
        if (r.organizationId === B && has) leaked.push(`${how}: ${label(r.table)}`);
      }
    }
    expect(leaked, "B's rows in A's export").toEqual([]);
    expect(missing, "A's rows the purge erases, missing from A's export").toEqual([]);
  }, 300_000);

  it('is purged, the way the route runs it', async () => {
    await readyForPurge(A);
    const result = await purge(A);
    expect(result.status).toBe('purged');
  }, 300_000);

  it("A's rows are gone from every table the purge erases, and B keeps every one of its rows, table by table", async () => {
    const kept: string[] = [];
    const lost: string[] = [];
    for (const r of allRows) {
      const there = await stillThere(owner, r);
      if (r.organizationId === A && purged.has(r.table) && there) kept.push(label(r.table));
      if (r.organizationId === B && !there) lost.push(label(r.table));
    }
    expect(lost, "B's rows the purge of A took").toEqual([]);
    expect(kept, "A's rows the purge left").toEqual([]);
  }, 300_000);
});

describe('a tenant holding a row the purge does not erase', () => {
  it('is not purged, and keeps everything, until a decision is made about that table', async () => {
    expect(held.length).toBeGreaterThan(0);
    const seeder = seeders.get(C)!;
    const outcomes: string[] = [];
    const removed = new Set<SeededRow>();
    for (const t of held) {
      const before = seeder.rows.length;
      try {
        await seeder.seed(t);
      } catch {
        // reg_questions refuses INSERT from every role since 2026-10-19; a legacy
        // row is what a tenant may still hold, so it is written past its trigger.
        await owner.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
        try {
          await seeder.seed(t);
        } finally {
          await owner.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
        }
      }
      const mine = seeder.rows.slice(before).filter((r) => r.table === t);
      await readyForPurge(C);
      const failure = await purge(C).then(() => null, (e: { code?: string; message?: string }) => e);
      expect(failure, `${t}: the purge of C succeeded`).not.toBeNull();
      // Rolled back: C is still pending deletion, and every row it had is still there.
      expect((await owner.query('SELECT status FROM organizations WHERE id = $1', [C])).rows[0].status).toBe('pending_deletion');
      for (const r of seeder.rows.filter((x) => !removed.has(x))) {
        expect(await stillThere(owner, r), `${t}: ${label(r.table)}`).toBe(true);
      }
      outcomes.push(`${label(t)}: ${failure!.code ?? '-'} ${String(failure!.message).slice(0, 220)}`);
      await removeSeeded(owner, mine);
      mine.forEach((r) => removed.add(r));
    }
    // A task on a review route (20261023_review_routes.sql): the route's own
    // writer setting puts it there, as review-route.ts does.
    const route = await seeder.seed('review_routes');
    const task = await seeder.seed('unified_tasks');
    const writer = await owner.connect();
    try {
      await writer.query(`SELECT set_config('c2c.review_route_writer', 'on', false)`);
      await writer.query(`UPDATE unified_tasks SET review_route_id = $1, review_role = 'reviewer', assignee_id = $2 WHERE task_id = $3`,
        [route.id, users.get(C), task.task_id]);
      await readyForPurge(C);
      const failure = await purge(C).then(() => null, (e: { code?: string; message?: string }) => e);
      expect(failure, 'a review-route task: the purge of C succeeded').not.toBeNull();
      expect((await owner.query('SELECT status FROM organizations WHERE id = $1', [C])).rows[0].status).toBe('pending_deletion');
      outcomes.push(`unified_tasks on a review route: ${failure!.code ?? '-'} ${String(failure!.message).slice(0, 220)}`);
      await writer.query('UPDATE unified_tasks SET review_route_id = NULL, review_role = NULL WHERE task_id = $1', [task.task_id]);
    } finally {
      await writer.query(`SELECT set_config('c2c.review_route_writer', '', false)`);
      writer.release();
    }
    console.info(`[${CALLER}] the purge of a tenant holding one row of each:\n  ${outcomes.join('\n  ')}`);
    // With the held rows gone, the same tenant purges.
    await readyForPurge(C);
    expect((await purge(C)).status).toBe('purged');
  }, 300_000);
});
