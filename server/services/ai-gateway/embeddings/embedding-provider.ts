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
 * @module server/services/ai-gateway/embeddings/embedding-provider
 */

import OpenAI from 'openai';
import { createScopedLogger } from '../../../utils/logger.js';

const log = createScopedLogger('ai-gateway:embeddings');

export type EmbeddingProviderKind = 'openai' | 'local';

export interface EmbeddingRequest {
  input: string | string[];
  /** Model id; defaults to the provider's configured default. */
  model?: string;
  /** Target dimension (passed through where the server supports it). */
  dimensions?: number;
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
    const model = req.model || this.defaultModel;
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
 */
export function resolveEmbeddingProvider(): EmbeddingProvider {
  const kind = (process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();

  if (kind === 'local' || kind === 'openai_compatible' || kind === 'self_hosted') {
    const baseURL = process.env.EMBEDDING_LOCAL_BASE_URL || process.env.LOCAL_AI_BASE_URL;
    if (!baseURL) {
      log.warn(
        '[AI Gateway] EMBEDDING_PROVIDER=local but EMBEDDING_LOCAL_BASE_URL is unset — ' +
          'falling back to OpenAI embeddings.',
      );
    } else {
      return new OpenAICompatibleEmbeddingProvider({
        kind: 'local',
        selfHosted: true,
        defaultModel: process.env.EMBEDDING_LOCAL_MODEL || 'bge-large-en-v1.5',
        apiKey: process.env.EMBEDDING_LOCAL_API_KEY || 'not-required',
        baseURL,
      });
    }
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
