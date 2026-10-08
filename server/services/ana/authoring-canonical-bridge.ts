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
 * The working authoring review remains authoritative. This optional projection
 * uses the document's recorded program and its unique tenant-owned legacy
 * project relationship. An unlinked legacy document may use a verified project
 * hint; a hint cannot override a stored program. Missing or ambiguous linkage,
 * an unattributable actor, or an unstated reason produces a visible receipt.
 * Projection is separate from the review transaction. An unconfirmed receipt
 * can be retried on that review; it does not prove no canonical write occurred.
 *
 * @module server/services/ana/authoring-canonical-bridge
 */

import type { CanonicalRevisionRequest, CanonicalRevisionResult } from './document-spine.js';
import { programInOrganization } from '../c2c/program-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('authoring-canonical-bridge');

export interface AuthoringBridgeRequest {
  docId: string;
  organizationId: number;
  /** Optional legacy hint, subordinate to the recorded program relationship. */
  projectId?: number | null;
  /** Numeric users.id for Part 11 attribution. Non-numeric ⇒ skip. */
  userId?: number | null;
  /** The person's stated reason for the change. None ⇒ skip: the canonical
   *  record takes a person's reason, never one written for them. */
  reason: string | null;
  triggerReview?: boolean;
  ctdSection?: string | null;
  aiModelUsed?: string | null;
}

/** One saved section, as the snapshot reads it. */
export interface AuthoringSectionRow {
  id: unknown;
  code: unknown;
  title: unknown;
  content: unknown;
  order_index: unknown;
}

export interface AuthoringDocumentSnapshot {
  title: string;
  /** Full assembled content across the document's sections. */
  content: string;
  /** eCTD module/section hint if the working doc carries one. */
  module?: string | null;
  /** The rows `content` was assembled from, in the order it was assembled.
   *  2026-09-23 (W5/D7, co-author final pass): returned so a caller that must
   *  check the sections (the filing copy's seal check,
   *  services/coauthor/coauthor-snapshot.ts) checks the very rows it files. */
  sections?: AuthoringSectionRow[];
}

/** Anything with a pg-style query: the pool, or a caller's transaction. */
export interface AuthoringSnapshotQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface AuthoringBridgeDeps {
  /** Resolve the document's recorded program to its tenant-owned legacy project.
   * A supplied legacy hint may not override that stored relationship. */
  resolveProject?(
    docId: string, organizationId: number, hint?: number | null,
  ): Promise<{ projectId: number | null; reason?: string }>;
  /** Reads on `q` when given (e.g. the caller's transaction), else on the pool. */
  loadDocumentSnapshot(
    docId: string,
    organizationId: number,
    q?: AuthoringSnapshotQueryable,
  ): Promise<AuthoringDocumentSnapshot | null>;
  commit(req: CanonicalRevisionRequest): Promise<CanonicalRevisionResult>;
}

export interface AuthoringBridgeOutcome {
  bridged: boolean;
  /** Why the bridge skipped, when it did (for observability). */
  reason?: string;
  result?: CanonicalRevisionResult;
  projectId?: number;
}

/** The bridge's destination is still integer-keyed. Use the existing recorded
 * relationship, never a program name or an invented legacy project. */
export async function resolveAuthoringCanonicalProject(
  q: AuthoringSnapshotQueryable, docId: string, organizationId: number, hint?: number | null,
): Promise<{ projectId: number | null; reason?: string }> {
  const doc = await q.query(
    'SELECT client_program_id FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
    [docId, organizationId],
  );
  if (doc.rows.length !== 1) return { projectId: null, reason: 'authoring document not found in this organization' };
  const program = doc.rows[0].client_program_id;
  if (program != null) {
    if (!(await programInOrganization(q, program, organizationId))) {
      return { projectId: null, reason: 'recorded program is not a live program of this organization' };
    }
    const linked = await readProgramAnchorRow(q, {
      programId: program, orgId: organizationId, context: 'authoring-canonical-bridge', requireUnique: true,
    });
    if (!linked) return { projectId: null, reason: 'recorded program needs one unambiguous legacy project relationship' };
    const projectId = linked.id;
    if (hint != null && hint !== projectId) return { projectId: null, reason: 'client project conflicts with the document recorded program' };
    return { projectId };
  }
  if (Number.isSafeInteger(hint) && Number(hint) > 0) {
    const { projectBelongsToTenant } = await import('../cmc/project-membership');
    if (await projectBelongsToTenant({ projectId: String(hint), organizationId }, q)) {
      return { projectId: Number(hint) };
    }
  }
  return { projectId: null, reason: 'unlinked legacy document needs a tenant-owned project context' };
}

/** Stable per-document thread key so successive submits append canonical versions. */
export function authoringThreadKey(docId: string): string {
  return `authoring:${docId}`;
}

