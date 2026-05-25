/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    ADVANCED RAG PIPELINE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enterprise-grade Retrieval-Augmented Generation pipeline with:
 * - Cross-encoder reranking for improved relevance
 * - HyDE (Hypothetical Document Embeddings) for query expansion
 * - Multi-query retrieval for better coverage
 * - Maximal Marginal Relevance (MMR) for diversity
 * - Contextual compression for token efficiency
 *
 * TECHNIQUES IMPLEMENTED:
 * 1. HyDE - Generate hypothetical answer, embed that
 * 2. Multi-Query - Expand query into multiple perspectives
 * 3. Cross-Encoder Reranking - Score relevance with cross-attention
 * 4. MMR - Balance relevance with diversity
 * 5. Contextual Compression - Extract only relevant passages
 *
 * @author Concept2Cure AI Team
 * @version 2.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { EnhancedEmbeddingService, getEmbeddingService } from './enhancedEmbeddingService.js';
import { AIProviderRouter, getAIRouter } from './aiProviderRouter.js';
import { getOpenAIClient } from './openai-client.js';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface RetrievalOptions {
  strategy: 'basic' | 'hyde' | 'multi_query' | 'advanced';
  limit?: number;
  threshold?: number;
  useReranking?: boolean;
  useMmr?: boolean;
  mmrLambda?: number; // 0 = max diversity, 1 = max relevance
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
  rerankScore?: number; // From cross-encoder
  finalScore: number; // Combined score
  compressedContent?: string; // Extracted relevant passage
  pageNumber?: number;
  sectionTitle?: string | null;
  locator?: string;
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
  similarity: number;
};

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
  private openai: OpenAI;

  constructor(pool: pg.Pool) {
    this.pool = pool;
    this.embeddingService = getEmbeddingService(pool);
    this.aiRouter = getAIRouter(pool);

    this.openai = getOpenAIClient();

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

    let candidates: RetrievedDocument[];
    // Descriptive label for RAGContext.retrievalStrategy (free-form string);
    // the 'advanced' strategy reports the composite 'hyde+multi_query'.
    let retrievalStrategy: string = options.strategy;
    let tokensUsed = 0;

    // Step 1: Initial retrieval based on strategy
    switch (options.strategy) {
      case 'hyde':
        const hydeResult = await this.hydeRetrieval(
          query,
          limit * 3,
          threshold,
          options.filters,
          options.organizationUuid,
          artifactScope
        );
        candidates = hydeResult.documents;
        tokensUsed += hydeResult.tokensUsed;
        break;

      case 'multi_query':
        const multiResult = await this.multiQueryRetrieval(
          query,
          limit * 3,
          threshold,
          options.filters,
          options.organizationUuid,
          artifactScope
        );
        candidates = multiResult.documents;
        tokensUsed += multiResult.tokensUsed;
        break;

      case 'advanced':
        // Combine HyDE + Multi-Query
        const [hydeAdvanced, multiAdvanced] = await Promise.all([
          this.hydeRetrieval(
            query,
            limit * 2,
            threshold,
            options.filters,
            options.organizationUuid,
            artifactScope
          ),
          this.multiQueryRetrieval(
            query,
            limit * 2,
            threshold,
            options.filters,
            options.organizationUuid,
            artifactScope
          ),
        ]);

        // Merge and deduplicate
        candidates = this.mergeAndDeduplicate([
          ...hydeAdvanced.documents,
          ...multiAdvanced.documents,
        ]);
        tokensUsed += hydeAdvanced.tokensUsed + multiAdvanced.tokensUsed;
        retrievalStrategy = 'hyde+multi_query';
        break;

      case 'basic':
      default:
        candidates = await this.basicRetrieval(
          query,
          limit * 3,
          threshold,
          options.filters,
          options.organizationUuid,
          artifactScope
        );
        break;
    }

    const totalCandidates = candidates.length;

    // Step 2: Cross-encoder reranking
    if (options.useReranking && candidates.length > 0) {
      const rerankResult = await this.crossEncoderRerank(query, candidates);
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
    artifactScope?: RetrievalOptions['artifactScope']
  ): Promise<RetrievedDocument[]> {
    if (artifactScope) {
      return this.searchProjectAtoms(query, limit, threshold, artifactScope);
    }
    return this.searchVaultSimilar(query, limit, threshold, organizationUuid);
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
      }));
  }

  /**
   * Basic semantic retrieval
   */
  private async basicRetrieval(
    query: string,
    limit: number,
    threshold: number,
    _filters?: RetrievalOptions['filters'],
    organizationUuid?: string,
    artifactScope?: RetrievalOptions['artifactScope']
  ): Promise<RetrievedDocument[]> {
    return this.searchInitial(query, limit, threshold, organizationUuid, artifactScope);
  }

  /**
   * HyDE: Hypothetical Document Embeddings
   * Generate a hypothetical answer, then search for similar documents
   */
  private async hydeRetrieval(
    query: string,
    limit: number,
    threshold: number,
    _filters?: RetrievalOptions['filters'],
    organizationUuid?: string,
    artifactScope?: RetrievalOptions['artifactScope']
  ): Promise<{ documents: RetrievedDocument[]; tokensUsed: number }> {
    // Generate hypothetical answer using Claude for better reasoning
    const hydeResponse = await this.aiRouter.route({
      taskType: 'reasoning',
      messages: [
        {
          role: 'system',
          content: `You are a regulatory affairs expert. Generate a detailed, factual answer to the following question as if you were an authoritative regulatory document. Include specific regulatory references, requirements, and guidance. Do not mention that this is hypothetical.`,
        },
        {
          role: 'user',
          content: query,
        },
      ],
      maxTokens: 500,
      temperature: 0.3,
    });

    const hypotheticalDoc = hydeResponse.content;

    // Search using the hypothetical document
    const results = await this.searchInitial(
      hypotheticalDoc,
      limit,
      threshold,
      organizationUuid,
      artifactScope
    );

    return {
      documents: results,
      tokensUsed: hydeResponse.usage.totalTokens,
    };
  }

  /**
   * Multi-Query: Generate multiple query perspectives
   */
  private async multiQueryRetrieval(
    query: string,
    limit: number,
    threshold: number,
    _filters?: RetrievalOptions['filters'],
    organizationUuid?: string,
    artifactScope?: RetrievalOptions['artifactScope']
  ): Promise<{ documents: RetrievedDocument[]; tokensUsed: number }> {
    // Generate alternative queries
    const queryExpansionResponse = await this.aiRouter.route({
      taskType: 'structured_output',
      messages: [
        {
          role: 'system',
          content: `You are a search query expert. Generate 4 alternative versions of the user's question that capture different perspectives or aspects. Return ONLY a JSON array of strings, no other text.`,
        },
        {
          role: 'user',
          content: `Original question: "${query}"\n\nGenerate 4 alternative phrasings that would help find relevant regulatory information.`,
        },
      ],
      maxTokens: 300,
      temperature: 0.5,
      jsonMode: true,
    });

    let alternativeQueries: string[];
    try {
      const parsed = JSON.parse(queryExpansionResponse.content);
      alternativeQueries = Array.isArray(parsed) ? parsed : parsed.queries || [query];
    } catch {
      alternativeQueries = [query];
    }

    // Add original query
    const allQueries = [query, ...alternativeQueries.slice(0, 4)];

    // Search with all queries in parallel
    const searchPromises = allQueries.map(q =>
      this.searchInitial(
        q,
        Math.ceil(limit / allQueries.length),
        threshold,
        organizationUuid,
        artifactScope
      )
    );

    const allResults = await Promise.all(searchPromises);

    // Merge results
    const merged = this.mergeAndDeduplicate(allResults.flat());

    return {
      documents: merged,
      tokensUsed: queryExpansionResponse.usage.totalTokens,
    };
  }

  /**
   * Cross-encoder reranking using LLM
   */
  private async crossEncoderRerank(
    query: string,
    documents: RetrievedDocument[]
  ): Promise<{ documents: RetrievedDocument[]; tokensUsed: number }> {
    if (documents.length === 0) {
      return { documents: [], tokensUsed: 0 };
    }

    // Build reranking prompt
    const docList = documents
      .map(
        (doc, idx) =>
          `[${idx + 1}] ${doc.title}\n${doc.content.slice(0, 500)}${doc.content.length > 500 ? '...' : ''}`
      )
      .join('\n\n');

    const rerankResponse = await this.aiRouter.route({
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

    let scores: Record<string, number> = {};
    try {
      scores = JSON.parse(rerankResponse.content);
    } catch {
      // If parsing fails, keep original order
      return { documents, tokensUsed: rerankResponse.usage.totalTokens };
    }

    // Apply rerank scores
    const rerankedDocs = documents.map((doc, idx) => {
      const rerankScore = (scores[String(idx + 1)] || 50) / 100;
      return {
        ...doc,
        rerankScore,
        finalScore: (doc.initialScore + rerankScore) / 2, // Combined score
      };
    });

    // Sort by final score
    rerankedDocs.sort((a, b) => b.finalScore - a.finalScore);

    return {
      documents: rerankedDocs,
      tokensUsed: rerankResponse.usage.totalTokens,
    };
  }

  /**
   * Maximal Marginal Relevance for diversity
   */
  private async applyMmr(
    documents: RetrievedDocument[],
    limit: number,
    lambda: number
  ): Promise<RetrievedDocument[]> {
    if (documents.length <= limit) return documents;

    const selected: RetrievedDocument[] = [];
    const remaining = [...documents];

    while (selected.length < limit && remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const doc = remaining[i];

        // Calculate relevance component
        const relevance = doc.finalScore;

        // Calculate diversity component (max similarity to already selected)
        let maxSimilarity = 0;
        if (selected.length > 0) {
          // Simple text-based similarity for efficiency
          for (const selDoc of selected) {
            const sim = this.calculateTextSimilarity(doc.content, selDoc.content);
            maxSimilarity = Math.max(maxSimilarity, sim);
          }
        }

        // MMR score
        const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    }

    return selected;
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
        if (doc.content.length < 500) {
          // Too short to compress
          return { ...doc, compressedContent: doc.content };
        }

        const compressResponse = await this.aiRouter.route({
          taskType: 'document_analysis',
          messages: [
            {
              role: 'system',
              content: `Extract ONLY the passages from the document that are directly relevant to answering the query. Include exact quotes with context. If nothing is relevant, respond with "NO_RELEVANT_CONTENT".`,
            },
            {
              role: 'user',
              content: `Query: "${query}"\n\nDocument:\n${doc.content}`,
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
    organizationUuid?: string
  ): Promise<RetrievedDocument[]> {
    const queryResult = await this.embeddingService.embed(query, 'text-embedding-3-small');
    const vector = `[${queryResult.embedding.join(',')}]`;

    return withTenantContext(this.pool, organizationUuid, async client => {
      const { rows } = await client.query<VaultChunkRow>(
        `
        SELECT
          c.id AS chunk_id,
          c.document_id AS document_id,
          COALESCE(d.document_title, d.file_name, '') AS title,
          c.chunk_text AS content,
          c.page_number AS page_number,
          c.section_title AS section_title,
          1 - (c.embedding <=> $1::vector) AS similarity
        FROM vault.document_chunks c
        JOIN vault.documents d ON d.id = c.document_id
        WHERE c.embedding IS NOT NULL
          AND 1 - (c.embedding <=> $1::vector) > $2
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
      `,
        [vector, threshold, limit]
      );

      return rows.map(row => ({
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
        locator: buildLocator(row),
      }));
    });
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
  private mergeAndDeduplicate(documents: RetrievedDocument[]): RetrievedDocument[] {
    const seen = new Map<string, RetrievedDocument>();

    for (const doc of documents) {
      const existing = seen.get(doc.id);
      if (!existing || doc.finalScore > existing.finalScore) {
        seen.set(doc.id, doc);
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Simple text similarity (Jaccard on words)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Full RAG query with generation
   */
  async queryWithGeneration(
    query: string,
    options: RetrievalOptions = { strategy: 'advanced', useReranking: true, useMmr: true }
  ): Promise<{
    answer: string;
    sources: RetrievedDocument[];
    context: RAGContext;
  }> {
    // Retrieve relevant documents
    const context = await this.retrieve(query, options);

    if (context.documents.length === 0) {
      return {
        answer:
          'I could not find relevant information in the regulatory knowledge base to answer this question.',
        sources: [],
        context,
      };
    }

    // Build context for generation
    const sourceText = context.documents
      .map(
        (doc, idx) => `[Source ${idx + 1}: ${doc.title}]\n${doc.compressedContent || doc.content}`
      )
      .join('\n\n---\n\n');

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
        quote: doc.compressedContent || doc.content,
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

    return {
      answer: response.content,
      sources: context.documents,
      context,
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
