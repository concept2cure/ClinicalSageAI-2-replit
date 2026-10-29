/**
 * Pure report renderer for Report-OS.
 *
 * Turns an already-computed report run into a structured, provenance-linked
 * document model. Render-target-agnostic, deterministic, and side-effect-free
 * except for the default `generatedAt` timestamp. No DB, no IO.
 */

import type { ReportRunStatus, TruthfulnessEvaluation } from '../truthfulness';
import type { ReportBlock, ReportSection, RenderedReport } from './types';
import type { InsightAtomRef } from '../providers/types';
import { labelCurrencyMatrixOf, renderLabelCurrencyMatrix } from './label-currency-matrix';
import { lifecycleCalendarOf, renderLifecycleCalendar } from './lifecycle-calendar';

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
    atoms?: InsightAtomRef[];
    calculation?: Record<string, unknown>;
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
 * A market assessment's gaps: the required Module 1 headings with no document.
 *
 * Its own key, because a market assessment writes no `summary.regulatory` at
 * all (regional/filing-readiness.ts) — so every branch keyed on that key is
 * blind to it. `missingHeadings` is null when nothing in the program recorded a
 * CTD code, which is exactly "not evaluated" and must not read as "none found".
 */
function module1Gaps(summary: Record<string, unknown>): Array<{ title: string; severity: 'high' }> | null {
  const module1 = asRecord(summary.module1);
  if (!Array.isArray(module1?.missingHeadings)) return null;
  return module1.missingHeadings.map((h) => {
    const row = asRecord(h) ?? {};
    const code = typeof row.code === 'string' ? row.code : '';
    const title = typeof row.title === 'string' ? row.title : '';
    return {
      title: `Module 1 ${code}${title ? ` ${title}` : ''}: required for this filing, and no document is recorded under it.`,
      severity: 'high' as const,
    };
  });
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
  if (labelCurrencyMatrixOf(asRecord(summary?.domain)) || lifecycleCalendarOf(asRecord(summary?.domain))) return true;
  /* A market assessment is the second evaluation that can set this, and it
     writes its own key: `summary.module1.missingHeadings` is a list when it
     could match this program's content against the agency's headings, and null
     when nothing recorded a CTD code — which is "not evaluated", read the same
     fail-closed way as a readiness record that does not say
     (regional/filing-readiness.ts). Without this arm the regional run fell to
     `return false` below and printed "Gaps were not evaluated for this scope" in
     the same document as the section listing the gaps it had just evaluated. */
  const module1 = asRecord(summary?.module1);
  if (Array.isArray(module1?.missingHeadings)) return true;
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
  const calendar = lifecycleCalendarOf(asRecord(summary.domain));
  if (calendar) return { id: 'gaps', title: 'Gaps', blocks: [{ kind: 'gap-list', items: calendar.gaps }] };
  const labelMatrix = labelCurrencyMatrixOf(asRecord(summary.domain));
  if (labelMatrix) return { id: 'gaps', title: 'Gaps', blocks: [{ kind: 'gap-list', items: labelMatrix.gaps }] };
  /* A market assessment's gaps are its own, and are read FIRST because its runs
     write no `summary.regulatory` for the readiness branches below to find. */
  const m1 = module1Gaps(summary);
  if (m1 && m1.length > 0) {
    return { id: 'gaps', title: 'Gaps', blocks: [{ kind: 'gap-list', items: m1 }] };
  }
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
     (reporting review 2026-10-01). Nothing was checked; say so — and where the
     run knows WHY nothing could be checked, say that instead of the generic
     scope sentence. */
  const module1 = asRecord(summary.module1);
  if (module1 && module1.assessed === false) {
    return {
      id: 'gaps',
      title: 'Gaps',
      blocks: [
        {
          kind: 'summary',
          text:
            'Gaps were not evaluated: no section or governed document of this project records a CTD section ' +
            'code, so nothing could be matched against this market’s Module 1 headings.',
        },
      ],
    };
  }
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

/** The register's statement that its counts are the organisation's, not one
 *  program's. One sentence: the lifecycle calendar states it too, because under
 *  an open project it lists every admitted project's obligations (D2, 2026-10-29). */
const ORGANIZATION_COUNTS = "Counts are the organisation's records of this kind; they are not limited to one program.";

/**
 * A research-compliance register's own content (computeDomainRun): its counts,
 * as metrics and count tables. Before this the summary was computed and never
 * drawn, so the register read as the readiness digest under another title
 * (QA 2026-10-08, j8). The counts are the organisation's, and the section says so.
 */
function domainSection(domain: Record<string, unknown>, providers: RenderInput['providers'], computedScope: string): ReportSection {
  const provenance = providers.flatMap((p) => p.atoms ?? []);
  const blocks: ReportBlock[] = [
    {
      kind: 'summary',
      text: computedScope === 'project' ? 'Counts are limited to this project’s recorded awards, proposals and their associated records.' : ORGANIZATION_COUNTS,
    },
  ];
  for (const [key, value] of Object.entries(domain)) {
    if (typeof value === 'number') {
      blocks.push({ kind: 'metric', label: humanize(key), value, ...(provenance.length ? { provenance } : {}) });
    } else if (asRecord(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      blocks.push(
        entries.length === 0
          ? { kind: 'summary', text: `${humanize(key)}: none recorded.` }
          : {
              kind: 'table',
              columns: [humanize(key.replace(/^by/, '')), 'Count'],
              rows: entries.map(([k, v]) => [k, typeof v === 'number' || typeof v === 'string' ? v : null]),
              ...(provenance.length ? { provenance } : {}),
            },
      );
    } else if (Array.isArray(value) && value.length > 0) {
      // All rows define the scalar schema: a null first cell must not erase a later value.
      const columns = [...new Set(value.flatMap(item => Object.entries(asRecord(item) ?? {})
        .filter(([, cell]) => cell == null || typeof cell === 'string' || typeof cell === 'number')
        .map(([key]) => key)))];
      if (columns.length > 0) {
        blocks.push({
          kind: 'table',
          columns: columns.map(humanize),
          rows: value.map((item) => {
            const row = asRecord(item) ?? {};
            return columns.map((c) => (typeof row[c] === 'number' || typeof row[c] === 'string' ? (row[c] as string | number) : null));
          }),
          ...(provenance.length ? { provenance } : {}),
        });
      }
    }
  }
  return { id: 'register', title: 'Register', blocks };
}

function renderedDomainSections(domain: Record<string, unknown>, providers: RenderInput['providers'], computedScope: string): ReportSection[] {
  const calendar = lifecycleCalendarOf(domain);
  if (calendar) return renderLifecycleCalendar(calendar, providers.flatMap(provider => provider.atoms ?? []), computedScope === 'organization' ? ORGANIZATION_COUNTS : null);
  const labelMatrix = labelCurrencyMatrixOf(domain);
  return labelMatrix ? renderLabelCurrencyMatrix(labelMatrix, providers.flatMap(provider => provider.atoms ?? [])) : [domainSection(domain, providers, computedScope)];
}

/**
 * A market assessment's own content (computeRegionalRun): what the platform can
 * carry for this filing, and the agency's own Module 1 headings with no document
 * recorded under them.
 *
 * It exists for the same reason `domainSection` does. Without it a market
 * assessment fell through to `readinessBlocks`, which reads
 * `summary.regulatory` — a key the regional engine does not write — and would
 * have printed "Submission readiness not computed." as the executive summary of
 * a report that computed a market assessment. The heading numbers and titles are
 * the Module 1 record's, and the section names the specification they come from
 * so the numbering can be re-audited rather than re-derived.
 */
function marketBlocks(market: Record<string, unknown>): ReportBlock[] {
  const str = (k: string): string | null => (typeof market[k] === 'string' ? (market[k] as string) : null);
  const blocks: ReportBlock[] = [];
  const filing = str('filing');
  const agency = str('agency');
  if (filing && agency) {
    blocks.push({ kind: 'summary', text: `Assessed as a ${filing} with ${agency.replace(/_/g, ' ')}.` });
  }
  /* The canonical market statement, verbatim: it is the same sentence the market
     rows, the New submission options and the New project picker show
     (services/regulatory/market-support.ts), so this report cannot disagree
     with them. */
  const line = str('line');
  if (line) blocks.push({ kind: 'summary', text: line });
  const offer = asRecord(market.offer);
  if (offer && typeof offer.reason === 'string') {
    blocks.push({ kind: 'summary', text: offer.reason });
  }
  const spec = str('module1Spec');
  if (spec) {
    blocks.push({
      kind: 'summary',
      text: `Module 1 heading numbers and titles follow ${spec}.`,
    });
  }
  return blocks;
}

/** A heading row's `code` and `title`, each only when the summary recorded one. */
function headingCells(entry: unknown): [string | null, string | null] {
  const row = asRecord(entry) ?? {};
  return [
    typeof row.code === 'string' ? row.code : null,
    typeof row.title === 'string' ? row.title : null,
  ];
}

/** The coverage half: the figure and the headings with no document, or neither. */
function module1CoverageBlocks(module1: Record<string, unknown> | null): ReportBlock[] {
  const required = typeof module1?.requiredHeadings === 'number' ? module1.requiredHeadings : null;
  if (module1?.assessed !== true) {
    /* Not a zero and not a gap list: nothing in the program recorded a CTD code,
       so no heading was matched either way (filing-readiness.ts). A count here
       would read as a measurement. */
    return [
      {
        kind: 'summary',
        text:
          'Module 1 coverage was not assessed: no section or governed document of this project records a CTD section code, ' +
          `so nothing could be matched against the ${required ?? 0} heading(s) this filing requires.`,
      },
      { kind: 'metric', label: 'Required Module 1 headings covered', value: null, status: 'missing' },
    ];
  }
  const covered = typeof module1.coveredHeadings === 'number' ? module1.coveredHeadings : 0;
  const missing = Array.isArray(module1.missingHeadings) ? module1.missingHeadings : [];
  return [
    {
      kind: 'metric',
      label: 'Required Module 1 headings covered',
      value: covered,
      ...(required != null ? { unit: `of ${required}` } : {}),
    },
    missing.length === 0
      ? { kind: 'summary', text: 'Every required Module 1 heading has recorded placement under it; this is not a determination of document completeness or approval.' }
      : {
          kind: 'table',
          columns: ['Heading', 'Title', 'State'],
          rows: missing.map((h) => [...headingCells(h), 'No document recorded']),
        },
  ];
}

/**
 * The conditional half: a heading whose fact nobody stated is its own "Required
 * if" row, never "not required" (requiredModule1's contract).
 */
function module1ConditionalBlocks(module1: Record<string, unknown> | null): ReportBlock[] {
  const undetermined = Array.isArray(module1?.undetermined) ? module1.undetermined : [];
  if (undetermined.length === 0) return [];
  return [{
    kind: 'table',
    columns: ['Heading', 'Title', 'Required if'],
    rows: undetermined.map((u) => {
      const condition = asRecord(u)?.condition;
      return [...headingCells(u), typeof condition === 'string' ? condition.replace(/_/g, ' ') : null];
    }),
  }];
}

function marketSection(module1: Record<string, unknown> | null): ReportSection {
  return {
    id: 'market-module1',
    title: 'Module 1 content for this market',
    blocks: [{ kind: 'summary', text: typeof module1?.coverageBasis === 'string' ? module1.coverageBasis : 'This stored assessment matches recorded CTD placements. Content existence, quality and approval were not retained as evidence in this run.' }, ...module1CoverageBlocks(module1), ...module1ConditionalBlocks(module1)],
  };
}

/**
 * The run's one readiness statement: the evaluated readiness when
 * evaluateReadiness ran, otherwise that it was not computed and why — the same
 * answer the portfolio board and the canvas opener give for the program.
 */
function readinessBlocks(input: RenderInput): ReportBlock[] {
  const regulatory = asRecord(input.summary.regulatory);
  const score = regulatory?.readinessScore;
  const provenance = input.providers.find((p) => p.provider === 'submission_readiness')?.atoms ?? [];
  if (regulatory && typeof score === 'number') {
    const level = typeof regulatory.readinessLevel === 'string' ? regulatory.readinessLevel : null;
    const against = typeof regulatory.applicationDisplayName === 'string' ? regulatory.applicationDisplayName : null;
    return [
      {
        kind: 'summary',
        text: `Submission readiness ${score}%${level ? ` (${level.replace(/_/g, ' ')})` : ''}${against ? `, evaluated against ${against}` : ''}.`,
      },
      { kind: 'metric', label: 'Submission readiness', value: score, unit: '%', ...(provenance.length ? { provenance } : {}) },
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

function computationMetadata(summary: Record<string, unknown>, scopeType: string) {
  const computedScope = typeof summary.computedScope === 'string' ? summary.computedScope
    : typeof summary.domainScope === 'string' ? summary.domainScope : scopeType;
  const provenance = asRecord(summary.provenance);
  return { computedScope, ...(provenance ? { provenance } : {}) };
}

function providerReadinessSection(providers: RenderInput['providers']): ReportSection {
  const providerRows: Array<Array<string | number | null>> = providers.map(p => [
    p.provider,
    p.status,
    p.blocker ?? '—',
  ]);
  return {
    id: 'provider-readiness',
    title: 'Provider readiness',
    blocks: [{ kind: 'table', columns: ['Provider', 'Status', 'Note'], rows: providerRows, ...(providers.some((p) => p.atoms?.length) ? { provenance: providers.flatMap((p) => p.atoms ?? []) } : {}) }],
  };

}

export function renderReport(input: RenderInput): RenderedReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sections: ReportSection[] = [];
  const domain = asRecord(input.summary.domain);
  const market = asRecord(input.summary.market);
  const module1 = asRecord(input.summary.module1);

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
  /* A register states its own counts and a market assessment its own market;
     only the readiness run states a readiness. A run that computed something
     else must not print "Submission readiness not computed" as its summary. */
  if (market) execBlocks.push(...marketBlocks(market));
  else if (!domain) execBlocks.push(...readinessBlocks(input));

  sections.push({ id: 'executive-summary', title: 'Executive summary', blocks: execBlocks });
  const metadata = computationMetadata(input.summary, input.scopeType);
  const { computedScope } = metadata;
  if (domain) sections.push(...renderedDomainSections(domain, input.providers, computedScope));
  if (market) sections.push(marketSection(module1 ?? null));

  // 2. Provider readiness.
  sections.push(providerReadinessSection(input.providers));

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
  if (input.summary.complianceAssessment === 'not_evaluated') sections.push({ id: 'assessment-limits', title: 'Assessment limits', blocks: [{ kind: 'summary', text: 'Artifact approval is lifecycle evidence. Compliance controls, audit-trail integrity and signatures were not assessed by this report.' }] });

  const scopeLabel = input.summary.scopeLabel;
  const report: RenderedReport = {
    reportTypeId: input.reportTypeId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    ...(typeof scopeLabel === 'string' && scopeLabel.trim() ? { scopeLabel: scopeLabel.trim() } : {}),
    generatedAt,
    status: input.status,
    ...metadata,
    sections,
  };
  if (input.truthfulness) {
    report.truthfulness = input.truthfulness;
  }
  return report;
}