function canonicalSection(requested?: string | null, recorded?: string | null): string | null {
  return requested ?? recorded ?? null;
}

/**
 * Bridge an authoring document into the canonical spine. Returns an outcome that
 * says whether it bridged and, if not, precisely why. Never throws.
 */
export async function bridgeAuthoringToCanonical(
  req: AuthoringBridgeRequest,
  deps: AuthoringBridgeDeps,
): Promise<AuthoringBridgeOutcome> {
  const userId = req.userId;
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0) {
    return { bridged: false, reason: 'actor is not a numeric users.id — governed action cannot be attributed' };
  }
  if (!req.reason || !req.reason.trim()) {
    return { bridged: false, reason: 'no reason for change was stated — the canonical revision records the person\'s reason, never one written for them' };
  }
  try {
    const resolved: { projectId?: number | null; reason?: string } = deps.resolveProject
      ? await deps.resolveProject(req.docId, req.organizationId, req.projectId)
      : { projectId: req.projectId };
    const projectId = resolved.projectId;
    if (!Number.isSafeInteger(projectId) || Number(projectId) <= 0) {
      return { bridged: false, reason: resolved.reason ?? 'no project context — canonical destination is unresolved' };
    }
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
      ctdSection: canonicalSection(req.ctdSection, snap.module),
      aiModelUsed: req.aiModelUsed ?? null,
      triggerReview: req.triggerReview !== false,
    });
    return { bridged: true, result, projectId: projectId as number };
  } catch (err) {
    logger.warn('canonical projection not confirmed', { docId: req.docId, err: err instanceof Error ? err.message : String(err) });
    return {
      bridged: false,
      reason: 'canonical projection was not confirmed; retry after resolving its project or service availability',
    };
  }
}

/** A section as the assembler reads it. */
export type AssemblableSection = { code?: unknown; title?: unknown; content?: unknown };

/**
 * Sections, in the order given, as one document body: "## code — title", a
 * blank line, the section's text; sections separated by a blank line. The one
 * assembler for an authored document's text — the filing copy
 * (services/coauthor/coauthor-snapshot.ts) and the filing's own section for a
 * document filed under one outline node (services/c2c/commit-section-to-filing.ts,
 * 2026-10-08) both use it, and the placement dialog mirrors it.
 */
export function assembleAuthoredSections(sections: ReadonlyArray<AssemblableSection>): string {
  return sections
    .map((s) => {
      const heading = [s.code, s.title].filter(Boolean).join(' — ');
      return heading ? `## ${heading}\n\n${s.content ?? ''}` : String(s.content ?? '');
    })
    .join('\n\n')
    .trim();
}

/** Production deps: load the working doc from Postgres, commit via the real spine. */
export function defaultAuthoringBridgeDeps(): AuthoringBridgeDeps {
  return {
    async resolveProject(docId, organizationId, hint) {
      const q = (await import('../../db.js')).getPool();
      return resolveAuthoringCanonicalProject(q, docId, organizationId, hint);
    },
    async loadDocumentSnapshot(docId, organizationId, q) {
      /* 2026-09-23 (W5/D7, co-author final pass): `q` lets a caller read on its
         own transaction. The filing copy (services/coauthor/coauthor-snapshot.ts)
         used to assemble its text here on the pool, BEFORE its transaction,
         and then check a second read of the sections against the seal — so a
         section changed before this read and restored before that one was
         filed with a seal it is not in. It now calls this on its transaction
         and checks the returned `sections`, the rows the text was built from. */
      const exec: AuthoringSnapshotQueryable = q ?? (await import('../../db.js')).getPool();
      const doc = await exec.query(
        `SELECT title, module FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
        [docId, organizationId],
      );
      if (doc.rows.length === 0) return null;
      /* 2026-09-23 (W5/D7, co-author final pass): ORDER BY order_index,
         created_at, id — the editor's order (authoring.router.ts GET
         /docs/:docId/sections sorts order_index, created_at; id makes it
         total). By order_index alone, sections sharing an index (legacy
         documents) came back in heap order: filed in a different order from
         the one the author saw, and re-filed in another on re-placement. The
         router's seal queries use the same order. */
      const sections = await exec.query(
        `SELECT id, code, title, content, order_index FROM authoring_sections
          WHERE doc_id = $1 AND tenant_id = $2
          ORDER BY order_index, created_at, id`,
        [docId, organizationId],
      );
      const content = assembleAuthoredSections(sections.rows as AssemblableSection[]);
      return {
        title: String(doc.rows[0].title ?? 'Untitled document'),
        content,
        module: doc.rows[0].module ?? null,
        sections: sections.rows as AuthoringSectionRow[],
      };
    },
    async commit(req) {
      const { commitCanonicalRevision, defaultSpineDeps } = await import('./document-spine.js');
      return commitCanonicalRevision(req, defaultSpineDeps());
    },
  };
}
