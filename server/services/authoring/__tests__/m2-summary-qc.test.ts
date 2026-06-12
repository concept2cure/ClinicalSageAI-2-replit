/**
 * Module 2 cross-summary QC — presence, traceability, content, completeness,
 * gaps, structure, and the honest-by-construction verdict.
 */

import { describe, it, expect } from 'vitest';
import { runM2SummaryQc } from '../m2-summary-qc';
import type { M2Summary } from '../../m2-summary-builders';

function summary(over: Partial<M2Summary> & { sectionKey: string }): M2Summary {
  return {
    title: `Module ${over.sectionKey}`,
    narrative: 'A substantive narrative.',
    tables: [],
    inputSectionKeys: ['3.2.S.1'],
    completeness: 100,
    gaps: [],
    generatedAt: new Date(0).toISOString(),
    ...over,
  };
}

const fullSet = (): M2Summary[] => [
  summary({ sectionKey: '2.3', inputSectionKeys: ['3.2.S.1', '3.2.P.1'] }),
  summary({ sectionKey: '2.4', inputSectionKeys: ['m4.2.3.2/tox-1'] }),
  summary({ sectionKey: '2.5', inputSectionKeys: ['m5.3.5/STUDY-1'] }),
  summary({ sectionKey: '2.7', inputSectionKeys: ['m5.3.5/STUDY-1'] }),
];

describe('runM2SummaryQc — verdict', () => {
  it('ready when all expected summaries are present, traceable, and complete', () => {
    const res = runM2SummaryQc({ summaries: fullSet() });
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.checked).toEqual(['2.3', '2.4', '2.5', '2.7']);
    expect(res.missingSummaries).toEqual([]);
  });
});

describe('runM2SummaryQc — presence', () => {
  it('flags a missing expected summary as an error and not ready', () => {
    const res = runM2SummaryQc({ summaries: fullSet().filter((s) => s.sectionKey !== '2.7') });
    expect(res.ready).toBe(false);
    expect(res.missingSummaries).toEqual(['2.7']);
    expect(res.findings.some((f) => f.code === 'PRESENCE' && f.summaryKey === '2.7')).toBe(true);
  });

  it('honors a custom expected set', () => {
    const res = runM2SummaryQc({ summaries: [summary({ sectionKey: '2.3' })], expectedSummaries: ['2.3'] });
    expect(res.ready).toBe(true);
  });
});

describe('runM2SummaryQc — traceability', () => {
  it('errors when a summary declares no upstream inputs', () => {
    const set = fullSet();
    set[0] = summary({ sectionKey: '2.3', inputSectionKeys: [] });
    const res = runM2SummaryQc({ summaries: set });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'TRACEABILITY' && f.summaryKey === '2.3')).toBe(true);
  });

  it('errors on an orphan input when the upstream key set is supplied', () => {
    const res = runM2SummaryQc({
      summaries: [summary({ sectionKey: '2.3', inputSectionKeys: ['3.2.S.1', '3.2.GHOST'] })],
      expectedSummaries: ['2.3'],
      availableUpstreamKeys: ['3.2.S.1', '3.2.P.1'],
    });
    expect(res.ready).toBe(false);
    const orphan = res.findings.find((f) => f.code === 'ORPHAN_INPUT');
    expect(orphan?.message).toContain('3.2.GHOST');
  });

  it('passes traceability when all declared inputs exist upstream', () => {
    const res = runM2SummaryQc({
      summaries: [summary({ sectionKey: '2.3', inputSectionKeys: ['3.2.S.1'] })],
      expectedSummaries: ['2.3'],
      availableUpstreamKeys: ['3.2.S.1', '3.2.P.1'],
    });
    expect(res.findings.some((f) => f.code === 'ORPHAN_INPUT')).toBe(false);
  });
});

describe('runM2SummaryQc — content, completeness, gaps, structure', () => {
  it('errors on an empty narrative', () => {
    const res = runM2SummaryQc({ summaries: [summary({ sectionKey: '2.3', narrative: '   ' })], expectedSummaries: ['2.3'] });
    expect(res.findings.some((f) => f.code === 'CONTENT')).toBe(true);
    expect(res.ready).toBe(false);
  });

  it('warns (not error) on low completeness, staying ready', () => {
    const res = runM2SummaryQc({ summaries: [summary({ sectionKey: '2.3', completeness: 60 })], expectedSummaries: ['2.3'], minCompleteness: 80 });
    expect(res.ready).toBe(true); // warnings do not block
    expect(res.counts.warnings).toBeGreaterThanOrEqual(1);
    expect(res.findings.some((f) => f.code === 'LOW_COMPLETENESS')).toBe(true);
    expect(res.completenessByKey['2.3']).toBe(60);
  });

  it('surfaces each builder-reported gap as a warning', () => {
    const res = runM2SummaryQc({
      summaries: [summary({ sectionKey: '2.3', gaps: ['3.2.S.4 controls of drug substance', '3.2.P.5 controls of drug product'] })],
      expectedSummaries: ['2.3'],
    });
    expect(res.findings.filter((f) => f.code === 'GAP')).toHaveLength(2);
  });

  it('errors on a duplicate section key', () => {
    const res = runM2SummaryQc({
      summaries: [summary({ sectionKey: '2.3' }), summary({ sectionKey: '2.3' })],
      expectedSummaries: ['2.3'],
    });
    expect(res.findings.some((f) => f.code === 'DUPLICATE')).toBe(true);
    expect(res.ready).toBe(false);
  });
});
