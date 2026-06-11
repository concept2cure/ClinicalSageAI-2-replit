/**
 * Lifecycle Obligation deterministic logic (C2C-11) — classification pathways,
 * the PSUR cadence engine, and calendar urgency. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  OBLIGATION_CLASSIFICATIONS,
  classificationPathway,
  generateOccurrences,
  obligationUrgency,
  summarizeCalendar,
  type DeadlineItem,
} from '../lifecycle-logic';

const TODAY = '2026-06-10';

describe('classification catalog', () => {
  it('covers EU variations and FDA supplements with citations', () => {
    expect(OBLIGATION_CLASSIFICATIONS.some((c) => c.classification === 'II')).toBe(true);
    expect(classificationPathway('II')!.citation).toMatch(/1234\/2008/);
    expect(classificationPathway('CBE-30')!.citation).toMatch(/314\.70/);
    expect(classificationPathway('unknown')).toBeNull();
  });
});

describe('generateOccurrences', () => {
  it('generates periodic occurrences at the cadence, due ~70 days after period end', () => {
    const occ = generateOccurrences('2026-01-01', 6, 3);
    expect(occ).toHaveLength(3);
    expect(occ[0].periodStart).toBe('2026-01-01');
    expect(occ[0].periodEnd).toBe('2026-07-01');
    expect(occ[0].dueDate).toBe('2026-09-09'); // 2026-07-01 + 70 days
    expect(occ[1].periodStart).toBe('2026-07-01');
    expect(occ[1].periodEnd).toBe('2027-01-01');
  });
  it('returns nothing for non-positive cadence or count', () => {
    expect(generateOccurrences('2026-01-01', 0, 3)).toHaveLength(0);
    expect(generateOccurrences('2026-01-01', 6, 0)).toHaveLength(0);
  });
});

describe('obligationUrgency / summarizeCalendar', () => {
  it('buckets and summarizes', () => {
    expect(obligationUrgency({ dueDate: '2026-01-01', terminal: false }, TODAY)).toBe('overdue');
    expect(obligationUrgency({ dueDate: '2026-06-20', terminal: false }, TODAY)).toBe('due_30');
    expect(obligationUrgency({ dueDate: '2026-01-01', terminal: true }, TODAY)).toBe('closed');
    const items: DeadlineItem[] = [
      { dueDate: '2026-01-01', terminal: false },
      { dueDate: '2026-06-20', terminal: false },
      { dueDate: '2026-08-15', terminal: false },
      { dueDate: null, terminal: false },
    ];
    const s = summarizeCalendar(items, TODAY);
    expect(s.total).toBe(4);
    expect(s.overdue + s.due_30 + s.due_90 + s.later + s.undated + s.closed).toBe(4);
    expect(s.overdue).toBe(1);
    expect(s.due_90).toBe(1);
  });
});
