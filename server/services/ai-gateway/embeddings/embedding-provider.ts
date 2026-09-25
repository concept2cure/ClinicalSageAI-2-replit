/**
 * Embedding provider abstraction.
 *
 * All retrieval in the platform depends on embeddings, and today those are
 * produced exclusively by the OpenAI embeddings API (see
 * enhancedEmbeddingService.ts). That single dependency is the hardest blocker
 * for an air-gapped / on-prem deployment: you cannot run RAG offline if the
 * embedder is a third-party API call.
 *
 * This module introduces a provider seam so the embedder can be swapped for a
 * self-hostable, OpenAI-compatible endpoint (a vLLM / Text-Embeddings-Inference
 * / LiteLLM server serving an open-weight embedding model) without touching the
 * corpus policy or the pgvector dimensions. Both providers speak the OpenAI
 * `embeddings.create` shape, so the dimension contract (1536d / 3072d) is
 * preserved as long as the self-hosted model matches the corpus dimension.
 *
 * Deepen path: route enhancedEmbeddingService.embed() through
 * getEmbeddingProvider() so the existing corpus-policy-governed runtime gains
 * the local lane for free. Until then this is the canonical seam new code
 * should target.
 *
 * ── Placement (P0-11, SECURITY_AUDIT_2026-09-24 DP-07) ──────────────────────
 * This is the one egress in the gateway tree that does not pass through
 * `AIGateway.route()`, and it used to reach the provider with no
 * classification, placement decision or audit row. `embed()` now asks
 * `AIGateway.authorizeEmbedding` — the org's placement policy, content
 * classification and the last-mile sensitive-dispatch gate, with intended use
 * `embedding` — BEFORE the SDK client is constructed. A refusal is a terminal
 * `GatewayPolicyError`; the client is never built and nothing is sent. The
 * organisation comes from the request, else from the running tenant scope.
 *
 * @module server/services/ai-gateway/embeddings/embedding-provider
 */

import OpenAI from 'openai';
import { getTenantScope } from '../../../db/tenantStore.js';

export type EmbeddingProviderKind = 'openai' | 'local';

export interface EmbeddingRequest {
  input: string | string[];
  /** Model id; defaults to the provider's configured default. */
  model?: string;
  /** Target dimension (passed through where the server supports it). */
  dimensions?: number;
  /**
   * The organisation whose content this is. It drives the placement decision
   * (the org's residency / zero-retention policy and the sensitive-dispatch
   * approvals). When absent, the running request's tenant scope supplies it.
   */
  organizationId?: string | number;
}

export interface EmbeddingProviderResult {
  embeddings: number[][];
  model: string;
  provider: EmbeddingProviderKind;
  /** Total input tokens, when the server reports them. */
  inputTokens: number;
}

export interface EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  readonly defaultModel: string;
  /** Substrate this embedder runs on — mirrors the chat placement taxonomy. */
  readonly selfHosted: boolean;
  embed(req: EmbeddingRequest): Promise<EmbeddingProviderResult>;
}

/**
 * The configured embedding lane cannot be honoured as configured. Thrown
 * instead of falling back to another lane: a fallback would send content
 * declared for one substrate to a different one, silently.
 */
export class EmbeddingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingConfigurationError';
  }
}

/**
 * The organisation of the running request, when the caller passed none. The
 * estate-wide system scope (`runWithSystemTenantScope`, tenantId '0') is not
 * an organisation and is not offered as one.
 */
function scopedOrganizationId(): string | undefined {
  const tenantId = getTenantScope()?.tenantId;
  return tenantId && tenantId !== '0' ? tenantId : undefined;
}

