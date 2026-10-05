/**
 * What a finished sub-agent hands back (row 74, S5): the full result, which
 * the turn record keeps whole, and the view the parent model and the client
 * read, which carries no `trace`.
 *
 * Pure. No harness-authored sentence here says "verified": a check states what
 * it established, and the agent's report is labelled advisory.
 *
 * @module server/services/ana/sub-agent-shape
 */

import { isTerminalGatewayError } from '../ai-gateway/gateway-outcome.js';
import { describeToolPlan } from './agentic-loop.js';
import type { CheckReading, HarnessCheck, VerifyVerdict } from './sub-agent-result.js';
import type { AgentBrief } from './sub-agent-limits.js';

export type AgentStatus = 'completed' | 'incomplete' | 'cancelled';
/** Which budget stopped an incomplete agent. */
export type AgentBudget = 'rounds' | 'tokens' | 'time';

/** One child tool call, in full: the record keeps every one. */
export interface AgentStep {
  round: number;
  tool: string;
  input: Record<string, unknown>;
  result: string;
  ok: boolean;
}

/** One child model call: what served it, and its approved-models standing (D10). */
export interface AgentModelRecord {
  provider: string | null;
  model: string | null;
  approvedModelId: string | null;
  pqStatus: string | null;
  approvedForHighRisk: boolean;
}

export const REPORT_MAX = 2_500;
export const CHECK_OUTPUT_MAX = 2_000;
export const STEPS_SHOWN = 24;
export const NOT_EXECUTED_SHOWN = 12;

/** What no check here establishes; stated on every verify result. */
export const NOT_CHECKED = [
  'Whether a cited source exists, or supports the sentence that cites it.',
  'Whether a quotation matches its source.',
] as const;

const cap = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const BUDGET_WORDS: Record<AgentBudget, string> = {
  rounds: 'its round limit',
  tokens: 'its token budget',
  time: 'its time budget',
};

/** A step the child named but may not take: answered, not run. */
const REFUSED_CODES: ReadonlySet<string> = new Set(['TOOL_NOT_OFFERED', 'SUB_AGENT_READ_ONLY']);

function refusalCode(result: string): string | null {
  try {
    const r: unknown = JSON.parse(result);
    const code = r && typeof r === 'object' ? (r as { error?: unknown }).error : undefined;
    return typeof code === 'string' && REFUSED_CODES.has(code) ? code : null;
  } catch {
    return null;
  }
}

const labelOf = (s: AgentStep) => describeToolPlan([{ id: '', name: s.tool, input: s.input }])[0]?.label ?? s.tool;

function statusNote(status: AgentStatus, budget: AgentBudget | null, heldExpired: boolean): string {
  if (status === 'incomplete') {
    return (
      `Stopped at ${budget ? BUDGET_WORDS[budget] : 'a step it kept repeating'}; the report may be incomplete. ` +
      'Use what it found, say what it did not cover, and do not start the same brief again.'
    );
  }
  if (status === 'cancelled') {
    return heldExpired ? 'Stopped: the run stayed paused past its limit.' : 'Stopped before it finished.';
  }
  return '';
}

export interface ShapeInput {
  runId: string;
  brief: AgentBrief;
  status: AgentStatus;
  stoppedReason: string;
  budget: AgentBudget | null;
  heldExpired: boolean;
  steps: readonly AgentStep[];
  models: readonly AgentModelRecord[];
  usage: { inputTokens: number; outputTokens: number; modelCalls: number };
  reportText: string;
  checks: { readings: CheckReading[]; verdict: VerifyVerdict; outputs: Array<{ check: HarnessCheck; output: string }> } | null;
}

