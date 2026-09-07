/**
 * Does a project belong to the tenant?
 *
 * A program (regulatory_programs, uuid) or a legacy project (projects,
 * integer) — compared as text so a numeric id never raises a uuid cast. Two
 * callers: the interview commit, which binds a session to a project named at
 * commit time, and the Module 3 link, which for the registers whose tables
 * carry no project column takes the program from the request body — and must
 * not file a record under a program the tenant does not hold.
 *
 * @module server/services/cmc/project-membership
 */
import { getPool } from '../../db';

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
  const { rows } = await db.query(
    `SELECT 1 AS present FROM regulatory_programs WHERE id::text = $1 AND organization_id = $2
     UNION ALL
     SELECT 1 AS present FROM projects WHERE id::text = $1 AND organization_id = $2
     LIMIT 1`,
    [projectId, organizationId],
  );
  return rows.length > 0;
}
