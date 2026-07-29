/**
 * Global-RI tool adapter — exposes the deterministic global regulatory-intelligence
 * experts to the platform's AI assistant (AnA) as callable tools.
 *
 * AnA must NOT hallucinate regulatory rules. Instead of asking the model to recall
 * pathways, exclusivity periods, fees, change vehicles, etc., this barrel lets AnA
 * call the underlying global-RI services directly and return their structured,
 * registry-derived results verbatim.
 *
 * HONEST BY CONSTRUCTION:
 *   - No LLM is involved here. Every result is produced by a pure, deterministic
 *     lookup/computation over encoded regulatory frameworks (statutes, ICH/WHO
 *     guidance, agency fee schedules, climatic zones, etc.).
 *   - Identical input always yields identical output; nothing is fabricated.
 *
 * This module is a thin composition layer:
 *   - tool specs live in ./ana-tools-specs-core + ./ana-tools-specs-ext (data only),
 *   - the dispatcher (service wiring) lives in ./ana-tools-dispatch.
 *
 * @module server/services/global-ri/ana-tools
 */

import type { AnaAdvisoryToolSpec } from '../ana-advisory/types';
import { GLOBAL_RI_CORE_TOOL_SPECS } from './ana-tools-specs-core';
import { GLOBAL_RI_EXT_TOOL_SPECS } from './ana-tools-specs-ext';
import { dispatchGlobalRiTool } from './ana-tools-dispatch';

/**
 * All global-RI tool specs AnA can register. Order is stable (core then extended)
 * and the names are unique.
 */
export const GLOBAL_RI_TOOL_SPECS: AnaAdvisoryToolSpec[] = [
  ...GLOBAL_RI_CORE_TOOL_SPECS,
  ...GLOBAL_RI_EXT_TOOL_SPECS,
];

/** The global-RI tool names, derived from {@link GLOBAL_RI_TOOL_SPECS}. */
export const GLOBAL_RI_TOOL_NAMES: string[] = GLOBAL_RI_TOOL_SPECS.map((s) => s.name);

const TOOL_NAME_SET: ReadonlySet<string> = new Set(GLOBAL_RI_TOOL_NAMES);

/** Whether `name` is one of the registered global-RI tools. */
export function isGlobalRiTool(name: string): boolean {
  return TOOL_NAME_SET.has(name);
}

export { dispatchGlobalRiTool } from './ana-tools-dispatch';

export default {
  GLOBAL_RI_TOOL_SPECS,
  GLOBAL_RI_TOOL_NAMES,
  isGlobalRiTool,
  dispatchGlobalRiTool,
};
