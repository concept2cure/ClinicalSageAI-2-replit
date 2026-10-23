/**
 * IND aggregate SAE line-listing — 21 CFR 312.33(b) / ICH E2F Appendix.
 *
 * The IND annual report (and the DSUR it is filed as) must summarise the serious
 * adverse experiences observed in the period. This module turns the raw intake
 * `AdverseEvent` records into the two artefacts E2F expects:
 *
 *   1. A LINE LISTING — one structured row per serious case in the period
 *      (subject, country, reaction PT + SOC, verbatim term, seriousness
 *      criterion, causality, expectedness, outcome, suspect product).
 *   2. A SUMMARY TABULATION — cumulative counts of serious events crossed by
 *      seriousness criterion, by causality (suspected vs not), and by
 *      expectedness (unexpected / expected / not assessed), plus a
 *      per-MedDRA-PT breakdown over the coded cases.
 *
 * Selection: an event is included when it is serious (eventType SAE / SUSAR, or
 * an AESI with a recorded seriousness criterion) AND its onset falls within
 * [periodStart, periodEnd] — or its onset is unknown or not recorded, in which
 * case it is listed so and counted, never dropped. An event whose type is
 * missing or unrecognised, or an AESI with no criterion, has undetermined
 * seriousness: it is listed, marked 'undetermined', and counted apart — never
 * dropped, never counted serious. Pure / deterministic — no DB.
 *
 * 2026-10-15: an unrecorded expectedness used to print "expected", an
 * unknown-onset case vanished from rows and totals, the free-text event
 * description was printed and tabulated as a MedDRA Preferred Term, and an
 * event with no recorded type was listed and counted as serious.
 *
 * @module server/services/ind-lifecycle/ind-sae-line-listing
 */

import type { AdverseEvent } from '../compliance/pharmacovigilanceService';
import {
  isSerious,
  isSuspected,
  expectednessDetermination,
  type ExpectednessDetermination,
} from './ind-safety-report-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One row of the serious-adverse-event line listing. */
export interface SaeLineListingRow {
  adverseEventId: string;
  patientId: string;
  countryOfOccurrence: string;
  /** ISO date; null when the onset is unknown or not a valid date (the case is still listed). */
  onsetDate: string | null;
  /** Why onsetDate is null: stated as unknown, or not recorded (absent or not a date); null when dated. */
  onsetGap: 'unknown' | 'not recorded' | null;
  /** MedDRA Preferred Term as coded; null when the case is not MedDRA-coded. */
  reactionPt: string | null;
  /** The reported (verbatim) event term — the intake's free-text description. */
  verbatimTerm: string;
  reactionSoc: string;
  /**
   * 'serious' from the recorded event type — an AESI's from its recorded
   * seriousness criterion. 'undetermined' when the event type is missing or not
   * AE / SAE / SUSAR / AESI, or an AESI records no criterion: listed for review,
   * not counted in the tabulation's serious totals (seriousnessUndetermined).
   */
  seriousness: 'serious' | 'undetermined';
  /** What was not recorded when seriousness is undetermined; null when serious. */
  seriousnessGap: string | null;
  seriousnessCriteria: string;
  causality: string;
  suspected: boolean;
  /** As recorded vs the IB / RSI; 'not_assessed' when no determination was recorded. */
  expectedness: ExpectednessDetermination;
  outcome: string;
  suspectProduct: string;
  /** True when this case met expedited (7-/15-day) IND safety reporting; null when its record does not decide it. */
  expedited: boolean | null;
}

