/**
 * What a sub-agent may use and how many may run (row 74, S5; ADR-0015 §2, §5):
 * the kill switch, the research toolset, the brief's validation, and the
 * turn, round, organization and process caps.
 *
 * Pure apart from the module-level live counters, which are the per-process
 * caps. Kept apart from the runner (sub-agent.ts) so each rule has one home
 * and its own test.
 *
 * @module server/services/ana/sub-agent-limits
 */

import {
  AGENT_INSTRUCTIONS_MAX,
  AGENT_OBJECTIVE_MAX,
  AGENT_TEXT_TO_CHECK_MAX,
  MAX_AGENTS_PER_ROUND,
  MAX_AGENTS_PER_TURN,
  MAX_LIVE_AGENTS_PER_ORG,
  MAX_LIVE_AGENTS_PER_PROCESS,
} from '@shared/ana/run-control-limits';
import { isProductionEnv } from '../ai-gateway/pii-screen.js';
import type { AnaTool } from '../ai-gateway/types.js';

/**
 * ADR-0015 §2: on outside production, off in production until the S7 capture
 * is filed. Production enablement is setting ANA_ENABLE_SUB_AGENTS=true; 'false'
 * turns it off anywhere.
 */
export function subAgentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const set = (env.ANA_ENABLE_SUB_AGENTS ?? '').trim().toLowerCase();
  if (set === 'true') return true;
  if (set === 'false') return false;
  return !isProductionEnv(env);
}

/**
 * The tools a sub-agent may be offered, intersected with what the parent was
 * offered this turn — never more. Every one reads; none can call a generative
 * model (dated 2026-10-05). Searches embed the query, and the four public
 * searches send it to PubMed, ClinicalTrials.gov and openFDA.
 *
 * Listed by name, not derived from the register's `read` class: several
 * `read` tools call a model (explain_validation_findings, plan_submission,
 * dispatch_qc_check) or read a file path
 * (rasterize_page, pdf_overlay, validate_docx …), and a derived set would
 * offer them the day they are registered.
 */
export const RESEARCH_TOOLS = [
  'project_knowledge_search',
  'search_document_passages',
  'search_project_documents',
  'list_project_documents',
  'list_vault_documents',
  'read_vault_document',
  'get_document_versions',
  'list_governed_documents',
  'read_governed_document',
  'compare_vault_versions',
  'lookup_ich_guideline',
  'check_regulatory_currency',
  'check_guidance_freshness',
  'search_literature',
  'search_clinical_evidence',
  'search_drug_adverse_events',
  'search_device_adverse_events',
] as const;

const RESEARCH: ReadonlySet<string> = new Set(RESEARCH_TOOLS);

/** The child's tools: RESEARCH_TOOLS ∩ the parent's governed set, in the parent's order. */
export function childToolsFrom(governed: readonly AnaTool[]): AnaTool[] {
  return governed.filter(t => RESEARCH.has(t.name));
}

export type AgentRole = 'research' | 'verify';

export interface AgentBrief {
  role: AgentRole;
  objective: string;
  instructions: string;
  /** verify only: the exact text the checks run on. */
  textToCheck?: string;
}

/** A refusal the runner returns instead of starting an agent. House shape. */
export interface AgentRefusal {
  error: string;
  message: string;
}

const refusal = (error: string, message: string): AgentRefusal => ({ error, message });

/** The brief, validated: over-long input is refused, never truncated. */
export function parseAgentBrief(input: Record<string, unknown>): AgentBrief | AgentRefusal {
  const invalid = (why: string) => refusal('INVALID_AGENT_BRIEF', `${why} No agent was started.`);
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const role = input.role === 'verify' ? 'verify' : input.role === 'research' ? 'research' : null;
  if (!role) return invalid("role must be 'research' or 'verify'.");
  const objective = text(input.objective);
  const instructions = text(input.instructions);
  if (!objective) return invalid('objective is required.');
  if (objective.length > AGENT_OBJECTIVE_MAX) return invalid(`objective is over ${AGENT_OBJECTIVE_MAX} characters.`);
  if (!instructions) return invalid('instructions are required.');
  if (instructions.length > AGENT_INSTRUCTIONS_MAX) {
    return invalid(`instructions are over ${AGENT_INSTRUCTIONS_MAX} characters.`);
  }
  if (role === 'research') return { role, objective, instructions };
  // Checked as given: trimmed only to decide it is empty.
  const raw = typeof input.text_to_check === 'string' ? input.text_to_check : '';
  if (!raw.trim()) return invalid('a verify agent needs the exact text to check in text_to_check.');
  if (raw.length > AGENT_TEXT_TO_CHECK_MAX) {
    return invalid(`text_to_check is over ${AGENT_TEXT_TO_CHECK_MAX} characters.`);
  }
  return { role, objective, instructions, textToCheck: raw };
}

/** One parent turn's agent counts. The stream holds one per turn. */
export interface AgentTurnCounters {
  started: number;
  byRound: Map<number, number>;
}

export function newAgentTurnCounters(): AgentTurnCounters {
  return { started: 0, byRound: new Map() };
}

/* Per server process: they bound what one process does, not the fleet (ADR-0015 §5). */
const liveByOrg = new Map<number, number>();
let liveTotal = 0;

/** The live counts, for tests and the evidence. */
export function liveAgentCounts(): { total: number; byOrg: ReadonlyMap<number, number> } {
  return { total: liveTotal, byOrg: new Map(liveByOrg) };
}

/**
 * Take a slot for one agent, or say why not. Synchronous check-then-increment
 * with no await between, so two calls in the same round cannot both take the
 * last slot. A refusal changes no count, so a retry later in the turn can
 * start. The returned release must run exactly once (the runner's finally).
 */
export function claimAgentSlot(
  counters: AgentTurnCounters,
  round: number,
  organizationId: number,
): { release: () => void } | AgentRefusal {
  if (counters.started >= MAX_AGENTS_PER_TURN) {
    return refusal('AGENT_LIMIT_REACHED', `This turn has started its ${MAX_AGENTS_PER_TURN} agents. No agent was started.`);
  }
  const inRound = counters.byRound.get(round) ?? 0;
  if (inRound >= MAX_AGENTS_PER_ROUND) {
    return refusal(
      'AGENT_ROUND_LIMIT',
      `${MAX_AGENTS_PER_ROUND} agents already run in this step. No agent was started; start it in a later step.`,
    );
  }
  const orgLive = liveByOrg.get(organizationId) ?? 0;
  if (orgLive >= MAX_LIVE_AGENTS_PER_ORG || liveTotal >= MAX_LIVE_AGENTS_PER_PROCESS) {
    return refusal('AGENTS_BUSY', 'Too many agents are running right now. No agent was started; try again shortly.');
  }
  counters.started += 1;
  counters.byRound.set(round, inRound + 1);
  liveByOrg.set(organizationId, orgLive + 1);
  liveTotal += 1;
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      const held = liveByOrg.get(organizationId);
      const left = held === undefined ? 0 : held - 1;
      if (left > 0) liveByOrg.set(organizationId, left);
      else liveByOrg.delete(organizationId);
      liveTotal = Math.max(0, liveTotal - 1);
    },
  };
}
