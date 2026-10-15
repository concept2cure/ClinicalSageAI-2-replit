/**
 * Which submission leaves file a co-author document, and what re-taking it as
 * a filing copy may still change.
 *
 * 2026-10-08 (QA walk 2, j4 blocker). takeAuthoringSnapshot keeps one filing
 * copy per source authoring document and re-takes that same copy on every
 * placement. A leaf pins the sha256 of the copy's text when it is placed
 * (submission-service upsertLeaf, LEAF_SOURCE_VERIFIERS.coauthor_documents), so
 * re-taking an edited document rewrote the text the leaf had filed: leaf #81's
 * copy took the edited text, its pin no longer matched, and the original filed
 * copy survived only as a superseded version row. The placement dialog then
 * read upsertLeaf's "unchanged" answer as "Nothing was written".
 *
 * The rule now: a copy that a live leaf points at is the filed record. Its text
 * and title are never rewritten by a re-take, in any sequence state. Its status
 * may only move forward (draft -> finalized -> approved), and only with the
 * text unchanged: that is the same bytes, now held to their seal, which is how
 * a draft placed early becomes the approved document it already was.
 * Anything else is refused and nothing is written. A leaf that is removed no
 * longer files the copy, so a draft sequence's author removes the leaf and
 * places again; a frozen or dispatched sequence keeps its leaf, and the source
 * cannot be filed again until a copy can be taken beside the filed one (the
 * alias map holds one copy per source: a decision, not built here).
 */
import { documentSourceLabel } from '../../../shared/regulatory/canonical-document.js';

/** A pg-shaped executor: the placement's transaction (queryableFromDrizzle). */
interface PinExecutor {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface FilingCopyPin {
  leafId: number;
  sectionCode: string;
  sequenceNumber: string;
  sequenceStatus: string;
}

/** The live leaves, in live sequences of this organization, that file this co-author document. */
export async function filingCopyPins(
  q: PinExecutor,
  args: { copyId: number; organizationId: number },
): Promise<FilingCopyPin[]> {
  const r = await q.query<{ id: number; section_code: string; sequence_number: string; status: string }>(
    `SELECT l.id, l.section_code, s.sequence_number, s.status
       FROM submission_leaves l
       JOIN ectd_sequences s ON s.id = l.sequence_id AND s.organization_id = l.organization_id
      WHERE l.document_table = 'coauthor_documents' AND l.document_id = $1
        AND l.organization_id = $2 AND l.deleted_at IS NULL AND s.deleted_at IS NULL
      ORDER BY l.id`,
    [args.copyId, args.organizationId],
  );
  return r.rows.map((x) => ({
    leafId: Number(x.id),
    sectionCode: String(x.section_code),
    sequenceNumber: String(x.sequence_number),
    sequenceStatus: String(x.status),
  }));
}

const STATUS_RANK: Record<string, number> = { draft: 0, finalized: 1, approved: 2 };
const rank = (status: string | null | undefined): number => STATUS_RANK[String(status ?? '').toLowerCase()] ?? 0;

/** What a re-take would change on a copy, compared field by field. */
export function retakeChanges(
  existing: { title: string | null; content: string | null; status: string | null },
  derived: { title: string; content: string; status: string },
): { text: boolean; title: boolean; status: 'same' | 'promoted' | 'demoted' } {
  const from = rank(existing.status);
  const to = rank(derived.status);
  return {
    text: (existing.content ?? '') !== derived.content,
    title: (existing.title ?? '') !== derived.title,
    status:
      String(existing.status ?? '') === derived.status ? 'same' : to > from ? 'promoted' : 'demoted',
  };
}

/** True when a pinned copy may take this re-take: same text and title, status unchanged or promoted. */
export function pinnedCopyAccepts(changes: ReturnType<typeof retakeChanges>): boolean {
  return !changes.text && !changes.title && changes.status !== 'demoted';
}

const LOCKED = new Set(['frozen', 'dispatched']);
const MAX_NAMED = 3;

/** The refusal, naming the leaves that file the copy and what the author can do. */
export function pinnedCopyRefusal(
  copyId: number,
  pins: FilingCopyPin[],
  changes: ReturnType<typeof retakeChanges>,
): { error: 'FILING_COPY_PINNED'; code: 'FILING_COPY_PINNED'; message: string; leaves: FilingCopyPin[] } {
  const named = pins
    .slice(0, MAX_NAMED)
    .map((p) => `leaf #${p.leafId} at ${p.sectionCode} in sequence ${p.sequenceNumber} (${p.sequenceStatus})`);
  const more = pins.length > MAX_NAMED ? ` and ${pins.length - MAX_NAMED} more` : '';
  const what = changes.text || changes.title
    ? 'The document has changed since it was placed'
    : 'The document’s status has moved back since it was placed';
  const removable = pins.some((p) => !LOCKED.has(p.sequenceStatus.toLowerCase()));
  const way = removable
    ? ' To file the document as it is now, remove that leaf in Submission Center, then place the document again.'
    : '';
  const kept = pins.some((p) => LOCKED.has(p.sequenceStatus.toLowerCase()))
    ? ' A frozen or dispatched sequence keeps its leaf as filed.'
    : '';
  /* `code` as well as `error`: the client reads a refusal's code from `code`
     (or error.code), and this route's bodies carry the code in `error`. */
  return {
    error: 'FILING_COPY_PINNED',
    code: 'FILING_COPY_PINNED',
    leaves: pins,
    message:
      `This document is already filed: ${named.join(', ')}${more} holds its filing copy ` +
      `(${documentSourceLabel('coauthor_documents', copyId)}), as the document was when it was placed. ` +
      `${what}, and a filed copy is never rewritten. Nothing was written.${way}${kept}`,
  };
}
