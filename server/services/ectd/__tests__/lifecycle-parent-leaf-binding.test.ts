/**
 * A declared replace that names its parent leaf in an EARLIER sequence binds to
 * the file that parent was filed as (2026-10-30, D2 CSR lifecycle).
 *
 * A server-rendered leaf ships as `<label>-rendered-leaf-files-<id>.pdf`
 * (leaf-file-name.ts), so a revised CSR body — a new rendered_leaf_files row —
 * never has the filed body's name, and the lifecycle diff (keyed by section and
 * file name) cannot see that it supersedes it. Declared `replace` without a
 * binding was left out with "no filed leaf named …", which blocks transmit;
 * placed `new`, both versions stayed current at the agency. The parent leaf the
 * row names is the binding: its document's source key is carried by exactly
 * one filed leaf, and that leaf is what the replace's modified-file names.
 *
 * SYNTHETIC rows; runs on PGlite with the real packager.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as unknown, pglite: null as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown> } }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));

import { packageSequenceFromCore } from '../package-from-core';
import { renderedLeafPackageName } from '../leaf-file-name';
import { minimalPdf } from '../../csr/__tests__/support/csr-assembly-fixture';

const ORG = 7;
const USER = 3;
let h: IndPgliteDb;
let work = '';
const FILED_BODY = renderedLeafPackageName('csr-body.pdf', 500);
const FILED_TABLES = renderedLeafPackageName('csr-14-tables.pdf', 502);

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = h.db;
  holder.pglite = h.pglite as never;
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'parent-binding-'));
  await h.pglite.exec(`
    CREATE TABLE IF NOT EXISTS ectd_compilations (id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER, compilation_type TEXT,
      sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW());
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
      VALUES (1, 'SYNTHETIC LMN-201 IND', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    -- 0001 is an amendment to the Original Application 0000 opened (the FDA
    -- identity rule refuses a second Original; 2026-10-30, D5 fixture fix).
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, type, organization_id, created_by, dispatch_status)
      VALUES (1, 1, 'fda', '0000', 'original', ${ORG}, ${USER}, 'sent'), (2, 1, 'fda', '0001', 'amendment', ${ORG}, ${USER}, NULL);
    -- 0000 filed the body (rendered file 500) and the §14 tables (502).
    INSERT INTO submission_leaves (id, sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by, study_id, stf_file_tag)
      VALUES (10, 1, 'm5.3.5.1', 'CSR body', 'new', 'rendered_leaf_files', 500, ${ORG}, ${USER}, 'SYN-LMN201-B', 'study-report'),
             (12, 1, 'm5.3.5.1', 'Section 14 tables', 'new', 'rendered_leaf_files', 502, ${ORG}, ${USER}, 'SYN-LMN201-B', 'study-report');
    -- 0001 files the revised body (rendered file 501) as a replace of leaf 10.
    INSERT INTO submission_leaves (id, sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by, study_id, stf_file_tag, parent_leaf_id)
      VALUES (20, 2, 'm5.3.5.1', 'CSR body', 'replace', 'rendered_leaf_files', 501, ${ORG}, ${USER}, 'SYN-LMN201-B', 'study-report-body', 10);
  `);
  const idx = { backbone: 'index.xml', operation: 'new' };
  await h.pglite.query(`INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES ($1, 1, '0000', $2)`, [ORG, JSON.stringify([
    { ctdSection: 'm5.3.5.1', fileName: FILED_BODY, href: `m5/53-clin-stud-rep/535-rep-effic-safety-stud/${FILED_BODY}`, md5: 'a'.repeat(32), leafId: 'leaf-csr-body-500', ...idx },
    { ctdSection: 'm5.3.5.1', fileName: FILED_TABLES, href: `m5/53-clin-stud-rep/535-rep-effic-safety-stud/${FILED_TABLES}`, md5: 'c'.repeat(32), leafId: 'leaf-csr-tables-502', ...idx },
  ])]);
});
afterAll(async () => { await h?.close(); if (work) await fs.rm(work, { recursive: true, force: true }); });

it('binds a declared replace to the filed leaf its cross-sequence parent was filed as (SYNTHETIC)', async () => {
  const file = path.join(work, 'body-501.pdf');
  await minimalPdf(file, 'SYNTHETIC revised CSR body');
  const result = await packageSequenceFromCore({
    sequenceId: 2, organizationId: ORG, userId: USER, outputDir: path.join(work, 'pkg'), applicationId: '123456', sponsorId: 'D', sponsorName: 'SYNTHETIC sponsor',
    resolveFile: (leaf) => leaf.documentId === 501 ? { fileName: renderedLeafPackageName('csr-body.pdf', 501), sourcePath: file, md5: 'b'.repeat(32) } : null,
  });
  expect(result.skipped).toEqual([]);
  const zip = await JSZip.loadAsync(await fs.readFile(result.bundle.path));
  const indexXml = (await zip.file('index.xml')?.async('string')) ?? '';
  expect(indexXml).toMatch(/operation="replace"/);
  expect(indexXml).toContain('modified-file="../0000/index.xml#leaf-csr-body-500"');
  // The §14 tables 0001 does not mention stay on file, untouched.
  expect(indexXml).not.toContain(FILED_TABLES);
  // The revised body ships under its own name as that replace, not as a second, new body.
  expect(indexXml).toMatch(/<leaf operation="replace"[^>]*rendered-leaf-files-501\.pdf/);
  expect(indexXml).not.toMatch(/<leaf operation="new"[^>]*rendered-leaf-files-501\.pdf/);
});
