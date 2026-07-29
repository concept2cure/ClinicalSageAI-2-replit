/**
 * RBM Risk Review Report + Attention feed — pure builders.
 *
 * Turns the live RBM data (RACT, KRIs, QTLs, signals, sites, patients, actions)
 * into (a) an inspection-ready ICH E6(R3) "Risk Review" document — the
 * deliverable sponsors need for quality oversight and inspections — and (b) a
 * prioritized "needs attention now" feed that drives day-to-day monitoring.
 *
 * Pure functions (no I/O); the route assembles the inputs from tenant-scoped
 * queries and stamps `asOf`.
 *
 * @module server/services/rbm/risk-report
 */

export type SectionStatus = 'ok' | 'attention' | 'critical';

export interface RiskReviewInput {
  programId: string;
  asOf: string;
  assessment: { title?: string | null; framework?: string | null; overallRisk?: string | null; status?: string | null; approvedAt?: string | null } | null;
  riskItems: { total: number; critical: number; open: number; high: number; openCritical: string[] };
  /** `notEvaluated` are indicators with no reading (or no threshold to read
   *  against). They are an oversight gap, not a clean bill of health, so the
   *  report states them rather than folding them into the silent remainder. */
  kris: { total: number; red: string[]; amber: string[]; notEvaluated: string[] };
  qtls: { total: number; breached: string[]; approaching: string[]; notEvaluated: string[] };
  signals: { open: number; high: string[] };
  sites: { total: number; enhanced: number };
  patients: { total: number; flagged: number; review: number };
  actions: { open: number; overdue: { description: string; dueDate: string | null; priority: string }[] };
  /**
   * Per-source data freshness. Every number above is only as good as the feed
   * behind it, so a review that reports indicators without reporting the
   * currency of their data is overstating what it knows. Optional so callers
   * predating the ingestion layer still type-check; absent means "not tracked",
   * which the report says rather than treating as healthy.
   */
  dataSources?: { source: string; stale: boolean; ageDays: number | null; status: string }[];
}

export interface ReportSection {
  title: string;
  status: SectionStatus;
  items: string[];
}

export interface RiskReview {
  programId: string;
  asOf: string;
  framework: string;
  overallRisk: string;
  headline: string;
  attentionCount: number;
  approved: boolean;
  sections: ReportSection[];
}

function worst(...s: SectionStatus[]): SectionStatus {
  if (s.includes('critical')) return 'critical';
  if (s.includes('attention')) return 'attention';
  return 'ok';
}

