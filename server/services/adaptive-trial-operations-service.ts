/**
 * Adaptive Trial Operations Service (Capability 6)
 *
 * Operational management for adaptive clinical trials — beyond simulation
 * into real-time execution. Handles adaptive trial plan creation, interim
 * data ingestion, stopping rule evaluation, sample size re-estimation,
 * decision recording, and IDMC report generation.
 *
 * Statistics are delegated to the canonical stats engine — no private copies:
 * - Normal CDF / quantile: stats/normal.ts (full precision).
 * - Lan–DeMets alpha-spending boundaries (O'Brien–Fleming, Pocock, linear):
 *   stats/group-sequential-oc.ts `solveSpendingBoundaries`, which solves each
 *   look's boundary by exact recursive numerical integration of the joint null
 *   distribution of the sequential statistics (Armitage–McPherson–Rowe;
 *   Jennison & Turnbull 2000, ch. 19) — i.e. accounting for the correlation
 *   between looks.
 * - Conditional power and predictive power on the Z / B-value scale (below).
 * - Monte Carlo operating characteristics, cross-checked against the exact
 *   recursive computation (stats/group-sequential-oc.ts).
 *
 * CONVENTIONS (stated, not assumed):
 * - α is ONE-SIDED (default 0.025, the two-sided 0.05 convention), and the
 *   efficacy boundary is an UPPER boundary: efficacy is declared when Z ≥ b_k,
 *   with Z oriented so that positive favours treatment. Harm (large negative Z)
 *   is the separate `harm` rule; it never counts as an efficacy crossing.
 * - The drift θ is the expected final z-statistic, E[Z at information 1].
 * - `maxSampleSize` is the per-arm maximum, consistent with performSSR (whose
 *   formula is per-arm) and with θ = δ·√(n/2) (stats driftForTwoSampleMeans).
 *
 * 2026-10-05: replaced a private normal CDF that fed |x| to an erf
 * approximation without dividing by √2 (Φ(1.96) = 0.981, Φ(−1) = 0.130), the
 * nominal z_{1−Δα/2} per-look boundary (correlation-blind and halving a
 * one-sided α), per-look boundary recomputation that treated every interim as
 * the first look, conditional power on δ√(1−t) evaluated under H0 while
 * labelled "current trend", and a predictive power that mixed a per-subject
 * effect scale with the Z scale. Pinned by
 * tests/biostat/adaptive-and-spending-reference.test.ts.
 */

import { db } from '../db';
import {
  adaptiveTrialPlans,
  interimDataSnapshots,
  adaptationDecisions,
  idmcReports,
} from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { Rng, createRng, seedFromObject } from './stats/rng';
import { buildProvenance } from './stats/computation-provenance';
import { normalCdf, normalQuantile } from './stats/normal';
import {
  solveSpendingBoundaries,
  computeOperatingCharacteristic,
  driftForTwoSampleMeans,
  type SpendingFunction,
} from './stats/group-sequential-oc';

/**
 * Generate a standard normal random variate from a seeded engine, so the Monte
 * Carlo operating characteristics are reproducible.
 */
function randomNormal(rng: Rng): number {
  return rng.normal();
}

// ─── Alpha-spending boundaries (canonical engine) ─────────────────────────────

const SPENDING_FUNCTIONS: readonly SpendingFunction[] = ['obrien-fleming', 'pocock', 'linear'];

/** Resolve a requested spending function; refuses an unrecognised one instead of defaulting. */
function resolveSpendingFunction(requested: unknown): SpendingFunction {
  if ((SPENDING_FUNCTIONS as readonly unknown[]).includes(requested)) return requested as SpendingFunction;
  throw new Error(
    `Unsupported spending function "${String(requested)}". Supported: ${SPENDING_FUNCTIONS.join(', ')}.`,
  );
}

export interface SpendingBoundaries {
  /** Information fractions the boundaries apply to (strictly increasing, in (0, 1]). */
  informationFractions: number[];
  /** Cumulative one-sided alpha spent by each look, α*(t_k). */
  cumulativeAlpha: number[];
  /** One-sided alpha spent at each look, α*(t_k) − α*(t_{k−1}). */
  incrementalAlpha: number[];
  /** Upper (efficacy) boundary on the z-scale at each look. */
  criticalValues: number[];
  alpha: number;
  sided: 'one-sided-upper';
  spendingFunction: SpendingFunction;
  method: string;
}

/**
 * Lan–DeMets alpha-spending efficacy boundaries for the given looks, solved by
 * the canonical engine (exact recursive integration; correlation between looks
 * accounted for). A boundary at look k depends only on looks 1..k, so the
 * fractions need not include the final analysis: when the last fraction is
 * below 1 the solve is run with t = 1 appended and the appended look dropped.
 */
export function calculateSpendingBoundaries(
  informationFractions: number[],
  alpha: number,
  spendingFunction: SpendingFunction,
): SpendingBoundaries {
  const fn = resolveSpendingFunction(spendingFunction);
  if (informationFractions.length === 0) throw new Error('At least one information fraction is required');
  for (const t of informationFractions) {
    if (!(Number.isFinite(t) && t > 0 && t <= 1)) {
      throw new Error(`Information fraction ${t} must be in (0, 1]`);
    }
  }
  const last = informationFractions[informationFractions.length - 1];
  const solveFractions = last < 1 ? [...informationFractions, 1] : informationFractions;
  const solved = solveSpendingBoundaries(solveFractions, alpha, fn);
  const k = informationFractions.length;
  return {
    informationFractions: [...informationFractions],
    cumulativeAlpha: solved.cumulativeAlpha.slice(0, k),
    incrementalAlpha: solved.incrementalAlpha.slice(0, k),
    criticalValues: solved.efficacyBoundaries.slice(0, k),
    alpha,
    sided: 'one-sided-upper',
    spendingFunction: fn,
    method: 'Lan–DeMets alpha spending; boundaries solved by exact recursive numerical integration (stats/group-sequential-oc solveSpendingBoundaries)',
  };
}

// ─── Conditional Power ─────────────────────────────────────────────────────────

const CP_FORMULA = 'CP(θ) = 1 − Φ((c − Z_t·√t − θ·(1 − t)) / √(1 − t))';
const CP_CITATION = 'Lan & Wittes (1988) Biometrics 44:579; Jennison & Turnbull (2000) §10.2';

/**
 * Conditional power, B-value form: P(Z_1 ≥ c | Z_t) under drift θ.
 *
 * With B(t) = Z_t·√t, B(1) − B(t) ~ N(θ(1 − t), 1 − t) independently of B(t),
 * where θ = E[Z_1] is the expected final z-statistic. Hence
 *   CP(θ) = 1 − Φ((c − Z_t·√t − θ·(1 − t)) / √(1 − t)).
 * θ = Z_t/√t is the "current trend"; θ = 0 is H0; θ = the design drift is H1.
 * Ignores any further interim looks (the standard definition: power of the
 * final test given the data so far).
 */
