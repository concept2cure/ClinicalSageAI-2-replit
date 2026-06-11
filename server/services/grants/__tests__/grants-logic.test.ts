/**
 * eGrants deterministic logic (C2C-14) — deadline urgency, federal reporting
 * cadence (2 CFR 200.344 / NIH RPPR), and award-period state. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  deadlineUrgency,
  summarizeDeadlines,
  reportingObligations,
  awardPeriodState,
  type DeadlineItem,
} from '../grants-logic';

const TODAY = '2026-06-10';

describe('deadlineUrgency', () => {
  it('buckets by due date', () => {
    expect(deadlineUrgency({ dueDate: '2026-01-01', terminal: false }, TODAY)).toBe('overdue');
    expect(deadlineUrgency({ dueDate: '2026-06-20', terminal: false }, TODAY)).toBe('due_30');
    expect(deadlineUrgency({ dueDate: '2026-08-15', terminal: false }, TODAY)).toBe('due_90');
    expect(deadlineUrgency({ dueDate: '2027-01-01', terminal: false }, TODAY)).toBe('later');
    expect(deadlineUrgency({ dueDate: null, terminal: false }, TODAY)).toBe('undated');
    expect(deadlineUrgency({ dueDate: '2026-01-01', terminal: true }, TODAY)).toBe('closed');
  });
});

describe('summarizeDeadlines', () => {
  it('counts each item into exactly one bucket', () => {
    const items: DeadlineItem[] = [
      { dueDate: '2026-01-01', terminal: false }, // overdue
      { dueDate: '2026-06-20', terminal: false }, // due_30
      { dueDate: '2026-01-01', terminal: true }, // closed
    ];
    const s = summarizeDeadlines(items, TODAY);
    expect(s.total).toBe(3);
    expect(s.overdue + s.due_30 + s.due_90 + s.later + s.undated + s.closed).toBe(3);
    expect(s.overdue).toBe(1);
    expect(s.closed).toBe(1);
  });
});

describe('reportingObligations', () => {
  it('emits annual RPPRs plus final performance + financial reports', () => {
    const obs = reportingObligations('2025-01-01', '2027-01-01');
    expect(obs.some((o) => o.type === 'annual_rppr')).toBe(true);
    expect(obs.some((o) => o.type === 'final_rppr')).toBe(true);
    expect(obs.some((o) => o.type === 'final_financial')).toBe(true);
    // Final reports are 120 days after the period end.
    const final = obs.find((o) => o.type === 'final_rppr')!;
    expect(final.dueDate).toBe('2027-05-01');
    expect(final.basis).toMatch(/2 CFR 200\.344/);
  });
  it('returns only final reports when no start date', () => {
    const obs = reportingObligations(null, '2027-01-01');
    expect(obs.every((o) => o.type !== 'annual_rppr')).toBe(true);
    expect(obs).toHaveLength(2);
  });
});

describe('awardPeriodState', () => {
  it('detects pre-start, active, closeout window, and lapsed', () => {
    expect(awardPeriodState('2026-07-01', '2027-07-01', TODAY)).toBe('pre_start');
    expect(awardPeriodState('2026-01-01', '2026-12-31', TODAY)).toBe('active');
    expect(awardPeriodState('2025-01-01', '2026-05-01', TODAY)).toBe('closeout_window'); // within 120d
    expect(awardPeriodState('2024-01-01', '2025-01-01', TODAY)).toBe('lapsed'); // > 120d past
  });
});