/** The full result, as a JSON string. `trace` holds every step whole; the view drops it. */
export function shapeAgentResult(a: ShapeInput): string {
  const notExecuted = a.steps
    .map(s => ({ s, code: refusalCode(s.result) }))
    .filter((x): x is { s: AgentStep; code: string } => x.code !== null)
    .map(({ s, code }) => ({ tool: s.tool, label: labelOf(s), code }));
  const notes = [statusNote(a.status, a.budget, a.heldExpired)];
  if (a.checks) notes.push('The verdict comes only from the checks; the agent\'s report is advisory.');
  if (notExecuted.length > 0) {
    notes.push(
      `Tried ${notExecuted.length} step${notExecuted.length === 1 ? '' : 's'} it may not take: ` +
        `${notExecuted.slice(0, NOT_EXECUTED_SHOWN).map(n => n.label).join('; ')}. Nothing was changed.`,
    );
  }
  return JSON.stringify({
    agent: { runId: a.runId, role: a.brief.role, objective: a.brief.objective },
    status: a.status,
    stoppedReason: a.stoppedReason,
    ...(a.budget && a.status === 'incomplete' ? { budget: a.budget } : {}),
    ...(a.checks
      ? {
          verdict: a.checks.verdict,
          checks: a.checks.readings,
          notChecked: NOT_CHECKED,
          checkOutputs: a.checks.outputs.map(o => ({ check: o.check, output: cap(o.output, CHECK_OUTPUT_MAX) })),
        }
      : {}),
    report: {
      text: cap(a.reportText, REPORT_MAX),
      ...(a.reportText.length > REPORT_MAX ? { truncated: true } : {}),
      advisory: a.brief.role === 'verify',
    },
    steps: a.steps.slice(0, STEPS_SHOWN).map(s => ({ round: s.round, tool: s.tool, label: labelOf(s), ok: s.ok })),
    stepCount: a.steps.length,
    notExecuted: notExecuted.slice(0, NOT_EXECUTED_SHOWN),
    models: a.models,
    usage: a.usage,
    note: notes.filter(Boolean).join(' '),
    trace: { steps: a.steps, finalText: a.reportText },
  });
}

/** The parent model's and the client's view: everything but the record-only trace. */
export function runAgentViewForModel(full: string): string {
  try {
    const r: unknown = JSON.parse(full);
    if (!r || typeof r !== 'object' || Array.isArray(r)) return full;
    const view: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    delete view.trace;
    delete view.provenance;
    return JSON.stringify(view);
  } catch {
    return full;
  }
}

export type AgentFailureCode = 'MODEL_NOT_APPROVED' | 'MODEL_DECLINED' | 'RATE_OR_POLICY_LIMIT' | 'ERROR';

/**
 * D8: by code and name, never instanceof — route tests mock the gateway with
 * hand-listed classes. Zero model calls means it could not start.
 */
export function classifyAgentFailure(err: unknown, modelCalls: number): { code: AgentFailureCode; message: string } {
  const e = (err ?? {}) as { code?: unknown; name?: unknown; message?: unknown };
  const detail = typeof e.message === 'string' ? e.message : String(err);
  const verb = modelCalls === 0 ? 'could not start' : 'could not finish';
  let code: AgentFailureCode;
  let why: string;
  if (e.code === 'MODEL_NOT_APPROVED_FOR_HIGH_RISK' || e.code === 'MODEL_NOT_PQ_QUALIFIED') {
    code = 'MODEL_NOT_APPROVED';
    why = 'no model approved for this work was available';
  } else if (e.name === 'GatewayModelDeclinedError') {
    code = 'MODEL_DECLINED';
    why = 'the model declined the task';
  } else if (e.code !== 'SUB_AGENT_TOOL_MODEL_CALL' && isTerminalGatewayError(err)) {
    code = 'RATE_OR_POLICY_LIMIT';
    why = 'the AI gateway refused the call (a rate or policy limit)';
  } else {
    code = 'ERROR';
    why = 'an error';
  }
  return { code, message: `The agent ${verb}: ${why}. ${detail}` };
}

/** The AGENT_FAILED result: a top-level string `error`, so the trace records it as a failed step. */
export function agentFailure(
  runId: string,
  brief: AgentBrief,
  failure: { code: AgentFailureCode; message: string },
  models: readonly AgentModelRecord[],
  steps: readonly AgentStep[],
): string {
  return JSON.stringify({
    error: 'AGENT_FAILED',
    code: failure.code,
    message: failure.message,
    agent: { runId, role: brief.role, objective: brief.objective },
    models,
    trace: { steps },
  });
}
