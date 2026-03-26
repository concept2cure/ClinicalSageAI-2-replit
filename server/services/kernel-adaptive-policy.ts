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

export async function getKernelPolicyHint(params: {
  organizationId?: number | null;
  route: string;
  taskType: TaskType;
  lookbackDays?: number;
  minSamples?: number;
}): Promise<KernelPolicyHint | null> {
  const lookbackDays = params.lookbackDays ?? 14;
  const minSamples = params.minSamples ?? 20;

  try {
    const result = await pool.query(
      `SELECT strategy, AVG(quality_score)::float AS avg_quality, COUNT(*)::int AS samples
       FROM ai_kernel_policy_outcomes
       WHERE route = $1
         AND task_type = $2
         AND ($3::int IS NULL OR organization_id = $3)
         AND created_at >= NOW() - (($4::text || ' days')::interval)
       GROUP BY strategy
       HAVING COUNT(*) >= $5
       ORDER BY avg_quality DESC
       LIMIT 1`,
      [params.route, params.taskType, params.organizationId || null, lookbackDays, minSamples]
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

