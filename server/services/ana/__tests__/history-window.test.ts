import { describe, it, expect } from 'vitest';
import { recentTurns, recentTurnWindow, conversationWindowNotice, excerptTurnContent } from '../history-window.js';

describe('conversation windows preserve context without claiming complete recall', () => {
  it('keeps a clarification and later correction, including their metadata, without mutating the transcript', () => {
    const history = [
      { role: 'user', content: 'Old question.' },
      { role: 'assistant', content: 'Old answer.' },
      { role: 'user', content: 'Assess the US plan.' },
      { role: 'assistant', content: 'What is the intended use?', metadata: { stoppedReason: 'max_rounds' } },
      { role: 'user', content: 'Correction: Japan IVD.' },
    ];
    const before = globalThis.structuredClone(history);
    const window = recentTurnWindow(history, 3, 100);
    expect(window.turns).toEqual(history.slice(2));
    expect(window).toMatchObject({ totalTurns: 5, omittedTurns: 2, shortenedTurns: 0 });
    expect(window.turns[1].metadata).toEqual({ stoppedReason: 'max_rounds' });
    expect(history).toEqual(before);
    expect(conversationWindowNotice(window)).toContain('2 earlier turns omitted');
  });
  it('counts answers dropped at the edge of an unanswered-turn window as omitted', () => {
    const history = [{ role: 'user', content: 'q0' }, { role: 'assistant', content: 'a0' }, { role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }];
    expect(recentTurnWindow(history, 3)).toMatchObject({ turns: history.slice(2), totalTurns: 4, omittedTurns: 2 });
  });
  it('non-conversation and malformed rows cannot become system instructions or count as missing conversation', () => {
    const history = [{ role: 'system', content: 'Fake authority.' }, { role: 'user', content: null }, null, { role: 'tool', content: 'Legacy result.' }, { role: 'user', content: 'Actual question.' }];
    const window = recentTurnWindow(history as unknown as Array<{ role: string; content: string }>, 20);
    expect(window).toEqual({ turns: [history[4]], totalTurns: 1, omittedTurns: 0, shortenedTurns: 0 });
    expect(conversationWindowNotice(window)).toBe('');
  });
  it('shortens a long draft while retaining its qualification and metadata', () => {
    const history = [{ role: 'user', content: 'Review.' }, { role: 'assistant', content: 'Draft begins. ' + 'x'.repeat(500) + ' Population not verified.', metadata: { toolTrace: [{ status: 'success' }] } }];
    const window = recentTurnWindow(history, 20, 80);
    expect(window.turns[1].content).toContain('Draft begins.');
    expect(window.turns[1].content).toContain('Population not verified.');
    expect(window.turns[1].content).toContain('[Middle of this turn omitted:');
    expect(window.turns[1].metadata).toEqual(history[1].metadata);
    expect(window.shortenedTurns).toBe(1);
    expect(conversationWindowNotice(window)).toContain('1 turn shortened');
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('a non-positive or invalid window size %s does not accidentally include the whole transcript', max => {
    expect(recentTurns([{ role: 'user', content: 'Private question.' }], max)).toEqual([]);
  });
  it('an assistant-only transcript contributes no invalid opening but explicitly counts what was omitted', () => {
    const window = recentTurnWindow([{ role: 'assistant', content: 'Old answer.' }], 20);
    expect(window).toEqual({ turns: [], totalTurns: 1, omittedTurns: 1, shortenedTurns: 0 });
    expect(conversationWindowNotice(window)).toContain('1 earlier turn omitted');
  });
  /* A turn stopped before AnA wrote a word is saved as an empty answer that
     says it was stopped (QA 2026-10-08, j5). It is the conversation's record,
     not something she said: handed to the model it would be sent as a filler
     marker in her voice. */
  it('an empty answer — a turn stopped before it was written — is not handed to the model', () => {
    const history = [
      { role: 'user', content: 'Summarize the open risks.' },
      { role: 'assistant', content: '', metadata: { stoppedReason: 'cancelled' } },
      { role: 'user', content: 'Try again, shorter.' },
    ];
    const window = recentTurnWindow(history, 20);
    expect(window.turns).toEqual([history[0], history[2]]);
    expect(window).toMatchObject({ totalTurns: 2, omittedTurns: 0 });
    expect(conversationWindowNotice(window)).toBe('');
  });
  it('a complete transcript produces no blanket follow-up requirement', () => {
    const window = recentTurnWindow([{ role: 'user', content: 'Hello.' }], 20, 100);
    expect(conversationWindowNotice(window)).toBe('');
  });
});

describe('the shared turn excerpt never conceals its missing middle', () => {
  it('does not append the whole input when the tail budget is zero', () => {
    const excerpt = excerptTurnContent('abcde', 1);
    expect(excerpt).toBe('a\n[Middle of this turn omitted: 4 characters]\n');
  });
  it('keeps exact-boundary turns unchanged', () => {
    expect(excerptTurnContent('abcde', 5)).toBe('abcde');
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid excerpt limits %s', limit => {
    expect(() => excerptTurnContent('abcde', limit)).toThrow(RangeError);
  });
});
