/**
 * Module 2 summary → PDF rendering. Pure (no DB/AI): proves an M2Summary maps to
 * renderer sections (narrative + tables + gaps) and renders to a valid,
 * navigable, deterministic PDF.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { m2SummaryToSections, renderM2SummaryPdf } from '../m2-summary-renderer';
import type { M2Summary } from '../../m2-summary-builders';

function summary(overrides: Partial<M2Summary> = {}): M2Summary {
  return {
    sectionKey: '2.5',
    title: 'Clinical Overview',
    narrative: 'Benefit–risk assessment of the investigational product.',
    tables: [
      { title: 'Efficacy Summary', headers: ['Endpoint', 'Result'], rows: [['ORR', '42%'], ['PFS', '7.1 mo']] },
    ],
    inputSectionKeys: ['2.7'],
    completeness: 80,
    gaps: ['2.7.4 efficacy summary missing'],
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('m2SummaryToSections', () => {
  it('produces a narrative section, one section per table, and a gaps section', () => {
    const sections = m2SummaryToSections(summary());
    expect(sections[0]).toMatchObject({ heading: 'Clinical Overview', sectionCode: '2.5' });
    expect(sections.some((s) => s.heading === 'Efficacy Summary')).toBe(true);
    expect(sections.some((s) => s.heading === 'Outstanding Data Gaps')).toBe(true);
    // The table body carries the header and a data row.
    const table = sections.find((s) => s.heading === 'Efficacy Summary')!;
    expect(table.body).toContain('Endpoint');
    expect(table.body).toContain('ORR');
  });

  it('omits the gaps section when there are no gaps', () => {
    const sections = m2SummaryToSections(summary({ gaps: [] }));
    expect(sections.some((s) => s.heading === 'Outstanding Data Gaps')).toBe(false);
  });
});

describe('renderM2SummaryPdf', () => {
  it('renders a valid, navigable, deterministic PDF', async () => {
    const a = await renderM2SummaryPdf(summary());
    const b = await renderM2SummaryPdf(summary());
    expect(a.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(a.toString('latin1')).toContain('/Outlines');
    expect(a.equals(b)).toBe(true); // deterministic
    const reloaded = await PDFDocument.load(a);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
