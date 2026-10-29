/**
 * 20261029h_capa_source_deviation.sql (P-57): capa_source_chk admits a CAPA
 * raised from a deviation, keeps refusing what it refused, and a replay of the
 * file changes nothing (Rule 1: it replaces the constraint only while its
 * definition lacks 'deviation'). The table is the one 20260504_capa_mdr.sql
 * creates, reduced to the columns the CHECK reads.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let db: PGlite;
const MIGRATION = readFileSync('migrations/20261029h_capa_source_deviation.sql', 'utf8');
const definition = async () => (await db.query<{ def: string }>(
  `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'capa_source_chk'`)).rows[0]?.def ?? '';

beforeAll(async () => {
  db = new PGlite();
  // The constraint as 20260504_capa_mdr.sql defines it.
  await db.exec(`CREATE TABLE capa_records (id serial PRIMARY KEY, source varchar(32) NOT NULL,
    CONSTRAINT capa_source_chk CHECK (source IN
      ('complaint','internal_audit','external_audit','mdr','nonconformance',
       'management_review','supplier','inspection_finding','risk_review',
       'trend_signal','other')));
    INSERT INTO capa_records (source) VALUES ('nonconformance'), ('other');`);
});
afterAll(async () => { await db?.close(); });

describe('a CAPA may be raised from a deviation', () => {
  it('refuses a deviation source before, admits it after, and still refuses an unknown source', async () => {
    await expect(db.query(`INSERT INTO capa_records (source) VALUES ('deviation')`)).rejects.toThrow(/capa_source_chk/);
    await db.exec(MIGRATION);
    await db.query(`INSERT INTO capa_records (source) VALUES ('deviation')`);
    await expect(db.query(`INSERT INTO capa_records (source) VALUES ('rumour')`)).rejects.toThrow(/capa_source_chk/);
    expect((await db.query('SELECT count(*)::int AS n FROM capa_records')).rows).toEqual([{ n: 3 }]);
  });

  it('is a no-op on replay', async () => {
    const before = await definition();
    const oid = (await db.query<{ oid: number }>(`SELECT oid FROM pg_constraint WHERE conname = 'capa_source_chk'`)).rows[0].oid;
    await db.exec(MIGRATION);
    expect(await definition()).toBe(before);
    expect((await db.query<{ oid: number }>(`SELECT oid FROM pg_constraint WHERE conname = 'capa_source_chk'`)).rows[0].oid).toBe(oid);
  });
});
