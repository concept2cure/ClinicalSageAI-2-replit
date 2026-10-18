import { describe, expect, it } from 'vitest';
import { buildCSRTables } from '../csr-tabulation-builders.js';
import { sourceFixture } from '../csr/__tests__/source-input-fixture.js';

describe('CSR descriptive tabulation correctness', () => {
  it('uses sample SD and represents one-subject variability as unknown', () => {
    const tables = buildCSRTables(sourceFixture().studyData);
    expect(tables.demographics.rows.find(row => row[0].startsWith('Age'))).toEqual(['Age, mean (SD) [yr]', '35.0 (7.1)', '50.0 (—)']);
  });
  it('includes Other in sex counts and screen failure in disposition', () => {
    const source = sourceFixture().studyData;
    source.disposition.push({ subjectId: 'synthetic-screen', armId: 'B', status: 'screen-failed' });
    const tables = buildCSRTables(source);
    expect(tables.demographics.rows.find(row => row[0].startsWith('Sex'))?.[1]).toBe('0 (0%) M / 1 (50%) F / 1 (50%) Other');
    expect(tables.disposition.rows.find(row => row[0] === 'Screen failure')).toEqual(['Screen failure', '0', '1', '1']);
  });
  it('counts unique AE subjects, preserves recorded efficacy, and does not label fatal AEs as all study deaths', () => {
    const source = sourceFixture().studyData;
    source.adverseEvents[0].outcome = 'fatal'; source.adverseEvents[1].outcome = 'fatal';
    const tables = buildCSRTables(source);
    expect(tables.aeOverallSummary.rows[0]).toEqual(['Any AE, n (%)', '1 (50.0%)', '0 (0.0%)']);
    expect(tables.primaryEfficacy.rows[0][2]).toBe('2.5 recorded units');
    expect(tables.primaryEfficacy.rows[0][4]).toBe('0.031');
    expect(tables.deathsSAEsDiscontinuations.rows[0]).toEqual(['Subjects with fatal AEs, n', '1', '0']);
    expect(JSON.stringify(tables)).not.toContain('synthetic-a');
  });
  it('does not count baseline-abnormal lab subjects as staying normal', () => {
    const source = sourceFixture().studyData;
    source.labShifts = [{ armId: 'A', parameter: 'ALT', totalAssessed: 10, shiftFromNormal: 6, shiftToHigh: 2, shiftToLow: 1 }];
    const table = buildCSRTables(source).labShifts!;
    expect(table.headers).toContain('Baseline Normal');
    expect(table.rows[0]).toEqual(['ALT', 'Synthetic treatment', '10', '6', '2 (33.3%)', '1 (16.7%)', '3 (50.0%)']);
  });
  it('keeps optional population totals unknown when an arm denominator is unrecorded', () => {
    const source = sourceFixture().studyData;
    source.treatmentArms[0].populations.mitt = 1;
    source.treatmentArms[0].populations.perProtocol = 1;
    const table = buildCSRTables(source).analysisPopulations;
    expect(table.rows.find(row => row[0] === 'mITT')).toEqual(['mITT', '1', '—', '—']);
    expect(table.rows.find(row => row[0] === 'Per-Protocol')).toEqual(['Per-Protocol', '1', '—', '—']);
  });
  it('keeps AE percentages unknown for an arm with no safety participants', () => {
    const source = sourceFixture().studyData; source.treatmentArms[1].populations.safety = 0;
    const tables = buildCSRTables(source);
    expect(tables.aeOverallSummary.rows[0]).toEqual(['Any AE, n (%)', '1 (50.0%)', '0 (—)']);
    expect(tables.aeBySOC.rows[0][2]).toBe('0 (—)');
    expect(tables.aeTopPT.rows[0][2]).toBe('0 (—)');
  });
});
