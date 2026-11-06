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
import { modelCallRefusal, runRefusingModelCalls, createRunSourceAuthority, runWithSourceAuthority, recordCurrentRunSource,
  captureCurrentRunSourceGate, SourceRunAuthorityError, type RunSourceAuthority,
  issueOwnerPrivateModelContext, runWithOwnerPrivateModelContexts, prepareOwnerPrivateModelContexts,
  captureOwnerPrivateModelGate, bindOwnerPrivateModelChildRequest, OwnerPrivateModelContextError,
  type OwnerPrivateModelContextCapsule } from '../model-call-scope';
import { runWithTenantScope } from '../../../db/tenantStore';
import type { AuditLogEntry, GatewayConfig, GatewayRequest, ModelConfig } from '../types';

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

const SOURCE_ACTOR = { organizationId: 7, userId: 3, projectId: 42, programId: '10000000-0000-4000-8000-000000000001' };
describe('private per-run source ceilings and current-source checkpoints', () => {
  it('fills omitted SDK/audit identity only from private authority and refuses a forged actor before any SDK', async () => {
    const { gw, placement, dispatch } = instrumented();
    const probe = gw as unknown as { config: { auditEnabled: boolean }; auditLogger: { getRecentEntries(): AuditLogEntry[] } };
    probe.config.auditEnabled = true;
    await runWithSourceAuthority(createRunSourceAuthority(SOURCE_ACTOR), async () => {
      await expect(gw.route({ taskType: 'chat', messages: [{ role: 'user', content: 'Unassessed source context' }],
        inputSensitivityTiers: [0], payloadProvenance: 'public' })).rejects.toThrow('DENY_INPUT_TIER');
      expect(placement.mock.calls[0][0]).toMatchObject({ organizationId: 7, userId: 3, projectId: 42, inputSensitivityTiers: [3, 0] });
      expect(probe.auditLogger.getRecentEntries()[0]).toMatchObject({ organizationId: 7, userId: 3, projectId: 42,
        error: 'DENY_INPUT_TIER', metadata: { inputTierPlacement: { tierMax: 3, allowed: false } } });
      await expect(gw.route(request({ organizationId: 8, userId: 4, projectId: 43 })))
        .rejects.toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
      expect(placement).toHaveBeenCalledOnce(); expect(dispatch).not.toHaveBeenCalled();
    });
  });
  it('keeps unknown history T3, preserves actual source tiers and rechecks every use without accepting serialized authority', async () => {
    const authority = createRunSourceAuthority(SOURCE_ACTOR), verify = vi.fn(async () => {});
    await runWithSourceAuthority(authority, async () => {
      recordCurrentRunSource({ ...SOURCE_ACTOR, key: 'real-vault-version:sha', tier: 2, recheck: verify });
      const gate = captureCurrentRunSourceGate({ ...SOURCE_ACTOR, inputSensitivityTiers: [0], payloadProvenance: 'public' } as SourceRunIdentityForTest)!;
      expect(gate.tiers).toEqual([3, 2]); await gate.recheck(); await gate.recheck(); expect(verify).toHaveBeenCalledTimes(2);
      expect(createRunSourceAuthority({ organizationId: 7, userId: 3, projectId: SOURCE_ACTOR.programId })).toBe(authority);
      expect(() => captureCurrentRunSourceGate({ ...SOURCE_ACTOR, projectId: 43 })).toThrow(SourceRunAuthorityError);
      expect(() => recordCurrentRunSource({ ...SOURCE_ACTOR, userId: 4, key: 'forged', tier: 0, recheck: verify })).toThrow(SourceRunAuthorityError);
    });
    expect(captureCurrentRunSourceGate(SOURCE_ACTOR)).toBeUndefined();
    expect(() => runWithSourceAuthority(JSON.parse(JSON.stringify(authority)) as RunSourceAuthority, () => undefined)).toThrow(SourceRunAuthorityError);
  });
  it('does not let two organizations or actors share a concurrent mutable source ceiling', async () => {
    const other = { organizationId: 8, userId: 4, projectId: 43, programId: '20000000-0000-4000-8000-000000000002' };
    const a = createRunSourceAuthority(SOURCE_ACTOR), b = createRunSourceAuthority(other), checks: string[] = [];
    const run = (authority: RunSourceAuthority, actor: typeof SOURCE_ACTOR, tier: 1 | 2) => runWithSourceAuthority(authority, async () => {
      recordCurrentRunSource({ ...actor, key: `source-${actor.organizationId}`, tier, recheck: async () => { checks.push(String(actor.organizationId)); } });
      await Promise.resolve(); const gate = captureCurrentRunSourceGate(actor)!; await gate.recheck(); return gate.tiers;
    });
    expect(await Promise.all([run(a, SOURCE_ACTOR, 2), run(b, other, 1)])).toEqual([[3, 2], [3, 1]]);
    expect(checks.sort()).toEqual(['7', '8']);
  });
  it('holds missing identity, rejects alias disagreement and cannot lose a new source while a checkpoint awaits', async () => {
    await runWithSourceAuthority(createRunSourceAuthority({ organizationId: 7 }), async () => {
      await expect(captureCurrentRunSourceGate({ organizationId: 7 })!.recheck()).rejects.toThrow(SourceRunAuthorityError);
    });
    await runWithSourceAuthority(createRunSourceAuthority(SOURCE_ACTOR), async () => {
      expect(() => createRunSourceAuthority({ ...SOURCE_ACTOR, programId: '30000000-0000-4000-8000-000000000003' })).toThrow(SourceRunAuthorityError);
      let finish: () => void = () => {}, started: () => void = () => {};
      const pending = new Promise<void>(resolve => { finish = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
      recordCurrentRunSource({ ...SOURCE_ACTOR, key: 'first', tier: 2, recheck: async () => { started(); await pending; } });
      const check = captureCurrentRunSourceGate(SOURCE_ACTOR)!.recheck(); await entered;
      recordCurrentRunSource({ ...SOURCE_ACTOR, key: 'later', tier: 1, recheck: async () => {} }); finish();
      await expect(check).rejects.toThrow(SourceRunAuthorityError);
      expect(captureCurrentRunSourceGate(SOURCE_ACTOR)!.tiers).toEqual([3, 2, 1]);
    });
  });
});
type SourceRunIdentityForTest = Parameters<typeof captureCurrentRunSourceGate>[0];

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


// These unit callbacks exercise capability integrity; DB issuers and SDK bodies
// have separate real SQL/AES and transport-boundary fixtures.
const PRIVATE_SCOPE = { organizationId: 7, userId: 3, projectId: 42, runId: 'run_private', threadId: 'thread_private' };
const ownerScope = <T>(work: () => T, accountId = 3) => runWithTenantScope({ tenantId: '7', accountId, source: 'test' }, work);
function privateCapsule(overrides: Partial<Parameters<typeof issueOwnerPrivateModelContext>[0]> = {}) {
  const calls: string[] = [];
  const capsule = issueOwnerPrivateModelContext({ scope: PRIVATE_SCOPE, sourceRef: 'a'.repeat(64),
    activate: async () => { calls.push('activate'); }, expand: async () => { calls.push('expand'); return 'private rule canary'; },
    recheck: async () => { calls.push('recheck'); }, ...overrides });
  return { capsule, calls };
}
describe('opaque owner-private model capsules', () => {
  it('serializes no private content and prepares encrypted capture without expansion', async () => ownerScope(async () => {
    const { capsule, calls } = privateCapsule();
    expect(JSON.stringify(capsule)).toBe('{}');
    await prepareOwnerPrivateModelContexts([capsule]);
    expect(calls).toEqual(['activate', 'recheck']);
    await runWithOwnerPrivateModelContexts([capsule], async () => {
      const gate = captureOwnerPrivateModelGate(PRIVATE_SCOPE)!;
      expect(gate.sourceRefs).toEqual(['a'.repeat(64)]);
      expect(await gate.expand()).toBe('private rule canary');
      expect(captureCurrentRunSourceGate(PRIVATE_SCOPE)?.tiers).toEqual([3]);
    });
    expect(captureOwnerPrivateModelGate(PRIVATE_SCOPE)).toBeUndefined();
  }));
  it('refuses serialized, copied and forged capsules', () => ownerScope(() => {
    const { capsule } = privateCapsule();
    for (const forged of [{}, { ...capsule }, JSON.parse(JSON.stringify(capsule))]) {
      expect(() => runWithOwnerPrivateModelContexts([forged as OwnerPrivateModelContextCapsule], () => null)).toThrow(OwnerPrivateModelContextError);
    }
  }));
  it('requires the verified owner and refuses a changed tenant/account', async () => ownerScope(async () => {
    const { capsule } = privateCapsule();
    expect(() => ownerScope(() => runWithOwnerPrivateModelContexts([capsule], () => null), 4)).toThrow(OwnerPrivateModelContextError);
    expect(() => runWithTenantScope({ tenantId: '8', accountId: 3, source: 'test' },
      () => runWithOwnerPrivateModelContexts([capsule], () => null))).toThrow(OwnerPrivateModelContextError);
    await runWithOwnerPrivateModelContexts([capsule], async () => {
      const gate = captureOwnerPrivateModelGate(PRIVATE_SCOPE)!;
      await expect(ownerScope(() => gate.recheck(), 4)).rejects.toBeInstanceOf(OwnerPrivateModelContextError);
    });
  }));
  it('requires exact parent run and privately issued child lineage, including after copies', () => ownerScope(() => {
    const { capsule } = privateCapsule();
    runWithOwnerPrivateModelContexts([capsule], () => {
      expect(() => captureOwnerPrivateModelGate({})).toThrow(OwnerPrivateModelContextError);
      const child = { ...PRIVATE_SCOPE, runId: 'agent_private', parentRunId: PRIVATE_SCOPE.runId };
      expect(() => captureOwnerPrivateModelGate(child)).toThrow(OwnerPrivateModelContextError);
      const issued = bindOwnerPrivateModelChildRequest(child);
      expect(captureOwnerPrivateModelGate({ ...issued })?.scope.runId).toBe(PRIVATE_SCOPE.runId);
      expect(() => captureOwnerPrivateModelGate(JSON.parse(JSON.stringify(issued)))).toThrow(OwnerPrivateModelContextError);
      expect(() => captureOwnerPrivateModelGate({ ...issued, runId: 'agent_other' })).toThrow(OwnerPrivateModelContextError);
      expect(() => captureOwnerPrivateModelGate({ ...PRIVATE_SCOPE, projectId: 43 })).toThrow(OwnerPrivateModelContextError);
    });
  }));
  it('refuses mismatched source scopes, invalid hashes and excess capsules', () => ownerScope(() => {
    const { capsule } = privateCapsule();
    const foreign = privateCapsule({ scope: { ...PRIVATE_SCOPE, threadId: 'other' } }).capsule;
    expect(() => runWithOwnerPrivateModelContexts([capsule, foreign], () => null)).toThrow(OwnerPrivateModelContextError);
    expect(() => privateCapsule({ sourceRef: 'not-a-sha' })).toThrow(OwnerPrivateModelContextError);
    const many = Array.from({ length: 9 }, (_, i) => privateCapsule({ sourceRef: String(i).padStart(64, '0') }).capsule);
    expect(() => runWithOwnerPrivateModelContexts(many, () => null)).toThrow(OwnerPrivateModelContextError);
  }));
  it('rechecks a withdrawal both before and after private expansion', async () => ownerScope(async () => {
    let current = true;
    const { capsule } = privateCapsule({ recheck: async () => { if (!current) throw new Error('withdrawn'); },
      expand: async () => { current = false; return 'must never leave the capsule'; } });
    await runWithOwnerPrivateModelContexts([capsule], async () => {
      const gate = captureOwnerPrivateModelGate(PRIVATE_SCOPE)!;
      await expect(gate.expand()).rejects.toThrow('withdrawn');
      await expect(gate.expand()).rejects.toThrow('withdrawn');
    });
  }));
  it('bounds each expanded context and the total without truncating private instructions', async () => ownerScope(async () => {
    const huge = privateCapsule({ expand: async () => 'x'.repeat(32769) }).capsule;
    await expect(runWithOwnerPrivateModelContexts([huge], () => captureOwnerPrivateModelGate(PRIVATE_SCOPE)!.expand()))
      .rejects.toBeInstanceOf(OwnerPrivateModelContextError);
    const many = Array.from({ length: 3 }, (_, i) => privateCapsule({ sourceRef: String(i).padStart(64, '0'), expand: async () => 'x'.repeat(24000) }).capsule);
    await expect(runWithOwnerPrivateModelContexts(many, () => captureOwnerPrivateModelGate(PRIVATE_SCOPE)!.expand()))
      .rejects.toBeInstanceOf(OwnerPrivateModelContextError);
  }));
  it('refreshes an existing source capsule without exhausting the bound on repeated rounds', () => ownerScope(() => {
    const { capsule } = privateCapsule();
    runWithOwnerPrivateModelContexts([capsule], () => {
      const refreshed = Array.from({ length: 8 }, () => privateCapsule().capsule);
      runWithOwnerPrivateModelContexts(refreshed, () => {
        expect(captureOwnerPrivateModelGate(PRIVATE_SCOPE)?.sourceRefs).toEqual(['a'.repeat(64)]);
      });
    });
  }));
  it('supports no-thread runs without inventing a thread and keeps concurrent calls scoped', async () => ownerScope(async () => {
    const capsule = privateCapsule({ scope: { ...PRIVATE_SCOPE, threadId: null } }).capsule;
    const [inside, outside] = await Promise.all([
      runWithOwnerPrivateModelContexts([capsule], async () => { await Promise.resolve(); return captureOwnerPrivateModelGate(PRIVATE_SCOPE)?.scope.threadId; }),
      Promise.resolve().then(() => captureOwnerPrivateModelGate(PRIVATE_SCOPE)),
    ]);
    expect(inside).toBeNull(); expect(outside).toBeUndefined();
  }));
});
