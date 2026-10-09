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
 */

/** Anything with a pg-style query: a pool client or a Drizzle transaction adapter. */
export interface CoauthorAuditClient {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
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
    eventType: 'coauthor_document.deleted' | 'coauthor_document.retaken';
    actor: CoauthorAuditActor;
    reason: string;
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
