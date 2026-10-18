/**
 * Which project a chat upload's Data Room source is recorded in.
 *
 * An upload arrives with a `regulatory_programs` UUID or a numeric `projects`
 * id. A numeric id whose `projects` row is the single live anchor of a live
 * program of the organisation is recorded in that program, exactly as a UUID
 * upload into it is: one record shape, admitted by the program-bound reads
 * (source-read-access.ts). Anything else keeps the workspace scope it came with.
 *
 * Before 2026-10-17 a numeric upload kept its workspace scope and wrote a
 * concept2cure_artifacts copy of the file, which the reads used as the binding
 * from workspace to program. Document store consolidation step 3 stopped that
 * copy (docs/design/DOCUMENT_STORE_CONSOLIDATION.md); this is the binding now,
 * established once at capture. Existing workspace-scoped sources keep their
 * artifact binding and stay readable.
 */
import { programInOrganization } from '../c2c/program-access.js';

export interface UploadProjectScope { programId: string | null; workspaceId: number | null }
interface Queryable { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveUploadCaptureScope(
  db: Queryable, scope: UploadProjectScope, organizationId: number,
): Promise<UploadProjectScope> {
  if (scope.workspaceId == null || !Number.isSafeInteger(organizationId) || organizationId <= 0) return scope;
  const { rows } = await db.query(
    `SELECT p.regulatory_program_id::text AS program_id,
            (SELECT count(*)::int FROM projects o
              WHERE o.organization_id = p.organization_id
                AND o.regulatory_program_id = p.regulatory_program_id
                AND o.status IS DISTINCT FROM 'deleted') AS anchor_count
       FROM projects p
      WHERE p.id = $1 AND p.organization_id = $2 AND p.status IS DISTINCT FROM 'deleted'
      LIMIT 1`,
    [scope.workspaceId, organizationId],
  );
  const programId = rows[0]?.program_id;
  if (typeof programId !== 'string' || !UUID_RE.test(programId) || Number(rows[0].anchor_count) !== 1) return scope;
  if (!(await programInOrganization(db, programId, organizationId))) return scope;
  return { programId: programId.toLowerCase(), workspaceId: null };
}
