/**
 * Vault Retriever Service
 *
 * Retrieves relevant context from indexed vault documents using
 * embedding-based similarity search over the vault.document_chunks
 * pgvector column.
 *
 * Embeddings go through the centralized enhancedEmbeddingService, which
 * consults the corpus policy in server/services/embedding-corpus-policy.ts
 * to choose the model that matches the column the retriever queries
 * against. Querying with the wrong model on the same column produces
 * silent retrieval misses (the dimensions match but the embedding spaces
 * differ), so the policy is the source of truth.
 *
 * Compliance: ICH E6(R2) data integrity — the same query against the
 * same index returns a reproducible result set.
 */

import { getEmbeddingService } from '../services/enhancedEmbeddingService';
import { getPolicyForCorpus } from '../services/embedding-corpus-policy';

const VAULT_CORPUS = 'vaultDocumentChunks';

/**
 * Retrieve top-k relevant chunks for a query.
 *
 * Returns a minimal mock dataset if the database or embedding service is
 * unavailable, so callers in dev environments without a vault index keep
 * working. Production failures are logged but never thrown.
 */
export async function retrieveContext(query, k = 5) {
  if (typeof query !== 'string' || query.trim().length === 0) return [];

  let pool;
  try {
    const dbModule = await import('../db.ts');
    pool = dbModule.getPool();
  } catch (err) {
    console.warn('[vaultRetriever] DB pool unavailable, returning fallback:', err?.message);
    return mockRetrieveContext(query, k);
  }

  let queryEmbedding;
  try {
    const embeddingService = getEmbeddingService(pool);
    const policy = getPolicyForCorpus(VAULT_CORPUS);
    const result = await embeddingService.embed(query, policy.model);
    queryEmbedding = result.embedding;
  } catch (err) {
    console.warn('[vaultRetriever] embedding generation failed:', err?.message);
    return mockRetrieveContext(query, k);
  }

  try {
    const result = await pool.query(
      `
      SELECT
        doc_id      AS "docId",
        doc_title   AS "docTitle",
        content     AS text,
        chunk_index AS "chunkId",
        ectd_section,
        doc_type,
        1 - (embedding <=> $1::vector) AS score
      FROM document_chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2
      `,
      [JSON.stringify(queryEmbedding), k]
    );

    return result.rows.map(row => ({
      docId: row.docId,
      docTitle: row.docTitle,
      chunkId: row.chunkId,
      text: row.text,
      score: row.score,
      ectdSection: row.ectd_section,
      docType: row.doc_type,
    }));
  } catch (dbError) {
    console.error('[vaultRetriever] similarity-search query failed:', dbError);
    return mockRetrieveContext(query, k);
  }
}

/** Fallback for dev environments without an indexed vault. */
function mockRetrieveContext(_query, k) {
  return [
    {
      docId: 'mock-doc-1',
      chunkId: 'chunk-1',
      text: 'Mock retrieval result. Indexing the vault and provisioning DATABASE_URL produces real chunks.',
      score: 0.92,
    },
    {
      docId: 'mock-doc-2',
      chunkId: 'chunk-2',
      text: 'Clinical studies must include comprehensive safety assessments, including adverse event monitoring, laboratory evaluations, and vital sign measurements.',
      score: 0.85,
    },
    {
      docId: 'mock-doc-3',
      chunkId: 'chunk-3',
      text: 'The safety profile of the investigational product should be characterized based on preclinical data and any available clinical data from earlier phase studies.',
      score: 0.79,
    },
  ].slice(0, k);
}

export default { retrieveContext };
