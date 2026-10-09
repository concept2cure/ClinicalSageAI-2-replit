/**
 * attributeMachineSpans — a clause accepted from a machine author is the
 * machine's, whichever of the save's accepted insertions contained it.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The occurrence bound exists so that accepted text containing one
 * "Not applicable." attributes at most one such clause, and a human's identical
 * clause elsewhere in the document is not swept up with it. It was implemented
 * with a budget keyed on `${authorId} ${needle}` — author plus clause text —
 * while the COUNT behind that key was computed against one specific haystack:
 *
 *     for (const h of haystacks) {
 *       const key = `${h.authorId} ${needle}`;          // no haystack identity
 *       let left = budget.get(key);
 *       if (left === undefined) {
 *         left = occurrences(h.norm, needle);            // counted against THIS h
 *         budget.set(key, left);
 *       }
 *       if (left <= 0) continue;
 *
 * A reviewer who accepts TWO insertions from the same machine author in one
 * editing session sends two haystack entries. For a clause that appears only in
 * the second, the first haystack yields 0 — which is then cached under a key
 * that does not mention the first haystack. The loop moves to the second
 * haystack, reads that cached 0, and continues past the one text that does
 * contain the clause. The clause is never claimed.
 *
 * What it becomes is the whole point: unclaimed clauses fall through to the
 * caller's default, and the human who saved the document is recorded as
 * ASSERTING prose a machine wrote and they merely accepted. That is the exact
 * statement this module exists to stop the lineage gate from making, reachable
 * by nothing more exotic than accepting two suggestions before saving.
 *
 * ── Why keying per haystack is also the CORRECT bound ─────────────────────────
 * Two accepted insertions that each contain "Not applicable." are two clauses a
 * machine wrote and a human accepted. Budgeting them together under one key
 * undercounts on purpose-built input; budgeting per accepted text counts what
 * actually happened. The bound still holds inside each accepted text, which is
 * where it was ever doing work.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { attributeMachineSpans, MIN_MACHINE_CLAUSE_CHARS } from '../machine-attribution';
import type { SentenceSpan } from '../../sentenceTraceabilityService';

const ACTOR = 'user-7';

const M1 = 'The primary endpoint was met at week twelve in the trial population.';
const M2 = 'No new safety signals emerged during the double-blind treatment period.';
const HUMAN = 'We will confirm the sterilisation validation before the meeting.';

/** Clause spans over `content`, split on the sentences it is built from.
 *  A full SentenceSpan, not a structural subset: the attributor takes what the
 *  sentence splitter produces, and a test that hands it less is testing a
 *  shape the caller can never pass. */
function spansOf(parts: string[]): SentenceSpan[] {
  const out: SentenceSpan[] = [];
  let at = 0;
  parts.forEach((p, index) => {
    out.push({
      index,
      text: p,
      charStart: at,
      charEnd: at + p.length,
      paragraphIndex: 0,
      contentHash: createHash('sha256').update(p).digest('hex'),
    });
    at += p.length + 1; // the joining space
  });
  return out;
}

describe('two accepted insertions from the same machine author, in one save', () => {
  it('attributes BOTH to the machine, not just the one in the first accepted text', () => {
    const candidates = spansOf([M1, M2]);

    const spans = attributeMachineSpans(candidates, {
      // Exactly what the editor sends when a reviewer accepts two suggestions
      // before saving: one entry per accepted insertion, same author.
      accepted: [
        { authorId: 'ana', text: M1 },
        { authorId: 'ana', text: M2 },
      ],
      live: [],
      actor: ACTOR,
    });

    expect(
      spans.map((s) => s.spanText),
      'a clause accepted in the second insertion was left for the human to assert',
    ).toEqual([M1, M2]);
    for (const s of spans) {
      expect(s.machineAuthorId).toBe('ana');
      expect(s.assertedBy).toBe(ACTOR);
    }
  });

  it('still leaves a genuinely human clause alone', () => {
    const candidates = spansOf([M1, HUMAN, M2]);
    const spans = attributeMachineSpans(candidates, {
      accepted: [
        { authorId: 'ana', text: M1 },
        { authorId: 'ana', text: M2 },
      ],
      live: [],
      actor: ACTOR,
    });
    expect(spans.map((s) => s.spanText)).toEqual([M1, M2]);
    expect(spans.some((s) => s.spanText === HUMAN)).toBe(false);
  });

  it('bounds by occurrence WITHIN each accepted text, so one repeated clause is not over-claimed', () => {
    // The bound's original job: one "Not applicable." in the accepted text
    // attributes at most one such clause, leaving a human's identical clause
    // elsewhere to the human.
    const NA = 'Not applicable to this submission.';
    expect(NA.length).toBeGreaterThanOrEqual(MIN_MACHINE_CLAUSE_CHARS);
    const candidates = spansOf([NA, NA]);

    const spans = attributeMachineSpans(candidates, {
      accepted: [{ authorId: 'ana', text: NA }],
      live: [],
      actor: ACTOR,
    });

    expect(spans, 'one accepted occurrence claimed two clauses').toHaveLength(1);
    expect(spans[0].charStart).toBe(0);
  });

  it('claims two when the author genuinely accepted it twice', () => {
    // Two separate accepted insertions that each contain the clause are two
    // clauses a machine wrote and a human accepted.
    const NA = 'Not applicable to this submission.';
    const candidates = spansOf([NA, NA]);

    const spans = attributeMachineSpans(candidates, {
      accepted: [
        { authorId: 'ana', text: NA },
        { authorId: 'ana', text: NA },
      ],
      live: [],
      actor: ACTOR,
    });

    expect(spans).toHaveLength(2);
  });
});
