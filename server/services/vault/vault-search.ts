/**
 * Search the Vault by content and metadata: one permitted program's, or the
 * current actor's verified accessible library (the library search of plan critique 15, row D2).
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
 * Metadata filters (vault-document-filter.ts) narrow the same predicate; with
 * filters and no text the query browses the filtered set, newest first
 * ('browse' mode). Filters with no text are a question; an empty box alone is not.
 *
 * Every count and page binds the verified accessible programs and checks their
 * organization through regulatory_programs. The document's recorded parent
 * stays authoritative; a separate earlier check cannot widen these reads.
 */
import { supersededSql } from './vault-version-family.js';
import { assertVerifiedProgramScope, getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, type CurrentAccessibleProgramScope } from '../c2c/current-program-access.js';
import { vaultDataEligibleSql, vaultBinaryAvailableSql, vaultDispositionChoiceSql } from '../document-data-disposition/eligibility.js';
import {
  hasVaultFilters, vaultFacetValueSql, vaultFilterSql, vaultFiltersWithout, vaultLifecycleStageSql,
  VAULT_FACET_DIMENSIONS, VAULT_FILTER_PARAMETERS, type VaultDocumentFilters, type VaultFacets,
} from './vault-document-filter.js';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export interface VaultSearchParams {
  organizationId: number;
  /** Current authenticated actor; caller-supplied roles never establish access. */
  userId: number;
  /** One program, or null for the actor's verified accessible library. */
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
  /** Additional server-admitted source restriction; never establishes access. */
  allowedProgramIds?: readonly string[];
  /** Metadata filters, already validated (parseVaultFilters). They only narrow. */
  filters?: VaultDocumentFilters;
  /**
   * Count each filter's values (VR-18): one GROUP BY per dimension, over the same
   * predicate less that dimension's own filter, so the counts say what choosing
   * a value would select. Asked for on the first page only; a failed count fails
   * the search, never reads as zero.
   */
  facets?: boolean;
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
  originalFileAvailable?: boolean;
  disposition?: 'keep_data' | 'remove_data' | 'supersede' | null;
  id: string;
  /** Exact original identity used by actor adapters after asynchronous retrieval. */
  contentHash?: string;
  title: string;
  fileName: string | null;
  documentType: string | null;
  sizeBytes: number | null;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string | null;
  evidenceKind: string | null;
  classification: string | null;
  /** The version's lifecycle stage; null when none is recorded ("Not sent for review"). */
  lifecycleStage: string | null;
  /** ISO 8601, or null when the row has none. */
  updatedAt: string | null;
  version: string | null;
  current: boolean;
  snippet: string | null;
  /** The program that holds it: what a library hit is opened and downloaded through. */
  program: { id: string; name: string | null };
}

const MATCH = `vault.document_search_vector(d.document_title, d.file_name, left(d.extracted_text, 900000))
               @@ websearch_to_tsquery('english', $2)`;

/** The metadata a row shows beside its title, as the tree shows it. */
function metadataOf(r: Record<string, unknown>): Pick<VaultSearchHit, 'evidenceKind' | 'classification' | 'lifecycleStage' | 'updatedAt'> {
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    evidenceKind: text(r.evidence_kind),
    classification: text(r.classification),
    lifecycleStage: text(r.lifecycle_stage),
    updatedAt: isoOrNull(r.updated_at),
  };
}

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Facet counts, each over the search's own predicate (`whereFor`) less one
 * dimension's filter, with its own bind list that starts with the same three
 * tenant, query and program positions.
 */
async function readFacets(
  db: Queryable, p: VaultSearchParams, base: readonly unknown[],
  whereFor: (filterSql: string) => string,
): Promise<VaultFacets> {
  const facets: VaultFacets = {};
  // A folder is one project's cabinet: counted within a project only.
  const dimensions = VAULT_FACET_DIMENSIONS.filter((d) => d !== 'folderIds' || p.programId !== null);
  for (const dimension of dimensions) {
    const params = [...base];
    const where = whereFor(vaultFilterSql(vaultFiltersWithout(p.filters, dimension), params, 'd'));
    // Two fixed fragments: the dimension's value expression (a code map, no
    // request value) and the search's own predicate, whose values are bound.
    // The tenant predicate is written here as well as inside `where`, so this
    // statement is tenant-bound on its own text: $1 is the organisation in `base`.
    const counted = await db.query(`SELECT ${vaultFacetValueSql(dimension, 'd')} AS value, count(*)::int AS count
       FROM vault.documents d
      WHERE d.organization_id = $1 AND ${where}
      GROUP BY 1 ORDER BY 2 DESC, 1`, params);
    facets[VAULT_FILTER_PARAMETERS[dimension]] = counted.rows.map((r) => ({ value: r.value ?? null, count: Number(r.count) }));
  }
  return facets;
}

