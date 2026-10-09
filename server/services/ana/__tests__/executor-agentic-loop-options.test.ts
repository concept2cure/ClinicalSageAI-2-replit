/**
 * executeAgenticLoop's opt-in options (row 74, slice S3): the loop outcome it
 * now returns, a dispatch allowlist, per-tool and per-model-call hooks, the
 * caller's stopWhen, a tool concurrency, and a model-call refusal scope around
 * every tool dispatch.
 *
 * Each exists for the sub-agent runner (a later slice). None is set by any
 * caller today, and executor-agentic-loop.test.ts — run unchanged — pins that a
 * caller who sets none of them sees the adapter it always did.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

/* Scripted gateway, as executor-agentic-loop.test.ts. Its route() answers the
   way the real one does inside a refusal scope (model-call-scope.test.ts pins
   the real one): it refuses before counting the call as dispatched. */
const gw = vi.hoisted(() => ({
  responses: [] as any[],
  calls: [] as any[],
  refused: [] as any[],
  fallback: null as null | (() => any),
}));

vi.mock('../../ai-gateway/gateway', async () => {
  const { modelCallRefusal } = await import('../../ai-gateway/model-call-scope');
  return {
    getGateway: () => ({
      route: async (req: any) => {
        const refusal = modelCallRefusal();
        if (refusal) {
          gw.refused.push(refusal);
          throw Object.assign(new Error(`A sub-agent's tool (${refusal.tool}) may not call a model; nothing was sent.`), {
            name: 'GatewayPolicyError',
          });
        }
        gw.calls.push(req);
        if (gw.responses.length > 0) return gw.responses.shift();
        if (gw.fallback) return gw.fallback();
        return { content: 'fallback-final', toolUses: [], usage: {}, provider: 'p', model: 'm', requestId: 'rf' };
      },
    }),
  };
});

vi.mock('../tool-authorization.js', async importOriginal => {
  const real = await importOriginal<typeof import('../tool-authorization.js')>();
  return {
    ...real,
    toolAuthorizationOf: (name: string, input: unknown) =>
      name.startsWith('__test') ? { class: 'read' as const } : real.toolAuthorizationOf(name, input),
  };
});

import { executeAgenticLoop, registerToolHandler } from '../AnaToolExecutor';
import { getGateway } from '../../ai-gateway/gateway';
import { modelCallRefusal } from '../../ai-gateway/model-call-scope';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const reply = (toolUses: Array<{ id: string; name: string; input?: object }>, content = '') => ({
  content,
  toolUses: toolUses.map(t => ({ input: {}, ...t })),
  usage: {},
  provider: 'p',
  model: 'm',
  requestId: `r${Math.random()}`,
});
const final = (content = 'final answer') => reply([], content);

const baseRequest = (extra: Record<string, unknown> = {}) => ({
  taskType: 'chat' as const,
  messages: [{ role: 'user' as const, content: 'investigate' }],
  maxTokens: 1024,
  tools: [{ name: 'noop' }] as any,
  toolChoice: 'auto' as const,
  ...extra,
});

beforeEach(() => {
  gw.responses = [];
  gw.calls = [];
  gw.refused = [];
  gw.fallback = null;
});

describe('the loop outcome travels with the response', () => {
  it('a turn cut at its round ceiling says max_rounds', async () => {
    registerToolHandler('__test_always', async () => 'ok');
    let n = 0;
    gw.fallback = () => reply([{ id: `a${n++}`, name: '__test_always', input: { n } }], 'working');
    const res = await executeAgenticLoop(baseRequest() as any, { maxRounds: 2, progressExtension: 0 });
    expect(res.loop).toEqual({ rounds: 2, toolCallCount: 2, stoppedReason: 'max_rounds', extendedRounds: 0 });
  });

  it('a turn stopped after its first round says cancelled, not no_more_tools', async () => {
    const ctl = new AbortController();
    registerToolHandler('__test_stop_during', async () => {
      ctl.abort();
      return 'ok';
    });
    gw.responses = [reply([{ id: 's1', name: '__test_stop_during' }], 'first'), final('never')];
    const res = await executeAgenticLoop(baseRequest() as any, { signal: ctl.signal });
    expect(res.loop.stoppedReason).toBe('cancelled');
    expect(res.content).toBe('first');
  });

  it('an answer with no tools reports a zero-round loop', async () => {
    gw.responses = [final('direct')];
    const res = await executeAgenticLoop(baseRequest() as any);
    expect(res.loop).toEqual({ rounds: 0, toolCallCount: 0, stoppedReason: 'no_more_tools', extendedRounds: 0 });
    expect(res.content).toBe('direct');
  });
});

