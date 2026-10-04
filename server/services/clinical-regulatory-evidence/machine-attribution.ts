/**
 * Machine attribution — which clauses of a saved text were drafted by a machine
 * author and accepted by a human.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * The lineage gate re-derives every clause of the saved content on each write
 * and records each one it cannot tie to a Data Room source as the human
 * actor's `author_assertion` — including the clauses AnA drafted and the human
 * merely accepted. So the Data Origins panel and its PDF said "Asserted by the
 * author" over prose a model produced. The revision ledger knew better at save
 * grain (`origin: 'ai-draft-accept'`); this is the same fact at clause grain.
 *
 * ── How a clause becomes the machine's ────────────────────────────────────────
 * The same way a clause becomes a source's in source-attribution.ts: by
 * verbatim match, on a normalized copy, with the offsets left untouched.
 *
 *   1. NEWLY ACCEPTED TEXT. The editor keeps the text of every insertion the
 *      reviewer accepted from a machine author (suggestions.ts), and the save
 *      carries it in. A clause of the saved content whose normalized text is
 *      inside that accepted text is the machine's, accepted by this save's
 *      actor, now. The match is occurrence-bounded: accepted text containing
 *      one "Not applicable." attributes at most one such clause, so a human's
 *      identical clause elsewhere is not swept up.
 *
 *   2. CARRY-FORWARD. A later save carries no accepted text (the reviewer
 *      accepted nothing), but the machine's clauses are still there. Each live
 *      machine span is matched to a clause with the same text hash — nearest
 *      by offset when the text repeats — and re-recorded at the clause's new
 *      offsets with its ORIGINAL attribution: the machine that drafted it and
 *      the human who accepted it, then. The later saver did not accept it and
 *      is not named as if they had.
 *
 *   3. A WHOLE-CONTENT DRAFT. AnA's own tool writes produce content no human
 *      has seen, let alone accepted. Every clause left is that machine's
 *      `machine_draft` — no asserter at all, because there is none. Who asked
 *      is recorded separately, as createdBy.
 *
 *   A clause that matches none of these is not the machine's: the human who
 *   saved it asserts it, exactly as before. The moment a human edits a machine
 *   clause's words its hash changes, no accepted text contains the new words,
 *   and it becomes theirs — which is the true statement about an edited clause.
 *
 * ── What is compared: the words a reader is shown ─────────────────────────────
 * A clause is the machine's only when every reader of the saved content shows
 * the machine's words in it. Two read it today (periodic review 2026-09-28,
 * editor family, the batch-draft accept, rounds 2 and 3):
 *
 *   - as HTML: the eCTD leaf renderer always, and the section editor and the
 *     authoring export whenever the content holds a known tag (looksLikeHtml,
 *     shared/authoring/plain-text-html.ts). A tag is not shown, so the
 *     comparison form drops what a browser parses as one (comparableText);
 *   - as plain text: the section editor and the export, when the content holds
 *     no known tag. Every character is shown, `<q 3 patients died>` included.
 *
 * So two kinds of clause are never compared, and stay the saver's:
 *
 *   - any clause at or after the first place a browser may start reading `<…>`
 *     as text: the opening tag of a raw-text element (xmp, textarea, plaintext,
 *     title, script, style, iframe, noembed, noframes, noscript) or a CDATA
 *     section (text in SVG and MathML). The clause splitter can put the
 *     opening tag in one clause and the words inside in another, where a tag
 *     strip would hide words a reader is shown. Where such an element ends
 *     depends on attribute quoting, comments and the element around it, which
 *     no regex follows; a scanner that tried could be misled into ending early.
 *     From the first opener to the end of the content is the region every such
 *     element can lie in, so nothing past it is compared;
 *   - in content read as plain text, a clause holding anything a browser would
 *     parse as a tag. One reader hides it and the other shows it, so its words
 *     are not one thing.
 *
 * Both rules apply to newly accepted text and to the carry-forward of an
 * accepted clause, whose words were matched with tags removed and may hold
 * text a later save makes visible (an `<xmp>` put before it). An unaccepted
 * `machine_draft` clause carries forward as before: it was never matched,
 * every character of it is the machine's own write.
 *
 * ── What this deliberately cannot do ──────────────────────────────────────────
 * It cannot attribute words to a machine that are not in the saved content
 * (the needle is the clause, the haystack is the accepted text — a client
 * claiming text that was never saved matches nothing), and it never guesses:
 * no similarity score, no "mostly the machine's". Either the clause is
 * verbatim in what was accepted, or it is not.
 *
 * Pure and deterministic; the gate does the reading and writing.
 *
 * @module server/services/clinical-regulatory-evidence/machine-attribution
 */

