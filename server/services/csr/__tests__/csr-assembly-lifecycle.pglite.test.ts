/**
 * eCTD lifecycle of a revised CSR (2026-10-30, D2). SYNTHETIC LMN-201 fixture.
 *
 * A revised CSR placed into a later sequence of the same application is a
 * `replace` of each file the earlier sequence holds for the same study and the
 * same part of the report (body, §14, each §16.2 listing, each supplied §16.1 /
 * §16.3), naming that leaf as its parent. A part with no predecessor stays
 * `new`. An earlier file the revised assembly no longer has is listed for the
 * user: placement is refused until each one is withdrawn in the sequence or
 * confirmed to stay on file; nothing is withdrawn on the user's behalf.
 *
 * And a placement refused part-way, whose build was then edited (so placing
 * again is refused as stale), can withdraw the files it placed: only those
 * leaves, only in that still-open sequence, each removal audited.
 *
 * Nothing on the write path is stubbed except object storage and the audit
 * sink: the real assembler, storeRenderedLeafFile, submission-service
 * upsertLeaf / removeLeaf, on the PGlite harness plus the real
 * 20260628_csr_job_state.sql. The job's two source reads are stubbed as in
 * csr-assembly-source.test.ts. "Same study" is the job's study id and each
 * file's STF role, never a file name.
 */
import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, get pool() { return holder.pool; } }));
const audit = vi.hoisted(() => ({ logAction: vi.fn(async (_entry: unknown) => ({ persisted: true, chained: true, tamperProof: true })) }));
vi.mock('../../auditService', () => ({ default: { logAction: audit.logAction } }));
const objects = vi.hoisted(() => new Map<string, { bytes: Buffer; orgId: number }>());
vi.mock('../../storage', () => ({
  getStorageProvider: () => ({
    name: 'test',
    async put(input: { orgId: number; bytes: Buffer }) {
      const vaultVersionId = `obj-${objects.size + 1}`;
      objects.set(vaultVersionId, { bytes: Buffer.from(input.bytes), orgId: input.orgId });
      return { vaultVersionId, sha256: createHash('sha256').update(input.bytes).digest('hex') };
    },
    async get(vaultVersionId: string, orgId: number) {
      const hit = objects.get(vaultVersionId);
      return hit && hit.orgId === orgId ? { bytes: hit.bytes, sizeBytes: hit.bytes.length, sha256: '', mime: 'application/pdf', filename: 'f.pdf' } : null;
    },
    async delete(vaultVersionId: string) { objects.delete(vaultVersionId); },
  }),
  getStorageProviderFor: () => { throw new Error('not used'); },
}));
const reads = vi.hoisted(() => ({ source: vi.fn(), retained: vi.fn() }));
vi.mock('../../authoring/workflow-source-import.js', () => ({ materializeCsrAssemblySource: reads.source }));
vi.mock('../saved-clinical-tables.js', () => ({ readRetainedStudyForAssembly: reads.retained }));

import { assembleCsrJob } from '../csr-assembly-source';
import { enqueueCsrAssembly, readLatestCsrAssembly, runCsrAssembly } from '../csr-assembly-run';
import { placeCsrAssembly, type CsrPlacementDeps } from '../csr-assembly-placement';
import { previewCsrPlacementLifecycle } from '../csr-assembly-placement';
import { readPriorCsrStudyLeaves } from '../csr-placement-lifecycle';
import { withdrawPartialCsrPlacement } from '../csr-placement-withdraw';
import { storeRenderedLeafFile } from '../../ectd/rendered-leaf-files';
import { getSequence, removeLeaf, upsertLeaf } from '../../submission-service/submission-service';
import { assemblyInput, minimalPdf, SECTIONS } from './support/csr-assembly-fixture';

