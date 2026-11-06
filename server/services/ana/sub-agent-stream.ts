/**
 * What the SSE stream needs to host sub-agents, (row 74, S5c):
 * whether a turn may host them, what of a finished agent is evidence for
 * checking AnA's answer, and the provenance its tools reported.
 *
 * @module server/services/ana/sub-agent-stream
 */

import { createHash, randomUUID } from 'node:crypto';
import { notifyObserver } from './agentic-tool-dispatch.js';
import { captureCurrentRunSourceGate } from '../ai-gateway/model-call-scope.js';
import { workerLabel, type WorkerPhase } from '@shared/ana/turn-timeline';
import type { createActiveTimer, SubAgentHost } from './sub-agent.js';
import type { AgentBrief } from './sub-agent-limits.js';
import type { ToolContext } from './AnaToolExecutor.js';
import type { RunCoordinationHost, WorkerCoordinationHandle } from './run-events.js';
import type { RunHoldOutcome } from './run-hold.js';
import type { AgentBudget, AgentModelRecord } from './sub-agent-shape.js';
import type { AgentEventFrame } from './sub-agent.js';
import { recordedTeamContext } from './sub-agent-shape.js';
import { newGenerationCapture } from '../ai-gateway/generation-capture.js';
import { budgetToolResultsForModel, type ToolResultEntry } from './agentic-loop.js';
import { toolEvidence, type EvidenceEntry } from './answer-grounding.js';
import type { AgentStep } from './sub-agent-shape.js';

/** Private model-derived frames wait for encrypted chat/record/audit commit.
 * Monitoring stays live; hiding the client team view never affects this gate. */
export function ownerPrivateStreamBuffer(write: (frame: string) => boolean, isPrivate: () => boolean) {
  const frames: string[] = []; let chars = 0, overflow = false, released = false;
  const send = (frame: string): boolean => {
    if (!isPrivate() || released || operationalFrame(frame)) return write(frame);
    if (privateFailureFrame(frame)) return write(privateFailureNotice(frame));
    chars += frame.length;
    if (chars > 2_000_000) { overflow = true; frames.length = 0; return true; }
    if (!overflow) frames.push(frame);
    return true;
  };
  return { write: send, release: () => {
    if (overflow) throw new Error('PRIVATE_OUTPUT_BUFFER_LIMIT');
    released = true; for (const frame of frames.splice(0)) write(frame);
  } };
}
function privateFailureFrame(frame: string): boolean {
  try { return JSON.parse(frame.replace(/^data:\s*/, '')).type === 'error'; } catch { return false; }
}
function privateFailureNotice(frame: string): string {
  const heldTool = JSON.parse(frame.replace(/^data:\s*/, '')).code === 'OWNER_PRIVATE_TOOL_HELD';
  return `data: ${JSON.stringify({ type: 'error', code: heldTool ? 'OWNER_PRIVATE_TOOL_HELD' : 'OWNER_PRIVATE_OUTPUT_HELD',
    error: heldTool ? 'This private action is held until its encrypted approval and delivery path is qualified. Use the protected conversation or the existing controlled workflow.'
      : 'The private response was withheld because protected capture could not be confirmed.' })}\n\n`;
}
function operationalFrame(frame: string): boolean {
  if (frame.startsWith(':')) return true;
  try {
    const event = JSON.parse(frame.replace(/^data:\s*/, '')) as { type?: string; event?: { kind?: string } };
    return ['run_started', 'paused', 'resumed', 'hold_expired'].includes(event.type ?? '') ||
      event.type === 'timeline' && event.event?.kind === 'worker';
  } catch { return false; }
}

/**
 * A turn may host agents only with a run row (the person's pause and Stop, and
 * the ledger's parent link, all hang off it) whose organization is the
 * request's (brief D13). A child's ledger rows carry the request's
 * organization, so they can never name another organization's run as their
 * parent. Compared as strings: the run's resolver and the request's do not
 * agree on a type.
 */
export function subAgentsHostable(turn: {
  runId: string | undefined | null;
  runOrgId: number | string | null | undefined;
  orgId: number | string | null | undefined;
}): boolean {
  return Boolean(turn.runId) && turn.runOrgId != null && turn.orgId != null && String(turn.runOrgId) === String(turn.orgId);
}

function stepsOf(fullResult: string): AgentStep[] {
  try {
    const r: unknown = JSON.parse(fullResult);
    const steps = (r as { trace?: { steps?: unknown } } | null)?.trace?.steps;
    return Array.isArray(steps) ? (steps as AgentStep[]) : [];
  } catch {
    return [];
  }
}

