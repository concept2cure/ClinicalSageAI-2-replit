/**
 * A filing that is locked or submitted is not changed in place. One rule, read
 * by every writer of its sections.
 *
 * POST /api/c2c/documents/:id/lock and /:id/submit set `c2c_documents.status`
 * (the lock also `locked_at`). The filing PATCH refused a locked or submitted
 * document, but the one writer of filed text, `commitSectionToFiling`, and the
 * approval signature's section move never read it, so an editor save still
 * changed a locked filing's text (D2 / D5, 2026-10-22).
 *
 * Read on the writer's own transaction, `FOR NO KEY UPDATE`. The lock route's
 * UPDATE takes the same row lock, so a lock cannot commit between this check
 * and the write. It is also the lock the readiness trigger takes on this row
 * later in the same transaction, so two saves to one filing queue here rather
 * than deadlock, as `FOR SHARE` followed by each trigger's UPDATE would.
 */
import type { Queryable } from '../authoring/document-lock.js';

export interface FilingLock {
  state: 'locked' | 'submitted';
  /** "is locked" / "has been submitted", for the caller's own sentence. */
  words: string;
}

export async function readFilingLock(q: Queryable, documentId: string, orgId: number): Promise<FilingLock | null> {
  const r = await q.query(
    `SELECT status, locked_at FROM c2c_documents WHERE id = $1 AND org_id = $2 FOR NO KEY UPDATE`,
    [documentId, orgId],
  );
  const row = r.rows[0] as { status?: string | null; locked_at?: unknown } | undefined;
  if (row?.status === 'submitted') return { state: 'submitted', words: 'has been submitted' };
  if (row?.status === 'locked' || row?.locked_at != null) return { state: 'locked', words: 'is locked' };
  return null;
}
