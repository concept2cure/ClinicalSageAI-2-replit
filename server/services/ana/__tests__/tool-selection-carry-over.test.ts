/**
 * A follow-up keeps the tools its conversation used (TP-RL-3, AnA reasoning
 * round 6, 2026-10-05).
 *
 * The selector chose a turn's tools from the current message alone. A
 * follow-up — "and for the EU?", "and as a victim?", "now the toxicology
 * part" — carries none of the words that chose the previous turn's tool, so
 * the tool that turn answered from (get_cmc_requirements, assess_ddi_risk,
 * draft_nonclinical_overview_m2_4…) was no longer offered, and the follow-up
 * was answered without it. The platform bridge does not reach a typed tool:
 * execute_platform_command dispatches only to the command registry. (Three
 * record tools the persona orders her to call are always on since df30b4bbd;
 * every other tool needs the carry.)
 *
 * Pinned on the production shape — the launch-scoped catalog, the self-drive
 * pins, an IND — and on fixtures where a rule needs an exact answer.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { getAllEnabledTools } from '../AnaToolDefinitions';
import { withoutHiddenAppTools } from '../ana-launch-scope';
import { ALWAYS_ON_TOOLS, MAX_CARRIED_TOOLS, SELF_DRIVE_TOOLS, selectToolsForTurn } from '../tool-selection';

const LAUNCH = withoutHiddenAppTools(getAllEnabledTools() as Array<{ name: string; description?: string }>);
const names = (tools: Array<{ name?: string }>) => tools.map((t) => t.name as string);
const FIXED = new Set<string>([...ALWAYS_ON_TOOLS, ...SELF_DRIVE_TOOLS]);

/** The stream's call: the self-drive pins, the project type (null: none), and what earlier turns ran. */
const select = (message: string, carriedTools?: string[], projectType: string | null = 'IND') =>
  names(
    selectToolsForTurn(LAUNCH, message, {
      pinned: [...SELF_DRIVE_TOOLS],
      context: { projectType: projectType ?? undefined },
      ...(carriedTools && { carriedTools }),
    }),
  );

describe('a follow-up keeps the tool the previous turn ran', () => {
  /** A follow-up, and the tool its first question selects first (what that turn ran). */
  const FOLLOW_UPS = [
    ['and for the EU?', 'get_cmc_requirements'],
    ['and as a victim?', 'assess_ddi_risk'],
    ['what about with itraconazole?', 'assess_ddi_risk'],
    ['and with 80% power?', 'estimate_sample_size'],
    ['and for the drug product?', 'design_stability_study'],
    ['now the toxicology part', 'draft_nonclinical_overview_m2_4'],
    ['go on', 'explain_cmc_topic'],
  ] as const;

  it.each(FOLLOW_UPS)('"%s" is still offered %s', (followUp, tool) => {
    // Not offered from the follow-up's own words: what this round is for.
    expect(select(followUp)).not.toContain(tool);
    expect(select(followUp, [tool])).toContain(tool);
    expect(select(followUp, [tool], null)).toContain(tool);
  });

  it('a bare continuation is offered the carried tool first, right after the always-on core and the pins', () => {
    const sel = select('continue', ['get_cmc_requirements']);
    const fixed = sel.filter((n) => FIXED.has(n)).length;
    expect(sel[fixed]).toBe('get_cmc_requirements');
  });
});

