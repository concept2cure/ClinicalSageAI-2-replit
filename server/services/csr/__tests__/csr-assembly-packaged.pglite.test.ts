/**
 * A placed CSR, packaged the way Submission Center packages a sequence
 * (2026-10-30 follow-up to the assembly reach). SYNTHETIC LMN-201 fixture.
 *
 * Nothing on the write or package path is stubbed here except object storage
 * (an in-memory provider, the only boundary outside the database) and the
 * audit sink: the real assembler runs through the real worker, every leaf is
 * retained by the real storeRenderedLeafFile into rendered_leaf_files, placed
 * by the real submission-service upsertLeaf into submission_leaves, read back
 * by the real materializeLeafSources and packaged by the real
 * packageEctdSubmission. The job's two source reads are stubbed as in
 * csr-assembly-source.test.ts.
 *
 * What it proves:
 *   - every GoToR link in the packaged body names a file that is in the
 *     package, in the body's own folder (the materializer ships a rendered leaf
 *     as <label>-rendered-leaf-files-<id>.pdf, so the body must link by that
 *     name, not by the name the assembler gave the file);
 *   - a placement that failed part-way is finished by placing again, and the
 *     retry writes no second leaf for a file the first attempt placed.
 */
import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, get pool() { return holder.pool; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));
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
import { readPdfStructure } from '../csr-pdf-structure';
import { storeRenderedLeafFile } from '../../ectd/rendered-leaf-files';
import { getSequence, removeLeaf, upsertLeaf } from '../../submission-service/submission-service';
import { readPriorCsrStudyLeaves } from '../csr-placement-lifecycle';
import { materializeLeafSources, leafSourceKey } from '../../ectd/leaf-source-resolver';
import { coreLeafFromSubmissionLeaf, mapCoreLeafToEctdLeaf, type SubmissionLeafRow } from '../../ectd/core-to-packager';
import { packageEctdSubmission } from '../../submission-gateways/regional-packager';
import { assemblyInput, minimalPdf, SECTIONS } from './support/csr-assembly-fixture';

