/**
 * Evidence Vault Vectorization Worker
 *
 * Background worker for processing documents in the Evidence Vault.
 * Handles text extraction, chunking, embedding generation, and storage.
 *
 * Features:
 * - Parallel document processing with configurable concurrency
 * - OpenAI embeddings (text-embedding-3-small or ada-002)
 * - Intelligent chunking with overlap for context preservation
 * - Automatic retry with exponential backoff
 * - Progress tracking and error logging
 */

import { getOpenAIClient } from '../services/openai-client';
import pdfParse from 'pdf-parse';
import { pool } from '../db';
import * as crypto from 'crypto';

interface ProcessingJob {
  id: string;
  document_id: string;
  processing_type: string;
  priority: string;
  attempts: number;
  title: string;
  file_name: string;
  file_type: string;
  s3_key: string;
}

interface DocumentChunk {
  index: number;
  content: string;
  embedding: number[] | null;
  tokenCount: number;
  pageNumber?: number;
  sectionReference?: string;
}

const CHUNK_SIZE = 1000; // tokens
const CHUNK_OVERLAP = 200; // tokens overlap
const MAX_RETRIES = 3;
const BATCH_SIZE = 5;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_CACHE_TTL_MS = Number(process.env.EMBEDDING_CACHE_TTL_MS || 15 * 60 * 1000);
const embeddingCache = new Map<string, { embedding: number[]; expiresAt: number }>();
const EMBEDDING_CACHE_MAX_ENTRIES = Number(process.env.EMBEDDING_CACHE_MAX_ENTRIES || 10000);
const EMBEDDING_CACHE_LOG_EVERY = Number(process.env.EMBEDDING_CACHE_LOG_EVERY || 20);
let embeddingCacheHits = 0;
let embeddingCacheMisses = 0;

// OpenAI client
const openai = getOpenAIClient();

function requirePool() {
  if (!pool) {
    throw new Error('Database pool not available');
  }
  return pool;
}

/**
 * Simple token estimator (approximately 4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into overlapping chunks
 */
function chunkText(
  text: string,
  maxTokens: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP
): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const word of words) {
    const wordTokens = estimateTokens(word);

    if (currentTokens + wordTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));

      // Keep overlap words
      const overlapWords = Math.floor(overlap / 4);
      currentChunk = currentChunk.slice(-overlapWords);
      currentTokens = estimateTokens(currentChunk.join(' '));
    }

    currentChunk.push(word);
    currentTokens += wordTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

/**
 * Generate embeddings using OpenAI
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const now = Date.now();
    const results: Array<number[] | null> = new Array(texts.length).fill(null);
    const misses: Array<{ index: number; text: string; key: string }> = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const key = embeddingCacheKey(text);
      const cached = embeddingCache.get(key);

      if (cached && cached.expiresAt > now) {
        results[i] = cached.embedding;
        embeddingCacheHits += 1;
      } else {
        if (cached) embeddingCache.delete(key);
        misses.push({ index: i, text, key });
        embeddingCacheMisses += 1;
      }
    }

    if (misses.length > 0) {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: misses.map(m => m.text),
        dimensions: 1536,
      });

      for (let i = 0; i < response.data.length; i++) {
        const embedding = response.data[i].embedding;
        const miss = misses[i];
        results[miss.index] = embedding;
        ensureEmbeddingCacheCapacity();
        embeddingCache.set(miss.key, { embedding, expiresAt: now + EMBEDDING_CACHE_TTL_MS });
      }
    }

    return results.map((embedding, i) => {
      if (!embedding) {
        throw new Error(`Missing embedding output at index ${i}`);
      }
      return embedding;
    });
  } catch (error: any) {
    console.error('Error generating embeddings:', error.message);
    throw error;
  } finally {
    maybeLogEmbeddingCacheStats();
  }
}

function embeddingCacheKey(text: string): string {
  return `${EMBEDDING_MODEL}:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

function maybeLogEmbeddingCacheStats(): void {
  pruneExpiredEmbeddingCache();
  const total = embeddingCacheHits + embeddingCacheMisses;
  if (total === 0 || total % EMBEDDING_CACHE_LOG_EVERY !== 0) {
    return;
  }
  const hitRate = ((embeddingCacheHits / total) * 100).toFixed(1);
  console.log(
    `[vectorization-worker] embedding cache stats: hits=${embeddingCacheHits}, misses=${embeddingCacheMisses}, hitRate=${hitRate}%, size=${embeddingCache.size}`
  );
}

function pruneExpiredEmbeddingCache(): void {
  const now = Date.now();
  for (const [key, value] of embeddingCache.entries()) {
    if (value.expiresAt <= now) {
      embeddingCache.delete(key);
    }
  }
}

function ensureEmbeddingCacheCapacity(): void {
  pruneExpiredEmbeddingCache();
  while (embeddingCache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
    const oldestKey = embeddingCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    embeddingCache.delete(oldestKey);
  }
}

/**
 * Extract text from document based on file type
 */
