/**
 * A declared withdrawal: not an approval question, and never an assembly abort.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic). Three defects on the canonical spine:
 *
 *  1. A delete ships no bytes, yet materializeLeafSources counted its target
 *     document in `unfinalized` when that document was not approved. The usual
 *     case — a filed document reopened for revision, then withdrawn — was
 *     refused at transmit as "leaf document(s) are not approved", although none
 *     of its content is filed.
 *  2. A named delete binds by the document's CURRENT derived file name. When
 *     that name changed after filing (module_number or title edited), the
 *     lifecycle operator threw "nothing on file to delete" out of the whole
 *     assembly, other leaves included. It now binds by the document's
 *     identity, and otherwise reports the leaf in `skipped` (see below).
 *  3. Every non-vault unresolved entry was pushed without the ref's
 *     documentUuid, while the compile looks each leaf up by
 *     leafSourceKey(table, id, uuid) — so a leaf carrying a uuid was unresolved
 *     under one key and looked up under another, and read as materialized.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass): the section fallback in
 * (2) bound a NAMED withdrawal to the section's only filed leaf whatever
 * document that was — a withdrawal of a document never filed there, or a stale
 * re-withdrawal of one already withdrawn, filed a transmit-clear delete of a
 * different, still-current document. A named withdrawal now binds only by the
 * document's identity (the source key its filed file name carries); only a row
 * that names no document binds by section.
 *
 * 2026-09-23 (W5/D7, residual repair): a document referenced ONLY by a delete
 * was still materialized, so when its source could not be read (row deleted,
 * content emptied, upload bytes rotated, vault bytes missing) it landed in
 * unresolvedLeaves and assembledTransmitBlockers refused the withdrawal — while
 * dispatch-readiness exempts a delete from UNRESOLVED_DOCUMENT, so the two
 * gates disagreed. A withdrawal ships no bytes: such a ref is neither staged
 * nor reported unresolved, and the named delete binds by its key against the
 * filed manifest. Readiness and transmit are asserted to agree on each case.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../../db.js', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
// The release-signature store is not in this harness (it has its own journey);
// every other readiness input is read from the database by the assessor.
vi.mock('../release-signature-status', () => ({
  resolveReleaseSignatureStatus: async () => ({ verdict: 'unsigned', detail: 'stubbed: no release signature store in this harness' }),
  isReleaseSignatureRequired: () => false,
}));

import { assembleSequence, assembledTransmitBlockers } from '../assemble-from-core';
import { materializeLeafSources, leafSourceKey, leafFileName } from '../leaf-source-resolver';
import { assessSequenceDispatchReadiness } from '../assess-dispatch-readiness';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const UUID = '12345678-1234-4234-8234-123456789abc';

const assemble = (sequenceId: number) =>
  assembleSequence({ sequenceId, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });

async function zipOf(bundlePath: string) {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  const xml = (await zip.file('index.xml')?.async('string')) ?? '';
  return { files, xml, del: (xml.match(/<leaf[^>]*operation="delete"[^>]*>/) ?? [''])[0] };
}

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
      (1, 'reopened', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (2, 'renamed', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (3, 'ambiguous', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (4, 'wrong doc', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (5, 'stale', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (6, 'renamed beside another', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (7, 'unreadable named', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (8, 'unnamed', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, dispatch_status) VALUES
      (1, 1, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (2, 1, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (3, 2, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (4, 2, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (5, 3, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (6, 3, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (7, 4, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (8, 4, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (9, 5, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (10, 5, 'fda', '0001', ${ORG}, ${USER}, 'sent'),
      (11, 5, 'fda', '0002', ${ORG}, ${USER}, NULL),
      (12, 6, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (13, 6, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (14, 7, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (15, 7, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (16, 8, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (17, 8, 'fda', '0001', ${ORG}, ${USER}, NULL);
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (300, ${ORG}, 'Stability Summary', '<p>filed text, now under revision</p>', 'm3.2.p.8.1', 'in_review'),
      (301, ${ORG}, 'Other', '<p>unrelated approved leaf</p>', 'm3.2.p.1', 'approved'),
      (106, ${ORG}, 'Renamed', '<p>v1</p>', '3.2.S.2', 'approved'),
      (107, ${ORG}, 'Ambiguous', '<p>v1</p>', '3.2.S.4', 'approved'),
      (404, ${ORG}, 'Keep Me', '<p>filed, current</p>', '3.2', 'approved'),
      (408, ${ORG}, 'Never Filed Here', '<p>x</p>', '3.2', 'approved'),
      (409, ${ORG}, 'Keep Me Too', '<p>filed, current</p>', '3.2', 'approved'),
      (410, ${ORG}, 'Already Withdrawn', '<p>x</p>', '3.2', 'approved'),
      (411, ${ORG}, 'Renamed Beside', '<p>v1</p>', '3.2.S.6', 'approved');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
      (2, 'm3.2.p.8.1', 'Stability Summary', 'delete', 'coauthor_documents', 300, ${ORG}, ${USER}),
      (2, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, ${ORG}, ${USER}),
      (4, 'm3.2.s.2', 'Renamed', 'delete', 'coauthor_documents', 106, ${ORG}, ${USER}),
      (4, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, ${ORG}, ${USER}),
      (6, 'm3.2.s.4', 'Ambiguous', 'delete', 'coauthor_documents', 107, ${ORG}, ${USER}),
      (6, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, ${ORG}, ${USER}),
      (8, 'm3.2.s.2', 'Never Filed Here', 'delete', 'coauthor_documents', 408, ${ORG}, ${USER}),
      (8, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, ${ORG}, ${USER}),
      (11, 'm3.2.s.5', 'Already Withdrawn', 'delete', 'coauthor_documents', 410, ${ORG}, ${USER}),
      (11, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, ${ORG}, ${USER}),
      (13, 'm3.2.s.6', 'Renamed Beside', 'delete', 'coauthor_documents', 411, ${ORG}, ${USER}),
      (13, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, ${ORG}, ${USER}),
      (15, 'm3.2.s.7', 'Gone', 'delete', 'coauthor_documents', 9999, ${ORG}, ${USER}),
      (15, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, ${ORG}, ${USER}),
      (17, 'm3.2.s.8', 'Unnamed', 'delete', NULL, NULL, ${ORG}, ${USER}),
      (17, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, ${ORG}, ${USER});
  `);
  const filed = (section: string, fileName: string, md5: string) => ({
    ctdSection: section, fileName, href: `m3/${section.slice(1).replace(/\./g, '-')}/${fileName}`, md5, operation: 'new',
  });
  await harness.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES
       ($1, 1, '0000', $2), ($1, 2, '0000', $3), ($1, 3, '0000', $4),
       ($1, 4, '0000', $5), ($1, 5, '0000', $6), ($1, 5, '0001', $7), ($1, 6, '0000', $8),
       ($1, 7, '0000', $9), ($1, 8, '0000', $10)`,
    [
      ORG,
      JSON.stringify([filed('m3.2.p.8.1', 'm3-2-p-8-1-coauthor-documents-300.pdf', 'a'.repeat(32))]),
      // Filed when module_number was '3.2' — the derived file name has changed since.
      JSON.stringify([filed('m3.2.s.2', '3-2-coauthor-documents-106.pdf', 'd'.repeat(32))]),
      // Two filed leaves share the section, and neither is the current derived name.
      JSON.stringify([
        filed('m3.2.s.4', 'spec-a.pdf', 'e'.repeat(32)),
        filed('m3.2.s.4', 'spec-b.pdf', 'f'.repeat(32)),
      ]),
      // The section's only filed leaf is a DIFFERENT document (404); 408 was never filed.
      JSON.stringify([filed('m3.2.s.2', '3-2-coauthor-documents-404.pdf', 'c'.repeat(32))]),
      // 409 and 410 filed in 0000; 0001 withdrew 410. 0002 re-declares that withdrawal.
      JSON.stringify([
        filed('m3.2.s.5', '3-2-coauthor-documents-409.pdf', '1'.repeat(32)),
        filed('m3.2.s.5', '3-2-coauthor-documents-410.pdf', '2'.repeat(32)),
      ]),
      JSON.stringify([{
        ...filed('m3.2.s.5', '3-2-coauthor-documents-410.pdf', '2'.repeat(32)),
        href: '../0000/m3/3-2-s-5/3-2-coauthor-documents-410.pdf', operation: 'delete',
      }]),
      // 411 was filed under module '3.2', beside another document's leaf.
      JSON.stringify([
        filed('m3.2.s.6', '3-2-coauthor-documents-411.pdf', '3'.repeat(32)),
        filed('m3.2.s.6', 'other-coauthor-documents-412.pdf', '4'.repeat(32)),
      ]),
      // The only filed leaf; the delete row names a document that cannot be read.
      JSON.stringify([filed('m3.2.s.7', 'x-coauthor-documents-413.pdf', '5'.repeat(32))]),
      // A row that names no document binds by its section.
      JSON.stringify([filed('m3.2.s.8', 'x-coauthor-documents-414.pdf', '6'.repeat(32))]),
    ],
  );
});
afterAll(async () => { await harness.close(); });

describe('materializeLeafSources — approval tally and key space', () => {
  it('does not count a document referenced only by a delete toward unfinalized', async () => {
    const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wd-mat-'));
    try {
      const onlyDelete = await materializeLeafSources({
        leaves: [{ documentTable: 'coauthor_documents', documentId: 300, lifecycleOp: 'delete' }],
        organizationId: ORG, stageDir,
      });
      expect(onlyDelete.unfinalized).toBe(0);
      expect(onlyDelete.unfinalizedSections).toEqual([]);
      // A document that also ships content in the sequence is still gated.
      const alsoShipped = await materializeLeafSources({
        leaves: [
          { documentTable: 'coauthor_documents', documentId: 300, lifecycleOp: 'delete' },
          { documentTable: 'coauthor_documents', documentId: 300, lifecycleOp: 'new' },
        ],
        organizationId: ORG, stageDir,
      });
      expect(alsoShipped.unfinalized).toBe(1);
      // No lifecycle op stated → the gate applies (fail closed).
      const unstated = await materializeLeafSources({
        leaves: [{ documentTable: 'coauthor_documents', documentId: 300 }],
        organizationId: ORG, stageDir,
      });
      expect(unstated.unfinalized).toBe(1);
    } finally {
      await fs.rm(stageDir, { recursive: true, force: true });
    }
  });

  it('keys every unresolved entry exactly as the ref it came from', async () => {
    const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wd-mat-'));
    try {
      const ref = { documentTable: 'coauthor_documents', documentId: 8888, documentUuid: UUID };
      const r = await materializeLeafSources({ leaves: [ref], organizationId: ORG, stageDir });
      expect(r.unresolved).toHaveLength(1);
      expect(r.unresolved[0].documentUuid).toBe(UUID);
      expect(leafSourceKey(r.unresolved[0].documentTable, r.unresolved[0].documentId, r.unresolved[0].documentUuid))
        .toBe(leafSourceKey(ref.documentTable, ref.documentId, ref.documentUuid));
    } finally {
      await fs.rm(stageDir, { recursive: true, force: true });
    }
  });
});

describe('assembleSequence — declared withdrawals', () => {
  it('withdraws a document now under revision without an approval refusal, shipping none of it', async () => {
    const r = await assemble(2);
    try {
      const { files, del } = await zipOf(r.bundle.path);
      expect(del).toContain('modified-file="../0000/m3/3-2-p-8-1/m3-2-p-8-1-coauthor-documents-300.pdf"');
      expect(files.some((f) => f.includes('coauthor-documents-300'))).toBe(false);
      expect(r.unfinalized).toBe(0);
      expect(assembledTransmitBlockers(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  }, 60_000);

  it('binds a named withdrawal by its document identity when the derived file name changed since filing', async () => {
    const r = await assemble(4);
    try {
      const { files, del } = await zipOf(r.bundle.path);
      expect(del).toContain('modified-file="../0000/m3/3-2-s-2/3-2-coauthor-documents-106.pdf"');
      expect(files.some((f) => f.includes('coauthor-documents-106'))).toBe(false);
      expect(r.skipped).toEqual([]);
    } finally {
      await r.cleanup();
    }
  }, 60_000);

  it('reports an unbindable named withdrawal in skipped instead of aborting the assembly', async () => {
    const r = await assemble(6);
    try {
      const { files, del } = await zipOf(r.bundle.path);
      expect(del).toBe('');
      // The other leaf still assembles.
      expect(files.some((f) => f.includes('coauthor-documents-301'))).toBe(true);
      expect(r.skipped).toHaveLength(1);
      expect(r.skipped[0].sectionCode).toBe('m3.2.s.4');
      // 2026-09-23 (W5/D7, round-2 skeptic, second pass): this expected the
      // section fallback's "ambiguous" reason. A named withdrawal no longer
      // binds by section at all; neither filed leaf carries document 107's key.
      expect(r.skipped[0].reason).toMatch(/no filed leaf in m3\.2\.s\.4 is this document/);
      expect(assembledTransmitBlockers(r).length).toBeGreaterThan(0);
    } finally {
      await r.cleanup();
    }
  }, 60_000);

  // 2026-09-23 (W5/D7, round-2 skeptic, second pass): a named withdrawal binds
  // by the document it names, never by whatever else is filed in its section.
  const expectRefusedWithoutDelete = async (sequenceId: number, section: string, reason: RegExp) => {
    const r = await assemble(sequenceId);
    try {
      const { files, del } = await zipOf(r.bundle.path);
      expect(del).toBe('');
      expect(files.some((f) => f.includes('coauthor-documents-301'))).toBe(true);
      const mine = r.skipped.filter((s) => s.sectionCode === section);
      expect(mine).toHaveLength(1);
      expect(mine[0].reason).toMatch(reason);
      expect(assembledTransmitBlockers(r).length).toBeGreaterThan(0);
    } finally {
      await r.cleanup();
    }
  };

  it('does not withdraw a different filed document when the named one was never filed in the section', async () => {
    // 2026-09-23 (W5/D7, residual repair): the reason named the document by
    // its staged file name. A delete-only document is no longer staged, so it
    // is named by its source key.
    await expectRefusedWithoutDelete(8, 'm3.2.s.2', /coauthor_documents:408.*no filed leaf in m3\.2\.s\.2 is this document/);
  }, 60_000);

  it('does not withdraw a different filed document on a stale re-withdrawal', async () => {
    await expectRefusedWithoutDelete(11, 'm3.2.s.5', /coauthor_documents:410.*no filed leaf in m3\.2\.s\.5 is this document/);
  }, 60_000);

  it('does not bind a named withdrawal whose document cannot be read to the section leaf', async () => {
    await expectRefusedWithoutDelete(15, 'm3.2.s.7', /coauthor_documents:9999/);
  }, 60_000);

  it('binds a renamed document by its identity even when another document shares the section', async () => {
    const r = await assemble(13);
    try {
      const { del } = await zipOf(r.bundle.path);
      expect(del).toContain('modified-file="../0000/m3/3-2-s-6/3-2-coauthor-documents-411.pdf"');
      expect(r.skipped).toEqual([]);
    } finally {
      await r.cleanup();
    }
  }, 60_000);

  it('still binds a row that names no document by its unambiguous section', async () => {
    const r = await assemble(17);
    try {
      const { del } = await zipOf(r.bundle.path);
      expect(del).toContain('modified-file="../0000/m3/3-2-s-8/x-coauthor-documents-414.pdf"');
      expect(r.skipped).toEqual([]);
    } finally {
      await r.cleanup();
    }
  }, 60_000);
});

// Fixtures for the suite below: filed documents whose sources can no longer
// be read, each withdrawn in a follow-up sequence.
const VAULT_UUID = '77777777-7777-4777-8777-777777777777';
const PROGRAM = '88888888-8888-4888-8888-888888888888';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const vaultFiled = leafFileName('doc.pdf', leafSourceKey('vault_documents', null, VAULT_UUID));

async function seedUnreadableWithdrawals() {
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY, program_id UUID NOT NULL, storage_version_id TEXT, content_hash TEXT, file_name TEXT, deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS shadow_review_runs (
      id SERIAL PRIMARY KEY, sequence_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda', lens TEXT NOT NULL DEFAULT 'fda_filing',
      model TEXT, prompt_version TEXT, status TEXT NOT NULL DEFAULT 'running', rtf_risk_score REAL, crl_risk_score REAL, summary TEXT,
      organization_id INTEGER NOT NULL, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS shadow_review_findings (
      id SERIAL PRIMARY KEY, run_id INTEGER NOT NULL, dimension TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT,
      basis TEXT, recommendation TEXT, leaf_ref TEXT, status TEXT NOT NULL DEFAULT 'open', organization_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ
    );
    INSERT INTO regulatory_programs (id, organization_id) VALUES ('${PROGRAM}', ${ORG});
    -- On file in the vault, but its bytes never reached the storage provider.
    INSERT INTO vault.documents (id, program_id, storage_version_id, content_hash, file_name)
      VALUES ('${VAULT_UUID}', '${PROGRAM}', NULL, '${sha('vault bytes')}', 'doc.pdf');
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES
      (20, 'row deleted', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (21, 'content emptied', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (22, 'upload rotated', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (23, 'vault bytes missing', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (24, 'filed twice', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    -- The follow-ups are amendments: readiness reads a sequence typed
    -- 'original' (the column default) as an original, where a delete is an error.
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, type, organization_id, created_by, dispatch_status) VALUES
      (40, 20, 'fda', '0000', 'original', ${ORG}, ${USER}, 'sent'), (41, 20, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL),
      (42, 21, 'fda', '0000', 'original', ${ORG}, ${USER}, 'sent'), (43, 21, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL),
      (44, 22, 'fda', '0000', 'original', ${ORG}, ${USER}, 'sent'), (45, 22, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL),
      (46, 23, 'fda', '0000', 'original', ${ORG}, ${USER}, 'sent'), (47, 23, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL),
      (48, 24, 'fda', '0000', 'original', ${ORG}, ${USER}, 'sent'), (49, 24, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL);
    -- 600 was filed and its row has since been deleted (no row inserted).
    -- 601 was filed and its content has since been emptied.
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (601, ${ORG}, 'Emptied', '', '3.2', 'approved'),
      (602, ${ORG}, 'Filed Twice', '<p>v1</p>', '3.2', 'approved');
    -- 700 was filed; its upload bytes have since been rotated off disk.
    INSERT INTO ctd_onboarding_documents (id, organization_id, file_name, mime_type, storage_path) VALUES
      (700, ${ORG}, 'stab.pdf', 'application/pdf', '/nonexistent/rotated/stab.pdf');
  `);
  await harness.pglite.query(
    `INSERT INTO submission_leaves
       (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_uuid, document_content_sha256, organization_id, created_by)
     VALUES
       (41, 'm3.2.s.2', 'Gone', 'delete', 'coauthor_documents', 600, NULL, NULL, $1, $2),
       (41, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, NULL, NULL, $1, $2),
       -- Pinned when the withdrawal was placed; the content has changed since.
       (43, 'm3.2.s.2', 'Emptied', 'delete', 'coauthor_documents', 601, NULL, $3, $1, $2),
       (43, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, NULL, NULL, $1, $2),
       (45, 'm3.2.s.3', 'Stability upload', 'delete', 'ctd_onboarding_documents', 700, NULL, NULL, $1, $2),
       (45, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, NULL, NULL, $1, $2),
       (47, 'm3.2.s.4', 'Vault doc', 'delete', 'vault_documents', NULL, $4::uuid, NULL, $1, $2),
       (47, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, NULL, NULL, $1, $2),
       (49, 'm3.2.s.5', 'Filed Twice', 'delete', 'coauthor_documents', 602, NULL, NULL, $1, $2),
       (49, 'm3.2.p.1', 'Other', 'new', 'coauthor_documents', 301, NULL, NULL, $1, $2)`,
    [ORG, USER, sha('<p>the filed text</p>'), VAULT_UUID],
  );
  const filed = (section: string, fileName: string, md5: string) => ({
    ctdSection: section, fileName, href: `m3/${section.slice(1).replace(/\./g, '-')}/${fileName}`, md5, operation: 'new',
  });
  await harness.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES
       ($1, 20, '0000', $2), ($1, 21, '0000', $3), ($1, 22, '0000', $4), ($1, 23, '0000', $5), ($1, 24, '0000', $6)`,
    [
      ORG,
      JSON.stringify([filed('m3.2.s.2', '3-2-coauthor-documents-600.pdf', '7'.repeat(32))]),
      JSON.stringify([filed('m3.2.s.2', '3-2-coauthor-documents-601.pdf', '8'.repeat(32))]),
      JSON.stringify([filed('m3.2.s.3', 'stab-pdf-ctd-onboarding-documents-700.pdf', '9'.repeat(32))]),
      JSON.stringify([filed('m3.2.s.4', vaultFiled, 'a'.repeat(32))]),
      // The same document filed twice in one section, under two labels.
      JSON.stringify([
        filed('m3.2.s.5', 'old-label-coauthor-documents-602.pdf', 'b'.repeat(32)),
        filed('m3.2.s.5', '3-2-coauthor-documents-602.pdf', 'c'.repeat(32)),
      ]),
    ],
  );
}

// 2026-09-23 (W5/D7, residual repair): a withdrawal ships no bytes, so its
// target's source is never read — and an unreadable one neither blocks
// transmit nor disagrees with dispatch readiness.
describe('a withdrawal of a filed document whose source can no longer be read', () => {
  beforeAll(seedUnreadableWithdrawals);

  it('neither stages nor reports as unresolved a document referenced only by a delete', async () => {
    const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wd-mat-'));
    try {
      const r = await materializeLeafSources({
        leaves: [
          { documentTable: 'coauthor_documents', documentId: 600, lifecycleOp: 'delete' },
          { documentTable: 'coauthor_documents', documentId: 300, lifecycleOp: 'delete' },
          { documentTable: 'ctd_onboarding_documents', documentId: 700, lifecycleOp: ' DELETE ' },
        ],
        organizationId: ORG, stageDir,
      });
      expect(r.unresolved).toEqual([]);
      expect(r.byKey.size).toBe(0);
      expect(r.materialized).toBe(0);
      expect(await fs.readdir(stageDir)).toEqual([]);
      // A document another leaf of the sequence SHIPS is still read, and still
      // reported when it cannot be — fail closed.
      const shipped = await materializeLeafSources({
        leaves: [
          { documentTable: 'coauthor_documents', documentId: 600, lifecycleOp: 'delete' },
          { documentTable: 'coauthor_documents', documentId: 600, lifecycleOp: 'new' },
        ],
        organizationId: ORG, stageDir,
      });
      expect(shipped.unresolved).toHaveLength(1);
      // No lifecycle op stated → treated as shipping.
      const unstated = await materializeLeafSources({
        leaves: [{ documentTable: 'coauthor_documents', documentId: 600 }],
        organizationId: ORG, stageDir,
      });
      expect(unstated.unresolved).toHaveLength(1);
    } finally {
      await fs.rm(stageDir, { recursive: true, force: true });
    }
  });

  const expectWithdrawnAndAgreed = async (sequenceId: number, modifiedFile: string, marker: string) => {
    const r = await assemble(sequenceId);
    try {
      const { files, del } = await zipOf(r.bundle.path);
      // A backbone-only delete pointing at the filed copy …
      expect(del).toContain(`modified-file="${modifiedFile}"`);
      expect(files.some((f) => f.includes(marker))).toBe(false);
      // … the rest of the sequence ships …
      expect(files.some((f) => f.includes('coauthor-documents-301'))).toBe(true);
      // … and nothing stops it at transmit.
      expect(r.unresolvedLeaves).toEqual([]);
      expect(r.skipped).toEqual([]);
      expect(assembledTransmitBlockers(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
    // Readiness agrees: no leaf-level error on the withdrawal.
    const a = await assessSequenceDispatchReadiness({ sequenceId, organizationId: ORG });
    const errors = a.readiness.findings.filter((f) => f.severity === 'error');
    expect(errors).toEqual([]);
    expect(a.validationErrors).toBe(0);
  };

  it('row deleted: zero transmit blockers, a backbone-only delete of the filed copy, and readiness agrees', async () => {
    await expectWithdrawnAndAgreed(41, '../0000/m3/3-2-s-2/3-2-coauthor-documents-600.pdf', 'coauthor-documents-600');
  }, 60_000);

  it('content emptied since the withdrawal was pinned: zero transmit blockers, and readiness agrees', async () => {
    await expectWithdrawnAndAgreed(43, '../0000/m3/3-2-s-2/3-2-coauthor-documents-601.pdf', 'coauthor-documents-601');
  }, 60_000);

  it('upload bytes rotated: zero transmit blockers, and readiness agrees', async () => {
    await expectWithdrawnAndAgreed(45, '../0000/m3/3-2-s-3/stab-pdf-ctd-onboarding-documents-700.pdf', 'ctd-onboarding-documents-700');
  }, 60_000);

  it('vault bytes missing from the storage provider: zero transmit blockers, and readiness agrees', async () => {
    await expectWithdrawnAndAgreed(47, `../0000/m3/3-2-s-4/${vaultFiled}`, VAULT_UUID);
  }, 60_000);

  it('a document filed twice in the section is reported, never guessed and never dropped', async () => {
    const r = await assemble(49);
    try {
      const { del } = await zipOf(r.bundle.path);
      expect(del).toBe('');
      expect(r.unresolvedLeaves).toEqual([]);
      expect(r.skipped).toHaveLength(1);
      expect(r.skipped[0].reason).toMatch(/ambiguous: 2 filed leaves in m3\.2\.s\.5 carry document coauthor_documents:602/);
      expect(assembledTransmitBlockers(r).length).toBeGreaterThan(0);
    } finally {
      await r.cleanup();
    }
  }, 60_000);
});
