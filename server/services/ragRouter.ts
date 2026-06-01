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
 * This module is the convergence point. It maps a caller "intent" to a single,
 * reviewed set of retrieval options and delegates to AdvancedRAGPipeline. New
 * callers should depend on THIS module rather than constructing pipeline
 * options inline; the legacy services are being migrated behind it
 * incrementally. Keeping the policy in one place is what lets us later swap the
 * underlying engine or embedding space without touching every call site.
 */

import { getPool } from '../db';
import {
  getRAGPipeline,
  type RetrievalOptions,
  type RAGContext,
  type RetrievedDocument,
} from './advancedRAGPipeline.js';

/**
 * Caller intent. Each maps to a vetted retrieval configuration so individual
 * call sites do not hand-tune strategy/reranking/MMR independently.
 */
export type RagIntent = 'regulatory_qa' | 'foresight' | 'project_scoped';

export interface RagRouterQuery {
  query: string;
  intent?: RagIntent;
  /** Tenant scope for org-level corpora (vault). */
  organizationUuid?: string;
  /** Project scope — routes retrieval through project-scoped atoms. */
  artifactScope?: { projectId: number | string; organizationUuid: string };
  /** Override the intent's default result count. */
  limit?: number;
  /** Persist evidence citations to the audit ledger (requires organizationUuid). */
  persistCitations?: boolean;
}

export interface RagRouterResult {
  answer: string;
  sources: RetrievedDocument[];
  context: RAGContext;
}

/**
 * Default retrieval policy per intent. Centralised so the trade-offs
 * (cost/latency vs. recall/diversity) are reviewed in one place.
 */
function optionsForIntent(params: RagRouterQuery): RetrievalOptions {
  const base: RetrievalOptions = {
    strategy: 'advanced',
    limit: params.limit ?? 5,
    useReranking: true,
    useMmr: true,
    organizationUuid: params.organizationUuid,
    artifactScope: params.artifactScope,
    persistCitations: params.persistCitations,
  };

  switch (params.intent) {
    case 'project_scoped':
      // Project interrogation: stay inside the dossier, favour precision.
      return { ...base, mmrLambda: 0.8 };
    case 'foresight':
      // Forward-looking synthesis: a touch more diversity across sources.
      return { ...base, mmrLambda: 0.6 };
    case 'regulatory_qa':
    default:
      return base;
  }
}

/**
 * Run a full RAG query (retrieve + generate) through the single router.
 */
export async function ragQuery(params: RagRouterQuery): Promise<RagRouterResult> {
  const pipeline = getRAGPipeline(getPool());
  const options = optionsForIntent(params);
  const result = await pipeline.queryWithGeneration(params.query, options);
  return {
    answer: result.answer,
    sources: result.sources,
    context: result.context,
  };
}

export const ragRouter = { query: ragQuery };
