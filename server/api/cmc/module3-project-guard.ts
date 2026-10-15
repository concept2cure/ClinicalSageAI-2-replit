/**
 * One organization read and one project guard for every /api/cmc Module 3
 * router (PF-15, project first).
 *
 * The Module 3 routers (operating system, build state, convergence, auto-draft)
 * each carried a private, identical copy of the organization read, and they
 * took :projectId from the URL and read or wrote under it unchecked. So an
 * organization's Module 3 sources, compiled sections, approvals and placements
 * could be filed under another organization's project. And a foreign or deleted
 * project read back as an empty state: "0% built", "no canonical sources —
 * upload first". That says the project exists and is empty, which is not true.
 *
 * guardModule3Project installs one router.param('projectId') on a router:
 *   - another organization's project, a deleted one and a malformed id → 404
 *     PROJECT_NOT_FOUND, before the handler runs, so nothing is read or written;
 *   - a lookup that cannot complete → 500, never "not found";
 *   - no organization in context → the handler's own refusal stands.
 * The membership answer is projectBelongsToTenant, the one check CMC uses.
 */
import type express from 'express';
import { projectBelongsToTenant } from '../../services/cmc/project-membership';
import { serverError } from '../../lib/api-response';

/** The caller's organization, as every Module 3 router reads it. Throws when there is none. */
export function module3OrgId(req: express.Request): number {
  const orgId = parseInt(
    String((req as any).tenantId || (req as any).tenantContext?.organizationId || 0),
    10,
  );
  if (!orgId || Number.isNaN(orgId)) throw new Error('Organization context required');
  return orgId;
}

export function guardModule3Project(router: express.Router, logger: Parameters<typeof serverError>[1]): void {
  router.param('projectId', async (req, res, next, projectId: string) => {
    let orgId: number;
    try {
      orgId = module3OrgId(req);
    } catch {
      return next();
    }
    try {
      if (!(await projectBelongsToTenant({ organizationId: orgId, projectId }))) {
        return res.status(404).json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      }
      return next();
    } catch (err) {
      return serverError(res, logger, 'checking the Module 3 project', err, { projectId });
    }
  });
}
