/**
 * Tests for the tagged-output stream parser.
 *
 * Critical invariants to lock down:
 *   1. Content inside %%ANSWER%% emits as channel='answer'.
 *   2. Content inside %%REWRITE%% emits as channel='rewrite'.
 *   3. Content inside %%STRUCTURE%% never emits as a delta — it accumulates.
 *   4. Markers split across chunk boundaries are recognized correctly.
 *   5. Markers are never emitted as user-visible text fragments.
 *   6. Pre-section preamble and post-end trailer are silently discarded.
 */

import { describe, it, expect } from 'vitest';
import { TaggedStreamParser } from '../ana/submission-chat-stream-parser';

function pump(parser: TaggedStreamParser, chunks: string[]) {
  const events: Array<{ channel: 'answer' | 'rewrite'; content: string }> = [];
  for (const c of chunks) {
    for (const d of parser.push(c)) events.push(d);
  }
  const tail = parser.finish();
  for (const d of tail.tailDeltas) events.push(d);
  return { events, accumulated: tail };
}

const concat = (events: Array<{ channel: string; content: string }>) =>
  events
    .filter(e => e.channel === 'answer')
    .map(e => e.content)
    .join('');
const concatRewrite = (events: Array<{ channel: string; content: string }>) =>
  events
    .filter(e => e.channel === 'rewrite')
    .map(e => e.content)
    .join('');

describe('TaggedStreamParser', () => {
  it('routes answer-section content to the answer channel', () => {
    const p = new TaggedStreamParser();
    const { events, accumulated } = pump(p, [
      '%%ANSWER%%The median age is 47 [SRC-1].%%STRUCTURE%%{"intent":"general","citations":[]}%%END%%',
    ]);
    expect(concat(events)).toBe('The median age is 47 [SRC-1].');
    expect(accumulated.answer).toBe('The median age is 47 [SRC-1].');
    expect(accumulated.structure).toBe('{"intent":"general","citations":[]}');
  });

  it('routes rewrite-section content to the rewrite channel', () => {
    const p = new TaggedStreamParser();
    const { events, accumulated } = pump(p, [
      '%%ANSWER%%I will rewrite §4.1.%%REWRITE%%New section content [SRC-1].%%STRUCTURE%%{"intent":"rewrite","citations":[]}%%END%%',
    ]);
    expect(concat(events)).toBe('I will rewrite §4.1.');
    expect(concatRewrite(events)).toBe('New section content [SRC-1].');
    expect(accumulated.rewrite).toBe('New section content [SRC-1].');
  });

  it('does not emit structure content as a delta', () => {
    const p = new TaggedStreamParser();
    const { events, accumulated } = pump(p, [
      '%%ANSWER%%hi%%STRUCTURE%%{"intent":"general"}%%END%%',
    ]);
    expect(events.find(e => e.content.includes('intent'))).toBeUndefined();
    expect(accumulated.structure).toBe('{"intent":"general"}');
  });

  it('handles markers split across chunk boundaries', () => {
    const p = new TaggedStreamParser();
    // Marker fragments scattered across many small chunks.
    const { events, accumulated } = pump(p, [
      '%%ANS',
      'WER%%',
      'The med',
      'ian age is 47 [SRC-1].',
      '%%STRU',
      'CTURE%%',
      '{"intent":"general"',
      ',"citations":[]}',
      '%%END%%',
    ]);
    expect(concat(events)).toBe('The median age is 47 [SRC-1].');
    expect(accumulated.structure).toBe('{"intent":"general","citations":[]}');
  });

  it('never emits a marker fragment as a delta', () => {
    const p = new TaggedStreamParser();
    const { events } = pump(p, [
      '%%ANSWER%%body text %%',
      'REWRITE%%new content%%STRUCTURE%%{}%%END%%',
    ]);
    // The %% suffix at end of chunk 1 must NOT appear in the answer delta.
    const answer = concat(events);
    expect(answer).toBe('body text ');
    expect(answer).not.toContain('%%');
    expect(concatRewrite(events)).toBe('new content');
  });

  it('discards pre-section preamble', () => {
    const p = new TaggedStreamParser();
    const { events, accumulated } = pump(p, [
      'Sure, here is my response.\n%%ANSWER%%The answer.%%STRUCTURE%%{}%%END%%',
    ]);
    expect(concat(events)).toBe('The answer.');
    expect(accumulated.answer).toBe('The answer.');
    expect(events.find(e => e.content.includes('Sure, here'))).toBeUndefined();
  });

  it('discards post-end trailer', () => {
    const p = new TaggedStreamParser();
    const { events } = pump(p, [
      '%%ANSWER%%body%%STRUCTURE%%{}%%END%%trailing model commentary',
    ]);
    expect(events.find(e => e.content.includes('trailing'))).toBeUndefined();
  });

  it('flushes remaining buffered text on finish() when no terminating marker arrives', () => {
    const p = new TaggedStreamParser();
    // Stream ends mid-section without %%STRUCTURE%% / %%END%%.
    const { events, accumulated } = pump(p, [
      '%%ANSWER%%partial answer with no terminator',
    ]);
    expect(concat(events)).toBe('partial answer with no terminator');
    expect(accumulated.answer).toBe('partial answer with no terminator');
    expect(accumulated.structure).toBe('');
  });

  it('handles a stream that has only an answer section (non-rewrite intents)', () => {
    const p = new TaggedStreamParser();
    const { accumulated } = pump(p, [
      '%%ANSWER%%The dossier is silent on this. [SRC-3]%%STRUCTURE%%{"intent":"provenance","citations":[{"ref":3,"relationship":"gap"}]}%%END%%',
    ]);
    expect(accumulated.answer).toBe('The dossier is silent on this. [SRC-3]');
    expect(accumulated.rewrite).toBe('');
    expect(accumulated.structure).toContain('"relationship":"gap"');
  });

  it('one byte at a time still produces correct output', () => {
    const full =
      '%%ANSWER%%Hello [SRC-1].%%REWRITE%%New text.%%STRUCTURE%%{}%%END%%';
    const p = new TaggedStreamParser();
    const events: Array<{ channel: 'answer' | 'rewrite'; content: string }> = [];
    for (const ch of full.split('')) {
      for (const d of p.push(ch)) events.push(d);
    }
    const tail = p.finish();
    for (const d of tail.tailDeltas) events.push(d);
    expect(concat(events)).toBe('Hello [SRC-1].');
    expect(concatRewrite(events)).toBe('New text.');
  });
});
