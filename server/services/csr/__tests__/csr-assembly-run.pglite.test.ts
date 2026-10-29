/**
 * Reach of CSR assembly (2026-10-30): an assembly is queued as a row of
 * csr_assembly_runs (the real migrations/20260628_csr_job_state.sql, replayed
 * twice as every deploy does), runs off the request through the worker, writes
 * its progress, retains every leaf through the rendered-leaf seam with its
 * digest checked, and is placed into an open sequence of its program under
 * 5.3.5.1 with each leaf's STF role. Placement refuses a frozen or transmitted
 * sequence, another project's sequence and a missing blocking appendix, before
 * writing anything.
 *
 * The assembler is the real one (assembleCsrJob → assembleCsr) over the
 * slice-8 SYNTHETIC LMN-201 fixture; its two source reads are stubbed as in
 * csr-assembly-source.test.ts. Storage (storeLeaf) and the leaf writer
 * (upsertLeaf) are STUBS here: recorders that return an id and a digest, with
 * none of storeRenderedLeafFile's or upsertLeaf's own checks (the stub writer
 * does not refuse a frozen sequence, verify the document or deduplicate a
 * repeat). The real ones run in csr-assembly-packaged.pglite.test.ts, which
 * places through upsertLeaf into submission_leaves and packages the result.
 * (Corrected 2026-10-30: this header said the fakes had the real contracts.)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const reads = vi.hoisted(() => ({ source: vi.fn(), retained: vi.fn() }));
vi.mock('../../authoring/workflow-source-import.js', () => ({ materializeCsrAssemblySource: reads.source }));
vi.mock('../saved-clinical-tables.js', () => ({ readRetainedStudyForAssembly: reads.retained }));
import { assembleCsrJob } from '../csr-assembly-source';
import { enqueueCsrAssembly, parseDeclarations, readLatestCsrAssembly, runCsrAssembly, type CsrAssemblyWorkerDeps } from '../csr-assembly-run';
import { placeCsrAssembly, type CsrPlacementDeps, type PlacementSequence } from '../csr-assembly-placement';
import { assemblyInput, minimalPdf, SECTIONS } from './support/csr-assembly-fixture';
import type { StoreRenderedLeafFileInput } from '../../ectd/rendered-leaf-files';

const SQL = readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8');
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const OTHER_PROGRAM = '11111111-2222-4333-8444-000000000022';
let pg: PGlite;
const q = { query: async (text: string, params?: unknown[]) => pg.query<Record<string, unknown>>(text, params as never[]) };
const stored = new Map<number, { sha256: string; input: StoreRenderedLeafFileInput }>();
let corruptStore = false;

function deps(over: Partial<CsrAssemblyWorkerDeps> = {}): CsrAssemblyWorkerDeps {
  return {
    withOrganization: (_org, fn) => fn(q as never),
    assemble: assembleCsrJob,
    storeLeaf: async (input) => {
      const id = stored.size + 1;
      const sha256 = corruptStore ? 'f'.repeat(64) : createHash('sha256').update(input.bytes).digest('hex');
      stored.set(id, { sha256, input });
      return { id, sha256, md5: createHash('md5').update(input.bytes).digest('hex'), vaultVersionId: `v-${id}` };
    },
    // The Vault read is csr-assembly-supply.ts; here each chosen document is an invented one-page PDF.
    materializeSupplied: async (_q, _scope, choices, dir) => {
      const out: Record<string, { path: string; sha256: string }> = {};
      const { promises: fs } = await import('node:fs');
      await fs.mkdir(dir, { recursive: true });
      for (const number of Object.keys(choices)) out[number] = await minimalPdf(path.join(dir, `${number}.pdf`), number);
      return out;
    },
    ...over,
  };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO organizations VALUES (7); INSERT INTO projects VALUES (11); INSERT INTO users VALUES (5);`);
  await pg.exec(SQL);
  await pg.exec(SQL); // every deploy re-runs the file
  const bound = JSON.stringify({ studyInfo: { protocolNumber: 'SYN-LMN201-B' }, evidenceSource: { programId: PROGRAM, runId: 'run-41', studyId: 'SYN-LMN201-B' } });
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (41, 7, 11, 'SYN-LMN201-B', 'complete', $1, 5), (42, 7, 11, 'SYN-LMN201-B', 'complete', '{"studyInfo":{}}', 5)`, [bound]);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  corruptStore = false;
  const fixture = await assemblyInput(path.join(await (await import('node:fs')).promises.mkdtemp(path.join((await import('node:os')).tmpdir(), 'csr-run-fixture-')), 'out'));
  reads.source.mockReset().mockResolvedValue({ jobId: 41, studyId: fixture.studyId, sourceRunId: 'run-41', title: fixture.title, fingerprint: 'f'.repeat(64),
    sections: SECTIONS, lastGeneratedAt: new Date('2026-04-02T10:00:00Z'),
    gaps: ['CSR section 15 is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.'] });
  reads.retained.mockReset().mockResolvedValue({ runId: 'run-41', source: { sha256: 'a'.repeat(64), dataCutDate: '2026-03-31' },
    study: fixture.listingSource.study, tables: fixture.tables });
});

const enqueue = (over: Record<string, unknown> = {}) => enqueueCsrAssembly(q, { organizationId: 7, userId: 5, jobId: 41, ...over });

it('queues, runs off the request, and retains every leaf with its page count and SHA-256 (SYNTHETIC)', async () => {
  const queued = await enqueue();
  expect((await readLatestCsrAssembly(q, 7, 41))).toMatchObject({ id: queued.assemblyId, status: 'queued', progress: 0 });
  await expect(enqueue()).rejects.toMatchObject({ code: 'CSR_ASSEMBLY_IN_PROGRESS', status: 409 });
  const stages: string[] = [];
  await runCsrAssembly(queued.assemblyId, 7, deps({ assemble: (c, input) => assembleCsrJob(c, { ...input, onStage: async (s, d) => { stages.push(s); await input.onStage?.(s, d); } }) }));
  const run = (await readLatestCsrAssembly(q, 7, 41))!;
  expect(run).toMatchObject({ status: 'assembled', progress: 100, stage: 'Assembled' });
  expect(stages).toEqual(expect.arrayContaining(['Listing 16.2.1', 'Listing 16.2.7', 'Section 14 tables', 'Report body']));
  const files = run.result!.leaves.map(l => l.fileName);
  expect(files).toEqual(expect.arrayContaining(['csr-body.pdf', 'csr-14-tables.pdf', 'csr-16-2-1-discontinued.pdf', 'csr-16-2-7-adverse-events.pdf']));
  for (const leaf of run.result!.leaves) {
    expect(leaf.pages).toBeGreaterThan(0);
    expect(stored.get(leaf.renderedLeafFileId)!.sha256).toBe(leaf.sha256);
    expect(stored.get(leaf.renderedLeafFileId)!.input).toMatchObject({ renderedFrom: 'csr_assembly', sectionCode: 'm5.3.5.1', mime: 'application/pdf' });
  }
  // Nothing was supplied: the protocol (always required) blocks; when-applicable appendices do not.
  expect(run.result!.missing.find(m => m.number === '16.1.1')).toMatchObject({ blocking: true });
  expect(run.result!.missing.some(m => !m.blocking)).toBe(true);
}, 120_000);

it('records a stored copy that differs from the assembled file as a failure, not an assembly', async () => {
  corruptStore = true;
  const queued = await enqueue();
  await runCsrAssembly(queued.assemblyId, 7, deps());
  expect(await readLatestCsrAssembly(q, 7, 41)).toMatchObject({ status: 'failed', result: null, error: { code: 'CSR_ASSEMBLY_RETENTION_DIGEST' } });
}, 120_000);

it('refuses a build with no bound run, and a declaration without a reason', async () => {
  await expect(enqueueCsrAssembly(q, { organizationId: 7, userId: 5, jobId: 42 })).rejects.toMatchObject({ code: 'CSR_ASSEMBLY_RUN_REQUIRED' });
  expect(() => parseDeclarations({ '16.2.2': 'n/a' }, 5, new Date())).toThrow(/Say why appendix 16.2.2/);
  expect(() => parseDeclarations({ '9.1': 'not an appendix at all' }, 5, new Date())).toThrow(/not a §16 appendix/);
  expect(parseDeclarations({ '16.2.2': 'No protocol deviations were recorded.' }, 5, new Date('2026-10-30T09:00:00Z')))
    .toEqual({ '16.2.2': { reason: 'No protocol deviations were recorded.', declaredBy: 5, declaredAt: '2026-10-30T09:00:00.000Z' } });
});

// ── placement ────────────────────────────────────────────────────────────────

const writes: Array<Record<string, unknown>> = [];
function placementDeps(seq: Partial<PlacementSequence>, programId: string | null = PROGRAM, failAt?: string): CsrPlacementDeps {
  return {
    getSequence: async () => ({ id: 90, submissionId: 3, sequenceNumber: '0004', status: 'draft', dispatchStatus: null, ...seq }),
    submissionProgram: async () => ({ programId, title: 'LMN-201 IND' }),
    upsertLeaf: async (input) => {
      if (failAt && String(input.title).includes(failAt)) throw new Error('Sequence is frozen; its leaves are immutable.');
      writes.push(input);
      return { id: 1000 + writes.length };
    },
    // No earlier sequence holds this study's CSR files here (the lifecycle runs on the real writer in csr-assembly-lifecycle.pglite.test.ts).
    priorStudyLeaves: async () => [],
    removeLeaf: async () => { throw new Error('not used by these placements'); },
  };
}
const place = (d: CsrPlacementDeps, assemblyId: number, reason = 'CSR for the Part B data cut') =>
  placeCsrAssembly(q, d, { organizationId: 7, userId: 5, jobId: 41, assemblyId, sequenceId: 90, reason });

async function assembled(over: Record<string, unknown> = {}): Promise<number> {
  const queued = await enqueue(over);
  await runCsrAssembly(queued.assemblyId, 7, deps());
  expect((await readLatestCsrAssembly(q, 7, 41))!.status).toBe('assembled');
  return queued.assemblyId;
}

it('refuses a frozen sequence, a transmitted one and another project’s, before writing any leaf', async () => {
  writes.length = 0;
  const id = await assembled();
  await expect(place(placementDeps({ status: 'frozen' }), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_SEQUENCE_LOCKED', status: 409,
    message: expect.stringMatching(/Sequence 0004 is frozen; its leaves cannot change\..*Nothing was placed\./) });
  await expect(place(placementDeps({ status: 'dispatched' }), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_SEQUENCE_LOCKED' });
  await expect(place(placementDeps({ status: 'validated', dispatchStatus: 'sent' }), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_SEQUENCE_LOCKED',
    message: expect.stringMatching(/is transmitted/) });
  await expect(place(placementDeps({}, OTHER_PROGRAM), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_OTHER_PROJECT' });
  await expect(place(placementDeps({}, null), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_UNANCHORED_SUBMISSION' });
  expect(writes).toEqual([]);
  expect((await readLatestCsrAssembly(q, 7, 41))!.placement).toBeNull();
}, 120_000);

it('refuses placement while a blocking 16.1.x appendix is missing, naming it', async () => {
  writes.length = 0;
  const id = await assembled();
  await expect(place(placementDeps({}), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_BLOCKING_APPENDIX', status: 409,
    message: expect.stringMatching(/Appendix 16\.1\.1 \(.+\).*missing\. Supply each one, or declare it not applicable with a reason and assemble again\. Nothing was placed\./) });
  expect(writes).toEqual([]);
}, 120_000);

it('places every leaf under 5.3.5.1 with its STF role once each blocking appendix is supplied or declared, and records the declarations', async () => {
  writes.length = 0;
  const first = (await readLatestCsrAssembly(q, 7, 41))!.result!;
  const blocking = first.missing.filter(m => m.blocking).map(m => m.number);
  const supplied = Object.fromEntries(blocking.filter(n => /^16\.(1\.|3$)/.test(n)).map(n => [n, { documentId: '11111111-2222-4333-8444-0000000000aa', sha256: 'b'.repeat(64) }]));
  const notApplicable = Object.fromEntries(blocking.filter(n => !supplied[n]).map(n => [n, `SYNTHETIC: appendix ${n} is not produced from this source.`]));
  const id = await assembled({ supplied, notApplicable });
  const run = (await readLatestCsrAssembly(q, 7, 41))!;
  expect(run.result!.missing.filter(m => m.blocking)).toEqual([]);
  expect(run.result!.leaves.filter(l => l.origin === 'supplied').map(l => l.appendix).sort()).toEqual(Object.keys(supplied).sort());
  await expect(place(placementDeps({}), id, 'short')).rejects.toMatchObject({ code: 'CSR_PLACEMENT_REASON_REQUIRED' });
  const placement = await place(placementDeps({ status: 'assembling' }), id);
  expect(writes).toHaveLength(run.result!.leaves.length);
  for (const [i, leaf] of run.result!.leaves.entries()) {
    expect(writes[i]).toMatchObject({ sequenceId: 90, sectionCode: 'm5.3.5.1', lifecycleOp: 'new', documentTable: 'rendered_leaf_files',
      documentId: leaf.renderedLeafFileId, checksum: leaf.md5, studyId: 'SYN-LMN201-B', stfFileTag: leaf.fileTag, reason: 'CSR for the Part B data cut' });
  }
  expect(writes.find(w => w.documentId === run.result!.leaves.find(l => l.fileName === 'csr-body.pdf')!.renderedLeafFileId)).toMatchObject({ stfFileTag: 'study-report' });
  expect(placement).toMatchObject({ state: 'placed', sequenceNumber: '0004', placedBy: 5, declarations: run.notApplicable });
  expect((await readLatestCsrAssembly(q, 7, 41))!.placement).toMatchObject({ state: 'placed', sequenceId: 90 });
  await expect(place(placementDeps({}), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_ALREADY_PLACED' });
}, 180_000);

it('records a writer refusal part-way as a partial placement, naming what was placed', async () => {
  writes.length = 0;
  const previous = (await readLatestCsrAssembly(q, 7, 41))!;
  const id = await assembled({ supplied: previous.supplied, notApplicable: Object.fromEntries(Object.entries(previous.notApplicable).map(([n, d]) => [n, d.reason])) });
  const run = (await readLatestCsrAssembly(q, 7, 41))!;
  const third = run.result!.leaves[2];
  await expect(place(placementDeps({}, PROGRAM, third.title), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_REFUSED',
    message: expect.stringMatching(new RegExp(`${third.fileName.replace(/\./g, '\\.')} was not placed: Sequence is frozen.*2 file\\(s\\) before it were placed`)) });
  expect((await readLatestCsrAssembly(q, 7, 41))!.placement).toMatchObject({ state: 'partial', failedAt: third.fileName, leaves: [{}, {}] });
}, 180_000);

// ── follow-up fixes (2026-10-30) ────────────────────────────────────────────

/** An assembly whose blocking appendices are all supplied or declared (from the previous assembly's choices). */
async function placeable(): Promise<number> {
  const previous = (await readLatestCsrAssembly(q, 7, 41))!;
  return assembled({ supplied: previous.supplied, notApplicable: Object.fromEntries(Object.entries(previous.notApplicable).map(([n, d]) => [n, d.reason])) });
}

