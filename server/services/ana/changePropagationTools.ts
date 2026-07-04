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

export const ESTABLISH_GOVERNED_FACT: AnaTool = {
  name: 'establish_governed_fact',
  description:
    "Declare a governed value for a program — the single agreed number/text for an (entity, field), e.g. a device assay's clinical sensitivity, a limit of detection, a predicate 510(k) number, an enrolled sample size, a NOAEL. This is how a value BECOMES governable: once established, it can be cited by documents, previewed, changed under governance, and traced. Use it to seed the governed values for a device/IVD or pharma program before scanning documents or previewing a change. Refuses to overwrite an existing active value — change an agreed value with apply_fact_change instead. Works for any domain; the store is not pharma-only.",
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'The regulatory program UUID that scopes the value.' },
      entity: { type: 'string', description: "The thing the value is about, e.g. 'assay', 'device', 'trial', 'drug_substance'." },
      field: { type: 'string', description: "The property, e.g. 'clinical_sensitivity', 'limit_of_detection', 'predicate', 'sample_size', 'noael'." },
      valueNum: { type: 'number', description: 'Numeric value (counts/measures/percentages). Provide valueNum OR valueText.' },
      valueText: { type: 'string', description: "Text value (e.g. a predicate K-number 'K123456', a categorical). Provide valueNum OR valueText." },
      unit: { type: 'string', description: 'Optional unit (%, mg, copies/mL, months).' },
      comparator: { type: 'string', description: "Optional comparator ('=', '>=', '<='). Default '='." },
      reason: { type: 'string', description: 'Optional note recorded on the audit trail.' },
    },
    required: ['programId', 'entity', 'field'],
  },
};

export const SCAN_DOCUMENT_CITATIONS: AnaTool = {
  name: 'scan_document_citations',
  description:
    "Scan a document's prose for citations of the program's governed values and (optionally) bind them — the inconsistency-intelligence entry point for existing documents. Finds where a document repeats a governed number (sensitivity, specificity, LoD, sample size, dose, predicate K-number, …) and flags any citation whose value has already DRIFTED from the governed value. Works for a pharma CTD artifact (documentKind='ctd_artifact', documentId = the artifact_id) or a device/IVD post-market document (documentKind='post_market', documentId = the document UUID). Preview by default; set persist=true to bind the citations so future governed changes flag them automatically. " +
    GROUNDED_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      programId: { type: 'string', description: 'The regulatory program UUID.' },
      documentKind: {
        type: 'string',
        enum: ['ctd_artifact', 'post_market'],
        description: "'ctd_artifact' for a pharma CTD/IND artifact; 'post_market' for a device/IVD PMS/PSUR/PMCF/SSCP document.",
      },
      documentId: { type: 'string', description: "The document id: the concept2cure artifact_id for 'ctd_artifact', or the document UUID for 'post_market'." },
      persist: { type: 'boolean', description: 'Bind the matched citations (and flag divergent ones). Default false = preview only.' },
      tolerance: { type: 'number', description: 'Optional relative tolerance for measure comparisons.' },
    },
    required: ['programId', 'documentKind', 'documentId'],
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
  ESTABLISH_GOVERNED_FACT,
  PREVIEW_FACT_IMPACT,
  APPLY_FACT_CHANGE,
  SCAN_DOCUMENT_CITATIONS,
  TRACE_FACT_TO_SOURCE,
  EXPLAIN_RESOLUTION_PLAN,
];