describe('what the carry may not do', () => {
  const bridge = [{ name: 'list_platform_commands' }, { name: 'execute_platform_command' }];
  const filler = Array.from({ length: 50 }, (_, i) => ({ name: `filler_${i}`, description: 'unrelated utility' }));

  it(`carries at most ${MAX_CARRIED_TOOLS}, in the order carried, inside the cap`, () => {
    const carried = Array.from({ length: 20 }, (_, i) => `carried_${i}`);
    const tools = [...bridge, ...carried.map((name) => ({ name, description: 'utility' })), ...filler, { name: 'pin_me' }];
    const sel = names(selectToolsForTurn(tools, 'xyzzy', { maxTools: 50, pinned: ['pin_me'], carriedTools: carried }));
    expect(sel).toEqual(['list_platform_commands', 'execute_platform_command', 'pin_me', ...carried.slice(0, MAX_CARRIED_TOOLS)]);
    const live = select('hello', names(LAUNCH).slice(0, 20));
    expect(live.length).toBeLessThanOrEqual(50);
    for (const n of FIXED) expect(live).toContain(n);
  });

  it('carried tools never cost a question its own tools near the end of its slots', () => {
    // A stability question ranks get_cmc_requirements 24th and explain_cmc_topic
    // 25th of its 29 relevance slots: four carried tools leave both, eight would not.
    const Q5C = 'what does ICH Q5C say about stability testing of biotechnological products';
    const own = select(Q5C, undefined, null);
    const others = names(LAUNCH).filter((n) => !FIXED.has(n) && !own.includes(n)).slice(0, 2 * MAX_CARRIED_TOOLS);
    for (const tool of ['get_cmc_requirements', 'explain_cmc_topic']) {
      expect(own, `${tool}: the question's own selection (if this fails, the catalog moved: re-derive MAX_CARRIED_TOOLS)`).toContain(tool);
      expect(select(Q5C, others, null), tool).toContain(tool);
    }
  });

  it('offers a carried tool once, though the current request also selects it', () => {
    const sel = select('what CMC quality information does the FDA require in an IND for a phase 1 study', ['get_cmc_requirements']);
    expect(sel.filter((n) => n === 'get_cmc_requirements')).toHaveLength(1);
    expect(new Set(sel).size).toBe(sel.length);
  });

  it('never offers a carried name outside the governed set, nor carries an unhealthy one ahead', () => {
    const governed = LAUNCH.filter((t) => t.name !== 'get_cmc_requirements');
    expect(names(selectToolsForTurn(governed, 'and for the EU?', { carriedTools: ['get_cmc_requirements'] }))).not.toContain('get_cmc_requirements');
    const tools = [...bridge, { name: 'flaky_tool', description: 'x' }, ...filler];
    const sel = selectToolsForTurn(tools, 'xyzzy', { maxTools: 5, carriedTools: ['flaky_tool'], deprioritize: new Set(['flaky_tool']) });
    expect(names(sel)).not.toContain('flaky_tool');
  });

  it('with nothing carried the selection is what it was', () => {
    for (const q of ['draft the nonclinical overview', 'assess the DDI risk', 'hello', '']) {
      expect(select(q, [])).toEqual(select(q));
    }
  });
});

describe('a change of topic loses nothing the routing eval routes', () => {
  // The eval's own cases, read from its file so the two cannot drift; only
  // those whose tool the launch catalog offers test the production surface.
  const source = readFileSync(fileURLToPath(new URL('./tool-selection-routing.test.ts', import.meta.url)), 'utf8');
  const all = [...source.matchAll(/\{ prompt: '([^']+)', expect: '([^']+)' \}/g)].map((m) => ({ prompt: m[1], tool: m[2] }));
  const launch = new Set(names(LAUNCH));
  const cases = all.filter((c) => launch.has(c.tool));
  /** Earlier turns on other topics, each having run the tools its question selects first (more than are carried). */
  const PRIORS = [
    'estimate the sample size for a two-arm superiority trial with 90% power',
    'assess the DDI risk as a CYP3A4 perpetrator and the concentration-QTc relationship',
    'compute the first-in-human dose and classify the tox findings (NOAEL)',
    'what CMC quality information does the FDA require in an IND for a phase 1 study',
    'we just locked the database, what happens next to get the NDA filed',
    'search grants.gov for posted cancer funding opportunities',
  ];
  const ranAt = (prior: string, projectType: string | null) =>
    select(prior, undefined, projectType).filter((n) => !FIXED.has(n)).slice(0, 2 * MAX_CARRIED_TOOLS);

  it('reads the eval', () => {
    expect(all.length).toBeGreaterThanOrEqual(30);
    expect(cases.length).toBeGreaterThanOrEqual(15);
  });

  it.each(cases)('still selects $tool after any other topic', ({ prompt, tool }) => {
    for (const projectType of ['IND', null]) {
      if (!select(prompt, undefined, projectType).includes(tool)) continue; // not routed without a carry either
      for (const prior of PRIORS) {
        const sel = select(prompt, ranAt(prior, projectType), projectType);
        expect(sel, `after "${prior}" (${projectType ?? 'no project type'})`).toContain(tool);
        expect(new Set(sel).size).toBe(sel.length);
        expect(sel.length).toBeLessThanOrEqual(50);
      }
    }
  });
});