import { looksLikeHtml } from '@shared/authoring/plain-text-html';
import type { SentenceSpan } from '../sentenceTraceabilityService';
import { normalizeForMatch } from './source-attribution';
import { hashSpanText, type LiveMachineSpan } from './span-lineage.service';

/** Text a reviewer accepted from a machine author in one editing session. */
export interface AcceptedMachineText {
  /** A MACHINE_AUTHOR_IDS key — validated at the request boundary. */
  authorId: string;
  /** The accepted insertion's text, as the editor had it. */
  text: string;
}

export interface MachineAttributedSpan {
  charStart: number;
  charEnd: number;
  spanText: string;
  machineAuthorId: string;
  /** The human who accepted the words, when one has. Null means nobody has. */
  assertedBy?: string | null;
  /** When they did. Absent means "now" (a fresh acceptance). */
  assertedAt?: Date;
  signatureId?: string | null;
  /** Who asked for the draft, carried forward so a later saver does not
   *  displace the original requester on a span they did not create. */
  createdBy?: string | null;
  /**
   * True when the clause is inside text accepted from a machine author in THIS
   * save: credited by it now, or credited by an earlier save and accepted again
   * (an accept of the same draft twice). A caller that reports what a save
   * accepted counts these, not every machine span the content carries.
   */
  inAcceptedText: boolean;
}

/**
 * Shorter than this and a clause is a fragment ("a)", "No.") that any accepted
 * text of any length is likely to contain by accident. Deliberately far below
 * source-attribution's quote threshold: there, a short match against a long
 * external document is weak evidence of quotation; here, the haystack is
 * exactly what the machine wrote and the human accepted, and a short clause
 * inside it is very probably that clause. The occurrence bound covers the rest.
 */
export const MIN_MACHINE_CLAUSE_CHARS = 8;

/** The elements whose inside a browser reads as text, not as tags. */
const RAW_TEXT_ELEMENTS = 'textarea|xmp|plaintext|title|script|style|iframe|noembed|noframes|noscript';

/**
 * What a browser parses as a tag, and nothing else: `<` or `</` followed by a
 * letter, up to the next `>`.
 *
 * - A `<` that starts no tag stays: `< 3 … >`, `p<0.05`, `</ x>`, `<!-- -->`,
 *   `<?x?>`. The first two are text a browser shows (the last three it hides
 *   as comments), and a match that keeps them can only fail. Stripping every
 *   `<…>` run (periodic review 2026-09-28, editor family, the batch-draft
 *   accept, round 2) let words typed inside `< … >` into a clause the machine
 *   wrote match as the machine's.
 * - A tag with a `<` or a quoted `>` inside it is stripped at most in part:
 *   what is left stays, and the match fails.
 * - The raw-text elements keep their own tags. In the lineage that changes
 *   nothing any more: no clause at or after one is compared (rawTextFrom). It
 *   is the claim verifier's: a claim holding an `<xmp>` or a `<textarea>` the
 *   turn record does not have is not text AnA wrote, and does not verify.
 * - `[^<>]*`, not `[^>]*`: a run of `<a` with no `>` is scanned once, not
 *   rescanned from every `<` (quadratic on a 400,000-character body).
 */
const BROWSER_TAG = new RegExp(`<\\/?(?!(?:${RAW_TEXT_ELEMENTS})[\\s/>])[a-z][^<>]*>`, 'gi');

/** BROWSER_TAG without the global flag's lastIndex, to ask whether a text holds one. */
const HOLDS_BROWSER_TAG = new RegExp(BROWSER_TAG.source, 'i');

/**
 * The opening tag of a raw-text element (tag name, then white space, `/` or
 * `>`, as a browser reads it, so `<xmp class="q">` and `<plaintext x>` count),
 * or the opening of a CDATA section.
 */
const RAW_TEXT_OPENER = new RegExp(`<(?:${RAW_TEXT_ELEMENTS})(?=[\\s/>])|<!\\[CDATA\\[`, 'i');

/**
 * Where a browser may first read `<…>` in `content` as text: the offset of the
 * first raw-text opener (RAW_TEXT_OPENER), or -1 when there is none. Every
 * clause that ends after it is left to the saver (see "What is compared").
 */
