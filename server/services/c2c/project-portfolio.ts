/** The portfolio card shared by GET and the canonical creator's 201 response.
 * Client means the anchor's workspace, never the regulatory applicant sponsor. */
import { pathwaySqlCase, workstreamSqlCase, WORKSTREAM_FILING_TYPES, type Workstream } from '../../../shared/constants/domain/product-types';
import { REGULATORY_PATHWAYS, type RegulatoryPathway } from '../../../shared/constants/mdx';
import { projectIntakeId } from '../../../shared/project-intake-workspace';
import type { ProgramAccessExecutor, VerifiedProgramAnchor } from './current-program-access';

const PROJECT_CARD_SELECT = `SELECT p.id::text AS id,
  p.name AS title,
  ${workstreamSqlCase('p.program_type', 'p.product_type')} AS ws,
  ${pathwaySqlCase('p.program_type', 'p.regulatory_path')} AS pathway,
  COALESCE(p.code, '—') AS code,
  initcap(replace(COALESCE(p.phase, 'planning'), '_', ' ')) AS stage,
  p.status AS status,
  COALESCE(u.name, u.email, '—') AS lead,
  NULL::text AS blocker,
  COALESCE(to_char(p.target_submission_date, 'Mon DD, YYYY'), '—') AS due,
  to_char(p.target_submission_date, 'YYYY-MM-DD') AS due_date,
  'Updated ' || to_char(p.updated_at, 'Mon DD') AS activity,
  cw.id AS client_workspace_id, cw.name AS client_name`;

/** Both callers below build fixed SQL statements at module load. The only
 * substitutions here are their literal placeholder positions, never input. */
function projectAnchorFrom(anchorParameter: '$3' | '$6'): string {
  return `FROM regulatory_programs p
    JOIN jsonb_to_recordset(${anchorParameter}::jsonb) AS admitted(program_id uuid, project_id int, client_workspace_id int)
      ON admitted.program_id=p.id
    JOIN projects anchor ON anchor.id=admitted.project_id AND anchor.organization_id=p.organization_id
      AND anchor.regulatory_program_id=p.id AND anchor.status IS DISTINCT FROM 'deleted'
      AND anchor.client_workspace_id IS NOT DISTINCT FROM admitted.client_workspace_id
    LEFT JOIN client_workspaces cw ON cw.id=anchor.client_workspace_id AND cw.organization_id=p.organization_id`;
}

const PROJECT_CARD_ACTOR = 'LEFT JOIN LATERAL public.actor_name(p.lead_user_id) u ON TRUE';
export const PROJECT_CARD_LIST_SQL = `${PROJECT_CARD_SELECT}
  ${projectAnchorFrom('$6')} ${PROJECT_CARD_ACTOR}
  WHERE p.organization_id = $1 AND p.deleted_at IS NULL AND p.id=ANY($5::uuid[])
    AND ($4::boolean OR p.status <> 'archived') AND ($7::int IS NULL OR cw.id=$7)
    AND ($8::text IS NULL OR ${workstreamSqlCase('p.program_type', 'p.product_type')}=$8)
    AND ($9::text IS NULL OR ${pathwaySqlCase('p.program_type', 'p.regulatory_path')}=$9)
  ORDER BY p.updated_at DESC, p.id LIMIT $2 OFFSET $3`;
export const PROJECT_CARD_CREATED_SQL = `${PROJECT_CARD_SELECT}
  ${projectAnchorFrom('$3')} ${PROJECT_CARD_ACTOR}
  WHERE p.id=$1 AND p.organization_id=$2 AND p.deleted_at IS NULL`;
const PORTFOLIO_CLIENTS_SQL = `SELECT DISTINCT cw.id, cw.name
  ${projectAnchorFrom('$3')}
  WHERE p.organization_id=$1 AND p.deleted_at IS NULL AND ($2::boolean OR p.status<>'archived')
    AND cw.status='active'
  ORDER BY cw.name, cw.id LIMIT 201`;

export function portfolioAnchorJson(anchors: readonly VerifiedProgramAnchor[]): string {
  return JSON.stringify(anchors.map(anchor => ({program_id:anchor.programId,project_id:anchor.projectId,
    client_workspace_id:anchor.clientWorkspaceId})));
}

export function portfolioClientFilter(raw: unknown): number | null {
  if (raw === undefined) return null;
  const id = typeof raw === 'string' ? projectIntakeId(raw) : null;
  if (id === null) {
    throw new Error('INVALID_CLIENT_WORKSPACE');
  }
  return id;
}

/** Options cover the accessible portfolio, independently of page and selected
 * client. Only minimal active workspace metadata is returned, with an honest
 * probe-row flag when more than 200 choices exist. */
