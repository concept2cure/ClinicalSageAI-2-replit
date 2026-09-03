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
  replaceSourceSpans,
  assertLineageCoversContent,
  type Queryable,
  retireStaleSourceSpans,
} from './span-lineage.service';
import {
  attributeQuotedSpans,
  quotedCoverage,
  type RetrievedSource,
} from './source-attribution';

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

  // Source spans recorded by an earlier accept are claims about characters at
  // fixed offsets. This save has no sources to re-verify against, so each is
  // kept only if its quoted text is still exactly where it was, and retired
  // otherwise — the "a citation can never go stale" guarantee holds across a
  // human edit, not just across an accept.
  const { kept } = await retireStaleSourceSpans(orgId, ref, content, exec);
  const keptRanges = new Set(kept.map((k) => `${k.charStart}:${k.charEnd}`));
  const spans = detectSpans(content, 'clause')
    .filter((s) => !keptRanges.has(`${s.charStart}:${s.charEnd}`))
    .map((s) => ({
      charStart: s.charStart,
      charEnd: s.charEnd,
      spanText: s.text,
    }));

  await replaceAuthorSpans(orgId, ref, spans, { assertedBy: actor, createdBy: actor }, exec);

  // Ask the database what it is about to commit, rather than trusting that the
  // writer not throwing means the rows say what they should.
  await assertLineageCoversContent(orgId, ref, content, exec);
}

export interface SourceAndAuthorLineageResult {
  /** Verified-quote source spans recorded (exceeds clause count when multi-sourced). */
  sourceSpans: number;
  /** Author spans recorded for the non-quoted remainder. */
  authorSpans: number;
  /** Distinct cre_evidence_sources cited. */
  distinctSources: number;
  /** Percent of non-whitespace content verifiably quoted from a source. */
  coverage: number;
}

/**
 * Enforce source + author lineage for one content write, within the caller's
 * transaction — the automated-attribution counterpart of enforceAuthorLineage.
 *
 * Where enforceAuthorLineage attributes every clause to the author, this splits
 * the content: a clause whose text appears VERBATIM in one of the retrieved
 * `sources` is recorded as a verified `quoted` source span; every other clause is
 * recorded as an author assertion. The union covers the content, so
 * assertLineageCoversContent passes exactly as it does for pure author lineage —
 * and the source half is honest by construction (only checkable substring facts
 * are cited; text the model paraphrased or wrote itself falls to the author, never
 * to a guessed citation).
 *
 * Both span kinds are REPLACED, not merely added: re-accepting a draft re-states
 * the whole set, so a quote or clause the new text no longer contains is retired
 * rather than left pointing at characters that have moved — this is what makes the
 * design's "a citation can never go stale" guarantee hold across edits.
 *
 * Empty/null content is a no-op for the coverage gate but still retires any prior
 * spans for the document, so an accept that clears the section leaves no orphans.
 *
 * Callers MUST invoke this inside the SAME transaction as their content write,
 * passing that transaction's client as `exec`, so a lineage failure rolls the
 * content write back with it.
 *
 * @throws when the recorded spans do not cover the content (SpanLineageError), or
 *         when a cited source is not visible to the tenant (recordSourceSpan) —
 *         both of which correctly fail the save closed.
 */
export async function enforceSourceAndAuthorLineage(
  exec: Queryable,
  orgId: number,
  ref: AuthorLineageRef,
  content: string | null | undefined,
  actor: string,
  sources: RetrievedSource[],
  opts: { minQuoteChars?: number } = {},
): Promise<SourceAndAuthorLineageResult> {
  if (content == null || typeof content !== 'string' || content.length === 0) {
    // Nothing authored → retire whatever was previously attributed so the reads
    // stop answering for content that is gone, then no-op the gate.
    await replaceSourceSpans(orgId, ref, [], { createdBy: actor }, exec);
    await replaceAuthorSpans(orgId, ref, [], { assertedBy: actor, createdBy: actor }, exec);
    return { sourceSpans: 0, authorSpans: 0, distinctSources: 0, coverage: 0 };
  }

  // 1. Verified-quote spans — pure, deterministic, zero model trust. Clause
  //    granularity matches author lineage so the two partition the same clauses.
  const quoted = attributeQuotedSpans(content, sources, {
    granularity: 'clause',
    minQuoteChars: opts.minQuoteChars,
    multiSource: true,
  });
  await replaceSourceSpans(
    orgId,
    ref,
    quoted.map((s) => ({
      charStart: s.charStart,
      charEnd: s.charEnd,
      spanText: s.spanText,
      sourceId: s.sourceId,
      usage: s.usage,
    })),
    { createdBy: actor },
    exec,
  );

  // 2. Author spans for the remainder: every clause NOT covered by a verified
  //    quote. attributeQuotedSpans attributes WHOLE clause spans, so a quoted
  //    clause shares its (start,end) with a detected clause — range membership is
  //    exact, and multi-sourced clauses (several quoted rows, one range) collapse
  //    to a single excluded clause.
  const quotedRanges = new Set(quoted.map((s) => `${s.charStart}:${s.charEnd}`));
  const authorSpans = detectSpans(content, 'clause')
    .filter((s) => !quotedRanges.has(`${s.charStart}:${s.charEnd}`))
    .map((s) => ({ charStart: s.charStart, charEnd: s.charEnd, spanText: s.text }));
  await replaceAuthorSpans(orgId, ref, authorSpans, { assertedBy: actor, createdBy: actor }, exec);

  // 3. Ask the database what it is about to commit. A gap throws and rolls the
  //    content write back with it.
  await assertLineageCoversContent(orgId, ref, content, exec);

  return {
    sourceSpans: quoted.length,
    authorSpans: authorSpans.length,
    distinctSources: new Set(quoted.map((s) => s.sourceId)).size,
    coverage: quotedCoverage(content, quoted),
  };
}
