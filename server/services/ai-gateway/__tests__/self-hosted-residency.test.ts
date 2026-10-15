/**
 * A self-hosted placement satisfies any tenant residency (ADR-0014 §1.5,
 * amended 2026-10-01; P1-54 round 2).
 *
 * The in-VPC embedding lane is approved for PII and PHI with zero retention and
 * intended use `embedding`, at region `on_prem`: no third party receives the
 * text, and the data stays in the region the deployment runs in. The tenant
 * floor already says so (`isPlacementCompliant`: self-hosted satisfies any
 * single-region residency), but the last-mile sensitive-dispatch gate passed the
 * tenant's residency as the dispatch region and compared it, as a string, with
 * the approval's `on_prem`. So an EU- or US-resident tenant had every PII or PHI
 * chunk refused (DENY_TENANT_POLICY) by the one lane that never leaves the
 * platform, while its non-sensitive chunks were embedded: Vault search that
 * worked for a CMC table and failed for a site contact list.
 *
 * Pinned here: the self-hosted lane admits sensitive text whatever the tenant's
 * residency, and a provider that is not self-hosted is still held to it, both
 * by the tenant floor and by the sensitive gate's own region comparison.
 *
 * The red run (the unfixed gateway) is filed under
 * docs/evidence/D6/2026-10-01-tranche-4/P1-54-embedding-lane/round-2/red/.
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
import { resetOrgPlacementResolver, setOrgPlacementResolver, type OrgPlacementPolicy } from '../providers/org-placement';
import { resetPlacementRegistry, resolvePlacement } from '../providers/placement';
import { resetContentClassifier } from '../../ai-governance/classification/index.js';
import type { ProviderName } from '../types';

const PII_TEXT = 'Please contact the site coordinator at jane.doe@example.com about the monitoring visit.';
const PHI_TEXT = 'Patient MRN: 44819023 was admitted on 2026-03-02 for observation.';

/** ADR-0014 §1.5 (amended): the in-VPC lane, approved for PII and PHI, embedding only. */
const LOCAL_EMBEDDING_APPROVAL = {
  region: 'on_prem',
  zeroRetentionApproved: true,
  approvedDataClasses: ['pii', 'phi'],
  approvedIntendedUses: ['embedding'],
};

function buildGateway(providers: ProviderName[] = []): AIGateway {
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

function tenant(policy: OrgPlacementPolicy) {
  setOrgPlacementResolver({ resolve: async () => policy });
}

function sensitiveDecision() {
  return logSpies.info.mock.calls.find(([message]) => message === '[ai-gateway] sensitive placement decision')?.[1];
}

const saved = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
  for (const key of [
    'AI_PII_ENFORCEMENT',
    'OPENAI_ZERO_RETENTION',
    'AI_BEDROCK_REGION',
    'AI_BEDROCK_RESIDENCY',
    'AWS_REGION',
    'AI_AZURE_RESIDENCY',
    'AI_AZURE_ZERO_RETENTION',
  ]) {
    delete process.env[key];
  }
  process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({ local: LOCAL_EMBEDDING_APPROVAL });
  resetOrgPlacementResolver();
  resetPlacementRegistry();
  resetContentClassifier();
});

afterEach(() => {
  process.env = { ...saved };
  resetOrgPlacementResolver();
  resetPlacementRegistry();
  resetContentClassifier();
  vi.restoreAllMocks();
  for (const spy of Object.values(logSpies)) spy.mockClear();
});

describe('the self-hosted embedding lane admits sensitive text whatever the tenant residency', () => {
  it('an EU-resident tenant embeds PII through the in-VPC lane', async () => {
    tenant({ residency: 'eu' });
    const gateway = buildGateway();
    await expect(
      gateway.authorizeEmbedding({ provider: 'local', texts: [PII_TEXT], organizationId: 7 }),
    ).resolves.toMatchObject({ placementReasonCode: 'ALLOW_APPROVED_PLACEMENT' });
    // The decision names where the text went: the lane's own region, not the tenant's.
    expect(sensitiveDecision()).toMatchObject({ provider: 'local', region: 'on_prem', dataClass: 'pii', allowed: true });
    expect((gateway as any).auditLogger.getRecentEntries()).toHaveLength(0);
  });

  it('a US-resident zero-retention tenant embeds PHI through it', async () => {
    tenant({ residency: 'us', zeroDataRetention: true });
    const gateway = buildGateway();
    await expect(
      gateway.authorizeEmbedding({ provider: 'local', texts: [PHI_TEXT], organizationId: 7 }),
    ).resolves.toMatchObject({ placementReasonCode: 'ALLOW_APPROVED_PLACEMENT' });
  });

  it('an on-prem tenant was already admitted, and still is', async () => {
    tenant({ residency: 'on_prem', zeroDataRetention: true });
    const gateway = buildGateway();
    await expect(
      gateway.authorizeEmbedding({ provider: 'local', texts: [PHI_TEXT], organizationId: 7 }),
    ).resolves.toMatchObject({ placementReasonCode: 'ALLOW_APPROVED_PLACEMENT' });
  });

  it('the approval still decides: without intended use "embedding" the lane is refused PII', async () => {
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
      local: { ...LOCAL_EMBEDDING_APPROVAL, approvedIntendedUses: ['chat'] },
    });
    tenant({ residency: 'eu' });
    const gateway = buildGateway();
    await expect(
      gateway.authorizeEmbedding({ provider: 'local', texts: [PII_TEXT], organizationId: 7 }),
    ).rejects.toMatchObject({ name: GatewayPolicyError.name, message: expect.stringContaining('DENY_UNAPPROVED_INTENDED_USE') });
  });
});

