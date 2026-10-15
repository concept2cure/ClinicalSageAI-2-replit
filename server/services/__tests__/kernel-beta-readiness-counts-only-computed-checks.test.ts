/**
 * Kernel beta readiness is scored only on checks that were computed.
 *
 * Until 2026-10-15 getKernelBetaReadiness pushed two checks as constants:
 * plan_endpoints ("endpoints implemented") and telemetry_hooks ("logging
 * wired"), both `passed: true` without being checked. With every kernel table
 * missing, the score was still 2/3 = 0.667 and the status was 'yellow'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../../db.js', () => ({
  pool: { query: (...args: unknown[]) => poolQuery(...args) },
}));

import { getKernelBetaReadiness } from '../kernel-beta-readiness';

const TABLES = [
  'ai_kernel_decision_records',
  'ai_kernel_policy_outcomes',
  'ai_goal_plan_runs',
  'ai_goal_plan_step_events',
  'ai_kernel_agent_protocol_events',
];

beforeEach(() => {
  poolQuery.mockReset();
});

describe('getKernelBetaReadiness', () => {
  it('with every kernel table missing, is red, not yellow', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    const readiness = await getKernelBetaReadiness();

    expect(readiness.status).toBe('red');
    expect(readiness.score).toBe(0);
  });

  it('carries no check that passed without being computed', async () => {
    poolQuery.mockResolvedValue({ rows: TABLES.map(table_name => ({ table_name })) });

    const readiness = await getKernelBetaReadiness();

    expect(readiness.checks.map(c => c.name)).toEqual(['db_tables']);
    expect(readiness.checks[0]).toMatchObject({ passed: true });
  });
});
