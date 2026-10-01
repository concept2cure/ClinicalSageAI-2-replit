/**
 * Embeddings follow the production provider election — ADR-0014 §1.4, P1-45.
 *
 * The embedding provider's default lane is OpenAI (EMBEDDING_PROVIDER unset).
 * Until P1-45, an organization with no placement policy embedded through it in
 * production whenever OPENAI_API_KEY was set: vault text went to a vendor the
 * tenant never elected. Pinned here: in production an organization that has
 * not named `openai` gets a terminal GatewayPolicyError before the OpenAI
 * client exists — never a silent OpenAI call — and one that has named it
 * embeds as before. Outside production nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('openai', () => ({
  default: class OpenAIStub {
    embeddings = { create: sdk.create };
    constructor(opts: unknown) {
      sdk.construct(opts);
    }
  },
}));

import { getEmbeddingProvider, resetEmbeddingProvider } from '../embedding-provider';
import { GatewayPolicyError, getGateway, resetGateway } from '../../gateway';
import {
  resetOrgPlacementResolver,
  setOrgPlacementResolver,
  type OrgPlacementPolicy,
} from '../../providers/org-placement';
import { resetPlacementRegistry } from '../../providers/placement';
import { runWithSystemTenantScope, runWithTenantScope } from '../../../../db/tenantStore';

const ORG = 4502;
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

function usePolicy(policy: OrgPlacementPolicy | null) {
  setOrgPlacementResolver({ resolve: async orgId => (Number(orgId) === ORG ? policy : null) });
}

beforeEach(() => {
  for (const key of [
    'EMBEDDING_PROVIDER',
    'EMBEDDING_LOCAL_BASE_URL',
    'LOCAL_AI_BASE_URL',
    'OPENAI_ZERO_RETENTION',
    'AI_PROVIDER_PLACEMENT_APPROVALS',
    'AI_PII_ENFORCEMENT',
  ]) {
    delete process.env[key];
  }
  process.env.NODE_ENV = 'production';
  process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
  process.env.OPENAI_API_KEY = 'sk-configured-for-another-tenant';
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

describe('P1-45 production embeddings: no election, no OpenAI call', () => {
  it('an organization with no placement row is refused before the OpenAI client exists', async () => {
    usePolicy(null);
    const provider = getEmbeddingProvider();
    expect(provider.kind).toBe('openai');

    const attempt = provider.embed({ input: PLAIN_TEXT, organizationId: ORG });

    await expect(attempt).rejects.toBeInstanceOf(GatewayPolicyError);
    await expect(attempt).rejects.toMatchObject({ message: expect.stringContaining('DENY_TENANT_POLICY') });
    expect(sdk.construct).not.toHaveBeenCalled();
    expect(sdk.create).not.toHaveBeenCalled();
    const entries = (getGateway() as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ taskType: 'embedding', success: false, error: 'DENY_TENANT_POLICY' });
    expect(JSON.stringify(entries)).not.toContain('release specifications');
  });

  it('the tenant bound from the request scope is held to the same election', async () => {
    usePolicy({ zeroDataRetention: false });
    const provider = getEmbeddingProvider();

    await expect(
      runWithTenantScope({ tenantId: String(ORG), source: 'test' }, () => provider.embed({ input: PLAIN_TEXT })),
    ).rejects.toBeInstanceOf(GatewayPolicyError);
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it('platform work with no organization (system scope) is not embedded through OpenAI', async () => {
    const provider = getEmbeddingProvider();

    await expect(
      runWithSystemTenantScope('embedding-provider-election.test', () => provider.embed({ input: PLAIN_TEXT })),
    ).rejects.toBeInstanceOf(GatewayPolicyError);
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it('an organization that named openai embeds through it as before', async () => {
    usePolicy({ allowedProviders: ['anthropic', 'openai'] });
    const provider = getEmbeddingProvider();

    const result = await provider.embed({ input: PLAIN_TEXT, organizationId: ORG });

    expect(result.provider).toBe('openai');
    expect(sdk.construct).toHaveBeenCalledTimes(1);
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });
});

describe('P1-45 outside production: embeddings unchanged', () => {
  it('an organization with no placement row embeds through OpenAI in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    usePolicy(null);
    const provider = getEmbeddingProvider();

    const result = await provider.embed({ input: PLAIN_TEXT, organizationId: ORG });

    expect(result.provider).toBe('openai');
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });
});
