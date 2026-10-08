/**
 * Vault document chunking — the writer for the passage store the RAG reader
 * queries (vault.document_chunks; see advancedRAGPipeline's vault corpus).
 *
 * Replaces server/workers/vectorization-worker.ts, which was unreferenced dead
 * code: it read a column the canonical shape never had (content_text), drained
 * a queue nothing enqueues, and embedded through a direct OpenAI client
 * instead of the governed provider seam. This service is invoked inline from
 * every vault ingest, embeds through getEmbeddingService when the tenant has
 * passage embedding on and a provider answers (otherwise the chunks are found
 * by text alone, 2026-10-08), and writes chunks all-or-nothing:
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
import { vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { getTenantScope, runWithTenantScope, type TenantScope } from '../../db/tenantStore.js';
import { createScopedLogger } from '../../utils/logger.js';
import { FeatureToggleService } from '../featureToggleService.js';
import { pageForOffset, type PageSpan } from '../ocr/page-offsets.js';

const logger = createScopedLogger('document-chunking');

/**
 * Tenant-scoped toggle key (off by default, fails closed). Since 2026-10-08 it
 * decides only whether passages are EMBEDDED (their text sent to the embedding
 * provider). The passages themselves are written at every ingest and found by
 * text search, with no key.
 */
export const VAULT_CHUNKING_FEATURE_KEY = 'ana.vault_chunking';

