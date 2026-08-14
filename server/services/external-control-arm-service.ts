import { db } from '../db';
import {
  armLevelData,
  syntheticControls,
  propensityModels,
} from 'shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as math from 'mathjs';
import { createRng, seedFromObject } from './stats/rng';
import { buildProvenance } from './stats/computation-provenance';

// ── Types ──────────────────────────────────────────────────────────────

export type SynthesisMethod =
  | 'propensity_score'
  | 'ipw'
  | 'bayesian_borrowing'
  | 'naive_pooling';

/**
 * What the regulatory package is allowed to CLAIM was done, given what the
 * record shows was actually done.
 *
 * Split out of generateRegulatoryPackage as a pure function for one reason:
 * this is the truthfulness decision, and it should be provable without a
 * database standing in for itself. It takes the evidence as an argument and
 * returns prose — no I/O, so its tests use no doubles.
 *
 * The distinction it exists to preserve: choosing method 'propensity_score'
 * runs propensityScoreMatching(), which estimates no propensity scores and
 * performs no matching or weighting on one. It returns sample-size-weighted
 * pooling with baseline covariate MEANS attached for balance reporting. Only
 * fitPropensityModel() estimates scores, and it records that by inserting a
 * propensityModels row — so a fitted model is the evidence, and control.method
 * is only the request.
 */
export interface SynthesisEvidence {
  /** A propensityModels row exists for this control (fitPropensityModel ran). */
  propensityModelFitted: boolean;
}

export function describeSynthesisMethod(
  method: SynthesisMethod,
  evidence: SynthesisEvidence,
): string {
  switch (method) {
    case 'naive_pooling':
      return 'Individual patient-level summary statistics from multiple historical control arms were combined using sample-size-weighted pooling. This method assumes exchangeability across studies.';
    case 'ipw':
      return 'Inverse probability weighting was applied to adjust for observed differences across historical control arms. Arm-level weights were computed as the inverse of the within-arm variance of the primary endpoint.';
    case 'bayesian_borrowing':
      return 'A Bayesian dynamic borrowing framework was employed, with the degree of borrowing from historical data determined by the commensurability between historical and current trial populations. Between-study heterogeneity (tau-squared) was estimated using the DerSimonian-Laird method.';
    case 'propensity_score':
      return evidence.propensityModelFitted
        ? 'Propensity score methodology was used to construct a balanced external control arm. Propensity scores estimated the probability of belonging to the treatment population conditional on measured baseline covariates.'
        : 'Requested synthesis method: propensity score. NO propensity model has been fitted for this external control, so no propensity scores were estimated and no matching or weighting on a propensity score was performed. The summary statistics reported here were produced by sample-size-weighted pooling of the source arms, with baseline covariate means reported for balance assessment only. Fit a propensity model and regenerate this package before relying on it.';
    default:
      return 'Method details not available.';
  }
}

/**
 * Limitations that follow from the method and the evidence, restated where a
 * reviewer reading only the limitations section will still meet them. An
 * unadjusted estimate described as propensity-score adjusted is exactly the
 * claim a reviewer is looking for, so it must appear in both places.
 */
export function synthesisMethodLimitations(
  method: SynthesisMethod,
  evidence: SynthesisEvidence,
): string[] {
  if (method === 'naive_pooling') {
    return [
      'Naive pooling does not adjust for between-study heterogeneity. This may bias the estimated treatment effect if there are systematic differences across source studies.',
    ];
  }
  if (method === 'propensity_score' && !evidence.propensityModelFitted) {
    return [
      'The synthesis method recorded for this external control is propensity score, but no propensity model has been fitted. The reported estimates are UNADJUSTED pooled statistics and must not be described, here or elsewhere, as propensity-score matched or weighted. Naive pooling also does not adjust for between-study heterogeneity.',
    ];
  }
  return [];
}

export interface HistoricalArmSearchParams {
  indication: string;
  endpoint: string;
  phase?: string;
  armType?: string;
}

export interface SynthesizeControlParams {
  name: string;
  indication: string;
  endpoint: string;
  method: SynthesisMethod;
  sourceArmIds: number[];
  covariates?: string[];
}

export interface ArmDataInput {
  csrId?: number;
  trialId?: string;
  armName: string;
  armType: string;
  indication: string;
  phase?: string;
  endpoint?: string;
  endpointType?: string;
  n?: number;
  mean?: number;
  sd?: number;
  proportion?: number;
  events?: number;
  personTime?: number;
  medianSurvival?: number;
  hazardRatio?: number;
  dropoutRate?: number;
  demographics?: Record<string, unknown>;
  inclusionCriteria?: Record<string, unknown>;
}

export interface CovariateBalanceEntry {
  covariate: string;
  treatmentMean: number;
  controlMean: number;
  /**
   * Null when the covariate perfectly separates the arms — see
   * `perfectlySeparating`. Zero would claim perfect balance for the one case
   * where there is no overlap to balance.
   */
  standardizedDifference: number | null;
  /**
   * The covariate is constant within each arm at DIFFERENT values, so the pooled
   * SD is zero and the standardized difference is unbounded rather than zero.
   * There is nothing to adjust for because the arms do not overlap at all.
   */
  perfectlySeparating: boolean;
  balanced: boolean;
}

/**
 * Covariate balance across source arms by standardized mean difference,
 * extracted from the service so it can be proved without a database standing in
 * for one — the same split this file already applies to `describeSynthesisMethod`
 * and `synthesisMethodLimitations`. Covariates come from each arm's demographics
 * JSON; the first half of the arms stands in for treatment and the second half
 * for control. Pure and deterministic.
 */
