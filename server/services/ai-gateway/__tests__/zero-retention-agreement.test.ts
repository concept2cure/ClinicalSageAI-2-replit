/**
 * Zero retention is traceable to an agreement (launch row D6, 2026-10-25).
 *
 * Until this change the sensitive-dispatch gate read zero retention from one
 * place: the `zeroRetentionApproved` boolean in AI_PROVIDER_PLACEMENT_APPROVALS.
 * It passed that same boolean as both of the decision's keys, so one JSON value
 * could send PII to a shared API in production with no agreement in place, and
 * nothing compared it with the placement registry's own flag
 * (ANTHROPIC_ZERO_RETENTION). The ledger row named the posture, never the
 * agreement.
 *
 * Pinned here, in production, on the gateway's own dispatch path:
 *  - an approval with no agreement fails closed, as misconfiguration;
 *  - the approval alone is not zero retention: the registry must say so too;
 *  - an agreement that takes effect tomorrow is not in force today;
 *  - a served sensitive dispatch that relied on zero retention names its
 *    agreement in the ledger row (metadata.zeroRetentionAgreement), for chat
 *    and for embeddings, and a call that did not rely on it names none.
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
import { resetOrgPlacementResolver, setOrgPlacementResolver, type OrgPlacementPolicy } from '../providers/org-placement';
import { resetPlacementRegistry } from '../providers/placement';
import { resetContentClassifier } from '../../ai-governance/classification/index.js';
import type { GatewayRequest, ProviderName } from '../types';

const ORG = 4601;
const PII_TEXT = 'Please contact the site coordinator at jane.doe@example.com about the monitoring visit.';
const PLAIN_TEXT = 'Summarize the unpublished 12-month stability results for lot 7 of the drug substance.';

/** A test fixture, not an agreement: no provider has a signed zero-retention agreement today (D6). */
const AGREEMENT = { reference: 'TEST-ZDR-ADDENDUM-0001', effectiveFrom: '2026-01-01' };

function utcDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function approvals(provider: ProviderName, extra: Record<string, unknown>, uses = ['chat']): string {
  return JSON.stringify({
    [provider]: {
      region: 'global',
      zeroRetentionApproved: true,
      approvedDataClasses: ['pii', 'phi'],
      approvedIntendedUses: uses,
      ...extra,
    },
  });
}

function buildGateway(providers: ProviderName[]): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: true,
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
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
  }));
}

const rows = (gateway: AIGateway): any[] => (gateway as any).auditLogger.getRecentEntries();

function usePolicy(policy: OrgPlacementPolicy | null) {
  setOrgPlacementResolver({ resolve: async orgId => (Number(orgId) === ORG ? policy : null) });
}

function chat(content = PII_TEXT): GatewayRequest {
  return { taskType: 'chat', organizationId: ORG, messages: [{ role: 'user', content }] };
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.NODE_ENV = 'production';
  process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
  for (const key of [
    'AI_PII_ENFORCEMENT',
    'AI_PROVIDER_PLACEMENT_APPROVALS',
    'ANTHROPIC_ZERO_RETENTION',
    'OPENAI_ZERO_RETENTION',
    'AI_BEDROCK_ZERO_RETENTION',
    'AI_GATEWAY_DETERMINISTIC',
    'DETERMINISTIC_MODE',
  ]) {
    delete process.env[key];
  }
  usePolicy(null);
  resetPlacementRegistry();
  resetContentClassifier();
});
afterEach(() => {
  process.env = { ...saved };
  resetPlacementRegistry();
  resetOrgPlacementResolver();
  resetContentClassifier();
  vi.restoreAllMocks();
});

