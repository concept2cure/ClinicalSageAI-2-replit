/**
 * Real-schema two-tenant isolation probe under RLS_ENFORCE=on.
 *
 * ── The evidence gap this closes ──────────────────────────────────────────────
 * `docs/RLS_ENFORCEMENT_BURNDOWN.md` tracks one outstanding item, and it is the
 * acceptance criterion for GA-readiness 0.1 (highest severity):
 *
 *   "Live two-tenant probe across the **real** schema's tables under
 *    RLS_ENFORCE=on (behaviour is proven on a synthetic table; a full-schema
 *    cross-table probe in a dedicated enforce-mode job is the remaining
 *    evidence)."
 *
 * `server/db/__tests__/rlsPolicy.integration.test.ts` proves the policy shape
 * behaves correctly — on ONE synthetic table it creates itself. That answers
 * "does a policy of this shape work", not "is every table on the real schema
 * actually isolated". `scripts/db/rls-coverage-check.sql` answers the converse:
 * every org-keyed table HAS a policy — but a policy that exists and a policy that
 * filters are different claims, and coverage cannot distinguish them.
 *
 * This test closes the gap between the two, and does it on every PR rather than
 * in a dedicated enforce-mode job: PGlite is a real PostgreSQL, and it turns out
 * to support everything the probe needs — `CREATE ROLE … NOSUPERUSER
 * NOBYPASSRLS`, `SET ROLE`, `FORCE ROW LEVEL SECURITY`, and the `current_setting`
 * predicates the policy is built from.
 *
 * ── What it actually does ─────────────────────────────────────────────────────
 *   1. Builds the base schema from the drizzle journal — the real CREATE TABLE
 *      lineage, ~290 tables, not a hand-written fixture.
 *   2. Applies the REAL migrations, in the real order: 0019 (tenant column
 *      audit) → 0020 (coerce text tenant columns) → 0021 (enable RLS
 *      everywhere). 0021 refuses to run before 0020, which is itself worth
 *      pinning; the chain here is the one a deploy performs.
 *   3. Seeds TWO tenants into every policied table.
 *   4. Drops to a NOSUPERUSER NOBYPASSRLS role and reads every one of them under
 *      `app.rls_enforce='on'` with tenant 1's scope, asserting tenant 2's rows
 *      are invisible everywhere.
 *
 * ── Why the negative control matters more than the assertion ──────────────────
 * "Zero leaks" is worthless on its own: a probe that cannot see anything reports
 * zero leaks too. `enforcementOff` re-runs the identical sweep with
 * `app.rls_enforce='off'` and asserts the other tenant's rows ARE visible. That
 * is the test proving it can fail. If the seeding silently broke, or the role
 * grant did not apply, or PGlite stopped honouring FORCE, the negative control
 * goes red — not the positive one.
 *
 * ── Why superuser-ness is asserted explicitly ─────────────────────────────────
 * PostgreSQL bypasses RLS for superusers regardless of FORCE ROW LEVEL SECURITY.
 * A superuser probe would pass every enforce-mode assertion for the wrong
 * reason — the rows would be visible, the sweep would find no *foreign* rows
 * only if the seeding also failed, and the suite would look green while testing
 * nothing. `is_superuser` is asserted 'off' before any isolation claim is made.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals. This is the database-layer proof of that limit.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { citext } from '@electric-sql/pglite/contrib/citext';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = 300_000;

/** The two tenants the whole probe is built around. */
const TENANT_A = 1;
const TENANT_B = 2;

/** Tenant key columns 0021 recognizes, in the order it prefers them. */
const TENANT_COLUMNS = ['organization_id', 'org_id', 'tenant_id'] as const;

/**
 * Floor on how much of the schema must actually be exercised.
 *
 * Without this the suite degrades silently: if the base fixture stopped
 * building, or 0021 stopped policying, the sweep would run over zero tables,
 * find zero leaks, and pass. The floor is set below the current figure (220 of
 * 222 policied tables seed cleanly) so ordinary schema churn does not trip it,
 * but far enough above zero that a broken fixture cannot masquerade as a pass.
 */
const MIN_TABLES_PROBED = 180;

const readMig = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

