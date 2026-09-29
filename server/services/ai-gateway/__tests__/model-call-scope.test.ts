/**
 * A sub-agent's tool cannot call a model (row 74, slice S3).
 *
 * A child agent's tools are meant to be model-free: its only model calls are
 * its own loop's, made on a governed, pinned model. A read tool with a hidden
 * model call inside it (a reranker, a query rewriter, an "explain" tool that
 * asks a model) would otherwise spend flagship tokens nobody budgeted, outside
 * the child's lineage. Asserting "model-free" from a list is a claim; this is
 * the enforcement: every child tool dispatch runs inside a refusal scope, and
 * `route()` refuses there before it spends anything — no placement lookup, no
 * classification, no policy pass or rate bucket, no dispatch, no ledger row.
 *
 * Nothing in S3 opens such a scope. Outside one, route() is unchanged.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { AIGateway, resetGateway, GatewayAbortedError, GatewayPolicyError } from '../gateway';
import { isTerminalGatewayError } from '../gateway-outcome';
import { modelCallRefusal, runRefusingModelCalls } from '../model-call-scope';
import type { GatewayConfig, GatewayRequest, ModelConfig } from '../types';

const SCOPE = { runId: 'agent_00000000-0000-4000-8000-000000000001', parentRunId: 'run_p', tool: 'search_literature' };

function liveGateway(): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    defaultStrategy: 'task_based',
    auditEnabled: false,
    providers: [
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-5', models: [] },
    ],
    policy: {
      maxTokensPerRequest: 128_000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      contentFilters: false,
      piiDetection: false,
    },
  } as Partial<GatewayConfig>);
}

/** The gateway with every stage a refused call must never reach spied. */
function instrumented() {
  const gw = liveGateway();
  const internals = gw as unknown as {
    dispatchProvider: (m: ModelConfig) => Promise<unknown>;
    applyOrgPlacementDefaults: (r: GatewayRequest) => Promise<GatewayRequest>;
    policyEngine: { evaluate: (r: GatewayRequest) => unknown };
  };
  const dispatch = vi.spyOn(internals, 'dispatchProvider').mockResolvedValue({} as never);
  const placement = vi.spyOn(internals, 'applyOrgPlacementDefaults');
  const policy = vi.spyOn(internals.policyEngine, 'evaluate');
  return { gw, dispatch, placement, policy };
}

const request = (extra: Partial<GatewayRequest> = {}): GatewayRequest =>
  ({ taskType: 'chat', messages: [{ role: 'user', content: 'rerank these' }], organizationId: 7, ...extra }) as GatewayRequest;

afterEach(() => {
  resetGateway();
  vi.restoreAllMocks();
});

describe('the scope', () => {
  it('is empty outside, and names the run and tool inside', async () => {
    expect(modelCallRefusal()).toBeNull();
    const inside = await runRefusingModelCalls(SCOPE, async () => modelCallRefusal());
    expect(inside).toEqual(SCOPE);
    expect(modelCallRefusal(), 'the scope leaked out of the call').toBeNull();
  });

  it('follows async continuations started inside it', async () => {
    const seen = await runRefusingModelCalls(
      SCOPE,
      () => new Promise(resolve => setTimeout(() => resolve(modelCallRefusal()), 5)),
    );
    expect(seen).toEqual(SCOPE);
  });
});

