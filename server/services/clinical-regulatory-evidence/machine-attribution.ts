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

/**
 * Comparison form only — never for storage or offsets. Tags are removed
 * because the saved content may carry the editor's markup while the accepted
 * text is the editor's plain text of the same words.
 */
function comparable(text: string): string {
  return normalizeForMatch(text.replace(/<[^>]+>/g, ' '));
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
  },
): MachineAttributedSpan[] {
  const out: MachineAttributedSpan[] = [];
  const claimed = new Set<number>();

  const byHash = new Map<string, number[]>();
  candidates.forEach((c, i) => {
    const h = hashSpanText(c.text);
    const list = byHash.get(h);
    if (list) list.push(i);
    else byHash.set(h, [i]);
  });

  /** Match one live span to the nearest unclaimed clause with the same text. */
  const carryForward = (live: LiveMachineSpan): boolean => {
    const open = (byHash.get(live.spanTextSha256) ?? []).filter((i) => !claimed.has(i));
    if (open.length === 0) return false;
    const best = open.reduce((a, b) =>
      Math.abs(candidates[b].charStart - live.charStart) < Math.abs(candidates[a].charStart - live.charStart)
        ? b
        : a,
    );
    claimed.add(best);
    const c = candidates[best];
    out.push({
      charStart: c.charStart,
      charEnd: c.charEnd,
      spanText: c.text,
      machineAuthorId: live.machineAuthorId,
      assertedBy: live.assertedBy,
      assertedAt: live.assertedAt ?? undefined,
      signatureId: live.signatureId,
      createdBy: live.createdBy,
    });
    return true;
  };

  const inOffsetOrder = [...opts.live].sort((a, b) => a.charStart - b.charStart);

  // 1. Already ACCEPTED spans carry forward first, so a fresh acceptance in
  //    this same save can never displace the person who accepted them
  //    originally. Acceptance is theirs; it does not transfer on a later save.
  for (const live of inOffsetOrder) {
    if (live.provenanceKind === 'accepted_machine_draft') carryForward(live);
  }

  // 2. Newly accepted text, occurrence-bounded per (author, clause text). This
  //    runs BEFORE unaccepted carry-forward on purpose: accepting a clause that
  //    was an unaccepted machine_draft is exactly the transition that turns it
  //    into an accepted one, and it would be missed if the draft had already
  //    claimed the clause.
  const haystacks = opts.accepted
    .filter((a) => typeof a?.authorId === 'string' && a.authorId.length > 0 && typeof a?.text === 'string')
    .map((a) => ({ authorId: a.authorId, norm: comparable(a.text) }))
    .filter((h) => h.norm.length > 0);
  if (haystacks.length > 0) {
    const budget = new Map<string, number>();
    candidates.forEach((c, i) => {
      if (claimed.has(i)) return;
      const needle = comparable(c.text);
      if (needle.length < MIN_MACHINE_CLAUSE_CHARS) return;
      for (const h of haystacks) {
        const key = `${h.authorId} ${needle}`;
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
          assertedBy: opts.actor,
        });
        break;
      }
    });
  }

  // 3. Still-UNACCEPTED spans carry forward as unaccepted. A human saving the
  //    document is not a human accepting each clause of it, so nothing here
  //    gains an asserter.
  for (const live of inOffsetOrder) {
    if (live.provenanceKind === 'machine_draft') carryForward(live);
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
      });
    });
  }

  out.sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd);
  return out;
}
