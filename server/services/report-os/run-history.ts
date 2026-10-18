/**
 * The saved-report register reads the canonical report_runs records. Search and
 * sorting happen before pagination; the total and page share one SQL snapshot.
 */
import { getPool } from '../../db/runtime';
import type { RequestSqlClient } from '../../db/requestDb';
import type { reportRuns } from '../../../shared/schema/report-os';

export type ReportRunHistorySort =
  | 'createdAt'
  | 'completedAt'
  | 'confidence'
  | 'status'
  | 'reportType'
  | 'scopeType';

export interface ReportRunHistoryFilters {
  runId?: number;
  scopeType?: string;
  scopeId?: string;
  status?: string;
  reportTypeId?: string;
  clientWorkspaceId?: number;
  search?: string;
  sortBy?: ReportRunHistorySort;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  /** Server-resolved sharing-policy result, never accepted from req.query. */
  accessibleProjectIds?: readonly number[];
  /** Canonical organization project administrators may inspect unbound legacy program output. */
  allowUnboundProgramReports?: boolean;
}

export type ReportRunHistoryRow = typeof reportRuns.$inferSelect & {
  reportTypeLabel: string;
  regionCode: string | null;
  registryId: string | null;
  agency: string | null;
  scopeLabel: string | null;
  /** Actual recorded computation scope, which may differ from requested scope. */
  computedScope: string;
};

export interface ReportRunHistory {
  data: ReportRunHistoryRow[];
  meta: { limit: number; offset: number; total: number; hasMore: boolean };
}

const SORT_COLUMNS: Record<ReportRunHistorySort, string> = {
  createdAt: 'createdAt',
  completedAt: 'completedAt',
  confidence: 'confidence',
  status: 'status',
  reportType: 'reportTypeLabel',
  scopeType: 'scopeType',
};

const reportTypeLabel = "COALESCE(NULLIF(t.label, ''), r.report_type_id)";
const regionCode = "COALESCE(r.dependency_summary::jsonb #>> '{summary,regulatory,regionCode}', r.dependency_summary::jsonb #>> '{summary,market,jurisdiction}')";
const registryId = "COALESCE(r.dependency_summary::jsonb #>> '{summary,regulatory,registryId}', r.dependency_summary::jsonb #>> '{summary,market,registryId}')";
const agency = "COALESCE(r.dependency_summary::jsonb #>> '{summary,regulatory,agency}', r.dependency_summary::jsonb #>> '{summary,market,agency}')";
const scopeLabel = "r.dependency_summary::jsonb #>> '{summary,scopeLabel}'";
const computedScope = `COALESCE(
  NULLIF(r.dependency_summary::jsonb #>> '{summary,computedScope}', ''),
  NULLIF(r.dependency_summary::jsonb #>> '{summary,domainScope}', ''),
  r.scope_type
)`;

function historyPagination(organizationId: number, filters: ReportRunHistoryFilters) {
  if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
    throw new Error('A valid organization is required for report history.');
  }
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Report history limit must be an integer between 1 and 500.');
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Report history offset must be a nonnegative integer.');
  }
  if (filters.clientWorkspaceId !== undefined &&
      (!Number.isSafeInteger(filters.clientWorkspaceId) || filters.clientWorkspaceId < 1)) {
    throw new Error('Report history client workspace must be a positive integer.');
  }
  return { limit, offset };
}

function historyOrdering(filters: ReportRunHistoryFilters) {
  const sortBy = filters.sortBy ?? 'createdAt';
  const sortOrder = filters.sortOrder ?? 'desc';
  if (!Object.prototype.hasOwnProperty.call(SORT_COLUMNS, sortBy) ||
      (sortOrder !== 'asc' && sortOrder !== 'desc')) {
    throw new Error('Invalid report history sort.');
  }
  // Column names and direction come only from the closed allowlists above.
  const column = SORT_COLUMNS[sortBy];
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const ordering = `"${column}" ${direction} NULLS LAST, "id" ${direction}`;
  return { column, direction, ordering };
}

/**
 * Pass requestPgClient(req) inside routes to reuse the tenant-scoped connection.
 * Workers may use the existing runtime pool within their established tenant
 * scope. Every query also predicates the organization explicitly.
 */
