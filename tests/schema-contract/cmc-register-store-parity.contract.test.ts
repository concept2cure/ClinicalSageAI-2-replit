/**
 * Schema contract: the CMC register store parity fix reaches provisioned
 * databases, and survives the ones that never had a batch table.
 *
 * WHY THIS EXISTS
 * ---------------
 * migrations/20260823_cmc_register_store_parity.sql (quality_specifications +
 * the columns server/api/cmc/batchRecordRoutes.ts writes) and
 * migrations/20260823_drop_dead_c2c_cmc_changes.sql sat in the root tree on no
 * durable applier for ten days. Root-tree files reach a FRESH install through
 * the overlay; an already-provisioned tenant database gets schema only from
 * C2C_MIGRATION_FILES. The manifest ratchet
 * (tests/ops/apply-c2c-migrations-manifest.test.mjs) caught the omission; this
 * file pins the wiring and the one real hazard wiring exposed:
 *
 *   cmc_batch_records is created ONLY by root migrations/0006 (fresh installs).
 *   A database upgraded by deploy-migrate may not have it. The parity file's
 *   `ALTER TABLE cmc_batch_records ...` block was unguarded, so on such a
 *   database it aborted with 42P01 — and deploy-migrate stops on the first
 *   failure, so every entry after it would have been skipped too.
 *
 * Neither file could honestly go on the manifest test's KNOWN_UNLISTED:
 * quality_specifications is declared in shared/cmc-schema.ts, cmc_batch_records
 * in shared/schema/regulatory-atoms.ts, and drizzle.config.ts pushes neither.
 *
 * @compliance ICH E6(R2) data integrity — the Module 3 specification and batch
 *             registers must exist on the databases the routes run against.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import {
  C2C_MIGRATION_FILES,
  TENANT_ISOLATION_SWEEP,
  UUID_TENANT_ISOLATION_NONPUBLIC,
} from '../../scripts/db/migration-set.mjs';
import { FK_PREREQUISITES } from './harness';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const PARITY = 'migrations/20260823_cmc_register_store_parity.sql';
const DROP = 'migrations/20260823_drop_dead_c2c_cmc_changes.sql';
const DROP_CREATOR = 'db/migrations/20260718_cmc_changes_store.sql';

/** Set entries the parity/drop pair must follow. */
const MUST_FOLLOW = [
  // specification_audit_log — the spec routes write it alongside every row
  'db/migrations/20260730_cmc_evidence_tables.sql',
  // cmc_change_controls — the store that superseded c2c_cmc_changes
  'db/migrations/20260730_cmc_change_control_store.sql',
  // adds tenant_id to cmc_batch_records where the table exists
  'db/migrations/20260401_cmc_convergence_os.sql',
];

/**
 * The fresh-install shape the parity file was written against. Only root 0006
 * creates cmc_batch_records; its FK targets are the two 20260730 reconstruction
 * creators (both on the set) plus organizations and stability_studies.
 * stability_studies is stubbed FK-target-only, the harness convention.
 */
const FRESH_INSTALL_FIXTURE = [
  'db/migrations/20260730_cmc_projects_reconstruction.sql',
  'db/migrations/20260730_manufacturing_processes_reconstruction.sql',
  'migrations/0006_regulatory_atoms.sql',
  'db/migrations/20260401_cmc_convergence_os.sql',
  'db/migrations/20260730_cmc_evidence_tables.sql',
];
const STABILITY_STUDIES_STUB = `CREATE TABLE IF NOT EXISTS stability_studies (id SERIAL PRIMARY KEY);`;

const BATCH_ROUTES = 'server/api/cmc/batchRecordRoutes.ts';
const SPEC_ROUTES = 'server/api/cmc/specificationRoutes.ts';

/** Column list of the first literal `INSERT INTO <table> (...)` in a source file. */
function insertColumns(src: string, table: string): string[] {
  const m = src.match(new RegExp(`INSERT INTO ${table}\\s*\\(([\\s\\S]*?)\\)`));
  expect(m, `no literal INSERT INTO ${table} found`).toBeTruthy();
  return m![1].split(',').map((c) => c.trim()).filter(Boolean);
}

