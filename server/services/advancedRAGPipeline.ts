/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    ADVANCED RAG PIPELINE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Retrieval-Augmented Generation pipeline with:
 * - LLM-based reranking for improved relevance
 * - HyDE (Hypothetical Document Embeddings) for query expansion
 * - Multi-query retrieval for better coverage
 * - Maximal Marginal Relevance (MMR) for diversity
 * - Contextual compression for token efficiency
 *
 * TECHNIQUES IMPLEMENTED:
 * 1. HyDE - Generate hypothetical answer, embed that
 * 2. Multi-Query - Expand query into multiple perspectives
 * 2b. Step-Back - Derive a broader question (rag-query-transforms.ts) and
 *     retrieve on it alongside the original for background context
 * 2c. Decompose - Split a multi-part question into atomic sub-questions
 *     (rag-query-transforms.ts) and retrieve each alongside the original
 * 3. Reranking - pluggable via rag-reranker.ts. Defaults to an LLM-as-judge
 *    (a prompted relevance score, NOT a cross-encoder); swaps to a true
 *    cross-encoder reranker when RAG_RERANKER_* env is configured.
 * 4. MMR - Balance relevance with diversity, measured in embedding space
 * 5. Contextual Compression - Extract only relevant passages
 * 6. Small-to-Big - Rank on precise chunks, then expand each to its neighbour
 *    window in the source document so generation reads the surrounding context
 * 7. Corrective loop (CRAG/Self-RAG) - rag-corrective-loop.ts. Opt-in: grade
 *    context sufficiency + rewrite/re-retrieve, then a groundedness guard that
 *    flags answers unsupported by sources. Annotates rather than withholds.
 *
 * The auxiliary reasoning steps (HyDE, query expansion, reranking, compression)
 * are cached in-memory per identical request to cut redundant LLM round-trips;
 * the final grounded answer is never cached.
 *
 * @author Concept2Cure AI Team
 * @version 2.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { EnhancedEmbeddingService, getEmbeddingService } from './enhancedEmbeddingService.js';
import { AIProviderRouter, getAIRouter, type AIRequest, type AIResponse } from './aiProviderRouter.js';
import { getOpenAIClient } from './openai-client.js';
import { getReranker, type Reranker } from './rag-reranker.js';
import { fuseHybrid, mergeByMaxScore } from './rag-fusion.js';
import {
  hydeRetrieval,
  multiQueryRetrieval,
  stepBackRetrieval,
  decomposeRetrieval,
  type StrategyDeps,
} from './rag-retrieval-strategies.js';
import {
  gradeContextSufficiency,
  rewriteQuery,
  verifyGroundedness,
} from './rag-corrective-loop.js';
import { extractQueryFilters } from './rag-query-transforms.js';
import {
  buildDocFilterClause,
  mergeFilters,
  VAULT_FILTER_COLUMNS,
  RAG_FILTER_COLUMNS,
  type QueryFilters,
} from './rag-filters.js';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface RetrievalOptions {
  strategy: 'basic' | 'hyde' | 'multi_query' | 'step_back' | 'decompose' | 'advanced';
  limit?: number;
  threshold?: number;
  useReranking?: boolean;
  useMmr?: boolean;
  mmrLambda?: number; // 0 = max diversity, 1 = max relevance
  /**
   * Fuse dense (vector) retrieval with a sparse (Postgres full-text) retrieval
   * via Reciprocal Rank Fusion on the vault / rag_chunks corpora. Recovers
   * keyword/exact-term matches that pure embeddings miss (codes, acronyms, rare
   * tokens) without sacrificing semantic recall. Ignored by the project-atom and
   * memory paths (project atoms already run their own hybrid; memory stays
   * similarity-pure). Off unless set — the router enables it per intent.
   */
  useHybrid?: boolean;
  /**
   * Small-to-big context expansion. After ranking on precise small chunks,
   * expand each vault / rag_chunks result to include its neighbouring chunks in
   * the same document (a ±`contextWindow` sentence-window) so generation sees
   * the surrounding context the chunk alone omits. Off unless set. No effect on
   * project-atom / memory corpora (no chunk index to window over).
   */
  useContextExpansion?: boolean;
  /** Neighbours to include on each side for useContextExpansion (default 1). */
  contextWindow?: number;
  /**
   * Agentic corrective loop (CRAG / Self-RAG) around generation: grade whether
   * the retrieved sources can answer the question and, if not, rewrite the query
   * and retrieve once more; then verify the drafted answer is grounded in the
   * sources and flag it when it is not. Off unless set — opt-in on the generation
   * path, and it annotates (a `grounded` flag) rather than withholding answers.
   */
  useCorrectiveLoop?: boolean;
  /**
   * Self-querying: extract metadata constraints (document type, source, date
   * range) from the natural-language query via the LLM and apply them as SQL
   * pre-filters on the vault / rag_chunks corpora, merged under any explicit
   * `filters` (explicit wins). Off unless set. No effect on project-atom /
   * memory corpora, and `filters.domain` is never applied (no column exists).
   */
  useSelfQuery?: boolean;
  useCompression?: boolean;
  organizationUuid?: string;
  persistCitations?: boolean;
  filters?: {
    atomType?: string;
    domain?: string;
    source?: string;
    dateRange?: { start: Date; end: Date };
  };
  /**
   * Constrain initial retrieval to atoms belonging to artifacts under a
   * specific Concept2Cure project. When set, the pipeline routes through
   * `lumen_data_atoms` with the project-scoped hybrid search (the same
   * surface as `enhancedEmbeddingService.searchHybrid`) instead of the
   * vault. HyDE / multi-query / rerank / MMR all run on top of that
   * project-scoped candidate set, so cross-module retrieval stays inside
   * the dossier.
   *
   * Required by submission-chat: `artifactScope.organizationUuid` plus
   * `artifactScope.projectId` push the project filter into the SQL so
   * we never leak cross-project chunks into a project's interrogation.
   */
  artifactScope?: {
    projectId: number | string;
    organizationUuid: string;
  };
  /**
   * Which corpus to retrieve from. Defaults to the vault. Set 'rag_chunks' to
   * target the rag_chunks corpus (the registered hot-path chunk store also used
   * by the biotech surface), scoped by the integer `organizationId` below. This
   * is the single-router path that lets callers reach rag_chunks without a
   * separate retrieval engine. `artifactScope` takes precedence when set.
   */
  corpus?: 'vault' | 'rag_chunks' | 'client_memory' | 'project_memory';
  /**
   * Integer organization id for `corpus: 'rag_chunks'` tenant scoping
   * (rag_documents.organization_id). rag_chunks is not RLS-scoped, so this is
   * applied as an explicit WHERE filter — omitting it returns cross-tenant rows.
   * Also the tenant scope for the memory corpora (client/project_memory).
   */
  organizationId?: number;
  /**
   * Scoping for the memory corpora (`corpus: 'client_memory' | 'project_memory'`).
   * These run a pure pgvector similarity search over the memory tables, so they
   * should be invoked with `strategy: 'basic'` and reranking/MMR/compression off
   * to stay similarity-pure (the document reranker is not meaningful for memory
   * atoms).
   */
  memoryScope?: MemoryScope;
}

