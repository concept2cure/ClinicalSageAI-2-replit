/**
 * Supplied CTD module QC report → PDF.
 *
 * Renders the cross-module readiness rollup (`aggregateCtdAuthoringReadiness`)
 * into a deterministic report with an explicit caller-supplied, unverified
 * basis, a per-module QC table and findings grouped by area. A filing checklist
 * attachment is not qualified evidence of full dossier or agency readiness.
 * Reuses the deterministic structured-leaf renderer,
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
  if (result.suppliedQc.status === 'NOT_ASSESSED') return 'NOT ASSESSED — no supplied module QC claims an assessment';
  return result.suppliedQc.status === 'NO_BLOCKING_FINDINGS'
    ? 'SUPPLIED QC — assessed inputs have no blocking findings'
    : 'SUPPLIED QC — blocking findings present';
}

/** Render a CTD authoring-readiness rollup to a PDF report. Deterministic. */
export async function renderCtdReadinessPdf(result: CtdAuthoringReadinessResult): Promise<Buffer> {
  const verdict = readinessVerdict(result);

  const moduleLines = result.modules
    .map((m) => {
      const state = !m.assessed ? 'not assessed' : m.errors > 0 ? 'supplied QC has blocking findings' : m.ready ? 'supplied QC has no blocking findings' : 'supplied QC has no passing verdict';
      const references = m.checkedReferences === null ? 'not supplied' : m.checkedReferences.join(', ') || 'none';
      return `${m.module}: ${state} (errors ${m.errors}, warnings ${m.warnings})\nCaller-declared checked references: ${references}`;
    })
    .join('\n');

  // Group findings by area for the detail section.
  const byArea = new Map<string, CtdReadinessFinding[]>();
  for (const f of result.findings) {
    byArea.set(f.area, [...(byArea.get(f.area) ?? []), f]);
  }

  const sections: LeafSection[] = [
    {
      heading: 'Supplied QC Verdict and Scope',
      sectionCode: '1',
      body: [
        verdict,
        'Basis: Caller-supplied, unverified QC verdicts and reference sets.',
        `Supplied modules: ${result.scope.suppliedModules.join(', ') || 'none'}`,
        `Assessed modules: ${result.scope.assessedModules.join(', ') || 'none'}`,
        `Omitted modules: ${result.scope.omittedModules.join(', ') || 'none'}`,
        `Unassessed modules: ${result.scope.unassessedModules.join(', ') || 'none'}`,
        'Full dossier readiness: NOT ASSESSED',
        'Scientific approval: NOT ASSESSED',
        'Dispatch readiness: NOT ASSESSED',
        'Report qualification: NOT ESTABLISHED',
        `Errors: ${result.counts.errors}    Warnings: ${result.counts.warnings}`,
        ...result.scope.limitations,
      ].join('\n'),
    },
    {
      heading: 'Supplied Module QC Status',
      sectionCode: '2',
      body: moduleLines || 'No modules evaluated.',
    },
    {
      heading: 'Supplied Reference Checks',
      sectionCode: '3',
      body: result.feedForward.map((check) => `${check.area}: ${check.status.replaceAll('_', ' ')} (${check.checkedCitations} citation(s) checked)`).join('\n'),
    },
    {
      heading: 'Findings',
      sectionCode: '4',
      body: result.findings.length === 0 ? 'No findings.' : '',
      children:
        byArea.size === 0
          ? undefined
          : [...byArea.entries()].map(([area, fs], i) => ({
              heading: area,
              sectionCode: `4.${i + 1}`,
              body: findingsBlock(fs),
            })),
    },
  ];

  return renderStructuredLeafPdf(sections, {
    title: 'CTD Supplied Module QC Report',
    sectionCode: 'qc',
  });
}
