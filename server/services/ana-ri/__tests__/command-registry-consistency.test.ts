/**
 * Platform command bridge — registry ↔ handler parity.
 *
 * AnA's "full agentic control" beyond its typed tools runs through the platform
 * command bridge: list_platform_commands advertises COMMAND_REGISTRY, and
 * execute_platform_command (a) rejects any command not in COMMAND_REGISTRY, then
 * (b) dispatches it through executeCommands' handler map (COMMAND_HANDLERS).
 *
 * That makes the two collections a contract:
 *   - a command in COMMAND_REGISTRY with no handler is a SILENT DEAD-END —
 *     executeCommands skips it (no result pushed), so execute_platform_command
 *     returns {status:'failed', result:undefined} with no message; AnA is told a
 *     real, advertised capability "failed" for no reason.
 *   - a handler with no COMMAND_REGISTRY entry is UNREACHABLE — it is neither
 *     discoverable via list_platform_commands nor accepted by the catalog gate.
 *
 * The typed-tool surface already has this guard (tool-registry-consistency).
 * This is its mirror for the command surface, so either drift fails on every PR.
 */

import { describe, it, expect } from 'vitest';
import {
  COMMAND_REGISTRY,
  COMMAND_HANDLER_NAMES,
} from '../command-executor.js';

const registryNames = COMMAND_REGISTRY.map((c) => c.name);

describe('platform command bridge — registry ↔ handler parity', () => {
  it('COMMAND_REGISTRY has no duplicate command names', () => {
    const dupes = registryNames.filter((n, i) => registryNames.indexOf(n) !== i);
    expect(dupes, `duplicate command names: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
  });

  it('every advertised command has a dispatchable handler (no silent dead-ends)', () => {
    const handlers = new Set(COMMAND_HANDLER_NAMES);
    const orphans = registryNames.filter((n) => !handlers.has(n));
    expect(
      orphans,
      `commands advertised by list_platform_commands but not dispatchable by executeCommands: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('every dispatchable handler is advertised in COMMAND_REGISTRY (reachable by AnA)', () => {
    const advertised = new Set(registryNames);
    const unreachable = COMMAND_HANDLER_NAMES.filter((n) => !advertised.has(n));
    expect(
      unreachable,
      `handlers wired in executeCommands but absent from COMMAND_REGISTRY (rejected by the catalog gate, undiscoverable): ${unreachable.join(', ')}`,
    ).toEqual([]);
  });
});
