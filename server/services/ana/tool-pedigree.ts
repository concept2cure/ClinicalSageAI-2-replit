/**
 * Tool determinism-pedigree classifier — AnA's self-awareness of HOW TRUSTWORTHY
 * each tool's output is.
 *
 * AnA can call many tools, and they are NOT equally trustworthy. A pure registry
 * lookup (a statute-encoded rule) is bulletproof and reproducible; a live external
 * authority API is authoritative but time-varying; an LLM-generated narrative is
 * advisory and must be verified against a primary source. Downstream grounding /
 * citation logic needs to weight these differently — it should not cite a
 * model-assisted paragraph with the same confidence as a deterministic rule.
 *
 * This module assigns each tool a {@link DeterminismPedigree} so that weighting can
 * happen honestly. It is a PURE classifier:
 *   - No LLM, no network, no DB, no IO of any kind.
 *   - Identical input always yields identical output.
 *   - CONSERVATIVE by construction: it NEVER over-claims determinism. Anything not
 *     positively known to be a pure registry lookup falls through to the safe
 *     default of `model_assisted` (verify before relying).
 *
 * Classification precedence (first match wins):
 *   1. Names in {@link GLOBAL_RI_TOOL_NAMES} (the deterministic global-RI experts)
 *      → `deterministic_registry`.
 *   2. Names in {@link DETERMINISTIC_REGISTRY_EXTRA} (a short, defensible allowlist
 *      of other clearly-pure registry tools) → `deterministic_registry`.
 *   3. Names in {@link DETERMINISTIC_QUERY_NAMES} (license-gated coders that, when a
 *      dictionary is configured, match deterministically over governed dictionary
 *      data — and otherwise return an honest license_required, never a model guess)
 *      → `deterministic_query`.
 *   4. Names beginning `search_` → `external_api_live`.
 *   5. Everything else (advise_/narrate_/generate_/draft_/review_ and any unknown
 *      tool) → `model_assisted` (the safe default).
 *
 * @module server/services/ana/tool-pedigree
 */

import { GLOBAL_RI_TOOL_NAMES } from '../global-ri/ana-tools';

/**
 * The provenance / reproducibility class of a tool's output, in decreasing order of
 * trustworthiness.
 */
export type DeterminismPedigree =
  | 'deterministic_registry' // pure rule/registry lookup, no LLM, no network (bulletproof)
  | 'deterministic_query' // pure query over governed internal data (reproducible)
  | 'external_api_live' // live external authority API (authoritative but time-varying)
  | 'model_assisted'; // LLM-generated or RAG+LLM narrative/advisory (verify before relying)

/** A pedigree level's full descriptor. */
export interface PedigreeInfo {
  /** The pedigree class. */
  pedigree: DeterminismPedigree;
  /** Whether identical input always yields identical, reproducible output. */
  deterministic: boolean;
  /** How much weight downstream grounding/citation should give this output. */
  trust: 'high' | 'medium' | 'requires_verification';
  /** Honest, caveated guidance on relying on this output. */
  guidance: string;
}

/**
 * The four pedigree descriptors. Trust mapping (per design):
 *   - deterministic_registry → deterministic, trust 'high'
 *   - deterministic_query    → deterministic, trust 'high'
 *   - external_api_live      → non-deterministic, trust 'medium' (verify currency)
 *   - model_assisted         → non-deterministic, trust 'requires_verification'
 */
