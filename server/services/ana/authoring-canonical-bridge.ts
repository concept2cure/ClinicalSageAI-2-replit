/**
 * Authoring → canonical spine bridge.
 *
 * The eCTD CoAuthor router (server/routes/authoring.router.ts) edits documents in
 * its own working store (authoring_documents / authoring_sections). The canonical
 * governed record lives in concept2cure_artifacts, reached through the one atomic
 * revision spine (document-spine.ts). This bridge connects the two at a governed
 * transition: when an authoring document is submitted for review, its assembled
 * content is committed into the canonical artifact through the spine, so the
 * canonical version, the Part 11 audit event, the review state, dossier placement
 * and program readiness all move together over concept2cure_artifacts.
 *
 * It is deliberately CONSERVATIVE about integrity rather than forcing a write:
 *   - the canonical artifact is project-scoped (concept2cure_artifacts.project_id
 *     is NOT NULL) but an authoring document is not, so a projectId must be
 *     supplied by the caller — absent it, the bridge SKIPS rather than inventing
 *     a project;
 *   - the governed audit action must be attributed to a real numeric user id;
 *     the authoring surface authenticates with a string subject, so when that
 *     subject is not a numeric users.id the bridge SKIPS rather than mis-
 *     attributing the action to "system".
 * Skipping is always reported (never silent) and never throws, so it can be
 * called fail-soft from a route handler without risk to the primary flow.
 *
 * Fully retiring authoring_documents in favour of the canonical identity (so the
 * bridge is unconditional) is a deliberate schema + UX change — give authoring
 * documents a project linkage and a shared numeric actor identity — tracked
 * separately; this bridge is the safe, correct connection available today.
 *
 * @module server/services/ana/authoring-canonical-bridge
 */

import type { CanonicalRevisionRequest, CanonicalRevisionResult } from './document-spine.js';

export interface AuthoringBridgeRequest {
  docId: string;
  organizationId: number;
  /** Project the canonical artifact belongs to. Required — no project ⇒ skip. */
  projectId?: number | null;
  /** Numeric users.id for Part 11 attribution. Non-numeric ⇒ skip. */
  userId?: number | null;
  reason: string;
  triggerReview?: boolean;
  ctdSection?: string | null;
  aiModelUsed?: string | null;
}

export interface AuthoringDocumentSnapshot {
  title: string;
  /** Full assembled content across the document's sections. */
  content: string;
  /** eCTD module/section hint if the working doc carries one. */
  module?: string | null;
}

export interface AuthoringBridgeDeps {
  loadDocumentSnapshot(
    docId: string,
    organizationId: number,
  ): Promise<AuthoringDocumentSnapshot | null>;
  commit(req: CanonicalRevisionRequest): Promise<CanonicalRevisionResult>;
}

export interface AuthoringBridgeOutcome {
  bridged: boolean;
  /** Why the bridge skipped, when it did (for observability). */
  reason?: string;
  result?: CanonicalRevisionResult;
}

/** Stable per-document thread key so successive submits append canonical versions. */
export function authoringThreadKey(docId: string): string {
  return `authoring:${docId}`;
}

/**
 * Bridge an authoring document into the canonical spine. Returns an outcome that
 * says whether it bridged and, if not, precisely why. Never throws.
 */
export async function bridgeAuthoringToCanonical(
  req: AuthoringBridgeRequest,
  deps: AuthoringBridgeDeps,
): Promise<AuthoringBridgeOutcome> {
  const projectId = req.projectId;
  if (!Number.isInteger(projectId as number)) {
    return { bridged: false, reason: 'no project context — authoring document is not project-scoped' };
  }
  const userId = req.userId;
  if (!Number.isInteger(userId as number)) {
    return { bridged: false, reason: 'actor is not a numeric users.id — governed action cannot be attributed' };
  }
  try {
    const snap = await deps.loadDocumentSnapshot(req.docId, req.organizationId);
    if (!snap || !snap.content.trim()) {
      return { bridged: false, reason: 'no assembled content to canonicalize' };
    }
    const result = await deps.commit({
      organizationId: req.organizationId,
      projectId: projectId as number,
      userId: userId as number,
      anaThreadId: authoringThreadKey(req.docId),
      title: snap.title,
      content: snap.content,
      documentType: 'authoring_document',
      reasonForChange: req.reason,
      ctdSection: req.ctdSection ?? snap.module ?? null,
      aiModelUsed: req.aiModelUsed ?? null,
      triggerReview: req.triggerReview !== false,
    });
    return { bridged: true, result };
  } catch (err) {
    return {
      bridged: false,
      reason: `canonical commit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Production deps: load the working doc from Postgres, commit via the real spine. */
export function defaultAuthoringBridgeDeps(): AuthoringBridgeDeps {
  return {
    async loadDocumentSnapshot(docId, organizationId) {
      const { getPool } = await import('../../db.js');
      const pool = getPool();
      const doc = await pool.query(
        `SELECT title, module FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
        [docId, organizationId],
      );
      if (doc.rows.length === 0) return null;
      const sections = await pool.query(
        `SELECT code, title, content FROM authoring_sections
          WHERE doc_id = $1 AND tenant_id = $2
          ORDER BY order_index`,
        [docId, organizationId],
      );
      const content = sections.rows
        .map((s) => {
          const heading = [s.code, s.title].filter(Boolean).join(' — ');
          return heading ? `## ${heading}\n\n${s.content ?? ''}` : String(s.content ?? '');
        })
        .join('\n\n')
        .trim();
      return {
        title: String(doc.rows[0].title ?? 'Untitled document'),
        content,
        module: doc.rows[0].module ?? null,
      };
    },
    async commit(req) {
      const { commitCanonicalRevision, defaultSpineDeps } = await import('./document-spine.js');
      return commitCanonicalRevision(req, defaultSpineDeps());
    },
  };
}
