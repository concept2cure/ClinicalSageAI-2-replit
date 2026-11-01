/**
 * What the Shadow Review reviewer is sent (2026-10-25, row D7;
 * shadow-review-input.ts). Before, every leaf reached it as a section code and a
 * title, so it reviewed a table of contents.
 */
import { describe, it, expect } from 'vitest';
import {
  buildReviewerInput,
  maskContactDetails,
  titlesOnlyInput,
  REVIEW_TEXT_PER_LEAF_CHARS,
  REVIEW_TEXT_TOTAL_CHARS,
  type LeafTextRead,
  type ReviewLeaf,
} from '../shadow-review-input';

const leaf = (id: number, sectionCode: string, lifecycleOp = 'new'): ReviewLeaf => ({
  id, sectionCode, title: `Leaf ${sectionCode}`, lifecycleOp, documentTable: 'coauthor_documents', documentId: id,
});

describe('buildReviewerInput', () => {
  it('sends each leaf its text and records it as read', () => {
    const leaves = [leaf(1, '2.5'), leaf(2, '2.7.3')];
    const reads = new Map<number, LeafTextRead>([
      [1, { text: 'The primary endpoint was met (HR 0.62).' }],
      [2, { text: 'Efficacy across subgroups was consistent.' }],
    ]);
    const { leaves: sent, coverage } = buildReviewerInput(leaves, reads);
    expect(sent[0]).toMatchObject({ sectionCode: '2.5', text: 'The primary endpoint was met (HR 0.62).', textChars: 39 });
    expect(sent[0].truncated).toBeUndefined();
    expect(coverage).toMatchObject({ version: 1, textSent: true, perLeafLimit: REVIEW_TEXT_PER_LEAF_CHARS, totalLimit: REVIEW_TEXT_TOTAL_CHARS });
    expect(coverage.leaves.map((l) => l.status)).toEqual(['read', 'read']);
    expect(coverage.charsSent).toBe(39 + 41);
  });

  it('cuts a long leaf to the per-leaf budget and says so', () => {
    const { leaves: sent, coverage } = buildReviewerInput(
      [leaf(1, '5.3.5.1')],
      new Map([[1, { text: 'x'.repeat(50) }]]),
      { perLeaf: 20, total: 1000 },
    );
    expect(sent[0]).toMatchObject({ textChars: 50, truncated: true });
    expect(sent[0].text).toHaveLength(20);
    expect(coverage.leaves[0]).toMatchObject({ status: 'truncated', chars: 50, sentChars: 20 });
  });

  it('sends a leaf past the run budget by title only, with the reason', () => {
    const { leaves: sent, coverage } = buildReviewerInput(
      [leaf(1, '2.5'), leaf(2, '2.7'), leaf(3, '3.2.S')],
      new Map([[1, { text: 'a'.repeat(30) }], [2, { text: 'b'.repeat(30) }], [3, { text: 'c'.repeat(30) }]]),
      { perLeaf: 30, total: 45 },
    );
    expect(sent[0].text).toHaveLength(30);
    expect(sent[1]).toMatchObject({ truncated: true });
    expect(sent[1].text).toHaveLength(15);
    expect(sent[2].text).toBeUndefined();
    expect(sent[2].notRead).toMatch(/budget/);
    expect(coverage.leaves.map((l) => l.status)).toEqual(['read', 'truncated', 'not_read']);
    expect(coverage.charsSent).toBe(45);
  });

  it('names a withdrawn, a withheld and an unreadable leaf apart, and sends none of their text', () => {
    const { reads } = {
      reads: new Map<number, LeafTextRead>([
        [1, { notRead: 'The leaf withdraws a document (lifecycle delete); it ships no content.' }],
        [2, { notRead: 'Withheld: the text holds identifiers classified as PHI (dob), and a simulated reviewer is not sent them.' }],
        [3, { notRead: 'The rendered leaf could not be read.' }],
      ]),
    };
    const { leaves: sent, coverage } = buildReviewerInput([leaf(1, '2.5', 'delete'), leaf(2, '2.7.4'), leaf(3, '3.2.P')], reads);
    expect(sent.every((l) => l.text === undefined && typeof l.notRead === 'string')).toBe(true);
    expect(coverage.leaves.map((l) => l.status)).toEqual(['withdrawn', 'withheld', 'not_read']);
    expect(coverage.charsSent).toBe(0);
  });
});

describe('maskContactDetails', () => {
  it('masks emails, US phone numbers and SSNs, and leaves figures alone', () => {
    const masked = maskContactDetails(
      'Contact Dana Reyes at dana.reyes@example.com or (301) 796-3400; SSN 123-45-6789. HR 0.62 (95% CI 0.48-0.80), n = 212.',
    );
    expect(masked).not.toMatch(/dana\.reyes@example\.com|796-3400|123-45-6789/);
    expect(masked).toContain('HR 0.62 (95% CI 0.48-0.80), n = 212.');
  });
});

describe('titlesOnlyInput', () => {
  it('sends no text and records why', () => {
    const { leaves: sent, coverage } = titlesOnlyInput([leaf(1, '2.5')], 'The AI gateway refused the leaves\' text.');
    expect(sent).toEqual([{ sectionCode: '2.5', title: 'Leaf 2.5', lifecycleOp: 'new' }]);
    expect(coverage).toMatchObject({ textSent: false, textWithheld: 'The AI gateway refused the leaves\' text.', charsSent: 0 });
    expect(coverage.leaves[0].status).toBe('not_read');
  });
});