describe('a provider that is not self-hosted is still held to the tenant residency', () => {
  it('the tenant floor: an EU-resident tenant elected OpenAI (global only) and is still refused, any data class', async () => {
    process.env.OPENAI_ZERO_RETENTION = 'true';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
      openai: { region: 'global', zeroRetentionApproved: true, approvedDataClasses: ['pii', 'phi'], approvedIntendedUses: ['embedding'] },
    });
    resetPlacementRegistry();
    tenant({ residency: 'eu', allowedProviders: ['openai'] });
    const gateway = buildGateway();
    await expect(
      gateway.authorizeEmbedding({ provider: 'openai', texts: [PII_TEXT], organizationId: 7 }),
    ).rejects.toMatchObject({ name: GatewayPolicyError.name, message: expect.stringContaining('DENY_TENANT_POLICY') });
  });

  describe('the sensitive gate: Bedrock in Frankfurt for an EU-resident tenant', () => {
    function useFrankfurtBedrock(approvalRegion: string) {
      process.env.AI_BEDROCK_REGION = 'eu-central-1';
      process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
        bedrock: { region: approvalRegion, zeroRetentionApproved: true, approvedDataClasses: ['pii', 'phi'], approvedIntendedUses: ['chat'] },
      });
      resetPlacementRegistry();
      expect(resolvePlacement('bedrock')).toMatchObject({ substrate: 'frontier_private', regions: ['eu'] });
      tenant({ residency: 'eu' });
      const gateway = buildGateway(['bedrock']);
      const dispatch = vi.spyOn(gateway as any, 'dispatchProvider').mockResolvedValue({
        content: 'ok',
        provider: 'bedrock',
        model: 'not-used',
        requestId: 'fake',
        latencyMs: 1,
        cached: false,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      });
      return { gateway, dispatch };
    }

    const chat = { taskType: 'chat' as const, organizationId: 7, messages: [{ role: 'user' as const, content: PII_TEXT }] };

    it('an approval granted for another region does not carry PII for an EU tenant (DENY_TENANT_POLICY)', async () => {
      // The tenant floor admits it (Bedrock serves 'eu' here); the refusal is the
      // sensitive gate's own comparison of the tenant's region with the approval's.
      const { gateway, dispatch } = useFrankfurtBedrock('us');
      await expect(gateway.route(chat)).rejects.toMatchObject({
        name: GatewayPolicyError.name,
        message: expect.stringContaining('DENY_TENANT_POLICY'),
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect(sensitiveDecision()).toMatchObject({ provider: 'bedrock', region: 'eu', allowed: false });
    });

    it('the same request is dispatched when the approval is for the region the tenant requires', async () => {
      const { gateway, dispatch } = useFrankfurtBedrock('eu');
      await expect(gateway.route(chat)).resolves.toMatchObject({ provider: 'bedrock' });
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("the sensitive gate compares the tenant's region, not the lane's first one: Azure declared for us and eu", () => {
    // A lane that serves two regions passes the tenant floor for either, so the
    // gate must decide at the region the tenant requires. Deciding at the lane's
    // own first region (what the self-hosted branch does, correctly, for
    // on_prem) would let an approval granted for US data carry an EU tenant's PII.
    function useTwoRegionAzure(approvalRegion: string) {
      process.env.AI_AZURE_RESIDENCY = 'us,eu';
      process.env.AI_AZURE_ZERO_RETENTION = 'true';
      process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
        azure: { region: approvalRegion, zeroRetentionApproved: true, approvedDataClasses: ['pii', 'phi'], approvedIntendedUses: ['chat'] },
      });
      resetPlacementRegistry();
      expect(resolvePlacement('azure')).toMatchObject({ substrate: 'frontier_private', regions: ['us', 'eu'] });
      tenant({ residency: 'eu', allowedProviders: ['azure'] });
      const gateway = buildGateway(['azure']);
      const dispatch = vi.spyOn(gateway as any, 'dispatchProvider').mockResolvedValue({
        content: 'ok',
        provider: 'azure',
        model: 'not-used',
        requestId: 'fake',
        latencyMs: 1,
        cached: false,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      });
      return { gateway, dispatch };
    }

    const chat = { taskType: 'chat' as const, organizationId: 7, messages: [{ role: 'user' as const, content: PII_TEXT }] };

    afterEach(() => {
      delete process.env.AI_AZURE_RESIDENCY;
      delete process.env.AI_AZURE_ZERO_RETENTION;
    });

    it('an approval for US data does not carry an EU tenant\'s PII (DENY_TENANT_POLICY)', async () => {
      const { gateway, dispatch } = useTwoRegionAzure('us');
      await expect(gateway.route(chat)).rejects.toMatchObject({
        name: GatewayPolicyError.name,
        message: expect.stringContaining('DENY_TENANT_POLICY'),
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect(sensitiveDecision()).toMatchObject({ provider: 'azure', region: 'eu', allowed: false });
    });

    it('an approval for EU data does, at the EU region', async () => {
      const { gateway, dispatch } = useTwoRegionAzure('eu');
      await expect(gateway.route(chat)).resolves.toMatchObject({ provider: 'azure' });
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(sensitiveDecision()).toMatchObject({ provider: 'azure', region: 'eu', allowed: true });
    });
  });
});