const ORG = 7;
const USER = 5;
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const SQL = readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8');
const VAULT_DOC = '11111111-2222-4333-8444-0000000000aa';
let h: IndPgliteDb;
let work = '';
const q = { query: async (text: string, params?: unknown[]) => h.pglite.query<Record<string, unknown>>(text, params as never[]) };
let fingerprint = 'f'.repeat(64);

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true, formArtifacts: true });
  holder.db = h.db;
  holder.pool = { query: (text: string, params?: unknown[]) => h.pglite.query(text, params as unknown[]) };
  await h.pglite.exec(`CREATE TABLE IF NOT EXISTS users (id integer PRIMARY KEY);
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'SYNTHETIC org') ON CONFLICT DO NOTHING;
    INSERT INTO projects (id, organization_id, name) VALUES (11, ${ORG}, 'SYNTHETIC project') ON CONFLICT DO NOTHING;
    INSERT INTO users VALUES (${USER});`);
  await h.pglite.exec(SQL);
  await h.pglite.query(`INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name) VALUES ($1, ${ORG}, 'LMN-201', 'LMN', 'ind', 'SYNTHETIC')`, [PROGRAM]);
  await h.pglite.query(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
    VALUES (3, 'LMN-201 IND', 'ind', 'pharma', 'fda', ${ORG}, ${USER}, $1)`, [PROGRAM]);
  const bound = JSON.stringify({ studyInfo: { protocolNumber: 'SYN-LMN201-B' }, evidenceSource: { programId: PROGRAM, runId: 'run-41', studyId: 'SYN-LMN201-B' } });
  await h.pglite.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (41, ${ORG}, 11, 'SYN-LMN201-B', 'complete', $1, ${USER})`, [bound]);
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-lifecycle-'));
  const fixture = await assemblyInput(path.join(work, 'fixture', 'out'));
  reads.source.mockImplementation(async () => ({ jobId: 41, studyId: fixture.studyId, sourceRunId: 'run-41', title: fixture.title, fingerprint,
    sections: SECTIONS, lastGeneratedAt: new Date('2026-04-02T10:00:00Z'),
    gaps: ['CSR section 15 is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.'] }));
  reads.retained.mockResolvedValue({ runId: 'run-41', source: { sha256: 'a'.repeat(64), dataCutDate: '2026-03-31' }, study: fixture.listingSource.study, tables: fixture.tables });
}, 120_000);
afterAll(async () => { await h?.close(); if (work) await fs.rm(work, { recursive: true, force: true }); });

function workerDeps() {
  return {
    withOrganization: <T>(_org: number, fn: (c: never) => Promise<T>) => fn(q as never),
    assemble: assembleCsrJob,
    storeLeaf: storeRenderedLeafFile,
    materializeSupplied: async (_q: unknown, _scope: unknown, choices: Record<string, unknown>, dir: string) => {
      await fs.mkdir(dir, { recursive: true });
      const out: Record<string, { path: string; sha256: string }> = {};
      for (const number of Object.keys(choices)) out[number] = await minimalPdf(path.join(dir, `${number}.pdf`), `${number} ${Math.random()}`);
      return out;
    },
  };
}

/** The real writer and remover; the upsert whose title includes `failOn` is refused once. */
function realPlacement(failOn?: { title: string }): CsrPlacementDeps {
  return {
    getSequence: async (id, ctx) => {
      const s = await getSequence(id, ctx);
      return { id: s.id, submissionId: s.submissionId, sequenceNumber: s.sequenceNumber, status: s.status, dispatchStatus: (s as { dispatchStatus?: string | null }).dispatchStatus ?? null };
    },
    submissionProgram: async () => ({ programId: PROGRAM, title: 'LMN-201 IND' }),
    upsertLeaf: async (input, ctx) => {
      if (failOn && String(input.title).includes(failOn.title)) { failOn = undefined; throw new Error('SYNTHETIC: the writer refused this leaf.'); }
      return upsertLeaf(input as unknown as Parameters<typeof upsertLeaf>[0], ctx);
    },
    removeLeaf: (leafId, sequenceId, ctx, reason) => removeLeaf(leafId, sequenceId, ctx, reason),
    priorStudyLeaves: (args) => readPriorCsrStudyLeaves(q, args),
  };
}

const NOT_PRODUCED: Record<string, string> = { '16.2.2': 'SYNTHETIC: no protocol deviation was recorded in this study.',
  '16.2.3': 'SYNTHETIC: no patient was excluded from the efficacy analysis.', '16.2.8': 'SYNTHETIC: laboratory listings are not produced from this source.' };

