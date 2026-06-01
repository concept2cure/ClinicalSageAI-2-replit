/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                              RAG ROUTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single entry point for retrieval-augmented generation.
 *
 * WHY THIS EXISTS
 * The codebase grew several parallel RAG implementations (advancedRAGPipeline,
 * biotechRagService, regulatory-guidance-retrieval, a separate Python ICH
 * ingest) with no shared router, so corpus selection, retrieval strategy, and
 * tenant scoping were duplicated and drifted apart. The in-memory
 * semantic-search-service (local hash embeddings) has since been removed in
 * favour of this path. See DATA_KNOWLEDGE_MEMORY_LAYER_AUDIT.md.
 *
 * This module is the convergence point. It owns pool acquisition and maps a
 * caller "intent" to a reviewed default retrieval policy, then delegates to
 * AdvancedRAGPipeline. Callers that need to deviate from the intent defaults
 * (a specific threshold, a basic-strategy sweep, MMR off) pass explicit
 * overrides rather than constructing pipeline options inline. Centralising the
 * policy here is what lets us later swap the underlying engine or embedding
 * space without touching every call site.
 *
 * Two surfaces:
 *   - ragQuery    — retrieve + generate a grounded answer.
 *   - ragRetrieve — retrieve only (the caller does its own generation/streaming).
 */

import { getPool } from '../db';
import {
  getRAGPipeline,
  type RetrievalOptions,
  type RAGContext,
  type RetrievedDocument,
} from './advancedRAGPipeline.js';
import {
  recordRagRetrieval,
  type RagCorpusLabel,
  type RagOutcome,
} from './rag-metrics.js';

/**
 * Caller intent. Each maps to a vetted default retrieval configuration so
 * individual call sites do not hand-tune strategy/reranking/MMR independently.
 */
export type RagIntent = 'regulatory_qa' | 'foresight' | 'project_scoped';

/**
 * Retrieval parameters. `intent` selects the default policy; any explicitly
 * provided field overrides that default for this call only.
 */
export interface RagRetrievalParams {
  query: string;
  intent?: RagIntent;
  /** Tenant scope for org-level corpora (vault). */
  organizationUuid?: string;
  /** Project scope — routes retrieval through project-scoped atoms. */
  artifactScope?: { projectId: number | string; organizationUuid: string };
  /**
   * Corpus to read from. Defaults to the vault. Set 'rag_chunks' to target the
   * rag_chunks corpus (scoped by the integer `organizationId`), which is how
   * callers reach that store through the single router instead of a separate
   * retrieval engine.
   */
  corpus?: 'vault' | 'rag_chunks';
  /** Integer org id for `corpus: 'rag_chunks'` tenant scoping. */
  organizationId?: number;
  /** Result count (default 5). */
  limit?: number;
  /** Similarity floor; when omitted the pipeline default applies. */
  threshold?: number;
  /** Persist evidence citations to the audit ledger (requires organizationUuid). */
  persistCitations?: boolean;

  // ── Explicit overrides of the intent defaults ──────────────────────────────
  strategy?: RetrievalOptions['strategy'];
  useReranking?: boolean;
  useMmr?: boolean;
  mmrLambda?: number;
  useCompression?: boolean;
  filters?: RetrievalOptions['filters'];
}

export interface RagRouterResult {
  answer: string;
  sources: RetrievedDocument[];
  context: RAGContext;
}

/** Per-intent default policy. Centralised so the trade-offs are reviewed in one place. */
function intentDefaults(intent: RagIntent | undefined): Partial<RetrievalOptions> {
  switch (intent) {
    case 'project_scoped':
      // Project interrogation: stay inside the dossier, favour precision.
      return { strategy: 'advanced', useReranking: true, useMmr: true, mmrLambda: 0.8 };
    case 'foresight':
      // Forward-looking synthesis: a touch more diversity across sources.
      return { strategy: 'advanced', useReranking: true, useMmr: true, mmrLambda: 0.6 };
    case 'regulatory_qa':
    default:
      return { strategy: 'advanced', useReranking: true, useMmr: true, mmrLambda: 0.7 };
  }
}

