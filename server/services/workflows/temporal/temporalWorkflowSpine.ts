import crypto from 'crypto';
import { getPool } from '../../../db';

export interface GovernedWorkflowInput {
  workflowType: 'evidence_ingestion_enrichment' | 'document_export_compile' | 'report_generation_verify';
  organizationId: number;
  projectId?: number;
  artifactId?: string;
  payload: Record<string, unknown>;
  triggeredBy: string;
}

const STATUS_MAP = {
  queued: 'pending',
  running: 'running',
  waiting_approval: 'awaiting_approval',
  completed: 'completed',
  failed: 'failed',
} as const;

export class TemporalWorkflowSpine {
  private readonly temporalEnabled =
    String(process.env.OSS_WORKFLOW_TEMPORAL_ENABLED || 'false').toLowerCase() === 'true';

  async startWorkflow(
    input: GovernedWorkflowInput
  ): Promise<{ runId: string; status: string; engine: string }> {
    const runId = crypto.randomUUID();
    const engine = this.temporalEnabled ? 'temporal-bridge' : 'legacy-orchestration-fallback';

    await getPool().query(
      `INSERT INTO workflow_runs
       (id, organization_id, workflow_type, workflow_version, display_name, trigger_source, triggered_by,
        project_id, module_scope, status, current_step_index, last_successful_step_index, steps_executed,
        objects_touched, outputs_created, blockers, diff_summaries, recommendations, metadata, started_at,
        created_at, updated_at)
       VALUES
       ($1, $2, $3, '1.0', $4, 'api_call', $5, $6, 'session-b', $7, 0, NULL, '[]'::json,
        '[]'::json, '[]'::json, '[]'::json, '[]'::json, '[]'::json, $8::json, NOW(), NOW(), NOW())`,
      [
        runId,
        input.organizationId,
        input.workflowType,
        `Session B ${input.workflowType}`,
        input.triggeredBy,
        input.projectId || null,
        STATUS_MAP.queued,
        JSON.stringify({
          engine,
          artifactId: input.artifactId || null,
          payload: input.payload || {},
          transitions: [
            { status: STATUS_MAP.queued, at: new Date().toISOString(), details: { trigger: 'start' } },
          ],
        }),
      ]
    );

    return { runId, status: STATUS_MAP.queued, engine };
  }

  async markTransition(
    runId: string,
    status: 'running' | 'waiting_approval' | 'completed' | 'failed',
    details?: Record<string, unknown>
  ): Promise<void> {
    const mappedStatus = STATUS_MAP[status];

    await getPool().query(
      `UPDATE workflow_runs
       SET status = $2,
           metadata = jsonb_set(
             COALESCE(metadata::jsonb, '{}'::jsonb),
             '{transitions}',
             COALESCE(metadata::jsonb->'transitions', '[]'::jsonb) || $3::jsonb
           )::json,
           updated_at = NOW(),
           completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
       WHERE id = $1`,
      [
        runId,
        mappedStatus,
        JSON.stringify([
          { status: mappedStatus, at: new Date().toISOString(), details: details || {} },
        ]),
      ]
    );
  }

  async getWorkflowRun(runId: string): Promise<Record<string, unknown> | null> {
    const result = await getPool().query(
      `SELECT id, organization_id, workflow_type, status, project_id, metadata, started_at, completed_at, updated_at
       FROM workflow_runs WHERE id = $1 LIMIT 1`,
      [runId]
    );
    return result.rows[0] || null;
  }
}

export const temporalWorkflowSpine = new TemporalWorkflowSpine();
