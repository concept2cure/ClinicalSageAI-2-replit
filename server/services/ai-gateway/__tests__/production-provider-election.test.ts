/**
 * Production provider election — ADR-0014 §1, plan item P1-45 (INF-21, DP-07).
 *
 * The DPA says OpenAI and Moonshot are "disabled for a tenant unless its Order
 * Form lists them". Until this change the code did not say so: an organization
 * with no placement row (or a row whose allowedProviders is NULL) read as "no
 * vendor constraint", so in production a tenant's content reached OpenAI as
 * soon as Anthropic failed and an OpenAI key was configured — and Moonshot
 * (Kimi) whenever its key was.
 *
 * Pinned here, in production (NODE_ENV=production) only:
 *  - With no election, the tenant's lanes are the vendors already on the
 *    default sub-processor list or involving no third party: anthropic,
 *    bedrock, local. OpenAI, Azure and Vertex are reached only when the
 *    tenant's placement policy names them — on the primary, on every fallback
 *    rung, streaming or with tools, and at the last mile.
 *  - When no elected lane can answer, the request fails with the honest
 *    unavailable error (503), never with a provider the tenant did not choose.
 *  - Moonshot is never a production lane: not initialised, never routed to,
 *    even when a key slipped through and even when a stored policy names it.
 *  - A request with no organization (platform scope) gets the default set.
 * Development and test behaviour is unchanged (the last describe block).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logSpies = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => logSpies,
  createContextLogger: () => logSpies,
  logger: logSpies,
  default: logSpies,
}));

import { AIGateway, GatewayAllProvidersFailedError, GatewayPolicyError } from '../gateway';
import { classifyGatewayError, GATEWAY_ERROR_HTTP_STATUS } from '../gateway-error-map';
import {
  resetOrgPlacementResolver,
  setOrgPlacementResolver,
  type OrgPlacementPolicy,
} from '../providers/org-placement';
import { resetPlacementRegistry } from '../providers/placement';
import { runWithSystemTenantScope } from '../../../db/tenantStore';
import type { GatewayRequest, ProviderName } from '../types';

const ORG = 4501;
/** Non-personal, so the PHI/PII screen classes it `none` and only the election decides. */
const TENANT_TEXT = 'Summarize the unpublished 12-month stability results for lot 7 of the drug substance.';

function buildGateway(providers: ProviderName[]): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: false,
    providers: providers.map(name => ({
      name,
      enabled: true,
      apiKey: 'not-used',
      defaultModel: 'not-used',
      models: [],
    })),
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      contentFilters: true,
      piiDetection: true,
    },
  });
}

/** Fake the SDK call. A provider in `failFor` answers 400: not retried, walks the ladder. */
function stubDispatch(gateway: AIGateway, failFor: ProviderName[] = []) {
  return vi.spyOn(gateway as any, 'dispatchProvider').mockImplementation(async (model: any) => {
    if (failFor.includes(model.provider)) {
      const err: any = new Error(`simulated ${model.provider} failure`);
      err.status = 400;
      throw err;
    }
    return {
      content: 'ok',
      provider: model.provider,
      model: model.model,
      requestId: 'fake',
      latencyMs: 1,
      cached: false,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    };
  });
}

function dispatched(spy: ReturnType<typeof stubDispatch>): ProviderName[] {
  return spy.mock.calls.map(call => (call[0] as { provider: ProviderName }).provider);
}

function usePolicy(policy: OrgPlacementPolicy | null) {
  setOrgPlacementResolver({
    async resolve(orgId) {
      return Number(orgId) === ORG ? policy : null;
    },
  });
}

function chat(extra: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    taskType: 'chat',
    organizationId: ORG,
    messages: [{ role: 'user', content: TENANT_TEXT }],
    ...extra,
  };
}

function production() {
  process.env.NODE_ENV = 'production';
  process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
}

/** The route-level answer a caller would give: code and HTTP status. */
function httpOutcome(err: unknown): { code: string; status: number } {
  const { code } = classifyGatewayError(err);
  return { code, status: GATEWAY_ERROR_HTTP_STATUS[code] };
}