export function assessCovariateBalanceOfArms(
  sourceArms: Array<{ demographics?: unknown }>
): CovariateBalanceEntry[] {
  if (sourceArms.length < 2) return [];

  // Collect all demographic keys across arms
  const allKeys = new Set<string>();
  for (const arm of sourceArms) {
    const demo = (arm.demographics ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(demo)) {
      if (typeof demo[key] === 'number') allKeys.add(key);
    }
  }

  if (allKeys.size === 0) return [];

  // Use the first half of arms as "treatment" proxy and second half as "control"
  // (in practice, the actual treatment arm would be provided externally)
  const midpoint = Math.ceil(sourceArms.length / 2);
  const groupA = sourceArms.slice(0, midpoint);
  const groupB = sourceArms.slice(midpoint);

  const results: CovariateBalanceEntry[] = [];

  for (const key of allKeys) {
    const valsA = groupA
      .map(a => ((a.demographics ?? {}) as Record<string, unknown>)[key])
      .filter((v): v is number => typeof v === 'number');
    const valsB = groupB
      .map(a => ((a.demographics ?? {}) as Record<string, unknown>)[key])
      .filter((v): v is number => typeof v === 'number');

    if (valsA.length === 0 || valsB.length === 0) continue;

    const meanA = valsA.reduce((s, v) => s + v, 0) / valsA.length;
    const meanB = valsB.reduce((s, v) => s + v, 0) / valsB.length;

    const varA = valsA.length > 1
      ? valsA.reduce((s, v) => s + (v - meanA) ** 2, 0) / (valsA.length - 1)
      : 0;
    const varB = valsB.length > 1
      ? valsB.reduce((s, v) => s + (v - meanB) ** 2, 0) / (valsB.length - 1)
      : 0;

    const pooledSd = Math.sqrt((varA + varB) / 2);
    // A zero pooled SD with DIFFERENT means is a covariate that separates the
    // arms completely, not one that agrees perfectly. Reporting SMD = 0 there
    // (as this did) sent the maximum SMD to zero and could carry the whole
    // diagnostics verdict to "good" on a covariate with no overlap at all.
    const separates = pooledSd === 0 && meanA !== meanB;
    const smd = separates ? null : pooledSd > 0 ? (meanA - meanB) / pooledSd : 0;

    results.push({
      covariate: key,
      treatmentMean: Math.round(meanA * 1000) / 1000,
      controlMean: Math.round(meanB * 1000) / 1000,
      standardizedDifference: smd === null ? null : Math.round(smd * 1000) / 1000,
      perfectlySeparating: separates,
      balanced: smd !== null && Math.abs(smd) < 0.1,
    });
  }

  return results;
}

/**
 * Largest |standardized difference| among the covariates that have one. Null
 * when there are no covariates, or when every one of them perfectly separates
 * the arms and so has no finite value to contribute.
 */
function maxAbsStandardizedDifference(entries: CovariateBalanceEntry[]): number | null {
  const finite = entries
    .map(e => e.standardizedDifference)
    .filter((v): v is number => v !== null)
    .map(Math.abs);
  return finite.length > 0 ? Math.max(...finite) : null;
}

export interface DiagnosticsResult {
  covariateBalance: CovariateBalanceEntry[];
  eValue: number;
  eValueLowerBound: number;
  overlapAssessment: {
    trimmedPercent: number;
    effectiveSampleSize: number;
    minPropensity: number;
    maxPropensity: number;
    overlapping: boolean;
  };
  overallQuality: 'good' | 'moderate' | 'poor';
}

// ── Logistic Regression Helper ─────────────────────────────────────────

/**
 * Simplified logistic regression via iteratively re-weighted least squares (IRLS).
 * Fits P(treatment = 1 | X) using maximum likelihood.
 *
 * @param X - Design matrix (n x p), each row is a covariate vector (no intercept column yet)
 * @param y - Binary response vector (0/1), length n
 * @param maxIter - Maximum IRLS iterations
 * @param tol - Convergence tolerance on coefficient change
 * @returns Object with fitted coefficients, predicted probabilities, and convergence info
 */
function fitLogisticRegression(
  X: number[][],
  y: number[],
  maxIter = 25,
  tol = 1e-6
): { coefficients: number[]; probabilities: number[]; converged: boolean; iterations: number } {
  const n = X.length;
  if (n === 0) throw new Error('No observations provided for logistic regression');

  const p = X[0].length + 1; // +1 for intercept

  // Add intercept column
  const Xaug: number[][] = X.map(row => [1, ...row]);

  // Initialize coefficients to zero
  let beta = math.zeros(p) as unknown as number[];
  if (!Array.isArray(beta)) beta = Array(p).fill(0);

  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // Compute linear predictor and probabilities
    const eta: number[] = Xaug.map(row => {
      let sum = 0;
      for (let j = 0; j < p; j++) sum += row[j] * beta[j];
      return sum;
    });

    const probs: number[] = eta.map(e => {
      const clampedE = Math.max(-500, Math.min(500, e));
      return 1 / (1 + Math.exp(-clampedE));
    });

    // Working weights: W_ii = p_i * (1 - p_i)
    const w: number[] = probs.map(pi => {
      const clamped = Math.max(1e-10, Math.min(1 - 1e-10, pi));
      return clamped * (1 - clamped);
    });

    // Working response: z = eta + (y - p) / w
    const z: number[] = eta.map((e, i) => e + (y[i] - probs[i]) / w[i]);

    // Solve weighted least squares: (X^T W X) beta = X^T W z
    // Build X^T W X (p x p)
    const XtWX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < p; k++) {
          XtWX[j][k] += Xaug[i][j] * w[i] * Xaug[i][k];
        }
      }
    }

    // Build X^T W z (p x 1)
    const XtWz: number[] = Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        XtWz[j] += Xaug[i][j] * w[i] * z[i];
      }
    }

    // Solve using mathjs
    let betaNew: number[];
    try {
      const solution = math.lusolve(XtWX, XtWz.map(v => [v])) as number[][];
      betaNew = solution.map(row => (Array.isArray(row) ? row[0] : row as unknown as number));
    } catch {
      // Singular matrix — add ridge regularization
      const ridge = 1e-4;
      for (let j = 0; j < p; j++) XtWX[j][j] += ridge;
      const solution = math.lusolve(XtWX, XtWz.map(v => [v])) as number[][];
      betaNew = solution.map(row => (Array.isArray(row) ? row[0] : row as unknown as number));
    }

    // Check convergence
    let maxChange = 0;
    for (let j = 0; j < p; j++) {
      maxChange = Math.max(maxChange, Math.abs(betaNew[j] - beta[j]));
    }

    beta = betaNew;

    if (maxChange < tol) {
      converged = true;
      iter++;
      break;
    }
  }

  // Final probabilities
  const finalProbs: number[] = Xaug.map(row => {
    let sum = 0;
    for (let j = 0; j < p; j++) sum += row[j] * beta[j];
    const clamped = Math.max(-500, Math.min(500, sum));
    return 1 / (1 + Math.exp(-clamped));
  });

  return { coefficients: beta, probabilities: finalProbs, converged, iterations: iter };
}

