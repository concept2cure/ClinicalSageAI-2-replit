/**
 * A declared lifecycle act is filed as declared, or refused — never re-coded.
 *
 * 2026-09-22 (W5/D7). package-from-core threw the author's declared operation
 * away before the checksum diff and dropped only deletes it could not bind:
 *
 *  1. a declared replace the diff could not bind (a different staged file name)
 *     was filed as `new`, leaving the superseded version current at the agency;
 *  2. a declared append was filed as `replace`;
 *  3. with no filed prior on record, a declared replace shipped as
 *     operation="replace" with NO modified-file — an act on nothing;
 *  4. in a first sequence, the same.
 *
 * In each case assembly reported a clean `skipped: []`, and transmit sent it.
 * Now each unbindable act is left out and named in `skipped`, which transmit
 * refuses on (assembledTransmitBlockers).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));

import { assembleSequence, assembledTransmitBlockers } from '../assemble-from-core';
import { buildLeafManifest } from '../sequence-manifest';
import { loadLatestPriorManifestBySubmission } from '../prior-sequence-loader';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;

async function indexXmlOf(bundlePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  return (await zip.file('index.xml')?.async('string')) ?? '';
}

async function zipEntriesOf(bundlePath: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  return Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
}

const assemble = (sequenceId: number) =>
  assembleSequence({ sequenceId, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS ectd_compilations (
      id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER,
      sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW()
    );
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES
      (1, 'rename', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (2, 'append', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (3, 'no-prior', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (4, 'first', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (5, 'withdraw', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, dispatch_status) VALUES
      (1, 1, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (2, 1, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (3, 2, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (4, 2, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (5, 3, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (6, 3, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (7, 4, 'fda', '0000', ${ORG}, ${USER}, NULL),
      (8, 5, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (9, 5, 'fda', '0001', ${ORG}, ${USER}, NULL);
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (100, ${ORG}, 'Drug Substance General', '<p>v2</p>', '3.2', 'approved'),
      (101, ${ORG}, 'Drug Substance General', '<p>v2</p>', '3.2', 'approved'),
      (102, ${ORG}, 'Drug Substance General', '<p>v2</p>', '3.2', 'approved'),
      (103, ${ORG}, 'Drug Substance General', '<p>v2</p>', '3.2', 'approved'),
      (104, ${ORG}, 'Drug Substance General', '<p>v1</p>', '3.2', 'approved');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      (2, 'm3.2.s.1', 'Drug Substance General', 'replace', 'coauthor_documents', 100, ${ORG}, ${USER}),
      (4, 'm3.2.s.1', 'Drug Substance General', 'append',  'coauthor_documents', 101, ${ORG}, ${USER}),
      (6, 'm3.2.s.1', 'Drug Substance General', 'replace', 'coauthor_documents', 102, ${ORG}, ${USER}),
      (7, 'm3.2.s.1', 'Drug Substance General', 'replace', 'coauthor_documents', 103, ${ORG}, ${USER}),
      (9, 'm3.2.s.1', 'Drug Substance General', 'delete',  'coauthor_documents', 104, ${ORG}, ${USER});
  `);
  // Submission 1 filed the section under a different file name than the one
  // this sequence stages; submission 2 filed it under the same one. Submission 3
  // has a sent 0000 and no inventory on record at all.
  await harness.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES
       ($1, 1, '0000', $2), ($1, 2, '0000', $3), ($1, 5, '0000', $4)`,
    [
      ORG,
      JSON.stringify([{ ctdSection: 'm3.2.s.1', fileName: 'drug-substance-general.pdf', href: 'm3/32-s-1/drug-substance-general.pdf', md5: 'a'.repeat(32), operation: 'new' }]),
      JSON.stringify([{ ctdSection: 'm3.2.s.1', fileName: '3-2-coauthor-documents-101.pdf', href: 'm3/3-2-s-1/3-2-coauthor-documents-101.pdf', md5: 'b'.repeat(32), operation: 'new' }]),
      JSON.stringify([{ ctdSection: 'm3.2.s.1', fileName: '3-2-coauthor-documents-104.pdf', href: 'm3/3-2-s-1/3-2-coauthor-documents-104.pdf', md5: 'c'.repeat(32), operation: 'new' }]),
    ],
  );
});

afterAll(async () => {
  await harness.close();
});

describe('declared lifecycle acts', () => {
  it('refuses a declared replace the diff cannot bind, instead of filing it as new', async () => {
    const r = await assemble(2);
    try {
      expect(await indexXmlOf(r.bundle.path)).not.toMatch(/3-2-coauthor-documents-100\.pdf/);
      expect(r.skipped).toEqual([
        expect.objectContaining({ sectionCode: 'm3.2.s.1', reason: expect.stringMatching(/^declared replace: no filed leaf named 3-2-coauthor-documents-100\.pdf/) }),
      ]);
      expect(assembledTransmitBlockers(r)).toHaveLength(1);
    } finally {
      await r.cleanup();
    }
  });

  it('files a declared append as an append, pointing at the filed leaf', async () => {
    const r = await assemble(4);
    try {
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).toMatch(/operation="append"/);
      expect(xml).not.toMatch(/operation="replace"/);
      expect(xml).toContain('../0000/m3/3-2-s-1/3-2-coauthor-documents-101.pdf');
      expect(r.skipped).toEqual([]);
      // The act, its pointer, and the filed sequence it was bound against are
      // on the record the next sequence is diffed against.
      expect(r.priorSequence).toBe('0000');
      expect(buildLeafManifest(r.bundle.leafManifest ?? [])).toEqual([
        expect.objectContaining({
          operation: 'append',
          modifiedFile: '../0000/m3/3-2-s-1/3-2-coauthor-documents-101.pdf',
        }),
      ]);
    } finally {
      await r.cleanup();
    }
  });

  it('refuses a declared replace when no filed prior is on record, instead of shipping a replace of nothing', async () => {
    const r = await assemble(6);
    try {
      expect(await indexXmlOf(r.bundle.path)).not.toMatch(/operation="replace"/);
      expect(r.skipped).toEqual([
        { sectionCode: 'm3.2.s.1', reason: 'declared replace: no filed prior sequence is on record to act on' },
      ]);
      expect(r.priorSequence).toBeNull();
    } finally {
      await r.cleanup();
    }
  });

  it('refuses a declared replace in a first sequence', async () => {
    const r = await assemble(7);
    try {
      expect(await indexXmlOf(r.bundle.path)).not.toMatch(/operation="replace"/);
      expect(r.skipped).toEqual([
        { sectionCode: 'm3.2.s.1', reason: 'declared replace: a first sequence has nothing on file to act on' },
      ]);
      expect(r.priorSequence).toBeNull();
    } finally {
      await r.cleanup();
    }
  });
});

/**
 * A withdrawal is a filing act with no bytes of its own. 2026-09-23 (W5/D7).
 *
 * 1. The packager kept a backbone-only delete out of its leaf manifest, so the
 *    stored manifest never recorded it — and the prior-state fold, which drops a
 *    leaf whose last operation was a delete, never saw one. The leaf withdrawn
 *    in 0001 stayed "on file" for 0002 and every sequence after it.
 * 2. A declared delete whose row still names its document resolved to that
 *    document's file, so the delete carried a sourcePath and the packager
 *    shipped the withdrawn document's bytes inside the new sequence.
 */