/** Filters for the memory corpora, mirroring the searchMemoryEntriesSemantic query. */
export interface MemoryScope {
  /** client_memory: optional profile filter. */
  profileId?: number | null;
  /** project_memory: required project filter. */
  projectId?: number;
  /** project_memory: optional project-profile filter. */
  projectProfileId?: number | null;
  /** Optional category filter (both memory corpora). */
  category?: string;
}

export interface RetrievedDocument {
  id: string;
  documentId?: string;
  chunkId?: string;
  content: string;
  title: string;
  atomType: string;
  source?: string;
  initialScore: number; // From embedding similarity
  rerankScore?: number; // From the LLM relevance judge (LLM-as-judge, not a cross-encoder)
  finalScore: number; // Combined score
  compressedContent?: string; // Extracted relevant passage
  /**
   * Small-to-big context expansion: the retrieved chunk concatenated with its
   * neighbours in the source document (sentence-window). Set by expandContext
   * when useContextExpansion is on; generation and compression prefer it over
   * the bare chunk so the model sees surrounding context the precise chunk omits.
   */
  expandedContent?: string;
  /** Sequential index of this chunk within its document; enables window expansion. */
  chunkIndex?: number;
  pageNumber?: number;
  sectionTitle?: string | null;
  locator?: string;
  /**
   * The Data Room artifact this chunk was cut from (`lumen_data_atoms
   * .source_id`), when the corpus records one. It is what resolves to a
   * canonical `cre_evidence_sources` row (retrieval-source-link), and so what
   * lets a passage be CITED rather than merely read — the executor's drafting
   * tools accept it back as `sources[].artifact_id` (ledger L154). Absent for
   * corpora with no artifact linkage; never guessed.
   */
  sourceArtifactId?: string | null;
  /**
   * Opaque passthrough of the originating row, set by corpora whose callers
   * need the full record back (the memory corpora carry every column here so
   * the memory shims can reconstruct their rich entry type — confidence,
   * importance, verification, timestamps — that the document fields above drop).
   * Reranking/MMR only reorder documents and compression is disabled for these
   * corpora, so this survives the pipeline untouched.
   */
  sourceRow?: Record<string, unknown>;
  /**
   * The index-time embedding for this candidate, carried straight out of the
   * vector store (the `embedding` column we already rank on) so MMR can measure
   * diversity without re-embedding the content via a separate OpenAI round-trip.
   * Only populated when MMR is requested (`needEmbeddings`); corpora that don't
   * expose a stored vector (e.g. project atoms via searchHybrid) leave it unset,
   * and MMR embeds just those stragglers.
   */
  embedding?: number[];
}

export interface RAGContext {
  documents: RetrievedDocument[];
  totalCandidates: number;
  retrievalStrategy: string;
  processingTimeMs: number;
  tokensUsed: number;
}

type VaultChunkRow = {
  chunk_id: string;
  document_id: string;
  title: string | null;
  content: string | null;
  page_number: number | null;
  section_title: string | null;
  chunk_index: number | null;
  similarity: number;
  /** Stored index vector in pgvector text form ('[a,b,...]'); only selected when needEmbeddings. */
  embedding?: string | null;
};

/** Corpus selection threaded through the strategy methods to searchInitial. */
type CorpusScope = {
  corpus?: 'vault' | 'rag_chunks' | 'client_memory' | 'project_memory';
  organizationId?: number;
  memory?: MemoryScope;
  /**
   * Fuse dense retrieval with a sparse full-text retrieval via RRF. Honoured
   * only by the vault and rag_chunks paths; the memory paths ignore it.
   */
  hybrid?: boolean;
  /**
   * Metadata pre-filters (document type / source / date range) applied in the
   * vault and rag_chunks SQL. Honoured only by those corpora; project atoms and
   * memory ignore them.
   */
  filters?: QueryFilters;
  /**
   * Pull each candidate's stored embedding out of the vector search so MMR can
   * reuse it instead of re-embedding. Set only when the caller requested MMR,
   * so non-MMR queries don't pay to ship vector text they won't use.
   */
  needEmbeddings?: boolean;
};

/**
 * Parse a pgvector value into a number[]. Without a registered pg type parser
 * the column arrives as the text form '[a,b,...]'; tolerate an already-parsed
 * numeric array too. Returns undefined on anything malformed so callers fall
 * back to embedding/lexical paths rather than ranking on a partial vector.
 */
export function parsePgVector(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    return value.every(n => typeof n === 'number' && Number.isFinite(n))
      ? (value as number[])
      : undefined;
  }
  if (typeof value !== 'string' || value.length < 2) return undefined;
  const inner = value.charCodeAt(0) === 0x5b /* [ */ ? value.slice(1, -1) : value;
  if (!inner) return undefined;
  const parts = inner.split(',');
  const out = new Array<number>(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isFinite(n)) return undefined;
    out[i] = n;
  }
  return out;
}

function buildLocator(row: VaultChunkRow): string | undefined {
  if (row.section_title && row.section_title.trim()) {
    return row.section_title.trim();
  }
  if (row.page_number !== null && row.page_number !== undefined) {
    return `p.${row.page_number}`;
  }
  return undefined;
}

