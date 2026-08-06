/**
 * Author-lineage gate — the single chokepoint every authored-content write must
 * pass so that content and its provenance commit together or not at all.
 *
 * Background: authoring_sections is written from several routes (interactive
 * save, section create, revert, bulk template apply, change-request apply).
 * Only the interactive save enforced lineage; the others persisted authored
 * text with no provenance, which is precisely the record a 21 CFR Part 11
 * inspection asks for. This helper factors that enforcement out of the save
 * handler so every writer applies the identical rule.
 *
 * The rule: for non-empty content, record an AUTHOR span per detected clause,
 * then assert the recorded spans cover the content — throwing (to roll the
 * caller's transaction back) if a gap remains. Empty content is a no-op: an
 * honest empty scaffold (a freshly-seeded section) has nothing to attribute.
 *
 * Callers MUST invoke this inside the SAME transaction as their content write,
 * passing that transaction's client as `exec`, so a lineage failure rolls the
 * content write back with it. A refused save is recoverable; content that
 * quietly lost its provenance is not.
 *
 * @module server/services/clinical-regulatory-evidence/lineage-gate
 */

import { detectSpans } from '../sentenceTraceabilityService';
import {
  replaceAuthorSpans,
  assertLineageCoversContent,
  type Queryable,
} from './span-lineage.service';

export interface AuthorLineageRef {
  documentTable: string;
  documentId: string;
}

/**
 * Enforce author lineage for one content write, within the caller's
 * transaction.
 *
 * @param exec    the transaction client (pg PoolClient) the content write used
 * @param orgId   tenant id
 * @param ref     the document row the content belongs to
 * @param content the content being written (empty/null ⇒ no-op)
 * @param actor   the author id recorded as `assertedBy`/`createdBy`
 * @throws when the recorded spans do not cover the content (SpanLineageError)
 */
export async function enforceAuthorLineage(
  exec: Queryable,
  orgId: number,
  ref: AuthorLineageRef,
  content: string | null | undefined,
  actor: string,
): Promise<void> {
  if (content == null || typeof content !== 'string' || content.length === 0) {
    // Nothing authored → nothing to attribute. Matches the empty-scaffold seed
    // path and assertLineageCoversContent's own length<=0 early return.
    return;
  }

  const spans = detectSpans(content, 'clause').map((s) => ({
    charStart: s.charStart,
    charEnd: s.charEnd,
    spanText: s.text,
  }));

  await replaceAuthorSpans(orgId, ref, spans, { assertedBy: actor, createdBy: actor }, exec);

  // Ask the database what it is about to commit, rather than trusting that the
  // writer not throwing means the rows say what they should.
  await assertLineageCoversContent(orgId, ref, content, exec);
}
