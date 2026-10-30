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
 *   - A's export, run the way the route runs it (A's own scope, its tenant id
 *     and its organization uuid, RLS enforced) and
 *     as the owner (no RLS, so only the predicate decides), holds each of A's
 *     rows the purge will erase and none of B's, table by table;
 *   - the purge of A, run the way the route runs it, succeeds;
 *   - every one of A's rows in a table the purge erases is gone, and every one
 *     of B's rows is still there, table by table.
 * A wrong PURGE_PARENT_SCOPED predicate fails the last two either way: too
 * narrow keeps A's row (and the export misses it), too wide takes B's.
 *
 * Every table the purge erases is seeded too when it has no tenant column, and
 * the export must read each table the purge erases, by a tenant column or
 * through its parent (2026-10-29, docs/evidence/D6-TENANT-EXPORT-GAPS/2026-10-29/).
 * Until then six were erased by cascade and never returned: three CSR/CTD
 * grandchildren that row-level security denied to every application role, and
 * the Vault's catalog, read receipts and evidence citations.
 *
 * Since founder decision P-58 (2026-10-29; docs/evidence/D6-OFFBOARDING-CUSTODY/
 * 2026-10-29/) the tables that were held out of the purge (signatures, audit
 * trails, sealed reports, ledgers, review routes) are referrers like any other:
 * seeded for A and B, exported, and erased for A. A holds them, so its purge
 * runs on a receipt one of its administrators signed custody of; the ceremony
 * itself is exercised by tenant-offboarding-custody.dbtest.ts, and here the
 * custody signature is laid down as the ceremony leaves it.
 *
 * The tables the purge still does not erase (PURGE_RETAINED_RECORDS) are
 * seeded one at a time for tenant C instead: the purge of C is refused or
 * aborts, rolls back, and C's project is still there. A review route held by C
 * stops C's purge until custody is signed, and then it is erased.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import * as offboarding from '../../server/services/tenant/tenant-offboarding';
import { exportTenantFull } from '../../server/services/tenant-export/tenant-full-export.service';
import { companyExportSnapshot, inOrganizationScope } from '../../server/services/tenant-export/company-export-snapshot';
import { EXPORT_DERIVED_TABLES } from '../../server/services/tenant/purge-parent-scope';
import { discoverTenantTables, EXPORT_EXCLUDED_TABLES } from '../../server/services/tenant-export/tenant-full-export.service';
import { TenantRowSeeder, ownVaultProgram, qualified, removeSeeded, stillThere, type SeededRow } from './tenant-purge-row-seeder';
import { forgetOffboardingCertificate, signCustody as signCustodyOf } from './offboarding-custody-signature';

const { purgeTenant, PURGE_CHILD_TABLES, PURGE_PARENT_SCOPED, PURGE_PLATFORM_RECORDS, PURGE_RETAINED_RECORDS } = offboarding;
const NOT_ERASED: Readonly<Record<string, string>> =
  (offboarding as { PURGE_REFERRERS_NOT_ERASED?: Readonly<Record<string, string>> }).PURGE_REFERRERS_NOT_ERASED ?? {};

const A = 90861;
const B = 90862;
const C = 90863;
const TAG = `pbk_${process.pid}_${Date.now().toString(36)}`;
const CALLER = 'tests/db/tenant-purge-blocking-keys.dbtest.ts';
const DERIVED = EXPORT_DERIVED_TABLES.map(qualified);

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

/** Of the tables named, those with no tenant column of their own. */
const UNKEYED_SQL = `
SELECT t FROM unnest($1::text[]) t
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns k
                    WHERE k.table_schema || '.' || k.table_name = t
                      AND k.column_name IN ('organization_id', 'org_id', 'tenant_id'))
 ORDER BY 1`;

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
/** The tables the purge erases that the export does not read (none, since 2026-10-29). */
let erasedNotExported: string[];
const users = new Map<number, number>();
const seeders = new Map<number, TenantRowSeeder>();
const reference = new Map<string, Record<string, unknown>>();
const unseedable: string[] = [];
const allRows: SeededRow[] = [];

