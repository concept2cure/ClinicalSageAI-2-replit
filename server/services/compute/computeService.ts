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
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Compute timeout after ${ms}ms`)), ms)),
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
      const stored = await persistOutput(intent.organizationId, jobId, output.fileName, output.buffer);
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
        a.ctd_section AS artifact_ctd_section
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