export async function searchVaultDocuments(db: Queryable, p: VaultSearchParams, verifiedScope?: CurrentAccessibleProgramScope): Promise<{ total: number; results: VaultSearchHit[]; mode: 'search' | 'browse'; facets?: VaultFacets }> {
  p = Object.freeze({ ...p, allowedProgramIds: p.allowedProgramIds ? Object.freeze([...p.allowedProgramIds]) : undefined });
  // Verify on the same executor before counting, ranking or returning prose.
  // The helper evaluates an empty accessible set; it is never a tenant-wide fallback.
  const identity = {organizationId:p.organizationId,userId:p.userId,programId:p.programId};
  if (verifiedScope) assertVerifiedProgramScope(db,identity,verifiedScope);
  const scope = verifiedScope ?? await getCurrentAccessibleProgramScope(db,identity);
  const permitted = p.allowedProgramIds === undefined ? scope.programIds
    : scope.programIds.filter(id => p.allowedProgramIds!.includes(id));
  // Browse: filters and no text, newest version first. $2 stays bound (null)
  // and referenced, so every position after it is where the tenant-scope test
  // pins it; with no rank, the order is the tie-break the search already uses.
  const browse = !p.q.trim() && hasVaultFilters(p.filters);
  const params: unknown[] = [p.organizationId, browse ? null : p.match === 'any' ? anyTermsQuery(p.q) : p.q, permitted];
  const base = [...params];
  const filterSql = vaultFilterSql(p.filters, params, 'd');
  /* `websearch_to_tsquery` rather than `to_tsquery`: it accepts arbitrary user
     text (quotes, OR, -negation) and never raises a syntax error. */
  const whereFor = (filters: string) => `d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}
          AND d.organization_id = $1
          AND d.program_id = ANY($3::uuid[])
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = d.program_id AND rp.organization_id = $1 AND rp.deleted_at IS NULL
          )
          AND ${browse ? '$2::text IS NULL' : MATCH}${filters}${p.includeSuperseded ? '' : `
          AND NOT ${supersededSql('d')}`}`;
  const where = whereFor(filterSql);

  // The count and the page share `where`, each on its own line after FROM.
  // Count and page each carry the tenant predicate on their own text as well as
  // through `where` ($1 is the organisation), so neither depends on the fragment.
  const counted = await db.query(`SELECT count(*)::int AS total
       FROM vault.documents d
      WHERE d.organization_id = $1 AND ${where}`, params);
  const page = [...params, p.limit, p.offset];
  const rows = await db.query(
    `SELECT d.id, d.content_hash, d.document_title, d.file_name, d.document_type, d.file_size,
            ${vaultBinaryAvailableSql('d')} AS original_file_available,
            ${vaultDispositionChoiceSql('d')} AS disposition,
            d.folder_id, d.ctd_section, d.placement_status, d.created_at, d.version,
            d.evidence_kind, d.classification::text AS classification, d.updated_at,
            ${vaultLifecycleStageSql('d')} AS lifecycle_stage,
            NOT ${supersededSql('d')} AS current,
            d.program_id::text AS program_id, prog.name AS program_name,
            -- In browse, $2 is null: both functions are strict, so rank and
            -- snippet are null and ts_headline does no work.
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
      WHERE d.organization_id = $1 AND ${where}
      ORDER BY rank DESC, d.created_at DESC, d.id
      LIMIT $${page.length - 1} OFFSET $${page.length}`,
    page,
  );
  const facets = p.facets ? await readFacets(db, p, base, whereFor) : undefined;
  await requireProgramScopeStillCurrent(db, identity, scope);
  return {
    ...(facets ? { facets } : {}),
    mode: browse ? 'browse' : 'search',
    total: counted.rows[0]?.total ?? 0,
    results: rows.rows.map((r) => ({
      originalFileAvailable: r.original_file_available ?? true,
      disposition: r.disposition ?? null,
      id: String(r.id),
      contentHash: r.content_hash,
      title: r.document_title || r.file_name || 'Untitled',
      fileName: r.file_name ?? null,
      documentType: r.document_type ?? null,
      sizeBytes: r.file_size == null ? null : Number(r.file_size),
      folderId: r.folder_id ?? null,
      ctdSection: r.ctd_section ?? null,
      placementStatus: r.placement_status ?? null,
      ...metadataOf(r),
      version: r.version ?? null,
      current: Boolean(r.current),
      // Only offered when the match was in the body; a snippet echoing the
      // title back is noise.
      snippet: typeof r.snippet === 'string' && r.snippet.trim() ? r.snippet : null,
      program: { id: String(r.program_id), name: r.program_name ?? null },
    })),
  };
}
