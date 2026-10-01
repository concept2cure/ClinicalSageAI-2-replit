/**
 * The one writer of a coauthor_documents lifecycle event into audit_events.
 *
 * 2026-09-23 (W5/D7, round-3 review, repair 2). Re-taking a filing copy from
 * its source (services/coauthor/coauthor-snapshot.ts) rewrites an existing
 * regulated row — replacing an author's saved co-author edits on a draft copy,
 * or correcting an approved copy — and wrote no audit row, so the change was
 * invisible after the fact. It now records one. The two DELETE handlers
 * (routes/coauthor.ts and routes/ectd-documents.ts) each wrote the same
 * audit_events INSERT inline; they call this instead, so there is one shape
 * for a coauthor document event.
 *
 * It runs on the caller's client, inside the caller's transaction: if the
 * audit row cannot be written, the change it describes rolls back with it
 * (21 CFR Part 11 §11.10(e): atomic and fail-closed).
 *
 * 2026-10-01 (D5; editor-family review P11-B-1, hand-on item 5). The two PUTs
 * (services/coauthor/coauthor-status-write.ts applyCoauthorDocumentPut)
 * overwrote a document's text and status with no reason, no audit row and no
 * copy of what they replaced. They now record `coauthor_document.updated`
 * with the person's stated reason, and keep the replaced text as the
 * document's next version through versionReplacedCoauthorContent, the one
 * writer of coauthor_document_versions (batch-draft accept and the filing-copy
 * re-take use it too). The PUT and DELETE record the person's stated reason or
 * null, never a sentence composed in its place; the re-take and batch-draft
 * accept still write a fixed sentence there (recorded in
 * docs/evidence/D5/2026-10-01-coauthor-save-trail/).
 *
 * Deleting a document with saved versions is refused (deleteCoauthorDocument):
 * the versions are its history, and the table's foreign key has no cascade, so
 * the DELETE was a 500 for any document a batch draft had been accepted into.
 */
import { createHash } from 'node:crypto';
import { optionalGovernedReason } from '../../routes/governed-reason.js';

/** Anything with a pg-style query: a pool client or a Drizzle transaction adapter. */
export interface CoauthorAuditClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] } | unknown>;
}

/** The digest a coauthor event records for a document's text. */
export function coauthorContentSha256(text: string | null | undefined): string {
  return createHash('sha256').update(text ?? '', 'utf8').digest('hex');
}

/** Who did it, from the verified session. */
export interface CoauthorAuditActor {
  userId: number | null;
  name: string;
  role: string;
  ip: string;
}

/** The actor for an authenticated request (req.user is set by the auth middleware). */
export function coauthorAuditActor(req: { user?: unknown; ip?: string }): CoauthorAuditActor {
  const u = (req.user ?? {}) as Record<string, unknown>;
  return {
    userId: Number(u.id ?? u.userId) || null,
    name: String(u.name ?? u.email ?? 'System'),
    role: String(u.role ?? 'user'),
    ip: req.ip ?? '',
  };
}

