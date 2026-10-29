/**
 * 20261029_hf_engineering_files_program_key.sql: an HFE/UE file names the project
 * it belongs to, by key, and only a project of its own organization (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/device-features-human-factors/).
 *
 * Real DDL: regulatory_programs from 20260524 and hf_engineering_files from
 * 20260801. A file is recorded BEFORE the migration, with no project, as every
 * file was until now. It stays NULL: the organization's unscoped file, which no
 * project reads. Then the creators and the file are replayed, as every deploy
 * does (Rule 1), and the replay adds nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const KEY = 'migrations/20261029_hf_engineering_files_program_key.sql';
const CREATORS = ['migrations/20260524_program_workbench_schema.sql', 'db/migrations/20260801_hf_files_store.sql'];

const P1 = '11111111-1111-4111-8111-111111111111'; // organization 1
const P2 = '22222222-2222-4222-8222-222222222222'; // organization 2
const P3 = '33333333-3333-4333-8333-333333333333'; // organization 1, deleted later
const P_MISSING = '99999999-9999-4999-8999-999999999999';

let db: PGlite;
let legacyId = '';
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const file = (org: number, device: string, programId: string | null) =>
  db.query<{ id: string }>(
    `INSERT INTO hf_engineering_files (organization_id, device, program_id) VALUES ($1, $2, $3) RETURNING id`,
    [org, device, programId],
  );
const fileRow = async (id: string) =>
  (await db.query<{ program_id: string | null; organization_id: number }>(
    `SELECT program_id, organization_id FROM hf_engineering_files WHERE id = $1`, [id],
  )).rows[0];
const shape = async () => ({
  column: (await db.query<{ data_type: string; is_nullable: string }>(
    `SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'hf_engineering_files' AND column_name = 'program_id'`,
  )).rows,
  constraints: (await db.query<{ conname: string; convalidated: boolean; def: string }>(
    `SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'public.hf_engineering_files'::regclass AND contype = 'f' ORDER BY conname`,
  )).rows,
  indexes: (await db.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'hf_engineering_files' ORDER BY indexname`,
  )).rows,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
                 INSERT INTO organizations (id, name) VALUES (1, 'one'), (2, 'two'); INSERT INTO users (id, name) VALUES (5, 'u');`);
  for (const f of CREATORS) await db.exec(read(f));
  for (const [id, org, name] of [[P1, 1, 'Alpha'], [P2, 2, 'Beta'], [P3, 1, 'Gamma']] as const) {
    await db.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, $4, '510K', 'device', 'FDA', $5)`,
      [id, org, name, name, name],
    );
  }
  // The column does not exist yet: a file recorded the way every file was.
  legacyId = (await db.query<{ id: string }>(
    `INSERT INTO hf_engineering_files (organization_id, device) VALUES (1, 'Legacy pump') RETURNING id`,
  )).rows[0].id;
  // Two deploys: the file, then every creator and the file again.
  await db.exec(read(KEY));
  for (const f of CREATORS) await db.exec(read(f));
  await db.exec(read(KEY));
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe('20261029 on the applier', () => {
  it('runs after the files that create its table and the program key, and before the uuid and tenant sweeps', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(KEY);
    expect(at).toBeGreaterThan(-1);
    for (const before of [...CREATORS, 'migrations/20260926b_program_same_org_keys.sql']) {
      expect(files.indexOf(before), before).toBeGreaterThan(-1);
      expect(files.indexOf(before), before).toBeLessThan(at);
    }
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
  });

  it('a replay adds nothing: one nullable uuid column, one NOT VALID key that nulls only the program, one index', async () => {
    expect(await shape()).toEqual({
      column: [{ data_type: 'uuid', is_nullable: 'YES' }],
      constraints: [{
        conname: 'hf_engineering_files_program_same_org_fk', convalidated: false,
        def: 'FOREIGN KEY (program_id, organization_id) REFERENCES regulatory_programs(id, organization_id) ON DELETE SET NULL (program_id) NOT VALID',
      }],
      indexes: [
        expect.objectContaining({ indexname: 'hf_engineering_files_pkey' }),
        expect.objectContaining({ indexname: 'idx_hf_engineering_files_org' }),
        {
          indexname: 'idx_hf_engineering_files_org_program',
          indexdef: expect.stringMatching(
            /\(organization_id, program_id, created_at DESC\) WHERE \(\(deleted_at IS NULL\) AND \(program_id IS NOT NULL\)\)/,
          ),
        },
      ],
    });
  });

  it('a third replay is still a no-op on the shape', async () => {
    const before = await shape();
    await db.exec(read(KEY));
    expect(await shape()).toEqual(before);
  });
});

describe('existing files are the organization\'s unscoped files', () => {
  it('the file recorded before the column keeps no project, through every replay', async () => {
    expect(await fileRow(legacyId)).toEqual({ program_id: null, organization_id: 1 });
  });
});

describe('from here on the database holds the key', () => {
  it('a file naming its own organization\'s project is written', async () => {
    expect(await code(file(1, 'Alpha pump', P1))).toBe('ok');
  });

  it('a file naming another organization\'s project, or a missing one, is refused', async () => {
    expect(await code(file(1, 'Cross pump', P2))).toBe('23503');
    expect(await code(file(1, 'Ghost pump', P_MISSING))).toBe('23503');
    expect(await code(db.query(`UPDATE hf_engineering_files SET program_id = $1 WHERE id = $2`, [P2, legacyId]))).toBe('23503');
  });

  it('deleting a project unbinds its files and keeps their organization', async () => {
    const id = (await file(1, 'Gamma pump', P3)).rows[0].id;
    await db.query(`DELETE FROM regulatory_programs WHERE id = $1`, [P3]);
    expect(await fileRow(id)).toEqual({ program_id: null, organization_id: 1 });
  });
});
