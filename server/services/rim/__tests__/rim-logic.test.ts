/**
 * RIM-lite deterministic logic (C2C-12) — label-type mapping, renewal urgency,
 * grid summary, and the label-currency gate. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  expectedLabelType,
  renewalUrgency,
  summarizeGrid,
  evaluateLabelCurrency,
  type GridRow,
} from '../rim-logic';

const TODAY = '2026-06-10';

describe('expectedLabelType', () => {
  it('maps US→USPI, EU→SmPC, other→CCDS', () => {
    expect(expectedLabelType('US').labelType).toBe('uspi');
    expect(expectedLabelType('DE').labelType).toBe('smpc');
    expect(expectedLabelType('EU').labelType).toBe('smpc');
    expect(expectedLabelType('JP').labelType).toBe('core_data_sheet');
  });
});

describe('renewalUrgency', () => {
  it('only applies to approved registrations', () => {
    expect(renewalUrgency('planned', '2026-01-01', TODAY)).toBe('not_applicable');
  });
  it('buckets approved renewals', () => {
    expect(renewalUrgency('approved', '2026-01-01', TODAY)).toBe('overdue');
    expect(renewalUrgency('approved', '2026-08-01', TODAY)).toBe('due_90');
    expect(renewalUrgency('approved', '2026-11-01', TODAY)).toBe('due_180');
    expect(renewalUrgency('approved', '2027-06-01', TODAY)).toBe('later');
  });
});

describe('summarizeGrid', () => {
  it('counts statuses and renewal urgency', () => {
    const rows: GridRow[] = [
      { country: 'US', marketStatus: 'approved', renewalDueDate: '2026-01-01' }, // overdue
      { country: 'DE', marketStatus: 'approved', renewalDueDate: '2026-08-01' }, // due_90
      { country: 'FR', marketStatus: 'submitted' },
    ];
    const s = summarizeGrid(rows, TODAY);
    expect(s.total).toBe(3);
    expect(s.approved).toBe(2);
    expect(s.renewalsOverdue).toBe(1);
    expect(s.renewalsDue180).toBe(1);
    expect(s.byStatus.approved).toBe(2);
    expect(s.byStatus.submitted).toBe(1);
  });
});

describe('evaluateLabelCurrency', () => {
  it('passes when every approved market has its label', () => {
    const r = evaluateLabelCurrency({
      registrations: [{ country: 'US', marketStatus: 'approved' }, { country: 'DE', marketStatus: 'approved' }],
      approvedLabels: [{ country: 'US', labelType: 'uspi' }, { country: 'DE', labelType: 'smpc' }],
    });
    expect(r.riskLevel).toBe('low');
  });
  it('flags an approved market missing its label', () => {
    const r = evaluateLabelCurrency({
      registrations: [{ country: 'US', marketStatus: 'approved' }],
      approvedLabels: [],
    });
    expect(r.findings.some((f) => /no current approved USPI/.test(f.message))).toBe(true);
    expect(r.riskLevel).toBe('medium');
  });
  it('accepts a core data sheet as fallback for non-US/EU markets', () => {
    const r = evaluateLabelCurrency({
      registrations: [{ country: 'JP', marketStatus: 'approved' }],
      approvedLabels: [{ country: null, labelType: 'core_data_sheet' }],
    });
    expect(r.riskLevel).toBe('low');
  });
  it('ignores non-approved markets', () => {
    const r = evaluateLabelCurrency({ registrations: [{ country: 'US', marketStatus: 'submitted' }], approvedLabels: [] });
    expect(r.findings).toHaveLength(0);
  });
});
