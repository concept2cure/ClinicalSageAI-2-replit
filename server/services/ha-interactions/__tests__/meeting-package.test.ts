/**
 * assembleMeetingPackage (orchestration) — pure, no DB/LLM.
 * Combines meeting readiness + open questions + interaction-sourced commitments
 * into one prioritized pre-meeting action list.
 */

import { describe, it, expect } from 'vitest';
import { assembleMeetingPackage, type MeetingReadinessInput } from '../ha-logic';

const today = '2026-06-10';
const scheduledReady: MeetingReadinessInput = { interactionType: 'type_b' as any, status: 'scheduled' as any, hasBriefingBook: true, questionCount: 2, scheduledDate: '2026-07-01' };

describe('assembleMeetingPackage', () => {
  it('is ready with a briefing book + questions, and lists open questions', () => {
    const p = assembleMeetingPackage(
      scheduledReady,
      [{ questionNumber: 1, questionText: 'Q1', agreementReached: true }, { questionNumber: 2, questionText: 'Q2', agreementReached: false }],
      [],
      today,
    );
    expect(p.ready).toBe(true);
    expect(p.questionCount).toBe(2);
    expect(p.openQuestions).toHaveLength(1);
    expect(p.actions.some((a) => /open question/.test(a))).toBe(true);
  });

  it('is NOT ready (critical) when a scheduled meeting has no briefing book', () => {
    const p = assembleMeetingPackage(
      { ...scheduledReady, hasBriefingBook: false },
      [{ questionText: 'Q', agreementReached: false }],
      [],
      today,
    );
    expect(p.ready).toBe(false);
    expect(p.actions.some((a) => /\[critical\]/.test(a))).toBe(true);
  });

  it('counts overdue interaction-sourced commitments and flags them', () => {
    const p = assembleMeetingPackage(
      scheduledReady,
      [],
      [{ status: 'open' as any, dueDate: '2026-01-01' }, { status: 'fulfilled' as any, dueDate: '2026-01-01', fulfilledDate: '2026-01-15' }],
      today,
    );
    expect(p.overdueCommitments).toBe(1);
    expect(p.outstandingCommitments).toBe(1);
    expect(p.actions.some((a) => /overdue/.test(a))).toBe(true);
  });
});
