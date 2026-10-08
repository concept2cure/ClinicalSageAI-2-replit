/**
 * The project's Data Room, searched, filtered and paged (D2, Data Room catalog
 * S2; docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * The Data Room read stopped at 200 rows (SOURCES_WINDOW) with no paging, no
 * filter and no search; the only search box matched titles over the rows
 * already loaded, so a project's 201st file could not be found from it. This
 * is the read behind GET /api/c2c/projects/:id/sources:
 *   - `q`: full-text over the title and the text the capture was read to
 *     (vault.document_search_vector, the Vault's own definition; index
 *     idx_cre_sources_client_fts, migrations/20261008c), every term, ranked;
 *   - filters on how far it was read, the kind the classifier proposed, and
 *     when it was captured;
 *   - limit/offset paging with the real total, as the Vault search pages.
 *
 * The extracted text is never returned in a list: it can run to megabytes a
 * row. A hit carries a short snippet of where it matched instead.
 */
import { pool } from '../../db';
import { capturedDataEligibleSql, capturedBinaryAvailableSql, capturedDispositionChoiceSql } from '../document-data-disposition/eligibility.js';
import { adaptSource, visibleOrgClause } from './evidence-spine.service.js';
import { EXTRACTION_STATUSES, type EvidenceSource, type ExtractionStatus } from './types.js';

