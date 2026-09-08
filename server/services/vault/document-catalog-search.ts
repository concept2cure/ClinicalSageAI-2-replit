/**
 * Semantic search over the document catalog — "which of the client's files
 * speaks to X?", answered from the comprehension records AnA has written.
 *
 * Searches ONLY cataloged documents: the embedding indexes the comprehension
 * tier (kind + purpose + summary + key data written after a full read), so a
 * hit is a claim AnA has actually earned. Uncataloged documents are absent by
 * construction — discovery of those is list_project_documents' job, and the
 * caller is told how many exist so absence is never mistaken for "no such
 * file".
 *
 * Fails closed, never empty-on-error: an unreachable embedding provider or a
 * database without pgvector throws a CatalogSearchUnavailableError naming the
 * reason. Returning [] for those states would render "nothing matched" over
 * "we could not look", which is the exact dishonesty the catalog exists to
 * stop.
 */

import { pool } from '../../db.js';

export class CatalogSearchUnavailableError extends Error {
  constructor(reason: string) {
    super(`Semantic catalog search is unavailable: ${reason}`);
    this.name = 'CatalogSearchUnavailableError';
  }
}

export interface CatalogSearchHit {
  documentId: string;
  programId: string;
  programName: string | null;
  fileName: string;
  documentTitle: string;
  documentKind: string | null;
  purpose: string | null;
  summary: string | null;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string;
  similarity: number;
}

export interface CatalogSearchResult {
  hits: CatalogSearchHit[];
  /** Cataloged documents searched (embedding present). */
  searchedCount: number;
  /** Documents that exist but are NOT searchable yet (uncataloged / failed / unembedded). */
  unsearchableCount: number;
}

/**
 * Cosine search over vault.document_catalog.embedding, org-checked through
 * regulatory_programs like every other vault read.
 */
export async function searchCatalog(
  organizationId: number,
  query: string,
  opts: { limit?: number; minSimilarity?: number } = {},
): Promise<CatalogSearchResult> {
  const limit = Math.min(25, Math.max(1, opts.limit ?? 8));
  const minSimilarity = opts.minSimilarity ?? 0.15;

  let vectorLiteral: string;
  try {
    const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
    const { embedding } = await getEmbeddingService(pool as any).embed(query, 'text-embedding-3-small');
    vectorLiteral = `[${embedding.join(',')}]`;
  } catch (err) {
    throw new CatalogSearchUnavailableError(
      `the embedding provider could not embed the query (${err instanceof Error ? err.message : 'unknown error'})`,
    );
  }

  try {
    const counts = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE c.embedding IS NOT NULL AND c.catalog_status = 'cataloged') AS searchable,
         COUNT(*) FILTER (WHERE c.embedding IS NULL OR c.catalog_status IS DISTINCT FROM 'cataloged') AS unsearchable
       FROM vault.documents d
       JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id
      WHERE d.deleted_at IS NULL`,
      [organizationId],
    );
    const res = await pool.query(
      `SELECT d.id, d.program_id, rp.name AS program_name, d.file_name, d.document_title,
              d.folder_id, d.ctd_section, d.placement_status,
              c.document_kind, c.purpose, c.summary,
              1 - (c.embedding <=> $2::vector) AS similarity
         FROM vault.document_catalog c
         JOIN vault.documents d ON d.id = c.document_id AND d.deleted_at IS NULL
         JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1
        WHERE c.embedding IS NOT NULL AND c.catalog_status = 'cataloged'
          AND 1 - (c.embedding <=> $2::vector) >= $3
        ORDER BY c.embedding <=> $2::vector
        LIMIT $4`,
      [organizationId, vectorLiteral, minSimilarity, limit],
    );
    return {
      hits: res.rows.map((r: any) => ({
        documentId: r.id,
        programId: r.program_id,
        programName: r.program_name,
        fileName: r.file_name,
        documentTitle: r.document_title,
        documentKind: r.document_kind,
        purpose: r.purpose,
        summary: r.summary,
        folderId: r.folder_id,
        ctdSection: r.ctd_section,
        placementStatus: r.placement_status,
        similarity: Number(r.similarity),
      })),
      searchedCount: Number(counts.rows[0]?.searchable ?? 0),
      unsearchableCount: Number(counts.rows[0]?.unsearchable ?? 0),
    };
  } catch (err) {
    // 42703 = the embedding column does not exist (no pgvector on this
    // database); 42883 = the <=> operator is missing. Both mean the index,
    // not the corpus, is absent — say that.
    const code = (err as { code?: string })?.code;
    if (code === '42703' || code === '42883') {
      throw new CatalogSearchUnavailableError(
        'this database has no pgvector embedding column for the catalog',
      );
    }
    throw err;
  }
}
