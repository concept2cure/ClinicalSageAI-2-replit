/**
 * AnA's declared plan for a turn — the one source of "Step 2 of 5".
 *
 * ── Why a tool ───────────────────────────────────────────────────────────────
 * A turn already streams the phases it passed through and every tool it ran,
 * but neither says how much work is LEFT: the agentic loop runs until AnA
 * decides she has enough, so a count of phases-so-far has no honest total.
 * The only party who knows the shape of the work up front is AnA herself, so
 * the total comes from her: for multi-step work she calls `update_plan` with
 * the steps she intends to take, and calls it again as each one starts and
 * finishes. The client counts ONLY what she declared.
 *
 * ── What it refuses ──────────────────────────────────────────────────────────
 * The handler has no side effect. It validates and normalises the list and
 * hands it back; the stream route turns that NORMALISED result — never the raw
 * model input — into a `plan` event. The server never marks a step complete
 * on AnA's behalf and never invents a step: a turn that declares no plan shows
 * no step count at all, and a step she did not mark completed is not shown as
 * done, whatever else happened in the turn.
 *
 * Deliberately NOT the kernel goal planner (`kernel-goal-planner.ts`): that
 * one returns the same canned steps for every request and its runtime marks
 * steps complete without doing the work. A plan is only worth showing when it
 * is the plan the work actually follows.
 *
 * @module server/services/ana/turn-plan
 */

import type { AnaTool } from '../ai-gateway/types';

export const UPDATE_PLAN_TOOL_NAME = 'update_plan';

/** A plan longer than this stops being a plan a person can read at a glance. */
export const MAX_PLAN_STEPS = 8;
/** Titles are one line in a narrow panel. */
export const MAX_STEP_TITLE = 100;

export type TurnPlanStepStatus = 'pending' | 'in_progress' | 'completed';

export interface TurnPlanStep {
  title: string;
  status: TurnPlanStepStatus;
}

export interface TurnPlanEvent {
  type: 'plan';
  round: number;
  steps: TurnPlanStep[];
}

const STATUSES: ReadonlySet<string> = new Set(['pending', 'in_progress', 'completed']);

export const UPDATE_PLAN: AnaTool = {
  name: UPDATE_PLAN_TOOL_NAME,
  description:
    "Declare, then keep current, the short plan you are following for this turn. The person watching sees it as 'Step 2 of 5' beside your work, so it must be the plan you actually follow. " +
    'Call it FIRST whenever the request needs three or more distinct pieces of work — drafting a document or several sections, research across several sources, a review that checks more than one document, an analysis with separate stages. ' +
    'Do NOT call it for a question you can answer directly or with one or two tool calls. ' +
    'Send the WHOLE list every time, 3 to 8 steps, each a short imperative title (e.g. "Read the protocol synopsis", "Check the ICH E9 estimand guidance", "Draft section 2.7.3"), with the SAME titles on every call so progress can be followed. ' +
    'Set a step in_progress when you start it and completed only when its work is actually done in this turn; leave steps you do not reach as pending — never mark unfinished work completed. ' +
    'Update the plan in the same response as the tool calls that do the work; never spend a round on the plan alone. The call has no side effect and returns the plan as recorded.',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: `The whole plan, in order: 1 to ${MAX_PLAN_STEPS} steps.`,
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: `Short imperative step title, at most ${MAX_STEP_TITLE} characters, identical across updates.`,
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'pending until started, in_progress while working on it, completed only when done.',
            },
          },
          required: ['title', 'status'],
        },
      },
    },
    required: ['steps'],
  },
};

/**
 * Validate and normalise a plan. Throws with a sentence the model can act on
 * — the executor turns a throw into a failed step, which is what an invalid
 * plan is: nothing is recorded, and the person sees the step did not complete.
 */
export function normalizePlan(input: Record<string, unknown>): TurnPlanStep[] {
  const raw = input?.steps;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('update_plan needs a non-empty "steps" array.');
  }
  if (raw.length > MAX_PLAN_STEPS) {
    throw new Error(`A plan has at most ${MAX_PLAN_STEPS} steps; this one has ${raw.length}. Merge steps and send the whole list again.`);
  }
  const seen = new Set<string>();
  return raw.map((s, i) => {
    const step = (s ?? {}) as Record<string, unknown>;
    const title = typeof step.title === 'string' ? step.title.replace(/\s+/g, ' ').trim() : '';
    if (!title) throw new Error(`Step ${i + 1} has no title.`);
    const status = typeof step.status === 'string' ? step.status : '';
    if (!STATUSES.has(status)) {
      throw new Error(`Step ${i + 1} ("${title}") has status "${status}"; use pending, in_progress or completed.`);
    }
    const clipped = title.length > MAX_STEP_TITLE ? `${title.slice(0, MAX_STEP_TITLE - 1)}…` : title;
    const key = clipped.toLowerCase();
    if (seen.has(key)) throw new Error(`Two steps are titled "${clipped}"; titles must be distinct.`);
    seen.add(key);
    return { title: clipped, status: status as TurnPlanStepStatus };
  });
}

/** The handler: pure validation, no side effect. */
export async function handleUpdatePlan(input: Record<string, unknown>): Promise<string> {
  const steps = normalizePlan(input);
  const completed = steps.filter((s) => s.status === 'completed').length;
  return JSON.stringify({
    ok: true,
    steps,
    total: steps.length,
    completed,
    note: 'Plan recorded as shown to the person. Keep it current as steps start and finish.',
  });
}

/**
 * The `plan` stream event for a finished tool call, or null. Built from the
 * handler's normalised result so the client never counts a step the server
 * did not validate; a failed or cancelled call yields nothing.
 */
export function planEventFromToolResult(
  name: string,
  status: string,
  resultStr: string,
  round: number,
): TurnPlanEvent | null {
  if (name !== UPDATE_PLAN_TOOL_NAME || status !== 'success') return null;
  try {
    const parsed = JSON.parse(resultStr) as { ok?: boolean; steps?: unknown };
    if (parsed?.ok !== true || !Array.isArray(parsed.steps)) return null;
    return { type: 'plan', round, steps: normalizePlan({ steps: parsed.steps }) };
  } catch {
    return null;
  }
}
