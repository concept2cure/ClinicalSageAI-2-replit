/**
 * HA Interaction & Commitment deterministic logic (C2C-03) — status/urgency
 * derivation and the formal-meeting readiness gate. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveCommitmentStatus,
  commitmentUrgency,
  summarizeCommitmentPortfolio,
  evaluateMeetingReadiness,
  type CommitmentView,
} from '../ha-logic';

const TODAY = '2026-06-10';

describe('deriveCommitmentStatus', () => {
  it('marks a past-due, non-terminal commitment overdue', () => {
    expect(deriveCommitmentStatus({ status: 'open', dueDate: '2026-01-01' }, TODAY)).toBe('overdue');
  });
  it('preserves terminal states regardless of due date', () => {
    expect(deriveCommitmentStatus({ status: 'fulfilled', dueDate: '2026-01-01' }, TODAY)).toBe('fulfilled');
    expect(deriveCommitmentStatus({ status: 'waived', dueDate: '2026-01-01' }, TODAY)).toBe('waived');
  });
  it('leaves a future-dated open commitment as open', () => {
    expect(deriveCommitmentStatus({ status: 'open', dueDate: '2026-12-01' }, TODAY)).toBe('open');
  });
});

describe('commitmentUrgency', () => {
  it('buckets correctly', () => {
    expect(commitmentUrgency({ status: 'open', dueDate: '2026-01-01' }, TODAY)).toBe('overdue');
    expect(commitmentUrgency({ status: 'open', dueDate: '2026-06-20' }, TODAY)).toBe('due_30');
    expect(commitmentUrgency({ status: 'open', dueDate: '2026-08-15' }, TODAY)).toBe('due_90');
    expect(commitmentUrgency({ status: 'open', dueDate: '2027-01-01' }, TODAY)).toBe('later');
    expect(commitmentUrgency({ status: 'open', dueDate: null }, TODAY)).toBe('undated');
    expect(commitmentUrgency({ status: 'released', dueDate: '2026-01-01' }, TODAY)).toBe('closed');
  });
});

describe('summarizeCommitmentPortfolio', () => {
  it('counts every commitment into exactly one bucket', () => {
    const commitments: CommitmentView[] = [
      { status: 'open', dueDate: '2026-01-01' }, // overdue
      { status: 'open', dueDate: '2026-06-20' }, // due_30
      { status: 'fulfilled', dueDate: '2025-01-01' }, // closed
      { status: 'open', dueDate: null }, // undated
    ];
    const s = summarizeCommitmentPortfolio(commitments, TODAY);
    expect(s.total).toBe(4);
    expect(s.overdue + s.due_30 + s.due_90 + s.later + s.undated + s.closed).toBe(4);
    expect(s.overdue).toBe(1);
    expect(s.closed).toBe(1);
  });
});

describe('evaluateMeetingReadiness', () => {
  it('flags a scheduled meeting with no briefing book as not ready', () => {
    const r = evaluateMeetingReadiness({ interactionType: 'pre_nda', status: 'scheduled', hasBriefingBook: false, questionCount: 3, scheduledDate: '2026-07-01' });
    expect(r.ready).toBe(false);
    expect(r.findings.some((f) => /briefing book/i.test(f.message))).toBe(true);
  });
  it('flags a held meeting with no questions (major, still ready if briefing present)', () => {
    const r = evaluateMeetingReadiness({ interactionType: 'eop2', status: 'held', hasBriefingBook: true, questionCount: 0 });
    expect(r.ready).toBe(true);
    expect(r.findings.some((f) => /questions/i.test(f.message))).toBe(true);
  });
  it('does not demand a package for a planned meeting', () => {
    const r = evaluateMeetingReadiness({ interactionType: 'pre_ind', status: 'planned', hasBriefingBook: false, questionCount: 0 });
    expect(r.ready).toBe(true);
    expect(r.findings).toHaveLength(0);
  });
});