const ORG = 7;
const USER = 5;
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const SQL = readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8');
let h: IndPgliteDb;
let work = '';
let sequenceId = 0;
const q = { query: async (text: string, params?: unknown[]) => h.pglite.query<Record<string, unknown>>(text, params as never[]) };

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
  const seq = await h.pglite.query<{ id: number }>(`INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
    VALUES (3, 'fda', '0000', 'draft', ${ORG}, ${USER}) RETURNING id`);
  sequenceId = Number(seq.rows[0].id);
  const bound = JSON.stringify({ studyInfo: { protocolNumber: 'SYN-LMN201-B' }, evidenceSource: { programId: PROGRAM, runId: 'run-41', studyId: 'SYN-LMN201-B' } });
  await h.pglite.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (41, ${ORG}, 11, 'SYN-LMN201-B', 'complete', $1, ${USER})`, [bound]);
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-packaged-'));
  const fixture = await assemblyInput(path.join(work, 'fixture', 'out'));
  reads.source.mockResolvedValue({ jobId: 41, studyId: fixture.studyId, sourceRunId: 'run-41', title: fixture.title, fingerprint: 'f'.repeat(64),
    sections: SECTIONS, lastGeneratedAt: new Date('2026-04-02T10:00:00Z'),
    gaps: ['CSR section 15 is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.'] });
  reads.retained.mockResolvedValue({ runId: 'run-41', source: { sha256: 'a'.repeat(64), dataCutDate: '2026-03-31' }, study: fixture.listingSource.study, tables: fixture.tables });
}, 120_000);
afterAll(async () => { await h?.close(); if (work) await fs.rm(work, { recursive: true, force: true }); });

/** The real writer; the call whose title includes `failOn` is refused once, as a writer refusal part-way would be. */
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

async function placedLeafRows(sequence: number): Promise<SubmissionLeafRow[]> {
  const { rows } = await h.pglite.query<Record<string, unknown>>(`SELECT section_code, title, lifecycle_op, checksum, document_table, document_id, document_uuid,
      granularity, document_type, study_id, stf_file_tag FROM submission_leaves WHERE sequence_id = $1 AND deleted_at IS NULL ORDER BY id`, [sequence]);
  return rows.map(r => ({ sectionCode: String(r.section_code), title: String(r.title), lifecycleOp: String(r.lifecycle_op), checksum: (r.checksum as string) ?? null,
    documentTable: (r.document_table as string) ?? null, documentId: r.document_id == null ? null : Number(r.document_id), documentUuid: (r.document_uuid as string) ?? null,
    granularity: (r.granularity as string) ?? null, documentType: (r.document_type as string) ?? null, studyId: (r.study_id as string) ?? null, stfFileTag: (r.stf_file_tag as string) ?? null }));
}

const BLOCKING_FREE: Record<string, string> = { '16.2.2': 'SYNTHETIC: no protocol deviation was recorded in this study.',
  '16.2.3': 'SYNTHETIC: no patient was excluded from the efficacy analysis.', '16.2.8': 'SYNTHETIC: laboratory listings are not produced from this source.' };

/** An assembly with every blocking appendix supplied or declared, ready to place. */
async function assembledReady() {
  const probeRun = await enqueueCsrAssembly(q, { organizationId: ORG, userId: USER, jobId: 41 });
  await runCsrAssembly(probeRun.assemblyId, ORG, workerDeps());
  const probe = (await readLatestCsrAssembly(q, ORG, 41))!;
  expect(probe.status).toBe('assembled');
  const blocking = probe.result!.missing.filter(m => m.blocking).map(m => m.number);
  const supplied = Object.fromEntries(blocking.filter(n => /^16\.(1\.|3$)/.test(n)).map(n => [n, { documentId: '11111111-2222-4333-8444-0000000000aa', sha256: 'b'.repeat(64) }]));
  const notApplicable = Object.fromEntries(blocking.filter(n => !supplied[n]).map(n => [n, BLOCKING_FREE[n] ?? `SYNTHETIC: appendix ${n} is not produced here.`]));
  const queued = await enqueueCsrAssembly(q, { organizationId: ORG, userId: USER, jobId: 41, supplied, notApplicable });
  await runCsrAssembly(queued.assemblyId, ORG, workerDeps());
  const run = (await readLatestCsrAssembly(q, ORG, 41))!;
  expect(run.status).toBe('assembled');
  expect(run.result!.missing.filter(m => m.blocking)).toEqual([]);
  return run;
}

async function openSequence(number: string, submissionId = 3): Promise<number> {
  const seq = await h.pglite.query<{ id: number }>(`INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
    VALUES ($2, 'fda', $1, 'draft', ${ORG}, ${USER}) RETURNING id`, [number, submissionId]);
  return Number(seq.rows[0].id);
}

const placeInto = (deps: CsrPlacementDeps, assemblyId: number, sequence: number) =>
  placeCsrAssembly(q, deps, { organizationId: ORG, userId: USER, jobId: 41, assemblyId, sequenceId: sequence, reason: 'CSR for the Part B data cut' });

/** The same persisted-leaf materialization and package path Submission Center uses. */
async function packageSequence(sequence: number, label: string) {
  const rows = await placedLeafRows(sequence);
  const stageDir = path.join(work, `${label}-stage`);
  await fs.mkdir(stageDir, { recursive: true });
  const core = rows.map(coreLeafFromSubmissionLeaf);
  // As assemble-from-core.ts passes them: the source reference and the op, each present (null when absent).
  const materialized = await materializeLeafSources({ organizationId: ORG, stageDir, leaves: core.map(l => ({
    documentTable: l.documentTable ?? null, documentId: l.documentId ?? null, documentUuid: l.documentUuid ?? null, lifecycleOp: l.lifecycleOp })) });
  expect(materialized.unresolved).toEqual([]);
  const ectdLeaves = core.map(l => mapCoreLeafToEctdLeaf(l, materialized.byKey.get(leafSourceKey(l.documentTable, l.documentId, l.documentUuid))!));
  const bundle = await packageEctdSubmission({
    region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original', fda: { applicationType: 'ind' },
    sponsorId: 'D', sponsorName: 'SYNTHETIC sponsor', productName: 'SYNTHETIC product', outputDir: path.join(work, `${label}-pkg`),
    environment: 'staging', leaves: ectdLeaves, studyMeta: [{ studyId: 'SYN-LMN201-B', studyTitle: 'SYNTHETIC LMN-201-shaped study' }],
  });
  return { bundle, materialized, rows };
}

it('packages a placed CSR with source-confirmed body roles and every GoToR link naming a packaged file (SYNTHETIC)', async () => {
  const run = await assembledReady();
  const leaves = run.result!.leaves;
  await placeInto(realPlacement(), run.id, sequenceId);
  const { bundle, materialized, rows } = await packageSequence(sequenceId, 'current-csr');
  expect(rows).toHaveLength(leaves.length);
  // Independent source value: ICH STF v2.6.1 §III.B p8, E3 sections 1 and 3–15.
  for (const part of leaves.filter(l => ['body', '14', '14.3.3'].includes(l.appendix))) {
    expect(rows.find(row => row.documentId === part.renderedLeafFileId)?.stfFileTag).toBe('study-report-body');
  }
  const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
  const stfEntry = Object.keys(zip.files).find(file => file.endsWith('/stf-syn-lmn201-b.xml'))!;
  expect(stfEntry).toBeTruthy();
  const stfXml = await zip.file(stfEntry)!.async('string');
  const document = new DOMParser().parseFromString(stfXml, 'application/xml');
  const contents = Array.from(document.getElementsByTagName('doc-content'));
  expect(contents).toHaveLength(leaves.length);
  for (const part of leaves.filter(l => ['body', '14', '14.3.3'].includes(l.appendix))) {
    const content = contents.find(node => node.getElementsByTagName('title')[0]?.textContent === part.title)!;
    expect(content).toBeTruthy();
    const tag = content.getElementsByTagName('file-tag')[0];
    expect(tag.getAttribute('name')).toBe('study-report-body');
    expect(tag.getAttribute('info-type')).toBe('ich');
  }
  expect(Array.from(document.getElementsByTagName('file-tag')).some(tag => tag.getAttribute('name') === 'study-report')).toBe(false);
  const bodyLeaf = leaves.find(l => l.appendix === 'body')!;
  const bodyName = materialized.byKey.get(leafSourceKey('rendered_leaf_files', bodyLeaf.renderedLeafFileId))!.fileName;
  const bodyEntry = Object.keys(zip.files).find(f => f.endsWith(`/${bodyName}`))!;
  expect(bodyEntry).toBeTruthy();
  const structure = await readPdfStructure(await zip.file(bodyEntry)!.async('uint8array'));
  const targets = [...new Set(structure.links.filter(l => l.action === 'GoToR').map(l => String(l.file)))].sort();
  expect(targets.length).toBeGreaterThan(3);
  const folder = path.posix.dirname(bodyEntry);
  expect(targets.filter(t => !zip.file(`${folder}/${t}`))).toEqual([]);
}, 300_000);

it('refuses newly packaging an already placed old role without changing its retained rows or assembly (SYNTHETIC)', async () => {
  const run = await assembledReady();
  await h.pglite.query(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
    VALUES (4, 'SYNTHETIC second application', 'ind', 'pharma', 'fda', ${ORG}, ${USER}, $1)`, [PROGRAM]);
  const sequence = await openSequence('0000', 4);
  await placeInto(realPlacement(), run.id, sequence);
  const body = run.result!.leaves.find(leaf => leaf.appendix === 'body')!;
  // Historical fixture: metadata written before the role correction, not an automatic repair.
  await h.pglite.query('UPDATE submission_leaves SET stf_file_tag=$1 WHERE sequence_id=$2 AND document_id=$3', ['study-report', sequence, body.renderedLeafFileId]);
  const before = await placedLeafRows(sequence);
  const assembly = (await readLatestCsrAssembly(q, ORG, 41))!;
  await expect(packageSequence(sequence, 'legacy-csr')).rejects.toThrow(/study-report.*study-report-body/);
  expect(await placedLeafRows(sequence)).toEqual(before);
  expect(await readLatestCsrAssembly(q, ORG, 41)).toEqual(assembly);
}, 300_000);