/**
 * Columns assigned by every literal `UPDATE <table> SET ... WHERE` in a source
 * file. Statements built by interpolation (`${updates.join(...)}`) are skipped:
 * they are not SQL on their own.
 */
function updateColumns(src: string, table: string): string[] {
  const out = new Set<string>();
  const re = new RegExp(`UPDATE ${table}\\s+SET([\\s\\S]*?)\\bWHERE\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (/\$\{/.test(m[1])) continue;
    for (const a of m[1].matchAll(/(\w+)\s*=/g)) out.add(a[1]);
  }
  expect(out.size, `no literal UPDATE ${table} SET found`).toBeGreaterThan(0);
  return [...out];
}

async function columns(pg: PGlite, table: string): Promise<string[]> {
  const r = await pg.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((x) => x.column_name);
}

async function regclass(pg: PGlite, table: string): Promise<string | null> {
  const r = await pg.query<{ r: string | null }>(`SELECT to_regclass($1)::text AS r`, [`public.${table}`]);
  return r.rows[0]?.r ?? null;
}

const opened: PGlite[] = [];
async function fresh(): Promise<PGlite> {
  const pg = new PGlite();
  opened.push(pg);
  await pg.exec(FK_PREREQUISITES);
  return pg;
}
afterAll(async () => {
  await Promise.all(opened.map((p) => p.close()));
});

describe('A. both 20260823 root files are on the durable applier, in a workable order', () => {
  const at = (f: string) => C2C_MIGRATION_FILES.indexOf(f);

  it('lists the parity file and the drop file', () => {
    expect(at(PARITY), `${PARITY} is not in C2C_MIGRATION_FILES`).toBeGreaterThanOrEqual(0);
    expect(at(DROP), `${DROP} is not in C2C_MIGRATION_FILES`).toBeGreaterThanOrEqual(0);
  });

  it('orders them after their prerequisites', () => {
    for (const pre of MUST_FOLLOW) {
      expect(at(pre), `${pre} missing from the set`).toBeGreaterThanOrEqual(0);
      expect(at(PARITY), `${PARITY} must follow ${pre}`).toBeGreaterThan(at(pre));
      expect(at(DROP), `${DROP} must follow ${pre}`).toBeGreaterThan(at(pre));
    }
  });

  it('orders them before the isolation pair, so quality_specifications.tenant_id gets a policy', () => {
    for (const f of [PARITY, DROP]) {
      expect(at(f)).toBeLessThan(at(UUID_TENANT_ISOLATION_NONPUBLIC));
      expect(at(f)).toBeLessThan(at(TENANT_ISOLATION_SWEEP));
    }
  });

  it('no set entry re-creates c2c_cmc_changes after the drop (no create-then-drop-then-create loop)', () => {
    expect(C2C_MIGRATION_FILES).not.toContain(DROP_CREATOR);
    const after = C2C_MIGRATION_FILES.slice(Math.max(at(DROP), 0) + 1).filter((f: string) =>
      /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?c2c_cmc_changes\b/i.test(read(f)),
    );
    expect(after).toEqual([]);
  });
});

describe('B. the parity file survives a database that has NO cmc_batch_records', () => {
  it('every cmc_batch_records ALTER is IF EXISTS-guarded in the file text', () => {
    const alters = read(PARITY).match(/^\s*ALTER TABLE[^\n]*cmc_batch_records[^\n]*$/gim) ?? [];
    expect(alters.length).toBeGreaterThan(0);
    const unguarded = alters.filter((s) => !/ALTER TABLE IF EXISTS cmc_batch_records/i.test(s));
    expect(unguarded, 'unguarded ALTERs abort deploy-migrate with 42P01 on an upgraded database').toEqual([]);
  });

  it('applies twice (NOTICE, not abort) and still creates quality_specifications with tenant_id integer', async () => {
    const pg = await fresh();
    expect(await regclass(pg, 'cmc_batch_records')).toBeNull();
    await expect(pg.exec(read(PARITY))).resolves.toBeDefined();
    await expect(pg.exec(read(PARITY))).resolves.toBeDefined();

    expect(await regclass(pg, 'quality_specifications')).toBe('quality_specifications');
    const r = await pg.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'quality_specifications' AND column_name = 'tenant_id'`,
    );
    expect(r.rows[0]?.data_type).toBe('integer');
    // Honest outcome on such a database: the batch table is still absent (root
    // 0006 is fresh-install-only), rather than half-created by this file.
    expect(await regclass(pg, 'cmc_batch_records')).toBeNull();
  });
});

