import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  evaluateRecordedRelease,
  evidenceFingerprint,
  readRecordedReleaseTests,
  recordedResultVerdict,
} from '../batch-release-evidence';

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
    (4,8,'B-1',NULL,'FOREIGN-SAMPLE','finished-product','AM-1','{"value":99.2}','{"limit":98}','pass',4,5,'2026-11-01','2026-11-01'),
    -- GA-DEMO-02: the demo's DS-2502-R2, as the QC mapper stores it. Recorded
    -- "pass" at 97.4 % against 98.0 - 102.0 %, reviewed, beside a true pass.
    (5,7,'C2C201-DS-2502','c2c-201','DS-2502-R1','in-process','HPLC-UV assay','{"value":"99.6","unit":"%"}','{"acceptanceCriteria":"98.0 - 102.0 %"}','pass',4,5,'2026-04-01','2026-04-01'),
    (6,7,'C2C201-DS-2502','c2c-201','DS-2502-R2','in-process','HPLC-UV assay','{"value":"97.4","unit":"%","observation":"retest requested"}','{"acceptanceCriteria":"98.0 - 102.0 %"}','pass',4,5,'2026-04-06','2026-04-06'),
    -- V-L1-04: the same contradiction recorded with the word "Passed".
    (7,7,'ALIAS-1','c2c-201','ALIAS-R1','in-process','HPLC-UV assay','{"value":"97.4","unit":"%"}','{"acceptanceCriteria":"98.0 - 102.0 %"}','Passed',4,5,'2026-04-06','2026-04-06')`);
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

/**
 * GA-DEMO-02. A recorded "pass" was trusted as a pass: DS-2502-R2 is recorded
 * as a pass at 97.4 % against its own criterion of 98.0 - 102.0 %, and the
 * release evaluation read `pass_fail_status` and nothing else, so the batch
 * was eligible for a signed release over a result its own limit fails.
 */
describe('a recorded pass that contradicts its own criterion is not a pass', () => {
  const ds = { batch_number: 'C2C201-DS-2502', project_id: 'c2c-201' };

  it('compares the recorded value with the recorded criterion', () => {
    expect(recordedResultVerdict({ value: '97.4', unit: '%' }, [{ acceptanceCriteria: '98.0 - 102.0 %' }])).toBe('outside');
    expect(recordedResultVerdict({ value: '99.6', unit: '%' }, [{ acceptanceCriteria: '98.0 - 102.0 %' }])).toBe('within');
    expect(recordedResultVerdict({ value: '0.61' }, ['NMT 0.5 %'])).toBe('outside');
    expect(recordedResultVerdict({ value: '93' }, ['NLT 80 %'])).toBe('within');
    expect(recordedResultVerdict({ value: '79' }, ['NLT 80 %'])).toBe('outside');
    expect(recordedResultVerdict({ value: '103' }, ['98.0 - 102.0 %'])).toBe('outside');
    /* Nothing to compare is said as itself, never as within. */
    expect(recordedResultVerdict({ value: 99.2 }, [{ limit: 98 }])).toBe('not-comparable');
    expect(recordedResultVerdict({ observation: 'clear' }, ['NMT 0.5 %'])).toBe('not-comparable');
    expect(recordedResultVerdict(null, [null])).toBe('not-comparable');
  });

  /* V-L1-02: a limit is inclusive. A result exactly at its limit meets it, and
     must never refuse a signed release. */
  it('a result exactly at a limit is within it', () => {
    expect(recordedResultVerdict({ value: '98.0' }, ['98.0 - 102.0 %'])).toBe('within');
    expect(recordedResultVerdict({ value: '102.0' }, ['98.0 - 102.0 %'])).toBe('within');
    expect(recordedResultVerdict({ value: '0.5' }, ['NMT 0.5 %'])).toBe('within');
    expect(recordedResultVerdict({ value: '80' }, ['NLT 80 %'])).toBe('within');
  });

  it('a pass recorded as "Passed" over an out-of-criterion value is contradicted too (V-L1-04)', async () => {
    const rows = await readRecordedReleaseTests(queryable, 7, { batch_number: 'ALIAS-1', project_id: 'c2c-201' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ passFail: 'passed', passed: false, contradicted: true });
  });

  it('reads DS-2502-R2 as contradicted and not passed, and DS-2502-R1 as passed', async () => {
    const rows = await readRecordedReleaseTests(queryable, 7, ds);
    const r1 = rows.find((r) => r.sampleId === 'DS-2502-R1');
    const r2 = rows.find((r) => r.sampleId === 'DS-2502-R2');
    expect(r1).toMatchObject({ passFail: 'pass', passed: true, contradicted: false });
    expect(r2).toMatchObject({ passFail: 'pass', passed: false, contradicted: true });
  });

  it.each(['approved', 'conditional'] as const)('refuses a %s release of the batch and names the contradicted result', async (decision) => {
    const rows = await readRecordedReleaseTests(queryable, 7, ds);
    const verdict = evaluateRecordedRelease(decision, rows, 'C2C201-DS-2502');
    expect(verdict).toHaveProperty('refusal');
    const refusal = (verdict as { refusal: string }).refusal;
    expect(refusal).toContain('DS-2502-R2');
    expect(refusal).toMatch(/recorded as a pass/);
    expect(refusal).toMatch(/outside its recorded acceptance criterion/);
    expect(refusal).not.toContain('DS-2502-R1');
  });

  it('still lets the batch be rejected', async () => {
    const rows = await readRecordedReleaseTests(queryable, 7, ds);
    expect(evaluateRecordedRelease('rejected', rows, 'C2C201-DS-2502')).toEqual({ releaseStatus: 'rejected', allPassed: false });
  });

  it('a result with no comparable criterion keeps its recorded disposition', async () => {
    const rows = await readRecordedReleaseTests(queryable, 7, { batch_number: 'B-1', project_id: 'program-a' });
    expect(rows[0]).toMatchObject({ passed: true, contradicted: false });
  });
});