/** An assembly ready to place: every blocking appendix supplied (§16.1/16.3) or declared; `extra` supplies one more optional appendix. */
async function assembled(extra?: string) {
  const probe = await enqueueCsrAssembly(q, { organizationId: ORG, userId: USER, jobId: 41 });
  await runCsrAssembly(probe.assemblyId, ORG, workerDeps());
  const missing = (await readLatestCsrAssembly(q, ORG, 41))!.result!.missing;
  const blocking = missing.filter(m => m.blocking).map(m => m.number);
  const suppliedNumbers = [...blocking.filter(n => /^16\.(1\.|3$)/.test(n)), ...(extra ? [extra] : [])];
  const supplied = Object.fromEntries(suppliedNumbers.map(n => [n, { documentId: VAULT_DOC, sha256: 'b'.repeat(64) }]));
  const notApplicable = Object.fromEntries(blocking.filter(n => !supplied[n]).map(n => [n, NOT_PRODUCED[n] ?? `SYNTHETIC: appendix ${n} is not produced here.`]));
  const queued = await enqueueCsrAssembly(q, { organizationId: ORG, userId: USER, jobId: 41, supplied, notApplicable });
  await runCsrAssembly(queued.assemblyId, ORG, workerDeps());
  const run = (await readLatestCsrAssembly(q, ORG, 41))!;
  expect(run.status).toBe('assembled');
  expect(run.result!.missing.filter(m => m.blocking)).toEqual([]);
  return run;
}

/** An optional supplied appendix the base assembly does not carry. */
async function optionalSupplied(): Promise<string> {
  const run = (await readLatestCsrAssembly(q, ORG, 41))!;
  const n = run.result!.missing.find(m => !m.blocking && /^16\.1\./.test(m.number))?.number;
  expect(n).toBeTruthy();
  return n!;
}

async function openSequence(number: string): Promise<number> {
  const seq = await h.pglite.query<{ id: number }>(`INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
    VALUES (3, 'fda', $1, 'draft', ${ORG}, ${USER}) RETURNING id`, [number]);
  return Number(seq.rows[0].id);
}

async function leafRows(sequence: number, live = true) {
  const { rows } = await h.pglite.query<{ id: number; lifecycle_op: string; parent_leaf_id: number | null; stf_file_tag: string; document_id: number; deleted_at: unknown }>(
    `SELECT id, lifecycle_op, parent_leaf_id, stf_file_tag, document_id, deleted_at FROM submission_leaves WHERE sequence_id = $1 ${live ? 'AND deleted_at IS NULL' : ''} ORDER BY id`, [sequence]);
  return rows;
}

const place = (deps: CsrPlacementDeps, assemblyId: number, sequence: number, keepOnFile?: number[]) =>
  placeCsrAssembly(q, deps, { organizationId: ORG, userId: USER, jobId: 41, assemblyId, sequenceId: sequence, reason: 'CSR for the Part B data cut', ...(keepOnFile ? { keepOnFile } : {}) });

/** The leaf a placement wrote for each part of the report, by appendix. */
function byAppendix(placement: unknown): Map<string, number> {
  const leaves = (placement as { leaves: Array<{ appendix: string; leafId: number }> }).leaves;
  return new Map(leaves.map(l => [l.appendix, l.leafId]));
}

let seq0 = 0;
let seq1 = 0;
let firstPlaced = new Map<string, number>();
let secondPlaced = new Map<string, number>();
let extra = '';

it('places a revised CSR as a replace of each earlier file of the same study and part, naming its parent; a new part stays new (SYNTHETIC)', async () => {
  const first = await assembled();
  extra = await optionalSupplied();
  seq0 = await openSequence('0000');
  firstPlaced = byAppendix(await place(realPlacement(), first.id, seq0));
  expect((await leafRows(seq0)).every(r => r.lifecycle_op === 'new')).toBe(true);

  const revised = await assembled(extra);
  seq1 = await openSequence('0001');
  const placement = await place(realPlacement(), revised.id, seq1);
  secondPlaced = byAppendix(placement);
  const rows = new Map((await leafRows(seq1)).map(r => [r.id, r]));
  for (const [appendix, leafId] of secondPlaced) {
    const row = rows.get(leafId)!;
    if (appendix === extra) expect(row).toMatchObject({ lifecycle_op: 'new', parent_leaf_id: null });
    else expect(row, appendix).toMatchObject({ lifecycle_op: 'replace', parent_leaf_id: firstPlaced.get(appendix) });
  }
  // The body and the §14 tables share the 'study-report' role; each replaces its own predecessor.
  expect(firstPlaced.get('body')).not.toBe(firstPlaced.get('14'));
  expect(placement).toMatchObject({ state: 'placed', lifecycle: { replaced: expect.arrayContaining([expect.objectContaining({ appendix: 'body', parentLeafId: firstPlaced.get('body') })]) } });

  // What the board shows before placing: each file's operation and the leaf it replaces.
  const later = await assembled(extra);
  const preview = await previewCsrPlacementLifecycle(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: later.id, sequenceId: await openSequence('0009') });
  expect(preview.undecided).toEqual([]);
  expect(preview.leaves.find(l => l.appendix === 'body')).toMatchObject({ operation: 'replace', parent: { leafId: secondPlaced.get('body'), sequenceNumber: '0001' } });
  expect(preview.leaves.find(l => l.appendix === extra)).toMatchObject({ operation: 'replace', parent: { leafId: secondPlaced.get(extra), sequenceNumber: '0001' } });
}, 600_000);

