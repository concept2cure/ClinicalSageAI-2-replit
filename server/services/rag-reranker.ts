/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                          RAG RERANKER PROVIDERS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A reranker takes the query and a candidate set, and returns a relevance score
 * in [0,1] for each candidate (aligned to input order). The pipeline owns how
 * those scores are combined with the embedding score and how documents are
 * sorted — this module is only the scoring strategy, so it stays agnostic of
 * the RetrievedDocument shape.
 *
 * Two providers:
 *   - LlmJudgeReranker  — the default. An LLM scores each candidate's relevance
 *     (LLM-as-judge, not a cross-encoder). No new dependency; routes through the
 *     pipeline's cached AI router. This preserves the prior behavior exactly.
 *   - CrossEncoderReranker — a true cross-encoder reranker behind an HTTP API
 *     (Cohere / Voyage shape). OFF by default; only used when RAG_RERANKER_*
 *     env is configured. IMPORTANT: enabling this sends query + candidate text
 *     to an external service — do not enable it for a tenant whose data may not
 *     leave the system.
 *
 * getReranker() reads the env once and picks the provider; if the cross-encoder
 * is misconfigured we fall back to the LLM judge rather than failing retrieval.
 */

import type { AIRequest, AIResponse } from './aiProviderRouter.js';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('rag-reranker');

/** A candidate to be scored. The pipeline maps its documents down to this. */
export interface RerankDocument {
  title: string;
  content: string;
}

export interface RerankScores {
  /** Relevance score in [0,1] for each input doc, aligned to input order. */
  scores: number[];
  /** Auxiliary LLM tokens spent (0 for non-LLM providers). */
  tokensUsed: number;
}

export interface Reranker {
  /** Stable identifier for logs/metrics, e.g. 'llm_judge' or 'cohere:rerank-v3.5'. */
  readonly name: string;
  /**
   * Score each candidate's relevance to the query in [0,1], aligned to input
   * order. Implementations must return exactly `docs.length` scores; on any
   * internal failure they should throw so the pipeline can fall back.
   */
  score(query: string, docs: RerankDocument[]): Promise<RerankScores>;
}

/** Inject the pipeline's cached router so LLM-judge reranks stay cached. */
export type RouteFn = (request: AIRequest) => Promise<AIResponse>;

/** Clamp to [0,1]; map non-finite to a neutral 0.5 so one bad score can't reorder pathologically. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ═══════════════════════════════════════════════════════════════════════════
//                          LLM-AS-JUDGE RERANKER (default)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prompts an LLM to score each document 0-100, then normalizes to [0,1]. This
 * is the historical behavior, extracted verbatim into a provider. NOT a
 * cross-encoder — there is no cross-attention; it is a prompted relevance score.
 */
export class LlmJudgeReranker implements Reranker {
  readonly name = 'llm_judge';
  /** Per-doc content budget in the prompt; longer docs are truncated. */
  private readonly perDocChars = 500;

  constructor(private readonly route: RouteFn) {}

  async score(query: string, docs: RerankDocument[]): Promise<RerankScores> {
    if (docs.length === 0) return { scores: [], tokensUsed: 0 };

    const docList = docs
      .map(
        (doc, idx) =>
          `[${idx + 1}] ${doc.title}\n${doc.content.slice(0, this.perDocChars)}${
            doc.content.length > this.perDocChars ? '...' : ''
          }`
      )
      .join('\n\n');

    const response = await this.route({
      taskType: 'structured_output',
      messages: [
        {
          role: 'system',
          content: `You are a relevance judge. Score each document's relevance to the query on a scale of 0-100.
Return ONLY a JSON object with document indices as keys and scores as values.
Example: {"1": 95, "2": 72, "3": 45}`,
        },
        {
          role: 'user',
          content: `Query: "${query}"\n\nDocuments:\n${docList}\n\nScore each document's relevance (0-100):`,
        },
      ],
      maxTokens: 200,
      temperature: 0,
      jsonMode: true,
    });

    let parsed: Record<string, number>;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      // Unparseable judge output: neutral scores keep the embedding order.
      return { scores: docs.map(() => 0.5), tokensUsed: response.usage.totalTokens };
    }

