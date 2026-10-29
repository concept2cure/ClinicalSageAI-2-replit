/**
 * migrations/20260610_ivd_assessments.sql on the deploy set (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f2-ivd-completeness/).
 *
 * The store behind IvdAssessmentWorkbench (ivd_assessments and
 * ivd_generated_documents) was on no deploy applier: install-fresh created it,
 * a deployed database never got it, and the workbench's saves and lists failed
 * there. It now sits on C2C_MIGRATION_FILES, before the final sweep pair.
 *
 * Every entry of the set re-runs on every deploy (CLAUDE.md Rule 1), so this
 * pins what makes that safe for this file:
 *   - every statement is CREATE ... IF NOT EXISTS, with no DROP, ALTER or
 *     ADD CONSTRAINT, and no other migration in either root names these tables;
 *   - both tables are in public with organization_id INTEGER NOT NULL, so the
 *     integer sweep at the tail of the set polices them;
 *   - applied three times, the shape is unchanged and a saved row survives.
 *
 * Real DDL: the file itself and the sweep. Its only prerequisite is
 * `organizations`, which the base schema provides before the set runs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  C2C_MIGRATION_FILES,
  TENANT_ISOLATION_SWEEP,
  UUID_TENANT_ISOLATION_NONPUBLIC,
} from '../../scripts/db/migration-set.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const FILE = 'migrations/20260610_ivd_assessments.sql';
const TABLES = ['ivd_assessments', 'ivd_generated_documents'] as const;
const PROGRAM = '11111111-1111-4111-8111-111111111111';

let db: PGlite;
let savedId = '';

const shape = async () => ({
  columns: (await db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name, ordinal_position`,
    [TABLES],
  )).rows,
  indexes: (await db.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1) ORDER BY indexname`,
    [TABLES],
  )).rows,
  constraints: (await db.query<{ conname: string; def: string }>(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid IN ('public.ivd_assessments'::regclass, 'public.ivd_generated_documents'::regclass)
        AND contype IN ('p', 'f', 'u', 'c') ORDER BY conname`,
  )).rows,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
                 INSERT INTO organizations (id, name) VALUES (1, 'one'), (2, 'two');`);
  // The first deploy creates the store; a user saves into it.
  await db.exec(read(FILE));
  savedId = (await db.query<{ id: string }>(
    `INSERT INTO ivd_assessments (organization_id, program_id, assessment_type, title, inputs, result, verdict)
     VALUES (1, $1, 'ivdr_classification', 'Saved before the replay', '{"deviceName":"Assay"}', '{"classification":"C"}', 'C')
     RETURNING id`,
    [PROGRAM],
  )).rows[0].id;
  await db.query(`INSERT INTO ivd_generated_documents (organization_id, program_id, doc_type, title, payload)
                  VALUES (1, $1, 'fsn', 'FSN saved before the replay', '{"deviceName":"Assay"}')`, [PROGRAM]);
  // Two more deploys, each followed by the sweep, as the set runs it.
  await db.exec(read(TENANT_ISOLATION_SWEEP));
  await db.exec(read(FILE));
  await db.exec(read(TENANT_ISOLATION_SWEEP));
  await db.exec(read(FILE));
  await db.exec(read(TENANT_ISOLATION_SWEEP));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('20260610_ivd_assessments.sql is on the deploy set', () => {
  it('is an entry of C2C_MIGRATION_FILES, before the final sweep pair', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(FILE);
    expect(at, `${FILE} is on no deploy applier`).toBeGreaterThan(-1);
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
    expect(files[files.length - 1]).toBe(TENANT_ISOLATION_SWEEP);
  });

  it('is no longer in the deploy-path baseline', () => {
    const baseline = JSON.parse(read('scripts/ci/migration-deploy-path-baseline.json')) as { files: string[] };
    expect(baseline.files).not.toContain(FILE);
  });
});

describe('the file is replay-safe (CLAUDE.md Rule 1)', () => {
  it('creates only IF NOT EXISTS, and drops, alters or adds no constraint', () => {
    const body = read(FILE).replace(/--.*$/gm, '');
    const statements = body.split(';').map((s) => s.trim()).filter(Boolean);
    expect(statements.length).toBe(8);
    for (const s of statements) expect(s, s).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS /i);
    expect(body).not.toMatch(/\b(DROP|ALTER|ADD CONSTRAINT|TRUNCATE|DELETE|UPDATE)\b/i);
  });

  it('no other migration, in either root, creates or changes these tables', () => {
    const others: string[] = [];
    for (const dir of ['migrations', 'db/migrations']) {
      for (const f of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.sql'))) {
        const rel = `${dir}/${f}`;
        if (rel !== FILE && /\bivd_(assessments|generated_documents)\b/.test(read(rel))) others.push(rel);
      }
    }
    expect(others).toEqual([]);
  });

  it('both tables are in public with organization_id INTEGER NOT NULL', async () => {
    const rows = (await db.query<{ table_name: string; data_type: string; is_nullable: string }>(
      `SELECT table_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1) AND column_name = 'organization_id' ORDER BY table_name`,
      [TABLES],
    )).rows;
    expect(rows).toEqual([
      { table_name: 'ivd_assessments', data_type: 'integer', is_nullable: 'NO' },
      { table_name: 'ivd_generated_documents', data_type: 'integer', is_nullable: 'NO' },
    ]);
  });

  it('a third replay leaves the shape as it was', async () => {
    const before = await shape();
    expect(before.indexes.map((i) => i.indexname)).toEqual([
      'ivd_assessments_org_idx', 'ivd_assessments_pkey', 'ivd_assessments_program_idx', 'ivd_assessments_type_idx',
      'ivd_gendocs_org_idx', 'ivd_gendocs_program_idx', 'ivd_gendocs_type_idx', 'ivd_generated_documents_pkey',
    ]);
    expect(before.constraints.map((c) => c.def)).toEqual([
      'FOREIGN KEY (organization_id) REFERENCES organizations(id)',
      'PRIMARY KEY (id)',
      'FOREIGN KEY (organization_id) REFERENCES organizations(id)',
      'PRIMARY KEY (id)',
    ]);
    await db.exec(read(FILE));
    expect(await shape()).toEqual(before);
  });

  it('a record saved after the first deploy survives every replay', async () => {
    expect((await db.query(`SELECT title, program_id, verdict FROM ivd_assessments WHERE id = $1`, [savedId])).rows)
      .toEqual([{ title: 'Saved before the replay', program_id: PROGRAM, verdict: 'C' }]);
    expect((await db.query(`SELECT count(*)::int AS n FROM ivd_generated_documents`)).rows).toEqual([{ n: 1 }]);
  });
});

describe('the sweep polices the store', () => {
  it('each table has RLS enabled and forced, under one tenant_isolation_policy', async () => {
    const rows = (await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policies: number }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation_policy') AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1) ORDER BY c.relname`,
      [TABLES],
    )).rows;
    expect(rows).toEqual([
      { relname: 'ivd_assessments', relrowsecurity: true, relforcerowsecurity: true, policies: 1 },
      { relname: 'ivd_generated_documents', relrowsecurity: true, relforcerowsecurity: true, policies: 1 },
    ]);
  });
});
