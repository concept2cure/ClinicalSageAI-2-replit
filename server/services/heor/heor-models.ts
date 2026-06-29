/**
 * Health-economics (HEOR) models — deterministic budget-impact and
 * cost-effectiveness (ICER) calculations for payer dossiers and market access.
 *
 * Pure, closed-form arithmetic over caller-supplied inputs — no DB, no network,
 * no estimation. The numbers are reproducible and inspectable (every output is a
 * stated function of the inputs), so a computed budget impact or ICER is
 * defensible in an AMCP-format dossier rather than an LLM guess.
 *
 * @module server/services/heor/heor-models
 */

// ─────────────────────────────────────────────────────────────────────────────
// Budget-impact model
// ─────────────────────────────────────────────────────────────────────────────

export interface BudgetImpactInput {
  /** Covered population (e.g. plan members / covered lives). */
  populationSize: number;
  /** Fraction of the population eligible for treatment (0–1). */
  eligibleFraction: number;
  /** Fraction of eligible patients actually treated (0–1, default 1). */
  treatedFraction?: number;
  /** Per-patient annual cost of the new intervention. */
  annualCostNew: number;
  /** Per-patient annual cost of the displaced comparator / standard of care. */
  annualCostComparator: number;
  /** New-intervention market share for each year of the horizon (each 0–1). */
  newShareByYear: number[];
}

export interface BudgetImpactYear {
  year: number;
  patientsTreated: number;
  patientsOnNew: number;
  patientsOnComparator: number;
  costWithNew: number;
  costWithoutNew: number;
  /** Incremental budget impact for the year (costWithNew − costWithoutNew). */
  budgetImpact: number;
  cumulativeBudgetImpact: number;
  /** Per-member-per-month impact (budgetImpact / populationSize / 12). */
  pmpm: number;
}

export interface BudgetImpactResult {
  horizonYears: number;
  eligiblePopulation: number;
  patientsTreatedPerYear: number;
  years: BudgetImpactYear[];
  totalBudgetImpact: number;
  currency: 'unit';
  notes: string[];
}

