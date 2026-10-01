import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  classifyRegister,
  deriveRoom,
  findCatchphrases,
  lintArtifactRegister,
  lintChatRegister,
  measureRegister,
  stripPlatformBlocks,
  summarizeRegisterLint,
  type RegisterLintOptions,
  type RegisterRule,
} from '../register-linter';

interface Sample {
  id: string;
  register: 'chat' | 'artifact';
  expect: 'pass' | 'fail';
  expectRules?: string[];
  options?: RegisterLintOptions;
  text: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const samples: Sample[] = JSON.parse(readFileSync(path.join(here, '..', 'samples.json'), 'utf8')).samples;

const chatSamples = samples.filter(s => s.register === 'chat');
const artifactSamples = samples.filter(s => s.register === 'artifact');

describe('register linter — hand-written chat samples', () => {
  it('ships both good and bad samples (a linter only seen passing has not been tested)', () => {
    expect(chatSamples.some(s => s.expect === 'pass')).toBe(true);
    expect(chatSamples.some(s => s.expect === 'fail')).toBe(true);
  });

  it.each(chatSamples.map(s => [s.id, s] as const))('%s', (_id, s) => {
    const result = lintChatRegister(s.text, s.options);
    if (s.expect === 'pass') {
      expect(result.violations).toEqual([]);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    } else {
      expect(result.pass).toBe(false);
      expect(result.score).toBeLessThan(1);
      const rules = result.violations.map(v => v.rule);
      for (const r of s.expectRules ?? []) expect(rules).toContain(r as RegisterRule);
    }
  });

  it('classifies every chat sample as chat', () => {
    for (const s of chatSamples) expect(classifyRegister(s.text)).toBe('chat');
  });
});

describe('register linter — hand-written artifact samples', () => {
  it.each(artifactSamples.map(s => [s.id, s] as const))('%s', (_id, s) => {
    expect(classifyRegister(s.text)).toBe('artifact');
    const result = lintArtifactRegister(s.text);
    expect(result.pass).toBe(s.expect === 'pass');
    const rules = result.violations.map(v => v.rule);
    for (const r of s.expectRules ?? []) expect(rules).toContain(r);
  });

  it('a chat-shaped memo is not mistaken for an artifact by one header', () => {
    expect(classifyRegister('## Summary\n\nOne header, one paragraph.')).toBe('chat');
  });
});

describe('register linter — mechanics', () => {
  it('strips ana-grounding / ana-action blocks before measuring', () => {
    const text = 'Answer.\n\n```ana-grounding\nmode: grounded\n# not a header\n- not a bullet\n```';
    expect(stripPlatformBlocks(text).trim()).toBe('Answer.');
    const m = measureRegister(text);
    expect(m.headers).toBe(0);
    expect(m.listItems).toBe(0);
    expect(m.paragraphs).toBe(1);
  });

  it('counts a bold-only line as a header in disguise, not as bold', () => {
    const m = measureRegister('**Summary**\n\nThe answer is no.');
    expect(m.headers).toBe(1);
    expect(m.bold).toBe(0);
  });

  it('allows one bold term and flags the second', () => {
    expect(lintChatRegister('The **identification threshold** is 0.10%.').violations).toEqual([]);
    const two = lintChatRegister('The **FDA** and the **EMA** differ.');
    expect(two.violations.map(v => v.rule)).toEqual(['bold']);
  });

  it('a genuinely enumerable list of three passes; a two-item list fails; the user asking for one passes', () => {
    const three = 'Three gates:\n\n- pre-IND\n- end-of-Phase-2\n- pre-BLA';
    const two = 'Two gates:\n\n- pre-IND\n- pre-BLA';
    expect(lintChatRegister(three).pass).toBe(true);
    expect(lintChatRegister(two).violations.map(v => v.rule)).toEqual(['bullets']);
    expect(lintChatRegister(two, { userAskedForList: true }).pass).toBe(true);
  });

  it('a greeting is a ritual after the first turn and a human reply on it', () => {
    const text = 'Good morning. The freeze is Thursday.';
    expect(lintChatRegister(text).violations.map(v => v.rule)).toEqual(['greeting-ritual']);
    expect(lintChatRegister(text, { firstTurn: true }).pass).toBe(true);
  });

  it('a consequential next move in prose is not a next-step ritual; a labelled block is', () => {
    expect(lintChatRegister('The section is stale. Want me to redraft the TEAE summary?').pass).toBe(true);
    expect(lintChatRegister('Done.\n\nNext step: redraft the TEAE summary.').violations.map(v => v.rule)).toEqual([
      'next-step-ritual',
    ]);
    expect(lintChatRegister('Done.\n\n**Recommended next action:** run /audit.').violations.map(v => v.rule)).toEqual([
      'next-step-ritual',
    ]);
  });

  it('paragraph ceilings are configurable', () => {
    const five = 'a.\n\nb.\n\nc.\n\nd.\n\ne.';
    expect(lintChatRegister(five).violations.map(v => v.rule)).toEqual(['paragraphs']);
    expect(lintChatRegister(five, { maxParagraphs: 5 }).pass).toBe(true);
  });

  it('score never goes below zero and deducts per violation', () => {
    const memo =
      'Hi! Great question.\n\n# A\n\n- one\n\n**b** **c**\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\nNext step: x.\n\nHope this helps! 🎉';
    const r = lintChatRegister(memo);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThan(0.2);
    expect(r.violations.length).toBeGreaterThanOrEqual(8);
  });

  it('summarizes a batch', () => {
    const results = [lintChatRegister('Fine.'), lintChatRegister('Hi! Fine.')];
    const s = summarizeRegisterLint(results);
    expect(s.count).toBe(2);
    expect(s.passed).toBe(1);
    expect(s.passRate).toBe(0.5);
    expect(s.violationsByRule['greeting-ritual']).toBe(1);
    expect(s.violationsByRule.exclamation).toBe(1);
    expect(s.meanScore).toBeLessThan(1);
    expect(summarizeRegisterLint([]).count).toBe(0);
  });
});

describe('exclamation marks and emoji — earned in a light moment, never in a serious room (2026-10-01)', () => {
  const rules = (text: string, o: RegisterLintOptions = {}) => lintChatRegister(text, o).violations.map(v => v.rule);

  it('lets one earned exclamation stand on real news in an open room', () => {
    const win = 'Congratulations, Dana, that is a big one! The CMC section you rebuilt in August is a large part of why it went through clean.';
    expect(rules(win, { userText: 'IND cleared, no hold' })).toEqual([]);
  });

  it('refuses any exclamation in a serious room, derived or labelled', () => {
    const reply = 'Good catch! It may well be data entry, but it needs checking as if it is not.';
    expect(rules(reply, { userText: 'site 12 logged 4 hepatic adverse events this month' })).toContain('exclamation');
    expect(rules('Let us take the tables first, then the narrative!', { room: 'serious' })).toContain('exclamation');
  });

  it('refuses more than one, a stacked one, one on a ritual, and one on a figure', () => {
    expect(rules('That is wonderful! Truly!')).toContain('exclamation');
    expect(rules('That went through clean?!')).toContain('exclamation');
    expect(rules('Hi! The section is ready.', { firstTurn: true })).toContain('exclamation');
    expect(rules('The review clock stopped at day 87!')).toContain('exclamation');
  });

  it('does not count `!=` in inline code as a feeling', () => {
    expect(rules('Filter with `status != closed` and the list is empty.')).toEqual([]);
  });

  it('lets an emoji mirror the person in a light moment, and only then', () => {
    const reply = 'Thirty days of quiet from FDA has never sounded so good 🎉';
    expect(rules(reply, { userUsedEmoji: true })).toEqual([]);
    expect(rules(reply)).toContain('emoji');
    expect(rules('Two for you 🎉🎉', { userUsedEmoji: true })).toContain('emoji');
    expect(rules('The rate ratio is 9.1 🎉', { userUsedEmoji: true })).toContain('emoji');
    expect(rules('On it 👍', { userUsedEmoji: true, userText: 'we got a deficiency letter' })).toContain('emoji');
  });

  it('derives the serious room fail-closed, and honours a labeller who knows better', () => {
    expect(deriveRoom('Your 483 response is due Friday.')).toBe('serious');
    expect(deriveRoom('Morning.', { userText: 'the clinical hold letter just came in' })).toBe('serious');
    expect(deriveRoom('Morning, Priya.', { userText: 'good morning' })).toBe('open');
    expect(deriveRoom('Morning, Priya.', { userText: 'good morning', room: 'serious' })).toBe('serious');
  });

  it('fails any exclamation mark or emoji inside an artifact', () => {
    const artifact = '## 2.5.1 Product Development Rationale\n\nThe sponsor selected the dose based on exposure!\n\n## 2.5.2 Overview';
    expect(lintArtifactRegister(artifact).violations.map(v => v.rule)).toContain('exclamation');
    const withEmoji = '## 2.5.1 Product Development Rationale\n\nThe sponsor selected the dose ✅\n\n## 2.5.2 Overview';
    expect(lintArtifactRegister(withEmoji).violations.map(v => v.rule)).toContain('emoji');
  });

  it('reports how often replies carry one, so "most have none" is measurable', () => {
    const s = summarizeRegisterLint([lintChatRegister('Fine.'), lintChatRegister('That is great news!'), lintChatRegister('Done.')]);
    expect(s.exclamationTurnRate).toBe(0.33);
    expect(s.emojiTurnRate).toBe(0);
  });

  it('finds a playful line that repeats, because repetition turns charm into a tic', () => {
    const turns = [
      { conversationId: 'c1', text: 'Done. Another one bites the dust!' },
      { conversationId: 'c1', text: 'Section 3 is clean. Another one bites the dust!' },
      { conversationId: 'c1', text: 'That one is real news!' },
    ];
    expect(findCatchphrases(turns)).toEqual([{ phrase: 'another one bites the dust', count: 2 }]);
    expect(findCatchphrases([{ conversationId: 'c1', text: 'Plain.' }])).toEqual([]);
  });
});
