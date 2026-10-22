/**
 * Expedited SAE reporting clock — 21 CFR 312.32(c) IND safety reports / ICH E2A.
 *
 * PURE, DB-FREE, DETERMINISTIC. No I/O, no Date.now() except the
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

import { calculateReportingDeadline, type SeriousnessCriteria } from '../compliance/pharmacovigilanceService';

export interface ExpeditedReportingClockInput {
  /** Date the sponsor first became aware of the event (Day 0), ISO 'YYYY-MM-DD'. */
  awarenessDate?: string | null;
  /** ICH E2A seriousness criteria (e.g. 'death', 'life-threatening', 'hospitalization', ...). Non-empty ⇒ serious. */
  seriousnessCriteria?: string[] | null;
  /** Investigator causality assessment (e.g. 'related', 'possibly related', 'not related'). */
  causality?: string | null;
  /**
   * Listedness vs reference safety information: 'unexpected' | 'expected' — a
   * closed vocabulary. Any other value ("unknown", "pending", …) is not an
   * assessment.
   */
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
  /**
   * Inputs to the determination that were NOT RECORDED, as opposed to recorded
   * and negative. A case with no seriousness assessment produced the same
   * category ('none') and the same words as a case assessed and found not
   * serious — "not serious" over a case nobody had assessed. The determination
   * is unchanged; this names what it was made without.
   */
  unassessedInputs: string[];
  /**
   * Whether the reportability verdict was DECIDED, as opposed to merely absent.
   *
   * ── WHY THIS IS NOT `unassessedInputs.length === 0` ─────────────────────────
   * Decision P-20's follow-up (docs/LAUNCH_DEFINITION_OF_DONE.md, second IND
   * pass): *"'Not determined' applies only where expectedness decides the
   * outcome. An event recorded as non-serious, or as not suspected, is not
   * expedited on those stated facts, and the verdict says so."* The canonical
   * IND engine implements it as Gate 0 —
   * `classifyIndSafetyReport` (ind-lifecycle/ind-safety-report-service.ts:314):
   * *"a stated fact that rules out an individual expedited report decides the
   * verdict without expectedness"*.
   *
   * This clock had no such gate, so a case RECORDED as not serious with
   * expectedness and causality still blank reported two unassessed inputs — and
   * a reader that treated any unassessed input as "no determination" headed a
   * decided case "Reportability not determined". That is the mirror of the
   * defect the field exists to close, and it reached the UI on 2026-10-12
   * before this gate was added.
   *
   * So the two facts are separate and both are reported: `unassessedInputs` is
   * what the determination was made WITHOUT, and this is whether there IS one.
   */
  reportabilityDetermined: boolean;
}

const MS_PER_DAY = 86_400_000;

/** Suspected = a reasonable possibility the drug caused the event (ICH E2A). */
const SUSPECTED_CAUSALITIES = new Set(['related', 'probably related', 'possibly related']);
/** Seriousness criteria that establish the fatal / life-threatening branch. */
const FATAL_OR_LIFE_THREATENING_CRITERIA = new Set(['death', 'fatal', 'life-threatening', 'life threatening']);
/** The only expectedness determinations (normalized). */
const EXPECTEDNESS_VALUES = new Set(['expected', 'unexpected']);

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

/** The case's most severe criterion in the canonical vocabulary (death, then
 *  life-threatening, then the first recorded), or null when none maps. */