export function computeConditionalPower(
  testStatistic: number,
  informationFraction: number,
  finalCriticalValue: number,
  drift: number,
): number {
  const t = informationFraction;
  if (!(t > 0 && t <= 1)) throw new Error(`Information fraction ${t} must be in (0, 1]`);
  if (t >= 1) return testStatistic >= finalCriticalValue ? 1 : 0;
  const remaining = 1 - t;
  return 1 - normalCdf((finalCriticalValue - testStatistic * Math.sqrt(t) - drift * remaining) / Math.sqrt(remaining));
}

export interface ConditionalPowerFigure {
  assumption: 'current-trend' | 'design-effect' | 'null-hypothesis';
  label: string;
  /** θ, the expected final z-statistic assumed for the remainder of the trial. */
  drift: number | null;
  conditionalPower: number | null;
  reason?: string;
}

export interface ConditionalPowerScenarios {
  currentTrend: ConditionalPowerFigure;
  designEffect: ConditionalPowerFigure;
  nullHypothesis: ConditionalPowerFigure;
  finalCriticalValue: number;
  formula: string;
  citation: string;
}

/**
 * Conditional power under each of the three standard assumptions, explicitly
 * labelled. `designDrift` is θ under H1 (the design effect on the drift scale);
 * when it is not on record the H1 figure is null with a reason — never defaulted.
 */
export function conditionalPowerScenarios(
  testStatistic: number,
  informationFraction: number,
  finalCriticalValue: number,
  designDrift: number | null,
): ConditionalPowerScenarios {
  const trendDrift = testStatistic / Math.sqrt(informationFraction);
  const hasDesign = designDrift !== null && Number.isFinite(designDrift);
  return {
    currentTrend: {
      assumption: 'current-trend',
      label: 'Under the current trend (θ = Z_t/√t)',
      drift: trendDrift,
      conditionalPower: computeConditionalPower(testStatistic, informationFraction, finalCriticalValue, trendDrift),
    },
    designEffect: hasDesign
      ? {
          assumption: 'design-effect',
          label: 'Under H1, the design effect (θ = design drift)',
          drift: designDrift,
          conditionalPower: computeConditionalPower(testStatistic, informationFraction, finalCriticalValue, designDrift),
        }
      : {
          assumption: 'design-effect',
          label: 'Under H1, the design effect (θ = design drift)',
          drift: null,
          conditionalPower: null,
          reason:
            'No design effect is recorded on the plan (efficacy rule designDrift, or a ' +
            'sample_size_reestimation adaptation effectSize); not computed rather than assumed.',
        },
    nullHypothesis: {
      assumption: 'null-hypothesis',
      label: 'Under H0 (θ = 0)',
      drift: 0,
      conditionalPower: computeConditionalPower(testStatistic, informationFraction, finalCriticalValue, 0),
    },
    finalCriticalValue,
    formula: CP_FORMULA,
    citation: CP_CITATION,
  };
}

// ─── Predictive Power ──────────────────────────────────────────────────────────

/**
 * Bayesian predictive power: E[CP(θ) | Z_t], averaging conditional power over
 * the posterior of the drift θ (Spiegelhalter, Freedman & Blackburn 1986,
 * Control Clin Trials 7:8; Jennison & Turnbull 2000, §10.3). Entirely on the
 * Z / B-value scale.
 *
 * Likelihood: B(t) = Z_t·√t ~ N(θ·t, t). Prior θ ~ N(m₀, s₀²), or flat when
 * `prior` is omitted. Posterior θ ~ N(m, v) with 1/v = 1/s₀² + t and
 * m = v·(m₀/s₀² + B(t)). The predictive distribution of the final B-value is
 *   B(1) | data ~ N(B(t) + (1 − t)·m, (1 − t) + (1 − t)²·v),
 * so PP = 1 − Φ((c − B(t) − (1 − t)·m) / √((1 − t) + (1 − t)²·v)).
 * Flat prior (m = Z_t/√t, v = 1/t): PP = Φ((Z_t − c·√t) / √(1 − t)).
 */
export function computePredictivePower(
  testStatistic: number,
  informationFraction: number,
  finalCriticalValue: number,
  prior?: { mean: number; sd: number },
): number {
  const t = informationFraction;
  if (!(t > 0 && t <= 1)) throw new Error(`Information fraction ${t} must be in (0, 1]`);
  if (t >= 1) return testStatistic >= finalCriticalValue ? 1 : 0;
  const b = testStatistic * Math.sqrt(t);
  let priorPrecision = 0;
  let priorMean = 0;
  if (prior) {
    if (!(prior.sd > 0 && Number.isFinite(prior.sd)) || !Number.isFinite(prior.mean)) {
      throw new Error('Predictive-power prior needs a finite mean and a positive finite sd');
    }
    priorPrecision = 1 / (prior.sd * prior.sd);
    priorMean = prior.mean;
  }
  const postVar = 1 / (priorPrecision + t);
  const postMean = postVar * (priorPrecision * priorMean + b);
  const remaining = 1 - t;
  const predMean = b + remaining * postMean;
  const predSd = Math.sqrt(remaining + remaining * remaining * postVar);
  return 1 - normalCdf((finalCriticalValue - predMean) / predSd);
}

/**
 * The design drift θ (expected final z under H1) recorded on a plan, or null.
 * Sources, in order: an efficacy rule's explicit `designDrift`; else a
 * sample_size_reestimation adaptation's standardized `effectSize` δ mapped by
 * θ = δ·√(maxSampleSize/2) with maxSampleSize per arm.
 */
function designDriftFromPlan(plan: { stoppingRules: unknown; adaptations: unknown; maxSampleSize: number | null }): number | null {
  const rules = (plan.stoppingRules as any[]) ?? [];
  const explicit = rules.find((r: any) => r?.type === 'efficacy')?.designDrift;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const ssr = ((plan.adaptations as any[]) ?? []).find((a: any) => a?.type === 'sample_size_reestimation');
  const delta = ssr?.effectSize;
  if (typeof delta === 'number' && Number.isFinite(delta) && plan.maxSampleSize && plan.maxSampleSize > 0) {
    return driftForTwoSampleMeans(delta, plan.maxSampleSize);
  }
  return null;
}

/** Information fraction of a planned look; refuses a look that does not state one. */
function lookFraction(look: any, index: number): number {
  const t = look?.informationFraction ?? look?.timing;
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    throw new Error(`Interim look ${index + 1} has no informationFraction (or timing); it must be stated, not assumed.`);
  }
  return t;
}

