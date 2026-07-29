/**
 * Lifecycle obligations calendar — recurring post-approval obligations per market.
 *
 * Once a product is approved, the marketing-authorisation holder inherits a stream
 * of recurring, time-driven regulatory obligations — periodic safety reports,
 * annual reports, renewals, re-examination, post-marketing vigilance — each with a
 * market-specific cadence anchored to the approval/launch date. Missing one is a
 * compliance event. This service encodes the modeled obligations per market and
 * projects a concrete due-date calendar from an approval date — deterministically.
 *
 * Markets: FDA (US), EMA (EU centralised), PMDA (JP).
 *
 * Pure / deterministic — no DB, no IO, no Date.now. Every due date is derived from
 * the supplied approvalDate. The encoded cadences are *indicative defaults* only:
 * the EU EURD list, the FDA REMS program design, and the PMDA re-examination
 * designation set the binding schedule for a given product — confirm per product.
 *
 * References:
 *  - FDA: Periodic Adverse Drug Experience Reports (PADERs) — quarterly for the
 *    first 3 years after approval, then annually (21 CFR 314.80(c)(2)); NDA/BLA
 *    Annual Report (21 CFR 314.81(b)(2)); REMS assessments at FDA-defined intervals
 *    (commonly 18 months, 3 years, 7 years) (FDAAA §505-1, 21 USC 355-1).
 *  - EU: Periodic Safety Update Reports per the EURD list — default new-product
 *    cadence every 6 months for 2 years, then annually for years 3–4, then every
 *    3 years (Dir 2001/83/EC Art 107c; Reg (EU) 1235/2010); marketing-authorisation
 *    renewal at 5 years, then usually unlimited validity (Dir 2001/83/EC Art 24).
 *  - PMDA: Early Post-marketing Phase Vigilance (EPPV) for the first 6 months after
 *    launch; periodic safety reporting; re-examination application at the end of the
 *    re-examination period (default 8 years for a new active ingredient) (PMD Act;
 *    GVP/GPSP ministerial ordinances).
 *
 * @module server/services/global-ri/lifecycle-obligations-calendar
 */

export type Market = 'FDA' | 'EMA' | 'PMDA';

export interface Obligation {
  /** Stable identifier (e.g. 'pader_periodic', 'psur', 'reexamination'). */
  id: string;
  /** Human-readable obligation name. */
  name: string;
  /** Human-readable cadence label. */
  cadence: string;
  /** Months after approval the FIRST occurrence is due. */
  firstDueMonths: number;
  /** Recurring interval in months; 0 or null = one-off. */
  intervalMonths: number | null;
  /** Governing citation. */
  citation: string;
  /** Optional honest caveat / modeling note for this obligation. */
  note?: string;
}

const FDA_OBLIGATIONS: Obligation[] = [
  {
    id: 'pader_periodic',
    name: 'Periodic Adverse Drug Experience Report (PADER)',
    cadence: 'Quarterly for the first 3 years after approval, then annually',
    firstDueMonths: 3,
    intervalMonths: 3,
    citation: '21 CFR 314.80(c)(2)',
    note: 'Modeled as quarterly (every 3 months); the cadence converts to annual after the first 3 years post-approval, and a holder may also be on the ICH PADER/PBRER pathway.',
  },
  {
    id: 'annual_report',
    name: 'NDA/BLA Annual Report',
    cadence: 'Annually',
    firstDueMonths: 12,
    intervalMonths: 12,
    citation: '21 CFR 314.81(b)(2)',
  },
  {
    id: 'rems_assessment',
    name: 'REMS assessment',
    cadence: 'At FDA-defined intervals (commonly 18 months, 3 years, 7 years)',
    firstDueMonths: 18,
    intervalMonths: null,
    citation: 'FDAAA §505-1 (21 USC 355-1)',
    note: 'Only applies if a REMS is required; the assessment schedule is program-specific (commonly 18 months, 3 years, and 7 years) — only the first (18-month) milestone is modeled here.',
  },
];

const EMA_OBLIGATIONS: Obligation[] = [
  {
    id: 'psur',
    name: 'Periodic Safety Update Report (PSUR)',
    cadence: 'Per the EURD list; default new-product cadence every 6 months for 2 years, then annually (yrs 3–4), then every 3 years',
    firstDueMonths: 6,
    intervalMonths: 6,
    citation: 'Dir 2001/83/EC Art 107c; Reg (EU) 1235/2010',
    note: 'The EU reference dates and frequencies (EURD) list governs the binding PSUR cadence and data-lock points; the 6-month default modeled here will not match a product whose EURD entry sets a longer cycle — confirm against the EURD list.',
  },
  {
    id: 'renewal',
    name: 'Marketing-authorisation renewal',
    cadence: 'At 5 years; usually unlimited validity thereafter',
    firstDueMonths: 60,
    intervalMonths: null,
    citation: 'Dir 2001/83/EC Art 24',
    note: 'A single renewal at 5 years; after renewal the authorisation is usually valid for an unlimited period unless the agency requires a further 5-year renewal on pharmacovigilance grounds.',
  },
];

const PMDA_OBLIGATIONS: Obligation[] = [
  {
    id: 'eppv',
    name: 'Early Post-marketing Phase Vigilance (EPPV)',
    cadence: 'First 6 months after launch',
    firstDueMonths: 6,
    intervalMonths: null,
    citation: 'PMD Act; GVP ministerial ordinance',
    note: 'EPPV runs intensively over the first 6 months after launch; the 6-month milestone marks the end of the EPPV period.',
  },
  {
    id: 'periodic_safety_report',
    name: 'Periodic safety report (periodic infection/ADR reporting)',
    cadence: 'Annually',
    firstDueMonths: 12,
    intervalMonths: 12,
    citation: 'PMD Act; GVP/GPSP ministerial ordinances',
  },
  {
    id: 'reexamination',
    name: 'Re-examination application',
    cadence: 'At the end of the re-examination period (default 8 years for a new active ingredient)',
    firstDueMonths: 96,
    intervalMonths: null,
    citation: 'PMD Act (re-examination)',
    note: 'A one-off application at the end of the re-examination period; the period is set at designation (default 8 years for a new active ingredient, 10 years for an orphan drug, ~4–6 years for a new indication) — confirm the designated period.',
  },
];

