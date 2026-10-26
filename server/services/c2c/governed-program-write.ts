import { canMutateProgram, programInOrganization } from './program-access';
import { readCsrProjectActor } from '../csr/project-scope';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';

interface ProgramClient { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
export class ProgramRecordWriteRefusal extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'ACCESS_UNAVAILABLE', readonly status: 404 | 403 | 503, message: string) {
    super(message); this.name = 'ProgramRecordWriteRefusal';
  }
}

/** Evaluate current persisted authority in the same transaction as the write. */
export async function requireGovernedProgramWriteTx(client: ProgramClient, organizationId: number, userId: number, programId: string): Promise<void> {
  try {
    if (!await programInOrganization(client, programId, organizationId)) {
      throw new ProgramRecordWriteRefusal('NOT_FOUND', 404, 'Project not found for this organization.');
    }
    const actor = await readCsrProjectActor(client, organizationId, userId);
    // A lead assignment cannot preserve a write role revoked after request
    // admission. Apply the same role rule the mounted routes enforce to the
    // membership read afresh inside this governed transaction.
    if (typeof actor.role !== 'string' || !GOVERNED_WRITE_ROLES.has(actor.role)) {
      throw new ProgramRecordWriteRefusal('FORBIDDEN', 403, 'Current governed write permission is required. Nothing was written.');
    }
    const { rows } = await client.query('SELECT lead_user_id FROM regulatory_programs WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR SHARE', [programId, organizationId]);
    if (rows.length !== 1) throw new ProgramRecordWriteRefusal('NOT_FOUND', 404, 'Project not found for this organization.');
    const leadUserId = rows[0].lead_user_id == null ? null : Number(rows[0].lead_user_id);
    if (!canMutateProgram({ actor: { userId: actor.userId, orgRole: actor.role }, program: { leadUserId } })) {
      throw new ProgramRecordWriteRefusal('FORBIDDEN', 403, 'Only this project’s lead or an organization manager can write its governed records.');
    }
  } catch (error) {
    if (error instanceof ProgramRecordWriteRefusal) throw error;
    if ((error as { status?: number }).status === 403) {
      throw new ProgramRecordWriteRefusal('FORBIDDEN', 403, 'Current active organization membership is required.');
    }
    throw new ProgramRecordWriteRefusal('ACCESS_UNAVAILABLE', 503, 'Current project authority could not be verified. Nothing was written.');
  }
}
