/**
 * Change-propagation tools — expose the Living Record Spine's governed
 * value-change engine (server/services/living-record/*) and the resolution
 * layer's plan explainer to AnA as first-class, selectable tools.
 *
 * This is the conversational surface of "Inconsistency Intelligence": with
 * these, AnA can answer "what happens if the sample size changes to 120?"
 * (preview the blast radius across every citation), drive the governed fix
 * (apply the change → flag divergent citations → cascade → open a resolution
 * plan), trace any governed value back to its establishing source, and explain
 * the resulting resolution plan. Before these tools, none of that engine was
 * reachable from chat.
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dynamic-import
 * the living-record / resolution services. Governed mutation (apply_fact_change)
 * requires an explicit reason-for-change, mirroring the REST contract.
 *
 * @module server/services/ana/changePropagationTools
 */

import type { AnaTool } from '../ai-gateway/types';

const GROUNDED_NOTE =
  'DETERMINISTIC: report the returned values, counts, and citations verbatim — do not recompute or estimate. These come straight from the governed fact store.';

export const LIST_GOVERNED_FACTS: AnaTool = {
  name: 'list_governed_facts',
  description:
    "List the program's canonical facts — the single agreed value per (entity, field), e.g. the enrolled sample size, a dose, a NOAEL, an endpoint definition. Use this FIRST to find the factId and current value before previewing or applying a change, or to answer 'what is the governed value of X?'. " +
    GROUNDED_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      programId: {
        type: 'string',
        description: 'The regulatory program UUID whose governed facts to list.',
      },
    },
    required: ['programId'],
  },
};

export const PREVIEW_FACT_IMPACT: AnaTool = {
  name: 'preview_fact_impact',
  description:
    "Preview the blast radius of changing a governed value BEFORE committing it — this is the answer to 'what happens if we change the sample size to 120?'. Read-only. Given a factId and a proposed new value, it classifies every citation of that value across all documents and claims: which will drift, which already agree, which are manual overrides (left untouched), and which are derived and not mechanically evaluable. Returns a summary (how many citations diverge, the highest severity, whether re-approval would be required) and the per-citation detail. Get the factId from list_governed_facts. " +
    GROUNDED_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      factId: { type: 'string', description: 'UUID of the canonical fact to test a change against.' },
      valueNum: { type: 'number', description: 'Proposed new numeric value (use for counts/measures/dates).' },
      valueText: { type: 'string', description: 'Proposed new text value (use for categorical/text facts). Provide valueNum OR valueText, not both.' },
      unit: { type: 'string', description: 'Optional new unit (e.g. mg, months, subjects).' },
      tolerance: { type: 'number', description: 'Optional relative tolerance for measure comparisons (default exact).' },
    },
    required: ['factId'],
  },
};

export const APPLY_FACT_CHANGE: AnaTool = {
  name: 'apply_fact_change',
  description:
    "Apply a GOVERNED change to a canonical value and propagate it — the mutation behind 'change the sample size to 120 and update everything that cites it'. Re-versions the fact (full history kept), flags every now-divergent citation immediately, cascades the change to downstream artifacts, and OPENS A RESOLUTION PLAN listing every affected object so the update travels through review/re-approval rather than as silent edits. Requires an explicit reason-for-change (recorded on the audit trail). ALWAYS run preview_fact_impact first and confirm the blast radius with the user before calling this. Returns the new fact version, the impact summary, and the resolution plan id (or why a plan was not opened). " +
    GROUNDED_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      factId: { type: 'string', description: 'UUID of the canonical fact to change.' },
      valueNum: { type: 'number', description: 'New numeric value (counts/measures/dates).' },
      valueText: { type: 'string', description: 'New text value (categorical/text). Provide valueNum OR valueText.' },
      unit: { type: 'string', description: 'Optional new unit.' },
      reason: {
        type: 'string',
        description: 'Reason for change — REQUIRED. Recorded on the audit trail and the resolution plan. Ask the user for it if not supplied.',
      },
      tolerance: { type: 'number', description: 'Optional relative tolerance for measure comparisons.' },
    },
    required: ['factId', 'reason'],
  },
};

export const TRACE_FACT_TO_SOURCE: AnaTool = {
  name: 'trace_fact_to_source',
  description:
    "Trace a governed value back to its source — 'where did this number come from?'. Given a factId, resolves the full chain: the canonical value → the claim that established it → the source artifact (file name, page count, content hash), plus every location that cites the value each resolved back to its own source. Read-only. This is the Source Tracer. " +
    GROUNDED_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      factId: { type: 'string', description: 'UUID of the canonical fact to trace.' },
    },
    required: ['factId'],
  },
};

export const EXPLAIN_RESOLUTION_PLAN: AnaTool = {
  name: 'explain_resolution_plan',
  description:
    'Explain a resolution plan in structured terms — what triggered it, the objects it affects, the recommended resolution path and alternatives, review/re-approval requirements, and the next steps. Use after apply_fact_change (which returns a resolutionPlanId) or when the user asks about an open resolution plan. Read-only; grounded strictly in the stored plan (does not invent resolution logic). ' +
    GROUNDED_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      planId: { type: 'string', description: 'UUID of the resolution plan to explain.' },
    },
    required: ['planId'],
  },
};

/** All change-propagation tools, spread into ALL_ANA_TOOLS. */
export const CHANGE_PROPAGATION_TOOLS: AnaTool[] = [
  LIST_GOVERNED_FACTS,
  PREVIEW_FACT_IMPACT,
  APPLY_FACT_CHANGE,
  TRACE_FACT_TO_SOURCE,
  EXPLAIN_RESOLUTION_PLAN,
];
