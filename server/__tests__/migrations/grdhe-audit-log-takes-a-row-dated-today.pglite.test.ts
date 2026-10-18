/**
 * The GRDHE audit log takes a row dated today, on every deploy.
 *
 * What the migration used to do: db/migrations/081_grdhe_regulatory_mapping_layer.sql
 * (deploy set, re-run on every deploy) partitions regulatory_harmonization.audit_log
 * by partition_date, created partitions for 2026-01..2026-03 only and no DEFAULT
 * partition, and nothing created more. So from 2026-04-01 every log_audit() call
 * failed with `no partition of relation "audit_log" found for row` — after the
 * data-residency, terminology-mapping or adverse-event row it audits had been
 * saved (see server/services/grdhe/__tests__/grdhe-write-and-its-audit-row-commit-together.pglite.test.ts).
 *
 * Behind that, the audit hash: compute_content_hash() called pgcrypto's
 * digest() unqualified, and log_audit() and create_export_job() run with
 * search_path regulatory_harmonization, pg_catalog. pgcrypto lives in public,
 * so both failed in their audit insert with `function digest(text, unknown)
 * does not exist`. The hash is now core sha256(), with the same values.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/081_grdhe_regulatory_mapping_layer.sql'), 'utf8');
const ACTOR = 'qa.lead@sponsor.example';

const open = () => new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });

/** One audit row through log_audit(), attributed as the service attributes it, and where it landed. */
async function auditToday(pg: PGlite) {
  await pg.exec(`BEGIN; SELECT set_config('app.current_user_id', '${ACTOR}', true)`);
  try {
    await pg.query(
      `SELECT regulatory_harmonization.log_audit('canonical_adverse_events', gen_random_uuid(), 'INSERT', NULL, '{"caseNumber":"CASE-001"}'::jsonb, 'Adverse event created')`
    );
    await pg.exec('COMMIT');
  } catch (err) {
    await pg.exec('ROLLBACK');
    throw err;
  }
  return (
    await pg.query<{ partition: string; dated_today: boolean; user_id: string; entry_hash: string | null }>(
      `SELECT tableoid::regclass::text AS partition, partition_date = CURRENT_DATE AS dated_today, user_id, entry_hash
         FROM regulatory_harmonization.audit_log ORDER BY occurred_at DESC LIMIT 1`
    )
  ).rows[0];
}

describe('081_grdhe audit_log, applied on every deploy', () => {
  it('takes an audit row dated today on a fresh database deployed twice', async () => {
    const pg = open();
    try {
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      const row = await auditToday(pg);
      expect(row).toMatchObject({ partition: 'regulatory_harmonization.audit_log_default', dated_today: true, user_id: ACTOR });
      expect(row.entry_hash, 'the hash-chain trigger runs on the new partition').toBeTruthy();
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('gains the partition on the next deploy of a database deployed before the amendment', async () => {
    const pg = open();
    try {
      await pg.exec(SQL);
      // The state every deployed database was in: the three 2026-Q1 partitions, nothing else.
      await pg.exec('DROP TABLE IF EXISTS regulatory_harmonization.audit_log_default');
      await expect(auditToday(pg)).rejects.toThrow(/no partition of relation "audit_log" found for row/);
      await pg.exec(SQL);
      expect((await auditToday(pg)).partition).toBe('regulatory_harmonization.audit_log_default');
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('still files a row dated inside a range partition there, and chains the hashes of rows dated today', async () => {
    const pg = open();
    try {
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      await pg.query(
        `INSERT INTO regulatory_harmonization.audit_log (table_name, record_id, action, user_id, partition_date)
         VALUES ('export_jobs', gen_random_uuid(), 'UPDATE', $1, DATE '2026-02-10')`,
        [ACTOR]
      );
      const q1 = await pg.query<{ partition: string }>(
        `SELECT tableoid::regclass::text AS partition FROM regulatory_harmonization.audit_log WHERE partition_date = DATE '2026-02-10'`
      );
      expect(q1.rows).toEqual([{ partition: 'regulatory_harmonization.audit_log_y2026m02' }]);

      const first = await auditToday(pg);
      await auditToday(pg);
      const chain = await pg.query<{ previous_hash: string | null }>(
        `SELECT previous_hash FROM regulatory_harmonization.audit_log
          WHERE partition_date = CURRENT_DATE ORDER BY occurred_at DESC LIMIT 1`
      );
      expect(chain.rows[0].previous_hash).toBe(first.entry_hash);
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('hashes exactly as digest() did, so hashes already recorded still verify', async () => {
    const pg = open();
    try {
      await pg.exec(SQL);
      const samples = ['genesis|export_jobs|x|UPDATE', 'Müller — 5 µg\\n', '', '{"a": "\\u00e9"}'];
      for (const s of samples) {
        const r = await pg.query<{ same: boolean }>(
          `SELECT regulatory_harmonization.compute_content_hash($1) = encode(public.digest($1, 'sha256'), 'hex') AS same`,
          [s]
        );
        expect(r.rows[0].same, JSON.stringify(s)).toBe(true);
      }
    } finally {
      await pg.close();
    }
  }, 120_000);

  it('create_export_job writes its job and audit row under its own search_path, attributed to the caller', async () => {
    const pg = open();
    try {
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      const tenant = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
      await pg.query(
        `INSERT INTO regulatory_harmonization.tenant_data_residency (tenant_id, created_by) VALUES ($1, $2)`,
        [tenant, ACTOR]
      );
      await pg.exec(`UPDATE regulatory_harmonization.mapping_rules SET approved_at = now(), approved_by = 'qa.approver@sponsor.example'
                      WHERE rule_code = 'FDA_AE_3500A_V1'`);
      // The seeded rule's format, as the database enum spells it.
      const job = await pg.query<{ id: string }>(
        `SELECT regulatory_harmonization.create_export_job($1::uuid, 'adverse_event', ARRAY[gen_random_uuid()],
                'FDA_3500A'::regulatory_harmonization.regulatory_format, 'FDA', $2) AS id`,
        [tenant, ACTOR]
      );
      const audit = await pg.query<{ user_id: string; entry_hash: string }>(
        `SELECT user_id, entry_hash FROM regulatory_harmonization.export_job_audit_log WHERE job_id = $1`,
        [job.rows[0].id]
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].user_id).toBe(ACTOR);
      expect(audit.rows[0].entry_hash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await pg.close();
    }
  }, 120_000);
});
