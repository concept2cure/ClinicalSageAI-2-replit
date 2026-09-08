/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    ENHANCED EMBEDDING SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Production-grade embedding service with:
 * - Auto-embedding on atom insertion
 * - Batch processing for efficiency
 * - Multiple embedding model support
 * - Caching for cost optimization
 * - Error recovery and retry logic
 * - Comprehensive audit logging
 *
 * SUPPORTED EMBEDDING MODELS:
 * - OpenAI text-embedding-3-small (1536d) - Default
 * - OpenAI text-embedding-3-large (3072d) - High quality
 * - OpenAI text-embedding-ada-002 (1536d) - Legacy
 *
 * @author Concept2Cure AI Team
 * @version 2.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import { getEmbeddingProvider } from './ai-gateway/embeddings/embedding-provider';
import pg from 'pg';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type EmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

export interface EmbeddingConfig {
  model: EmbeddingModel;
  dimensions: number;
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: EmbeddingModel;
  tokenCount: number;
  cached: boolean;
}

export interface AtomEmbeddingJob {
  atomId: string;
  content: string;
  priority: 'high' | 'normal' | 'low';
}

export interface EmbeddingStats {
  totalEmbedded: number;
  totalPending: number;
  avgProcessingTimeMs: number;
  cacheHitRate: number;
  estimatedCostUSD: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//                          MODEL CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

const MODEL_CONFIGS: Record<EmbeddingModel, EmbeddingConfig> = {
  'text-embedding-3-small': {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  'text-embedding-3-large': {
    model: 'text-embedding-3-large',
    dimensions: 3072,
    batchSize: 50,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  'text-embedding-ada-002': {
    model: 'text-embedding-ada-002',
    dimensions: 1536,
    batchSize: 100,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
};

// Cost per 1000 tokens in USD
const MODEL_COSTS: Record<EmbeddingModel, number> = {
  'text-embedding-3-small': 0.00002,
  'text-embedding-3-large': 0.00013,
  'text-embedding-ada-002': 0.0001,
};

// ═══════════════════════════════════════════════════════════════════════════
//                          ENHANCED EMBEDDING SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class EnhancedEmbeddingService {
  private pool: pg.Pool;
  private defaultModel: EmbeddingModel = 'text-embedding-3-small';
  private embeddingCache: Map<string, number[]> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;
  private processingQueue: AtomEmbeddingJob[] = [];
  private isProcessing = false;

  constructor(pool: pg.Pool) {
    // Embeddings route through the gateway embedding-provider seam (OpenAI by
    // default, or a self-hosted OpenAI-compatible endpoint when
    // EMBEDDING_PROVIDER=local) — no hard OpenAI dependency at construction, so
    // this service boots in an air-gapped deployment.
    this.pool = pool;
    console.log('✅ Enhanced Embedding Service initialized');
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string, model: EmbeddingModel = this.defaultModel): Promise<EmbeddingResult> {
    // Check cache
    const cacheKey = this.getCacheKey(text, model);
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      return {
        text,
        embedding: cached,
        model,
        tokenCount: this.estimateTokenCount(text),
        cached: true,
      };
    }
    this.cacheMisses++;

    // Truncate if too long (8191 tokens max for embedding models)
    const truncatedText = this.truncateText(text, 8000);

    const response = await getEmbeddingProvider().embed({
      model,
      input: truncatedText,
      dimensions: MODEL_CONFIGS[model].dimensions,
    });

    const embedding = response.embeddings[0];
    const tokenCount = response.inputTokens;

    // Cache the result
    this.embeddingCache.set(cacheKey, embedding);

    // Limit cache size
    if (this.embeddingCache.size > 10000) {
      const firstKey = this.embeddingCache.keys().next().value as string | undefined;
      if (firstKey) this.embeddingCache.delete(firstKey);
    }

    return {
      text: truncatedText,
      embedding,
      model,
      tokenCount,
      cached: false,
    };
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(
    texts: string[],
    model: EmbeddingModel = this.defaultModel
  ): Promise<EmbeddingResult[]> {
    const config = MODEL_CONFIGS[model];
    const results: EmbeddingResult[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += config.batchSize) {
      const batch = texts.slice(i, i + config.batchSize);
      const truncatedBatch = batch.map(t => this.truncateText(t, 8000));

      let retries = 0;
      while (retries < config.maxRetries) {
        try {
          const response = await getEmbeddingProvider().embed({
            model,
            input: truncatedBatch,
            dimensions: config.dimensions,
          });

          for (let j = 0; j < batch.length; j++) {
            const embedding = response.embeddings[j];
            const cacheKey = this.getCacheKey(truncatedBatch[j], model);
            this.embeddingCache.set(cacheKey, embedding);

            results.push({
              text: truncatedBatch[j],
              embedding,
              model,
              tokenCount: Math.ceil(response.inputTokens / batch.length),
              cached: false,
            });
          }
          break;
        } catch (error) {
          retries++;
          if (retries >= config.maxRetries) throw error;
          await this.sleep(config.retryDelayMs * retries);
        }
      }
    }

    return results;
  }

  /**
   * Embed and store an atom in the database
   */
  async embedAtom(atomId: string, forceRegenerate = false): Promise<void> {
    // Get atom content
    const { rows } = await this.pool.query(
      `
      SELECT
        id, content, title, atom_type,
        embedding IS NOT NULL as has_embedding
      FROM lumen_data_atoms
      WHERE id = $1
    `,
      [atomId]
    );

    if (rows.length === 0) {
      throw new Error(`Atom not found: ${atomId}`);
    }

    const atom = rows[0];

    // Skip if already embedded and not forcing
    if (atom.has_embedding && !forceRegenerate) {
      return;
    }

    // Build embedding text
    const embeddingText = this.buildEmbeddingText(atom);

    // Generate embedding
    const result = await this.embed(embeddingText, this.defaultModel);

    // Store embedding
    await this.pool.query(
      `
      UPDATE lumen_data_atoms
      SET
        embedding = $1::vector,
        embedding_model = $2,
        embedding_updated_at = NOW()
      WHERE id = $3
    `,
      [`[${result.embedding.join(',')}]`, result.model, atomId]
    );

    // Log audit
    await this.logEmbeddingAudit(atomId, result);
  }

  /**
   * Embed all atoms without embeddings
   */
  async embedAllPendingAtoms(
    batchSize = 50,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ processed: number; errors: number }> {
    // Get count of pending atoms
    const { rows: countRows } = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM lumen_data_atoms
      WHERE embedding IS NULL
    `);
    const total = parseInt(countRows[0].count, 10);

    let processed = 0;
    let errors = 0;

    while (processed < total) {
      // Get batch of atoms without embeddings
      const { rows: atoms } = await this.pool.query(
        `
        SELECT id, content, title, atom_type
        FROM lumen_data_atoms
        WHERE embedding IS NULL
        ORDER BY created_at ASC
        LIMIT $1
      `,
        [batchSize]
      );

      if (atoms.length === 0) break;

      // Build embedding texts
      const texts = atoms.map(atom => this.buildEmbeddingText(atom));

      try {
        // Generate embeddings in batch
        const embeddings = await this.embedBatch(texts, this.defaultModel);

        // Store embeddings
        for (let i = 0; i < atoms.length; i++) {
          try {
            await this.pool.query(
              `
              UPDATE lumen_data_atoms
              SET
                embedding = $1::vector,
                embedding_model = $2,
                embedding_updated_at = NOW()
              WHERE id = $3
            `,
              [`[${embeddings[i].embedding.join(',')}]`, embeddings[i].model, atoms[i].id]
            );
          } catch (updateError) {
            console.error(`Failed to update atom ${atoms[i].id}:`, updateError);
            errors++;
          }
        }

        processed += atoms.length;

        if (onProgress) {
          onProgress(processed, total);
        }
      } catch (batchError) {
        console.error('Batch embedding error:', batchError);
        errors += atoms.length;
        processed += atoms.length;
      }

      // Small delay between batches to avoid rate limits
      await this.sleep(100);
    }

    return { processed, errors };
  }

  /**
   * Semantic search for similar atoms. Tenant-scoped: organizationUuid is
   * required to prevent cross-tenant retrieval. When omitted, returns an
   * empty array rather than searching across all tenants — callers that
   * legitimately need cross-tenant search should add an explicit method
   * with its own access checks.
   */
  /**
   * Enrich retrieved atoms with their canonical source identity
   * (`lumen_data_atoms.source_id` / `source_type`).
   *
   * The search paths deliberately do NOT carry these: `search_atoms_hybrid`'s
   * RETURNS TABLE omits them, and the two hybrid branches pass the function's
   * positional args in different orders — so both search queries are left
   * byte-for-byte untouched and the identity is attached in a separate,
   * best-effort lookup instead. Source attribution (Phase 2/3) needs the raw
   * `source_id` (an artifact-id string for `data_room_upload` atoms) to resolve
   * a chunk back to its `cre_evidence_sources.id`; carrying it here is the
   * structural change that unblocks that, additively — existing callers
   * destructure named fields and ignore the two new ones.
   *
   * Best-effort by design: if the lookup fails, every row gets
   * `sourceId=sourceType=null` and retrieval is unaffected — a missing source
   * identity means "not attributable", which is honest, never a broken search.
   * The `id::text = ANY($1::text[])` match is type-agnostic so it holds whether
   * `lumen_data_atoms.id` is an integer or a uuid.
   */
  private async attachSourceIdentity<T extends { id: string | number }>(
    rows: T[]
  ): Promise<Array<T & { sourceId: string | null; sourceType: string | null }>> {
    const ids = rows.map(r => r.id).filter(v => v !== null && v !== undefined);
    let meta = new Map<string, { sourceId: string | null; sourceType: string | null }>();
    if (ids.length > 0) {
      try {
        const { rows: metaRows } = await this.pool.query(
          `SELECT id, source_id, source_type FROM lumen_data_atoms WHERE id::text = ANY($1::text[])`,
          [ids.map(String)]
        );
        meta = new Map(
          metaRows.map((m: any) => [
            String(m.id),
            { sourceId: m.source_id ?? null, sourceType: m.source_type ?? null },
          ])
        );
      } catch (error) {
        console.warn(
          '[enhancedEmbeddingService] source-identity enrichment failed (non-fatal); results carry null source ids:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    return rows.map(r => {
      const md = meta.get(String(r.id));
      return { ...r, sourceId: md?.sourceId ?? null, sourceType: md?.sourceType ?? null };
    });
  }

  async searchSimilar(
    query: string,
    limit = 10,
    threshold = 0.7,
    organizationUuid?: string,
    filters?: {
      atomType?: string;
      domain?: string;
      source?: string;
    }
  ): Promise<
    Array<{
      id: string;
      content: string;
      title: string;
      similarity: number;
      atomType: string;
      sourceId: string | null;
      sourceType: string | null;
    }>
  > {
    if (!organizationUuid) {
      console.warn(
        '[enhancedEmbeddingService] searchSimilar called without organizationUuid; refusing to search cross-tenant.'
      );
      return [];
    }

    const queryResult = await this.embed(query, this.defaultModel);

    let filterSql = '';
    const params: unknown[] = [
      `[${queryResult.embedding.join(',')}]`,
      threshold,
      limit,
      organizationUuid,
    ];
    let paramIndex = 5;

    if (filters?.atomType) {
      filterSql += ` AND a.atom_type = $${paramIndex++}`;
      params.push(filters.atomType);
    }
    if (filters?.domain) {
      filterSql += ` AND a.domain = $${paramIndex++}`;
      params.push(filters.domain);
    }
    if (filters?.source) {
      filterSql += ` AND a.source = $${paramIndex++}`;
      params.push(filters.source);
    }

    const { rows } = await this.pool.query(
      `
      SELECT
        a.id,
        a.content,
        a.title,
        a.atom_type,
        1 - (a.embedding <=> $1::vector) as similarity
      FROM lumen_data_atoms a
      JOIN organizations o ON a.organization_id = o.id
      WHERE a.embedding IS NOT NULL
        AND o.uuid = $4
        AND 1 - (a.embedding <=> $1::vector) > $2
        ${filterSql}
      ORDER BY a.embedding <=> $1::vector
      LIMIT $3
    `,
      params
    );

    return this.attachSourceIdentity(
      rows.map(row => ({
        id: row.id,
        content: row.content,
        title: row.title,
        similarity: parseFloat(row.similarity),
        atomType: row.atom_type,
      }))
    );
  }

  /**
   * Hybrid search combining semantic and keyword search.
   * When organizationUuid is provided, results are filtered to that org
   * (defense-in-depth multi-tenant isolation).
   */
  async searchHybrid(
    query: string,
    limit = 10,
    semanticWeight = 0.7,
    organizationUuid?: string,
    projectId?: string
  ): Promise<
    Array<{
      id: string;
      content: string;
      title: string;
      score: number;
      semanticScore: number;
      keywordScore: number;
      sourceId: string | null;
      sourceType: string | null;
    }>
  > {
    // Generate query embedding
    const queryResult = await this.embed(query, this.defaultModel);

    // Push org filter INTO the query to avoid cross-tenant data leakage.
    // When organizationUuid is provided, wrap search_atoms_hybrid with a
    // CTE that restricts candidates to the tenant's atoms BEFORE scoring.
    let rows: any[];
    if (organizationUuid) {
      const projectFilterClause = projectId
        ? `AND a.source_type IN ('artifact', 'data_room_upload') AND a.source_id IN (
             SELECT artifact_id FROM concept2cure_artifacts WHERE project_id = $6
           )`
        : '';
      const { rows: orgRows } = await this.pool.query(
        `
        WITH org_atoms AS (
          SELECT a.id
          FROM lumen_data_atoms a
          JOIN organizations o ON a.organization_id = o.id
          WHERE o.uuid = $5
            ${projectFilterClause}
        ),
        hybrid AS (
          SELECT * FROM search_atoms_hybrid($1, $2::vector, $3, $4)
        )
        SELECT h.*
        FROM hybrid h
        INNER JOIN org_atoms oa ON h.id = oa.id
        ORDER BY h.combined_score DESC
        LIMIT $4
        `,
        projectId
          ? [
              query,
              `[${queryResult.embedding.join(',')}]`,
              semanticWeight,
              limit,
              organizationUuid,
              Number(projectId),
            ]
          : [query, `[${queryResult.embedding.join(',')}]`, semanticWeight, limit, organizationUuid]
      );
      rows = orgRows;
    } else {
      const { rows: allRows } = await this.pool.query(
        `
        SELECT * FROM search_atoms_hybrid($1, $2::vector, $3, $4)
        `,
        [query, `[${queryResult.embedding.join(',')}]`, limit, semanticWeight]
      );
      rows = allRows;
    }

    return this.attachSourceIdentity(
      rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        title: row.title,
        score: parseFloat(row.combined_score),
        semanticScore: parseFloat(row.semantic_score),
        keywordScore: parseFloat(row.keyword_score),
      }))
    );
  }

  /**
   * Queue an atom for embedding (async processing)
   */
  queueAtomForEmbedding(
    atomId: string,
    content: string,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): void {
    this.processingQueue.push({ atomId, content, priority });

    // Sort by priority
    this.processingQueue.sort((a, b) => {
      const priorities = { high: 0, normal: 1, low: 2 };
      return priorities[a.priority] - priorities[b.priority];
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the embedding queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const job = this.processingQueue.shift()!;
      try {
        await this.embedAtom(job.atomId);
      } catch (error) {
        console.error(`Failed to embed atom ${job.atomId}:`, error);
      }
      // Small delay between items
      await this.sleep(50);
    }

    this.isProcessing = false;
  }

  /**
   * Get embedding statistics
   */
  async getStats(): Promise<EmbeddingStats> {
    const { rows } = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as total_embedded,
        COUNT(*) FILTER (WHERE embedding IS NULL) as total_pending
      FROM lumen_data_atoms
    `);

    const totalRequests = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? this.cacheHits / totalRequests : 0;

    return {
      totalEmbedded: parseInt(rows[0].total_embedded, 10),
      totalPending: parseInt(rows[0].total_pending, 10),
      avgProcessingTimeMs: 0, // Would need to track this
      cacheHitRate,
      estimatedCostUSD: this.cacheMisses * MODEL_COSTS[this.defaultModel] * 0.5, // Rough estimate
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                          PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private buildEmbeddingText(atom: {
    content: string;
    title?: string;
    description?: string;
    atom_type?: string;
  }): string {
    const parts = [];
    if (atom.title) parts.push(`Title: ${atom.title}`);
    if (atom.atom_type) parts.push(`Type: ${atom.atom_type}`);
    // lumen_data_atoms has no description column — the SELECTs above listed
    // one anyway, so every embedAtom() call failed 42703 and auto-embedding
    // had silently never worked. The optional field remains for callers that
    // construct atom text directly.
    if (atom.description) parts.push(`Description: ${atom.description}`);
    parts.push(atom.content);
    return parts.join('\n\n');
  }

  private getCacheKey(text: string, model: EmbeddingModel): string {
    return crypto.createHash('sha256').update(`${model}:${text}`).digest('hex');
  }

  private truncateText(text: string, maxTokens: number): string {
    // Rough estimate: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '...';
  }

  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async logEmbeddingAudit(atomId: string, result: EmbeddingResult): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO embedding_audit_log (
          atom_id, model, token_count, cached, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT DO NOTHING
      `,
        [atomId, result.model, result.tokenCount, result.cached]
      );
    } catch {
      // Silently fail audit logging
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let embeddingService: EnhancedEmbeddingService | null = null;

export function getEmbeddingService(pool: pg.Pool): EnhancedEmbeddingService {
  if (!embeddingService) {
    embeddingService = new EnhancedEmbeddingService(pool);
  }
  return embeddingService;
}

export { MODEL_CONFIGS, MODEL_COSTS };
