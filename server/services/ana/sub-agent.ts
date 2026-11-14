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

import { createHash } from 'node:crypto';

import {
  CHILD_ACTIVE_MS,
  CHILD_MAX_ROUNDS,
  CHILD_TOKEN_BUDGET,
  CHILD_TOOL_CONCURRENCY,
  CHILD_WRAP_UP_MS,
} from '@shared/ana/run-control-limits';
import { getTenantScope } from '../../db/tenantStore.js';
import { runRefusingModelCalls, bindOwnerPrivateModelChildRequest, CONVERSATION_DEFAULT_TIER } from '../ai-gateway/model-call-scope.js';
import type { CoordinationModel, RunCoordinationHost } from './run-events.js';
import { startAgentCoordination, queueAgentProgress, flushAgentProgress, executeMeasuredAgentCheck, recordMeasuredAgentCheck,
  agentModelContext, recordAgentReport, beginAgentRun, holdFor, type AgentRun } from './sub-agent-stream.js';
import type { AnyAnaTool, GatewayRequest } from '../ai-gateway/types.js';
import type { AgenticToolEvent } from './agentic-tool-dispatch.js';
import type { DraftSourceContext } from './draft-project-sources.js';
import type { LoopStopDirective, ToolResultEntry } from './agentic-loop.js';
import type { ToolContext } from './AnaToolExecutor.js';
import type { RunHoldAnnounce, RunHoldOutcome } from './run-hold.js';
import { refusalOf } from './tool-trace.js';
import {
  HARNESS_CHECKS,
  aggregateVerdict,
  compareStoredSourceClaims,
  SOURCE_CLAIM_METHOD,
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
  type AgentSourceSpan,
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
  governedTools: readonly AnyAnaTool[];
  /** This turn's agent counts. */
  agents: AgentTurnCounters;
  /** The parent's run hold, bound to the PARENT's round (a child round never reaches it). */
  hold(announce: RunHoldAnnounce, signal: AbortSignal): Promise<RunHoldOutcome>;
  /** Aborted when a held run ran out of time. */
  expiredSignal: AbortSignal;
  /** Time the run has spent held, as the run hold counts it. */
  heldMs(): number;
  emit(frame: AgentEventFrame): void;
  /** Opened only by the authenticated parent run, never from the brief. */
  coordination?: () => Promise<RunCoordinationHost>;
  worker?: string;
  parentStep?: string;
  task?: string | null;
  parentModel?: CoordinationModel;
  /** Tightens the parent wire sink after an actual private activation. */
  onOwnerPrivateCapture?: () => void;
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
  if (brief.role === 'verify' && !host.governedTools.some(t => (HARNESS_CHECKS as readonly string[]).includes(t.name) ||
    (brief.sourceDocumentIds?.length && t.name === 'read_project_document'))) {
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
    organizationId: ctx.organizationId, organizationUuid: ctx.organizationUuid ?? null,
    userId: ctx.userId ?? null, sqlClient: ctx.sqlClient,
    projectId: ctx.projectId ?? null, projectRef: ctx.projectRef ?? null,
    agentDepth: 1, modelCalls: 'refuse', signal,
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
  evidence: { sourceSpans?: readonly AgentSourceSpan[]; steps: AgentStep[]; onReading(reading: CheckReading, elapsedMs: number | null): void;
    measure<T>(check: () => Promise<T>): Promise<{value:T;elapsedMs:number|null}> },
): Promise<{ readings: CheckReading[]; outputs: Array<{ check: CheckReading['check']; output: string }> }> {
  const { getToolHandler } = await import('./AnaToolExecutor.js');
  const readings: CheckReading[] = [], outputs: Array<{ check: CheckReading['check']; output: string }> = [];
  for (const check of HARNESS_CHECKS) {
    if (!offered.has(check)) {
      addCheckReading(readings, { check, outcome: 'not_assessed', statement: `${CHECK_SUBJECT[check]}: not checked; the check is not available in this conversation.` }, evidence.onReading,null);
      continue;
    }
    if (check === 'check_dossier_consistency' && !Number.isInteger(childCtx.projectId)) {
      addCheckReading(readings, dossierCheckSkipped(Boolean(childCtx.projectRef)), evidence.onReading,null);
      continue;
    }
    const handler = getToolHandler(check);
    let output: string, reading: CheckReading | undefined, elapsedMs: number | null = null;
    try {
      if (handler) {
        const measured = await evidence.measure(async () => {
          const output = await runRefusingModelCalls({ ...ids, tool: check }, () => handler(CHECK_INPUT[check](text, Number(childCtx.projectId)), childCtx));
          return {output,reading:CHECK_READER[check](output)};
        });
        ({ output,reading } = measured.value); elapsedMs = measured.elapsedMs;
      } else output = JSON.stringify({ error: `${check} is not registered.` });
    } catch (err) {
      output = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
    outputs.push({ check, output });
    addCheckReading(readings, reading ?? CHECK_READER[check](output), evidence.onReading,elapsedMs);
  }
  if (evidence.sourceSpans?.length) {
    const handler = offered.has('read_vault_document') ? getToolHandler('read_vault_document') : undefined;
    const { value:result,elapsedMs } = await evidence.measure(() => runSourceSpanChecks(text,evidence.sourceSpans ?? [],childCtx,{ ids,steps:evidence.steps,handler }));
    addCheckReading(readings, result.reading, evidence.onReading,elapsedMs);
    outputs.push(result.output);
  }
  return { readings, outputs };
}
function addCheckReading(readings: CheckReading[], reading: CheckReading, notify: (reading: CheckReading, elapsedMs: number | null) => void,elapsedMs:number|null): void {
  readings.push(reading); notify(reading,elapsedMs);
}

/** Read each referenced source through the same scoped, read-only tool boundary as the child. */
async function runSourceSpanChecks(
  text: string,
  sourceSpans: readonly AgentSourceSpan[],
  childCtx: ToolContext,
  scope: { ids: { runId: string; parentRunId: string }; steps: AgentStep[];
    handler: ((input:Record<string,unknown>,ctx?:ToolContext)=>Promise<string>) | undefined },
) {
  const { ids, steps,handler } = scope;
  const sources = new Map<string, Record<string, unknown> | null>();
  for (const span of sourceSpans) {
    if (sources.has(span.artifact_id)) continue;
    const input = { artifact_id: span.artifact_id, max_chars: Math.max(...sourceSpans.filter(s => s.artifact_id === span.artifact_id).map(s => s.source_end)) };
    let output = JSON.stringify({ error: 'The source read is not available in this conversation.' });
    if (handler) {
      try {
        output = await runRefusingModelCalls({ ...ids, tool: 'read_vault_document' }, () => handler(input, childCtx));
      } catch {
        output = JSON.stringify({ error: 'The source could not be read.' });
      }
    }
    // This is a server-run read, kept in the same recorded run trace as child reads.
    steps.push({ round: 0, tool: 'read_vault_document', input, result: output, ok: refusalOf(output) === null });
    try {
      const result: unknown = JSON.parse(output);
      sources.set(span.artifact_id, refusalOf(output) === null && result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : null);
    } catch { sources.set(span.artifact_id, null); }
  }
  const evidence = sourceSpans.map(span => {
    const source = sources.get(span.artifact_id);
    const content = source?.ok === true && typeof source.content === 'string' ? source.content : null;
    const available = content !== null && span.source_end <= content.length;
    const match = available && content.slice(span.source_start, span.source_end) === text.slice(span.draft_start, span.draft_end);
    return {
      ...span,
      outcome: !available ? 'not_assessed' as const : match ? 'pass' as const : 'fail' as const,
      sourceReadHash: content === null ? null : createHash('sha256').update(content).digest('hex'),
      quoteHash: createHash('sha256').update(text.slice(span.draft_start, span.draft_end)).digest('hex'),
    };
  });
  const failed = evidence.filter(e => e.outcome === 'fail').length;
  const unavailable = evidence.filter(e => e.outcome === 'not_assessed').length;
  const matched = evidence.length - failed - unavailable;
  const reading: CheckReading = {
    check: 'source_spans',
    outcome: failed ? 'fail' : unavailable ? 'error' : 'pass',
    statement: `Stored source spans: ${matched} exact matches, ${failed} mismatches, ${unavailable} unreadable or out-of-range references. This checks only the specified quotations, not semantic support.`,
  };
  return { reading, output: { check: 'source_spans' as const, output: JSON.stringify({ evidence }) } };
}

interface SourceClaimCheck {
  reading: CheckReading;
  output: { check: 'source_claims'; output: string };
  tiers: readonly (0 | 1 | 2 | 3)[];
  assertCurrent(): Promise<void>;
}
/** No supplied source prose or classification reaches this issuer. The existing
 * Vault loader binds current actor/project, exact version UUID and extraction. */
async function runSourceClaimChecks(run: AgentRun, ctx: ToolContext, offered: ReadonlySet<string>, sourceTools: typeof import('./draft-project-sources.js')): Promise<SourceClaimCheck> {
  const unavailable: SourceClaimCheck = { reading: { check: 'source_claims', outcome: 'error',
    statement: 'Stored-source clinical figures: current project source access could not be established. Claims remain unverified.' },
  output: { check: 'source_claims', output: JSON.stringify({ method: SOURCE_CLAIM_METHOD, qualification: 'unverified', reason: 'SOURCE_UNAVAILABLE' }) },
  tiers: [3], assertCurrent: async () => {} };
  if (!offered.has('read_project_document')) return unavailable;
  try {
    const { loadDraftProjectSources, assertDraftSourceContextCurrent, draftSourceSensitivityTiers } = sourceTools;
    const context: DraftSourceContext = await runRefusingModelCalls({ runId: run.runId, parentRunId: run.host.parentRunId, tool: 'read_project_document' },
      () => loadDraftProjectSources(run.brief.sourceDocumentIds, { ...ctx, signal: run.signal }, run.brief.textToCheck));
    const result = compareStoredSourceClaims(run.brief.textToCheck!, context.sources);
    const assertCurrent = () => assertDraftSourceContextCurrent(context, { organizationId: ctx.organizationId ?? undefined, userId: ctx.userId ?? undefined,
      projectId: ctx.projectRef ?? ctx.projectId ?? undefined }, run.signal);
    await assertCurrent();
    return { reading: result.reading, output: { check: 'source_claims', output: JSON.stringify({ ...result.output,
      draftSha256: createHash('sha256').update(run.brief.textToCheck!).digest('hex'), organizationId: ctx.organizationId,
      userId: ctx.userId, projectId: ctx.projectId ?? null, projectRef: ctx.projectRef ?? null, sourceCurrentAtCheck: true }) },
    tiers: draftSourceSensitivityTiers(context) ?? [3], assertCurrent };
  } catch (error) {
    if (run.signal.aborted) throw error;
    return unavailable;
  }
}

async function recheckSourceClaims(source: SourceClaimCheck | null, signal: AbortSignal): Promise<void> {
  if (!source) return;
  try { await source.assertCurrent(); }
  catch (error) {
    if (signal.aborted) throw error;
    source.reading.outcome = 'error';
    source.reading.statement = 'Stored-source clinical figures: source authority changed before release. The recorded comparisons are historical; current support is unverified.';
    source.output.output = JSON.stringify({ ...JSON.parse(source.output.output), sourceCurrentAtRelease: false, qualification: 'unverified' });
  }
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

/** Attach only an unambiguous server correlation; payload fields confer none. */
function recordStagedResults(steps: AgentStep[], entries: readonly Readonly<ToolResultEntry>[], round: number): void {
  for (const entry of entries) {
    const id = entry.tool_use_id;
    if (!id.trim() || entries.filter(other => other.tool_use_id === id).length !== 1) continue;
    const matching = steps.filter(step => step.round === round && step.toolUseId === id);
    if (matching.length === 1 && matching[0].tool === entry.name) matching[0].modelContent = entry.content;
  }
}

/** Run the child loop. The caller turns its outcome into the result. */
async function runChildLoop(run: AgentRun, childCtx: ToolContext, readings: CheckReading[], source: SourceClaimCheck | null) {
  const { host: h, runId } = run;
  const tools = childToolsFrom(h.governedTools);
  if (run.coordination) {
    const { CHILD_COORDINATION_TOOL } = await import('./agentic-workflow-tools.js');
    tools.push(CHILD_COORDINATION_TOOL);
  }
  const pin = await childPin(), recordModel = await modelRecorder();
  const request: GatewayRequest = bindOwnerPrivateModelChildRequest({
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
    onOwnerPrivateCapture: h.onOwnerPrivateCapture,
    // The brief is written from the conversation, so it carries the conversation's
    // default tier (model-call-scope.ts); loaded sources raise its floor, and
    // neither fields nor model prose lower it.
    inputSensitivityTiers: Object.freeze([CONVERSATION_DEFAULT_TIER, ...(source?.tiers ?? [])]),
    ...(source ? { beforeDispatch: source.assertCurrent } : {}),
  });
  const { executeAgenticLoop, servedModelOf } = await import('./AnaToolExecutor.js');
  const { runWithRunScope } = await import('../ai-gateway/run-scope.js');
  /* The child's own run, named as the parent's child. A tool's gateway calls
     carry no run id of their own (an embedding is one), so the gateway reads
     the ambient scope: without this the child's embeddings were ledgered as
     the PARENT's, with no parent link, and the cost read by parent_run_id
     that ADR-0015 §2 requires before production would have missed them. */
  return runWithRunScope({ runId, parentRunId: h.parentRunId }, () => executeAgenticLoop(request, {
    maxRounds: CHILD_MAX_ROUNDS,
    progressExtension: 0,
    toolContext: childCtx,
    signal: run.signal,
    allowedToolNames: new Set(tools.map(t => t.name)),
    toolConcurrency: CHILD_TOOL_CONCURRENCY,
    toolModelCalls: 'refuse',
    stopWhen: childStopWhen(run),
    checkpoint: async () => ((await holdFor(run)) ? 'continue' : 'abort'),
    modelContext: () => agentModelContext(run),
    onToolEvent: (e: AgenticToolEvent) => {
      /* A handler that cannot do the thing RETURNS `{error}`; it does not
         throw, and the dispatch sets `errorMessage` only for a throw, a tool
         that was not offered, or lost input. Judging a step by that alone
         recorded a failed read as a good one, and the stream then offered it
         as evidence the answer had been checked against. `refusalOf` is the
         one judgment of a refusal, and the parent's own path uses it. */
      const ok = !e.errorMessage && refusalOf(e.result ?? '') === null;
      if (e.phase === 'end') run.steps.push({ round: e.round, tool: e.call.name, toolUseId: e.call.id, input: e.call.input, result: e.result ?? '', ok });
      if (e.phase === 'end' && ok && run.brief.role === 'research') run.measured.completed++;
      queueAgentProgress(run, 'started');
      run.emit({ phase: 'step', runId, step: e.phase, tool: e.call.name, round: e.round, ...(e.phase === 'end' ? { ok } : {}) });
    },
    onToolResultsForModel: (entries, round) => recordStagedResults(run.steps, entries, round),
    onModelResponse: response => {
      childCtx.servingModel = servedModelOf(response); run.usage.modelCalls += 1;
      run.usage.inputTokens += response.usage?.inputTokens ?? 0;
      run.usage.outputTokens += response.usage?.outputTokens ?? 0;
      run.models.push(recordModel(response));
    },
  }));
}

async function prepareAgentChecks(run: AgentRun, childCtx: ToolContext) {
  const offered = new Set(run.host.governedTools.map(t => t.name));
  if (run.brief.textToCheck !== undefined) {
    run.measured.total = HARNESS_CHECKS.length + Number(Boolean(run.brief.sourceSpans?.length)) + Number(Boolean(run.brief.sourceDocumentIds?.length));
    queueAgentProgress(run, 'checking');
  }
  const onReading = (reading: CheckReading,elapsedMs:number|null) => recordMeasuredAgentCheck(run,reading,elapsedMs);
  const checks =
    run.brief.textToCheck !== undefined
      ? await runHarnessChecks(run.brief.textToCheck, childCtx, offered, { runId: run.runId, parentRunId: run.host.parentRunId },
        { sourceSpans: run.brief.sourceSpans, steps: run.steps, onReading,measure: check => executeMeasuredAgentCheck(run,check) })
      : null;
  const sourceTools = run.brief.sourceDocumentIds ? await import('./draft-project-sources.js') : null;
  const measuredSource = sourceTools ? await executeMeasuredAgentCheck(run,() => runSourceClaimChecks(run,childCtx,offered,sourceTools)) : null;
  const source = measuredSource?.value ?? null;
  if (source && checks) { checks.readings.push(source.reading); checks.outputs.push(source.output); onReading(source.reading,measuredSource?.elapsedMs ?? null); }
  await flushAgentProgress(run);
  return { checks, source };
}
async function runAdvisory(run: AgentRun, childCtx: ToolContext, prepared: Awaited<ReturnType<typeof prepareAgentChecks>>) {
  try {
    queueAgentProgress(run,'started'); await flushAgentProgress(run);
    return { response: await runChildLoop(run, childCtx, prepared.checks?.readings ?? [], prepared.source), advisoryFailure: undefined };
  }
  catch (error) {
    if (run.signal.aborted || !prepared.checks) throw error;
    return { response: null, advisoryFailure: classifyAgentFailure(error, run.usage.modelCalls) };
  }
}
/** Wait out a pause, run independent checks, then retain them if advice cannot run. */
async function driveAgent(run: AgentRun): Promise<string> {
  if (!(await holdFor(run))) return stoppedResult(run);
  const childCtx = childContext(run.ctx, run.signal);
  if (run.coordination) {
    const { bindWorkerCoordination } = await import('./agentic-workflow-tools.js');
    bindWorkerCoordination(childCtx, run.coordination.host, run.coordination.handle);
  }
  const prepared = await prepareAgentChecks(run, childCtx), { checks, source } = prepared;
  const { response, advisoryFailure } = await runAdvisory(run, childCtx, prepared);
  await recheckSourceClaims(source, run.signal);
  const verdict = checks ? aggregateVerdict(checks.readings) : null;

  const reason = response?.loop.stoppedReason ?? 'advisory_unavailable';
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
    runId, brief, status, stoppedReason: reason, budget, heldExpired, steps, models, usage,
    reportText: response?.content ?? '',
    advisoryFailure,
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
  const run = beginAgentRun(start.brief, start.host, ctx, createActiveTimer(() => start.host.heldMs(), CHILD_ACTIVE_MS));
  try {
    let result: string;
    try { await startAgentCoordination(run); result = await driveAgent(run); }
    catch (err) {
      // A Stop, an expired hold or the active-time budget aborted a call in flight.
      result = run.signal.aborted ? stoppedResult(run) : agentFailure(run.runId, run.brief, classifyAgentFailure(err, run.usage.modelCalls), run.models, run.steps);
    }
    try { await recordAgentReport(run, result); }
    catch { return agentFailure(run.runId, run.brief, { code: 'RUN_COORDINATION_UNAVAILABLE', message: 'The work could not be durably recorded. Its report was held.', started: run.usage.modelCalls > 0 }, run.models, run.steps); }
    return result;
  } finally {
    run.timer.clear(); slot.release();
    run.emit(run.finished);
  }
}
