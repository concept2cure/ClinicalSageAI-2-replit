/** Real routing/placement/retry/capacity paths; only outbound provider I/O is replaced. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIGateway, GatewayAbortedError, GatewayPolicyError, resetGateway } from '../gateway';
import type { GatewayRequest, GatewayResponse, ModelConfig } from '../types';
import type { Semaphore } from '../concurrency';
import { AnaProjectScopeError } from '../../ana/project-scope-admission';
import { runWithTenantScope } from '../../../db/tenantStore';
import { issueOwnerPrivateModelContext, runWithOwnerPrivateModelContexts, bindOwnerPrivateModelChildRequest } from '../model-call-scope';
import { LEDGER_COLUMNS } from '../audit';
import { createHash } from 'node:crypto';

// The local SDK transport and credential-availability boundary are injected.
// Real owner markers, ciphertext, source receipts and historical reads have a
// separate canonical PGlite fixture; no qualification or live provider is claimed here.
const privateIO=vi.hoisted(()=>({client:vi.fn(async()=>null)}));
vi.mock('../providers/clients',async original=>({...await original<typeof import('../providers/clients')>(),
  resolveTenantModelCredentialAvailability:async()=>({mode:'platform',providers:[]}),createTenantProviderClient:privateIO.client}));

const wire = vi.hoisted(() => ({
  availability: vi.fn(), capture: vi.fn(), current: vi.fn(), create: vi.fn(),
}));
vi.mock('../../connectors/connector-registry.js', () => ({
  resolveTenantModelCredentialAvailability: wire.availability,
  captureCredentialForUse: wire.capture,
  assertCredentialUseCurrent: wire.current,
}));
vi.mock('openai', () => ({ default: class {
  chat = { completions: { create: (...args: unknown[]) => wire.create('openai', ...args) } };
  embeddings = { create: (...args: unknown[]) => wire.create('embedding', ...args) };
} }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  messages = { create: (...args: unknown[]) => wire.create('anthropic', ...args) };
  beta = { messages: { create: (...args: unknown[]) => wire.create('anthropic', ...args) } };
} }));

type GuardedRequest = GatewayRequest & { beforeDispatch?: () => Promise<void> };
interface GatewayProbe {
  outboundLimiter: Semaphore;
  dispatchProvider(model: ModelConfig, request: GatewayRequest, id: string, start: number): Promise<GatewayResponse>;
  recordFailure(provider: string, error: unknown): void;
  recordTenantUsage(...args: unknown[]): void;
  getFallbackModels(...args: unknown[]): ModelConfig[];
  applyOrgPlacementDefaults(request: GatewayRequest): Promise<GatewayRequest>;
  tenantProviderClient(provider: ModelConfig['provider'], request: GatewayRequest): Promise<unknown>;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function liveGateway() {
  const gateway = new AIGateway({
    deterministicMode: false,
    auditEnabled: false,
    providers: [
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-5', models: [] },
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
    ],
    policy: {
      maxTokensPerRequest: 128_000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [], contentFilters: false, piiDetection: false,
    },
  });
  const probe = gateway as unknown as GatewayProbe;
  const dispatch = vi.spyOn(probe, 'dispatchProvider').mockImplementation(async (model, _request, id) => ({
    content: 'Draft produced by the test network seam.', provider: model.provider, model: model.model,
    requestId: id, latencyMs: 1, cached: false, deterministic: false,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
  }));
  return { gateway, probe, dispatch };
}

function request(callerModule: string, extra: Partial<GuardedRequest> = {}): GuardedRequest {
  return { taskType: 'chat', messages: [{ role: 'user', content: 'Describe the document review workflow.' }], callerModule, ...extra };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('AI_GATEWAY_MAX_CONCURRENCY', '1');
  wire.availability.mockReset().mockResolvedValue({ mode: 'platform', providers: [] });
  wire.capture.mockReset().mockImplementation(async (org: number, connector: string) => ({
    credentials: { apiKey: `SDK-STUB-${org}-${connector}` },
  }));
  wire.current.mockReset().mockResolvedValue(undefined);
  wire.create.mockReset().mockImplementation(async (provider: string, params: { model: string }) => provider === 'anthropic'
    ? { model: params.model, content: [{ type: 'text', text: 'Actual SDK boundary fixture.' }],
      usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' }
    : { model: params.model, choices: [{ message: { content: 'Actual SDK boundary fixture.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
});

function heldCredentialBoundary(mode: 'tenant' | 'platform') {
  const entered = deferred(), held = deferred();
  let credentialCompleted = false;
  if (mode === 'tenant') {
    wire.availability.mockResolvedValue({ mode: 'customer_owned', providers: ['anthropic', 'openai'] });
    wire.current.mockImplementationOnce(async () => { entered.resolve(); await held.promise; credentialCompleted = true; });
  } else {
    let reads = 0;
    wire.availability.mockImplementation(async () => {
      if (++reads === 2) { entered.resolve(); await held.promise; credentialCompleted = true; }
      return { mode: 'platform', providers: [] };
    });
  }
  return { entered, held, credentialCompleted: () => credentialCompleted };
}

describe('current sources at the actual SDK boundary after credential awaits', () => {
  const lanes = [
    ['anthropic', 'tenant'], ['openai', 'tenant'], ['anthropic', 'platform'], ['openai', 'platform'],
  ] as const;

  it.each(lanes)('%s / %s refuses source revocation after credential work without retry or disclosure', async (provider, mode) => {
    const { gateway, probe, dispatch } = liveGateway();
    dispatch.mockRestore(); // Keep the real provider executor, factory and credential-audit path.
    const sends = vi.spyOn(probe, 'dispatchProvider');
    const failures = vi.spyOn(probe, 'recordFailure'), fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const { entered, held } = heldCredentialBoundary(mode);
    let current = true;
    const guard = vi.fn(async () => { if (!current) throw new Error('PRIVATE-SOURCE-REVOCATION'); });
    const replacement = vi.fn(async () => {});
    const input = request('test:late-wire-source', { provider, organizationId: 7, userId: 3, beforeDispatch: guard });
    const outcome = gateway.route(input).catch(error => error);
    await entered.promise;
    current = false;
    input.beforeDispatch = replacement;
    held.resolve();
    const error = await outcome;
    expect(error).toBeInstanceOf(GatewayPolicyError);
    expect(error).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(`${String(error)}${JSON.stringify(error)}`).not.toContain('PRIVATE-SOURCE-REVOCATION');
    // Tenant calls also recheck the issued source authority while preparing
    // the exact SDK body, before the held credential audit begins.
    expect(guard).toHaveBeenCalledTimes(mode === 'tenant' ? 3 : 2);
    expect(replacement).not.toHaveBeenCalled();
    expect(wire.create).not.toHaveBeenCalled();
    expect(sends).toHaveBeenCalledTimes(1);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });

  it.each(lanes)('%s / %s cancels during credential work before any SDK call', async (provider, mode) => {
    const { gateway, probe, dispatch } = liveGateway();
    dispatch.mockRestore();
    const failures = vi.spyOn(probe, 'recordFailure'), fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const { entered, held } = heldCredentialBoundary(mode);
    const controller = new AbortController();
    const outcome = gateway.route(request('test:late-wire-cancel', {
      provider, organizationId: 7, userId: 3, signal: controller.signal, beforeDispatch: async () => {},
    })).catch(error => error);
    await entered.promise;
    controller.abort(new Error('PRIVATE-CANCEL-REASON'));
    held.resolve();
    const error = await outcome;
    expect(error).toBeInstanceOf(GatewayAbortedError);
    expect(error).toMatchObject({ phase: 'pre_call' });
    expect(wire.create).not.toHaveBeenCalled();
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });

  it.each(lanes)('%s / %s keeps current-source SDK dispatch reachable', async (provider, mode) => {
    const { gateway, dispatch } = liveGateway();
    dispatch.mockRestore();
    const { entered, held } = heldCredentialBoundary(mode);
    const guard = vi.fn(async () => {});
    const outcome = gateway.route(request('test:late-wire-current', { provider, organizationId: 7, userId: 3, beforeDispatch: guard }));
    await entered.promise;
    expect(wire.create).not.toHaveBeenCalled();
    held.resolve();
    expect((await outcome).content).toBe('Actual SDK boundary fixture.');
    expect(guard).toHaveBeenCalledTimes(3);
    expect(wire.create).toHaveBeenCalledTimes(1);
  });

  it.each(lanes)('%s / %s rechecks cancellation after the final source read awaits', async (provider, mode) => {
    const { gateway, dispatch } = liveGateway();
    dispatch.mockRestore();
    const { entered, held, credentialCompleted } = heldCredentialBoundary(mode);
    const sourceEntered = deferred(), sourceHeld = deferred();
    // Hold the source read after the credential boundary, independently of
    // additional legitimate source checks during SDK-body preparation.
    const guard = async () => { if (credentialCompleted()) { sourceEntered.resolve(); await sourceHeld.promise; } };
    const controller = new AbortController();
    const outcome = gateway.route(request('test:late-source-cancel', {
      provider, organizationId: 7, userId: 3, signal: controller.signal, beforeDispatch: guard,
    })).catch(error => error);
    await entered.promise;
    held.resolve();
    await sourceEntered.promise;
    expect(wire.create).not.toHaveBeenCalled();
    controller.abort();
    sourceHeld.resolve();
    expect(await outcome).toMatchObject({ name: 'GatewayAbortedError', phase: 'pre_call' });
    expect(wire.create).not.toHaveBeenCalled();
  });

});

describe('platform-client continuation at the actual SDK boundary', () => {
  it.each(['anthropic', 'openai'] as const)('%s checks cancellation in the platform-client promise continuation before SDK create', async provider => {
    const { gateway, probe, dispatch } = liveGateway();
    dispatch.mockRestore();
    const controller = new AbortController();
    const resolveClient = probe.tenantProviderClient.bind(probe);
    vi.spyOn(probe, 'tenantProviderClient').mockImplementation(async (...args) => {
      const client = await resolveClient(...args);
      if (client === null) controller.abort();
      return client;
    });
    const failures = vi.spyOn(probe, 'recordFailure'), fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const error = await gateway.route(request('test:platform-continuation-cancel', {
      provider, organizationId: 7, userId: 3, signal: controller.signal, beforeDispatch: async () => {},
    })).catch(error => error);
    expect(error).toMatchObject({ name: 'GatewayAbortedError', phase: 'pre_call' });
    expect(wire.create).not.toHaveBeenCalled();
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetGateway();
  privateIO.client.mockReset().mockResolvedValue(null);
});

describe('gateway current-source dispatch checkpoint', () => {
  it('leaves ordinary no-source calls on the existing path', async () => {
    const { gateway, dispatch } = liveGateway();
    const result = await gateway.route(request('test:ordinary'));
    expect(result.content).toContain('test network seam');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('runs the guard after capacity is granted, refuses queued revocation, and releases the permit', async () => {
    const { gateway, probe, dispatch } = liveGateway();
    const active = deferred();
    const entered = deferred();
    const originalDispatch = dispatch.getMockImplementation()!;
    dispatch.mockImplementation(async (...args) => {
      if (args[1].callerModule === 'test:active') { entered.resolve(); await active.promise; }
      return originalDispatch(...args);
    });
    const limiter = vi.spyOn(probe.outboundLimiter, 'run');
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const first = gateway.route(request('test:active'));
    await entered.promise;
    let current = true;
    const guard = vi.fn(async () => { if (!current) throw new Error('private withdrawal SQL details'); });
    const denied = gateway.route(request('test:queued', { beforeDispatch: guard })).catch(error => error);
    const survivor = gateway.route(request('test:survivor'));
    try {
      await vi.waitFor(() => expect(limiter).toHaveBeenCalledTimes(3));
      expect(guard).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(1);
      current = false;
    } finally {
      active.resolve();
    }
    const [, refusal, result] = await Promise.all([first, denied, survivor]);
    expect(refusal).toBeInstanceOf(GatewayPolicyError);
    expect(String(refusal)).not.toContain('private withdrawal SQL');
    expect(result.content).toContain('test network seam');
    expect(guard).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls.map(([, input]) => input.callerModule)).toEqual(['test:active', 'test:survivor']);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });

  it('captures the original guard before the first route await', async () => {
    const { gateway, dispatch } = liveGateway();
    const original = vi.fn(async () => { throw new Error('original source was revoked'); });
    const replacement = vi.fn(async () => {});
    const input = request('test:capture', { beforeDispatch: original });
    const outcome = gateway.route(input).catch(error => error);
    input.beforeDispatch = replacement;
    expect(await outcome).toBeInstanceOf(GatewayPolicyError);
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['synchronous', 'asynchronous', 'typed source access'])('makes a %s guard refusal terminal and safe without provider-health accounting', async kind => {
    const { gateway, probe, dispatch } = liveGateway();
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const usage = vi.spyOn(probe, 'recordTenantUsage');
    const before = gateway.getProviderHealth().map(row => ({ ...row }));
    const privateMessage = 'private-source-SQL-and-access-detail';
    const cause = kind === 'typed source access' ? new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_CHANGED', privateMessage) : new Error(privateMessage);
    const guard = kind === 'synchronous' ? () => { throw cause; } : async () => { throw cause; };
    const error = await gateway.route(request('test:refusal', { beforeDispatch: guard })).catch(reason => reason);
    expect(error).toBeInstanceOf(GatewayPolicyError);
    expect(error).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(error.message).toMatch(/source/i);
    expect(JSON.stringify({ message: error.message, cause: error.cause })).not.toContain(privateMessage);
    expect(dispatch).not.toHaveBeenCalled();
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
    expect(usage).not.toHaveBeenCalled();
    expect(gateway.getProviderHealth()).toEqual(before);
  });

});

describe('gateway guard validation and repeated dispatch', () => {
  it.each([null, 'pretend guard', 7, {}])('rejects malformed callback %j before placement or dispatch', async value => {
    const { gateway, probe, dispatch } = liveGateway();
    const placement = vi.spyOn(probe, 'applyOrgPlacementDefaults');
    const input = { ...request('test:malformed'), beforeDispatch: value } as unknown as GatewayRequest;
    const error = await gateway.route(input).catch(reason => reason);
    expect(error).toBeInstanceOf(GatewayPolicyError);
    expect(error).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(placement).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('sanitizes a callback getter failure before any await', async () => {
    const { gateway, probe, dispatch } = liveGateway();
    const placement = vi.spyOn(probe, 'applyOrgPlacementDefaults');
    const input = request('test:throwing-getter');
    Object.defineProperty(input, 'beforeDispatch', { get: () => { throw new Error('private callback getter'); } });
    const error = await gateway.route(input).catch(reason => reason);
    expect(error).toBeInstanceOf(GatewayPolicyError);
    expect(error).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(error.message).not.toContain('private callback getter');
    expect(placement).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

});

describe('gateway repeated source checks and cancellation', () => {
  it('rechecks before a primary retry and never dispatches revoked retry work', async () => {
    vi.useFakeTimers();
    const { gateway, probe, dispatch } = liveGateway();
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const guard = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('revoked during retry backoff'));
    dispatch.mockRejectedValue(Object.assign(new Error('provider transient'), { status: 500 }));
    const outcome = gateway.route(request('test:primary-retry', { beforeDispatch: guard })).catch(error => error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toBeInstanceOf(GatewayPolicyError);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });

  it('uses the captured guard on fallback even if the caller replaces the callback', async () => {
    const { gateway, probe, dispatch } = liveGateway();
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const guard = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('revoked before fallback'));
    const replacement = vi.fn(async () => {});
    const input = request('test:fallback', { provider: 'openai', beforeDispatch: guard });
    const primaryError = Object.assign(new Error('primary request shape unavailable'), { status: 400 });
    dispatch.mockImplementation(async () => { input.beforeDispatch = replacement; throw primaryError; });
    const refusal = await gateway.route(input).catch(error => error);
    expect(refusal).toBeInstanceOf(GatewayPolicyError);
    expect(refusal).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(refusal.message).not.toContain('revoked before fallback');
    expect(guard).toHaveBeenCalledTimes(2);
    expect(replacement).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(fallbacks).toHaveBeenCalledTimes(1);
    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures.mock.calls[0][1]).toMatchObject({ status: 400, message: 'Model provider request failed (HTTP 400).' });
    expect(failures.mock.calls[0][1]).not.toBe(primaryError);
  });

  it('also rechecks before retrying a fallback provider', async () => {
    vi.useFakeTimers();
    const { gateway, probe, dispatch } = liveGateway();
    const failures = vi.spyOn(probe, 'recordFailure');
    const guard = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('revoked during fallback backoff'));
    const primaryError = Object.assign(new Error('primary request shape unavailable'), { status: 400 });
    dispatch.mockRejectedValueOnce(primaryError).mockRejectedValue(Object.assign(new Error('fallback transient'), { status: 500 }));
    const outcome = gateway.route(request('test:fallback-retry', { provider: 'openai', beforeDispatch: guard })).catch(error => error);
    await vi.advanceTimersByTimeAsync(5_000);
    const refusal = await outcome;
    expect(refusal).toBeInstanceOf(GatewayPolicyError);
    expect(refusal).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(refusal.message).not.toContain('revoked during fallback backoff');
    expect(guard).toHaveBeenCalledTimes(3);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures.mock.calls[0][1]).toMatchObject({ status: 400, message: 'Model provider request failed (HTTP 400).' });
    expect(failures.mock.calls[0][1]).not.toBe(primaryError);
  });

  it('preserves a transient retry when the source remains current', async () => {
    vi.useFakeTimers();
    const { gateway, dispatch } = liveGateway();
    const success = dispatch.getMockImplementation()!;
    dispatch.mockRejectedValueOnce(Object.assign(new Error('transient'), { status: 500 })).mockImplementation(success);
    const guard = vi.fn(async () => {});
    const outcome = gateway.route(request('test:current-retry', { beforeDispatch: guard }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await outcome).content).toContain('test network seam');
    expect(guard).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each(['resolve', 'reject'])('honors cancellation during a guard wait (%s), releases capacity and never dispatches canceled work', async settlement => {
    const { gateway, probe, dispatch } = liveGateway();
    const entered = deferred();
    const held = deferred();
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const controller = new AbortController();
    const guard = vi.fn(async () => { entered.resolve(); await held.promise; });
    const outcome = gateway.route(request('test:canceled-guard', { beforeDispatch: guard, signal: controller.signal })).catch(error => error);
    await entered.promise;
    const survivor = gateway.route(request('test:after-cancel'));
    controller.abort(new Error('private cancellation reason'));
    if (settlement === 'reject') held.reject(new Error('private guard failure'));
    else held.resolve();
    const error = await outcome;
    expect(error).toBeInstanceOf(GatewayAbortedError);
    expect(error).toMatchObject({ phase: 'pre_call' });
    expect((await survivor).content).toContain('test network seam');
    expect(dispatch.mock.calls.map(([, input]) => input.callerModule)).toEqual(['test:after-cancel']);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });
});

const PRIVATE_CANARY='OWNER_PRIVATE_FINAL_SDK_CANARY_984';
const ownerScope={organizationId:7,userId:3,projectId:42,runId:'private-parent-fixture',threadId:null};
const asOwner=<T>(operation:()=>T)=>runWithTenantScope({tenantId:'7',accountId:3,source:'request',caller:'private-sdk-boundary-fixture'},operation);
function privateSdkFixture(deterministicMode=false,providerAvailable=true){
  const state={current:true,prepared:false,credentialResolved:false,events:[] as string[]};
  const auditQuery=vi.fn(async(sql:string,_args?:unknown[]):Promise<{rows:Record<string,unknown>[]} >=>{
    if(sql.includes('to_regclass'))return{rows:[{present:true}]};
    if(sql.includes('has_table_privilege'))return{rows:[{role:'transport_fixture',can_insert:true}]};
    if(sql.includes('information_schema.columns'))return{rows:LEDGER_COLUMNS.map(column_name=>({column_name}))};
    return{rows:[]};
  });
  const gateway=new AIGateway({deterministicMode,auditEnabled:true,dbPool:{query:auditQuery},providers:[
    {name:'local',enabled:providerAvailable,defaultModel:'local-default',models:[]},
    {name:'openai',enabled:providerAvailable,apiKey:'not-used',defaultModel:'gpt-4o',models:[]}],
    policy:{maxTokensPerRequest:128000,maxRequestsPerMinutePerOrg:10000,maxRequestsPerMinutePerUser:10000,
      blockedPatterns:[],contentFilters:false,piiDetection:false}});
  const sdk=vi.fn(async(_params:unknown)=>({model:'local-default',choices:[{message:{content:'A fixture reply.'},finish_reason:'stop'}],
    usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));
  Object.defineProperty(gateway,'localClient',{value:{chat:{completions:{create:sdk}}}});
  const probe=gateway as unknown as GatewayProbe;
  const placement=vi.spyOn(probe,'applyOrgPlacementDefaults'),dispatch=vi.spyOn(probe,'dispatchProvider');
  const capsule=asOwner(()=>issueOwnerPrivateModelContext({scope:ownerScope,sourceRef:'a'.repeat(64),
    activate:async()=>{state.prepared=true;state.events.push('capture');},
    recheck:async()=>{if(!state.current)throw new Error(`Owner access revoked ${PRIVATE_CANARY}`);},
    expand:async()=>{if(!state.prepared||!state.credentialResolved)throw new Error('Expansion preceded encrypted capture or credential resolution');
      state.events.push('expand');return `Private instruction ${PRIVATE_CANARY}`;}}));
  privateIO.client.mockImplementation(async()=>{state.credentialResolved=true;state.events.push('credential');return null;});
  const within=<T>(operation:()=>T)=>asOwner(()=>runWithOwnerPrivateModelContexts([capsule],operation));
  const input=(extra:Partial<GatewayRequest>={})=>request('test:owner-private',{...ownerScope,provider:'local',model:'local-default',...extra});
  return {gateway,state,sdk,capsule,within,input,placement,dispatch,auditQuery,probe};
}

describe('owner-private final SDK payload boundary',()=>{
  it('expands only after credential resolution and keeps placement, generic dispatch and audit free of raw private text',async()=>{
    const f=privateSdkFixture(),stream=vi.fn();
    const result=await f.within(()=>f.gateway.route(f.input({stream:true,onStream:stream,promptCache:{enabled:true,type:'ephemeral'},
      payloadProvenance:'public',inputSensitivityTiers:[0],metadata:{raw:PRIVATE_CANARY}})));
    expect(result).toMatchObject({provider:'local',cached:false,deterministic:false,content:'A fixture reply.'});
    expect(f.state.events.indexOf('expand')).toBeGreaterThan(f.state.events.indexOf('credential'));
    expect(f.sdk).toHaveBeenCalledTimes(1);expect(JSON.stringify(f.sdk.mock.calls)).toContain(PRIVATE_CANARY);
    expect(stream).not.toHaveBeenCalled();
    expect(f.dispatch.mock.calls[0][1]).toMatchObject({inputSensitivityTiers:[3],stream:false});
    expect(JSON.stringify({placement:f.placement.mock.calls,dispatch:f.dispatch.mock.calls,audit:f.auditQuery.mock.calls})).not.toContain(PRIVATE_CANARY);
    expect(f.auditQuery.mock.calls.some(([sql])=>sql.includes('INSERT INTO ai.gateway_audit_log'))).toBe(true);
    const inserted=f.auditQuery.mock.calls.find(([sql])=>sql.includes('INSERT INTO ai.gateway_audit_log'));
    const metadataText=inserted?.[1]?.[LEDGER_COLUMNS.indexOf('metadata')];
    if(typeof metadataText!=='string')throw new Error('Expected actual serialized metadata INSERT payload');
    expect(JSON.parse(metadataText)).toMatchObject({ownerPrivateContext:{preparedSdkPayload:{provider:'local',model:'local-default',
      sha256:createHash('sha256').update(JSON.stringify(f.sdk.mock.calls[0][0])).digest('hex'),state:'prepared_not_delivery_evidence'}}});
    expect(JSON.stringify(f.sdk.mock.calls)).not.toContain('cache_control');
  });
  it('refuses copied opaque capsules and a different owner before the transport is reached',async()=>{
    const f=privateSdkFixture();
    expect(()=>asOwner(()=>runWithOwnerPrivateModelContexts([JSON.parse(JSON.stringify(f.capsule))],()=>{}))).toThrow();
    expect(()=>runWithTenantScope({tenantId:'7',accountId:4,source:'request',caller:'foreign-owner'},()=>runWithOwnerPrivateModelContexts([f.capsule],()=>{}))).toThrow();
    expect(f.sdk).not.toHaveBeenCalled();
  });
  it('rechecks revoked owner/source after credential resolution and spends no SDK call, retry or fallback',async()=>{
    const f=privateSdkFixture(),failures=vi.spyOn(f.probe,'recordFailure'),fallbacks=vi.spyOn(f.probe,'getFallbackModels');
    privateIO.client.mockImplementation(async()=>{f.state.credentialResolved=true;f.state.current=false;return null;});
    const error=await f.within(()=>f.gateway.route(f.input())).catch(reason=>reason);
    expect(error).toBeInstanceOf(GatewayPolicyError);expect(JSON.stringify({message:error.message,cause:error.cause})).not.toContain(PRIVATE_CANARY);
    expect(f.sdk).not.toHaveBeenCalled();expect(f.state.events).not.toContain('expand');expect(failures).not.toHaveBeenCalled();expect(fallbacks).not.toHaveBeenCalled();
  });
  it('keeps a forged public tier at T3 and refuses a frontier request before private expansion',async()=>{
    const f=privateSdkFixture();
    await expect(f.within(()=>f.gateway.route(f.input({provider:'openai',model:'gpt-4o',payloadProvenance:'public',inputSensitivityTiers:[0]})))).rejects.toThrow('DENY_INPUT_TIER');
    expect(f.sdk).not.toHaveBeenCalled();expect(f.state.events).not.toContain('expand');
    expect(JSON.stringify(f.auditQuery.mock.calls)).not.toContain(PRIVATE_CANARY);
  });
  it.each(['deterministic','unavailable'])('refuses a %s provider instead of releasing a demo or cached private answer',async mode=>{
    const f=privateSdkFixture(mode==='deterministic',mode!=='unavailable');
    await expect(f.within(()=>f.gateway.route(f.input()))).rejects.toMatchObject({code:'OWNER_PRIVATE_CONTEXT_UNAVAILABLE'});
    expect(f.sdk).not.toHaveBeenCalled();expect(f.state.events).not.toContain('expand');
  });
  it('accepts the actual host-issued child lineage and refuses identical serialized parent-run claims',async()=>{
    const f=privateSdkFixture();
    const raw=f.input({runId:'actual-child-fixture',parentRunId:ownerScope.runId});
    await expect(f.within(()=>f.gateway.route(raw))).rejects.toMatchObject({code:'OWNER_PRIVATE_CONTEXT_UNAVAILABLE'});
    expect(f.sdk).not.toHaveBeenCalled();
    const admitted=await f.within(()=>f.gateway.route(bindOwnerPrivateModelChildRequest(raw)));
    expect(admitted.content).toBe('A fixture reply.');expect(f.sdk).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.dispatch.mock.calls)).not.toContain(PRIVATE_CANARY);
  });
});