export async function listReportRunHistory(
  organizationId: number,
  filters: ReportRunHistoryFilters = {},
  client?: RequestSqlClient,
): Promise<ReportRunHistory> {
  const { limit, offset } = historyPagination(organizationId, filters);
  const { column, direction, ordering } = historyOrdering(filters);

  const params: unknown[] = [organizationId];
  const conditions = ['r.organization_id = $1'];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (filters.accessibleProjectIds !== undefined) {
    if (!filters.accessibleProjectIds.every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid accessible project IDs.');
    const permitted = bind(filters.accessibleProjectIds);
    const allowLegacy = bind(filters.allowUnboundProgramReports === true);
    conditions.push(`(
      (r.scope_type = 'account' AND r.scope_id = r.organization_id::text)
      OR (r.scope_type = 'project' AND r.scope_id = ANY(${permitted}::int[]::text[]))
      OR (r.scope_type = 'document' AND EXISTS(SELECT 1 FROM concept2cure_artifacts a
        WHERE a.artifact_id = r.scope_id AND a.organization_id = r.organization_id AND a.project_id = ANY(${permitted}::int[])))
      OR (r.scope_type = 'submission' AND EXISTS(SELECT 1 FROM c2c_submissions s
        WHERE s.id::text = r.scope_id AND s.organization_id = r.organization_id AND s.project_id = ANY(${permitted}::int[])))
      OR (r.scope_type = 'program'
        AND CASE WHEN jsonb_typeof(r.dependency_summary::jsonb #> '{summary,accessProjectIds}') = 'array' THEN
          NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.dependency_summary::jsonb #> '{summary,accessProjectIds}') AS recorded(id)
            WHERE jsonb_typeof(recorded.id) <> 'number' OR recorded.id::text !~ '^[1-9][0-9]*$'
              OR NOT(recorded.id::text = ANY(${permitted}::int[]::text[])))
          ELSE ${allowLegacy}::boolean AND EXISTS(SELECT 1 FROM report_program_groups g
            WHERE g.id::text = r.scope_id AND g.organization_id = r.organization_id
            AND NOT EXISTS(SELECT 1 FROM report_program_group_projects gp
              WHERE gp.program_group_id = g.id AND gp.organization_id = g.organization_id
                AND NOT(gp.project_id = ANY(${permitted}::int[])))) END)
    )`);
  }
  for (const [key, sqlColumn] of [
    ['runId', 'id'],
    ['scopeType', 'scope_type'], ['scopeId', 'scope_id'], ['status', 'status'],
    ['reportTypeId', 'report_type_id'], ['clientWorkspaceId', 'client_workspace_id'],
  ] as const) {
    const value = filters[key];
    if (value !== undefined) conditions.push(`r.${sqlColumn} = ${bind(value)}`);
  }

  const search = filters.search?.trim();
  if (search) {
    // Use ! as the LIKE escape character so %, _ and ! remain literal text.
    const pattern = bind(`%${search.replace(/[!%_]/g, '!$&')}%`);
    const expressions = [
      'r.run_uuid::text', 'r.scope_type', 'r.scope_id', 'r.status', 'r.report_type_id',
      reportTypeLabel, regionCode, registryId, agency, scopeLabel, computedScope,
    ];
    conditions.push(`(${expressions.map(expression => `${expression} ILIKE ${pattern} ESCAPE '!'`).join(' OR ')})`);
  }

  const limitParam = bind(limit);
  const offsetParam = bind(offset);
  const statement = `
    WITH matching_runs AS (
      SELECT
        r.id AS "id", r.run_uuid AS "runUuid", r.organization_id AS "organizationId",
        r.client_workspace_id AS "clientWorkspaceId", r.scope_type AS "scopeType",
        r.scope_id AS "scopeId", r.report_type_id AS "reportTypeId", r.status AS "status",
        r.requested_by AS "requestedBy", r.dependency_summary AS "dependencySummary",
        r.blockers AS "blockers", r.confidence AS "confidence", r.freshness AS "freshness",
        r.error AS "error", r.started_at AS "startedAt", r.completed_at AS "completedAt",
        r.created_at AS "createdAt", r.updated_at AS "updatedAt",
        ${reportTypeLabel} AS "reportTypeLabel", ${regionCode} AS "regionCode",
        ${registryId} AS "registryId", ${agency} AS "agency",
        ${scopeLabel} AS "scopeLabel", ${computedScope} AS "computedScope"
      FROM report_runs r
      LEFT JOIN report_type_registry t ON t.type_id = r.report_type_id
      WHERE ${conditions.join(' AND ')}
    )
    SELECT page.*, totals."__total"
    FROM (SELECT count(*) AS "__total" FROM matching_runs) totals
    LEFT JOIN LATERAL (
      SELECT * FROM matching_runs
      ORDER BY ${ordering}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    ) page ON TRUE
    ORDER BY page."${column}" ${direction} NULLS LAST, page."id" ${direction}
  `;

  const { rows } = await (client ?? getPool()).query(statement, params);
  const total = Number(rows[0]?.__total ?? 0);
  const data = rows.filter(row => row.id != null).map(({ __total: _total, ...row }) => row as ReportRunHistoryRow);
  return { data, meta: { limit, offset, total, hasMore: offset + data.length < total } };
}
