/**
 * CTD authoring-readiness report → PDF.
 *
 * Renders the cross-module readiness rollup (`aggregateCtdAuthoringReadiness`)
 * into a navigable, deterministic inspector report an RA lead can attach to a
 * filing checklist: an overall verdict, a per-module status table, and the
 * findings grouped by area. Reuses the deterministic structured-leaf renderer,
 * so identical verdicts render to byte-identical PDFs.
 *
 * @module server/services/authoring/ctd-readiness-renderer
 */

import { renderStructuredLeafPdf, type LeafSection } from '../ectd/leaf-pdf-renderer';
import type { CtdAuthoringReadinessResult, CtdReadinessFinding } from './ctd-authoring-readiness';

function findingsBlock(findings: CtdReadinessFinding[]): string {
  if (findings.length === 0) return 'No findings.';
  return findings
    .map((f) => `[${f.severity.toUpperCase()}] (${f.area} · ${f.code}) ${f.message}`)
    .join('\n');
}

/** The report's overall verdict. Nothing assessed is not "no blocking findings". */
export function readinessVerdict(result: CtdAuthoringReadinessResult): string {
  if (!result.assessed) return 'NOT ASSESSED — no module QC verdict was supplied; nothing here says the filing is ready';
  return result.ready ? 'READY — no blocking findings' : 'NOT READY — blocking findings present';
}

/** Render a CTD authoring-readiness rollup to a PDF report. Deterministic. */
export async function renderCtdReadinessPdf(result: CtdAuthoringReadinessResult): Promise<Buffer> {
  const verdict = readinessVerdict(result);

  const moduleLines = result.modules
    .map((m) => {
      const state = !m.present ? 'absent' : m.ready ? 'ready' : 'NOT ready';
      return `${m.module}: ${state} (errors ${m.errors}, warnings ${m.warnings})`;
    })
    .join('\n');

  // Group findings by area for the detail section.
  const byArea = new Map<string, CtdReadinessFinding[]>();
  for (const f of result.findings) {
    byArea.set(f.area, [...(byArea.get(f.area) ?? []), f]);
  }

  const sections: LeafSection[] = [
    {
      heading: 'Overall Verdict',
      sectionCode: '1',
      body: [
        verdict,
        `Errors: ${result.counts.errors}    Warnings: ${result.counts.warnings}`,
      ].join('\n'),
    },
    {
      heading: 'Module Status',
      sectionCode: '2',
      body: moduleLines || 'No modules evaluated.',
    },
    {
      heading: 'Findings',
      sectionCode: '3',
      body: result.findings.length === 0 ? 'No findings.' : '',
      children:
        byArea.size === 0
          ? undefined
          : [...byArea.entries()].map(([area, fs], i) => ({
              heading: area,
              sectionCode: `3.${i + 1}`,
              body: findingsBlock(fs),
            })),
    },
  ];

  return renderStructuredLeafPdf(sections, {
    title: 'CTD Authoring-Readiness Report',
    sectionCode: 'qc',
  });
}
