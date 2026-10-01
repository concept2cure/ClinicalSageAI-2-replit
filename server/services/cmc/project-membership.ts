/**
 * Does a project belong to the tenant?
 *
 * A program (regulatory_programs, uuid) or a legacy project (projects,
 * integer) — compared as text so a numeric id never raises a uuid cast.
 * Callers:
 *   - the interview commit, which binds a session to a project named at
 *     commit time;
 *   - the Module 3 link, which for the registers whose tables carry no
 *     project column takes the program from the request body, and must not
 *     file a record under a program the tenant does not hold;
 *   - the Module 3 operating-system routes (one router.param guard) and
 *     POST /api/cmc-changes, which took the project from the URL or the body
 *     and wrote under it unchecked (PF-15, project first).
 *
 * A deleted program is not the tenant's to write under. The programs arm
 * admitted a soft-deleted program (2026-09-29, PF-15), so a record could be
 * filed under a project its organization had deleted. The programs arm is now
 * programInOrganization itself, the one program check (D3, 2026-10-01).
 *
 * A lookup that cannot complete throws: "could not tell" is not "not yours".
 *
 * @module server/services/cmc/project-membership
 */
import { getPool } from '../../db';
import { programInOrganization } from '../c2c/program-access';

export interface MembershipQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export async function projectBelongsToTenant(
  params: { organizationId: number | string | null | undefined; projectId: string },
  q?: MembershipQueryable,
): Promise<boolean> {
  const organizationId = Number(params.organizationId);
  if (!Number.isFinite(organizationId) || organizationId <= 0) return false;
  const projectId = String(params.projectId ?? '').trim();
  if (!projectId) return false;
  const db = q ?? getPool();
  // A program: the one program check. A legacy project: its own table.
  if (await programInOrganization(db, projectId, organizationId)) return true;
  const { rows } = await db.query(
    `SELECT 1 AS present FROM projects WHERE id::text = $1 AND organization_id = $2 LIMIT 1`,
    [projectId, organizationId],
  );
  return rows.length > 0;
}
