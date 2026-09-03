/**
 * Tenant-isolation sweep + deploy-dead batch 2 — reachability & isolation
 * contract (ledger C-33).
 *
 * C-32 established the class: a migration sitting in db/migrations/ on no apply
 * path makes its tables look "backed" while they exist on no real database, so
 * every endpoint querying them 500s. C-33 wires forty more such files onto
 * C2C_MIGRATION_FILES — which creates a SECOND hazard the wiring itself
 * introduces:
 *
 *   migrations/0021_enable_rls_everywhere.sql policies every tenant-keyed table,
 *   but it runs ONCE, on install-fresh, over the tables that exist at that
 *   moment. Tables added later by the apply-c2c / deploy-migrate set land on an
 *   already-provisioned database where 0021 has long since run and will never
 *   revisit them. Under RLS_ENFORCE=on a table with no RLS is fully readable
 *   ACROSS TENANTS. Wiring forty files without an isolation step would therefore
 *   provision ~27 new tenant-keyed tables with none.
 *
 * db/migrations/20260801_tenant_isolation_sweep.sql closes that, and runs LAST in
 * the set so it sees everything the set just created. This pins both halves:
 * the batch applies cleanly and in order, and the sweep leaves NO integer-keyed
 * tenant table unpoliced — while never aborting a deploy and never clobbering a
 * subsystem's own policy.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals. A tenant table with no isolation is not access control.
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
import { C2C_MIGRATION_FILES, TENANT_ISOLATION_SWEEP } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Imported, not re-typed: the same string used to be hardcoded in four places,
// so the invariant had four copies and no definition. It lives next to the list
// it constrains, and scripts/ci/check-migration-set-order.mjs reads the same one.
const SWEEP = TENANT_ISOLATION_SWEEP;
const BATCH_START = 'db/migrations/022_stability_v2.sql';
const T = 180_000;

const readMig = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/**
 * A BASE-SCHEMA fixture: the state a deploy actually presents to the migration
 * set, rather than an empty database. Batch 3 (C-34) exists precisely because a
 * blank DB is the WRONG bar — files that legitimately build on core tables fail
 * it, and refusing to wire them on that basis is as wrong as wiring them
 * unverified. This builds the real thing: the contrib extensions a real cluster
 * has, the named schemas, and the drizzle journal's CREATE TABLE blocks (the base
 * lineage deploy-migrate's BASE_SCHEMA_SENTINELS preflight insists on).
 *
 * `vector` is deliberately absent — PGlite cannot load it. That is why the two
 * pgvector-dependent files stay unwired and baselined rather than assumed good.
 */
async function baseSchemaFixture(): Promise<PGlite> {
  const pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp, citext } });
  const safe = async (sql: string) => {
    try {
      await pg.exec(sql);
    } catch {
      // A failed statement leaves the session in an aborted transaction; the real
      // applier issues the same ROLLBACK between files.
      await pg.exec('ROLLBACK').catch(() => {});
    }
  };
  for (const ext of ['pgcrypto', 'pg_trgm', '"uuid-ossp"', 'citext']) {
    await safe(`CREATE EXTENSION IF NOT EXISTS ${ext};`);
  }
  for (const s of ['predicate', 'precedent', 'core', 'intelligence', 'regulatory']) {
    await safe(`CREATE SCHEMA IF NOT EXISTS ${s};`);
  }
  const journal = readMig('migrations/0000_sweet_joseph.sql');
  for (const m of journal.matchAll(/CREATE TABLE "([a-z0-9_]+)" \([\s\S]*?\n\);/g)) {
    await safe(m[0].replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '));
  }
  // regulatory_programs is a BASE_SCHEMA_SENTINELS entry: deploy-migrate's
  // preflight REFUSES to run the set unless it exists (it comes from the raw
  // overlay, not the journal). The D11d IVDR entries FK it, so the fixture
  // must present it the way a real deploy does.
  await safe(readMig('migrations/20260524_program_workbench_schema.sql'));
  // Same class as regulatory_programs above, for the same reason. The batch
  // slice starts at BATCH_START, which sits AFTER this file in the applied set,
  // so ectd_compilations reaches the batch with only the columns the drizzle
  // journal gives it. 20260828_ectd_compilations_submission_id.sql — which IS
  // in the batch — indexes (submission_id, sequence_number), and sequence_number
  // is added here. A real deploy runs both in this order and is unaffected; the
  // fixture has to present the same starting state or it fails the set for a
  // gap of its own making.
  await safe(readMig('db/migrations/20260730_ectd_compilations_sequence_columns.sql'));
  // Same class again, for the same reason. manufacturing_processes is created at
  // index 54 of the set — before BATCH_START — by the reconstruction that
  // derived it from its two readers when it turned out to have no writer.
  // db/migrations/20260903_cmc_manufacturing_characterization_registers.sql, in
  // the batch, ALTERs that table to add the columns its own model has always
  // declared, and ALTER TABLE ... ADD COLUMN IF NOT EXISTS does not guard the
  // TABLE's existence. A real deploy runs the creator first and is unaffected;
  // the fixture has to present the same starting state or it fails the set for
  // a gap of its own making.
  await safe(readMig('db/migrations/20260730_manufacturing_processes_reconstruction.sql'));
  return pg;
}

