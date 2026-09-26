/**
 * Every AI ledger row records what the call carried and under which
 * governance (D6, plan WS3).
 *
 * Until 2026-09-26 a served row in ai.gateway_audit_log recorded the model and
 * the placement's substrate and region, and nothing else about governance:
 * not the payload's provenance or data class, not how the tenant was bound or
 * its policy resolved, not the placement decision (an allowed call's went to a
 * log line only), not the approved-models entry, its pinned version or its PQ
 * status, not the risk tier, not the AnA run. The prompt hash skipped image and
 * document blocks, and the region column recorded the requested residency
 * whatever served the call. These cases pin each, reading the rows the gateway
 * hands its ledger writer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const logSpies = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => logSpies,
  createContextLogger: () => logSpies,
  logger: logSpies,
  default: logSpies,
}));

import { AIGateway } from '../gateway';
import { resetOrgPlacementResolver, setOrgPlacementResolver, type OrgPlacementPolicy } from '../providers/org-placement';
import { resetPlacementRegistry } from '../providers/placement';
import { APPROVED_MODELS } from '../../ai-governance/approved-models';
import type { GatewayRequest, ProviderName } from '../types';

const ORG = 42;

function buildGateway(providers: ProviderName[]): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: true,
    providers: providers.map(name => ({ name, enabled: true, apiKey: 'x', defaultModel: 'x', models: [] })),
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

/** Fake the SDK; `served` overrides what the fake reports serving. */
function stubDispatch(gateway: AIGateway, served: { model?: string; serverToolUses?: Array<{ name: string }> } = {}) {
  return vi.spyOn(gateway as any, 'dispatchProvider').mockImplementation(async (model: any) => ({
    content: 'ok',
    provider: model.provider,
    model: served.model ?? model.model,
    requestId: 'fake',
    latencyMs: 1,
    cached: false,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    ...(served.serverToolUses ? { serverToolUses: served.serverToolUses } : {}),
  }));
}

const rows = (gateway: AIGateway): any[] => (gateway as any).auditLogger.getRecentEntries();

function useTenantPolicy(policy: OrgPlacementPolicy | null) {
  setOrgPlacementResolver({ resolve: async orgId => (Number(orgId) === ORG ? policy : null) });
}

