import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import type { GoalPlan, PlanStepStatus } from './kernel-goal-planner';

const logger = createScopedLogger('kernel-plan-runtime');

const ALLOWED_TRANSITIONS: Record<PlanStepStatus, PlanStepStatus[]> = {
  pending: ['in_progress', 'blocked', 'replanned'],
  in_progress: ['completed', 'blocked', 'replanned'],
  completed: [],
  blocked: ['in_progress', 'replanned'],
  replanned: ['in_progress', 'completed', 'blocked'],
};

export function canTransitionStepStatus(
  from: PlanStepStatus,
  to: PlanStepStatus
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createGoalPlanRun(input: {
  organizationId?: number | null;
  threadId?: string | null;
  route: string;
  goalPlan: GoalPlan;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const id = `gpr_${randomUUID()}`;
  try {
    await pool.query(
      `INSERT INTO ai_goal_plan_runs
         (id, organization_id, thread_id, route, status, goal_plan, metadata)
       VALUES ($1,$2,$3,$4,'active',$5,$6)`,
      [
        id,
        input.organizationId || null,
        input.threadId || null,
        input.route,
        JSON.stringify(input.goalPlan),
        JSON.stringify(input.metadata || {}),
      ]
    );
  } catch (error: any) {
    logger.warn(`Failed to persist goal plan run: ${error?.message || 'unknown error'}`);
  }
  return { id };
}

export async function getGoalPlanRun(planRunId: string): Promise<{
  id: string;
  status: string;
  goalPlan: GoalPlan;
} | null> {
  try {
    const result = await pool.query(
      `SELECT id, status, goal_plan
       FROM ai_goal_plan_runs WHERE id = $1 LIMIT 1`,
      [planRunId]
    );
    if (result.rows.length === 0) return null;
    return {
      id: result.rows[0].id,
      status: result.rows[0].status,
      goalPlan:
        typeof result.rows[0].goal_plan === 'string'
          ? JSON.parse(result.rows[0].goal_plan)
          : result.rows[0].goal_plan,
    };
  } catch (error: any) {
    logger.warn(`Failed to fetch goal plan run: ${error?.message || 'unknown error'}`);
    return null;
  }
}

export async function advanceGoalPlanStep(input: {
  planRunId: string;
  stepId: string;
  nextStatus: PlanStepStatus;
}): Promise<{ ok: boolean; message?: string }> {
  const run = await getGoalPlanRun(input.planRunId);
  if (!run) return { ok: false, message: 'Plan run not found' };

  const step = run.goalPlan.steps.find(s => s.id === input.stepId);
  if (!step) return { ok: false, message: 'Step not found' };

  if (!canTransitionStepStatus(step.status, input.nextStatus)) {
    return {
      ok: false,
      message: `Invalid transition ${step.status} -> ${input.nextStatus}`,
    };
  }

  step.status = input.nextStatus;
  const allCompleted = run.goalPlan.steps.every(s => s.status === 'completed');
  const runStatus = allCompleted ? 'completed' : 'active';

  try {
    await pool.query(
      `UPDATE ai_goal_plan_runs
          SET goal_plan = $2, status = $3, updated_at = NOW()
        WHERE id = $1`,
      [input.planRunId, JSON.stringify(run.goalPlan), runStatus]
    );
    return { ok: true };
  } catch (error: any) {
    logger.warn(`Failed to advance goal plan step: ${error?.message || 'unknown error'}`);
    return { ok: false, message: 'Failed to update plan run' };
  }
}

export function findNextRunnableStep(goalPlan: GoalPlan) {
  return goalPlan.steps.find(step => {
    if (step.status !== 'pending') return false;
    if (!step.dependsOn || step.dependsOn.length === 0) return true;
    return step.dependsOn.every(depId => {
      const dep = goalPlan.steps.find(s => s.id === depId);
      return !!dep && dep.status === 'completed';
    });
  });
}

export async function executeNextGoalPlanStep(planRunId: string): Promise<{
  ok: boolean;
  executedStepId?: string;
  message?: string;
}> {
  const run = await getGoalPlanRun(planRunId);
  if (!run) return { ok: false, message: 'Plan run not found' };

  const nextStep = findNextRunnableStep(run.goalPlan);
  if (!nextStep) {
    return { ok: false, message: 'No runnable pending steps' };
  }

  if (!canTransitionStepStatus(nextStep.status, 'in_progress')) {
    return { ok: false, message: 'Cannot transition step to in_progress' };
  }
  nextStep.status = 'in_progress';
  if (!canTransitionStepStatus(nextStep.status, 'completed')) {
    return { ok: false, message: 'Cannot transition step to completed' };
  }
  nextStep.status = 'completed';

  const allCompleted = run.goalPlan.steps.every(s => s.status === 'completed');
  const runStatus = allCompleted ? 'completed' : 'active';

  try {
    await pool.query(
      `UPDATE ai_goal_plan_runs
          SET goal_plan = $2, status = $3, updated_at = NOW()
        WHERE id = $1`,
      [planRunId, JSON.stringify(run.goalPlan), runStatus]
    );
    return { ok: true, executedStepId: nextStep.id };
  } catch (error: any) {
    logger.warn(`Failed to execute next plan step: ${error?.message || 'unknown error'}`);
    return { ok: false, message: 'Failed to persist executed step' };
  }
}
