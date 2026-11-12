import crypto from 'node:crypto';
import { getPool } from '../../db';
import type { ComputeIntent } from './types';
import { getRuntimeProfile } from './runtimeProfiles';
import { inferRuntimeMaturity } from './runtimeProfiles';
import { runIsolatedCompute } from './workerClient';
import { persistOutput } from './outputStore';
import { registerArtifactWithGovernance } from './artifactWriteback';

const DEFAULT_PROFILE = 'docx-python';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Compute timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export async function enqueueAndRunComputeJob(intent: ComputeIntent) {
  const pool = getPool();
  const profile = await getRuntimeProfile(DEFAULT_PROFILE);
  const runtimeMaturity = inferRuntimeMaturity(intent.format);
  const jobId = `acj_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const attemptId = `aca_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  await pool.query(
    `INSERT INTO artifact_compute_jobs (
      job_id, organization_id, project_id, surface_key, intent_type, runtime_profile_key,
      status, requested_by_id, max_attempts, timeout_seconds, payload
    ) VALUES ($1,$2,$3,$4,$5,$6,'running',$7,2,$8,$9)`,
    [
      jobId,
      intent.organizationId,
      intent.projectId,
      intent.surfaceKey,
      intent.intentType,
      DEFAULT_PROFILE,
      intent.requestedById,
      profile.timeoutSeconds,
      JSON.stringify(intent),
    ]
  );

  await pool.query(
    `INSERT INTO artifact_compute_attempts (
      attempt_id, job_id, organization_id, attempt_number, worker_runtime, status
    ) VALUES ($1,$2,$3,1,$4,'running')`,
    [attemptId, jobId, intent.organizationId, profile.profileKey]
  );

  try {
    const outputs = await withTimeout(
      runIsolatedCompute(intent),
      Math.max(5_000, profile.timeoutSeconds * 1000)
    );

    for (const output of outputs) {
      const stored = await persistOutput(
        intent.organizationId,
        jobId,
        output.fileName,
        output.buffer
      );
      await pool.query(
        `INSERT INTO artifact_compute_outputs (
          output_id, job_id, organization_id, output_type, mime_type, file_name,
          storage_uri, sha256, byte_size, validation_status, sanitizer_report
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'validated',$10)`,
        [
          `aco_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          jobId,
          intent.organizationId,
          output.outputType,
          output.mimeType,
          output.fileName,
          stored.storageUri,
          stored.sha256,
          stored.byteSize,
          JSON.stringify({ ...(output.sanitizerReport || {}), runtimeMaturity }),
        ]
      );
    }

    const writeback = await registerArtifactWithGovernance({
      organizationId: intent.organizationId,
      projectId: intent.projectId,
      userId: intent.requestedById,
      title: intent.title,
      ctdSection: intent.ctdSection,
      content: intent.content,
      sourceJobId: jobId,
      surfaceKey: intent.surfaceKey,
      sourceType: 'compute',
      backendRoute: 'POST /api/concept2cure/compute/projects/:projectId/jobs',
      ipAddress: intent.ipAddress ?? null,
      metadata: {
        source: 'compute',
        runtimeMaturity,
        outputFormat: intent.format,
      },
      auditMetadata: {
        runtimeMaturity,
        outputFormat: intent.format,
      },
    });

    await pool.query(
      `UPDATE artifact_compute_jobs
          SET status = 'completed', artifact_id = $2, completed_at = NOW(), updated_at = NOW(),
              result_summary = $3
        WHERE job_id = $1`,
      [
        jobId,
        writeback.artifactId,
        JSON.stringify({
          runtimeProfile: profile.profileKey,
          runtimeMaturity,
          outputFormat: intent.format,
          artifactId: writeback.artifactId,
          artifactTitle: writeback.artifactTitle,
          artifactStatus: writeback.artifactStatus,
          version: writeback.version,
          placementState: writeback.placementState,
          provenanceRef: writeback.provenanceEventId,
          auditRef: writeback.auditId,
        }),
      ]
    );

    await pool.query(
      `UPDATE artifact_compute_attempts
          SET status = 'succeeded', ended_at = NOW(), metrics = $2
        WHERE attempt_id = $1`,
      [
        attemptId,
        JSON.stringify({
          outputCount: outputs.length,
          networkPolicy: profile.networkPolicy,
          runtimeMaturity,
          runtimeIsolation: 'subprocess-temp-workdir',
        }),
      ]
    );

    return {
      jobId,
      status: 'completed',
      runtimeProfile: profile.profileKey,
      runtimeMaturity,
      artifactId: writeback.artifactId,
      governedConsequence: {
        artifactId: writeback.artifactId,
        artifactTitle: writeback.artifactTitle,
        artifactStatus: writeback.artifactStatus,
        artifactVersion: writeback.version,
        placementState: writeback.placementState,
        provenanceRef: writeback.provenanceEventId,
        auditRef: writeback.auditId,
      },
    };
  } catch (error: any) {
    await pool.query(
      `UPDATE artifact_compute_jobs
          SET status = 'failed', completed_at = NOW(), updated_at = NOW(), result_summary = $2
        WHERE job_id = $1`,
      [jobId, JSON.stringify({ error: error?.message || 'compute failed', runtimeMaturity })]
    );
    await pool.query(
      `UPDATE artifact_compute_attempts
          SET status = 'failed', ended_at = NOW(), error_message = $2
        WHERE attempt_id = $1`,
      [attemptId, error?.message || 'compute failed']
    );
    throw error;
  }
}

export async function listComputeJobs(projectId: number, organizationId: number) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
        j.job_id,
        j.surface_key,
        j.intent_type,
        j.runtime_profile_key,
        j.status,
        j.artifact_id,
        j.created_at,
        j.completed_at,
        j.timeout_seconds,
        j.result_summary,
        j.payload->>'format' AS output_format,
        CASE
          WHEN j.payload->>'format' = 'docx' THEN 'production-path'
          WHEN j.payload->>'format' IN ('xlsx','pptx','zip','html') THEN 'provisional'
          ELSE 'stub'
        END AS runtime_maturity,
        a.title AS artifact_title,
        a.type AS artifact_type,
        a.status AS artifact_status,
        a.version AS artifact_version,
        a.ctd_section AS artifact_ctd_section,
        CASE WHEN a.ctd_section IS NOT NULL THEN 'placed' ELSE 'unplaced' END AS placement_state,
        (j.result_summary->>'provenanceRef') AS provenance_ref,
        (j.result_summary->>'auditRef') AS audit_ref
       FROM artifact_compute_jobs
      j
      LEFT JOIN concept2cure_artifacts a
        ON a.artifact_id = j.artifact_id
       AND a.organization_id = j.organization_id
      WHERE j.project_id = $1 AND j.organization_id = $2
      ORDER BY j.created_at DESC
      LIMIT 50`,
    [projectId, organizationId]
  );
  return rows;
}

export async function getComputeJobDetail(
  projectId: number,
  organizationId: number,
  jobId: string
) {
  const pool = getPool();
  const jobRes = await pool.query(
    `SELECT
        j.job_id,
        j.surface_key,
        j.intent_type,
        j.runtime_profile_key,
        j.status,
        j.artifact_id,
        j.created_at,
        j.completed_at,
        j.timeout_seconds,
        j.result_summary,
        j.payload,
        CASE
          WHEN j.payload->>'format' = 'docx' THEN 'production-path'
          WHEN j.payload->>'format' IN ('xlsx','pptx','zip','html') THEN 'provisional'
          ELSE 'stub'
        END AS runtime_maturity,
        a.title AS artifact_title,
        a.type AS artifact_type,
        a.status AS artifact_status,
        a.version AS artifact_version,
        a.ctd_section AS artifact_ctd_section
      FROM artifact_compute_jobs j
      LEFT JOIN concept2cure_artifacts a
        ON a.artifact_id = j.artifact_id
       AND a.organization_id = j.organization_id
      WHERE j.project_id = $1
        AND j.organization_id = $2
        AND j.job_id = $3
      LIMIT 1`,
    [projectId, organizationId, jobId]
  );

  if (!jobRes.rows[0]) return null;

  const attemptsRes = await pool.query(
    `SELECT attempt_id, attempt_number, worker_runtime, status, error_message, started_at, ended_at, metrics
       FROM artifact_compute_attempts
      WHERE organization_id = $1 AND job_id = $2
      ORDER BY attempt_number DESC`,
    [organizationId, jobId]
  );

  const outputsRes = await pool.query(
    `SELECT output_id, output_type, mime_type, file_name, storage_uri, sha256, byte_size, validation_status, sanitizer_report, created_at
       FROM artifact_compute_outputs
      WHERE organization_id = $1 AND job_id = $2
      ORDER BY created_at DESC`,
    [organizationId, jobId]
  );

  let placementState: 'placed' | 'unplaced' = 'unplaced';
  if (jobRes.rows[0].artifact_ctd_section) placementState = 'placed';

  let provenanceRef: string | null = null;
  let auditRef: string | null = null;

  if (jobRes.rows[0].artifact_id) {
    const provenanceRes = await pool.query(
      `SELECT event_id
         FROM concept2cure_provenance_events p
         JOIN concept2cure_artifacts a ON a.id = p.artifact_id
        WHERE a.organization_id = $1
          AND a.artifact_id = $2
        ORDER BY p.created_at DESC
        LIMIT 1`,
      [organizationId, jobRes.rows[0].artifact_id]
    );
    provenanceRef = provenanceRes.rows[0]?.event_id ?? null;

    const auditRes = await pool.query(
      `SELECT audit_id
         FROM regulatory_audit_logs
        WHERE organization_id = $1
          AND entity_type = 'artifact'
          AND entity_id = $2
        ORDER BY timestamp DESC
        LIMIT 1`,
      [organizationId, jobRes.rows[0].artifact_id]
    );
    auditRef = auditRes.rows[0]?.audit_id ?? null;
  }

  return {
    ...jobRes.rows[0],
    placement_state: placementState,
    provenance_ref: provenanceRef,
    audit_ref: auditRef,
    attempts: attemptsRes.rows,
    outputs: outputsRes.rows,
  };
}

// ── A route's own long work, as a job (MR-03 Stage 6 steps 4–6, OPS-17) ─────
//
// Behind CloudFront and the ALB a request that has not answered in 60 s is cut
// with a 504, while the server finishes the work and records it. Measured on
// 2026-11-12 (docs/evidence/D1/2026-11-12-edge-timeouts/), a 200-leaf IND of
// 80-page documents compiles in p95 59.3 s on four cores; production's task has
// two. A route that may run that long answers 202 with a job, does the same
// work in the same request scope after the answer, and stores its full result
// here; the screen polls for it. The job is a row of this table, not a new
// one: `surface_key` names the route's work, and the in-process profile is
// seeded beside the sandboxed one (db/migrations/20260326_artifact_compute_plane.sql).

/** The runtime profile a route's in-process job runs under. */
export const IN_PROCESS_PROFILE = 'ectd-in-process';
/** The longest a route job may run before the sweep calls it abandoned. */
export const ROUTE_JOB_TIMEOUT_SECONDS = 1800;

export interface RouteJobQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export type RouteJobView =
  | { jobId: string; status: 'running'; startedAt: string | null }
  | { jobId: string; status: 'completed'; startedAt: string | null; completedAt: string | null; result: unknown }
  | { jobId: string; status: 'failed'; startedAt: string | null; completedAt: string | null; error: string };

/** Record a route's job as running; its id is what the client polls. */
export async function startRouteJob(
  q: RouteJobQueryable,
  job: { organizationId: number; projectId: number; surfaceKey: string; intentType: string; requestedById: number | null; payload: Record<string, unknown> },
): Promise<string> {
  const jobId = `rjob_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  await q.query(
    `INSERT INTO artifact_compute_jobs (
       job_id, organization_id, project_id, surface_key, intent_type, runtime_profile_key,
       status, requested_by_id, max_attempts, timeout_seconds, payload, started_at
     ) VALUES ($1,$2,$3,$4,$5,$6,'running',$7,1,$8,$9,NOW())`,
    [jobId, job.organizationId, job.projectId, job.surfaceKey, job.intentType, IN_PROCESS_PROFILE,
      job.requestedById, ROUTE_JOB_TIMEOUT_SECONDS, JSON.stringify(job.payload)],
  );
  return jobId;
}

/**
 * Store a route job's outcome: the full result, or the error's message. Only a
 * running job is finished, so a sweep's `abandoned` is never overwritten by a
 * late finish, nor a finish by a second one. False when nothing was updated.
 */
export async function finishRouteJob(
  q: RouteJobQueryable,
  jobId: string,
  organizationId: number,
  outcome: { status: 'completed'; result: unknown } | { status: 'failed'; error: string },
): Promise<boolean> {
  const summary = outcome.status === 'completed' ? { result: outcome.result } : { error: outcome.error };
  const r = await q.query(
    `UPDATE artifact_compute_jobs
        SET status = $3, result_summary = $4, completed_at = NOW(), updated_at = NOW()
      WHERE job_id = $1 AND organization_id = $2 AND status = 'running'`,
    [jobId, organizationId, outcome.status, JSON.stringify(summary)],
  );
  return (r.rowCount ?? 0) > 0;
}

/** The job, if it is this organization's and this route's; null otherwise (the caller answers 404). */
export async function readRouteJob(
  q: RouteJobQueryable,
  jobId: string,
  organizationId: number,
  surfaceKey: string,
): Promise<RouteJobView | null> {
  const { rows } = await q.query(
    `SELECT job_id, status, result_summary, started_at, completed_at
       FROM artifact_compute_jobs
      WHERE job_id = $1 AND organization_id = $2 AND surface_key = $3 AND runtime_profile_key = $4
      LIMIT 1`,
    [jobId, organizationId, surfaceKey, IN_PROCESS_PROFILE],
  );
  const row = rows[0];
  if (!row) return null;
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  const summary = (row.result_summary ?? {}) as { result?: unknown; error?: unknown };
  const base = { jobId: String(row.job_id), startedAt: iso(row.started_at) };
  if (row.status === 'completed') return { ...base, status: 'completed', completedAt: iso(row.completed_at), result: summary.result ?? null };
  if (row.status === 'failed') {
    return { ...base, status: 'failed', completedAt: iso(row.completed_at),
      error: typeof summary.error === 'string' && summary.error ? summary.error : 'The work failed, and no reason was recorded.' };
  }
  return { ...base, status: 'running' };
}

export const ABANDONED_ROUTE_JOB = 'abandoned: the server task running it stopped before it finished (a deploy or a restart). Nothing of it was kept; run it again.';

/**
 * Mark every route job still running past its timeout as failed and abandoned.
 * A job runs inside the task that answered its 202; when that task stops, no
 * one finishes the row. Run under the system scope, once per window across
 * tasks (server/db/scheduledOnce.ts). Returns how many were marked.
 */
export async function sweepAbandonedRouteJobs(q: RouteJobQueryable): Promise<number> {
  const r = await q.query(
    `UPDATE artifact_compute_jobs
        SET status = 'failed', result_summary = $2, completed_at = NOW(), updated_at = NOW()
      WHERE runtime_profile_key = $1 AND status = 'running'
        AND started_at < NOW() - make_interval(secs => timeout_seconds)`,
    [IN_PROCESS_PROFILE, JSON.stringify({ error: ABANDONED_ROUTE_JOB })],
  );
  return r.rowCount ?? 0;
}

const ROUTE_JOB_SWEEP_MS = 5 * 60 * 1000;

/**
 * Every five minutes, once across every server task, mark the route jobs that
 * outlived their timeout as abandoned (sweepAbandonedRouteJobs). Started with
 * the server's other schedulers (server/index.ts).
 */
export function startRouteJobSweep(): () => void {
  const tick = () => {
    void (async () => {
      const [{ runScheduledOncePerWindow, windowKeyOf }, { runWithSystemTenantScope }] = await Promise.all([
        import('../../db/scheduledOnce'),
        import('../../db/tenantStore'),
      ]);
      const outcome = await runScheduledOncePerWindow('route-job-abandoned-sweep', windowKeyOf(ROUTE_JOB_SWEEP_MS), () =>
        runWithSystemTenantScope('ops:route-job-abandoned-sweep', () => sweepAbandonedRouteJobs(getPool())),
      );
      if (outcome.ran && outcome.value > 0) {
        const { logger } = await import('../../utils/logger.js');
        logger.warn('[route-jobs] marked abandoned jobs failed', { count: outcome.value });
      }
    })().catch(async (err) => {
      const { logger } = await import('../../utils/logger.js');
      logger.error('[route-jobs] the abandoned-job sweep failed', { error: err instanceof Error ? err.message : String(err) });
    });
  };
  const timer = setInterval(tick, ROUTE_JOB_SWEEP_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
