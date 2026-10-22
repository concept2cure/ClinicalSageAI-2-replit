/**
 * The one metadata predicate over `vault.documents` (VR-18, Veeva gap 7 slice B,
 * row D2): document type, classification, evidence kind, folder, filing status,
 * CTD section and lifecycle stage.
 *
 * Extracted from `listVaultDocuments` (vault-document-index.service.ts), which
 * held the only metadata filters and served them to API-key holders alone. The
 * in-app search (vault-search.ts) and the public API now build theirs here, so
 * the two cannot disagree on what "Module 3" or "CONTROLLED" selects. A filter
 * rides the canonical search predicate; it is never a second list query. The
 * deleted `server/api/vault/routes.ts` (86d177ba9c) was one, and read across
 * tenants.
 *
 * Values are checked against the vocabularies the write paths use. A value
 * outside them is refused by name (400, with the allowed values), never
 * dropped: a dropped filter answers a wider question than the one asked, and
 * the reader believes the narrower one. Values within a dimension are OR'd;
 * dimensions are AND'd.
 *
 * @module server/services/vault/vault-document-filter
 */
import {
  VAULT_CLASSIFICATIONS,
  VAULT_DOC_KINDS,
  VAULT_INGEST_DOCUMENT_TYPES,
  foldersForView,
  type VaultViewId,
} from '../../../shared/constants/domain/vault-taxonomy';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { DOCUMENT_STAGES } from '../../../shared/regulatory/document-lifecycle';

/** Filing status as the Vault tree counts it (project-vault.ts GET /:id). */
export const VAULT_PLACEMENT_STATUSES = ['unfiled', 'suggested', 'confirmed'] as const;
export type VaultPlacementStatus = (typeof VAULT_PLACEMENT_STATUSES)[number];

/** A version with no lifecycle record: the Vault shows it as "Not sent for review". */
export const VAULT_STAGE_NONE = 'none';
export const VAULT_LIFECYCLE_STAGE_FILTERS = [VAULT_STAGE_NONE, ...DOCUMENT_STAGES] as const;

/** More values than this in one dimension is not a filter a person chose. */
export const MAX_FILTER_VALUES = 20;

export interface VaultDocumentFilters {
  documentTypes?: string[];
  classifications?: string[];
  evidenceKinds?: string[];
  folderIds?: string[];
  placementStatuses?: VaultPlacementStatus[];
  /** Normalised CTD codes ({@link normalizeCtdCode}). */
  ctdSections?: string[];
  /** DOCUMENT_STAGES, or {@link VAULT_STAGE_NONE}. */
  lifecycleStages?: string[];
}

export interface VaultFilterRefusal {
  error: 'INVALID_FILTER' | 'UNSUPPORTED_PARAMETER';
  parameter: string;
  allowed?: readonly string[];
  message: string;
}

/** The query parameter each dimension is read from. */
export const VAULT_FILTER_PARAMETERS = {
  documentTypes: 'documentType',
  classifications: 'classification',
  evidenceKinds: 'evidenceKind',
  folderIds: 'folderId',
  placementStatuses: 'placementStatus',
  ctdSections: 'ctdSection',
  lifecycleStages: 'lifecycleStage',
} as const satisfies Record<keyof VaultDocumentFilters, string>;

export function hasVaultFilters(f: VaultDocumentFilters | undefined): boolean {
  return !!f && Object.values(f).some((v) => Array.isArray(v) && v.length > 0);
}

