/** The existing patient-profile creator repairs Drizzle bootstrap on replay,
 * while retaining all duplicate data for explicit reconciliation. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { rbmPatientProfiles } from '../../shared/schema';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const FILE = 'migrations/20260701_rbm_patient_profiles.sql';
const CREATOR = readFileSync(FILE, 'utf8');
const NAME = 'rbm_patient_profiles_organization_id_program_id_subject_id_key';
const PROGRAM = '11111111-2222-4333-8444-555555555555';
// This is the historical bootstrap omission, not a second production schema.
const WITHOUT_IDENTITY = CREATOR.slice(0, CREATOR.indexOf('CREATE UNIQUE INDEX'))
  .replace(/,\s*UNIQUE \(organization_id, program_id, subject_id\)/, '');
let pg: PGlite;
const replay = () => pg.transaction(tx => tx.exec(CREATOR));
const rows = async () => (await pg.query<Record<string, unknown>>('SELECT * FROM rbm_patient_profiles ORDER BY id')).rows;
const indexes = async () => (await pg.query<{ indexname: string; indexdef: string }>(`SELECT indexname,indexdef FROM pg_indexes
  WHERE tablename='rbm_patient_profiles' ORDER BY indexname`)).rows;
const upsert = (metrics: Record<string, number>, program: string | null = PROGRAM) => pg.query<{ id: number; metrics: Record<string, number> }>(`
  INSERT INTO rbm_patient_profiles(organization_id,program_id,subject_id,metrics) VALUES(1,$1,'S-01',$2::jsonb)
  ON CONFLICT(organization_id,program_id,subject_id) DO UPDATE
    SET metrics=rbm_patient_profiles.metrics || EXCLUDED.metrics RETURNING id,metrics`, [program, JSON.stringify(metrics)]);

beforeAll(async () => { pg = new PGlite(); await pg.exec('CREATE TABLE organizations(id integer PRIMARY KEY); INSERT INTO organizations VALUES(1);'); });
beforeEach(async () => { await pg.exec('DROP TABLE IF EXISTS rbm_patient_profiles CASCADE;'); });
afterAll(async () => { await pg?.close(); });

describe('the existing RBM patient identity agrees across model and deploy', () => {
  it('is already in the canonical replay set and is declared in the existing model', () => {
    expect(C2C_MIGRATION_FILES).toContain(FILE);
    const index = getTableConfig(rbmPatientProfiles).indexes.find(index => index.config.name === NAME);
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns.map(column => 'name' in column ? column.name : null))
      .toEqual(['organization_id', 'program_id', 'subject_id']);
  });
  it('fresh creation and two more replays retain the same index definitions', async () => {
    await replay(); const before = await indexes();
    await replay(); await replay();
    expect(await indexes()).toEqual(before);
    expect(before.filter(row => row.indexname === NAME)).toHaveLength(1);
  });
  it('repairs the historical bootstrap, then merges into one profile without erasing prior metrics', async () => {
    await pg.exec(WITHOUT_IDENTITY);
    await expect(upsert({ ae_count: 2 })).rejects.toMatchObject({ code: '42P10' });
    await replay(); await replay();
    const first = (await upsert({ ae_count: 2 })).rows[0];
    const second = (await upsert({ query_count: 3 })).rows[0];
    expect(second).toEqual({ id: first.id, metrics: { ae_count: 2, query_count: 3 } });
    expect(await rows()).toHaveLength(1);
  });
  it('keeps the original NULL-distinct behavior of unfiled legacy programs', async () => {
    await replay(); await upsert({ ae_count: 2 }, null); await upsert({ ae_count: 3 }, null);
    expect(await rows()).toHaveLength(2);
  });
  it('fails safely over existing conflicting triples and retains every row', async () => {
    await pg.exec(WITHOUT_IDENTITY);
    await pg.query(`INSERT INTO rbm_patient_profiles(organization_id,program_id,subject_id,metrics)
      VALUES(1,$1,'S-01','{"ae_count":2}'),(1,$1,'S-01','{"ae_count":3}')`, [PROGRAM]);
    const before = await rows();
    await expect(replay()).rejects.toMatchObject({ code: '23505' });
    expect(await rows()).toEqual(before);
  });
  it('recognizes a usable same-key index despite key order and included columns', async () => {
    await pg.exec(WITHOUT_IDENTITY);
    await pg.exec(`CREATE UNIQUE INDEX ${NAME} ON rbm_patient_profiles(subject_id,program_id,organization_id) INCLUDE(status)`);
    await replay(); await upsert({ ae_count: 2 }); await upsert({ query_count: 3 });
    expect(await rows()).toHaveLength(1);
  });
  it.each([
    `CREATE INDEX ${NAME} ON rbm_patient_profiles(organization_id,program_id,subject_id)`,
    `CREATE UNIQUE INDEX ${NAME} ON rbm_patient_profiles(organization_id,subject_id)`,
    `CREATE UNIQUE INDEX ${NAME} ON rbm_patient_profiles(organization_id,program_id,subject_id) WHERE deleted_at IS NULL`,
    `CREATE UNIQUE INDEX ${NAME} ON rbm_patient_profiles(organization_id,program_id,lower(subject_id))`,
    `CREATE UNIQUE INDEX ${NAME} ON rbm_patient_profiles(organization_id,program_id,subject_id) NULLS NOT DISTINCT`,
    `ALTER TABLE rbm_patient_profiles ADD CONSTRAINT ${NAME} UNIQUE(organization_id,program_id,subject_id) DEFERRABLE INITIALLY IMMEDIATE`,
  ])('refuses a wrong named index rather than reporting the repair complete: %s', async definition => {
    await pg.exec(WITHOUT_IDENTITY); await pg.exec(definition); const before = await indexes();
    await expect(replay()).rejects.toThrow('requires reconciliation');
    expect(await indexes()).toEqual(before); expect(await rows()).toEqual([]);
  });
  it('refuses an invalid named index without replacing it', async () => {
    await replay();
    await pg.query('UPDATE pg_index SET indisvalid=false WHERE indexrelid=$1::regclass', [NAME]);
    await expect(replay()).rejects.toThrow('requires reconciliation');
    expect((await pg.query<{ indisvalid: boolean }>('SELECT indisvalid FROM pg_index WHERE indexrelid=$1::regclass', [NAME])).rows)
      .toEqual([{ indisvalid: false }]);
  });
});
