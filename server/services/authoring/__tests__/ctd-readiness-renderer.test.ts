/**
 * CTD readiness PDF renderer — produces valid, deterministic PDF bytes from a
 * rollup verdict.
 */

import { describe, it, expect } from 'vitest';
import { renderCtdReadinessPdf, readinessVerdict } from '../ctd-readiness-renderer';
import { aggregateCtdAuthoringReadiness } from '../ctd-authoring-readiness';
import { runM2SummaryQc } from '../m2-summary-qc';
import type { M4QcResult } from '../m4-nonclinical-qc';

const ready = aggregateCtdAuthoringReadiness({ m2: {
  ready: true, checked: ['2.3'], missingSummaries: [], completenessByKey: { '2.3': 60 },
  findings: [{ summaryKey: '2.3', severity: 'warning', code: 'LOW_COMPLETENESS', message: '2.3 completeness 60%.' }],
  counts: { errors: 0, warnings: 1 },
} });

const notReady = aggregateCtdAuthoringReadiness({ m4: {
  ready: false, assessed: true, checked: ['STUDY-1'], disciplinesPresent: [], missingCoverage: [],
  findings: [{ studyId: 'STUDY-1', severity: 'error', code: 'SECTION_MISSING', message: 'Study STUDY-1 has a missing section.' }],
  counts: { errors: 1, warnings: 0 },
} as M4QcResult });

describe('renderCtdReadinessPdf', () => {
  it('renders valid PDF bytes', async () => {
    const pdf = await renderCtdReadinessPdf(ready);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('is deterministic for the same verdict', async () => {
    const a = await renderCtdReadinessPdf(ready);
    const b = await renderCtdReadinessPdf(ready);
    expect(a.equals(b)).toBe(true);
  });

  it('renders a not-ready verdict without throwing', async () => {
    const pdf = await renderCtdReadinessPdf(notReady);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('handles an empty rollup (no modules / findings) — and never calls it ready', async () => {
    const empty = aggregateCtdAuthoringReadiness({});
    const pdf = await renderCtdReadinessPdf(empty);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // The verdict used to be "READY — no blocking findings" over nothing assessed.
    expect(readinessVerdict(empty)).toMatch(/^NOT ASSESSED/);
    expect(readinessVerdict(empty)).not.toMatch(/READY — no blocking/);
    expect(readinessVerdict(ready)).toBe('SUPPLIED QC — assessed inputs have no blocking findings');
    expect(readinessVerdict(notReady)).toBe('SUPPLIED QC — blocking findings present');
  });
});

describe('supplied QC scope in the actual PDF', () => {
  it('prints partial input, omitted M3 and unverified basis without an overall READY label', async () => {
    const moduleQc = runM2SummaryQc({
      summaries: [{
        sectionKey: '2.3', title: 'Quality Overall Summary', narrative: 'Supplied summary for the QC report fixture.',
        tables: [], inputSectionKeys: ['3.2.S'], completeness: 100, gaps: [], generatedAt: new Date(0).toISOString(),
      }],
      expectedSummaries: ['2.3'], availableUpstreamKeys: ['3.2.S'],
    });
    const result = aggregateCtdAuthoringReadiness({ m2: moduleQc });
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({ data: new Uint8Array(await renderCtdReadinessPdf(result)), useSystemFonts: true }).promise;
    try {
      const lines: string[] = [];
      for (let page = 1; page <= doc.numPages; page++) {
        const content = await (await doc.getPage(page)).getTextContent();
        lines.push(...content.items.flatMap((item) => 'str' in item ? [item.str] : []));
      }
      const text = lines.join(' ').replace(/\s+/g, ' ');
      expect(text).toContain('Supplied Module QC Report');
      expect(text).toContain('Caller-supplied, unverified');
      expect(text).toContain('Full dossier readiness: NOT ASSESSED');
      expect(text).toContain('M3: not assessed');
      expect(text).toContain('Assessed modules: M2');
      expect(text).toContain('Scientific approval: NOT ASSESSED');
      expect(text).toContain('Dispatch readiness: NOT ASSESSED');
      expect(text).toContain('Report qualification: NOT ESTABLISHED');
      expect(text).not.toContain('READY');
    } finally {
      await doc.destroy();
    }
  });
});
