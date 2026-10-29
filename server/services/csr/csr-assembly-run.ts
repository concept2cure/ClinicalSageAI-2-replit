/**
 * Reach CSR assembly (2026-10-30; slice 8 of docs/design/CSR_END_TO_END_2026-10-29.md
 * left assembleCsrJob with no caller).
 *
 * An assembly of a 10,000-page CSR takes minutes, so it never runs in the
 * request. It follows the CSR build's own queue (csr-job-runner.ts
 * enqueueCSRBuildJob + launchCSRBuildAsync): a durable row in
 * csr_assembly_runs, a worker started with setImmediate, progress and stage
 * written on the row as the work goes, and the outcome (or the refusal, by
 * code) recorded there for the board to read.
 *
 * The worker acts as the user who asked, under that organization's tenant
 * scope: assembleCsrJob re-checks the user's access to the job and its
 * retained run, exactly as an import into Authoring does.
 *
 * Every leaf it produces is retained at once through the one seam for
 * server-rendered filing bytes (rendered-leaf-files.ts storeRenderedLeafFile),
 * and the stored digest must equal the assembled one. The working folder is
 * removed afterwards; placement (csr-assembly-placement.ts) points leaves at
 * the retained rows, so it does not depend on the server that assembled.
 */
import { promises as fs } from 'node:fs';
import { setImmediate } from 'node:timers';
import os from 'node:os';
import path from 'node:path';
import type { Queryable } from '../authoring/authoring-evidence.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { createScopedLogger } from '../../utils/logger.js';
import { CSR_LISTING_APPENDICES, CSR_SUPPLIED_APPENDICES, e3Title, type CsrAppendixNumber } from './csr-assembly-plan.js';
import { CsrAssemblyError } from './csr-assembly.js';
import type { AssembledCsrJob, AssembleCsrJobInput } from './csr-assembly-source.js';
import { materializeSupplied, parseSuppliedChoices, type SuppliedChoices } from './csr-assembly-supply.js';
import type { StoreRenderedLeafFileInput, StoredRenderedLeafFile } from '../ectd/rendered-leaf-files.js';
import { renderedLeafPackageName } from '../ectd/leaf-file-name.js';

const log = createScopedLogger('csr-assembly-run');

export class CsrAssemblyRunError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = 'CsrAssemblyRunError'; }
}

export interface Declaration { reason: string; declaredBy: number; declaredAt: string }
export interface AssemblyLeafSummary {
  appendix: string; title: string; fileName: string;
  /** The name it ships under in a package (rendered-leaf package name); the body links by it. */
  packageFileName: string; fileTag: string; origin: 'generated' | 'supplied'; ctdSection: string;
  studyId: string; pages: number | null; bytes: number; sha256: string; md5: string; renderedLeafFileId: number;
}
export interface AssemblySummary {
  status: 'complete' | 'incomplete';
  studyId: string; sourceRunId: string; sourceSha256: string; jobFingerprint: string;
  leaves: AssemblyLeafSummary[];
  missing: AssembledCsrJob['missing'];
  notApplicable: Array<{ number: string; reason: string }>;
  bodyGaps: string[];
  /** Sections whose drafted text keeps a data placeholder; any one blocks placement (a §15-style manual gap in bodyGaps does not). */
  placeholderSections: string[];
  unresolvedReferences: AssembledCsrJob['unresolvedReferences'];
  structure: AssembledCsrJob['structure'];
  listings: Array<{ number: string; rows: number; pages: number; verified: boolean; findings: string[] }>;
  stfWarnings: string[];
  pdfa: string;
}
export interface CsrAssemblyRunRow {
  id: number; jobId: number; status: 'queued' | 'assembling' | 'assembled' | 'failed'; progress: number; stage: string | null;
  requestedBy: number | null; notApplicable: Record<string, Declaration>; supplied: SuppliedChoices;
  result: AssemblySummary | null; error: { code: string; message: string } | null; placement: Record<string, unknown> | null;
  createdAt: string; updatedAt: string; startedAt: string | null; completedAt: string | null;
}

