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
  /**
   * Not rendered. No engine behind this renderer measures a confidence (the
   * readiness run and the domain registers report none; the lineage trace has
   * its own document), and the figure stored on older runs was `95 − 20 ×
   * blockers` — printed as "Overall confidence 75%" next to a readiness that
   * was not computed (QA 2026-10-08, j8). Kept on the input for the callers'
   * truthfulness gate only.
   */
  confidence?: number | null;
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
/** The readiness evaluator's severity vocabulary, in the renderer's. */
const GAP_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  critical: 'critical',
  important: 'high',
  recommended: 'medium',
};

/** One gap as the readiness run records it (readinessEvaluator ReadinessGap). */
interface ReadinessGapLike {
  code?: unknown;
  title?: unknown;
  severity?: unknown;
  message?: unknown;
}

/**
 * The readiness run's own gap list, when it carried one.
 *
 * `summary.regulatory.gaps` is the full list the evaluator returned: section
 * gaps, artifact gaps, and the `critical` markers it raises when a half of the
 * assessment could not run at all. Before this, only
 * `regulatory.missingArtifacts` reached the gaps section — and that list is
 * `[]` whenever the filing type has no resolved artifact matrix, which is most
 * of the registry. The gaps the run *did* find went only into the blockers
 * section, so the same document listed "Artifact requirements not assessed" as
 * a blocker and then stated "No gaps detected".
 */
function readinessGapsOf(summary: Record<string, unknown> | null | undefined): ReadinessGapLike[] | null {
  const gaps = asRecord(summary?.regulatory)?.gaps;
  if (!Array.isArray(gaps)) return null;
  return gaps.filter((gap): gap is ReadinessGapLike => !!gap && typeof gap === 'object');
}

/**
 * Whether a gap evaluation ran for this run — the flag the truthfulness gate's
 * `requireExplicitGaps` reads.
 *
 * The old test was `Array.isArray(summary.regulatory.missingArtifacts)`, and
 * the orchestrator sets that field on every project-scope run. So the flag was
 * true even when the evaluator had assessed nothing on the artifact side, and
 * "no gaps" printed and sealed over an unassessed half.
 *
 * A gap evaluation ran when the run states gaps it found, or states that the
 * artifact half was assessed and found nothing. An empty list with no
 * assessment flag is "cannot tell", which fails closed to false — including
 * for runs stored before `artifactsAssessed` existed, which is the honest
 * reading of a record that does not say.
 */
export function gapsWereEvaluated(summary: Record<string, unknown> | null | undefined): boolean {
  const regulatory = asRecord(summary?.regulatory);
  if (!regulatory) return false;
  const assessed = regulatory.artifactsAssessed === true;
  const gaps = readinessGapsOf(summary);
  if (gaps) return assessed || gaps.length > 0;
  if (Array.isArray(regulatory.missingArtifacts)) {
    return assessed || regulatory.missingArtifacts.length > 0;
  }
  return false;
}

/**
 * The gaps section: every gap the run recorded, "no gaps" only when an
 * evaluation ran, found none, and the document contradicts it nowhere, or
 * "not evaluated" when none ran.
 *
 * `blockers` is read for one reason: **a document may not state "No gaps
 * detected" while it also lists blockers.** That rule holds whatever fed the
 * summary, including provider paths not written yet, which is why it lives
 * here rather than in each of them. A rendered report is sealed and handed to a
 * regulator; one that reassures on one page and lists the cause on another is
 * the failure this renderer exists to make impossible, not a wording choice.
 */