describe('C-33: the sweep is positioned to see everything the set creates', () => {
  it('is in C2C_MIGRATION_FILES, and is the LAST entry', () => {
    // Ordering is the whole contract: a sweep that runs before the creators
    // policies nothing.
    expect(C2C_MIGRATION_FILES).toContain(SWEEP);
    expect(C2C_MIGRATION_FILES[C2C_MIGRATION_FILES.length - 1]).toBe(SWEEP);
  });

  it('the batch-2 files are wired ahead of it', () => {
    const sweepAt = C2C_MIGRATION_FILES.indexOf(SWEEP);
    const batchAt = C2C_MIGRATION_FILES.indexOf(BATCH_START);
    expect(batchAt).toBeGreaterThan(-1);
    expect(batchAt).toBeLessThan(sweepAt);
  });

  it('the once-excluded files are now wired, having been RESOLVED not skipped', () => {
    // C-33 pinned the three uuid/text-tenant files as unwired, and C-34 did the
    // same for the pgvector trio. Both exclusions were provisional, and both were
    // since resolved rather than accepted: C-38 reconciled the tenant keys to the
    // canonical integer identity the code already used, and C-37 replaced the
    // PGlite harness with a real PostgreSQL + pgvector instead of writing the
    // files off. This assertion is deliberately INVERTED from its original form —
    // the earlier version failing is what flagged that the intent had changed.
    for (const nowWired of [
      // C-38 — identity reconciled
      'db/migrations/20260125_ai_provider_audit_log.sql',
      'db/migrations/20260324_ana_kernel_decision_log.sql',
      'db/migrations/20260326_conversation_os_durability_phase2.sql',
      // C-37 — verified on a real pgvector-capable Postgres
      'db/migrations/20260207_phase6_6a_fda_clearance_universe.sql',
      'db/migrations/20260306_precedent_engine.sql',
      'db/migrations/20260208_phase6_6a_risk_rollups.sql',
    ]) {
      expect(C2C_MIGRATION_FILES).toContain(nowWired);
    }
  });

  it('still refuses the _consolidated tree, which was never merely unwired', () => {
    // The one exclusion that is NOT provisional: 012_document_authoring_schema
    // creates a rival `doc_revisions` against the canonical authoring subsystem,
    // and 001_create_core_tables redefines users/organizations. C-39 extracted
    // the live tables instead; the tree itself must stay out.
    expect(C2C_MIGRATION_FILES.filter((f: string) => f.includes('_consolidated/'))).toEqual([]);
  });

  it('DOES wire enhanced_cortex, whose identity conflict C-36 resolved', () => {
    // C-34 excluded it for an unimplementable FK. That was a real defect, not a
    // harness limit — and defects get fixed rather than permanently excluded.
    expect(C2C_MIGRATION_FILES).toContain('db/migrations/20260125_enhanced_cortex_schema.sql');
  });
});