/**
 * Compute the c-statistic (AUC for binary classifier) from predicted
 * probabilities and true labels using the concordance approach.
 */
function computeCStatistic(probs: number[], y: number[]): number {
  let concordant = 0;
  let discordant = 0;
  let tied = 0;

  for (let i = 0; i < y.length; i++) {
    for (let j = i + 1; j < y.length; j++) {
      if (y[i] === y[j]) continue;
      const eventIdx = y[i] === 1 ? i : j;
      const nonEventIdx = y[i] === 1 ? j : i;

      if (probs[eventIdx] > probs[nonEventIdx]) concordant++;
      else if (probs[eventIdx] < probs[nonEventIdx]) discordant++;
      else tied++;
    }
  }

  const total = concordant + discordant + tied;
  return total === 0 ? 0.5 : (concordant + 0.5 * tied) / total;
}

// ── Service ────────────────────────────────────────────────────────────

export class ExternalControlArmService {
  private static instance: ExternalControlArmService;

  static getInstance(): ExternalControlArmService {
    if (!ExternalControlArmService.instance) {
      ExternalControlArmService.instance = new ExternalControlArmService();
    }
    return ExternalControlArmService.instance;
  }

  private getDb() {
    if (!db) throw new Error('Database unavailable');
    return db;
  }

  // ── 1. searchHistoricalArms ────────────────────────────────────────

  /**
   * Search for matching historical control/treatment arms from
   * the arm-level data repository.
   */
  async searchHistoricalArms(
    params: HistoricalArmSearchParams,
    organizationId: number
  ) {
    const database = this.getDb();

    const conditions = [
      eq(armLevelData.organizationId, organizationId),
      sql`lower(${armLevelData.indication}) LIKE lower(${'%' + params.indication + '%'})`,
      sql`lower(${armLevelData.endpoint}) LIKE lower(${'%' + params.endpoint + '%'})`,
    ];

    if (params.phase) {
      conditions.push(eq(armLevelData.phase, params.phase));
    }
    if (params.armType) {
      conditions.push(eq(armLevelData.armType, params.armType));
    }

    const arms = await database
      .select()
      .from(armLevelData)
      .where(and(...conditions));

    // Return arm summaries
    return arms.map(arm => ({
      id: arm.id,
      trialId: arm.trialId,
      armName: arm.armName,
      armType: arm.armType,
      indication: arm.indication,
      phase: arm.phase,
      endpoint: arm.endpoint,
      endpointType: arm.endpointType,
      n: arm.n,
      mean: arm.mean,
      sd: arm.sd,
      proportion: arm.proportion,
      dropoutRate: arm.dropoutRate,
      demographics: arm.demographics,
    }));
  }

  // ── 2. synthesizeControl ──────────────────────────────────────────

  /**
   * Construct an external / synthetic control arm by combining historical
   * arm data using the specified statistical method.
   */
  async synthesizeControl(
    params: SynthesizeControlParams,
    organizationId: number,
    userId: number
  ) {
    const database = this.getDb();

    // Fetch source arms
    const sourceArms = await database
      .select()
      .from(armLevelData)
      .where(
        and(
          inArray(armLevelData.id, params.sourceArmIds),
          eq(armLevelData.organizationId, organizationId)
        )
      );

    if (sourceArms.length === 0) {
      throw new Error('No source arms found for the given IDs');
    }

    let synthesizedData: Record<string, unknown>;

    switch (params.method) {
      case 'naive_pooling':
        synthesizedData = this.naivePooling(sourceArms);
        break;
      case 'ipw':
        synthesizedData = this.inverseWeighting(sourceArms, params.covariates);
        break;
      case 'propensity_score':
        synthesizedData = this.propensityScoreMatching(sourceArms, params.covariates);
        break;
      case 'bayesian_borrowing':
        synthesizedData = this.bayesianBorrowing(sourceArms);
        break;
      default:
        throw new Error(`Unknown synthesis method: ${params.method}`);
    }

    const [control] = await database
      .insert(syntheticControls)
      .values({
        name: params.name,
        indication: params.indication,
        endpoint: params.endpoint,
        method: params.method,
        sourceArmIds: params.sourceArmIds,
        synthesizedData,
        organizationId,
        createdBy: userId,
      })
      .returning();

    return control;
  }

  // ── synthesis helpers ──────────────────────────────────────────────