function canonicalCriterion(criteria: string[], fatalOutcome: boolean): SeriousnessCriteria | null {
  const spelled = criteria.map((c) => (c === 'fatal' ? 'death' : c.replace(/[\s-]+/g, '_')));
  if (fatalOutcome || spelled.includes('death')) return 'death';
  if (spelled.includes('life_threatening')) return 'life_threatening';
  return (spelled[0] as SeriousnessCriteria | undefined) ?? null;
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

  // Absent (null/undefined) is "not assessed"; a recorded empty list is
  // "assessed, no criterion met". Both yield the same determination — only the
  // stated reason differs, and only one of them is true of an unassessed case.
  const seriousnessAssessed = input.seriousnessCriteria != null;
  // 2026-10-15: any non-empty text counted as assessed, and anything but
  // "unexpected" as listed — so "unknown" (which the PV intake stores) read
  // "not unexpected (listed)", decided. Closed vocabulary, as the IND engine's.
  const expectednessText = normalize(input.expectedness);
  const expectednessAssessed = EXPECTEDNESS_VALUES.has(expectednessText);
  const causalityAssessed = Boolean(normalize(input.causality));
  const unassessedInputs: string[] = [];
  if (!seriousnessAssessed) unassessedInputs.push('seriousness');
  if (!expectednessAssessed) unassessedInputs.push('expectedness');
  if (!causalityAssessed) unassessedInputs.push('causality');

  const isSerious = criteria.length > 0;
  const isFatalOrLifeThreatening =
    criteria.some((c) => FATAL_OR_LIFE_THREATENING_CRITERIA.has(c)) || normalize(input.outcome) === 'fatal';
  const isUnexpected = expectednessText === 'unexpected';
  const isSuspected = SUSPECTED_CAUSALITIES.has(normalize(input.causality));

  /* Gate 0, the same semantics as `classifyIndSafetyReport`'s (P-20 follow-up):
     a STATED fact that rules out an individual expedited report decides the
     verdict without expectedness. Recorded-and-negative is a fact; absent is
     not — so this reads the `*Assessed` flags, never the bare booleans. */
  const ruledOutOnStatedFacts = (seriousnessAssessed && !isSerious) || (causalityAssessed && !isSuspected);

  // ── Category (the regulatory determination) ──────────────────────────────
  let category: ExpeditedReportingCategory;
  let basis: string;

  if (isSerious && isUnexpected && isSuspected && isFatalOrLifeThreatening) {
    category = '7-day';
    basis = 'Serious + unexpected + suspected causality + fatal/life-threatening → 7-calendar-day IND safety report (21 CFR 312.32(c)(1)(i)).';
  } else if (isSerious && isUnexpected && isSuspected) {
    category = '15-day';
    basis = 'Serious + unexpected + suspected causality (not fatal/life-threatening) → 15-calendar-day IND safety report (21 CFR 312.32(c)(1)(i)).';
  } else {
    category = 'none';
    const missing: string[] = [];
    if (!isSerious) missing.push(seriousnessAssessed ? 'not serious' : 'seriousness not assessed');
    if (!isUnexpected) {
      missing.push(
        expectednessAssessed
          ? 'not unexpected (listed)'
          : expectednessText
            ? `expectedness not assessed ("${String(input.expectedness).trim()}" is not a determination)`
            : 'expectedness not assessed',
      );
    }
    if (!isSuspected) missing.push(causalityAssessed ? 'no suspected causality' : 'causality not assessed');
    /* The disclaimer belongs only where there is no determination. On a case
       ruled out on its stated facts it contradicted its own first clause: the
       verdict IS that the case is not expedited, and naming the inputs nobody
       filled in does not unmake it. */
    const determined = ruledOutOnStatedFacts || unassessedInputs.length === 0;
    basis = determined
      ? `No expedited reporting clock — ${missing.join(', ') || 'criteria not met'}.` +
        (unassessedInputs.length > 0
          ? ` Decided on the facts recorded; ${unassessedInputs.join(', ')} ${unassessedInputs.length === 1 ? 'is' : 'are'} not assessed and does not change it.`
          : '')
      : `No expedited reporting clock has been established — ${missing.join(', ')}. This is NOT a determination that the case is non-reportable: ${unassessedInputs.join(', ')} ${unassessedInputs.length === 1 ? 'has' : 'have'} not been assessed.`;
  }

  // ── Anchor the clock (fail safe when awareness date is missing/invalid) ───
  const startMs = parseUtcDay(input.awarenessDate);

  if (category === 'none') {
    return {
      category, clockStart: null, dueDate: null, daysRemaining: null, overdue: false, basis, unassessedInputs,
      reportabilityDetermined: ruledOutOnStatedFacts || unassessedInputs.length === 0,
    };
  }

  if (startMs === null) {
    return {
      category,
      clockStart: null,
      dueDate: null,
      daysRemaining: null,
      overdue: false,
      basis: `${basis} Awareness (Day 0) date is missing — due date cannot be anchored.`,
      unassessedInputs,
      /* A running category IS a determination: the clock exists, only its
         anchor is missing. */
      reportabilityDetermined: true,
    };
  }

  /* 2026-10-15: this added its own 7 / 15 days here — a second copy of the
     expedited window rule. The due date is now the canonical rule's
     (calculateReportingDeadline, IND → FDA region), from the case's most
     severe criterion; a criterion that rule does not take gives no due date. */
  const { deadline, reason } = calculateReportingDeadline(
    'SUSAR', canonicalCriterion(criteria, normalize(input.outcome) === 'fatal'), 'FDA', new Date(startMs),
  );
  if (!deadline) {
    return {
      category, clockStart: formatUtcDay(startMs), dueDate: null, daysRemaining: null, overdue: false,
      basis: `${basis} Due date not determined: ${reason}.`, unassessedInputs, reportabilityDetermined: true,
    };
  }
  const dueMs = startMs + Math.round((deadline.getTime() - startMs) / MS_PER_DAY) * MS_PER_DAY;
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
    unassessedInputs,
    reportabilityDetermined: true,
  };
}