/**
 * Build pipeline options from intent defaults, with explicit params taking
 * precedence. Exported for unit testing the policy/override merge.
 */
export function optionsForIntent(params: RagRetrievalParams): RetrievalOptions {
  const defaults = intentDefaults(params.intent);
  const pick = <T>(override: T | undefined, fallback: T | undefined): T | undefined =>
    override !== undefined ? override : fallback;

  return {
    strategy: pick(params.strategy, defaults.strategy) ?? 'advanced',
    limit: params.limit ?? 5,
    threshold: params.threshold,
    useReranking: pick(params.useReranking, defaults.useReranking),
    useMmr: pick(params.useMmr, defaults.useMmr),
    mmrLambda: pick(params.mmrLambda, defaults.mmrLambda),
    useCompression: params.useCompression,
    organizationUuid: params.organizationUuid,
    artifactScope: params.artifactScope,
    corpus: params.corpus,
    organizationId: params.organizationId,
    persistCitations: params.persistCitations,
    filters: params.filters,
  };
}

/**
 * Retrieve relevant context only (no generation). Returns the full RAGContext
 * so callers can run their own generation/streaming over the documents.
 */
/** The corpus a retrieval actually read from, for the observability label. */
function corpusLabel(params: RagRetrievalParams): RagCorpusLabel {
  if (params.artifactScope) return 'project_atoms';
  return params.corpus === 'rag_chunks' ? 'rag_chunks' : 'vault';
}

/**
 * Record one retrieval against the in-memory metrics surfaced on /api/metrics.
 * On success, latency is the pipeline's own retrieval time (comparable across
 * retrieve/query); on error it's measured wall clock. Best-effort — a metrics
 * failure must never break a retrieval.
 */
function recordRetrieval(
  params: RagRetrievalParams,
  options: RetrievalOptions,
  wallStart: number,
  ctx: RAGContext | undefined
): void {
  try {
    const corpus = corpusLabel(params);
    const intent = params.intent ?? 'regulatory_qa';
    const strategy = options.strategy ?? 'advanced';
    if (!ctx) {
      recordRagRetrieval({ corpus, intent, strategy, outcome: 'error', latencyMs: Date.now() - wallStart });
      return;
    }
    const returned = ctx.documents.length;
    const outcome: RagOutcome = returned > 0 ? 'ok' : 'empty';
    recordRagRetrieval({
      corpus,
      intent,
      strategy,
      outcome,
      latencyMs: ctx.processingTimeMs,
      candidates: ctx.totalCandidates,
      returned,
      topScore: returned > 0 ? ctx.documents[0].finalScore : undefined,
      tokensUsed: ctx.tokensUsed,
    });
  } catch {
    /* metrics are best-effort; never surface a recording failure to the caller */
  }
}

export async function ragRetrieve(params: RagRetrievalParams): Promise<RAGContext> {
  const pipeline = getRAGPipeline(getPool());
  const options = optionsForIntent(params);
  const wallStart = Date.now();
  try {
    const ctx = await pipeline.retrieve(params.query, options);
    recordRetrieval(params, options, wallStart, ctx);
    return ctx;
  } catch (err) {
    recordRetrieval(params, options, wallStart, undefined);
    throw err;
  }
}

/**
 * Run a full RAG query (retrieve + generate) through the single router.
 */
export async function ragQuery(params: RagRetrievalParams): Promise<RagRouterResult> {
  const pipeline = getRAGPipeline(getPool());
  const options = optionsForIntent(params);
  const wallStart = Date.now();
  try {
    const result = await pipeline.queryWithGeneration(params.query, options);
    recordRetrieval(params, options, wallStart, result.context);
    return {
      answer: result.answer,
      sources: result.sources,
      context: result.context,
    };
  } catch (err) {
    recordRetrieval(params, options, wallStart, undefined);
    throw err;
  }
}

export const ragRouter = { query: ragQuery, retrieve: ragRetrieve };
