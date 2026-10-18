/**
 * A GRDHE row written without an actor is refused; it is not attributed to
 * 'system' (audit 2026-10-15, GRDHE follow-up 7).
 *
 * What the migration used to do: db/migrations/081_grdhe_regulatory_mapping_layer.sql
 * (deploy set, re-run every deploy) gave every actor column
 * DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
 * and create_export_job() fell back to 'system' for a caller that named no one.
 * Every GRDHE writer now names its actor (the service refuses without one), so
 * the fallback only ever served a writer that forgot.
 *
 * Kept, and reported: terminology_versions.created_by and
 * mapping_rules.created_by, whose only writer is this file's own seed, which
 * has no user to name.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/081_grdhe_regulatory_mapping_layer.sql'), 'utf8');
const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const SEEDED = ['mapping_rules.created_by', 'terminology_versions.created_by'];

const open = () => new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });

/** Every actor column, outside the seed's two, whose default names 'system'. */
async function systemDefaults(pg: PGlite): Promise<string[]> {
  const r = await pg.query<{ col: string }>(
    `SELECT table_name || '.' || column_name AS col FROM information_schema.columns
      WHERE table_schema = 'regulatory_harmonization' AND column_default LIKE '%''system''%'
        AND table_name NOT LIKE 'audit_log_%' ORDER BY 1`
  );
  return r.rows.map(row => row.col).filter(col => !SEEDED.includes(col));
}

describe('081_grdhe actor columns, applied on every deploy', () => {
  it("names no 'system' fallback on a fresh database deployed twice", async () => {
    const pg = open();
    try {
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      expect(await systemDefaults(pg)).toEqual([]);
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('drops the fallback from a database deployed before the amendment', async () => {
    const pg = open();
    try {
      await pg.exec(SQL);
      // As every deployed database has it.
      await pg.exec(`ALTER TABLE regulatory_harmonization.canonical_adverse_events
                       ALTER COLUMN created_by SET DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system');
                     ALTER TABLE regulatory_harmonization.audit_log
                       ALTER COLUMN user_id SET DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system')`);
      expect(await systemDefaults(pg)).toEqual(['audit_log.user_id', 'canonical_adverse_events.created_by']);
      await pg.exec(SQL);
      expect(await systemDefaults(pg)).toEqual([]);
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('refuses a case, an audit row and an export job that name no actor, instead of recording "system"', async () => {
    const pg = open();
    try {
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      await expect(
        pg.query(
          `INSERT INTO regulatory_harmonization.canonical_adverse_events (tenant_id, case_number, event_date, receive_date)
           VALUES ($1, 'CASE-001', DATE '2026-10-01', DATE '2026-10-02')`,
          [TENANT]
        )
      ).rejects.toThrow(/null value in column "created_by"/);

      await expect(
        pg.query(`SELECT regulatory_harmonization.log_audit('export_jobs', gen_random_uuid(), 'UPDATE', NULL, NULL, 'x')`)
      ).rejects.toThrow(/null value in column "user_id"/);

      await pg.query(`INSERT INTO regulatory_harmonization.tenant_data_residency (tenant_id, created_by) VALUES ($1, 'qa')`, [TENANT]);
      await pg.exec(`UPDATE regulatory_harmonization.mapping_rules SET approved_at = now() WHERE rule_code = 'FDA_AE_3500A_V1'`);
      await expect(
        pg.query(
          `SELECT regulatory_harmonization.create_export_job($1::uuid, 'adverse_event', ARRAY[gen_random_uuid()],
                  'FDA_3500A'::regulatory_harmonization.regulatory_format, 'FDA', NULL)`,
          [TENANT]
        )
      ).rejects.toThrow(/names no actor/);
      const jobs = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM regulatory_harmonization.export_jobs');
      expect(jobs.rows[0].n).toBe(0);
    } finally {
      await pg.close();
    }
  }, 120_000);
});
