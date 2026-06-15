/**
 * Regulatory fee estimator — indicative agency fees across major markets.
 *
 * Budgeting a submission is a real RA/finance need. This service encodes an
 * INDICATIVE fee schedule per market and computes an estimate with the common
 * waivers/exemptions applied (orphan, small business). Agency fees are reset
 * annually by statute/notice, so the figures are indicative defaults (FY2025
 * order-of-magnitude) and are overridable via the input — the calculator logic
 * (which fees apply, which waivers zero them out) is the durable part.
 *
 * Markets: FDA (PDUFA), EMA, PMDA, HEALTH_CANADA.
 *
 * Pure / deterministic — no DB, no IO, no live fee lookup.
 *
 * Reference: FDA PDUFA (FDARA) annual fee notices; EU Reg (EU) 2024/568 fees
 * payable to the EMA; PMDA fee schedule; Health Canada Fees Regulations.
 * FIGURES ARE INDICATIVE — confirm against the current-year agency notice.
 *
 * @module server/services/global-ri/regulatory-fee-estimator
 */

export type FeeMarket = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA';

export interface FeeSchedule {
  currency: string;
  /** Marketing-application fee when the application requires clinical data. */
  applicationWithClinicalData: number;
  /** Marketing-application fee when no clinical data is required. */
  applicationNoClinicalData: number;
  /** Annual program/establishment/maintenance fee per product. */
  annualProgramFee: number;
}

/** Indicative fee schedule (FY2025 order-of-magnitude). Override via input.feeScheduleOverride. */
export const FEE_SCHEDULE: Record<FeeMarket, FeeSchedule> = {
  FDA: { currency: 'USD', applicationWithClinicalData: 4310002, applicationNoClinicalData: 2155001, annualProgramFee: 416734 },
  EMA: { currency: 'EUR', applicationWithClinicalData: 345400, applicationNoClinicalData: 345400, annualProgramFee: 137100 },
  PMDA: { currency: 'JPY', applicationWithClinicalData: 38000000, applicationNoClinicalData: 24000000, annualProgramFee: 1500000 },
  HEALTH_CANADA: { currency: 'CAD', applicationWithClinicalData: 532933, applicationNoClinicalData: 266467, annualProgramFee: 33256 },
};

export interface FeeEstimateInput {
  market: FeeMarket;
  /** Whether the application requires clinical data (drives which application fee applies). */
  requiresClinicalData?: boolean;
  /** Orphan designation — exempts the marketing-application fee in FDA/EMA (and others). */
  orphan?: boolean;
  /** Small-business / SME status — FDA small-business waiver; EMA SME fee reductions. */
  smallBusiness?: boolean;
  /** Number of years of the annual program/maintenance fee to include (default 1). */
  programYears?: number;
  /** Optional override of the indicative schedule for this market. */
  feeScheduleOverride?: Partial<FeeSchedule>;
}

export interface FeeLineItem {
  name: string;
  amount: number;
  waived: boolean;
  note?: string;
}

export interface FeeEstimate {
  market: FeeMarket;
  currency: string;
  lineItems: FeeLineItem[];
  /** Sum of non-waived line items. */
  total: number;
  caveats: string[];
}

/**
 * Estimate the agency fees for a marketing application in a market, applying
 * orphan / small-business waivers. Pure / deterministic.
 */
export function estimateFees(input: FeeEstimateInput): FeeEstimate {
  const base = FEE_SCHEDULE[input.market];
  if (!base) {
    return { market: input.market, currency: '', lineItems: [], total: 0, caveats: [`No fee schedule modeled for market "${input.market}".`] };
  }
  const sched: FeeSchedule = { ...base, ...(input.feeScheduleOverride ?? {}) };
  const programYears = Number.isFinite(input.programYears) && (input.programYears as number) >= 0 ? Math.floor(input.programYears as number) : 1;

  const appFeeAmount = input.requiresClinicalData === false ? sched.applicationNoClinicalData : sched.applicationWithClinicalData;

  // The marketing-application fee is waived for an orphan product (FDA/EMA) or a
  // qualifying small business (FDA first application).
  const appWaived = Boolean(input.orphan) || Boolean(input.smallBusiness);
  const appNote = input.orphan
    ? 'Waived — orphan-designated product (application fee exemption).'
    : input.smallBusiness
      ? 'Waived — small-business / SME waiver.'
      : undefined;

  const lineItems: FeeLineItem[] = [
    {
      name: `Marketing-application fee (${input.requiresClinicalData === false ? 'no clinical data' : 'with clinical data'})`,
      amount: appFeeAmount,
      waived: appWaived,
      note: appNote,
    },
  ];

  if (programYears > 0) {
    lineItems.push({
      name: `Annual program/maintenance fee × ${programYears} year(s)`,
      amount: sched.annualProgramFee * programYears,
      // Orphan products are exempt from the FDA program fee; small business is not.
      waived: Boolean(input.orphan),
      note: input.orphan ? 'Waived — orphan exemption from the program fee.' : undefined,
    });
  }

  const total = lineItems.reduce((sum, li) => sum + (li.waived ? 0 : li.amount), 0);

  return {
    market: input.market,
    currency: sched.currency,
    lineItems,
    total,
    caveats: [
      'Figures are INDICATIVE (FY2025 order-of-magnitude); confirm against the current-year agency fee notice.',
      'Waiver eligibility (orphan, small business/SME) must be confirmed with the agency; criteria and scope vary.',
    ],
  };
}

/** The indicative fee schedule for a market (for display). */
export function getFeeSchedule(market: FeeMarket): FeeSchedule | null {
  return FEE_SCHEDULE[market] ?? null;
}