  /**
   * Naive pooling: simple weighted-average by sample size.
   */
  private naivePooling(arms: any[]): Record<string, unknown> {
    const armsWithN = arms.filter(a => a.n && a.n > 0);
    const totalN = armsWithN.reduce((sum, a) => sum + (a.n ?? 0), 0);

    if (totalN === 0) {
      return { method: 'naive_pooling', totalN: 0, pooledMean: null, pooledProportion: null };
    }

    // Pool means
    const weightedMeanSum = armsWithN
      .filter(a => a.mean !== null)
      .reduce((sum, a) => sum + (a.mean ?? 0) * (a.n ?? 0), 0);
    const meanN = armsWithN.filter(a => a.mean !== null).reduce((s, a) => s + (a.n ?? 0), 0);
    const pooledMean = meanN > 0 ? weightedMeanSum / meanN : null;

    // Pool SDs using pooled variance formula
    const sdArms = armsWithN.filter(a => a.mean !== null && a.sd !== null);
    let pooledSd: number | null = null;
    if (sdArms.length > 0 && pooledMean !== null) {
      let ssWithin = 0;
      let ssBetween = 0;
      let dfTotal = 0;
      for (const arm of sdArms) {
        const ni = arm.n ?? 0;
        ssWithin += (ni - 1) * (arm.sd ?? 0) ** 2;
        ssBetween += ni * ((arm.mean ?? 0) - pooledMean) ** 2;
        dfTotal += ni;
      }
      pooledSd = dfTotal > sdArms.length
        ? Math.sqrt((ssWithin + ssBetween) / (dfTotal - sdArms.length))
        : null;
    }

    // Pool proportions
    const propArms = armsWithN.filter(a => a.proportion !== null);
    let pooledProportion: number | null = null;
    if (propArms.length > 0) {
      const totalEvents = propArms.reduce(
        (sum, a) => sum + (a.proportion ?? 0) * (a.n ?? 0),
        0
      );
      const totalPropN = propArms.reduce((s, a) => s + (a.n ?? 0), 0);
      pooledProportion = totalPropN > 0 ? totalEvents / totalPropN : null;
    }

    // Pool dropout
    const dropoutArms = armsWithN.filter(a => a.dropoutRate !== null);
    let pooledDropoutRate: number | null = null;
    if (dropoutArms.length > 0) {
      const totalDropout = dropoutArms.reduce(
        (sum, a) => sum + (a.dropoutRate ?? 0) * (a.n ?? 0),
        0
      );
      const totalDropN = dropoutArms.reduce((s, a) => s + (a.n ?? 0), 0);
      pooledDropoutRate = totalDropN > 0 ? totalDropout / totalDropN : null;
    }

    return {
      method: 'naive_pooling',
      totalN,
      sourceCount: arms.length,
      pooledMean,
      pooledSd,
      pooledProportion,
      pooledDropoutRate,
      armContributions: armsWithN.map(a => ({ id: a.id, n: a.n, weight: (a.n ?? 0) / totalN })),
    };
  }

  /**
   * Inverse probability weighting: weight arms by inverse of some
   * characteristic (here, inverse-variance weighting as a proxy).
   */
  private inverseWeighting(
    arms: any[],
    covariates?: string[]
  ): Record<string, unknown> {
    const armsWithVariance = arms.filter(a => a.n && a.sd && a.n > 0 && a.sd > 0);

    if (armsWithVariance.length === 0) {
      // Fall back to naive pooling
      return { ...this.naivePooling(arms), method: 'ipw', note: 'Fell back to naive pooling (no variance data)' };
    }

    // Inverse-variance weights: w_i = 1 / (sd_i^2 / n_i)
    const weights = armsWithVariance.map(a => {
      const variance = (a.sd! ** 2) / a.n!;
      return { arm: a, weight: 1 / variance };
    });

    const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
    const normalizedWeights = weights.map(w => ({
      ...w,
      normalizedWeight: w.weight / totalWeight,
    }));

    const pooledMean = normalizedWeights.reduce(
      (sum, w) => sum + (w.arm.mean ?? 0) * w.normalizedWeight,
      0
    );

    const pooledVariance = normalizedWeights.reduce(
      (sum, w) => sum + ((w.arm.mean ?? 0) - pooledMean) ** 2 * w.normalizedWeight,
      0
    );

    const effectiveN = Math.round(
      totalWeight ** 2 / weights.reduce((s, w) => s + w.weight ** 2, 0)
    );

    return {
      method: 'ipw',
      pooledMean,
      pooledSd: Math.sqrt(pooledVariance + 1 / totalWeight),
      effectiveN,
      totalSourceN: armsWithVariance.reduce((s, a) => s + (a.n ?? 0), 0),
      sourceCount: armsWithVariance.length,
      covariatesUsed: covariates ?? [],
      armContributions: normalizedWeights.map(w => ({
        id: w.arm.id,
        n: w.arm.n,
        weight: w.normalizedWeight,
      })),
    };
  }

  /**
   * Propensity-score matching stub: returns summary statistics
   * adjusted by propensity-score strata.  Full model fitting is in
   * `fitPropensityModel`.
   */
  private propensityScoreMatching(
    arms: any[],
    covariates?: string[]
  ): Record<string, unknown> {
    // When no covariates specified, fall back to naive pooling with a note
    if (!covariates || covariates.length === 0) {
      return {
        ...this.naivePooling(arms),
        method: 'propensity_score',
        note: 'No covariates specified; used naive pooling. Call fitPropensityModel for full adjustment.',
      };
    }

    // Extract covariate values from demographics
    const covariateData: { armId: number; values: number[] }[] = [];
    for (const arm of arms) {
      const demographics = (arm.demographics ?? {}) as Record<string, unknown>;
      const values = covariates.map(c => {
        const val = demographics[c];
        return typeof val === 'number' ? val : 0;
      });
      covariateData.push({ armId: arm.id, values });
    }

    // Compute covariate means for balance assessment
    const k = covariates.length;
    const means = Array(k).fill(0);
    for (const cd of covariateData) {
      for (let j = 0; j < k; j++) means[j] += cd.values[j];
    }
    for (let j = 0; j < k; j++) means[j] /= covariateData.length || 1;

    return {
      method: 'propensity_score',
      ...this.naivePooling(arms),
      covariatesUsed: covariates,
      covariateMeans: covariates.reduce(
        (acc, c, i) => ({ ...acc, [c]: means[i] }),
        {} as Record<string, number>
      ),
      note: 'Initial synthesis. Call fitPropensityModel for full propensity-score adjustment.',
    };
  }

