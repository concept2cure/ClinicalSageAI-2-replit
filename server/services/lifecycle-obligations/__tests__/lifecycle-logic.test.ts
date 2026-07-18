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
  authorityForRegion,
  recurrenceInterval,
  renewalReportLabel,
  projectRenewalObligations,
  type DeadlineItem,
  type RenewalObligationRow,
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

describe('renewal-cycle projection', () => {
  it('maps region → authority and recurrence → interval', () => {
    expect(authorityForRegion('fda')).toBe('FDA');
    expect(authorityForRegion('eu')).toBe('EMA');
    expect(authorityForRegion('jp')).toBe('PMDA');
    expect(authorityForRegion('mhra')).toBe('MHRA');
    expect(authorityForRegion(null)).toBe('Other');
    expect(recurrenceInterval(12)).toBe('Annual');
    expect(recurrenceInterval(60)).toBe('5-year');
    expect(recurrenceInterval(96)).toBe('8-year');
    expect(recurrenceInterval(6)).toBe('6-month');
    expect(recurrenceInterval(null)).toBe('One-time');
  });

  it('derives an honest report label, preferring an authored classification', () => {
    expect(renewalReportLabel('annual_report', 'fda', null)).toBe('PADER');
    expect(renewalReportLabel('annual_report', 'eu', null)).toBe('Annual report');
    expect(renewalReportLabel('renewal', 'jp', null)).toBe('Re-examination');
    expect(renewalReportLabel('periodic_report', 'eu', null)).toBe('PSUR/PBRER');
    expect(renewalReportLabel('annual_report', 'fda', 'PADER (custom)')).toBe('PADER (custom)');
  });

  it('projects only recurring types, soonest-due first, with urgency', () => {
    const rows: RenewalObligationRow[] = [
      { obligation_type: 'renewal', region: 'eu', title: 'BX-099', classification: 'Renewal', due_date: '2030-02-14', recurrence_months: 60, status: 'planned' },
      { obligation_type: 'annual_report', region: 'fda', title: 'BX-099', classification: 'PADER', due_date: '2026-09-30', recurrence_months: 12, status: 'planned' },
      // A one-off variation must be excluded from the renewal-cycle view.
      { obligation_type: 'variation', region: 'eu', title: 'BX-099', classification: 'II', due_date: '2026-07-01', recurrence_months: null, status: 'planned' },
    ];
    const out = projectRenewalObligations(rows, '2026-06-10');
    expect(out).toHaveLength(2); // variation excluded
    expect(out[0].next).toBe('PADER'); // soonest due sorts first
    expect(out[0].authority).toBe('FDA');
    expect(out[0].interval).toBe('Annual');
    expect(out[0].urgency).toBe('later'); // 2026-09-30 is ~112 days out (> 90)
    expect(out[1].authority).toBe('EMA');
    expect(out[1].interval).toBe('5-year');
    expect(out[1].urgency).toBe('later'); // 2030 renewal
  });

  it('sorts undated obligations last', () => {
    const rows: RenewalObligationRow[] = [
      { obligation_type: 'renewal', region: 'eu', title: 'A', classification: null, due_date: null, recurrence_months: 60, status: 'planned' },
      { obligation_type: 'annual_report', region: 'fda', title: 'B', classification: null, due_date: '2027-01-01', recurrence_months: 12, status: 'planned' },
    ];
    const out = projectRenewalObligations(rows, '2026-06-10');
    expect(out[0].due).toBe('2027-01-01');
    expect(out[1].due).toBe('—');
  });
});
