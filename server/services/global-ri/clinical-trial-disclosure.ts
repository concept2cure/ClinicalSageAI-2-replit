/**
 * Clinical-trial registration & results-disclosure expert — across markets.
 *
 * Sponsors of clinical trials carry statutory obligations to (a) register a trial
 * in a public registry and (b) disclose summary results within fixed windows. The
 * registry, the registration trigger, and the results clock differ by market, and
 * missing a deadline carries civil penalties and (for ICMJE) loss of publication
 * eligibility. This service encodes those obligations per market and projects the
 * concrete registration / results deadlines from a trial's enrollment and
 * primary-completion dates — deterministically.
 *
 * Markets: US (ClinicalTrials.gov, FDAAA 801), EU (CTIS, CTR 536/2014),
 * WHO_ICMJE (WHO ICTRP primary registry / ICMJE prospective-registration policy).
 *
 * Pure / deterministic — no DB, no IO. Timing is the statutory baseline; allowable
 * delays (e.g. unapproved product / new use under FDAAA), deferrals, exemptions,
 * and certification mechanisms apply and are not modeled here. Confirm against the
 * registry's current rules. This is an indicative planning aid.
 *
 * References:
 *  - US: FDA Amendments Act of 2007, Title VIII (FDAAA 801), codified at
 *    42 USC 282(j) — registration of an applicable clinical trial within 21 days
 *    of enrolling the first participant; results submission within 1 year of the
 *    primary completion date (delays permitted for unapproved products/new uses).
 *    42 CFR Part 11 (Final Rule, "Clinical Trials Registration and Results
 *    Information Submission").
 *  - EU: Regulation (EU) No 536/2014 (Clinical Trials Regulation, CTR), operated
 *    via the Clinical Trials Information System (CTIS). Summary of results within
 *    1 year of the end of the trial; within 6 months where the trial ends a
 *    paediatric clinical investigation. A lay-person summary is required.
 *  - WHO_ICMJE: WHO International Clinical Trials Registry Platform (ICTRP) and the
 *    WHO statement on public disclosure of results (within 12 months of completion);
 *    ICMJE requires prospective registration in a WHO ICTRP primary registry (or
 *    ClinicalTrials.gov) before the first participant is enrolled as a condition of
 *    publication.
 *
 * @module server/services/global-ri/clinical-trial-disclosure
 */

export type DisclosureMarket = 'US' | 'EU' | 'WHO_ICMJE';

export interface DisclosureRequirement {
  market: DisclosureMarket;
  /** The public registry / system used in this market. */
  registry: string;
  /** When the trial must be registered. */
  registrationTiming: string;
  /** When summary results must be disclosed. */
  resultsTiming: string;
  /** Whether a lay-person (plain-language) summary is required. */
  laySummaryRequired: boolean;
  /** Governing citation. */
  citation: string;
  notes: string[];
}

const REQUIREMENTS: Record<DisclosureMarket, DisclosureRequirement> = {
  US: {
    market: 'US',
    registry: 'ClinicalTrials.gov',
    registrationTiming: 'Within 21 days of enrolling the first participant in an applicable clinical trial.',
    resultsTiming: 'Within 1 year (365 days) of the primary completion date (delays permitted for an unapproved product or a new use of an approved product).',
    laySummaryRequired: false,
    citation: '42 USC 282(j) (FDAAA 801); 42 CFR Part 11 (Final Rule)',
    notes: [
      'Applies to "applicable clinical trials" (controlled clinical investigations, other than phase 1, of a drug/biologic, and certain device studies).',
      'Civil monetary penalties apply for non-compliance; certain results may be delayed via a certification of delay (unapproved product / new use).',
    ],
  },
  EU: {
    market: 'EU',
    registry: 'CTIS (Clinical Trials Information System)',
    registrationTiming: 'Trial information is made public via CTIS upon authorisation; registration is part of the authorisation application (no separate post-enrolment registration deadline).',
    resultsTiming: 'Summary of results within 1 year (365 days) of the end of the trial; within 6 months (182 days) where the trial ends a paediatric clinical investigation.',
    laySummaryRequired: true,
    citation: 'Regulation (EU) No 536/2014 (CTR), via CTIS',
    notes: [
      'A lay-person (plain-language) summary of results is required in addition to the technical summary.',
      'Registration is pre-authorisation through CTIS, not a post-first-enrolment trigger; the public record is published from the authorisation/decision.',
    ],
  },
  WHO_ICMJE: {
    market: 'WHO_ICMJE',
    registry: 'WHO ICTRP primary registry (or ClinicalTrials.gov)',
    registrationTiming: 'Prospective registration before the first participant is enrolled (a condition of later publication under ICMJE).',
    resultsTiming: 'Results disclosure within 12 months (365 days) of trial completion (WHO statement on public disclosure of results).',
    laySummaryRequired: false,
    citation: 'WHO ICTRP; WHO statement on public disclosure of results; ICMJE registration policy',
    notes: [
      'ICMJE will not consider for publication a trial that was not prospectively registered before enrolment of the first participant.',
      'The WHO statement also encourages disclosure of key outcomes within 12 months and publication within 24 months of completion.',
    ],
  },
};

