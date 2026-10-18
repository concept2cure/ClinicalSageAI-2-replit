/**
 * assumption_records.confidence_level is nullable with no default — on a fresh
 * install and, every deploy, on a database provisioned before.
 *
 * It was `TEXT NOT NULL ... DEFAULT 'moderate'`, and assumption-registry-service
 * defaulted a missing confidence to 'moderate' as well, so an assumption whose
 * confidence nobody stated was recorded as 'moderate' and "nobody said" could
 * not be stored. db/migrations/20260323_assumption_decision_contradiction.sql is
 * in C2C_MIGRATION_FILES and re-runs on every deploy (CLAUDE.md RULE 1), so it
 * is amended in place: the CREATE TABLE for new databases, and a conditional
 * block after it that relaxes the column where it already exists. The CHECK on
 * the values it may hold stays. The real file runs here, twice.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/20260323_assumption_decision_contradiction.sql'),
  'utf8',
);
const T = 60_000;

async function column(pg: PGlite) {
  const r = await pg.query<{ is_nullable: string; column_default: string | null }>(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'assumption_records' AND column_name = 'confidence_level'`,
  );
  return r.rows[0];
}

/** An assumption whose confidence nobody stated. */
const UNSTATED = `
  INSERT INTO assumption_records (organization_id, project_id, assumption_code, title, domain_track,
      category, assumed_value, rationale, source_type, created_by)
  VALUES (3, 12, 'ASM-ENR-001', 'Planned enrollment', 'biostatistics',
      'enrollment', '450', 'Protocol v2, section 9.2', 'protocol', '41')
  RETURNING confidence_level`;

describe('assumption_records.confidence_level', () => {
  it('is nullable with no default on a fresh install', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(SQL);
      expect(await column(pg)).toEqual({ is_nullable: 'YES', column_default: null });
      expect((await pg.query<{ confidence_level: string | null }>(UNSTATED)).rows[0].confidence_level).toBeNull();
    } finally {
      await pg.close();
    }
  }, T);

  it('becomes so on a database provisioned NOT NULL DEFAULT moderate, idempotently, every deploy', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(SQL);
      // The shape this file used to create.
      await pg.exec(`ALTER TABLE assumption_records ALTER COLUMN confidence_level SET DEFAULT 'moderate',
                                                    ALTER COLUMN confidence_level SET NOT NULL`);
      expect(await column(pg)).toEqual({ is_nullable: 'NO', column_default: "'moderate'::text" });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(SQL);
        expect(await column(pg)).toEqual({ is_nullable: 'YES', column_default: null });
      }
      expect((await pg.query<{ confidence_level: string | null }>(UNSTATED)).rows[0].confidence_level).toBeNull();
    } finally {
      await pg.close();
    }
  }, T);

  it('still refuses a value outside its vocabulary', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(SQL);
      await expect(
        pg.query(UNSTATED.replace("created_by)", 'created_by, confidence_level)').replace("'41')", "'41', 'provisional')")),
      ).rejects.toThrow(/assumption_records_confidence_level_check/);
    } finally {
      await pg.close();
    }
  }, T);
});
