/**
 * Module 2 CTD summary → submission-ready PDF leaf.
 *
 * Renders an M2Summary (2.3 QOS / 2.4 Nonclinical Overview / 2.5 Clinical
 * Overview / 2.7 Clinical Summary, produced by m2-summary-builders) to a real,
 * navigable, deterministic PDF via the structured leaf renderer — turning the
 * built summary into an actual eCTD leaf with page-accurate bookmarks (the
 * narrative, each generated table, and any outstanding data gaps).
 *
 * Pure / deterministic: identical summaries render to byte-identical PDFs.
 */

import { renderStructuredLeafPdf, type LeafSection } from '../ectd/leaf-pdf-renderer';
import type { M2Summary } from '../m2-summary-builders';
import type { GeneratedTable } from '../module3Composer';

/** Render a generated table as a fixed-width-ish text block (heads + rows). */
function tableToText(table: GeneratedTable): string {
  const head = table.headers.join('  |  ');
  const sep = table.headers.map(() => '---').join('  |  ');
  const rows = table.rows.map((r) => r.join('  |  '));
  return [head, sep, ...rows].join('\n');
}

/** Map an M2Summary onto renderer sections: narrative, one per table, then gaps. */
export function m2SummaryToSections(summary: M2Summary): LeafSection[] {
  const sections: LeafSection[] = [
    {
      heading: summary.title,
      sectionCode: summary.sectionKey,
      body: summary.narrative && summary.narrative.length > 0 ? summary.narrative : '[Narrative not yet composed.]',
    },
  ];
  for (const table of summary.tables) {
    sections.push({ heading: table.title, body: tableToText(table) });
  }
  if (summary.gaps.length > 0) {
    sections.push({
      heading: 'Outstanding Data Gaps',
      body: summary.gaps.map((g) => `• ${g}`).join('\n'),
    });
  }
  return sections;
}

/** Render an M2 CTD summary to a navigable PDF leaf. */
export async function renderM2SummaryPdf(summary: M2Summary): Promise<Buffer> {
  return renderStructuredLeafPdf(m2SummaryToSections(summary), {
    title: summary.title,
    sectionCode: summary.sectionKey,
  });
}
