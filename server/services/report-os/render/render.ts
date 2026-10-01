/**
 * Pure report renderer for Report-OS.
 *
 * Turns an already-computed report run into a structured, provenance-linked
 * document model. Render-target-agnostic, deterministic, and side-effect-free
 * except for the default `generatedAt` timestamp. No DB, no IO.
 */

import type { ReportRunStatus, TruthfulnessEvaluation } from '../truthfulness';
import type { ReportBlock, ReportSection, RenderedReport } from './types';

/**
 * Inputs to {@link renderReport}. Mirrors the shape produced by the
 * orchestrator's run computation plus report-type and truthfulness context.
 */
export interface RenderInput {
  reportTypeId: string;
  reportTypeLabel: string;
  scopeType: string;
  scopeId: string;
  providers: Array<{
    provider: string;
    observedAt: string;
    status: 'ready' | 'partial' | 'missing';
    blocker?: string | null;
  }>;
  confidence: number;
  blockers: string[];
  summary: Record<string, unknown>;
  status: ReportRunStatus;
  truthfulness?: TruthfulnessEvaluation;
  generatedAt?: string;
}

/**
 * Narrow an unknown record value to a plain object, or undefined.
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Render a computed report run into a structured document model.
 *
 * Pure and deterministic given a fixed `generatedAt`. Sections are built
 * generically so the renderer works for any report type.
 */
/**
 * Whether a gap evaluation ran for this run. The regional gap evaluation sets
 * `summary.regulatory.missingArtifacts` (orchestrator.ts, project scope with a
 * registry); any other scope has none. An empty list is "no gaps"; no list is
 * "not evaluated", and the two may never print the same sentence.
 */
export function gapsWereEvaluated(summary: Record<string, unknown> | null | undefined): boolean {
  const regulatory = asRecord(summary?.regulatory);
  return Array.isArray(regulatory?.missingArtifacts);
}

/**
 * The gaps section: the evaluation's gaps, "no gaps" when an evaluation ran and
 * found none, or "not evaluated" when none ran.
 */
function gapsSectionFor(summary: Record<string, unknown>, generatedAt: string): ReportSection {
  const missingArtifacts = asRecord(summary.regulatory)?.missingArtifacts;
  if (Array.isArray(missingArtifacts) && missingArtifacts.length > 0) {
    return {
      id: 'gaps',
      title: 'Gaps',
      blocks: [
        {
          kind: 'gap-list',
          items: missingArtifacts.map(artifact => ({
            title: String(artifact),
            severity: 'high',
          })),
        },
      ],
    };
  }
  if (gapsWereEvaluated(summary)) {
    return {
      id: 'gaps',
      title: 'Gaps',
      blocks: [
        { kind: 'gap-list', items: [] },
        { kind: 'summary', text: `No gaps detected as of ${generatedAt}.` },
      ],
    };
  }
  /* "No gaps detected" printed for every scope no gap evaluation covers (every
     program-scoped canvas report among them), and sealed in final records
     (reporting review 2026-10-01). Nothing was checked; say so. */
  return {
    id: 'gaps',
    title: 'Gaps',
    blocks: [{ kind: 'summary', text: 'Gaps were not evaluated for this scope.' }],
  };
}

export function renderReport(input: RenderInput): RenderedReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sections: ReportSection[] = [];

  // 1. Executive summary.
  const execBlocks: ReportBlock[] = [];

  // 5. Downgrade note prepended to the executive summary.
  if (input.truthfulness?.downgradedFrom) {
    const reasons = input.truthfulness.reasons.join(' ');
    execBlocks.push({
      kind: 'summary',
      text:
        `Status downgraded from ${input.truthfulness.downgradedFrom} to ` +
        `${input.truthfulness.allowedStatus}.` +
        (reasons ? ` Reasons: ${reasons}` : ''),
    });
  }

  execBlocks.push({
    kind: 'summary',
    text:
      `${input.reportTypeLabel} for ${input.scopeType} ${input.scopeId}. ` +
      `Overall confidence ${input.confidence}. Status: ${input.status}.`,
  });
  execBlocks.push({ kind: 'metric', label: 'Confidence', value: input.confidence, unit: '%' });

  const regulatory = asRecord(input.summary.regulatory);
  if (regulatory) {
    if (regulatory.readinessScore !== undefined) {
      const score = regulatory.readinessScore;
      execBlocks.push({
        kind: 'metric',
        label: 'Readiness score',
        value: typeof score === 'number' || typeof score === 'string' ? score : null,
        unit: '%',
      });
    }
    if (regulatory.readinessLevel !== undefined) {
      const level = regulatory.readinessLevel;
      execBlocks.push({
        kind: 'metric',
        label: 'Readiness level',
        value: typeof level === 'number' || typeof level === 'string' ? level : null,
      });
    }
  }

  sections.push({ id: 'executive-summary', title: 'Executive summary', blocks: execBlocks });

  // 2. Provider readiness.
  const providerRows: Array<Array<string | number | null>> = input.providers.map(p => [
    p.provider,
    p.status,
    p.blocker ?? '—',
  ]);
  sections.push({
    id: 'provider-readiness',
    title: 'Provider readiness',
    blocks: [{ kind: 'table', columns: ['Provider', 'Status', 'Note'], rows: providerRows }],
  });

  // 3. Blockers (only when present).
  if (input.blockers.length) {
    sections.push({
      id: 'blockers',
      title: 'Blockers',
      blocks: [{ kind: 'blocker-list', items: input.blockers }],
    });
  }

  // 4. Gaps (always present; supports requireExplicitGaps).
  sections.push(gapsSectionFor(input.summary, generatedAt));

  const report: RenderedReport = {
    reportTypeId: input.reportTypeId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    generatedAt,
    status: input.status,
    sections,
  };
  if (input.truthfulness) {
    report.truthfulness = input.truthfulness;
  }
  return report;
}