describe('allowedToolNames: a tool not offered is not run', () => {
  it('answers TOOL_NOT_OFFERED without dispatching, and lists no other tools', async () => {
    const spy = vi.fn(async () => 'should-not-run');
    registerToolHandler('__test_not_offered', spy);
    registerToolHandler('__test_offered', async () => 'ran');
    gw.responses = [
      reply([
        { id: 'n1', name: '__test_not_offered' },
        { id: 'o1', name: '__test_offered' },
      ]),
      final(),
    ];
    const results: Record<string, string> = {};
    await executeAgenticLoop(baseRequest() as any, {
      allowedToolNames: new Set(['__test_offered']),
      onToolExecution: (name, _input, result) => {
        results[name] = result;
      },
    });
    expect(spy, 'a tool outside the allowlist ran').not.toHaveBeenCalled();
    const refused = JSON.parse(results.__test_not_offered);
    expect(refused).toEqual({
      error: 'TOOL_NOT_OFFERED',
      tool: '__test_not_offered',
      message: 'This tool was not offered to this agent; nothing was run.',
    });
    expect(refused).not.toHaveProperty('availableTools');
    expect(results.__test_offered).toBe('ran');
  });

  it('an offered name with no handler lists only the offered tools, never the whole registry', async () => {
    registerToolHandler('__test_offered_too', async () => 'ran');
    gw.responses = [reply([{ id: 'u1', name: '__test_offered_unregistered' }]), final()];
    const results: Record<string, string> = {};
    await executeAgenticLoop(baseRequest() as any, {
      allowedToolNames: new Set(['__test_offered_unregistered', '__test_offered_too']),
      onToolExecution: (name, _input, result) => {
        results[name] = result;
      },
    });
    const answer = JSON.parse(results.__test_offered_unregistered);
    expect(answer.error).toMatch(/No handler registered/);
    expect(answer.availableTools, 'the answer disclosed tools this loop was not offered').toEqual(['__test_offered_too']);
  });

  it('without an allowlist the unknown-tool answer is what it always was', async () => {
    gw.responses = [reply([{ id: 'u2', name: '__test_nowhere' }]), final()];
    const results: Record<string, string> = {};
    await executeAgenticLoop(baseRequest() as any, {
      onToolExecution: (name, _input, result) => {
        results[name] = result;
      },
    });
    const answer = JSON.parse(results.__test_nowhere);
    expect(answer.availableTools.length).toBeGreaterThan(100);
  });
});

