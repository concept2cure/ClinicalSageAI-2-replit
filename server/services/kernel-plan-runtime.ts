import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import type { GoalPlan, PlanStepStatus } from './kernel-goal-planner';

const logger = createScopedLogger('kernel-plan-runtime');

/**
 * Append one plan-run event.
 *
 * ── This table had never accepted a row ──────────────────────────────────────
 * `id` is BIGSERIAL (20260325_ai_goal_plan_step_events.sql:4) and this INSERT
 * supplied `gpe_<uuid>` into it, so PostgreSQL rejected every single call with
 * `invalid input syntax for type bigint`. Not sometimes — every one, since the
 * table was created.
 *
 * The consequence was not a missing log. `advanceGoalPlanStep` and
 * `executeNextGoalPlanStep` each ran the state UPDATE and this INSERT inside
 * ONE try block with `await pool.query` — separate statements, each
 * auto-committed. So the UPDATE committed, this threw, and the catch returned
 * `{ ok: false, message: 'Failed to update plan run' }`. Every step advance
 * SUCCEEDED in the database and reported failure to its caller, and a caller
 * that retried then hit `canTransitionStepStatus(completed, completed)` and was
 * told "Invalid transition".
 *
 * The id is now left to the sequence, and the write takes a CLIENT so it can
 * share its caller's transaction — which is the other half of the fix: a state
 * change and the record of it must land together or not at all. That is the
 * posture the rest of this codebase already holds (see the QMS tool handlers:
 * "FAILS CLOSED — a broken audit write rolls the approval back").
 */
async function recordPlanRunEvent(
  db: Pick<PoolClient, 'query'>,
  input: {
    planRunId: string;
    eventType: string;
    stepId?: string;
    payload?: Record<string, unknown>;
  }
) {
  await db.query(
    `INSERT INTO ai_goal_plan_step_events
       (plan_run_id, step_id, event_type, payload)
     VALUES ($1,$2,$3,$4)`,
    [
      input.planRunId,
      input.stepId ?? null,
      input.eventType,
      JSON.stringify(input.payload ?? {}),
    ]
  );
}

/**
 * Persist a step transition and its event atomically.
 *
 * Both writes or neither. Before this they were two auto-committed statements
 * in one try block, so a failed event left a committed state change reported as
 * a failure — the worst of both, since the caller then believes nothing
 * happened to a plan that has already moved.
 */
async function persistStepTransition(input: {
  planRunId: string;
  goalPlan: unknown;
  runStatus: string;
  stepId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE ai_goal_plan_runs
          SET goal_plan = $2, status = $3, updated_at = NOW()
        WHERE id = $1`,
      [input.planRunId, JSON.stringify(input.goalPlan), input.runStatus]
    );
    await recordPlanRunEvent(client, {
      planRunId: input.planRunId,
      stepId: input.stepId,
      eventType: input.eventType,
      payload: input.payload,
    });
    if (input.runStatus === 'completed') {
      await recordPlanRunEvent(client, {
        planRunId: input.planRunId,
        eventType: 'run_completed',
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const ALLOWED_TRANSITIONS: Record<PlanStepStatus, PlanStepStatus[]> = {
  pending: ['in_progress', 'blocked', 'replanned'],
  in_progress: ['completed', 'blocked', 'replanned'],
  completed: [],
  blocked: ['in_progress', 'replanned'],
  replanned: ['in_progress', 'completed', 'blocked'],
};

export function canTransitionStepStatus(from: PlanStepStatus, to: PlanStepStatus): boolean {
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
  const client = await pool.connect();
  try {
    // One transaction: a run and its `run_created` event land together or not
    // at all. They used to be two auto-committed statements in one try block,
    // and since the event INSERT threw on every call (see recordPlanRunEvent),
    // every run that has ever existed was created without the event that says
    // it was.
    await client.query('BEGIN');
    await client.query(
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
    await recordPlanRunEvent(client, {
      planRunId: id,
      eventType: 'run_created',
      payload: { route: input.route, stepCount: input.goalPlan.steps.length },
    });
    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Fails closed. This used to log and fall through to `return { id }`, so a
    // caller that asked for a run to be persisted was handed an id referring to
    // NO ROW — and every later use of it then failed on its own terms: GET
    // /plan/:id 404s, advance and execute-next answer "Plan run not found", and
    // /plan/:id/protocol writes audit rows pointing at nothing. A rolled-back
    // transaction is not a result.
    //
    // An earlier note here deferred this as "a change to this function's
    // signature and to every caller". That premise was wrong: there is exactly
    // one caller in the repo, and a throw changes no signature — the success
    // path still resolves to { id }.
    logger.warn(`Failed to persist goal plan run: ${error?.message || 'unknown error'}`);
    throw error;
  } finally {
    client.release();
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
    await persistStepTransition({
      planRunId: input.planRunId,
      goalPlan: run.goalPlan,
      runStatus,
      stepId: input.stepId,
      eventType: 'step_advanced',
      payload: { nextStatus: input.nextStatus, runStatus },
    });
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
    await persistStepTransition({
      planRunId,
      goalPlan: run.goalPlan,
      runStatus,
      stepId: nextStep.id,
      eventType: 'step_executed',
      payload: { mode: 'auto_execute_next', runStatus },
    });
    return { ok: true, executedStepId: nextStep.id };
  } catch (error: any) {
    logger.warn(`Failed to execute next plan step: ${error?.message || 'unknown error'}`);
    return { ok: false, message: 'Failed to persist executed step' };
  }
}

export async function listGoalPlanEvents(planRunId: string) {
  try {
    const result = await pool.query(
      `SELECT id, created_at, step_id, event_type, payload
       FROM ai_goal_plan_step_events
       WHERE plan_run_id = $1
       ORDER BY created_at ASC`,
      [planRunId]
    );
    return result.rows;
  } catch (error: any) {
    logger.warn(`Failed to list plan events: ${error?.message || 'unknown error'}`);
    return [];
  }
}