describe("route() refuses a sub-agent's tool before spending anything", () => {
  it('rejects with a terminal policy error and never reaches a provider, the placement lookup or the rate bucket', async () => {
    const { gw, dispatch, placement, policy } = instrumented();

    const outcome = await runRefusingModelCalls(SCOPE, () => gw.route(request())).then(
      () => null,
      (e: unknown) => e,
    );

    expect(outcome, 'the refused call resolved').toBeInstanceOf(GatewayPolicyError);
    expect(isTerminalGatewayError(outcome), 'the refusal would be retried or walked down the ladder').toBe(true);
    expect(String((outcome as Error).message)).toMatch(/search_literature/);
    expect(String((outcome as Error).message)).toMatch(/may not call a model; nothing was sent/);
    expect(dispatch, 'a refused call reached a provider').not.toHaveBeenCalled();
    expect(placement, 'a refused call read the tenant placement policy').not.toHaveBeenCalled();
    expect(policy, "a refused call consumed the org's rate bucket").not.toHaveBeenCalled();
  });

  it('is the exported SubAgentToolModelCallError, a GatewayPolicyError whose name is not overridden', async () => {
    const mod = (await import('../gateway')) as Record<string, unknown>;
    const Ctor = mod.SubAgentToolModelCallError as (new (s: typeof SCOPE) => Error) | undefined;
    expect(typeof Ctor, 'SubAgentToolModelCallError is not exported').toBe('function');
    const err = new Ctor!(SCOPE);
    expect(err).toBeInstanceOf(GatewayPolicyError);
    expect(err.name).toBe('GatewayPolicyError');
    expect(isTerminalGatewayError(err)).toBe(true);
  });

  it('refuses a call made from an async continuation started inside the scope', async () => {
    const { gw, dispatch } = instrumented();
    const outcome = await runRefusingModelCalls(
      SCOPE,
      () => new Promise((resolve, reject) => setTimeout(() => gw.route(request()).then(resolve, reject), 5)),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isTerminalGatewayError(outcome)).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a caller that already stopped still reads as a cancel, not a refusal (the abort check comes first)', async () => {
    const { gw } = instrumented();
    const ctl = new AbortController();
    ctl.abort();
    const outcome = await runRefusingModelCalls(SCOPE, () => gw.route(request({ signal: ctl.signal }))).then(
      () => null,
      (e: unknown) => e,
    );
    expect(outcome).toBeInstanceOf(GatewayAbortedError);
  });

  it('a reranker-style caller that catches the refusal keeps its fallback and completes', async () => {
    const { gw, dispatch } = instrumented();
    const rerank = async (docs: string[]): Promise<string[]> => {
      try {
        await gw.route(request());
        return [...docs].reverse();
      } catch {
        return docs; // the embedding order, as rag rerankers already fall back
      }
    };
    const out = await runRefusingModelCalls(SCOPE, () => rerank(['a', 'b', 'c']));
    expect(out).toEqual(['a', 'b', 'c']);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('outside the scope, route() is unchanged', () => {
  it('reaches the provider as before', async () => {
    const { gw, dispatch, policy } = instrumented();
    const outcome = await gw.route(request()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(String((outcome as Error | null)?.message ?? '')).not.toMatch(/may not call a model/);
    expect(dispatch).toHaveBeenCalled();
    expect(policy).toHaveBeenCalled();
  });

  it('a call made after the scoped work finished is not refused', async () => {
    const { gw, dispatch } = instrumented();
    await runRefusingModelCalls(SCOPE, async () => undefined);
    await gw.route(request()).catch(() => undefined);
    expect(dispatch).toHaveBeenCalled();
  });
});

/**
 * Whether one route() call was refused by the scope. Anything else — a
 * response, or this harness's stubbed provider failing later on — is 'not
 * refused': the call went past the scope check.
 */
const outcomeOf = (p: Promise<unknown>): Promise<'refused' | 'not refused'> =>
  p.then(
    () => 'not refused' as const,
    (e: unknown) => (/may not call a model/.test(String((e as Error)?.message)) ? ('refused' as const) : ('not refused' as const)),
  );

describe('scoped and unscoped work in flight at the same time', () => {
  it("each route() sees its own caller's scope, however their awaits interleave", async () => {
    const { gw, dispatch } = instrumented();
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    // Both are started, both wait on the same gate, then both call route().
    const scoped = runRefusingModelCalls(SCOPE, async () => {
      await gate;
      return outcomeOf(gw.route(request()));
    });
    const unscoped = (async () => {
      await gate;
      return outcomeOf(gw.route(request()));
    })();
    const scopedAgain = runRefusingModelCalls({ ...SCOPE, tool: 'project_knowledge_search' }, async () => {
      await gate;
      await new Promise(resolve => setTimeout(resolve, 1));
      return outcomeOf(gw.route(request()));
    });
    release();
    expect(await Promise.all([scoped, unscoped, scopedAgain])).toEqual(['refused', 'not refused', 'refused']);
    expect(dispatch, 'the unscoped call never reached a provider').toHaveBeenCalled();
  });

  it('the capture hazard, pinned: a timer armed inside the scope keeps it after the scope returned', async () => {
    const { gw, dispatch } = instrumented();
    let fired!: Promise<'refused' | 'not refused'>;
    const armed = new Promise<void>(resolve => {
      runRefusingModelCalls(SCOPE, () => {
        fired = new Promise(done => setTimeout(() => done(outcomeOf(gw.route(request()))), 5));
        resolve();
      });
    });
    await armed;
    expect(modelCallRefusal(), 'the scope leaked into the caller').toBeNull();
    expect(await fired).toBe('refused');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('the capture hazard, pinned: a memoized promise first created inside the scope refuses its later, unscoped callers too', async () => {
    const { gw } = instrumented();
    let init: Promise<'refused' | 'not refused'> | null = null;
    const lazyInit = () => (init ??= outcomeOf(gw.route(request())));
    const inside = await runRefusingModelCalls(SCOPE, () => lazyInit());
    const outside = await lazyInit();
    expect([inside, outside]).toEqual(['refused', 'refused']);
  });
});
