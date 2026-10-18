/** Project record cards reuse Authoring's object ACL before titles or paging. */
import type { RequestSqlClient } from '../../db/requestDb';
import { getCurrentAuthoringReadScope, requireAuthoringReadScopeStillCurrent } from '../authoring/authoring-read-scope';

export async function readProjectAuthoringRecords(q: RequestSqlClient, input: {
  organizationId: number; userId: number | undefined; programId: string;
}): Promise<{ available: boolean; rows: unknown[]; scope: 'accessible-documents'; reason?: string }> {
  try {
    const scope = await getCurrentAuthoringReadScope(q, input);
    const records = await q.query(`SELECT id,title,status,created_at FROM authoring_documents
      WHERE client_program_id=$1 AND tenant_id=$2 AND id=ANY($3::uuid[])
      ORDER BY created_at DESC,id LIMIT 200`, [input.programId, input.organizationId, scope.documentIds]);
    await requireAuthoringReadScopeStillCurrent(q, input, scope);
    return { available: true, rows: records.rows, scope: 'accessible-documents' };
  } catch {
    return { available: false, rows: [], scope: 'accessible-documents',
      reason: 'Current Authoring access could not be verified. No authoring records were supplied.' };
  }
}
