import { query } from '../db';

export async function getOrganizationIdFromProgram(programId: string): Promise<number> {
  if (!programId) {
    throw new Error('programId is required to resolve organizationId');
  }

  const result = await query(
    `
      SELECT organization_id
      FROM projects
      WHERE id::text = $1 OR code = $1
      LIMIT 1
    `,
    [programId]
  );

  if (!result.rows.length) {
    throw new Error(`No organization found for programId ${programId}`);
  }

  return result.rows[0].organization_id;
}
