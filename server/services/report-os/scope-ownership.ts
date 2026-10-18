/** Shared ownership boundary for interactive and scheduled report scopes. */
import { getPool } from '../../db';
import type { RequestSqlClient } from '../../db/requestDb';

export class ReportScopeOwnershipError extends Error {
  constructor(message: string, public readonly code = 'REPORT_SCOPE_NOT_FOUND', public readonly status = 404) { super(message); }
}

export interface OwnedReportScopeInput {
  organizationId: number;
  scopeType: string;
  scopeId: string;
  clientWorkspaceId?: number | null;
  /** Internal proof returned by the route's project ownership/workspace reads;
   * never copied from a request body. Other callers use the SQL read below. */
  verifiedProject?: { id: number; organizationId: number; clientWorkspaceId?: number | null };
}
export interface OwnedReportScope { projectId: number | null; programProjectIds?: number[] }

const missing = () => new ReportScopeOwnershipError('Report scope not found in this organization and client workspace.');

function ownedProjectId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw missing();
  return value;
}

async function ownedProgram(input: OwnedReportScopeInput, client: RequestSqlClient): Promise<OwnedReportScope> {
  const groupSql = input.clientWorkspaceId == null
    ? `SELECT id FROM report_program_groups WHERE id::text = $1 AND organization_id = $2 AND status = 'active'`
    : `SELECT id FROM report_program_groups WHERE id::text = $1 AND organization_id = $2 AND status = 'active' AND client_workspace_id = $3`;
  const groupParams = [input.scopeId, input.organizationId, ...(input.clientWorkspaceId == null ? [] : [input.clientWorkspaceId])];
  const group = await client.query(
    groupSql, groupParams,
  );
  if (!group.rows.length) throw missing();
  const projects = await client.query(
    `SELECT gp.project_id, p.organization_id, p.client_workspace_id, p.status
     FROM report_program_group_projects gp JOIN report_program_groups g ON g.id = gp.program_group_id AND g.organization_id = gp.organization_id
     LEFT JOIN projects p ON p.id = gp.project_id AND p.organization_id = gp.organization_id
     WHERE gp.program_group_id::text = $1 AND gp.organization_id = $2 AND g.organization_id = $2`, [input.scopeId, input.organizationId],
  );
  if (projects.rows.some(row => row.organization_id !== input.organizationId || row.status === 'archived' ||
      (input.clientWorkspaceId != null && row.client_workspace_id !== input.clientWorkspaceId))) throw missing();
  return { projectId: null, programProjectIds: projects.rows.map(row => ownedProjectId(row.project_id)) };
}

async function ownedProject(input: OwnedReportScopeInput, client: RequestSqlClient): Promise<OwnedReportScope> {
  const projectId = /^\d+$/.test(input.scopeId) ? Number(input.scopeId) : NaN;
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw missing();
  if (input.verifiedProject) {
    const proof = input.verifiedProject;
    if (proof.id !== projectId || proof.organizationId !== input.organizationId ||
        (input.clientWorkspaceId != null && proof.clientWorkspaceId !== input.clientWorkspaceId)) throw missing();
  } else {
    const projectSql = input.clientWorkspaceId == null
      ? `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND status <> 'archived'`
      : `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND status <> 'archived' AND client_workspace_id = $3`;
    const project = await client.query(projectSql,
      [projectId, input.organizationId, ...(input.clientWorkspaceId == null ? [] : [input.clientWorkspaceId])]);
    if (!project.rows.length) throw missing();
  }
  return { projectId };
}

async function ownedLinkedRecord(input: OwnedReportScopeInput, client: RequestSqlClient): Promise<OwnedReportScope> {
  const document = input.scopeType === 'document';
  const statements = document ? [
    `SELECT s.project_id FROM concept2cure_artifacts s JOIN projects p ON p.id = s.project_id
       WHERE s.artifact_id = $1 AND s.organization_id = $2 AND p.organization_id = $2 AND p.status <> 'archived'`,
    `SELECT s.project_id FROM concept2cure_artifacts s JOIN projects p ON p.id = s.project_id
       WHERE s.artifact_id = $1 AND s.organization_id = $2 AND p.organization_id = $2
       AND p.status <> 'archived' AND p.client_workspace_id = $3`,
  ] as const : [
    `SELECT s.project_id FROM c2c_submissions s JOIN projects p ON p.id = s.project_id
       WHERE s.id::text = $1 AND s.organization_id = $2 AND p.organization_id = $2 AND p.status <> 'archived'`,
    `SELECT s.project_id FROM c2c_submissions s JOIN projects p ON p.id = s.project_id
       WHERE s.id::text = $1 AND s.organization_id = $2 AND p.organization_id = $2
       AND p.status <> 'archived' AND p.client_workspace_id = $3`,
  ] as const;
  const statement = statements[input.clientWorkspaceId == null ? 0 : 1];
  const record = await client.query(statement, [input.scopeId, input.organizationId, ...(input.clientWorkspaceId == null ? [] : [input.clientWorkspaceId])]);
  if (!record.rows.length) throw missing();
  return { projectId: ownedProjectId(record.rows[0].project_id) };
}

export async function resolveOwnedReportScope(input: OwnedReportScopeInput, client: RequestSqlClient = getPool()): Promise<OwnedReportScope> {
  if (!Number.isSafeInteger(input.organizationId) || input.organizationId <= 0) throw missing();
  // A route proof already includes its workspace validation. Worker and all
  // non-project scopes validate the active workspace here.
  if (input.clientWorkspaceId != null && !input.verifiedProject) {
    const workspace = await client.query('SELECT id FROM client_workspaces WHERE id = $1 AND organization_id = $2 AND status = $3', [input.clientWorkspaceId, input.organizationId, 'active']);
    if (!workspace.rows.length) throw missing();
  }
  if (input.scopeType === 'account') {
    if (input.scopeId !== String(input.organizationId) || input.clientWorkspaceId != null) throw missing();
    return { projectId: null };
  }
  if (input.scopeType === 'project') return ownedProject(input, client);
  if (input.scopeType === 'program') return ownedProgram(input, client);
  if (input.scopeType === 'document' || input.scopeType === 'submission') return ownedLinkedRecord(input, client);
  throw new ReportScopeOwnershipError('This report scope is unavailable until its ownership can be verified.', 'REPORT_SCOPE_UNSUPPORTED', 422);
}
