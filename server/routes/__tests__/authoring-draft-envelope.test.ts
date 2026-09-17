/**
 * The AI-draft envelope parser — the malformed shapes it must survive.
 *
 * This logic used to sit inline in a 300-line route handler, four blocks deep,
 * reachable only by standing up an Express app with a mocked gateway. It is
 * pure, so the cases that matter — every way a model can decline to produce the
 * requested JSON — are asserted directly here. The invariant under all of them:
 * a draft always comes back. Structured attribution is additive and may be
 * empty; it may never cost the author their draft.
 */
import { describe, expect, it } from 'vitest';
import { parseDraftEnvelope } from '../authoring-draft-envelope';

describe('parseDraftEnvelope', () => {
  it('reads content and attributions out of a well-formed envelope', () => {
    const out = parseDraftEnvelope(
      JSON.stringify({
        content: 'The study met its primary endpoint.',
        attributions: [{ quote: 'The study met its primary endpoint.', src: 2 }],
      }),
    );
    expect(out.content).toBe('The study met its primary endpoint.');
    expect(out.attributions).toEqual([
      { quote: 'The study met its primary endpoint.', src: 2 },
    ]);
  });

  it('reads through a ```json fence and surrounding prose', () => {
    const out = parseDraftEnvelope(
      'Here is the section you asked for:\n```json\n{"content":"Drafted.","attributions":[]}\n```',
    );
    expect(out.content).toBe('Drafted.');
    expect(out.attributions).toEqual([]);
  });

  it('treats a non-JSON response as the draft itself, with no attributions', () => {
    // The pre-Phase-4 behaviour, and the one that must never regress: a model
    // that ignores the envelope instruction still produces a usable draft.
    const out = parseDraftEnvelope('4.2.3.2 Repeat-Dose Toxicity\n\nNo adverse findings.');
    expect(out.content).toBe('4.2.3.2 Repeat-Dose Toxicity\n\nNo adverse findings.');
    expect(out.attributions).toEqual([]);
  });

  it('treats malformed JSON as prose rather than throwing', () => {
    const out = parseDraftEnvelope('{"content": "unterminated');
    expect(out.content).toBe('{"content": "unterminated');
    expect(out.attributions).toEqual([]);
  });

  it('treats an envelope with an empty or non-string content as prose', () => {
    expect(parseDraftEnvelope('{"content": "   "}').content).toBe('{"content": "   "}');
    expect(parseDraftEnvelope('{"content": 42}').content).toBe('{"content": 42}');
  });

  it('drops a malformed claim instead of repairing it', () => {
    // A repaired citation is an invented one. Each of these is discarded: no
    // quote, a non-string quote, a fractional position, a non-numeric position.
    const out = parseDraftEnvelope(
      JSON.stringify({
        content: 'Body.',
        attributions: [
          { src: 1 },
          { quote: 12, src: 1 },
          { quote: 'kept', src: 3 },
          { quote: 'fractional', src: 1.5 },
          { quote: 'not a number', src: 'two' },
          null,
          'nonsense',
        ],
      }),
    );
    expect(out.attributions).toEqual([{ quote: 'kept', src: 3 }]);
  });

  it('returns no attributions when the envelope carries a non-array', () => {
    const out = parseDraftEnvelope('{"content":"Body.","attributions":"none"}');
    expect(out.content).toBe('Body.');
    expect(out.attributions).toEqual([]);
  });

  it('handles an absent response without throwing', () => {
    expect(parseDraftEnvelope(null)).toEqual({ content: '', attributions: [] });
    expect(parseDraftEnvelope(undefined)).toEqual({ content: '', attributions: [] });
    expect(parseDraftEnvelope('')).toEqual({ content: '', attributions: [] });
  });
});
