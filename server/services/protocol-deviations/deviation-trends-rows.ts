/**
 * Row reading for the protocol-deviation trend — what each protocol_deviations
 * row can honestly be counted as, decided before any month, share or signal
 * is computed. The trend itself is ./deviation-trends.
 *
 * ## The industry need
 * ICH E6(R3) risk-based quality management trends deviations as a quality
 * signal; a trend is only as honest as the values it counts. This platform's
 * deviation writer was replaced on 2026-09-23 (commit eeb44a554,
 * migrations/20260922f_protocol_deviation_assessment.sql). Before that it
 * stored severity 'minor' and category 'other' for a deviation recorded
 * without them, and computed is_reportable from those defaults with an
 * unrecorded safety impact read as "no". The migration did not rewrite those
 * rows, because a stored 'minor' cannot be told from a real assessment. A
 * trend that counts them as recorded makes an assessment nobody made.
 *
 * ## The honesty contract
 *  - All date reading is in UTC calendar days. A timestamp with no zone
 *    designator is read as UTC. Nothing is read in the host's local zone.
 *  - A value that may be the replaced writer's default is SET ASIDE. The row
 *    stays in its month's total but in no severity, category or reportability
 *    count, and it is named. The rules are in `legacyFlags`.
 *  - A value outside the vocabulary of ./protocol-deviations-logic (category,
 *    severity, status) is not used and is named. It is never coerced.
 *  - A row whose id is not a safe integer cannot be told apart or named. It is
 *    counted in nothing, and the number of such rows is stated. An id
 *    supplied more than once is counted once when every copy is identical.
 *    When the copies differ, which one is the record is not known, so the id
 *    is counted in nothing. Either way the id is named.
 *  - Output order is by id (a total order on safe integers), so the result
 *    does not depend on input order. The input is never mutated.
 *
 * @module server/services/protocol-deviations/deviation-trends-rows
 */

import {
  DEVIATION_CATEGORIES,
  DEVIATION_SEVERITIES,
  DEVIATION_STATUSES,
  inVocabulary,
  type DeviationCategory,
  type DeviationSeverity,
  type DeviationStatus,
} from './protocol-deviations-logic';

/**
 * The last UTC day on which a row may carry the replaced writer's defaults.
 * Commit eeb44a554 removed `?? 'minor'` / `?? 'other'` and the column defaults
 * (migrations/20260922f). It is dated 2026-09-23T15:35:13Z, so rows recorded
 * on that whole day are included. The repository does not record when the
 * change reached a given database. A database migrated later can hold
 * defaulted rows recorded after this date. Where `assessedAt` is supplied, a
 * stored `is_reportable = false` with no assessment is detected whatever its
 * date, because the current writer never stores false without an assessment.
 */
export const LEGACY_DEFAULTS_THROUGH = '2026-09-23';
/** Where the legacy defaults come from, cited in every note about them. */
export const LEGACY_DEFAULTS_SOURCE =
  `the deviation writer replaced on ${LEGACY_DEFAULTS_THROUGH} (commit eeb44a554; migrations/20260922f_protocol_deviation_assessment.sql)`;

/** How many ids a note or an evidence field lists before it states the remainder. */
export const MAX_LISTED_IDS = 50;

// ─── Contract ────────────────────────────────────────────────────────────────

/** One protocol_deviations row as the trend reads it. */
export interface DeviationRow {
  id: number;
  /** protocol_deviations.category (nullable). null = not recorded. */
  category: DeviationCategory | null;
  /** protocol_deviations.severity (nullable). null = not assessed — never read as minor. */
  severity: DeviationSeverity | null;
  status: DeviationStatus;
  /**
   * protocol_deviations.is_reportable (nullable): whether a PROMPT IRB REPORT is
   * indicated. It is not whether the deviation is reported at all: every
   * deviation is documented and reported to the sponsor. null = not
   * determined, never read as false.
   */
  isReportable: boolean | null;
  /** protocol_deviations.created_at, ISO timestamp. */
  createdAt: string;
  /**
   * protocol_deviations.assessed_at (20260922f): when a person recorded the
   * severity and safety assessment. null = no assessment recorded. Absent =
   * not supplied, in which case a legacy default is detected by record date
   * alone and a note says so.
   */
  assessedAt?: string | null;
  /** No column records when a deviation closed. Absent/null = not known. */
  closedAt?: string | null;
  /** Linked protocol_capa_actions with status open|in_progress. Absent/null = not known, never 0. */
  capaActionsOpen?: number | null;
  /** All linked protocol_capa_actions. Absent/null = not known, never 0. */
  capaActionsTotal?: number | null;
}