type ChildEvidence = { tool: string; input: Record<string, unknown>; content: string };

function stagedEvidence(steps: AgentStep[]): ChildEvidence[] {
  return steps.flatMap(step => {
    const id = step.toolUseId;
    const content = step.modelContent;
    if (!step.ok || typeof id !== 'string' || !id.trim() || typeof content !== 'string' ||
        steps.filter(other => other.toolUseId === id).length !== 1) return [];
    return [{ tool: step.tool, input: step.input ?? {}, content }];
  });
}

function roundEvidence(steps: AgentStep[]): ChildEvidence[] {
  if (steps.some(step => Object.hasOwn(step, 'toolUseId') || Object.hasOwn(step, 'modelContent'))) return stagedEvidence(steps);
  // Historical passage slicing/completion order and private read placement
  // cannot be recovered by replaying today's policy. Keep the raw record only.
  if (steps.some(step => step.tool === 'search_document_passages' || step.tool === 'read_project_document')) return [];
  const entries: ToolResultEntry[] = steps.map((s, i) => ({ tool_use_id: String(i), name: s.tool, content: s.result }));
  const seen = budgetToolResultsForModel(entries);
  return steps.flatMap((s, i) => s.ok ? [{ tool: s.tool, input: s.input ?? {}, content: seen[i].content }] : []);
}

/**
 * The evidence a finished agent adds for checking AnA's answer: successful
 * tool bodies exactly as its host staged them (brief D19), not provider proof.
 *
 * New traces retain actual staging after private read guards and budgets.
 * Missing/ambiguous new fields never fall back to fuller raw output. Only
 * ordinary fully legacy rounds retain replay over ALL calls before filtering
 * successes; historical passage/read rounds cannot establish exact staging.
 *
 * Never the child's report, the checks' outputs (which echo the parent's own
 * `text_to_check`), its notes or its instructions: a PMID the child invented,
 * or one already in the parent's draft, must not ground the parent's answer.
 *
 * **Declared departure from the corpus contract** (`budgetToolResultsForModel`
 * says the corpus holds exactly what the model saw): for an agent step it
 * holds child-host-staged evidence which the parent never saw directly.
 * Neither that staging nor legacy replay attests provider receipt. The child's
 * own report still cannot supply evidence for the figures it reports.
 */
export function runAgentEvidenceForGrounding(
  fullResult: string,
): Array<{ tool: string; input: Record<string, unknown>; content: string }> {
  const byRound = new Map<number, AgentStep[]>();
  for (const s of stepsOf(fullResult)) {
    const round = byRound.get(s.round) ?? [];
    round.push(s);
    byRound.set(s.round, round);
  }
  const out: Array<{ tool: string; input: Record<string, unknown>; content: string }> = [];
  for (const steps of byRound.values()) out.push(...roundEvidence(steps));
  return out;
}

/**
 * The corpus entries a finished agent adds: one per successful child step, as
 * its host staged it. A child's tools run where no model may be called, so
 * nothing in them was model-written — an empty capture says exactly that.
 */
export function agentEvidenceEntries(fullResult: string): EvidenceEntry[] {
  return runAgentEvidenceForGrounding(fullResult)
    .map(step =>
      toolEvidence(step.tool, { status: 'success', input: step.input, content: step.content, generated: newGenerationCapture() }),
    )
    .filter((e): e is EvidenceEntry => e !== null);
}

/** The provenance records an agent's successful tools returned, for the turn's lineage trail. */
export function agentProvenance(fullResult: string): unknown[] {
  const out: unknown[] = [];
  for (const s of stepsOf(fullResult)) {
    if (!s.ok) continue;
    try {
      const p = (JSON.parse(s.result) as { provenance?: unknown } | null)?.provenance;
      if (Array.isArray(p)) out.push(...p.filter(x => x && typeof x === 'object'));
    } catch {
      // A result that is not JSON carries no provenance.
    }
  }
  return out;
}

