/**
 * The input path for FDA eCTD validation 1789.
 *
 * `stf-coverage-1789.test.ts` pins the refusal: a US sequence whose Module 4/5
 * study files would be referenced by no Study Tagging File is refused at
 * packaging, because FDA rejects that sequence. A refusal nobody can satisfy is
 * a dead end, and when that refusal landed nothing on the platform could carry a
 * study id or an STF file-tag: `submission_leaves` had no column for either, and
 * the `package_ectd_for_region` tool's leaf schema had no field for either. Both
 * reachable packaging paths — the canonical compile over the submission spine,
 * and AnA's own packaging tool — would have dead-ended on every US sequence with
 * a study report in it.
 *
 * This pins the path that makes the refusal satisfiable, end to end: the column,
 * the projection onto the packager's leaf, and the tool field.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { coreLeafFromSubmissionLeaf, mapCoreLeafToEctdLeaf, type SubmissionLeafRow } from '../core-to-packager';

const repoRoot = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

const MIGRATION = 'migrations/20261012_submission_leaf_stf_study_tagging.sql';

const row = (over: Partial<SubmissionLeafRow> = {}): SubmissionLeafRow => ({
  sectionCode: '5.3.5.1',
  title: 'Study DPL-301 clinical study report',
  lifecycleOp: 'new',
  checksum: null,
  documentTable: 'vault_documents',
  documentId: null,
  documentUuid: '11111111-1111-4111-8111-111111111111',
  granularity: null,
  documentType: 'clinical_study_report',
  studyId: 'DPL-301',
  stfFileTag: 'study-report-body',
  ...over,
});

describe('a leaf carries the study it belongs to, and its STF file-tag', () => {
  it('the submission_leaves projection reads both, so the packager can see them', () => {
    const leaf = coreLeafFromSubmissionLeaf(row());
    expect(leaf.studyId).toBe('DPL-301');
    expect(leaf.stfFileTag).toBe('study-report-body');
  });

  it('they reach the packager leaf, which is what auditStfCoverage reads', () => {
    const packaged = mapCoreLeafToEctdLeaf(coreLeafFromSubmissionLeaf(row()), {
      sourcePath: '/tmp/csr.pdf',
      fileName: 'csr.pdf',
      md5: 'd41d8cd98f00b204e9800998ecf8427e',
    });
    expect(packaged.studyId).toBe('DPL-301');
    expect(packaged.stfFileTag).toBe('study-report-body');
  });

  it('a leaf that names neither carries neither — never a stand-in, which 1789 is about', () => {
    const leaf = coreLeafFromSubmissionLeaf(row({ studyId: null, stfFileTag: null }));
    expect(leaf.studyId ?? null).toBeNull();
    expect(leaf.stfFileTag ?? null).toBeNull();
    const packaged = mapCoreLeafToEctdLeaf(leaf, { sourcePath: '/tmp/x.pdf', fileName: 'x.pdf' });
    expect(packaged.studyId).toBeUndefined();
    expect(packaged.stfFileTag).toBeUndefined();
  });
});

describe('the column exists, and reaches a deployed database', () => {
  it('the schema declares both columns on submission_leaves', () => {
    const schema = read('shared/schema/submissions.ts');
    const table = schema.slice(schema.indexOf('export const submissionLeaves'));
    expect(table).toMatch(/studyId:\s*text\('study_id'\)/);
    expect(table).toMatch(/stfFileTag:\s*text\('stf_file_tag'\)/);
  });

  it('the migration adds them additively, and is replay-safe (RULE 1)', () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/ALTER TABLE[\s\S]*submission_leaves[\s\S]*ADD COLUMN IF NOT EXISTS\s+study_id/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+stf_file_tag/i);
    // A migration in this set re-runs on every deploy, so it must not drop or rewrite.
    expect(sql).not.toMatch(/\bDROP\s+(COLUMN|TABLE|CONSTRAINT)\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+submission_leaves\b/i);
  });

  it('is in the migration set, before the tenant sweeps that must run last', () => {
    const set = read('scripts/db/migration-set.mjs');
    expect(set).toContain(MIGRATION);
    expect(set.indexOf(MIGRATION)).toBeLessThan(set.indexOf('UUID_TENANT_ISOLATION_NONPUBLIC,\n'));
  });
});

describe('AnA can supply them, so the tool it uses to package is not a dead end', () => {
  it('the leaf schema offers both, and says when FDA requires them', () => {
    const defs = read('server/services/ana/AnaToolDefinitions.ts');
    const tool = defs.slice(defs.indexOf("name: 'package_ectd_for_region'"), defs.indexOf('export const TRANSMIT_SUBMISSION'));
    expect(tool).toMatch(/study_id:\s*\{/);
    expect(tool).toMatch(/stf_file_tag:\s*\{/);
    // The rule, and the sections that are exempt from it, are in the description the model reads.
    expect(tool).toContain('1789');
    for (const exempt of ['4.3', '5.2', '5.3.6', '5.4']) expect(tool, exempt).toContain(exempt);
  });

  it('the handler passes them through to the packager', () => {
    const exec = read('server/services/ana/AnaToolExecutor.ts');
    const handler = exec.slice(exec.indexOf("registerToolHandler('package_ectd_for_region'"));
    const mapping = handler.slice(0, handler.indexOf('outputDir,'));
    expect(mapping).toContain('studyId');
    expect(mapping).toContain('stfFileTag');
    expect(mapping).toContain('l.study_id');
    expect(mapping).toContain('l.stf_file_tag');
  });
});
