/**
 * Tests for the apply-rewrite verification + diff helpers.
 *
 * These are the pure functions; the full applyRewrite() service requires a
 * database transaction and is exercised through integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  verifyProposedContent,
  computeRewriteDiffStats,
} from '../ana/submission-chat-apply-rewrite';

describe('apply-rewrite · verifyProposedContent', () => {
  it('marks paragraphs with [SRC-n] citations as cited', () => {
    const content =
      'Median age across the cohort was 47 years [SRC-1].\n\n' +
      'The primary endpoint was met at week 12 [SRC-2], confirmed in [SRC-3].';
    const v = verifyProposedContent(content);
    expect(v.totalParagraphs).toBe(2);
    expect(v.meaningfulParagraphs).toBe(2);
    expect(v.unsupportedParagraphs).toBe(0);
    expect(v.unsupportedRatio).toBe(0);
    expect(v.flags).toEqual([]);
  });

  it('flags meaningful paragraphs that lack citations', () => {
    // Two long paragraphs, one cited, one not.
    const cited =
      'A'.repeat(120) + ' [SRC-1] ' + 'B'.repeat(20);
    const uncited = 'C'.repeat(200);
    const v = verifyProposedContent(`${cited}\n\n${uncited}`);
    expect(v.meaningfulParagraphs).toBe(2);
    expect(v.unsupportedParagraphs).toBe(1);
    expect(v.unsupportedRatio).toBeCloseTo(0.5, 5);
    expect(v.flags.some(f => f.rule === 'UNCITED_PARAGRAPHS')).toBe(true);
  });

  it('treats markdown / § headers as headers (not blocking)', () => {
    const content =
      '## 4.1 Indications\n\n' +
      '§4.1\n\n' +
      'Z'.repeat(150) + ' [SRC-1]';
    const v = verifyProposedContent(content);
    // 3 paragraphs total, only the long one is "meaningful" (rest are headers).
    expect(v.meaningfulParagraphs).toBe(1);
    expect(v.unsupportedParagraphs).toBe(0);
    expect(v.flags.find(f => f.severity === 'block')).toBeUndefined();
  });

  it('blocks when uncited ratio is at or above threshold (default 0.3)', () => {
    // 1 cited, 2 uncited → 0.66 ratio → blocking.
    const cited = 'X'.repeat(120) + ' [SRC-1]';
    const uncited1 = 'Y'.repeat(150);
    const uncited2 = 'Z'.repeat(150);
    const v = verifyProposedContent(
      `${cited}\n\n${uncited1}\n\n${uncited2}`
    );
    const blocking = v.flags.find(f => f.severity === 'block');
    expect(blocking?.rule).toBe('UNCITED_PARAGRAPHS');
  });

  it('warns (not blocks) when only one paragraph in many is uncited', () => {
    // 5 cited, 1 uncited → 1/6 = 0.166 ratio → warn only.
    const cited = (i: number) => 'X'.repeat(120) + ` [SRC-${i}]`;
    const uncited = 'Y'.repeat(150);
    const paragraphs = [
      cited(1),
      cited(2),
      cited(3),
      cited(4),
      cited(5),
      uncited,
    ];
    const v = verifyProposedContent(paragraphs.join('\n\n'));
    const flag = v.flags.find(f => f.rule === 'UNCITED_PARAGRAPHS');
    expect(flag?.severity).toBe('warn');
  });

  it('flags content with no meaningful paragraphs', () => {
    const v = verifyProposedContent('## Header only\n\n§4.1');
    expect(v.flags.some(f => f.rule === 'NO_MEANINGFUL_CONTENT')).toBe(true);
  });
});

describe('apply-rewrite · computeRewriteDiffStats', () => {
  it('reports zero changes when content is identical', () => {
    const text = 'a\nb\nc';
    const d = computeRewriteDiffStats(text, text);
    expect(d.linesAdded).toBe(0);
    expect(d.linesRemoved).toBe(0);
    expect(d.linesUnchanged).toBe(3);
  });

  it('counts added and removed lines', () => {
    const before = 'one\ntwo\nthree';
    const after = 'one\ntwo-modified\nthree\nfour';
    const d = computeRewriteDiffStats(before, after);
    expect(d.linesUnchanged).toBe(2); // "one", "three"
    expect(d.linesRemoved).toBe(1);   // "two"
    expect(d.linesAdded).toBe(2);     // "two-modified", "four"
    expect(d.oldLineCount).toBe(3);
    expect(d.newLineCount).toBe(4);
  });

  it('reports total replacement when no overlap', () => {
    const d = computeRewriteDiffStats('a\nb\nc', 'x\ny\nz');
    expect(d.linesUnchanged).toBe(0);
    expect(d.linesRemoved).toBe(3);
    expect(d.linesAdded).toBe(3);
  });

  it('handles multiset duplicates correctly', () => {
    const d = computeRewriteDiffStats('a\na\nb', 'a\nb\nb');
    // unchanged: 1×a, 1×b. removed: 1×a. added: 1×b.
    expect(d.linesUnchanged).toBe(2);
    expect(d.linesRemoved).toBe(1);
    expect(d.linesAdded).toBe(1);
  });

  it('reports character counts on both sides', () => {
    const d = computeRewriteDiffStats('hi', 'hello');
    expect(d.oldCharCount).toBe(2);
    expect(d.newCharCount).toBe(5);
  });
});
