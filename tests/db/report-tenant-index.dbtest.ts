/** Actual canonical migration replay; all staged index changes roll back. */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';

const migration = fs.readFileSync('migrations/0014_report_os_foundation.sql', 'utf8')
  .replace(/^BEGIN;\r?\n/m, '').replace(/\r?\nCOMMIT;\s*$/, '');
const tag = `report-index-qa-${randomUUID()}`;
let owner: Pool;
let runtime: Pool;
let reportId: number;

async function indexState(q: Pick<PoolClient, 'query'>) {
  return (await q.query(`SELECT i.indexrelid::text AS id,a.attname,i.indisvalid,i.indisready,
    i.indpred IS NULL AS unfiltered,i.indrelid='public.immutable_report_records'::regclass AS correct_table
    FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
    WHERE i.indexrelid=to_regclass('public.irr_org_idx')`)).rows[0];
}
async function retained(q: Pick<PoolClient, 'query'>) {
  return (await q.query('SELECT * FROM immutable_report_records WHERE id=$1', [reportId])).rows;
}
async function staged(operation: (q: PoolClient) => Promise<void>) {
  const q = await owner.connect();
  try { await q.query('BEGIN'); await operation(q); }
  finally { await q.query('ROLLBACK'); q.release(); }
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('A provisioned non-owner APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1 });
  // A raw pg Pool does not install server/db/runtime's session settings.
  // Exercise the production enforcement mode, rather than policy shadow mode.
  await runtime.query("SELECT set_config('app.rls_enforce','on',false)");
  const role = (await runtime.query('SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  expect(role).toMatchObject({ current_user: 'app_service', rolsuper: false, rolbypassrls: false });
  const organization = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id", [tag])).rows[0];
  reportId = Number((await owner.query(`INSERT INTO immutable_report_records
    (organization_id,report_code,report_title,report_domain,content)
    VALUES($1,$2,'Invented tenant-index QA record','provenance_audit',$3::json) RETURNING id`,
  [organization.id, tag, JSON.stringify({ qualification: 'synthetic QA only', original: 'retained' })])).rows[0].id);
});
afterAll(async () => { await runtime?.end(); await owner?.end(); });

describe('sealed-report tenant index from the canonical Report OS foundation', () => {
  it('has a valid tenant-leading index and retains actual unscoped runtime denial', async () => {
    expect(await indexState(owner)).toMatchObject({ attname: 'organization_id', indisvalid: true, indisready: true, unfiltered: true, correct_table: true });
    expect((await runtime.query('SELECT id FROM immutable_report_records WHERE id=$1', [reportId])).rows).toEqual([]);
  });

  it('repairs a genuinely missing index and replays without changing the original report', async () => {
    await staged(async q => {
      const before = await retained(q);
      await q.query('DROP INDEX public.irr_org_idx');
      expect(await indexState(q)).toBeUndefined();
      await q.query(migration);
      const repaired = await indexState(q);
      expect(repaired).toMatchObject({ attname: 'organization_id', indisvalid: true, indisready: true, unfiltered: true, correct_table: true });
      await q.query(migration);
      expect(await indexState(q)).toEqual(repaired);
      expect(await retained(q)).toEqual(before);
    });
  });

  it('refuses a conflicting named index while preserving its definition and report', async () => {
    await staged(async q => {
      const before = await retained(q);
      await q.query('DROP INDEX public.irr_org_idx');
      await q.query('CREATE INDEX irr_org_idx ON immutable_report_records(report_code)');
      const wrong = await indexState(q);
      await q.query('SAVEPOINT before_replay');
      await expect(q.query(migration)).rejects.toMatchObject({ code: 'P0001', message: expect.stringContaining('REPORT_TENANT_INDEX_RECONCILIATION_REQUIRED') });
      await q.query('ROLLBACK TO SAVEPOINT before_replay');
      expect(await indexState(q)).toEqual(wrong);
      expect(await retained(q)).toEqual(before);
    });
  });
});
