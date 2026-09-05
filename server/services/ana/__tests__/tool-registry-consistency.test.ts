/**
 * Global AnA tool-registry consistency.
 *
 * The ~236-tool surface is defined in ALL_ANA_TOOLS and wired by registerToolHandler
 * across AnaToolExecutor. Per-domain tests only cover their own tools, so a tool
 * can be (a) DEFINED but never wired — the model calls it and nothing handles it,
 * or (b) WIRED but absent from ALL_ANA_TOOLS — a dead handler the model can never
 * reach. This single test asserts both directions for the whole surface, plus
 * unique names and well-formed schemas, so either failure is caught on every PR.
 */

import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS, ALL_ANA_TOOLS_RAW } from '../AnaToolDefinitions.js';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler, getRegisteredToolNames } from '../AnaToolExecutor';

const definedNames = ALL_ANA_TOOLS.map((t) => t.name);

/**
 * Name collisions known at the time this guard was added. Each is a case where
 * two files define the same tool name; ALL_ANA_TOOLS keeps the FIRST spread and
 * silently drops the rest, so only the winner below is ever offered to the model.
 * Tracked for resolution at source (see the dedupe note in AnaToolDefinitions).
 *
 *   screen_signal_panel   winner: statisticalDesignTools (spread first)
 *                         shadowed: ivdLifecycleTools
 *
 * This list may shrink, never grow. A new entry means a tool definition is being
 * silently discarded — the author's schema never reaches the model.
 *
 * generate_define_xml and run_cdisc_pipeline left this list when their shadowed
 * definitions in cdiscTools were deleted. The generate_define_xml one mattered:
 * its schema described a different dataset shape than the winner's, so an author
 * editing it changed nothing the model ever saw.
 */
const KNOWN_DUPLICATE_NAMES = ['screen_signal_panel'];

describe('AnA tool registry — every defined tool is wired', () => {
  it('ALL_ANA_TOOLS has no duplicate names', () => {
    const dupes = definedNames.filter((n, i) => definedNames.indexOf(n) !== i);
    expect(dupes, `duplicate tool names: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
  });

  // The assertion above runs on the DEDUPED array, so it cannot fail by
  // construction. This one runs pre-dedupe, where collisions are still visible.
  it('introduces no new duplicate names pre-dedupe', () => {
    const rawNames = ALL_ANA_TOOLS_RAW.map((t) => t.name);
    const dupes = [...new Set(rawNames.filter((n, i) => rawNames.indexOf(n) !== i))].sort();
    const unexpected = dupes.filter((n) => !KNOWN_DUPLICATE_NAMES.includes(n));
    expect(
      unexpected,
      `new duplicate tool name(s): ${unexpected.join(', ')}. Two files define the same tool; ` +
        `only the first spread in ALL_ANA_TOOLS_RAW reaches the model and the other is silently ` +
        `discarded. Rename one, or remove the redundant definition.`,
    ).toEqual([]);
  });

  it('every tool has a well-formed input_schema', () => {
    const bad = ALL_ANA_TOOLS.filter((t) => !t.name || !t.description || t.input_schema?.type !== 'object' || typeof t.input_schema?.properties !== 'object');
    expect(bad.map((t) => t.name), 'tools with malformed schema').toEqual([]);
  });

  it.each(definedNames)('%s has a registered handler', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
  });
});

describe('AnA tool registry — every handler is reachable', () => {
  it('no registered handler is absent from ALL_ANA_TOOLS', () => {
    const defined = new Set(definedNames);
    const orphans = getRegisteredToolNames().filter((n) => !defined.has(n));
    expect(orphans, `handlers wired but not in ALL_ANA_TOOLS (unreachable by the model): ${orphans.join(', ')}`).toEqual([]);
  });
});