    // 1-based indices in the prompt; missing entries default to neutral 0.5.
    const scores = docs.map((_, idx) => clamp01((parsed[String(idx + 1)] ?? 50) / 100));
    return { scores, tokensUsed: response.usage.totalTokens };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          CROSS-ENCODER RERANKER (opt-in)
// ═══════════════════════════════════════════════════════════════════════════

export interface CrossEncoderConfig {
  /** 'cohere' | 'voyage' — selects endpoint + response shape defaults. */
  provider: string;
  apiKey: string;
  model: string;
  /** Override the endpoint (self-hosted gateway). Defaults per provider. */
  baseUrl?: string;
  /** Per-doc content budget sent to the API. */
  maxDocChars?: number;
  /** Network timeout. */
  timeoutMs?: number;
}

const PROVIDER_DEFAULTS: Record<string, { url: string }> = {
  cohere: { url: 'https://api.cohere.com/v2/rerank' },
  voyage: { url: 'https://api.voyageai.com/v1/rerank' },
};

/**
 * A real cross-encoder reranker behind an HTTP API (Cohere/Voyage response
 * shape: `results: [{ index, relevance_score }]`). Returns scores aligned to
 * input order. Throws on transport/HTTP/shape errors so the pipeline falls back
 * to the LLM judge (or to the embedding order).
 */
export class CrossEncoderReranker implements Reranker {
  readonly name: string;
  private readonly url: string;
  private readonly maxDocChars: number;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: CrossEncoderConfig) {
    const defaults = PROVIDER_DEFAULTS[cfg.provider];
    this.url = cfg.baseUrl || defaults?.url || '';
    this.maxDocChars = cfg.maxDocChars ?? 2000;
    this.timeoutMs = cfg.timeoutMs ?? 10_000;
    this.name = `${cfg.provider}:${cfg.model}`;
    if (!this.url) {
      throw new Error(`CrossEncoderReranker: no endpoint for provider "${cfg.provider}"`);
    }
  }

  async score(query: string, docs: RerankDocument[]): Promise<RerankScores> {
    if (docs.length === 0) return { scores: [], tokensUsed: 0 };

    const documents = docs.map(d => d.content.slice(0, this.maxDocChars));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          query,
          documents,
          top_n: documents.length, // we need every score back, in input order
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(`reranker HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const body = (await res.json()) as { results?: Array<{ index: number; relevance_score: number }> };
    const results = body.results;
    if (!Array.isArray(results)) {
      throw new Error('reranker response missing "results" array');
    }

    // Results may come back ranked (not in input order) — scatter by index.
    const scores = new Array<number>(docs.length).fill(0);
    for (const r of results) {
      if (typeof r.index === 'number' && r.index >= 0 && r.index < docs.length) {
        scores[r.index] = clamp01(r.relevance_score);
      }
    }
    return { scores, tokensUsed: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                                FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/** Read the cross-encoder config from env, or null if not fully configured. */
export function crossEncoderConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): CrossEncoderConfig | null {
  const provider = env.RAG_RERANKER_PROVIDER?.trim().toLowerCase();
  const apiKey = env.RAG_RERANKER_API_KEY?.trim();
  const model = env.RAG_RERANKER_MODEL?.trim();
  if (!provider || !apiKey || !model) return null;
  return {
    provider,
    apiKey,
    model,
    baseUrl: env.RAG_RERANKER_BASE_URL?.trim() || undefined,
  };
}

/**
 * Pick the reranker for this process. Cross-encoder when RAG_RERANKER_* is fully
 * configured (and constructs cleanly), otherwise the LLM judge. The selection is
 * logged once so the active reranker is visible in startup logs.
 */
export function getReranker(route: RouteFn, env: NodeJS.ProcessEnv = process.env): Reranker {
  const cfg = crossEncoderConfigFromEnv(env);
  if (cfg) {
    try {
      const reranker = new CrossEncoderReranker(cfg);
      log.info(`using cross-encoder reranker (${reranker.name})`);
      return reranker;
    } catch (error) {
      log.warn('cross-encoder reranker misconfigured; falling back to llm_judge', { error });
    }
  }
  return new LlmJudgeReranker(route);
}