function assertFraction(name: string, v: number): void {
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`${name} must be a number in [0,1]`);
}
function assertNonNeg(name: string, v: number): void {
  if (!Number.isFinite(v) || v < 0) throw new Error(`${name} must be a non-negative number`);
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the multi-year budget impact of adopting a new intervention vs a world
 * where every treated patient stays on the comparator. Costs are in an
 * unspecified currency unit (the caller's); outputs preserve that unit.
 */
export function computeBudgetImpact(input: BudgetImpactInput): BudgetImpactResult {
  assertNonNeg('populationSize', input.populationSize);
  assertFraction('eligibleFraction', input.eligibleFraction);
  const treatedFraction = input.treatedFraction ?? 1;
  assertFraction('treatedFraction', treatedFraction);
  assertNonNeg('annualCostNew', input.annualCostNew);
  assertNonNeg('annualCostComparator', input.annualCostComparator);
  if (!Array.isArray(input.newShareByYear) || input.newShareByYear.length === 0) {
    throw new Error('newShareByYear must be a non-empty array (one share per year)');
  }
  input.newShareByYear.forEach((s, i) => assertFraction(`newShareByYear[${i}]`, s));

  const eligiblePopulation = input.populationSize * input.eligibleFraction;
  const patientsTreated = eligiblePopulation * treatedFraction;

  const years: BudgetImpactYear[] = [];
  let cumulative = 0;
  input.newShareByYear.forEach((share, idx) => {
    const onNew = patientsTreated * share;
    const onComparator = patientsTreated * (1 - share);
    const costWithNew = onNew * input.annualCostNew + onComparator * input.annualCostComparator;
    const costWithoutNew = patientsTreated * input.annualCostComparator;
    const budgetImpact = costWithNew - costWithoutNew;
    cumulative += budgetImpact;
    years.push({
      year: idx + 1,
      patientsTreated: round2(patientsTreated),
      patientsOnNew: round2(onNew),
      patientsOnComparator: round2(onComparator),
      costWithNew: round2(costWithNew),
      costWithoutNew: round2(costWithoutNew),
      budgetImpact: round2(budgetImpact),
      cumulativeBudgetImpact: round2(cumulative),
      pmpm: input.populationSize > 0 ? round2(budgetImpact / input.populationSize / 12) : 0,
    });
  });

  return {
    horizonYears: years.length,
    eligiblePopulation: round2(eligiblePopulation),
    patientsTreatedPerYear: round2(patientsTreated),
    years,
    totalBudgetImpact: round2(cumulative),
    currency: 'unit',
    notes: [
      'Costs are in the caller-supplied currency unit; outputs preserve that unit.',
      'Budget impact compares a world adopting the new intervention against all-comparator use.',
      'Deterministic: no discounting applied unless costs are pre-discounted by the caller.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost-effectiveness (ICER)
// ─────────────────────────────────────────────────────────────────────────────

export interface CostEffectivenessInput {
  costIntervention: number;
  /** Health effect of the intervention (e.g. QALYs). */
  effectIntervention: number;
  costComparator: number;
  effectComparator: number;
  /** Willingness-to-pay per unit effect, for net monetary benefit (optional). */
  willingnessToPay?: number;
}

export type Dominance = 'dominant' | 'dominated' | 'tradeoff' | 'no_effect_difference';

export interface CostEffectivenessResult {
  incrementalCost: number;
  incrementalEffect: number;
  /** ΔCost/ΔEffect; null when there is no effect difference (ICER undefined). */
  icer: number | null;
  dominance: Dominance;
  willingnessToPay?: number;
  /** WTP·ΔEffect − ΔCost (only when willingnessToPay supplied). */
  netMonetaryBenefit?: number;
  /** Cost-effective at the WTP threshold? (only when willingnessToPay supplied). */
  costEffectiveAtThreshold?: boolean;
  interpretation: string;
}

/**
 * Compute the incremental cost-effectiveness ratio and (optionally) net monetary
 * benefit vs a willingness-to-pay threshold. Handles dominance honestly: a null
 * ICER is reported (not a divide-by-zero) when effects are equal.
 */
export function computeCostEffectiveness(input: CostEffectivenessInput): CostEffectivenessResult {
  for (const k of ['costIntervention', 'effectIntervention', 'costComparator', 'effectComparator'] as const) {
    if (!Number.isFinite(input[k])) throw new Error(`${k} must be a finite number`);
  }
  if (input.willingnessToPay !== undefined && (!Number.isFinite(input.willingnessToPay) || input.willingnessToPay < 0)) {
    throw new Error('willingnessToPay must be a non-negative number');
  }

  const incrementalCost = input.costIntervention - input.costComparator;
  const incrementalEffect = input.effectIntervention - input.effectComparator;

  let dominance: Dominance;
  if (incrementalEffect === 0) dominance = 'no_effect_difference';
  else if (incrementalCost <= 0 && incrementalEffect > 0) dominance = 'dominant';
  else if (incrementalCost >= 0 && incrementalEffect < 0) dominance = 'dominated';
  else dominance = 'tradeoff';

  const icer = incrementalEffect !== 0 ? incrementalCost / incrementalEffect : null;

  const result: CostEffectivenessResult = {
    incrementalCost: round2(incrementalCost),
    incrementalEffect: round2(incrementalEffect),
    icer: icer === null ? null : round2(icer),
    dominance,
    interpretation: '',
  };

  if (input.willingnessToPay !== undefined) {
    const nmb = input.willingnessToPay * incrementalEffect - incrementalCost;
    result.willingnessToPay = input.willingnessToPay;
    result.netMonetaryBenefit = round2(nmb);
    result.costEffectiveAtThreshold = nmb >= 0;
  }

  result.interpretation =
    dominance === 'dominant'
      ? 'Intervention is dominant: equal or lower cost and greater effect than the comparator.'
      : dominance === 'dominated'
        ? 'Intervention is dominated: equal or higher cost and lower effect than the comparator.'
        : dominance === 'no_effect_difference'
          ? 'No effect difference — ICER is undefined; compare on cost alone.'
          : input.willingnessToPay !== undefined
            ? `Trade-off: ICER ${result.icer} per unit effect; ${result.costEffectiveAtThreshold ? 'at or below' : 'above'} the WTP threshold of ${input.willingnessToPay}.`
            : `Trade-off: ICER ${result.icer} per unit effect. Provide a willingness-to-pay threshold to judge cost-effectiveness.`;

  return result;
}
