/**
 * Vault document chunking — the writer for the passage store the RAG reader
 * queries (vault.document_chunks; see advancedRAGPipeline's vault corpus).
 *
 * Replaces server/workers/vectorization-worker.ts, which was unreferenced dead
 * code: it read a column the canonical shape never had (content_text), drained
 * a queue nothing enqueues, and embedded through a direct OpenAI client
 * instead of the governed provider seam. This service is invoked inline from
 * vault ingest (flag-gated), embeds through getEmbeddingService, and writes
 * chunks all-or-nothing:
 *
 *   • chunkExtractedText — pure, deterministic paragraph-aware splitting with
 *     exact [charStart, charEnd) spans and bounded overlap, so a chunk can
 *     always be traced back to its place in the extracted text.
 *   • chunkAndEmbedDocument — embeds every chunk, then DELETE + INSERT inside
 *     one transaction. There is no partially indexed document: an embedding
 *     or write failure leaves the prior state and the caller records the
 *     failure in the catalog's chunking ledger (chunk_status/chunk_error), so
 *     "not retrievable" is always a stated fact, never a silent gap.
 *
 * Fails closed on oversized documents (beyond MAX_CHUNKS) instead of indexing
 * a truncated prefix that would present partial retrieval as coverage.
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { FeatureToggleService } from '../featureToggleService.js';

const logger = createScopedLogger('document-chunking');

/** Tenant-scoped toggle key (off by default, fails closed). */
export const VAULT_CHUNKING_FEATURE_KEY = 'ana.vault_chunking';

export async function isVaultChunkingEnabled(organizationId?: number | null): Promise<boolean> {
  if (process.env.ANA_VAULT_CHUNKING_FORCE_ON === 'true') return true;
  return FeatureToggleService.isFeatureEnabled(VAULT_CHUNKING_FEATURE_KEY, organizationId ?? undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure chunker
// ─────────────────────────────────────────────────────────────────────────────

export interface TextChunk {
  index: number;
  text: string;
  /** Exact half-open span over the extracted text this chunk was cut from. */
  charStart: number;
  charEnd: number;
}

export interface ChunkOptions {
  /** Target maximum characters per chunk (~1000 tokens at 4 chars/token). */
  maxChars?: number;
  /** Characters of trailing context repeated at the head of the next chunk. */
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_OVERLAP = 400;
/** Beyond this the document is refused for chunking (fail closed, not truncate). */
export const MAX_CHUNKS = 500;

/**
 * Split extracted text into overlapping chunks on paragraph boundaries where
 * possible. Deterministic; spans are exact so `text.slice(charStart, charEnd)`
 * reproduces every chunk (the overlap prefix is context, carried inside the
 * span of the PREVIOUS chunk it repeats).
 */
export function chunkExtractedText(text: string, opts: ChunkOptions = {}): TextChunk[] {
  const maxChars = Math.max(500, opts.maxChars ?? DEFAULT_MAX_CHARS);
  const overlap = Math.min(Math.max(0, opts.overlapChars ?? DEFAULT_OVERLAP), Math.floor(maxChars / 2));
  const len = text.length;
  if (len === 0) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < len) {
    let end = Math.min(len, start + maxChars);
    if (end < len) {
      // Prefer to break at a paragraph, then a sentence, then a word — looking
      // back only within the second half of the chunk so a pathological text
      // with no boundaries still advances.
      const windowStart = start + Math.floor(maxChars / 2);
      const slice = text.slice(windowStart, end);
      const para = slice.lastIndexOf('\n\n');
      const sentence = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'));
      const word = slice.lastIndexOf(' ');
      const cut = para >= 0 ? para + 2 : sentence >= 0 ? sentence + 2 : word >= 0 ? word + 1 : -1;
      if (cut >= 0) end = windowStart + cut;
    }
    chunks.push({ index: chunks.length, text: text.slice(start, end), charStart: start, charEnd: end });
    if (end >= len) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Embed + write
// ─────────────────────────────────────────────────────────────────────────────

export interface ChunkWriteResult {
  ok: boolean;
  chunkCount: number;
  error?: string;
}

const EMBED_BATCH = 64;
const CHUNK_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Chunk the document's extracted text, embed every chunk through the governed
 * provider seam, and replace the document's chunk set in one transaction.
 * Returns a failure (with reason) instead of throwing; the caller records it
 * in the catalog ledger either way.
 */
export async function chunkAndEmbedDocument(args: {
  documentId: string;
  text: string;
}): Promise<ChunkWriteResult> {
  const chunks = chunkExtractedText(args.text);
  if (chunks.length === 0) {
    return { ok: false, chunkCount: 0, error: 'No extracted text to chunk.' };
  }
  if (chunks.length > MAX_CHUNKS) {
    return {
      ok: false,
      chunkCount: 0,
      error:
        `Document produces ${chunks.length} chunks (limit ${MAX_CHUNKS}); refusing to index a ` +
        'truncated prefix as if it were the document.',
    };
  }

  let vectors: string[];
  try {
    const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
    const svc = getEmbeddingService(pool as any);
    vectors = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const results = await svc.embedBatch(batch.map(c => c.text), CHUNK_EMBEDDING_MODEL);
      for (let j = 0; j < batch.length; j++) {
        const e = results[j]?.embedding;
        if (!e) throw new Error(`embedding missing for chunk ${i + j}`);
        vectors.push(`[${e.join(',')}]`);
      }
    }
  } catch (err) {
    return {
      ok: false,
      chunkCount: 0,
      error: `Embedding failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM vault.document_chunks WHERE document_id = $1`, [args.documentId]);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await client.query(
        `INSERT INTO vault.document_chunks
           (document_id, chunk_index, chunk_text, char_start, char_end,
            embedding, embedding_model, token_count, vectorized_at)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, NOW())`,
        [
          args.documentId,
          c.index,
          c.text,
          c.charStart,
          c.charEnd,
          vectors[i],
          CHUNK_EMBEDDING_MODEL,
          Math.ceil(c.text.length / 4),
        ],
      );
    }
    await client.query('COMMIT');
    return { ok: true, chunkCount: chunks.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return {
      ok: false,
      chunkCount: 0,
      error: `Chunk write failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    client.release();
  }
}

/** Record the chunking outcome on the document's catalog ledger. */
export async function recordChunkOutcome(args: {
  documentId: string;
  result: ChunkWriteResult;
}): Promise<void> {
  await pool.query(
    `UPDATE vault.document_catalog SET
       chunk_status = $2, chunk_count = $3, chunk_error = $4, updated_at = NOW()
     WHERE document_id = $1`,
    [
      args.documentId,
      args.result.ok ? 'chunked' : 'chunk_failed',
      args.result.ok ? args.result.chunkCount : null,
      args.result.error ?? null,
    ],
  );
}

/**
 * The ingest hook: chunk + embed + record, never throwing — an upload must not
 * fail because its retrieval index could not be built, but the ledger must say
 * exactly what happened.
 */
export async function chunkDocumentForIngest(documentId: string, text: string): Promise<void> {
  try {
    const result = await chunkAndEmbedDocument({ documentId, text });
    await recordChunkOutcome({ documentId, result });
    if (!result.ok) {
      logger.warn('Vault chunking failed — recorded on the catalog ledger', {
        documentId,
        error: result.error,
      });
    }
  } catch (err) {
    logger.error('Vault chunking hook failed past its own recording', {
      documentId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