describe('declared withdrawals', () => {
  it('ships no bytes of its own, even when its row still names the document', async () => {
    const r = await assemble(9);
    try {
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).toMatch(/operation="delete"/);
      expect(xml).toContain('modified-file="../0000/m3/3-2-s-1/3-2-coauthor-documents-104.pdf"');
      expect(await zipEntriesOf(r.bundle.path)).not.toContainEqual(expect.stringMatching(/3-2-coauthor-documents-104\.pdf$/));
      expect(r.skipped).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it('is recorded in the leaf manifest, so the sequence after it no longer holds the withdrawn leaf on file', async () => {
    const r = await assemble(9);
    let manifest: ReturnType<typeof buildLeafManifest>;
    try {
      manifest = buildLeafManifest(r.bundle.leafManifest ?? []);
    } finally {
      await r.cleanup();
    }
    expect(manifest).toEqual([
      expect.objectContaining({
        ctdSection: 'm3.2.s.1',
        fileName: '3-2-coauthor-documents-104.pdf',
        md5: 'c'.repeat(32),
        operation: 'delete',
        modifiedFile: '../0000/m3/3-2-s-1/3-2-coauthor-documents-104.pdf',
      }),
    ]);

    // 0001 is filed with that manifest; the state 0002 is diffed against no
    // longer holds the withdrawn leaf.
    await harness.pglite.query(
      `INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES ($1, 5, '0001', $2)`,
      [ORG, JSON.stringify(manifest)],
    );
    await harness.pglite.query(`UPDATE ectd_sequences SET dispatch_status = 'sent' WHERE id = 9`);
    const prior = await loadLatestPriorManifestBySubmission(
      { query: (sql, params) => harness.pglite.query(sql, params) as any },
      { organizationId: ORG, submissionId: 5, currentSequence: '0002' },
    );
    expect(prior.priorSequenceNumber).toBe('0001');
    expect(prior.leaves).toEqual([]);
  });
});
