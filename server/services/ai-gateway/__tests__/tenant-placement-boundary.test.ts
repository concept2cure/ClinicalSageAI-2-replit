/**
 * Tenant placement boundary — every dispatch honours the tenant's floor.
 *
 * Launch row D6 (per-tenant data-retention and residency statement), W2 gateway
 * scope. The DoD, DPA §6.1 and the trust statement already promise that "a
 * tenant's residency or zero-data-retention policy decides which providers it
 * may reach; the ladder never fails over across that boundary". These tests pin
 * that promise at route() level, where it was not true:
 *
 *   - `allowed_substrates` was never read at selection, and content the PHI/PII
 *     screen classes `none` (CMC, unpublished efficacy, IP — the data pharma
 *     will not send to a shared frontier API) passed the last mile unchecked;
 *   - a request's own `zeroDataRetention: false` or `dataResidency` beat the
 *     org's floor;
 *   - a caller that omitted `organizationId` was never bound to its tenant,
 *     even inside the tenant's request scope;
 *   - a policy lookup failure read as "no policy";
 *   - an on-prem tenant with no self-hosted lane got "No AI provider is
 *     configured" instead of a placement refusal.
 *
 * Provider-neutral by construction: OpenAI, Moonshot (Kimi) and Anthropic's
 * first-party API are all `frontier_shared` and are held to the same floor;
 * the per-tenant vendor allow-list (`allowedProviders`) decides which of them a
 * tenant may reach at all.
 *
 * Every case here was run against the pre-change gateway first and failed
 * there; the red run is filed under docs/evidence/D6/.
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

import { AIGateway, GatewayPolicyError } from '../gateway';
import {
  setOrgPlacementResolver,
  resetOrgPlacementResolver,
  type OrgPlacementPolicy,
} from '../providers/org-placement';
import { resolvePlacement, resetPlacementRegistry } from '../providers/placement';
import { runWithSystemTenantScope, runWithTenantScope } from '../../../db/tenantStore';
import type { GatewayRequest, ProviderName } from '../types';

const ORG = 42;
/** Deliberately non-personal: the case the PHI/PII screen classes `none`. */
const CONFIDENTIAL_TEXT =
  'Summarize the unpublished 12-month stability results for lot 7 of the drug substance.';

function buildGateway(
  providers: ProviderName[],
  opts: { auditEnabled?: boolean; piiDetection?: boolean } = {},
): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: opts.auditEnabled ?? false,
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
      piiDetection: opts.piiDetection ?? true,
    },
  });
}

/** Fake the SDK call. A provider listed in `failFor` answers 400 (no retry, walks the ladder). */
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

function dispatchedProviders(spy: ReturnType<typeof stubDispatch>): ProviderName[] {
  return spy.mock.calls.map(call => (call[0] as { provider: ProviderName }).provider);
}

function useTenantPolicy(policy: OrgPlacementPolicy | null | Error) {
  setOrgPlacementResolver({
    async resolve(orgId) {
      if (Number(orgId) !== ORG) return null;
      if (policy instanceof Error) throw policy;
      return policy;
    },
  });
}

function chat(extra: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    taskType: 'chat',
    messages: [{ role: 'user', content: CONFIDENTIAL_TEXT }],
    ...extra,
  };
}

function enforceLikeProduction() {
  process.env.NODE_ENV = 'production';
  process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
}

// Environment and resolver state, reset around every case in this file.
const saved = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
  delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
  delete process.env.ANTHROPIC_ZERO_RETENTION;
  delete process.env.OPENAI_ZERO_RETENTION;
  delete process.env.AI_BEDROCK_RESIDENCY;
  resetPlacementRegistry();
});

afterEach(() => {
  process.env = { ...saved };
  resetPlacementRegistry();
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
  logSpies.info.mockClear();
  logSpies.warn.mockClear();
});

