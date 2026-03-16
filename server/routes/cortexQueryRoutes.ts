/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    UNIFIED CORTEX QUERY API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enterprise-grade unified API for querying the Lumen Cortex regulatory
 * intelligence system. Combines semantic search, knowledge graph traversal,
 * multi-provider AI generation, and cognitive advisory.
 *
 * CAPABILITIES:
 * - Semantic search with advanced RAG (HyDE, reranking, MMR)
 * - Knowledge graph traversal and relationship discovery
 * - Multi-provider AI generation (OpenAI, Anthropic, Moonshot)
 * - Cognitive advisory with project memory
 * - Real-time regulatory intelligence queries
 *
 * @author TrialSage AI Team
 * @version 2.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import { Router, Request, Response } from 'express';
import pg from 'pg';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayRequest, RoutingStrategy } from '../services/ai-gateway/types.js';
import { getEmbeddingService } from '../services/enhancedEmbeddingService.js';
import { getRAGPipeline, RetrievalOptions } from '../services/advancedRAGPipeline.js';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

interface CortexQueryRequest {
  query: string;
  mode?: 'search' | 'generate' | 'advisory' | 'graph';
  persistCitations?: boolean;
  options?: {
    retrievalStrategy?: 'basic' | 'hyde' | 'multi_query' | 'advanced';
    aiStrategy?: RoutingStrategy;
    limit?: number;
    threshold?: number;
    useReranking?: boolean;
    filters?: {
      atomType?: string;
      sourceType?: string;
      tags?: string[];
    };
  };
  context?: {
    projectId?: string;
    submissionType?: string;
    previousQueries?: string[];
  };
}

