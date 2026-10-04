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
import { attributeMachineSpans, comparableText, MIN_MACHINE_CLAUSE_CHARS, rawTextFrom } from '../machine-attribution';
import { detectSpans, type SentenceSpan } from '../../sentenceTraceabilityService';

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

/** The content `spansOf` built its offsets from: the parts joined by single spaces. */
function contentOf(spans: SentenceSpan[]): string {
  return spans.map((s) => s.text).join(' ');
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
      content: contentOf(candidates),
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
      content: contentOf(candidates),
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
      content: contentOf(candidates),
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
      content: contentOf(candidates),
    });

    expect(spans).toHaveLength(2);
  });
});

/* ── The comparison form (periodic review 2026-09-28, editor family, the
   batch-draft accept, round 2) ──────────────────────────────────────────────
   Tags were removed with /<[^>]+>/g. That also removed a `< … >` run a
   browser shows as text (`<` followed by a space or a digit starts no tag),
   so words typed inside one, in the middle of a clause the machine wrote,
   were invisible to the match: the clause was recorded as the machine's with
   them in it. The claim verifier (authoring/machine-claim-verify.ts) had its
   own copy of the same strip. There is now one comparison form,
   comparableText, and it removes only what a browser parses as a tag. */
describe('comparableText: the words a browser shows are the words compared', () => {
  const MACHINE = 'The primary endpoint was met at week twelve in the trial population.';
  const machineSpansOf = (clause: string) =>
    attributeMachineSpans(spansOf([clause]), { accepted: [{ authorId: 'ana', text: MACHINE }], live: [], actor: ACTOR, content: clause });

  it.each([
    ['words inside < … >', 'The primary endpoint was met < 3 patients died of hepatic failure > at week twelve in the trial population.'],
    ['words inside an <xmp>, which shows its inside as text', 'The primary endpoint was <xmp><b NOT></xmp> met at week twelve in the trial population.'],
    ['words inside a <textarea>, which shows its inside as text', 'The primary endpoint was <textarea><b NOT></textarea> met at week twelve in the trial population.'],
    ['words after a <plaintext>, which shows the rest as text', 'The primary endpoint was <plaintext><b NOT> met at week twelve in the trial population.'],
  ])('a clause with %s added is not the machine\'s', (_, clause) => {
    expect(machineSpansOf(clause), 'words the machine never wrote were recorded as its').toEqual([]);
  });

  it('the machine\'s words inside ordinary markup are still the machine\'s', () => {
    const clause =
      'The <STRONG>primary</STRONG> endpoint was <span class="hl" data-x="1">met</span> at week<br/>twelve in the trial population.';
    expect(machineSpansOf(clause).map((s) => s.spanText)).toEqual([clause]);
  });

  it('removes an ordinary tag, and keeps every `<` a browser does not read as a tag', () => {
    expect(comparableText('<p>The <strong class="x">endpoint</strong> was met.</p>')).toBe('the endpoint was met.');
    // Each of these is text to a browser (or a comment it hides). Kept, it can
    // only make a match fail.
    for (const text of ['p<0.05 and hr>1', 'met < 3 patients died > at', 'a <3 b> c', 'a </ b> c', 'a <!-- b --> c', 'a <?b?> c']) {
      expect(comparableText(text), text).toBe(text);
    }
    // The raw-text elements keep their own tags: the regex cannot see where
    // the browser stops reading tags inside them, so the region stays unequal.
    expect(comparableText('a <xmp><b x></xmp> c')).toBe('a <xmp> </xmp> c');
  });

  it('reads markdown only when asked, as the turn record\'s side is: `\\|` is `|` and `*` is dropped', () => {
    expect(comparableText('The **primary** endpoint \\| per protocol', { markdown: true })).toBe('the primary endpoint | per protocol');
    expect(comparableText('The **primary** endpoint \\| per protocol')).toBe('the **primary** endpoint \\| per protocol');
  });

  it('scans a run of `<a` with no `>` once, not once for every `<`', () => {
    // At /<[^>]+>/g this clause took seconds: every `<` rescanned to the end.
    // The accept takes up to 400,000 characters and up to 32 claims.
    const started = performance.now();
    machineSpansOf('<a'.repeat(50_000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

/* ── What is compared (periodic review 2026-09-28, editor family, the
   batch-draft accept, round 3) ─────────────────────────────────────────────
   The lineage runs comparableText per clause. A raw-text element's opening
   tag can be in one clause and its words in another, where `<b …>` was
   stripped as a tag though a reader shows it as text (PROBE-C). And content
   with no known tag is read as plain text by the section editor and the
   export, which show every `<…>`. Neither kind of clause is compared now. */
const TAMPERED = 'The primary endpoint was met <b 3 patients died of hepatic failure> at week twelve in the trial population.';
/** Exactly the lineage gate's path: detectSpans(content, 'clause'), then attributeMachineSpans. */
const machineClausesOf = (content: string, accepted = M1) =>
  attributeMachineSpans(detectSpans(content, 'clause'), {
    accepted: [{ authorId: 'ana', text: accepted }],
    live: [],
    actor: ACTOR,
    content,
  }).map((s) => s.spanText);

describe('rawTextFrom: where a browser may first read `<…>` as text', () => {
  it.each([
    ['<xmp>', 'a <xmp>b'],
    ['upper case', 'a <XMP>b'],
    ['an attribute', 'a <textarea rows="2">b'],
    ['an attribute after a space', 'a <plaintext x>b'],
    ['a self-closing slash', 'a <title/>b'],
    ['a line break after the name', 'a <script\n>b'],
    ['a CDATA section', 'a <![CDATA[b'],
  ])('finds %s', (_, content) => {
    expect(rawTextFrom(content)).toBe(2);
  });

  it.each([
    ['another tag', 'a <p>b</p>'],
    ['a longer name', 'a <xmpx>b'],
    ['a space before the name', 'a < xmp>b'],
    ['a closing tag alone', 'a </xmp>b'],
    ['escaped text', 'a &lt;xmp&gt;b'],
  ])('finds nothing in %s', (_, content) => {
    expect(rawTextFrom(content)).toBe(-1);
  });
});

describe('a raw-text element whose opening tag the clause splitter puts in another clause (PROBE-C)', () => {
  it.each([
    ['xmp, paragraph breaks', `<xmp>\n\n${TAMPERED}\n\n</xmp>`],
    ['plaintext, a paragraph break', `<plaintext>\n\n${TAMPERED}`],
    ['textarea, a comma clause break', `<textarea>Reviewer note, ${TAMPERED}\n\n</textarea>`],
    ['CDATA in SVG, paragraph breaks', `<svg><text><![CDATA[\n\n${TAMPERED}\n\n]]></text></svg>`],
    ['plaintext with an attribute (N1)', `<plaintext x>\n\n${TAMPERED}`],
    ['xmp with a class, and a space in its end tag (N1)', `<xmp class="q">\n\n${TAMPERED}\n\n</xmp >`],
    ['textarea with rows, and a space in its end tag (N1)', `<textarea rows="2">\n\n${TAMPERED}\n\n</textarea >`],
  ])('%s: the clause holding the shown words is not the machine\'s', (_, content) => {
    expect(machineClausesOf(content), 'words a reader is shown were credited to the machine').toEqual([]);
  });

  it.each([
    ['plaintext with an attribute', 'The primary endpoint was met <plaintext x><b 3 patients died of hepatic failure> at week twelve in the trial population.'],
    ['xmp with a class', 'The primary endpoint was met <xmp class="q"><b 3 patients died of hepatic failure></xmp > at week twelve in the trial population.'],
    ['textarea with rows', 'The primary endpoint was met <textarea rows="2"><b 3 patients died of hepatic failure></textarea > at week twelve in the trial population.'],
  ])('%s, inside the one clause: not the machine\'s', (_, content) => {
    expect(machineClausesOf(content)).toEqual([]);
  });

  it('a clause before the first opener is still compared (guard)', () => {
    expect(machineClausesOf(`${M1}\n\n<xmp>Reviewer note.</xmp>`)).toEqual([M1]);
  });
});

describe('content read as plain text shows every `<…>`', () => {
  const TOKENED = 'The primary endpoint was met <q 3 patients died of hepatic failure> at week twelve in the trial population.';

  it('with no known tag in the content, a clause holding a tag-shaped token is not the machine\'s', () => {
    expect(machineClausesOf(TOKENED), 'shown by the editor and the export, credited to the machine').toEqual([]);
  });

  it('with a known tag elsewhere, every reader parses the token as a tag and hides it (guard)', () => {
    expect(machineClausesOf(`${TOKENED}\n\n<p>Reviewer note.</p>`)).toEqual([TOKENED]);
  });

  it('an asterisk added to the machine\'s clause makes it not the machine\'s: content is never read as markdown (N5)', () => {
    const M = 'The hazard ratio was 0.72 in the intent-to-treat population at week twelve.';
    expect(machineClausesOf('The hazard ratio was 0.72* in the intent-to-treat population at week twelve.', M)).toEqual([]);
  });
});

/** A live span over `text`, recorded by an earlier save at `charStart`. */
function liveSpan(text: string, kind: 'accepted_machine_draft' | 'machine_draft', charStart: number) {
  const accepted = kind === 'accepted_machine_draft';
  return {
    charStart,
    charEnd: charStart + text.length,
    spanTextSha256: createHash('sha256').update(text).digest('hex'),
    provenanceKind: kind,
    machineAuthorId: 'ana',
    assertedBy: accepted ? 'user-3' : null,
    assertedAt: accepted ? new Date('2026-09-20T10:00:00Z') : null,
    signatureId: null,
    createdBy: 'user-3',
  };
}

describe('carry-forward meets a raw-text region', () => {
  const carried = (content: string, kind: 'accepted_machine_draft' | 'machine_draft') =>
    attributeMachineSpans(detectSpans(content, 'clause'), {
      accepted: [],
      live: [liveSpan(M1, kind, content.indexOf(M1))],
      actor: ACTOR,
      content,
    }).map((s) => s.spanText);

  it('an accepted clause a later save put inside one is not carried: its words were matched with tags removed', () => {
    expect(carried(`<xmp>\n\n${M1}\n\n</xmp>`, 'accepted_machine_draft')).toEqual([]);
  });

  it('an unaccepted machine draft is carried: it was never compared, every character is the machine\'s (guard)', () => {
    expect(carried(`<xmp>\n\n${M1}\n\n</xmp>`, 'machine_draft')).toEqual([M1]);
  });

  it('outside any region, an accepted clause is carried as before (guard)', () => {
    expect(carried(`${M1}\n\n<p>Other.</p>`, 'accepted_machine_draft')).toEqual([M1]);
  });
});

describe('inAcceptedText: what this save accepted, not what the content carries', () => {
  const content = `${M1}\n\n${M2}`;
  const flags = (accepted: string[]) =>
    attributeMachineSpans(detectSpans(content, 'clause'), {
      accepted: accepted.map((text) => ({ authorId: 'ana', text })),
      live: [liveSpan(M1, 'accepted_machine_draft', 0)],
      actor: ACTOR,
      content,
    }).map((s) => [s.spanText, s.assertedBy, s.inAcceptedText]);

  it('a clause carried forward and accepted again is in it, under its original acceptor', () => {
    expect(flags([`${M1} ${M2}`])).toEqual([
      [M1, 'user-3', true],
      [M2, ACTOR, true],
    ]);
  });

  it('a clause carried forward and not accepted again is not; a one-word claim accepts no clause', () => {
    expect(flags(['primary'])).toEqual([[M1, 'user-3', false]]);
  });
});
