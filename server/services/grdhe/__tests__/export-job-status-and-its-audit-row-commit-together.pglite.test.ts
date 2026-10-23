/**
 * An export job's status change or completion, and its export_job_audit_log
 * row, are committed together, or neither is (GRDHE follow-up 6, 2026-10-15).
 *
 * What the service used to do: updateExportJobStatus and completeExportJob ran
 * their UPDATE on its own (autocommit) and only then inserted the audit row, as
 * a second statement. When that insert failed — as every one did while the
 * audit hash called digest() unqualified — the job stayed cancelled, failed or
 * completed (completed_by, output hash and size recorded) with no audit row,
 * and the caller was told the write failed.
 *
 * The service is real and runs on PGlite through drizzle, over the real
 * db/migrations/081_grdhe_regulatory_mapping_layer.sql. A failed audit insert
 * is stood in for by a trigger that raises on export_job_audit_log.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../db', () => ({
  get db() {
    return holder.db;
  },
}));

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/081_grdhe_regulatory_mapping_layer.sql'), 'utf8');
const ACTOR = 'qa.lead@sponsor.example';
const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const OUTPUT = { fileName: 'CASE-001.xml', content: '<ichicsr lang="en"/>' };

let pg: PGlite;
let service: typeof import('../grdheService').grdheService;

/** A pending job, written as create_export_job writes one (the enum spells the format FDA_3500A). */
async function pendingJob(): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `INSERT INTO regulatory_harmonization.export_jobs
       (tenant_id, source_entity_type, source_entity_ids, source_entity_count, target_format, target_jurisdiction, status, created_by)
     VALUES ($1, 'adverse_event', ARRAY[gen_random_uuid()], 1, 'FDA_3500A', 'FDA', 'pending', $2) RETURNING id`,
    [TENANT, ACTOR]
  );
  return r.rows[0].id;
}

const job = async (id: string) =>
  (
    await pg.query<{ status: string; error_message: string | null; completed_by: string | null; output_file_hash: string | null }>(
      'SELECT status, error_message, completed_by, output_file_hash FROM regulatory_harmonization.export_jobs WHERE id = $1',
      [id]
    )
  ).rows[0];

const auditRows = async (id: string) =>
  (
    await pg.query<{ action: string; user_id: string }>(
      'SELECT action, user_id FROM regulatory_harmonization.export_job_audit_log WHERE job_id = $1 ORDER BY occurred_at',
      [id]
    )
  ).rows;

/** Every export_job_audit_log insert fails while `run` runs. */
async function withAuditInsertsFailing(run: () => Promise<void>) {
  await pg.exec(`
    CREATE FUNCTION regulatory_harmonization.test_export_audit_down() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'export audit store unavailable'; END $$;
    CREATE TRIGGER test_export_audit_down BEFORE INSERT ON regulatory_harmonization.export_job_audit_log
      FOR EACH ROW EXECUTE FUNCTION regulatory_harmonization.test_export_audit_down();`);
  try {
    await run();
  } finally {
    await pg.exec(`
      DROP TRIGGER test_export_audit_down ON regulatory_harmonization.export_job_audit_log;
      DROP FUNCTION regulatory_harmonization.test_export_audit_down();`);
  }
}

/** The database's own message, under drizzle's "Failed query" wrapper. */
const databaseMessage = async (write: Promise<unknown>): Promise<string> => {
  const err = (await write.then(() => null, (e: unknown) => e)) as { message?: string; cause?: { message?: string } } | null;
  return String(err?.cause?.message ?? err?.message ?? 'resolved');
};

beforeAll(async () => {
  pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
  await pg.exec(SQL);
  holder.db = drizzle(pg);
  // Imported after the handle exists: the service captures `db` when it loads.
  service = (await import('../grdheService')).grdheService;
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe('an export job status change and its audit row commit together', () => {
  it('keeps no status change whose audit row could not be written', async () => {
    const id = await pendingJob();
    await withAuditInsertsFailing(async () => {
      expect(await databaseMessage(service.updateExportJobStatus(TENANT, id, 'cancelled', { errorMessage: 'duplicate' }, ACTOR))).toMatch(
        /export audit store unavailable/
      );
    });
    expect(await job(id), 'an unaudited status change was kept').toMatchObject({ status: 'pending', error_message: null });
    expect(await auditRows(id)).toEqual([]);
  });

  it('keeps no completion whose audit row could not be written', async () => {
    const id = await pendingJob();
    await withAuditInsertsFailing(async () => {
      expect(await databaseMessage(service.completeExportJob(TENANT, id, OUTPUT, ACTOR))).toMatch(/export audit store unavailable/);
    });
    expect(await job(id), 'an unaudited completion was kept').toMatchObject({
      status: 'pending',
      completed_by: null,
      output_file_hash: null,
    });
    expect(await auditRows(id)).toEqual([]);
  });

  it('writes a status change with its audit row, attributed to the caller', async () => {
    const id = await pendingJob();
    await service.updateExportJobStatus(TENANT, id, 'cancelled', { errorMessage: 'duplicate' }, ACTOR);
    expect(await job(id)).toMatchObject({ status: 'cancelled', error_message: 'duplicate' });
    expect(await auditRows(id)).toEqual([{ action: 'status_change', user_id: ACTOR }]);
  });

  it('writes a completion with its audit row, attributed to the caller', async () => {
    const id = await pendingJob();
    await service.completeExportJob(TENANT, id, OUTPUT, ACTOR);
    expect(await job(id)).toMatchObject({ status: 'completed', completed_by: ACTOR });
    expect(await auditRows(id)).toEqual([{ action: 'job_completed', user_id: ACTOR }]);
  });
});