/** The platform's own record of a purge (P-58): written by the purge alone, never seeded for a tenant that is not purged. */
const isPlatformRecord = (t: string) => Object.prototype.hasOwnProperty.call(PURGE_PLATFORM_RECORDS, t.replace(/^public\./, ''));
const isHeld = (t: string) => {
  const bare = t.replace(/^public\./, '');
  return Object.prototype.hasOwnProperty.call(NOT_ERASED, bare)
    || Object.prototype.hasOwnProperty.call(PURGE_RETAINED_RECORDS, bare);
};
const keyOf = (row: Record<string, unknown>, cols: string[]) => JSON.stringify(cols.map((c) => String(row[c])));
const label = (t: string) => t.replace(/^public\./, '');
/** The digest of the receipt each tenant's purge runs on. */
const digestOf = (org: number) => `sha256:${createHash('sha256').update(`${TAG}-${org}`).digest('hex')}`;
/** Written past their triggers: reg_questions refuses INSERT from every role since 2026-10-19 (a legacy row is what a tenant may still hold). */
const LAID_DOWN = new Set(['public.reg_questions', 'public.reg_responses', 'reg_questions', 'reg_responses']);

async function seedPastTriggers(seeder: TenantRowSeeder, t: string): Promise<void> {
  try {
    await seeder.seed(t);
    return;
  } catch (error) {
    if (!LAID_DOWN.has(t)) throw error;
  }
  await owner.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  try {
    await seeder.seed(t);
  } finally {
    await owner.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  }
}

/** Custody of the receipt, as the ceremony leaves it (P-58; ./offboarding-custody-signature). */
const signCustody = (org: number) => signCustodyOf(owner, org, users.get(org)!, digestOf(org));

async function readyForPurge(org: number): Promise<void> {
  await owner.query(
    `UPDATE organizations SET status = 'pending_deletion', purged_at = NULL, deletion_requested_at = now() - interval '40 days',
       purge_eligible_at = now() - interval '1 day' WHERE id = $1`, [org]);
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [org]);
  await owner.query(
    `INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by, export_scope) VALUES ($1, $2, 1, 1, NULL, 'organization')`,
    [org, digestOf(org)]);
}

/** The purge as the route runs it: the runtime pool, in the platform scope. */
async function purge(org: number) {
  const { pool: runtime } = await import('../../server/db');
  const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
  return runWithSystemTenantScope(CALLER, () => purgeTenant(runtime, {
    organizationId: org, purgedByUserId: users.get(org)!, preconditions: { finalExportDigest: digestOf(org) },
  }));
}

/**
 * A citation of B's claim that names A's document as its evidence. It is B's:
 * the citation's policies, and the export's predicate, follow its SOURCE
 * document. So A's export must not hold it, whichever key a wrong predicate
 * followed. Removed again before the purge (see the README on what the purge
 * of A does to it). Null where this database has no Vault.
 */
async function crossTenantCitation(): Promise<SeededRow | null> {
  const doc = (org: number) => seeders.get(org)!.rows.find((r) => r.table === 'vault.documents')?.key.id;
  if (!doc(A) || !doc(B)) return null;
  const { rows } = await owner.query(
    `INSERT INTO vault.evidence_citations (source_document_id, evidence_document_id, claim_text)
     VALUES ($1, $2, $3) RETURNING id::text AS id`,
    [doc(B), doc(A), `${TAG}: a claim of tenant B, citing a document of tenant A`]);
  return { table: 'vault.evidence_citations', organizationId: B, key: { id: rows[0].id } };
}

/**
 * Start each table's ids at its own offset. On a fresh database every sequence
 * is in step, so A's section and A's submission were both id 1 and a predicate
 * through the wrong key (a section's id against its submission's) still found
 * A's row and only A's. Staggered, it finds the wrong row or none.
 */
async function staggerSequences(tables: readonly string[]): Promise<void> {
  const { rows } = await owner.query<{ s: string }>(
    `SELECT DISTINCT pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) AS s
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname || '.' || c.relname = ANY ($1::text[]) ORDER BY 1`, [tables]);
  let k = 0;
  for (const { s } of rows) {
    if (s) await owner.query('SELECT setval($1::regclass, nextval($1::regclass) + $2)', [s, (k += 1) * 1009]);
  }
}