/** Shared OpenAI-compatible embedding implementation (frontier or self-hosted). */
class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  readonly defaultModel: string;
  readonly selfHosted: boolean;
  private opts: { apiKey: string; baseURL?: string };
  private client: OpenAI | null = null;

  constructor(opts: {
    kind: EmbeddingProviderKind;
    defaultModel: string;
    selfHosted: boolean;
    apiKey: string;
    baseURL?: string;
  }) {
    this.kind = opts.kind;
    this.defaultModel = opts.defaultModel;
    this.selfHosted = opts.selfHosted;
    this.opts = { apiKey: opts.apiKey, baseURL: opts.baseURL };
  }

  // Lazily construct the client so resolving a provider never throws when a key
  // is absent (keyless boot / tests); the auth error surfaces at call time.
  // Lazy construction is also what lets the placement gate in embed() refuse a
  // call before any client exists.
  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.opts.apiKey || 'not-configured',
        ...(this.opts.baseURL ? { baseURL: this.opts.baseURL.replace(/\/$/, '') } : {}),
      });
    }
    return this.client;
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingProviderResult> {
    // Placement decision first — before the client is constructed, so a
    // refusal leaves no client and sends nothing. The gateway is imported here
    // rather than at module top: it is a heavy module and this seam is loaded
    // by the corpus runtime early in boot. A refusal throws GatewayPolicyError.
    const texts = Array.isArray(req.input) ? req.input : [req.input];
    const { getGateway } = await import('../gateway.js');
    await getGateway().authorizeEmbedding({
      organizationId: req.organizationId ?? scopedOrganizationId(),
      provider: this.kind,
      texts,
    });

    // For a self-hosted endpoint the caller's model id (an OpenAI model name,
    // chosen per corpus) is meaningless — the local server serves its own
    // configured model. Use the configured local model and honor only the
    // requested dimension (the operator must deploy a model whose dimension
    // matches the target corpus). Frontier/OpenAI keeps the caller's model.
    const model = this.selfHosted ? this.defaultModel : (req.model || this.defaultModel);
    const params: any = { model, input: req.input };
    // `dimensions` is supported by OpenAI's v3 models and many local servers;
    // omit it when not requested so servers that reject the field still work.
    if (req.dimensions) params.dimensions = req.dimensions;

    const res: any = await this.getClient().embeddings.create(params);
    const embeddings: number[][] = (res.data || [])
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((d: any) => d.embedding as number[]);

    return {
      embeddings,
      model: res.model || model,
      provider: this.kind,
      inputTokens: res.usage?.prompt_tokens || res.usage?.total_tokens || 0,
    };
  }
}

let cached: EmbeddingProvider | null = null;

/**
 * Resolve the configured embedding provider.
 *
 *   EMBEDDING_PROVIDER=openai (default) → OpenAI embeddings API.
 *   EMBEDDING_PROVIDER=local            → self-hosted OpenAI-compatible endpoint
 *                                         (EMBEDDING_LOCAL_BASE_URL, e.g. a TEI
 *                                         or vLLM server), enabling offline RAG.
 *
 * The selected provider must produce vectors of the dimension the target
 * corpus expects (see embedding-corpus-policy.ts) — switching the embedder
 * does not migrate existing vectors.
 *
 * `local` with no base URL is a configuration error, not a fallback: until
 * P0-11 it logged a warning and returned the OpenAI provider, so a deployment
 * that declared the self-hosted lane sent its content to the shared frontier
 * API. Fail closed and name the variable.
 */
export function resolveEmbeddingProvider(): EmbeddingProvider {
  const kind = (process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();

  if (kind === 'local' || kind === 'openai_compatible' || kind === 'self_hosted') {
    const baseURL = process.env.EMBEDDING_LOCAL_BASE_URL || process.env.LOCAL_AI_BASE_URL;
    if (!baseURL) {
      throw new EmbeddingConfigurationError(
        `EMBEDDING_PROVIDER=${kind} requires EMBEDDING_LOCAL_BASE_URL (or LOCAL_AI_BASE_URL) to name ` +
          'the self-hosted embedding endpoint. Refusing to fall back to OpenAI: content declared for ' +
          'the self-hosted lane must not be sent to a shared frontier API.',
      );
    }
    return new OpenAICompatibleEmbeddingProvider({
      kind: 'local',
      selfHosted: true,
      defaultModel: process.env.EMBEDDING_LOCAL_MODEL || 'bge-large-en-v1.5',
      apiKey: process.env.EMBEDDING_LOCAL_API_KEY || 'not-required',
      baseURL,
    });
  }

  return new OpenAICompatibleEmbeddingProvider({
    kind: 'openai',
    selfHosted: false,
    defaultModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY || '',
  });
}

/** Memoized accessor (kind is process-stable). */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cached) cached = resolveEmbeddingProvider();
  return cached;
}

/** Reset the memoized provider (tests / env changes). */
export function resetEmbeddingProvider(): void {
  cached = null;
}
