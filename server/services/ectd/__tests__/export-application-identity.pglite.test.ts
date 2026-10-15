/**
 * The exported package names the application the program RECORDS.
 * 2026-09-29 (W5/D7, WO-9 Click 6).
 *
 * The compile surface packaged BX-512 as IND 000512 (the program's recorded
 * application number). Its "Download package (.zip)" — assembleSubmissionEctd
 * — packaged the same sequence as `UNASSIGNED-SEQ-6`, because it took the
 * number only from the request, and the surface sends none. The package handed
 * to the agency validator, and the one a transmit would carry, disagreed with
 * the recorded compile and with the record. A request could also name any
 * number it liked — unvalidated, into a filename and the backbone.
 *
 * The record is authoritative, as it already is for the region. A supplied
 * number must be a usable identifier and must not contradict the recorded one.
 *
 * 2026-10-08 (QA j6): the inspection copy of PLR-606 sequence 0000 named the
 * applicant "UNASSIGNED (organization 1)" although the organisation is
 * Concept2Cure Therapeutics, and wrote the program code PLR-606 as the FDA
 * application number. Now the package names the organisation's recorded name
 * as the applicant and ONLY the recorded application number as the
 * application; with either missing it is refused by name, never built with a
 * placeholder and never with the program code.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));

import { assembleSubmissionEctd } from '../assemble-from-core';
import { PackageIdentityMissingError } from '../package-identity';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const NAMELESS_ORG = 8;
const RECORDED = '11111111-1111-4111-8111-111111111111';
const CODE_ONLY = '22222222-2222-4222-8222-222222222222';
const NAMELESS = '33333333-3333-4333-8333-333333333333';

async function regionalOf(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return (await zip.file('m1/us/us-regional.xml')?.async('string')) ?? '';
}
async function applicationNumberIn(buffer: Buffer): Promise<string | undefined> {
  return /<application-number[^>]*>([^<]*)</.exec(await regionalOf(buffer))?.[1];
}

const exportOf = (submissionId: number, applicationNumber?: string, organizationId = ORG) =>
  assembleSubmissionEctd({
    submissionId, organizationId, userId: USER, sequenceNumber: '0000',
    ...(applicationNumber !== undefined ? { applicationNumber } : {}),
  });

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS ectd_compilations (
      id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER, compilation_type TEXT,
      sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW()
    );
    -- The organisation is the sponsor of record (as Form FDA 1571 names it); the
    -- second one's record carries no usable name.
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure Therapeutics'), (${NAMELESS_ORG}, '   ');
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, application_number) VALUES
      ('${RECORDED}', ${ORG}, 'Vorelinib (IND)', 'BX-512', 'IND', 'Vorelinib', '000512'),
      ('${CODE_ONLY}', ${ORG}, 'Pre-IND program', 'BX-900', 'IND', 'Compound 900', NULL),
      ('${NAMELESS}', ${NAMELESS_ORG}, 'Nameless sponsor IND', 'NN-1', 'IND', 'Compound N', '000777');
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id) VALUES
      (1, 'recorded number', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${RECORDED}'),
      (2, 'code only', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${CODE_ONLY}'),
      (3, 'no program', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, NULL),
      (4, 'nameless sponsor', 'ind', 'biotech', 'fda', ${NAMELESS_ORG}, ${USER}, '${NAMELESS}');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by) VALUES
      (11, 1, 'fda', '0000', ${ORG}, ${USER}), (12, 2, 'fda', '0000', ${ORG}, ${USER}), (13, 3, 'fda', '0000', ${ORG}, ${USER}),
      (14, 4, 'fda', '0000', ${NAMELESS_ORG}, ${USER});
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (300, ${ORG}, 'Drug Substance General', '<p>general</p>', '3.2', 'approved'),
      (301, ${NAMELESS_ORG}, 'Drug Substance General', '<p>general</p>', '3.2', 'approved');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      (11, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (12, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (13, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (14, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 301, ${NAMELESS_ORG}, ${USER});
  `);
});

afterAll(async () => {
  await harness.close();
});

describe('the application number an exported package carries', () => {
  it('is the number the program records, when the export supplies none', async () => {
    const r = await exportOf(1);
    expect(await applicationNumberIn(r.buffer)).toBe('000512');
    expect(r.filename).toContain('000512');
  });

  it('with no agency number recorded, is refused by name — the program code is never an application number', async () => {
    const refused = await exportOf(2).catch((e) => e);
    expect(refused).toBeInstanceOf(PackageIdentityMissingError);
    expect(refused).toMatchObject({ code: 'PACKAGE_IDENTITY_MISSING', missing: ['applicationNumber'] });
    expect(refused.message).toMatch(/records no agency application number/);
    expect(refused.message).toMatch(/program code is not one/);
    expect(refused.message).toMatch(/Nothing was built\.$/);
    expect(refused.message).not.toMatch(/BX-900/);
  });

  it('for a submission with no program, is refused by name: no number is recorded for it', async () => {
    const refused = await exportOf(3).catch((e) => e);
    expect(refused).toBeInstanceOf(PackageIdentityMissingError);
    expect(refused.message).toMatch(/not anchored to a project/);
  });

  it('a supplied number that agrees with the record is used', async () => {
    expect(await applicationNumberIn((await exportOf(1, '000512')).buffer)).toBe('000512');
  });

  it('a supplied number that contradicts the recorded one is refused', async () => {
    await expect(exportOf(1, '999999')).rejects.toThrow(/does not match the program's recorded application number/);
  });

  it('a supplied value that is not a usable identifier is refused, never written into a filename', async () => {
    await expect(exportOf(3, '../../evil')).rejects.toThrow(/is not a usable application number/);
  });
});

describe('the applicant an exported package names', () => {
  it('is the organisation the record names, not a placeholder', async () => {
    const regional = await regionalOf((await exportOf(1)).buffer);
    expect(regional).toMatch(/<company-name>Concept2Cure Therapeutics<\/company-name>/);
    expect(regional).not.toMatch(/UNASSIGNED \(organization/);
    expect(regional).not.toMatch(/BX-512/);
  });

  it('an organisation whose record has no usable name is refused by name', async () => {
    const refused = await exportOf(4, undefined, NAMELESS_ORG).catch((e) => e);
    expect(refused).toBeInstanceOf(PackageIdentityMissingError);
    expect(refused).toMatchObject({ missing: ['applicantName'] });
    expect(refused.message).toMatch(/organization's record has no usable name/);
  });
});
