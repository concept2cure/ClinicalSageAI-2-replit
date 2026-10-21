/**
 * What the SSE stream needs to host sub-agents, kept pure (row 74, S5c):
 * whether a turn may host them, what of a finished agent is evidence for
 * checking AnA's answer, and the provenance its tools reported.
 *
 * @module server/services/ana/sub-agent-stream
 */

import { newGenerationCapture } from '../ai-gateway/generation-capture.js';
import { budgetToolResultsForModel, type ToolResultEntry } from './agentic-loop.js';
import { toolEvidence, type EvidenceEntry } from './answer-grounding.js';
import type { AgentStep } from './sub-agent-shape.js';

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
