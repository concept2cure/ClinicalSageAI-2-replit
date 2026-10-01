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

// A server that answers in the width it was asked for (as Text Embeddings
// Inference does up to the model's own width), or three values when no width
// was asked for.
const sdk = vi.hoisted(() => {
  const answer = async (params: { input: string | string[]; model: string; dimensions?: number }) => {
    const n = Array.isArray(params.input) ? params.input.length : 1;
    const embedding = params.dimensions
      ? Array.from({ length: params.dimensions }, (_, i) => (i + 1) / 10_000)
      : [0.1, 0.2, 0.3];
    return {
      data: Array.from({ length: n }, (_, index) => ({ index, embedding })),
      model: params.model,
      usage: { prompt_tokens: 3 * n },
    };
  };
  return { construct: vi.fn(), answer, create: vi.fn(answer) };
});

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
  EMBEDDING_PROBE_TIMEOUT_MS,
  probeEmbeddingLane,
} from '../embedding-provider';
import { GatewayPolicyError, getGateway, resetGateway } from '../../gateway';
import { SELF_HOSTED_EMBEDDING_MODEL } from '../../../embedding-corpus-policy';
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
    'EMBEDDING_LOCAL_MODEL',
    'EMBEDDING_LOCAL_NATIVE_DIMENSIONS',
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
  // Reset, not clear: a case that makes the server misbehave must not leak it.
  sdk.create.mockReset();
  sdk.create.mockImplementation(sdk.answer);
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
    // Elected OpenAI (ADR-0014 §1, P1-45), so the refusal is the zero-retention
    // floor's; an unelected tenant is refused earlier (embedding-provider-election.test.ts).
    const resolve = vi.fn(async () => ({ zeroDataRetention: true, allowedProviders: ['openai' as const] }));
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
    // Elected OpenAI (P1-45), so the refusal is the intended-use approval's.
    setOrgPlacementResolver({ resolve: async () => ({ allowedProviders: ['openai'] }) });
    const provider = getEmbeddingProvider();

    // Vault ingestion embeds inside a tenant scope; an unbound production call
    // refuses earlier (DENY_TENANT_POLICY, pinned in
    // tenant-placement-boundary.test.ts). This case is about the decider.
    await expect(
      runWithTenantScope({ tenantId: '7', source: 'test' }, () =>
        provider.embed({ input: [PHI_TEXT, PLAIN_TEXT] }),
      ),
    ).rejects.toMatchObject({
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
    // The local server serves its own model; the caller's OpenAI model id is not
    // forwarded. Unconfigured, the model asked for is the one the corpus policy
    // says the lane writes (BAAI/bge-m3), not bge-large-en-v1.5 as until P1-54
    // round 2: the ledger then named a model the server does not serve.
    expect(SELF_HOSTED_EMBEDDING_MODEL.model).toBe('BAAI/bge-m3');
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'BAAI/bge-m3' }));
    // Served, so recorded (D6, 2026-09-29): until then an allowed embedding left
    // no ledger row, and PHI embedded on-prem could not be shown from the ledger.
    const entries = (getGateway() as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      success: true,
      taskType: 'embedding',
      provider: 'local',
      model: 'BAAI/bge-m3',
      organizationId: 7,
      region: 'on_prem',
      dataClass: 'phi',
      inputTokens: 6,
      promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(entries[0].placementReasonCode).toMatch(/^ALLOW_/);
    expect(JSON.stringify(entries)).not.toContain('44819023');
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

describe('a served embedding is on the ledger (D6)', () => {
  it('one content-free served row, with the placement decision, the model and the tokens', async () => {
    const provider = getEmbeddingProvider();
    await runWithTenantScope({ tenantId: '7', source: 'test' }, () => provider.embed({ input: PLAIN_TEXT }));

    const entries = (getGateway() as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      success: true,
      taskType: 'embedding',
      provider: 'openai',
      model: 'text-embedding-3-small',
      inputTokens: 3,
      callerModule: 'embedding-provider',
      payloadProvenance: 'tenant_governed',
    });
    expect(JSON.stringify(entries)).not.toContain('release specifications');
  });

  it('an embedding the provider failed leaves a failure row, and the error still reaches the caller', async () => {
    sdk.create.mockRejectedValueOnce(Object.assign(new Error('upstream 503'), { status: 503 }));
    const provider = getEmbeddingProvider();

    await expect(provider.embed({ input: PLAIN_TEXT })).rejects.toThrow('upstream 503');

    const entries = (getGateway() as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ success: false, taskType: 'embedding', provider: 'openai', error: 'upstream 503' });
    expect(entries[0].approvedModelId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The self-hosted lane's width (ADR-0014 §1.5, amended 2026-10-01; P1-54 round 2).
//
// bge-m3 emits 1024 values; the corpora are vector(1536) and document_vectors
// vector(3072). Text Embeddings Inference refuses a request for more dimensions
// than the model emits (422), so the seam asked for 1536 and every embedding
// through the lane failed. The seam now asks for the model's own width and
// zero-pads to the corpus width (cosine and L2 between padded vectors are
// unchanged). It refuses rather than truncate, and refuses a vector that is not
// the model's width (another model behind the address) rather than pad it.

function useLocalLane(extra: Record<string, string> = {}) {
  process.env.EMBEDDING_PROVIDER = 'local';
  process.env.EMBEDDING_LOCAL_BASE_URL = 'http://embeddings.c2c-production.internal:8080/v1';
  Object.assign(process.env, extra);
  resetEmbeddingProvider();
  return getEmbeddingProvider();
}

describe("the self-hosted lane's width: the model's own, zero-padded to the corpus", () => {
  it('asks the server for 1024 (bge-m3) and pads each vector to the 1536 the corpus holds', async () => {
    const provider = useLocalLane();
    const result = await provider.embed({ input: [PLAIN_TEXT, PLAIN_TEXT], dimensions: 1536 });

    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'BAAI/bge-m3', dimensions: 1024 }));
    expect(result.embeddings).toHaveLength(2);
    for (const vector of result.embeddings) {
      expect(vector).toHaveLength(1536);
      // The model's values, unchanged, then zeros.
      expect(vector.slice(0, 1024)).toEqual(Array.from({ length: 1024 }, (_, i) => (i + 1) / 10_000));
      expect(vector.slice(1024).every(v => v === 0)).toBe(true);
    }
  });

  it('pads to 3072 for document_vectors, from the same 1024', async () => {
    const provider = useLocalLane();
    const result = await provider.embed({ input: PLAIN_TEXT, dimensions: 3072 });
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ dimensions: 1024 }));
    expect(result.embeddings[0]).toHaveLength(3072);
    expect(result.embeddings[0].slice(1024).every(v => v === 0)).toBe(true);
  });

  it('padding leaves the cosine between two vectors exactly as the model gave it', async () => {
    const a = Array.from({ length: 1024 }, (_, i) => Math.sin(i + 1));
    const b = Array.from({ length: 1024 }, (_, i) => Math.cos(i + 3));
    sdk.create.mockResolvedValueOnce({
      data: [{ index: 0, embedding: a }, { index: 1, embedding: b }],
      model: 'BAAI/bge-m3',
      usage: { prompt_tokens: 6 },
    } as never);
    const provider = useLocalLane();
    const [pa, pb] = (await provider.embed({ input: ['a', 'b'], dimensions: 1536 })).embeddings;
    const cosine = (x: number[], y: number[]) => {
      const dot = x.reduce((s, v, i) => s + v * y[i], 0);
      return dot / (Math.hypot(...x) * Math.hypot(...y));
    };
    expect(cosine(pa, pb)).toBe(cosine(a, b));
  });

  it('the native width is configurable (EMBEDDING_LOCAL_NATIVE_DIMENSIONS)', async () => {
    const provider = useLocalLane({ EMBEDDING_LOCAL_NATIVE_DIMENSIONS: '768' });
    const result = await provider.embed({ input: PLAIN_TEXT, dimensions: 1536 });
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ dimensions: 768 }));
    expect(result.embeddings[0]).toHaveLength(1536);
  });

  it('refuses, before anything is sent, when the model is wider than the corpus: no silent truncation', async () => {
    const provider = useLocalLane();
    await expect(provider.embed({ input: PLAIN_TEXT, dimensions: 512 })).rejects.toThrow(EmbeddingConfigurationError);
    await expect(provider.embed({ input: PLAIN_TEXT, dimensions: 512 })).rejects.toThrow(/1024.*512|512.*1024/);
    expect(sdk.construct).not.toHaveBeenCalled();
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it('refuses a vector wider than the model it asked for (another model behind the address), and records the failure', async () => {
    sdk.create.mockResolvedValueOnce({
      data: [{ index: 0, embedding: Array.from({ length: 1536 }, () => 0.01) }],
      model: 'BAAI/bge-m3',
      usage: { prompt_tokens: 3 },
    } as never);
    const provider = useLocalLane();
    await expect(provider.embed({ input: PLAIN_TEXT, dimensions: 1536 })).rejects.toThrow(EmbeddingConfigurationError);

    const entries = (getGateway() as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ success: false, taskType: 'embedding', provider: 'local' });
    expect(entries[0].error).toMatch(/1536/);
  });

  it('refuses a vector narrower than the model (it is not padded into the corpus either)', async () => {
    sdk.create.mockResolvedValueOnce({
      data: [{ index: 0, embedding: Array.from({ length: 768 }, () => 0.01) }],
      model: 'BAAI/bge-m3',
      usage: { prompt_tokens: 3 },
    } as never);
    const provider = useLocalLane();
    await expect(provider.embed({ input: PLAIN_TEXT, dimensions: 1536 })).rejects.toThrow(/768/);
  });

  it('a native width that is not a positive whole number is a configuration error naming the variable', () => {
    for (const value of ['abc', '0', '-1024', '1024.5']) {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.EMBEDDING_LOCAL_BASE_URL = 'http://embeddings.internal:8080/v1';
      process.env.EMBEDDING_LOCAL_NATIVE_DIMENSIONS = value;
      expect(() => resolveEmbeddingProvider()).toThrow(EmbeddingConfigurationError);
      expect(() => resolveEmbeddingProvider()).toThrow(/EMBEDDING_LOCAL_NATIVE_DIMENSIONS/);
    }
  });

  it('the OpenAI lane is unchanged: the corpus width is asked for and the vector returned as given', async () => {
    const provider = getEmbeddingProvider();
    expect(provider.kind).toBe('openai');
    const result = await provider.embed({ input: PLAIN_TEXT, model: 'text-embedding-3-small', dimensions: 1536 });
    expect(sdk.create).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: PLAIN_TEXT, dimensions: 1536 });
    expect(result.embeddings[0]).toHaveLength(1536);
    expect(result.embeddings[0][1535]).toBe(1536 / 10_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The readiness probe (DP-71; ADR-0014 §1.5 "Readiness tells the truth").
//
// Readiness reported the lane ready from its configuration. The probe embeds
// one short text through the configured lane at each corpus width and checks
// what came back; /readyz reads its verdict (server/startup/ana-readiness-state.ts).

describe('probeEmbeddingLane: one short text through the configured lane, at every corpus width', () => {
  it('the self-hosted lane passes when it serves bge-m3 at 1024, padded to 1536 and 3072', async () => {
    const provider = useLocalLane();
    const probe = await probeEmbeddingLane(provider);

    expect(probe).toMatchObject({ ok: true, lane: 'local', model: 'BAAI/bge-m3', widths: [1536, 3072] });
    expect(probe.detail).toMatch(/BAAI\/bge-m3/);
    expect(probe.detail).toMatch(/1024/);
    // One call per corpus width, each asking the model for its own width.
    expect(sdk.create).toHaveBeenCalledTimes(2);
    for (const [params] of sdk.create.mock.calls) expect(params).toMatchObject({ dimensions: 1024 });
    // Platform work: on the ledger, attributed to no organization.
    const entries = (getGateway() as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(2);
    for (const e of entries) expect(e).toMatchObject({ success: true, taskType: 'embedding', provider: 'local' });
    expect(entries.every((e: any) => e.organizationId === undefined)).toBe(true);
  });

  it('passes in production with no organization bound: the probe text is the platform\'s, and not sensitive', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = JSON.stringify({
      anthropic: { region: 'global', zeroRetentionApproved: true, approvedDataClasses: ['pii'], approvedIntendedUses: ['drafting'] },
    });
    const provider = useLocalLane();
    await expect(probeEmbeddingLane(provider)).resolves.toMatchObject({ ok: true });
  });

  it('fails, naming the widths, when the server answers in a width that is not the model\'s', async () => {
    sdk.create.mockResolvedValue({
      data: [{ index: 0, embedding: Array.from({ length: 1536 }, () => 0.01) }],
      model: 'BAAI/bge-m3',
      usage: { prompt_tokens: 3 },
    } as never);
    const probe = await probeEmbeddingLane(useLocalLane());
    expect(probe.ok).toBe(false);
    expect(probe.detail).toMatch(/1536/);
    expect(probe.detail).toMatch(/1024/);
  });

  it('fails when the server says it serves another model: one column must hold one model', async () => {
    sdk.create.mockImplementation(async (params: { dimensions?: number }) => ({
      data: [{ index: 0, embedding: Array.from({ length: params.dimensions ?? 1024 }, () => 0.01) }],
      model: 'BAAI/bge-large-en-v1.5',
      usage: { prompt_tokens: 3 },
    }) as never);
    const probe = await probeEmbeddingLane(useLocalLane());
    expect(probe.ok).toBe(false);
    expect(probe.detail).toMatch(/BAAI\/bge-large-en-v1\.5/);
    expect(probe.detail).toMatch(/BAAI\/bge-m3/);
  });

  it('fails when the server is unreachable, and the reason carries no address or upstream text', async () => {
    sdk.create.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 10.10.1.37:8080'), { name: 'APIConnectionError' }),
    );
    const probe = await probeEmbeddingLane(useLocalLane());
    expect(probe.ok).toBe(false);
    expect(probe.detail).toMatch(/could not be reached/);
    expect(probe.detail).not.toContain('10.10.1.37');
    expect(probe.detail).not.toContain('ECONNREFUSED');
  });

  it('fails when the server refuses, naming the HTTP status only', async () => {
    sdk.create.mockRejectedValue(
      Object.assign(new Error('`dimensions` should be smaller than the maximum embedding dimension.'), { status: 422 }),
    );
    const probe = await probeEmbeddingLane(useLocalLane());
    expect(probe.ok).toBe(false);
    expect(probe.detail).toMatch(/HTTP 422/);
  });

  it('fails when the lane hands back a zero vector, which is no embedding', async () => {
    sdk.create.mockImplementation(async () => ({
      data: [{ index: 0, embedding: Array.from({ length: 1024 }, () => 0) }],
      model: 'BAAI/bge-m3',
      usage: { prompt_tokens: 3 },
    }) as never);
    const probe = await probeEmbeddingLane(useLocalLane());
    expect(probe.ok).toBe(false);
    expect(probe.detail).toMatch(/zero/);
  });

  it('a server that never answers fails the probe within its bound, so boot is not held for the SDK\'s ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      sdk.create.mockImplementation(() => new Promise(() => {}) as never);
      const pending = probeEmbeddingLane(useLocalLane());
      await vi.advanceTimersByTimeAsync(EMBEDDING_PROBE_TIMEOUT_MS);
      const probe = await pending;
      expect(probe.ok).toBe(false);
      expect(probe.detail).toMatch(/did not answer within/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('on the OpenAI lane, asks each corpus model for its own width', async () => {
    const probe = await probeEmbeddingLane(getEmbeddingProvider());
    expect(probe).toMatchObject({ ok: true, lane: 'openai', widths: [1536, 3072] });
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'text-embedding-3-small', dimensions: 1536 }));
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'text-embedding-3-large', dimensions: 3072 }));
  });
});