it('lists an earlier file the revised assembly no longer has, refuses to drop it silently, and places once the user keeps it on file (SYNTHETIC)', async () => {
  const third = await assembled(); // without the optional appendix sequence 0001 added
  const seq2 = await openSequence('0002');
  const dropped = secondPlaced.get(extra)!;
  await expect(place(realPlacement(), third.id, seq2)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_PREDECESSOR_UNDECIDED',
    message: expect.stringMatching(new RegExp(`${extra.replace(/\./g, '\\.')}.*sequence 0001.*leaf ${dropped}.*Nothing was placed\\.`)) });
  expect(await leafRows(seq2)).toEqual([]);
  // A leaf id that is not such a file is refused, not ignored.
  await expect(place(realPlacement(), third.id, seq2, [999999])).rejects.toMatchObject({ code: 'CSR_PLACEMENT_KEEP_ON_FILE_INVALID' });

  const placement = await place(realPlacement(), third.id, seq2, [dropped]);
  expect(placement).toMatchObject({ state: 'placed', lifecycle: { keptOnFile: [expect.objectContaining({ leafId: dropped, sequenceNumber: '0001' })] } });
  const rows = await leafRows(seq2);
  expect(rows.every(r => r.lifecycle_op === 'replace')).toBe(true);
  // Each replaces the newest earlier file of its part (sequence 0001's), not the superseded 0000 one.
  const parents = new Set(rows.map(r => r.parent_leaf_id));
  for (const [appendix, leafId] of secondPlaced) if (appendix !== extra) expect(parents.has(leafId), appendix).toBe(true);
  // Nothing was withdrawn on the user's behalf.
  expect((await leafRows(seq1)).map(r => r.id)).toContain(dropped);
}, 600_000);

it('withdraws only the files a part-way placement wrote, in its still-open sequence, after the build changed (SYNTHETIC)', async () => {
  const run = await assembled();
  const seq3 = await openSequence('0003');
  // A file placed by hand in the same sequence is not the placement's and must stay.
  const own = await h.pglite.query<{ id: number }>(`INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, organization_id, created_by)
    VALUES ($1, 'm1.2', 'Cover letter', 'new', ${ORG}, ${USER}) RETURNING id`, [seq3]);
  const third = run.result!.leaves[2].title;
  const keep = [secondPlaced.get(extra)!];
  await expect(place(realPlacement({ title: third }), run.id, seq3, keep)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_REFUSED' });
  const partial = (await readLatestCsrAssembly(q, ORG, 41))!.placement as { leaves: Array<{ leafId: number }> };
  expect(partial.leaves).toHaveLength(2);

  fingerprint = 'e'.repeat(64); // a section was edited after the part-way placement
  await expect(place(realPlacement(), run.id, seq3, keep)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_ASSEMBLY_STALE' });

  await expect(withdrawPartialCsrPlacement(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: run.id, reason: 'short' }))
    .rejects.toMatchObject({ code: 'CSR_PLACEMENT_REASON_REQUIRED' });
  audit.logAction.mockClear();
  const withdrawn = await withdrawPartialCsrPlacement(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: run.id,
    reason: 'The build was edited after this part-way placement.' });
  expect(withdrawn).toMatchObject({ state: 'withdrawn', withdrawal: { removed: partial.leaves.map(l => expect.objectContaining({ leafId: l.leafId })) } });
  const all = await leafRows(seq3, false);
  for (const l of partial.leaves) expect(all.find(r => r.id === l.leafId)!.deleted_at).not.toBeNull();
  expect(all.find(r => r.id === Number(own.rows[0].id))!.deleted_at).toBeNull();
  const removals = audit.logAction.mock.calls.map(c => c[0] as { action?: string; resourceId?: number; details?: { reason?: string } }).filter(e => e.action === 'LEAF_REMOVED');
  expect(removals.map(e => e.resourceId).sort()).toEqual(partial.leaves.map(l => l.leafId).sort());
  expect(removals.every(e => e.details?.reason === 'The build was edited after this part-way placement.')).toBe(true);
  // The earlier sequences' files are untouched.
  expect((await leafRows(seq1)).length).toBe(secondPlaced.size);
  // Withdrawing twice withdraws nothing more.
  await expect(withdrawPartialCsrPlacement(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: run.id, reason: 'The build was edited again.' }))
    .rejects.toMatchObject({ code: 'CSR_PLACEMENT_WITHDRAW_NOT_PARTIAL' });
  fingerprint = 'f'.repeat(64);
}, 600_000);