const saved = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  for (const key of [
    'AI_SENSITIVE_DATA_POLICY_MODE',
    'AI_PII_ENFORCEMENT',
    'AI_PROVIDER_PLACEMENT_APPROVALS',
    'ANTHROPIC_ZERO_RETENTION',
    'OPENAI_ZERO_RETENTION',
    'AI_BEDROCK_RESIDENCY',
    'KIMI_API_KEY',
    'MOONSHOT_API_KEY',
    'AI_GATEWAY_DETERMINISTIC',
    'DETERMINISTIC_MODE',
  ]) {
    delete process.env[key];
  }
  resetPlacementRegistry();
});

afterEach(() => {
  process.env = { ...saved };
  resetPlacementRegistry();
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

describe('P1-45 production: an organization with no election never reaches OpenAI', () => {
  it('no placement row + Anthropic failing → no OpenAI call, and the honest 503', async () => {
    production();
    usePolicy(null);
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway, ['anthropic']);

    const err = await gateway.route(chat()).catch(e => e);

    expect(dispatched(dispatch)).not.toContain('openai');
    expect(dispatched(dispatch).length).toBeGreaterThan(0);
    expect(dispatched(dispatch).every(p => p === 'anthropic')).toBe(true);
    expect(err).toBeInstanceOf(GatewayAllProvidersFailedError);
    expect(httpOutcome(err)).toEqual({ code: 'PROVIDER_UNAVAILABLE', status: 503 });
  });

  it('a row whose allowedProviders is NULL is the default set too: no OpenAI fallback', async () => {
    production();
    usePolicy({ residency: undefined, zeroDataRetention: false, allowedProviders: undefined });
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway, ['anthropic']);

    const err = await gateway.route(chat()).catch(e => e);

    expect(dispatched(dispatch)).not.toContain('openai');
    expect(httpOutcome(err).status).toBe(503);
  });

  it('streaming and tool-bearing requests inherit the same election', async () => {
    production();
    usePolicy(null);
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway, ['anthropic']);

    await gateway.route(chat({ stream: true, onStream: () => undefined })).catch(() => undefined);
    await gateway
      .route(
        chat({
          tools: [
            { name: 'lookup', description: 'look up', input_schema: { type: 'object', properties: {} } },
          ] as any,
        }),
      )
      .catch(() => undefined);

    expect(dispatched(dispatch)).not.toContain('openai');
  });

  it('a caller that names OpenAI does not get it without the election', async () => {
    production();
    usePolicy(null);
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat({ provider: 'openai' })).catch(() => undefined);

    expect(dispatched(dispatch)).not.toContain('openai');
  });

  it('the last mile refuses OpenAI when selection is bypassed', async () => {
    production();
    const gateway = buildGateway(['openai']);
    const dispatch = stubDispatch(gateway);
    const openaiModel = (gateway as any).models.find((m: any) => m.provider === 'openai' && m.enabled);
    expect(openaiModel).toBeTruthy();

    await expect(
      (gateway as any).executeProvider(
        openaiModel,
        chat({
          sensitiveDataClass: 'none',
          sensitiveTenantPolicy: { resolution: 'absent', organizationId: ORG, boundFrom: 'explicit' },
        }),
        'req-last-mile',
        Date.now(),
      ),
    ).rejects.toMatchObject({ name: GatewayPolicyError.name, message: expect.stringContaining('DENY_TENANT_POLICY') });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Azure and Vertex are not default lanes either', async () => {
    production();
    usePolicy(null);
    const gateway = buildGateway(['anthropic', 'azure', 'vertex']);
    const dispatch = stubDispatch(gateway, ['anthropic']);

    await gateway.route(chat()).catch(() => undefined);

    expect(dispatched(dispatch)).not.toContain('azure');
    expect(dispatched(dispatch)).not.toContain('vertex');
  });

  it('a public payload the tenant opted in still does not reach a vendor it never named', async () => {
    production();
    usePolicy({ allowedProviders: ['anthropic'], publicSourceFrontier: true, publicSourceEgress: true });
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway, ['anthropic']);

    await gateway.route(chat({ payloadProvenance: 'public' })).catch(() => undefined);

    expect(dispatched(dispatch)).not.toContain('openai');
  });
});