// ─── Service Class ─────────────────────────────────────────────────────────────

export class AdaptiveTrialOperationsService {
  /**
   * Create an adaptive trial plan with validated stopping rules and initial
   * operating characteristics computed via Monte Carlo simulation.
   */
  async createPlan(
    params: {
      threadId?: number;
      title: string;
      designType: string;
      adaptations: any[];
      interimLooks: any[];
      stoppingRules: any[];
      spendingFunction?: string;
      maxSampleSize?: number;
    },
    organizationId: number,
    userId: number
  ) {
    const {
      threadId,
      title,
      designType,
      adaptations,
      interimLooks,
      stoppingRules,
      spendingFunction = 'obrien-fleming',
      maxSampleSize = 500,
    } = params;

    // Validate stopping rules
    this.validateStoppingRules(stoppingRules, interimLooks);

    // Calculate spending boundaries for the specified looks
    const informationFractions = interimLooks.map((look: any, i: number) => lookFraction(look, i));

    // One-sided alpha (see CONVENTIONS in the file header).
    const alpha = stoppingRules.find((r: any) => r.type === 'efficacy')?.alpha ?? 0.025;

    const spendingFn = resolveSpendingFunction(spendingFunction);
    const boundaries = calculateSpendingBoundaries(informationFractions, alpha, spendingFn);

    // Run initial operating characteristics via Monte Carlo
    const opChars = this.runMonteCarloOC(
      {
        designType,
        interimLooks,
        stoppingRules,
        boundaries,
        maxSampleSize,
        spendingFunction: spendingFn,
      },
      10000
    );

    const [plan] = await db
      .insert(adaptiveTrialPlans)
      .values({
        threadId: threadId ?? null,
        title,
        designType,
        adaptations,
        interimLooks,
        stoppingRules,
        spendingFunction: spendingFn,
        spendingParameters: { alpha, boundaries },
        maxSampleSize,
        simulationResults: opChars,
        operatingCharacteristics: opChars.summary,
        organizationId,
        createdBy: userId,
      })
      .returning();

    return {
      plan,
      boundaries,
      operatingCharacteristics: opChars.summary,
    };
  }

  /**
   * Ingest an interim data snapshot. Calculates test statistic, conditional power,
   * predictive power, and compares against spending boundaries.
   */
  async ingestInterimSnapshot(
    planId: number,
    snapshotData: {
      lookNumber: number;
      informationFraction: number;
      enrolledCount: number;
      isBlinded: boolean;
      summaryStatistics: any;
    },
    organizationId: number
  ) {
    // Retrieve the plan
    const [plan] = await db
      .select()
      .from(adaptiveTrialPlans)
      .where(and(eq(adaptiveTrialPlans.id, planId), eq(adaptiveTrialPlans.organizationId, organizationId)));

    if (!plan) {
      throw new Error(`Adaptive trial plan ${planId} not found`);
    }

    const { lookNumber, informationFraction, enrolledCount, isBlinded, summaryStatistics } =
      snapshotData;

    if (!(typeof informationFraction === 'number' && informationFraction > 0 && informationFraction <= 1)) {
      throw new Error(`informationFraction ${informationFraction} must be in (0, 1]`);
    }

    // Retrieve spending parameters from plan
    const spendingParams = plan.spendingParameters as any;
    const alpha = spendingParams?.alpha ?? 0.025;
    const spendingFn = resolveSpendingFunction(plan.spendingFunction || 'obrien-fleming');

    const { design, designFractions, priorLookFractions, lookIndex } = await this.sequentialDesign(
      plan,
      { lookNumber, informationFraction },
      { alpha, spendingFn },
      organizationId,
    );
    const currentCriticalValue = design.criticalValues[lookIndex];
    const finalCriticalValue = design.criticalValues[design.criticalValues.length - 1];

    // Calculate test statistic from summary statistics
    let testStatistic = 0;
    if (summaryStatistics) {
      testStatistic = this.computeTestStatistic(summaryStatistics);
    }

    // Conditional power under each explicit assumption; the stored figure (used
    // by the futility rule) is the current-trend one.
    const cpScenarios = conditionalPowerScenarios(
      testStatistic,
      informationFraction,
      finalCriticalValue,
      designDriftFromPlan(plan),
    );
    const conditionalPower = cpScenarios.currentTrend.conditionalPower as number;

    // Predictive power with a flat (non-informative) prior on the drift.
    const predictivePower = computePredictivePower(testStatistic, informationFraction, finalCriticalValue);

    // Construct boundary information
    const boundaryInfo = {
      criticalValue: currentCriticalValue,
      cumulativeAlpha: design.cumulativeAlpha[lookIndex],
      incrementalAlpha: design.incrementalAlpha[lookIndex],
      efficacyCrossed: testStatistic >= currentCriticalValue,
      direction: testStatistic >= 0 ? 'positive' : 'negative',
      sided: design.sided,
      alpha,
      spendingFunction: spendingFn,
      priorLookFractions,
      designInformationFractions: designFractions,
      designCriticalValues: design.criticalValues,
      finalCriticalValue,
      method: design.method,
    };

    const [snapshot] = await db
      .insert(interimDataSnapshots)
      .values({
        planId,
        lookNumber,
        informationFraction,
        enrolledCount,
        isBlinded: isBlinded ?? true,
        summaryStatistics,
        testStatistic,
        conditionalPower,
        predictivePower,
        boundary: boundaryInfo,
        organizationId,
      })
      .returning();

    return {
      snapshot,
      analysis: {
        testStatistic,
        conditionalPower,
        conditionalPowerAssumption: 'current-trend',
        conditionalPowerScenarios: cpScenarios,
        predictivePower,
        predictivePowerPrior: 'flat (non-informative) prior on the drift θ',
        boundary: boundaryInfo,
        recommendation: this.deriveRecommendation(
          testStatistic,
          currentCriticalValue,
          conditionalPower,
          plan.stoppingRules as any[]
        ),
      },
    };
  }

