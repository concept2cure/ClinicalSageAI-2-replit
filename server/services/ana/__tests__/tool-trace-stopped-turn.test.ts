/**
 * Why a turn stopped outlives the turn.
 *
 * The agentic loop stops for a reason — she said she was done
 * (`no_more_tools`), the round cap forced the answer (`max_rounds`), she was
 * repeating a step (`duplicate_thrash`), or the run was stopped (`cancelled`).
 * Until this change the reason reached the run row and nothing else, so on the
 * NEXT turn the model was handed the capped turn's tool trace under "reuse
 * these findings; do not repeat them" — work the cap cut short, presented to
 * her as settled.
 *
 * Pinned here, on the pure core:
 *   - the assistant message's metadata keeps the reason (omitted when she
 *     finished herself — the ordinary case stores nothing new) and the rounds;
 *   - the continuity note for the next turn says a stopped turn stopped, and
 *     says nothing for a turn she finished or the person stopped.
 */
import { describe, expect, it } from 'vitest';

import { buildAssistantMetadata, formatStoppedTurnNote, turnStopWarning, withTurnEnding, type ToolTraceEntry } from '../tool-trace';

const trace: ToolTraceEntry[] = [
  { tool: 'search_documents', label: 'Searching your documents', status: 'success', resultSummary: '4 results' },
];

/** The metadata post-processing persists: the turn's work, then how it ended. */
const meta = (t: ToolTraceEntry[], ending: Parameters<typeof withTurnEnding>[1]) =>
  withTurnEnding(buildAssistantMetadata(t, null), ending);

describe('the assistant metadata keeps how the turn ended', () => {
  it('stores a round-limit stop and the rounds it ran', () => {
    const m = meta(trace, { stoppedReason: 'max_rounds', rounds: 12 });
    expect(m?.stoppedReason).toBe('max_rounds');
    expect(m?.rounds).toBe(12);
    expect(m?.toolTrace).toEqual(trace);
  });

  it('stores a repeated-step stop, and a stop the person made', () => {
    expect(meta(trace, { stoppedReason: 'duplicate_thrash', rounds: 3 })?.stoppedReason)
      .toBe('duplicate_thrash');
    expect(meta(trace, { stoppedReason: 'cancelled', rounds: 1 })?.stoppedReason)
      .toBe('cancelled');
  });

  it('omits the reason when she finished herself, and keeps the rounds', () => {
    const m = meta(trace, { stoppedReason: 'no_more_tools', rounds: 2 });
    expect(m).toBeDefined();
    expect('stoppedReason' in (m as object)).toBe(false);
    expect(m?.rounds).toBe(2);
  });

  it('stores nothing new for a turn that ran no tools and ended normally', () => {
    // A plain answer: the loop never ran. Nothing worth storing, so the
    // caller still persists null rather than an empty object.
    expect(meta([], { stoppedReason: 'no_more_tools', rounds: 0 })).toBeUndefined();
    expect(buildAssistantMetadata([], null, null, null, null)).toBeUndefined();
  });

  it('keeps a stop even when nothing else about the turn was worth storing', () => {
    const m = meta([], { stoppedReason: 'max_rounds', rounds: 5 });
    expect(m).toEqual({ stoppedReason: 'max_rounds', rounds: 5 });
  });

  it('keeps no round count that is not a positive whole number', () => {
    expect(meta(trace, { rounds: 0 })?.rounds).toBeUndefined();
    expect(meta(trace, { rounds: -1 })?.rounds).toBeUndefined();
    expect(meta(trace, { rounds: 2.5 })?.rounds).toBeUndefined();
  });
});

describe('formatStoppedTurnNote tells the next turn its predecessor did not finish', () => {
  const history = (meta: unknown) => [
    { role: 'user', content: 'Compare every endpoint' },
    { role: 'assistant', content: 'Partial comparison.', metadata: meta },
  ];

  it('names a round-limit stop, with its rounds, and says not to reuse the work as complete', () => {
    const note = formatStoppedTurnNote(history({ toolTrace: trace, stoppedReason: 'max_rounds', rounds: 12 }));
    expect(note).toContain('Your previous turn stopped at the round limit (12 rounds) before it was finished.');
    expect(note).toMatch(/do not (reuse|treat)[^.]*as complete/i);
  });

  it('names the limit without a number when the rounds were not kept', () => {
    expect(formatStoppedTurnNote(history({ stoppedReason: 'max_rounds' }))).toContain(
      'Your previous turn stopped at the round limit before it was finished.',
    );
  });

  it('names a repeated-step stop', () => {
    const note = formatStoppedTurnNote(history({ stoppedReason: 'duplicate_thrash', rounds: 3 }));
    expect(note).toContain('repeating the same step');
    expect(note).toContain('before it was finished');
  });

  it('says nothing for a turn she finished, or one the person stopped', () => {
    expect(formatStoppedTurnNote(history({ toolTrace: trace, rounds: 2 }))).toBe('');
    expect(formatStoppedTurnNote(history({ stoppedReason: 'no_more_tools' }))).toBe('');
    expect(formatStoppedTurnNote(history({ stoppedReason: 'cancelled', rounds: 2 }))).toBe('');
    expect(formatStoppedTurnNote(history(null))).toBe('');
    expect(formatStoppedTurnNote(history({ stoppedReason: 'gave_up' }))).toBe('');
    expect(formatStoppedTurnNote([])).toBe('');
  });

  it('says nothing for a stored reason that names an Object.prototype member', () => {
    // The metadata is read back from the row and cast. A key the words table
    // inherits (`constructor` is Object, `toString` a function) must not be
    // taken for a stop and sent to the model as "Your previous turn [object
    // Object] before it was finished".
    for (const reason of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', '__defineGetter__']) {
      expect(formatStoppedTurnNote(history({ stoppedReason: reason, rounds: 3 })), reason).toBe('');
    }
  });

  it('reads only the LAST assistant turn — an earlier stop was already followed by a later answer', () => {
    const h = [
      ...history({ stoppedReason: 'max_rounds', rounds: 12 }),
      { role: 'user', content: 'Continue from where you stopped.' },
      { role: 'assistant', content: 'The rest.', metadata: { rounds: 3 } },
    ];
    expect(formatStoppedTurnNote(h)).toBe('');
    // …and a trailing user message does not hide the last assistant turn.
    expect(formatStoppedTurnNote([...history({ stoppedReason: 'max_rounds', rounds: 4 }), { role: 'user', content: 'and?' }]))
      .toContain('round limit (4 rounds)');
  });
});

describe('turnStopWarning — what the turn record says about a stop', () => {
  it('says the answer was written from the work so far, for the round limit and the repeat guard', () => {
    expect(turnStopWarning('max_rounds', 12)).toBe(
      'The turn stopped at the round limit after 12 rounds, before AnA said she was done. The answer was written from the work done up to that point.',
    );
    expect(turnStopWarning('duplicate_thrash', 1)).toContain('after 1 round because AnA was repeating the same step');
  });

  it('says a stop between rounds as one, and a stop before the first round without claiming a round', () => {
    expect(turnStopWarning('cancelled', 2)).toBe('The run was stopped between rounds after 2 rounds, before AnA said she was done.');
    // The loop can be cancelled at its first checkpoint, before any round ran
    // (agentic-loop: checkpoint(1) → rounds 0). No "between rounds" then, and
    // one "before", not two.
    expect(turnStopWarning('cancelled', 0)).toBe('The run was stopped before its first tool round.');
  });

  it('says nothing for a turn she finished', () => {
    expect(turnStopWarning('no_more_tools', 3)).toBe('');
  });
});
