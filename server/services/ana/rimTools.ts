/**
 * RIM learning-loop tools — expose the tenant-scoped RIM pattern store to AnA.
 *
 * First increment of Lane E. A single, DETERMINISTIC read tool surfaces the
 * patterns the platform has learned for the active organization. There is no
 * mutation tool: recording is internal (the RIM interceptors / learning loop
 * call `recordPattern` directly), so the model cannot fabricate or tamper with
 * learned intelligence. Exposing only the read path keeps this increment safe
 * and governed.
 *
 * The handler lives in AnaToolExecutor.ts (registerToolHandler) and reads the
 * store via `server/services/intelligence/rim-pattern-store`. It is tenant-scoped
 * by `organizationId` from the handler context — never from model input — exactly
 * as its neighbours (recall_session_context, render_signature_manifestation) are.
 *
 * Pedigree: the store is a pure query over governed internal data with no LLM and
 * no network, so the read tool is `deterministic_query` — reproducible for the
 * current data snapshot. The handler stamps that pedigree into its result so
 * downstream grounding weights it as high-trust.
 *
 * @module server/services/ana/rimTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const RECALL_RIM_PATTERNS: AnaTool = {
  name: 'recall_rim_patterns',
  description:
    "Recall the Regulatory Intelligence Model (RIM) patterns the platform has LEARNED for the active organization — durable, aggregated observations about regulatory behaviour (recurring deficiencies, reviewer triggers, rejection signals, strong/weak-language tendencies, data gaps, consistency/formatting issues, risk signals), each with an occurrence count and a bounded confidence. Use BEFORE drafting or reviewing to ground the response in what this org has actually seen before, instead of generic guidance. Optionally narrow to one regulatory domain (e.g. 'csr', 'fda_compliance', '510k'). Tenant-scoped automatically to the active organization — it can NEVER return another org's patterns. DETERMINISTIC (deterministic_query): a pure query over governed internal data, no LLM, no network; reproducible for the current data snapshot. If no patterns have been learned yet, it returns an empty set — say so plainly rather than inventing patterns.",
  input_schema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description:
          "Optional regulatory domain to filter to (e.g. 'csr', 'fda_compliance', 'ema_loq_response', '510k', 'cmc', 'sap'). Omit to recall all learned patterns for the org.",
      },
    },
    required: [],
  },
};

/** All RIM learning-loop tools, spread into ALL_ANA_TOOLS. */
export const RIM_TOOLS: AnaTool[] = [RECALL_RIM_PATTERNS];
