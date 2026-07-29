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
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler, getRegisteredToolNames } from '../AnaToolExecutor';

const definedNames = ALL_ANA_TOOLS.map((t) => t.name);

describe('AnA tool registry — every defined tool is wired', () => {
  it('ALL_ANA_TOOLS has no duplicate names', () => {
    const dupes = definedNames.filter((n, i) => definedNames.indexOf(n) !== i);
    expect(dupes, `duplicate tool names: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
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
