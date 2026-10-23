/**
 * An FDA periodic report whose type is not recorded is not labelled a PADER.
 *
 * What renewalReportLabel used to do (until 2026-10-15): an unclassified FDA
 * 'periodic_report' obligation read 'PADER' (21 CFR 314.80(c)(2)). An FDA
 * periodic safety report may equally be a PSUR/PBRER submitted in its place, or
 * a device/biologic report; nothing on the row says which.
 */
import { describe, expect, it } from 'vitest';
import { renewalReportLabel } from '../lifecycle-logic';

describe('renewalReportLabel — FDA periodic_report', () => {
  it('says the type is not recorded when the row does not classify it', () => {
    expect(renewalReportLabel('periodic_report', 'fda', null)).toBe('Periodic safety report (type not recorded)');
  });
  it('uses the recorded classification when there is one', () => {
    expect(renewalReportLabel('periodic_report', 'fda', 'PADER')).toBe('PADER');
  });
});
