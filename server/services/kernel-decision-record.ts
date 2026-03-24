/**
 * Kernel Decision Record (KDR) Service
 *
 * Persist orchestration/model/tool routing decisions so the platform can:
 * - audit "why this path was chosen"
 * - analyze cost/latency/quality tradeoffs
 * - train future adaptive scheduling policies
 *
 * Writes are best-effort: failures are logged but never break request flows.
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('kernel-decision-record');

export type KdrOutcome = 'success' | 'failed' | 'partial';

export interface KernelDecisionInput {
  requestId?: string;
  threadId?: string | null;
  route: string;
  organizationId?: number | null;
  userId?: number | string | null;
  projectId?: number | null;
  plannerVersion?: string;
  orchestratorName: string;
  intentLens?: string | null;
  intentConfidence?: number | null;
  submissionType?: string | null;
  selectedTaskType?: string | null;
  selectedProvider?: string | null;
  selectedModel?: string | null;
  routingStrategy?: string | null;
  selectedTools?: string[] | null;
  alternatives?: Array<Record<string, unknown>> | null;
  constraints?: Record<string, unknown> | null;
  decisionRationale?: string | null;
  estimatedCostUsd?: number | null;
  latencyMs?: number | null;
  outcome?: KdrOutcome | null;
  errorMessage?: string | null;
}

function normalizeUserId(userId?: number | string | null): number | null {
  if (typeof userId === 'number' && Number.isFinite(userId)) return userId;
  if (typeof userId === 'string') {
    const n = Number(userId);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function logKernelDecision(input: KernelDecisionInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_kernel_decision_records (
         request_id, thread_id, route, organization_id, user_id, project_id,
         planner_version, orchestrator_name, intent_lens, intent_confidence, submission_type,
         selected_task_type, selected_provider, selected_model, routing_strategy,
         selected_tools, alternatives, constraints, decision_rationale,
         estimated_cost_usd, latency_ms, outcome, error_message
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15,
         $16, $17, $18, $19,
         $20, $21, $22, $23
       )`,
      [
        input.requestId || null,
        input.threadId || null,
        input.route,
        input.organizationId || null,
        normalizeUserId(input.userId),
        input.projectId || null,
        input.plannerVersion || 'ana-ri-kernel-v1',
        input.orchestratorName,
        input.intentLens || null,
        input.intentConfidence ?? null,
        input.submissionType || null,
        input.selectedTaskType || null,
        input.selectedProvider || null,
        input.selectedModel || null,
        input.routingStrategy || null,
        JSON.stringify(input.selectedTools || []),
        JSON.stringify(input.alternatives || []),
        JSON.stringify(input.constraints || {}),
        input.decisionRationale || null,
        input.estimatedCostUsd ?? null,
        input.latencyMs ?? null,
        input.outcome || null,
        input.errorMessage || null,
      ]
    );
  } catch (error: any) {
    // Non-fatal on purpose: do not block core request path for telemetry
    logger.warn(`Failed to persist KDR: ${error?.message || 'unknown error'}`);
  }
}

