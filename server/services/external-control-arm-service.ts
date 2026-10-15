import { db } from '../db';
import {
  armLevelData,
  syntheticControls,
  propensityModels,
} from 'shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

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
 * pooling with baseline covariate MEANS attached for description. A
 * recorded propensityModels row is the only evidence of a fitted model, and
 * control.method is only the request. Nothing in this service writes one: its
 * one writer, fitPropensityModel(), simulated patients from arm means and was
 * removed on 2026-10-15.
 */
export interface SynthesisEvidence {
  /** A propensityModels row is recorded for this control. */
  propensityModelFitted: boolean;
}

export function describeSynthesisMethod(
  method: SynthesisMethod,
  evidence: SynthesisEvidence,
): string {
  switch (method) {
    // Until 2026-10-15 these described data and methods the service does not
    // have: "individual patient-level" statistics (it holds arm summaries),
    // weighting by a probability "to adjust for observed differences", and
    // borrowing set by commensurability with a current trial it never sees.
    case 'naive_pooling':
      return 'Arm-level summary statistics from multiple historical control arms were combined using sample-size-weighted pooling. This method assumes exchangeability across studies.';
    case 'ipw':
      return 'Requested synthesis method: inverse probability weighting. NO probability weights were estimated and no adjustment was made for differences in baseline covariates: the source arms hold arm-level summary statistics, not patient-level data. The arm means of the primary endpoint were combined by inverse-variance (fixed-effect) pooling, each arm weighted by its sample size divided by the variance of the endpoint.';
    case 'bayesian_borrowing':
      return 'Requested synthesis method: Bayesian dynamic borrowing. NO prior or posterior distribution was computed and no current-trial data was used, so the amount borrowed was not set by commensurability between the historical and current trial populations. The historical arm means were combined by random-effects pooling, with between-study heterogeneity (tau-squared) estimated by the DerSimonian-Laird method.';
    case 'propensity_score':
      return evidence.propensityModelFitted
        ? 'Propensity score methodology was used to construct a balanced external control arm. Propensity scores estimated the probability of belonging to the treatment population conditional on measured baseline covariates.'
        : 'Requested synthesis method: propensity score. NO propensity model has been fitted for this external control, so no propensity scores were estimated and no matching or weighting on a propensity score was performed. The summary statistics reported here were produced by sample-size-weighted pooling of the source arms, with baseline covariate means reported for description only. Fit a propensity model and regenerate this package before relying on it.';
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

// ── Diagnostics ────────────────────────────────────────────────────────

/** Overlap as a recorded propensity model states it; null where the record is silent. */
export interface OverlapAssessment {
  trimmedPercent: number | null;
  effectiveSampleSize: number | null;
  minPropensity: number | null;
  maxPropensity: number | null;
  overlapping: boolean | null;
}

/** Why each diagnostic was not assessed. */
export interface DiagnosticsNotAssessed {
  covariateBalance: string;
  eValue: string;
  overallQuality: string;
  /** Absent when overlap was judged from a recorded propensity model. */
  overlapAssessment?: string;
}

/**
 * What validateControl can assess from the record. Until 2026-10-15 every
 * field held a figure: an E-value from the control arm's own mean and SD (no
 * treatment effect exists to take one from), "balance" between the first and
 * second halves of the historical arms, a sample-size ratio as propensity
 * overlap, and from those a good/moderate/poor verdict.
 */
export interface DiagnosticsResult {
  /** Balance against the trial's treatment arm, whose covariates this service is never given. */
  covariateBalance: null;
  eValue: null;
  eValueLowerBound: null;
  overlapAssessment: OverlapAssessment | null;
  overallQuality: 'not_assessed';
  notAssessed: DiagnosticsNotAssessed;
}

const COVARIATE_BALANCE_NOT_ASSESSED =
  "No baseline covariates of the trial's treatment arm are supplied to this service, so balance between the target population and this external control was not assessed. Comparing some historical source arms with others is not that balance.";
const E_VALUE_NOT_ASSESSED =
  "No treatment-effect estimate is recorded for this external control. An E-value (VanderWeele & Ding 2017) needs an observed treatment-versus-control effect and its confidence interval; the synthesized control arm's own mean and SD are not one.";
const OVERLAP_NOT_ASSESSED =
  'No propensity model has been fitted for this external control, so propensity-score overlap was not assessed. The source arms hold arm-level summary statistics, not patient-level data.';
const OVERALL_QUALITY_NOT_ASSESSED =
  'Covariate balance against the target population and sensitivity to unmeasured confounding were not assessed, so no overall quality verdict is given.';

function recordedNumber(record: unknown, key: string): number | null {
  const value = ((record ?? {}) as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Overlap as a recorded propensity model states it, or why there is none. */
function overlapFromRecordedModel(
  model: { balanceMetrics: unknown; trimmingBounds: unknown } | undefined,
): { assessment: OverlapAssessment | null; notAssessed?: string } {
  if (!model) return { assessment: null, notAssessed: OVERLAP_NOT_ASSESSED };
  const trimmedPercent = recordedNumber(model.balanceMetrics, 'trimmedPercent');
  const assessment: OverlapAssessment = {
    trimmedPercent,
    effectiveSampleSize: recordedNumber(model.balanceMetrics, 'effectiveSampleSize'),
    minPropensity: recordedNumber(model.trimmingBounds, 'lower'),
    maxPropensity: recordedNumber(model.trimmingBounds, 'upper'),
    overlapping: trimmedPercent === null ? null : trimmedPercent < 15,
  };
  return trimmedPercent === null
    ? { assessment, notAssessed: 'The recorded propensity model records no trimmed percentage, so overlap was not judged.' }
    : { assessment };
}

/**
 * The patients in the arms that entered the synthesis. Until 2026-10-15 the
 * package printed `effectiveN` as "an effective sample size of N patients":
 * for 'ipw' that was the Kish effective number of ARMS.
 */
function contributingPatientsSentence(synthData: Record<string, unknown>): string {
  const n = synthData.totalSourceN ?? synthData.totalN;
  return typeof n === 'number'
    ? `The source arms that entered the synthesis report ${n} patients in total; no effective sample size was computed.`
    : 'The number of patients in the source arms that entered the synthesis is not recorded.';
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
   * What 'ipw' computes: inverse-variance (fixed-effect) pooling of the arm
   * means, each arm weighted by n / SD². No probability is estimated and no
   * covariate enters; the arms hold summaries, not patients.
   */
  private inverseWeighting(
    arms: any[],
    covariates?: string[]
  ): Record<string, unknown> {
    // An arm with n and SD but no mean was pooled as mean 0 until 2026-10-15.
    const armsWithVariance = arms.filter(a => a.n > 0 && a.sd > 0 && typeof a.mean === 'number');

    if (armsWithVariance.length === 0) {
      // Fall back to naive pooling
      return { ...this.naivePooling(arms), method: 'ipw', note: 'Fell back to naive pooling (no arm reports n, mean and SD)' };
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
      (sum, w) => sum + w.arm.mean * w.normalizedWeight,
      0
    );

    // Until 2026-10-15 this reported `effectiveN` (the Kish effective number of
    // ARMS, printed as patients), `pooledSd` (√(spread of arm means + 1/Σw), the
    // SD of no outcome) and the requested covariates as `covariatesUsed`.
    const effectiveArms = totalWeight ** 2 / weights.reduce((s, w) => s + w.weight ** 2, 0);

    return {
      method: 'ipw',
      pooledMean,
      pooledSe: Math.sqrt(1 / totalWeight),
      effectiveArms: Math.round(effectiveArms * 100) / 100,
      totalSourceN: armsWithVariance.reduce((s, a) => s + (a.n ?? 0), 0),
      sourceCount: armsWithVariance.length,
      covariatesUsed: [],
      ...(covariates && covariates.length > 0
        ? { note: `Covariates requested (${covariates.join(', ')}) were not used: inverse-variance pooling of arm summaries adjusts for none.` }
        : {}),
      armContributions: normalizedWeights.map(w => ({
        id: w.arm.id,
        n: w.arm.n,
        weight: w.normalizedWeight,
      })),
    };
  }

  /**
   * What 'propensity_score' computes: sample-size-weighted pooling of the
   * arms, with the requested covariates' arm-level values summarised. No
   * propensity score is estimated and no covariate enters the pooling.
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
        note: 'No covariates specified; used naive pooling. No propensity model is fitted by this service.',
      };
    }

    // A covariate an arm does not report counted as 0 until 2026-10-15,
    // pulling its mean towards zero. It now enters no mean, the arms that do
    // not report it are named, and a covariate no arm reports has no mean.
    const covariateMeans: Record<string, number | null> = {};
    const covariateNotReportedBy: Record<string, number[]> = {};
    for (const c of covariates) {
      const values: number[] = [];
      const notReportedBy: number[] = [];
      for (const arm of arms) {
        const val = ((arm.demographics ?? {}) as Record<string, unknown>)[c];
        if (typeof val === 'number' && Number.isFinite(val)) values.push(val);
        else notReportedBy.push(arm.id);
      }
      covariateMeans[c] = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
      if (notReportedBy.length > 0) covariateNotReportedBy[c] = notReportedBy;
    }

    return {
      method: 'propensity_score',
      ...this.naivePooling(arms),
      covariatesUsed: [],
      covariateMeans,
      covariateNotReportedBy,
      note: 'No propensity model is fitted by this service, and no covariate entered the pooling. covariateMeans are the unweighted means of the arm-level values over the arms that report each covariate, for description only.',
    };
  }

  /**
   * What 'bayesian_borrowing' computes: DerSimonian-Laird random-effects
   * pooling of the historical arm means. No prior, posterior or current-trial
   * data is involved.
   */
  private bayesianBorrowing(arms: any[]): Record<string, unknown> {
    const armsWithData = arms.filter(a => a.n > 0 && a.sd > 0 && typeof a.mean === 'number');

    if (armsWithData.length === 0) {
      return { ...this.naivePooling(arms), method: 'bayesian_borrowing', note: 'Fell back to naive pooling (no arm reports n, mean and SD)' };
    }

    const totalN = armsWithData.reduce((s, a) => s + a.n, 0);

    // Between-study variance (tau^2) by DerSimonian-Laird: Q is taken about the
    // inverse-variance (fixed-effect) mean. Until 2026-10-15 Q was taken about
    // the n-weighted mean, an in-place sort of withinVariances gave each arm
    // another arm's random-effects weight, one arm reported tau^2 = 0, and
    // `borrowingWeight` (1/(1 + tau^2/median within variance)), `effectiveN`
    // (totalN x that) and `pooledSd` (SE x √N) were reported, though none
    // involves a current trial and none is an outcome SD.
    const withinVariances: number[] = armsWithData.map(a => a.sd ** 2 / a.n);
    const fixedWeights = withinVariances.map(v => 1 / v);
    const k = armsWithData.length;
    const wSum = fixedWeights.reduce((s, w) => s + w, 0);
    const w2Sum = fixedWeights.reduce((s, w) => s + w * w, 0);
    const fixedMean = armsWithData.reduce((s, a, i) => s + fixedWeights[i] * a.mean, 0) / wSum;
    const Q = armsWithData.reduce(
      (sum, a, i) => sum + fixedWeights[i] * (a.mean - fixedMean) ** 2,
      0
    );
    const tau2 = k > 1 ? Math.max(0, (Q - (k - 1)) / (wSum - w2Sum / wSum)) : null;

    // Random-effects pooled estimate
    const reWeights = withinVariances.map(v => 1 / (v + (tau2 ?? 0)));
    const reWeightSum = reWeights.reduce((s, w) => s + w, 0);
    const pooledMean = armsWithData.reduce(
      (sum, a, i) => sum + a.mean * reWeights[i],
      0
    ) / reWeightSum;
    const pooledSe = Math.sqrt(1 / reWeightSum);

    return {
      method: 'bayesian_borrowing',
      pooledMean,
      pooledSe,
      tau2,
      heterogeneityQ: k > 1 ? Q : null,
      ...(k > 1 ? {} : { note: 'Between-study heterogeneity cannot be estimated from a single arm; tau-squared is not reported and the arm is pooled alone.' }),
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
   * The diagnostics this service can assess from the record, each null with
   * its reason when it cannot: covariate balance needs the trial's
   * treatment-arm covariates and an E-value a treatment-effect estimate, and
   * the service is given neither; propensity overlap needs a recorded
   * propensity model.
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

    const propModels = await database
      .select()
      .from(propensityModels)
      .where(
        and(
          eq(propensityModels.syntheticControlId, syntheticControlId),
          eq(propensityModels.organizationId, organizationId)
        )
      );
    const overlap = overlapFromRecordedModel(propModels[0]);

    const diagnostics: DiagnosticsResult = {
      covariateBalance: null,
      eValue: null,
      eValueLowerBound: null,
      overlapAssessment: overlap.assessment,
      overallQuality: 'not_assessed',
      notAssessed: {
        covariateBalance: COVARIATE_BALANCE_NOT_ASSESSED,
        eValue: E_VALUE_NOT_ASSESSED,
        overallQuality: OVERALL_QUALITY_NOT_ASSESSED,
        ...(overlap.notAssessed ? { overlapAssessment: overlap.notAssessed } : {}),
      },
    };

    // Persist diagnostics
    await database
      .update(syntheticControls)
      .set({
        diagnostics,
        covariateBalance: null,
        sensitivityResults: { eValue: null, eValueLowerBound: null, notAssessed: E_VALUE_NOT_ASSESSED },
        updatedAt: new Date(),
      })
      .where(eq(syntheticControls.id, syntheticControlId));

    return diagnostics;
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

    // Recomputed for every package. Persisted diagnostics were reused until
    // 2026-10-15, so a control validated by the earlier code kept its invented
    // E-value and verdict in every package built from it.
    const diagnostics = await this.validateControl(syntheticControlId, organizationId);

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
    // with baseline covariate MEANS attached, and says so in its own `note`.
    // Only a recorded propensityModels row is evidence of a fitted model.
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

    // A 'poor' verdict gated the only diagnostics caution until 2026-10-15;
    // nothing is assessed now, and the package says what was not.
    limitations.push(
      `The comparability of this external control with the target population has not been assessed. ${diagnostics.notAssessed.covariateBalance}`,
      `Sensitivity to unmeasured confounding has not been assessed. ${diagnostics.notAssessed.eValue}`,
    );

    limitations.push(
      ...synthesisMethodLimitations(control.method as SynthesisMethod, evidence),
    );

    const regulatoryPackage = {
      title: `External Control Arm: ${control.name}`,
      generatedAt: new Date().toISOString(),
      indication: control.indication,
      endpoint: control.endpoint,
      method: control.method,

      executiveSummary: `An external control arm was constructed for the indication "${control.indication}" using ${sourceArms.length} historical arm(s) and the "${control.method}" synthesis method. ${contributingPatientsSentence(synthData)} Diagnostics were not assessed: ${diagnostics.notAssessed.overallQuality}`,

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

      // No covariate is compared, so none is balanced, separating or maximal;
      // `[].every()` affirmed every covariate balanced until 2026-10-15.
      diagnosticsSummary: {
        covariateBalance: diagnostics.covariateBalance,
        maxStandardizedDifference: null,
        separatingCovariates: null,
        allCovariatesBalanced: null,
        eValue: diagnostics.eValue,
        eValueInterpretation: `Not assessed: ${diagnostics.notAssessed.eValue}`,
        overlapAssessment: diagnostics.overlapAssessment,
        overallQuality: diagnostics.overallQuality,
        notAssessed: diagnostics.notAssessed,
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

  // ── 6. getControl ─────────────────────────────────────────────────

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
