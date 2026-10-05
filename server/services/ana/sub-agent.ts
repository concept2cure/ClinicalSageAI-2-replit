/**
 * Sub-agents: one bounded, read-only child loop started by AnA's `run_agent`
 * (row 74, S5; ADR-0015 §2, §5, §7).
 *
 * The parent's tool handler awaits {@link runSubAgent} inside its own tool
 * round, so the child inherits the request's tenant scope and finishes before
 * the parent's next model call. A child:
 *   - is offered only RESEARCH_TOOLS ∩ the parent's governed set, and any
 *     other name is answered TOOL_NOT_OFFERED (child ⊆ parent, by name);
 *   - runs at agentDepth 1, where the wrapper refuses every tool the register
 *     does not class `read` (rule 0), so it cannot change, file, approve or
 *     sign anything, and cannot start agents;
 *   - runs every tool inside the model-call refusal scope, so no tool it calls
 *     can reach a generative model;
 *   - makes its own model calls as regulatory_review at riskTier 'high', on
 *     the tier pin only, with its own run id, the parent's run id, and the
 *     organization stated — never the parent turn's model override;
 *   - stops at CHILD_MAX_ROUNDS, about CHILD_TOKEN_BUDGET tokens, and
 *     CHILD_ACTIVE_MS of active time (time held for a person excluded);
 *   - waits while the person has the run paused, and stops when they stop it.
 *
 * A verify agent's verdict comes only from the deterministic checks, run on
 * the text exactly as given, before the child model is called. Its report is
 * advisory.
 *
 * Never throws: every failure is a structured AGENT_FAILED result, the slot is
 * released, and the finished frame is emitted (brief D9).
 *
 * The executor, the gateway and the tier resolver are imported dynamically, so
 * a module that imports this one's types pulls none of them in.
 *
 * @module server/services/ana/sub-agent
 */

import { randomUUID } from 'node:crypto';

import {
  CHILD_ACTIVE_MS,
  CHILD_MAX_ROUNDS,
  CHILD_TOKEN_BUDGET,
  CHILD_TOOL_CONCURRENCY,
  CHILD_WRAP_UP_MS,
} from '@shared/ana/run-control-limits';
import { getTenantScope } from '../../db/tenantStore.js';
import { runRefusingModelCalls } from '../ai-gateway/model-call-scope.js';
import type { AnaTool, GatewayRequest } from '../ai-gateway/types.js';
import type { AgenticToolEvent } from './agentic-tool-dispatch.js';
import { notifyObserver } from './agentic-tool-dispatch.js';
import type { LoopStopDirective } from './agentic-loop.js';
import type { ToolContext } from './AnaToolExecutor.js';
import type { RunHoldAnnounce, RunHoldOutcome } from './run-hold.js';
import {
  HARNESS_CHECKS,
  aggregateVerdict,
  dossierCheckSkipped,
  readDossierCheck,
  readGroundingCheck,
  readIntegrityCheck,
  type CheckReading,
  type HarnessCheck,
} from './sub-agent-result.js';
import {
  childToolsFrom,
  claimAgentSlot,
  parseAgentBrief,
  subAgentsEnabled,
  type AgentBrief,
  type AgentRefusal,
  type AgentTurnCounters,
} from './sub-agent-limits.js';
import {
  agentFailure,
  classifyAgentFailure,
  shapeAgentResult,
  type AgentBudget,
  type AgentModelRecord,
  type AgentStatus,
  type AgentStep,
} from './sub-agent-shape.js';

/** A frame the stream forwards as `agent_event` (S6 draws them). */
export type AgentEventFrame =
  | { phase: 'started'; runId: string; role: AgentBrief['role']; objective: string }
  | { phase: 'step'; runId: string; step: 'start' | 'end'; tool: string; round: number; ok?: boolean }
  | { phase: 'finished'; runId: string; status: AgentStatus | 'failed'; verdict?: string };

/**
 * What the parent turn lends a child. Built by the stream, per `run_agent`
 * call, and only when the turn may host agents (S5c). It carries no provider
 * or model: a child's model is the tier pin, never the parent's override.
 */