interface CortexQueryResponse {
  success: boolean;
  mode: string;
  query: string;
  results: {
    answer?: string;
    sources?: Array<{
      id: string;
      documentId?: string;
      chunkId?: string;
      locator?: string;
      pageNumber?: number;
      title: string;
      content: string;
      score: number;
      atomType: string;
    }>;
    graph?: {
      nodes: Array<{ id: string; title: string; type: string }>;
      edges: Array<{ source: string; target: string; relationship: string }>;
    };
    advisory?: {
      riskLevel: string;
      recommendations: string[];
      relevantPatterns: string[];
    };
  };
  metadata: {
    processingTimeMs: number;
    tokensUsed: number;
    aiProvider?: string;
    aiModel?: string;
    retrievalStrategy?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//                          ROUTER SETUP
// ═══════════════════════════════════════════════════════════════════════════

const router = Router();

// Lazy-initialize pool (to be injected)
let pool: pg.Pool | null = null;

export function initializeCortexAPI(dbPool: pg.Pool): void {
  pool = dbPool;
  console.log('✅ Unified Cortex Query API initialized');
}

// ═══════════════════════════════════════════════════════════════════════════
//                          MAIN QUERY ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/cortex/query
 *
 * Unified query endpoint for all Cortex capabilities
 */
router.post('/query', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const body = req.body as CortexQueryRequest;
    const { query, mode = 'generate', options = {}, context = {}, persistCitations } = body;
    const organizationUuid =
      req.tenantContext?.organizationUuid || (req.headers['x-org-uuid'] as string | undefined);

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    if (persistCitations && !organizationUuid) {
      return res.status(400).json({
        error: 'organizationUuid is required when persistCitations is enabled',
      });
    }

    if (!organizationUuid) {
      console.warn('[Cortex] Missing organizationUuid; RLS may return empty results.');
    }

    let response: CortexQueryResponse;

    switch (mode) {
      case 'search':
        response = await handleSearchMode(query, options, organizationUuid);
        break;
      case 'generate':
        response = await handleGenerateMode(
          query,
          options,
          context,
          organizationUuid,
          persistCitations
        );
        break;
      case 'graph':
        response = await handleGraphMode(query, options);
        break;
      case 'advisory':
        response = await handleAdvisoryMode(query, options, context, organizationUuid);
        break;
      default:
        return res.status(400).json({ error: `Unknown mode: ${mode}` });
    }

    response.metadata.processingTimeMs = Date.now() - startTime;
    res.json(response);
  } catch (error) {
    console.error('Cortex query error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal error',
      metadata: { processingTimeMs: Date.now() - startTime },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//                          MODE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search mode: Pure semantic/hybrid search without generation
 */
async function handleSearchMode(
  query: string,
  options: CortexQueryRequest['options'],
  organizationUuid?: string
): Promise<CortexQueryResponse> {
  const embeddingService = getEmbeddingService(pool!);

  // Scope search to requesting org. If no org provided, RLS on the
  // underlying lumen_data_atoms table will return empty — this is
  // intentional defense-in-depth per multi-tenant isolation rules.
  const results = await embeddingService.searchHybrid(
    query,
    options?.limit || 10,
    0.7, // semantic weight
    organizationUuid
  );

  return {
    success: true,
    mode: 'search',
    query,
    results: {
      sources: results.map(r => ({
        id: r.id,
        title: r.title,
        content: r.content,
        score: r.score,
        atomType: 'unknown', // Would need to join to get this
      })),
    },
    metadata: {
      processingTimeMs: 0,
      tokensUsed: 0,
      retrievalStrategy: 'hybrid',
    },
  };
}

/**
 * Generate mode: Full RAG pipeline with AI generation
 */
async function handleGenerateMode(
  query: string,
  options: CortexQueryRequest['options'],
  context: CortexQueryRequest['context'],
  organizationUuid?: string,
  persistCitations?: boolean
): Promise<CortexQueryResponse> {
  const ragPipeline = getRAGPipeline(pool!);
  const gateway = getGateway();

  // Configure retrieval options
  const retrievalOptions: RetrievalOptions = {
    strategy: options?.retrievalStrategy || 'advanced',
    limit: options?.limit || 8,
    threshold: options?.threshold || 0.5,
    useReranking: options?.useReranking ?? true,
    useMmr: true,
    mmrLambda: 0.7,
    useCompression: true,
    organizationUuid,
    persistCitations: !!persistCitations,
    filters: options?.filters
      ? {
          atomType: options.filters.atomType,
        }
      : undefined,
  };

  // Execute RAG query with generation
  const result = await ragPipeline.queryWithGeneration(query, retrievalOptions);

  return {
    success: true,
    mode: 'generate',
    query,
    results: {
      answer: result.answer,
      sources: result.sources.map(s => ({
        id: s.id,
        documentId: s.documentId,
        chunkId: s.chunkId,
        locator: s.locator,
        pageNumber: s.pageNumber,
        title: s.title,
        content: s.compressedContent || s.content,
        score: s.finalScore,
        atomType: s.atomType,
      })),
    },
    metadata: {
      processingTimeMs: result.context.processingTimeMs,
      tokensUsed: result.context.tokensUsed,
      retrievalStrategy: result.context.retrievalStrategy,
    },
  };
}

/**
 * Graph mode: Knowledge graph traversal
 */
async function handleGraphMode(
  query: string,
  options: CortexQueryRequest['options']
): Promise<CortexQueryResponse> {
  // First, find relevant atoms via search
  const embeddingService = getEmbeddingService(pool!);
  const searchResults = await embeddingService.searchSimilar(query, 5, 0.5);

  if (searchResults.length === 0) {
    return {
      success: true,
      mode: 'graph',
      query,
      results: {
        graph: { nodes: [], edges: [] },
      },
      metadata: { processingTimeMs: 0, tokensUsed: 0 },
    };
  }

  // Get graph neighborhood for found atoms
  const atomIds = searchResults.map(r => r.id);

  const { rows: edges } = await pool!.query(
    `
    SELECT
      e.source_atom_id, e.target_atom_id, e.relationship_type,
      sa.title as source_title, sa.atom_type as source_type,
      ta.title as target_title, ta.atom_type as target_type
    FROM lumen_knowledge_graph_edges e
    JOIN lumen_data_atoms sa ON e.source_atom_id = sa.id
    JOIN lumen_data_atoms ta ON e.target_atom_id = ta.id
    WHERE e.source_atom_id = ANY($1) OR e.target_atom_id = ANY($1)
    LIMIT 50
  `,
    [atomIds]
  );

  // Build graph response
  const nodeMap = new Map<string, { id: string; title: string; type: string }>();
  const graphEdges: Array<{ source: string; target: string; relationship: string }> = [];

  for (const edge of edges) {
    nodeMap.set(edge.source_atom_id, {
      id: edge.source_atom_id,
      title: edge.source_title,
      type: edge.source_type,
    });
    nodeMap.set(edge.target_atom_id, {
      id: edge.target_atom_id,
      title: edge.target_title,
      type: edge.target_type,
    });
    graphEdges.push({
      source: edge.source_atom_id,
      target: edge.target_atom_id,
      relationship: edge.relationship_type,
    });
  }

  return {
    success: true,
    mode: 'graph',
    query,
    results: {
      graph: {
        nodes: Array.from(nodeMap.values()),
        edges: graphEdges,
      },
      sources: searchResults.map(r => ({
        id: r.id,
        title: r.title,
        content: r.content.slice(0, 200) + '...',
        score: r.similarity,
        atomType: r.atomType,
      })),
    },
    metadata: { processingTimeMs: 0, tokensUsed: 0 },
  };
}

/**
 * Advisory mode: Cognitive regulatory advisory
 */
async function handleAdvisoryMode(
  query: string,
  options: CortexQueryRequest['options'],
  context: CortexQueryRequest['context'],
  organizationUuid?: string
): Promise<CortexQueryResponse> {
  const gateway = getGateway();
  const ragPipeline = getRAGPipeline(pool!);

  // Get relevant context
  const ragContext = await ragPipeline.retrieve(query, {
    strategy: 'advanced',
    limit: 5,
    useReranking: true,
    organizationUuid,
  });

  // Build advisory prompt
  const sourceText = ragContext.documents
    .map(d => `[${d.title}]: ${d.content.slice(0, 300)}`)
    .join('\n\n');

  // Generate advisory response
  const advisoryResponse = await gateway.route({
    taskType: 'regulatory_review',
    messages: [
      {
        role: 'system',
        content: `You are an expert regulatory affairs advisor with deep knowledge of FDA, EMA, and ICH requirements.

Provide strategic regulatory advice based on the query and context. Your response should include:
1. A risk assessment (LOW, MEDIUM, HIGH, CRITICAL)
2. Key recommendations (3-5 actionable items)
3. Relevant regulatory patterns or precedents
4. Potential pitfalls to avoid

Be specific, actionable, and cite relevant regulatory requirements.`,
      },
      {
        role: 'user',
        content: `Query: ${query}

${context?.submissionType ? `Submission Type: ${context.submissionType}` : ''}
${context?.projectId ? `Project ID: ${context.projectId}` : ''}

Relevant Regulatory Context:
${sourceText}

Provide your regulatory advisory analysis:`,
      },
    ],
    maxTokens: 1000,
    temperature: 0.3,
    projectId: context?.projectId,
  });

  // Parse advisory response (simplified - would use structured output in production)
  const answer = advisoryResponse.content;

  // Extract risk level from response
  let riskLevel = 'MEDIUM';
  if (answer.toLowerCase().includes('critical')) riskLevel = 'CRITICAL';
  else if (answer.toLowerCase().includes('high risk')) riskLevel = 'HIGH';
  else if (answer.toLowerCase().includes('low risk')) riskLevel = 'LOW';

  return {
    success: true,
    mode: 'advisory',
    query,
    results: {
      answer,
      advisory: {
        riskLevel,
        recommendations: [], // Would parse from structured output
        relevantPatterns: ragContext.documents.map(d => d.title),
      },
      sources: ragContext.documents.map(d => ({
        id: d.id,
        documentId: d.documentId,
        chunkId: d.chunkId,
        locator: d.locator,
        pageNumber: d.pageNumber,
        title: d.title,
        content: d.content.slice(0, 200),
        score: d.finalScore,
        atomType: d.atomType,
      })),
    },
    metadata: {
      processingTimeMs: ragContext.processingTimeMs,
      tokensUsed: ragContext.tokensUsed + advisoryResponse.usage.totalTokens,
      aiProvider: advisoryResponse.provider,
      aiModel: advisoryResponse.model,
      retrievalStrategy: ragContext.retrievalStrategy,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//                          ADDITIONAL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/cortex/stats
 *
 * Get Cortex statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) as total_atoms,
        COUNT(embedding) as atoms_with_embeddings,
        COUNT(DISTINCT atom_type) as unique_atom_types,
        COUNT(DISTINCT source_type) as unique_sources
      FROM lumen_data_atoms
    `);

    const { rows: edgeRows } = await pool.query(`
      SELECT COUNT(*) as total_edges,
             COUNT(DISTINCT relationship_type) as unique_relationships
      FROM lumen_knowledge_graph_edges
    `);

    const { rows: typeRows } = await pool.query(`
      SELECT atom_type, COUNT(*) as count
      FROM lumen_data_atoms
      GROUP BY atom_type
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      atoms: {
        total: parseInt(rows[0].total_atoms),
        withEmbeddings: parseInt(rows[0].atoms_with_embeddings),
        uniqueTypes: parseInt(rows[0].unique_atom_types),
        uniqueSources: parseInt(rows[0].unique_sources),
      },
      knowledgeGraph: {
        totalEdges: parseInt(edgeRows[0].total_edges),
        uniqueRelationships: parseInt(edgeRows[0].unique_relationships),
      },
      topAtomTypes: typeRows.map(r => ({
        type: r.atom_type,
        count: parseInt(r.count),
      })),
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * GET /api/cortex/providers
 *
 * Get AI provider status
 */
router.get('/providers', async (req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const gateway = getGateway();
    const healthInfo = gateway.getProviderHealth();

    res.json({
      providers: healthInfo.map(h => ({
        name: h.provider,
        healthy: h.healthy,
        avgLatencyMs: h.avgLatencyMs,
        requestCount: h.requestCount,
        errorRate: h.errorRate,
      })),
    });
  } catch (error) {
    console.error('Providers error:', error);
    res.status(500).json({ error: 'Failed to get provider status' });
  }
});

/**
 * POST /api/cortex/embed
 *
 * Embed pending atoms
 */
router.post('/embed', async (req: Request, res: Response) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const { batchSize = 50 } = req.body;
    const embeddingService = getEmbeddingService(pool);

    const result = await embeddingService.embedAllPendingAtoms(batchSize, (processed, total) => {
      console.log(`Embedding progress: ${processed}/${total}`);
    });

    res.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Embed error:', error);
    res.status(500).json({ error: 'Failed to embed atoms' });
  }
});

export default router;