describe('tenant placement boundary (D6) — selection honours the tenant floor for every data class', () => {
  it('a tenant restricted to self_hosted is served only on the self-hosted lane', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['anthropic', 'openai', 'moonshot', 'local']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat({ organizationId: ORG }));

    const providers = dispatchedProviders(dispatch);
    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      expect(resolvePlacement(provider).substrate).toBe('self_hosted');
    }
  });

  it('with no permitted lane the request is refused as a tenant-policy decision and no SDK is called', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['anthropic', 'openai', 'moonshot']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat({ organizationId: ORG }))).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_TENANT_POLICY'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('the vendor allow-list is honoured on every rung: Kimi is never reached when the tenant lists only Claude and OpenAI', async () => {
    useTenantPolicy({ allowedProviders: ['anthropic', 'openai'] });
    const gateway = buildGateway(['anthropic', 'openai', 'moonshot']);
    const dispatch = stubDispatch(gateway, ['anthropic', 'openai']);

    await expect(gateway.route(chat({ organizationId: ORG }))).rejects.toThrow();
    expect(dispatchedProviders(dispatch)).not.toContain('moonshot');
    expect(dispatchedProviders(dispatch).length).toBeGreaterThan(0);
  });

  it('the fallback ladder never crosses into a substrate the tenant has not allowed', async () => {
    useTenantPolicy({ allowedSubstrates: ['frontier_private'] });
    const gateway = buildGateway(['bedrock', 'anthropic', 'openai', 'moonshot']);
    const dispatch = stubDispatch(gateway, ['bedrock']);

    await expect(gateway.route(chat({ organizationId: ORG }))).rejects.toThrow();
    for (const provider of dispatchedProviders(dispatch)) {
      expect(resolvePlacement(provider).substrate).toBe('frontier_private');
    }
  });
});

describe('tenant placement boundary (D6) — the tenant floor cannot be lowered by the request', () => {
  it('a request zeroDataRetention:false does not defeat the org zero-retention floor', async () => {
    useTenantPolicy({ zeroDataRetention: true });
    const gateway = buildGateway(['anthropic', 'openai', 'moonshot']); // none contractually ZDR here
    const dispatch = stubDispatch(gateway);

    await expect(
      gateway.route(chat({ organizationId: ORG, zeroDataRetention: false })),
    ).rejects.toMatchObject({ name: GatewayPolicyError.name });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a request residency that contradicts the tenant residency is refused, not silently honoured', async () => {
    process.env.AI_BEDROCK_RESIDENCY = 'us';
    resetPlacementRegistry();
    useTenantPolicy({ residency: 'eu' });
    const gateway = buildGateway(['bedrock', 'anthropic']);
    const dispatch = stubDispatch(gateway);

    await expect(
      gateway.route(chat({ organizationId: ORG, dataResidency: 'us' })),
    ).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_TENANT_POLICY'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('tenant placement boundary (D6) — the tenant is bound even when the caller forgets to say which', () => {
  it('binds the tenant from the ambient request scope when organizationId is omitted', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway);

    await expect(
      runWithTenantScope({ tenantId: String(ORG), role: null, source: 'request' }, () =>
        gateway.route(chat()),
      ),
    ).rejects.toMatchObject({ name: GatewayPolicyError.name });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('under enforcement, a call with no tenant binding at all is refused for a tenant payload', async () => {
    enforceLikeProduction();
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat())).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_TENANT_POLICY'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('platform work in the explicit system scope is not refused (it carries no tenant)', async () => {
    enforceLikeProduction();
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await runWithSystemTenantScope('tenant-placement-boundary.test', () => gateway.route(chat()));
    expect(dispatchedProviders(dispatch)).toEqual(['anthropic']);
  });
});

