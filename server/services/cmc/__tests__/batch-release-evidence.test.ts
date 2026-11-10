import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { evidenceFingerprint, readRecordedReleaseTests } from '../batch-release-evidence';

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE qc_testing (
    id int PRIMARY KEY, organization_id int, batch_number text, project_id text,
    sample_id text, sample_type text, test_method text, test_results json, specifications json,
    pass_fail_status text, analyst int, reviewed_by int, test_date timestamp, updated_at timestamp,
    certificate_of_analysis text, release_date timestamp);
    INSERT INTO qc_testing (id,organization_id,batch_number,project_id,sample_id,sample_type,test_method,
      test_results,specifications,pass_fail_status,analyst,reviewed_by,test_date,updated_at) VALUES
    (1,7,'B-1',NULL,'ORG-SAMPLE','finished-product','AM-1','{"value":99.2}','{"limit":98}','pass',4,5,'2026-11-01','2026-11-01'),
    (2,7,'B-1','program-a','A-SAMPLE','finished-product','AM-1','{"value":99.2}','{"limit":98}','pass',4,5,'2026-11-01','2026-11-01'),
    (3,7,'B-1','program-b','B-SAMPLE','finished-product','AM-1','{"value":99.2}','{"limit":98}','pass',4,5,'2026-11-01','2026-11-01'),
    (4,8,'B-1',NULL,'FOREIGN-SAMPLE','finished-product','AM-1','{"value":99.2}','{"limit":98}','pass',4,5,'2026-11-01','2026-11-01')`);
});
afterAll(async () => { await pg?.close(); });
const queryable = { query: async (sql: string, params?: unknown[]) => pg.query(sql, params) };

describe('batch evidence keeps its exact recorded scope and content', () => {
  it.each([false, true])('reads only unassigned QC for an unassigned batch, never every same-number project (lock: %s)', async forShare => {
    const rows = await readRecordedReleaseTests(queryable, 7, { batch_number: 'B-1', project_id: null }, { forShare });
    expect(rows.map(row => row.qcId)).toEqual([1]);
  });
  it.each([false, true])('reads only the actual project for a project-bound batch (lock: %s)', async forShare => {
    const rows = await readRecordedReleaseTests(queryable, 7, { batch_number: 'B-1', project_id: 'program-a' }, { forShare });
    expect(rows.map(row => row.qcId)).toEqual([2]);
  });
  it('retains the complete evidence projection and fingerprint in the final locked read', async () => {
    const batch = { batch_number: 'B-1', project_id: 'program-a' };
    const before = await readRecordedReleaseTests(queryable, 7, batch);
    const locked = await readRecordedReleaseTests(queryable, 7, batch, { forShare: true });
    expect(locked).toEqual(before);
    expect(locked[0]).toMatchObject({ qcId: 2, sampleId: 'A-SAMPLE', sampleType: 'finished-product',
      testMethod: 'AM-1', result: { value: 99.2 }, criterion: { limit: 98 }, passFail: 'pass',
      reviewed: true, passed: true, analystId: 4, reviewerId: 5,
      testDate: new Date('2026-11-01T00:00:00').toISOString(), releaseDate: null, certificateOfAnalysis: null,
      recordRevision: '2026-11-01 00:00:00' });
    expect(evidenceFingerprint(locked)).toBe(evidenceFingerprint(before));
  });
  it('fingerprints the recorded result and criterion even if pass/review flags are unchanged', async () => {
    const rows = await readRecordedReleaseTests(queryable, 7, { batch_number: 'B-1', project_id: 'program-a' });
    const before = evidenceFingerprint(rows);
    expect(evidenceFingerprint([{ ...rows[0], result: { value: 100.1 } }])).not.toBe(before);
    expect(evidenceFingerprint([{ ...rows[0], criterion: { limit: 97 } }])).not.toBe(before);
    expect(evidenceFingerprint([{ ...rows[0], sampleId: 'OTHER-SAMPLE' }])).not.toBe(before);
    expect(evidenceFingerprint([{ ...rows[0], testMethod: 'AM-2' }])).not.toBe(before);
  });
  it('fingerprints who reviewed and when the result changed', async () => {
    const before = await readRecordedReleaseTests(queryable, 7, { batch_number: 'B-1', project_id: 'program-b' });
    await pg.query("UPDATE qc_testing SET reviewed_by=6, updated_at='2026-11-02' WHERE id=3");
    const after = await readRecordedReleaseTests(queryable, 7, { batch_number: 'B-1', project_id: 'program-b' });
    expect(evidenceFingerprint(after)).not.toBe(evidenceFingerprint(before));
  });
});