/** Cumulative counts over the included serious cases (seriousness 'serious' only). */
export interface SaeSummaryTabulation {
  totalSerious: number;
  bySeriousnessCriteria: Record<string, number>;
  bySuspected: { suspected: number; notSuspected: number };
  byExpectedness: { unexpected: number; expected: number; notAssessed: number };
  /** Per MedDRA Preferred Term, total + suspected-unexpected (the SUSAR-like cut). Coded cases only. */
  byReactionPt: Array<{ reactionPt: string; total: number; suspectedUnexpected: number }>;
  /** Cases with no MedDRA PT — not in byReactionPt. */
  uncodedCount: number;
  /** Cases listed with an unknown onset date. */
  onsetUnknownCount: number;
  expeditedCount: number;
  fatalCount: number;
  /** Listed cases whose seriousness is undetermined, and what was not recorded. In none of the counts above. */
  seriousnessUndetermined: { count: number; missing: string };
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

/** A valid Date, or null for an absent / unknown / unparseable value. */
function validDate(d: Date | string | undefined | null): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** True when `onset` falls within the inclusive [start, end] window. */
function inPeriod(onset: Date, start: Date, end: Date): boolean {
  const t = onset.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** A MedDRA term as coded, or null when the case carries none. */
function codedPt(pt: string | null | undefined): string | null {
  return typeof pt === 'string' && pt.trim() !== '' ? pt.trim() : null;
}

/** What a case of undetermined seriousness does not record. */
const SERIOUSNESS_GAP = {
  eventType: 'event type (AE, SAE, SUSAR or AESI)',
  aesiCriterion: 'seriousness criterion (ICH E2A) of an AESI',
} as const;

/** The gap behind an undetermined seriousness (2026-10-15: every AESI was listed serious). */
function seriousnessGap(e: AdverseEvent): string | null {
  if (isSerious(e) === true) return null;
  return e.eventType === 'AESI' ? SERIOUSNESS_GAP.aesiCriterion : SERIOUSNESS_GAP.eventType;
}

/**
 * Why a listed case has no onset date: stated as unknown, or not recorded.
 * 2026-10-15: both printed "unknown", and a NULL onset from the database — read
 * as 1970-01-01 — dropped the case as out of period.
 */
function onsetGap(e: AdverseEvent & { onsetDateUnknown?: boolean }, onset: Date | null): SaeLineListingRow['onsetGap'] {
  if (onset) return null;
  const raw: unknown = e.onsetDate;
  const statedUnknown = e.onsetDateUnknown === true || (typeof raw === 'string' && raw.trim().toLowerCase() === 'unknown');
  return statedUnknown ? 'unknown' : 'not recorded';
}

/** The distinct gaps of the undetermined cases; the event type when there are none. */
function undeterminedGaps(listed: SaeLineListingRow[]): string {
  const gaps = [...new Set(listed.map((r) => r.seriousnessGap).filter((g): g is string => g !== null))];
  return gaps.length > 0 ? gaps.join('; ') : SERIOUSNESS_GAP.eventType;
}

/**
 * Build the serious-AE line listing + summary tabulation for a reporting period.
 * Pure / deterministic; rows are ordered by onset date (unknown onsets last)
 * then adverse-event id. An unparseable period is refused (VALIDATION).
 */
export function buildSaeLineListing(input: BuildLineListingInput): SaeLineListing {
  const start = validDate(input.periodStart);
  const end = validDate(input.periodEnd);
  if (!start || !end) {
    // An unparseable period used to select nothing — an empty listing.
    throw new Error('VALIDATION: periodStart and periodEnd must be valid dates.');
  }

  const included = input.events.filter((e) => {
    // Recorded non-serious is out; serious and undetermined are listed.
    if (isSerious(e) === false) return false;
    const onset = validDate(e.onsetDate);
    // Unknown onset: listed and counted with onset unknown, not dropped.
    return onset === null || inPeriod(onset, start, end);
  });

  const rows: SaeLineListingRow[] = included
    .map((e) => {
      const onset = validDate(e.onsetDate);
      return {
        adverseEventId: e.id,
        patientId: e.patientId,
        countryOfOccurrence: e.countryOfOccurrence,
        onsetDate: onset ? isoDate(onset) : null,
        onsetGap: onsetGap(e, onset),
        reactionPt: codedPt(e.reactionPt),
        verbatimTerm: e.eventDescription ?? '',
        reactionSoc: e.reactionSoc ?? '',
        seriousness: isSerious(e) === true ? ('serious' as const) : ('undetermined' as const),
        seriousnessGap: seriousnessGap(e),
        seriousnessCriteria: e.seriousnessCriteria,
        causality: e.causality,
        suspected: isSuspected(e.causality),
        expectedness: expectednessDetermination(e.expectedness),
        outcome: e.outcome,
        suspectProduct: e.suspectProduct ?? '',
        expedited: e.expeditedReportRequired ?? null,
      };
    })
    .sort((a, b) => {
      if (a.onsetDate !== b.onsetDate) {
        if (a.onsetDate === null) return 1;
        if (b.onsetDate === null) return -1;
        return a.onsetDate.localeCompare(b.onsetDate);
      }
      return a.adverseEventId.localeCompare(b.adverseEventId);
    });

  return {
    reportingPeriod: { start: isoDate(start), end: isoDate(end) },
    rows,
    tabulation: tabulate(rows),
  };
}

function tabulate(listed: SaeLineListingRow[]): SaeSummaryTabulation {
  const rows = listed.filter((r) => r.seriousness === 'serious');
  const bySeriousnessCriteria: Record<string, number> = {};
  const byPt = new Map<string, { total: number; suspectedUnexpected: number }>();
  const byExpectedness = { unexpected: 0, expected: 0, notAssessed: 0 };
  let suspectedCount = 0;
  let expeditedCount = 0;
  let fatalCount = 0;
  let uncodedCount = 0;
  let onsetUnknownCount = 0;

  for (const r of rows) {
    bySeriousnessCriteria[r.seriousnessCriteria] = (bySeriousnessCriteria[r.seriousnessCriteria] ?? 0) + 1;
    if (r.suspected) suspectedCount += 1;
    if (r.expectedness === 'unexpected') byExpectedness.unexpected += 1;
    else if (r.expectedness === 'expected') byExpectedness.expected += 1;
    else byExpectedness.notAssessed += 1;
    if (r.expedited) expeditedCount += 1;
    if (r.seriousnessCriteria === 'death' || r.outcome === 'fatal') fatalCount += 1;
    if (r.onsetDate === null) onsetUnknownCount += 1;

    if (r.reactionPt === null) {
      uncodedCount += 1;
      continue;
    }
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
    byExpectedness,
    byReactionPt,
    uncodedCount,
    onsetUnknownCount,
    expeditedCount,
    fatalCount,
    seriousnessUndetermined: { count: listed.length - rows.length, missing: undeterminedGaps(listed) },
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
  'verbatim_term',
  'reaction_soc',
  'seriousness',
  'causality',
  'suspected',
  'expectedness',
  'outcome',
  'suspect_product',
  'expedited',
  'seriousness_determination',
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
        csvField(r.onsetDate ?? r.onsetGap),
        csvField(r.reactionPt),
        csvField(r.verbatimTerm),
        csvField(r.reactionSoc),
        csvField(r.seriousnessCriteria),
        csvField(r.causality),
        csvField(r.suspected),
        csvField(r.expectedness),
        csvField(r.outcome),
        csvField(r.suspectProduct),
        csvField(r.expedited ?? 'undetermined'),
        csvField(r.seriousness === 'serious' ? 'serious' : `undetermined: ${r.seriousnessGap === SERIOUSNESS_GAP.aesiCriterion ? 'AESI seriousness criterion' : 'event type'} not recorded`),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}
