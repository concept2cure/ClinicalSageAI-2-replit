/**
 * RIM Domain Query Tools — structured query and summarization of learned RIM patterns.
 *
 * Extends the RIM learning loop (Lane E) with two additional tools:
 *   - `query_rim_patterns_by_domain`: filter patterns by regulatory domain with
 *     optional confidence/occurrence thresholds, sorted by occurrence count desc.
 *   - `summarize_rim_intelligence`: high-level summary of accumulated RIM intelligence
 *     for an org (domain counts, top patterns, date range).
 *
 * Both tools are tenant-scoped from the VERIFIED ToolContext — never from the
 * model's arguments. `orgId` used to be a required model-supplied field here,
 * and the handlers in AnaToolExecutor read it directly, so naming another
 * organization's id returned that tenant's learned regulatory patterns. The
 * schemas below no longer accept it; the handlers take the org from
 * `ctx.organizationId` and refuse without one.
 *
 * They are pure queries over governed internal data (no LLM, no network) →
 * `rim_learned` pedigree.
 *
 * @module server/services/ana/rimQueryTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const QUERY_RIM_PATTERNS_BY_DOMAIN: AnaTool = {
  name: 'query_rim_patterns_by_domain',
  description:
    "Query the Regulatory Intelligence Model (RIM) patterns filtered by a specific regulatory domain (e.g. 'submission_strategy', 'safety_signal', 'regulatory_pathway', 'labeling', 'clinical_design', 'csr', 'fda_compliance', '510k'). Optionally set minimum confidence and minimum occurrence thresholds. Returns matching patterns sorted by occurrence count (most-observed first). Scoped to the caller's organization automatically — do not pass an organization id. DETERMINISTIC: pure query over governed internal data, no LLM, no network.",
  input_schema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description:
          "Regulatory domain to filter by (e.g. 'submission_strategy', 'safety_signal', 'regulatory_pathway', 'labeling', 'clinical_design').",
      },
      minConfidence: {
        type: 'number',
        description:
          'Optional minimum confidence threshold (0–100). Only patterns with confidence >= this value are returned.',
      },
      minOccurrences: {
        type: 'number',
        description:
          'Optional minimum occurrence count. Only patterns observed at least this many times are returned.',
      },
    },
    required: ['domain'],
  },
};

export const SUMMARIZE_RIM_INTELLIGENCE: AnaTool = {
  name: 'summarize_rim_intelligence',
  description:
    "Get a high-level summary of accumulated Regulatory Intelligence Model (RIM) intelligence for the caller's organization — total pattern count, domain breakdown with counts, top patterns by occurrence, and the date range of observations. Use to understand the breadth and depth of what the platform has learned for this org. Scoped to the caller's organization automatically — do not pass an organization id. DETERMINISTIC: pure query over governed internal data, no LLM, no network.",
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/** All RIM domain query tools, spread into ALL_ANA_TOOLS. */
export const RIM_QUERY_TOOLS: AnaTool[] = [
  QUERY_RIM_PATTERNS_BY_DOMAIN,
  SUMMARIZE_RIM_INTELLIGENCE,
];
