/**
 * Which section of the filing an authored section's text belongs to, and what
 * that filing section then holds.
 *
 * 2026-10-08 (QA walk 2, j4). The "2.5 Clinical Overview" template seeds
 * 2.5.1 … 2.5.7, the ICH M4E headings INSIDE the Clinical Overview, and the
 * IND outline files the Clinical Overview as one node, 2.5 — as eCTD files it,
 * one document at 2.5. The section match was exact, so no save of that
 * document ever reached the filing ("The filing has no section 2.5.1"). The
 * placement dialog already decided the other half of this: it files such a
 * document as one leaf at its own code, 2.5 (AuthoringPlaceIntoFiling
 * documentFilingCode). So the outline is right and the template is right; the
 * binding was too narrow.
 *
 * The rule is shared with the editor's outline:
 * shared/regulatory/filing-section-key.ts (filingSectionKey). A section with no
 * node reaches nothing, and the caller says so exactly as before.
 * A node that holds several of the document's sections receives all of them
 * that have text, in the editor's order, assembled as the filing copy is
 * (assembleAuthoredSections). A node that holds only its own exact section
 * receives that section's text unchanged — the behaviour every existing
 * binding relies on.
 */
import type { PoolClient } from 'pg';
import { assembleAuthoredSections } from '../ana/authoring-canonical-bridge.js';
import type { CommitSectionResult } from './commit-section-to-filing.js';

export interface FilingSectionText {
  /** What the outline node receives. */
  text: string;
  /** Set when the node holds several of the document's sections; the node's key. */
  partOf?: string;
}

/**
 * The text the outline node `key` receives when section `sectionId` is saved
 * with `content`: that section's own text when it is the node's only section,
 * otherwise the document's sections under the node that have text, assembled.
 * Read on the caller's transaction; the saved section's text is the one given,
 * whether or not its row has been written yet.
 */
export async function filingSectionText(
  client: Pick<PoolClient, 'query'>,
  args: { sectionId: string; tenantId: number; key: string; code: string; content: string },
): Promise<FilingSectionText> {
  const { sectionId, tenantId, key, code, content } = args;
  const rows = await client.query<{ id: string; code: string; title: string | null; content: string | null }>(
    `SELECT s.id::text AS id, s.code, s.title, s.content
       FROM authoring_sections s
      WHERE s.tenant_id = $2
        AND s.doc_id = (SELECT doc_id FROM authoring_sections WHERE id = $1 AND tenant_id = $2)
        AND (s.code = $3 OR left(s.code, length($3) + 1) = $3 || '.')
      ORDER BY s.order_index, s.created_at, s.id`,
    [sectionId, tenantId, key],
  );
  const members = rows.rows.map((r) => (r.id === String(sectionId) ? { ...r, content } : r));
  if (members.length <= 1 && code === key) return { text: content };
  const written = members.filter((m) => String(m.content ?? '').trim() !== '');
  return { text: assembleAuthoredSections(written), partOf: key };
}

/** What a section save reports about the filing, as the routes send it (`partOf` when it went into a node). */
export function filingResponse(r: CommitSectionResult) {
  return r.committed
    ? { committed: true as const, documentId: r.documentId, sectionKey: r.sectionKey, ...(r.partOf ? { partOf: r.partOf } : {}) }
    : { committed: false as const, reason: r.reason };
}
