/**
 * The project a new task belongs to, read from the record the task is raised on.
 *
 * ── The defect (QA 2026-10-08, second walk, j1) ──────────────────────────────
 * Assign review creates the reviewer's task (POST /api/tasks/tasks) with
 * sourceEntityType 'authoring_document' and the document id — and no
 * projectId: the editor holds the program's UUID, and unified_tasks.project_id
 * is the integer projects.id. The task was stored with project_id NULL, and the
 * program's Review tab — which reads work by project (loadUnifiedWork) — said
 * "No tasks or approvals on this program" while a review was assigned on it.
 *
 * The project is taken from the DOCUMENT, not from the client: the document's
 * own program (authoring_documents.client_program_id), in the caller's
 * organisation, to that program's project record (the one anchor reader,
 * readProgramAnchorRow: the lowest-id row, org-scoped). The `programId` the
 * dialog puts in moduleData is the client's copy of the same fact and is not
 * read. migrations/20261008d_unified_tasks_authoring_review_project.sql gives
 * the tasks created before this the same answer by the same rule.
 *
 * Answers null when the source is not an authoring document, the document is
 * not this organisation's, it has no program, or the program has no project
 * record. Throws when the read cannot complete; the caller refuses the create
 * rather than writing a task whose project it could not tell.
 *
 * @module server/services/tasking/task-project
 */

import { sql } from 'drizzle-orm';
import type { RequestDb } from '../../db/requestDb';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The source kind whose project this module can tell. */
export const AUTHORING_DOCUMENT_SOURCE = 'authoring_document';

export async function projectForTaskSource(
  /** The request's RLS client — requestDb(req), never the shared pool. */
  db: RequestDb,
  params: { orgId: number; sourceEntityType?: string | null; sourceEntityId?: string | null },
): Promise<number | null> {
  if (params.sourceEntityType !== AUTHORING_DOCUMENT_SOURCE) return null;
  const docId = String(params.sourceEntityId ?? '').trim();
  if (!UUID.test(docId)) return null;
  // authoring_documents has no Drizzle definition (the authoring subsystem's
  // SQL creates it), so it is read as SQL on the same client.
  const result = await db.execute(sql`
    SELECT client_program_id::text AS program_id
      FROM authoring_documents
     WHERE id = ${docId}::uuid AND tenant_id = ${params.orgId}
     LIMIT 1`);
  const rows = (result as unknown as { rows?: Array<{ program_id: string | null }> }).rows ?? [];
  const programId = rows[0]?.program_id ?? null;
  if (!programId) return null;
  const anchor = await readProgramAnchorRow(db, { programId, orgId: params.orgId, context: 'task-source-project' });
  return anchor?.id ?? null;
}
