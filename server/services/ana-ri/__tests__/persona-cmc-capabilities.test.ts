import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS } from '../../ana/AnaToolDefinitions.js';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';
import { COMMAND_REGISTRY } from '../command-executor.js';

/**
 * The persona's CMC section must name capabilities that exist.
 *
 * ── Why this is worth a test ──────────────────────────────────────────────────
 * The section used to be capability-free prose ("You can evaluate manufacturing
 * comparability…"), which named no tool and so raised the odds of AnA answering
 * a shelf-life or poolability question from its own reasoning rather than from
 * the deterministic engine sitting right there. It now names 27 tools and
 * commands, which trades that failure for a worse one: a persona that promises a
 * tool the runtime does not have teaches the model to hallucinate a call, and
 * the model cannot tell the difference between a name that is wrong and a name
 * that is merely unavailable to it right now.
 *
 * Tools and commands get renamed and retired. This is the tripwire.
 */

const PERSONA = fs.readFileSync(
  path.resolve(__dirname, '../persona.ts'),
  'utf8',
);

/** The CMC section, delimited by the headings around it. */
function cmcSection(): string {
  const start = PERSONA.indexOf('## CMC Capabilities');
  expect(start).toBeGreaterThan(-1);
  const end = PERSONA.indexOf('\n## ', start + 1);
  return PERSONA.slice(start, end === -1 ? undefined : end);
}

/**
 * Every snake_case identifier in the section — how capabilities are named.
 *
 * Matched bare rather than in backticks: the persona body is a template literal,
 * so a backtick inside it terminates the string. The biostatistics section above
 * names its commands the same way.
 */
function namedCapabilities(): string[] {
  return Array.from(new Set([...cmcSection().matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)].map(m => m[1])));
}

const toolNames = new Set(ALL_ANA_TOOLS.map(t => t.name));
const commandNames = new Set(COMMAND_REGISTRY.map(c => c.name));

describe('persona — CMC capabilities', () => {
  it('names a substantial set rather than reverting to prose', () => {
    expect(namedCapabilities().length).toBeGreaterThanOrEqual(20);
  });

  it.each(namedCapabilities())('%s is a real tool or command', (name) => {
    const isTool = toolNames.has(name);
    const isCommand = commandNames.has(name);
    expect(
      isTool || isCommand,
      `persona names "${name}" but it is neither a registered AnA tool nor a command`,
    ).toBe(true);
    // A tool the model can call must also be executable — a definition with no
    // handler fails at the point of use, which is the worst place to find out.
    if (isTool) expect(typeof getToolHandler(name)).toBe('function');
  });

  it('points at the of-record poolability tool, not only the paste-the-numbers one', () => {
    const section = cmcSection();
    expect(section).toContain('assess_recorded_batch_poolability');
    // The preference has to be stated, or the model picks by name similarity.
    expect(section).toMatch(/Prefer it over/);
  });

  it('states that a computed figure is evidence and that refusals are not to be routed around', () => {
    const section = cmcSection();
    expect(section).toMatch(/EVIDENCE, not a claim/);
    expect(section).toMatch(/property of the data, not of the tool/);
  });
});
