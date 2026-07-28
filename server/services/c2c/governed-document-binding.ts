/**
 * Resolve the governed document an authored document belongs to.
 *
 * ── What this is for ──────────────────────────────────────────────────────────
 * c2c_documents is the system of record for a regulatory filing; the authoring
 * stack is the editing layer over it. When a document is created in the
 * authoring surface against an open project, this decides which c2c_documents
 * row it is contributing to, so the two stores share an identity instead of
 * drifting into parallel truths.
 *
 * ── Read-only, on purpose ─────────────────────────────────────────────────────
 * This function does NOT create a governed document. Creating one is
 * scaffoldProjectDocuments()'s job and it runs inside project creation, where
 * it belongs — a second creation path would be the exact duplication this whole
 * effort is removing, and the two would inevitably disagree about rule-pack
 * resolution. If a project has no governed document, this says so and the
 * caller leaves the authored document unbound.
 *
 * ── Unbound is a legitimate state, and must be visible ────────────────────────
 * Three cases end in "no binding", and every one returns a reason rather than a
 * bare null:
 *
 *   • no project supplied         — an org-wide document, the pre-existing
 *                                   behaviour, unchanged.
 *   • project has no document class — ivd/device/ide/biologic/anda are accepted
 *                                   program types with no doc_type and no rule
 *                                   pack. Guessing a near neighbour would file
 *                                   the wrong document class.
 *   • project has no governed doc   — a project created before scaffolding
 *                                   existed, or one whose scaffold skipped.
 *
 * The caller surfaces the reason in its response. Silently returning an unbound
 * document would recreate the split this is meant to close, just with better
 * intentions.
 */

import type { PoolClient, Pool } from 'pg';
import { resolveDocumentClass, describeUnmappedClass } from './document-class.js';

/** Minimal shape shared by Pool and PoolClient — this module needs only query. */
type Queryable = Pick<Pool | PoolClient, 'query'>;

export interface BindingInput {
  db: Queryable;
  orgId: number;
  /** regulatory_programs.id (uuid), or null/undefined for an org-wide document. */
  projectId: string | null | undefined;
}

export interface BindingResult {
  /** c2c_documents.id, or null when the document stays unbound. */
  documentId: string | null;
  /** Why it is unbound. Absent when documentId is set. */
  reason?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveGovernedDocument(input: BindingInput): Promise<BindingResult> {
  const { db, orgId, projectId } = input;

  if (!projectId) {
    return {
      documentId: null,
      reason: 'No project is open, so this document is org-wide and not bound to a filing.',
    };
  }
  // The router validates this too; re-checked here because a malformed uuid
  // reaches Postgres as a 22P02 rather than an empty result, and a cast error is
  // a worse diagnostic than a stated reason.
  if (!UUID.test(String(projectId))) {
    return { documentId: null, reason: 'The supplied project id is not a valid identifier.' };
  }

  // Org-scoped: a project id from another tenant must be indistinguishable from
  // one that does not exist.
  const project = await db.query<{ program_type: string | null; primary_agency: string | null }>(
    `SELECT program_type, primary_agency
       FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [projectId, orgId],
  );
  if (project.rows.length === 0) {
    return { documentId: null, reason: 'The project was not found in this organization.' };
  }

  const { program_type: programType, primary_agency: primaryAgency } = project.rows[0];
  const klass = resolveDocumentClass(programType, primaryAgency);
  if (!klass) {
    return {
      documentId: null,
      reason: `${describeUnmappedClass(programType, primaryAgency)} ` +
              'The document was created and can be authored, but it is not bound to a filing.',
    };
  }

  // The project's governed document of this class. Newest first so a project
  // that has been re-scaffolded binds to the current filing rather than a
  // superseded one.
  const doc = await db.query<{ id: string }>(
    `SELECT id
       FROM c2c_documents
      WHERE project_id = $1 AND org_id = $2 AND doc_type = $3
      ORDER BY created_at DESC
      LIMIT 1`,
    [projectId, orgId, klass.docType],
  );
  if (doc.rows.length === 0) {
    return {
      documentId: null,
      reason: 'This project has no governed document yet, so the authored document is not bound ' +
              'to a filing. Projects created from now on are scaffolded with one.',
    };
  }

  return { documentId: doc.rows[0].id };
}
