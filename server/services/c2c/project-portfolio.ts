/** The portfolio card shared by GET and the canonical creator's 201 response.
 * Client means the anchor's workspace, never the regulatory applicant sponsor. */
import { workstreamSqlCase } from '../../../shared/constants/domain/product-types';
import { projectIntakeId } from '../../../shared/project-intake-workspace';
import type { ProgramAccessExecutor, VerifiedProgramAnchor } from './current-program-access';

const PROJECT_CARD_SELECT = `SELECT p.id::text AS id,
  p.name AS title,
  ${workstreamSqlCase('p.program_type', 'p.product_type')} AS ws,
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