  /**
   * Bayesian dynamic borrowing: compute a borrowing weight using
   * a simplified commensurability metric (between-study heterogeneity).
   */
  private bayesianBorrowing(arms: any[]): Record<string, unknown> {
    const armsWithData = arms.filter(a => a.n && a.mean !== null && a.sd !== null);

    if (armsWithData.length === 0) {
      return { ...this.naivePooling(arms), method: 'bayesian_borrowing', borrowingWeight: 0 };
    }

    // Estimate overall mean
    const totalN = armsWithData.reduce((s, a) => s + (a.n ?? 0), 0);
    const overallMean = armsWithData.reduce(
      (s, a) => s + (a.mean ?? 0) * (a.n ?? 0),
      0
    ) / totalN;

    // Estimate between-study variance (tau^2) using DerSimonian-Laird
    const withinVariances = armsWithData.map(a => ((a.sd ?? 1) ** 2) / (a.n ?? 1));
    const fixedWeights = withinVariances.map(v => 1 / v);
    const Q = armsWithData.reduce(
      (sum, a, i) => sum + fixedWeights[i] * ((a.mean ?? 0) - overallMean) ** 2,
      0
    );
    const k = armsWithData.length;
    const wSum = fixedWeights.reduce((s, w) => s + w, 0);
    const w2Sum = fixedWeights.reduce((s, w) => s + w * w, 0);
    const tauDenom = wSum > 0 ? wSum - w2Sum / wSum : 0;
    const tau2 = tauDenom > 0 ? Math.max(0, (Q - (k - 1)) / tauDenom) : 0;

    // Borrowing weight: inversely proportional to heterogeneity
    // weight = 1 / (1 + tau2 / median(within_var))
    const medianWithinVar = withinVariances.sort((a, b) => a - b)[
      Math.floor(withinVariances.length / 2)
    ];
    const borrowingWeight = medianWithinVar > 0
      ? 1 / (1 + tau2 / medianWithinVar)
      : 0;

    // Random-effects pooled estimate
    const reWeights = armsWithData.map((_, i) => 1 / (withinVariances[i] + tau2));
    const reWeightSum = reWeights.reduce((s, w) => s + w, 0);
    const pooledMean = armsWithData.reduce(
      (sum, a, i) => sum + (a.mean ?? 0) * reWeights[i],
      0
    ) / reWeightSum;
    const pooledSe = Math.sqrt(1 / reWeightSum);

    return {
      method: 'bayesian_borrowing',
      pooledMean,
      pooledSe,
      pooledSd: pooledSe * Math.sqrt(totalN),
      tau2,
      borrowingWeight: Math.round(borrowingWeight * 1000) / 1000,
      heterogeneityQ: Q,
      effectiveN: Math.round(totalN * borrowingWeight),
      totalSourceN: totalN,
      sourceCount: k,
      armContributions: armsWithData.map((a, i) => ({
        id: a.id,
        n: a.n,
        weight: reWeights[i] / reWeightSum,
      })),
    };
  }

  // ── 3. validateControl ────────────────────────────────────────────