async function withTenantContext<T>(
  pool: pg.Pool,
  organizationUuid: string | undefined,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (organizationUuid) {
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationUuid]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          ADVANCED RAG PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

export class AdvancedRAGPipeline {
  private embeddingService: EnhancedEmbeddingService;
  private aiRouter: AIProviderRouter;
  private pool: pg.Pool;
  private openai: any;
  // Reranking strategy. Defaults to the LLM-as-judge provider (prior behavior);
  // swaps to a cross-encoder when RAG_RERANKER_* is configured. See rag-reranker.ts.
  private reranker: Reranker;

  // In-memory TTL + LRU cache for the auxiliary reasoning calls (HyDE, query
  // expansion, reranking, compression). These repeat verbatim across similar
  // queries, so caching them cuts the 4+N per-query LLM round-trips. Eviction is
  // least-recently-used (a live hit is re-inserted to refresh recency). The
  // final grounded answer is deliberately never cached.
  private llmCallCache = new Map<string, { value: AIResponse; expiresAt: number }>();
  private readonly llmCacheTtlMs = 60 * 60 * 1000; // 1 hour
  private readonly llmCacheMaxEntries = 500;

  constructor(pool: pg.Pool) {
    this.pool = pool;
    this.embeddingService = getEmbeddingService(pool);
    this.aiRouter = getAIRouter(pool);

    // OpenAI client wiring removed — this pipeline now goes through
    // aiRouter for completions. Keep the field as an any-shaped stub so
    // legacy references still compile.
    this.openai = null;

    // LLM-judge reranks route through the cached AI router so identical rerank
    // calls reuse the prior result; a cross-encoder provider (if configured)
    // ignores the route fn and calls its own HTTP endpoint.
    this.reranker = getReranker(req => this.routeCached(req));

    console.log('✅ Advanced RAG Pipeline initialized');
  }

  /**
   * Main retrieval function with configurable strategies
   */
  async retrieve(
    query: string,
    options: RetrievalOptions = { strategy: 'basic' }
  ): Promise<RAGContext> {
    const startTime = Date.now();
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.5;
    const artifactScope = options.artifactScope;
    const scope: CorpusScope = {
      corpus: options.corpus,
      organizationId: options.organizationId,
      memory: options.memoryScope,
      // Only carry stored vectors out of the search when MMR will consume them.
      needEmbeddings: !!options.useMmr,
      hybrid: !!options.useHybrid,
      // Explicit filters apply on the chunk corpora regardless of self-query;
      // the self-query step below augments these in place.
      filters: options.filters,
    };

    let candidates: RetrievedDocument[];
    // Descriptive label for RAGContext.retrievalStrategy (free-form string);
    // the 'advanced' strategy reports the composite 'hyde+multi_query'.
    let retrievalStrategy: string = options.strategy;
    let tokensUsed = 0;

    // Primitives the query-transform strategies fan out through, bound to this
    // call's scope (tenant, threshold, corpus). See rag-retrieval-strategies.ts.
    const deps: StrategyDeps = {
      route: req => this.routeCached(req),
      embedBatch: queries => this.embeddingService.embedBatch(queries, 'text-embedding-3-small'),
      search: (q, l) => this.searchInitial(q, l, threshold, options.organizationUuid, artifactScope, scope),
    };

    // Step 0: Self-querying. Extract metadata constraints from the question and
    // merge them under any explicit filters (explicit wins), then pre-filter the
    // chunk-corpus SQL via scope.filters. deps.search closes over `scope`, so
    // setting it here applies to every strategy's retrieval below.
    if (options.useSelfQuery) {
      const extracted = await extractQueryFilters(deps.route, query);
      tokensUsed += extracted.tokensUsed;
      scope.filters = mergeFilters(extracted.filters, options.filters);
    }

    // Step 1: Initial retrieval based on strategy
    switch (options.strategy) {
      case 'hyde': {
        const result = await hydeRetrieval(deps, query, limit * 3);
        candidates = result.documents;
        tokensUsed += result.tokensUsed;
        break;
      }

      case 'multi_query': {
        const result = await multiQueryRetrieval(deps, query, limit * 3);
        candidates = result.documents;
        tokensUsed += result.tokensUsed;
        break;
      }

      case 'step_back': {
        const result = await stepBackRetrieval(deps, query, limit * 3);
        candidates = result.documents;
        tokensUsed += result.tokensUsed;
        break;
      }

      case 'decompose': {
        const result = await decomposeRetrieval(deps, query, limit * 3);
        candidates = result.documents;
        tokensUsed += result.tokensUsed;
        break;
      }

      case 'advanced': {
        // Combine HyDE + Multi-Query
        const [hyde, multi] = await Promise.all([
          hydeRetrieval(deps, query, limit * 2),
          multiQueryRetrieval(deps, query, limit * 2),
        ]);
        candidates = mergeByMaxScore([...hyde.documents, ...multi.documents]);
        tokensUsed += hyde.tokensUsed + multi.tokensUsed;
        retrievalStrategy = 'advanced';
        break;
      }

      case 'basic':
      default:
        candidates = await deps.search(query, limit * 3);
        break;
    }

    const totalCandidates = candidates.length;

    // Step 2: reranking via the configured provider (LLM-judge by default,
    // cross-encoder when RAG_RERANKER_* is set).
    if (options.useReranking && candidates.length > 0) {
      const rerankResult = await this.applyReranker(query, candidates);
      candidates = rerankResult.documents;
      tokensUsed += rerankResult.tokensUsed;
    }

    // Step 3: MMR for diversity
    if (options.useMmr && candidates.length > limit) {
      candidates = await this.applyMmr(candidates, limit, options.mmrLambda || 0.7);
    } else {
      // Just take top results
      candidates = candidates.slice(0, limit);
    }

    // Step 3.5: Small-to-big context expansion (ranked on small chunks, read on
    // a wider window). Runs before compression so compression extracts from the
    // expanded window.
    if (options.useContextExpansion && candidates.length > 0) {
      candidates = await this.expandContext(
        candidates,
        options.contextWindow ?? 1,
        options.organizationUuid,
        options.organizationId
      );
    }

    // Step 4: Contextual compression
    if (options.useCompression && candidates.length > 0) {
      const compressionResult = await this.compressContexts(query, candidates);
      candidates = compressionResult.documents;
      tokensUsed += compressionResult.tokensUsed;
    }

    return {
      documents: candidates,
      totalCandidates,
      retrievalStrategy,
      processingTimeMs: Date.now() - startTime,
      tokensUsed,
    };
  }

  /**
   * Initial-retrieval router. Picks project-scoped (lumen_data_atoms via the
   * search_atoms_hybrid SQL function) when artifactScope is provided, falls
   * back to vault chunks otherwise. All higher-level strategies (HyDE,
   * multi_query, basic) call through this so a single project filter
   * propagates through the whole pipeline.
   */
  private async searchInitial(
    query: string,
    limit: number,
    threshold: number,
    organizationUuid?: string,
    artifactScope?: RetrievalOptions['artifactScope'],
    scope?: CorpusScope
  ): Promise<RetrievedDocument[]> {
    if (artifactScope) {
      return this.searchProjectAtoms(query, limit, threshold, artifactScope);
    }
    if (scope?.corpus === 'rag_chunks') {
      return this.searchRagChunksSimilar(
        query,
        limit,
        threshold,
        scope.organizationId,
        scope.needEmbeddings,
        scope.hybrid,
        scope.filters
      );
    }
    if (scope?.corpus === 'client_memory') {
      return this.searchClientMemorySimilar(query, limit, threshold, scope);
    }
    if (scope?.corpus === 'project_memory') {
      return this.searchProjectMemorySimilar(query, limit, threshold, scope);
    }
    return this.searchVaultSimilar(
      query,
      limit,
      threshold,
      organizationUuid,
      scope?.needEmbeddings,
      scope?.hybrid,
      scope?.filters
    );
  }

  /**
   * Project-scoped initial retrieval using the same hybrid (vector + BM25)
   * path as enhancedEmbeddingService.searchHybrid, with the project_id
   * filter pushed into SQL so cross-project chunks never appear in the
   * candidate set. Maps results into RetrievedDocument so downstream
   * reranking / MMR / compression all work transparently.
   */
  private async searchProjectAtoms(
    query: string,
    limit: number,
    threshold: number,
    artifactScope: NonNullable<RetrievalOptions['artifactScope']>
  ): Promise<RetrievedDocument[]> {
    const hits = await this.embeddingService.searchHybrid(
      query,
      limit,
      0.7,
      artifactScope.organizationUuid,
      String(artifactScope.projectId)
    );
    return hits
      .filter(h => Number.isFinite(h.score) && h.score >= threshold)
      .map(h => ({
        id: h.id,
        chunkId: h.id,
        content: h.content || '',
        title: h.title || 'Untitled',
        atomType: 'project_atom',
        initialScore: h.score,
        finalScore: h.score,
        // Kept so the passage can be cited back to its Data Room source; the
        // hybrid search already carries it, this map used to drop it.
        sourceArtifactId: h.sourceId ?? null,
      }));
  }

  /**
   * LLM-based reranking (LLM-as-judge).
   *
   * An LLM scores each candidate's relevance to the query. This is NOT a
   * cross-encoder model and performs no cross-attention; it is a prompted
   * relevance score combined with the embedding score. Cheap to run, but
   * non-deterministic at temperature > 0 (we use 0 here for stability).
   */
  private async applyReranker(
    query: string,
    documents: RetrievedDocument[]
  ): Promise<{ documents: RetrievedDocument[]; tokensUsed: number }> {
    if (documents.length === 0) {
      return { documents: [], tokensUsed: 0 };
    }

    let result;
    try {
      result = await this.reranker.score(
        query,
        documents.map(d => ({ title: d.title, content: d.content }))
      );
    } catch (error) {
      // A reranker failure must never break retrieval — keep the embedding order.
      console.warn(`[RAG] reranker "${this.reranker.name}" failed; keeping embedding order:`, error);
      return { documents, tokensUsed: 0 };
    }

    // Defensive: a provider that returns the wrong count can't be trusted to
    // align with documents, so fall back rather than mis-rank.
    if (result.scores.length !== documents.length) {
      console.warn(
        `[RAG] reranker "${this.reranker.name}" returned ${result.scores.length} scores for ${documents.length} docs; keeping embedding order`
      );
      return { documents, tokensUsed: result.tokensUsed };
    }

    // Combine the rerank score with the embedding score (same blend as before),
    // preserving every other field on the document (embedding, sourceRow, …).
    const reranked = documents.map((doc, idx) => {
      const rerankScore = result.scores[idx];
      return {
        ...doc,
        rerankScore,
        finalScore: (doc.initialScore + rerankScore) / 2,
      };
    });

    reranked.sort((a, b) => b.finalScore - a.finalScore);

    return { documents: reranked, tokensUsed: result.tokensUsed };
  }

  /**
   * Maximal Marginal Relevance for diversity.
   *
   * Diversity is measured as cosine similarity in embedding space (the same
   * space retrieval ranks in), not word overlap. Vectors are reused from the
   * vector store where the candidates were just retrieved (carried on
   * `RetrievedDocument.embedding`); only candidates that arrived without one are
   * embedded via the embedding service. If that embedding fails we fall back to
   * lexical Jaccard similarity so MMR still degrades gracefully.
   */
  private async applyMmr(
    documents: RetrievedDocument[],
    limit: number,
    lambda: number
  ): Promise<RetrievedDocument[]> {
    if (documents.length <= limit) return documents;

    // Reuse the index-time vectors carried out of the vector store; only embed
    // the stragglers (e.g. project atoms via searchHybrid) that didn't carry
    // one. This avoids re-embedding the whole candidate set — those contents are
    // never query cache hits, so the old path paid a full OpenAI batch call on
    // every MMR query.
    const vectors: Array<number[] | null> = documents.map(d => d.embedding ?? null);
    const missing: number[] = [];
    for (let i = 0; i < vectors.length; i++) {
      if (!vectors[i]) missing.push(i);
    }
    if (missing.length > 0) {
      try {
        const embedded = await this.embeddingService.embedBatch(
          missing.map(i => documents[i].content || ''),
          'text-embedding-3-small'
        );
        missing.forEach((docIdx, k) => {
          vectors[docIdx] = embedded[k]?.embedding ?? null;
        });
      } catch (error) {
        console.warn(
          '[RAG] MMR embedding failed for uncarried candidates, using lexical fallback:',
          error
        );
      }
    }

    // Normalize once so each pairwise diversity check is a single dot product
    // rather than recomputing both vector norms on every comparison.
    const unit: Array<number[] | null> = vectors.map(v => (v ? this.normalize(v) : null));

    const similarity = (i: number, j: number): number => {
      const a = unit[i];
      const b = unit[j];
      if (a && b) {
        return this.dotProduct(a, b);
      }
      return this.calculateTextSimilarity(documents[i].content, documents[j].content);
    };

    const selectedIdx: number[] = [];
    const remainingIdx = documents.map((_, i) => i);

    while (selectedIdx.length < limit && remainingIdx.length > 0) {
      let bestPos = 0;
      let bestScore = -Infinity;

      for (let pos = 0; pos < remainingIdx.length; pos++) {
        const i = remainingIdx[pos];
        const relevance = documents[i].finalScore;

        // Diversity component: max similarity to anything already selected.
        let maxSimilarity = 0;
        for (const j of selectedIdx) {
          maxSimilarity = Math.max(maxSimilarity, similarity(i, j));
        }

        const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestPos = pos;
        }
      }

      selectedIdx.push(remainingIdx[bestPos]);
      remainingIdx.splice(bestPos, 1);
    }

    return selectedIdx.map(i => documents[i]);
  }

  /**
   * Small-to-big context expansion. Replaces each vault / rag_chunks result's
   * text with the chunk plus its ±window neighbours in the same document, so
   * generation sees the surrounding context the precise chunk omits (the chunk
   * stays the unit we *rank* on; the window is the unit we *read*). Results
   * without a chunk index (project atoms, memory) pass through unchanged, and a
   * per-chunk failure degrades to the bare chunk — expansion never drops a
   * result. Both windows are backed by a (document_id, chunk_index) index.
   */
  private async expandContext(
    documents: RetrievedDocument[],
    window: number,
    organizationUuid?: string,
    organizationId?: number
  ): Promise<RetrievedDocument[]> {
    if (window <= 0) return documents;
    return Promise.all(
      documents.map(async doc => {
        if (doc.chunkIndex == null || !doc.documentId) return doc;
        const lo = doc.chunkIndex - window;
        const hi = doc.chunkIndex + window;
        try {
          let texts: string[];
          if (doc.atomType === 'vault_chunk') {
            texts = await withTenantContext(this.pool, organizationUuid, async client => {
              // tenant-isolation-safe: RLS-scoped — withTenantContext sets app.current_org_id; vault.document_chunks is org-filtered by its RLS policy (fails closed with no org context).
              const { rows } = await client.query<{ chunk_text: string | null }>(
                `SELECT chunk_text FROM vault.document_chunks
                 WHERE document_id = $1 AND chunk_index BETWEEN $2 AND $3
                 ORDER BY chunk_index`,
                [doc.documentId, lo, hi]
              );
              return rows.map(r => r.chunk_text || '').filter(Boolean);
            });
          } else if (doc.atomType === 'rag_chunk') {
            // Tenant-scoped: rag_chunks is not RLS-scoped, so join rag_documents
            // and filter by the caller's org (rag_documents.organization_id) —
            // defense-in-depth over the document_id that upstream retrieval
            // already org-vetted. Conditional ($4 NULL → no filter) preserves
            // internal callers that don't pass an org id.
            const { rows } = await this.pool.query<{ content: string | null }>(
              `SELECT rc.content FROM rag_chunks rc
               JOIN rag_documents rd ON rd.id = rc.document_id
               WHERE rc.document_id = $1 AND rc.chunk_index BETWEEN $2 AND $3
                 AND ($4::int IS NULL OR rd.organization_id = $4)
               ORDER BY rc.chunk_index`,
              [doc.documentId, lo, hi, organizationId ?? null]
            );
            texts = rows.map(r => r.content || '').filter(Boolean);
          } else {
            return doc;
          }
          // Only annotate when the window actually added neighbours.
          return texts.length > 1 ? { ...doc, expandedContent: texts.join('\n\n') } : doc;
        } catch (error) {
          console.warn('[RAG] context expansion failed for a chunk; using the chunk alone:', error);
          return doc;
        }
      })
    );
  }

  /**
   * Contextual compression - extract relevant passages
   */
  private async compressContexts(
    query: string,
    documents: RetrievedDocument[]
  ): Promise<{ documents: RetrievedDocument[]; tokensUsed: number }> {
    let totalTokens = 0;

    const compressedDocs = await Promise.all(
      documents.map(async doc => {
        // Compress the expanded window when present (small-to-big), else the chunk.
        const text = doc.expandedContent || doc.content;
        if (text.length < 500) {
          // Too short to compress
          return { ...doc, compressedContent: text };
        }

        const compressResponse = await this.routeCached({
          taskType: 'document_analysis',
          messages: [
            {
              role: 'system',
              content: `Extract ONLY the passages from the document that are directly relevant to answering the query. Include exact quotes with context. If nothing is relevant, respond with "NO_RELEVANT_CONTENT".`,
            },
            {
              role: 'user',
              content: `Query: "${query}"\n\nDocument:\n${text}`,
            },
          ],
          maxTokens: 400,
          temperature: 0,
        });

        totalTokens += compressResponse.usage.totalTokens;

        const compressed = compressResponse.content;
        if (compressed === 'NO_RELEVANT_CONTENT') {
          return { ...doc, compressedContent: '', finalScore: doc.finalScore * 0.5 };
        }

        return { ...doc, compressedContent: compressed };
      })
    );

    // Filter out documents with no relevant content
    const filtered = compressedDocs.filter(d => d.compressedContent !== '');

    return {
      documents: filtered,
      tokensUsed: totalTokens,
    };
  }

  private async searchVaultSimilar(
    query: string,
    limit: number,
    threshold: number,
    organizationUuid?: string,
    needEmbeddings?: boolean,
    hybrid?: boolean,
    filters?: QueryFilters
  ): Promise<RetrievedDocument[]> {
    const queryResult = await this.embeddingService.embed(query, 'text-embedding-3-small');
    const vector = `[${queryResult.embedding.join(',')}]`;

    // Metadata pre-filters on the joined documents table. Each arm has its own
    // param array, so each gets its own clause with arm-local placeholders.
    const denseParams: Array<string | number | Date> = [vector, threshold, limit];
    const denseFilter = buildDocFilterClause(filters, denseParams, VAULT_FILTER_COLUMNS);

    // Ship the stored vector (as text) only when MMR will reuse it. SELECT-list
    // columns take no params, so this doesn't shift the $1..$3 placeholders.
    const embeddingCol = needEmbeddings ? 'c.embedding::text AS embedding,' : '';

    const toDoc = (row: VaultChunkRow): RetrievedDocument => ({
      id: row.chunk_id,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      content: row.content || '',
      title: row.title || 'Untitled',
      atomType: 'vault_chunk',
      initialScore: Number(row.similarity),
      finalScore: Number(row.similarity),
      pageNumber: row.page_number ?? undefined,
      sectionTitle: row.section_title,
      chunkIndex: row.chunk_index ?? undefined,
      locator: buildLocator(row),
      embedding: needEmbeddings ? parsePgVector(row.embedding) : undefined,
    });

    return withTenantContext(this.pool, organizationUuid, async client => {
      // tenant-isolation-safe: RLS-scoped — withTenantContext sets app.current_org_id; vault.documents/document_chunks are org-filtered by RLS policy (fails closed with no org context).
      const { rows: denseRows } = await client.query<VaultChunkRow>(
        `
        SELECT
          c.id AS chunk_id,
          c.document_id AS document_id,
          COALESCE(d.document_title, d.file_name, '') AS title,
          c.chunk_text AS content,
          c.page_number AS page_number,
          c.section_title AS section_title,
          c.chunk_index AS chunk_index,
          ${embeddingCol}
          1 - (c.embedding <=> $1::vector) AS similarity
        FROM vault.document_chunks c
        JOIN vault.documents d ON d.id = c.document_id
        WHERE c.embedding IS NOT NULL${denseFilter}
          -- (1 - sim) filter as a distance bound: 1 - dist > t  <=>  dist < 1 - t.
          -- Uses the same bare <=> operator as ORDER BY so the planner reuses
          -- the distance and the predicate matches the indexed cosine operator.
          -- $2 is cast explicitly: in "1 - $2" Postgres infers the parameter
          -- from the integer literal, and a float threshold like 0.65 then
          -- fails with 22P02 before the query ever runs.
          AND (c.embedding <=> $1::vector) < 1 - $2::float8
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
      `,
        denseParams
      );
      const dense = denseRows.map(toDoc);
      if (!hybrid) return dense;

      // Sparse arm: Postgres full-text ranked by ts_rank_cd. websearch_to_tsquery
      // tolerates arbitrary user text (no tsquery syntax errors), and the
      // to_tsvector('english', chunk_text) expression matches the GIN index in
      // performance_indexes.sql so this stays index-backed. A lexical failure
      // must not break retrieval — fall back to the dense arm alone.
      let lexical: RetrievedDocument[];
      const lexParams: Array<string | number | Date> = [query, limit];
      const lexFilter = buildDocFilterClause(filters, lexParams, VAULT_FILTER_COLUMNS);
      try {
        // tenant-isolation-safe: RLS-scoped — same withTenantContext (app.current_org_id) as the dense arm above; vault.* are org-filtered by RLS policy.
        const { rows: lexRows } = await client.query<VaultChunkRow>(
          `
          SELECT
            c.id AS chunk_id,
            c.document_id AS document_id,
            COALESCE(d.document_title, d.file_name, '') AS title,
            c.chunk_text AS content,
            c.page_number AS page_number,
            c.section_title AS section_title,
            c.chunk_index AS chunk_index,
            ${embeddingCol}
            0::float8 AS similarity
          FROM vault.document_chunks c
          JOIN vault.documents d ON d.id = c.document_id
          WHERE c.embedding IS NOT NULL${lexFilter}
            AND to_tsvector('english', c.chunk_text) @@ websearch_to_tsquery('english', $1)
          ORDER BY ts_rank_cd(to_tsvector('english', c.chunk_text), websearch_to_tsquery('english', $1)) DESC
          LIMIT $2
        `,
          lexParams
        );
        lexical = lexRows.map(toDoc);
      } catch (error) {
        console.warn('[RAG] vault lexical arm failed; using dense-only retrieval:', error);
        return dense;
      }

      return fuseHybrid(dense, lexical, limit);
    });
  }

  /**
   * Initial retrieval against the rag_chunks corpus (the registered hot-path
   * chunk store, also used by the biotech surface). Mirrors searchVaultSimilar
   * but reads rag_chunks / rag_documents and scopes by the integer
   * organization_id. rag_chunks is not RLS-scoped, so the org filter is applied
   * explicitly — when organizationId is omitted, all tenants' chunks are
   * eligible, so callers serving a single tenant must pass it.
   *
   * Same embedding space as the vault path (text-embedding-3-small, 1536d) per
   * embedding-corpus-policy, so query embedding and similarity are identical.
   */
  private async searchRagChunksSimilar(
    query: string,
    limit: number,
    threshold: number,
    organizationId?: number,
    needEmbeddings?: boolean,
    hybrid?: boolean,
    filters?: QueryFilters
  ): Promise<RetrievedDocument[]> {
    const queryResult = await this.embeddingService.embed(query, 'text-embedding-3-small');
    const vector = `[${queryResult.embedding.join(',')}]`;

    const params: Array<string | number | Date> = [vector, threshold, limit];
    let orgFilter = '';
    if (organizationId !== undefined && organizationId !== null) {
      params.push(organizationId);
      orgFilter = `AND d.organization_id = $${params.length}`;
    }
    // Metadata pre-filters follow the org filter so placeholders stay sequential.
    const denseFilter = buildDocFilterClause(filters, params, RAG_FILTER_COLUMNS);

    // Ship the stored vector (as text) only when MMR will reuse it.
    const embeddingCol = needEmbeddings ? 'c.embedding::text AS embedding,' : '';

    const toDoc = (row: VaultChunkRow): RetrievedDocument => ({
      id: row.chunk_id,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      content: row.content || '',
      title: row.title || 'Untitled',
      atomType: 'rag_chunk',
      initialScore: Number(row.similarity),
      finalScore: Number(row.similarity),
      pageNumber: row.page_number ?? undefined,
      sectionTitle: row.section_title,
      chunkIndex: row.chunk_index ?? undefined,
      locator: buildLocator(row),
      embedding: needEmbeddings ? parsePgVector(row.embedding) : undefined,
    });

    // tenant-isolation-safe: org filter is interpolated via ${orgFilter} (AND d.organization_id = $N) when organizationId is supplied — the static scanner can't see interpolated predicates; single-tenant callers must pass organizationId (see method doc).
    const { rows: denseRows } = await this.pool.query<VaultChunkRow>(
      `
        SELECT
          c.id AS chunk_id,
          c.document_id AS document_id,
          COALESCE(d.title, '') AS title,
          c.content AS content,
          c.page_number AS page_number,
          c.section_title AS section_title,
          c.chunk_index AS chunk_index,
          ${embeddingCol}
          1 - (c.embedding <=> $1::vector) AS similarity
        FROM rag_chunks c
        JOIN rag_documents d ON d.id = c.document_id
        WHERE c.embedding IS NOT NULL
          ${orgFilter}${denseFilter}
          -- (1 - sim) filter as a distance bound: 1 - dist > t  <=>  dist < 1 - t.
          -- Uses the same bare <=> operator as ORDER BY so the planner reuses
          -- the distance and the predicate matches the indexed cosine operator.
          -- $2 is cast explicitly: in "1 - $2" Postgres infers the parameter
          -- from the integer literal, and a float threshold like 0.65 then
          -- fails with 22P02 before the query ever runs.
          AND (c.embedding <=> $1::vector) < 1 - $2::float8
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
      `,
      params
    );
    const dense = denseRows.map(toDoc);
    if (!hybrid) return dense;

    // Sparse arm: same RRF hybrid as the vault path. The org filter reuses the
    // $N placeholder already bound above; the lexical query takes the raw query
    // text as $1 and limit as $2, so its own org placeholder (if any) is $3.
    const lexParams: Array<string | number | Date> = [query, limit];
    let lexOrgFilter = '';
    if (organizationId !== undefined && organizationId !== null) {
      lexParams.push(organizationId);
      lexOrgFilter = `AND d.organization_id = $${lexParams.length}`;
    }
    const lexFilter = buildDocFilterClause(filters, lexParams, RAG_FILTER_COLUMNS);
    let lexical: RetrievedDocument[];
    try {
      // tenant-isolation-safe: org filter is interpolated via ${lexOrgFilter} (AND d.organization_id = $N) when organizationId is supplied — mirrors the dense arm; the static scanner can't see interpolated predicates.
      const { rows: lexRows } = await this.pool.query<VaultChunkRow>(
        `
        SELECT
          c.id AS chunk_id,
          c.document_id AS document_id,
          COALESCE(d.title, '') AS title,
          c.content AS content,
          c.page_number AS page_number,
          c.section_title AS section_title,
          c.chunk_index AS chunk_index,
          ${embeddingCol}
          0::float8 AS similarity
        FROM rag_chunks c
        JOIN rag_documents d ON d.id = c.document_id
        WHERE c.embedding IS NOT NULL
          ${lexOrgFilter}${lexFilter}
          AND to_tsvector('english', c.content) @@ websearch_to_tsquery('english', $1)
        ORDER BY ts_rank_cd(to_tsvector('english', c.content), websearch_to_tsquery('english', $1)) DESC
        LIMIT $2
      `,
        lexParams
      );
      lexical = lexRows.map(toDoc);
    } catch (error) {
      console.warn('[RAG] rag_chunks lexical arm failed; using dense-only retrieval:', error);
      return dense;
    }

    return fuseHybrid(dense, lexical, limit);
  }

  /**
   * Wrap a memory row (SELECT *, similarity) as a RetrievedDocument, carrying the
   * full row in sourceRow so the memory shims reconstruct their rich entry type.
   */
  private memoryRowToDocument(
    row: Record<string, any>,
    atomType: 'client_memory' | 'project_memory',
    needEmbeddings?: boolean
  ): RetrievedDocument {
    const similarity = Number(row.similarity);
    return {
      id: String(row.id),
      documentId: String(row.id),
      content: typeof row.content === 'string' ? row.content : String(row.content ?? ''),
      title: typeof row.title === 'string' ? row.title : String(row.title ?? ''),
      atomType,
      initialScore: similarity,
      finalScore: similarity,
      sourceRow: row,
      // `SELECT *` already returns the vector; only spend the parse when MMR
      // will use it (memory corpora normally run MMR-off, so this stays unset).
      embedding: needEmbeddings ? parsePgVector(row.embedding) : undefined,
    };
  }

  /**
   * Initial retrieval against the client_memory_entries corpus. Byte-for-byte the
   * same query (and param order) as the legacy searchMemoryEntriesSemantic, now
   * reached through the single router. Invoke with strategy 'basic' and
   * reranking/MMR/compression off so ranking stays pure similarity.
   */
  private async searchClientMemorySimilar(
    query: string,
    limit: number,
    threshold: number,
    scope: CorpusScope
  ): Promise<RetrievedDocument[]> {
    const organizationId = scope.organizationId;
    if (organizationId === undefined || organizationId === null) return [];
    const profileId = scope.memory?.profileId ?? null;
    const category = scope.memory?.category;

    const queryResult = await this.embeddingService.embed(query, 'text-embedding-3-small');
    const vector = `[${queryResult.embedding.join(',')}]`;

    const params: Array<string | number> = profileId
      ? [vector, organizationId, profileId, threshold]
      : [vector, organizationId, threshold];
    const profileClause = profileId ? 'AND profile_id = $3' : '';
    const thresholdIdx = profileId ? 4 : 3;
    let categoryClause = '';
    if (category) {
      params.push(category);
      categoryClause = `AND category = $${params.length}`;
    }
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT
         *,
         1 - (embedding <=> $1::vector) AS similarity
       FROM client_memory_entries
       WHERE organization_id = $2
         ${profileClause}
         AND status = 'active'
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> $1::vector) >= $${thresholdIdx}
         ${categoryClause}
       ORDER BY embedding <=> $1::vector
       LIMIT $${params.length}`,
      params
    );

    return rows.map(row => this.memoryRowToDocument(row, 'client_memory', scope.needEmbeddings));
  }

  /**
   * Initial retrieval against the project_memory_entries corpus. Mirror of the
   * legacy searchProjectMemoryEntriesSemantic query and param order.
   */
  private async searchProjectMemorySimilar(
    query: string,
    limit: number,
    threshold: number,
    scope: CorpusScope
  ): Promise<RetrievedDocument[]> {
    const organizationId = scope.organizationId;
    const projectId = scope.memory?.projectId;
    if (organizationId === undefined || organizationId === null) return [];
    if (projectId === undefined || projectId === null) return [];
    const projectProfileId = scope.memory?.projectProfileId ?? null;
    const category = scope.memory?.category;

    const queryResult = await this.embeddingService.embed(query, 'text-embedding-3-small');
    const vector = `[${queryResult.embedding.join(',')}]`;

    const params: Array<string | number> = projectProfileId
      ? [vector, organizationId, projectId, projectProfileId, threshold]
      : [vector, organizationId, projectId, threshold];
    const profileClause = projectProfileId ? 'AND project_profile_id = $4' : '';
    const thresholdIdx = projectProfileId ? 5 : 4;
    let categoryClause = '';
    if (category) {
      params.push(category);
      categoryClause = `AND category = $${params.length}`;
    }
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT
         *,
         1 - (embedding <=> $1::vector) AS similarity
       FROM project_memory_entries
       WHERE organization_id = $2
         AND project_id = $3
         ${profileClause}
         AND status = 'active'
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> $1::vector) >= $${thresholdIdx}
         ${categoryClause}
       ORDER BY embedding <=> $1::vector
       LIMIT $${params.length}`,
      params
    );

    return rows.map(row => this.memoryRowToDocument(row, 'project_memory', scope.needEmbeddings));
  }

  private async persistEvidenceCitations(
    client: pg.PoolClient,
    query: string,
    citations: Array<{
      documentId?: string;
      chunkId?: string;
      quote: string;
      locator?: string;
      confidence: number;
    }>
  ): Promise<void> {
    const filtered = citations.filter(c => c.documentId && c.chunkId);
    if (!filtered.length) {
      return;
    }

    const quantize = (value: number) => Math.round(value * 1e6) / 1e6;

    for (const citation of filtered) {
      const citationId = randomUUID();
      await client.query(
        `
        INSERT INTO vault.evidence_citations (
          id,
          source_document_id,
          source_chunk_id,
          claim_text,
          evidence_document_id,
          evidence_chunk_id,
          evidence_text,
          relevance_score,
          support_type,
          citation_context,
          created_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $2,
          $3,
          $5,
          $6,
          'SUPPORTS',
          $7,
          now()
        )
      `,
        [
          citationId,
          citation.documentId,
          citation.chunkId,
          query,
          citation.quote,
          quantize(citation.confidence),
          citation.locator ?? null,
        ]
      );
    }
  }

  /**
   * Merge and deduplicate documents from multiple sources
   */
  /**
   * Lexical fallback similarity (Jaccard on words). Only used when embedding
   * the candidates for MMR fails; the primary path is cosine in embedding space.
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Scale a vector to unit length once, up front. Cosine similarity between two
   * unit vectors is then just their dot product, so MMR's inner loop avoids
   * recomputing norms on every pairwise comparison. A zero vector maps to zero
   * (yields 0 similarity), matching the old guard.
   */
  private normalize(v: number[]): number[] {
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return new Array<number>(v.length).fill(0);
    const out = new Array<number>(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
    return out;
  }

  /**
   * Dot product of two vectors. On unit-normalized inputs this equals cosine
   * similarity; on zero vectors it returns 0.
   */
  private dotProduct(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    for (let i = 0; i < len; i++) dot += a[i] * b[i];
    return dot;
  }

  /**
   * Route an auxiliary LLM call through an in-memory TTL cache keyed by the
   * request shape. Identical HyDE / expansion / rerank / compression calls
   * within the TTL reuse the prior result instead of paying for another
   * round-trip. The final answer generation does NOT use this.
   */
  private async routeCached(request: AIRequest): Promise<AIResponse> {
    const key = createHash('sha256')
      .update(
        JSON.stringify({
          taskType: request.taskType,
          messages: request.messages,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          jsonMode: request.jsonMode,
        })
      )
      .digest('hex');

    const now = Date.now();
    const hit = this.llmCallCache.get(key);
    if (hit) {
      if (hit.expiresAt > now) {
        // Live hit: re-insert so it becomes the most-recently-used entry. A
        // Map preserves insertion order, so this makes eviction true LRU (the
        // key returned by keys().next() is the least-recently-used).
        this.llmCallCache.delete(key);
        this.llmCallCache.set(key, hit);
        return { ...hit.value, cached: true };
      }
      // Expired: drop it so it doesn't linger as a stale eviction candidate.
      this.llmCallCache.delete(key);
    }

    const value = await this.aiRouter.route(request);
    this.llmCallCache.set(key, { value, expiresAt: now + this.llmCacheTtlMs });

    // Bound the cache: drop the least-recently-used entry once over capacity.
    if (this.llmCallCache.size > this.llmCacheMaxEntries) {
      const lru = this.llmCallCache.keys().next().value as string | undefined;
      if (lru) this.llmCallCache.delete(lru);
    }

    return value;
  }

  /** Assemble the `[Source N: title]` block fed to generation and the self-checks. */
  private buildSourceText(documents: RetrievedDocument[]): string {
    return documents
      .map(
        (doc, idx) =>
          `[Source ${idx + 1}: ${doc.title}]\n${doc.compressedContent || doc.expandedContent || doc.content}`
      )
      .join('\n\n---\n\n');
  }

  async queryWithGeneration(
    query: string,
    options: RetrievalOptions = { strategy: 'advanced', useReranking: true, useMmr: true }
  ): Promise<{
    answer: string;
    sources: RetrievedDocument[];
    context: RAGContext;
    /** Faithfulness verdict; only present when useCorrectiveLoop is set. */
    grounded?: boolean;
  }> {
    // Retrieve relevant documents
    let context = await this.retrieve(query, options);

    if (context.documents.length === 0) {
      return {
        answer:
          'I could not find relevant information in the regulatory knowledge base to answer this question.',
        sources: [],
        context,
      };
    }

    const route = (req: AIRequest) => this.routeCached(req);

    // Corrective pre-generation (CRAG): grade whether the retrieved sources can
    // answer the question; if not, rewrite the query and retrieve once more,
    // keeping the new context when it returns results. Bounded to a single retry.
    if (options.useCorrectiveLoop) {
      const grade = await gradeContextSufficiency(route, query, this.buildSourceText(context.documents));
      context.tokensUsed += grade.tokensUsed;
      if (!grade.sufficient) {
        const rewrite = await rewriteQuery(route, query);
        context.tokensUsed += rewrite.tokensUsed;
        if (rewrite.query !== query) {
          const retried = await this.retrieve(rewrite.query, options);
          if (retried.documents.length > 0) {
            retried.tokensUsed += context.tokensUsed; // carry the grading/rewrite cost
            context = retried;
          }
        }
      }
    }

    // Build context for generation
    const sourceText = this.buildSourceText(context.documents);

    // Generate answer
    const response = await this.aiRouter.route({
      taskType: 'regulatory_review',
      messages: [
        {
          role: 'system',
          content: `You are a regulatory affairs expert with deep knowledge of FDA, EMA, and ICH guidelines.
Answer questions based ONLY on the provided sources. Be precise and cite sources using [Source N] notation.
If the sources don't contain enough information to fully answer, say so clearly.`,
        },
        {
          role: 'user',
          content: `Question: ${query}\n\nSources:\n${sourceText}`,
        },
      ],
      maxTokens: 1000,
      temperature: 0.3,
    });

    if (options.persistCitations && options.organizationUuid) {
      const citations = context.documents.map(doc => ({
        documentId: doc.documentId,
        chunkId: doc.chunkId,
        quote: doc.compressedContent || doc.expandedContent || doc.content,
        locator: doc.locator,
        confidence: doc.finalScore,
      }));

      try {
        await withTenantContext(this.pool, options.organizationUuid, async client => {
          await this.persistEvidenceCitations(client, query, citations);
        });
      } catch (error) {
        console.warn('[RAG] Citation persistence failed:', error);
      }
    }

    // Corrective post-generation: groundedness / faithfulness guard. Opt-in, and
    // it annotates the result (a `grounded` flag the caller can act on) rather
    // than withholding the answer.
    let grounded: boolean | undefined;
    if (options.useCorrectiveLoop) {
      const check = await verifyGroundedness(route, response.content, sourceText);
      context.tokensUsed += check.tokensUsed;
      grounded = check.grounded;
    }

    return {
      answer: response.content,
      sources: context.documents,
      context,
      ...(grounded === undefined ? {} : { grounded }),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let ragPipeline: AdvancedRAGPipeline | null = null;

export function getRAGPipeline(pool: pg.Pool): AdvancedRAGPipeline {
  if (!ragPipeline) {
    ragPipeline = new AdvancedRAGPipeline(pool);
  }
  return ragPipeline;
}