describe('C. on the fresh-install shape the parity file lands what the routes write', () => {
  let pg: PGlite;
  let beforeSecond: { batch: string[]; spec: string[] };

  async function setup() {
    pg = await fresh();
    await pg.exec(STABILITY_STUDIES_STUB);
    for (const f of FRESH_INSTALL_FIXTURE) await pg.exec(read(f));
    await pg.exec(read(PARITY));
    beforeSecond = { batch: await columns(pg, 'cmc_batch_records'), spec: await columns(pg, 'quality_specifications') };
    await pg.exec(read(PARITY)); // a deploy replays the whole set
  }

  it('cmc_batch_records carries every column batchRecordRoutes INSERTs and the release UPDATE SETs', async () => {
    await setup();
    const src = read(BATCH_ROUTES);
    const have = await columns(pg, 'cmc_batch_records');
    const want = [...new Set([...insertColumns(src, 'cmc_batch_records'), ...updateColumns(src, 'cmc_batch_records')])];
    expect(want.length).toBeGreaterThanOrEqual(14);
    expect(want.filter((c) => !have.includes(c)), 'columns the route writes but the table lacks').toEqual([]);
  });

  it('quality_specifications carries every column specificationRoutes INSERTs', async () => {
    const have = await columns(pg, 'quality_specifications');
    const want = insertColumns(read(SPEC_ROUTES), 'quality_specifications');
    expect(want.length).toBe(10);
    expect(want.filter((c) => !have.includes(c))).toEqual([]);
  });

  it('drops the cmc_projects FK so a program uuid outside cmc_projects is accepted', async () => {
    const fk = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.table_constraints
        WHERE table_name = 'cmc_batch_records' AND constraint_name = 'cmc_batch_records_project_id_fkey'`,
    );
    expect(fk.rows[0].n).toBe(0);
    await pg.exec(`INSERT INTO organizations (id, name) VALUES (1, 'org') ON CONFLICT DO NOTHING`);
    await expect(
      pg.query(
        `INSERT INTO cmc_batch_records (project_id, tenant_id, organization_id, batch_number, product_name, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['0f4c1a7e-6d7f-4d6a-9c2e-2b1f6a3d8e10', '1', 1, 'B-001', 'Product', 'in-progress'],
      ),
    ).resolves.toBeDefined();
  });

  it('a second apply is a no-op', async () => {
    expect(await columns(pg, 'cmc_batch_records')).toEqual(beforeSecond.batch);
    expect(await columns(pg, 'quality_specifications')).toEqual(beforeSecond.spec);
  });
});

describe('D. the drop file removes c2c_cmc_changes and is a no-op where it never existed', () => {
  it('drops the table its dead creator provisioned', async () => {
    const pg = await fresh();
    await pg.exec(read(DROP_CREATOR));
    expect(await regclass(pg, 'c2c_cmc_changes')).toBe('c2c_cmc_changes');
    await pg.exec(read(DROP));
    expect(await regclass(pg, 'c2c_cmc_changes')).toBeNull();
  });

  it('does not throw on a database that never carried it', async () => {
    const pg = await fresh();
    await expect(pg.exec(read(DROP))).resolves.toBeDefined();
    expect(await regclass(pg, 'c2c_cmc_changes')).toBeNull();
  });
});