describe('hooks', () => {
  it('onToolEvent: start and end per call, fired inside the worker, with the round and latency', async () => {
    const events: Array<{ phase: string; name: string; round: number; latencyMs?: number; result?: string }> = [];
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    // Resolved by the handlers themselves once both are running — no clock in
    // this test, so a loaded machine cannot fail it.
    let bothRunning!: () => void;
    const running = new Promise<void>(r => (bothRunning = r));
    let started = 0;
    const slow = async () => {
      if (++started === 2) bothRunning();
      await gate;
      return 'done';
    };
    registerToolHandler('__test_ev_a', slow);
    registerToolHandler('__test_ev_b', slow);
    gw.responses = [reply([{ id: 'e1', name: '__test_ev_a' }, { id: 'e2', name: '__test_ev_b' }]), final()];
    const run = executeAgenticLoop(baseRequest() as any, {
      onToolEvent: ev => events.push({ phase: ev.phase, name: ev.call.name, round: ev.round, latencyMs: ev.latencyMs, result: ev.result }),
    });
    await running;
    // Both started before either finished: the event fires as the worker picks the call up.
    expect(events.map(e => `${e.phase}:${e.name}`)).toEqual(['start:__test_ev_a', 'start:__test_ev_b']);
    release();
    await run;
    const ends = events.filter(e => e.phase === 'end');
    expect(ends.map(e => e.name).sort()).toEqual(['__test_ev_a', '__test_ev_b']);
    for (const e of ends) {
      expect(e.round).toBe(1);
      expect(e.result).toBe('done');
      expect(typeof e.latencyMs).toBe('number');
      expect(e.latencyMs!).toBeGreaterThanOrEqual(0);
    }
  });

  it('onToolEvent reports a refused call too, so a caller can list what did not run', async () => {
    registerToolHandler('__test_ev_refused', async () => 'x');
    gw.responses = [reply([{ id: 'r1', name: '__test_ev_refused' }]), final()];
    const ends: string[] = [];
    await executeAgenticLoop(baseRequest() as any, {
      allowedToolNames: new Set<string>(),
      onToolEvent: ev => {
        if (ev.phase === 'end') ends.push(ev.result ?? '');
      },
    });
    expect(ends.map(r => JSON.parse(r).error)).toEqual(['TOOL_NOT_OFFERED']);
  });

  it('onModelResponse: once per gateway call, first call included, with its round', async () => {
    registerToolHandler('__test_mr', async () => 'ok');
    gw.responses = [
      reply([{ id: 'm1', name: '__test_mr', input: { q: 1 } }]),
      reply([{ id: 'm2', name: '__test_mr', input: { q: 2 } }]),
      final(),
    ];
    const seen: Array<[string, number]> = [];
    await executeAgenticLoop(baseRequest() as any, {
      onModelResponse: (response, round) => seen.push([response.requestId, round]),
    });
    expect(seen.map(s => s[1])).toEqual([0, 1, 2]);
    expect(seen.length).toBe(gw.calls.length);
  });

  it('an observer that throws is contained: the tool still answers the model, and the turn completes', async () => {
    registerToolHandler('__test_obs', async () => 'observed-result');
    gw.responses = [reply([{ id: 'x1', name: '__test_obs' }]), final('closing')];
    const res = await executeAgenticLoop(baseRequest() as any, {
      onToolEvent: () => {
        throw new Error('observer broke');
      },
      onModelResponse: () => {
        throw new Error('observer broke');
      },
    });
    expect(res.content).toBe('closing');
    expect(res.loop).toMatchObject({ rounds: 1, toolCallCount: 1, stoppedReason: 'no_more_tools' });
    const sent = JSON.stringify(gw.calls[1].messages);
    expect(sent, 'the tool result never reached the model').toContain('observed-result');
  });
});

describe('stopWhen is the caller’s', () => {
  it('ends the turn with a closing answer and its own reason', async () => {
    registerToolHandler('__test_budget', async () => 'ok');
    let n = 0;
    gw.fallback = () => reply([{ id: `b${n++}`, name: '__test_budget', input: { n } }], 'more');
    const res = await executeAgenticLoop(baseRequest() as any, {
      maxRounds: 6,
      stopWhen: round => (round >= 1 ? 'budget_exhausted' : null),
    });
    expect(res.loop).toMatchObject({ rounds: 1, stoppedReason: 'budget_exhausted' });
    expect(gw.calls[1].toolChoice, 'the closing call still offered tools').toBe('none');
  });
});

