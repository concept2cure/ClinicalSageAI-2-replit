/**
 * ana_platform_wisdom.confidence_score is nullable with no default — on a fresh
 * install and, every deploy, on a database provisioned before.
 *
 * It was `REAL NOT NULL DEFAULT 0.5`, and the wisdom engine stamped
 * min(0.95, 0.5 + 0.05·organizations) into it; nothing measured a confidence,
 * so "nothing measured it" could not be stored. migrations/0013_ana_
 * intelligence_system.sql is in C2C_MIGRATION_FILES and re-runs on every deploy
 * (CLAUDE.md RULE 1), so it is amended in place: the CREATE TABLE for new
 * databases, and a conditional block after it that relaxes the column where it
 * already exists. The real file runs here, twice.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const FILE = 'migrations/0013_ana_intelligence_system.sql';
const SQL = fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const T = 60_000;

/** What the file references and does not create. */
const PREREQS = `
  CREATE TABLE organizations (id serial PRIMARY KEY);
  CREATE TABLE projects (id serial PRIMARY KEY);
  CREATE TABLE users (id serial PRIMARY KEY);`;

const UNMEASURED = { is_nullable: 'YES', column_default: null };

async function column(pg: PGlite) {
  const r = await pg.query<{ is_nullable: string; column_default: string | null }>(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'ana_platform_wisdom' AND column_name = 'confidence_score'`,
  );
  return r.rows[0];
}

/** A pattern written with no confidence stated. */
const UNSTATED = `
  INSERT INTO ana_platform_wisdom (wisdom_key, category, pattern_description, recommendation, evidence_count)
  VALUES ('draft_m27:FDA:IND:success', 'success_pattern', 'draft_m27 succeeds', 'Continue', 12)
  RETURNING confidence_score`;

describe(FILE, () => {
  it('is in the deploy set', () => {
    expect((C2C_MIGRATION_FILES as readonly unknown[]).includes(FILE)).toBe(true);
  });

  it('creates confidence_score nullable with no default, and a re-run changes nothing', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PREREQS);
      for (let run = 0; run < 2; run++) {
        await pg.exec(SQL);
        expect(await column(pg)).toEqual(UNMEASURED);
      }
      expect((await pg.query<{ confidence_score: number | null }>(UNSTATED)).rows[0].confidence_score).toBeNull();
    } finally {
      await pg.close();
    }
  }, T);

  it('relaxes a table provisioned NOT NULL DEFAULT 0.5, keeps stored values, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PREREQS);
      await pg.exec(SQL);
      // The shape this file used to create.
      await pg.exec(`ALTER TABLE ana_platform_wisdom ALTER COLUMN confidence_score SET DEFAULT 0.5,
                                                   ALTER COLUMN confidence_score SET NOT NULL`);
      await pg.exec(`INSERT INTO ana_platform_wisdom (wisdom_key, category, pattern_description, recommendation, confidence_score)
                     VALUES ('stored', 'risk_reduction', 'p', 'r', 0.65)`);
      expect(await column(pg)).toEqual({ is_nullable: 'NO', column_default: '0.5' });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(SQL);
        expect(await column(pg)).toEqual(UNMEASURED);
      }
      expect((await pg.query<{ confidence_score: number | null }>(UNSTATED)).rows[0].confidence_score).toBeNull();
      const stored = await pg.query<{ c: number }>(`SELECT confidence_score AS c FROM ana_platform_wisdom WHERE wisdom_key = 'stored'`);
      expect(stored.rows[0].c).toBeCloseTo(0.65, 5);
    } finally {
      await pg.close();
    }
  }, T);
});
