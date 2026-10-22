/**
 * Launch scope at execution: a tool that serves only apps outside the release
 * does not run in production, however it is reached.
 *
 * governedToolsetFor withholds these tools from what AnA is offered
 * (ana-launch-scope.test.ts). That is not enough on its own: every dispatch path
 * resolves a handler by NAME from the registry, offered or not — the loop and
 * stream run any registered name the model emits. So the refusal is in the
 * registration wrapper, which every path goes through, and it comes back as a
 * tool result the model relays.
 *
 * The fast path is the reason this matters. The stream's [INTELLIGENCE_ANSWER]
 * branch calls `answer_intelligence_question` directly, bypassing the offered
 * toolset entirely. That tool was the hidden probe here until the CMC surface
 * joined the launch catalog on 2026-10-12 (decision P-28); it is in scope now,
 * so it is the probe for "an in-scope tool reached by the fast path runs", and
 * the hidden probes are agency-meetings tools, which no fast path calls.
 *
 * The write probe was create_ha_interaction until Communication Center joined
 * the launch catalog on 2026-10-16 (327bc9fb6); that tool serves it, so it is in
 * scope and moved to inScope in the inventory (0bce953b4). The write probe is
 * now create_regulatory_commitment (agency-meetings + lifecycle-mgmt, both
 * hidden), also class `confirm` and also a governed change that asks for a
 * stated reason, so the refusal is still seen to come first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getToolHandler, registerToolHandler } from '../AnaToolExecutor.js';
import { HIDDEN_APP_TOOLS } from '../ana-launch-scope';

const CTX = { organizationId: 1, userId: 2 };
const run = async (tool: string, ctx: Record<string, unknown> = CTX) =>
  JSON.parse(await getToolHandler(tool)!({}, ctx as any));

/* Real tool names, their handlers replaced by probes so "it did not run" can be seen.
   answer_intelligence_question: IN SCOPE since P-28 (cmc), class `self` — the fast path's tool.
   review_ha_interaction:        hidden (agency-meetings), class `read`.
   create_regulatory_commitment: hidden (agency-meetings, lifecycle-mgmt), class `confirm`.
   search_literature:            in scope (AnA's own knowledge). */
const probes = {
  answer_intelligence_question: vi.fn(async () => JSON.stringify({ ok: 'ran' })),
  review_ha_interaction: vi.fn(async () => JSON.stringify({ ok: 'ran' })),
  create_regulatory_commitment: vi.fn(async () => JSON.stringify({ ok: 'ran' })),
  search_literature: vi.fn(async () => JSON.stringify({ ok: 'ran' })),
};
for (const [name, fn] of Object.entries(probes)) registerToolHandler(name, fn);

beforeEach(() => {
  for (const fn of Object.values(probes)) fn.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const production = () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('LAUNCH_SCOPE_ENFORCE', '');
};

describe('a hidden-app tool reached by name', () => {
  it('the probes stand for hidden tools and two in-scope tools', () => {
    expect(HIDDEN_APP_TOOLS.has('review_ha_interaction')).toBe(true);
    expect(HIDDEN_APP_TOOLS.has('create_regulatory_commitment')).toBe(true);
    // Communication Center joined the catalog (327bc9fb6): no longer a hidden probe.
    expect(HIDDEN_APP_TOOLS.has('create_ha_interaction')).toBe(false);
    expect(HIDDEN_APP_TOOLS.has('search_literature')).toBe(false);
    // The CMC interview joined the catalog with its surface (P-28).
    expect(HIDDEN_APP_TOOLS.has('answer_intelligence_question')).toBe(false);
  });

  it('in production, is refused and its handler never runs', async () => {
    production();
    for (const tool of ['review_ha_interaction', 'create_regulatory_commitment']) {
      const out = await run(tool);
      expect(out.error, tool).toBe('LAUNCH_SCOPE');
      expect(out.tool).toBe(tool);
      expect(probes[tool as keyof typeof probes]).not.toHaveBeenCalled();
    }
  });

  it('in production, the fast path\u2019s own tool runs now that CMC is in the catalog', async () => {
    /* The wrapper gates by surface, so the fast path is admitted by the same
       check that used to refuse it — not by a path that skips the gate. */
    production();
    expect(await run('answer_intelligence_question')).toEqual({ ok: 'ran' });
    expect(probes.answer_intelligence_question).toHaveBeenCalled();
  });

  it('in production, a hidden write is refused before a person is asked to confirm it', async () => {
    production();
    const out = await run('create_regulatory_commitment');
    expect(out.error).toBe('LAUNCH_SCOPE');
    expect(out.tool).toBe('create_regulatory_commitment');
    expect(probes.create_regulatory_commitment).not.toHaveBeenCalled();
  });

  it('in production, an in-scope tool still runs', async () => {
    production();
    expect(await run('search_literature')).toEqual({ ok: 'ran' });
  });

  it('with launch scope off (a development server), a hidden tool runs', async () => {
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'off');
    expect(await run('answer_intelligence_question')).toEqual({ ok: 'ran' });
  });
});
