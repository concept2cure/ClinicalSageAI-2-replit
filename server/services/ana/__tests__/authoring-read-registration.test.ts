/**
 * The authoring read tools are wired: offered, handled, classed read, in scope
 * (2026-10-01, D2 AnA document awareness, step 1 wiring).
 *
 * authoring-read-tools.ts defines and registers list_authoring_outline,
 * read_authoring_section and search_authoring_sections. A tool is reachable only
 * when four shared registers name it, and a partial wiring fails quietly in a
 * different way each time:
 *   - not in ALL_ANA_TOOLS: the model is never offered it;
 *   - no handler: the executor answers "unknown tool";
 *   - not in tool-authorization.register.json: it is treated as `confirm`
 *     (toolAuthorizationOf), so every read asks the person for a yes;
 *   - not in the launch inventory: launch scope hides it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../AnaToolExecutor';
import { toolAuthorizationOf } from '../tool-authorization';

const NAMES = ['list_authoring_outline', 'read_authoring_section', 'search_authoring_sections'] as const;

describe('the authoring read tools are wired', () => {
  it('are offered to the model', () => {
    const offered = new Set(ALL_ANA_TOOLS.map(t => t.name));
    for (const n of NAMES) expect(offered.has(n), n).toBe(true);
  });

  it('have a handler', () => {
    for (const n of NAMES) expect(typeof getToolHandler(n), n).toBe('function');
  });

  it('are classed read, so a read never asks the person to confirm', () => {
    for (const n of NAMES) expect(toolAuthorizationOf(n, {}).class, n).toBe('read');
  });

  it('are in launch scope', () => {
    const inv = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'ana-launch-scope.inventory.json'), 'utf8'),
    ) as { tools: { inScope: string[] } };
    for (const n of NAMES) expect(inv.tools.inScope, n).toContain(n);
  });
});
