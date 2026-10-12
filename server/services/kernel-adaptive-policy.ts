import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import type { RoutingStrategy, TaskType } from './ai-gateway/types.js';

const logger = createScopedLogger('kernel-adaptive-policy');

export interface KernelPolicyHint {
  preferredStrategy: RoutingStrategy;
  avgQualityScore: number;
  sampleSize: number;
}

export interface KernelPolicyOutcomeInput {
  organizationId?: number | null;
  route: string;
  taskType: TaskType;
  strategy: RoutingStrategy;
  requestId?: string | null;
  threadId?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  qualityScore: number;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

export function computeKernelOutcomeScore(input: {
  qualityScore: number;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
}): number {
  const q = Math.max(0, Math.min(1, input.qualityScore));
  const latencyPenalty = input.latencyMs ? Math.min(input.latencyMs / 15000, 1) * 0.15 : 0;
  const costPenalty = input.estimatedCostUsd ? Math.min(input.estimatedCostUsd / 2, 1) * 0.1 : 0;
  return Math.max(0, Math.min(1, q - latencyPenalty - costPenalty));
}

export async function recordKernelPolicyOutcome(input: KernelPolicyOutcomeInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_kernel_policy_outcomes (
         organization_id, route, task_type, strategy,
         request_id, thread_id, model_provider, model_name,
         quality_score, latency_ms, estimated_cost_usd, success, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        input.organizationId || null,
        input.route,
        input.taskType,
        input.strategy,
        input.requestId || null,
        input.threadId || null,
        input.modelProvider || null,
        input.modelName || null,
        computeKernelOutcomeScore({
          qualityScore: input.qualityScore,
          latencyMs: input.latencyMs,
          estimatedCostUsd: input.estimatedCostUsd,
        }),
        input.latencyMs || null,
        input.estimatedCostUsd || null,
        input.success ?? true,
        JSON.stringify(input.metadata || {}),
      ]
    );
  } catch (error: any) {
    logger.warn(`Failed to record kernel policy outcome: ${error?.message || 'unknown error'}`);
  }
}

/**
 * The preferred routing strategy, learned from ONE organisation's recorded
 * outcomes — or null when there is nothing to learn from.
 *
 * Until 2026-10-12 the statement read
 * `AND ($3::int IS NULL OR organization_id = $3)` and both callers pass
 * `organizationId: … || null` (routes/chat/send-message.ts:744,
 * ana-kernel-orchestrator.ts:29), so a turn whose organisation could not be
 * resolved chose its strategy from the average quality scores of EVERY
 * tenant's outcomes: one organisation's results steering another's routing,
 * and a cross-tenant aggregate returned to the caller.
 *
 * No organisation now means no hint, which is not a loss of behaviour: both
 * callers read `policyHint?.preferredStrategy || routingPlan.strategy`, so the
 * turn falls back to the router's own deterministic strategy rather than to
 * another tenant's.
 */
export async function getKernelPolicyHint(params: {
  organizationId?: number | null;
  route: string;
  taskType: TaskType;
  lookbackDays?: number;
  minSamples?: number;
}): Promise<KernelPolicyHint | null> {
  const lookbackDays = params.lookbackDays ?? 14;
  const minSamples = params.minSamples ?? 20;
  const organizationId = Number(params.organizationId);
  if (!Number.isInteger(organizationId) || organizationId <= 0) return null;

  try {
    const result = await pool.query(
      `SELECT strategy, AVG(quality_score)::float AS avg_quality, COUNT(*)::int AS samples
       FROM ai_kernel_policy_outcomes
       WHERE route = $1
         AND task_type = $2
         AND organization_id = $3
         AND created_at >= NOW() - (($4::text || ' days')::interval)
       GROUP BY strategy
       HAVING COUNT(*) >= $5
       ORDER BY avg_quality DESC
       LIMIT 1`,
      [params.route, params.taskType, organizationId, lookbackDays, minSamples]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      preferredStrategy: row.strategy as RoutingStrategy,
      avgQualityScore: Number(row.avg_quality || 0),
      sampleSize: Number(row.samples || 0),
    };
  } catch (error: any) {
    logger.debug(`No policy hint available: ${error?.message || 'unknown error'}`);
    return null;
  }
}

