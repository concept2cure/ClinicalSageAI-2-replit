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
  closeoutDueDate,
  evaluateCloseout,
  evaluateSubawardEligibility,
  type DeadlineItem,
  type CloseoutRecordState,
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

describe('closeoutDueDate', () => {
  it('is 120 days after the period end (2 CFR 200.344)', () => {
    expect(closeoutDueDate('2026-01-01')).toBe('2026-05-01');
    expect(closeoutDueDate(null)).toBeNull();
  });
});

describe('evaluateCloseout', () => {
  const none: CloseoutRecordState = { finalRpprSubmitted: false, finalFfrSubmitted: false, equipmentInventoryReturned: false, finalInvoicesReconciled: false };
  const all: CloseoutRecordState = { finalRpprSubmitted: true, finalFfrSubmitted: true, equipmentInventoryReturned: true, finalInvoicesReconciled: true };

  it('lists all four required items and blocks finalize when any is outstanding', () => {
    const s = evaluateCloseout(none, '2026-05-01', TODAY); // due 2026-08-29, still open
    expect(s.items).toHaveLength(4);
    expect(s.outstanding).toHaveLength(4);
    expect(s.readyToFinalize).toBe(false);
    expect(s.status).toBe('open');
    expect(s.dueDate).toBe('2026-08-29');
  });

  it('is ready to finalize once all items are complete', () => {
    const s = evaluateCloseout(all, '2026-05-01', TODAY);
    expect(s.readyToFinalize).toBe(true);
    expect(s.outstanding).toHaveLength(0);
  });

  it('flags overdue when past the due date and not complete', () => {
    const s = evaluateCloseout(none, '2025-01-01', TODAY); // due 2025-05-01, well past
    expect(s.overdue).toBe(true);
    expect(s.status).toBe('overdue');
  });

  it('reports complete when the record is already completed', () => {
    const s = evaluateCloseout({ ...all, status: 'completed' }, '2025-01-01', TODAY);
    expect(s.status).toBe('complete');
  });
});

describe('evaluateSubawardEligibility', () => {
  it('is eligible only when cleared and risk-assessed', () => {
    expect(evaluateSubawardEligibility({ screenStatus: 'cleared', riskLevel: 'low' }).eligible).toBe(true);
  });
  it('blocks an excluded subrecipient (2 CFR 200.214)', () => {
    const r = evaluateSubawardEligibility({ screenStatus: 'excluded', riskLevel: 'low' });
    expect(r.eligible).toBe(false);
    expect(r.blockers.some((b) => /200\.214/.test(b))).toBe(true);
  });
  it('blocks when not screened', () => {
    const r = evaluateSubawardEligibility({ screenStatus: 'not_screened', riskLevel: 'low' });
    expect(r.eligible).toBe(false);
    expect(r.blockers.some((b) => /screening not performed/.test(b))).toBe(true);
  });
  it('blocks when risk assessment is missing (2 CFR 200.332)', () => {
    const r = evaluateSubawardEligibility({ screenStatus: 'cleared', riskLevel: null });
    expect(r.eligible).toBe(false);
    expect(r.blockers.some((b) => /200\.332/.test(b))).toBe(true);
  });
});
