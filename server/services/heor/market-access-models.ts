/**
 * Market-access HEOR engines — comparator-mix budget impact and cost-utility.
 *
 * Companion to {@link module:server/services/heor/heor-models}: that module covers
 * the single-comparator budget-impact and the bare ICER. This module adds the two
 * capabilities a payer/AMCP dossier for an MDX/diagnostic actually needs but which
 * that module does not provide:
 *
 *   - budgetImpactWithMix — a Budget-Impact Model (BIM; ISPOR, Sullivan et al.
 *     2014) where the displaced standard of care is a *mix* of comparators
 *     (each with its own share and per-patient cost), the eligible population can
 *     grow year over year, and future-year impact can be discounted to present
 *     value. Returns per-year and cumulative net budget impact for the payer.
 *
 *   - costEffectivenessNmb — incremental cost, incremental effectiveness, the
 *     ICER, the dominance verdict, and the net monetary benefit at a
 *     willingness-to-pay threshold (always required here, so the cost-effective
 *     decision is unambiguous).
 *
 * Pure and deterministic: identical inputs always produce identical outputs, every
 * result carries a provenance hash, and a missing/invalid input throws a
 * descriptive Error (relayed by the tool layer as needs_parameters) rather than
 * being silently defaulted. No Monte-Carlo, no LLM estimation — submission-grade.
 *
 * @module server/services/heor/market-access-models
 */

import { buildProvenance, type StatsProvenance } from '../stats/computation-provenance';

// ── Shared validation helpers ────────────────────────────────────────────────