export async function readPortfolioClients(q: ProgramAccessExecutor, organizationId: number,
  anchors: readonly VerifiedProgramAnchor[], includeArchived: boolean): Promise<{
    clients: Array<{id:number;name:string}>; clientsHasMore: boolean;
  }> {
  if (!anchors.some(anchor => anchor.clientWorkspaceId !== null)) return {clients:[],clientsHasMore:false};
  const {rows} = await q.query(PORTFOLIO_CLIENTS_SQL, [organizationId,includeArchived,portfolioAnchorJson(anchors)]);
  const clients = rows.slice(0,200).map(row => {
    const id = projectIntakeId(row.id);
    if (id === null || typeof row.name !== 'string' || !row.name.trim()) throw new Error('Client identity could not be read');
    return {id,name:row.name};
  });
  return {clients,clientsHasMore:rows.length>200};
}


/** These facets intentionally keep their own choice available: workstreams
 * cover the selected Client; pathways cover Client+workstream. Only total and
 * filingSoon apply every selected filter. All are inside accepted anchors,
 * independently of LIMIT/OFFSET and without dossier measurements. */
const PORTFOLIO_COUNTS_SQL = `WITH portfolio AS (
  SELECT ${workstreamSqlCase('p.program_type', 'p.product_type')} AS ws,
    ${pathwaySqlCase('p.program_type', 'p.regulatory_path')} AS pathway,
    p.target_submission_date
  ${projectAnchorFrom('$3')}
  WHERE p.organization_id=$1 AND p.deleted_at IS NULL
    AND ($2::boolean OR p.status<>'archived') AND ($4::int IS NULL OR cw.id=$4)
), workstream AS (
  SELECT * FROM portfolio WHERE $5::text IS NULL OR ws=$5
), selected AS (
  SELECT * FROM workstream WHERE $6::text IS NULL OR pathway=$6
)
SELECT jsonb_build_object(
  'total', (SELECT count(*) FROM selected),
  'byWorkstream', (SELECT COALESCE(jsonb_object_agg(ws,n), '{}'::jsonb)
    FROM (SELECT ws,count(*) AS n FROM portfolio GROUP BY ws) groups),
  'byPathway', (SELECT COALESCE(jsonb_object_agg(pathway,n), '{}'::jsonb)
    FROM (SELECT pathway,count(*) AS n FROM workstream GROUP BY pathway) groups),
  'filingWithin60Days', (SELECT count(*) FROM selected
    WHERE target_submission_date>=current_date AND target_submission_date<current_date+60)
) AS portfolio_counts`;

export interface PortfolioCounts {
  total: number;
  byWorkstream: Record<string, number>;
  byPathway: Record<string, number>;
  filingWithin60Days: number;
}

/** An omitted filter or the explicit All choice means no SQL restriction.
 * Reject arrays, empty strings, wrong casing and arbitrary unknown values. */
function closedPortfolioFilter<T extends string>(raw: unknown, choices: readonly T[]): T | null {
  if (raw === undefined || raw === 'all') return null;
  if (typeof raw !== 'string' || !choices.includes(raw as T)) throw new Error('INVALID_PORTFOLIO_FILTER');
  return raw as T;
}

export function portfolioWorkstreamFilter(raw: unknown): Workstream | null {
  return closedPortfolioFilter(raw, Object.keys(WORKSTREAM_FILING_TYPES) as Workstream[]);
}

export function portfolioPathwayFilter(raw: unknown): RegulatoryPathway | null {
  return closedPortfolioFilter(raw, REGULATORY_PATHWAYS);
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function isCountMap(value: unknown): value is Record<string, number> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(isCount);
}

export async function readPortfolioCounts(q: ProgramAccessExecutor, input: {
  organizationId: number; anchors: readonly VerifiedProgramAnchor[]; includeArchived: boolean;
  clientWorkspaceId: number | null; workstream: Workstream | null; pathway: RegulatoryPathway | null;
}): Promise<PortfolioCounts> {
  const {rows} = await q.query(PORTFOLIO_COUNTS_SQL, [input.organizationId, input.includeArchived,
    portfolioAnchorJson(input.anchors), input.clientWorkspaceId, input.workstream, input.pathway]);
  const counts = rows[0]?.portfolio_counts;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new Error('Portfolio counts could not be read');
  const c = counts as Record<string, unknown>;
  if (!isCount(c.total) || !isCount(c.filingWithin60Days) || !isCountMap(c.byWorkstream) || !isCountMap(c.byPathway)) {
    throw new Error('Portfolio counts could not be read');
  }
  return {total:c.total, byWorkstream:c.byWorkstream, byPathway:c.byPathway, filingWithin60Days:c.filingWithin60Days};
}
