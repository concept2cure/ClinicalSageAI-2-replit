/**
 * An FDA annual-report obligation with no classification is labelled an annual
 * report, not a PADER.
 *
 * What renewalReportLabel used to do: `case 'annual_report': return r === 'fda'
 * ? 'PADER' : 'Annual report';`. A PADER (Periodic Adverse Drug Experience
 * Report, 21 CFR 314.80(c)(2)) is a postmarketing safety report; an annual
 * report (21 CFR 314.81(b)(2), and this module's own `annual_report`
 * classification, 21 CFR 314.70(d)) is a different filing with different
 * content and clock. GET /api/lifecycle/renewals showed every unclassified FDA
 * annual report as "PADER" in the Renewal cycles card.
 */
import { describe, it, expect } from 'vitest';
import { renewalReportLabel, projectRenewalObligations } from '../lifecycle-logic';

describe('renewalReportLabel — an FDA annual report is an annual report', () => {
  it('does not name an unclassified FDA annual report a PADER', () => {
    expect(renewalReportLabel('annual_report', 'fda', null), 'an FDA annual report was labelled PADER').toBe('Annual report');
    expect(renewalReportLabel('annual_report', 'fda', '  ')).toBe('Annual report');
  });

  it('still shows the classification the user recorded', () => {
    expect(renewalReportLabel('annual_report', 'fda', 'PADER')).toBe('PADER');
  });

  it('carries through to the Renewal cycles projection', () => {
    const [row] = projectRenewalObligations(
      [{ obligation_type: 'annual_report', region: 'fda', title: 'NDA 212345', classification: null, due_date: '2026-12-01', recurrence_months: 12, status: 'planned' }],
      '2026-10-15',
    );
    expect(row.next).toBe('Annual report');
  });
});