function requireFinite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} is required and must be a finite number`);
  }
  return value;
}

function requireNonNegative(value: unknown, name: string): number {
  const v = requireFinite(value, name);
  if (v < 0) throw new Error(`${name} must be non-negative`);
  return v;
}

function requireFraction(value: unknown, name: string): number {
  const v = requireFinite(value, name);
  if (v < 0 || v > 1) throw new Error(`${name} must be in [0, 1]`);
  return v;
}

/** Round to a fixed number of decimals to keep the envelope reproducible. */
function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

// ── (a) Budget impact with a comparator mix ───────────────────────────────────

export interface ComparatorShare {
  /** Optional label for the comparator (reporting only). */
  name?: string;
  /** Share of the displaced standard of care (0–1); shares must sum to 1. */
  share: number;
  /** Per-patient cost of this comparator. */
  perPatientCost: number;
}

export interface BudgetImpactMixInput {
  /** Eligible patients in the payer population in year 1. */
  eligiblePopulation: number;
  /**
   * New-intervention uptake (market share) for each year of the horizon, each in
   * [0, 1]. The horizon length N is the length of this array (N ≥ 1).
   */
  uptakeCurve: number[];
  /** All-in per-patient cost of the NEW world (test + downstream treatment). */
  newPerPatientCost: number;
  /**
   * The displaced standard of care as a mix of comparators with shares summing
   * to 1. The blended comparator cost is the share-weighted mean.
   */
  comparatorMix: ComparatorShare[];
  /** Annual eligible-population growth rate (e.g. 0.02 = 2%/yr). Default 0. */
  populationGrowth?: number;
  /**
   * Annual discount rate for future-year net impact (e.g. 0.03). Default 0 — BIMs
   * are conventionally undiscounted, but the option is provided.
   */
  discountRate?: number;
}

export interface BudgetImpactMixYear {
  year: number;
  eligiblePopulation: number;
  /** Patients on the new intervention (eligible × uptake). */
  newPatients: number;
  /** Patients remaining on the comparator mix (eligible × (1 − uptake)). */
  comparatorPatients: number;
  /** Total cost of the world WITH the new intervention this year. */
  newWorldCost: number;
  /** Total cost of the world WITHOUT it (all on the comparator mix). */
  referenceWorldCost: number;
  /** Net budget impact this year = newWorldCost − referenceWorldCost. */
  netBudgetImpact: number;
  /** Net budget impact this year discounted to present value. */
  discountedNetBudgetImpact: number;
}

export interface BudgetImpactMixResult {
  /** Share-weighted blended per-patient comparator cost. */
  blendedComparatorCost: number;
  perYear: BudgetImpactMixYear[];
  /** Σ of undiscounted yearly net impacts (negative = cost-saving to the payer). */
  cumulativeNetBudgetImpact: number;
  /** Σ of discounted yearly net impacts. */
  cumulativeDiscountedNetBudgetImpact: number;
  horizonYears: number;
  provenance: StatsProvenance;
}

/**
 * Budget-Impact Model with a comparator mix. For each year t (1..N):
 *
 *   eligible_t      = eligiblePopulation × (1 + g)^(t−1)
 *   newPatients_t   = eligible_t × uptake_t
 *   compPatients_t  = eligible_t × (1 − uptake_t)
 *   blendedComp     = Σ share_k × cost_k            (the comparator basket)
 *   newWorldCost_t  = newPatients_t × newCost + compPatients_t × blendedComp
 *   refWorldCost_t  = eligible_t × blendedComp      (no-adoption baseline)
 *   netImpact_t     = newWorldCost_t − refWorldCost_t
 *                   = newPatients_t × (newCost − blendedComp)
 *   discounted_t    = netImpact_t / (1 + r)^(t−1)
 *
 * The cumulative net budget impact is Σ netImpact_t; a negative value means the
 * new intervention is cost-saving to the payer over the horizon.
 */
export function budgetImpactWithMix(input: BudgetImpactMixInput): BudgetImpactMixResult {
  const eligibleY1 = requireNonNegative(input.eligiblePopulation, 'eligiblePopulation');
  const newCost = requireNonNegative(input.newPerPatientCost, 'newPerPatientCost');

  if (!Array.isArray(input.uptakeCurve) || input.uptakeCurve.length < 1) {
    throw new Error('uptakeCurve is required and must have at least 1 year');
  }
  const uptake = input.uptakeCurve.map((u, i) => requireFraction(u, `uptakeCurve[${i}]`));
  const horizonYears = uptake.length;

  if (!Array.isArray(input.comparatorMix) || input.comparatorMix.length < 1) {
    throw new Error('comparatorMix is required and must have at least 1 comparator');
  }
  let shareSum = 0;
  let blendedComparatorCost = 0;
  input.comparatorMix.forEach((m, i) => {
    const share = requireFraction(m.share, `comparatorMix[${i}].share`);
    const cost = requireNonNegative(m.perPatientCost, `comparatorMix[${i}].perPatientCost`);
    shareSum += share;
    blendedComparatorCost += share * cost;
  });
  if (Math.abs(shareSum - 1) > 1e-6) {
    throw new Error('comparatorMix shares must be supplied so they sum to 1');
  }

  const growth =
    input.populationGrowth === undefined
      ? 0
      : requireFinite(input.populationGrowth, 'populationGrowth');
  const discountRate =
    input.discountRate === undefined
      ? 0
      : requireNonNegative(input.discountRate, 'discountRate');

  const perYear: BudgetImpactMixYear[] = [];
  let cumulative = 0;
  let cumulativeDiscounted = 0;

  for (let t = 1; t <= horizonYears; t++) {
    const eligible = eligibleY1 * (1 + growth) ** (t - 1);
    const share = uptake[t - 1];
    const newPatients = eligible * share;
    const comparatorPatients = eligible * (1 - share);

    const newWorldCost = newPatients * newCost + comparatorPatients * blendedComparatorCost;
    const referenceWorldCost = eligible * blendedComparatorCost;
    const netBudgetImpact = newWorldCost - referenceWorldCost;
    const discountFactor = 1 / (1 + discountRate) ** (t - 1);
    const discountedNetBudgetImpact = netBudgetImpact * discountFactor;

    cumulative += netBudgetImpact;
    cumulativeDiscounted += discountedNetBudgetImpact;

    perYear.push({
      year: t,
      eligiblePopulation: round(eligible),
      newPatients: round(newPatients),
      comparatorPatients: round(comparatorPatients),
      newWorldCost: round(newWorldCost),
      referenceWorldCost: round(referenceWorldCost),
      netBudgetImpact: round(netBudgetImpact),
      discountedNetBudgetImpact: round(discountedNetBudgetImpact),
    });
  }

  return {
    blendedComparatorCost: round(blendedComparatorCost),
    perYear,
    cumulativeNetBudgetImpact: round(cumulative),
    cumulativeDiscountedNetBudgetImpact: round(cumulativeDiscounted),
    horizonYears,
    provenance: buildProvenance({
      method: 'heor:budgetImpactWithMix',
      seed: 0,
      inputs: {
        eligiblePopulation: eligibleY1,
        uptakeCurve: uptake,
        newPerPatientCost: newCost,
        blendedComparatorCost,
        populationGrowth: growth,
        discountRate,
      },
      note: 'Deterministic comparator-mix budget-impact projection; reproduces for the same inputs.',
    }),
  };
}

// ── (b) Cost-effectiveness with net monetary benefit ──────────────────────────

export interface CostEffectivenessNmbInput {
  /** Total per-patient cost of the intervention arm. */
  interventionCost: number;
  /** Per-patient effectiveness (e.g. QALYs) of the intervention arm. */
  interventionEffectiveness: number;
  /** Total per-patient cost of the comparator arm. */
  comparatorCost: number;
  /** Per-patient effectiveness (e.g. QALYs) of the comparator arm. */
  comparatorEffectiveness: number;
  /**
   * Willingness-to-pay threshold per effectiveness unit (e.g. $/QALY; commonly
   * 50,000 or 100,000 for US payers). Required: drives the NMB and the verdict.
   */
  willingnessToPay: number;
  /** Effectiveness unit label, reporting only. Default 'QALY'. */
  effectivenessUnit?: string;
}

export interface CostEffectivenessNmbResult {
  incrementalCost: number;
  incrementalEffectiveness: number;
  /**
   * ICER = incrementalCost / incrementalEffectiveness; null when incremental
   * effectiveness is 0 (ratio undefined). The dominance verdict and NMB are the
   * controlling fields when the ICER is sign-ambiguous across quadrants.
   */
  icer: number | null;
  /** Net monetary benefit = WTP × incrementalEffect − incrementalCost. */
  netMonetaryBenefit: number;
  /** True when the intervention is cheaper AND more effective. */
  dominant: boolean;
  /** True when the intervention is more expensive AND less effective. */
  dominated: boolean;
  /** Cost-effective at the supplied WTP: net monetary benefit ≥ 0. */
  costEffective: boolean;
  willingnessToPay: number;
  effectivenessUnit: string;
  provenance: StatsProvenance;
}

/**
 * Cost-effectiveness comparison (intervention vs comparator), per patient:
 *
 *   incrementalCost   = interventionCost − comparatorCost                    (ΔC)
 *   incrementalEffect = interventionEffectiveness − comparatorEffectiveness  (ΔE)
 *   ICER              = ΔC / ΔE                          (undefined when ΔE = 0)
 *   NMB               = WTP × ΔE − ΔC
 *
 * Quadrant interpretation: dominant = ΔC < 0 and ΔE > 0 (cheaper and better);
 * dominated = ΔC > 0 and ΔE < 0 (costlier and worse). The decision rule for the
 * cost-effective verdict is NMB ≥ 0, equivalent to ICER ≤ WTP in the north-east
 * quadrant; NMB sidesteps the ICER's sign ambiguity and is the controlling figure.
 */
export function costEffectivenessNmb(
  input: CostEffectivenessNmbInput,
): CostEffectivenessNmbResult {
  const interventionCost = requireFinite(input.interventionCost, 'interventionCost');
  const interventionEffectiveness = requireFinite(
    input.interventionEffectiveness,
    'interventionEffectiveness',
  );
  const comparatorCost = requireFinite(input.comparatorCost, 'comparatorCost');
  const comparatorEffectiveness = requireFinite(
    input.comparatorEffectiveness,
    'comparatorEffectiveness',
  );
  const willingnessToPay = requireNonNegative(input.willingnessToPay, 'willingnessToPay');
  const effectivenessUnit = input.effectivenessUnit ?? 'QALY';

  const incrementalCost = interventionCost - comparatorCost;
  const incrementalEffectiveness = interventionEffectiveness - comparatorEffectiveness;
  const netMonetaryBenefit = willingnessToPay * incrementalEffectiveness - incrementalCost;

  const icer =
    incrementalEffectiveness !== 0 ? incrementalCost / incrementalEffectiveness : null;

  const dominant = incrementalCost < 0 && incrementalEffectiveness > 0;
  const dominated = incrementalCost > 0 && incrementalEffectiveness < 0;

  return {
    incrementalCost: round(incrementalCost),
    incrementalEffectiveness: round(incrementalEffectiveness, 6),
    icer: icer === null ? null : round(icer),
    netMonetaryBenefit: round(netMonetaryBenefit),
    dominant,
    dominated,
    costEffective: netMonetaryBenefit >= 0,
    willingnessToPay: round(willingnessToPay),
    effectivenessUnit,
    provenance: buildProvenance({
      method: 'heor:costEffectivenessNmb',
      seed: 0,
      inputs: {
        interventionCost,
        interventionEffectiveness,
        comparatorCost,
        comparatorEffectiveness,
        willingnessToPay,
      },
      note: 'Deterministic ICER / net-monetary-benefit; reproduces for the same inputs.',
    }),
  };
}
