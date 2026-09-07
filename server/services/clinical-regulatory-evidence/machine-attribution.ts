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
 *   A clause that matches neither is not the machine's: the human who saved
 *   it asserts it, exactly as before. The moment a human edits a machine
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
  /** The human who accepted the words. */
  assertedBy: string;
  /** When they did. Absent means "now" (a fresh acceptance). */
  assertedAt?: Date;
  signatureId?: string | null;
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
    /** This save's actor: the acceptor of any NEWLY matched clause. */
    actor: string;
  },
): MachineAttributedSpan[] {
  const out: MachineAttributedSpan[] = [];
  const claimed = new Set<number>();

  // 1. Carry-forward, one live span to at most one clause, nearest first.
  const byHash = new Map<string, number[]>();
  candidates.forEach((c, i) => {
    const h = hashSpanText(c.text);
    const list = byHash.get(h);
    if (list) list.push(i);
    else byHash.set(h, [i]);
  });
  for (const live of [...opts.live].sort((a, b) => a.charStart - b.charStart)) {
    const open = (byHash.get(live.spanTextSha256) ?? []).filter((i) => !claimed.has(i));
    if (open.length === 0) continue;
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
      assertedAt: live.assertedAt,
      signatureId: live.signatureId,
    });
  }

  // 2. Newly accepted text, occurrence-bounded per (author, clause text).
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

  out.sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd);
  return out;
}