it('refuses to withdraw a completed placement, or a part-way one whose sequence has since been frozen (SYNTHETIC)', async () => {
  const run = await assembled();
  const seq4 = await openSequence('0004');
  const keep = [secondPlaced.get(extra)!];
  await place(realPlacement(), run.id, seq4, keep);
  await expect(withdrawPartialCsrPlacement(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: run.id, reason: 'Withdraw the placed CSR files.' }))
    .rejects.toMatchObject({ code: 'CSR_PLACEMENT_WITHDRAW_NOT_PARTIAL' });

  const again = await assembled();
  const seq5 = await openSequence('0005');
  await expect(place(realPlacement({ title: again.result!.leaves[1].title }), again.id, seq5, keep)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_REFUSED' });
  await h.pglite.query(`UPDATE ectd_sequences SET status = 'frozen' WHERE id = $1`, [seq5]);
  await expect(withdrawPartialCsrPlacement(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: again.id, reason: 'The build was edited after this part-way placement.' }))
    .rejects.toMatchObject({ code: 'CSR_PLACEMENT_SEQUENCE_LOCKED' });
  expect((await leafRows(seq5)).length).toBe(1);
}, 600_000);

it('honours a withdrawal placed elsewhere by document, and withdraws an earlier file left out only when the user chooses it on the board (SYNTHETIC)', async () => {
  const dropped = secondPlaced.get(extra)!;
  const { rows: [filed] } = await h.pglite.query<{ section_code: string; title: string; document_id: number }>(
    'SELECT section_code, title, document_id FROM submission_leaves WHERE id = $1', [dropped]);
  // A withdrawal written in Submission Center or by AnA names the document, not a parent leaf: it is honoured.
  const seq6 = await openSequence('0006');
  const elsewhere = await upsertLeaf({ sequenceId: seq6, sectionCode: filed.section_code, title: filed.title, lifecycleOp: 'delete',
    documentTable: 'rendered_leaf_files', documentId: filed.document_id, reason: 'Withdrawn in Submission Center' } as never, { organizationId: ORG, userId: USER });
  const run = await assembled();
  const seen = await previewCsrPlacementLifecycle(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: run.id, sequenceId: seq6 });
  expect(seen.undecided).toEqual([]);
  expect(seen.withdrawnHere.map(p => p.leafId)).toEqual([dropped]);
  await removeLeaf(elsewhere.id, seq6, { organizationId: ORG, userId: USER }, 'SYNTHETIC: undo the withdrawal for the next case');

  // From the board: the user chooses to withdraw it in this sequence. A leaf id that is no such file, or one both kept and withdrawn, is refused.
  const seq7 = await openSequence('0007');
  const placeWith = (decisions: Record<string, unknown>) => placeCsrAssembly(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: run.id,
    sequenceId: seq7, reason: 'Revised CSR without the optional appendix', ...decisions });
  await expect(placeWith({ withdraw: [999999] })).rejects.toMatchObject({ code: 'CSR_PLACEMENT_WITHDRAW_INVALID' });
  await expect(placeWith({ withdraw: [dropped], keepOnFile: [dropped] })).rejects.toMatchObject({ code: 'CSR_PLACEMENT_WITHDRAW_INVALID' });
  expect(await leafRows(seq7)).toEqual([]);
  const placement = await placeWith({ withdraw: [dropped] });
  expect(placement).toMatchObject({ state: 'placed', lifecycle: { withdrawing: [expect.objectContaining({ leafId: dropped, sequenceNumber: '0001' })], keptOnFile: [] } });
  const deletes = (await leafRows(seq7)).filter(r => r.lifecycle_op === 'delete');
  expect(deletes).toEqual([expect.objectContaining({ parent_leaf_id: dropped, document_id: filed.document_id })]);
  // The earlier file itself is untouched; a later sequence no longer lists it.
  expect((await leafRows(seq1)).map(r => r.id)).toContain(dropped);
  const later = await previewCsrPlacementLifecycle(q, realPlacement(), { organizationId: ORG, userId: USER, jobId: 41, assemblyId: (await assembled()).id, sequenceId: await openSequence('0008') });
  expect([...later.undecided, ...later.keptOnFile].map(p => p.leafId)).not.toContain(dropped);
}, 600_000);
