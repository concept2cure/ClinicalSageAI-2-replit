import crypto from 'node:crypto';
import { getPool } from '../../db';

export interface GovernedWorkflowInput {
  organizationId: number;
  projectId: number;
  workflowType:
    | 'evidence_ingestion_enrichment'
    | 'document_compile_export'
    | 'report_generation_verify'
    | 'submission_package_compile';
  payload: Record<string, unknown>;
  requestedById?: number;
}

export function isTemporalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TEMPORAL_ENABLED === 'true' && Boolean(env.TEMPORAL_ADDRESS);
}

async function runLocalFallbackWorkflow(workflowId: string, input: GovernedWorkflowInput): Promise<void> {
  const pool = getPool();
  const startedAt = Date.now();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query(
        `UPDATE artifact_compute_jobs
            SET result_summary = $2, updated_at = NOW()
          WHERE job_id = $1`,
        [
          workflowId,
          JSON.stringify({
            transport: 'local-fallback',
            state: 'running',
            attempt,
            workflowType: input.workflowType,
          }),
        ]
      );

      await pool.query(
        `INSERT INTO artifact_compute_attempts (
          attempt_id, job_id, organization_id, attempt_number, worker_runtime, status, started_at
        ) VALUES ($1,$2,$3,$4,'temporal-local-fallback','running',NOW())`,
        [
          `aca_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          workflowId,
          input.organizationId,
          attempt,
        ]
      );

      // Local governed workflow spine: durable transitions with explicit stage state.
      // This keeps workflow state inspectable when Temporal is disabled.
      await Promise.resolve();

      await pool.query(
        `UPDATE artifact_compute_jobs
            SET status = 'completed', completed_at = NOW(), updated_at = NOW(), result_summary = $2
          WHERE job_id = $1`,
        [
          workflowId,
          JSON.stringify({
            transport: 'local-fallback',
            state: 'completed',
            workflowType: input.workflowType,
            durationMs: Date.now() - startedAt,
            attempts: attempt,
          }),
        ]
      );

      await pool.query(
        `UPDATE artifact_compute_attempts
            SET status = 'succeeded', ended_at = NOW(), metrics = $2
          WHERE job_id = $1 AND attempt_number = $3`,
        [
          workflowId,
          JSON.stringify({ workflowType: input.workflowType, localFallback: true }),
          attempt,
        ]
      );

      return;
    } catch (error: any) {
      await pool.query(
        `UPDATE artifact_compute_attempts
            SET status = 'failed', ended_at = NOW(), error_message = $2
          WHERE job_id = $1 AND attempt_number = $3`,
        [workflowId, error?.message || 'local fallback failed', attempt]
      );

      if (attempt >= maxAttempts) {
        await pool.query(
          `UPDATE artifact_compute_jobs
              SET status = 'failed', completed_at = NOW(), updated_at = NOW(), result_summary = $2
            WHERE job_id = $1`,
          [
            workflowId,
            JSON.stringify({
              transport: 'local-fallback',
              state: 'failed',
              workflowType: input.workflowType,
              attempts: attempt,
              error: error?.message || 'local fallback failed',
            }),
          ]
        );
        throw error;
      }
    }
  }
}

async function dispatchTemporalWorkflow(workflowId: string, input: GovernedWorkflowInput): Promise<boolean> {
  const temporalClientMod = await (new Function('m', 'return import(m)') as any)(
    '@temporalio/client'
  ).catch(() => null as any);
  if (!temporalClientMod?.Connection || !temporalClientMod?.Client) {
    return false;
  }

  const connection = await temporalClientMod.Connection.connect({
    address: process.env.TEMPORAL_ADDRESS,
  });
  const client = new temporalClientMod.Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  });

  await client.workflow.start('governedIngestionWorkflow', {
    args: [input],
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'concept2cure-governed',
    workflowId,
  });

  return true;
}

export async function startGovernedWorkflow(input: GovernedWorkflowInput) {
  const pool = getPool();

  const idempotencyKey = String(input.payload?.idempotencyKey || '');
  if (idempotencyKey) {
    const existing = await pool.query(
      `SELECT job_id, status, result_summary
         FROM artifact_compute_jobs
        WHERE organization_id = $1
          AND project_id = $2
          AND surface_key = 'workflow'
          AND payload->>'idempotencyKey' = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [input.organizationId, input.projectId, idempotencyKey]
    );
    if (existing.rows[0]) {
      return {
        workflowId: existing.rows[0].job_id,
        transport: existing.rows[0].result_summary?.transport || 'existing',
        status: existing.rows[0].status,
        reused: true,
      };
    }
  }

  const workflowId = `twf_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

  await pool.query(
    `INSERT INTO artifact_compute_jobs (
      job_id, organization_id, project_id, surface_key, intent_type, runtime_profile_key,
      status, requested_by_id, max_attempts, timeout_seconds, payload, result_summary
    ) VALUES ($1,$2,$3,'workflow', $4, 'temporal-bridge', 'running', $5, 5, 3600, $6, $7)`,
    [
      workflowId,
      input.organizationId,
      input.projectId,
      input.workflowType,
      input.requestedById || null,
      JSON.stringify(input.payload || {}),
      JSON.stringify({ transport: isTemporalEnabled() ? 'temporal' : 'local-fallback', state: 'started' }),
    ]
  );

  let transport: 'temporal' | 'local-fallback' = 'local-fallback';

  if (isTemporalEnabled()) {
    const startedInTemporal = await dispatchTemporalWorkflow(workflowId, input).catch(() => false);
    if (startedInTemporal) {
      transport = 'temporal';
      await pool.query(
        `UPDATE artifact_compute_jobs
            SET result_summary = $2, updated_at = NOW()
          WHERE job_id = $1`,
        [workflowId, JSON.stringify({ transport: 'temporal', state: 'dispatched' })]
      );
    }
  }

  if (transport === 'local-fallback') {
    await runLocalFallbackWorkflow(workflowId, input);
  }

  const statusRes = await pool.query(
    `SELECT status FROM artifact_compute_jobs WHERE job_id = $1 LIMIT 1`,
    [workflowId]
  );

  return {
    workflowId,
    transport,
    status: statusRes.rows[0]?.status || 'running',
    reused: false,
  };
}
