/**
 * @fileoverview Exposure-response & dose-selection engine (Project Optimus).
 * @module server/services/clinical-pharmacology/exposure-response-engine
 *
 * Selects a dose from the exposure-response (E-R) relationship rather than from
 * the maximum tolerated dose (MTD). For each candidate dose it predicts:
 *
 *   - efficacy as a fraction of Emax (Emax/Hill model on exposure), and
 *   - the probability of the safety event of interest (logistic on exposure),
 *     or a simple exposure threshold when a model is not available.
 *
 * It then recommends the LOWEST dose that reaches the efficacy plateau while
 * remaining within the acceptable safety bound — the dose-optimization logic
 * FDA's Project Optimus asks sponsors to show — and contrasts it with the MTD
 * (the highest still-tolerable dose) so the selection rationale is explicit.
 *
 * Pure module — no database, no network. Callable by ANA and the M2.7 builder.
 *
 * @compliance FDA Project Optimus / "Optimizing the Dosage of Human
 *   Prescription Drugs and Biological Products for the Treatment of Oncologic
 *   Diseases" (2024); ICH E4 (Dose-Response).
 */

export interface EmaxEfficacyModel {
  /** Concentration giving half-maximal effect, in exposure units. */
  ec50: number;
  /** Hill coefficient (default 1). */
  hill?: number;
}

export interface LogisticSafetyModel {
  /** Intercept of logit(P(AE)) = intercept + slope·exposure. */
  intercept: number;
  /** Slope per exposure unit. */
  slope: number;
  /** Maximum acceptable probability of the safety event (e.g. 0.3). */
  acceptableAeProbability: number;
}

export interface ThresholdSafetyModel {
  /** Exposure at/above which the dose is considered unsafe. */
  thresholdExposure: number;
}

export interface ExposureResponseInput {
  /** Candidate doses (mg), in any order. */
  dosesMg: number[];
  /**
   * Exposure produced per 1 mg of dose (linear). Provide this OR
   * `exposuresByDose`. Units are arbitrary but must match the models.
   */
  exposurePerMgDose?: number;
  /** Explicit exposure per dose, keyed by dose (mg). Overrides the linear factor. */
  exposuresByDose?: Record<number, number>;
  efficacy: EmaxEfficacyModel;
  safety: LogisticSafetyModel | ThresholdSafetyModel;
  /** Fraction of Emax that counts as the efficacy plateau (default 0.9). */
  targetEfficacyFraction?: number;
}

export interface DosePrediction {
  doseMg: number;
  exposure: number;
  /** Predicted efficacy as a fraction of Emax in [0,1]. */
  efficacyFraction: number;
  /** Predicted P(AE) when a logistic safety model is supplied. */
  pAE: number | null;
  efficacious: boolean;
  safe: boolean;
}

export type DoseLimit = 'efficacy_plateau' | 'safety' | 'no_acceptable_dose';

export interface ExposureResponseResult {
  predictions: DosePrediction[];
  targetEfficacyFraction: number;
  /** Lowest dose that is both efficacious and safe — the optimized dose. */
  optimizedDoseMg: number | null;
  /** Highest still-safe dose — the classical MTD-style pick. */
  mtdMg: number | null;
  limitedBy: DoseLimit;
  rationale: string;
  /** True when the optimized dose is strictly below the MTD (the Optimus point). */
  belowMtd: boolean;
}

function isLogistic(m: LogisticSafetyModel | ThresholdSafetyModel): m is LogisticSafetyModel {
  return (m as LogisticSafetyModel).slope !== undefined;
}

function efficacyFraction(exposure: number, model: EmaxEfficacyModel): number {
  const h = model.hill ?? 1;
  if (exposure <= 0) return 0;
  const num = exposure ** h;
  return num / (model.ec50 ** h + num);
}

function pAE(exposure: number, model: LogisticSafetyModel): number {
  const logit = model.intercept + model.slope * exposure;
  return 1 / (1 + Math.exp(-logit));
}

function round(value: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/**
 * Run the E-R analysis and recommend an optimized dose.
 *
 * @throws if neither an exposure factor nor explicit exposures are supplied.
 */
export function selectExposureResponseDose(input: ExposureResponseInput): ExposureResponseResult {
  if (!Array.isArray(input.dosesMg) || input.dosesMg.length === 0) {
    throw new Error('selectExposureResponseDose: at least one candidate dose is required');
  }
  if (input.exposurePerMgDose == null && !input.exposuresByDose) {
    throw new Error('selectExposureResponseDose: supply exposurePerMgDose or exposuresByDose');
  }

  const targetEfficacyFraction = input.targetEfficacyFraction ?? 0.9;
  const doses = [...new Set(input.dosesMg)].sort((a, b) => a - b);

  const predictions: DosePrediction[] = doses.map(doseMg => {
    const exposure =
      input.exposuresByDose?.[doseMg] ?? doseMg * (input.exposurePerMgDose as number);
    const ef = round(efficacyFraction(exposure, input.efficacy));
    let p: number | null = null;
    let safe: boolean;
    if (isLogistic(input.safety)) {
      p = round(pAE(exposure, input.safety));
      safe = p <= input.safety.acceptableAeProbability;
    } else {
      safe = exposure < input.safety.thresholdExposure;
    }
    return {
      doseMg,
      exposure: round(exposure),
      efficacyFraction: ef,
      pAE: p,
      efficacious: ef >= targetEfficacyFraction,
      safe,
    };
  });

  const safeDoses = predictions.filter(p => p.safe);
  const efficaciousAndSafe = safeDoses.filter(p => p.efficacious);

  const mtdMg = safeDoses.length ? safeDoses[safeDoses.length - 1].doseMg : null;
  const optimizedDoseMg = efficaciousAndSafe.length ? efficaciousAndSafe[0].doseMg : null;

  let limitedBy: DoseLimit;
  let rationale: string;

  if (optimizedDoseMg != null) {
    // Was the optimized dose set by reaching the plateau, or by the safety cap?
    const lowestEfficacious = predictions.find(p => p.efficacious);
    limitedBy =
      lowestEfficacious && lowestEfficacious.doseMg === optimizedDoseMg ? 'efficacy_plateau' : 'safety';
    rationale =
      `Optimized dose ${optimizedDoseMg} mg is the lowest dose reaching ${Math.round(
        targetEfficacyFraction * 100,
      )}% of maximal effect while remaining within the acceptable safety bound` +
      (mtdMg != null && optimizedDoseMg < mtdMg
        ? `; it sits below the MTD (${mtdMg} mg), consistent with FDA Project Optimus dose optimization rather than dosing to the MTD.`
        : `.`);
  } else if (safeDoses.length) {
    // Safe doses exist, but none reach the plateau — the plateau is only
    // attained above the MTD.
    limitedBy = 'safety';
    rationale =
      `No dose reaches the ${Math.round(
        targetEfficacyFraction * 100,
      )}% efficacy plateau within the acceptable safety bound; the efficacy plateau is only attained above the MTD (${mtdMg} mg). Consider a lower plateau target, an alternative schedule, or formulation change.`;
  } else {
    limitedBy = 'no_acceptable_dose';
    rationale =
      'No candidate dose is within the acceptable safety bound. Re-evaluate the dose range, schedule, or safety model.';
  }

  const belowMtd = optimizedDoseMg != null && mtdMg != null && optimizedDoseMg < mtdMg;

  return {
    predictions,
    targetEfficacyFraction,
    optimizedDoseMg,
    mtdMg,
    limitedBy,
    rationale,
    belowMtd,
  };
}
