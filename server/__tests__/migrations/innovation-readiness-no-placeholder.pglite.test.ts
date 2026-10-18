/**
 * No readiness score is answered where none is computed.
 *
 * innovation.calculate_readiness_score (db/migrations/072_gcc_innovation_
 * platform_core.sql, applied by install-fresh) returned a constant 75%
 * overall, 80% complete, 70% quality and "15 of 20 criteria met" for any
 * program — "-- Placeholder" — as SECURITY DEFINER. 072 is amended in place;
 * migrations/20261015g_… replaces the function on databases installed before
 * that. Both are run here for real, against PGlite.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** The function definition exactly as 072 creates it. */
const FROM_072 = (() => {
  const src = read('db/migrations/072_gcc_innovation_platform_core.sql');
  const start = src.indexOf('CREATE OR REPLACE FUNCTION innovation.calculate_readiness_score(');
  const end = src.indexOf('$$;', src.indexOf('AS $$', start));
  if (start < 0 || end < 0) throw new Error('innovation.calculate_readiness_score not found in its migration');
  return src.slice(start, end + 3);
})();
const REPLACEMENT = read('migrations/20261015g_innovation_readiness_score_refuses.sql');

/** What databases installed before 2026-10-15 hold. */
const PLACEHOLDER = `
CREATE OR REPLACE FUNCTION innovation.calculate_readiness_score(
  p_program_id UUID, p_submission_type VARCHAR, p_agency VARCHAR
) RETURNS TABLE (overall_score FLOAT, completeness_score FLOAT, quality_score FLOAT, criteria_met INT, criteria_total INT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT 75.0::FLOAT, 80.0::FLOAT, 70.0::FLOAT, 15::INT, 20::INT;
END;
$$;`;

const CALL = `SELECT * FROM innovation.calculate_readiness_score('00000000-0000-4000-8000-000000000001', 'IND', 'FDA')`;

async function withDb(fn: (pg: PGlite) => Promise<void>) {
  const pg = new PGlite();
  try {
    await fn(pg);
  } finally {
    await pg.close();
  }
}

describe('innovation.calculate_readiness_score', () => {
  it('as 072 creates it, refuses to answer a score it does not compute', () =>
    withDb(async (pg) => {
      await pg.exec(`CREATE SCHEMA innovation; ${FROM_072}`);
      await expect(pg.query(CALL)).rejects.toThrow(/computes no readiness/);
    }), 60_000);

  it('on a database installed earlier, is replaced by the deploy-set file, which re-runs harmlessly', () =>
    withDb(async (pg) => {
      await pg.exec(`CREATE SCHEMA innovation; ${PLACEHOLDER}`);
      const before = await pg.query<{ overall_score: number }>(CALL);
      expect(before.rows[0].overall_score).toBe(75); // the invented figure this removes
      await pg.exec(REPLACEMENT);
      await pg.exec(REPLACEMENT);
      await expect(pg.query(CALL)).rejects.toThrow(/computes no readiness/);
      const definer = await pg.query<{ prosecdef: boolean }>(
        `SELECT prosecdef FROM pg_proc WHERE proname = 'calculate_readiness_score'`);
      expect(definer.rows).toEqual([{ prosecdef: false }]);
    }), 60_000);

  it('the deploy-set file creates nothing where the function does not exist', () =>
    withDb(async (pg) => {
      await pg.exec(REPLACEMENT);
      const schemas = await pg.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'innovation'`);
      expect(schemas.rows).toEqual([]);
    }), 60_000);
});
