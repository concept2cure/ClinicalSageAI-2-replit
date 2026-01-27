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
 * @author TrialSage AI Team
 * @version 2.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';
import { EnhancedEmbeddingService, getEmbeddingService } from './enhancedEmbeddingService.js';
import { AIProviderRouter, getAIRouter } from './aiProviderRouter.js';

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
  filters?: {
    atomType?: string;
    domain?: string;
    source?: string;
    dateRange?: { start: Date; end: Date };
  };
}

export interface RetrievedDocument {
  id: string;
  content: string;
  title: string;
  atomType: string;
  source?: string;
  initialScore: number; // From embedding similarity
  rerankScore?: number; // From cross-encoder
  finalScore: number; // Combined score
  compressedContent?: string; // Extracted relevant passage
}

export interface RAGContext {
  documents: RetrievedDocument[];
  totalCandidates: number;
  retrievalStrategy: string;
  processingTimeMs: number;
  tokensUsed: number;
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

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required for RAG pipeline');
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    let candidates: RetrievedDocument[];
    let retrievalStrategy = options.strategy;
    let tokensUsed = 0;

    // Step 1: Initial retrieval based on strategy
    switch (options.strategy) {
      case 'hyde':
        const hydeResult = await this.hydeRetrieval(query, limit * 3, threshold, options.filters);
        candidates = hydeResult.documents;
        tokensUsed += hydeResult.tokensUsed;
        break;

      case 'multi_query':
        const multiResult = await this.multiQueryRetrieval(
          query,
          limit * 3,
          threshold,
          options.filters
        );
        candidates = multiResult.documents;
        tokensUsed += multiResult.tokensUsed;
        break;

      case 'advanced':
        // Combine HyDE + Multi-Query
        const [hydeAdvanced, multiAdvanced] = await Promise.all([
          this.hydeRetrieval(query, limit * 2, threshold, options.filters),
          this.multiQueryRetrieval(query, limit * 2, threshold, options.filters),
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
        candidates = await this.basicRetrieval(query, limit * 3, threshold, options.filters);
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
   * Basic semantic retrieval
   */
  private async basicRetrieval(
    query: string,
    limit: number,
    threshold: number,
    filters?: RetrievalOptions['filters']
  ): Promise<RetrievedDocument[]> {
    const results = await this.embeddingService.searchSimilar(query, limit, threshold, filters);

    return results.map(r => ({
      id: r.id,
      content: r.content,
      title: r.title,
      atomType: r.atomType,
      initialScore: r.similarity,
      finalScore: r.similarity,
    }));
  }

  /**
   * HyDE: Hypothetical Document Embeddings
   * Generate a hypothetical answer, then search for similar documents
   */
  private async hydeRetrieval(
    query: string,
    limit: number,
    threshold: number,
    filters?: RetrievalOptions['filters']
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
    const results = await this.embeddingService.searchSimilar(
      hypotheticalDoc,
      limit,
      threshold,
      filters
    );

    return {
      documents: results.map(r => ({
        id: r.id,
        content: r.content,
        title: r.title,
        atomType: r.atomType,
        initialScore: r.similarity,
        finalScore: r.similarity,
      })),
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
    filters?: RetrievalOptions['filters']
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
      this.embeddingService.searchSimilar(
        q,
        Math.ceil(limit / allQueries.length),
        threshold,
        filters
      )
    );

    const allResults = await Promise.all(searchPromises);

    // Merge results
    const merged = this.mergeAndDeduplicate(
      allResults.flat().map(r => ({
        id: r.id,
        content: r.content,
        title: r.title,
        atomType: r.atomType,
        initialScore: r.similarity,
        finalScore: r.similarity,
      }))
    );

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