it('finishes a placement refused part-way by placing again, with no second leaf for a file already placed (SYNTHETIC)', async () => {
  const run = await assembledReady();
  const leaves = run.result!.leaves;
  const sequence = await openSequence('0001');
  await expect(placeInto(realPlacement({ title: leaves[2].title }), run.id, sequence)).rejects.toMatchObject({ code: 'CSR_PLACEMENT_REFUSED' });
  expect((await readLatestCsrAssembly(q, ORG, 41))!.placement).toMatchObject({ state: 'partial', leaves: [{}, {}] });
  expect(await placedLeafRows(sequence)).toHaveLength(2);
  const placement = await placeInto(realPlacement(), run.id, sequence);
  expect(placement).toMatchObject({ state: 'placed' });
  const rows = await placedLeafRows(sequence);
  expect(rows).toHaveLength(leaves.length);
  expect(new Set(rows.map(r => r.documentId)).size).toBe(leaves.length);
}, 300_000);

function workerDeps() {
  return {
    withOrganization: <T>(_org: number, fn: (c: never) => Promise<T>) => fn(q as never),
    assemble: assembleCsrJob,
    storeLeaf: storeRenderedLeafFile,
    materializeSupplied: async (_q: unknown, _scope: unknown, choices: Record<string, unknown>, dir: string) => {
      await fs.mkdir(dir, { recursive: true });
      const out: Record<string, { path: string; sha256: string }> = {};
      for (const number of Object.keys(choices)) out[number] = await minimalPdf(path.join(dir, `${number}.pdf`), number);
      return out;
    },
  };
}