export interface SubAgentHost {
  /** The parent run's organization, from the same resolver as ctx.organizationId. */
  organizationId: number;
  /** The parent's run id; every child model call carries it as parentRunId. */
  parentRunId: string;
  /** The parent round this call belongs to. */
  round: number;
  /** The tools the parent was offered this turn, after tenant policy and launch scope. */
  governedTools: readonly AnaTool[];
  /** This turn's agent counts. */
  agents: AgentTurnCounters;
  /** The parent's run hold, bound to the PARENT's round (a child round never reaches it). */
  hold(announce: RunHoldAnnounce, signal: AbortSignal): Promise<RunHoldOutcome>;
  /** Aborted when a held run ran out of time. */
  expiredSignal: AbortSignal;
  /** Time the run has spent held, as the run hold counts it. */
  heldMs(): number;
  emit(frame: AgentEventFrame): void;
}

/** The refusal shape, as a tool result string. */
const refused = (r: AgentRefusal): string => JSON.stringify(r);

/**
 * D24: the child's tenant must be the request's tenant and the host's. Fails
 * closed: no scope, the system scope '0', or any disagreement refuses.
 */
function tenantMismatch(ctx: ToolContext, host: SubAgentHost): boolean {
  const scope = getTenantScope();
  const org = String(ctx.organizationId ?? '');
  return !scope || scope.tenantId === '0' || scope.tenantId !== org || String(host.organizationId) !== org;
}

/**
 * Why this call may not start an agent, or null. In order: the switch, depth,
 * host, tenant, brief, checker. Nothing here awaits, so the slot claim that
 * follows is decided against the same counts.
 */
function startRefusal(
  input: Record<string, unknown>,
  ctx: ToolContext,
  host: SubAgentHost | undefined,
): AgentRefusal | { brief: AgentBrief; host: SubAgentHost } {
  if (!subAgentsEnabled()) {
    return { error: 'AGENTS_DISABLED', message: 'Sub-agents are not enabled here. No agent was started.' };
  }
  if ((ctx.agentDepth ?? 0) >= 1) {
    return { error: 'AGENT_CANNOT_DELEGATE', message: 'An agent cannot start another agent. Nothing was started.' };
  }
  if (!host) {
    return {
      error: 'AGENTS_NEED_A_LIVE_RUN',
      message: 'Agents can only be started from a live conversation turn. No agent was started.',
    };
  }
  if (tenantMismatch(ctx, host)) {
    return { error: 'TENANT_SCOPE_MISMATCH', message: "This request's organization could not be confirmed. No agent was started." };
  }
  const brief = parseAgentBrief(input);
  if ('error' in brief) return brief;
  if (brief.role === 'verify' && !host.governedTools.some(t => (HARNESS_CHECKS as readonly string[]).includes(t.name))) {
    return {
      error: 'NO_DETERMINISTIC_CHECKER',
      message: 'None of the checks a verify agent runs is available in this conversation. No agent was started.',
    };
  }
  return { brief, host };
}

/** The child's ToolContext, field by field: nothing of the parent's is spread in (D11). */
function childContext(ctx: ToolContext, signal: AbortSignal): ToolContext {
  return {
    organizationId: ctx.organizationId,
    organizationUuid: ctx.organizationUuid ?? null,
    userId: ctx.userId ?? null,
    projectId: ctx.projectId ?? null,
    projectRef: ctx.projectRef ?? null,
    agentDepth: 1,
    modelCalls: 'refuse',
    signal,
  };
}

/**
 * A timer over ACTIVE time: wall time less what the run spent held. It
 * aborts at `limitMs`; a pause pushes the abort back by its length.
 */
export function createActiveTimer(heldMs: () => number, limitMs: number, now: () => number = Date.now) {
  const controller = new AbortController();
  const start = now();
  const heldAtStart = heldMs();
  const activeMs = () => now() - start - (heldMs() - heldAtStart);
  let handle: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const left = limitMs - activeMs();
    if (left <= 0) {
      controller.abort(new Error('active-time budget'));
      return;
    }
    handle = setTimeout(arm, left);
  };
  arm();
  return { signal: controller.signal, activeMs, clear: () => handle !== undefined && clearTimeout(handle) };
}

const CHECK_INPUT: Record<HarnessCheck, (text: string, projectId: number) => Record<string, unknown>> = {
  check_grounding: text => ({ text }),
  check_numerical_integrity: text => ({ content: text }),
  check_dossier_consistency: (text, projectId) => ({ draft_content: text, project_id: projectId }),
};
const CHECK_READER: Record<HarnessCheck, (json: string) => CheckReading> = {
  check_grounding: readGroundingCheck,
  check_numerical_integrity: readIntegrityCheck,
  check_dossier_consistency: readDossierCheck,
};
const CHECK_SUBJECT: Record<HarnessCheck, string> = {
  check_grounding: 'Citation markers',
  check_numerical_integrity: 'Internal consistency',
  check_dossier_consistency: 'Project records',
};