describe('a zero-retention approval names its agreement', () => {
  it('an approval with no agreement fails closed, as misconfiguration, and nothing is sent', async () => {
    process.env.ANTHROPIC_ZERO_RETENTION = 'true';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = approvals('anthropic', {});
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat())).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('approves zero retention for anthropic but names no agreement'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('both keys: the approval and the placement registry', () => {
  it('the approval alone is not zero retention: with ANTHROPIC_ZERO_RETENTION unset, PII is not sent', async () => {
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = approvals('anthropic', { zeroRetentionAgreement: AGREEMENT });
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat())).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_SHARED_PROVIDER_WITHOUT_ZDR'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('an agreement that takes effect tomorrow is not in force today', async () => {
    process.env.ANTHROPIC_ZERO_RETENTION = 'true';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = approvals('anthropic', {
      zeroRetentionAgreement: { reference: 'TEST-ZDR-ADDENDUM-0002', effectiveFrom: utcDay(1) },
    });
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat())).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_SHARED_PROVIDER_WITHOUT_ZDR'),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('both keys and an agreement in force today: sent, and the ledger row names the agreement', async () => {
    const today = { reference: 'TEST-ZDR-ADDENDUM-0003', effectiveFrom: utcDay(0) };
    process.env.ANTHROPIC_ZERO_RETENTION = 'true';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = approvals('anthropic', { zeroRetentionAgreement: today });
    const gateway = buildGateway(['anthropic']);
    const dispatch = stubDispatch(gateway);

    await expect(gateway.route(chat())).resolves.toMatchObject({ provider: 'anthropic' });
    expect(dispatch).toHaveBeenCalledTimes(1);
    const row = rows(gateway).find(r => r.success);
    expect(row).toMatchObject({
      provider: 'anthropic',
      placementReasonCode: 'ALLOW_APPROVED_PLACEMENT',
      retentionPolicy: 'zero_retention',
      metadata: { zeroRetentionAgreement: today },
    });
  });
});

describe('the ledger names the agreement only where a dispatch relied on it', () => {
  it('a non-sensitive call relied on nothing and names no agreement', async () => {
    process.env.ANTHROPIC_ZERO_RETENTION = 'true';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = approvals('anthropic', { zeroRetentionAgreement: AGREEMENT });
    const gateway = buildGateway(['anthropic']);
    stubDispatch(gateway);

    await gateway.route(chat(PLAIN_TEXT));

    const row = rows(gateway).find(r => r.success);
    expect(row?.placementReasonCode).toBe('ALLOW_NON_SENSITIVE');
    expect(row?.metadata?.zeroRetentionAgreement).toBeUndefined();
  });

  it('an embedding of PII on a third-party lane names the agreement on its row', async () => {
    usePolicy({ allowedProviders: ['openai'] });
    process.env.OPENAI_ZERO_RETENTION = 'true';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = approvals('openai', { zeroRetentionAgreement: AGREEMENT }, ['embedding']);
    const gateway = buildGateway([]);

    const authorization = await gateway.authorizeEmbedding({ provider: 'openai', texts: [PII_TEXT], organizationId: ORG });
    expect(authorization).toMatchObject({ placementReasonCode: 'ALLOW_APPROVED_PLACEMENT', zeroRetentionAgreement: AGREEMENT });

    await gateway.recordEmbeddingCall(authorization, { provider: 'openai', model: 'text-embedding-3-small', inputTokens: 3 });
    expect(rows(gateway).find(r => r.success)).toMatchObject({
      provider: 'openai',
      metadata: { zeroRetentionAgreement: AGREEMENT },
    });
  });

  it('the self-hosted lane needs no agreement and names none', async () => {
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
      local: { region: 'on_prem', zeroRetentionApproved: true, approvedDataClasses: ['pii', 'phi'], approvedIntendedUses: ['embedding'] },
    });
    const gateway = buildGateway([]);

    const authorization = await gateway.authorizeEmbedding({ provider: 'local', texts: [PII_TEXT], organizationId: ORG });
    expect(authorization.placementReasonCode).toBe('ALLOW_APPROVED_PLACEMENT');
    expect(authorization.zeroRetentionAgreement).toBeUndefined();
  });
});
