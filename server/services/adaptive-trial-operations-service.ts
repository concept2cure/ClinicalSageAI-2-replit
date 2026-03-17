/**
 * Adaptive Trial Operations Service (Capability 6)
 *
 * Operational management for adaptive clinical trials — beyond simulation
 * into real-time execution. Handles adaptive trial plan creation, interim
 * data ingestion, stopping rule evaluation, sample size re-estimation,
 * decision recording, and IDMC report generation.
 *
 * Statistical computations implemented from scratch using mathjs:
 * - O'Brien-Fleming and Pocock alpha spending functions
 * - Conditional power
 * - Predictive power
 * - Monte Carlo operating characteristics
 */

import { db } from '../db';
import {
  adaptiveTrialPlans,
  interimDataSnapshots,
  adaptationDecisions,
  idmcReports,
} from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import * as math from 'mathjs';

// ─── Utility: Standard Normal CDF (Phi) ───────────────────────────────────────

/**
 * Standard normal cumulative distribution function using the
 * Abramowitz & Stegun rational approximation (|error| < 1.5e-7).
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Inverse standard normal CDF (quantile function) via rational approximation.
 */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.383577518672690e2,
    -3.066479806614716e1,
    2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838e0,
    -2.549732539343734e0,
    4.374664141464968e0,
    2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996e0,
    3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

/**
 * Standard normal PDF.
 */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Generate a standard normal random variate using Box-Muller transform.
 */