const OBLIGATIONS: Record<Market, Obligation[]> = {
  FDA: FDA_OBLIGATIONS,
  EMA: EMA_OBLIGATIONS,
  PMDA: PMDA_OBLIGATIONS,
};

const MARKET_CITATION: Record<Market, string> = {
  FDA: '21 CFR 314.80(c)(2); 21 CFR 314.81(b)(2); FDAAA §505-1 (21 USC 355-1)',
  EMA: 'Dir 2001/83/EC Art 107c (PSUR/EURD); Dir 2001/83/EC Art 24 (renewal)',
  PMDA: 'PMD Act; GVP/GPSP ministerial ordinances',
};

const CADENCE_CAVEAT =
  'Cadences are indicative defaults — the EU EURD list, the FDA REMS program design, and the PMDA re-examination designation set the binding schedule; confirm per product.';

/**
 * Add `months` to an ISO (yyyy-mm-dd) date in UTC, clamping month overflow to the
 * last valid day of the target month (e.g. Jan 31 + 1 month → Feb 28/29). Pure.
 * Throws for an invalid date string.
 */
function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid approvalDate "${iso}" (expected yyyy-mm-dd).`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Guard month overflow (e.g. Jan 31 + 1 month) by clamping to the last valid day.
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export interface ObligationsCatalog {
  market: Market;
  obligations: Obligation[];
  citation: string;
  notes: string[];
}

/**
 * List the modeled recurring lifecycle obligations for a market (reference).
 * Pure / deterministic. Throws for an unmodeled market.
 */
export function getLifecycleObligations(market: Market): ObligationsCatalog {
  const obligations = OBLIGATIONS[market];
  if (!obligations) throw new Error(`No lifecycle obligations modeled for market "${market}".`);
  return {
    market,
    obligations,
    citation: MARKET_CITATION[market],
    notes: [CADENCE_CAVEAT],
  };
}

export interface ObligationScheduleInput {
  market: Market;
  /** Approval (or launch) date in ISO yyyy-mm-dd; the calendar anchor. */
  approvalDate: string;
  /** Project obligations due within this many months of approval (default 60). */
  horizonMonths?: number;
}

export interface ScheduleEntry {
  obligationId: string;
  name: string;
  /** Due date in ISO yyyy-mm-dd. */
  dueDate: string;
  /** 1-based occurrence index for the obligation. */
  occurrence: number;
}

export interface ObligationSchedule {
  market: Market;
  approvalDate: string;
  horizonMonths: number;
  entries: ScheduleEntry[];
  notes: string[];
}

/**
 * Project a concrete due-date calendar for a market's lifecycle obligations from an
 * approval date, out to a horizon (default 60 months).
 *
 * For each obligation the first occurrence is at approvalDate + firstDueMonths. If
 * intervalMonths is a positive number, recurring occurrences are added every
 * intervalMonths until the due date exceeds the horizon; if intervalMonths is
 * null/0 the obligation is a one-off (included only if within the horizon).
 *
 * Entries are sorted by dueDate ascending (stable). Pure / deterministic — every
 * date is derived from approvalDate. Throws for an unmodeled market or an invalid
 * approvalDate.
 */
export function computeObligationSchedule(input: ObligationScheduleInput): ObligationSchedule {
  const obligations = OBLIGATIONS[input.market];
  if (!obligations) throw new Error(`No lifecycle obligations modeled for market "${input.market}".`);

  const horizonMonths = input.horizonMonths ?? 60;
  // Validate the approval date eagerly (addMonthsIso also throws, but anchor it once).
  const horizonDate = addMonthsIso(input.approvalDate, horizonMonths);

  const raw: { entry: ScheduleEntry; order: number }[] = [];
  let order = 0;

  for (const o of obligations) {
    const interval = o.intervalMonths && o.intervalMonths > 0 ? o.intervalMonths : null;
    let occurrence = 1;
    let monthsOut = o.firstDueMonths;
    // Loop occurrences; for a one-off (interval === null) this runs at most once.
    while (true) {
      const dueDate = addMonthsIso(input.approvalDate, monthsOut);
      if (dueDate > horizonDate) break;
      raw.push({
        entry: { obligationId: o.id, name: o.name, dueDate, occurrence },
        order: order++,
      });
      if (interval === null) break;
      occurrence += 1;
      monthsOut += interval;
    }
  }

  // Stable sort by dueDate ascending: ties keep insertion order via the order key.
  raw.sort((a, b) => (a.entry.dueDate < b.entry.dueDate ? -1 : a.entry.dueDate > b.entry.dueDate ? 1 : a.order - b.order));
  const entries = raw.map((r) => r.entry);

  return {
    market: input.market,
    approvalDate: input.approvalDate,
    horizonMonths,
    entries,
    notes: [
      CADENCE_CAVEAT,
      'Due dates are anchored to the supplied approval/launch date; recurring obligations whose cadence steps down over time (e.g. FDA PADER quarterly→annual, EU PSUR 6-monthly→annual→3-yearly) are modeled at their initial cadence only — confirm the actual data-lock points.',
    ],
  };
}

/** The markets modeled by this service. */
export const LIFECYCLE_MARKETS: Market[] = ['FDA', 'EMA', 'PMDA'];