describe('P1-45 production: no elected lane configured, or no organization bound', () => {
  it('with OpenAI the only configured lane, the request is refused and OpenAI is never called', async () => {
    production();
    usePolicy(null);
    const gateway = buildGateway(['openai']);
    const dispatch = stubDispatch(gateway);

    const err = await gateway.route(chat()).catch(e => e);

    expect(dispatch).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(GatewayPolicyError);
    expect(String(err?.message)).toMatch(/openai is not an AI service the organization has elected/);
    // No default lane is configured at all, so this is the existing terminal,
    // audited tenant-placement refusal — not the 503 an Anthropic outage gets.
    // A 503 here is a gateway-error-map.ts decision (P1-45 README, residual 1).
    expect(httpOutcome(err)).toEqual({ code: 'PLACEMENT_REFUSED', status: 403 });
  });

  it('platform work with no organization (system scope) gets the default set', async () => {
    production();
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway, ['anthropic']);

    await runWithSystemTenantScope('production-provider-election.test', () =>
      gateway.route(chat({ organizationId: undefined })),
    ).catch(() => undefined);

    expect(dispatched(dispatch).length).toBeGreaterThan(0);
    expect(dispatched(dispatch)).not.toContain('openai');
  });
});

describe('P1-45 production: an organization that elected OpenAI keeps it', () => {
  it("allowedProviders ['anthropic','openai'] + Anthropic failing → the OpenAI fallback still answers", async () => {
    production();
    usePolicy({ allowedProviders: ['anthropic', 'openai'] });
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway, ['anthropic']);

    const response = await gateway.route(chat());

    expect(response.provider).toBe('openai');
    expect(dispatched(dispatch)).toContain('anthropic');
    expect(dispatched(dispatch).at(-1)).toBe('openai');
  });

  it("allowedProviders ['openai'] alone is honoured: OpenAI is the tenant's lane", async () => {
    production();
    usePolicy({ allowedProviders: ['openai'] });
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway);

    const response = await gateway.route(chat());

    expect(response.provider).toBe('openai');
    expect(dispatched(dispatch)).toEqual(['openai']);
  });
});

describe('P1-45 production: Moonshot (Kimi) is never a lane', () => {
  it('a Moonshot key that slipped through initialises no client and enables no model', () => {
    production();
    process.env.MOONSHOT_API_KEY = 'sk-slipped-through';
    process.env.KIMI_API_KEY = 'sk-slipped-through';
    const gateway = new AIGateway({ deterministicMode: false, auditEnabled: false });

    expect((gateway as any).moonshotClient).toBeNull();
    expect(gateway.getEnabledProviders()).not.toContain('moonshot');
    expect(gateway.getModels().filter(m => m.provider === 'moonshot' && m.enabled)).toEqual([]);
  });

  it('an override that enables moonshot is dropped in production too', () => {
    production();
    const gateway = buildGateway(['anthropic', 'moonshot']);

    expect((gateway as any).moonshotClient).toBeNull();
    expect(gateway.getModels().filter(m => m.provider === 'moonshot' && m.enabled)).toEqual([]);
  });

  it('a stored policy that names moonshot does not make it reachable', async () => {
    production();
    usePolicy({ allowedProviders: ['anthropic', 'moonshot'] });
    const gateway = buildGateway(['anthropic', 'moonshot']);
    // Force the model on, as if the registry had been tampered with, to prove
    // the dispatch predicate refuses it independently of initialisation.
    for (const m of (gateway as any).models) if (m.provider === 'moonshot') m.enabled = true;
    const dispatch = stubDispatch(gateway, ['anthropic']);

    const err = await gateway.route(chat()).catch(e => e);

    expect(dispatched(dispatch)).not.toContain('moonshot');
    expect(httpOutcome(err).status).toBe(503);
  });
});

describe('P1-45 outside production: behaviour unchanged', () => {
  it('no placement row + Anthropic failing → falls back to OpenAI as before', async () => {
    usePolicy(null);
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway, ['anthropic']);

    const response = await gateway.route(chat());

    expect(response.provider).toBe('openai');
    expect(dispatched(dispatch)).toContain('openai');
  });

  it('Moonshot stays a development lane', () => {
    process.env.NODE_ENV = 'development';
    const gateway = buildGateway(['anthropic', 'moonshot']);

    expect((gateway as any).moonshotClient).not.toBeNull();
    expect(gateway.getModels().some(m => m.provider === 'moonshot' && m.enabled)).toBe(true);
  });
});
