/**
 * decision_records.recommendation_summary is nullable — on a fresh install and,
 * every deploy, on a database provisioned before.
 *
 * It was `TEXT NOT NULL`, and decisionRecordService.createDecision stored the
 * empty string for a summary nobody stated (2026-10-15), so "no summary was
 * given" could not be recorded. db/migrations/20260323_assumption_decision_
 * contradiction.sql is in C2C_MIGRATION_FILES and re-runs on every deploy
 * (CLAUDE.md RULE 1), so it is amended in place: the CREATE TABLE for new
 * databases, and a conditional block after it that relaxes the column where it
 * already exists. The real file runs here, twice.
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
      WHERE table_name = 'decision_records' AND column_name = 'recommendation_summary'`,
  );
  return r.rows[0];
}

/** A decision whose summary nobody stated. */
const UNSTATED = `
  INSERT INTO decision_records (organization_id, project_id, decision_code, title, domain_track,
      recommendation_type, decided_by)
  VALUES (3, 12, 'statistical_method', 'SAP generation for STUDY-1', 'biostatistics', 'statistical_method', '41')
  RETURNING recommendation_summary`;

describe('decision_records.recommendation_summary', () => {
  it('is nullable on a fresh install, and a re-run changes nothing', async () => {
    const pg = new PGlite();
    try {
      for (let run = 0; run < 2; run++) {
        await pg.exec(SQL);
        expect(await column(pg)).toEqual({ is_nullable: 'YES', column_default: null });
      }
      expect((await pg.query<{ recommendation_summary: string | null }>(UNSTATED)).rows[0].recommendation_summary).toBeNull();
    } finally {
      await pg.close();
    }
  }, T);

  it('becomes so on a database provisioned NOT NULL, keeps stored summaries, idempotently, every deploy', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(SQL);
      // The shape this file used to create.
      await pg.exec(`ALTER TABLE decision_records ALTER COLUMN recommendation_summary SET NOT NULL`);
      await pg.exec(UNSTATED.replace('decided_by)', 'decided_by, recommendation_summary)').replace("'41')", "'41', 'kept')"));
      expect(await column(pg)).toEqual({ is_nullable: 'NO', column_default: null });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(SQL);
        expect(await column(pg)).toEqual({ is_nullable: 'YES', column_default: null });
      }
      expect((await pg.query<{ recommendation_summary: string | null }>(UNSTATED)).rows[0].recommendation_summary).toBeNull();
      const kept = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM decision_records WHERE recommendation_summary = 'kept'`);
      expect(kept.rows[0].n).toBe(1);
    } finally {
      await pg.close();
    }
  }, T);
});