function gapsSectionFor(
  summary: Record<string, unknown>,
  generatedAt: string,
  blockers: string[],
): ReportSection {
  const readinessGaps = readinessGapsOf(summary);
  if (readinessGaps && readinessGaps.length > 0) {
    return {
      id: 'gaps',
      title: 'Gaps',
      blocks: [
        {
          kind: 'gap-list',
          items: readinessGaps.map(gap => {
            const title = typeof gap.title === 'string' && gap.title.trim()
              ? gap.title.trim()
              : String(gap.code ?? 'Gap');
            const message = typeof gap.message === 'string' && gap.message.trim()
              ? gap.message.trim()
              : undefined;
            const severity = GAP_SEVERITY[String(gap.severity)] ?? 'medium';
            return message ? { title, severity, message } : { title, severity };
          }),
        },
      ],
    };
  }

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

  if (gapsWereEvaluated(summary) && blockers.length === 0) {
    return {
      id: 'gaps',
      title: 'Gaps',
      blocks: [
        { kind: 'gap-list', items: [] },
        { kind: 'summary', text: `No gaps detected as of ${generatedAt}.` },
      ],
    };
  }

  /* An evaluation that ran clean in a document that still carries blockers:
     the blockers are the answer, and the reassurance is withheld rather than
     printed beside them. */
  if (gapsWereEvaluated(summary)) {
    return {
      id: 'gaps',
      title: 'Gaps',
      blocks: [
        { kind: 'gap-list', items: [] },
        {
          kind: 'summary',
          text:
            'The gap evaluation recorded none. The blockers listed above are ' +
            'outstanding, so this is not a clear result.',
        },
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

/** "activeRegistrations" → "Active registrations". */
function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A research-compliance register's own content (computeDomainRun): its counts,
 * as metrics and count tables. Before this the summary was computed and never
 * drawn, so the register read as the readiness digest under another title
 * (QA 2026-10-08, j8). The counts are the organisation's, and the section says so.
 */
function domainSection(domain: Record<string, unknown>): ReportSection {
  const blocks: ReportBlock[] = [
    {
      kind: 'summary',
      text: "Counts are the organisation's records of this kind; they are not limited to one program.",
    },
  ];
  for (const [key, value] of Object.entries(domain)) {
    if (typeof value === 'number') {
      blocks.push({ kind: 'metric', label: humanize(key), value });
    } else if (asRecord(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      blocks.push(
        entries.length === 0
          ? { kind: 'summary', text: `${humanize(key)}: none recorded.` }
          : {
              kind: 'table',
              columns: [humanize(key.replace(/^by/, '')), 'Count'],
              rows: entries.map(([k, v]) => [k, typeof v === 'number' || typeof v === 'string' ? v : null]),
            },
      );
    } else if (Array.isArray(value) && value.length > 0) {
      const first = asRecord(value[0]);
      const columns = first ? Object.keys(first).filter((c) => ['string', 'number'].includes(typeof first[c])) : [];
      if (columns.length > 0) {
        blocks.push({
          kind: 'table',
          columns: columns.map(humanize),
          rows: value.map((item) => {
            const row = asRecord(item) ?? {};
            return columns.map((c) => (typeof row[c] === 'number' || typeof row[c] === 'string' ? (row[c] as string | number) : null));
          }),
        });
      }
    }
  }
  return { id: 'register', title: 'Register', blocks };
}

/**
 * The run's one readiness statement: the evaluated readiness when
 * evaluateReadiness ran, otherwise that it was not computed and why — the same
 * answer the portfolio board and the canvas opener give for the program.
 */
function readinessBlocks(input: RenderInput): ReportBlock[] {
  const regulatory = asRecord(input.summary.regulatory);
  const score = regulatory?.readinessScore;
  if (regulatory && typeof score === 'number') {
    const level = typeof regulatory.readinessLevel === 'string' ? regulatory.readinessLevel : null;
    const against = typeof regulatory.applicationDisplayName === 'string' ? regulatory.applicationDisplayName : null;
    return [
      {
        kind: 'summary',
        text: `Submission readiness ${score}%${level ? ` (${level.replace(/_/g, ' ')})` : ''}${against ? `, evaluated against ${against}` : ''}.`,
      },
      { kind: 'metric', label: 'Submission readiness', value: score, unit: '%' },
      ...(level ? [{ kind: 'metric' as const, label: 'Readiness level', value: level }] : []),
    ];
  }
  const why = input.providers.find((p) => p.provider === 'submission_readiness' && p.status === 'missing')?.blocker;
  return [
    { kind: 'summary', text: why ?? 'Submission readiness not computed.' },
    { kind: 'metric', label: 'Submission readiness', value: null, status: 'missing' },
  ];
}

/** What the report is about, by name: the stored scope label, never a bare database id when one exists. */
function scopeNameOf(input: RenderInput): string {
  const label = input.summary.scopeLabel;
  return typeof label === 'string' && label.trim() ? label.trim() : `${input.scopeType} ${input.scopeId}`;
}

export function renderReport(input: RenderInput): RenderedReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sections: ReportSection[] = [];
  const domain = asRecord(input.summary.domain);

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
    text: `${input.reportTypeLabel} for ${scopeNameOf(input)}. Status: ${input.status}.`,
  });
  // A register states its own counts; the readiness run states its one readiness.
  if (!domain) execBlocks.push(...readinessBlocks(input));

  sections.push({ id: 'executive-summary', title: 'Executive summary', blocks: execBlocks });
  if (domain) sections.push(domainSection(domain));

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
  sections.push(gapsSectionFor(input.summary, generatedAt, input.blockers));

  const scopeLabel = input.summary.scopeLabel;
  const report: RenderedReport = {
    reportTypeId: input.reportTypeId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    ...(typeof scopeLabel === 'string' && scopeLabel.trim() ? { scopeLabel: scopeLabel.trim() } : {}),
    generatedAt,
    status: input.status,
    sections,
  };
  if (input.truthfulness) {
    report.truthfulness = input.truthfulness;
  }
  return report;
}