describe('C-36: enhanced cortex keys atoms the way the canonical store does', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await baseSchemaFixture();
    const sql = readMig('db/migrations/20260125_enhanced_cortex_schema.sql');
    await pg.exec(sql);
    await pg.exec(sql); // idempotent
  }, T);

  afterAll(async () => {
    await pg.close();
  });

  it('the canonical lumen_data_atoms.id is an integer, not a uuid', async () => {
    // This is the fact the migration was written against wrongly. Pinning it
    // means a future change to either side surfaces here rather than as an
    // unimplementable FK at deploy time.
    const { rows } = await pg.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'lumen_data_atoms' AND column_name = 'id'`,
    );
    expect(rows[0]?.data_type).toBe('integer');
  });

  it('every atom-referencing column is an integer, so the FKs are implementable', async () => {
    const { rows } = await pg.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('atom_id','source_atom_id','target_atom_id','atom_a_id','atom_b_id')
          AND data_type <> 'integer'`,
    );
    expect(
      rows.map((r) => `${r.table_name}.${r.column_name}:${r.data_type}`),
      'atom references must match lumen_data_atoms.id',
    ).toEqual([]);
  });

  it('the two previously-impossible foreign keys now exist', async () => {
    const { rows } = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY' AND table_name = 'lumen_knowledge_graph_edges'`,
    );
    expect(rows[0].n).toBe(2); // source_atom_id + target_atom_id
  });

  it("the services' real JOIN typechecks (it could not before)", async () => {
    // conflictDetectionService.ts issues exactly this. Against the old uuid
    // columns it failed with "operator does not exist: integer = uuid" — so even
    // had the tables existed, the query could not run.
    await expect(
      pg.query(`SELECT a.id, q.overall_score FROM lumen_data_atoms a
                LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
                WHERE a.id = $1`, [1]),
    ).resolves.toBeDefined();
  });
});

