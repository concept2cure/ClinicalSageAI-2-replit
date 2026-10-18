/**
 * IND annual report (21 CFR 312.33) — a register nobody read is not an empty one.
 *
 * What the code used to do (until 2026-10-15): with `safetyReportsInPeriod: []`
 * and `ibChanges: []` — exactly what the IND screen sends, because its card
 * captures neither register — assembleIndAnnualReport printed "No IND Safety
 * Reports were submitted during the period." and "No revisions to the
 * Investigator's Brochure were made during the period.", marked both sections
 * complete: true, and the 312.33(b) summary stated "IND Safety Reports filed in
 * period: 0 (7-day: 0, 15-day: 0)". No gap was raised, so the m1.13 leaf filed
 * from that body asserted two regulatory facts nobody had established. An API
 * caller that omitted the lists got a 500 instead.
 *
 * Now "none" is printed only on the sponsor's own statement
 * (`noSafetyReportsInPeriod` / `noIbChangesInPeriod`); otherwise the section is
 * incomplete, its body is empty (rendered "[To be completed by the sponsor.]",
 * like every other unauthored section) and a gap names what is missing.
 */
import { describe, it, expect } from 'vitest';
import {
  assembleIndAnnualReport,
  type IndAnnualReportInput,
  type IndAnnualReportModel,
} from '../ind-annual-report-service';

function base(over: Partial<IndAnnualReportInput> = {}): IndAnnualReportInput {
  return {
    organizationId: '1',
    projectId: 'proj-1',
    indNumber: '123456',
    productName: 'C2C-001',
    reportingPeriodStart: new Date('2025-03-15T00:00:00.000Z'),
    reportingPeriodEnd: new Date('2026-03-15T00:00:00.000Z'),
    studyStatuses: [],
    safetyReportsInPeriod: [],
    ibChanges: [],
    safetySummary: 'No new safety signals were identified.',
    ...over,
  };
}

const section = (m: IndAnnualReportModel, key: string) => {
  const s = m.sections.find((x) => x.key === key);
  if (!s) throw new Error(`no section ${key}`);
  return s;
};

describe('assembleIndAnnualReport — the safety-report and IB registers', () => {
  it('empty lists leave both sections incomplete with a gap each, and assert no "none"', () => {
    const m = assembleIndAnnualReport(base());
    const reports = section(m, 'ind_safety_reports_list');
    const ib = section(m, 'ib_changes');

    expect(reports.complete).toBe(false);
    expect(ib.complete).toBe(false);
    expect(reports.body).not.toMatch(/No IND Safety Reports were submitted/);
    expect(ib.body).not.toMatch(/No revisions to the Investigator/);
    expect(m.gaps.map((g) => g.sectionKey)).toEqual(expect.arrayContaining(['ind_safety_reports_list', 'ib_changes']));
    const gapFor = (k: string) => m.gaps.find((g) => g.sectionKey === k)!.message;
    expect(gapFor('ind_safety_reports_list')).toMatch(/none were submitted/);
    expect(gapFor('ib_changes')).toMatch(/none were made/);
  });

  it('the 312.33(b) summary states no count for a register nobody read', () => {
    const summary = section(assembleIndAnnualReport(base()), 'summary_safety_information');
    expect(summary.body).not.toMatch(/IND Safety Reports filed in period: 0/);
    expect(summary.body).toContain('No new safety signals were identified.');
    // The narrative is what makes the summary complete; that is unchanged.
    expect(summary.complete).toBe(true);
  });

  it('lists omitted by an API caller read as not supplied — never a 500, never "none"', () => {
    const input = base();
    delete (input as Partial<IndAnnualReportInput>).safetyReportsInPeriod;
    delete (input as Partial<IndAnnualReportInput>).ibChanges;
    const m = assembleIndAnnualReport(input);
    expect(section(m, 'ind_safety_reports_list').complete).toBe(false);
    expect(section(m, 'ib_changes').complete).toBe(false);
  });

  it('"none" is printed only on the sponsor\'s statement, and then the sections are complete', () => {
    const m = assembleIndAnnualReport(base({ noSafetyReportsInPeriod: true, noIbChangesInPeriod: true }));
    const reports = section(m, 'ind_safety_reports_list');
    const ib = section(m, 'ib_changes');
    expect(reports.body).toBe('No IND Safety Reports were submitted during the period.');
    expect(reports.complete).toBe(true);
    expect(ib.body).toBe("No revisions to the Investigator's Brochure were made during the period.");
    expect(ib.complete).toBe(true);
    expect(m.gaps.map((g) => g.sectionKey)).not.toContain('ind_safety_reports_list');
    expect(m.gaps.map((g) => g.sectionKey)).not.toContain('ib_changes');
    // With the register stated empty, the count of zero is a fact.
    expect(section(m, 'summary_safety_information').body).toContain('IND Safety Reports filed in period: 0 (7-day: 0, 15-day: 0).');
  });

  it('listed entries are listed, complete, and counted', () => {
    const m = assembleIndAnnualReport(
      base({
        safetyReportsInPeriod: [
          {
            reportId: 'SR-1',
            obligation: 'FIFTEEN_DAY',
            reactionPt: 'Hepatic failure',
            seriousnessCriteria: 'hospitalization',
            submittedAt: new Date('2025-09-01T00:00:00.000Z'),
          },
        ],
        ibChanges: [{ ibVersion: '4.0', effectiveDate: new Date('2025-10-01T00:00:00.000Z'), summary: 'Updated RSI.' }],
      }),
    );
    expect(section(m, 'ind_safety_reports_list').body).toContain('SR-1 [FIFTEEN_DAY] Hepatic failure');
    expect(section(m, 'ind_safety_reports_list').complete).toBe(true);
    expect(section(m, 'ib_changes').body).toContain('IB 4.0 (effective 2025-10-01): Updated RSI.');
    expect(section(m, 'ib_changes').complete).toBe(true);
    expect(section(m, 'summary_safety_information').body).toContain('IND Safety Reports filed in period: 1 (7-day: 0, 15-day: 1).');
  });
});
