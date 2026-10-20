/** Reporting reads the existing project sharing policy. No report grants access
 * to a project or document the caller cannot use through its canonical workspace. */
import { getPool } from '../../db';
import type { RequestSqlClient } from '../../db/requestDb';
import { applyProjectSharingState, canUseProject, getProjectSharingState, hasOrganizationProjectManagementRole } from '../project-sharing-access';

export interface ReportProjectActor { userId: number; role: string | null | undefined }

function positiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid project access identity');
  return value;
}

function allowedByProjectPolicy(row: Record<string, unknown>, actor: ReportProjectActor): boolean {
  const settings = row.settings && typeof row.settings === 'object' ? row.settings as Record<string, unknown> : {};
  const ownerId = typeof row.owner_id === 'number' ? row.owner_id : null;
  const createdById = typeof row.created_by_id === 'number' ? row.created_by_id : null;
  const fallback = getProjectSharingState({ settings, ownerId, createdById });
  if (!Array.isArray(row.members)) throw new Error('Project sharing membership could not be read');
  const sharing = getProjectSharingState({
    settings: { projectSharing: { visibility: row.visibility ?? fallback.visibility, members: row.members } },
    ownerId, createdById,
  });
  return canUseProject({ actor: { userId: actor.userId, orgRole: actor.role },
    project: { ownerId, createdById, settings: applyProjectSharingState(settings, sharing) } }) || row.review_assigned === true;
}

async function accessibleProjectIds(organizationId: number, actor: ReportProjectActor, client: RequestSqlClient, projectId?: number): Promise<number[]> {
  positiveId(organizationId);
  positiveId(actor.userId);
  if (projectId !== undefined) positiveId(projectId);
  const { rows } = await client.query(`
    SELECT p.id, p.owner_id, p.created_by_id, p.settings, v.visibility,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role, 'status', m.status))
        FROM project_members m WHERE m.project_id = p.id AND m.organization_id = p.organization_id AND m.status = 'active'), '[]'::jsonb) AS members,
      EXISTS(SELECT 1 FROM concept2cure_review_assignments ra JOIN concept2cure_artifacts a ON a.id = ra.artifact_id
        WHERE ra.reviewer_id = $2 AND ra.organization_id = $1 AND a.organization_id = $1
          AND a.project_id = p.id AND ra.status = 'pending') AS review_assigned
    FROM projects p LEFT JOIN project_visibility_settings v ON v.project_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = $1 AND ($3::int IS NULL OR p.id = $3)
    ORDER BY p.id`, [organizationId, actor.userId, projectId ?? null]);
  return rows.filter(row => allowedByProjectPolicy(row, actor)).map(row => positiveId(row.id));
}

/** Read failures throw; [] means an actual evaluated denial/empty set. */
export function getAccessibleReportProjectIds(organizationId: number, actor: ReportProjectActor, client: RequestSqlClient = getPool()): Promise<number[]> {
  return accessibleProjectIds(organizationId, actor, client);
}

export async function canAccessReportProject(organizationId: number, actor: ReportProjectActor, projectId: number, client: RequestSqlClient = getPool()): Promise<boolean> {
  return (await accessibleProjectIds(organizationId, actor, client, projectId)).includes(projectId);
}

export interface ReportAccessScope {
  scopeType: string; scopeId: string; organizationId?: number;
  /** Saved output is bound to the source projects actually computed then. */
  recorded?: boolean; dependencySummary?: unknown; accessProjectIds?: readonly number[];
}

function recordedProjectEvidence(scope: ReportAccessScope): { present: boolean; value: unknown } {
  const dependencies = scope.dependencySummary && typeof scope.dependencySummary === 'object' ? scope.dependencySummary as Record<string, unknown> : {};
  const summary = dependencies.summary && typeof dependencies.summary === 'object' ? dependencies.summary as Record<string, unknown> : {};
  if (Object.prototype.hasOwnProperty.call(scope, 'accessProjectIds')) return { present: true, value: scope.accessProjectIds };
  return { present: Object.prototype.hasOwnProperty.call(summary, 'accessProjectIds'), value: summary.accessProjectIds };
}
export function recordedReportProjectIds(scope: ReportAccessScope): readonly number[] | null {
  const ids = recordedProjectEvidence(scope).value;
  return Array.isArray(ids) && ids.every(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ? ids : null;
}

async function canAccessProgramScope(organizationId: number, actor: ReportProjectActor, scope: ReportAccessScope, allowed: Set<number>, client: RequestSqlClient): Promise<boolean> {
  if (scope.recorded || scope.dependencySummary !== undefined) {
    const recordedIds = recordedReportProjectIds(scope);
    if (recordedIds) return recordedIds.every(id => allowed.has(id));
    if (!hasOrganizationProjectManagementRole(actor.role)) return false;
  }
  const { rows } = await client.query(`SELECT gp.project_id FROM report_program_groups g
    LEFT JOIN report_program_group_projects gp ON gp.program_group_id = g.id AND gp.organization_id = g.organization_id
    WHERE g.id::text = $1 AND g.organization_id = $2`, [scope.scopeId, organizationId]);
  return rows.length > 0 && rows.every(row => row.project_id == null || allowed.has(positiveId(row.project_id)));
}

/** The saved scope's parent projects, including archived records retained for
 * audit. Scope existence and project permission are different checks. */
export async function canAccessReportScope(organizationId: number, actor: ReportProjectActor, scope: ReportAccessScope, client: RequestSqlClient = getPool(), accessibleIds?: readonly number[]): Promise<boolean> {
  if (scope.organizationId !== undefined && scope.organizationId !== organizationId) return false;
  const sourceIds = recordedReportProjectIds(scope);
  if (recordedProjectEvidence(scope).present && sourceIds === null) return false;
  if (scope.scopeType === 'account' && !sourceIds?.length) return scope.scopeId === String(organizationId);
  const allowed = new Set(accessibleIds ?? await getAccessibleReportProjectIds(organizationId, actor, client));
  if (sourceIds && !sourceIds.every(id => allowed.has(id))) return false;
  return canAccessAdmittedReportScope(organizationId, actor, scope, allowed, client);
}

/** Scope-specific parents are checked only after saved source admission. The
 * same caller-owned executor and evaluated project set reach every branch. */
async function canAccessAdmittedReportScope(organizationId: number, actor: ReportProjectActor, scope: ReportAccessScope, allowed: Set<number>, client: RequestSqlClient): Promise<boolean> {
  if (scope.scopeType === 'account') return scope.scopeId === String(organizationId);
  if (scope.scopeType === 'project') return allowed.has(Number(scope.scopeId));
  if (scope.scopeType === 'document' || scope.scopeType === 'submission') {
    const document = scope.scopeType === 'document';
    const statement = document
      ? `SELECT s.project_id FROM concept2cure_artifacts s JOIN projects p ON p.id = s.project_id WHERE s.artifact_id = $1 AND s.organization_id = $2 AND p.organization_id = $2`
      : `SELECT s.project_id FROM c2c_submissions s JOIN projects p ON p.id = s.project_id WHERE s.id::text = $1 AND s.organization_id = $2 AND p.organization_id = $2`;
    const { rows } = await client.query(statement, [scope.scopeId, organizationId]);
    return rows.length === 1 && allowed.has(positiveId(rows[0].project_id));
  }
  if (scope.scopeType === 'program') {
    return canAccessProgramScope(organizationId, actor, scope, allowed, client);
  }
  return false;
}