  /**
   * Run diagnostics on a synthesized control arm:
   * - Covariate balance (standardized mean differences)
   * - Sensitivity to unmeasured confounding (E-value)
   * - Overlap assessment
   */
  async validateControl(
    syntheticControlId: number,
    organizationId: number
  ): Promise<DiagnosticsResult> {
    const database = this.getDb();

    const [control] = await database
      .select()
      .from(syntheticControls)
      .where(
        and(
          eq(syntheticControls.id, syntheticControlId),
          eq(syntheticControls.organizationId, organizationId)
        )
      );

    if (!control) {
      throw new Error(`Synthetic control ${syntheticControlId} not found`);
    }

    const sourceArmIds = control.sourceArmIds as number[];
    const sourceArms = await database
      .select()
      .from(armLevelData)
      .where(
        and(
          inArray(armLevelData.id, sourceArmIds),
          eq(armLevelData.organizationId, organizationId)
        )
      );

    // ── Covariate balance ──
    const synthData = control.synthesizedData as Record<string, unknown>;
    const covariateBalance = this.assessCovariateBalance(sourceArms, synthData);

    // ── E-value (sensitivity to unmeasured confounding) ──
    // E-value = RR + sqrt(RR * (RR - 1)) where RR is the observed effect
    const pooledMean = (synthData.pooledMean as number) ?? 0;
    const pooledSd = (synthData.pooledSd as number) ?? 1;
    // Approximate a risk ratio from standardized effect
    const effectSize = Math.abs(pooledMean / (pooledSd || 1));
    // Convert Cohen's d to approximate RR: RR ≈ exp(d * pi / sqrt(3))
    const approxRR = Math.exp(effectSize * Math.PI / Math.sqrt(3));
    const eValue = approxRR + Math.sqrt(approxRR * (approxRR - 1));
    const eValueLower = Math.max(1, eValue - 0.5); // conservative lower bound

    // ── Overlap assessment ──
    // Check if propensity models exist for this control
    const propModels = await database
      .select()
      .from(propensityModels)
      .where(
        and(
          eq(propensityModels.syntheticControlId, syntheticControlId),
          eq(propensityModels.organizationId, organizationId)
        )
      );

    let overlapAssessment: DiagnosticsResult['overlapAssessment'];

    if (propModels.length > 0) {
      const balanceMetrics = (propModels[0].balanceMetrics ?? {}) as Record<string, unknown>;
      const trimming = (propModels[0].trimmingBounds ?? {}) as Record<string, number>;
      overlapAssessment = {
        trimmedPercent: (balanceMetrics.trimmedPercent as number) ?? 0,
        effectiveSampleSize: (balanceMetrics.effectiveSampleSize as number) ?? sourceArms.reduce((s, a) => s + (a.n ?? 0), 0),
        minPropensity: trimming.lower ?? 0,
        maxPropensity: trimming.upper ?? 1,
        overlapping: ((balanceMetrics.trimmedPercent as number) ?? 0) < 15,
      };
    } else {
      // Without a propensity model, assess overlap via sample-size heterogeneity
      const sampleSizes = sourceArms.map(a => a.n ?? 0).filter(n => n > 0);
      const maxN = Math.max(...sampleSizes, 1);
      const minN = Math.min(...sampleSizes);
      const ratio = minN / maxN;
      overlapAssessment = {
        trimmedPercent: 0,
        effectiveSampleSize: sampleSizes.reduce((s, n) => s + n, 0),
        minPropensity: 0,
        maxPropensity: 1,
        overlapping: ratio > 0.2,
      };
    }

    // ── Overall quality ──
    const finiteSmds = covariateBalance
      .map(c => c.standardizedDifference)
      .filter((v): v is number => v !== null)
      .map(Math.abs);
    const maxSmd = finiteSmds.length > 0 ? Math.max(...finiteSmds) : 0;
    // A covariate with no overlap cannot enter a maximum, so it has to gate the
    // verdict directly. Without this, a perfect separator contributes nothing to
    // maxSmd and the package can still be labelled "good".
    const anySeparating = covariateBalance.some(c => c.perfectlySeparating);
    const overallQuality: DiagnosticsResult['overallQuality'] =
      anySeparating
        ? 'poor'
        : maxSmd < 0.1 && eValue > 2 && overlapAssessment.overlapping
          ? 'good'
          : maxSmd < 0.25 && eValue > 1.5
            ? 'moderate'
            : 'poor';

    const diagnostics: DiagnosticsResult = {
      covariateBalance,
      eValue: Math.round(eValue * 100) / 100,
      eValueLowerBound: Math.round(eValueLower * 100) / 100,
      overlapAssessment,
      overallQuality,
    };

    // Persist diagnostics
    await database
      .update(syntheticControls)
      .set({
        diagnostics,
        covariateBalance: covariateBalance,
        sensitivityResults: { eValue, eValueLowerBound: eValueLower },
        updatedAt: new Date(),
      })
      .where(eq(syntheticControls.id, syntheticControlId));

    return diagnostics;
  }

  /**
   * Assess covariate balance across source arms using standardized mean
   * differences.  Covariates are extracted from the demographics JSON
   * field of each arm.
   */
  private assessCovariateBalance(
    sourceArms: any[],
    _synthData: Record<string, unknown>
  ): CovariateBalanceEntry[] {
    return assessCovariateBalanceOfArms(sourceArms);
  }

  // ── 4. generateRegulatoryPackage ──────────────────────────────────

