/**
 * Whether ids a reporting request names belong to the session's organisation.
 *
 * A program group, delivery, captured letter or prediction names projects and
 * submissions by id; an id from another tenant must read as not found rather
 * than become a membership, a computed result or a stored record pointing across
 * the boundary. report_program_group_projects has no organization column and no
 * RLS policy, so nothing below the app would stop it. These lived in
 * routes/report-os.ts; the prediction run needed them too (reporting review
 * 2026-10-01), so they moved here rather than being copied. A client workspace
 * id in a body is the same kind of claim (IAM-15's P1-7b rule; the review's
 * SECURITY-7): every reporting write that stores one checks it here.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, getPool } from '../../db';
import { projects } from '@shared/schema';
import { FeatureToggleService } from '../featureToggleService';

/** Which of `projectIds` belong to `organizationId`. */
export async function projectsInOrg(organizationId: number, projectIds: number[]): Promise<Set<number>> {
  if (projectIds.length === 0) return new Set();
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), inArray(projects.id, projectIds)));
  return new Set(rows.map(row => row.id));
}

/**
 * One project of `organizationId`, with what to call it, or null when it is not
 * this organisation's. A report names its scope by this (QA 2026-10-08, j8: the
 * digest read "for project 1").
 */
export async function projectInOrg(
  organizationId: number,
  projectId: number,
): Promise<{ id: number; code: string | null; name: string | null } | null> {
  if (!Number.isSafeInteger(projectId)) return null;
  const [row] = await db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)))
    .limit(1);
  return row ? { id: row.id, code: row.code ?? null, name: row.name ?? null } : null;
}

/** What a report calls a project: its name, else its code; never its row id. */
export function projectScopeLabel(project: { code: string | null; name: string | null }): string | null {
  const name = project.name?.trim();
  if (name) return name;
  const code = project.code?.trim();
  return code || null;
}

/** Whether `submissionId` is a submission of `projectId` in `organizationId`. */
export async function submissionInProject(
  organizationId: number,
  projectId: number,
  submissionId: string
): Promise<boolean> {
  const { rows } = await getPool().query(
    `SELECT 1 FROM c2c_submissions
      WHERE id::text = $1 AND organization_id = $2 AND project_id = $3
      LIMIT 1`,
    [submissionId, organizationId, projectId]
  );
  return rows.length > 0;
}

/**
 * Whether a body's client workspace id may be stored for `organizationId`:
 * absent, or one of its workspaces. A foreign id and an unknown one get the same
 * answer, so the refusal says nothing about another organisation's workspaces.
 */
export async function workspaceIsOrganisations(organizationId: number, clientWorkspaceId: number | null | undefined): Promise<boolean> {
  return clientWorkspaceId == null || FeatureToggleService.workspaceInOrganization(clientWorkspaceId, organizationId);
}

/** The 403 body for a workspace that is not the organisation's. */
export const WORKSPACE_NOT_IN_ORGANIZATION = {
  error: 'That client workspace is not in your organization.',
  code: 'WORKSPACE_NOT_IN_ORGANIZATION',
} as const;