it('refuses to place an assembly made before the build’s sections changed (its fingerprint is not the job’s now)', async () => {
  writes.length = 0;
  const id = await placeable();
  reads.source.mockResolvedValue({ ...(await reads.source.getMockImplementation()!()), fingerprint: 'e'.repeat(64) });
  await expect(place(placementDeps({}), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_ASSEMBLY_STALE', status: 409,
    message: expect.stringMatching(/changed since this assembly was made.*Assemble again.*Nothing was placed\./) });
  expect(writes).toEqual([]);
  expect((await readLatestCsrAssembly(q, 7, 41))!.placement).toBeNull();
}, 180_000);

it('refuses to place a body whose drafted text keeps a data placeholder, naming the section; a manual heading not supplied does not block', async () => {
  writes.length = 0;
  const base = await reads.source.getMockImplementation()!();
  reads.source.mockResolvedValue({ ...base, sections: SECTIONS.map(s => s.code === '11.4.1' ? { ...s, content: 'The primary result is [DATA TO BE INSERTED].' } : s),
    gaps: [...base.gaps, 'CSR section 11.4.1 retains a data-to-be-inserted placeholder.'] });
  const id = await placeable();
  const run = (await readLatestCsrAssembly(q, 7, 41))!;
  expect(run.result!.placeholderSections).toEqual(['11.4.1']);
  await expect(place(placementDeps({}), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_BODY_PLACEHOLDER', status: 409,
    message: expect.stringMatching(/Section 11\.4\.1 .*placeholder.*Nothing was placed\./) });
  expect(writes).toEqual([]);
  // The §15 manual-heading gap stays listed and does not block on its own.
  reads.source.mockResolvedValue(base);
  const clean = await placeable();
  const cleanRun = (await readLatestCsrAssembly(q, 7, 41))!;
  expect(cleanRun.result!.bodyGaps.some(g => /section 15/.test(g))).toBe(true);
  expect(cleanRun.result!.placeholderSections).toEqual([]);
  await expect(place(placementDeps({}), clean)).resolves.toMatchObject({ state: 'placed' });
}, 240_000);

