/**
 * `AIGateway.authorizeEmbedding` — the placement decision for the one governed
 * egress that does not pass through `route()`.
 *
 * Embeddings are produced by `embeddings/embedding-provider.ts`, which calls
 * the provider SDK itself; until P0-11 (SECURITY_AUDIT_2026-09-24 DP-07) vault
 * text reached OpenAI with no classification, no placement decision and no
 * audit row. `authorizeEmbedding` runs the same steps `route()` runs before a
 * chat dispatch — org placement defaults, classification, the last-mile
 * sensitive-dispatch gate — plus the residency / zero-retention rule that
 * `selectModel()` applies to chat candidates, since an embedding provider is
 * fixed by environment and is never re-routed.
 *
 * Pinned here:
 *  1. A zero-retention or region-resident tenant cannot embed through a shared
 *     frontier provider, sensitive or not, in ANY environment — the same
 *     refusal `selectModel()` gives a chat request. The self-hosted lane
 *     satisfies both.
 *  2. Sensitive text (PHI) meets the enforced last-mile gate with intended use
 *     `embedding`: an approval for `chat` alone does not cover it.
 *  3. Every refusal is a terminal GatewayPolicyError carrying a stable reason
 *     code, and neither the error, the audit row nor any log line carries the
 *     text.
 *
 * Provider-level behaviour (the SDK client is never constructed on refusal)
 * is pinned by embeddings/__tests__/embedding-provider.test.ts.
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
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import { resetPlacementRegistry } from '../providers/placement';
import { getContentClassifier, resetContentClassifier } from '../../ai-governance/classification/index.js';

const PHI_TEXT = 'Patient MRN: 44819023 was admitted on 2026-03-02 for observation.';
const PLAIN_TEXT = 'Section 3.2.P.5.1 lists the release specifications for the drug product.';
const SECRETS = ['44819023', 'MRN', 'release specifications'];

function buildGateway() {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: true,
    providers: [],
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 100,
      maxRequestsPerMinutePerUser: 30,
      blockedPatterns: [],
      contentFilters: true,
      piiDetection: true,
    },
  });
}

function auditEntries(gateway: AIGateway): any[] {
  return (gateway as any).auditLogger.getRecentEntries();
}

function allLogOutput(): string {
  return JSON.stringify([
    logSpies.info.mock.calls,
    logSpies.warn.mock.calls,
    logSpies.error.mock.calls,
    logSpies.debug.mock.calls,
  ]);
}

function expectContentFree(text: string) {
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

const APPROVAL_LOCAL_EMBEDDING = JSON.stringify({
  local: {
    region: 'on_prem',
    zeroRetentionApproved: true,
    approvedDataClasses: ['pii', 'phi'],
    approvedIntendedUses: ['embedding'],
  },
});

const APPROVAL_OPENAI_CHAT_ONLY = JSON.stringify({
  openai: {
    region: 'global',
    zeroRetentionApproved: true,
    approvedDataClasses: ['pii', 'phi'],
    approvedIntendedUses: ['chat'],
  },
});

describe('AIGateway.authorizeEmbedding', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PII_ENFORCEMENT;
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    delete process.env.OPENAI_ZERO_RETENTION;
    delete process.env.OPENAI_API_KEY;
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
    logSpies.info.mockClear();
    logSpies.warn.mockClear();
    logSpies.error.mockClear();
    logSpies.debug.mockClear();
  });

  describe('residency / zero-retention (any data class, any environment)', () => {
    it('plain text with no org policy is allowed on both lanes', async () => {
      const gateway = buildGateway();
      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PLAIN_TEXT] }),
      ).resolves.toBeUndefined();
      await expect(
        gateway.authorizeEmbedding({ provider: 'local', texts: [PLAIN_TEXT], organizationId: 7 }),
      ).resolves.toBeUndefined();
      expect(auditEntries(gateway)).toHaveLength(0);
    });

    it('a zero-retention tenant cannot embed plain text through OpenAI, even outside production', async () => {
      const resolve = vi.fn(async () => ({ zeroDataRetention: true }));
      setOrgPlacementResolver({ resolve });
      const gateway = buildGateway();

      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PLAIN_TEXT], organizationId: 7 }),
      ).rejects.toMatchObject({
        name: GatewayPolicyError.name,
        message: expect.stringContaining('DENY_SHARED_PROVIDER_WITHOUT_ZDR'),
      });
      expect(resolve).toHaveBeenCalledWith(7);

      // The refusal is a compliance event: one audit row, content-free.
      const entries = auditEntries(gateway);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        provider: 'none',
        taskType: 'embedding',
        organizationId: 7,
        success: false,
        error: 'DENY_SHARED_PROVIDER_WITHOUT_ZDR',
        metadata: {
          sensitivePlacement: { provider: 'openai', reasonCode: 'DENY_SHARED_PROVIDER_WITHOUT_ZDR' },
        },
      });
      expectContentFree(JSON.stringify(entries));
      expectContentFree(allLogOutput());
    });

    it('the same zero-retention tenant may embed through the self-hosted lane', async () => {
      setOrgPlacementResolver({ resolve: async () => ({ zeroDataRetention: true }) });
      const gateway = buildGateway();
      await expect(
        gateway.authorizeEmbedding({ provider: 'local', texts: [PLAIN_TEXT], organizationId: 7 }),
      ).resolves.toBeUndefined();
      expect(auditEntries(gateway)).toHaveLength(0);
    });

    it('an EU-resident tenant cannot embed through OpenAI (global only); the self-hosted lane satisfies it', async () => {
      setOrgPlacementResolver({ resolve: async () => ({ residency: 'eu' }) });
      const gateway = buildGateway();
      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PLAIN_TEXT], organizationId: 7 }),
      ).rejects.toMatchObject({
        name: GatewayPolicyError.name,
        message: expect.stringContaining('DENY_TENANT_POLICY'),
      });
      await expect(
        gateway.authorizeEmbedding({ provider: 'local', texts: [PLAIN_TEXT], organizationId: 7 }),
      ).resolves.toBeUndefined();
    });

    it('a signed zero-retention agreement (OPENAI_ZERO_RETENTION=true) is the operator control that unlocks OpenAI', async () => {
      process.env.OPENAI_ZERO_RETENTION = 'true';
      resetPlacementRegistry();
      setOrgPlacementResolver({ resolve: async () => ({ zeroDataRetention: true }) });
      const gateway = buildGateway();
      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PLAIN_TEXT], organizationId: 7 }),
      ).resolves.toBeUndefined();
    });

    it('an explicit request flag is honoured without an org policy', async () => {
      const gateway = buildGateway();
      // No resolver: the org has no policy. The rule is still reachable through
      // the same request fields chat uses, via the org default merge.
      setOrgPlacementResolver({ resolve: async () => ({ residency: 'on_prem' }) });
      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PLAIN_TEXT], organizationId: 9 }),
      ).rejects.toBeInstanceOf(GatewayPolicyError);
      await expect(
        gateway.authorizeEmbedding({ provider: 'local', texts: [PLAIN_TEXT], organizationId: 9 }),
      ).resolves.toBeUndefined();
    });
  });

  describe('sensitive text meets the enforced last-mile gate with intended use "embedding"', () => {
    it('PHI under production enforcement with no approvals is refused (DENY_UNKNOWN_PROVIDER), content-free', async () => {
      process.env.NODE_ENV = 'production';
      const gateway = buildGateway();

      // A production call is always bound to a tenant (request or job scope). The
      // unbound case refuses earlier, as DENY_TENANT_POLICY, and is pinned in
      // tenant-placement-boundary.test.ts; this case is about the decider.
      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PHI_TEXT], organizationId: 7 }),
      ).rejects.toMatchObject({
        name: GatewayPolicyError.name,
        message: expect.stringContaining('DENY_UNKNOWN_PROVIDER'),
      });
      const entries = auditEntries(gateway);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        taskType: 'embedding',
        success: false,
        error: 'DENY_UNKNOWN_PROVIDER',
        metadata: { sensitivePlacement: { provider: 'openai', dataClass: 'phi' } },
      });
      expectContentFree(JSON.stringify(entries));
      expectContentFree(allLogOutput());
    });

    it('an approval for "chat" does not cover embedding: DENY_UNAPPROVED_INTENDED_USE', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AI_PROVIDER_PLACEMENT_APPROVALS = APPROVAL_OPENAI_CHAT_ONLY;
      const gateway = buildGateway();

      // A production call is always bound to a tenant (request or job scope). The
      // unbound case refuses earlier, as DENY_TENANT_POLICY, and is pinned in
      // tenant-placement-boundary.test.ts; this case is about the decider.
      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PHI_TEXT], organizationId: 7 }),
      ).rejects.toMatchObject({
        name: GatewayPolicyError.name,
        message: expect.stringContaining('DENY_UNAPPROVED_INTENDED_USE'),
      });
      expect(auditEntries(gateway)[0]).toMatchObject({ error: 'DENY_UNAPPROVED_INTENDED_USE' });
      expectContentFree(JSON.stringify(auditEntries(gateway)));
    });

    it('the self-hosted lane, approved for embedding, embeds PHI for an on-prem zero-retention tenant', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AI_PROVIDER_PLACEMENT_APPROVALS = APPROVAL_LOCAL_EMBEDDING;
      setOrgPlacementResolver({
        resolve: async () => ({ residency: 'on_prem', zeroDataRetention: true }),
      });
      const gateway = buildGateway();

      await expect(
        gateway.authorizeEmbedding({ provider: 'local', texts: [PHI_TEXT, PLAIN_TEXT], organizationId: 7 }),
      ).resolves.toBeUndefined();
      expect(auditEntries(gateway)).toHaveLength(0);
      const decision = logSpies.info.mock.calls.find(
        ([message]) => message === '[ai-gateway] sensitive placement decision',
      );
      expect(decision?.[1]).toMatchObject({
        reasonCode: 'ALLOW_APPROVED_PLACEMENT',
        provider: 'local',
        dataClass: 'phi',
        allowed: true,
      });
      expectContentFree(allLogOutput());
    });

    it('staging with AI_SENSITIVE_DATA_POLICY_MODE=enforce enforces identically', async () => {
      process.env.NODE_ENV = 'staging';
      process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
      const gateway = buildGateway();
      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PHI_TEXT] }),
      ).rejects.toMatchObject({ message: expect.stringContaining('DENY_UNKNOWN_PROVIDER') });
    });

    it('a classifier failure under enforcement fails closed (DENY_DETECTOR_FAILURE)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AI_PROVIDER_PLACEMENT_APPROVALS = APPROVAL_LOCAL_EMBEDDING;
      vi.spyOn(getContentClassifier(), 'classify').mockRejectedValueOnce(new Error('detector down'));
      const gateway = buildGateway();
      // A production call is always bound to a tenant (request or job scope). The
      // unbound case refuses earlier, as DENY_TENANT_POLICY, and is pinned in
      // tenant-placement-boundary.test.ts; this case is about the decider.
      await expect(
        gateway.authorizeEmbedding({ provider: 'local', texts: [PLAIN_TEXT], organizationId: 7 }),
      ).rejects.toMatchObject({ message: expect.stringContaining('DENY_DETECTOR_FAILURE') });
    });

    it('development audit mode records PHI-bound embedding content-free and does not block', async () => {
      const gateway = buildGateway();
      await expect(
        gateway.authorizeEmbedding({ provider: 'openai', texts: [PHI_TEXT] }),
      ).resolves.toBeUndefined();
      const screen = logSpies.warn.mock.calls.filter(
        ([message]) => message === '[ai-gateway] sensitive-data screen',
      );
      expect(screen.length).toBeGreaterThanOrEqual(1);
      expect(screen[0][1]).toMatchObject({
        classes: ['phi'],
        provider: 'openai',
        reasonCode: 'DENY_UNKNOWN_PROVIDER',
        enforcement: 'audit',
      });
      expectContentFree(allLogOutput());
    });
  });
});