export function rawTextFrom(content: string): number {
  const m = RAW_TEXT_OPENER.exec(content);
  return m ? m.index : -1;
}

/**
 * The comparison form of a text: its tags removed as above, then
 * normalizeForMatch. Comparison only, never for storage or offsets.
 *
 * The ONE form both sides of machine authorship use: this module, to decide
 * which clauses of a save are the machine's, and the claim verifier
 * (services/authoring/machine-claim-verify.ts), to decide which claimed text a
 * turn record holds. A second copy is how they drifted apart.
 *
 * `markdown` is for text as a model wrote it, which only the turn record's side
 * of the verifier holds: the `\|` table escape reads as `|` and every `*` is
 * dropped (emphasis and list markers), because the editor shows neither. Every
 * text the lineage compares is text as shown, so it never sets it. The verifier
 * reads each record text both ways and a claim only as sent, so a claim with an
 * asterisk the record lacks in either reading does not verify.
 */
export function comparableText(text: string, opts: { markdown?: boolean } = {}): string {
  const shown = text.replace(BROWSER_TAG, ' ');
  return normalizeForMatch(opts.markdown ? shown.replace(/\\\|/g, '|').replace(/\*/g, '') : shown);
}

/** Non-overlapping occurrences of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let n = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return n;
    n++;
    from = at + needle.length;
  }
}

/**
 * For each candidate, whether its shown words can be compared at all (see
 * "What is compared"). False means the clause stays the saver's unless it is an
 * unaccepted machine draft carried forward unchanged.
 */
function comparableClauses(candidates: SentenceSpan[], content: string): boolean[] {
  const rawFrom = rawTextFrom(content);
  const readAsPlainText = !looksLikeHtml(content);
  return candidates.map(
    (c) => !((rawFrom !== -1 && c.charEnd > rawFrom) || (readAsPlainText && HOLDS_BROWSER_TAG.test(c.text))),
  );
}

/** One accepted text, in comparison form. `index` is its place in the save's list. */
interface Haystack {
  index: number;
  authorId: string;
  norm: string;
}

/**
 * Step 2 of attributeMachineSpans: the clauses inside text accepted in this
 * save, occurrence-bounded per (accepted text, clause). Marks each credited
 * clause in `claimed`.
 */
function creditNewlyAccepted(
  candidates: SentenceSpan[],
  haystacks: Haystack[],
  needleOf: (i: number) => string | null,
  claimed: Set<number>,
  actor: string,
): MachineAttributedSpan[] {
  const out: MachineAttributedSpan[] = [];
  const budget = new Map<string, number>();
  candidates.forEach((c, i) => {
    if (claimed.has(i)) return;
    const needle = needleOf(i);
    if (needle === null) return;
    for (const h of haystacks) {
      /* Keyed by the ACCEPTED TEXT the count was taken from, not by author
         alone. The count is occurrences(h.norm, needle) — a fact about this
         one accepted insertion — so caching it under a key that names only
         the author makes a zero from one insertion answer for every other.
         A reviewer who accepted two suggestions in one session then had the
         second one's clauses fall through to their own author_assertion:
         the human recorded as asserting prose a machine wrote and they
         merely accepted, which is the statement this module exists to stop.
         Per-insertion is also the honest bound: two accepted insertions that
         each contain the same clause are two clauses a machine wrote and a
         human accepted, and the bound still holds inside each one, which is
         where it was ever doing work. */
      const key = `${h.index} ${h.authorId} ${needle}`;
      let left = budget.get(key);
      if (left === undefined) {
        left = occurrences(h.norm, needle);
        budget.set(key, left);
      }
      if (left <= 0) continue;
      budget.set(key, left - 1);
      claimed.add(i);
      out.push({
        charStart: c.charStart,
        charEnd: c.charEnd,
        spanText: c.text,
        machineAuthorId: h.authorId,
        assertedBy: actor,
        inAcceptedText: true,
      });
      break;
    }
  });
  return out;
}

/**
 * The machine-attributed spans among `candidates` — the clauses of the saved
 * content not already attributed to a source — given what was accepted in
 * this save and what was already the machine's before it.
 */