/** A verify agent's checks, on the text as given, inside the refusal scope, before the child model runs. */
async function runHarnessChecks(
  text: string,
  childCtx: ToolContext,
  offered: ReadonlySet<string>,
  ids: { runId: string; parentRunId: string },
): Promise<{ readings: CheckReading[]; outputs: Array<{ check: HarnessCheck; output: string }> }> {
  const { getToolHandler } = await import('./AnaToolExecutor.js');
  const readings: CheckReading[] = [];
  const outputs: Array<{ check: HarnessCheck; output: string }> = [];
  for (const check of HARNESS_CHECKS) {
    if (!offered.has(check)) {
      readings.push({ check, outcome: 'not_assessed', statement: `${CHECK_SUBJECT[check]}: not checked; the check is not available in this conversation.` });
      continue;
    }
    if (check === 'check_dossier_consistency' && !Number.isInteger(childCtx.projectId)) {
      readings.push(dossierCheckSkipped(Boolean(childCtx.projectRef)));
      continue;
    }
    const handler = getToolHandler(check);
    let output: string;
    try {
      output = handler
        ? await runRefusingModelCalls({ ...ids, tool: check }, () =>
            handler(CHECK_INPUT[check](text, Number(childCtx.projectId)), childCtx),
          )
        : JSON.stringify({ error: `${check} is not registered.` });
    } catch (err) {
      output = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
    outputs.push({ check, output });
    readings.push(CHECK_READER[check](output));
  }
  return { readings, outputs };
}

/** The child's standing instructions. */
export const SUB_AGENT_MODE =
  'You are a sub-agent working for AnA on one bounded task. Nobody is watching you and nobody will answer a ' +
  'question: where something is missing, say so and continue. You cannot see the conversation that started you. ' +
  'You can only read: you cannot change, file, approve or sign anything, and you cannot start agents. Your tools ' +
  'cannot call a generative model. Use the tools to find evidence, and cite the tool result behind every figure, ' +
  'identifier and quotation you report. Never state a figure, PMID, NCT number or quotation that no tool returned. ' +
  'Finish with a short report: what you found, with its source, and what you could not establish.';

function childMessages(brief: AgentBrief, readings: CheckReading[]): GatewayRequest['messages'] {
  const role =
    brief.role === 'verify'
      ? '\n\nYou are a verification agent. The deterministic checks below have already run on the text, and the ' +
        'verdict comes only from them. Your part is advisory: find and quote the source passages that support or ' +
        'contradict the text\'s figures and quotations, and say which you could not find.'
      : '\n\nYou are a research agent: investigate the objective and report what you found.';
  const parts = [`Objective: ${brief.objective}`, `Instructions:\n${brief.instructions}`];
  if (brief.textToCheck !== undefined) {
    parts.push(`Text to check:\n"""\n${brief.textToCheck}\n"""`);
    parts.push(`Checks already run:\n${readings.map(r => `- ${r.statement}`).join('\n')}`);
  }
  return [
    { role: 'system', content: SUB_AGENT_MODE + role },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/** The tier pin for every child call (D7): the high-risk tier, governed by resolveTierModel. */
async function childPin(): Promise<{ provider: GatewayRequest['provider']; model: string } | null> {
  const [{ getGateway }, { resolveTierModel, resolveModelTier }] = await Promise.all([
    import('../ai-gateway/gateway.js'),
    import('../ai-gateway/reasoning.js'),
  ]);
  const gw = getGateway();
  const enabled = typeof gw.getModels === 'function' ? gw.getModels().filter(m => m.enabled) : [];
  const pin = resolveTierModel(resolveModelTier({ effort: 'balanced', riskTier: 'high' }), enabled, process.env);
  return pin ? { provider: pin.provider, model: pin.model } : null;
}

/** D10: what served a child call, and its approved-models standing. */
async function modelRecorder(): Promise<(response: { provider?: string | null; model?: string | null }) => AgentModelRecord> {
  const { approvedEntryFor } = await import('../ai-governance/approved-models.js');
  return response => {
    const entry = approvedEntryFor(response);
    return {
      provider: response.provider ?? null,
      model: response.model ?? null,
      approvedModelId: entry?.id ?? null,
      pqStatus: entry?.pq.status ?? null,
      approvedForHighRisk: entry?.approvedForHighRisk === true,
    };
  };
}

/** One agent's state while it runs. */
interface AgentRun {
  runId: string;
  brief: AgentBrief;
  host: SubAgentHost;
  ctx: ToolContext;
  timer: ReturnType<typeof createActiveTimer>;
  signal: AbortSignal;
  steps: AgentStep[];
  models: AgentModelRecord[];
  usage: { inputTokens: number; outputTokens: number; modelCalls: number };
  budget: AgentBudget | null;
  /** What the run hold last answered when it was not 'running': the person's own outcome. */
  heldOutcome: RunHoldOutcome | null;
  finished: AgentEventFrame;
  emit(frame: AgentEventFrame): void;
}

function beginAgentRun(brief: AgentBrief, host: SubAgentHost, ctx: ToolContext): AgentRun {
  const runId = `agent_${randomUUID()}`;
  const timer = createActiveTimer(() => host.heldMs(), CHILD_ACTIVE_MS);
  const run: AgentRun = {
    runId,
    brief,
    host,
    ctx,
    timer,
    signal: AbortSignal.any([timer.signal, host.expiredSignal, ...(ctx.signal ? [ctx.signal] : [])]),
    steps: [],
    models: [],
    usage: { inputTokens: 0, outputTokens: 0, modelCalls: 0 },
    budget: null,
    heldOutcome: null,
    finished: { phase: 'finished', runId, status: 'failed' },
    emit: frame => notifyObserver('agent emit', () => host.emit(frame)),
  };
  run.emit({ phase: 'started', runId, role: brief.role, objective: brief.objective });
  return run;
}

/** Wait while the person has the run paused. False when it will not go on. */
async function holdFor(run: AgentRun): Promise<boolean> {
  const outcome = await run.host.hold({ reason: 'person' }, run.signal);
  if (outcome !== 'running') run.heldOutcome = outcome;
  return outcome === 'running' && !run.signal.aborted;
}

/**
 * Why a stopped agent stopped. The hold's own answer is read before any
 * signal, so a cancelled run is never reported as a time budget; then a Stop;
 * then an expired hold; and only then the active-time timer.
 */
function cancelStatus(run: AgentRun): { status: AgentStatus; budget: AgentBudget | null; heldExpired: boolean } {
  if (run.heldOutcome === 'expired' || (run.heldOutcome === null && run.host.expiredSignal.aborted)) {
    return { status: 'cancelled', budget: null, heldExpired: true };
  }
  if (run.heldOutcome !== null || run.ctx.signal?.aborted) return { status: 'cancelled', budget: null, heldExpired: false };
  return { status: 'incomplete', budget: 'time', heldExpired: false };
}

/** The result of an agent that stopped before or during a call. */
function stoppedResult(run: AgentRun): string {
  const c = cancelStatus(run);
  run.finished = { phase: 'finished', runId: run.runId, status: c.status };
  const { runId, brief, steps, models, usage } = run;
  return shapeAgentResult({ runId, brief, status: c.status, stoppedReason: 'cancelled', budget: c.budget, heldExpired: c.heldExpired, steps, models, usage, reportText: '', checks: null });
}

/** The child's own budget, asked after each round (D23: tokens are soft by up to two calls). */
function childStopWhen(run: AgentRun): () => LoopStopDirective {
  return () => {
    if (run.host.expiredSignal.aborted) return 'halt';
    if (run.usage.inputTokens + run.usage.outputTokens >= CHILD_TOKEN_BUDGET) {
      run.budget = 'tokens';
      return 'budget_exhausted';
    }
    if (run.timer.activeMs() >= CHILD_WRAP_UP_MS) {
      run.budget = 'time';
      return 'budget_exhausted';
    }
    return null;
  };
}

/** Run the child loop. The caller turns its outcome into the result. */
async function runChildLoop(run: AgentRun, childCtx: ToolContext, readings: CheckReading[]) {
  const { host: h, runId } = run;
  const tools = childToolsFrom(h.governedTools);
  const pin = await childPin();
  const recordModel = await modelRecorder();
  const request: GatewayRequest = {
    taskType: 'regulatory_review',
    riskTier: 'high',
    messages: childMessages(run.brief, readings),
    maxTokens: 4096,
    ...(pin ? { provider: pin.provider, model: pin.model } : {}),
    ...(tools.length > 0 ? { tools, toolChoice: 'auto' as const } : {}),
    organizationId: h.organizationId,
    runId,
    parentRunId: h.parentRunId,
    callerModule: 'ana-sub-agent',
  };
  const { executeAgenticLoop } = await import('./AnaToolExecutor.js');
  return executeAgenticLoop(request, {
    maxRounds: CHILD_MAX_ROUNDS,
    progressExtension: 0,
    toolContext: childCtx,
    signal: run.signal,
    allowedToolNames: new Set(tools.map(t => t.name)),
    toolConcurrency: CHILD_TOOL_CONCURRENCY,
    toolModelCalls: 'refuse',
    stopWhen: childStopWhen(run),
    checkpoint: async () => ((await holdFor(run)) ? 'continue' : 'abort'),
    onToolEvent: (e: AgenticToolEvent) => {
      const ok = !e.errorMessage;
      if (e.phase === 'end') run.steps.push({ round: e.round, tool: e.call.name, input: e.call.input, result: e.result ?? '', ok });
      run.emit({ phase: 'step', runId, step: e.phase, tool: e.call.name, round: e.round, ...(e.phase === 'end' ? { ok } : {}) });
    },
    onModelResponse: response => {
      run.usage.modelCalls += 1;
      run.usage.inputTokens += response.usage?.inputTokens ?? 0;
      run.usage.outputTokens += response.usage?.outputTokens ?? 0;
      run.models.push(recordModel(response));
    },
  });
}

/** Wait out a pause, run the checks (verify), run the child loop, and shape what it did. */
async function driveAgent(run: AgentRun): Promise<string> {
  // A run that will not resume starts nothing.
  if (!(await holdFor(run))) return stoppedResult(run);
  const childCtx = childContext(run.ctx, run.signal);
  const offered = new Set(run.host.governedTools.map(t => t.name));
  const checks =
    run.brief.textToCheck !== undefined
      ? await runHarnessChecks(run.brief.textToCheck, childCtx, offered, { runId: run.runId, parentRunId: run.host.parentRunId })
      : null;
  const verdict = checks ? aggregateVerdict(checks.readings) : null;
  const response = await runChildLoop(run, childCtx, checks?.readings ?? []);

  const reason = response.loop.stoppedReason;
  let status: AgentStatus = reason === 'no_more_tools' ? 'completed' : 'incomplete';
  let heldExpired = false;
  if (reason === 'cancelled') {
    const c = cancelStatus(run);
    status = c.status;
    run.budget = c.budget ?? run.budget;
    heldExpired = c.heldExpired;
  } else if (reason === 'max_rounds') {
    run.budget = 'rounds';
  }
  run.finished = { phase: 'finished', runId: run.runId, status, ...(verdict ? { verdict } : {}) };
  const { runId, brief, steps, models, usage, budget } = run;
  return shapeAgentResult({
    runId,
    brief,
    status,
    stoppedReason: reason,
    budget,
    heldExpired,
    steps,
    models,
    usage,
    reportText: response.content ?? '',
    checks: checks && verdict ? { readings: checks.readings, verdict, outputs: checks.outputs } : null,
  });
}

/**
 * Start one sub-agent and wait for its report. Returns a JSON string: an
 * AgentRefusal (nothing started), an AGENT_FAILED result, or the shaped agent
 * result. Never throws: the slot is released and the finished frame emitted
 * on every path (D9).
 */
export async function runSubAgent(
  input: Record<string, unknown>,
  ctx: ToolContext,
  host: SubAgentHost | undefined,
): Promise<string> {
  const start = startRefusal(input, ctx, host);
  if ('error' in start) return refused(start);
  const slot = claimAgentSlot(start.host.agents, start.host.round, start.host.organizationId);
  if ('error' in slot) return refused(slot);
  const run = beginAgentRun(start.brief, start.host, ctx);
  try {
    return await driveAgent(run);
  } catch (err) {
    // A Stop, an expired hold or the active-time budget aborted a call in flight.
    if (run.signal.aborted) return stoppedResult(run);
    return agentFailure(run.runId, run.brief, classifyAgentFailure(err, run.usage.modelCalls), run.models, run.steps);
  } finally {
    run.timer.clear();
    slot.release();
    run.emit(run.finished);
  }
}