export async function recordCoauthorDocumentEvent(
  client: CoauthorAuditClient,
  event: {
    organizationId: number;
    documentId: number;
    eventType: 'coauthor_document.deleted' | 'coauthor_document.retaken' | 'coauthor_document.updated';
    actor: CoauthorAuditActor;
    /** The person's stated reason, or null when none was stated. */
    reason: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (organization_id, event_type, entity_type, entity_id, user_id, user_name,
        user_role, ip_address, timestamp, reason, metadata,
        regulatory_significant, gxp_relevant, created_at)
     VALUES ($1, $2, 'coauthor_document', $3, $4, $5, $6, $7,
             NOW(), $8, $9, true, true, NOW())`,
    [
      event.organizationId,
      event.eventType,
      event.documentId,
      event.actor.userId,
      event.actor.name,
      event.actor.role,
      event.actor.ip,
      event.reason,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}

/**
 * Keep the text a write is about to replace, as the document's next version,
 * on the caller's transaction. Returns that version's number, or null when
 * the replaced text was empty (there is nothing to keep). The caller holds
 * the document's row FOR UPDATE, so MAX + 1 is not raced by another writer of
 * the same document; the table's (document_id, version_number) key is the
 * backstop.
 */
export async function versionReplacedCoauthorContent(
  client: CoauthorAuditClient,
  args: {
    documentId: number;
    previousContent: string | null | undefined;
    /** Who replaced it: the actor's name, as every writer of this column records it. */
    createdBy: string;
    changeSummary: string;
  },
): Promise<number | null> {
  if (!args.previousContent || !args.previousContent.trim()) return null;
  const result = (await client.query(
    `INSERT INTO coauthor_document_versions (document_id, version_number, content, created_by, change_summary)
     SELECT $1::int, COALESCE(MAX(version_number), 0) + 1, $2::text, $3::text, $4::text
       FROM coauthor_document_versions
      WHERE document_id = $1::int
     RETURNING version_number`,
    [args.documentId, args.previousContent, args.createdBy, args.changeSummary],
  )) as { rows: Array<{ version_number: number }> };
  return Number(result.rows[0].version_number);
}

export type CoauthorDeleteOutcome =
  | { kind: 'deleted'; id: number }
  | { kind: 'not_found' }
  | { kind: 'has_history'; versions: number }
  | { kind: 'reason_invalid'; message: string };

/**
 * Delete one organisation's coauthor document and record the deletion, on the
 * caller's transaction; or refuse, deleting nothing, when the document has
 * saved versions, or when a reason was given that the one rule refuses. Both
 * DELETE handlers (routes/coauthor.ts, routes/ectd-documents.ts) call this.
 */
export async function deleteCoauthorDocument(
  client: CoauthorAuditClient,
  args: { documentId: number; organizationId: number; actor: CoauthorAuditActor; changeReason: unknown },
): Promise<CoauthorDeleteOutcome> {
  const stated = optionalGovernedReason(args.changeReason);
  if (!stated.ok) return { kind: 'reason_invalid', message: `${stated.error} Nothing was deleted.` };
  const held = (await client.query(
    `SELECT id, status, title, content FROM coauthor_documents
      WHERE id = $1 AND organization_id = $2
      FOR UPDATE`,
    [args.documentId, args.organizationId],
  )) as { rows: Array<{ id: number; status: string | null; title: string | null; content: string | null }> };
  const doc = held.rows[0];
  if (!doc) return { kind: 'not_found' };
  // Counted after the lock is held, in its own statement: a version a
  // concurrent save committed while this waited is seen, and refused, rather
  // than failing the DELETE on the foreign key.
  const counted = (await client.query(
    'SELECT count(*)::int AS versions FROM coauthor_document_versions WHERE document_id = $1',
    [doc.id],
  )) as { rows: Array<{ versions: number }> };
  const versions = Number(counted.rows[0]?.versions ?? 0);
  if (versions > 0) return { kind: 'has_history', versions };

  await client.query('DELETE FROM coauthor_documents WHERE id = $1 AND organization_id = $2', [
    args.documentId,
    args.organizationId,
  ]);
  await recordCoauthorDocumentEvent(client, {
    organizationId: args.organizationId,
    documentId: doc.id,
    eventType: 'coauthor_document.deleted',
    actor: args.actor,
    reason: stated.reason,
    metadata: {
      before: { status: doc.status, title: doc.title, contentSha256: coauthorContentSha256(doc.content) },
    },
  });
  return { kind: 'deleted', id: doc.id };
}

/** The refusal both DELETE handlers answer a document with history with. */
export function coauthorDeleteHistoryRefusal(versions: number): { error: string; message: string; versions: number } {
  return {
    error: 'DOCUMENT_HAS_HISTORY',
    message:
      `This document has ${versions} earlier saved version${versions === 1 ? '' : 's'}, kept as its record, ` +
      'so it cannot be deleted. Nothing was deleted.',
    versions,
  };
}
