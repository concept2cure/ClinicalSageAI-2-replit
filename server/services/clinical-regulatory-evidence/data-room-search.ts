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
import { syncQualityProjectSources } from './record-source';
import { getCurrentReadableSourceScope, requireSourceReadScopeStillCurrent } from './source-read-access';
import { persistedTextAvailableSql } from './data-room-processing-state.js';

export interface DataRoomQuery {
  programId: string;
  /**
   * The catalog across projects (S2, 2026-11-06): every project in this set,
   * which the route takes from the person's verified accessible projects (of
   * the open project's sponsor), never from the request. Absent: the one project.
   */
  programIds?: string[] | null;
  /** Narrow the catalog to one of its projects (it must be in programIds). */
  project?: string | null;
  /** The CTD section the classifier proposed (prefix: "5.3" matches "5.3.5.1"). */
  ctd?: string | null;
  /** The Vault folder the classifier proposed. */
  folder?: string | null;
  /** The study the capture names (study_ref). */
  study?: number | null;
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
  sources: Array<EvidenceSource & {
    snippet: string | null; charCount: number | null; pageCount: number | null; studyRef: number | null;
    projectName: string | null; studyName: string | null; previousVersionId: number | null;
  }>;
  /** The catalog across projects only: how every match is organized. */
  facets?: CatalogFacets;
}

/** Every column a list returns: all but extracted_text. */
const LIST_COLUMNS = [
  'id', 'organization_id', 'visibility_class', 'client_workspace_id', 'client_program_id', 'source_type',
  'agency', 'source_record_identifier', 'title', 'sponsor', 'product', 'indication', 'therapeutic_area',
  'phase', 'application_type', 'application_number', 'trial_registry_identifier', 'document_date',
  'official_url', 'stored_artifact_ref', 'checksum', 'version', 'is_current', 'provenance',
  'ingestion_status', 'extraction_status', 'linked_csr_report_id', 'linked_precedent_id', 'metadata',
  'created_at', 'updated_at', 'char_count', 'page_count', 'study_ref', 'previous_version_id',
].map(c => `s.${c}`).join(', ');

/** The searchable text of a source: the index's own expression, so the index serves the query. */
const SEARCH_VECTOR = `vault.document_search_vector(s.title, NULL::text, left(s.extracted_text, 900000))`;

/** ECMAScript trim whitespace, so the lean SQL flag agrees with the core's nonblank rule. */
export const SOURCE_TEXT_AVAILABLE_SQL = persistedTextAvailableSql('s');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Why a query cannot be run as asked: the caller says it, never a widened result. */
export class DataRoomQueryError extends Error {}

/** A query parameter as a trimmed string ('' when absent or not a string). */
const param = (raw: Record<string, unknown>, k: string): string => (typeof raw[k] === 'string' ? String(raw[k]).trim() : '');

/** A whole number within [min, max], or the default when absent; refused otherwise. */
function wholeNumber(value: string, fallback: number, min: number, max: number, message: string): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new DataRoomQueryError(message);
  return n;
}

function checkStatus(status: string): ExtractionStatus | null {
  if (!status) return null;
  if (!(EXTRACTION_STATUSES as readonly string[]).includes(status)) {
    throw new DataRoomQueryError(`status must be one of: ${EXTRACTION_STATUSES.join(', ')}.`);
  }
  return status as ExtractionStatus;
}

function checkDate(value: string, name: string): string | null {
  if (value && !DATE_RE.test(value)) throw new DataRoomQueryError(`${name} must be a date, YYYY-MM-DD.`);
  return value || null;
}

/** Validate what a request asked for; an unreadable filter is refused, not ignored. */
export function parseDataRoomQuery(programId: string, raw: Record<string, unknown>): DataRoomQuery {
  const q = param(raw, 'q');
  if (q.length > 200) throw new DataRoomQueryError('The search is longer than 200 characters.');
  const kind = param(raw, 'kind');
  if (kind && !/^[a-z0-9_-]{1,60}$/i.test(kind)) throw new DataRoomQueryError('kind is not a valid evidence kind.');
  return {
    programId,
    q: q || null,
    status: checkStatus(param(raw, 'status')),
    kind: kind || null,
    from: checkDate(param(raw, 'from'), 'from'),
    to: checkDate(param(raw, 'to'), 'to'),
    currentOnly: param(raw, 'current') === 'true',
    ...catalogFilters(raw),
    limit: wholeNumber(param(raw, 'limit'), 200, 1, 200, 'limit must be a whole number from 1 to 200.'),
    offset: wholeNumber(param(raw, 'offset'), 0, 0, 100000, 'offset must be a whole number from 0.'),
  };
}