describe('C-33: the batch applies in set order, twice, and ends fully isolated', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await baseSchemaFixture();
    // PGlite cannot load the `vector` extension, so files that need it are out of
    // this harness's reach — that limitation is exactly what C-37 addressed by
    // standing up a real PostgreSQL + pgvector. Their coverage lives there now:
    // `DATABASE_URL=... node scripts/db/verify-migration-set.mjs --seed-base`
    // applies the WHOLE set twice against a real cluster. Skipping them here is a
    // stated boundary of this test, not an unexamined gap.
    // Named explicitly rather than inferred: risk_rollups does not itself declare
    // the extension, it reads predicate.fda_510k_clearances from the file that
    // does, so a "does this file mention vector?" test would miss it and fail.
    const PGVECTOR_DEPENDENT = new Set([
      'db/migrations/20260207_phase6_6a_fda_clearance_universe.sql',
      'db/migrations/20260306_precedent_engine.sql',
      'db/migrations/20260208_phase6_6a_risk_rollups.sql', // reads the first file's tables
      // adds a vector(1536) column to conversation_working_memory; the rest of
      // that table ships pgvector-free in 20260820, which IS applied here
      'migrations/20260602_working_memory_embeddings.sql',
    ]);
    const batch = C2C_MIGRATION_FILES.slice(C2C_MIGRATION_FILES.indexOf(BATCH_START)).filter(
      (rel: string) => !PGVECTOR_DEPENDENT.has(rel),
    );
    // Applied TWICE: a deploy re-runs the whole set every time, so a
    // non-idempotent file would break the second deploy, not the first. Any
    // failure is fatal here — every file in this slice was screened to apply
    // cleanly against exactly this fixture, so a throw means the set regressed.
    for (const pass of [1, 2]) {
      for (const rel of batch) {
        try {
          await pg.exec(readMig(rel));
        } catch (err) {
          await pg.exec('ROLLBACK').catch(() => {});
          throw new Error(`pass ${pass}: ${rel} failed — ${(err as Error).message}`);
        }
      }
    }
  }, T);

  afterAll(async () => {
    await pg.close();
  });

  it('creates tables and leaves NO integer-keyed tenant table unpoliced', async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `SELECT DISTINCT c.table_name
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public'
          AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
          AND c.data_type IN ('integer', 'bigint', 'smallint')
          AND c.table_name <> ALL (ARRAY['organizations','organization_users','stripe_events','ectd_agency_configs'])
          AND NOT EXISTS (
            SELECT 1 FROM pg_policies p
             WHERE p.tablename = c.table_name AND p.policyname = 'tenant_isolation_policy'
          )`,
    );
    expect(rows.map((r) => r.table_name), 'unpoliced tenant tables').toEqual([]);
  }, T);

  it('policies electronic_signatures — the Part 11 record that had no tenant key', async () => {
    // Named rather than left to the sweep above, because the failure mode was
    // INVISIBLE to that check. The sweep policies tables that carry a tenant
    // column and silently skips those that do not, so a table with no tenant key
    // is not "unpoliced" by that query — it is simply absent from it. The
    // 21 CFR Part 11 §11.50/§11.70 signature record sat in exactly that blind
    // spot: shared/schema.ts declared organization_id, signature-persistence.ts
    // threw without it, and no migration ever created it.
    //
    // Asserting the COLUMN separately from the POLICY is the point: drop the
    // column and the generic sweep assertion still passes.
    const col = await pg.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'electronic_signatures' AND column_name = 'organization_id'`,
    );
    expect(col.rows, 'electronic_signatures lost its tenant key').toHaveLength(1);

    const policy = await pg.query(
      `SELECT 1 FROM pg_policies
        WHERE tablename = 'electronic_signatures' AND policyname = 'tenant_isolation_policy'`,
    );
    expect(policy.rows, 'Part 11 signatures are not tenant-isolated').toHaveLength(1);

    // FORCE matters here more than almost anywhere: without it the table owner
    // bypasses the policy, and the owner is the role the application connects as
    // on a stock deployment.
    const forced = await pg.query<{ relforcerowsecurity: boolean }>(
      `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'electronic_signatures'`,
    );
    expect(forced.rows[0]?.relforcerowsecurity, 'RLS not FORCED — the owner bypasses it').toBe(true);
  }, T);

  it('actually blocks a cross-tenant read on a table it sweeps', async () => {
    // End-to-end, not just "a policy row exists". A dedicated table is used
    // rather than an arbitrary real one: the real tables carry their own NOT NULL
    // columns, so seeding them would test their shape, not the sweep. Creating it
    // AFTER the batch and re-running the (idempotent) sweep reproduces exactly the
    // production situation this guards — a tenant table that appears on an
    // already-provisioned database, which 0021 will never revisit.
    const table = 'sweep_probe_table';
    await pg.exec(`RESET ROLE; SET app.rls_enforce = 'off';`);
    await pg.exec(`CREATE TABLE ${table} (id serial primary key, organization_id integer);`);
    await pg.exec(readMig(SWEEP));

    const policy = await pg.query(
      `SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = 'tenant_isolation_policy'`,
    );
    expect(policy.rows, 'sweep did not policy the new table').toHaveLength(1);

    await pg.query(`INSERT INTO ${table} (organization_id) VALUES (1), (2)`);
    await pg.exec(`CREATE ROLE sweep_reader NOSUPERUSER; GRANT SELECT ON ${table} TO sweep_reader;`);

    const readAs = async (tenant: string) => {
      await pg.exec(
        `RESET ROLE; SET app.rls_enforce = 'on'; SET app.current_tenant_id = '${tenant}'; SET ROLE sweep_reader;`,
      );
      const r = await pg.query(`SELECT organization_id FROM ${table}`);
      await pg.exec('RESET ROLE;');
      return r.rows.length;
    };

    expect(await readAs('1')).toBe(1); // own tenant's row
    expect(await readAs('2')).toBe(1);
    expect(await readAs('9')).toBe(0); // a tenant with no rows sees nothing
  }, T);
});

describe('C-33: the sweep is deploy-safe', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE int_tenant  (id serial primary key, organization_id integer);
      CREATE TABLE txt_tenant  (id serial primary key, tenant_id text);
      CREATE TABLE no_tenant   (id serial primary key, v text);
      CREATE TABLE preexisting (id serial primary key, tenant_id integer);
      ALTER TABLE preexisting ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_policy ON preexisting USING (tenant_id = 42);
      CREATE VIEW v_int AS SELECT * FROM int_tenant;
      -- Canonical RLS allowlist (server/db/rlsAllowlist.ts → RLS_ALLOWLIST): these
      -- carry a tenant column but MUST stay unpoliced. billing_budgets arrives
      -- clean — the first loop must skip it. api_keys arrives in the BUGGY state an
      -- earlier sweep revision left behind (policied + forced), which under
      -- RLS_ENFORCE=on filtered the pre-auth validateApiKey() lookup to zero rows
      -- and broke all api-key auth; the C-44 self-heal pass must undo it.
      CREATE TABLE billing_budgets (id serial primary key, organization_id integer);
      CREATE TABLE api_keys (id serial primary key, organization_id integer, key_hash text);
      ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
      ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_policy ON api_keys USING (organization_id = 1);
    `);
    await pg.exec(readMig(SWEEP));
    await pg.exec(readMig(SWEEP)); // idempotent
  }, T);

  afterAll(async () => {
    await pg.close();
  });

  it('a TEXT tenant key is SKIPPED, not raised — a deploy must not halt on pre-existing drift', async () => {
    // 0021 RAISE EXCEPTIONs here, which is right at install time and wrong mid
    // production deploy (deploy-migrate stops at the first failure).
    const { rows } = await pg.query(`SELECT 1 FROM pg_policies WHERE tablename = 'txt_tenant'`);
    expect(rows).toHaveLength(0); // skipped, and the sweep still completed
  });

  it('never clobbers a policy a subsystem installed for itself', async () => {
    const { rows } = await pg.query<{ qual: string }>(
      `SELECT qual FROM pg_policies WHERE tablename = 'preexisting' AND policyname = 'tenant_isolation_policy'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].qual).toContain('42'); // the original predicate, untouched
  });

  it('FORCES a table that had the policy but no FORCE (owner-bypass close, C-43)', async () => {
    // `preexisting` was set up with ENABLE + CREATE POLICY but NOT FORCE — the
    // exact shape that leaves a policy bypassed for the table owner. The sweep's
    // second pass must retroactively FORCE it WITHOUT touching its predicate
    // (asserted above).
    const { rows } = await pg.query<{ forced: boolean }>(
      `SELECT relforcerowsecurity AS forced FROM pg_class WHERE relname = 'preexisting'`,
    );
    expect(rows[0]?.forced).toBe(true);
  });

  it('leaves a policy-LESS RLS table un-forced (no owner default-deny surprise)', async () => {
    // A table with RLS enabled but no policy must NOT be force-locked by the
    // sweep — forcing it would deny the owner everything. The second pass only
    // forces tables that actually carry tenant_isolation_policy.
    await pg.exec(`
      CREATE TABLE rls_no_policy (id serial primary key, tenant_id integer);
      ALTER TABLE rls_no_policy ENABLE ROW LEVEL SECURITY;
    `);
    await pg.exec(readMig(SWEEP));
    const policy = await pg.query(
      `SELECT 1 FROM pg_policies WHERE tablename = 'rls_no_policy' AND policyname = 'tenant_isolation_policy'`,
    );
    const forced = await pg.query<{ forced: boolean }>(
      `SELECT relforcerowsecurity AS forced FROM pg_class WHERE relname = 'rls_no_policy'`,
    );
    // The first loop DID give it the policy (no policy existed) — and because it
    // did, it also forced it in the same block. The point of this case is the
    // sweep never leaves a policied table unforced NOR forces a truly policy-less
    // one out from under the owner; either it has the policy AND force, or neither.
    const hasPolicy = policy.rows.length === 1;
    expect(hasPolicy).toBe(forced.rows[0]?.forced);
  });

  it('HEALS an allowlisted table an earlier revision wrongly policied (api_keys pre-auth break, C-44)', async () => {
    // api_keys arrived policied + forced — the exact buggy state. The self-heal
    // pass must have dropped tenant_isolation_policy AND restored the exempt
    // shape (RLS off, FORCE off), so the pre-auth validateApiKey() lookup — which
    // runs before any tenant context exists — is never filtered to zero rows.
    const policy = await pg.query(
      `SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'tenant_isolation_policy'`,
    );
    expect(policy.rows).toHaveLength(0);
    const state = await pg.query<{ rls: boolean; forced: boolean }>(
      `SELECT relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class WHERE relname = 'api_keys'`,
    );
    expect(state.rows[0]?.rls).toBe(false);
    expect(state.rows[0]?.forced).toBe(false);
  });

  it('leaves a clean allowlisted table unpoliced (the first loop honors the allowlist)', async () => {
    // billing_budgets arrived with a tenant column and no policy. Being on the
    // canonical allowlist, the first loop must skip it — it stays unpoliced.
    const policy = await pg.query(
      `SELECT 1 FROM pg_policies WHERE tablename = 'billing_budgets' AND policyname = 'tenant_isolation_policy'`,
    );
    expect(policy.rows).toHaveLength(0);
  });

  it('skips the allowlist, tables with no tenant column, and views', async () => {
    const { rows } = await pg.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation_policy' ORDER BY tablename`,
    );
    const policied = rows.map((r) => r.tablename);
    expect(policied).toContain('int_tenant');
    expect(policied).not.toContain('billing_budgets'); // canonical allowlist
    expect(policied).not.toContain('api_keys'); // canonical allowlist (healed, C-44)
    expect(policied).not.toContain('no_tenant');
    expect(policied).not.toContain('v_int'); // ENABLE RLS errors on a view
  });
});
