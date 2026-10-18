/** The fresh install's real required-object verifier must accept the report
 * tenant index repair without relaxing any table, FK or RLS requirement. */
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { immutableReportRecords } from '../../shared/schema';
import { C2C_MIGRATION_FILES, CHILD_TABLE_PARENT_SCOPE, TENANT_ISOLATION_SWEEP, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repairPath = 'migrations/20261014_immutable_report_tenant_index.sql';
const installer = fs.readFileSync(path.join(root, 'scripts/db/install-fresh.mjs'), 'utf8');
const repairSQL = () => fs.readFileSync(path.join(root, repairPath), 'utf8');

type Verdict = { shortfalls: string[]; lines: string[] };

/** Run the canonical verifier, not a rewritten approximation of its query. */
async function verifyReportContract(database: PGlite): Promise<Verdict> {
  const contractStart = installer.indexOf('const REQUIRED_OBJECT_CONTRACT = [');
  const contractEnd = installer.indexOf('\n];', contractStart) + 3;
  const functionStart = installer.indexOf('async function verifyRequiredObjects() {');
  const functionEnd = installer.indexOf('\nasync function step(', functionStart);
  if (contractStart < 0 || contractEnd < contractStart || functionStart < 0 || functionEnd < functionStart) throw new Error('Canonical required-object verifier not found.');
  const contracts = vm.runInNewContext(`${installer.slice(contractStart, contractEnd)}; REQUIRED_OBJECT_CONTRACT.filter(c => c.table === 'immutable_report_records');`);
  if (contracts.length !== 1) throw new Error('Canonical report contract not found.');
  const verify = vm.runInNewContext(`${installer.slice(functionStart, functionEnd)}; verifyRequiredObjects;`, {
    REQUIRED_OBJECT_CONTRACT: contracts,
    pool: { query: (sql: string, params?: unknown[]) => database.query(sql, params) },
    sourceOf: () => 'drizzle-kit push plus tenant-index repair',
  });
  return verify();
}

async function reportFixture(database: PGlite): Promise<void> {
  await database.exec(`
    CREATE TABLE organizations (id INTEGER PRIMARY KEY);
    CREATE TABLE projects (id INTEGER PRIMARY KEY);
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE immutable_report_records (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      project_id INTEGER REFERENCES projects(id), sealed_by_id INTEGER REFERENCES users(id),
      report_uuid UUID NOT NULL, report_code TEXT NOT NULL, seal_status TEXT NOT NULL,
      content_hash TEXT, previous_hash TEXT, content JSON NOT NULL
    );
    ALTER TABLE immutable_report_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_policy ON immutable_report_records
      USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer);
    -- An index with the tenant second is insufficient for the exact contract.
    CREATE INDEX report_status_tenant_probe ON immutable_report_records (seal_status, organization_id);
    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO immutable_report_records VALUES
      (1, 1, NULL, NULL, '00000000-0000-4000-8000-000000000001', 'RPT-A', 'sealed', 'hash-a', NULL, '{"title":"First stored report"}'),
      (2, 2, NULL, NULL, '00000000-0000-4000-8000-000000000002', 'RPT-B', 'draft', 'hash-b', 'hash-a', '{"title":"Second stored report"}');
  `);
}

const snapshot = async (database: PGlite) => ({
  rows: (await database.query('SELECT to_jsonb(r) AS row FROM immutable_report_records r ORDER BY id')).rows,
  columns: (await database.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'immutable_report_records' ORDER BY ordinal_position")).rows,
  policies: (await database.query("SELECT policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'immutable_report_records'")).rows,
});

describe('immutable report tenant index repair', () => {
  it('reproduces the inherited exact required-object failure when the leading tenant index is missing', async () => {
    const database = await PGlite.create();
    try {
      await reportFixture(database);
      expect((await verifyReportContract(database)).shortfalls).toEqual([
        'immutable_report_records incomplete — missing index on organization_id (Report OS sealed records (Part 11 immutable report spine))',
      ]);
    } finally { await database.close(); }
  });

  it('applies the actual repair twice, satisfies that verifier and preserves stored rows, columns and RLS', async () => {
    const database = await PGlite.create();
    try {
      await reportFixture(database);
      const before = await snapshot(database);
      await database.exec(repairSQL());
      expect((await verifyReportContract(database)).shortfalls).toEqual([]);
      await database.exec(repairSQL());
      expect((await verifyReportContract(database)).shortfalls).toEqual([]);
      expect(await snapshot(database)).toEqual(before);
      const indexes = await database.query(`
        SELECT i.relname AS name, idx.indisvalid AS valid, idx.indisunique AS unique,
               a.attname AS leading_column, am.amname AS method
          FROM pg_index idx JOIN pg_class t ON t.oid = idx.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_class i ON i.oid = idx.indexrelid JOIN pg_am am ON am.oid = i.relam
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = idx.indkey[0]
         WHERE n.nspname = 'public' AND t.relname = 'immutable_report_records' AND i.relname = 'irr_org_idx'`);
      expect(indexes.rows).toEqual([{ name: 'irr_org_idx', valid: true, unique: false, leading_column: 'organization_id', method: 'btree' }]);
      await database.exec('DROP INDEX irr_org_idx');
      const afterDrop = await verifyReportContract(database);
      expect(() => expect(afterDrop.shortfalls).toEqual([])).toThrow();
      expect(afterDrop.shortfalls).toEqual([
        'immutable_report_records incomplete — missing index on organization_id (Report OS sealed records (Part 11 immutable report spine))',
      ]);
    } finally { await database.close(); }
  });

  it('fails closed if the canonical base table was never provisioned', async () => {
    const database = await PGlite.create();
    try { await expect(database.exec(repairSQL())).rejects.toThrow(/immutable_report_records/); }
    finally { await database.close(); }
  });

  it('reaches fresh install and deployment exactly once before the unchanged isolation tail', () => {
    expect(C2C_MIGRATION_FILES.filter(file => file === repairPath)).toHaveLength(1);
    expect(C2C_MIGRATION_FILES.indexOf(repairPath)).toBeLessThan(C2C_MIGRATION_FILES.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC));
    expect(C2C_MIGRATION_FILES.slice(-3)).toEqual([UUID_TENANT_ISOLATION_NONPUBLIC, CHILD_TABLE_PARENT_SCOPE, TENANT_ISOLATION_SWEEP]);
    const overlayStart = installer.indexOf('    const rlsSet = new Set(RLS_MIGRATIONS);');
    const overlayEnd = installer.indexOf('\n    const isDuplicate = ', overlayStart);
    expect(overlayStart).toBeGreaterThan(0);
    expect(overlayEnd).toBeGreaterThan(overlayStart);
    const files = vm.runInNewContext(`${installer.slice(overlayStart, overlayEnd)}; files;`, {
      fs, MIGRATIONS_DIR: path.join(root, 'migrations'), RLS_MIGRATIONS: [],
    });
    expect(files).toContain(path.basename(repairPath));
  });

  it('repairs the existing canonical model index without changing table or column definitions', () => {
    const modelIndex = getTableConfig(immutableReportRecords).indexes.find(index => index.config.name === 'irr_org_idx');
    expect(modelIndex?.config.columns[0]).toMatchObject({ name: 'organization_id' });
    expect(repairSQL()).toMatch(/CREATE INDEX IF NOT EXISTS irr_org_idx\s+ON public\.immutable_report_records\s*\(organization_id\)/);
    expect(repairSQL()).not.toMatch(/\b(?:CREATE TABLE|ALTER TABLE|DROP|INSERT|UPDATE|DELETE)\b/i);
    expect(repairSQL().split('\n').slice(0, 40).join('\n')).toContain('eCTD REGULATORY AUDIT CONTEXT');
  });
});
