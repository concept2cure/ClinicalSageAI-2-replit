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
  replaceMachineSpans,
  listLiveMachineSpans,
  assertLineageCoversContent,
  type Queryable,
  retireStaleSourceSpans,
} from './span-lineage.service';
import { attributeMachineSpans, type AcceptedMachineText } from './machine-attribution';
import {
  attributeQuotedSpans,
  attributeAssertedParaphraseSpans,
  quotedCoverage,
  type RetrievedSource,
  type ParaphraseAssertion,
} from './source-attribution';

export interface AuthorLineageRef {
  documentTable: string;
  documentId: string;
}

export interface AuthorLineageOptions {
  /**
   * Text the reviewer accepted from a machine author in the editing session
   * this save closes (validated at the request boundary by
   * acceptedMachineText in revision-ledger.ts). A clause verbatim inside it is
   * recorded as the machine's, accepted by `actor` — never as the actor's own
   * assertion. Absent means nothing was accepted in this save; machine spans
   * recorded by earlier saves still carry forward by their text.
   */
  acceptedMachineText?: AcceptedMachineText[];
  /**
   * Set when the WHOLE content of this write is a machine author's draft that
   * no human has accepted — AnA's own tool writes (write_q_sub_section,
   * save_document_to_vault, the AnA-RI drafting writeback, an AI rewrite or
   * refine applied on the user's instruction). Every clause not attributable
   * to a source or to an acceptance is recorded as that machine's
   * `machine_draft`: no asserter, because there is none. `actor` is still
   * recorded, as the requester (created_by), which is a different and true
   * claim.
   *
   * Absent means the content is the actor's own work, which stays the default:
   * this option makes a POSITIVE claim only when the caller genuinely knows
   * the machine wrote it.
   */
  machineDraft?: { authorId: string } | null;
}

/**
 * The clause split every gate shares, with the machine's clauses taken out
 * and written first. Returns the clauses that remain the actor's to assert.
 *
 * Order matters: a clause the machine drafted must be recorded as such BEFORE
 * the author pass, or the author pass claims it. Both writers replace their own
 * kind only, so the two sets never overlap and together they partition the
 * candidates exactly.
 */
