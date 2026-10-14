/**
 * Semantic search over the document catalog — "which of the client's files
 * speaks to X?", answered from the comprehension records AnA has written.
 *
 * Searches ONLY current cataloged versions: the embedding indexes the comprehension
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

import { assertVerifiedProgramScope, getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, type CurrentAccessibleProgramScope } from '../c2c/current-program-access.js';
import { vaultDataEligibleSql, vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from './vault-version-family.js';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export class CatalogSearchUnavailableError extends Error {
  constructor(reason: string) {
    super(`Semantic catalog search is unavailable: ${reason}`);
    this.name = 'CatalogSearchUnavailableError';
  }
}

export interface CatalogSearchHit {
  originalFileAvailable: boolean;
  documentId: string;
  programId: string;
  programName: string | null;
  fileName: string;
  documentTitle: string;
  documentKind: string | null;
  purpose: string | null;
  summary: string | null;
  /**
   * The figures AnA recorded from the document after reading it — study ids,
   * doses, endpoints, batch numbers, dates, as the text stated them. It was
   * written, embedded into the very vector this search matches on, and then
   * left out of the result: a hit said "this file is about X" and made the
   * reader open the file again for the numbers it had already extracted.
   */
  keyData: unknown;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string;
  similarity: number;
}

export interface CatalogSearchResult {
  hits: CatalogSearchHit[];
  /** Current cataloged versions searched (embedding present). */
  searchedCount: number;
  /** Current versions NOT searchable yet (uncataloged / failed / unembedded). */
  unsearchableCount: number;
}

/** The query as a pgvector literal; a provider failure is the search being unavailable. */
async function embedQuery(db: Queryable, query: string): Promise<string> {
  try {
    const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
    const { embedding } = await getEmbeddingService(db).embed(query, 'text-embedding-3-small');
    return `[${embedding.join(',')}]`;
  } catch (err) {
    throw new CatalogSearchUnavailableError(
      `the embedding provider could not embed the query (${err instanceof Error ? err.message : 'unknown error'})`,
    );
  }
}

/**
 * Cosine search over vault.document_catalog.embedding, restricted to verified
 * current program access before embedding, counts and similarity ranking.
 */
export async function searchCatalog(
  db: Queryable,
  organizationId: number,
  query: string,
  /** programId: one permitted program; absent or null = the actor's accessible library. */
  opts: { userId: number; limit?: number; minSimilarity?: number; programId?: string | null },
  verifiedScope?: CurrentAccessibleProgramScope,
): Promise<CatalogSearchResult> {
  const limit = Math.min(25, Math.max(1, opts.limit ?? 8));
  const minSimilarity = opts.minSimilarity ?? 0.15;
  // Access failures remain typed refusals, before any provider work or corpus reads.
  const identity = {organizationId,userId:opts.userId,programId:opts.programId ?? null};
  if (verifiedScope) assertVerifiedProgramScope(db,identity,verifiedScope);
  const scope = verifiedScope ?? await getCurrentAccessibleProgramScope(db,identity);
  if (scope.programIds.length === 0) {
    await requireProgramScopeStillCurrent(db,identity,scope);
    return { hits: [], searchedCount: 0, unsearchableCount: 0 };
  }
  const vectorLiteral = await embedQuery(db, query);

  try {
    const counts = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE c.embedding IS NOT NULL AND c.catalog_status = 'cataloged') AS searchable,
         COUNT(*) FILTER (WHERE c.embedding IS NULL OR c.catalog_status IS DISTINCT FROM 'cataloged') AS unsearchable
       FROM vault.documents d
       JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
      WHERE d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}
        AND d.organization_id = $1
        AND NOT ${supersededSql('d')}
        AND d.program_id = ANY($2::uuid[])`,
      [organizationId, scope.programIds],
    );
    const res = await db.query(
      `SELECT d.id, d.program_id, rp.name AS program_name, d.file_name, d.document_title,
              d.folder_id, d.ctd_section, d.placement_status,
              c.document_kind, c.purpose, c.summary, c.key_data,
              ${vaultBinaryAvailableSql('d')} AS original_file_available,
              1 - (c.embedding <=> $2::vector) AS similarity
         FROM vault.document_catalog c
         JOIN vault.documents d ON d.id = c.document_id AND d.deleted_at IS NULL AND c.content_hash = d.content_hash
         JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1
        WHERE c.embedding IS NOT NULL AND c.catalog_status = 'cataloged'
          AND d.organization_id = $1
          AND ${vaultDataEligibleSql('d')}
          AND NOT ${supersededSql('d')}
          AND 1 - (c.embedding <=> $2::vector) >= $3
          AND d.program_id = ANY($5::uuid[])
        ORDER BY c.embedding <=> $2::vector
        LIMIT $4`,
      [organizationId, vectorLiteral, minSimilarity, limit, scope.programIds],
    );
    return {
      hits: res.rows.map((r: any) => ({
        originalFileAvailable: r.original_file_available ?? true,
        documentId: r.id,
        programId: r.program_id,
        programName: r.program_name,
        fileName: r.file_name,
        documentTitle: r.document_title,
        documentKind: r.document_kind,
        purpose: r.purpose,
        summary: r.summary,
        keyData: r.key_data ?? null,
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