export const PEDIGREE_LEVELS: Record<DeterminismPedigree, PedigreeInfo> = {
  deterministic_registry: {
    pedigree: 'deterministic_registry',
    deterministic: true,
    trust: 'high',
    guidance:
      'Pure rule/registry lookup — no LLM, no network. Reproducible and bulletproof; ' +
      'may be cited directly as a deterministic fact (confirm against the governing citation it returns).',
  },
  deterministic_query: {
    pedigree: 'deterministic_query',
    deterministic: true,
    trust: 'high',
    guidance:
      'Pure query over governed internal data — no LLM. Reproducible for the same data snapshot; ' +
      'may be relied on directly (note the data version when the underlying records can change).',
  },
  external_api_live: {
    pedigree: 'external_api_live',
    deterministic: false,
    trust: 'medium',
    guidance:
      'Live external authority API — authoritative source, but time-varying. ' +
      'Cite the source and verify currency (results can change between calls).',
  },
  model_assisted: {
    pedigree: 'model_assisted',
    deterministic: false,
    trust: 'requires_verification',
    guidance: 'Model-generated; verify against a cited primary source before relying.',
  },
};

/**
 * Short, defensible allowlist of OTHER tools (beyond the global-RI experts) that are
 * clearly pure rule/registry lookups with no LLM and no network.
 *
 * Candidates that merely look like lookups are NOT eligible — e.g. `lookup_icd10_code`
 * calls a live external (NLM Clinical Tables) API, which is `external_api_live`, not
 * `deterministic_registry`; other `lookup_*` / `classify_*` tools query services or are
 * advisory. When unsure, the conservative default (`model_assisted`) wins rather than
 * over-claiming determinism.
 */
export const DETERMINISTIC_REGISTRY_EXTRA: string[] = [
  // Regulatory Currency Engine: both tools are pure lookups over the curated,
  // freshness-stamped dated-facts registry (currency-registry.ts) — no LLM, no
  // network — exactly mirroring how the global-RI experts are classified.
  'check_regulatory_currency',
  'guidance_change_radar',
];

const REGISTRY_NAME_SET: ReadonlySet<string> = new Set<string>([
  ...GLOBAL_RI_TOOL_NAMES,
  ...DETERMINISTIC_REGISTRY_EXTRA,
]);

/**
 * License-gated medical coders (MedDRA / WHODrug). These are NOT registry lookups,
 * but they are honest-by-construction: when a licensed dictionary is configured the
 * match is a pure, reproducible query over governed dictionary data (no LLM, no
 * network); when it is not, they return an explicit `license_required` status rather
 * than a model-assisted guess. Either way the output is never fabricated, so the
 * correct pedigree is `deterministic_query`, not `model_assisted`.
 */
export const DETERMINISTIC_QUERY_NAMES: ReadonlySet<string> = new Set<string>([
  'code_meddra',
  'code_whodrug',
]);

/** Resolve a tool name to its pedigree class (precedence as documented above). */
function classify(toolName: string): DeterminismPedigree {
  if (REGISTRY_NAME_SET.has(toolName)) return 'deterministic_registry';
  if (DETERMINISTIC_QUERY_NAMES.has(toolName)) return 'deterministic_query';
  if (toolName.startsWith('search_')) return 'external_api_live';
  return 'model_assisted';
}

/**
 * Classify a single tool by name. Returns the pedigree descriptor with the tool name
 * attached. Pure and total — any string (including unknown tools) resolves, defaulting
 * conservatively to `model_assisted`.
 */
export function getToolPedigree(toolName: string): { tool: string } & PedigreeInfo {
  return { tool: toolName, ...PEDIGREE_LEVELS[classify(toolName)] };
}

/**
 * Classify a list of tools, preserving input order. Returns exactly one descriptor per
 * input entry.
 */
export function classifyTools(toolNames: string[]): Array<{ tool: string } & PedigreeInfo> {
  return toolNames.map((name) => getToolPedigree(name));
}

/**
 * The known `deterministic_registry` tool names (global-RI experts + the extra
 * allowlist), sorted alphabetically and de-duplicated.
 */
export function listDeterministicTools(): string[] {
  return Array.from(REGISTRY_NAME_SET).sort();
}

export default {
  PEDIGREE_LEVELS,
  DETERMINISTIC_REGISTRY_EXTRA,
  getToolPedigree,
  classifyTools,
  listDeterministicTools,
};