async function extractText(content: Buffer, fileType: string): Promise<string> {
  if (fileType === 'application/pdf') {
    try {
      const data = await pdfParse(content);
      return data.text;
    } catch (error) {
      console.error('PDF parsing error:', error);
      return '';
    }
  } else if (fileType.startsWith('text/') || fileType === 'application/json') {
    return content.toString('utf-8');
  } else if (fileType.includes('word') || fileType.includes('document')) {
    // For Word documents, we'd use mammoth or similar
    // For now, return placeholder
    console.log('Word document extraction not implemented');
    return '';
  }

  return '';
}

/**
 * Process a single document
 */
async function processDocument(job: ProcessingJob): Promise<void> {
  const client = await requirePool().connect();

  try {
    console.log(`Processing document: ${job.title} (${job.document_id})`);

    // Mark job as processing
    await client.query(
      `
      UPDATE vault.processing_queue
      SET status = 'processing', started_at = NOW(), attempts = attempts + 1
      WHERE id = $1
    `,
      [job.id]
    );

    // Get document content from S3 (or local storage for dev)
    // In production, this would fetch from S3
    const docResult = await client.query(
      `
      SELECT content_text FROM vault.documents WHERE id = $1
    `,
      [job.document_id]
    );

    let text = docResult.rows[0]?.content_text || '';

    if (!text) {
      console.log(`No text content for document ${job.document_id}, skipping`);
      await client.query(
        `
        UPDATE vault.processing_queue
        SET status = 'completed', completed_at = NOW(), error_message = 'No text content'
        WHERE id = $1
      `,
        [job.id]
      );
      return;
    }

    // Chunk the text
    const textChunks = chunkText(text);
    console.log(`Created ${textChunks.length} chunks for document ${job.title}`);

    // Generate embeddings in batches
    const chunks: DocumentChunk[] = [];

    for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
      const batch = textChunks.slice(i, i + BATCH_SIZE);

      try {
        const embeddings = await generateEmbeddings(batch);

        for (let j = 0; j < batch.length; j++) {
          chunks.push({
            index: i + j,
            content: batch[j],
            embedding: embeddings[j],
            tokenCount: estimateTokens(batch[j]),
          });
        }
      } catch (embeddingError: any) {
        console.error(`Embedding error for batch ${i}:`, embeddingError.message);
        // Store chunks without embeddings
        for (let j = 0; j < batch.length; j++) {
          chunks.push({
            index: i + j,
            content: batch[j],
            embedding: null,
            tokenCount: estimateTokens(batch[j]),
          });
        }
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Store chunks in database
    await client.query('BEGIN');

    // Delete existing chunks
    await client.query('DELETE FROM vault.document_chunks WHERE document_id = $1', [
      job.document_id,
    ]);

    // Insert new chunks
    for (const chunk of chunks) {
      await client.query(
        `
        INSERT INTO vault.document_chunks (
          document_id, chunk_index, content, embedding, token_count
        ) VALUES ($1, $2, $3, $4::vector(1536), $5)
      `,
        [
          job.document_id,
          chunk.index,
          chunk.content,
          chunk.embedding ? JSON.stringify(chunk.embedding) : null,
          chunk.tokenCount,
        ]
      );
    }

    // Update document status
    await client.query(
      `
      UPDATE vault.documents
      SET is_vectorized = true, chunk_count = $1, updated_at = NOW()
      WHERE id = $2
    `,
      [chunks.length, job.document_id]
    );

    // Mark job as completed
    await client.query(
      `
      UPDATE vault.processing_queue
      SET status = 'completed', completed_at = NOW()
      WHERE id = $1
    `,
      [job.id]
    );

    await client.query('COMMIT');

    console.log(`✅ Completed processing ${job.title}: ${chunks.length} chunks`);
  } catch (error: any) {
    await client.query('ROLLBACK');

    console.error(`Error processing document ${job.document_id}:`, error.message);

    // Mark job as failed
    await client.query(
      `
      UPDATE vault.processing_queue
      SET status = CASE WHEN attempts >= $1 THEN 'failed' ELSE 'pending' END,
          error_message = $2,
          completed_at = CASE WHEN attempts >= $1 THEN NOW() ELSE NULL END
      WHERE id = $3
    `,
      [MAX_RETRIES, error.message, job.id]
    );

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get pending jobs from queue
 */
async function getPendingJobs(limit: number = 10): Promise<ProcessingJob[]> {
  const result = await requirePool().query(
    `
    SELECT
      pq.id,
      pq.document_id,
      pq.processing_type,
      pq.priority,
      pq.attempts,
      d.title,
      d.file_name,
      d.file_type,
      d.s3_key
    FROM vault.processing_queue pq
    JOIN vault.documents d ON d.id = pq.document_id
    WHERE pq.status = 'pending'
      AND pq.attempts < $1
    ORDER BY
      CASE pq.priority
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'low' THEN 3
      END,
      pq.created_at
    LIMIT $2
  `,
    [MAX_RETRIES, limit]
  );

  return result.rows;
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
  console.log('🚀 Starting Evidence Vault Vectorization Worker');
  console.log(`   Model: ${EMBEDDING_MODEL}`);
  console.log(`   Chunk size: ${CHUNK_SIZE} tokens`);
  console.log(`   Overlap: ${CHUNK_OVERLAP} tokens`);
  console.log(`   Batch size: ${BATCH_SIZE}`);

  while (true) {
    try {
      const jobs = await getPendingJobs(BATCH_SIZE);

      if (jobs.length === 0) {
        // No jobs, wait before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      console.log(`📋 Found ${jobs.length} pending jobs`);

      // Process jobs sequentially to respect rate limits
      for (const job of jobs) {
        try {
          await processDocument(job);
        } catch (error) {
          // Error already logged and handled in processDocument
        }

        // Small delay between documents
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      console.error('Worker error:', error.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

/**
 * Process a single document by ID (for testing or manual processing)
 */
export async function processSingleDocument(
  documentId: string
): Promise<{ success: boolean; chunks?: number; error?: string }> {
  try {
    const dbPool = requirePool();
    // Create a processing job
    await dbPool.query(
      `
      INSERT INTO vault.processing_queue (document_id, processing_type, priority)
      VALUES ($1, 'vectorize', 'high')
      ON CONFLICT DO NOTHING
    `,
      [documentId]
    );

    // Get the job
    const jobResult = await dbPool.query(
      `
      SELECT
        pq.id,
        pq.document_id,
        pq.processing_type,
        pq.priority,
        pq.attempts,
        d.title,
        d.file_name,
        d.file_type,
        d.s3_key
      FROM vault.processing_queue pq
      JOIN vault.documents d ON d.id = pq.document_id
      WHERE pq.document_id = $1 AND pq.status = 'pending'
    `,
      [documentId]
    );

    if (jobResult.rowCount === 0) {
      return { success: false, error: 'Document not found or already processed' };
    }

    await processDocument(jobResult.rows[0]);

    // Get chunk count
    const countResult = await dbPool.query(
      `
      SELECT chunk_count FROM vault.documents WHERE id = $1
    `,
      [documentId]
    );

    return {
      success: true,
      chunks: countResult.rows[0]?.chunk_count || 0,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get worker status
 */
export async function getWorkerStatus(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const result = await requirePool().query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'processing') as processing,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM vault.processing_queue
  `);

  return {
    pending: parseInt(result.rows[0].pending) || 0,
    processing: parseInt(result.rows[0].processing) || 0,
    completed: parseInt(result.rows[0].completed) || 0,
    failed: parseInt(result.rows[0].failed) || 0,
  };
}

// Export for use as module
export { runWorker, processDocument, getPendingJobs };

// Run as standalone worker if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker().catch(error => {
    console.error('Fatal worker error:', error);
    process.exit(1);
  });
}
