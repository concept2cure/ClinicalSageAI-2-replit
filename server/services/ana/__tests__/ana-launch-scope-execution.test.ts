/**
 * Launch scope at execution: a tool that serves only apps outside the release
 * does not run in production, however it is reached.
 *
 * governedToolsetFor withholds these tools from what AnA is offered
 * (ana-launch-scope.test.ts). That is not enough on its own: every dispatch path
 * resolves a handler by NAME from the registry, offered or not. The stream's
 * [INTELLIGENCE_ANSWER] fast path calls answer_intelligence_question (the CMC
 * interview) directly, and the loop and stream run any registered name the
 * model emits. So the refusal is in the registration wrapper, which every path
 * goes through, and it comes back as a tool result the model relays.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getToolHandler, registerToolHandler } from '../AnaToolExecutor.js';
import { HIDDEN_APP_TOOLS } from '../ana-launch-scope';

const CTX = { organizationId: 1, userId: 2 };
const run = async (tool: string, ctx: Record<string, unknown> = CTX) =>
  JSON.parse(await getToolHandler(tool)!({}, ctx as any));

/* Real tool names, their handlers replaced by probes so "it did not run" can be seen.
   answer_intelligence_question: hidden (cmc), class `self` — the fast path's tool.
   review_ha_interaction:        hidden, class `read`.
   create_ha_interaction:        hidden, class `confirm`.
   search_literature:            in scope (AnA's own knowledge). */
const probes = {
  answer_intelligence_question: vi.fn(async () => JSON.stringify({ ok: 'ran' })),
  review_ha_interaction: vi.fn(async () => JSON.stringify({ ok: 'ran' })),
  create_ha_interaction: vi.fn(async () => JSON.stringify({ ok: 'ran' })),
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
  it('the probes stand for hidden tools and one in-scope tool', () => {
    expect(HIDDEN_APP_TOOLS.has('answer_intelligence_question')).toBe(true);
    expect(HIDDEN_APP_TOOLS.has('review_ha_interaction')).toBe(true);
    expect(HIDDEN_APP_TOOLS.has('create_ha_interaction')).toBe(true);
    expect(HIDDEN_APP_TOOLS.has('search_literature')).toBe(false);
  });

  it('in production, is refused and its handler never runs (the CMC interview fast path included)', async () => {
    production();
    for (const tool of ['answer_intelligence_question', 'review_ha_interaction']) {
      const out = await run(tool);
      expect(out.error, tool).toBe('LAUNCH_SCOPE');
      expect(out.tool).toBe(tool);
      expect(probes[tool as keyof typeof probes]).not.toHaveBeenCalled();
    }
  });

  it('in production, a hidden write is refused before a person is asked to confirm it', async () => {
    production();
    const out = await run('create_ha_interaction');
    expect(out.error).toBe('LAUNCH_SCOPE');
    expect(probes.create_ha_interaction).not.toHaveBeenCalled();
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
