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
 * The record is authoritative, as it already is for the region: the recorded
 * agency number, else the program's own code, else a handle that says it is
 * unassigned. A supplied number must be a usable identifier and must not
 * contradict a recorded one.
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

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const RECORDED = '11111111-1111-4111-8111-111111111111';
const CODE_ONLY = '22222222-2222-4222-8222-222222222222';

async function applicationNumberIn(buffer: Buffer): Promise<string | undefined> {
  const zip = await JSZip.loadAsync(buffer);
  const regional = (await zip.file('m1/us/us-regional.xml')?.async('string')) ?? '';
  return /<application-number[^>]*>([^<]*)</.exec(regional)?.[1];
}

const exportOf = (submissionId: number, applicationNumber?: string) =>
  assembleSubmissionEctd({
    submissionId, organizationId: ORG, userId: USER, sequenceNumber: '0000',
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
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, application_number) VALUES
      ('${RECORDED}', ${ORG}, 'Vorelinib (IND)', 'BX-512', 'IND', 'Vorelinib', '000512'),
      ('${CODE_ONLY}', ${ORG}, 'Pre-IND program', 'BX-900', 'IND', 'Compound 900', NULL);
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id) VALUES
      (1, 'recorded number', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${RECORDED}'),
      (2, 'code only', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${CODE_ONLY}'),
      (3, 'no program', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, NULL);
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by) VALUES
      (11, 1, 'fda', '0000', ${ORG}, ${USER}), (12, 2, 'fda', '0000', ${ORG}, ${USER}), (13, 3, 'fda', '0000', ${ORG}, ${USER});
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (300, ${ORG}, 'Drug Substance General', '<p>general</p>', '3.2', 'approved');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      (11, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (12, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (13, 'm3.2.s.1', 'Drug Substance General', 'new', 'coauthor_documents', 300, ${ORG}, ${USER});
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

  it('with no agency number recorded, is the program\'s own code — never invented', async () => {
    expect(await applicationNumberIn((await exportOf(2)).buffer)).toBe('BX-900');
  });

  it('for a submission with no program, says plainly that it is unassigned', async () => {
    expect(await applicationNumberIn((await exportOf(3)).buffer)).toBe('UNASSIGNED-SEQ-13');
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
