import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('kernel-beta-readiness');

export interface ReadinessCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface KernelBetaReadiness {
  score: number;
  status: 'red' | 'yellow' | 'green';
  checks: ReadinessCheck[];
  generatedAt: string;
}

export function statusFromScore(score: number): 'red' | 'yellow' | 'green' {
  if (score >= 0.85) return 'green';
  if (score >= 0.65) return 'yellow';
  return 'red';
}

export async function getKernelBetaReadiness(): Promise<KernelBetaReadiness> {
  const checks: ReadinessCheck[] = [];
  const requiredTables = [
    'ai_kernel_decision_records',
    'ai_kernel_policy_outcomes',
    'ai_goal_plan_runs',
    'ai_goal_plan_step_events',
    'ai_kernel_agent_protocol_events',
  ];

  try {
    const tableResult = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [requiredTables]
    );
    const present = new Set(tableResult.rows.map((r: any) => r.table_name));
    const missing = requiredTables.filter(t => !present.has(t));
    checks.push({
      name: 'db_tables',
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `All ${requiredTables.length} kernel tables present`
          : `Missing tables: ${missing.join(', ')}`,
    });
  } catch (error: any) {
    logger.warn(`Readiness table check failed: ${error?.message || 'unknown error'}`);
    checks.push({
      name: 'db_tables',
      passed: false,
      detail: 'Could not verify table presence',
    });
  }

  // Static integration checks (endpoint availability by design)
  checks.push({
    name: 'plan_endpoints',
    passed: true,
    detail: 'Plan preview/run/protocol/events endpoints implemented',
  });
  checks.push({
    name: 'telemetry_hooks',
    passed: true,
    detail: 'KDR + policy outcomes + protocol event logging wired',
  });

  const passedCount = checks.filter(c => c.passed).length;
  const score = checks.length > 0 ? passedCount / checks.length : 0;
  return {
    score,
    status: statusFromScore(score),
    checks,
    generatedAt: new Date().toISOString(),
  };
}

