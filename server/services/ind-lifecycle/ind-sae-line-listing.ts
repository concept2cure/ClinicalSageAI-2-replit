/**
 * IND aggregate SAE line-listing — 21 CFR 312.33(b) / ICH E2F Appendix.
 *
 * The IND annual report (and the DSUR it is filed as) must summarise the serious
 * adverse experiences observed in the period. This module turns the raw intake
 * `AdverseEvent` records into the two artefacts E2F expects:
 *
 *   1. A LINE LISTING — one structured row per serious case in the period
 *      (subject, country, reaction PT + SOC, seriousness criterion, causality,
 *      expectedness, outcome, suspect product, the IND safety report id if filed).
 *   2. A SUMMARY TABULATION — cumulative counts of serious events crossed by
 *      seriousness criterion, by causality (suspected vs not), and by
 *      expectedness (unexpected vs expected), plus a per-MedDRA-PT breakdown.
 *
 * Selection: an event is included when it is serious (eventType ≠ 'AE') AND its
 * onset falls within [periodStart, periodEnd]. Pure / deterministic — no DB.
 *
 * @module server/services/ind-lifecycle/ind-sae-line-listing
 */

import type { AdverseEvent } from '../compliance/pharmacovigilanceService';
import { isSerious, isSuspected, isUnexpected } from './ind-safety-report-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One row of the serious-adverse-event line listing. */
export interface SaeLineListingRow {
  adverseEventId: string;
  patientId: string;
  countryOfOccurrence: string;
  onsetDate: string; // ISO date
  reactionPt: string;
  reactionSoc: string;
  seriousnessCriteria: string;
  causality: string;
  suspected: boolean;
  expectedness: 'unexpected' | 'expected';
  outcome: string;
  suspectProduct: string;
  /** True when this case met expedited (7-/15-day) IND safety reporting. */
  expedited: boolean;
}

/** Cumulative counts over the included serious cases. */
export interface SaeSummaryTabulation {
  totalSerious: number;
  bySeriousnessCriteria: Record<string, number>;
  bySuspected: { suspected: number; notSuspected: number };
  byExpectedness: { unexpected: number; expected: number };
  /** Per MedDRA Preferred Term, total + suspected-unexpected (the SUSAR-like cut). */
  byReactionPt: Array<{ reactionPt: string; total: number; suspectedUnexpected: number }>;
  expeditedCount: number;
  fatalCount: number;
}

export interface SaeLineListing {
  reportingPeriod: { start: string; end: string };
  rows: SaeLineListingRow[];
  tabulation: SaeSummaryTabulation;
}

export interface BuildLineListingInput {
  events: AdverseEvent[];
  periodStart: Date | string;
  periodEnd: Date | string;
}

// ---------------------------------------------------------------------------
// Builder (pure)
// ---------------------------------------------------------------------------

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}
function isoDate(d: Date | string | undefined | null): string {
  if (!d) return '';
  const date = toDate(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** True when `onset` falls within the inclusive [start, end] window. */
function inPeriod(onset: Date, start: Date, end: Date): boolean {
  const t = onset.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/**
 * Build the serious-AE line listing + summary tabulation for a reporting period.
 * Pure / deterministic; rows are ordered by onset date then adverse-event id.
 */
export function buildSaeLineListing(input: BuildLineListingInput): SaeLineListing {
  const start = toDate(input.periodStart);
  const end = toDate(input.periodEnd);

  const included = input.events.filter(
    (e) => isSerious(e) && inPeriod(toDate(e.onsetDate), start, end),
  );

  const rows: SaeLineListingRow[] = included
    .map((e) => {
      const suspected = isSuspected(e.causality);
      const unexpected = isUnexpected(e.expectedness);
      return {
        adverseEventId: e.id,
        patientId: e.patientId,
        countryOfOccurrence: e.countryOfOccurrence,
        onsetDate: isoDate(e.onsetDate),
        reactionPt: e.reactionPt ?? e.eventDescription,
        reactionSoc: e.reactionSoc ?? '',
        seriousnessCriteria: e.seriousnessCriteria,
        causality: e.causality,
        suspected,
        expectedness: unexpected ? ('unexpected' as const) : ('expected' as const),
        outcome: e.outcome,
        suspectProduct: e.suspectProduct ?? '',
        expedited: e.expeditedReportRequired,
      };
    })
    .sort((a, b) => (a.onsetDate === b.onsetDate ? a.adverseEventId.localeCompare(b.adverseEventId) : a.onsetDate.localeCompare(b.onsetDate)));

  return {
    reportingPeriod: { start: isoDate(start), end: isoDate(end) },
    rows,
    tabulation: tabulate(rows),
  };
}

function tabulate(rows: SaeLineListingRow[]): SaeSummaryTabulation {
  const bySeriousnessCriteria: Record<string, number> = {};
  const byPt = new Map<string, { total: number; suspectedUnexpected: number }>();
  let suspectedCount = 0;
  let unexpectedCount = 0;
  let expeditedCount = 0;
  let fatalCount = 0;

  for (const r of rows) {
    bySeriousnessCriteria[r.seriousnessCriteria] = (bySeriousnessCriteria[r.seriousnessCriteria] ?? 0) + 1;
    if (r.suspected) suspectedCount += 1;
    if (r.expectedness === 'unexpected') unexpectedCount += 1;
    if (r.expedited) expeditedCount += 1;
    if (r.seriousnessCriteria === 'death' || r.outcome === 'fatal') fatalCount += 1;

    const cur = byPt.get(r.reactionPt) ?? { total: 0, suspectedUnexpected: 0 };
    cur.total += 1;
    if (r.suspected && r.expectedness === 'unexpected') cur.suspectedUnexpected += 1;
    byPt.set(r.reactionPt, cur);
  }

  const byReactionPt = [...byPt.entries()]
    .map(([reactionPt, v]) => ({ reactionPt, total: v.total, suspectedUnexpected: v.suspectedUnexpected }))
    .sort((a, b) => (b.total === a.total ? a.reactionPt.localeCompare(b.reactionPt) : b.total - a.total));

  return {
    totalSerious: rows.length,
    bySeriousnessCriteria,
    bySuspected: { suspected: suspectedCount, notSuspected: rows.length - suspectedCount },
    byExpectedness: { unexpected: unexpectedCount, expected: rows.length - unexpectedCount },
    byReactionPt,
    expeditedCount,
    fatalCount,
  };
}

// ---------------------------------------------------------------------------
// CSV export (inspection / appendix artefact)
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  'adverse_event_id',
  'patient_id',
  'country',
  'onset_date',
  'reaction_pt',
  'reaction_soc',
  'seriousness',
  'causality',
  'suspected',
  'expectedness',
  'outcome',
  'suspect_product',
  'expedited',
];

/** Quote a CSV field when it contains a comma, quote, or newline. */
function csvField(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Render the line listing as a CSV (header + one row per serious case). */
export function saeLineListingToCsv(listing: SaeLineListing): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of listing.rows) {
    lines.push(
      [
        csvField(r.adverseEventId),
        csvField(r.patientId),
        csvField(r.countryOfOccurrence),
        csvField(r.onsetDate),
        csvField(r.reactionPt),
        csvField(r.reactionSoc),
        csvField(r.seriousnessCriteria),
        csvField(r.causality),
        csvField(r.suspected),
        csvField(r.expectedness),
        csvField(r.outcome),
        csvField(r.suspectProduct),
        csvField(r.expedited),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}