it('lets a placement claim left by a stopped worker expire: shown as interrupted, and placed again into the same sequence only', async () => {
  writes.length = 0;
  const id = await placeable();
  const claim = { state: 'placing', sequenceId: 90, sequenceNumber: '0004', placedBy: 5, startedAt: '2026-10-30T09:00:00.000Z', reason: 'CSR for the Part B data cut', leaves: [] };
  await pg.query(`UPDATE csr_assembly_runs SET placement = $2::jsonb, updated_at = now() WHERE id = $1`, [id, JSON.stringify(claim)]);
  // A live claim still refuses a second placement.
  await expect(place(placementDeps({}), id)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_ALREADY_PLACED' });
  expect((await readLatestCsrAssembly(q, 7, 41))!.placement).toMatchObject({ state: 'placing' });
  // No progress for longer than the stall window: the board reads it as interrupted, not "being placed".
  await pg.query(`UPDATE csr_assembly_runs SET updated_at = now() - interval '20 minutes' WHERE id = $1`, [id]);
  expect((await readLatestCsrAssembly(q, 7, 41))!.placement).toMatchObject({ state: 'interrupted', sequenceNumber: '0004' });
  // Another sequence is refused: the interrupted attempt may have written leaves into 0004.
  await expect(placeCsrAssembly(q, placementDeps({ id: 91, sequenceNumber: '0005' }), { organizationId: 7, userId: 5, jobId: 41, assemblyId: id, sequenceId: 91, reason: 'CSR for the Part B data cut' }))
    .rejects.toMatchObject({ code: 'CSR_PLACEMENT_RESUME_SEQUENCE', message: expect.stringMatching(/sequence 0004/) });
  expect(writes).toEqual([]);
  await expect(place(placementDeps({}), id)).resolves.toMatchObject({ state: 'placed', sequenceId: 90 });
  expect((await readLatestCsrAssembly(q, 7, 41))!.placement).toMatchObject({ state: 'placed' });
}, 180_000);