/** Repeated parameters, comma lists, or both; blanks are "not set". */
export function vaultFilterValues(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    for (const part of item.split(',')) {
      const v = part.trim();
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

export interface ParseVaultFiltersOptions {
  /** The program's vault view: folder ids are checked against its cabinet.
   *  Absent (the library search spans programs), a folder filter is refused. */
  view?: VaultViewId;
}

type Read = { values: string[] } | { refusal: VaultFilterRefusal };

function refuse(parameter: string, allowed: readonly string[] | undefined, message: string): { refusal: VaultFilterRefusal } {
  return { refusal: { error: 'INVALID_FILTER', parameter, ...(allowed ? { allowed } : {}), message } };
}

function tooMany(parameter: string, values: string[]): { refusal: VaultFilterRefusal } | null {
  return values.length > MAX_FILTER_VALUES
    ? refuse(parameter, undefined, `At most ${MAX_FILTER_VALUES} values of ${parameter} can be given.`) : null;
}

/** A closed vocabulary: every value must be one of `allowed`. */
function readClosed(query: Record<string, unknown>, parameter: string, allowed: readonly string[]): Read {
  const values = vaultFilterValues(query[parameter]);
  const bad = values.find((v) => !allowed.includes(v));
  return tooMany(parameter, values)
    ?? (bad !== undefined ? refuse(parameter, allowed, `'${bad}' is not a ${parameter} the Vault records.`) : { values });
}

/** A folder of the program's own cabinet; meaningless without one program's view. */
function readFolders(query: Record<string, unknown>, view: VaultViewId | undefined): Read {
  const values = vaultFilterValues(query.folderId);
  if (!values.length) return { values };
  if (!view) return refuse('folderId', undefined, 'A folder is one project\'s cabinet; filter by folder within a project.');
  const allowed = foldersForView(view).map((f) => f.id);
  const bad = values.find((v) => !allowed.includes(v));
  return tooMany('folderId', values)
    ?? (bad !== undefined ? refuse('folderId', allowed, `Folder '${bad}' does not exist in this project's ${view} vault.`) : { values });
}

/** CTD section codes, normalised the one way (normalizeCtdCode). */
function readSections(query: Record<string, unknown>): Read {
  const values = vaultFilterValues(query.ctdSection);
  const bad = values.find((v) => normalizeCtdCode(v) === null);
  if (bad !== undefined) return refuse('ctdSection', undefined, `'${bad}' is not a CTD section code (for example 3.2.P or 2.7.3).`);
  return tooMany('ctdSection', values) ?? { values: [...new Set(values.map((v) => normalizeCtdCode(v)!))] };
}

const CLOSED_FILTERS: Array<[keyof VaultDocumentFilters, readonly string[]]> = [
  ['documentTypes', VAULT_INGEST_DOCUMENT_TYPES],
  ['classifications', VAULT_CLASSIFICATIONS],
  ['evidenceKinds', VAULT_DOC_KINDS.map((k) => k.value)],
  ['placementStatuses', VAULT_PLACEMENT_STATUSES],
  ['lifecycleStages', VAULT_LIFECYCLE_STAGE_FILTERS],
];

/**
 * Read the filter parameters from a request query. Pure: it reads nothing, so a
 * refusal is answered before any corpus read.
 */
export function parseVaultFilters(
  query: Record<string, unknown>,
  opts: ParseVaultFiltersOptions = {},
): { filters: VaultDocumentFilters } | { refusal: VaultFilterRefusal } {
  // processing_status is not part of the read model (vault-document-index.service.ts:
  // nothing advances it off PENDING). The public API refuses it by name; so does this.
  if (query.processingStatus !== undefined) {
    return { refusal: {
      error: 'UNSUPPORTED_PARAMETER', parameter: 'processingStatus',
      message: 'processingStatus is not recorded for Vault documents, so it cannot be filtered on.',
    } };
  }
  const reads: Array<[keyof VaultDocumentFilters, Read]> = [
    ...CLOSED_FILTERS.map(([key, allowed]) => [key, readClosed(query, VAULT_FILTER_PARAMETERS[key], allowed)] as [keyof VaultDocumentFilters, Read]),
    ['folderIds', readFolders(query, opts.view)],
    ['ctdSections', readSections(query)],
  ];
  const filters: Record<string, string[]> = {};
  for (const [key, read] of reads) {
    if ('refusal' in read) return read;
    if (read.values.length) filters[key] = read.values;
  }
  return { filters: filters as VaultDocumentFilters };
}

/** Whether the query names any filter value at all (blanks are not filters). */
export function vaultFiltersAsked(query: Record<string, unknown>): boolean {
  return Object.values(VAULT_FILTER_PARAMETERS).some((p) => vaultFilterValues(query[p]).length > 0);
}

/** The paging every Vault search route reads: q, limit 1..100 (default 25), offset, earlier versions. */
export function readVaultSearchPaging(query: Record<string, unknown>): { q: string; limit: number; offset: number; includeSuperseded: boolean } {
  return {
    q: typeof query.q === 'string' ? query.q.trim() : '',
    limit: Math.min(Math.max(parseInt(String(query.limit ?? '25'), 10) || 25, 1), 100),
    offset: Math.max(parseInt(String(query.offset ?? '0'), 10) || 0, 0),
    // Current versions only unless asked (VR-09).
    includeSuperseded: query.includeSuperseded === 'true',
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The library search's filters: no folder (it spans projects), plus a
 * repeatable `programId` that narrows the verified accessible set and never
 * widens it.
 */
export function parseLibrarySearchFilters(
  query: Record<string, unknown>,
): { filters: VaultDocumentFilters; programIds: string[] } | { refusal: VaultFilterRefusal } {
  const parsed = parseVaultFilters(query);
  if ('refusal' in parsed) return parsed;
  const programIds = vaultFilterValues(query.programId);
  const bad = programIds.find((p) => !UUID.test(p));
  return bad !== undefined
    ? refuse('programId', undefined, `'${bad}' is not a project id.`)
    : { filters: parsed.filters, programIds };
}

/**
 * One program's search filters. The folder is checked against that program's
 * cabinet, so its view is read only when a folder was asked for.
 */
export async function parseProgramSearchFilters(
  query: Record<string, unknown>,
  resolveView: () => Promise<VaultViewId>,
): Promise<{ filters: VaultDocumentFilters } | { refusal: VaultFilterRefusal }> {
  const view = vaultFilterValues(query.folderId).length ? await resolveView() : undefined;
  return parseVaultFilters(query, { view });
}

/**
 * The stored section, read the way {@link normalizeCtdCode} reads it: trimmed,
 * a leading 'm' dropped, upper case. NULL-safe.
 */
function ctdNormalisedSql(alias: string): string {
  return `upper(btrim(regexp_replace(btrim(${alias}.ctd_section), '^m', '', 'i')))`;
}

/** The section-code shape normalizeCtdCode accepts, after normalising. */
const CTD_CODE_SQL = `'^[1-5](\\.[0-9A-Z]+)*$'`;

/**
 * Whole-segment "within", as `ctdCodeWithin` (shared/regulatory/section-code.ts)
 * answers it: 3.2.P.5.1 is within 3.2.P.5; 3.2.P.50 is not. A stored value that
 * is not code-shaped is within nothing, as in JS.
 */
export function ctdWithinSql(alias: string, codesParam: string, prefixesParam: string): string {
  const n = ctdNormalisedSql(alias);
  return `(${n} ~ ${CTD_CODE_SQL} AND (${n} = ANY(${codesParam}::text[]) OR ${n} LIKE ANY(${prefixesParam}::text[])))`;
}

/** "Unfiled" exactly as the tree counts it: no folder, or a folder not filed. */
export function vaultUnfiledSql(alias: string): string {
  return `(${alias}.folder_id IS NULL OR COALESCE(${alias}.placement_status, 'unfiled') = 'unfiled')`;
}

/** A folder suggested by the classifier and not yet confirmed. */
export function vaultSuggestedSql(alias: string): string {
  return `(${alias}.folder_id IS NOT NULL AND ${alias}.placement_status = 'suggested')`;
}

function vaultConfirmedSql(alias: string): string {
  return `(${alias}.folder_id IS NOT NULL AND ${alias}.placement_status = 'confirmed')`;
}

/**
 * A version's lifecycle stage: the first canonical document recorded for it, in
 * the document's own organisation. NULL when none is ("Not sent for review").
 * Every caller binds `<alias>.organization_id` to the caller's organisation in
 * the same statement (the search's `d.organization_id = $1`, the tree's
 * `d.organization_id=$2`), so a record in another organisation never answers.
 * One argument, a literal alias: the SQL-interpolation gate proves this builder
 * per caller (scripts/ci/lib/approved-sql-predicates.mjs).
 */
export function vaultLifecycleStageSql(alias: string): string {
  // One line: a statement's own WHERE starts a line, a subquery's stays inline
  // (the tenant-scope test compares the count's WHERE with the page's).
  return `(SELECT c.stage FROM canonical_documents c WHERE c.organization_id = ${alias}.organization_id AND c.source_refs ? 'vault_documents' AND c.source_refs -> 'vault_documents' ->> 'nativeId' = ${alias}.id::text ORDER BY c.created_at, c.canonical_id LIMIT 1)`;
}

export interface VaultFilterSqlOptions {
  /** 'within' (in-app, whole segments) or 'exact' (the public API's raw match). */
  ctdMatch?: 'within' | 'exact';
}

/** Filters that are one column matched against a list of values. */
const COLUMN_FILTERS: Array<[keyof VaultDocumentFilters, string]> = [
  ['documentTypes', 'document_type'],
  ['classifications', 'classification::text'],
  ['evidenceKinds', 'evidence_kind'],
  ['folderIds', 'folder_id'],
];

type Bind = (value: unknown) => string;

function placementSql(statuses: VaultPlacementStatus[] | undefined, alias: string): string {
  if (!statuses?.length) return '';
  const one = { unfiled: vaultUnfiledSql, suggested: vaultSuggestedSql, confirmed: vaultConfirmedSql };
  return ` AND (${statuses.map((s) => one[s](alias)).join(' OR ')})`;
}

function ctdSql(codes: string[] | undefined, alias: string, bind: Bind, match: 'within' | 'exact'): string {
  if (!codes?.length) return '';
  if (match === 'exact') return ` AND ${alias}.ctd_section = ANY(${bind(codes)}::text[])`;
  return ` AND ${ctdWithinSql(alias, bind(codes), bind(codes.map((c) => `${c}.%`)))}`;
}

function stageSql(stages: string[] | undefined, alias: string, bind: Bind): string {
  if (!stages?.length) return '';
  const stage = vaultLifecycleStageSql(alias);
  const named = stages.filter((s) => s !== VAULT_STAGE_NONE);
  const parts = named.length ? [`${stage} = ANY(${bind(named)}::text[])`] : [];
  if (stages.includes(VAULT_STAGE_NONE)) parts.push(`${stage} IS NULL`);
  return ` AND (${parts.join(' OR ')})`;
}

/**
 * The filters as SQL conjuncts (each begins with ' AND '), pushing their values
 * onto `params`. Positions already in `params` are left where they are.
 */
export function vaultFilterSql(
  filters: VaultDocumentFilters | undefined,
  params: unknown[],
  alias: string,
  opts: VaultFilterSqlOptions = {},
): string {
  if (!filters) return '';
  const bind: Bind = (value) => { params.push(value); return `$${params.length}`; };
  let sql = '';
  for (const [key, column] of COLUMN_FILTERS) {
    const values = filters[key];
    if (values?.length) sql += ` AND ${alias}.${column} = ANY(${bind(values)}::text[])`;
  }
  return sql
    + placementSql(filters.placementStatuses, alias)
    + ctdSql(filters.ctdSections, alias, bind, opts.ctdMatch ?? 'within')
    + stageSql(filters.lifecycleStages, alias, bind);
}