export const CATEGORIES: readonly DeviationCategory[] = DEVIATION_CATEGORIES;
export const SEVERITIES: readonly DeviationSeverity[] = DEVIATION_SEVERITIES;


// ─── Dates (UTC only) ────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const TS_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Day number since 1970-01-01 (UTC) of a real calendar date, else null. */
function calendarDay(y: number, m: number, d: number): number | null {
  const ms = Date.UTC(y, m - 1, d);
  const probe = new Date(ms);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return ms / DAY_MS;
}

/** Offset in minutes east of UTC; null when malformed. No designator = UTC. */
function offsetMinutes(zone: string | undefined): number | null {
  if (!zone || zone.toUpperCase() === 'Z') return 0;
  const sign = zone[0] === '-' ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  const h = Number(digits.slice(0, 2));
  const m = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  if (h > 23 || m > 59) return null;
  return sign * (h * 60 + m);
}

/** UTC day number of an ISO date or timestamp; null when it cannot be read. */
export function utcDayOf(iso: unknown): number | null {
  const m = typeof iso === 'string' ? TS_RE.exec(iso.trim()) : null;
  if (!m) return null;
  const day = calendarDay(Number(m[1]), Number(m[2]), Number(m[3]));
  const hh = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const ss = Number(m[6] ?? 0);
  const off = offsetMinutes(m[8]);
  if (day === null || off === null || hh > 23 || mi > 59 || ss > 59) return null;
  const minutesUtc = hh * 60 + mi - off;
  return day + Math.floor(minutesUtc / 1440);
}

