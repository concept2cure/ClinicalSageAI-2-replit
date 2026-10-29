/**
 * The patient safety narrative build, off the request path (2026-10-30;
 * docs/evidence/D2-CSR/2026-10-30-narrative-queue/). Slice 7 composed the
 * narratives inside POST /api/csr/jobs/:jobId/narratives; the request now
 * queues a run and returns 202.
 *
 * It is the CSR build's own queue (csr-job-runner.ts enqueueCSRBuildJob and
 * runCSRBuildJob, started by csr-builder.ts launchCSRBuildAsync), not a second
 * one: a durable row (csr_narrative_runs), a worker started with setImmediate,
 * a claim by conditional UPDATE so two workers never run one build, progress
 * written on the row as the work goes, and the outcome or the refusal, by code,
 * recorded there for the board to read. The assembly (csr-assembly-run.ts)
 * follows the same pattern.
 *
 *   - Progress: subjects done (composed, refused or resumed) of those the E3
 *     §12.3.2 rule selected, written after every subject. Each write is the
 *     run's heartbeat and its check that it still holds the run and the build
 *     is not cancelled.
 *   - Restart: a worker that stopped (a restart, a lost connection) cannot
 *     record its end. A run with no heartbeat for NARRATIVE_STALL_MINUTES is
 *     reported as stalled, and the next request takes it over: the same row is
 *     queued again under a new attempt and the job resumes per subject, so
 *     verified narratives are not composed again. A superseded worker's writes
 *     are refused (each carries the attempt it claimed).
 *   - Cancellation: a cancelled build stops the run at the next subject (the
 *     narrative store refuses a save, and the progress write refuses too); the
 *     run is recorded as cancelled and the build keeps what it had.
 *
 * The worker acts as the user who asked, under that organization's tenant
 * scope (withTenantConnection), on one dedicated connection: the source reads
 * re-check that user's access exactly as the request did, and §14.3.3 lands in
 * one transaction on that connection.
 */
import { setImmediate } from 'node:timers';
import type { RequestConnectable, RequestSqlClient } from '../../db/requestDb.js';
import { createScopedLogger } from '../../utils/logger.js';
import type { NarrativeJobResult } from './csr-narrative-job.js';
import { CsrNarrativeBuildError, type CsrNarrativeBuildDeps, type NarrativeQueryable } from './csr-narrative-store.js';
import { CsrSourceInputError } from './source-access.js';

const log = createScopedLogger('csr-narrative-run');

/** A running build with no progress for this long is stalled; the next request takes it over. */
export const NARRATIVE_STALL_MINUTES = 5;

export class CsrNarrativeRunError extends Error {
  constructor(readonly code: string, readonly status: number, message: string, readonly runId?: number) { super(message); this.name = 'CsrNarrativeRunError'; }
}