const MIN_REASON = 8;
const MAX_REASON = 2000;
/** An assembly with no progress for this long is recorded as stalled (each listing and each retained leaf writes progress). */
export const STALL_MINUTES = 15;
const isAppendix = (n: string): n is CsrAppendixNumber =>
  Object.prototype.hasOwnProperty.call(CSR_SUPPLIED_APPENDICES, n) || Object.prototype.hasOwnProperty.call(CSR_LISTING_APPENDICES, n);

/** The user's not-applicable declarations, each with its reason, recorded with who declared it and when. */
export function parseDeclarations(raw: unknown, userId: number, at: Date): Record<string, Declaration> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new CsrAssemblyRunError('CSR_ASSEMBLY_DECLARATION_INVALID', 400, 'Declarations are named as { "16.1.9": "why it does not apply" }.');
  const out: Record<string, Declaration> = {};
  for (const [number, reason] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAppendix(number)) throw new CsrAssemblyRunError('CSR_ASSEMBLY_DECLARATION_INVALID', 400, `${number} is not a §16 appendix of ICH E3.`);
    const text = typeof reason === 'string' ? reason.trim() : '';
    if (text.length < MIN_REASON || text.length > MAX_REASON) {
      throw new CsrAssemblyRunError('CSR_ASSEMBLY_REASON_REQUIRED', 400, `Say why appendix ${number} (${e3Title(number)}) does not apply to this study, in ${MIN_REASON} to ${MAX_REASON} characters.`);
    }
    out[number] = { reason: text, declaredBy: userId, declaredAt: at.toISOString() };
  }
  return out;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const json = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;

/**
 * A placement claim ('placing') that has written nothing for STALL_MINUTES was
 * left by a worker that stopped (each placed leaf refreshes the row). It reads
 * as 'interrupted', never as still being placed, and can be placed again into
 * the same sequence (csr-assembly-placement.ts).
 */
function placementView(placement: Record<string, unknown> | null, updatedAt: unknown): Record<string, unknown> | null {
  if (placement?.state !== 'placing') return placement;
  const at = new Date(updatedAt instanceof Date ? updatedAt.getTime() : String(updatedAt)).getTime();
  return Number.isFinite(at) && Date.now() - at > STALL_MINUTES * 60_000 ? { ...placement, state: 'interrupted' } : placement;
}

function toRow(r: Record<string, unknown>): CsrAssemblyRunRow {
  return {
    id: Number(r.id), jobId: Number(r.job_id), status: r.status as CsrAssemblyRunRow['status'], progress: Number(r.progress),
    stage: (r.stage as string | null) ?? null, requestedBy: r.requested_by == null ? null : Number(r.requested_by),
    notApplicable: json(r.not_applicable) ?? {}, supplied: json(r.supplied) ?? {}, result: json(r.result) ?? null,
    error: json(r.error) ?? null, placement: placementView(json(r.placement) ?? null, r.updated_at),
    createdAt: iso(r.created_at) ?? '', updatedAt: iso(r.updated_at) ?? '', startedAt: iso(r.started_at), completedAt: iso(r.completed_at),
  };
}


