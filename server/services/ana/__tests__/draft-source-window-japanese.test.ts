/**
 * Japanese and mixed-script terms in the source-window selector (priority 3).
 * Fixtures are engineering cases constructed for the boundary rule, not
 * expert relevance judgements.
 */
import { describe, expect, it } from 'vitest';
import { chooseSourceWindow, sectionTerms } from '../draft-source-window';

const BACKGROUND = '背景情報。'.repeat(7500);
const PREFIX = BACKGROUND + '\n';
const SUFFIX = '\n' + '補足情報。'.repeat(1000);
const RESULT = '治療中の有害事象発現率は12％でした。';

describe('chooseSourceWindow with Japanese text', () => {
  it('finds a Japanese term written inside a sentence (the recorded probe)', () => {
    const text = PREFIX + RESULT + SUFFIX;
    expect(chooseSourceWindow(text, '有害事象', 500)).toEqual({ start: 37501, end: 38001, basis: 'relevant' });
  });

  it('finds a Latin term written against Japanese characters', () => {
    const text = PREFIX + 'CTCAEグレード3以上の事象を集計した。' + SUFFIX;
    const w = chooseSourceWindow(text, 'CTCAE grade', 500);
    expect(w).toEqual({ start: PREFIX.length, end: PREFIX.length + 500, basis: 'relevant' });
  });

  it('chooses by the terms of a Japanese instruction sentence', () => {
    const text = PREFIX + RESULT + SUFFIX;
    const w = chooseSourceWindow(text, '有害事象の発現率を要約する', 500);
    expect(w.basis).toBe('relevant');
    expect(text.slice(w.start, w.end)).toContain(RESULT);
  });

  it('matches a compound against text that splits it, over a passage sharing one part', () => {
    const decoy = '\n重篤な事象は認められなかった。\n';
    const passage = '\n有害事象の発現率は12％であった。\n';
    const text = BACKGROUND.slice(0, 20000) + decoy + BACKGROUND.slice(20000) + passage + SUFFIX;
    const w = chooseSourceWindow(text, '有害事象発現率', 500);
    expect(w.basis).toBe('relevant');
    expect(text.slice(w.start, w.end)).toContain('有害事象の発現率は12％');
  });

  it('starts just after a Japanese full stop when no line break is in reach', () => {
    const text = BACKGROUND + '有害事象 発現率は12％でした。' + SUFFIX;
    const w = chooseSourceWindow(text, '有害事象', 500);
    expect(w.start).toBe(BACKGROUND.length);
    expect(text[w.start - 1]).toBe('。');
  });

  it('keeps UTF-16 source offsets after an astral Han character', () => {
    const text = '𠮷'.repeat(5000) + '\n' + RESULT + SUFFIX;
    const w = chooseSourceWindow(text, '有害事象', 500);
    expect(text.slice(w.start, w.end).startsWith(RESULT)).toBe(true);
    expect(w.end - w.start).toBe(500);
  });

  it('still refuses a Latin term inside a Latin word in a Japanese document', () => {
    const text = PREFIX + 'xctcaeの記録のみ。' + SUFFIX;
    expect(chooseSourceWindow(text, 'ctcae', 500)).toEqual({ start: 0, end: 500, basis: 'opening' });
  });

  it('keeps the English hyphen-edge boundary unchanged', () => {
    const filler = 'Administrative text. '.repeat(200);
    const text = filler + '\nanti-drug antibodies measured.\n' + filler;
    expect(chooseSourceWindow(text, 'anti- titre', 500)).toEqual({ start: 0, end: 500, basis: 'opening' });
  });

  it('keeps the opening for a query of hiragana only, which carries no term', () => {
    const text = PREFIX + RESULT + SUFFIX;
    expect(chooseSourceWindow(text, 'ゆうがいじしょう', 500)).toEqual({ start: 0, end: 500, basis: 'opening' });
  });

  it('is deterministic', () => {
    const text = PREFIX + RESULT + SUFFIX;
    expect(chooseSourceWindow(text, '有害事象の発現率', 500)).toEqual(chooseSourceWindow(text, '有害事象の発現率', 500));
  });
});

describe('sectionTerms with Japanese', () => {
  it('splits at hiragana, drops boilerplate, then adds Han bigrams after whole terms', () => {
    expect(sectionTerms('有害事象の発現率を要約する'))
      .toEqual(['有害事象', '発現率', '有害', '害事', '事象', '発現', '現率']);
  });

  it('separates Latin and Japanese in a mixed query and keeps katakana words whole', () => {
    expect(sectionTerms('Draft プラセボ群のCTCAEグレード')).toEqual(['プラセボ群', 'ctcae', 'グレード']);
  });
});