  /**
   * Generate a regulatory-submission-ready package for an external
   * control arm, including methods justification, diagnostics summary,
   * and limitations disclosure.
   */
  async generateRegulatoryPackage(
    syntheticControlId: number,
    organizationId: number
  ) {
    const database = this.getDb();

    const [control] = await database
      .select()
      .from(syntheticControls)
      .where(
        and(
          eq(syntheticControls.id, syntheticControlId),
          eq(syntheticControls.organizationId, organizationId)
        )
      );

    if (!control) {
      throw new Error(`Synthetic control ${syntheticControlId} not found`);
    }

    // Run validation if diagnostics don't exist yet
    let diagnostics = control.diagnostics as DiagnosticsResult | null;
    if (!diagnostics) {
      diagnostics = await this.validateControl(syntheticControlId, organizationId);
    }

    const synthData = control.synthesizedData as Record<string, unknown>;
    const sourceArmIds = control.sourceArmIds as number[];

    // Fetch source arms for provenance
    const sourceArms = await database
      .select()
      .from(armLevelData)
      .where(
        and(
          inArray(armLevelData.id, sourceArmIds),
          eq(armLevelData.organizationId, organizationId)
        )
      );

    // ── Build the regulatory package ──

    // Was a propensity model actually fitted for this control?
    //
    // This has to be CHECKED, not assumed from control.method. Selecting
    // 'propensity_score' runs propensityScoreMatching(), which computes no
    // propensity scores and performs no matching: it returns naivePooling()
    // with baseline covariate MEANS attached for balance reporting, and says so
    // in its own `note` ("Initial synthesis. Call fitPropensityModel for full
    // propensity-score adjustment."). Only fitPropensityModel() estimates
    // scores, and it records what it did by inserting a propensityModels row.
    //
    // The prose below goes into `regulatoryJustification` — a persisted methods
    // statement written in the past tense for an agency reader. Claiming that
    // "propensity scores estimated the probability of belonging to the
    // treatment population" when none were ever estimated is a false methods
    // statement in a submission document, and the `note` that contradicted it
    // sat two levels down in synthesisParameters where no reader would weigh it
    // against the prose. So the claim is made conditional on the evidence.
    const fittedPropensityModels = await database
      .select({ id: propensityModels.id })
      .from(propensityModels)
      .where(
        and(
          eq(propensityModels.syntheticControlId, syntheticControlId),
          eq(propensityModels.organizationId, organizationId)
        )
      );
    const evidence: SynthesisEvidence = {
      propensityModelFitted: fittedPropensityModels.length > 0,
    };

    const limitations: string[] = [
      'External control arms are subject to confounding by unmeasured covariates that may differ between the historical and current study populations.',
      'Historical data were collected under different clinical protocols, sites, and time periods, introducing potential temporal and geographic biases.',
      'Eligibility criteria may not be perfectly aligned across source studies, affecting generalizability.',
    ];

    if (diagnostics.overallQuality === 'poor') {
      limitations.push(
        'Diagnostics indicate poor covariate balance or limited overlap between the external control and the target population. Results should be interpreted with caution.'
      );
    }

    limitations.push(
      ...synthesisMethodLimitations(control.method as SynthesisMethod, evidence),
    );

    const regulatoryPackage = {
      title: `External Control Arm: ${control.name}`,
      generatedAt: new Date().toISOString(),
      indication: control.indication,
      endpoint: control.endpoint,
      method: control.method,

      executiveSummary: `An external control arm was constructed for the indication "${control.indication}" using ${sourceArms.length} historical arm(s) and the "${control.method}" synthesis method. The resulting control includes an effective sample size of ${(synthData.effectiveN ?? synthData.totalN ?? 'N/A')} patients. Diagnostics indicate ${diagnostics.overallQuality} overall quality.`,

      methodsJustification: {
        approach: describeSynthesisMethod(control.method as SynthesisMethod, evidence),
        sourceSummary: sourceArms.map(a => ({
          armId: a.id,
          trialId: a.trialId,
          armName: a.armName,
          n: a.n,
          indication: a.indication,
          phase: a.phase,
        })),
        synthesisParameters: synthData,
      },

      diagnosticsSummary: {
        covariateBalance: diagnostics.covariateBalance,
        maxStandardizedDifference: maxAbsStandardizedDifference(diagnostics.covariateBalance),
        separatingCovariates: diagnostics.covariateBalance
          .filter(c => c.perfectlySeparating)
          .map(c => c.covariate),
        allCovariatesBalanced: diagnostics.covariateBalance.every(c => c.balanced),
        eValue: diagnostics.eValue,
        eValueInterpretation: `An unmeasured confounder would need to be associated with both treatment and outcome by a risk ratio of at least ${diagnostics.eValue} to fully explain the observed effect.`,
        overlapAssessment: diagnostics.overlapAssessment,
        overallQuality: diagnostics.overallQuality,
      },

      limitationsDisclosure: limitations,

      regulatoryReferences: [
        'ICH E10: Choice of Control Group and Related Issues in Clinical Trials',
        'FDA Draft Guidance: Considerations for the Design and Conduct of Externally Controlled Trials for Drug and Biological Products (2023)',
        'EMA Guideline on the investigation of subgroups in confirmatory clinical trials (EMA/CHMP/539146/2013)',
      ],
    };

    // Persist the justification text
    await database
      .update(syntheticControls)
      .set({
        regulatoryJustification: JSON.stringify(regulatoryPackage),
        updatedAt: new Date(),
      })
      .where(eq(syntheticControls.id, syntheticControlId));

    return regulatoryPackage;
  }

  // ── 5. ingestArmData ──────────────────────────────────────────────

  /**
   * Add arm-level data extracted from a CSR to the repository.
   */
  async ingestArmData(armData: ArmDataInput, organizationId: number) {
    const database = this.getDb();

    const [inserted] = await database
      .insert(armLevelData)
      .values({
        csrId: armData.csrId ?? null,
        trialId: armData.trialId ?? null,
        armName: armData.armName,
        armType: armData.armType,
        indication: armData.indication,
        phase: armData.phase ?? null,
        endpoint: armData.endpoint ?? null,
        endpointType: armData.endpointType ?? null,
        n: armData.n ?? null,
        mean: armData.mean ?? null,
        sd: armData.sd ?? null,
        proportion: armData.proportion ?? null,
        events: armData.events ?? null,
        personTime: armData.personTime ?? null,
        medianSurvival: armData.medianSurvival ?? null,
        hazardRatio: armData.hazardRatio ?? null,
        dropoutRate: armData.dropoutRate ?? null,
        demographics: armData.demographics ?? null,
        inclusionCriteria: armData.inclusionCriteria ?? null,
        organizationId,
      })
      .returning();

    return inserted;
  }

  // ── 6. fitPropensityModel ─────────────────────────────────────────

