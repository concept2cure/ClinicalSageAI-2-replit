/**
 * Search the Vault by content and metadata: one program's, or every program
 * the organisation holds (the library search of plan critique 15, row D2).
 *
 * The one search query. `GET /:id/search` asks within a program; `GET /search`
 * asks across the organisation's library, which Veeva offers and the Vault
 * did not: a reviewer looking for "the 2024 stability report" had to know
 * which project held it. Both read through here, so the two cannot rank,
 * count or scope differently.
 *
 * Ranked full text over title, file name and extracted body, using the SAME
 * expression the GIN index is built on (migrations/20260906_vault_documents_fulltext.sql).
 * Paginated with a real `total`. Current versions only unless asked (VR-09).
 * An empty query is not "match everything": it answers no results and says why.
 *
 * The tenant boundary is IN every statement (the EXISTS on regulatory_programs),
 * not only in a check before it: vault.documents has no organization_id of its
 * own to filter on, and a boundary twenty lines up is the shape that decays.
 */
import { supersededSql } from './vault-version-family.js';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export interface VaultSearchParams {
  organizationId: number;
  /** One program, or null for every program the organisation holds. */
  programId: string | null;
  q: string;
  limit: number;
  offset: number;
  includeSuperseded: boolean;
  /**
   * 'all' (the default, the search box's meaning): every term must match.
   * 'any': a document matching any term qualifies, and ts_rank_cd ranks those
   * matching more of them higher. AnA asks in sentences ("which report shows
   * 24-month stability for batch 12?"), and requiring every word of a sentence
   * answers nothing (D2, docs/evidence/D2/2026-10-01-vault-search-no-key/).
   */
  match?: 'all' | 'any';
}

/**
 * A question as an OR of its words, in websearch_to_tsquery syntax. Words only:
 * quotes and -negation in a sentence are punctuation, not operators. English
 * stop words fall out in the tsquery itself.
 */
export function anyTermsQuery(q: string): string {
  const words = q.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}._]*/gu) ?? [];
  return [...new Set(words)].join(' or ');
}

export interface VaultSearchHit {
  id: string;
  title: string;
  fileName: string | null;
  documentType: string | null;
  sizeBytes: number | null;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string | null;
  version: string | null;
  current: boolean;
  snippet: string | null;
  /** The program that holds it: what a library hit is opened and downloaded through. */
  program: { id: string; name: string | null };
}

const MATCH = `vault.document_search_vector(d.document_title, d.file_name, left(d.extracted_text, 900000))
               @@ websearch_to_tsquery('english', $2)`;

export async function searchVaultDocuments(db: Queryable, p: VaultSearchParams): Promise<{ total: number; results: VaultSearchHit[] }> {
  const params: unknown[] = [p.organizationId, p.match === 'any' ? anyTermsQuery(p.q) : p.q];
  const inProgram = p.programId ? `AND d.program_id = $${params.push(p.programId)}::uuid` : '';
  /* `websearch_to_tsquery` rather than `to_tsquery`: it accepts arbitrary user
     text (quotes, OR, -negation) and never raises a syntax error. */
  const where = `d.deleted_at IS NULL ${inProgram}
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = d.program_id AND rp.organization_id = $1 AND rp.deleted_at IS NULL
          )
          AND ${MATCH}${p.includeSuperseded ? '' : `
          AND NOT ${supersededSql('d')}`}`;

  // The count and the page share `where`, each on its own line after FROM.
  const counted = await db.query(`SELECT count(*)::int AS total
       FROM vault.documents d
      WHERE ${where}`, params);
  const page = [...params, p.limit, p.offset];
  const rows = await db.query(
    `SELECT d.id, d.document_title, d.file_name, d.document_type, d.file_size,
            d.folder_id, d.ctd_section, d.placement_status, d.created_at, d.version,
            NOT ${supersededSql('d')} AS current,
            d.program_id::text AS program_id, prog.name AS program_name,
            ts_rank_cd(
              vault.document_search_vector(d.document_title, d.file_name, left(d.extracted_text, 900000)),
              websearch_to_tsquery('english', $2)
            ) AS rank,
            -- A snippet from the body so a hit on content is legible as one.
            -- ts_headline is expensive, so it runs on the returned page only.
            ts_headline('english', COALESCE(left(d.extracted_text, 900000), ''),
                        websearch_to_tsquery('english', $2),
                        'MaxFragments=1, MaxWords=28, MinWords=8, ShortWord=2') AS snippet
       FROM vault.documents d
       JOIN regulatory_programs prog ON prog.id = d.program_id AND prog.organization_id = $1
      WHERE ${where}
      ORDER BY rank DESC, d.created_at DESC
      LIMIT $${page.length - 1} OFFSET $${page.length}`,
    page,
  );
  return {
    total: counted.rows[0]?.total ?? 0,
    results: rows.rows.map((r) => ({
      id: String(r.id),
      title: r.document_title || r.file_name || 'Untitled',
      fileName: r.file_name ?? null,
      documentType: r.document_type ?? null,
      sizeBytes: r.file_size == null ? null : Number(r.file_size),
      folderId: r.folder_id ?? null,
      ctdSection: r.ctd_section ?? null,
      placementStatus: r.placement_status ?? null,
      version: r.version ?? null,
      current: Boolean(r.current),
      // Only offered when the match was in the body; a snippet echoing the
      // title back is noise.
      snippet: typeof r.snippet === 'string' && r.snippet.trim() ? r.snippet : null,
      program: { id: String(r.program_id), name: r.program_name ?? null },
    })),
  };
}
