/** The task spine uses projects.id; the product shell uses regulatory_programs.id.
 * Resolve the owning program on the same tenant request connection, without
 * guessing by name or borrowing the currently open program. */
import type { RequestSqlClient } from '../../db/requestDb';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';

export interface TaskHomeProgram { id: string; title: string }

export async function loadTaskHomePrograms(
  client: RequestSqlClient,
  organizationId: number,
  projectIds: readonly number[],
): Promise<Map<number, TaskHomeProgram>> {
  const ids = [...new Set(projectIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const result = await client.query(
    `SELECT p.id AS project_id, rp.id::text AS program_id, rp.name
       FROM projects p
       JOIN regulatory_programs rp ON rp.id = p.regulatory_program_id AND rp.organization_id = p.organization_id
      WHERE rp.organization_id = $1 AND p.organization_id = $1
        AND p.id = ANY($2::integer[]) AND rp.deleted_at IS NULL`,
    [organizationId, ids],
  );
  const programs = new Map<number, TaskHomeProgram>();
  const anchorClient = {
    query: async (text: string, params?: unknown[]) => ({
      rows: (await client.query(text, params)).rows.map(row => ({
        id: Number(row.id), clientWorkspaceId: row.clientWorkspaceId == null ? null : Number(row.clientWorkspaceId),
      })),
    }),
  };
  for (const row of result.rows) {
    const projectId = Number(row.project_id);
    // Reuse the canonical reader: a programme with another anchor outside this
    // board's requested subset remains ambiguous and must not open a shell.
    const anchor = await readProgramAnchorRow(anchorClient, {
      programId: String(row.program_id), orgId: organizationId, context: 'task-home', requireUnique: true,
    });
    if (anchor?.id !== projectId) continue;
    programs.set(projectId, { id: String(row.program_id), title: String(row.name ?? '') });
  }
  return programs;
}
