/**
 * Is the project a CMC record names one of the caller's organization's own
 * (PF-15, project first)?
 *
 * CMC Module 3 keys its stores (cmc_source_objects, the composed sections,
 * provenance, contradictions) on the shell's project id as TEXT: a
 * regulatory_programs UUID for a v2 project, or a legacy numeric projects.id.
 * The writers took that id from the URL or the body and never asked whose it
 * was, so an organization's Module 3 content could be filed under another
 * organization's project, or under an id that names no project at all.
 *
 * One answer for both id-spaces:
 *   UUID    → a live project (regulatory_programs, not deleted) of this
 *             organization — programInOrganization, the canonical check;
 *   numeric → a projects row of this organization;
 *   else    → no.
 *
 * `db` is anything with the pg `query` shape. A lookup that cannot complete
 * throws: "could not tell" is not "not yours".
 */
import { programInOrganization } from '../c2c/program-access';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cmcProjectInOrganization(db: Queryable, organizationId: number, projectId: unknown): Promise<boolean> {
  const id = typeof projectId === 'string' ? projectId.trim() : '';
  if (UUID_RE.test(id)) return programInOrganization(db, id, organizationId);
  if (!/^\d+$/.test(id)) return false;
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) return false;
  const { rows } = await db.query(`SELECT 1 FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`, [n, organizationId]);
  return rows.length > 0;
}
