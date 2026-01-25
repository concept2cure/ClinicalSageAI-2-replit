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
 * @author TrialSage AI Team
 * @version 2.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import OpenAI from 'openai';
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
  private openai: OpenAI;
  private pool: pg.Pool;
  private defaultModel: EmbeddingModel = 'text-embedding-3-small';
  private embeddingCache: Map<string, number[]> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;
  private processingQueue: AtomEmbeddingJob[] = [];
  private isProcessing = false;

  constructor(pool: pg.Pool) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for embedding service');
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

    const response = await this.openai.embeddings.create({
      model,
      input: truncatedText,
      dimensions: MODEL_CONFIGS[model].dimensions,
    });

    const embedding = response.data[0].embedding;
    const tokenCount = response.usage.total_tokens;

    // Cache the result
    this.embeddingCache.set(cacheKey, embedding);

    // Limit cache size
    if (this.embeddingCache.size > 10000) {
      const firstKey = this.embeddingCache.keys().next().value;
      this.embeddingCache.delete(firstKey);
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
          const response = await this.openai.embeddings.create({
            model,
            input: truncatedBatch,
            dimensions: config.dimensions,
          });

          for (let j = 0; j < batch.length; j++) {
            const embedding = response.data[j].embedding;
            const cacheKey = this.getCacheKey(truncatedBatch[j], model);
            this.embeddingCache.set(cacheKey, embedding);

            results.push({
              text: truncatedBatch[j],
              embedding,
              model,
              tokenCount: Math.ceil(response.usage.total_tokens / batch.length),
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
        id, content, title, description, atom_type,
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
        SELECT id, content, title, description, atom_type
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
   * Semantic search for similar atoms
   */
  async searchSimilar(
    query: string,
    limit = 10,
    threshold = 0.7,
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
    }>
  > {
    // Generate query embedding
    const queryResult = await this.embed(query, this.defaultModel);

    // Build filter conditions
    let filterSql = '';
    const params: unknown[] = [`[${queryResult.embedding.join(',')}]`, threshold, limit];
    let paramIndex = 4;

    if (filters?.atomType) {
      filterSql += ` AND atom_type = $${paramIndex++}`;
      params.push(filters.atomType);
    }
    if (filters?.domain) {
      filterSql += ` AND domain = $${paramIndex++}`;
      params.push(filters.domain);
    }
    if (filters?.source) {
      filterSql += ` AND source = $${paramIndex++}`;
      params.push(filters.source);
    }

    const { rows } = await this.pool.query(
      `
      SELECT
        id,
        content,
        title,
        atom_type,
        1 - (embedding <=> $1::vector) as similarity
      FROM lumen_data_atoms
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) > $2
        ${filterSql}
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `,
      params
    );

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      title: row.title,
      similarity: parseFloat(row.similarity),
      atomType: row.atom_type,
    }));
  }

  /**
   * Hybrid search combining semantic and keyword search
   */
  async searchHybrid(
    query: string,
    limit = 10,
    semanticWeight = 0.7
  ): Promise<
    Array<{
      id: string;
      content: string;
      title: string;
      score: number;
      semanticScore: number;
      keywordScore: number;
    }>
  > {
    // Generate query embedding
    const queryResult = await this.embed(query, this.defaultModel);

    // Use the database hybrid search function
    const { rows } = await this.pool.query(
      `
      SELECT * FROM search_atoms_hybrid($1, $2::vector, $3, $4)
    `,
      [query, `[${queryResult.embedding.join(',')}]`, limit, semanticWeight]
    );

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      title: row.title,
      score: parseFloat(row.combined_score),
      semanticScore: parseFloat(row.semantic_score),
      keywordScore: parseFloat(row.keyword_score),
    }));
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
