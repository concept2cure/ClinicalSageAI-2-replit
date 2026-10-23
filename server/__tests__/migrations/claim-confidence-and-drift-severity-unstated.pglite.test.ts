/**
 * A claim nobody scored is stored unscored, and a drift nobody rated cannot be
 * stored as 'medium' — on a fresh install and on every database deployed before.
 *
 * ── What the schema used to do (until 2026-10-15) ───────────────────────────
 * evidence_claims.confidence was `NUMERIC(3,2) NOT NULL DEFAULT 0.50`
 * (shared/schema.ts, which install-fresh pushes, and db/migrations/20260319_
 * evidence_fabric.sql), so a claim written with no confidence read back as 0.5
 * and reconcileClaim established its governed fact "at 0.5".
 * fact_drift.severity was `NOT NULL DEFAULT 'medium'` (migrations/20260603_
 * living_record_spine.sql and its drizzle twin), so a writer that rated nothing
 * stored a medium drift. Both creators are amended in place, but neither runs on
 * a deploy; migrations/20261015m_… is the deploy-set file that relaxes the
 * columns where an earlier install created them. The real files run here, twice.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';
import { evidenceClaims } from '../../../shared/schema';
import { factDrift } from '../../../shared/schema/living-record-spine';

const COMPANION = 'migrations/20261015m_claim_confidence_and_drift_severity_unstated.sql';
const SPINE = 'migrations/20260603_living_record_spine.sql';
const FABRIC = 'db/migrations/20260319_evidence_fabric.sql';
/** The file's text, or '' when it does not exist (so the assertion, not the import, says what is missing). */
const read = (rel: string) => {
  const file = path.join(process.cwd(), rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};
const T = 120_000;

type Shape = { is_nullable: string; column_default: string | null };
async function shape(pg: PGlite, table: string, columnName: string): Promise<Shape> {
  const r = await pg.query<Shape>(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, columnName],
  );
  return r.rows[0];
}

/** The two columns as installs before 2026-10-15 created them. */
const OLD_SHAPES = `
  CREATE TABLE evidence_claims (
    id serial PRIMARY KEY, claim_text text NOT NULL,
    confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50
  );
  CREATE TABLE fact_drift (
    id serial PRIMARY KEY, drift_type varchar(24) NOT NULL,
    severity varchar(12) NOT NULL DEFAULT 'medium'
  );`;

describe(COMPANION, () => {
  it('is in the deploy set, ahead of the isolation tail', () => {
    const files = C2C_MIGRATION_FILES as readonly unknown[];
    const at = files.indexOf(COMPANION);
    expect(at, 'the companion is not in C2C_MIGRATION_FILES').toBeGreaterThan(-1);
    expect(at).toBeLessThan(files.length - 3);
  });

  it('carries the audit header in its first 40 lines', () => {
    expect(read(COMPANION).split('\n').slice(0, 40).join('\n')).toContain('eCTD REGULATORY AUDIT CONTEXT');
  });

  it('relaxes both columns on a database installed before, keeps stored values, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(OLD_SHAPES);
      await pg.exec(`INSERT INTO evidence_claims (claim_text, confidence) VALUES ('scored', 0.9)`);
      await pg.exec(`INSERT INTO evidence_claims (claim_text) VALUES ('defaulted')`);
      await pg.exec(`INSERT INTO fact_drift (drift_type, severity) VALUES ('value_mismatch', 'high')`);

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(read(COMPANION));
        expect(await shape(pg, 'evidence_claims', 'confidence'), 'a claim with no score is stored at 0.50')
          .toEqual({ is_nullable: 'YES', column_default: null });
        expect(await shape(pg, 'fact_drift', 'severity'), "an unrated drift is stored as 'medium'")
          .toEqual({ is_nullable: 'NO', column_default: null });
      }

      await pg.exec(`INSERT INTO evidence_claims (claim_text) VALUES ('unscored')`);
      const claims = await pg.query(`SELECT claim_text, confidence::text AS confidence FROM evidence_claims ORDER BY id`);
      expect(claims.rows).toEqual([
        { claim_text: 'scored', confidence: '0.90' },
        { claim_text: 'defaulted', confidence: '0.50' },
        { claim_text: 'unscored', confidence: null },
      ]);
      // A drift must say how it was rated ('unrated' included); it is not filled in.
      await expect(pg.exec(`INSERT INTO fact_drift (drift_type) VALUES ('value_mismatch')`)).rejects.toThrow(/null value/);
      const drift = await pg.query(`SELECT severity FROM fact_drift`);
      expect(drift.rows).toEqual([{ severity: 'high' }]);
    } finally {
      await pg.close();
    }
  }, T);

  it('does nothing on a database without the tables', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(read(COMPANION));
      const r = await pg.query<{ c: string | null; d: string | null }>(
        `SELECT to_regclass('public.evidence_claims')::text AS c, to_regclass('public.fact_drift')::text AS d`);
      expect(r.rows[0]).toEqual({ c: null, d: null });
    } finally {
      await pg.close();
    }
  }, T);
});

describe('the creators, amended in place', () => {
  it('the drizzle definitions declare neither default', () => {
    const confidence = getTableConfig(evidenceClaims).columns.find(c => c.name === 'confidence')!;
    expect([confidence.notNull, confidence.hasDefault], 'evidence_claims.confidence NOT NULL DEFAULT 0.50').toEqual([false, false]);
    const severity = getTableConfig(factDrift).columns.find(c => c.name === 'severity')!;
    expect([severity.notNull, severity.hasDefault], "fact_drift.severity DEFAULT 'medium'").toEqual([true, false]);
  });

  it(`${FABRIC} creates evidence_claims.confidence nullable with no default, and a re-run changes nothing`, async () => {
    const pg = new PGlite();
    try {
      for (let run = 0; run < 2; run++) {
        await pg.exec(read(FABRIC));
        expect(await shape(pg, 'evidence_claims', 'confidence')).toEqual({ is_nullable: 'YES', column_default: null });
      }
      expect(read(FABRIC).split('\n').slice(0, 40).join('\n')).toContain('eCTD REGULATORY AUDIT CONTEXT');
    } finally {
      await pg.close();
    }
  }, T);

  it(`${SPINE} creates fact_drift.severity with no default, relaxes the original, and re-runs as a no-op`, async () => {
    const PREREQS = `
      CREATE TABLE regulatory_programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE evidence_claims (id serial PRIMARY KEY, program_id integer);`;
    const fresh = new PGlite();
    try {
      await fresh.exec(PREREQS);
      for (let run = 0; run < 2; run++) {
        await fresh.exec(read(SPINE));
        expect(await shape(fresh, 'fact_drift', 'severity')).toEqual({ is_nullable: 'NO', column_default: null });
      }
    } finally {
      await fresh.close();
    }

    const earlier = new PGlite();
    try {
      await earlier.exec(PREREQS);
      await earlier.exec(read(SPINE));
      // The default the file used to create.
      await earlier.exec(`ALTER TABLE fact_drift ALTER COLUMN severity SET DEFAULT 'medium'`);
      for (let run = 0; run < 2; run++) {
        await earlier.exec(read(SPINE));
        expect(await shape(earlier, 'fact_drift', 'severity')).toEqual({ is_nullable: 'NO', column_default: null });
      }
    } finally {
      await earlier.close();
    }
  }, T);
});