/** Each of A's rows the purge erases that an export lacks, and each of B's rows an export holds. */
function compareExport(rows: readonly SeededRow[], keyCols: Map<string, string[]>, exports: Record<string, Map<string, Set<string>>>) {
  const missing: string[] = [];
  const leaked: string[] = [];
  for (const r of rows) {
    const k = JSON.stringify(keyCols.get(r.table)!.map((c) => r.key[c]));
    for (const [how, keys] of Object.entries(exports)) {
      const has = keys.get(r.table)?.has(k) ?? false;
      // Checked for leaks only: a derived table (a citation's chunk),
      // returned as the text it was cut from. csr_endpoint_results,
      // ctd_module_sections and ctd_documents are checked both ways since
      // 2026-10-29: they were deny-all to every application role until their
      // parent's policy reached them. vault.* is checked both ways since the
      // same day (P-58's data return): the export reads in the organization's
      // own scope, its tenant id and its uuid, where the Vault's policies
      // admit its documents; the platform scope it read in before returned none.
      const notReturned = DERIVED.includes(r.table);
      if (r.organizationId === A && purged.has(r.table) && !has && !notReturned) missing.push(`${how}: ${label(r.table)}`);
      if (r.organizationId === B && has) leaked.push(`${how}: ${label(r.table)}`);
    }
  }
  return { missing, leaked };
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
  // And every table the purge erases that has no tenant column, so each one's
  // rows are checked against the export, whether or not the map names it.
  const unkeyedErased = (await owner.query<{ t: string }>(UNKEYED_SQL, [[...purged]])).rows
    .map((r) => r.t).filter((t) => !DERIVED.includes(t));
  const exported = new Set((await discoverTenantTables(owner)).map((d) => `${d.schema}.${d.table}`));
  erasedNotExported = [...purged].filter((t) => !exported.has(t)
    && !DERIVED.includes(t) && !EXPORT_EXCLUDED_TABLES.map(qualified).includes(t)).sort();
  referrers = [...new Set([...all, ...scopedHere, ...unkeyedErased])].filter((t) => !isHeld(t) && !isPlatformRecord(t)).sort();
  await staggerSequences([...new Set([...purged, ...referrers])]);
  for (const org of [A, B, C]) {
    seeders.set(org, new TenantRowSeeder({ db: owner, organizationId: org, userId: users.get(org)!, exercised: purged, reference, tag: TAG }));
  }
  for (const t of referrers) {
    for (const org of [A, B]) {
      try {
        await seedPastTriggers(seeders.get(org)!, t);
      } catch (error) {
        unseedable.push(`${t} (${org === A ? 'A' : 'B'}): ${(error as Error).message.slice(0, 160)}`);
      }
    }
  }
  // A Vault document of A's is in one of A's programs, so A's own scope reads it (P-58's data return).
  for (const org of [A, B]) await ownVaultProgram(owner, seeders.get(org)!);
  for (const org of [A, B]) allRows.push(...seeders.get(org)!.rows);
  console.info(`[${CALLER}] ${referrers.length} tables seeded for each of A and B (${allRows.length} rows with their parents); ${held.length} held tables for C`);
  const without = [...new Set(seeders.get(A)!.withoutOptionalKeys)];
  if (without.length) console.info(`[${CALLER}] seeded without their optional keys:\n  ${without.join('\n  ')}`);
}, 300_000);

