/**
 * The Submission Center spine declares the FDA submission-id by the platform's
 * one rule (fda-sequence-identity.ts), as the package spine does (W5/D7,
 * 2026-10-29; CSR path review).
 *
 * The shared packager defaults submission-id to the sequence's own number, and
 * this spine passed none. So every IND amendment it built said "Amendment" and,
 * in the same element, opened a regulatory activity of its own: what an
 * amendment to the IND must not do. An IND amendment is submission type
 * Original Application, sub-type Amendment, submission-id 0000 (the IND's first
 * sequence). An annual report and the original itself declare their own
 * number. An amendment whose Original Application is not on file here is
 * refused, never coded as a new one.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { applyCompanyLegalReads } from './support/company-legal-reads';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));

import { assembleSequence, EctdAssemblyBlockedError } from '../assemble-from-core';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;

async function usRegional(bundlePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  return (await zip.file('m1/us/us-regional.xml')?.async('string')) ?? '';
}
const assemble = (sequenceId: number) => assembleSequence({
  sequenceId, organizationId: ORG, userId: USER, applicationId: '123456', sponsorId: 'SPON-1', sponsorName: 'Lumen Bioscience',
});

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
      (1, 'IND 123456', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (2, 'IND with no original sequence', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (3, 'IND whose original the agency rejected', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (4, 'An EMA original, then an FDA amendment', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, type, organization_id, created_by, dispatch_status) VALUES
      (1, 1, 'fda', '0000', 'original',  ${ORG}, ${USER}, 'acknowledged'),
      (2, 1, 'fda', '0001', 'amendment', ${ORG}, ${USER}, 'sent'),
      (3, 1, 'fda', '0002', 'amendment', ${ORG}, ${USER}, NULL),
      (4, 1, 'fda', '0003', 'annual',    ${ORG}, ${USER}, NULL),
      (5, 2, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL),
      (7, 3, 'fda', '0000', 'original',  ${ORG}, ${USER}, 'rejected'),
      (8, 3, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL),
      (9, 1, 'fda', '0004', 'original',  ${ORG}, ${USER}, NULL),
      (10, 4, 'ema', '0000', 'original', ${ORG}, ${USER}, 'acknowledged'),
      (11, 4, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL);
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
      VALUES (100, ${ORG}, 'Drug Substance General', '<p>DS general</p>', '3.2');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by, checksum)
    SELECT id, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 100, ${ORG}, ${USER}, NULL
      FROM ectd_sequences;
  `);
});
afterAll(async () => { await harness.close(); });

describe('the FDA submission-id on the Submission Center spine', () => {
  it('an IND amendment names the Original Application it continues (0000), not its own number', async () => {
    const xml = await usRegional((await assemble(3)).bundle.path);
    expect(xml).toMatch(/<submission-id submission-type="fdast1">0000<\/submission-id>/);
    expect(xml).toMatch(/<sequence-number submission-sub-type="fdasst4">0002<\/sequence-number>/);
  });

  it('an annual report opens its own activity, and declares its own number', async () => {
    const xml = await usRegional((await assemble(4)).bundle.path);
    expect(xml).toMatch(/<submission-id submission-type="fdast5">0003<\/submission-id>/);
  });

  it('the original declares its own number', async () => {
    const xml = await usRegional((await assemble(1)).bundle.path);
    expect(xml).toMatch(/<submission-id submission-type="fdast1">0000<\/submission-id>/);
  });

  it.each([
    ['holds no Original Application sequence', 5],
    ['holds only an Original Application the agency rejected', 8],
    ['holds an Original Application only in another region', 11],
  ])('an amendment in a submission that %s is refused, never coded as a new activity', async (_label, sequenceId) => {
    const err = await assemble(sequenceId).then(() => { throw new Error('expected a refusal'); }, (e: unknown) => e as Error);
    expect(err).toBeInstanceOf(EctdAssemblyBlockedError);
    expect(err.message).toMatch(/Original Application/);
    expect(err.message).toMatch(/Nothing was packaged/);
  });

  it('a follow-up typed original, after the Original Application, is refused as a second one', async () => {
    const err = await assemble(9).then(() => { throw new Error('expected a refusal'); }, (e: unknown) => e as Error);
    expect(err).toBeInstanceOf(EctdAssemblyBlockedError);
    expect(err.message).toMatch(/already filed this application's Original Application/);
  });
});