function chat(extra: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    taskType: 'chat',
    organizationId: ORG,
    messages: [{ role: 'user', content: 'Summarise the stability data for lot 7.' }],
    ...extra,
  };
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
  delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
  resetPlacementRegistry();
});
afterEach(() => {
  process.env = { ...saved };
  resetPlacementRegistry();
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

describe('a served row records its provenance and governance', () => {
  it('provenance, tenant binding and resolution, risk tier and run', async () => {
    useTenantPolicy({ allowedSubstrates: ['frontier_shared'] });
    const gateway = buildGateway(['anthropic']);
    stubDispatch(gateway);

    await gateway.route(chat({ riskTier: 'medium', runId: 'run-7', parentRunId: 'run-1' }));

    expect(rows(gateway).find(r => r.success)).toMatchObject({
      payloadProvenance: 'tenant_governed',
      tenantPolicyResolution: 'resolved',
      tenantBoundFrom: 'explicit',
      riskTier: 'medium',
      runId: 'run-7',
      parentRunId: 'run-1',
    });
  });

  it('the approved-models entry that served it, with its pinned version and PQ status', async () => {
    useTenantPolicy(null);
    const gateway = buildGateway(['anthropic']);
    stubDispatch(gateway);

    await gateway.route(chat());

    const row = rows(gateway).find(r => r.success);
    const entry = APPROVED_MODELS.find(m => m.provider === 'anthropic' && m.pinnedVersion === row.model);
    expect(entry).toBeDefined();
    expect(row).toMatchObject({ approvedModelId: entry!.id, pinnedVersion: entry!.pinnedVersion, pqStatus: entry!.pq.status });
  });

  it('a model no registry entry covers is recorded as unregistered, not matched to a guess', async () => {
    useTenantPolicy(null);
    const gateway = buildGateway(['anthropic']);
    stubDispatch(gateway, { model: 'claude-unknown-snapshot' });

    await gateway.route(chat());

    const row = rows(gateway).find(r => r.success);
    expect(row.approvedModelId).toBeUndefined();
    expect(row.pqStatus).toBe('unregistered');
  });

  it('the placement decision that allowed the call, where the screen enforced one', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
    useTenantPolicy(null);
    const gateway = buildGateway(['anthropic']);
    stubDispatch(gateway);

    await gateway.route(chat());

    expect(rows(gateway).find(r => r.success)?.placementReasonCode).toMatch(/^ALLOW_/);
  });

  it('the hosted tools that ran, and those withheld from the lane', async () => {
    useTenantPolicy({ publicSourceFrontier: true, publicSourceEgress: true });
    const tools = [{ type: 'web_search_20260209', name: 'web_search' }] as GatewayRequest['tools'];

    const anthropic = buildGateway(['anthropic']);
    stubDispatch(anthropic, { serverToolUses: [{ name: 'web_search' }] });
    await anthropic.route(chat({ tools }));
    expect(rows(anthropic).find(r => r.success)?.serverToolsUsed).toEqual(['web_search']);

    const bedrock = buildGateway(['bedrock']);
    stubDispatch(bedrock);
    await bedrock.route(chat({ tools }));
    expect(rows(bedrock).find(r => r.success)?.serverToolsWithheld).toEqual([
      { name: 'web_search', reason: 'not_first_party' },
    ]);
  });
});

describe('a refusal row records the placement reason and the provenance', () => {
  it('DENY_TENANT_POLICY is a typed column, next to how the tenant resolved', async () => {
    useTenantPolicy({ allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['anthropic']);
    stubDispatch(gateway);

    await expect(gateway.route(chat())).rejects.toThrow(/DENY_TENANT_POLICY/);

    expect(rows(gateway)).toHaveLength(1);
    expect(rows(gateway)[0]).toMatchObject({
      success: false,
      placementReasonCode: 'DENY_TENANT_POLICY',
      payloadProvenance: 'tenant_governed',
      tenantPolicyResolution: 'resolved',
    });
  });
});

describe('the prompt hash and the serving region', () => {
  const withImage = (data: string): GatewayRequest['messages'] => [
    {
      role: 'user',
      content: 'Read the label in this scan.',
      contentBlocks: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data } },
        { type: 'text', text: 'Read the label in this scan.' },
      ],
    } as GatewayRequest['messages'][number],
  ];

  it('two requests that differ only in the image they carry hash differently', async () => {
    useTenantPolicy(null);
    const gateway = buildGateway(['anthropic']);
    stubDispatch(gateway);

    await gateway.route(chat({ messages: withImage('aGVsbG8=') }));
    await gateway.route(chat({ messages: withImage('d29ybGQ=') }));

    const [a, b] = rows(gateway).filter(r => r.success);
    expect(a.promptHash).not.toBe(b.promptHash);
  });

  it('a text-only prompt hashes exactly as before, so existing rows stay comparable', async () => {
    useTenantPolicy(null);
    const gateway = buildGateway(['anthropic']);
    stubDispatch(gateway);

    await gateway.route(chat());

    const expected = createHash('sha256').update('user:Summarise the stability data for lot 7.', 'utf8').digest('hex');
    expect(rows(gateway).find(r => r.success)?.promptHash).toBe(expected);
  });

  it('an on-prem call for an EU tenant is recorded on_prem, not eu', async () => {
    useTenantPolicy({ residency: 'eu', allowedSubstrates: ['self_hosted'] });
    const gateway = buildGateway(['local']);
    stubDispatch(gateway);

    await gateway.route(chat());

    expect(rows(gateway).find(r => r.success)?.region).toBe('on_prem');
  });
});
