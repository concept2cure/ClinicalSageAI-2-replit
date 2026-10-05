/**
 * The stability sections file the right study's claims and the data behind
 * them (discovery map 2026-10-04: p8-reads-drug-substance-stability,
 * stability-data-never-filed).
 *
 *   1. §3.2.P.8 read shelf life, storage condition and time points with a
 *      first-match over EVERY stability source, drug-substance studies
 *      included, newest first — so recording a drug-substance retest study
 *      filed its "-20C" and "6 months retest" as the drug product's shelf life.
 *   2. Neither §3.2.S.7 nor §3.2.P.8 tabulated the recorded pull-point
 *      results. Their narratives counted the results and cited "the stability
 *      data summarized above", and placement files the composition verbatim,
 *      so the leaf claimed conformance over data it did not contain. §3.2.S.7's
 *      matrix rendered the register's list of test NAMES as one-cell rows
 *      under a six-column header.
 */
import { describe, expect, it } from 'vitest';
import { composeModule3FromCanonicalSources } from '../module3Composer';

let n = 0;
const src = (sourceType: string, sourcePayload: Record<string, unknown>) => ({
  id: `s${++n}`,
  sourceType,
  sourcePayload,
  sourceHash: `h${n}`,
});

const DP_STUDY = src('stability', {
  stabilityScope: 'drug_product',
  studyName: 'DP long-term',
  storageCondition: '25C/60%RH',
  timePoints: ['0', '3', '6'],
  shelfLifeClaim: '24 months',
  drugProductShelfLifeClaim: '24 months',
  batchesStudied: ['DP-001'],
  testParameters: ['assay', 'degradants'],
  stabilityParameters: ['assay', 'degradants'],
  results: [
    { timePoint: '0', parameter: 'assay', result: '99.8', specification: '95.0-105.0%' },
    { timePoint: '3', parameter: 'assay', result: '99.1', specification: '95.0-105.0%' },
    { timePoint: '6', parameter: 'assay', result: '98.7', specification: '95.0-105.0%' },
    { timePoint: '6', parameter: 'degradants', result: '0.21', specification: 'NMT 0.5%' },
  ],
});
// Recorded AFTER the product study, so it comes first in the newest-first order
// the compile reads sources in.
const DS_STUDY = src('stability', {
  stabilityScope: 'drug_substance',
  studyName: 'DS retest study',
  storageCondition: '-20C',
  timePoints: ['0', '1', '3'],
  shelfLifeClaim: '6 months retest',
  drugSubstanceTimePoints: ['0', '1', '3'],
  drugSubstanceStorageCondition: '-20C',
  batchesStudied: ['DS-007'],
  testParameters: ['assay', 'water'],
  stabilityParameters: ['assay', 'water'],
  results: [
    { timePoint: '0', parameter: 'assay', result: '100.2', specification: '98.0-102.0%' },
    { timePoint: '3', parameter: 'water', result: '0.4', specification: 'NMT 1.0%' },
  ],
});

const sections = composeModule3FromCanonicalSources([DS_STUDY, DP_STUDY] as any);
const s7 = sections.find((s) => s.sectionKey === '3.2.S.7')!;
const p8 = sections.find((s) => s.sectionKey === '3.2.P.8')!;
const rowsOf = (section: typeof s7, title: RegExp) => section.tables.find((t) => title.test(t.title));

describe('§3.2.P.8 states the drug product study, not the drug substance one', () => {
  it('files the product study’s condition, time points and shelf life', () => {
    expect(p8.narrativeDraft).toContain('25C/60%RH');
    expect(p8.narrativeDraft).toContain('24 months');
    expect(p8.narrativeDraft).not.toContain('-20C');
    expect(p8.narrativeDraft).not.toContain('6 months retest');
    const summary = rowsOf(p8, /Stability Summary/)!;
    expect(summary.rows).toContainEqual(['Shelf Life Claim', '24 months']);
    expect(summary.rows).toContainEqual(['Storage Condition', '25C/60%RH']);
  });
});

describe('the recorded stability results are filed with the section that cites them', () => {
  it('§3.2.P.8 tabulates every product pull point, and none of the substance’s', () => {
    const results = rowsOf(p8, /Stability Results/);
    expect(results, 'a results table').toBeDefined();
    expect(results!.rows).toHaveLength(4);
    expect(results!.rows.map((r) => r.join(' | '))).toContain('DP-001 | 25C/60%RH | degradants | 6 | 0.21 | NMT 0.5% | within');
    expect(results!.rows.flat()).not.toContain('DS-007');
  });

  it('§3.2.S.7 tabulates the substance’s pull points', () => {
    const results = rowsOf(s7, /Stability Results/);
    expect(results, 'a results table').toBeDefined();
    expect(results!.rows).toHaveLength(2);
    expect(results!.rows.flat()).toContain('DS-007');
    expect(results!.rows.flat()).not.toContain('DP-001');
  });

  it('does not render a list of test names as a data matrix of one-cell rows', () => {
    for (const t of s7.tables) {
      for (const row of t.rows) expect(row.length, `${t.title}: ${row.join(',')}`).toBe(t.headers.length);
    }
  });

  it('never cites data "summarized above" that the section does not carry', () => {
    expect(p8.narrativeDraft).not.toMatch(/summarized above/);
    expect(s7.narrativeDraft).not.toMatch(/summarized above/);
  });
});