export async function isVaultChunkingEnabled(organizationId?: number | null): Promise<boolean> {
  if (process.env.ANA_VAULT_CHUNKING_FORCE_ON === 'true') return true;
  return FeatureToggleService.isFeatureEnabled(VAULT_CHUNKING_FEATURE_KEY, organizationId ?? undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure chunker
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentTextChunk {
  index: number;
  text: string;
  /** Exact half-open span over the extracted text this chunk was cut from. */
  charStart: number;
  charEnd: number;
}

export interface DocumentChunkOptions {
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
export function chunkExtractedText(text: string, opts: DocumentChunkOptions = {}): DocumentTextChunk[] {
  const maxChars = Math.max(500, opts.maxChars ?? DEFAULT_MAX_CHARS);
  const overlap = Math.min(Math.max(0, opts.overlapChars ?? DEFAULT_OVERLAP), Math.floor(maxChars / 2));
  const len = text.length;
  if (len === 0) return [];

  const chunks: DocumentTextChunk[] = [];
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
  /**
   * Whether the chunks carry embeddings. False when no embedder would embed
   * them (no key, or the tenant's placement policy refuses egress): the
   * chunks are still written, and the full-text index on chunk_text finds
   * them. Undefined on failure.
   */
  embedded?: boolean;
  /**
   * Why the chunks carry no embedding, when a provider was asked and failed.
   * Absent when embedding is off for the organization: nothing was asked.
   * Recorded on the ledger's chunk_error so the backfill does not re-spend on
   * it unless a retry is asked for.
   */
  embeddingError?: string;
}

/** The document's file access was withdrawn mid-index: a refusal, never a reason to index without vectors. */
class IndexingWithdrawn extends Error {}

const EMBED_BATCH = 64;
const CHUNK_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Whether the document belongs to one of the organization's programs. */
async function documentIsInOrganization(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rowCount: number | null; rows: unknown[] }> },
  documentId: string,
  organizationId: number,
): Promise<boolean> {
  const owned = await client.query(
    `SELECT 1 FROM vault.documents d
       JOIN regulatory_programs p ON p.id = d.program_id
      WHERE d.id = $1 AND p.organization_id = $2
        AND ${vaultBinaryAvailableSql('d')}
      LIMIT 1`,
    [documentId, organizationId],
  );
  return (owned.rowCount ?? owned.rows.length) > 0;
}

/**
 * The tenant scope the embedding calls run under: the document's organisation,
 * verified by `documentIsInOrganization` immediately before. The embedder's
 * placement gate (`AIGateway.authorizeEmbedding`, via embedding-provider.ts)
 * reads the organisation from this scope, because the corpus runtime's
 * `embedBatch(texts, model)` has no argument to carry it. Binding it here means
 * the policy applied is the owning organisation's whatever the caller's
 * ambient scope was (a request, or the backfill's per-org job scope).
 */
function embeddingScope(organizationId: number): TenantScope {
  const outer = getTenantScope();
  return {
    tenantId: String(organizationId),
    orgUuid: outer?.orgUuid ?? null,
    role: outer?.role ?? null,
    source: outer?.source ?? 'job',
    caller: 'document-chunking:embed',
  };
}

/**
 * Every chunk's vector, through the governed provider seam, or none: a partial
 * set is never returned. A provider that will not embed (no key, egress
 * refused, down) yields `vectors: null` with the reason; the chunks are then
 * written for text search alone. Withdrawn file access is a refusal.
 */
async function embedChunks(
  chunks: DocumentTextChunk[],
  documentId: string,
  organizationId: number,
): Promise<{ vectors: string[] | null; error?: string } | { withdrawn: string }> {
  try {
    const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
    const svc = getEmbeddingService(pool as any);
    const vectors = await runWithTenantScope(embeddingScope(organizationId), async () => {
      const out: string[] = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        if (!(await documentIsInOrganization(pool, documentId, organizationId))) {
          throw new IndexingWithdrawn('Document file access was withdrawn before embedding; indexing refused.');
        }
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const results = await svc.embedBatch(batch.map(c => c.text), CHUNK_EMBEDDING_MODEL);
        for (let j = 0; j < batch.length; j++) {
          const e = results[j]?.embedding;
          if (!e) throw new Error(`embedding missing for chunk ${i + j}`);
          out.push(`[${e.join(',')}]`);
        }
      }
      return out;
    });
    return { vectors };
  } catch (err) {
    if (err instanceof IndexingWithdrawn) return { withdrawn: err.message };
    return { vectors: null, error: `Not embedded: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Chunk the document's extracted text, embed every chunk through the governed
 * provider seam when one will embed it, and replace the document's chunk set
 * in one transaction. Returns a failure (with reason) instead of throwing; the
 * caller records it in the catalog ledger either way.
 *
 * KEYLESS (2026-10-08): an embedder that cannot embed (no key, egress refused,
 * provider down) used to leave ZERO chunks, so a deployment without an AI key
 * had no passage index at all, though vault.document_chunks carries a
 * full-text index on chunk_text. Now the chunks are written without
 * embeddings, all or none: a partial set of vectors is never kept, so the
 * meaning-based arm never ranks half a document. The passages are found by
 * text search (advancedRAGPipeline vaultLexicalArm).
 */
export async function chunkAndEmbedDocument(args: {
  documentId: string;
  /** The caller's organization; the document must belong to one of its programs. */
  organizationId: number;
  text: string;
  /**
   * Verified page boundaries in `text`, from the extractor (ocr/page-offsets.ts).
   * Each chunk is stamped with the page its first character falls on, so a
   * retrieved passage can cite "p.41" — something a reviewer can turn to —
   * instead of a character range nobody can check against the file.
   * Absent for a format with no pages, and for a PDF whose pages could not be
   * located in the combined text: then `page_number` stays NULL, which reads
   * as "unknown", which is true. A guessed page would read as checked.
   */
  pageSpans?: PageSpan[];
  /** Embed the chunks (default true). False writes them for text search only, sending nothing out. */
  embed?: boolean;
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

  // Ownership BEFORE egress (P0-11 / DP-07). The write below refused a foreign
  // document, but only after its text had already been embedded — sent to the
  // configured provider under THIS caller's placement policy. A document id
  // from another organization must be refused before anything leaves.
  if (!(await documentIsInOrganization(pool, args.documentId, args.organizationId))) {
    return {
      ok: false,
      chunkCount: 0,
      error: 'Document is not in the caller\'s organization; refusing to index it.',
    };
  }

  const embedding = args.embed === false
    ? { vectors: null }
    : await embedChunks(chunks, args.documentId, args.organizationId);
  if ('withdrawn' in embedding) return { ok: false, chunkCount: 0, error: embedding.withdrawn };
  const { vectors } = embedding;
  const embeddingError = embedding.error;

  // vault.documents carries no organization_id; a document belongs to a tenant
  // through its program (regulatory_programs.organization_id), which is also
  // what the table's RLS policies resolve. Every statement below reaches the
  // chunk table only through that join, so a document id from another
  // organization matches nothing. The ownership check is repeated inside the
  // transaction so the write is refused on its own evidence, not on the
  // pre-embedding check's.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await documentIsInOrganization(client, args.documentId, args.organizationId))) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        chunkCount: 0,
        error: 'Document is not in the caller\'s organization; refusing to index it.',
      };
    }
    await client.query(
      `DELETE FROM vault.document_chunks c
        USING vault.documents d
         JOIN regulatory_programs p ON p.id = d.program_id
        WHERE c.document_id = d.id AND d.id = $1 AND p.organization_id = $2`,
      [args.documentId, args.organizationId],
    );
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      // Without a vector, the embedding columns are left out: the chunk is
      // found by text, and a database without pgvector accepts the row.
      const vec = vectors?.[i] ?? null;
      const inserted = await client.query(
        `INSERT INTO vault.document_chunks
           (document_id, chunk_index, chunk_text, char_start, char_end,
            page_number, ${vec ? 'embedding, ' : ''}embedding_model, token_count, vectorized_at)
         SELECT d.id, $2, $3, $4, $5, $6, ${vec ? '$10::vector, ' : ''}$7, $8, ${vec ? 'NOW()' : 'NULL'}
           FROM vault.documents d
           JOIN regulatory_programs p ON p.id = d.program_id
          WHERE d.id = $1 AND p.organization_id = $9`,
        [
          args.documentId,
          c.index,
          c.text,
          c.charStart,
          c.charEnd,
          pageForOffset(args.pageSpans, c.charStart),
          vec ? CHUNK_EMBEDDING_MODEL : null,
          Math.ceil(c.text.length / 4),
          args.organizationId,
          ...(vec ? [vec] : []),
        ],
      );
      if ((inserted.rowCount ?? 0) !== 1) {
        throw new Error(`chunk ${c.index} matched no document in organization ${args.organizationId}`);
      }
    }
    await client.query('COMMIT');
    return { ok: true, chunkCount: chunks.length, embedded: vectors !== null, ...(embeddingError ? { embeddingError } : {}) };
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

/**
 * Record the chunking outcome on the document's catalog ledger.
 *
 * Reaches the row through the same program → organization join the chunk
 * writer uses. Keyed on document_id alone this wrote ACROSS tenants on the one
 * path that most needed it: when the writer refuses a foreign document, the
 * refusal itself was stamped onto that other tenant's catalog row — flipping
 * their chunk_status to 'chunk_failed' and leaving them an error about an
 * organization that is not theirs. A refusal must leave their record untouched.
 */
export async function recordChunkOutcome(args: {
  documentId: string;
  /** The caller's organization; the document must belong to one of its programs. */
  organizationId: number;
  result: ChunkWriteResult;
}): Promise<void> {
  await pool.query(
    `UPDATE vault.document_catalog c SET
       chunk_status = $2, chunk_count = $3, chunk_error = $4, updated_at = NOW()
      FROM vault.documents d
      JOIN regulatory_programs p ON p.id = d.program_id
     WHERE c.document_id = d.id AND d.id = $1 AND p.organization_id = $5`,
    [
      args.documentId,
      args.result.ok ? 'chunked' : 'chunk_failed',
      args.result.ok ? args.result.chunkCount : null,
      // On success, a provider's refusal to embed: indexed for text, not for meaning.
      args.result.error ?? args.result.embeddingError ?? null,
      args.organizationId,
    ],
  );
}

/**
 * The ingest hook: chunk + embed + record, never throwing — an upload must not
 * fail because its retrieval index could not be built, but the ledger must say
 * exactly what happened.
 */
export async function chunkDocumentForIngest(
  documentId: string,
  organizationId: number,
  text: string,
  pageSpans?: PageSpan[],
  opts: { embed?: boolean } = {},
): Promise<void> {
  try {
    const result = await chunkAndEmbedDocument({ documentId, organizationId, text, pageSpans, embed: opts.embed });
    await recordChunkOutcome({ documentId, organizationId, result });
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
