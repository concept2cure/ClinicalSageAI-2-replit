/**
 * What a declaration of sequences filed outside the platform changes on the
 * Submission Center spine (D7, 2026-10-29;
 * docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md).
 *
 * LMN-201's IND holds sequences filed with another tool. Without a
 * declaration, its first platform amendment is refused: no Original
 * Application is held here, so its submission-id would have to be guessed
 * (slice 1). With one, the amendment names the declared original, a number
 * already filed is refused when the sequence is created and again when it is
 * assembled, and a second Original Application cannot be created.
 *
 * The declarations here are inserted as fixtures with triggers off
 * (session_replication_role = replica): the rule that a declaration is signed
 * is the act's own suite (server/__tests__/routes/submission-filed-baseline.pglite.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { applyCompanyLegalReads } from '../../ectd/__tests__/support/company-legal-reads';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));

import { assembleSequence, EctdAssemblyBlockedError } from '../../ectd/assemble-from-core';
import { createSequence, SubmissionError } from '../submission-service';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const EVIDENCE = '11111111-1111-4111-8111-111111111111';
const SHA = 'a'.repeat(64);

async function usRegional(bundlePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  return (await zip.file('m1/us/us-regional.xml')?.async('string')) ?? '';
}
const assemble = (sequenceId: number) => assembleSequence({
  sequenceId, organizationId: ORG, userId: USER, applicationId: '123456', sponsorId: 'SPON-1', sponsorName: 'Lumen Bioscience',
});
const refusalOf = (p: Promise<unknown>) => p.then(() => { throw new Error('expected a refusal'); }, (e: unknown) => e as Error);
const ctx = { organizationId: ORG, userId: USER };

/** A declaration as a fixture: the signature rule is not this suite's. */
async function declare(submissionId: number, last: string, original: string, at = '2026-10-29T10:00:00Z') {
  await harness.pglite.exec(`
    SET session_replication_role = replica;
    INSERT INTO public.submission_filed_baselines (id, organization_id, submission_id, region, last_filed_sequence, original_sequence,
      evidence_vault_document_id, evidence_sha256, reason, declared_by, declared_at)
    VALUES (gen_random_uuid(), ${ORG}, ${submissionId}, 'US', '${last}', '${original}', '${EVIDENCE}', '${SHA}',
      'Filed with the previous publishing tool', ${USER}, '${at}');
    SET session_replication_role = origin;`);
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await applyCompanyLegalReads(harness.pglite);
  await harness.pglite.exec(`INSERT INTO organizations (id) VALUES (${ORG})`);
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS ectd_compilations (id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER,
      compilation_type TEXT, sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW());
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES
      (1, 'IND 123456, sequences 0000-0041 filed elsewhere', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (2, 'IND whose original filed elsewhere was 0003', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (3, 'IND with nothing declared', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (4, 'IND declared twice', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, type, organization_id, created_by, dispatch_status) VALUES
      (1, 1, 'fda', '0042', 'amendment', ${ORG}, ${USER}, NULL),
      (2, 1, 'fda', '0040', 'amendment', ${ORG}, ${USER}, NULL),
      (3, 2, 'fda', '0010', 'amendment', ${ORG}, ${USER}, NULL),
      (4, 3, 'fda', '0042', 'amendment', ${ORG}, ${USER}, NULL),
      (5, 4, 'fda', '0020', 'amendment', ${ORG}, ${USER}, NULL);
    SELECT setval(pg_get_serial_sequence('ectd_sequences', 'id'), 100);
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
      VALUES (100, ${ORG}, 'Drug Substance General', '<p>DS general</p>', '3.2');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by, checksum)
    SELECT id, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 100, ${ORG}, ${USER}, NULL
      FROM ectd_sequences;
  `);
  await declare(1, '0041', '0000');
  await declare(2, '0009', '0003');
  // A later declaration is the one in force.
  await declare(4, '0010', '0000', '2026-10-28T10:00:00Z');
  await declare(4, '0030', '0000', '2026-10-29T10:00:00Z');
});
afterAll(async () => { await harness.close(); });

describe('the FDA submission-id names the declared Original Application', () => {
  it('an amendment after sequences filed elsewhere names their Original Application (0000)', async () => {
    const xml = await usRegional((await assemble(1)).bundle.path);
    expect(xml).toMatch(/<submission-id submission-type="fdast1">0000<\/submission-id>/);
    expect(xml).toMatch(/<sequence-number submission-sub-type="fdasst4">0042<\/sequence-number>/);
  });

  it('names the sequence the sponsor declared opened it, when that was not 0000', async () => {
    const xml = await usRegional((await assemble(3)).bundle.path);
    expect(xml).toMatch(/<submission-id submission-type="fdast1">0003<\/submission-id>/);
  });

  it('the latest declaration is the one in force', async () => {
    const err = await refusalOf(assemble(5));
    expect(err).toBeInstanceOf(EctdAssemblyBlockedError);
    expect(err.message).toMatch(/0000–0030 of this application were filed outside the platform/);
  });

  it('a sequence numbered within the ones filed elsewhere is refused at assembly', async () => {
    const err = await refusalOf(assemble(2));
    expect(err).toBeInstanceOf(EctdAssemblyBlockedError);
    expect(err.message).toMatch(/sequence 0040 is taken\. Nothing was packaged\./);
  });

  it('without a declaration, the amendment is refused and the refusal says how to declare one', async () => {
    const err = await refusalOf(assemble(4));
    expect(err).toBeInstanceOf(EctdAssemblyBlockedError);
    expect(err.message).toMatch(/declare them on the submission first/);
  });
});

describe('creating a sequence under a declaration', () => {
  it('refuses a number already filed elsewhere, and names the next', async () => {
    const err = await refusalOf(createSequence({ submissionId: 1, region: 'fda', sequenceNumber: '0041', type: 'amendment' }, ctx));
    expect(err).toBeInstanceOf(SubmissionError);
    expect((err as SubmissionError).code).toBe('INVALID_STATE');
    expect(err.message).toMatch(/sequence 0041 is taken\. The next is 0042\./);
  });

  it('refuses a second Original Application, typed or by default', async () => {
    for (const type of ['original', undefined] as const) {
      const err = await refusalOf(createSequence({ submissionId: 1, region: 'fda', sequenceNumber: '0043', type }, ctx));
      expect((err as SubmissionError).code).toBe('INVALID_STATE');
      expect(err.message).toMatch(/Sequence 0000, filed outside the platform, opened this application's Original Application/);
    }
  });

  it('creates the next amendment', async () => {
    const created = await createSequence({ submissionId: 1, region: 'fda', sequenceNumber: '0043', type: 'amendment' }, ctx);
    expect(created.sequenceNumber).toBe('0043');
  });

  it('a submission with nothing declared still opens at 0000', async () => {
    const created = await createSequence({ submissionId: 3, region: 'fda', sequenceNumber: '0000', type: 'original' }, ctx);
    expect(created.type).toBe('original');
  });
});
