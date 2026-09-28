/**
 * Anthropic-hosted tools reach only first-party Anthropic, and only for a
 * tenant that opted in (D6, W2 gateway scope; plan WS2, OQ-PL-06/07).
 *
 * `web_search`, `web_fetch` and `code_execution` run on Anthropic's
 * infrastructure. Until 2026-09-26 the gateway forwarded whatever tools it was
 * given, verbatim, to Bedrock and Vertex, which either cannot run them or, on
 * Vertex, run hosted search the tenant never chose. Every tenant got them
 * alike, whatever its placement policy said. These cases pin the rule at
 * route() level, where the fake SDK call sees exactly what would have been
 * sent. Each was run against the pre-change gateway first and failed there.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logSpies = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
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
import { resetPlacementRegistry } from '../providers/placement';
import type { GatewayRequest, ProviderName } from '../types';

const ORG = 42;
const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };
const WEB_FETCH = { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 };
const CODE_EXECUTION = { type: 'code_execution_20260120', name: 'code_execution' };
const LOOKUP = {
  name: 'lookup_ich_guideline',
  description: 'Look up an ICH guideline',
  input_schema: { type: 'object', properties: { code: { type: 'string' } } },
};
/** An opted-in tenant: public-source research may use shared frontier infrastructure. */
const OPTED_IN: OrgPlacementPolicy = { publicSourceFrontier: true, publicSourceEgress: true };

function buildGateway(providers: ProviderName[]): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: false,
    providers: providers.map(name => ({ name, enabled: true, apiKey: 'not-used', defaultModel: 'not-used', models: [] })),
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

function stubDispatch(gateway: AIGateway) {
  return vi.spyOn(gateway as any, 'dispatchProvider').mockImplementation(async (model: any) => ({
    content: 'ok',
    provider: model.provider,
    model: model.model,
    requestId: 'fake',
    latencyMs: 1,
    cached: false,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
  }));
}

/** What the fake SDK call was handed. */
function sent(spy: ReturnType<typeof stubDispatch>, call = 0): GatewayRequest {
  return spy.mock.calls[call][1] as GatewayRequest;
}
const toolNames = (r: GatewayRequest) => (r.tools ?? []).map(t => (t as { name: string }).name);

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
    organizationId: ORG,
    messages: [{ role: 'user', content: 'What does the current ICH E6(R3) say about risk-based monitoring?' }],
    tools: [LOOKUP, WEB_SEARCH, WEB_FETCH] as GatewayRequest['tools'],
    ...extra,
  };
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
  delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
  delete process.env.ANTHROPIC_ZERO_RETENTION;
  resetPlacementRegistry();
});
afterEach(() => {
  process.env = { ...saved };
  resetPlacementRegistry();
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

describe('hosted tools never reach a lane that is not first-party Anthropic', () => {
  it('Bedrock is sent the custom tools and none of the hosted ones', async () => {
    useTenantPolicy(OPTED_IN);
    const gateway = buildGateway(['bedrock']);
    const dispatch = stubDispatch(gateway);

    const response = await gateway.route(chat());

    expect(sent(dispatch).tools).toBeDefined();
    expect(toolNames(sent(dispatch))).toEqual(['lookup_ich_guideline']);
    expect(response.withheldServerTools).toEqual([
      { name: 'web_search', reason: 'not_first_party' },
      { name: 'web_fetch', reason: 'not_first_party' },
    ]);
  });

  it('a tool choice that named a withheld tool is dropped with it', async () => {
    useTenantPolicy(OPTED_IN);
    const gateway = buildGateway(['vertex']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat({ tools: [WEB_SEARCH] as GatewayRequest['tools'], toolChoice: { type: 'tool', name: 'web_search' } }));

    expect(sent(dispatch).tools).toBeUndefined();
    expect(sent(dispatch).toolChoice).toBeUndefined();
  });
});

describe('first-party Anthropic runs hosted tools only for a tenant that opted in', () => {
  it('a tenant with no placement policy has not opted in', async () => {
    useTenantPolicy(null);
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    const response = await gateway.route(chat());

    expect(toolNames(sent(dispatch))).toEqual(['lookup_ich_guideline']);
    expect(response.withheldServerTools?.map(w => w.reason)).toEqual(['tenant_not_opted_in', 'tenant_not_opted_in']);
  });

  it('an opted-in tenant gets web search and web fetch on first-party Anthropic', async () => {
    useTenantPolicy(OPTED_IN);
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    const response = await gateway.route(chat());

    expect(toolNames(sent(dispatch))).toEqual(['lookup_ich_guideline', 'web_search', 'web_fetch']);
    expect(response.withheldServerTools).toBeUndefined();
  });

  it('a zero-retention tenant is not offered hosted tools, even with the opt-in', async () => {
    process.env.ANTHROPIC_ZERO_RETENTION = 'true';
    resetPlacementRegistry();
    useTenantPolicy({ ...OPTED_IN, zeroDataRetention: true });
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat());

    expect(toolNames(sent(dispatch))).toEqual(['lookup_ich_guideline']);
  });

  it('a tenant that turned public-source egress off is not offered them', async () => {
    useTenantPolicy({ ...OPTED_IN, publicSourceEgress: false });
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat());

    expect(toolNames(sent(dispatch))).toEqual(['lookup_ich_guideline']);
  });

  it('a policy that could not be read withholds them, even where the request itself may run', async () => {
    useTenantPolicy(new Error('connection reset'));
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    const response = await gateway.route(chat());

    expect(toolNames(sent(dispatch))).toEqual(['lookup_ich_guideline']);
    expect(response.withheldServerTools?.[0]).toEqual({ name: 'web_search', reason: 'tenant_policy_unknown' });
  });

  it('code execution never runs a tenant payload on Anthropic’s sandbox', async () => {
    useTenantPolicy(OPTED_IN);
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    const response = await gateway.route(chat({ tools: [LOOKUP, CODE_EXECUTION] as GatewayRequest['tools'] }));

    expect(toolNames(sent(dispatch))).toEqual(['lookup_ich_guideline']);
    expect(response.withheldServerTools).toEqual([
      { name: 'code_execution', reason: 'tenant_data_to_hosted_execution' },
    ]);
  });
});

describe('a document referenced by Anthropic file id is read only by first-party Anthropic', () => {
  const fileDoc = (): GatewayRequest['messages'] => [
    {
      role: 'user',
      content: 'Summarise the attached protocol.',
      contentBlocks: [
        { type: 'document', source: { type: 'file', file_id: 'file_011abc' } },
        { type: 'text', text: 'Summarise the attached protocol.' },
      ],
    } as GatewayRequest['messages'][number],
  ];

  it('is refused on Bedrock before any call, not sent with the Files-API header', async () => {
    useTenantPolicy(null);
    const gateway = buildGateway(['bedrock']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat({ tools: undefined, messages: fileDoc() }))).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringMatching(/^FILE_REFERENCE_NOT_CARRIED/),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('is sent to first-party Anthropic', async () => {
    useTenantPolicy(null);
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await gateway.route(chat({ tools: undefined, messages: fileDoc() }));

    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