/** Assemble the structured risk review from the aggregated inputs. */
export function buildRiskReview(input: RiskReviewInput): RiskReview {
  const sections: ReportSection[] = [];

  // Risk assessment (RACT)
  sections.push({
    title: 'Risk assessment (RACT / Critical-to-Quality)',
    status: input.riskItems.high > 0 ? 'critical' : input.riskItems.open > 0 ? 'attention' : 'ok',
    items: [
      `${input.riskItems.total} CtQ factors (${input.riskItems.critical} critical, ${input.riskItems.open} open).`,
      ...(input.riskItems.openCritical.length
        ? [`Open critical factors: ${input.riskItems.openCritical.join('; ')}.`]
        : ['No open critical factors.']),
    ],
  });

  // KRIs. An unevaluated indicator is an oversight gap: it is reported as
  // "attention", never rolled up as though the indicator were green.
  const kriUneval = input.kris.notEvaluated ?? [];
  sections.push({
    title: 'Key Risk Indicators',
    status: input.kris.red.length ? 'critical' : (input.kris.amber.length || kriUneval.length) ? 'attention' : 'ok',
    items: [
      `${input.kris.total} KRIs tracked — ${input.kris.red.length} red, ${input.kris.amber.length} amber, ${kriUneval.length} not evaluated.`,
      ...(input.kris.red.length ? [`Red: ${input.kris.red.join(', ')}.`] : []),
      ...(input.kris.amber.length ? [`Amber: ${input.kris.amber.join(', ')}.`] : []),
      ...(kriUneval.length ? [`No current reading (not evaluated): ${kriUneval.join(', ')}.`] : []),
    ],
  });

  // QTLs
  const qtlUneval = input.qtls.notEvaluated ?? [];
  sections.push({
    title: 'Quality Tolerance Limits',
    status: input.qtls.breached.length ? 'critical' : (input.qtls.approaching.length || qtlUneval.length) ? 'attention' : 'ok',
    items: [
      `${input.qtls.total} QTLs — ${input.qtls.breached.length} breached, ${input.qtls.approaching.length} approaching, ${qtlUneval.length} not evaluated.`,
      ...(input.qtls.breached.length ? [`Breached: ${input.qtls.breached.join(', ')}.`] : []),
      ...(input.qtls.approaching.length ? [`Approaching: ${input.qtls.approaching.join(', ')}.`] : []),
      ...(qtlUneval.length ? [`No current value (not evaluated): ${qtlUneval.join(', ')}.`] : []),
    ],
  });

  // Central monitoring signals
  sections.push({
    title: 'Central monitoring signals',
    status: input.signals.high.length ? 'critical' : input.signals.open > 0 ? 'attention' : 'ok',
    items: [
      `${input.signals.open} open signals — ${input.signals.high.length} high/critical.`,
      ...(input.signals.high.length ? [`High severity: ${input.signals.high.join('; ')}.`] : []),
    ],
  });

  // Site risk
  sections.push({
    title: 'Site risk & oversight',
    status: input.sites.enhanced > 0 ? 'attention' : 'ok',
    items: [`${input.sites.total} sites scored — ${input.sites.enhanced} on enhanced monitoring.`],
  });

  // Patient profiles
  sections.push({
    title: 'Patient profiles',
    status: input.patients.flagged > 0 ? 'critical' : input.patients.review > 0 ? 'attention' : 'ok',
    items: [`${input.patients.total} subjects profiled — ${input.patients.flagged} flagged, ${input.patients.review} for review.`],
  });

  // Data sources. Stated even when nothing is tracked: an inspector asking
  // "how current is this?" must get an answer, and "we don't know" is one.
  const sources = input.dataSources ?? [];
  const staleSources = sources.filter(s => s.stale);
  sections.push({
    title: 'Data currency',
    status: sources.length === 0 ? 'attention' : staleSources.length ? 'attention' : 'ok',
    items: sources.length === 0
      ? ['No source feeds are tracked for this study — every indicator above was entered by hand, and its currency is unrecorded.']
      : [
        `${sources.length} source feed(s) — ${staleSources.length} stale or failed.`,
        ...sources.map(s => {
          const age = s.ageDays === null ? 'never loaded' : `${s.ageDays}d old`;
          return `${s.source}: ${s.status}, ${age}${s.stale ? ' — STALE' : ''}.`;
        }),
      ],
  });

  // Actions
  sections.push({
    title: 'Monitoring actions',
    status: input.actions.overdue.length ? 'attention' : 'ok',
    items: [
      `${input.actions.open} open actions — ${input.actions.overdue.length} overdue.`,
      ...input.actions.overdue.slice(0, 5).map(a => `Overdue (${a.priority}): ${a.description}${a.dueDate ? ` — due ${a.dueDate}` : ''}.`),
    ],
  });

  const attentionCount =
    input.riskItems.high + input.kris.red.length + input.qtls.breached.length +
    input.signals.high.length + input.patients.flagged + input.actions.overdue.length +
    // Unevaluated indicators are counted: an indicator nobody has read is an
    // open oversight item, and leaving it out would let the headline claim
    // "within tolerance" for a study that has measured nothing.
    (kriUneval.length ? 1 : 0) + (qtlUneval.length ? 1 : 0) +
    // An untracked or stale feed is an open item too: without it the headline
    // could read "Monitor: 0 item(s) need attention" while the data currency
    // section is the very thing raising the flag.
    (sources.length === 0 || staleSources.length ? 1 : 0);

  const overallRisk = (input.assessment?.overallRisk ?? 'unknown');
  const overall = worst(...sections.map(s => s.status));
  const headline = overall === 'critical'
    ? `Action required: ${attentionCount} critical item(s) across the risk profile.`
    : overall === 'attention'
      ? `Monitor: ${attentionCount} item(s) need attention.`
      : 'Within tolerance: no critical risk items outstanding.';

  return {
    programId: input.programId,
    asOf: input.asOf,
    framework: input.assessment?.framework ?? 'ich_e6r3',
    overallRisk,
    headline,
    attentionCount,
    approved: !!input.assessment?.approvedAt,
    sections,
  };
}

const STATUS_MARK: Record<SectionStatus, string> = { ok: '🟢', attention: '🟠', critical: '🔴' };

