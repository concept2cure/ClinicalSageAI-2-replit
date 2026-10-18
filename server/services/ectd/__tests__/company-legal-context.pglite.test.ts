import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { companyLegalSubmissionContext, readCompanyLegalSubmissionContext } from '../company-legal-context';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
let pg: PGlite;
const q = { query: (sql: string, params?: unknown[]) => pg.query<Record<string, unknown>>(sql, params) };
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE submissions(id INTEGER PRIMARY KEY,organization_id INTEGER,program_id UUID,application_type TEXT,deleted_at TIMESTAMPTZ);
    CREATE TABLE ectd_sequences(id INTEGER PRIMARY KEY,submission_id INTEGER,organization_id INTEGER,region TEXT,status TEXT,deleted_at TIMESTAMPTZ);
    INSERT INTO submissions VALUES(1,7,'${PROGRAM}','IND',NULL),(2,8,'${PROGRAM}','NDA',NULL);
    INSERT INTO ectd_sequences VALUES(11,1,7,'fda','frozen',NULL),(12,2,8,'EMA','dispatched',NULL),(13,2,7,'FDA','draft',NULL);`);
});
afterAll(async () => { await pg?.close(); });

describe('company legal target derives from the recorded tenant submission', () => {
  it('uses actual program, sequence destination and application type for a frozen sequence', async () => {
    expect(await readCompanyLegalSubmissionContext(q, 7, 11)).toEqual({ programId: PROGRAM, country: 'US', agency: 'FDA', submissionType: 'IND' });
  });
  it('does not resolve another tenant or a sequence whose parent organization disagrees', async () => {
    await expect(readCompanyLegalSubmissionContext(q, 7, 12)).rejects.toThrow('could not be verified');
    await expect(readCompanyLegalSubmissionContext(q, 7, 13)).rejects.toThrow('could not be verified');
  });
  it('reads a changed recorded destination afresh, including an already frozen sequence', async () => {
    try {
      await pg.query("UPDATE ectd_sequences SET region='ema' WHERE id=11");
      expect(await readCompanyLegalSubmissionContext(q, 7, 11)).toMatchObject({ country: 'EU', agency: 'EMA', submissionType: 'IND' });
    } finally { await pg.query("UPDATE ectd_sequences SET region='fda' WHERE id=11"); }
  });
  it('keeps an unknown region unknown instead of inventing a destination for restricted documents', () => {
    expect(companyLegalSubmissionContext({ programId: PROGRAM, region: 'unknown', applicationType: 'IND' }))
      .toEqual({ programId: PROGRAM, country: null, agency: null, submissionType: 'IND' });
  });
});