export type CsrNarrativeRunStatus = 'queued' | 'running' | 'complete' | 'incomplete' | 'failed' | 'cancelled';
export interface CsrNarrativeRunFailure { code: string; message: string; subjects?: string[]; issues?: Array<{ path: string; message: string }> }
export interface CsrNarrativeRunRow {
  id: number; jobId: number; status: CsrNarrativeRunStatus; subjectsDone: number; subjectsTotal: number | null; attempt: number;
  /** Queued or running with no heartbeat for NARRATIVE_STALL_MINUTES: its worker stopped; building again resumes it. */
  stalled: boolean;
  result: NarrativeJobResult | null; error: CsrNarrativeRunFailure | null;
  createdAt: string; updatedAt: string; startedAt: string | null; completedAt: string | null;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const json = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
function toRow(r: Record<string, unknown>): CsrNarrativeRunRow {
  return {
    id: Number(r.id), jobId: Number(r.job_id), status: r.status as CsrNarrativeRunStatus, subjectsDone: Number(r.subjects_done),
    subjectsTotal: r.subjects_total == null ? null : Number(r.subjects_total), attempt: Number(r.attempt), stalled: r.stalled === true,
    result: json(r.result) ?? null, error: json(r.error) ?? null,
    createdAt: iso(r.created_at) ?? '', updatedAt: iso(r.updated_at) ?? '', startedAt: iso(r.started_at), completedAt: iso(r.completed_at),
  };
}

/** The newest narrative build of a CSR build, or null when narratives were never built. */
export async function readLatestNarrativeRun(q: NarrativeQueryable, organizationId: number, jobId: number): Promise<CsrNarrativeRunRow | null> {
  // Stalled: queued or running with no heartbeat for NARRATIVE_STALL_MINUTES ($3).
  const { rows } = await q.query(`SELECT id, job_id, status, subjects_done, subjects_total, attempt, result, error, created_at, updated_at, started_at, completed_at,
      (status IN ('queued', 'running') AND updated_at < now() - $3 * interval '1 minute') AS stalled
    FROM csr_narrative_runs WHERE organization_id = $1 AND job_id = $2 ORDER BY id DESC LIMIT 1`, [organizationId, jobId, NARRATIVE_STALL_MINUTES]);
  return rows[0] ? toRow(rows[0]) : null;
}

const isUniqueViolation = (err: unknown) => ((err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code) === '23505';

/**
 * Queue a narrative build. The build is checked now (cancelled, or bound to no
 * retained run, is refused by code, as before); one queued or running build per
 * CSR build, except that a stalled one is taken over and resumed.
 */
export async function enqueueNarrativeRun(q: NarrativeQueryable, input: { organizationId: number; userId: number; jobId: number }) {
  const { readCsrNarrativeJob } = await import('./csr-narrative-store.js');
  await readCsrNarrativeJob(q, input.organizationId, input.jobId);
  const taken = await q.query(`UPDATE csr_narrative_runs SET status = 'queued', requested_by = $3, error = NULL, updated_at = now()
    WHERE organization_id = $1 AND job_id = $2 AND status IN ('queued', 'running') AND updated_at < now() - $4 * interval '1 minute' RETURNING id`,
  [input.organizationId, input.jobId, input.userId, NARRATIVE_STALL_MINUTES]);
  if (taken.rows[0]) return { runId: Number(taken.rows[0].id), status: 'queued' as const, resumed: true };
  try {
    const { rows } = await q.query(`INSERT INTO csr_narrative_runs (organization_id, job_id, requested_by, status) VALUES ($1, $2, $3, 'queued') RETURNING id`,
      [input.organizationId, input.jobId, input.userId]);
    return { runId: Number(rows[0].id), status: 'queued' as const, resumed: false };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const active = await readLatestNarrativeRun(q, input.organizationId, input.jobId);
    throw new CsrNarrativeRunError('CSR_NARRATIVE_BUILD_IN_PROGRESS', 409, 'The narratives of this build are already being composed. Their progress is shown below.', active?.id);
  }
}

export interface CsrNarrativeWorkerDeps {
  /** Run `fn` on one dedicated connection carrying the organization's tenant scope. */
  withOrganization<T>(organizationId: number, fn: (client: NarrativeQueryable & RequestSqlClient) => Promise<T>): Promise<T>;
  build(deps: CsrNarrativeBuildDeps, input: Parameters<typeof import('./csr-narrative-store.js').buildCsrNarratives>[1]): Promise<NarrativeJobResult>;
}

async function defaultDeps(): Promise<CsrNarrativeWorkerDeps> {
  const [{ withTenantConnection }, { buildCsrNarratives }] = await Promise.all([
    import('../../db/withTenantConnection.js'), import('./csr-narrative-store.js'),
  ]);
  return {
    withOrganization: (organizationId, fn) => withTenantConnection({ tenantId: organizationId, source: 'job', caller: 'csr-narrative-run' },
      client => fn(client as unknown as NarrativeQueryable & RequestSqlClient)),
    build: buildCsrNarratives,
  };
}

/** The worker's one connection, in the shape the Vault reader asks for: connect() gives the same connection back. */
function connectableOf(client: RequestSqlClient): RequestConnectable {
  const query = (text: string, params?: unknown[]) => client.query(text, params);
  return { query, connect: async () => ({ query, release: () => undefined }) };
}

type Claimed = { id: number; organizationId: number; jobId: number; attempt: number; requestedBy: number | null };

async function claim(q: NarrativeQueryable, id: number, organizationId: number): Promise<Claimed | null> {
  const { rows } = await q.query(`UPDATE csr_narrative_runs SET status = 'running', attempt = attempt + 1, started_at = COALESCE(started_at, now()), updated_at = now()
    WHERE id = $1 AND organization_id = $2 AND status = 'queued' RETURNING job_id, attempt, requested_by`, [id, organizationId]);
  const r = rows[0];
  return r ? { id, organizationId, jobId: Number(r.job_id), attempt: Number(r.attempt), requestedBy: r.requested_by == null ? null : Number(r.requested_by) } : null;
}

/** Writes subjects done of total (the heartbeat); false once the run was superseded or its build cancelled. */
function progressWriter(q: NarrativeQueryable, run: Claimed) {
  return async (done: number, total: number): Promise<boolean> => {
    const { rows } = await q.query(`UPDATE csr_narrative_runs SET subjects_done = $3, subjects_total = $4, updated_at = now()
      WHERE id = $1 AND status = 'running' AND attempt = $2
        AND EXISTS (SELECT 1 FROM csr_build_jobs b WHERE b.id = csr_narrative_runs.job_id AND b.status <> 'cancelled')
      RETURNING id`, [run.id, run.attempt, done, total]);
    return rows.length === 1;
  };
}

const INTEGRITY_MESSAGE = 'A saved narrative no longer matches its recorded hash. It was preserved, not overwritten, and §14.3.3 was not written. Review the named subjects.';

function outcomeOf(result: NarrativeJobResult): { status: CsrNarrativeRunStatus; error: CsrNarrativeRunFailure | null } {
  if (result.status === 'failed') return { status: 'failed', error: { code: 'CSR_NARRATIVE_INTEGRITY_FAILED', message: INTEGRITY_MESSAGE, subjects: result.subjects ?? [] } };
  if (result.status === 'stopped') return { status: 'cancelled', error: { code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE', message: 'This CSR build was cancelled. The narratives already composed were kept; nothing was landed.' } };
  return { status: result.status, error: null };
}

/**
 * A refusal by code, as the source readers and the build state it; anything
 * else is a failure with no detail. A typed refusal keeps its own code even
 * without the CSR_ prefix (the program access check states PROJECT_* and the
 * Vault byte reader its own codes), as the slice-7 route returned them.
 */
function failureOf(err: unknown): CsrNarrativeRunFailure {
  const coded = err as { code?: unknown; message?: unknown; issues?: unknown };
  const typed = err instanceof CsrSourceInputError || err instanceof CsrNarrativeBuildError || err instanceof CsrNarrativeRunError;
  if (typeof coded?.code === 'string' && (typed || /^CSR_/.test(coded.code)) && typeof coded.message === 'string') {
    return { code: coded.code, message: coded.message, ...(Array.isArray(coded.issues) ? { issues: coded.issues as CsrNarrativeRunFailure['issues'] } : {}) };
  }
  return { code: 'CSR_NARRATIVE_FAILED', message: 'The narrative build failed. The narratives already composed were kept; nothing was landed.' };
}

async function finish(q: NarrativeQueryable, run: Claimed, status: CsrNarrativeRunStatus, result: NarrativeJobResult | null, error: CsrNarrativeRunFailure | null) {
  await q.query(`UPDATE csr_narrative_runs SET status = $3, result = $4::jsonb, error = $5::jsonb, completed_at = now(), updated_at = now(),
      subjects_done = COALESCE($6, subjects_done), subjects_total = COALESCE($7, subjects_total)
    WHERE id = $1 AND status = 'running' AND attempt = $2`,
  [run.id, run.attempt, status, result ? JSON.stringify(result) : null, error ? JSON.stringify(error) : null,
    result && status !== 'cancelled' ? result.selected : null, result ? result.selected : null]);
}

/** The worker: claim a queued run, compose as its requester, record the outcome. */
export async function runNarrativeRun(id: number, organizationId: number, injected?: CsrNarrativeWorkerDeps): Promise<void> {
  const deps = injected ?? await defaultDeps();
  await deps.withOrganization(organizationId, async (client) => {
    const run = await claim(client, id, organizationId);
    if (!run) return; // already claimed, finished or gone
    try {
      if (run.requestedBy == null) throw new CsrNarrativeRunError('CSR_NARRATIVE_REQUESTER_MISSING', 409, 'The user who asked for these narratives no longer exists, so the build cannot run as them.');
      const result = await deps.build({ q: client, sql: client, connectable: connectableOf(client) },
        { organizationId, jobId: run.jobId, userId: run.requestedBy, onProgress: progressWriter(client, run) });
      const outcome = outcomeOf(result);
      await finish(client, run, outcome.status, result, outcome.error);
    } catch (err) {
      const failure = failureOf(err);
      if (failure.code === 'CSR_NARRATIVE_FAILED') log.error('CSR narrative build failed', { id, organizationId, err: err instanceof Error ? err.message : String(err) });
      await finish(client, run, failure.code === 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' ? 'cancelled' : 'failed', null, failure);
    }
  });
}

/** Start the worker off the request thread, as launchCSRBuildAsync starts a build. */
export function startNarrativeRun(id: number, organizationId: number): void {
  setImmediate(() => {
    runNarrativeRun(id, organizationId).catch(err => {
      log.error('runNarrativeRun threw outside its own error handler', { id, organizationId, err: err instanceof Error ? err.message : String(err) });
    });
  });
}