/** Render the risk review as an inspection-ready markdown document. */
export function renderRiskReviewMarkdown(r: RiskReview): string {
  const lines: string[] = [];
  lines.push(`# Risk Review — ${r.framework.toUpperCase()}`);
  lines.push('');
  lines.push(`**Program:** ${r.programId}  `);
  lines.push(`**As of:** ${r.asOf}  `);
  lines.push(`**Overall study risk:** ${String(r.overallRisk).toUpperCase()}  `);
  lines.push(`**Assessment approved:** ${r.approved ? 'Yes' : 'No (draft)'}  `);
  lines.push('');
  lines.push(`> ${r.headline}`);
  lines.push('');
  for (const s of r.sections) {
    lines.push(`## ${STATUS_MARK[s.status]} ${s.title}`);
    for (const it of s.items) lines.push(`- ${it}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('_Generated from live RBM data. Advisory — review and approve under your 21 CFR Part 11 sign-off process before filing._');
  return lines.join('\n');
}

// ── Attention feed ────────────────────────────────────────────────────────────

export type AttentionKind = 'kri' | 'qtl' | 'signal' | 'patient' | 'action' | 'assessment' | 'data';

export interface AttentionItem {
  kind: AttentionKind;
  severity: 'critical' | 'high' | 'medium';
  label: string;
  detail?: string;
}

const SEV_RANK: Record<AttentionItem['severity'], number> = { critical: 0, high: 1, medium: 2 };

/** Build a prioritized "needs attention now" feed from the same inputs. */
export function buildAttentionFeed(input: RiskReviewInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const p of input.qtls.breached) items.push({ kind: 'qtl', severity: 'critical', label: `QTL breached: ${p}` });
  for (const s of input.signals.high) items.push({ kind: 'signal', severity: 'high', label: `High signal: ${s}` });
  for (const k of input.kris.red) items.push({ kind: 'kri', severity: 'high', label: `KRI red: ${k}` });
  if (input.patients.flagged > 0) items.push({ kind: 'patient', severity: 'high', label: `${input.patients.flagged} patient(s) flagged for review` });
  for (const a of input.actions.overdue) items.push({ kind: 'action', severity: a.priority === 'high' ? 'high' : 'medium', label: `Overdue action: ${a.description}`, detail: a.dueDate ?? undefined });
  for (const p of input.qtls.approaching) items.push({ kind: 'qtl', severity: 'medium', label: `QTL approaching: ${p}` });
  for (const k of input.kris.amber) items.push({ kind: 'kri', severity: 'medium', label: `KRI amber: ${k}` });
  // Unevaluated indicators are aggregated into one item apiece — a seeded
  // library would otherwise flood the feed with one row per metric — but they
  // are never silently dropped: an unread indicator is unmonitored risk.
  const kriUneval = input.kris.notEvaluated ?? [];
  const qtlUneval = input.qtls.notEvaluated ?? [];
  if (kriUneval.length) {
    items.push({
      kind: 'kri', severity: 'medium',
      label: `${kriUneval.length} KRI(s) have no current reading`,
      detail: kriUneval.slice(0, 5).join(', '),
    });
  }
  if (qtlUneval.length) {
    items.push({
      kind: 'qtl', severity: 'medium',
      label: `${qtlUneval.length} QTL(s) have no current value`,
      detail: qtlUneval.slice(0, 5).join(', '),
    });
  }
  // A feed nobody has loaded, or one that has gone quiet, is unmonitored risk
  // in exactly the way an unread indicator is.
  const feeds = input.dataSources ?? [];
  if (feeds.length === 0) {
    items.push({
      kind: 'data', severity: 'medium',
      label: 'No source feeds are tracked for this study',
      detail: 'Indicator values are hand-entered; their currency is unrecorded.',
    });
  } else {
    const staleFeeds = feeds.filter(s => s.stale);
    if (staleFeeds.length) {
      items.push({
        kind: 'data', severity: 'medium',
        label: `${staleFeeds.length} source feed(s) stale or failed`,
        detail: staleFeeds.map(s => `${s.source} (${s.ageDays === null ? 'never loaded' : `${s.ageDays}d`})`).join(', '),
      });
    }
  }
  // Any unapproved assessment is flagged, not only an 'active' one: a seeded
  // RACT is created as a draft and stays the governing risk basis on screen
  // until someone signs for it.
  if (input.assessment && !input.assessment.approvedAt) {
    items.push({
      kind: 'assessment', severity: 'medium',
      label: `Risk assessment not approved (${input.assessment.status ?? 'draft'})`,
    });
  }
  return items.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}
