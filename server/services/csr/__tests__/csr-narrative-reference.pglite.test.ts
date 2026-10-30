/**
 * §14.3.3 imported by reference (2026-10-30, docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e,
 * "§14.3.3 by reference"). The import into Authoring and the assembly source
 * (workflow-source-import.ts) used to read the landed §14.3.3 as one string and
 * refuse more than 2,000,000 characters across all sections
 * (WORKFLOW_SOURCE_LIMIT), about 1,300 narratives. §14.3.3 is engine output,
 * so it is imported as a reference to the build's narrative store: the job,
 * the number of narratives, the store's digest and the opening. The 2,000,000
 * limit still holds for the inline sections. The assembler reads the store.
 *
 * Red first: a build with 1,500 landed narratives (more than 2,000,000
 * characters) was refused at import. Real migration, real SQL store, real
 * import and assembly; only the retained run's tables are a fixture.
 * SYNTHETIC data throughout.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('../../../db', () => ({ pool: { query: async () => ({ rows: [] }) }, getPool: () => ({ query: async () => ({ rows: [] }) }), db: {} }));
vi.mock('../../../lib/unified-ai-client', () => ({ ai: null }));
const retained = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../saved-clinical-tables.js', () => ({ readRetainedStudyForAssembly: retained.read }));
import { materializeWorkflowSource, type WorkflowMaterializationInput } from '../../authoring/workflow-source-import';
import { assembleCsrJob } from '../csr-assembly-source';
import { placeCsrAssembly, type CsrPlacementDeps } from '../csr-assembly-placement';
import { assemblyInput } from './support/csr-assembly-fixture';
import { landSyntheticBuild, narrativeDatabase, PROGRAM, sha, subjectOf, type LandedBuild, type Q } from './support/narrative-reference-fixture';

let pg: PGlite;
let q: Q;
let build: LandedBuild;
let work: string;
const N = 1_500;
const JOB = 41;
const input = (jobId = JOB): WorkflowMaterializationInput => ({ organizationId: 7, userId: 5, target: { programId: PROGRAM, projectId: 11 }, source: { kind: 'csr', jobId } });

beforeAll(async () => {
  ({ pg, q } = await narrativeDatabase());
  build = await landSyntheticBuild(q, JOB, N, { inline: [{ code: '13', content: 'Synthetic conclusions of the narrative-scale study.' }] });
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-narrative-reference-'));
  const fixture = await assemblyInput(path.join(work, 'fixture'));
  retained.read.mockResolvedValue({ runId: 'run-41', source: { sha256: 'a'.repeat(64), dataCutDate: '2026-03-31' }, study: fixture.listingSource.study, tables: fixture.tables });
}, 240_000);
afterAll(async () => { await pg?.close(); if (work) await fs.rm(work, { recursive: true, force: true }); });

describe('§14.3.3 of 1,500 narratives (SYNTHETIC)', () => {
  it('is larger than the inline limit', () => {
    expect(build.landedLength).toBeGreaterThan(2_000_000);
  });

  it('imports by reference: the section holds the opening, the origin the store reference with the narrative count', async () => {
    const imported = await materializeWorkflowSource(input(), q);
    const section = imported.sections.find(s => s.code === '14.3.3')!;
    const origin = imported.origin.sectionOrigins.find(o => o.code === '14.3.3')!;
    expect(section.content.startsWith('Narratives are provided for every subject in study SYN-LMN201-B')).toBe(true);
    expect(section.content).not.toContain('\n\nSubject ');
    expect(imported.sections.reduce((n, s) => n + s.content.length, 0)).toBeLessThan(10_000);
    expect(origin.narrativeReference).toEqual({ schema: 'c2c.csr-narrative-reference.v1', jobId: JOB, sectionNumber: '14.3.3', narratives: N,
      storeDigest: expect.stringMatching(/^[0-9a-f]{64}$/), landedSha256: build.landedSha256, landedLength: build.landedLength, openingSha256: sha(section.content) });
    expect(origin.contentSha256).toBe(sha(section.content));
    // The inline sections are imported as before.
    expect(imported.sections.find(s => s.code === '13')!.content).toBe('Synthetic conclusions of the narrative-scale study.');
    // Same store, same fingerprint.
    expect((await materializeWorkflowSource(input(), q)).fingerprint).toBe(imported.fingerprint);
  }, 120_000);

  it('assembles from the store: all 1,500 filed, each checked against its stored SHA-256, with the import’s fingerprint', async () => {
    const imported = await materializeWorkflowSource(input(), q);
    const out = path.join(work, 'out');
    await fs.mkdir(out, { recursive: true });
    const result = await assembleCsrJob(q as never, { organizationId: 7, userId: 5, programId: PROGRAM, projectId: 11, jobId: JOB, outDir: out });
    expect(result.jobFingerprint).toBe(imported.fingerprint);
    expect(result.narratives).toMatchObject({ verified: true, subjects: N, findings: [], sectionSha256: build.landedSha256 });
    expect(result.narratives!.receipt).toHaveLength(N);
    expect(result.narratives!.receipt.every((r, i) => r.subjectId === subjectOf(i) && r.storedSha256 === build.rows![i].contentHash && r.drawnSha256 === r.storedSha256)).toBe(true);
    const leaf = result.leaves.find(l => l.appendix === '14.3.3');
    expect(leaf).toMatchObject({ fileName: 'csr-14-3-3-narratives.pdf', stfFileTag: 'study-report', ctdSection: '5.3.5.1' });
    expect(result.missing.some(m => m.number === '14.3.3')).toBe(false);
  }, 600_000);
});

describe('the 2,000,000-character limit still applies to the inline sections (SYNTHETIC)', () => {
  it('refuses inline sections over the limit, however the narratives are held', async () => {
    const big = 'x'.repeat(2_000_001);
    await landSyntheticBuild(q, 43, 3, { inline: [{ code: '13', content: big }] });
    await expect(materializeWorkflowSource(input(43), q)).rejects.toMatchObject({ code: 'WORKFLOW_SOURCE_LIMIT' });
  }, 120_000);
});

/** An assembly of `jobId` recorded as finished and clean, made from the build with this fingerprint: only the source check is left to placement. */
async function assembledRun(jobId: number, jobFingerprint: string): Promise<number> {
  const leaf = { appendix: '14.3.3', title: '14.3.3 Narratives', fileName: 'csr-14-3-3-narratives.pdf', packageFileName: 'csr-14-3-3-narratives.pdf', fileTag: 'study-report',
    origin: 'generated', ctdSection: '5.3.5.1', studyId: 'SYN-LMN201-B', pages: 1, bytes: 1, sha256: 'b'.repeat(64), md5: 'c'.repeat(32), renderedLeafFileId: 1 };
  const result = { status: 'complete', studyId: 'SYN-LMN201-B', sourceRunId: 'run-41', sourceSha256: 'a'.repeat(64), jobFingerprint, leaves: [leaf], missing: [], notApplicable: [],
    bodyGaps: [], placeholderSections: [], unresolvedReferences: [], structure: { ok: true, findings: [] }, listings: [], stfWarnings: [], pdfa: '' };
  const { rows } = await q.query(`INSERT INTO csr_assembly_runs (organization_id, job_id, requested_by, status, progress, result) VALUES (7, $1, 5, 'assembled', 100, $2::jsonb) RETURNING id`,
    [jobId, JSON.stringify(result)]);
  return Number(rows[0].id);
}
const placementDeps: CsrPlacementDeps = {
  getSequence: async () => ({ id: 90, submissionId: 3, sequenceNumber: '0004', status: 'draft', dispatchStatus: null }),
  submissionProgram: async () => ({ programId: PROGRAM, title: 'Synthetic IND' }),
  upsertLeaf: async () => ({ id: 1001 }),
  priorStudyLeaves: async () => [],
  removeLeaf: async () => { throw new Error('not used'); },
};
const place = (jobId: number, assemblyId: number) => placeCsrAssembly(q as never, placementDeps, { organizationId: 7, userId: 5, jobId, assemblyId, sequenceId: 90, reason: 'CSR for the synthetic data cut' });

