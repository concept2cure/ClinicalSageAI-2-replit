/**
 * complaints.patient_harm and severity_assessment have no default — on a fresh
 * install and on a database provisioned before the change.
 *
 * They defaulted to 'none' and 'minor', and the intake triage computes MDR
 * reportability from patient_harm, so a complaint filed without a harm
 * assessment was classified "No harm reported — log under 820.198, no MDR".
 * The creator (migrations/20260504_capa_mdr.sql) is overlay-only, so it is
 * amended in place for fresh installs and
 * migrations/20261015_complaint_assessment_no_default.sql, in the deploy set,
 * drops the defaults where they already exist. Both run here as the real files.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const sql = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const CREATOR = sql('migrations/20260504_capa_mdr.sql');
const COMPANION = sql('migrations/20261015_complaint_assessment_no_default.sql');
const T = 120_000;

async function defaults(pg: PGlite): Promise<Record<string, string | null>> {
  const r = await pg.query<{ column_name: string; column_default: string | null }>(
    `SELECT column_name, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'complaints'
        AND column_name IN ('patient_harm', 'severity_assessment')`,
  );
  return Object.fromEntries(r.rows.map((row) => [row.column_name, row.column_default]));
}

/** A complaint insert that omits both assessments. */
const UNASSESSED = `
  INSERT INTO complaints (program_id, complaint_code, source, channel, received_at, event_narrative)
  VALUES (gen_random_uuid(), 'CMP-2026-0001', 'customer', 'email', now(), 'Device alarmed during use')`;

describe('complaint assessments have no default', () => {
  it('a fresh install declares none, and an insert without them fails rather than inventing them', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(CREATOR);
      await pg.exec(COMPANION);
      expect(await defaults(pg)).toEqual({ patient_harm: null, severity_assessment: null });
      await expect(pg.exec(UNASSESSED)).rejects.toThrow(/null value in column "(patient_harm|severity_assessment)"/);
    } finally {
      await pg.close();
    }
  }, T);

  it('a database provisioned before the change loses them on deploy, idempotently', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(CREATOR);
      // The shape the creator used to produce.
      await pg.exec(`ALTER TABLE complaints
        ALTER COLUMN patient_harm SET DEFAULT 'none',
        ALTER COLUMN severity_assessment SET DEFAULT 'minor'`);
      expect(await defaults(pg)).toEqual({
        patient_harm: "'none'::character varying",
        severity_assessment: "'minor'::character varying",
      });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(COMPANION);
        expect(await defaults(pg)).toEqual({ patient_harm: null, severity_assessment: null });
      }
      await expect(pg.exec(UNASSESSED)).rejects.toThrow(/null value in column/);
    } finally {
      await pg.close();
    }
  }, T);
});
