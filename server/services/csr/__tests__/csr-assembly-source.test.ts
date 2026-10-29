/**
 * CSR slice 8 (2026-10-29): a saved CSR job assembles from the import's
 * verified sections and the retained run it was drafted from, and from nothing
 * else. Both reads are the real functions' contracts, stubbed here; their own
 * suites hold their checks (workflow-source-import.pglite, saved-clinical-tables).
 * SYNTHETIC data (support/csr-assembly-fixture.ts).
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const reads = vi.hoisted(() => ({ source: vi.fn(), retained: vi.fn() }));
vi.mock('../../authoring/workflow-source-import.js', () => ({ materializeCsrAssemblySource: reads.source }));
vi.mock('../saved-clinical-tables.js', () => ({ readRetainedStudyForAssembly: reads.retained }));
import { assembleCsrJob } from '../csr-assembly-source';
import { assemblyInput, SECTIONS } from './support/csr-assembly-fixture';

let work: string;
const q = { query: vi.fn() };
const scope = { organizationId: 7, userId: 5, programId: '11111111-2222-4333-8444-000000000011', projectId: 11, jobId: 41 };
beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-assembly-source-'));
  await fs.mkdir(path.join(work, 'out'));
  const fixture = await assemblyInput(path.join(work, 'out'));
  reads.source.mockReset().mockResolvedValue({ jobId: 41, studyId: fixture.studyId, sourceRunId: 'run-41', title: fixture.title, fingerprint: 'f'.repeat(64),
    sections: SECTIONS, lastGeneratedAt: new Date('2026-04-02T10:00:00Z'),
    gaps: ['CSR section 3 is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.',
      'CSR section 14 is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.',
      'CSR section 15 is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.',
      'CSR section 16 is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.'] });
  reads.retained.mockReset().mockResolvedValue({ runId: 'run-41', source: { sha256: 'a'.repeat(64), dataCutDate: '2026-03-31' },
    study: fixture.listingSource.study, tables: fixture.tables });
});
afterEach(async () => { await fs.rm(work, { recursive: true, force: true }); });

describe('assembling a saved CSR job', () => {
  it('composes from the verified job and its retained run; §3, §14 and §16 are filled here, §15 stays a gap', async () => {
    const result = await assembleCsrJob(q as never, { ...scope, outDir: path.join(work, 'out') });
    expect(reads.source).toHaveBeenCalledWith({ organizationId: 7, userId: 5, target: { programId: scope.programId, projectId: 11 }, source: { kind: 'csr', jobId: 41 } }, q);
    expect(reads.retained).toHaveBeenCalledWith(q, { organizationId: 7, userId: 5, programId: scope.programId }, 'run-41', 'SYN-LMN201-B');
    expect(result.bodyGaps).toEqual(['CSR section 15 is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.']);
    expect(result.status).toBe('incomplete');
    expect(result).toMatchObject({ jobId: 41, runId: 'run-41', sourceSha256: 'a'.repeat(64), jobFingerprint: 'f'.repeat(64) });
    // Population flags, deviations and ADLB are not in a retained run: those listings are missing, with the reason.
    expect(result.missing.find(m => m.number === '16.2.3')).toMatchObject({ blocking: true, reason: 'The source supplied carries no subject population flags.' });
    expect(result.missing.find(m => m.number === '16.2.8')?.reason).toBe('No ADLB dataset was supplied.');
    expect(result.missing.find(m => m.number === '16.1.1')?.blocking).toBe(true);
  }, 60_000);

  it('refuses a job that was not built from a retained run, before reading any source rows', async () => {
    reads.source.mockResolvedValue({ ...(await reads.source()), sourceRunId: null });
    await expect(assembleCsrJob(q as never, { ...scope, outDir: path.join(work, 'out') })).rejects.toMatchObject({ code: 'CSR_ASSEMBLY_RUN_REQUIRED' });
    expect(reads.retained).not.toHaveBeenCalled();
  });

  it('refuses a retained source whose records do not name their subject', async () => {
    const retained = await reads.retained();
    const study = JSON.parse(JSON.stringify(retained.study)) as typeof retained.study;
    delete (study.demographics[0] as { subjectId?: string }).subjectId;
    reads.retained.mockResolvedValue({ ...retained, study });
    await expect(assembleCsrJob(q as never, { ...scope, outDir: path.join(work, 'out') })).rejects.toMatchObject({ code: 'CSR_ASSEMBLY_SOURCE_NOT_SUBJECT_LEVEL' });
  });
});
