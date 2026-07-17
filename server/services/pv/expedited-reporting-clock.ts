/**
 * Expedited SAE reporting clock — 21 CFR 312.32(c) IND safety reports / ICH E2A.
 *
 * PURE, DB-FREE, DETERMINISTIC. No imports, no I/O, no Date.now() except the
 * injectable `today` argument (defaulted). This is patient-safety-critical: the
 * output drives when an IND safety report is legally due, so every branch is
 * unit-tested and the module never claims a deadline it cannot anchor.
 *
 * THE RULE (implemented exactly):
 *  - Day 0 = the date the SPONSOR FIRST BECAME AWARE of the event (awareness /
 *    receipt date), NOT the onset date. Without an awareness date we can still
 *    classify the category, but we return NULL due date / days-remaining and
 *    overdue=false (fail safe — never assert a clock we cannot start).
 *  - 7 calendar days:  serious AND unexpected AND suspected causality AND
 *                      (fatal OR life-threatening).
 *  - 15 calendar days: serious AND unexpected AND suspected causality, but NOT
 *                      fatal/life-threatening.
 *  - otherwise:        'none' (no expedited clock).
 *
 * "Suspected causality" applies the ICH E2A "reasonable possibility" standard:
 * related / probably related / possibly related are suspected; unlikely related
 * and not related are not. "Unexpected" (listedness vs the reference safety
 * information) is a distinct, supplied fact — never inferred here.
 *
 * Calendar-day arithmetic is done in UTC so day counts are deterministic and
 * unaffected by DST/local-zone drift; both the awareness date and `today` are
 * reduced to their UTC calendar day before differencing.
 */

export interface ExpeditedReportingClockInput {
  /** Date the sponsor first became aware of the event (Day 0), ISO 'YYYY-MM-DD'. */
  awarenessDate?: string | null;
  /** ICH E2A seriousness criteria (e.g. 'death', 'life-threatening', 'hospitalization', ...). Non-empty ⇒ serious. */
  seriousnessCriteria?: string[] | null;
  /** Investigator causality assessment (e.g. 'related', 'possibly related', 'not related'). */
  causality?: string | null;
  /** Listedness vs reference safety information: 'unexpected' | 'expected'. A distinct supplied fact. */
  expectedness?: string | null;
  /** Case outcome (e.g. 'fatal', 'recovered'); 'fatal' also establishes the fatal branch. */
  outcome?: string | null;
}

export type ExpeditedReportingCategory = '7-day' | '15-day' | 'none';

export interface ExpeditedReportingClockResult {
  category: ExpeditedReportingCategory;
  /** Day 0 (awareness date, 'YYYY-MM-DD') when an expedited clock is running and anchorable; else null. */
  clockStart: string | null;
  /** Regulatory due date ('YYYY-MM-DD'); null when category is 'none' or the awareness date is missing/invalid. */
  dueDate: string | null;
  /** Calendar days from `today` to the due date (0 = due today, negative = past due); null when no due date. */
  daysRemaining: number | null;
  /** True only when an expedited clock has a due date and `today` is strictly past it. */
  overdue: boolean;
  /** Human-readable explanation of the determination (for audit / display). */
  basis: string;
}

const MS_PER_DAY = 86_400_000;

/** Suspected = a reasonable possibility the drug caused the event (ICH E2A). */
const SUSPECTED_CAUSALITIES = new Set(['related', 'probably related', 'possibly related']);
/** Seriousness criteria that establish the fatal / life-threatening branch. */
const FATAL_OR_LIFE_THREATENING_CRITERIA = new Set(['death', 'fatal', 'life-threatening', 'life threatening']);

function normalize(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase();
}

/** Parse a strict 'YYYY-MM-DD' (optionally with trailing time) into a UTC-midnight epoch ms, or null. */
function parseUtcDay(value: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  // Reject non-round-trip dates (e.g. 2026-02-30 rolling into March).
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms;
}

/** Reduce a Date to its UTC calendar-day midnight epoch ms. */
function utcDayOf(dt: Date): number {
  return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

/** Format a UTC-midnight epoch ms as 'YYYY-MM-DD'. */
function formatUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Compute the expedited reporting clock for a single SAE case.
 *
 * @param input case facts (awareness date + seriousness / causality / expectedness / outcome)
 * @param today injectable "now" for deterministic testing; defaults to `new Date()`
 */
export function computeExpeditedReportingClock(
  input: ExpeditedReportingClockInput,
  today: Date = new Date(),
): ExpeditedReportingClockResult {
  const criteria = Array.isArray(input.seriousnessCriteria)
    ? input.seriousnessCriteria.map(normalize).filter(Boolean)
    : [];

  const isSerious = criteria.length > 0;
  const isFatalOrLifeThreatening =
    criteria.some((c) => FATAL_OR_LIFE_THREATENING_CRITERIA.has(c)) || normalize(input.outcome) === 'fatal';
  const isUnexpected = normalize(input.expectedness) === 'unexpected';
  const isSuspected = SUSPECTED_CAUSALITIES.has(normalize(input.causality));

  // ── Category (the regulatory determination) ──────────────────────────────
  let category: ExpeditedReportingCategory;
  let clockDays: number | null;
  let basis: string;

  if (isSerious && isUnexpected && isSuspected && isFatalOrLifeThreatening) {
    category = '7-day';
    clockDays = 7;
    basis = 'Serious + unexpected + suspected causality + fatal/life-threatening → 7-calendar-day IND safety report (21 CFR 312.32(c)(1)(i)).';
  } else if (isSerious && isUnexpected && isSuspected) {
    category = '15-day';
    clockDays = 15;
    basis = 'Serious + unexpected + suspected causality (not fatal/life-threatening) → 15-calendar-day IND safety report (21 CFR 312.32(c)(1)(i)).';
  } else {
    category = 'none';
    clockDays = null;
    const missing: string[] = [];
    if (!isSerious) missing.push('not serious');
    if (!isUnexpected) missing.push('not unexpected (listed)');
    if (!isSuspected) missing.push('no suspected causality');
    basis = `No expedited reporting clock — ${missing.join(', ') || 'criteria not met'}.`;
  }

  // ── Anchor the clock (fail safe when awareness date is missing/invalid) ───
  const startMs = parseUtcDay(input.awarenessDate);

  if (category === 'none') {
    return { category, clockStart: null, dueDate: null, daysRemaining: null, overdue: false, basis };
  }

  if (startMs === null) {
    return {
      category,
      clockStart: null,
      dueDate: null,
      daysRemaining: null,
      overdue: false,
      basis: `${basis} Awareness (Day 0) date is missing — due date cannot be anchored.`,
    };
  }

  const dueMs = startMs + (clockDays as number) * MS_PER_DAY;
  const todayMs = utcDayOf(today);
  const daysRemaining = Math.round((dueMs - todayMs) / MS_PER_DAY);
  const overdue = todayMs > dueMs;

  return {
    category,
    clockStart: formatUtcDay(startMs),
    dueDate: formatUtcDay(dueMs),
    daysRemaining,
    overdue,
    basis,
  };
}