export function monthKeyOfIndex(monthIndex: number): string {
  const y = Math.floor(monthIndex / 12);
  const mo = monthIndex - y * 12 + 1;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`;
}

/** UTC day number of the first day of a month index (year × 12 + month0). */
export function firstDayOfMonthIndex(monthIndex: number): number {
  const y = Math.floor(monthIndex / 12);
  return Date.UTC(y, monthIndex - y * 12, 1) / DAY_MS;
}

export function monthIndexOfDay(day: number): number {
  const d = new Date(day * DAY_MS);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function isoOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

const LEGACY_LAST_DAY = utcDayOf(LEGACY_DEFAULTS_THROUGH) as number;

// ─── Classification ──────────────────────────────────────────────────────────

/** Stored values set aside as possibly the replaced writer's default. */
export interface LegacyFlags { minor: boolean; other: boolean; notReportable: boolean }

export interface Classified {
  row: DeviationRow;
  /** The category counted; null when unrecorded, unrecognised, or a legacy 'other' set aside. */
  category: DeviationCategory | null;
  /** The severity counted; null when unassessed, unrecognised, or a legacy 'minor' set aside. */
  severity: DeviationSeverity | null;
  /** Prompt IRB report indicated; null when undetermined or a legacy false set aside. */
  reportable: boolean | null;
  /** null = unrecognised status: neither open nor closed. */
  status: DeviationStatus | null;
  /** UTC day the deviation was recorded; null when createdAt cannot be read. */
  day: number | null;
  /** An assessment is recorded (true) or not (false); null = assessedAt absent or unreadable. */
  assessed: boolean | null;
  legacy: LegacyFlags;
}

function assessmentRecorded(v: unknown): boolean | null {
  if (v === null) return false;
  return utcDayOf(v) !== null ? true : null;
}

/**
 * The legacy-default rules. Each is fail-closed: a value that may be a
 * default is not counted as a recorded one.
 *  - is_reportable false with NO assessment recorded. The current writer
 *    stores false only together with an assessment, so this is the old
 *    writer's value. That writer read an unrecorded safety impact as "no",
 *    which the current logic (assessReportability) does not. So a prompt IRB
 *    report is not determined for the row. When assessedAt is not supplied,
 *    the rule falls back to the record date.
 *  - severity 'minor' with no assessment recorded, on a row the old writer
 *    wrote. Either the row is dated on or before LEGACY_DEFAULTS_THROUGH, or
 *    it carries the is_reportable fingerprint above.
 *  - category 'other' on a row the old writer wrote. The current assessment
 *    does not touch category, so a later assessment does not confirm it.
 */
function legacyFlags(row: DeviationRow, day: number | null, assessed: boolean | null): LegacyFlags {
  const oldEra = day !== null && day <= LEGACY_LAST_DAY;
  const notReportable = row.isReportable === false && (assessed === false || (assessed === null && oldEra));
  const oldWriter = oldEra || notReportable;
  return {
    notReportable,
    minor: row.severity === 'minor' && assessed !== true && oldWriter,
    other: row.category === 'other' && oldWriter,
  };
}

function classify(row: DeviationRow): Classified {
  const day = utcDayOf(row.createdAt);
  const assessed = assessmentRecorded(row.assessedAt);
  const legacy = legacyFlags(row, day, assessed);
  return {
    row,
    category: inVocabulary(DEVIATION_CATEGORIES, row.category) && !legacy.other ? row.category : null,
    severity: inVocabulary(DEVIATION_SEVERITIES, row.severity) && !legacy.minor ? row.severity : null,
    reportable: typeof row.isReportable === 'boolean' && !legacy.notReportable ? row.isReportable : null,
    status: inVocabulary(DEVIATION_STATUSES, row.status) ? row.status : null,
    day,
    assessed,
    legacy,
  };
}

/** Lists at most MAX_LISTED_IDS items and states the remainder. */
export function capList(items: string[]): string {
  const rest = items.length - MAX_LISTED_IDS;
  return items.slice(0, MAX_LISTED_IDS).join(', ') + (rest > 0 ? `, … (+${rest} more)` : '');
}

export const idList = (xs: Classified[]): string => capList(xs.map((x) => `#${x.row.id}`));

const idsOf = (ids: number[]): string => capList([...ids].sort((a, b) => a - b).map((id) => `#${id}`));

/** Every field the trend reads. Absent and null are kept apart where they mean different things. */
function rowKey(r: DeviationRow): string {
  return JSON.stringify([
    r.category ?? null, r.severity ?? null, r.status ?? null, r.isReportable ?? null, r.createdAt ?? null,
    r.assessedAt === undefined ? 'absent' : r.assessedAt, r.closedAt ?? null, r.capaActionsOpen ?? null, r.capaActionsTotal ?? null,
  ]);
}

export interface RowReading { all: Classified[]; gaps: string[] }

/** Identify, de-duplicate and classify the rows; order by id. Never mutates `rows`. */
export function readRows(rows: readonly DeviationRow[]): RowReading {
  const gaps: string[] = [];
  const byId = new Map<number, DeviationRow[]>();
  let invalid = 0;
  for (const r of rows) {
    if (r === null || typeof r !== 'object' || !Number.isSafeInteger(r.id)) { invalid += 1; continue; }
    const copies = byId.get(r.id);
    if (copies) copies.push(r); else byId.set(r.id, [r]);
  }
  if (invalid > 0) {
    gaps.push(`${invalid} supplied row(s) carry no valid deviation id (a safe integer); they cannot be told apart or named, so they are counted in nothing.`);
  }
  const kept: DeviationRow[] = [];
  const repeated: number[] = [];
  const conflicting: number[] = [];
  for (const [id, copies] of byId) {
    if (copies.length === 1) kept.push(copies[0]);
    else if (new Set(copies.map(rowKey)).size === 1) { kept.push(copies[0]); repeated.push(id); } else conflicting.push(id);
  }
  if (repeated.length) gaps.push(`Deviation(s) ${idsOf(repeated)} are supplied more than once with identical content; each is counted once.`);
  if (conflicting.length) {
    gaps.push(`Deviation(s) ${idsOf(conflicting)} are supplied more than once with differing content; which copy is the record is not known, so they are counted in nothing.`);
  }
  return { all: kept.map(classify).sort((a, b) => a.row.id - b.row.id), gaps };
}

/** Rows the trend could not place, and value anomalies. They are named, never dropped silently. */
export function valueGaps(all: Classified[], todayDay: number): string[] {
  const checks: Array<[Classified[], string]> = [
    [all.filter((c) => c.day === null), 'have a createdAt that cannot be read as an ISO date; they are in no month and are not aged.'],
    [all.filter((c) => c.day !== null && c.day > todayDay), `are recorded after today (${isoOfDay(todayDay)}); they are in no month and are not aged.`],
    [all.filter((c) => c.row.category != null && !inVocabulary(DEVIATION_CATEGORIES, c.row.category)), 'carry an unrecognised category value; they are counted as uncategorised.'],
    [all.filter((c) => c.row.severity != null && !inVocabulary(DEVIATION_SEVERITIES, c.row.severity)), 'carry an unrecognised severity value; they are counted as unassessed.'],
    [all.filter((c) => c.status === null), 'carry an unrecognised status value; they are counted as neither open nor closed, are not aged, and make openWithoutActions not known.'],
    [all.filter((c) => c.assessed === null && c.row.assessedAt != null), 'carry an assessedAt that cannot be read; whether they were assessed is not known, so a possible legacy default is detected by record date alone.'],
  ];
  return checks.filter(([xs]) => xs.length > 0).map(([xs, text]) => `Deviation(s) ${idList(xs)} ${text}`);
}

/**
 * What the legacy rules set aside inside the window, and which figures that
 * moves, in which direction. Also states when detection fell back to the
 * record date because assessedAt was not supplied.
 */
export function legacyGaps(inWindow: Classified[]): string[] {
  const gaps: string[] = [];
  const count = (k: keyof LegacyFlags) => inWindow.filter((c) => c.legacy[k]).length;
  const [notRep, minor, other] = [count('notReportable'), count('minor'), count('other')];
  if (notRep) {
    gaps.push(
      `${notRep} deviation(s) in the window carry is_reportable false with no assessment recorded. That value was computed by ${LEGACY_DEFAULTS_SOURCE} from a defaulted or unassessed severity, with an unrecorded safety impact read as "no"; the current logic does not read it so. ` +
      'They are counted as not determined (reportableUndetermined, legacyDefaults.notReportable) and are outside reportableShare and denominators.reportabilityDetermined. If some were real determinations, reportableShare is overstated.',
    );
  }
  if (minor) {
    gaps.push(
      `${minor} deviation(s) in the window carry severity 'minor' with no assessment recorded, stored by ${LEGACY_DEFAULTS_SOURCE}, which wrote 'minor' for an unassessed deviation. A stored minor cannot be told from a real one. ` +
      'They are counted as unassessed (severityUnassessed, legacyDefaults.minorSeverity) and are outside majorOrCriticalShare, denominators.severityAssessed and DEV-SEVERITY-RISE. If some were real assessments, majorOrCriticalShare is overstated.',
    );
  }
  if (other) {
    gaps.push(
      `${other} deviation(s) in the window carry category 'other' stored by ${LEGACY_DEFAULTS_SOURCE}, which wrote 'other' when no category was given. ` +
      'They are counted as uncategorised (categoryUnrecorded, legacyDefaults.otherCategory) and are outside byCategory.other and DEV-CATEGORY-SPIKE on \'other\'. If some were real, byCategory.other is understated.',
    );
  }
  const dateOnly = inWindow.filter((c) => c.assessed === null && (c.row.severity === 'minor' || c.row.category === 'other' || c.row.isReportable === false));
  if (dateOnly.length) {
    gaps.push(
      `${dateOnly.length} deviation(s) in the window carry a stored minor, other or false but no readable assessedAt, so a possible default is detected by record date alone. ` +
      `Those recorded on or before ${LEGACY_DEFAULTS_THROUGH} are set aside even if assessed since. Those recorded later are counted as stored, although the date the fix reached this database is not recorded.`,
    );
  }
  return gaps;
}