/** The catalog's narrowings (S2): project, study, CTD section and Vault folder, each checked or refused. */
function catalogFilters(raw: Record<string, unknown>): Pick<DataRoomQuery, 'ctd' | 'folder' | 'project' | 'study'> {
  const checked = (name: string, re: RegExp, message: string): string | null => {
    const value = param(raw, name);
    if (value && !re.test(value)) throw new DataRoomQueryError(message);
    return value || null;
  };
  const project = checked('project', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'project must be a project id.');
  const study = param(raw, 'study');
  return {
    ctd: checked('ctd', /^[0-9A-Za-z.]{1,20}$/, 'ctd is not a CTD section.'),
    folder: checked('folder', /^[A-Za-z0-9_.:-]{1,120}$/, 'folder is not a Vault folder.'),
    project: project ? project.toLowerCase() : null,
    study: study ? wholeNumber(study, 0, 1, 2147483647, 'study must be a study id.') : null,
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
  if (p.ctd) out.push(`(s.metadata->'dossier'->>'ctdSection' = ${bind(p.ctd)} OR s.metadata->'dossier'->>'ctdSection' LIKE ${bind(`${p.ctd}.%`)})`);
  if (p.folder) out.push(`s.metadata->'dossier'->>'suggestedFolder' = ${bind(p.folder)}`);
  if (p.study) out.push(`s.study_ref = ${bind(p.study)}`);
  if (p.project && p.programIds) out.push(`s.client_program_id::text = ${bind(p.project)}`);
  return out;
}

/**
 * The sources this person may read. The catalog spans several projects, so its scope is asked for
 * every project they can open (no one programId); the query below still holds it to the catalog's set.
 */
async function prepareSourceScope(orgId: number, p: DataRoomQuery, actor?: { userId: number | undefined }) {
  if (!actor) return null;
  if ((p.offset ?? 0) === 0) await syncQualityProjectSources({ organizationId: orgId, programId: p.programId, userId: actor.userId });
  return getCurrentReadableSourceScope(pool, readableScopeInput(orgId, p, actor));
}

function readableScopeInput(orgId: number, p: DataRoomQuery, actor: { userId: number | undefined }) {
  return { organizationId: orgId, userId: actor.userId, ...(Array.isArray(p.programIds) ? {} : { programId: p.programId }) };
}

/** The person's readable sources did not change while the page was read; a change refuses the read. */
async function confirmSourceScope(orgId: number, p: DataRoomQuery, actor: { userId: number | undefined } | undefined,
  readable: Awaited<ReturnType<typeof prepareSourceScope>>): Promise<void> {
  if (actor && readable) await requireSourceReadScopeStillCurrent(pool, readableScopeInput(orgId, p, actor), readable);
}

/** Which captures a query matches: the organization's visible, live client documents of the project (or the catalog's projects), filtered. */
function roomWhere(orgId: number, p: DataRoomQuery, readable: { sourceIds: number[] } | null): { args: unknown[]; where: string } {
  const c = visibleOrgClause(orgId, 1);
  const catalog = Array.isArray(p.programIds);
  const args: unknown[] = [c.param, catalog ? (p.programIds as string[]).map((id) => id.toLowerCase()) : p.programId];
  const where = [
    c.sql.replace(/organization_id/g, 's.organization_id'),
    's.deleted_at IS NULL', `s.source_type = 'client_document'`,
    catalog ? 's.client_program_id::text = ANY($2::text[])' : 's.client_program_id = $2',
    ...filterClauses(p, args),
    ...(readable ? [`s.id=ANY($${args.push(readable.sourceIds)}::int[])`] : []),
  ].join(' AND ');
  return { args, where };
}

export async function searchDataRoom(orgId: number, p: DataRoomQuery, actor?: { userId: number | undefined }): Promise<DataRoomPage> {
  const readable = await prepareSourceScope(orgId, p, actor);
  const catalog = Array.isArray(p.programIds);
  const { args, where } = roomWhere(orgId, p, readable);
  /* The counts and, in one statement over the same matches, how they are organized (the facets). */
  const counted = await pool.query(
    `WITH m AS (SELECT s.* FROM cre_evidence_sources s WHERE ${where})
     SELECT (SELECT count(*)::int FROM m) AS total,
            (SELECT count(*)::int FROM m s WHERE s.is_current IS NOT FALSE AND ${capturedDataEligibleSql('s')}) AS current_total,
            (SELECT COALESCE(jsonb_agg(jsonb_build_object('facet', x.facet, 'value', x.value, 'label', x.label, 'n', x.n)
                                       ORDER BY x.facet, x.n DESC, x.value), '[]'::jsonb)
               FROM (SELECT f.facet, f.value, max(f.label) AS label, count(*)::int AS n
       FROM m s
       LEFT JOIN regulatory_programs rp ON rp.id = s.client_program_id
       LEFT JOIN cdisc_prm_studies st ON st.id = s.study_ref AND st.tenant_id = s.organization_id
       CROSS JOIN LATERAL (VALUES
         ('project', s.client_program_id::text, rp.name),
         ('study', s.study_ref::text, COALESCE(st.study_id || ' · ' || st.protocol_title, st.study_id)),
         ('kind', s.metadata->'dossier'->>'evidenceKind', NULL),
         ('ctd', s.metadata->'dossier'->>'ctdSection', NULL),
         ('folder', s.metadata->'dossier'->>'suggestedFolder', s.metadata->'dossier'->>'view')
       ) AS f(facet, value, label)
      WHERE f.value IS NOT NULL AND f.value <> ''
      GROUP BY f.facet, f.value) x) AS facets`,
    args,
  );
  // The query's own placeholder, when there is one: rank and snippet reuse it.
  const qParam = p.q ? `$${args.indexOf(p.q) + 1}` : null;
  const page = [...args, p.limit ?? 200, p.offset ?? 0];
  const { rows } = await pool.query(
    `SELECT ${LIST_COLUMNS},
            ${SOURCE_TEXT_AVAILABLE_SQL} AS text_available,
            clock_timestamp() AS processing_observed_at,
            (SELECT rp.name FROM regulatory_programs rp WHERE rp.id = s.client_program_id) AS project_name,
            (SELECT COALESCE(st.study_id || ' · ' || st.protocol_title, st.study_id) FROM cdisc_prm_studies st
              WHERE st.id = s.study_ref AND st.tenant_id = s.organization_id) AS study_name,
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
  await confirmSourceScope(orgId, p, actor, readable);
  const facets = catalog ? await catalogFacets(counted.rows[0]?.facets ?? []) : undefined;
  return {
    ...(facets ? { facets } : {}),
    total: Number(counted.rows[0]?.total ?? 0),
    currentTotal: Number(counted.rows[0]?.current_total ?? 0),
    sources: rows.map(r => ({
      ...adaptSource(r),
      snippet: r.snippet ?? null,
      charCount: r.char_count == null ? null : Number(r.char_count),
      pageCount: r.page_count == null ? null : Number(r.page_count),
      studyRef: r.study_ref == null ? null : Number(r.study_ref),
      previousVersionId: r.previous_version_id == null ? null : Number(r.previous_version_id),
      projectName: r.project_name ?? null,
      studyName: r.study_name ?? null,
    })),
  };
}

/** One way the catalog is organized, with how many matching captures fall under each value. */
export interface CatalogFacet { value: string; label: string; count: number }
export interface CatalogFacets {
  project: CatalogFacet[];
  study: CatalogFacet[];
  kind: CatalogFacet[];
  ctd: CatalogFacet[];
  folder: CatalogFacet[];
}

/**
 * How the matching captures are organized: by project, study, evidence kind,
 * CTD section and Vault folder, each with its count over every match (not the
 * page). A capture the classifier has not described counts under none of kind,
 * CTD and folder, and one naming no study under no study: never a guessed value.
 */

async function catalogFacets(rows: Array<{ facet: keyof CatalogFacets; value: string; label: string | null; n: number }>): Promise<CatalogFacets> {
  const out: CatalogFacets = { project: [], study: [], kind: [], ctd: [], folder: [] };
  const { folderLabel } = await import('../vault/vault-filing.service.js');
  for (const r of rows) {
    let label = r.label ?? r.value;
    if (r.facet === 'folder') {
      try { label = folderLabel((r.label ?? 'clinical') as never, r.value) || r.value; } catch { label = r.value; }
    }
    out[r.facet]?.push({ value: r.value, label, count: r.n });
  }
  return out;
}

/**
 * The projects a person's catalog spans, asked from inside one of them: every
 * project of the person's verified accessible set (getCurrentAccessibleProgramScope,
 * the Vault library's scope) that belongs to the open project's sponsor (its
 * client workspace on the verified anchor). A CRO works for several sponsors in
 * one organization, and one sponsor's data is never listed in another's catalog
 * (the library's rule, F1 S6 V2). The open project is always in the set; a
 * project not in the person's accessible set is refused, never widened to.
 */
export async function catalogProgramIds(
  identity: { organizationId: number; userId: number | undefined },
  openProgramId: string,
): Promise<string[]> {
  const { getCurrentAccessibleProgramScope, verifiedProgramAnchors, ProgramReadAccessError } = await import('../c2c/current-program-access.js');
  const scope = await getCurrentAccessibleProgramScope(pool, identity);
  const anchors = verifiedProgramAnchors(pool, identity, scope);
  const own = anchors.find((a) => a.programId === openProgramId.toLowerCase());
  if (!own) throw new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return anchors.filter((a) => a.clientWorkspaceId === own.clientWorkspaceId).map((a) => a.programId);
}