interface ColumnMeta {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

let pg: PGlite;
let policiedTables: string[] = [];
let columnsByTable = new Map<string, ColumnMeta[]>();
const seededTables: string[] = [];
const seedFailures: Array<{ table: string; error: string }> = [];

const rows = async <R = Record<string, unknown>>(sql: string): Promise<R[]> =>
  (await pg.query(sql)).rows as R[];

/** Execute, swallowing failure and clearing the aborted transaction it leaves. */
async function safe(sql: string): Promise<true | string> {
  try {
    await pg.exec(sql);
    return true;
  } catch (error) {
    await pg.exec('ROLLBACK').catch(() => undefined);
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * A numeric literal that fits the column's declared precision.
 *
 * `numeric(p,s)` rejects a value wider than p-s integral digits, so a blanket
 * 1001 overflows a numeric(4,1) — supply_chain_temperature_readings is exactly
 * that, and it was the last table failing to seed.
 */
function numericLiteral(column: ColumnMeta, tenant: number): string {
  const precision = column.numeric_precision;
  const scale = column.numeric_scale ?? 0;
  if (precision !== null && precision - scale < 4) return String(tenant);
  return String(1000 + tenant);
}

/**
 * A literal for a NOT NULL column with no default, varied by tenant.
 *
 * Varying matters: seeding both tenants with identical values collides on any
 * UNIQUE constraint and the table drops out of the probe. That silently shrinks
 * coverage — and it would shrink it hardest on exactly the tables that carry
 * uniqueness, which are the interesting ones. Measured: fixed literals seeded
 * 169/222 tables; varying them seeds 220/222.
 */
function literalFor(column: ColumnMeta, tenant: number): string {
  const type = (column.udt_name || '').toLowerCase();

  if (['int2', 'int4', 'int8'].includes(type)) return String(1000 + tenant);
  if (['numeric', 'float4', 'float8'].includes(type)) return numericLiteral(column, tenant);
  if (type === 'bool') return 'false';
  if (type === 'uuid') return 'gen_random_uuid()';
  if (type === 'json' || type === 'jsonb') return `'{}'::${type}`;
  if (type.startsWith('timestamp') || type === 'date') return 'now()';
  if (type === 'time') return `'00:00:00'`;
  if (type === 'bytea') return `'\\x0${tenant}'::bytea`;
  if (type.startsWith('_')) return `'{}'::${type.slice(1)}[]`;
  return `'probe-org${tenant}'`;
}

/**
 * The base schema a deploy actually presents to the RLS migrations: contrib
 * extensions, the named schemas, and the drizzle journal's CREATE TABLE lineage.
 * Mirrors `baseSchemaFixture` in tenant-isolation-sweep.contract.test.ts — the
 * same reasoning applies, so the same fixture shape is used.
 */
async function buildBaseSchema(): Promise<void> {
  for (const ext of ['pgcrypto', 'pg_trgm', '"uuid-ossp"', 'citext']) {
    await safe(`CREATE EXTENSION IF NOT EXISTS ${ext};`);
  }
  for (const schema of ['predicate', 'precedent', 'core', 'intelligence', 'regulatory']) {
    await safe(`CREATE SCHEMA IF NOT EXISTS ${schema};`);
  }
  const journal = readMig('migrations/0000_sweet_joseph.sql');
  for (const match of journal.matchAll(/CREATE TABLE "([a-z0-9_]+)" \([\s\S]*?\n\);/g)) {
    await safe(match[0].replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '));
  }
}

/** Re-enter the probe role and scope after an aborted statement reset the session. */
async function enterProbeScope(tenantId: number | null, role = ''): Promise<void> {
  await pg.exec('RESET ROLE');
  await pg.exec('SET ROLE rls_probe');
  await pg.exec(`SET app.rls_enforce='on'`);
  await pg.exec(`SET app.current_tenant_id='${tenantId === null ? '' : tenantId}'`);
  await pg.exec(`SET app.current_org_id=''`);
  await pg.exec(`SET app.current_user_role='${role}'`);
}

/**
 * Read every policied table and report how many rows belong to a tenant OTHER
 * than `scopedTenant`. Under enforcement that number must be zero everywhere.
 */
async function sweepForeignRows(scopedTenant: number): Promise<{
  visited: number;
  leaks: Array<{ table: string; foreignRows: number }>;
  ownRowsSeen: number;
}> {
  const leaks: Array<{ table: string; foreignRows: number }> = [];
  let visited = 0;
  let ownRowsSeen = 0;

  for (const table of seededTables) {
    const tenantColumn = columnsByTable
      .get(table)
      ?.find(c => (TENANT_COLUMNS as readonly string[]).includes(c.column_name));
    if (!tenantColumn) continue;

    try {
      const [result] = await rows<{ foreign_rows: string; own_rows: string }>(
        `SELECT
           count(*) FILTER (WHERE "${tenantColumn.column_name}"::text <> '${scopedTenant}') AS foreign_rows,
           count(*) FILTER (WHERE "${tenantColumn.column_name}"::text  = '${scopedTenant}') AS own_rows
         FROM "${table}"`
      );
      visited += 1;
      ownRowsSeen += Number(result.own_rows);
      if (Number(result.foreign_rows) > 0) {
        leaks.push({ table, foreignRows: Number(result.foreign_rows) });
      }
    } catch {
      await pg.exec('ROLLBACK').catch(() => undefined);
      await enterProbeScope(scopedTenant);
    }
  }
  return { visited, leaks, ownRowsSeen };
}

beforeAll(async () => {
  pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp, citext } });
  await buildBaseSchema();

  // The real chain, in the real order. 0021 hard-refuses to run before 0020 has
  // coerced text tenant columns, so the order is load-bearing, not cosmetic.
  for (const migration of [
    'migrations/0019_tenant_column_audit.sql',
    'migrations/0020_coerce_text_tenant_columns.sql',
    'migrations/0021_enable_rls_everywhere.sql',
  ]) {
    const result = await safe(readMig(migration));
    if (result !== true) throw new Error(`${migration} failed to apply: ${result}`);
  }

  policiedTables = (
    await rows<{ tablename: string }>(
      `SELECT tablename FROM pg_policies
        WHERE policyname = 'tenant_isolation_policy' AND schemaname = 'public'
        ORDER BY tablename`
    )
  ).map(r => r.tablename);

  const allColumns = await rows<ColumnMeta>(
    `SELECT table_name, column_name, udt_name, is_nullable, column_default,
            numeric_precision, numeric_scale
       FROM information_schema.columns WHERE table_schema = 'public'`
  );
  columnsByTable = new Map();
  for (const column of allColumns) {
    if (!columnsByTable.has(column.table_name)) columnsByTable.set(column.table_name, []);
    columnsByTable.get(column.table_name)!.push(column);
  }

  // Seed as the owner, with FK triggers off. The probe is about the SELECT-side
  // policy, and satisfying every foreign key across 222 tables would turn this
  // into a schema-graph exercise without changing what is being proven.
  await pg.exec('SET session_replication_role = replica');

  for (const table of policiedTables) {
    const columns = columnsByTable.get(table) ?? [];
    // A table may carry more than one recognized tenant key. Fill ALL of them —
    // filling only the first leaves a NOT NULL sibling null and the insert fails
    // (multi_agency_validation_sessions has both organization_id and tenant_id).
    const tenantColumns = columns.filter(c =>
      (TENANT_COLUMNS as readonly string[]).includes(c.column_name)
    );
    if (!tenantColumns.length) continue;

    const required = columns.filter(
      c =>
        c.is_nullable === 'NO' &&
        !c.column_default &&
        !(TENANT_COLUMNS as readonly string[]).includes(c.column_name)
    );

    let seeded = true;
    let failure = '';
    for (const tenant of [TENANT_A, TENANT_B]) {
      const names = [...tenantColumns.map(c => c.column_name), ...required.map(c => c.column_name)];
      const values = [
        ...tenantColumns.map(() => String(tenant)),
        ...required.map(c => literalFor(c, tenant)),
      ];
      const result = await safe(
        `INSERT INTO "${table}" (${names.map(n => `"${n}"`).join(', ')}) VALUES (${values.join(', ')})`
      );
      if (result !== true) {
        seeded = false;
        failure = result;
        break;
      }
    }
    if (seeded) seededTables.push(table);
    else seedFailures.push({ table, error: failure.slice(0, 120) });
  }

  await pg.exec('SET session_replication_role = origin');

  // The probe identity: no superuser, no BYPASSRLS, not the table owner.
  await safe('CREATE ROLE rls_probe NOSUPERUSER NOBYPASSRLS');
  await pg.exec('GRANT USAGE ON SCHEMA public TO rls_probe');
  await pg.exec('GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO rls_probe');
  // Sequences too, or an INSERT on a serial-keyed table is refused for
  // "permission denied for sequence" BEFORE the policy is ever evaluated. The
  // write-side test would then pass while proving nothing about RLS — which is
  // exactly what happened before this grant was added, and is why that test
  // asserts on the error TEXT rather than merely that the insert failed.
  await pg.exec('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rls_probe');
}, T);

afterAll(async () => {
  await pg?.close().catch(() => undefined);
});

describe('the fixture is a real schema, really policied', () => {
  it('applies the real 0019 → 0020 → 0021 chain and policies the schema', () => {
    // If this number collapses, every isolation assertion below becomes vacuous.
    expect(policiedTables.length).toBeGreaterThan(MIN_TABLES_PROBED);
  });

  it('FORCEs row security, so the table owner cannot bypass its own policy', async () => {
    // On Neon the app role owns the tables; without FORCE the owner is exempt and
    // the entire policy set is decorative in production.
    const [counts] = await rows<{ enabled: string; forced: string }>(
      `SELECT count(*) FILTER (WHERE c.relrowsecurity)      AS enabled,
              count(*) FILTER (WHERE c.relforcerowsecurity) AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`
    );
    expect(Number(counts.enabled)).toBeGreaterThan(MIN_TABLES_PROBED);
    expect(Number(counts.forced)).toBe(Number(counts.enabled));
  });

  it('seeds two tenants into substantially all of the policied tables', () => {
    expect(seededTables.length).toBeGreaterThan(MIN_TABLES_PROBED);
    // Surface the stragglers rather than hiding them: a growing skip list is how
    // this probe would quietly stop covering the schema.
    if (seedFailures.length) {
      console.info(
        `[rls-probe] ${seedFailures.length} table(s) not seeded:\n` +
          seedFailures.map(f => `    ${f.table}: ${f.error}`).join('\n')
      );
    }
    expect(seedFailures.length).toBeLessThan(policiedTables.length * 0.1);
  });
});

describe('two-tenant isolation under RLS_ENFORCE=on', () => {
  it('the probe runs as a NON-superuser — otherwise every result below is a lie', async () => {
    await enterProbeScope(TENANT_A);
    const [{ is_superuser }] = await rows<{ is_superuser: string }>(
      `SELECT current_setting('is_superuser') AS is_superuser`
    );
    expect(is_superuser).toBe('off');
  }, T);

  it('NEGATIVE CONTROL: with enforcement OFF the probe DOES see the other tenant', async () => {
    // The load-bearing test. "Zero leaks" proves nothing unless the same sweep
    // can find leaks when they are there. If seeding broke, the grant failed, or
    // FORCE stopped applying, this is what goes red.
    await enterProbeScope(TENANT_A);
    await pg.exec(`SET app.rls_enforce='off'`);

    const { visited, leaks, ownRowsSeen } = await sweepForeignRows(TENANT_A);

    expect(visited).toBeGreaterThan(MIN_TABLES_PROBED);
    expect(ownRowsSeen).toBeGreaterThan(0);
    // Unenforced, tenant B's rows are visible on essentially every table.
    expect(leaks.length).toBeGreaterThan(MIN_TABLES_PROBED);
  }, T);

  it('with enforcement ON, tenant A sees NO row belonging to tenant B — anywhere', async () => {
    await enterProbeScope(TENANT_A);

    const { visited, leaks, ownRowsSeen } = await sweepForeignRows(TENANT_A);

    expect(visited).toBeGreaterThan(MIN_TABLES_PROBED);
    // Tenant A must still see its OWN rows: a policy that hides everything is
    // not isolation, it is an outage, and it would pass a leaks-only assertion.
    expect(ownRowsSeen).toBeGreaterThan(0);
    expect(
      leaks,
      `cross-tenant leakage on ${leaks.length} table(s): ` +
        leaks
          .slice(0, 20)
          .map(l => `${l.table}(${l.foreignRows})`)
          .join(', ')
    ).toEqual([]);
  }, T);

  it('the isolation is symmetric — tenant B sees no row belonging to tenant A', async () => {
    // A predicate accidentally pinned to one tenant id would pass the A-scoped
    // sweep and fail here.
    await enterProbeScope(TENANT_B);

    const { leaks, ownRowsSeen } = await sweepForeignRows(TENANT_B);

    expect(ownRowsSeen).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
  }, T);

  it('with enforcement ON and NO tenant scope, the schema reads as empty', async () => {
    // The fail-closed case: an unscoped connection must not see rows. This is
    // what makes a forgotten `runWithTenantScope` an availability failure rather
    // than a silent cross-tenant read.
    await enterProbeScope(null);

    let totalVisible = 0;
    for (const table of seededTables.slice(0, 60)) {
      try {
        const [{ n }] = await rows<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`);
        totalVisible += Number(n);
      } catch {
        await pg.exec('ROLLBACK').catch(() => undefined);
        await enterProbeScope(null);
      }
    }
    expect(totalVisible).toBe(0);
  }, T);

  it('the super-admin role sees across tenants — the deliberate carve-out', async () => {
    // Estate-wide jobs (retention sweeps, chain-integrity audits) run under this
    // role. If it stopped working they would silently process one tenant.
    await enterProbeScope(TENANT_A, 'app_super_admin');

    const { leaks } = await sweepForeignRows(TENANT_A);
    expect(leaks.length).toBeGreaterThan(MIN_TABLES_PROBED);
  }, T);
});

describe('the write side', () => {
  it('WITH CHECK rejects an INSERT that would land in another tenant', async () => {
    // Read isolation alone still lets a tenant write INTO its neighbour. 0021's
    // policy is FOR ALL, so the same predicate governs INSERT.
    await enterProbeScope(TENANT_A);

    const target = seededTables.find(t =>
      columnsByTable.get(t)?.some(c => c.column_name === 'organization_id')
    );
    expect(target).toBeDefined();

    const result = await safe(
      `INSERT INTO "${target}" ("organization_id") VALUES (${TENANT_B})`
    );
    expect(result).not.toBe(true);
    expect(String(result)).toMatch(/row-level security|policy/i);
  }, T);
});
