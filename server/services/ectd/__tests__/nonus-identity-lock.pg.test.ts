/** Native PostgreSQL proof of captured non-US facts, isolated synthetic schema. */
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
vi.unmock('pg');
import { Pool, type PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import { PROGRAM_SPINE_PGLITE_DDL, SUBMISSION_CORE_PGLITE_DDL } from '../../../db/pglite-harness';
import { lockSubmissionPackageIdentity, lockRecordedPackageIdentity } from '../package-identity';
import { deriveGovernedTargetBinding } from '../../part11/signature-persistence';

const url = process.env.TEST_DATABASE_URL;
const native = url && url !== 'postgresql://test:test@localhost:5432/test' ? describe : describe.skip;
const schema = `nonus_identity_${process.pid}_${Date.now()}`;
const program = '11111111-1111-4111-8111-111111111111';
const sponsor = '22222222-2222-4222-8222-222222222222';
let pool: Pool;
let first: PoolClient;
let second: PoolClient;
let admin: PoolClient;
const binding = () => deriveGovernedTargetBinding(first, 'ectd-sequence:20', 1);
async function captureLock() {
  await first.query('BEGIN');
  const parent = await lockSubmissionPackageIdentity(first, 1, 10);
  expect(parent).toEqual({ programId: program });
  await first.query('SELECT id FROM ectd_sequences WHERE id=20 AND organization_id=1 FOR UPDATE');
  await lockRecordedPackageIdentity(first, 1, parent!.programId);
}

native('non-US captured identity locks serialize actual PostgreSQL writes', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 3 });
    [first, second, admin] = await Promise.all([pool.connect(), pool.connect(), pool.connect()]);
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const client of [first, second]) await client.query(`SET search_path TO ${schema}`);
    await second.query("SET lock_timeout='150ms'");
    await first.query(PROGRAM_SPINE_PGLITE_DDL);
    await first.query(SUBMISSION_CORE_PGLITE_DDL);
    await first.query(readFileSync('migrations/20260609_ind_master_data.sql', 'utf8'));
    // The actual migration targets public; this disposable schema mirrors its column.
    await first.query('ALTER TABLE regulatory_programs ADD COLUMN applicant_sponsor_id UUID');
    await first.query(readFileSync('migrations/20261022b_submissions_market_application_number.sql', 'utf8'));
    await first.query("INSERT INTO organizations(id,name) VALUES (1,'Synthetic applicant'),(2,'Other synthetic tenant')");
    await first.query(`INSERT INTO ind_sponsors(id,organization_id,name,duns) VALUES ($1,1,'Synthetic bound applicant','123456789')`, [sponsor]);
    await first.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_name,application_number,primary_agency)
      VALUES ($1,1,'Synthetic market proof','NONUS-1','NDA','Synthetic product','123456','FDA')`, [program]);
    await first.query(`INSERT INTO submissions(id,title,application_type,client_type,primary_region,organization_id,created_by,program_id,application_number)
      VALUES (10,'Synthetic EU market','maa','pharma','eu',1,9,$1,'EMEA-H-C-005123')`, [program]);
    await first.query("INSERT INTO ectd_sequences(id,submission_id,region,sequence_number,organization_id,created_by) VALUES (20,10,'eu','0000',1,9)");
  });
  afterEach(async () => { await first.query('ROLLBACK'); await second.query('ROLLBACK'); });
  afterAll(async () => {
    await first?.query('ROLLBACK'); await second?.query('ROLLBACK');
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    first?.release(); second?.release(); admin?.release(); await pool?.end();
  });

  it('protects the actual unbound organization applicant name until capture commits', async () => {
    await captureLock();
    expect((await binding()).recordedPackageIdentity?.identity.applicantName).toBe('Synthetic applicant');
    await expect(second.query("UPDATE organizations SET name='Renamed during capture' WHERE id=1")).rejects.toMatchObject({ code: '55P03' });
    await first.query('COMMIT');
    expect((await second.query("UPDATE organizations SET name='Synthetic applicant' WHERE id=1 RETURNING id")).rowCount).toBe(1);
  });

  it('blocks market-number and program changes while allowing unrelated tenant work', async () => {
    await captureLock();
    const captured = await binding();
    expect(captured.recordedPackageIdentity?.identity).toMatchObject({ applicationNumber: 'EMEA-H-C-005123', applicantId: null });
    await expect(second.query("UPDATE submissions SET application_number='EMEA-H-C-009999' WHERE id=10")).rejects.toMatchObject({ code: '55P03' });
    await expect(second.query("UPDATE regulatory_programs SET application_number='654321' WHERE id=$1", [program])).rejects.toMatchObject({ code: '55P03' });
    expect((await second.query("UPDATE organizations SET name='Unrelated rename' WHERE id=2 RETURNING id")).rowCount).toBe(1);
    await first.query('COMMIT');
    await second.query("UPDATE submissions SET application_number='EMEA-H-C-005124' WHERE id=10");
    expect((await binding()).digest).not.toBe(captured.digest);
    expect(captured.recordedPackageIdentity?.identity.applicationNumber).toBe('EMEA-H-C-005123');
  });

  it('protects an explicitly bound sponsor without assigning its DUNS to the EU proof', async () => {
    await first.query('UPDATE regulatory_programs SET applicant_sponsor_id=$1 WHERE id=$2', [sponsor, program]);
    await captureLock();
    expect((await binding()).recordedPackageIdentity?.identity).toMatchObject({ applicantName: 'Synthetic bound applicant', applicantId: null });
    await expect(second.query("UPDATE ind_sponsors SET name='Changed applicant' WHERE id=$1", [sponsor])).rejects.toMatchObject({ code: '55P03' });
  });

  it('refuses missing and cross-tenant parents instead of lending an anchor', async () => {
    await first.query('BEGIN');
    expect(await lockSubmissionPackageIdentity(first, 2, 10)).toBeNull();
    expect(await lockSubmissionPackageIdentity(first, 1, 999)).toBeNull();
  });
});