describe('tenant placement boundary (D6) — an unknown policy fails closed where enforcement is on', () => {
  it('under enforcement, a policy lookup failure refuses the tenant payload', async () => {
    enforceLikeProduction();
    useTenantPolicy(new Error('connection terminated'));
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat({ organizationId: ORG }))).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_TENANT_POLICY'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('outside enforcement, a lookup failure is recorded and the request still runs', async () => {
    useTenantPolicy(new Error('connection terminated'));
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat({ organizationId: ORG }));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('an on-prem tenant with no self-hosted lane gets a placement refusal, not "No AI provider is configured"', async () => {
    enforceLikeProduction();
    useTenantPolicy({ residency: 'on_prem' });
    const gateway = buildGateway(['anthropic', 'openai']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat({ organizationId: ORG }))).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_TENANT_POLICY'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('tenant placement boundary (D6) — the last mile re-checks the floor before any SDK call', () => {
  it('refuses a disallowed substrate even when selection is bypassed', async () => {
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);
    const anthropicModel = (gateway as any).models.find(
      (m: { provider: string; enabled: boolean }) => m.provider === 'anthropic' && m.enabled,
    );
    expect(anthropicModel).toBeTruthy();

    const request: GatewayRequest = {
      ...chat({ organizationId: ORG }),
      sensitiveDataClass: 'none',
      sensitiveTenantPolicy: { resolution: 'resolved', allowedSubstrates: ['self_hosted'] },
    };
    await expect(
      (gateway as any).executeProvider(anthropicModel, request, 'req-1', Date.now()),
    ).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_TENANT_POLICY'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('performance qualification resolves the tenant floor before it reaches a model', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);
    const anthropicModel = (gateway as any).models.find(
      (m: { provider: string; enabled: boolean }) => m.provider === 'anthropic' && m.enabled,
    );

    await expect(
      gateway.evaluateModel(anthropicModel.id, chat({ organizationId: ORG })),
    ).rejects.toMatchObject({ name: GatewayPolicyError.name });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('tenant placement boundary (D6) — embeddings are held to the same floor', () => {
  it('refuses to embed a self_hosted-only tenant on a shared embedding service', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['openai']);

    await expect(
      gateway.authorizeEmbedding({ organizationId: ORG, provider: 'openai', texts: [CONFIDENTIAL_TEXT] }),
    ).rejects.toMatchObject({ name: GatewayPolicyError.name });
  });
});

describe('tenant placement boundary (D6) — public-source payloads reach a shared API only on the tenant\'s opt-in', () => {
  it('without the opt-in, a public payload stays on the tenant\'s allowed lane', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'], publicSourceFrontier: false });
    const gateway = buildGateway(['anthropic', 'local']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat({ organizationId: ORG, payloadProvenance: 'public' }));
    for (const provider of dispatchedProviders(dispatch)) {
      expect(resolvePlacement(provider).substrate).toBe('self_hosted');
    }
  });

  it('with the opt-in, a public payload may reach a shared frontier API', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'], publicSourceFrontier: true });
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat({ organizationId: ORG, payloadProvenance: 'public' }));
    expect(dispatchedProviders(dispatch)).toEqual(['anthropic']);
  });

  it('the opt-in never opens the shared API to a tenant payload', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'], publicSourceFrontier: true });
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat({ organizationId: ORG }))).rejects.toMatchObject({
      name: GatewayPolicyError.name,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// Review findings, 2026-09-26: the refusal and ledger rows the evidence
// claims were never observed (every case above ran with auditEnabled:false),
// and the "piiDetection off" half of the old last-mile defect was unpinned.
describe('tenant placement boundary (D6) — what the ledger records', () => {
  const entries = (gateway: AIGateway): any[] => (gateway as any).auditLogger.getRecentEntries();

  it('a refusal writes one content-free row naming the tenant-placement detector, reason and stage', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['anthropic', 'openai'], { auditEnabled: true });
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat({ organizationId: ORG, callerModule: 'test:refusal' }))).rejects.toMatchObject({
      name: GatewayPolicyError.name,
    });

    expect(dispatch).not.toHaveBeenCalled();
    const rows = entries(gateway);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'none',
      success: false,
      organizationId: ORG,
      callerModule: 'test:refusal',
      metadata: {
        tenantPlacement: { reasonCode: 'DENY_TENANT_POLICY', stage: 'selection', resolution: 'resolved', boundFrom: 'explicit' },
        contentPolicy: { findings: [expect.objectContaining({ detector: 'tenant_placement_policy', action: 'block' })] },
      },
    });
    expect(JSON.stringify(rows[0])).not.toContain('unpublished 12-month stability');
  });

  it('a served call records how the tenant was bound and under which floor', async () => {
    useTenantPolicy({ allowedSubstrates: ['frontier_shared'] });
    const gateway = buildGateway(['anthropic'], { auditEnabled: true });
    stubDispatch(gateway);

    await runWithTenantScope({ tenantId: String(ORG), role: null, source: 'test' }, () => gateway.route(chat()));

    const served = entries(gateway).find(e => e.success);
    expect(served?.organizationId).toBe(String(ORG));
    expect(served?.metadata?.tenantPlacement).toMatchObject({
      resolution: 'resolved',
      boundFrom: 'ambient_scope',
      payloadProvenance: 'tenant_governed',
    });
  });
});

describe('tenant placement boundary (D6) — the floor holds with the PHI/PII screen off', () => {
  it('route() refuses a disallowed lane when piiDetection is off', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['anthropic', 'openai'], { piiDetection: false });
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat({ organizationId: ORG }))).rejects.toThrow(/DENY_TENANT_POLICY/);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('the last mile refuses a disallowed lane when piiDetection is off, even if selection is bypassed', async () => {
    const gateway = buildGateway(['anthropic'], { piiDetection: false });
    const dispatch = stubDispatch(gateway);
    const modelConfig = (gateway as any).models.find((m: { provider: string }) => m.provider === 'anthropic');

    await expect(
      (gateway as any).executeProvider(
        modelConfig,
        chat({
          organizationId: ORG,
          sensitiveTenantPolicy: { resolution: 'resolved', organizationId: ORG, allowedSubstrates: ['self_hosted'] },
        }),
        'req-pii-off',
        Date.now(),
      ),
    ).rejects.toThrow(/DENY_TENANT_POLICY/);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
