/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                              RAG ROUTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single entry point for retrieval-augmented generation.
 *
 * WHY THIS EXISTS
 * The codebase grew several parallel RAG implementations (advancedRAGPipeline,
 * biotechRagService, semantic-search-service, regulatory-guidance-retrieval, a
 * separate Python ICH ingest) with no shared router, so corpus selection,
 * retrieval strategy, and tenant scoping were duplicated and drifted apart.
 * See DATA_KNOWLEDGE_MEMORY_LAYER_AUDIT.md.
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
    persistCitations: params.persistCitations,
    filters: params.filters,
  };
}

/**
 * Retrieve relevant context only (no generation). Returns the full RAGContext
 * so callers can run their own generation/streaming over the documents.
 */
export async function ragRetrieve(params: RagRetrievalParams): Promise<RAGContext> {
  const pipeline = getRAGPipeline(getPool());
  return pipeline.retrieve(params.query, optionsForIntent(params));
}

/**
 * Run a full RAG query (retrieve + generate) through the single router.
 */
export async function ragQuery(params: RagRetrievalParams): Promise<RagRouterResult> {
  const pipeline = getRAGPipeline(getPool());
  const result = await pipeline.queryWithGeneration(params.query, optionsForIntent(params));
  return {
    answer: result.answer,
    sources: result.sources,
    context: result.context,
  };
}

export const ragRouter = { query: ragQuery, retrieve: ragRetrieve };
