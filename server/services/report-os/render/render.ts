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
/**
 * Whether a gap evaluation ran for this run.
 *
 * Two evaluations can set it, and each writes its own key:
 *   - the readiness orchestrator's regional gap evaluation, at project scope
 *     with a registry context, which sets `summary.regulatory.missingArtifacts`;
 *   - the market assessment, which sets `summary.module1.missingHeadings` when
 *     it could match content against the agency's headings — and leaves it null
 *     when nothing recorded a CTD code, which is exactly "not evaluated"
 *     (regional/filing-readiness.ts).
 *
 * An empty list is "no gaps"; no list is "not evaluated", and the two may never
 * print the same sentence. A market assessment reached `gapsSectionFor` without
 * this second case and printed "Gaps were not evaluated for this scope" in the
 * same document as the section listing the gaps it had just evaluated.
 */
export function gapsWereEvaluated(summary: Record<string, unknown> | null | undefined): boolean {
  const regulatory = asRecord(summary?.regulatory);
  if (Array.isArray(regulatory?.missingArtifacts)) return true;
  const module1 = asRecord(summary?.module1);
  return Array.isArray(module1?.missingHeadings);
}

/** A market assessment's gaps: the required headings with no document. */
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
 * The gaps section: the evaluation's gaps, "no gaps" when an evaluation ran and
 * found none, or "not evaluated" when none ran.
 */
function gapsSectionFor(summary: Record<string, unknown>, generatedAt: string): ReportSection {
  /* A market assessment's gaps are its own: the required Module 1 headings with
     no document. Read first, because its runs write no `summary.regulatory`. */
  const m1 = module1Gaps(summary);
  if (m1 && m1.length > 0) {
    return { id: 'gaps', title: 'Gaps', blocks: [{ kind: 'gap-list', items: m1 }] };
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
            'Gaps were not evaluated: no section or governed document of this program records a CTD section ' +
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

function marketSection(market: Record<string, unknown>, module1: Record<string, unknown> | null): ReportSection {
  const blocks: ReportBlock[] = [];
  const required = typeof module1?.requiredHeadings === 'number' ? module1.requiredHeadings : null;
  const covered = typeof module1?.coveredHeadings === 'number' ? module1.coveredHeadings : null;
  const assessed = module1?.assessed === true;

  if (!assessed) {
    /* Not a zero and not a gap list: nothing in the program recorded a CTD code,
       so no heading was matched either way (filing-readiness.ts). A count here
       would read as a measurement. */
    blocks.push({
      kind: 'summary',
      text:
        'Module 1 coverage was not assessed: no section or governed document of this program records a CTD section code, ' +
        `so nothing could be matched against the ${required ?? 0} heading(s) this filing requires.`,
    });
    blocks.push({ kind: 'metric', label: 'Required Module 1 headings covered', value: null, status: 'missing' });
  } else {
    blocks.push({
      kind: 'metric',
      label: 'Required Module 1 headings covered',
      value: covered ?? 0,
      ...(required != null ? { unit: `of ${required}` } : {}),
    });
    const missing = Array.isArray(module1?.missingHeadings) ? module1.missingHeadings : [];
    blocks.push(
      missing.length === 0
        ? { kind: 'summary', text: 'Every required Module 1 heading has a document recorded under it.' }
        : {
            kind: 'table',
            columns: ['Heading', 'Title', 'State'],
            rows: missing.map((h) => {
              const row = asRecord(h) ?? {};
              return [
                typeof row.code === 'string' ? row.code : null,
                typeof row.title === 'string' ? row.title : null,
                'No document recorded',
              ];
            }),
          },
    );
  }

  /* A conditional heading whose fact nobody stated is its own line, never
     "not required" (requiredModule1's contract). */
  const undetermined = Array.isArray(module1?.undetermined) ? module1.undetermined : [];
  if (undetermined.length > 0) {
    blocks.push({
      kind: 'table',
      columns: ['Heading', 'Title', 'Required if'],
      rows: undetermined.map((u) => {
        const row = asRecord(u) ?? {};
        return [
          typeof row.code === 'string' ? row.code : null,
          typeof row.title === 'string' ? row.title : null,
          typeof row.condition === 'string' ? row.condition.replace(/_/g, ' ') : null,
        ];
      }),
    });
  }
  return { id: 'market-module1', title: 'Module 1 content for this market', blocks };
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
  if (domain) sections.push(domainSection(domain));
  if (market) sections.push(marketSection(market, module1 ?? null));

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
