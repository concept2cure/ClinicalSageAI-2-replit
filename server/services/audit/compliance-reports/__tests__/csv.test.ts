/**
 * A compliance report as one CSV file: for each section a `# <title>` line,
 * the header row, the rows, then a blank line. A cell that a spreadsheet would
 * run as a formula is neutralised the way the signed audit export neutralises
 * it (signedAuditExport.ts sanitizeCsvValue — reused, not copied).
 */
import { describe, expect, it } from 'vitest';

import { formatReportCsv } from '../csv';
import type { ReportData } from '../types';

function report(sections: ReportData['sections']): ReportData {
  return {
    report: { id: 'access-review', title: 'User access review', version: 1 },
    organizationId: 7,
    period: { from: null, to: '2026-09-30', kind: 'as-of' },
    generatedAt: '2026-09-30T12:00:00.000Z',
    chain: {
      ok: null,
      scope: 'not-checked',
      reason: 'This report does not verify the audit chain. The audit trail integrity attestation does.',
    },
    sections,
    notRecorded: [],
  };
}

const members = {
  key: 'members',
  title: 'Members',
  columns: [
    { key: 'user_id', label: 'User id' },
    { key: 'name', label: 'Name' },
    { key: 'mfa', label: 'Second factor' },
  ],
  rows: [
    { user_id: 1, name: 'Ada, Countess', mfa: true },
    { user_id: 2, name: 'Say "hi"', mfa: null },
  ],
  rowCount: 2,
  truncated: false,
};

describe('formatReportCsv', () => {
  it('writes each section as a titled block: title line, header, rows, blank line', () => {
    const csv = formatReportCsv(
      report([
        members,
        { key: 'privileged', title: 'Privileged members', columns: members.columns, rows: [], rowCount: 0, truncated: false },
      ]),
    );
    const lines = csv.split('\n');
    expect(lines.slice(lines.indexOf('# Members'))).toEqual([
      '# Members',
      '"User id","Name","Second factor"',
      '"1","Ada, Countess","true"',
      '"2","Say ""hi""",""',
      '',
      '# Privileged members',
      '"User id","Name","Second factor"',
      '',
    ]);
  });

  it.each(['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'neutralises a formula-leading cell %j with a leading quote',
    (value) => {
      const csv = formatReportCsv(
        report([{ ...members, rows: [{ user_id: 3, name: value, mfa: false }], rowCount: 1 }]),
      );
      const lines = csv.split('\n');
      const row = lines[lines.indexOf('# Members') + 2];
      expect(row.startsWith(`"3","'`)).toBe(true);
    },
  );

  it('writes a date as its UTC ISO instant and an object as JSON', () => {
    const csv = formatReportCsv(
      report([
        {
          key: 'x',
          title: 'X',
          columns: [
            { key: 'at', label: 'At' },
            { key: 'detail', label: 'Detail' },
          ],
          rows: [{ at: new Date('2026-09-01T10:00:00.000Z'), detail: { a: 1 } }],
          rowCount: 1,
          truncated: false,
        },
      ]),
    );
    const lines = csv.split('\n');
    expect(lines[lines.indexOf('# X') + 2]).toBe('"2026-09-01T10:00:00.000Z","{""a"":1}"');
  });

  it('writes only the declared columns, in their declared order', () => {
    const csv = formatReportCsv(
      report([{ ...members, rows: [{ mfa: true, extra: 'not a column', name: 'B', user_id: 9 }], rowCount: 1 }]),
    );
    const lines = csv.split('\n');
    expect(lines[lines.indexOf('# Members') + 2]).toBe('"9","B","true"');
    expect(csv).not.toContain('not a column');
  });

  it('opens with a block saying what the file is: report, organisation, period, time, chain, sections and what is not recorded', () => {
    const data = report([
      { ...members, notes: ['Read as it is now.'] },
      { key: 'privileged', title: 'Privileged members', columns: members.columns, rows: [], rowCount: 0, truncated: true },
    ]);
    data.notRecorded = ['Removals, role changes and =HYPERLINK("x") are not recorded.'];
    const lines = formatReportCsv(data).split('\n');
    const block = lines.slice(0, lines.indexOf('# Members'));
    expect(block).toEqual([
      '"# User access review"',
      '"# Report: access-review, version 1"',
      '"# Organisation: 7"',
      '"# Period: as of 2026-09-30"',
      '"# Generated at: 2026-09-30T12:00:00.000Z"',
      '"# Audit chain: not checked. This report does not verify the audit chain. The audit trail integrity attestation does."',
      '"# Section Members: 2 rows, complete"',
      '"# Section Members note: Read as it is now."',
      '"# Section Privileged members: 0 rows, truncated at the row limit"',
      '"# Not recorded: Removals, role changes and =HYPERLINK(""x"") are not recorded."',
      '',
    ]);
  });

  it('states a range period and a verified chain in the block', () => {
    const data = report([members]);
    data.period = { from: '2026-09-01', to: '2026-09-30', kind: 'range' };
    data.chain = { ok: true, scope: 'integrity-checks', rowsChecked: 4, checks: { total: 3, intact: 3, broken: 0, notVerified: 0 } };
    const lines = formatReportCsv(data).split('\n');
    expect(lines).toContain('"# Period: 2026-09-01 to 2026-09-30"');
    expect(lines).toContain('"# Audit chain: verified (3 of 3 checks intact)."');
  });
});