export interface DataRoomQuery {
  programId: string;
  /** Full-text query (every term), or empty for the whole room. */
  q?: string | null;
  /** How far the capture was read. */
  status?: ExtractionStatus | null;
  /** The evidence kind the classifier proposed (metadata.dossier.evidenceKind). */
  kind?: string | null;
  /** Captured on or after / on or before, as YYYY-MM-DD. */
  from?: string | null;
  to?: string | null;
  /** Leave out sources a re-upload superseded. */
  currentOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface DataRoomPage {
  /** Every source matching the query, not the page. */
  total: number;
  /**
   * Of those, the ones a person counts: current (a re-upload retires its
   * predecessor) and data-eligible. One file re-uploaded is one source.
   */
  currentTotal: number;
  sources: Array<EvidenceSource & { snippet: string | null; charCount: number | null; pageCount: number | null }>;
}

/** Every column a list returns: all but extracted_text. */
const LIST_COLUMNS = [
  'id', 'organization_id', 'visibility_class', 'client_workspace_id', 'client_program_id', 'source_type',
  'agency', 'source_record_identifier', 'title', 'sponsor', 'product', 'indication', 'therapeutic_area',
  'phase', 'application_type', 'application_number', 'trial_registry_identifier', 'document_date',
  'official_url', 'stored_artifact_ref', 'checksum', 'version', 'is_current', 'provenance',
  'ingestion_status', 'extraction_status', 'linked_csr_report_id', 'linked_precedent_id', 'metadata',
  'created_at', 'updated_at', 'char_count', 'page_count',
].map(c => `s.${c}`).join(', ');

/** The searchable text of a source: the index's own expression, so the index serves the query. */
const SEARCH_VECTOR = `vault.document_search_vector(s.title, NULL::text, left(s.extracted_text, 900000))`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Why a query cannot be run as asked: the caller says it, never a widened result. */
export class DataRoomQueryError extends Error {}

/** Validate what a request asked for; an unreadable filter is refused, not ignored. */
export function parseDataRoomQuery(programId: string, raw: Record<string, unknown>): DataRoomQuery {
  const str = (k: string) => (typeof raw[k] === 'string' ? String(raw[k]).trim() : '');
  const q = str('q');
  if (q.length > 200) throw new DataRoomQueryError('The search is longer than 200 characters.');
  const status = str('status');
  if (status && !(EXTRACTION_STATUSES as readonly string[]).includes(status)) {
    throw new DataRoomQueryError(`status must be one of: ${EXTRACTION_STATUSES.join(', ')}.`);
  }
  const kind = str('kind');
  if (kind && !/^[a-z0-9_-]{1,60}$/i.test(kind)) throw new DataRoomQueryError('kind is not a valid evidence kind.');
  for (const k of ['from', 'to']) {
    if (str(k) && !DATE_RE.test(str(k))) throw new DataRoomQueryError(`${k} must be a date, YYYY-MM-DD.`);
  }
  const limit = str('limit') ? Number(str('limit')) : 200;
  const offset = str('offset') ? Number(str('offset')) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new DataRoomQueryError('limit must be a whole number from 1 to 200.');
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new DataRoomQueryError('offset must be a whole number from 0.');
  return {
    programId, q: q || null, status: (status || null) as ExtractionStatus | null, kind: kind || null,
    from: str('from') || null, to: str('to') || null, currentOnly: str('current') === 'true', limit, offset,
  };
}

/** The filter clauses, each binding its own value onto `args`. */
function filterClauses(p: DataRoomQuery, args: unknown[]): string[] {
  const out: string[] = [];
  const bind = (v: unknown) => `$${args.push(v)}`;
  if (p.q) out.push(`${SEARCH_VECTOR} @@ websearch_to_tsquery('english', ${bind(p.q)})`);
  if (p.status) out.push(`s.extraction_status = ${bind(p.status)}`);
  if (p.kind) out.push(`s.metadata->'dossier'->>'evidenceKind' = ${bind(p.kind)}`);
  if (p.from) out.push(`s.created_at >= ${bind(p.from)}::date`);
  if (p.to) out.push(`s.created_at < (${bind(p.to)}::date + 1)`);
  if (p.currentOnly) out.push('s.is_current IS NOT FALSE');
  return out;
}

export async function searchDataRoom(orgId: number, p: DataRoomQuery): Promise<DataRoomPage> {
  const c = visibleOrgClause(orgId, 1);
  const args: unknown[] = [c.param, p.programId];
  const where = [
    c.sql.replace(/organization_id/g, 's.organization_id'),
    's.deleted_at IS NULL', `s.source_type = 'client_document'`, 's.client_program_id = $2',
    ...filterClauses(p, args),
  ].join(' AND ');
  const counted = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE s.is_current IS NOT FALSE AND ${capturedDataEligibleSql('s')})::int AS current_total
       FROM cre_evidence_sources s WHERE ${where}`,
    args,
  );
  // The query's own placeholder, when there is one: rank and snippet reuse it.
  const qParam = p.q ? `$${args.indexOf(p.q) + 1}` : null;
  const page = [...args, p.limit ?? 200, p.offset ?? 0];
  const { rows } = await pool.query(
    `SELECT ${LIST_COLUMNS},
            ${capturedDataEligibleSql('s')} AS data_eligible,
            ${capturedBinaryAvailableSql('s')} AS original_file_available,
            ${capturedDispositionChoiceSql('s')} AS disposition,
            ${qParam
              ? `ts_headline('english', left(s.extracted_text, 900000), websearch_to_tsquery('english', ${qParam}),
                   'MaxFragments=1, MaxWords=28, MinWords=8, ShortWord=2')`
              : 'NULL::text'} AS snippet
       FROM cre_evidence_sources s
      WHERE ${where}
      ORDER BY ${qParam ? `ts_rank_cd(${SEARCH_VECTOR}, websearch_to_tsquery('english', ${qParam})) DESC, ` : ''}s.created_at DESC, s.id DESC
      LIMIT $${page.length - 1} OFFSET $${page.length}`,
    page,
  );
  return {
    total: Number(counted.rows[0]?.total ?? 0),
    currentTotal: Number(counted.rows[0]?.current_total ?? 0),
    sources: rows.map(r => ({
      ...adaptSource(r),
      snippet: r.snippet ?? null,
      charCount: r.char_count == null ? null : Number(r.char_count),
      pageCount: r.page_count == null ? null : Number(r.page_count),
    })),
  };
}
