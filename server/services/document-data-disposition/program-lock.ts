import type { DispositionQueryable } from './types';

/** Inside BEGIN, before authoring/impact-table write locks: save and withdrawal
 * serialize against the same program, including equivalent UUID spellings. */
export async function lockDocumentDispositionProgram(q: DispositionQueryable, organizationId: number, programId: string): Promise<void> {
  await q.query("SET LOCAL lock_timeout = '5s'");
  await q.query("SELECT pg_advisory_xact_lock(hashtext('document_data_dispositions'),hashtext($1))", [`${organizationId}:${programId.toLowerCase()}`]);
}
