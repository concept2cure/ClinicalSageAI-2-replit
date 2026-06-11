/**
 * Inspection Readiness deterministic logic (C2C-13) — 483 response clock,
 * response urgency, outcome severity, and readiness scoring. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  addBusinessDays,
  responseDueDate,
  responseUrgency,
  outcomeSeverity,
  findingPriority,
  scoreReadiness,
  type ReadinessArea,
} from '../inspection-logic';

describe('addBusinessDays / responseDueDate', () => {
  it('skips weekends', () => {
    // 2026-06-10 is a Wednesday; +15 business days = 2026-07-01.
    expect(addBusinessDays('2026-06-10', 15)).toBe('2026-07-01');
  });
  it('computes the 15-business-day 483 response due date', () => {
    expect(responseDueDate('2026-06-10')).toBe('2026-07-01');
    expect(responseDueDate(null)).toBeNull();
  });
});

describe('responseUrgency', () => {
  it('buckets by due date', () => {
    expect(responseUrgency('draft', '2026-06-01', '2026-06-10')).toBe('overdue');
    expect(responseUrgency('draft', '2026-06-13', '2026-06-10')).toBe('due_5');
    expect(responseUrgency('draft', '2026-06-22', '2026-06-10')).toBe('due_15');
    expect(responseUrgency('draft', '2026-08-01', '2026-06-10')).toBe('later');
    expect(responseUrgency('submitted', '2026-06-01', '2026-06-10')).toBe('closed');
  });
});

describe('outcomeSeverity / findingPriority', () => {
  it('ranks OAI worst and critical highest', () => {
    expect(outcomeSeverity('oai')).toBeGreaterThan(outcomeSeverity('vai'));
    expect(outcomeSeverity('vai')).toBeGreaterThan(outcomeSeverity('nai'));
    expect(findingPriority('critical')).toBeGreaterThan(findingPriority('minor'));
  });
});

describe('scoreReadiness', () => {
  it('scores all-ready areas at 100 / ready', () => {
    const areas: ReadinessArea[] = [{ area: 'a', status: 'ready' }, { area: 'b', status: 'ready' }];
    const r = scoreReadiness(areas);
    expect(r.score).toBe(100);
    expect(r.verdict).toBe('ready');
    expect(r.blockers).toHaveLength(0);
  });
  it('flags at_risk areas as blockers and at_risk verdict', () => {
    const r = scoreReadiness([{ area: 'data integrity', status: 'at_risk' }, { area: 'training', status: 'ready' }]);
    expect(r.verdict).toBe('at_risk');
    expect(r.blockers.some((b) => /data integrity/.test(b))).toBe(true);
  });
  it('counts in_progress as half', () => {
    const r = scoreReadiness([{ area: 'a', status: 'ready' }, { area: 'b', status: 'in_progress' }]);
    expect(r.score).toBe(75);
    expect(r.verdict).toBe('mostly_ready');
  });
  it('returns not_ready when no areas assessed', () => {
    expect(scoreReadiness([]).verdict).toBe('not_ready');
  });
});