/** Receipt-backed lifecycle operations delegate to the current admitted run host. */
export async function startAgentCoordination(run: AgentRun): Promise<void> {
  if (run.host.coordination) {
    if (!run.host.parentStep) throw new Error('COORDINATION_SCOPE_UNAVAILABLE');
    const host = await run.host.coordination();
    const source = captureCurrentRunSourceGate({ organizationId: run.ctx.organizationId, userId: run.ctx.userId,
      projectId: run.ctx.projectId ?? run.ctx.projectRef });
    const assigned = await host.assign({ intentId: `assign:${run.host.parentStep}`, worker: run.host.worker, role: run.brief.role,
      task: run.host.task ?? null, parentStep: run.host.parentStep, model: run.host.parentModel,
      ...(source ? { source: { recheck: source.recheck, tiers: source.tiers } } : {}) });
    run.coordination = { host, handle: assigned.handle };
  }
  run.emit({ phase: 'started', runId: run.runId, role: run.brief.role, objective: workerLabel(run.brief.role) });
  queueAgentProgress(run, 'started'); await flushAgentProgress(run);
}
export function queueAgentProgress(run: AgentRun, phase: WorkerPhase): void {
  const coordinator = run.coordination; if (!coordinator) return;
  const intentId = `progress:${run.host.parentStep}:${++run.operation}`, measured = { ...run.measured };
  run.ledger = run.ledger.then(async () => { await coordinator.host.progress(coordinator.handle, phase,
    { intentId, completed: measured.completed, total: measured.total, basisKind: measured.basis, model: run.models.at(-1) }); }).catch(() => { run.ledgerFailed = true; });
}
export async function flushAgentProgress(run: AgentRun): Promise<void> {
  await run.ledger; if (run.ledgerFailed) throw new Error('COORDINATION_UNAVAILABLE');
}
export async function agentModelContext(run: AgentRun) {
  const coordinator = run.coordination; if (!coordinator) return null;
  await flushAgentProgress(run);
  const board = await coordinator.host.snapshot(coordinator.handle);
  return { text: recordedTeamContext(board), modelContexts: await coordinator.host.modelContexts(coordinator.handle), assertCurrent: async () => {
    await flushAgentProgress(run); await coordinator.host.snapshot(coordinator.handle);
  } };
}
export async function recordAgentReport(run: AgentRun, result: string): Promise<void> {
  const coordinator = run.coordination; if (!coordinator) return;
  // A cancelled source checkpoint may have refused queued progress. The final
  // content-free stop receipt still has to reach the durable ledger.
  const outcome = run.finished.phase === 'finished' ? run.finished.status : 'failed';
  await run.ledger;
  if (outcome !== 'cancelled' && outcome !== 'failed') await flushAgentProgress(run);
  const source = captureCurrentRunSourceGate({ organizationId: run.ctx.organizationId, userId: run.ctx.userId,
    projectId: run.ctx.projectId ?? run.ctx.projectRef });
  await coordinator.host.report(coordinator.handle, { intentId: `report:${run.host.parentStep}`,
    reportSha256: createHash('sha256').update(result).digest('hex'), model: run.models.at(-1),
    outcome,
    completed: run.measured.completed, total: run.measured.total, basisKind: run.measured.basis,
    ...(source ? { source: { recheck: source.recheck, tiers: source.tiers } } : {}) });
}


/** One agent's state while it runs. */
export interface AgentRun {
  runId: string; brief: AgentBrief; host: SubAgentHost; ctx: ToolContext;
  timer: ReturnType<typeof createActiveTimer>;
  signal: AbortSignal;
  steps: AgentStep[]; models: AgentModelRecord[];
  usage: { inputTokens: number; outputTokens: number; modelCalls: number };
  budget: AgentBudget | null;
  /** What the run hold last answered when it was not 'running': the person's own outcome. */
  heldOutcome: RunHoldOutcome | null;
  finished: AgentEventFrame;
  emit(frame: AgentEventFrame): void;
  coordination: { host: RunCoordinationHost; handle: WorkerCoordinationHandle } | null;
  ledger: Promise<void>;
  ledgerFailed: boolean;
  operation: number;
  measured: { completed: number; total: number | null; basis: 'deterministic_checks' | 'observed_steps' };
}

export function beginAgentRun(brief: AgentBrief, host: SubAgentHost, ctx: ToolContext, timer: AgentRun['timer']): AgentRun {
  const runId = `agent_${randomUUID()}`;
  const run: AgentRun = {
    runId, brief, host, ctx,
    timer,
    signal: AbortSignal.any([timer.signal, host.expiredSignal, ...(ctx.signal ? [ctx.signal] : [])]),
    steps: [], models: [],
    usage: { inputTokens: 0, outputTokens: 0, modelCalls: 0 },
    budget: null,
    heldOutcome: null,
    finished: { phase: 'finished', runId, status: 'failed' },
    coordination: null, ledger: Promise.resolve(), ledgerFailed: false, operation: 0,
    measured: { completed: 0, total: null, basis: brief.role === 'verify' ? 'deterministic_checks' : 'observed_steps' },
    emit: frame => notifyObserver('agent emit', () => host.emit(frame)),
  };
  return run;
}
