/**
 * Regulatory fee estimator — indicative agency fees across major markets.
 *
 * Budgeting a submission is a real RA/finance need. This service encodes an
 * INDICATIVE fee schedule per market and computes an estimate with the orphan /
 * small-business waivers it holds applied (FDA's); where a status's fee effect
 * is not modelled for a market, the fee is charged in full and the estimate
 * says so. Agency fees are reset
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
  /**
   * Orphan designation held. FDA: the application fee is waived and the program fee
   * exempt. Elsewhere the fee effect is not modelled (EMA grants reductions, not a waiver).
   */
  orphan?: boolean;
  /**
   * The orphan screen is met but no designation is recorded: the lines an orphan
   * designation would waive are charged in full and labelled so. Ignored when `orphan` is true.
   */
  orphanScreenMet?: boolean;
  /**
   * Small-business / SME status. FDA: the application fee is waived. Elsewhere the fee
   * effect is not modelled (EMA grants SME reductions, not a waiver).
   */
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

type FeeLine = 'application' | 'annual';

/**
 * The fee lines a status waives in a market, as far as this reference holds it;
 * null where its fee effect is not modelled. FDA: an orphan designation waives the
 * application fee and exempts the program fee; a qualifying small business has the
 * application fee waived (not the program fee). EMA grants orphan medicinal
 * products and SMEs fee reductions, not waivers, whose amounts are not held here;
 * nothing here holds a PMDA or Health Canada rule.
 */
const ORPHAN_WAIVES: Record<FeeMarket, readonly FeeLine[] | null> = { FDA: ['application', 'annual'], EMA: null, PMDA: null, HEALTH_CANADA: null };
const SMALL_BUSINESS_WAIVES: Record<FeeMarket, readonly FeeLine[] | null> = { FDA: ['application'], EMA: null, PMDA: null, HEALTH_CANADA: null };

const MARKET_NAME: Record<FeeMarket, string> = { FDA: 'FDA', EMA: 'EMA', PMDA: 'PMDA', HEALTH_CANADA: 'Health Canada' };

/** The label of a status whose fee effect is not modelled for the market (the fee is charged in full). */
function notModelled(status: 'orphan' | 'small-business / SME', market: FeeMarket): string {
  const held = market === 'EMA' ? ' (EMA grants fee reductions, not a waiver; their amounts are not held here)' : '';
  return `Fee effect of ${status} status not modelled for ${MARKET_NAME[market]}${held}: charged in full.`;
}

/**
 * Estimate the agency fees for a marketing application in a market, applying
 * the orphan / small-business waivers held for it. Pure / deterministic.
 */
export function estimateFees(input: FeeEstimateInput): FeeEstimate {
  const base = FEE_SCHEDULE[input.market];
  if (!base) {
    return { market: input.market, currency: '', lineItems: [], total: 0, caveats: [`No fee schedule modeled for market "${input.market}".`] };
  }
  const sched: FeeSchedule = { ...base, ...(input.feeScheduleOverride ?? {}) };
  const programYears = Number.isFinite(input.programYears) && (input.programYears as number) >= 0 ? Math.floor(input.programYears as number) : 1;

  const appFeeAmount = input.requiresClinicalData === false ? sched.applicationNoClinicalData : sched.applicationWithClinicalData;

  // 2026-10-15: orphan status waived the application and annual fees, and small
  // business the application fee, in EVERY market (EMA/PMDA/Health Canada total 0),
  // though EMA grants reductions, not waivers, and nothing here holds a PMDA or
  // Health Canada rule. Only a held waiver applies; otherwise the fee is charged in
  // full and labelled not modelled. A met orphan screen is not a designation: those
  // lines stay charged and say what would waive them.
  const orphanWaives = ORPHAN_WAIVES[input.market];
  const smallBusinessWaives = SMALL_BUSINESS_WAIVES[input.market];
  const unmodelled = [
    ...((input.orphan || input.orphanScreenMet) && !orphanWaives ? [notModelled('orphan', input.market)] : []),
    ...(input.smallBusiness && !smallBusinessWaives ? [notModelled('small-business / SME', input.market)] : []),
  ];
  const effect = (line: FeeLine, orphanWaivedNote: string): Pick<FeeLineItem, 'waived' | 'note'> => {
    if (input.orphan && orphanWaives?.includes(line)) return { waived: true, note: orphanWaivedNote };
    if (input.smallBusiness && smallBusinessWaives?.includes(line)) return { waived: true, note: 'Waived — small-business / SME waiver.' };
    const notes = [
      ...(!input.orphan && input.orphanScreenMet && orphanWaives?.includes(line)
        ? ['Would be waived if orphan-designated: the orphan screen is met, but no designation is recorded, so it is charged here.']
        : []),
      ...unmodelled,
    ];
    return { waived: false, note: notes.length > 0 ? notes.join(' ') : undefined };
  };

  const lineItems: FeeLineItem[] = [
    {
      name: `Marketing-application fee (${input.requiresClinicalData === false ? 'no clinical data' : 'with clinical data'})`,
      amount: appFeeAmount,
      ...effect('application', 'Waived — orphan-designated product (application fee exemption).'),
    },
  ];

  if (programYears > 0) {
    lineItems.push({
      name: `Annual program/maintenance fee × ${programYears} year(s)`,
      amount: sched.annualProgramFee * programYears,
      ...effect('annual', 'Waived — orphan exemption from the program fee.'),
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
      ...unmodelled,
    ],
  };
}

/** The indicative fee schedule for a market (for display). */
export function getFeeSchedule(market: FeeMarket): FeeSchedule | null {
  return FEE_SCHEDULE[market] ?? null;
}