function randomNormal(): number {
  let u1: number, u2: number;
  do {
    u1 = Math.random();
  } while (u1 === 0);
  u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// ─── Alpha Spending Functions ──────────────────────────────────────────────────

/**
 * O'Brien-Fleming spending function: alpha(t) = 2 * (1 - Phi(z_{alpha/2} / sqrt(t)))
 * Very conservative early, preserves most alpha for the final look.
 */
function obrienFlemingSpending(t: number, alpha: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return alpha;
  const zAlphaHalf = normalQuantile(1 - alpha / 2);
  return 2 * (1 - normalCDF(zAlphaHalf / Math.sqrt(t)));
}

/**
 * Pocock spending function: alpha(t) = alpha * ln(1 + (e - 1) * t)
 * Spends alpha more uniformly across looks.
 */
function pocockSpending(t: number, alpha: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return alpha;
  return alpha * Math.log(1 + (Math.E - 1) * t);
}

/**
 * Calculate cumulative spending and incremental alpha for each look.
 */
function calculateSpendingBoundaries(
  informationFractions: number[],
  alpha: number,
  spendingFunction: 'obrien-fleming' | 'pocock'
): { cumulativeAlpha: number[]; incrementalAlpha: number[]; criticalValues: number[] } {
  const spendFn =
    spendingFunction === 'obrien-fleming' ? obrienFlemingSpending : pocockSpending;

  const cumulativeAlpha: number[] = [];
  const incrementalAlpha: number[] = [];
  const criticalValues: number[] = [];

  for (let i = 0; i < informationFractions.length; i++) {
    const cumAlpha = spendFn(informationFractions[i], alpha);
    cumulativeAlpha.push(cumAlpha);

    const incAlpha = i === 0 ? cumAlpha : cumAlpha - cumulativeAlpha[i - 1];
    incrementalAlpha.push(Math.max(incAlpha, 0));

    // Two-sided critical value from incremental alpha
    const cv = normalQuantile(1 - incAlpha / 2);
    criticalValues.push(cv);
  }

  return { cumulativeAlpha, incrementalAlpha, criticalValues };
}

// ─── Conditional Power ─────────────────────────────────────────────────────────

/**
 * Conditional power: P(reject H0 at final analysis | current data)
 *
 * Given test statistic Z_k at look k with information fraction t_k,
 * the conditional power under effect delta assuming final information = 1 is:
 *   CP = 1 - Phi( (z_final * sqrt(1) - Z_k * sqrt(t_k) - delta * (1 - t_k)) / sqrt(1 - t_k) )
 *
 * Simplified for the standard case:
 *   CP = Phi( (Z_k * sqrt(t_k/(1-t_k)) + delta * sqrt(n_remaining) - z_alpha) )
 */
function computeConditionalPower(
  testStatistic: number,
  informationFraction: number,
  finalCriticalValue: number,
  assumedEffect: number = 0
): number {
  if (informationFraction >= 1) return testStatistic >= finalCriticalValue ? 1 : 0;
  if (informationFraction <= 0) return 0;

  const tK = informationFraction;
  const remaining = 1 - tK;

  // Under assumed effect delta, conditional power:
  // CP = Phi((Z_k * sqrt(t_k) + delta * sqrt(remaining) - z_final * sqrt(1)) / sqrt(remaining))
  // When delta=0, this is the conditional power under the current trend.
  const numerator = testStatistic * Math.sqrt(tK) + assumedEffect * Math.sqrt(remaining) - finalCriticalValue;
  const denominator = Math.sqrt(remaining);

  return normalCDF(numerator / denominator);
}

// ─── Predictive Power ──────────────────────────────────────────────────────────

/**
 * Predictive power: E[conditional power] integrated over the posterior of the effect size.
 *
 * Uses a normal prior on delta, with posterior updated by interim data:
 *   posterior mean = (prior_var * Z_k / sqrt(t_k * n) + prior_mean / prior_var) / (1/prior_var + t_k * n)
 *
 * Simplified: we approximate by Bayesian predictive power via numerical integration
 * using the posterior N(deltaHat, sigma2_post) where deltaHat = Z_k / sqrt(t_k * N).
 */
function computePredictivePower(
  testStatistic: number,
  informationFraction: number,
  totalSampleSize: number,
  finalCriticalValue: number,
  priorMean: number = 0,
  priorVariance: number = 1
): number {
  const tK = informationFraction;
  if (tK >= 1 || tK <= 0) return 0;

  // Observed effect estimate (standardized)
  const nCurrent = Math.floor(tK * totalSampleSize);
  const deltaHat = testStatistic / Math.sqrt(nCurrent > 0 ? nCurrent : 1);

  // Posterior parameters (conjugate normal)
  const likelihoodPrecision = nCurrent;
  const priorPrecision = 1 / priorVariance;
  const posteriorPrecision = priorPrecision + likelihoodPrecision;
  const posteriorMean =
    (priorPrecision * priorMean + likelihoodPrecision * deltaHat) / posteriorPrecision;
  const posteriorSD = 1 / Math.sqrt(posteriorPrecision);

  // Numerical integration over posterior using Gauss-Hermite-like quadrature (simple grid)
  const nPoints = 100;
  let ppSum = 0;
  for (let i = 0; i < nPoints; i++) {
    const u = (i + 0.5) / nPoints;
    const delta = posteriorMean + posteriorSD * normalQuantile(u);
    const cp = computeConditionalPower(testStatistic, tK, finalCriticalValue, delta);
    ppSum += cp;
  }

  return ppSum / nPoints;
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
    const informationFractions = interimLooks.map(
      (look: any) => look.informationFraction ?? look.timing ?? 0.5
    );

    const alpha = stoppingRules.find((r: any) => r.type === 'efficacy')?.alpha ?? 0.025;

    const spendingFn = spendingFunction === 'pocock' ? 'pocock' : 'obrien-fleming';
    const boundaries = calculateSpendingBoundaries(
      informationFractions,
      alpha,
      spendingFn as 'obrien-fleming' | 'pocock'
    );

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

    // Retrieve spending boundaries from plan
    const spendingParams = plan.spendingParameters as any;
    const alpha = spendingParams?.alpha ?? 0.025;
    const spendingFn = (plan.spendingFunction || 'obrien-fleming') as 'obrien-fleming' | 'pocock';

    // Recalculate boundary for this information fraction
    const boundaries = calculateSpendingBoundaries([informationFraction], alpha, spendingFn);
    const currentCriticalValue = boundaries.criticalValues[0];

    // Calculate test statistic from summary statistics
    let testStatistic = 0;
    if (summaryStatistics) {
      testStatistic = this.computeTestStatistic(summaryStatistics);
    }

    // Final critical value for conditional/predictive power (alpha at t=1)
    const finalCriticalValue = normalQuantile(1 - alpha);

    // Conditional power under current trend
    const conditionalPower = computeConditionalPower(
      testStatistic,
      informationFraction,
      finalCriticalValue
    );

    // Predictive power with non-informative prior
    const predictivePower = computePredictivePower(
      testStatistic,
      informationFraction,
      plan.maxSampleSize || 500,
      finalCriticalValue
    );

    // Construct boundary information
    const boundaryInfo = {
      criticalValue: currentCriticalValue,
      cumulativeAlpha: boundaries.cumulativeAlpha[0],
      efficacyCrossed: Math.abs(testStatistic) >= currentCriticalValue,
      direction: testStatistic >= 0 ? 'positive' : 'negative',
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
        predictivePower,
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
          const criticalValue = boundaryInfo?.criticalValue ?? normalQuantile(1 - (rule.alpha ?? 0.025));
          const crossed = Math.abs(testStatistic) >= criticalValue;
          evaluation.triggered = crossed;
          evaluation.detail = crossed
            ? `Test statistic |${testStatistic.toFixed(4)}| >= critical value ${criticalValue.toFixed(4)}. Efficacy boundary crossed.`
            : `Test statistic |${testStatistic.toFixed(4)}| < critical value ${criticalValue.toFixed(4)}. Efficacy boundary not crossed.`;
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
    const achievedPower = normalCDF(achievedZBeta);

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
    if (Math.abs(testStatistic) >= criticalValue) {
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
          ev.triggered = Math.abs(testStatistic) >= cv;
          ev.detail = ev.triggered
            ? `Efficacy boundary crossed (|Z|=${Math.abs(testStatistic).toFixed(4)} >= ${cv.toFixed(4)})`
            : `Efficacy boundary not crossed (|Z|=${Math.abs(testStatistic).toFixed(4)} < ${cv.toFixed(4)})`;
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
    nSim: number
  ): any {
    const effectSizes = [0, 0.1, 0.2, 0.3, 0.5];
    const alpha = config.stoppingRules.find((r: any) => r.type === 'efficacy')?.alpha ?? 0.025;
    const spendingFn = (config.spendingFunction === 'pocock' ? 'pocock' : 'obrien-fleming') as
      | 'obrien-fleming'
      | 'pocock';

    const informationFractions = config.interimLooks.map(
      (look: any) => look.informationFraction ?? look.timing ?? 0.5
    );

    // Include final analysis at t=1
    const allFractions = [...informationFractions];
    if (allFractions[allFractions.length - 1] < 1) {
      allFractions.push(1.0);
    }

    const boundaries = calculateSpendingBoundaries(allFractions, alpha, spendingFn);
    const nLooks = allFractions.length;

    const scenarios: any[] = [];

    for (const delta of effectSizes) {
      let rejectCount = 0;
      let totalSampleSizeSum = 0;
      const stageRejects = new Array(nLooks).fill(0);

      for (let sim = 0; sim < nSim; sim++) {
        let rejected = false;

        for (let k = 0; k < nLooks; k++) {
          const tK = allFractions[k];
          const nK = Math.floor(tK * config.maxSampleSize);

          // Generate test statistic: Z_k ~ N(delta * sqrt(n_k / 2), 1)
          const drift = delta * Math.sqrt(nK / 2);
          const Zk = drift + randomNormal();

          if (Math.abs(Zk) >= boundaries.criticalValues[k]) {
            rejectCount++;
            stageRejects[k]++;
            totalSampleSizeSum += nK;
            rejected = true;
            break;
          }

          // Check futility (if defined)
          const futilityRule = config.stoppingRules.find((r: any) => r.type === 'futility');
          if (futilityRule && k < nLooks - 1) {
            const finalCV = normalQuantile(1 - alpha);
            const cp = computeConditionalPower(Zk, tK, finalCV, delta);
            if (cp < (futilityRule.conditionalPowerThreshold ?? 0.2) && tK >= (futilityRule.minInformationFraction ?? 0.3)) {
              totalSampleSizeSum += nK;
              rejected = false;
              break;
            }
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
        rejectionRate,
        expectedSampleSize: Math.round(avgSampleSize),
        stageRejections: stageRejects,
        nSimulations: nSim,
      });
    }

    const nullScenario = scenarios.find((s) => s.effectSize === 0);
    const designScenario = scenarios.find((s) => s.effectSize === 0.3) ?? scenarios[scenarios.length - 1];

    const summary = {
      typeIError: nullScenario?.rejectionRate ?? 0,
      power: designScenario?.rejectionRate ?? 0,
      expectedSampleSizeUnderNull: nullScenario?.expectedSampleSize ?? config.maxSampleSize,
      expectedSampleSizeUnderAlternative: designScenario?.expectedSampleSize ?? config.maxSampleSize,
      maxSampleSize: config.maxSampleSize,
      numberOfLooks: nLooks,
      spendingFunction: config.spendingFunction,
      boundaries: {
        informationFractions: allFractions,
        criticalValues: boundaries.criticalValues,
        cumulativeAlpha: boundaries.cumulativeAlpha,
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
      },
    };
  }
}

export const adaptiveTrialOperationsService = new AdaptiveTrialOperationsService();