describe('toolConcurrency', () => {
  async function maxInFlight(tools: number, options: Record<string, unknown>): Promise<number> {
    let active = 0;
    let max = 0;
    registerToolHandler('__test_conc', async () => {
      active++;
      max = Math.max(max, active);
      await delay(15);
      active--;
      return 'ok';
    });
    gw.responses = [
      reply(Array.from({ length: tools }, (_, i) => ({ id: `k${i}`, name: '__test_conc', input: { i } }))),
      final(),
    ];
    await executeAgenticLoop(baseRequest() as any, options);
    return max;
  }

  it('bounds a round to the lanes asked for', async () => {
    expect(await maxInFlight(4, { toolConcurrency: 2 })).toBe(2);
  });

  it('is 4 when not asked, as before', async () => {
    expect(await maxInFlight(5, {})).toBe(4);
  });

  it.each([0, -1, 1.5, Number.NaN])('%s lanes is refused before any model call is spent', async lanes => {
    gw.responses = [reply([{ id: 'z1', name: '__test_conc' }]), final()];
    const outcome = await executeAgenticLoop(baseRequest() as any, { toolConcurrency: lanes }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(outcome).toBeInstanceOf(RangeError);
    expect(String((outcome as Error).message)).toMatch(/toolConcurrency/);
    expect(gw.calls, 'a model call was spent on a loop that could not run its tools').toHaveLength(0);
  });
});

describe("toolModelCalls 'refuse': a tool cannot call a model", () => {
  const probe = () => {
    const seen: Array<{ scope: unknown; outcome: string }> = [];
    registerToolHandler('__test_model_probe', async () => {
      const scope = modelCallRefusal();
      const outcome = await getGateway()
        .route({ taskType: 'chat', messages: [{ role: 'user', content: 'rerank' }] } as any)
        .then(
          () => 'dispatched',
          (e: Error) => `${e.name}: ${e.message}`,
        );
      seen.push({ scope, outcome });
      return outcome;
    });
    return seen;
  };

  it('the dispatch runs inside the refusal scope, and the gateway sends nothing for it', async () => {
    const seen = probe();
    gw.responses = [reply([{ id: 'p1', name: '__test_model_probe' }]), final()];
    await executeAgenticLoop(baseRequest({ runId: 'agent_child', parentRunId: 'run_p' }) as any, {
      toolModelCalls: 'refuse',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].scope).toEqual({ runId: 'agent_child', parentRunId: 'run_p', tool: '__test_model_probe' });
    expect(seen[0].outcome).toMatch(/^GatewayPolicyError: .*may not call a model/);
    expect(gw.refused).toHaveLength(1);
    // The loop's own two calls, and nothing from the tool.
    expect(gw.calls).toHaveLength(2);
  });

  it("the loop's own model calls are not refused", async () => {
    probe();
    gw.responses = [reply([{ id: 'p2', name: '__test_model_probe' }]), final('closing')];
    const res = await executeAgenticLoop(baseRequest() as any, { toolModelCalls: 'refuse' });
    expect(res.content).toBe('closing');
  });

  it("toolModelCalls 'refuse' alone also tells the tool (ctx.modelCalls), so it asks for its model-free path", async () => {
    const seen: unknown[] = [];
    registerToolHandler('__test_ctx_probe', async (_input, ctx) => {
      seen.push(ctx?.modelCalls);
      return 'ok';
    });
    gw.responses = [reply([{ id: 'c1', name: '__test_ctx_probe' }]), final()];
    await executeAgenticLoop(baseRequest() as any, { toolModelCalls: 'refuse' });
    expect(seen, 'the scope was open but the tool was not told').toEqual(['refuse']);
  });

  it("toolContext.modelCalls 'refuse' alone also opens the refusal scope, so the gateway enforces it", async () => {
    const seen: unknown[] = [];
    registerToolHandler('__test_scope_probe', async () => {
      seen.push(modelCallRefusal());
      return 'ok';
    });
    gw.responses = [reply([{ id: 'c2', name: '__test_scope_probe' }]), final()];
    await executeAgenticLoop(baseRequest({ runId: 'agent_c', parentRunId: 'run_p' }) as any, {
      toolContext: { modelCalls: 'refuse' },
    });
    expect(seen, 'the tool was told model-free but nothing enforced it').toEqual([
      { runId: 'agent_c', parentRunId: 'run_p', tool: '__test_scope_probe' },
    ]);
  });

  it('with neither, the tool is handed exactly the context the caller passed: no modelCalls', async () => {
    const seen: unknown[] = [];
    registerToolHandler('__test_plain_ctx', async (_input, ctx) => {
      seen.push(ctx && 'modelCalls' in ctx);
      return 'ok';
    });
    gw.responses = [reply([{ id: 'c3', name: '__test_plain_ctx' }]), final()];
    await executeAgenticLoop(baseRequest() as any, { toolContext: { organizationId: 7 } });
    expect(seen).toEqual([false]);
  });

  it('without the option a tool may call a model, as before', async () => {
    const seen = probe();
    gw.responses = [reply([{ id: 'p3', name: '__test_model_probe' }]), final(), final()];
    await executeAgenticLoop(baseRequest() as any);
    expect(seen[0].scope).toBeNull();
    expect(seen[0].outcome).toBe('dispatched');
    expect(gw.refused).toHaveLength(0);
  });
});
