/**
 * Rehearsal binding — a follow-up sequence bound against earlier sequences that
 * were never filed, for validation only. 2026-09-23 (W5/D7, WO-9 Click 6; JM's
 * decision of that date).
 *
 * The filed prior state counts a sequence only when a transmit reached the
 * agency (dispatch_status sent/acknowledged). With no ESG credentials nothing
 * has been sent, so 0001's declared replace and delete had nothing to bind to
 * and were left out. A rehearsal binds them against the LATEST recorded compile
 * of each earlier sequence, filed or not, and says which were not filed — so an
 * agency validator can check the lifecycle before anything is sent. Nothing it
 * produces is filed state: the filed loader, which transmit uses, never reads a
 * rehearsal compile, and assembly without a rehearsal still refuses the acts.
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

import { assembleSequence, assembleSubmissionEctd } from '../assemble-from-core';
import { loadLatestPriorManifestBySubmission, loadRehearsalPriorManifestBySubmission } from '../prior-sequence-loader';
import { baseLeafId } from '../../submission-gateways/ectd-packager/leaf-id';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const pool = () => ({ query: (sql: string, params?: unknown[]) => harness.pglite.query(sql, params) as any });

async function indexXmlOf(bundlePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  return (await zip.file('index.xml')?.async('string')) ?? '';
}

const assemble = (sequenceId: number, priorState?: 'filed' | 'rehearsal') =>
  assembleSequence({
    sequenceId, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S',
    ...(priorState ? { priorState } : {}),
  });

// A compile's manifest entry as the packager records it, with the backbone ID a
// later modified-file names; `legacy` is the shape recorded before 2026-09-29.
const leaf = (ctdSection: string, fileName: string, md5: string, operation = 'new', legacy = false) => ({
  ctdSection, fileName, href: `m3/3-2-s-1/${fileName}`, md5, operation,
  ...(legacy ? {} : { leafId: baseLeafId({ ctdSection, fileName }), backbone: 'index.xml' }),
});

beforeAll(async () => {
  // The program spine: an export names the organisation and the project's
  // recorded application number, or it is not built (package-identity.ts, QA j6).
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS ectd_compilations (
      id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER, compilation_type TEXT,
      sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW()
    );
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Rehearsal Sponsor Inc.');
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, application_number)
      VALUES ('0e000000-0000-4000-8000-0000000000e1', ${ORG}, 'Rehearsal IND', 'RH-1', 'IND', 'Rehearsalinib', '000101');
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES
      (1, 'unfiled original', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (2, 'rehearsal row later sent', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (3, 'original recorded before leaf IDs', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, dispatch_status) VALUES
      (1, 1, 'fda', '0000', ${ORG}, ${USER}, NULL), (2, 1, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (3, 2, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (4, 2, 'fda', '0001', ${ORG}, ${USER}, 'sent'),
      (5, 3, 'fda', '0000', ${ORG}, ${USER}, NULL), (6, 3, 'fda', '0001', ${ORG}, ${USER}, NULL);
    UPDATE submissions SET program_id = '0e000000-0000-4000-8000-0000000000e1' WHERE id = 1;
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (200, ${ORG}, 'Drug Substance General', '<p>v2</p>', '3.2', 'approved'),
      (201, ${ORG}, 'Superseded Specification', '<p>old</p>', '3.2', 'approved'),
      (202, ${ORG}, 'Drug Substance General', '<p>v2</p>', '3.2', 'approved'),
      (203, ${ORG}, 'Superseded Specification', '<p>old</p>', '3.2', 'approved');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      (2, 'm3.2.s.1', 'Drug Substance General', 'replace', 'coauthor_documents', 200, ${ORG}, ${USER}),
      (2, 'm3.2.s.4', 'Superseded Specification', 'delete', 'coauthor_documents', 201, ${ORG}, ${USER}),
      (6, 'm3.2.s.1', 'Drug Substance General', 'replace', 'coauthor_documents', 202, ${ORG}, ${USER}),
      (6, 'm3.2.s.4', 'Superseded Specification', 'delete', 'coauthor_documents', 203, ${ORG}, ${USER});
  `);
  // Submission 1, sequence 0000, never sent: an OLDER compile that still held a
  // leaf later removed, then the latest compile — the one a rehearsal binds to.
  await harness.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest, compiled_at) VALUES
       ($1, 1, 'initial', '0000', $2, NOW() - INTERVAL '1 day'),
       ($1, 1, 'initial', '0000', $3, NOW())`,
    [
      ORG,
      JSON.stringify([
        leaf('m3.2.s.1', '3-2-coauthor-documents-200.pdf', 'a'.repeat(32)),
        leaf('m3.2.s.4', '3-2-coauthor-documents-201.pdf', 'b'.repeat(32)),
        leaf('m3.2.s.9', 'dropped-before-filing.pdf', 'c'.repeat(32)),
      ]),
      JSON.stringify([
        leaf('m3.2.s.1', '3-2-coauthor-documents-200.pdf', 'a'.repeat(32)),
        leaf('m3.2.s.4', '3-2-coauthor-documents-201.pdf', 'b'.repeat(32)),
      ]),
    ],
  );
  // Submission 2: 0000 and 0001 both SENT, but 0001's only compile on record is a
  // rehearsal — which must never count as what 0001 filed.
  await harness.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest) VALUES
       ($1, 2, 'initial', '0000', $2),
       ($1, 2, 'rehearsal', '0001', $3)`,
    [
      ORG,
      JSON.stringify([leaf('m3.2.s.1', 'filed.pdf', 'd'.repeat(32))]),
      JSON.stringify([leaf('m3.2.s.1', 'rehearsed.pdf', 'e'.repeat(32))]),
    ],
  );
  // Submission 3: 0000 compiled before the packager recorded backbone IDs.
  await harness.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest) VALUES
       ($1, 3, 'initial', '0000', $2)`,
    [
      ORG,
      JSON.stringify([
        leaf('m3.2.s.1', '3-2-coauthor-documents-202.pdf', 'a'.repeat(32), 'new', true),
        leaf('m3.2.s.4', '3-2-coauthor-documents-203.pdf', 'b'.repeat(32), 'new', true),
      ]),
    ],
  );
});

afterAll(async () => {
  await harness.close();
});

describe('the rehearsal prior state', () => {
  it('folds the latest recorded compile of each earlier sequence, filed or not, and names the unfiled', async () => {
    const prior = await loadRehearsalPriorManifestBySubmission(pool(), { organizationId: ORG, submissionId: 1, currentSequence: '0001' });
    expect(prior.priorSequenceNumber).toBe('0000');
    expect(prior.unfiledSequences).toEqual(['0000']);
    // The latest compile of 0000, not the older one that still held a dropped leaf.
    expect(prior.leaves.map((l) => l.fileName).sort()).toEqual(['3-2-coauthor-documents-200.pdf', '3-2-coauthor-documents-201.pdf']);
  });

  it('the filed prior state never reads a rehearsal compile, even of a sequence that was sent', async () => {
    const prior = await loadLatestPriorManifestBySubmission(pool(), { organizationId: ORG, submissionId: 2, currentSequence: '0002' });
    expect(prior.leaves.map((l) => l.fileName)).toEqual(['filed.pdf']);
    expect(prior.priorSequenceNumber).toBe('0000');
  });
});

describe('assembling a follow-up sequence as a rehearsal', () => {
  it('binds the declared replace and delete to the recorded, unfiled 0000, and says it is a rehearsal', async () => {
    const r = await assemble(2, 'rehearsal');
    try {
      const xml = await indexXmlOf(r.bundle.path);
      // Each act names the leaf 0000 recorded: its backbone and ID (ICH v3.2.2).
      expect(xml).toMatch(/operation="replace"[^>]*modified-file="\.\.\/0000\/index\.xml#leaf-m3-2-s-1-3-2-coauthor-documents-200"/);
      expect(xml).toMatch(/operation="delete"[^>]*modified-file="\.\.\/0000\/index\.xml#leaf-m3-2-s-4-3-2-coauthor-documents-201"/);
      expect(r.skipped).toEqual([]);
      expect(r.priorState).toBe('rehearsal');
      expect(r.unfiledPriorSequences).toEqual(['0000']);
      expect(r.priorSequence).toBe('0000');
    } finally {
      await r.cleanup();
    }
  });

  it('the same sequence assembled for filing — as transmit assembles it — still refuses both acts', async () => {
    const r = await assemble(2);
    try {
      expect(await indexXmlOf(r.bundle.path)).not.toMatch(/operation="(replace|delete)"/);
      expect(r.skipped.map((k) => k.reason)).toEqual([
        'declared replace: no filed prior sequence is on record to act on',
        'declared delete: no filed prior sequence is on record to act on',
      ]);
      expect(r.priorState).toBe('filed');
      expect(r.unfiledPriorSequences).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it('a prior recorded before leaf IDs cannot be acted on: both acts are left out, saying why — no pointer is guessed', async () => {
    const r = await assemble(6, 'rehearsal');
    try {
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).not.toMatch(/operation="(replace|delete)"/);
      expect(xml).not.toMatch(/modified-file=/);
      expect(r.skipped).toEqual([
        expect.objectContaining({ sectionCode: 'm3.2.s.1', reason: expect.stringMatching(/^replace of .*no recorded backbone ID/) }),
        expect.objectContaining({ sectionCode: 'm3.2.s.4', reason: expect.stringMatching(/^delete of .*no recorded backbone ID/) }),
      ]);
    } finally {
      await r.cleanup();
    }
  });

  it('an original sequence has nothing to rehearse against, and says so', async () => {
    await expect(assemble(1, 'rehearsal')).rejects.toThrow(/rehearsal binds a follow-up sequence.*0000 has none/i);
  });
});

describe('exporting a rehearsal', () => {
  it('names the package a rehearsal and reports the unfiled sequences it was bound against', async () => {
    const r = await assembleSubmissionEctd({
      submissionId: 1, organizationId: ORG, userId: USER, sequenceNumber: '0001', priorState: 'rehearsal',
    });
    expect(r.filename).toMatch(/-rehearsal\.zip$/);
    expect(r.priorState).toBe('rehearsal');
    expect(r.unfiledPriorSequences).toEqual(['0000']);
    expect(r.skipped).toEqual([]);
  });

  it('an export for filing keeps its name and binds only against filed sequences', async () => {
    const r = await assembleSubmissionEctd({ submissionId: 1, organizationId: ORG, userId: USER, sequenceNumber: '0001' });
    expect(r.filename).not.toMatch(/rehearsal/);
    expect(r.priorState).toBe('filed');
    expect(r.skipped).toHaveLength(2);
  });
});