export interface DisclosureDeadlinesInput {
  market: DisclosureMarket;
  /** Date the first participant was enrolled (ISO yyyy-mm-dd). */
  firstEnrollmentDate?: string;
  /** Primary completion / trial end date (ISO yyyy-mm-dd). */
  primaryCompletionDate?: string;
  /** Whether the trial ends a paediatric clinical investigation (EU 6-month rule). */
  pediatric?: boolean;
}

export interface DisclosureDeadlines {
  market: DisclosureMarket;
  /** Projected registration deadline (ISO) or null when not applicable / no anchor. */
  registrationDeadline: string | null;
  /** Projected results-disclosure deadline (ISO) or null when no anchor date. */
  resultsDeadline: string | null;
  notes: string[];
}

/**
 * Add N days to an ISO yyyy-mm-dd date in UTC and return yyyy-mm-dd.
 * Pure / deterministic. Throws on an invalid input date.
 */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date "${iso}" (expected yyyy-mm-dd).`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const CAVEAT =
  'Timing is the statutory baseline only — allowable delays, deferrals, exemptions, and certification mechanisms apply; confirm against the registry’s current rules.';

/**
 * Get the registration & results-disclosure requirements for a market (reference).
 * Pure / deterministic. Throws for an unmodeled market.
 */
export function getDisclosureRequirements(market: DisclosureMarket): DisclosureRequirement {
  const req = REQUIREMENTS[market];
  if (!req) throw new Error(`No clinical-trial disclosure requirements modeled for market "${market}".`);
  return req;
}

/**
 * Compute the concrete registration & results-disclosure deadlines for a trial in
 * a market from its enrollment / primary-completion dates.
 *
 *  - US: registration = firstEnrollmentDate + 21 days; results = primaryCompletionDate + 365 days.
 *  - EU: registration = null (pre-authorisation via CTIS); results = primaryCompletionDate + (pediatric ? 182 : 365) days.
 *  - WHO_ICMJE: registration = firstEnrollmentDate (must be by/before enrolment); results = primaryCompletionDate + 365 days.
 *
 * A deadline is null when its anchor date is absent. Pure / deterministic.
 * Throws for an unmodeled market.
 */
export function computeDisclosureDeadlines(input: DisclosureDeadlinesInput): DisclosureDeadlines {
  if (!REQUIREMENTS[input.market]) {
    throw new Error(`No clinical-trial disclosure rules modeled for market "${input.market}".`);
  }

  const notes: string[] = [];
  let registrationDeadline: string | null = null;
  let resultsDeadline: string | null = null;

  switch (input.market) {
    case 'US': {
      registrationDeadline = input.firstEnrollmentDate ? addDaysIso(input.firstEnrollmentDate, 21) : null;
      resultsDeadline = input.primaryCompletionDate ? addDaysIso(input.primaryCompletionDate, 365) : null;
      notes.push('Registration within 21 days of first-participant enrolment; results within 1 year of the primary completion date (42 USC 282(j); 42 CFR Part 11).');
      if (!input.firstEnrollmentDate) notes.push('No firstEnrollmentDate supplied — registration deadline not projected.');
      if (!input.primaryCompletionDate) notes.push('No primaryCompletionDate supplied — results deadline not projected.');
      break;
    }
    case 'EU': {
      registrationDeadline = null;
      const window = input.pediatric ? 182 : 365;
      resultsDeadline = input.primaryCompletionDate ? addDaysIso(input.primaryCompletionDate, window) : null;
      notes.push('Registration is pre-authorisation via CTIS — no separate post-enrolment registration deadline.');
      notes.push(input.pediatric
        ? 'Trial ends a paediatric clinical investigation — summary of results within 6 months (182 days) of trial end (CTR 536/2014).'
        : 'Summary of results within 1 year (365 days) of trial end (CTR 536/2014).');
      notes.push('A lay-person summary of results is required.');
      if (!input.primaryCompletionDate) notes.push('No primaryCompletionDate supplied — results deadline not projected.');
      break;
    }
    case 'WHO_ICMJE': {
      // Prospective registration must be completed by/before first enrolment, so the
      // deadline is the enrolment date itself.
      registrationDeadline = input.firstEnrollmentDate ?? null;
      resultsDeadline = input.primaryCompletionDate ? addDaysIso(input.primaryCompletionDate, 365) : null;
      notes.push('Prospective registration must be completed before the first participant is enrolled — the registration deadline is the enrolment date itself (ICMJE condition of publication).');
      notes.push('Results disclosure within 12 months (365 days) of completion (WHO statement).');
      if (!input.firstEnrollmentDate) notes.push('No firstEnrollmentDate supplied — registration deadline not projected.');
      if (!input.primaryCompletionDate) notes.push('No primaryCompletionDate supplied — results deadline not projected.');
      break;
    }
    default: {
      // Exhaustiveness guard — unreachable for modeled markets.
      throw new Error(`No clinical-trial disclosure rules modeled for market "${input.market as string}".`);
    }
  }

  notes.push(CAVEAT);

  return {
    market: input.market,
    registrationDeadline,
    resultsDeadline,
    notes,
  };
}

/** The set of modeled disclosure markets. */
export const DISCLOSURE_MARKETS: DisclosureMarket[] = ['US', 'EU', 'WHO_ICMJE'];
