/** Canonical SQL/count projection for catalog meaning retrieval. */
import type { CatalogSearchQueryable, CatalogSearchResult } from './document-catalog-search.js';
import { vaultDataEligibleSql, vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from './vault-version-family.js';

export async function queryCatalogMeaningIndex(db: CatalogSearchQueryable, args: {organizationId:number; programId:string|null; vectorLiteral:string; limit:number; minSimilarity:number; allowedProgramIds?:readonly string[]}):Promise<CatalogSearchResult> {
  const {organizationId, programId, vectorLiteral, limit, minSimilarity, allowedProgramIds} = args;
  const countParams: unknown[] = [organizationId, programId];
  const countAllowed = allowedProgramIds === undefined ? '' : `AND d.program_id = ANY($${countParams.push([...allowedProgramIds])}::uuid[])`;
  const hitParams: unknown[] = [organizationId, vectorLiteral, minSimilarity, limit, programId];
  const hitAllowed = allowedProgramIds === undefined ? '' : `AND d.program_id = ANY($${hitParams.push([...allowedProgramIds])}::uuid[])`;

  const counts = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE c.embedding IS NOT NULL AND c.catalog_status = 'cataloged') AS searchable,
       COUNT(*) FILTER (WHERE c.embedding IS NULL OR c.catalog_status IS DISTINCT FROM 'cataloged') AS unsearchable
     FROM vault.documents d
     JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1 AND rp.deleted_at IS NULL
     LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
    WHERE d.deleted_at IS NULL AND d.organization_id = $1 AND ${vaultDataEligibleSql('d')}
      AND NOT ${supersededSql('d')}
      AND ($2::uuid IS NULL OR d.program_id = $2::uuid) ${countAllowed}`,
    countParams,
  );
  const res = await db.query(
    `SELECT d.id, d.content_hash, d.program_id, rp.name AS program_name, d.file_name, d.document_title,
            d.folder_id, d.ctd_section, d.placement_status,
            c.document_kind, c.purpose, c.summary, c.key_data,
            ${vaultBinaryAvailableSql('d')} AS original_file_available,
            1 - (c.embedding <=> $2::vector) AS similarity
       FROM vault.document_catalog c
       JOIN vault.documents d ON d.id = c.document_id AND d.deleted_at IS NULL AND c.content_hash = d.content_hash
       JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1 AND rp.deleted_at IS NULL
      WHERE c.embedding IS NOT NULL AND c.catalog_status = 'cataloged'
        AND d.organization_id = $1 AND ${vaultDataEligibleSql('d')}
        AND NOT ${supersededSql('d')}
        AND 1 - (c.embedding <=> $2::vector) >= $3
        AND ($5::uuid IS NULL OR d.program_id = $5::uuid) ${hitAllowed}
      ORDER BY c.embedding <=> $2::vector
      LIMIT $4`,
    hitParams,
  );
  return {
    hits: res.rows.map((r: any) => ({
      originalFileAvailable: r.original_file_available ?? true,
      documentId: r.id,
      contentHash: r.content_hash,
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
}
