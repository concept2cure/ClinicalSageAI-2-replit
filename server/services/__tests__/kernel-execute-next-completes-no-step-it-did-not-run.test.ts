/**
 * The kernel plan runtime marks no step done that nothing ran. A failed read is a failure.
 *
 * Until 2026-10-15 executeNextGoalPlanStep took the next dependency-satisfied
 * step and set it in_progress and then completed, in memory only. No executor
 * exists for goal-plan steps. It then persisted the plan with a
 * `step_executed` event, so "Run quality/risk checks" became completed without
 * any check being run. The reads beside it turned failures into absence:
 *  - getGoalPlanRun answered null, which the route turned into 404 "Plan run not found".
 *  - listGoalPlanEvents and listProtocolEvents answered [].
 *  - getKernelMetrics answered zero decisions with qualityBand 'weak'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolQuery = vi.fn();
const clientQuery = vi.fn();
const poolConnect = vi.fn();
vi.mock('../../db.js', () => ({
  pool: {
    query: (...args: unknown[]) => poolQuery(...args),
    connect: (...args: unknown[]) => poolConnect(...args),
  },
}));

import { executeNextGoalPlanStep, getGoalPlanRun, listGoalPlanEvents } from '../kernel-plan-runtime';
import { listProtocolEvents } from '../kernel-agent-protocol';
import { getKernelMetrics } from '../kernel-observability';

const PLAN = {
  planId: 'plan_1',
  goal: 'Audit the IND summary',
  intentLens: 'audit',
  riskTier: 'medium',
  generatedAt: '2026-10-15T00:00:00.000Z',
  replanCount: 0,
  steps: [
    { id: 's1', title: 'Run quality/risk checks', objective: '', dependsOn: [], successCriteria: [], status: 'pending' },
  ],
};

beforeEach(() => {
  poolQuery.mockReset();
  clientQuery.mockReset();
  poolConnect.mockReset();
  poolConnect.mockResolvedValue({ query: clientQuery, release: vi.fn() });
});

describe('executeNextGoalPlanStep', () => {
  it('says no executor exists, names the step it did not run, and writes nothing', async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: 'gpr_1', status: 'active', goal_plan: PLAN }] });

    const result = await executeNextGoalPlanStep('gpr_1');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: 'NO_STEP_EXECUTOR', nextStepId: 's1' });
    expect(result.message).toMatch(/not run/);
    expect(poolConnect).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('still reports a missing run and a plan with nothing runnable as before', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    expect(await executeNextGoalPlanStep('gpr_missing')).toMatchObject({ ok: false, code: 'PLAN_NOT_FOUND' });

    const done = { ...PLAN, steps: [{ ...PLAN.steps[0], status: 'completed' }] };
    poolQuery.mockResolvedValueOnce({ rows: [{ id: 'gpr_1', status: 'completed', goal_plan: done }] });
    expect(await executeNextGoalPlanStep('gpr_1')).toMatchObject({ ok: false, code: 'NO_RUNNABLE_STEP' });
  });
});

describe('a failed read is a failure, not absence', () => {
  beforeEach(() => {
    poolQuery.mockRejectedValue(new Error('connection terminated unexpectedly'));
  });

  it('getGoalPlanRun rejects instead of answering "not found"', async () => {
    await expect(getGoalPlanRun('gpr_1')).rejects.toThrow('connection terminated unexpectedly');
  });

  it('listGoalPlanEvents rejects instead of answering "no events"', async () => {
    await expect(listGoalPlanEvents('gpr_1')).rejects.toThrow('connection terminated unexpectedly');
  });

  it('listProtocolEvents rejects instead of answering "no events"', async () => {
    await expect(listProtocolEvents('gpr_1')).rejects.toThrow('connection terminated unexpectedly');
  });

  it('getKernelMetrics rejects instead of answering zeros and a "weak" quality band', async () => {
    await expect(getKernelMetrics({ organizationId: 7 })).rejects.toThrow('connection terminated unexpectedly');
  });
});
