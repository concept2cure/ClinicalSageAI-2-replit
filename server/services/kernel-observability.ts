import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('kernel-observability');

export function computeQualityBand(score: number): 'strong' | 'moderate' | 'weak' {
  if (score >= 0.85) return 'strong';
  if (score >= 0.65) return 'moderate';
  return 'weak';
}

export interface KernelMetrics {
  windowDays: number;
  kdr: {
    total: number;
    successRate: number;
    avgLatencyMs: number;
  };
  policy: {
    totalOutcomes: number;
    avgQualityScore: number;
    qualityBand: 'strong' | 'moderate' | 'weak';
  };
  plans: {
    totalRuns: number;
    completedRuns: number;
    completionRate: number;
  };
  protocol: {
    totalEvents: number;
    decisions: number;
  };
}

export async function getKernelMetrics(params: {
  organizationId?: number | null;
  windowDays?: number;
}): Promise<KernelMetrics> {
  const windowDays = params.windowDays ?? 7;
  const orgId = params.organizationId || null;

  const empty: KernelMetrics = {
    windowDays,
    kdr: { total: 0, successRate: 0, avgLatencyMs: 0 },
    policy: { totalOutcomes: 0, avgQualityScore: 0, qualityBand: 'weak' },
    plans: { totalRuns: 0, completedRuns: 0, completionRate: 0 },
    protocol: { totalEvents: 0, decisions: 0 },
  };

  try {
    const [kdrRes, policyRes, planRes, protocolRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COALESCE(AVG(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END), 0)::float AS success_rate,
           COALESCE(AVG(latency_ms), 0)::float AS avg_latency_ms
         FROM ai_kernel_decision_records
         WHERE ($1::int IS NULL OR organization_id = $1)
           AND created_at >= NOW() - (($2::text || ' days')::interval)`,
        [orgId, windowDays]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_outcomes,
           COALESCE(AVG(quality_score), 0)::float AS avg_quality_score
         FROM ai_kernel_policy_outcomes
         WHERE ($1::int IS NULL OR organization_id = $1)
           AND created_at >= NOW() - (($2::text || ' days')::interval)`,
        [orgId, windowDays]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_runs,
           COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed_runs
         FROM ai_goal_plan_runs
         WHERE ($1::int IS NULL OR organization_id = $1)
           AND created_at >= NOW() - (($2::text || ' days')::interval)`,
        [orgId, windowDays]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_events,
           COALESCE(SUM(CASE WHEN message_type = 'decision' THEN 1 ELSE 0 END), 0)::int AS decisions
         FROM ai_kernel_agent_protocol_events
         WHERE ($1::int IS NULL OR organization_id = $1)
           AND created_at >= NOW() - (($2::text || ' days')::interval)`,
        [orgId, windowDays]
      ),
    ]);

    const kdr = kdrRes.rows[0];
    const policy = policyRes.rows[0];
    const plans = planRes.rows[0];
    const protocol = protocolRes.rows[0];

    const avgQuality = Number(policy.avg_quality_score || 0);
    const totalRuns = Number(plans.total_runs || 0);
    const completedRuns = Number(plans.completed_runs || 0);

    return {
      windowDays,
      kdr: {
        total: Number(kdr.total || 0),
        successRate: Number(kdr.success_rate || 0),
        avgLatencyMs: Number(kdr.avg_latency_ms || 0),
      },
      policy: {
        totalOutcomes: Number(policy.total_outcomes || 0),
        avgQualityScore: avgQuality,
        qualityBand: computeQualityBand(avgQuality),
      },
      plans: {
        totalRuns,
        completedRuns,
        completionRate: totalRuns > 0 ? completedRuns / totalRuns : 0,
      },
      protocol: {
        totalEvents: Number(protocol.total_events || 0),
        decisions: Number(protocol.decisions || 0),
      },
    };
  } catch (error: any) {
    logger.warn(`Failed to load kernel metrics: ${error?.message || 'unknown error'}`);
    return empty;
  }
}

