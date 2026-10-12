/**
 * The frozen-document write gate (21 CFR 11).
 *
 * ── The defect this closes ───────────────────────────────────────────────────
 * MDX UAT 2026-08-18, item A4. Open a section of a document whose toolbar reads
 * "Frozen", click into the body text, and type: the characters go straight into
 * the content and the save state flips to "unsaved changes". Saving then
 * persisted, because NOTHING on the write path looked at the document's status.
 *
 * `POST /docs/:docId/freeze` snapshots the document into `frozen_documents` with
 * a sha256 content hash and sets `authoring_documents.status = 'FROZEN'`; the
 * e-signature route sets `'APPROVED'` for an approval signature. Both then
 * refused a SECOND freeze ("Document is already frozen") — the only place the
 * status was ever enforced. The editing routes did not consult it at all, so the
 * seal recorded a hash of content that could still be changed underneath it.
 *
 * That is not a cosmetic gap. The product's own Electronic Signature copy tells
 * the user that "an Approval signature approves and freezes the document"; Part
 * 11 §11.10(e) requires that the record a signature is applied to be protected
 * from alteration. A frozen document that still accepts edits makes the seal a
 * claim the system cannot support.
 *
 * ── Why it lives here and not in the route ───────────────────────────────────
 * Section CONTENT is mutated on four paths, not one — the editor save
 * (`PATCH /sections/:sectionId`), the history revert, the AnA draft accept, and
 * section creation. A gate written into the route the UAT happened to exercise
 * would leave the other three open, and the next content path added would be
 * open by default. One guard, called by every writer, is the repository's
 * standing rule (CLAUDE.md: one canonical implementation per capability) and the
 * only shape that fails closed for paths not yet written.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────────
 * A document whose status cannot be read is NOT writable. The alternative —
 * treating an unreadable status as unlocked — would turn any transient read
 * failure into permission to write to a sealed record, which is the one outcome
 * this gate exists to prevent. A missing section is likewise refused rather than
 * waved through; the caller reports it as the 404 it is.
 */

/** Anything that can run a query: the pool, or a caller's transaction client. */
export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

/**
 * Document statuses that seal the content.
 *
 * FROZEN  — `POST /docs/:docId/freeze` snapshotted and hash-sealed it.
 * APPROVED — an approval e-signature was applied, which freezes it too.
 *
 * IN_REVIEW is deliberately NOT here: review is a state a document is edited
 * during, and the editor's own status filter lists it as editable. Locking it
 * would block the review cycle rather than protect a sealed record.
 */
export const LOCKED_DOCUMENT_STATUSES: ReadonlySet<string> = new Set(['FROZEN', 'APPROVED']);

export interface LockVerdict {
  /** May the caller mutate this document's content? */
  writable: boolean;
  /** Present when `writable` is false: why, in the user's terms. */
  reason?: string;
  /** Machine-readable, for clients that branch. */
  code?: 'DOCUMENT_FROZEN' | 'DOCUMENT_NOT_FOUND' | 'SEAL_CHECK_UNAVAILABLE';
  /** The status that decided it, for the audit line. */
  status?: string;
}

const FROZEN_MESSAGE = (status: string) =>
  status === 'APPROVED'
    ? 'This document has been approved and frozen. Approved content is part of the signed record and cannot be edited. ' +
      'Create a new version to make further changes.'
    : 'This document is frozen. Its content is sealed under a content hash and cannot be edited. ' +
      'Create a new version to make further changes.';

interface DocRow {
  status: string | null;
  locked_at: string | Date | null;
}

/**
 * Does this row seal its content? The ONE definition, shared by every entry
 * point below — it was written out twice and a third copy for the filing door
 * is exactly how the three would drift apart.
 *
 * `locked_at` is part of the schema's lock vocabulary. Nothing sets it today,
 * so honouring it costs nothing and means a future writer that does set it is
 * enforced from the moment it lands rather than from the moment someone
 * remembers to update this list.
 */
function sealsContent(doc: DocRow): boolean {
  return LOCKED_DOCUMENT_STATUSES.has(String(doc.status ?? '').toUpperCase()) || doc.locked_at != null;
}

/**
 * May this document's content be mutated right now?
 *
 * `executor` is the caller's transaction client wherever one exists, so the
 * status is read inside the same transaction as the write it guards. Reading it
 * on the pool while writing in a transaction would leave a window in which a
 * concurrent freeze commits between the check and the write.
 */
export async function checkDocumentWritable(
  executor: Queryable,
  docId: string,
  tenantId: number,
): Promise<LockVerdict> {
  const { rows } = await executor.query(
    'SELECT status, locked_at FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
    [docId, tenantId],
  );
  const doc = rows[0] as DocRow | undefined;

  if (!doc) {
    return {
      writable: false,
      code: 'DOCUMENT_NOT_FOUND',
      reason: 'The document this section belongs to was not found in your organization.',
    };
  }

  const status = String(doc.status ?? '').toUpperCase();
  if (sealsContent(doc)) {
    return { writable: false, code: 'DOCUMENT_FROZEN', reason: FROZEN_MESSAGE(status), status };
  }

  return { writable: true, status };
}