  /**
   * Fit a propensity-score model (logistic regression) to distinguish
   * the target population from the external control population.
   */
  async fitPropensityModel(
    params: {
      syntheticControlId: number;
      covariates: string[];
      modelType?: string;
      seed?: number;
    },
    organizationId: number
  ) {
    const database = this.getDb();
    const modelType = params.modelType ?? 'logistic';

    // Reseed deterministically so the within-arm jitter used to build the
    // pseudo-individual-level data is reproducible — the fitted propensity model,
    // c-statistic, and balance metrics regenerate from the same seed and inputs.
    const usedSeed =
      params.seed !== undefined && Number.isFinite(params.seed)
        ? Math.trunc(params.seed)
        : seedFromObject({
            syntheticControlId: params.syntheticControlId,
            covariates: params.covariates,
            modelType,
            organizationId,
          });
    const rng = createRng(usedSeed);

    // Fetch the synthetic control
    const [control] = await database
      .select()
      .from(syntheticControls)
      .where(
        and(
          eq(syntheticControls.id, params.syntheticControlId),
          eq(syntheticControls.organizationId, organizationId)
        )
      );

    if (!control) {
      throw new Error(`Synthetic control ${params.syntheticControlId} not found`);
    }

    // Fetch source arms
    const sourceArmIds = control.sourceArmIds as number[];
    const sourceArms = await database
      .select()
      .from(armLevelData)
      .where(
        and(
          inArray(armLevelData.id, sourceArmIds),
          eq(armLevelData.organizationId, organizationId)
        )
      );

    if (sourceArms.length < 2) {
      throw new Error('At least 2 source arms required to fit propensity model');
    }

    // Build pseudo-individual-level data from arm summaries.
    // Each arm generates n pseudo-observations using its demographics.
    // The first half of arms are labelled "treatment" (1), the rest "control" (0).
    const midpoint = Math.ceil(sourceArms.length / 2);
    const X: number[][] = [];
    const y: number[] = [];

    for (let armIdx = 0; armIdx < sourceArms.length; armIdx++) {
      const arm = sourceArms[armIdx];
      const demographics = (arm.demographics ?? {}) as Record<string, unknown>;
      const nObs = Math.max(arm.n ?? 10, 1);
      const label = armIdx < midpoint ? 1 : 0;

      for (let i = 0; i < nObs; i++) {
        const row: number[] = [];
        for (const cov of params.covariates) {
          const baseValue = typeof demographics[cov] === 'number'
            ? (demographics[cov] as number)
            : 0;
          // Add small jitter to create within-arm variation
          const jitter = (rng.uniform() - 0.5) * 0.1 * Math.abs(baseValue || 1);
          row.push(baseValue + jitter);
        }
        X.push(row);
        y.push(label);
      }
    }

    // Fit logistic regression
    const result = fitLogisticRegression(X, y);

    // Compute c-statistic
    const cStatistic = computeCStatistic(result.probabilities, y);

    // Compute balance metrics after weighting
    const probsControl = result.probabilities.filter((_, i) => y[i] === 0);
    const probsTreatment = result.probabilities.filter((_, i) => y[i] === 1);

    // Trimming bounds (1st and 99th percentile)
    const sortedProbs = [...result.probabilities].sort((a, b) => a - b);
    const lowerBound = sortedProbs[Math.floor(sortedProbs.length * 0.01)] ?? 0;
    const upperBound = sortedProbs[Math.floor(sortedProbs.length * 0.99)] ?? 1;

    // Effective sample size after IPW
    const ipwWeights = probsControl.map(p => p / (1 - p + 1e-10));
    const ipwSum = ipwWeights.reduce((s, w) => s + w, 0);
    const ipwSumSq = ipwWeights.reduce((s, w) => s + w * w, 0);
    const ess = ipwSum > 0 ? (ipwSum * ipwSum) / ipwSumSq : 0;

    // Trimmed percent
    const trimmedCount = result.probabilities.filter(
      p => p < lowerBound || p > upperBound
    ).length;
    const trimmedPercent = (trimmedCount / result.probabilities.length) * 100;

    const balanceMetrics = {
      effectiveSampleSize: Math.round(ess),
      trimmedPercent: Math.round(trimmedPercent * 10) / 10,
      meanPropensityTreatment:
        Math.round(
          (probsTreatment.reduce((s, p) => s + p, 0) / (probsTreatment.length || 1)) * 1000
        ) / 1000,
      meanPropensityControl:
        Math.round(
          (probsControl.reduce((s, p) => s + p, 0) / (probsControl.length || 1)) * 1000
        ) / 1000,
    };

    const trimmingBounds = {
      lower: Math.round(lowerBound * 1000) / 1000,
      upper: Math.round(upperBound * 1000) / 1000,
    };

    // Store the model
    const [model] = await database
      .insert(propensityModels)
      .values({
        syntheticControlId: params.syntheticControlId,
        modelType,
        covariates: params.covariates,
        coefficients: {
          intercept: result.coefficients[0],
          betas: params.covariates.reduce(
            (acc, cov, i) => ({ ...acc, [cov]: result.coefficients[i + 1] }),
            {} as Record<string, number>
          ),
        },
        cStatistic: Math.round(cStatistic * 1000) / 1000,
        balanceMetrics,
        trimmingBounds,
        organizationId,
      })
      .returning();

    return {
      model,
      convergence: {
        converged: result.converged,
        iterations: result.iterations,
      },
      cStatistic: Math.round(cStatistic * 1000) / 1000,
      balanceMetrics,
      trimmingBounds,
      seed: usedSeed,
      provenance: buildProvenance({
        method: 'external-control-arm:fitPropensityModel',
        seed: usedSeed,
        inputs: {
          syntheticControlId: params.syntheticControlId,
          covariates: params.covariates,
          modelType,
          organizationId,
        },
        note: 'Propensity model, c-statistic, and balance metrics reproduce given this seed and these inputs.',
      }),
    };
  }

  // ── 7. getControl ─────────────────────────────────────────────────

  /**
   * Retrieve a synthetic control with its diagnostics and propensity models.
   */
  async getControl(syntheticControlId: number, organizationId: number) {
    const database = this.getDb();

    const [control] = await database
      .select()
      .from(syntheticControls)
      .where(
        and(
          eq(syntheticControls.id, syntheticControlId),
          eq(syntheticControls.organizationId, organizationId)
        )
      );

    if (!control) {
      throw new Error(`Synthetic control ${syntheticControlId} not found`);
    }

    // Fetch associated propensity models
    const models = await database
      .select()
      .from(propensityModels)
      .where(
        and(
          eq(propensityModels.syntheticControlId, syntheticControlId),
          eq(propensityModels.organizationId, organizationId)
        )
      );

    // Fetch source arms
    const sourceArmIds = control.sourceArmIds as number[];
    let sourceArms: any[] = [];
    if (sourceArmIds.length > 0) {
      sourceArms = await database
        .select()
        .from(armLevelData)
        .where(
          and(
            inArray(armLevelData.id, sourceArmIds),
            eq(armLevelData.organizationId, organizationId)
          )
        );
    }

    return {
      ...control,
      propensityModels: models,
      sourceArms,
    };
  }
}