describe('a stored narrative edited after import fails closed, naming the subject (SYNTHETIC)', () => {
  const subject = subjectOf(737);
  it.each([
    ['its text and recorded hash both changed', `UPDATE csr_narrative_outputs SET content = content || ' Edited.', content_hash = encode(sha256(convert_to(content || ' Edited.', 'UTF8')), 'hex')`],
    ['its text changed under its recorded hash', `UPDATE csr_narrative_outputs SET content = content || ' Edited.'`],
  ])('%s: the import no longer verifies, and assembly is refused', async (_case, update) => {
    const jobId = _case.startsWith('its text and') ? 44 : 45;
    await landSyntheticBuild(q, jobId, 800, { length: 200, keepRows: false });
    const before = await materializeWorkflowSource(input(jobId), q);
    expect(before.origin.sectionOrigins.find(o => o.code === '14.3.3')!.narrativeReference!.narratives).toBe(800);
    // Control: an assembly of the build as imported is placed.
    await expect(place(jobId, await assembledRun(jobId, before.fingerprint))).resolves.toMatchObject({ state: 'placed' });
    const pending = await assembledRun(jobId, before.fingerprint);
    await q.query(`${update} WHERE organization_id = 7 AND job_id = $1 AND subject_id = $2`, [jobId, subject]);
    await expect(materializeWorkflowSource(input(jobId), q)).rejects.toMatchObject({ code: 'WORKFLOW_CSR_NARRATIVE_MISMATCH', message: expect.stringContaining(subject) });
    const out = path.join(work, `tampered-${jobId}`);
    await fs.mkdir(out, { recursive: true });
    await expect(assembleCsrJob(q as never, { organizationId: 7, userId: 5, programId: PROGRAM, projectId: 11, jobId, outDir: out }))
      .rejects.toMatchObject({ code: 'WORKFLOW_CSR_NARRATIVE_MISMATCH', message: expect.stringContaining(subject) });
    // An assembly made before the edit is not placed, and the refusal names the subject.
    await expect(place(jobId, pending)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_SOURCE_UNVERIFIED', message: expect.stringContaining(subject) });
  }, 240_000);

  it('an edit the landed text cannot show (a facts digest) still changes the fingerprint: the import no longer verifies, and an earlier assembly is stale', async () => {
    await landSyntheticBuild(q, 47, 60, { length: 200, keepRows: false });
    const before = await materializeWorkflowSource(input(47), q);
    const pending = await assembledRun(47, before.fingerprint);
    await q.query(`UPDATE csr_narrative_outputs SET facts_digest = $3 WHERE organization_id = 7 AND job_id = $1 AND subject_id = $2`, [47, subjectOf(12), 'e'.repeat(64)]);
    const after = await materializeWorkflowSource(input(47), q);
    expect(after.origin.sectionOrigins.find(o => o.code === '14.3.3')!.narrativeReference!.storeDigest)
      .not.toBe(before.origin.sectionOrigins.find(o => o.code === '14.3.3')!.narrativeReference!.storeDigest);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    await expect(place(47, pending)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_ASSEMBLY_STALE' });
  }, 120_000);

  it('a landed §14.3.3 changed under its recorded hash is refused', async () => {
    await landSyntheticBuild(q, 46, 5, { length: 200, keepRows: false });
    await q.query(`UPDATE csr_section_outputs SET content = content || ' Edited.' WHERE job_id = 46 AND section_number = '14.3.3'`);
    await expect(materializeWorkflowSource(input(46), q)).rejects.toMatchObject({ code: 'WORKFLOW_CSR_HASH_MISMATCH' });
  }, 60_000);
});
