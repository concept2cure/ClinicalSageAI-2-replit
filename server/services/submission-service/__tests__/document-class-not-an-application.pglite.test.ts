/**
 * A filing document class (a CSR, a supplement, a meeting package) is not an
 * application, and a project of one holds no submission spine (2026-10-29, CSR
 * path review).
 *
 * The New project wizard offers "Clinical Study Report" as a document authored
 * here. Its project gets the ICH E3 document and, by design, no submission
 * (project-intake DRUG_APPLICATION_TYPES), and add-project-market.ts refuses
 * to add one. POST /api/submissions did not ask: an IND submission could be
 * anchored to the CSR project, opening a second IND spine beside the sponsor's
 * real one, and applicationType 'csr' itself was created as an application.
 * Both are refused here, with the add-market sentence, which now says where
 * the document is built: the application's own project.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));

import { createSubmission, SubmissionError, SUBMISSION_ERROR_STATUS } from '../submission-service';

let harness: IndPgliteDb;
const ORG = 7;
const ctx = { organizationId: ORG, userId: 3 };
const CSR_PROJECT = '11111111-2222-4333-8444-0000000000c5';
const IND_PROJECT = '11111111-2222-4333-8444-0000000000d1';
const base = { title: 'LMN-201', clientType: 'biotech', primaryRegion: 'fda' } as const;
const refusalOf = (p: Promise<unknown>) => p.then(() => { throw new Error('expected a refusal'); }, (e: unknown) => e as SubmissionError);
const submissionCount = async () => Number((await harness.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM submissions')).rows[0].n);

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, programSpine: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(`
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Lumen Bioscience') ON CONFLICT DO NOTHING;
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, primary_agency) VALUES
      ('${CSR_PROJECT}', ${ORG}, 'LMN-201 CSR', 'CSR-1', 'csr', 'LMN-201', 'ICH / Global'),
      ('${IND_PROJECT}', ${ORG}, 'LMN-201 IND', 'IND-1', 'ind', 'LMN-201', 'FDA');
  `);
});
afterAll(async () => { await harness.close(); });

describe('a document class is not an application', () => {
  it('no submission is created in a clinical study report project, and the refusal says where to build it', async () => {
    const err = await refusalOf(createSubmission({ ...base, applicationType: 'ind', programId: CSR_PROJECT }, ctx));
    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('NOT_AN_APPLICATION');
    expect(err.message).toMatch(/^No submission is created in this project: it is a clinical study report\./);
    expect(err.message).toMatch(/Author it in that application's project \(for a US IND, the IND's own project\)/);
    expect(await submissionCount()).toBe(0);
  });

  it('a clinical study report is not created as an application, in any project', async () => {
    const err = await refusalOf(createSubmission({ ...base, applicationType: 'csr', programId: IND_PROJECT }, ctx));
    expect(err.code).toBe('NOT_AN_APPLICATION');
    expect(err.message).toMatch(/^A clinical study report is not an application, so no submission is created for it\./);
    expect(await submissionCount()).toBe(0);
  });

  it('the IND project takes its IND', async () => {
    const created = await createSubmission({ ...base, applicationType: 'ind', programId: IND_PROJECT }, ctx);
    expect(created).toMatchObject({ applicationType: 'ind', programId: IND_PROJECT });
  });

  it('the refusal is a 422 wherever a route surfaces it, never a 500', () => {
    expect(SUBMISSION_ERROR_STATUS.NOT_AN_APPLICATION).toBe(422);
  });
});
