/**
 * @fileoverview Concentration-QTc / thorough-QT-waiver assessor.
 * @module server/services/clinical-pharmacology/concentration-qtc
 *
 * Implements the concentration-QTc (C-QTc) decision that lets a program avoid a
 * dedicated thorough-QT (TQT) study. Per ICH E14 Q&A (R3), a TQT study is not
 * warranted when a high-quality C-QTc analysis from early-phase data shows the
 * upper bound of the two-sided 90% CI of predicted ΔΔQTc stays below 10 ms at
 * the high clinical exposure (with adequate supratherapeutic coverage and a
 * model sensitive enough to exclude the threshold).
 *
 * Given the fitted slope (and its SE) of the linear C-QTc model, the intercept,
 * and the exposure to evaluate, this computes the predicted ΔΔQTc, the upper
 * 90% CI bound, and whether a TQT study remains warranted — plus a confidence
 * flag for inadequate exposure coverage or an uninformatively wide CI.
 *
 * Pure module — no database, no network. Callable by ANA and the M2.7 builder.
 *
 * @compliance ICH E14 / S7B Q&A (R3); FDA C-QTc guidance.
 */

export interface ConcentrationQtcInput {
  /** Slope of ΔΔQTc vs concentration (ms per concentration unit). */
  slope: number;
  /** Standard error of the slope. */
  slopeSE: number;
  /** Model intercept (ms at zero concentration). Default 0. */
  intercept?: number;
  /** SE of the intercept; when given, propagated into the prediction SE. */
  interceptSE?: number;
  /** Covariance of slope and intercept (for the prediction SE). Default 0. */
  slopeInterceptCov?: number;
  /** Concentration to evaluate — the high clinical exposure (geometric-mean Cmax). */
  targetConcentration: number;
  /** Therapeutic Cmax, to check supratherapeutic coverage. */
  therapeuticCmax?: number;
  /** Required multiple of therapeutic Cmax for adequate coverage. Default 2. */
  requiredCoverageMultiple?: number;
  /** ΔΔQTc threshold of regulatory concern (ms). Default 10. */
  thresholdMs?: number;
  /** z for the two-sided 90% CI upper bound. Default 1.645. */
  ciZ?: number;
}

export type QtcConfidence = 'adequate' | 'low_exposure_coverage' | 'wide_ci';

export interface ConcentrationQtcResult {
  predictedDdQtc: number;
  predictionSE: number;
  upperBound90: number;
  thresholdMs: number;
  targetConcentration: number;
  /** True when the threshold cannot be excluded → a TQT study remains warranted. */
  tqtWarranted: boolean;
  /** Null when therapeuticCmax was not supplied. */
  exposureCoverageAdequate: boolean | null;
  confidence: QtcConfidence;
  rationale: string;
}

function round(value: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/**
 * Assess whether a thorough-QT study is warranted from a C-QTc model fit.
 *
 * @throws if the slope SE is negative or the target concentration is invalid.
 */
export function assessConcentrationQtc(input: ConcentrationQtcInput): ConcentrationQtcResult {
  if (!(input.slopeSE >= 0)) {
    throw new Error('assessConcentrationQtc: slopeSE must be >= 0');
  }
  if (!(input.targetConcentration >= 0) || !Number.isFinite(input.targetConcentration)) {
    throw new Error('assessConcentrationQtc: targetConcentration must be a finite non-negative number');
  }

  const intercept = input.intercept ?? 0;
  const thresholdMs = input.thresholdMs ?? 10;
  const ciZ = input.ciZ ?? 1.645;
  const c = input.targetConcentration;

  const predictedDdQtc = intercept + input.slope * c;

  // Variance of the prediction. When intercept SE is given, propagate the full
  // var(a + bC) = var(a) + C²·var(b) + 2C·cov(a,b); otherwise treat the
  // intercept as fixed and let the slope dominate.
  const interceptVar = input.interceptSE != null ? input.interceptSE ** 2 : 0;
  const cov = input.slopeInterceptCov ?? 0;
  const predictionVar = interceptVar + c ** 2 * input.slopeSE ** 2 + 2 * c * cov;
  const predictionSE = Math.sqrt(Math.max(0, predictionVar));

  const upperBound90 = predictedDdQtc + ciZ * predictionSE;
  const tqtWarranted = upperBound90 >= thresholdMs;

  const requiredMultiple = input.requiredCoverageMultiple ?? 2;
  let exposureCoverageAdequate: boolean | null = null;
  if (input.therapeuticCmax != null && input.therapeuticCmax > 0) {
    exposureCoverageAdequate = c >= requiredMultiple * input.therapeuticCmax;
  }

  // Confidence: inadequate supratherapeutic coverage, or a CI so wide the test
  // cannot meaningfully exclude the threshold (half-width ≥ threshold).
  let confidence: QtcConfidence = 'adequate';
  if (exposureCoverageAdequate === false) {
    confidence = 'low_exposure_coverage';
  } else if (ciZ * predictionSE >= thresholdMs) {
    confidence = 'wide_ci';
  }

  let rationale: string;
  if (!tqtWarranted && confidence === 'adequate') {
    // Only claim supratherapeutic coverage when a therapeutic Cmax was supplied
    // and the check actually passed; otherwise state that coverage is unverified.
    const coverageClause =
      exposureCoverageAdequate === true
        ? ` (≥${requiredMultiple}× therapeutic exposure)`
        : ' (supratherapeutic coverage not verified — no therapeutic Cmax supplied)';
    rationale =
      `Negative C-QTc: the upper 90% CI bound of ΔΔQTc (${round(upperBound90, 1)} ms) is below the ` +
      `${thresholdMs} ms threshold at ${round(c, 1)}${coverageClause}. A dedicated ` +
      `thorough-QT study is not warranted per ICH E14 Q&A (R3); the C-QTc analysis substitutes.`;
  } else if (tqtWarranted) {
    rationale =
      `The upper 90% CI bound of ΔΔQTc (${round(upperBound90, 1)} ms) reaches the ${thresholdMs} ms ` +
      `threshold at ${round(c, 1)}; the C-QTc analysis does not exclude a QT effect, so further QT ` +
      `evaluation (e.g. a thorough-QT study) remains warranted.`;
  } else if (confidence === 'low_exposure_coverage') {
    rationale =
      `Although the upper bound is below ${thresholdMs} ms, the evaluated exposure (${round(c, 1)}) does not ` +
      `reach ${requiredMultiple}× the therapeutic Cmax; supratherapeutic coverage is inadequate to waive a TQT study.`;
  } else {
    rationale =
      `The 90% CI is too wide (half-width ${round(ciZ * predictionSE, 1)} ms ≥ ${thresholdMs} ms) for the C-QTc ` +
      `model to exclude the threshold with confidence; assay sensitivity is insufficient to waive a TQT study.`;
  }

  return {
    predictedDdQtc: round(predictedDdQtc),
    predictionSE: round(predictionSE),
    upperBound90: round(upperBound90),
    thresholdMs,
    targetConcentration: c,
    tqtWarranted,
    exposureCoverageAdequate,
    confidence,
    rationale,
  };
}
