/**
 * Which project a /projects/:projectId/artifacts/… URL acts in, and which of
 * that project's artifacts it names (PF-17, project first).
 *
 * The artifact routes checked access on the URL's project and then loaded the
 * artifact by its id and organization alone. So a caller with access to
 * project A acted on, or read, project B's artifact in the same organization
 * through A's URL: its versions' full content, its signatures, its provenance,
 * a rollback, a review submission. And the access check parses an integer, so
 * every v2 surface — which holds the project as its program UUID — was
 * answered 404.
 *
 * Both halves are here, once:
 *   authorizedProjectId — the URL's project through the one translation rule
 *     (resolveCmcArtifactProject: an integer project of this organization, or
 *     the program's anchored project), asked strictly so a lookup that could
 *     not complete throws to the route's catch (500) rather than reading as
 *     "not found"; then access decided on THAT project.
 *   loadProjectArtifact — the artifact by id, organization AND that project.
 *     The row is checked against what was asked for as well as filtered by it.
 */
import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import type { db as runtimeDb } from '../../db';
import { concept2cureArtifacts } from '../../../shared/schema';
import { resolveCmcArtifactProject } from '../../services/cmc/resolve-cmc-artifact-project';
import { verifyProjectAccess } from './project-access';
import { paramStr } from './shared';

/** The integer project the URL names, when the caller may act in it; else null (answer 404). */
export async function authorizedProjectId(req: Request, organizationId: number): Promise<number | null> {
  const urlProject = paramStr(req.params.projectId).replace(/^proj_/, '');
  const spine = await resolveCmcArtifactProject(organizationId, urlProject, { strict: true });
  if (spine.state !== 'linked') return null;
  return (await verifyProjectAccess(req, String(spine.artifactProjectId))) ? spine.artifactProjectId : null;
}

export type ProjectArtifact = typeof concept2cureArtifacts.$inferSelect;

/**
 * The artifact the URL names, only when it is `projectId`'s own; else null
 * (answer 404). Read on the caller's handle: the route decides how it reaches
 * the database (today the shared pool, tracked in the requestDb backlog under
 * the route's own file), so this helper adds no second shared-pool entry.
 */
export async function loadProjectArtifact(
  db: Pick<typeof runtimeDb, 'select'>,
  organizationId: number,
  projectId: number,
  artifactId: string,
): Promise<ProjectArtifact | null> {
  const [artifact] = await db
    .select()
    .from(concept2cureArtifacts)
    .where(
      and(
        eq(concept2cureArtifacts.artifactId, artifactId),
        eq(concept2cureArtifacts.organizationId, organizationId),
        eq(concept2cureArtifacts.projectId, projectId),
      ),
    )
    .limit(1);
  return artifact && artifact.projectId === projectId ? artifact : null;
}