  /**
   * Evaluate all stopping rules (efficacy, futility, safety) against current
   * interim data and return a recommended action.
   */
  async evaluateStoppingRules(planId: number, snapshotId: number, organizationId: number) {
    const [plan] = await db
      .select()
      .from(adaptiveTrialPlans)
      .where(and(eq(adaptiveTrialPlans.id, planId), eq(adaptiveTrialPlans.organizationId, organizationId)));

    if (!plan) throw new Error(`Adaptive trial plan ${planId} not found`);

    const [snapshot] = await db
      .select()
      .from(interimDataSnapshots)
      .where(
        and(
          eq(interimDataSnapshots.id, snapshotId),
          eq(interimDataSnapshots.planId, planId),
          eq(interimDataSnapshots.organizationId, organizationId)
        )
      );

    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found for plan ${planId}`);

    const stoppingRules = plan.stoppingRules as any[];
    const testStatistic = snapshot.testStatistic ?? 0;
    const conditionalPower = snapshot.conditionalPower ?? 0;
    const informationFraction = snapshot.informationFraction;
    const boundaryInfo = snapshot.boundary as any;

    const evaluations: any[] = [];
    let recommendedAction = 'continue';
    let primaryReason = '';

    // Evaluate each stopping rule
    for (const rule of stoppingRules) {
      const evaluation: any = {
        ruleType: rule.type,
        ruleName: rule.name || rule.type,
        triggered: false,
        detail: '',
      };

      switch (rule.type) {
        case 'efficacy': {
          // One-sided upper boundary: efficacy requires Z >= b (harm is its own rule).
          const criticalValue = boundaryInfo?.criticalValue ?? normalQuantile(1 - (rule.alpha ?? 0.025));
          const crossed = testStatistic >= criticalValue;
          evaluation.triggered = crossed;
          evaluation.detail = crossed
            ? `Test statistic ${testStatistic.toFixed(4)} >= critical value ${criticalValue.toFixed(4)}. Efficacy boundary crossed.`
            : `Test statistic ${testStatistic.toFixed(4)} < critical value ${criticalValue.toFixed(4)}. Efficacy boundary not crossed.`;
          evaluation.testStatistic = testStatistic;
          evaluation.criticalValue = criticalValue;
          if (crossed) {
            recommendedAction = 'stop_efficacy';
            primaryReason = evaluation.detail;
          }
          break;
        }

        case 'futility': {
          const futilityThreshold = rule.conditionalPowerThreshold ?? 0.2;
          const futile = conditionalPower < futilityThreshold && informationFraction >= (rule.minInformationFraction ?? 0.3);
          evaluation.triggered = futile;
          evaluation.detail = futile
            ? `Conditional power ${conditionalPower.toFixed(4)} < threshold ${futilityThreshold}. Futility boundary crossed.`
            : `Conditional power ${conditionalPower.toFixed(4)} >= threshold ${futilityThreshold}. Futility not indicated.`;
          evaluation.conditionalPower = conditionalPower;
          evaluation.threshold = futilityThreshold;
          if (futile && recommendedAction !== 'stop_efficacy') {
            recommendedAction = 'stop_futility';
            primaryReason = evaluation.detail;
          }
          break;
        }

        case 'safety': {
          const summaryStats = snapshot.summaryStatistics as any;
          const adverseEventRate = summaryStats?.adverseEventRate ?? summaryStats?.safetySignal ?? 0;
          const safetyThreshold = rule.threshold ?? 0.05;
          const safetyTriggered = adverseEventRate > safetyThreshold;
          evaluation.triggered = safetyTriggered;
          evaluation.detail = safetyTriggered
            ? `Adverse event rate ${adverseEventRate} exceeds safety threshold ${safetyThreshold}. Safety stop triggered.`
            : `Adverse event rate ${adverseEventRate} within acceptable range (threshold: ${safetyThreshold}).`;
          evaluation.adverseEventRate = adverseEventRate;
          evaluation.threshold = safetyThreshold;
          if (safetyTriggered) {
            recommendedAction = 'stop_safety';
            primaryReason = evaluation.detail;
          }
          break;
        }

        case 'harm': {
          const harmDirection = testStatistic < -(rule.harmThreshold ?? 2.0);
          evaluation.triggered = harmDirection;
          evaluation.detail = harmDirection
            ? `Test statistic ${testStatistic.toFixed(4)} indicates potential harm (threshold: -${rule.harmThreshold ?? 2.0}).`
            : `No evidence of harm detected.`;
          if (harmDirection) {
            recommendedAction = 'stop_harm';
            primaryReason = evaluation.detail;
          }
          break;
        }

        default:
          evaluation.detail = `Unknown rule type: ${rule.type}`;
      }

      evaluations.push(evaluation);
    }

    if (recommendedAction === 'continue') {
      primaryReason = 'No stopping boundaries crossed. Trial continues to next look or final analysis.';
    }

    return {
      planId,
      snapshotId,
      lookNumber: snapshot.lookNumber,
      informationFraction: snapshot.informationFraction,
      evaluations,
      recommendedAction,
      primaryReason,
      summary: {
        testStatistic,
        conditionalPower,
        predictivePower: snapshot.predictivePower,
        enrolledCount: snapshot.enrolledCount,
        boundary: boundaryInfo,
      },
    };
  }

  /**
   * Blinded sample size re-estimation (SSR).
   * Estimates nuisance parameters from pooled (blinded) data and recommends
   * a revised sample size to maintain target power.
   */
  async performSSR(planId: number, snapshotId: number, organizationId: number) {
    const [plan] = await db
      .select()
      .from(adaptiveTrialPlans)
      .where(and(eq(adaptiveTrialPlans.id, planId), eq(adaptiveTrialPlans.organizationId, organizationId)));

    if (!plan) throw new Error(`Adaptive trial plan ${planId} not found`);

    const [snapshot] = await db
      .select()
      .from(interimDataSnapshots)
      .where(
        and(
          eq(interimDataSnapshots.id, snapshotId),
          eq(interimDataSnapshots.planId, planId),
          eq(interimDataSnapshots.organizationId, organizationId)
        )
      );

    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

    const summaryStats = snapshot.summaryStatistics as any;
    const originalMaxN = plan.maxSampleSize || 500;
    const stoppingRules = plan.stoppingRules as any[];

    // Extract nuisance parameter estimates from blinded data
    const pooledVariance = summaryStats?.pooledVariance ?? summaryStats?.variance ?? 1.0;
    const pooledRate = summaryStats?.pooledEventRate ?? summaryStats?.eventRate ?? 0.5;
    const dropoutRate = summaryStats?.observedDropoutRate ?? summaryStats?.dropoutRate ?? 0.15;

    // Original design assumptions
    const designAssumptions = (plan.adaptations as any[])?.find(
      (a: any) => a.type === 'sample_size_reestimation'
    );
    const originalVariance = designAssumptions?.assumedVariance ?? 1.0;
    const originalDropout = designAssumptions?.assumedDropout ?? 0.15;
    const targetPower = designAssumptions?.targetPower ?? 0.8;

    // Determine the target effect size from efficacy stopping rule
    const efficacyRule = stoppingRules.find((r: any) => r.type === 'efficacy');
    const alpha = efficacyRule?.alpha ?? 0.025;
    const effectSize = designAssumptions?.effectSize ?? 0.3;

    // Recalculate required sample size based on updated nuisance parameters
    // For a two-sample Z-test: n = (z_alpha + z_beta)^2 * 2 * sigma^2 / delta^2
    const zAlpha = normalQuantile(1 - alpha);
    const zBeta = normalQuantile(targetPower);
    const varianceRatio = pooledVariance / originalVariance;

    const effectSizeSq = Math.pow(effectSize, 2);
    if (effectSizeSq === 0) {
      throw new Error('Effect size cannot be zero for sample size re-estimation');
    }
    let newSampleSize = Math.ceil(
      (Math.pow(zAlpha + zBeta, 2) * 2 * pooledVariance) / effectSizeSq
    );

    // Adjust for dropout
    if (dropoutRate >= 1) {
      throw new Error('Dropout rate must be less than 1');
    }
    newSampleSize = Math.ceil(newSampleSize / (1 - dropoutRate));

    // Apply cap: new sample size cannot exceed a multiplier of original (regulatory constraint)
    const maxAllowedMultiplier = designAssumptions?.maxSampleSizeMultiplier ?? 1.5;
    const cappedSampleSize = Math.min(newSampleSize, Math.ceil(originalMaxN * maxAllowedMultiplier));

    // Recalculate power with the capped sample size
    const effectiveSampleSize = Math.floor(cappedSampleSize * (1 - dropoutRate));
    const achievedZBeta = pooledVariance > 0
      ? effectSize * Math.sqrt(effectiveSampleSize / (2 * pooledVariance)) - zAlpha
      : -zAlpha;
    const achievedPower = normalCdf(achievedZBeta);

    const ssrResult = {
      originalSampleSize: originalMaxN,
      estimatedNuisanceParameters: {
        pooledVariance,
        varianceRatio,
        pooledRate,
        observedDropoutRate: dropoutRate,
      },
      uncappedNewSampleSize: newSampleSize,
      cappedNewSampleSize: cappedSampleSize,
      maxAllowedMultiplier,
      achievedPower,
      targetPower,
      recommendation:
        cappedSampleSize > originalMaxN
          ? `Increase sample size from ${originalMaxN} to ${cappedSampleSize} (variance ratio: ${varianceRatio.toFixed(3)})`
          : cappedSampleSize < originalMaxN
            ? `Current sample size ${originalMaxN} is adequate. Observed variance is lower than assumed.`
            : `No change in sample size required.`,
      rationale: `Blinded SSR based on pooled variance estimate of ${pooledVariance.toFixed(4)} ` +
        `(vs design assumption of ${originalVariance.toFixed(4)}). ` +
        `Observed dropout rate: ${(dropoutRate * 100).toFixed(1)}%. ` +
        `Power with new N=${cappedSampleSize}: ${(achievedPower * 100).toFixed(1)}%.`,
    };

    return ssrResult;
  }

  /**
   * Record an adaptation decision with full audit trail.
   */
  async recordDecision(
    params: {
      planId: number;
      snapshotId?: number;
      adaptationType: string;
      decision: string;
      rationale: string;
      parameters?: any;
    },
    organizationId: number,
    userId: number
  ) {
    const { planId, snapshotId, adaptationType, decision, rationale, parameters } = params;

    // Verify plan exists
    const [plan] = await db
      .select()
      .from(adaptiveTrialPlans)
      .where(and(eq(adaptiveTrialPlans.id, planId), eq(adaptiveTrialPlans.organizationId, organizationId)));

    if (!plan) throw new Error(`Adaptive trial plan ${planId} not found`);

    // Build audit trail entry
    const auditEntry = {
      timestamp: new Date().toISOString(),
      userId,
      action: `Recorded ${adaptationType} decision`,
      decision,
      rationale,
      parameters,
      snapshotId: snapshotId ?? null,
    };

    const validAdaptationTypes = [
      'sample_size_reestimation', 'response_adaptive_randomization',
      'dose_selection', 'arm_dropping', 'endpoint_modification',
      'population_enrichment', 'seamless_phase',
    ] as const;
    type AdaptationType = typeof validAdaptationTypes[number];
    if (!validAdaptationTypes.includes(adaptationType as AdaptationType)) {
      throw new Error(`Invalid adaptation type: ${adaptationType}. Must be one of: ${validAdaptationTypes.join(', ')}`);
    }

    const [record] = await db
      .insert(adaptationDecisions)
      .values({
        planId,
        snapshotId: snapshotId ?? null,
        adaptationType: adaptationType as AdaptationType,
        decision,
        rationale,
        parameters,
        approvedBy: userId,
        approvedAt: new Date(),
        auditTrail: [auditEntry],
        organizationId,
      })
      .returning();

    return record;
  }

  /**
   * Generate an IDMC report with open (unblinded safety) and closed (efficacy) sections.
   */
  async generateIDMCReport(planId: number, lookNumber: number, organizationId: number) {
    // Fetch plan
    const [plan] = await db
      .select()
      .from(adaptiveTrialPlans)
      .where(and(eq(adaptiveTrialPlans.id, planId), eq(adaptiveTrialPlans.organizationId, organizationId)));

    if (!plan) throw new Error(`Adaptive trial plan ${planId} not found`);

    // Fetch the snapshot for this look
    const [snapshot] = await db
      .select()
      .from(interimDataSnapshots)
      .where(
        and(
          eq(interimDataSnapshots.planId, planId),
          eq(interimDataSnapshots.lookNumber, lookNumber),
          eq(interimDataSnapshots.organizationId, organizationId)
        )
      );

    // Fetch all decisions for this plan
    const decisions = await db
      .select()
      .from(adaptationDecisions)
      .where(and(eq(adaptationDecisions.planId, planId), eq(adaptationDecisions.organizationId, organizationId)))
      .orderBy(desc(adaptationDecisions.createdAt));

    const summaryStats = (snapshot?.summaryStatistics ?? {}) as any;

    // --- Open Section (Unblinded Safety) ---
    const openContent = {
      title: `IDMC Open Report — ${plan.title}`,
      lookNumber,
      reportDate: new Date().toISOString(),
      trialOverview: {
        designType: plan.designType,
        currentEnrollment: snapshot?.enrolledCount ?? 0,
        maxSampleSize: plan.maxSampleSize,
        informationFraction: snapshot?.informationFraction ?? 0,
      },
      safetyData: {
        enrollmentSummary: {
          totalEnrolled: snapshot?.enrolledCount ?? 0,
          activeSubjects: summaryStats.activeSubjects ?? null,
          completedSubjects: summaryStats.completedSubjects ?? null,
          withdrawnSubjects: summaryStats.withdrawnSubjects ?? null,
        },
        adverseEvents: summaryStats.adverseEvents ?? {
          totalAEs: 0,
          seriousAEs: 0,
          relatedAEs: 0,
          deathsOnStudy: 0,
        },
        safetySignals: summaryStats.safetySignals ?? [],
        demographicBalance: summaryStats.demographics ?? null,
      },
      dataQuality: {
        missingDataRate: summaryStats.missingDataRate ?? null,
        protocolDeviations: summaryStats.protocolDeviations ?? null,
        dropoutRate: summaryStats.observedDropoutRate ?? null,
      },
    };

    // --- Closed Section (Efficacy / Unblinded Efficacy) ---
    const closedContent = {
      title: `IDMC Closed Report — ${plan.title}`,
      lookNumber,
      reportDate: new Date().toISOString(),
      confidentialityNotice:
        'This section contains unblinded efficacy data. Access restricted to IDMC members and unblinded statistician.',
      interimAnalysis: {
        testStatistic: snapshot?.testStatistic ?? null,
        conditionalPower: snapshot?.conditionalPower ?? null,
        predictivePower: snapshot?.predictivePower ?? null,
        informationFraction: snapshot?.informationFraction ?? 0,
      },
      boundaries: {
        spendingFunction: plan.spendingFunction,
        currentBoundary: snapshot?.boundary ?? null,
        allBoundaries: (plan.spendingParameters as any)?.boundaries ?? null,
      },
      stoppingRuleEvaluations: this.evaluateRulesSync(
        plan.stoppingRules as any[],
        snapshot?.testStatistic ?? 0,
        snapshot?.conditionalPower ?? 0,
        snapshot?.informationFraction ?? 0,
        snapshot?.boundary as any,
        summaryStats
      ),
      adaptationHistory: decisions.map((d) => ({
        type: d.adaptationType,
        decision: d.decision,
        rationale: d.rationale,
        date: d.createdAt,
      })),
    };

    // Recommendations
    const recommendations = {
      continueTrial: true,
      rationale: 'Based on interim analysis results.',
      suggestedActions: [] as string[],
    };

    const stoppingEvals = closedContent.stoppingRuleEvaluations;
    const anyTriggered = stoppingEvals.some((e: any) => e.triggered);

    if (anyTriggered) {
      const triggeredRules = stoppingEvals.filter((e: any) => e.triggered);
      recommendations.continueTrial = false;
      recommendations.rationale = `Stopping boundary crossed: ${triggeredRules.map((r: any) => r.ruleType).join(', ')}`;
      recommendations.suggestedActions = triggeredRules.map(
        (r: any) => `Consider ${r.ruleType} stop: ${r.detail}`
      );
    } else {
      recommendations.suggestedActions = ['Continue enrollment per protocol'];
      if ((snapshot?.conditionalPower ?? 0) < 0.5) {
        recommendations.suggestedActions.push(
          'Consider sample size re-estimation due to lower than expected conditional power'
        );
      }
    }

    // Store the report
    const [report] = await db
      .insert(idmcReports)
      .values({
        planId,
        reportType: 'interim',
        lookNumber,
        openContent,
        closedContent,
        recommendations,
        organizationId,
      })
      .returning();

    return {
      report,
      openContent,
      closedContent,
      recommendations,
    };
  }

  /**
   * Get full plan with all snapshots and decisions.
   */
  async getPlan(planId: number, organizationId: number) {
    const [plan] = await db
      .select()
      .from(adaptiveTrialPlans)
      .where(and(eq(adaptiveTrialPlans.id, planId), eq(adaptiveTrialPlans.organizationId, organizationId)));

    if (!plan) throw new Error(`Adaptive trial plan ${planId} not found`);

    const snapshots = await db
      .select()
      .from(interimDataSnapshots)
      .where(
        and(
          eq(interimDataSnapshots.planId, planId),
          eq(interimDataSnapshots.organizationId, organizationId)
        )
      )
      .orderBy(interimDataSnapshots.lookNumber);

    const decisions = await db
      .select()
      .from(adaptationDecisions)
      .where(
        and(
          eq(adaptationDecisions.planId, planId),
          eq(adaptationDecisions.organizationId, organizationId)
        )
      )
      .orderBy(desc(adaptationDecisions.createdAt));

    const reports = await db
      .select()
      .from(idmcReports)
      .where(
        and(eq(idmcReports.planId, planId), eq(idmcReports.organizationId, organizationId))
      )
      .orderBy(desc(idmcReports.generatedAt));

    return {
      plan,
      snapshots,
      decisions,
      reports,
    };
  }

  /**
   * Run Monte Carlo simulations to compute operating characteristics:
   * type I error, power, expected sample size under various effect size scenarios.
   */
  async getOperatingCharacteristics(planId: number, organizationId: number) {
    const [plan] = await db
      .select()
      .from(adaptiveTrialPlans)
      .where(and(eq(adaptiveTrialPlans.id, planId), eq(adaptiveTrialPlans.organizationId, organizationId)));

    if (!plan) throw new Error(`Adaptive trial plan ${planId} not found`);

    const opChars = this.runMonteCarloOC(
      {
        designType: plan.designType,
        interimLooks: plan.interimLooks as any[],
        stoppingRules: plan.stoppingRules as any[],
        boundaries: (plan.spendingParameters as any)?.boundaries ?? null,
        maxSampleSize: plan.maxSampleSize ?? 500,
        spendingFunction: (plan.spendingFunction || 'obrien-fleming') as string,
      },
      10000
    );

    // Update the stored operating characteristics
    await db
      .update(adaptiveTrialPlans)
      .set({
        operatingCharacteristics: opChars.summary,
        simulationResults: opChars,
        updatedAt: new Date(),
      })
      .where(eq(adaptiveTrialPlans.id, planId));

    return opChars;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Sequentially consistent boundaries for an interim look. The boundary at this
   * look is conditional on the looks ACTUALLY performed before it, at their
   * observed information fractions (Lan–DeMets: a skipped look spends nothing;
   * its alpha carries forward). The design's final critical value additionally
   * uses the remaining planned looks after this one, then t = 1.
   */
  private async sequentialDesign(
    plan: { id: number; interimLooks: unknown },
    look: { lookNumber: number; informationFraction: number },
    spending: { alpha: number; spendingFn: SpendingFunction },
    organizationId: number,
  ) {
    const { lookNumber, informationFraction } = look;
    const earlierSnapshots = await db
      .select()
      .from(interimDataSnapshots)
      .where(and(eq(interimDataSnapshots.planId, plan.id), eq(interimDataSnapshots.organizationId, organizationId)))
      .orderBy(interimDataSnapshots.lookNumber);
    const fractionByLook = new Map<number, number>();
    for (const s of earlierSnapshots as any[]) {
      if (s.lookNumber < lookNumber) fractionByLook.set(s.lookNumber, s.informationFraction);
    }
    const priorLookFractions = [...fractionByLook.entries()].sort((x, y) => x[0] - y[0]).map(([, t]) => t);
    const designFractions = [...priorLookFractions, informationFraction];
    for (let i = 1; i < designFractions.length; i++) {
      if (!(designFractions[i] > designFractions[i - 1])) {
        throw new Error(
          `Interim looks must have strictly increasing information fractions; look ${lookNumber} at ` +
            `${informationFraction} follows recorded looks at ${priorLookFractions.join(', ')}.`,
        );
      }
    }
    const plannedLater = ((plan.interimLooks as any[]) ?? [])
      .map((look: any, i: number) => lookFraction(look, i))
      .filter((t: number) => t > informationFraction && t < 1);
    designFractions.push(...plannedLater);
    if (informationFraction < 1) designFractions.push(1);
    return {
      design: calculateSpendingBoundaries(designFractions, spending.alpha, spending.spendingFn),
      designFractions,
      priorLookFractions,
      lookIndex: priorLookFractions.length,
    };
  }

  /**
   * Validate stopping rules against interim look definitions.
   */
  private validateStoppingRules(stoppingRules: any[], interimLooks: any[]): void {
    if (!stoppingRules || stoppingRules.length === 0) {
      throw new Error('At least one stopping rule is required');
    }

    if (!interimLooks || interimLooks.length === 0) {
      throw new Error('At least one interim look must be defined');
    }

    for (const rule of stoppingRules) {
      if (!rule.type) {
        throw new Error('Each stopping rule must have a type (efficacy, futility, safety, harm)');
      }
      if (rule.type === 'efficacy' && (rule.alpha === undefined || rule.alpha <= 0 || rule.alpha >= 1)) {
        // Default alpha
        rule.alpha = rule.alpha ?? 0.025;
      }
    }

    // Validate information fractions are monotonically increasing
    const fractions = interimLooks
      .map((look: any) => look.informationFraction ?? look.timing)
      .filter((f: any) => f !== undefined);

    for (let i = 1; i < fractions.length; i++) {
      if (fractions[i] <= fractions[i - 1]) {
        throw new Error(
          `Information fractions must be strictly increasing. Got ${fractions[i - 1]} followed by ${fractions[i]}.`
        );
      }
    }
  }

  /**
   * Compute test statistic from summary statistics.
   * Supports difference in means and difference in proportions.
   */
  private computeTestStatistic(summaryStats: any): number {
    // If a precomputed test statistic is provided, use it
    if (summaryStats.testStatistic !== undefined) {
      return summaryStats.testStatistic;
    }

    // Difference in means: Z = (mean1 - mean2) / sqrt(var1/n1 + var2/n2)
    if (summaryStats.mean1 !== undefined && summaryStats.mean2 !== undefined) {
      const diff = summaryStats.mean1 - summaryStats.mean2;
      const se = Math.sqrt(
        (summaryStats.var1 ?? 1) / (summaryStats.n1 ?? 1) +
        (summaryStats.var2 ?? 1) / (summaryStats.n2 ?? 1)
      );
      return se > 0 ? diff / se : 0;
    }

    // Difference in proportions: Z = (p1 - p2) / sqrt(pPool * (1-pPool) * (1/n1 + 1/n2))
    if (summaryStats.prop1 !== undefined && summaryStats.prop2 !== undefined) {
      const n1 = summaryStats.n1 ?? 1;
      const n2 = summaryStats.n2 ?? 1;
      const pPool = (summaryStats.prop1 * n1 + summaryStats.prop2 * n2) / (n1 + n2);
      const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
      return se > 0 ? (summaryStats.prop1 - summaryStats.prop2) / se : 0;
    }

    // Hazard ratio (log-rank approximation): Z = log(HR) / SE(log(HR))
    if (summaryStats.hazardRatio !== undefined) {
      const logHR = Math.log(summaryStats.hazardRatio);
      const se = summaryStats.seLogHR ?? 0.5;
      return se > 0 ? logHR / se : 0;
    }

    return 0;
  }

  /**
   * Derive a simple textual recommendation from the analysis.
   */
  private deriveRecommendation(
    testStatistic: number,
    criticalValue: number,
    conditionalPower: number,
    stoppingRules: any[]
  ): string {
    if (testStatistic >= criticalValue) {
      return 'Efficacy boundary crossed. Consider stopping for efficacy.';
    }

    const futilityRule = stoppingRules.find((r: any) => r.type === 'futility');
    if (futilityRule) {
      const threshold = futilityRule.conditionalPowerThreshold ?? 0.2;
      if (conditionalPower < threshold) {
        return `Conditional power (${(conditionalPower * 100).toFixed(1)}%) is below futility threshold (${(threshold * 100).toFixed(1)}%). Consider stopping for futility.`;
      }
    }

    if (conditionalPower < 0.5) {
      return `Conditional power is moderate (${(conditionalPower * 100).toFixed(1)}%). Consider sample size re-estimation.`;
    }

    return 'No stopping boundaries crossed. Continue enrollment per protocol.';
  }

  /**
   * Synchronous stopping rule evaluation (used in IDMC report generation).
   */
  private evaluateRulesSync(
    stoppingRules: any[],
    testStatistic: number,
    conditionalPower: number,
    informationFraction: number,
    boundary: any,
    summaryStats: any
  ): any[] {
    const results: any[] = [];
    for (const rule of stoppingRules) {
      const ev: any = { ruleType: rule.type, triggered: false, detail: '' };
      switch (rule.type) {
        case 'efficacy': {
          const cv = boundary?.criticalValue ?? normalQuantile(1 - (rule.alpha ?? 0.025));
          ev.triggered = testStatistic >= cv;
          ev.detail = ev.triggered
            ? `Efficacy boundary crossed (Z=${testStatistic.toFixed(4)} >= ${cv.toFixed(4)})`
            : `Efficacy boundary not crossed (Z=${testStatistic.toFixed(4)} < ${cv.toFixed(4)})`;
          break;
        }
        case 'futility': {
          const threshold = rule.conditionalPowerThreshold ?? 0.2;
          ev.triggered = conditionalPower < threshold && informationFraction >= (rule.minInformationFraction ?? 0.3);
          ev.detail = ev.triggered
            ? `Futility: CP=${(conditionalPower * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}%`
            : `No futility: CP=${(conditionalPower * 100).toFixed(1)}%`;
          break;
        }
        case 'safety': {
          const rate = summaryStats?.adverseEventRate ?? 0;
          const thresh = rule.threshold ?? 0.05;
          ev.triggered = rate > thresh;
          ev.detail = ev.triggered ? `Safety concern: AE rate ${rate} > ${thresh}` : `Safety OK`;
          break;
        }
        case 'harm': {
          ev.triggered = testStatistic < -(rule.harmThreshold ?? 2.0);
          ev.detail = ev.triggered ? `Potential harm detected` : `No harm signal`;
          break;
        }
      }
      results.push(ev);
    }
    return results;
  }

  /**
   * Monte Carlo simulation to compute operating characteristics.
   * Simulates the entire group-sequential design under multiple effect size scenarios.
   */
  private runMonteCarloOC(
    config: {
      designType: string;
      interimLooks: any[];
      stoppingRules: any[];
      boundaries: any;
      maxSampleSize: number;
      spendingFunction: string;
    },
    nSim: number,
    seed?: number
  ): any {
    // Reseed a local engine deterministically so the operating characteristics
    // reproduce given the same design and simulation count.
    const usedSeed =
      seed !== undefined && Number.isFinite(seed)
        ? Math.trunc(seed)
        : seedFromObject({
            designType: config.designType,
            interimLooks: config.interimLooks,
            stoppingRules: config.stoppingRules,
            maxSampleSize: config.maxSampleSize,
            spendingFunction: config.spendingFunction,
            nSim,
          });
    const rng = createRng(usedSeed);

    const effectSizes = [0, 0.1, 0.2, 0.3, 0.5];
    const alpha = config.stoppingRules.find((r: any) => r.type === 'efficacy')?.alpha ?? 0.025;
    const spendingFn = resolveSpendingFunction(config.spendingFunction);

    const informationFractions = config.interimLooks.map((look: any, i: number) => lookFraction(look, i));

    // Include final analysis at t=1
    const allFractions = [...informationFractions];
    if (allFractions[allFractions.length - 1] < 1) {
      allFractions.push(1.0);
    }

    const boundaries = calculateSpendingBoundaries(allFractions, alpha, spendingFn);
    const nLooks = allFractions.length;
    const finalCV = boundaries.criticalValues[nLooks - 1];
    const futilityRule = config.stoppingRules.find((r: any) => r.type === 'futility');
    // The same current-trend conditional-power rule the interim evaluation
    // applies, against the design's final boundary.
    const futilityStops = (z: number, t: number): boolean =>
      Boolean(futilityRule) &&
      t >= (futilityRule.minInformationFraction ?? 0.3) &&
      computeConditionalPower(z, t, finalCV, z / Math.sqrt(t)) < (futilityRule.conditionalPowerThreshold ?? 0.2);

    const scenarios: any[] = [];

    for (const delta of effectSizes) {
      let rejectCount = 0;
      let totalSampleSizeSum = 0;
      const stageRejects = new Array(nLooks).fill(0);
      // Drift θ = E[Z at full information] = δ·√(n_max/2), n_max per arm.
      const theta = driftForTwoSampleMeans(delta, config.maxSampleSize);

      for (let sim = 0; sim < nSim; sim++) {
        // Sequential statistics share data: simulate the score process with
        // independent increments, S(t_k) − S(t_{k−1}) ~ N(θ·Δt, Δt), and
        // Z_k = S(t_k)/√t_k, so corr(Z_j, Z_k) = √(t_j/t_k) as in the trial.
        let score = 0;
        let prevT = 0;

        for (let k = 0; k < nLooks; k++) {
          const tK = allFractions[k];
          const nK = Math.floor(tK * config.maxSampleSize);
          const dT = tK - prevT;
          score += theta * dT + Math.sqrt(dT) * randomNormal(rng);
          prevT = tK;
          const Zk = score / Math.sqrt(tK);

          // One-sided upper efficacy boundary.
          if (Zk >= boundaries.criticalValues[k]) {
            rejectCount++;
            stageRejects[k]++;
            totalSampleSizeSum += nK;
            break;
          }

          // Futility (if defined), at interim looks only.
          if (k < nLooks - 1 && futilityStops(Zk, tK)) {
            totalSampleSizeSum += nK;
            break;
          }

          // If last look and not rejected
          if (k === nLooks - 1) {
            totalSampleSizeSum += nK;
          }
        }
      }

      const rejectionRate = rejectCount / nSim;
      const avgSampleSize = totalSampleSizeSum / nSim;

      scenarios.push({
        effectSize: delta,
        drift: theta,
        rejectionRate,
        // Exact P(reject) with the efficacy boundary alone (stats/group-sequential-oc).
        // Futility stopping can only lower rejection, so this bounds the simulated rate above.
        exactRejectionRateEfficacyOnly: computeOperatingCharacteristic(
          { informationFractions: allFractions, efficacyBoundaries: boundaries.criticalValues },
          theta,
        ).rejectProbability,
        expectedSampleSize: Math.round(avgSampleSize),
        stageRejections: stageRejects,
        nSimulations: nSim,
      });
    }

    const nullScenario = scenarios.find((s) => s.effectSize === 0);
    const designScenario = scenarios.find((s) => s.effectSize === 0.3) ?? scenarios[scenarios.length - 1];

    const summary = {
      typeIError: nullScenario?.rejectionRate ?? 0,
      exactTypeIErrorEfficacyOnly: nullScenario?.exactRejectionRateEfficacyOnly ?? null,
      power: designScenario?.rejectionRate ?? 0,
      powerEffectSize: designScenario?.effectSize ?? null,
      expectedSampleSizeUnderNull: nullScenario?.expectedSampleSize ?? config.maxSampleSize,
      expectedSampleSizeUnderAlternative: designScenario?.expectedSampleSize ?? config.maxSampleSize,
      maxSampleSize: config.maxSampleSize,
      numberOfLooks: nLooks,
      spendingFunction: config.spendingFunction,
      boundaries: {
        informationFractions: allFractions,
        criticalValues: boundaries.criticalValues,
        cumulativeAlpha: boundaries.cumulativeAlpha,
        sided: boundaries.sided,
        method: boundaries.method,
      },
    };

    return {
      scenarios,
      summary,
      simulationParameters: {
        nSimulations: nSim,
        effectSizes,
        alpha,
        spendingFunction: config.spendingFunction,
        maxSampleSize: config.maxSampleSize,
        seed: usedSeed,
      },
      seed: usedSeed,
      provenance: buildProvenance({
        method: 'adaptive-trial:runMonteCarloOC',
        seed: usedSeed,
        inputs: {
          designType: config.designType,
          interimLooks: config.interimLooks,
          stoppingRules: config.stoppingRules,
          maxSampleSize: config.maxSampleSize,
          spendingFunction: config.spendingFunction,
          nSim,
        },
        note: 'Type I error, power, and expected sample size reproduce given this seed and design.',
      }),
    };
  }
}

export const adaptiveTrialOperationsService = new AdaptiveTrialOperationsService();
