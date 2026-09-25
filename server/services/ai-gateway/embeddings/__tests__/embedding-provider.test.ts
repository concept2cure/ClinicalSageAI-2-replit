/**
 * Embedding provider — lane selection and the placement gate in front of the
 * SDK call.
 *
 * P0-11 (SECURITY_AUDIT_2026-09-24 DP-07): `embed()` was the only egress in
 * the governed gateway tree that reached a provider with no classification,
 * placement decision or audit row, and `EMBEDDING_PROVIDER=local` with no base
 * URL fell back to OpenAI with a warning. Pinned here:
 *
 *  - `embed()` asks `AIGateway.authorizeEmbedding` BEFORE the SDK client
 *    exists; on refusal the client is never constructed and no call is made.
 *  - The organisation comes from the request, else from the running tenant
 *    scope; the estate-wide system scope ('0') is not an organisation.
 *  - `local` with no base URL is a configuration error naming the variable,
 *    never a silent fallback to the shared frontier API.
 *
 * The decision table itself is pinned by
 * ../../__tests__/embedding-placement-gate.test.ts.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  construct: vi.fn(),
  create: vi.fn(async (params: { input: string | string[]; model: string }) => {
    const n = Array.isArray(params.input) ? params.input.length : 1;
    return {
      data: Array.from({ length: n }, (_, index) => ({ index, embedding: [0.1, 0.2, 0.3] })),
      model: params.model,
      usage: { prompt_tokens: 3 * n },
    };
  }),
}));

// The OpenAI SDK stub: constructing it is the event under test.
vi.mock('openai', () => ({
  default: class OpenAIStub {
    embeddings = { create: sdk.create };
    constructor(opts: unknown) {
      sdk.construct(opts);
    }
  },
}));

import {
  resolveEmbeddingProvider,
  resetEmbeddingProvider,
  getEmbeddingProvider,
  EmbeddingConfigurationError,
} from '../embedding-provider';
import { GatewayPolicyError, getGateway, resetGateway } from '../../gateway';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../../providers/org-placement';
import { resetPlacementRegistry } from '../../providers/placement';
import { runWithTenantScope, runWithSystemTenantScope } from '../../../../db/tenantStore';

const PHI_TEXT = 'Patient MRN: 44819023 was admitted on 2026-03-02 for observation.';
const PLAIN_TEXT = 'Section 3.2.P.5.1 lists the release specifications for the drug product.';

const SAVED = { ...process.env };

function seedGateway() {
  resetGateway();
  return getGateway({
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

beforeEach(() => {
  process.env.NODE_ENV = 'development';
  for (const key of [
    'EMBEDDING_PROVIDER',
    'EMBEDDING_LOCAL_BASE_URL',
    'LOCAL_AI_BASE_URL',
    'OPENAI_API_KEY',
    'OPENAI_ZERO_RETENTION',
    'AI_PROVIDER_PLACEMENT_APPROVALS',
    'AI_SENSITIVE_DATA_POLICY_MODE',
    'AI_PII_ENFORCEMENT',
  ]) {
    delete process.env[key];
  }
  resetEmbeddingProvider();
  resetOrgPlacementResolver();
  resetPlacementRegistry();
  seedGateway();
  sdk.construct.mockClear();
  sdk.create.mockClear();
});

afterEach(() => {
  process.env = { ...SAVED };
  resetEmbeddingProvider();
  resetOrgPlacementResolver();
  resetPlacementRegistry();
  resetGateway();
});

describe('embedding provider selection', () => {
  it('defaults to the OpenAI embedding provider (shared frontier)', () => {
    const p = resolveEmbeddingProvider();
    expect(p.kind).toBe('openai');
    expect(p.selfHosted).toBe(false);
    expect(p.defaultModel).toBe('text-embedding-3-small');
  });

  it('selects the self-hosted provider when EMBEDDING_PROVIDER=local and a base URL is set', () => {
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.EMBEDDING_LOCAL_BASE_URL = 'http://localhost:8080/v1';
    const p = resolveEmbeddingProvider();
    expect(p.kind).toBe('local');
    expect(p.selfHosted).toBe(true);
  });

  it('local with no base URL is a configuration error naming EMBEDDING_LOCAL_BASE_URL, never a fallback to OpenAI', () => {
    process.env.EMBEDDING_PROVIDER = 'local';
    expect(() => resolveEmbeddingProvider()).toThrow(EmbeddingConfigurationError);
    expect(() => resolveEmbeddingProvider()).toThrow(/EMBEDDING_LOCAL_BASE_URL/);
    // The memoised accessor fails the same way on every call — nothing is cached.
    expect(() => getEmbeddingProvider()).toThrow(EmbeddingConfigurationError);
    expect(() => getEmbeddingProvider()).toThrow(EmbeddingConfigurationError);
    expect(sdk.construct).not.toHaveBeenCalled();
    expect(sdk.create).not.toHaveBeenCalled();
  });
});

describe('embedding placement gate (before the SDK client exists)', () => {
  it('plain text with no policy embeds through OpenAI; the client is constructed once, lazily', async () => {
    const provider = getEmbeddingProvider();
    expect(sdk.construct).not.toHaveBeenCalled();
    const result = await provider.embed({ input: PLAIN_TEXT });
    expect(result).toMatchObject({ provider: 'openai', model: 'text-embedding-3-small', inputTokens: 3 });
    expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    expect(sdk.construct).toHaveBeenCalledTimes(1);
    expect(sdk.create).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: PLAIN_TEXT });
  });

  it("a zero-retention tenant's plain text never reaches OpenAI: GatewayPolicyError before any client is constructed", async () => {
    process.env.NODE_ENV = 'production';
    const resolve = vi.fn(async () => ({ zeroDataRetention: true }));
    setOrgPlacementResolver({ resolve });
    const provider = getEmbeddingProvider();
    expect(provider.kind).toBe('openai');

    const attempt = provider.embed({ input: PLAIN_TEXT, organizationId: 7 });
    await expect(attempt).rejects.toBeInstanceOf(GatewayPolicyError);
    await expect(attempt).rejects.toMatchObject({
      message: expect.stringContaining('DENY_SHARED_PROVIDER_WITHOUT_ZDR'),
    });
    expect(resolve).toHaveBeenCalledWith(7);
    expect(sdk.construct).not.toHaveBeenCalled();
    expect(sdk.create).not.toHaveBeenCalled();

    const entries = (getGateway() as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      taskType: 'embedding',
      organizationId: 7,
      success: false,
      error: 'DENY_SHARED_PROVIDER_WITHOUT_ZDR',
    });
    expect(JSON.stringify(entries)).not.toContain('release specifications');
  });

  it('PHI to a provider not approved for embedding is refused with a content-free audit entry', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
      openai: {
        region: 'global',
        zeroRetentionApproved: true,
        approvedDataClasses: ['pii', 'phi'],
        approvedIntendedUses: ['chat'],
      },
    });
    const provider = getEmbeddingProvider();

    await expect(provider.embed({ input: [PHI_TEXT, PLAIN_TEXT] })).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_UNAPPROVED_INTENDED_USE'),
    });
    expect(sdk.construct).not.toHaveBeenCalled();
    expect(sdk.create).not.toHaveBeenCalled();

    const entries = (getGateway() as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      provider: 'none',
      taskType: 'embedding',
      success: false,
      error: 'DENY_UNAPPROVED_INTENDED_USE',
      metadata: { sensitivePlacement: { provider: 'openai', dataClass: 'phi' } },
    });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain('44819023');
    expect(serialized).not.toContain('MRN');
  });

  it('the self-hosted lane, approved for embedding, embeds PHI for an on-prem zero-retention tenant', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.EMBEDDING_LOCAL_BASE_URL = 'http://embedder.internal:8080/v1/';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
      local: {
        region: 'on_prem',
        zeroRetentionApproved: true,
        approvedDataClasses: ['pii', 'phi'],
        approvedIntendedUses: ['embedding'],
      },
    });
    setOrgPlacementResolver({ resolve: async () => ({ residency: 'on_prem', zeroDataRetention: true }) });
    const provider = getEmbeddingProvider();
    expect(provider.kind).toBe('local');

    const result = await provider.embed({ input: [PHI_TEXT, PLAIN_TEXT], organizationId: 7, model: 'text-embedding-3-small' });
    expect(result.provider).toBe('local');
    expect(result.embeddings).toHaveLength(2);
    expect(sdk.construct).toHaveBeenCalledTimes(1);
    expect(sdk.construct).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'http://embedder.internal:8080/v1' }));
    // The local server serves its own model; the caller's OpenAI model id is not forwarded.
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'bge-large-en-v1.5' }));
    expect((getGateway() as any).auditLogger.getRecentEntries()).toHaveLength(0);
  });

  it("the running request's tenant scope supplies the organisation when the caller passes none", async () => {
    process.env.NODE_ENV = 'production';
    const resolve = vi.fn(async () => ({ zeroDataRetention: true }));
    setOrgPlacementResolver({ resolve });
    const provider = getEmbeddingProvider();

    await expect(
      runWithTenantScope({ tenantId: '7', source: 'test' }, () => provider.embed({ input: PLAIN_TEXT })),
    ).rejects.toBeInstanceOf(GatewayPolicyError);
    expect(resolve).toHaveBeenCalledWith('7');
    expect(sdk.construct).not.toHaveBeenCalled();
  });

  it("the estate-wide system scope ('0') is not an organisation and is not offered as one", async () => {
    const resolve = vi.fn(async () => null);
    setOrgPlacementResolver({ resolve });
    const provider = getEmbeddingProvider();

    await runWithSystemTenantScope('embedding-provider.test', () => provider.embed({ input: PLAIN_TEXT }));
    expect(resolve).not.toHaveBeenCalledWith('0');
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });
});