async function attributeMachineThenAuthor(
  exec: Queryable,
  orgId: number,
  ref: AuthorLineageRef,
  candidates: Array<{ charStart: number; charEnd: number; text: string }>,
  actor: string,
  accepted: AcceptedMachineText[],
  machineDraft: { authorId: string } | null,
): Promise<{ machineSpans: number; machineDraftSpans: number; authorSpans: number }> {
  const live = await listLiveMachineSpans(orgId, ref, exec);
  const machine = attributeMachineSpans(candidates as Parameters<typeof attributeMachineSpans>[0], {
    accepted,
    live,
    actor,
    machineDraft,
  });
  await replaceMachineSpans(orgId, ref, machine, { createdBy: actor }, exec);

  const machineRanges = new Set(machine.map((m) => `${m.charStart}:${m.charEnd}`));
  const authorSpans = candidates
    .filter((c) => !machineRanges.has(`${c.charStart}:${c.charEnd}`))
    .map((c) => ({ charStart: c.charStart, charEnd: c.charEnd, spanText: c.text }));
  await replaceAuthorSpans(orgId, ref, authorSpans, { assertedBy: actor, createdBy: actor }, exec);

  return {
    machineSpans: machine.filter((m) => m.assertedBy).length,
    machineDraftSpans: machine.filter((m) => !m.assertedBy).length,
    authorSpans: authorSpans.length,
  };
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
 * @param opts    what this save accepted from a machine author, if anything
 * @throws when the recorded spans do not cover the content (SpanLineageError)
 */
export async function enforceAuthorLineage(
  exec: Queryable,
  orgId: number,
  ref: AuthorLineageRef,
  content: string | null | undefined,
  actor: string,
  opts: AuthorLineageOptions = {},
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
  const candidates = detectSpans(content, 'clause').filter(
    (s) => !keptRanges.has(`${s.charStart}:${s.charEnd}`),
  );

  // The machine's clauses first — accepted in this save, or carried forward
  // from an earlier one by their text — then everything else as the actor's.
  await attributeMachineThenAuthor(
    exec, orgId, ref, candidates, actor,
    opts.acceptedMachineText ?? [],
    opts.machineDraft ?? null,
  );

  // Ask the database what it is about to commit, rather than trusting that the
  // writer not throwing means the rows say what they should.
  await assertLineageCoversContent(orgId, ref, content, exec);
}

export interface SourceAndAuthorLineageResult {
  /** Total cre_evidence_source spans recorded — quoted + paraphrased (exceeds
   *  clause count when a clause is multi-sourced). */
  sourceSpans: number;
  /** Verified-quote source spans (a checkable substring fact). */
  quotedSpans: number;
  /** Model-asserted paraphrase source spans (an assertion, not a verified fact). */
  paraphrasedSpans: number;
  /** Accepted-machine-draft spans: drafted by a machine author, accepted by
   *  the actor (this save, or an earlier one carried forward). */
  machineSpans: number;
  /** Machine-draft spans nobody has accepted. */
  machineDraftSpans: number;
  /** Author spans recorded for the remainder (neither quoted, paraphrased, nor
   *  the machine's). */
  authorSpans: number;
  /** Distinct cre_evidence_sources cited (across both quoted and paraphrased). */
  distinctSources: number;
  /** Percent of non-whitespace content VERIFIABLY quoted from a source (quoted
   *  only — paraphrase is a claim and is deliberately not counted as coverage). */
  coverage: number;
}

/**
 * Enforce source + author lineage for one content write, within the caller's
 * transaction — the automated-attribution counterpart of enforceAuthorLineage.
 *
 * Where enforceAuthorLineage attributes every clause to the author, this splits
 * the content three ways, in priority order:
 *   1. a clause whose text appears VERBATIM in a retrieved source → verified
 *      `quoted` source span (a checkable substring fact);
 *   2. otherwise, a clause the model ASSERTED it derived from a retrieved source
 *      (via `opts.assertions`) → `paraphrased` source span, recorded explicitly as
 *      the model's claim, never as a verified quote, and only for a source that was
 *      actually retrieved — a verified quote always wins over a claim about the
 *      same characters;
 *   3. otherwise, a clause verbatim in text accepted from a machine author (via
 *      `opts.acceptedMachineText`), or already the machine's from an earlier
 *      save → an `accepted_machine_draft` span naming the machine and the
 *      accepting human;
 *   4. otherwise, when the whole write is an unaccepted machine draft (via
 *      `opts.machineDraft`) → a `machine_draft` span naming the machine and NO
 *      asserter;
 *   5. everything else → an author assertion.
 * The union covers the content, so assertLineageCoversContent passes exactly as it
 * does for pure author lineage. The source half stays honest by construction:
 * quotes are checkable, paraphrase is marked as an assertion, and nothing is
 * attributed to a source the model was not given. With no `assertions` passed the
 * paraphrase pass is empty and behavior is identical to the quote-only path.
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
  opts: {
    minQuoteChars?: number;
    assertions?: ParaphraseAssertion[];
    acceptedMachineText?: AcceptedMachineText[];
    machineDraft?: { authorId: string } | null;
  } = {},
): Promise<SourceAndAuthorLineageResult> {
  if (content == null || typeof content !== 'string' || content.length === 0) {
    // Nothing authored → retire whatever was previously attributed so the reads
    // stop answering for content that is gone, then no-op the gate.
    await replaceSourceSpans(orgId, ref, [], { createdBy: actor }, exec);
    await replaceMachineSpans(orgId, ref, [], { createdBy: actor }, exec);
    await replaceAuthorSpans(orgId, ref, [], { assertedBy: actor, createdBy: actor }, exec);
    return {
      sourceSpans: 0,
      quotedSpans: 0,
      paraphrasedSpans: 0,
      machineSpans: 0,
      machineDraftSpans: 0,
      authorSpans: 0,
      distinctSources: 0,
      coverage: 0,
    };
  }

  // 1. Verified-quote spans — pure, deterministic, zero model trust. Clause
  //    granularity matches author lineage so the passes partition the same clauses.
  const quoted = attributeQuotedSpans(content, sources, {
    granularity: 'clause',
    minQuoteChars: opts.minQuoteChars,
    multiSource: true,
  });
  const quotedRanges = new Set(quoted.map((s) => `${s.charStart}:${s.charEnd}`));

  // 2. Model-asserted paraphrase spans for clauses the verified pass did NOT
  //    claim. Recorded as 'paraphrased' (an assertion), never 'quoted', and only
  //    for a source that was actually retrieved — a verified fact always wins over
  //    a claim about the same characters (alreadyQuotedRanges enforces that).
  const paraphrased = attributeAssertedParaphraseSpans(content, sources, opts.assertions ?? [], {
    granularity: 'clause',
    minQuoteChars: opts.minQuoteChars,
    multiSource: true,
    alreadyQuotedRanges: quotedRanges,
  });

  // 3. Both kinds are cre_evidence_source rows, so they persist as ONE set through
  //    a single replaceSourceSpans call — that way the retire step keeps both and
  //    does not treat the other usage's rows as stale.
  const sourceSpans = [...quoted, ...paraphrased];
  await replaceSourceSpans(
    orgId,
    ref,
    sourceSpans.map((s) => ({
      charStart: s.charStart,
      charEnd: s.charEnd,
      spanText: s.spanText,
      sourceId: s.sourceId,
      usage: s.usage,
    })),
    { createdBy: actor },
    exec,
  );

  // 4. The remainder: every clause attributed to neither a verified quote nor
  //    a paraphrase assertion. Clause offsets are exact, so range membership is
  //    exact. The machine's clauses are taken out of it first — an accepted AI
  //    draft is, by definition, machine text wherever the author left it
  //    unedited — and what is left is the author's.
  const attributedRanges = new Set<string>(quotedRanges);
  for (const s of paraphrased) attributedRanges.add(`${s.charStart}:${s.charEnd}`);
  const remainder = detectSpans(content, 'clause').filter(
    (s) => !attributedRanges.has(`${s.charStart}:${s.charEnd}`),
  );
  const { machineSpans, machineDraftSpans, authorSpans } = await attributeMachineThenAuthor(
    exec, orgId, ref, remainder, actor,
    opts.acceptedMachineText ?? [],
    opts.machineDraft ?? null,
  );

  // 5. Ask the database what it is about to commit. A gap throws and rolls the
  //    content write back with it.
  await assertLineageCoversContent(orgId, ref, content, exec);

  return {
    sourceSpans: sourceSpans.length,
    quotedSpans: quoted.length,
    paraphrasedSpans: paraphrased.length,
    machineSpans,
    machineDraftSpans,
    authorSpans,
    distinctSources: new Set(sourceSpans.map((s) => s.sourceId)).size,
    coverage: quotedCoverage(content, quoted),
  };
}