afterAll(async () => {
  if (!owner) return;
  for (const org of [A, B, C]) allRows.push(...(seeders.get(org)?.rows ?? []).filter((r) => !allRows.includes(r)));
  await removeSeeded(owner, allRows);
  // A purged tenant keeps its certificate and its custody signature (P-58).
  for (const org of [A, B, C]) await forgetOffboardingCertificate(owner, org);
  const client = await owner.connect();
  try {
    await client.query("SET session_replication_role = 'replica'");
    for (const org of [A, B, C]) {
      await client.query('DELETE FROM audit_logs WHERE tenant_id = $1', [org]).catch(() => undefined);
      await client.query('DELETE FROM electronic_signatures WHERE organization_id = $1', [org]).catch(() => undefined);
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

  it('is exported from every table the purge erases: by its tenant column, or through its parent', () => {
    expect(purged.size).toBeGreaterThan(100);
    expect(erasedNotExported, 'tables the purge erases that the export does not read').toEqual([]);
  });

  it("A's export holds each of A's rows the purge will erase and none of B's, table by table, in A's scope and as the owner", async () => {
    const keyCols = new Map<string, string[]>();
    for (const r of allRows) if (!keyCols.has(r.table)) keyCols.set(r.table, Object.keys(r.key));
    const { pool: runtime } = await import('../../server/db');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const cross = await crossTenantCitation();
    // As the route reads it: its mount's platform scope, then A's own (inOrganizationScope).
    const scoped = await exportedKeys(() => runWithSystemTenantScope(CALLER, () => inOrganizationScope(runtime, A, CALLER,
      () => companyExportSnapshot(runtime, A, (c) => exportTenantFull(c, A)))), keyCols);
    const unscoped = await exportedKeys(() => exportTenantFull(owner, A), keyCols);
    if (cross) await removeSeeded(owner, [cross]);
    const { missing, leaked } = compareExport(cross ? [...allRows, cross] : allRows, keyCols, { scoped, owner: unscoped });
    expect(leaked, "B's rows in A's export").toEqual([]);
    expect(missing, "A's rows the purge erases, missing from A's export").toEqual([]);
  }, 300_000);

  it('is purged, the way the route runs it, once custody of its export is signed', async () => {
    await readyForPurge(A);
    const refused = await purge(A).then(() => null, (e: { code?: string }) => e);
    expect(refused?.code, 'the purge of a tenant holding held records, without custody').toBe('CUSTODY_ATTESTATION_REQUIRED');
    const custody = await signCustody(A);
    const result = await purge(A);
    expect(result.status).toBe('purged');
    expect(result.offboardingCertificate).toMatchObject({ id: expect.any(String) });
    const cert = (await owner.query('SELECT custody_signature_id, held_record_total FROM tenant_offboarding_certificates WHERE organization_id = $1', [A])).rows[0];
    expect(Number(cert.custody_signature_id)).toBe(custody);
    expect(Number(cert.held_record_total)).toBeGreaterThan(0);
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

describe('a tenant holding a row the purge does not erase, or a held record without custody', () => {
  it('is not purged, and keeps everything; with the retained rows gone and custody signed, it purges', async () => {
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((t) => Object.prototype.hasOwnProperty.call(PURGE_RETAINED_RECORDS, label(t))), 'held, other than a retained record').toBe(true);
    const seeder = seeders.get(C)!;
    const outcomes: string[] = [];
    const removed = new Set<SeededRow>();
    for (const t of held) {
      const before = seeder.rows.length;
      await seedPastTriggers(seeder, t);
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
    // A task on a review route (20261023_review_routes.sql), laid down as the
    // route writer's doors leave one (the fixture skips the trigger for it).
    const seeded = (r: Record<string, unknown>, table: string) =>
      seeder.rows.find((x) => x.table === table && Object.entries(x.key).every(([k, v]) => String(r[k]) === String(v)))!;
    const routeRecord = await seeder.seed('review_routes');
    const taskRecord = await seeder.seed('unified_tasks');
    const route = seeded(routeRecord, 'public.review_routes');
    const task = seeded(taskRecord, 'public.unified_tasks');
    expect(route && task, 'the route and its task are seeded rows').toBeTruthy();
    const lay = await owner.connect();
    try {
      await lay.query("SET session_replication_role = 'replica'");
      await lay.query(`UPDATE unified_tasks SET review_route_id = $1, review_role = 'reviewer', review_step = 1, assignee_id = $2 WHERE task_id = $3`,
        [routeRecord.id, users.get(C), taskRecord.task_id]);
    } finally {
      await lay.query("SET session_replication_role = 'origin'").catch(() => undefined);
      lay.release();
    }
    await readyForPurge(C);
    const failure = await purge(C).then(() => null, (e: { code?: string; message?: string }) => e);
    expect(failure?.code, 'a review route held without custody').toBe('CUSTODY_ATTESTATION_REQUIRED');
    expect((await owner.query('SELECT status FROM organizations WHERE id = $1', [C])).rows[0].status).toBe('pending_deletion');
    expect(await stillThere(owner, route)).toBe(true);
    expect(await stillThere(owner, task)).toBe(true);
    outcomes.push(`unified_tasks on a review route: ${failure!.code ?? '-'} ${String(failure!.message).slice(0, 220)}`);
    console.info(`[${CALLER}] the purge of a tenant holding one row of each:\n  ${outcomes.join('\n  ')}`);
    // With the retained rows gone and custody of the receipt signed, the same
    // tenant purges, and its review route goes with it.
    await signCustody(C);
    expect((await purge(C)).status).toBe('purged');
    expect(await stillThere(owner, route)).toBe(false);
    expect(await stillThere(owner, task)).toBe(false);
  }, 300_000);
});