export function attributeMachineSpans(
  candidates: SentenceSpan[],
  opts: {
    accepted: AcceptedMachineText[];
    live: LiveMachineSpan[];
    /** This save's actor: the acceptor of any NEWLY accepted clause. */
    actor: string;
    /**
     * Set when the WHOLE content of this save is a machine author's draft that
     * nobody has accepted (AnA's own tool writes). Every clause not already
     * claimed above becomes a `machine_draft` by this author, with no asserter.
     */
    machineDraft?: { authorId: string } | null;
    /**
     * The saved content the candidates' offsets point into. Required: which
     * reader shows what, and where a browser starts reading `<…>` as text, are
     * facts about the whole content, not about any one clause.
     */
    content: string;
  },
): MachineAttributedSpan[] {
  const out: MachineAttributedSpan[] = [];
  const claimed = new Set<number>();
  const comparable = comparableClauses(candidates, opts.content);

  const byHash = new Map<string, number[]>();
  candidates.forEach((c, i) => {
    const h = hashSpanText(c.text);
    const list = byHash.get(h);
    if (list) list.push(i);
    else byHash.set(h, [i]);
  });

  const haystacks: Haystack[] = opts.accepted
    .filter((a) => typeof a?.authorId === 'string' && a.authorId.length > 0 && typeof a?.text === 'string')
    .map((a, index) => ({ index, authorId: a.authorId, norm: comparableText(a.text) }))
    .filter((h) => h.norm.length > 0);

  /** The clause's comparison form, or null when it is not compared or is too short to be. */
  const needleOf = (i: number): string | null => {
    if (!comparable[i]) return null;
    const needle = comparableText(candidates[i].text);
    return needle.length < MIN_MACHINE_CLAUSE_CHARS ? null : needle;
  };

  /** Match one live span to the nearest unclaimed clause with the same text. */
  const carryForward = (live: LiveMachineSpan, accepted: boolean): boolean => {
    const open = (byHash.get(live.spanTextSha256) ?? []).filter((i) => !claimed.has(i) && (!accepted || comparable[i]));
    if (open.length === 0) return false;
    const best = open.reduce((a, b) =>
      Math.abs(candidates[b].charStart - live.charStart) < Math.abs(candidates[a].charStart - live.charStart)
        ? b
        : a,
    );
    claimed.add(best);
    const c = candidates[best];
    const needle = accepted ? needleOf(best) : null;
    out.push({
      charStart: c.charStart,
      charEnd: c.charEnd,
      spanText: c.text,
      machineAuthorId: live.machineAuthorId,
      assertedBy: live.assertedBy,
      assertedAt: live.assertedAt ?? undefined,
      signatureId: live.signatureId,
      createdBy: live.createdBy,
      inAcceptedText: needle !== null && haystacks.some((h) => h.norm.includes(needle)),
    });
    return true;
  };

  const inOffsetOrder = [...opts.live].sort((a, b) => a.charStart - b.charStart);

  // 1. Already ACCEPTED spans carry forward first, so a fresh acceptance in
  //    this same save can never displace the person who accepted them
  //    originally. Acceptance is theirs; it does not transfer on a later save.
  for (const live of inOffsetOrder) {
    if (live.provenanceKind === 'accepted_machine_draft') carryForward(live, true);
  }

  // 2. Newly accepted text, occurrence-bounded per (author, clause text). This
  //    runs BEFORE unaccepted carry-forward on purpose: accepting a clause that
  //    was an unaccepted machine_draft is exactly the transition that turns it
  //    into an accepted one, and it would be missed if the draft had already
  //    claimed the clause.
  if (haystacks.length > 0) {
    // A loop, not a spread: a long section has more clauses than a call takes arguments.
    for (const span of creditNewlyAccepted(candidates, haystacks, needleOf, claimed, opts.actor)) out.push(span);
  }

  // 3. Still-UNACCEPTED spans carry forward as unaccepted. A human saving the
  //    document is not a human accepting each clause of it, so nothing here
  //    gains an asserter.
  for (const live of inOffsetOrder) {
    if (live.provenanceKind === 'machine_draft') carryForward(live, false);
  }

  // 4. A whole-content machine draft claims everything left. No asserter: the
  //    actor ASKED for this draft, which is recorded as createdBy, and is not
  //    the same claim as having stood behind its words.
  if (opts.machineDraft?.authorId) {
    candidates.forEach((c, i) => {
      if (claimed.has(i)) return;
      claimed.add(i);
      out.push({
        charStart: c.charStart,
        charEnd: c.charEnd,
        spanText: c.text,
        machineAuthorId: opts.machineDraft!.authorId,
        assertedBy: null,
        createdBy: opts.actor,
        inAcceptedText: false,
      });
    });
  }

  out.sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd);
  return out;
}