/**
 * The same gate, entered from the FILING side — the governed document a
 * section PATCH on `c2c_document_sections` writes.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * This module's header names four content paths and says "one guard, called by
 * every writer". There is a FIFTH, and it writes the store that matters most:
 * `PATCH /api/c2c/documents/:id/sections/:key`, the MDx editor's save, puts
 * text into `c2c_document_sections` — the system of record an eCTD leaf is
 * materialized from. It asked only `c2c_documents.status`, and the authoring
 * freeze does not set that: `POST /docs/:docId/freeze` writes
 * `frozen_documents` and `authoring_documents.status = 'FROZEN'` and touches
 * `c2c_documents` not at all. So a FROZEN or APPROVED document's FILED text
 * could still be changed while its seal, and every signature over it, covered
 * the editing layer only — the §11.10(e) failure this module was written to
 * close, one store over.
 *
 * ── The three answers, and why none of them is a guess ───────────────────────
 * NOTHING BOUND is writable, not "not found". A filing nobody edits through
 * Authoring has no authoring seal to respect, and the MDx editor is a
 * first-class door — refusing it for the absence of an authoring document
 * would break the surface to protect a seal that does not exist.
 *
 * NO AUTHORING BUNDLE on this deployment is writable too, and for the same
 * reason rather than by tolerance: if `authoring_documents` is not there, no
 * authoring document can be bound, so there is nothing sealed on that side.
 * Only the two codes Postgres raises for that are read this way (42P01, 42703).
 *
 * ANY OTHER READ FAILURE refuses, with `SEAL_CHECK_UNAVAILABLE`. "We could not
 * tell whether this record is sealed" is not permission to write to it — the
 * posture this module's header already states for an unreadable status, and
 * the shape the authoring router's own `BINDING_CHECK_UNAVAILABLE` uses.
 *
 * ANY sealed bound document seals the filing. The binding is not unique, so
 * the rows are filtered by {@link sealsContent} rather than the first row
 * winning: one frozen editing copy is enough.
 */
export async function checkFilingWritable(
  executor: Queryable,
  c2cDocumentId: string,
  tenantId: number,
): Promise<LockVerdict> {
  let rows: unknown[];
  try {
    ({ rows } = await executor.query(
      'SELECT status, locked_at FROM authoring_documents WHERE c2c_document_id = $1 AND tenant_id = $2',
      [c2cDocumentId, tenantId],
    ));
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    /* 42P01 undefined_table, 42703 undefined_column: this deployment carries
       the governed bundle without the authoring one, so nothing can be bound
       and nothing on that side is sealed. */
    if (code === '42P01' || code === '42703') return { writable: true };
    return {
      writable: false,
      code: 'SEAL_CHECK_UNAVAILABLE',
      reason:
        'Whether the document bound to this filing is sealed could not be checked, so nothing was changed. ' +
        'Try again.',
    };
  }
  const sealed = (rows as DocRow[]).find((d) => sealsContent(d));
  if (!sealed) return { writable: true };
  const status = String(sealed.status ?? '').toUpperCase();
  return { writable: false, code: 'DOCUMENT_FROZEN', reason: FROZEN_MESSAGE(status), status };
}

/**
 * The same gate, entered from a section id.
 *
 * Resolves the section's parent document and applies {@link checkDocumentWritable}.
 * The section's own tenancy is checked here so a caller cannot reach another
 * organization's document through a section id it guessed.
 */
export async function checkSectionWritable(
  executor: Queryable,
  sectionId: string,
  tenantId: number,
): Promise<LockVerdict> {
  const { rows } = await executor.query(
    `SELECT d.status, d.locked_at
       FROM authoring_sections s
       JOIN authoring_documents d ON d.id = s.doc_id AND d.tenant_id = s.tenant_id
      WHERE s.id = $1 AND s.tenant_id = $2`,
    [sectionId, tenantId],
  );
  const doc = rows[0] as DocRow | undefined;

  if (!doc) {
    return {
      writable: false,
      code: 'DOCUMENT_NOT_FOUND',
      reason: 'That section, or the document it belongs to, was not found in your organization.',
    };
  }

  const status = String(doc.status ?? '').toUpperCase();
  if (LOCKED_DOCUMENT_STATUSES.has(status) || doc.locked_at != null) {
    return { writable: false, code: 'DOCUMENT_FROZEN', reason: FROZEN_MESSAGE(status), status };
  }

  return { writable: true, status };
}