/** The newest assembly of a build, or null when it has never been assembled. */
export async function readLatestCsrAssembly(q: Queryable, organizationId: number, jobId: number): Promise<CsrAssemblyRunRow | null> {
  const { rows } = await q.query(`SELECT id, job_id, status, progress, stage, requested_by, not_applicable, supplied, result, error, placement,
  created_at, updated_at, started_at, completed_at FROM csr_assembly_runs WHERE organization_id = $1 AND job_id = $2 ORDER BY id DESC LIMIT 1`, [organizationId, jobId]);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function readCsrAssembly(q: Queryable, organizationId: number, jobId: number, id: number): Promise<CsrAssemblyRunRow | null> {
  const { rows } = await q.query(`SELECT id, job_id, status, progress, stage, requested_by, not_applicable, supplied, result, error, placement,
  created_at, updated_at, started_at, completed_at FROM csr_assembly_runs WHERE organization_id = $1 AND job_id = $2 AND id = $3`, [organizationId, jobId, id]);
  return rows[0] ? toRow(rows[0]) : null;
}

/** The project and bound run of a build, from the snapshot its runner wrote at enqueue. */
export async function readCsrJobBinding(q: Queryable, organizationId: number, jobId: number) {
  const { rows } = await q.query(`SELECT project_id, status, study_info_snapshot FROM csr_build_jobs WHERE id = $1 AND organization_id = $2`, [jobId, organizationId]);
  const job = rows[0];
  if (!job) throw new CsrAssemblyRunError('CSR_JOB_NOT_FOUND', 404, 'Job not found.');
  if (job.status === 'cancelled') throw new CsrAssemblyRunError('CSR_ASSEMBLY_JOB_CANCELLED', 409, 'This CSR build was cancelled. Nothing was assembled.');
  const source = json<Record<string, unknown> | null>(job.study_info_snapshot)?.evidenceSource as Record<string, unknown> | undefined;
  if (job.project_id == null || typeof source?.programId !== 'string') {
    throw new CsrAssemblyRunError('CSR_ASSEMBLY_RUN_REQUIRED', 409, 'This CSR build is not bound to a retained run in a project, so it has no tables or listings to assemble. Build it from the run that holds the engine tables.');
  }
  return { projectId: Number(job.project_id), programId: source.programId, status: String(job.status) };
}

/** Queue an assembly of a build. One queued or running assembly per build. */
export async function enqueueCsrAssembly(q: Queryable, input: { organizationId: number; userId: number; jobId: number; notApplicable?: unknown; supplied?: unknown }) {
  const declarations = parseDeclarations(input.notApplicable, input.userId, new Date());
  let supplied: SuppliedChoices;
  try { supplied = parseSuppliedChoices(input.supplied); } catch (err) {
    if (err instanceof CsrAssemblyError) throw new CsrAssemblyRunError(err.code, 400, err.message);
    throw err;
  }
  const both = Object.keys(supplied).filter(n => declarations[n]);
  if (both.length) throw new CsrAssemblyRunError('CSR_ASSEMBLY_APPENDIX_AMBIGUOUS', 400, `Appendix ${both.join(', ')} is both supplied and declared not applicable.`);
  await readCsrJobBinding(q, input.organizationId, input.jobId);
  // A worker that stopped (a restart, a lost connection) cannot record its own end. One with no progress for
  // STALL_MINUTES is recorded as stalled, so it neither blocks a new assembly nor reads as still running.
  await q.query(`UPDATE csr_assembly_runs SET status = 'failed', stage = 'Stalled', completed_at = now(), updated_at = now(),
      error = jsonb_build_object('code', 'CSR_ASSEMBLY_STALLED', 'message', 'This assembly made no progress for ' || $3::int || ' minutes and was stopped. Nothing was recorded as assembled.')
    WHERE organization_id = $1 AND job_id = $2 AND status IN ('queued', 'assembling') AND updated_at < now() - make_interval(mins => $3::int)`,
  [input.organizationId, input.jobId, STALL_MINUTES]);
  try {
    const { rows } = await q.query(`INSERT INTO csr_assembly_runs (organization_id, job_id, requested_by, status, progress, stage, not_applicable, supplied)
      VALUES ($1, $2, $3, 'queued', 0, 'Queued', $4::jsonb, $5::jsonb) RETURNING id`,
    [input.organizationId, input.jobId, input.userId, JSON.stringify(declarations), JSON.stringify(supplied)]);
    return { assemblyId: Number(rows[0].id), status: 'queued' as const };
  } catch (err) {
    if (((err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code) === '23505') throw new CsrAssemblyRunError('CSR_ASSEMBLY_IN_PROGRESS', 409, 'This build is already being assembled. Wait for that assembly to finish.');
    throw err;
  }
}

export interface CsrAssemblyWorkerDeps {
  /** Run `fn` on a connection carrying the organization's tenant scope. */
  withOrganization<T>(organizationId: number, fn: (client: Queryable & RequestSqlClient) => Promise<T>): Promise<T>;
  assemble(q: Queryable & RequestSqlClient, input: AssembleCsrJobInput): Promise<AssembledCsrJob>;
  storeLeaf(input: StoreRenderedLeafFileInput): Promise<StoredRenderedLeafFile>;
  materializeSupplied?: typeof materializeSupplied;
  workRoot?: string;
}

async function defaultDeps(): Promise<CsrAssemblyWorkerDeps> {
  const [{ withTenantConnection }, { assembleCsrJob }, { storeRenderedLeafFile }] = await Promise.all([
    import('../../db/withTenantConnection.js'), import('./csr-assembly-source.js'), import('../ectd/rendered-leaf-files.js'),
  ]);
  return {
    withOrganization: (organizationId, fn) => withTenantConnection({ tenantId: organizationId, source: 'job', caller: 'csr-assembly-run' },
      client => fn(client as unknown as Queryable & RequestSqlClient)),
    assemble: assembleCsrJob,
    storeLeaf: storeRenderedLeafFile,
  };
}

const progressOf = (done: number) => Math.max(1, Math.min(99, Math.round(done)));

async function writeProgress(q: Queryable, id: number, progress: number, stage: string): Promise<void> {
  await q.query(`UPDATE csr_assembly_runs SET progress = $2, stage = $3, updated_at = now() WHERE id = $1 AND status = 'assembling'`, [id, progressOf(progress), stage]);
}

/** Retain one leaf through storeRenderedLeafFile; the stored digest must be the assembled one. */
async function retainLeaf(run: { organizationId: number; userId: number }, leaf: AssembledCsrJob['leaves'][number], deps: CsrAssemblyWorkerDeps) {
  const stored = await deps.storeLeaf({ organizationId: run.organizationId, userId: run.userId, bytes: await fs.readFile(leaf.sourcePath),
    mime: 'application/pdf', fileName: leaf.fileName, renderedFrom: 'csr_assembly', sectionCode: `m${leaf.ctdSection}` });
  if (stored.sha256 !== leaf.sha256) throw new CsrAssemblyError('CSR_ASSEMBLY_RETENTION_DIGEST', `The retained copy of ${leaf.fileName} does not match the assembled file. Nothing was recorded as assembled.`);
  return stored;
}

/**
 * Every leaf but the body is retained as soon as it is written (the assembler's
 * shipAs), so the body can link to the name each one ships under; the body is
 * retained last. Each leaf is stored once.
 */
function retention(q: Queryable, run: { id: number; organizationId: number; userId: number }, deps: CsrAssemblyWorkerDeps) {
  const stored = new Map<string, StoredRenderedLeafFile>();
  const shipAs = async (leaf: AssembledCsrJob['leaves'][number]) => {
    await writeProgress(q, run.id, 79, `Retaining ${leaf.fileName}`);
    const kept = await retainLeaf(run, leaf, deps);
    stored.set(leaf.fileName, kept);
    return renderedLeafPackageName(leaf.fileName, kept.id);
  };
  const finish = async (result: AssembledCsrJob): Promise<AssemblyLeafSummary[]> => {
    const leaves: AssemblyLeafSummary[] = [];
    for (const leaf of result.leaves) {
      let kept = stored.get(leaf.fileName);
      if (!kept) {
        await writeProgress(q, run.id, 95, `Retaining ${leaf.fileName}`);
        kept = await retainLeaf(run, leaf, deps);
      }
      leaves.push({ appendix: leaf.appendix, title: leaf.title, fileName: leaf.fileName, packageFileName: renderedLeafPackageName(leaf.fileName, kept.id),
        fileTag: leaf.stfFileTag, origin: leaf.origin, ctdSection: leaf.ctdSection, studyId: leaf.studyId, pages: leaf.pages, bytes: leaf.bytes,
        sha256: leaf.sha256, md5: kept.md5, renderedLeafFileId: kept.id });
    }
    return leaves;
  };
  return { shipAs, finish };
}

function summarise(result: AssembledCsrJob, leaves: AssemblyLeafSummary[], studyId: string): AssemblySummary {
  return {
    status: result.status, studyId, sourceRunId: result.runId, sourceSha256: result.sourceSha256, jobFingerprint: result.jobFingerprint, leaves,
    missing: result.missing, notApplicable: result.notApplicable, bodyGaps: result.bodyGaps, placeholderSections: result.placeholderSections, unresolvedReferences: result.unresolvedReferences,
    structure: result.structure, stfWarnings: result.stfWarnings, pdfa: result.pdfa,
    listings: result.listings.map(l => ({ number: l.number, rows: l.rows, pages: l.pages, verified: l.verification.ok, findings: l.verification.findings.slice(0, 20) })),
  };
}

function failure(err: unknown): { code: string; message: string } {
  if (err instanceof CsrAssemblyError || err instanceof CsrAssemblyRunError) return { code: err.code, message: err.message };
  const coded = err as { code?: unknown; message?: unknown; name?: unknown };
  // The source readers' refusals (scope, import, retained run) carry a CSR_* code and a user-facing message.
  if (typeof coded?.code === 'string' && /^CSR_/.test(coded.code) && typeof coded.message === 'string') return { code: coded.code, message: coded.message };
  return { code: 'CSR_ASSEMBLY_FAILED', message: 'The assembly failed before its leaves were retained. Nothing was recorded as assembled.' };
}

async function claim(q: Queryable, id: number, organizationId: number) {
  const { rows } = await q.query(`UPDATE csr_assembly_runs SET status = 'assembling', progress = 1, stage = 'Reading the build and its retained run',
      started_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2 AND status = 'queued' RETURNING id, job_id, status, progress, stage, requested_by, not_applicable, supplied, result, error, placement,
  created_at, updated_at, started_at, completed_at`, [id, organizationId]);
  return rows[0] ? toRow(rows[0]) : null;
}

async function assembleClaimed(q: Queryable & RequestSqlClient, run: CsrAssemblyRunRow, organizationId: number, workDir: string, deps: CsrAssemblyWorkerDeps) {
  const userId = run.requestedBy;
  if (userId == null) throw new CsrAssemblyRunError('CSR_ASSEMBLY_REQUESTER_MISSING', 409, 'The user who asked for this assembly no longer exists, so it cannot run as them.');
  const binding = await readCsrJobBinding(q, organizationId, run.jobId);
  const supplied = await (deps.materializeSupplied ?? materializeSupplied)(q, { organizationId, programId: binding.programId }, run.supplied, path.join(workDir, 'supplied'));
  const outDir = path.join(workDir, 'out');
  await fs.mkdir(outDir, { recursive: true });
  const kept = retention(q, { id: run.id, organizationId, userId }, deps);
  const result = await deps.assemble(q, {
    organizationId, userId, programId: binding.programId, projectId: binding.projectId, jobId: run.jobId, outDir, supplied,
    notApplicable: Object.fromEntries(Object.entries(run.notApplicable).map(([n, d]) => [n, d.reason])),
    onStage: (stage, done) => writeProgress(q, run.id, 5 + 75 * done, stage), shipAs: kept.shipAs,
  });
  return summarise(result, await kept.finish(result), result.leaves[0]?.studyId ?? '');
}

/** The worker: claim a queued assembly, assemble as its requester, retain the leaves, record the outcome. */
export async function runCsrAssembly(id: number, organizationId: number, injected?: CsrAssemblyWorkerDeps): Promise<void> {
  const deps = injected ?? await defaultDeps();
  await deps.withOrganization(organizationId, async (q) => {
    const run = await claim(q, id, organizationId);
    if (!run) return; // already claimed, finished or gone
    const workDir = await fs.mkdtemp(path.join(deps.workRoot ?? os.tmpdir(), `csr-assembly-${id}-`));
    try {
      const summary = await assembleClaimed(q, run, organizationId, workDir, deps);
      await q.query(`UPDATE csr_assembly_runs SET status = 'assembled', progress = 100, stage = 'Assembled', result = $2::jsonb,
        completed_at = now(), updated_at = now() WHERE id = $1 AND status = 'assembling'`, [id, JSON.stringify(summary)]);
    } catch (err) {
      const recorded = failure(err);
      if (recorded.code === 'CSR_ASSEMBLY_FAILED') log.error('CSR assembly failed', { id, organizationId, err: err instanceof Error ? err.message : String(err) });
      await q.query(`UPDATE csr_assembly_runs SET status = 'failed', stage = 'Failed', error = $2::jsonb, completed_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'assembling'`, [id, JSON.stringify(recorded)]);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });
}

/** Start the worker off the request thread, as launchCSRBuildAsync starts a build. */
export function startCsrAssembly(id: number, organizationId: number): void {
  setImmediate(() => {
    runCsrAssembly(id, organizationId).catch(err => {
      log.error('runCsrAssembly threw outside its own error handler', { id, organizationId, err: err instanceof Error ? err.message : String(err) });
    });
  });
}
