/**
 * Protocol Review & Comment pure logic — consensus roll-up + readiness gate.
 * Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeReviewConsensus,
  evaluateReviewReadiness,
  type AssignmentView,
} from '../protocol-reviews-logic';

describe('summarizeReviewConsensus', () => {
  it('is pending with no assignments', () => {
    const r = summarizeReviewConsensus([]);
    expect(r.consensus).toBe('pending');
    expect(r.completed).toBe(0);
    expect(r.pending).toBe(0);
    expect(r.basis).toContain('No reviewers');
  });

  it('is pending while any assignment is incomplete', () => {
    const a: AssignmentView[] = [
      { status: 'completed', disposition: 'approve' },
      { status: 'in_progress', disposition: null },
    ];
    const r = summarizeReviewConsensus(a);
    expect(r.consensus).toBe('pending');
    expect(r.completed).toBe(1);
    expect(r.pending).toBe(1);
  });

  it('approves when all complete and all approve', () => {
    const a: AssignmentView[] = [
      { status: 'completed', disposition: 'approve' },
      { status: 'completed', disposition: 'approve' },
    ];
    const r = summarizeReviewConsensus(a);
    expect(r.consensus).toBe('approve');
    expect(r.dispositions.approve).toBe(2);
  });

  it('a single reject is dispositive', () => {
    const a: AssignmentView[] = [
      { status: 'completed', disposition: 'approve' },
      { status: 'completed', disposition: 'reject' },
      { status: 'completed', disposition: 'approve_with_changes' },
    ];
    const r = summarizeReviewConsensus(a);
    expect(r.consensus).toBe('reject');
  });

  it('approve_with_changes gates a clean approval when no reject', () => {
    const a: AssignmentView[] = [
      { status: 'completed', disposition: 'approve' },
      { status: 'completed', disposition: 'approve_with_changes' },
    ];
    expect(summarizeReviewConsensus(a).consensus).toBe('approve_with_changes');
  });

  it('all abstentions never decide', () => {
    const a: AssignmentView[] = [
      { status: 'completed', disposition: 'abstain' },
      { status: 'completed', disposition: 'abstain' },
    ];
    const r = summarizeReviewConsensus(a);
    expect(r.consensus).toBe('pending');
    expect(r.dispositions.abstain).toBe(2);
  });

  it('cites the basis', () => {
    expect(summarizeReviewConsensus([{ status: 'completed', disposition: 'approve' }]).basis).toContain('ICH E6');
  });
});

describe('evaluateReviewReadiness', () => {
  it('ready when all completed and no open blocking comments', () => {
    const r = evaluateReviewReadiness({
      assignments: [{ status: 'completed', disposition: 'approve' }],
      openBlockingComments: 0,
    });
    expect(r.readyToDecide).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('not ready with no reviewers', () => {
    const r = evaluateReviewReadiness({ assignments: [], openBlockingComments: 0 });
    expect(r.readyToDecide).toBe(false);
    expect(r.blockers.some((b) => b.includes('No reviewers'))).toBe(true);
  });

  it('not ready while assignments incomplete', () => {
    const r = evaluateReviewReadiness({
      assignments: [{ status: 'in_progress', disposition: null }],
      openBlockingComments: 0,
    });
    expect(r.readyToDecide).toBe(false);
    expect(r.blockers.some((b) => b.includes('not yet completed'))).toBe(true);
  });

  it('not ready with open blocking comments', () => {
    const r = evaluateReviewReadiness({
      assignments: [{ status: 'completed', disposition: 'approve' }],
      openBlockingComments: 2,
    });
    expect(r.readyToDecide).toBe(false);
    expect(r.blockers.some((b) => b.includes('blocking comment'))).toBe(true);
  });
});
