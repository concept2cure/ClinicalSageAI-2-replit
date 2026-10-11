/**
 * AnA Biostats — Layer 2: Deterministic Computation Engine
 *
 * All numeric outputs come from deterministic code ONLY.
 * No LLM involvement in any calculation.
 * Extends existing PowerSampleSizeService with unified interface,
 * diagnostic/IVD calculations, and scenario comparison.
 */

import type {
  StatisticalInput,
  ComputationResult,
  ComputationAssumption,
  ScenarioResult,
  DiagnosticComputationResult,
  MultiplicityResult,
  CrossoverResult,
  MissingDataImpact,
} from './types';
import { normalCdf, normalQuantile } from '../stats/normal';
import { noncentralFPower } from '../stats/f-distribution';
import { sizeSingleProportion, normalApproxPower } from '../stats/diagnostic-design';

/**
 * The engine declines to produce a figure. Thrown — never a number standing in
 * for one — when an input the method needs is missing, or the design has no
 * implemented, published method behind it. Callers (tool handlers, routes)
 * already turn a thrown error into an explicit failure the user sees.
 */
export class ComputationRefusal extends Error {
  constructor(
    public readonly code: 'missing_input' | 'not_supported' | 'invalid_input',
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ComputationRefusal';
  }
}

export class ComputationEngine {

  // Φ and Φ⁻¹ are the canonical full-precision ones (stats/normal.ts). Before
  // 2026-10-05 this class carried its own Abramowitz–Stegun 7.1.26 CDF (error
  // ~1e-7) and an unrefined Acklam quantile — a second copy of each.

  // ════════════════════════════════════════════════════════════════
  // Main computation entry point
  // ════════════════════════════════════════════════════════════════

  compute(input: StatisticalInput): ComputationResult {
    switch (input.clientTrack) {
      case 'diagnostics_ivd':
        if (input.studyType === 'agreement') {
          // An agreement study is sized on kappa, which is refused (computeAgreementKappa).
          // Before 2026-10-05 it was sized as a sensitivity/specificity study instead.
          throw this.kappaRefusal();
        }
        if (input.studyType === 'diagnostic_accuracy') {
          return this.computeDiagnostic(input);
        }
        return this.computeStandard(input);
      case 'medical_device':
        if (['non_inferiority', 'equivalence', 'performance'].includes(input.studyType)) {
          return this.computeDevice(input);
        }
        return this.computeStandard(input);
      default:
        return this.computeStandard(input);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Standard (Biotech/Pharma) Computations
  // ════════════════════════════════════════════════════════════════

  private computeStandard(input: StatisticalInput): ComputationResult {
    const assumptions = this.buildAssumptions(input);

    switch (input.endpointType) {
      case 'continuous':
        return this.computeContinuous(input, assumptions);
      case 'binary':
        return this.computeBinary(input, assumptions);
      case 'time_to_event':
        return this.computeSurvival(input, assumptions);
      // An accuracy endpoint is sized as one whatever the sponsor's track: a
      // pharma company running a diagnostic sub-study gets the diagnostic
      // formula, not the continuous one.
      case 'sensitivity_specificity':
        return this.computeDiagnostic(input);
      case 'agreement':
        throw this.kappaRefusal();
      case 'auc_roc':
        return this.computeDiagnostic(input);
      // ordinal | count | composite | patient_reported: no closed form here, so
      // the continuous normal approximation stands in — and SAYS SO, in the
      // method and in the assumptions, so the caveat travels with the number.
      //
      // Until 2026-10-11 this switch ended in a bare `default: computeContinuous`.
      // Six endpoint types — these, plus agreement, sensitivity/specificity and
      // AUC on every track but diagnostics_ivd — were sized by the two-sample
      // t-test on a standardized effect with nothing in the result to say the
      // endpoint type had been ignored: an agreement (kappa) study for a pharma
      // sponsor came back as 64 per group, because the kappa refusal fired only
      // for the IVD track. The three accuracy types now route to the method
      // that fits them, agreement refuses, and the approximation that remains
      // is disclosed where it is computed rather than only by the one caller
      // (biostatistics-bridge/design-adapter.ts) that happened to add a note.
      default:
        return this.approximatedAsContinuous(input, assumptions);
    }
  }

  /**
   * An endpoint with no closed form here, sized by the continuous
   * approximation and labelled as that. The label is what a reader sees
   * beside the number, so it names the endpoint type that was approximated.
   */
  private approximatedAsContinuous(
    input: StatisticalInput,
    assumptions: ComputationAssumption[],
  ): ComputationResult {
    const endpoint = String(input.endpointType).replace(/_/g, ' ');
    const result = this.computeContinuous(input, [
      ...assumptions,
      {
        parameter: 'endpoint_distribution',
        value: `${endpoint} sized by the continuous normal approximation — no closed form for this endpoint type`,
        source: 'derived',
        sensitivity: 'high',
      },
    ]);
    return {
      ...result,
      method: `${result.method} — continuous approximation for a ${endpoint} endpoint (indicative; this engine has no closed form for it)`,
    };
  }

  private computeContinuous(input: StatisticalInput, assumptions: ComputationAssumption[]): ComputationResult {
    const zTwoSided = normalQuantile(1 - input.alpha / 2);
    const zBeta = normalQuantile(input.powerTarget);
    const sigma = this.continuousSigma(input);
    const r = input.allocationRatio;

    let nPerGroup: number;
    let formula: string;
    let method: string;
    let criticalValue = zTwoSided;
    let testStatistic: string;

    if (input.studyType === 'non_inferiority' && input.nonInferiorityMargin) {
      // Chow, Shao & Wang (2008) §3.2.2, normal approximation. The input's α is
      // the engine's two-sided convention, so the one-sided test is at α/2.
      const delta = input.effectSize - input.nonInferiorityMargin;
      nPerGroup = Math.ceil(
        ((1 + 1 / r) * sigma * sigma * (zTwoSided + zBeta) ** 2) / (delta * delta)
      );
      method = 'Two-sample z-test, non-inferiority (normal approximation)';
      testStatistic = 'z (normal approximation)';
      formula = `n = (1 + 1/r) * σ² * (z_{1−α/2} + z_{1−β})² / (δ − Δ_NI)², where δ=${input.effectSize}, Δ_NI=${input.nonInferiorityMargin}`;
    } else if (input.studyType === 'equivalence' && input.equivalenceMargin) {
      // TOST (Schuirmann 1987): two one-sided tests, each at level α, and the
      // true difference is taken as 0. Chow, Shao & Wang (2008) §3.2.3:
      //   n = (1 + 1/r)·σ²·(z_{1−α} + z_{1−β/2})² / Δ²
      // With true difference 0 the power is split between the two bounds, hence
      // β/2. Before 2026-10-05 this used z_{1−α/2} and z_{1−β} — the superiority
      // formula — which under-sized every equivalence study (63 vs 69 per group
      // for Δ = 0.5σ, 80% power).
      const zOneSided = normalQuantile(1 - input.alpha);
      const zHalfBeta = normalQuantile(1 - (1 - input.powerTarget) / 2);
      const margin = Math.abs(input.equivalenceMargin);
      nPerGroup = Math.ceil(
        ((1 + 1 / r) * sigma * sigma * (zOneSided + zHalfBeta) ** 2) / (margin * margin)
      );
      criticalValue = zOneSided;
      method = 'TOST equivalence test of two means (normal approximation, true difference 0)';
      testStatistic = 'TOST z (normal approximation)';
      formula = `n = (1 + 1/r) * σ² * (z_{1−α} + z_{1−β/2})² / Δ_eq², where Δ_eq=${margin}, true difference assumed 0 (effect size not used)`;
    } else {
      // Two-sample t-test. Start from the normal approximation and step up to the
      // smallest n whose exact t-test power reaches the target (power.t.test).
      // Before 2026-10-05 this returned the normal-approximation n (63 for d = 0.5)
      // under the "t-test" label; the t-test needs 64.
      const nNormal = ((1 + 1 / r) * sigma * sigma * (zTwoSided + zBeta) ** 2) / (input.effectSize * input.effectSize);
      nPerGroup = Math.ceil(nNormal);
      if (Number.isFinite(nPerGroup)) {
        nPerGroup = Math.max(2, nPerGroup);
        for (let guard = 0; guard < 10_000 && this.tTestPower(input, nPerGroup) < input.powerTarget; guard++) {
          nPerGroup += 1;
        }
      }
      method = 'Two-sample t-test (superiority)';
      testStatistic = 't-test';
      formula = `smallest n with two-sided t-test power ≥ ${input.powerTarget} (noncentral t, df = n(1+r) − 2), starting from n = (1 + 1/r) * σ² * (z_{1−α/2} + z_{1−β})² / δ², where δ=${input.effectSize}, σ=${sigma.toFixed(3)}`;
    }

    const groups = input.numberOfGroups ?? 2;
    const total = nPerGroup * groups;
    const adjustedPerGroup = Math.ceil(nPerGroup / (1 - input.attritionRate));
    const adjustedTotal = adjustedPerGroup * groups;

    // The power of the test this N was sized for (continuousPower; BS8).
    const actualPower = this.continuousPower(input, nPerGroup);

    // Generate scenarios
    const scenarios = this.generateScenarios(input, 'continuous');

    return {
      method,
      sampleSize: { perGroup: nPerGroup, total, groups },
      power: Math.min(actualPower, 0.9999),
      effectSize: input.effectSize,
      alpha: input.alpha,
      adjustedSampleSize: adjustedPerGroup,
      adjustedTotal,
      attritionAdjusted: input.attritionRate > 0,
      criticalValue,
      testStatistic,
      formula,
      assumptions,
      scenarios,
    };
  }

  /**
   * The SD of a continuous endpoint. With no variance the effect size IS a
   * standardised difference (Cohen's d), so SD = 1 — what the design adapter
   * already tells the user ("the engine will treat the effect size as
   * standardised"), and disclosed as a default in buildAssumptions. Before
   * 2026-09-25 (BS4) this fell back to SD = effect size, which made the
   * standardised effect exactly 1 for every design: about 16 per group, whatever
   * effect was asked for.
   */
  private continuousSigma(input: StatisticalInput): number {
    return typeof input.variance === 'number' && input.variance > 0 ? Math.sqrt(input.variance) : 1;
  }

  /**
   * Exact power of the two-sided two-sample t-test at `nPerGroup` in the
   * reference arm (nPerGroup·r in the other). T² follows a noncentral F(1, ν, λ)
   * with ν = n₁ + n₂ − 2 and λ = δ²/(σ²(1/n₁ + 1/n₂)), so the power is the
   * canonical noncentral-F power (stats/f-distribution.ts) — both tails of the t.
   */
  private tTestPower(input: StatisticalInput, nPerGroup: number): number {
    if (!Number.isFinite(nPerGroup)) return NaN;
    const r = input.allocationRatio || 1;
    const n2 = nPerGroup * r;
    const df = nPerGroup + n2 - 2;
    if (!(df > 0)) return 0;
    const sigma = this.continuousSigma(input);
    const lambda = (input.effectSize * input.effectSize) / (sigma * sigma * (1 / nPerGroup + 1 / n2));
    return noncentralFPower(1, df, lambda, input.alpha);
  }

  /**
   * The power of the test a continuous design was SIZED for, at `nPerGroup` in
   * the reference arm (the other arm holds nPerGroup·r). One function for the
   * design's achieved power and for every re-estimate of it, so the figure the
   * engine reports is always the power of the test its N was computed for:
   *
   *   superiority      two-sided t-test of δ (exact, noncentral t)
   *   non-inferiority  one-sided z at α/2, δ against the margin, |δ − Δ_NI|
   *   equivalence      TOST at level α, true difference 0:
   *                    Φ(Δ/SE − z_{1−α}) + Φ(Δ/SE − z_{1−α}) − 1
   *
   * Before 2026-09-25 (BS8) the achieved power was always the superiority power
   * of δ. Before 2026-10-05 the equivalence power was the one-sided power of a
   * single bound (0.836 where TOST has 0.804) and the superiority power was the
   * normal approximation of a test labelled t.
   */
  private continuousPower(input: StatisticalInput, nPerGroup: number): number {
    if (nPerGroup <= 0) return 0;
    const sigma = this.continuousSigma(input);
    const r = input.allocationRatio || 1;
    const se = sigma * Math.sqrt(1 / nPerGroup + 1 / (nPerGroup * r));
    if (input.studyType === 'non_inferiority' && input.nonInferiorityMargin) {
      const zAlpha = normalQuantile(1 - input.alpha / 2);
      return normalCdf(Math.abs(input.effectSize - input.nonInferiorityMargin) / se - zAlpha);
    }
    if (input.studyType === 'equivalence' && input.equivalenceMargin) {
      const zAlpha = normalQuantile(1 - input.alpha);
      const m = Math.abs(input.equivalenceMargin);
      return Math.max(0, 2 * normalCdf(m / se - zAlpha) - 1);
    }
    return this.tTestPower(input, nPerGroup);
  }

  /** The two rates of a binary design. A missing control rate is disclosed as a default in buildAssumptions. */
  private binaryRates(input: StatisticalInput): { p1: number; p2: number } {
    const p1 = input.controlRate ?? 0.5;
    const p2 = input.treatmentRate ?? (p1 + input.effectSize);
    return { p1, p2 };
  }

  /**
   * The power of the two-proportion test a binary design was SIZED for, at
   * `nPerGroup` in the reference arm — the inverse of computeBinary's formulas,
   * with the same rates, variance terms and critical value:
   *   non-inferiority  |(p2 − p1) − Δ_NI| / √(v/n) − z_{1−α/2},  v = p1(1−p1) + p2(1−p2)/r
   *   equivalence      Φ((Δ − |ε|)/√(v/n) − z_{1−α}) + Φ((Δ + |ε|)/√(v/n) − z_{1−α}) − 1, ε = p2 − p1
   *   superiority      (|p2 − p1|·√n − z_{1−α/2}·√((1+1/r)·p̄(1−p̄))) / √v
   */
  private binaryPower(input: StatisticalInput, nPerGroup: number): number {
    if (nPerGroup <= 0) return 0;
    const zAlpha = normalQuantile(1 - input.alpha / 2);
    const r = input.allocationRatio || 1;
    const { p1, p2 } = this.binaryRates(input);
    const v = p1 * (1 - p1) + p2 * (1 - p2) / r;
    if (v <= 0) return 0;
    if (input.studyType === 'non_inferiority' && input.nonInferiorityMargin) {
      const delta = Math.abs((p2 - p1) - input.nonInferiorityMargin);
      return normalCdf(delta / Math.sqrt(v / nPerGroup) - zAlpha);
    }
    if (input.studyType === 'equivalence' && input.equivalenceMargin) {
      const zOne = normalQuantile(1 - input.alpha);
      const se = Math.sqrt(v / nPerGroup);
      const m = Math.abs(input.equivalenceMargin);
      const eps = Math.abs(p2 - p1);
      return Math.max(0, normalCdf((m - eps) / se - zOne) + normalCdf((m + eps) / se - zOne) - 1);
    }
    const pBar = (p1 + r * p2) / (1 + r);
    const z = (Math.abs(p2 - p1) * Math.sqrt(nPerGroup) - zAlpha * Math.sqrt((1 + 1 / r) * pBar * (1 - pBar))) / Math.sqrt(v);
    return normalCdf(z);
  }

  private computeBinary(input: StatisticalInput, assumptions: ComputationAssumption[]): ComputationResult {
    const zAlpha = normalQuantile(1 - input.alpha / 2);
    const zBeta = normalQuantile(input.powerTarget);
    const r = input.allocationRatio;

    const { p1, p2 } = this.binaryRates(input);
    const pBar = (p1 + r * p2) / (1 + r);

    let nPerGroup: number;
    let method: string;
    let formula: string;
    let criticalValue = zAlpha;

    if (input.studyType === 'non_inferiority' && input.nonInferiorityMargin) {
      const delta = (p2 - p1) - input.nonInferiorityMargin;
      const v = p1 * (1 - p1) + p2 * (1 - p2) / r;
      nPerGroup = Math.ceil((zAlpha + zBeta) ** 2 * v / (delta * delta));
      method = 'Two-proportion z-test (non-inferiority)';
      formula = `n = (z_{1−α/2} + z_{1−β})² * [p1(1-p1) + p2(1-p2)/r] / (δ - Δ_NI)²`;
    } else if (input.studyType === 'equivalence' && input.equivalenceMargin) {
      // TOST for two proportions, Chow, Shao & Wang (2008) §4.2.3:
      //   n = (z_{1−α} + z_{1−β/2})²·v / Δ²          when ε = p2 − p1 = 0
      //   n = (z_{1−α} + z_{1−β})²·v / (Δ − |ε|)²    otherwise
      // Before 2026-10-05 a binary equivalence design was sized as a
      // superiority test of p2 − p1.
      const m = Math.abs(input.equivalenceMargin);
      const eps = Math.abs(p2 - p1);
      if (eps >= m) {
        throw new ComputationRefusal(
          'invalid_input',
          `Equivalence cannot be shown: the assumed difference |p2 − p1| = ${eps.toFixed(4)} is not inside the margin ±${m}.`,
          'equivalenceMargin',
        );
      }
      const zOne = normalQuantile(1 - input.alpha);
      const zB = eps === 0 ? normalQuantile(1 - (1 - input.powerTarget) / 2) : zBeta;
      const v = p1 * (1 - p1) + p2 * (1 - p2) / r;
      nPerGroup = Math.ceil((zOne + zB) ** 2 * v / ((m - eps) ** 2));
      criticalValue = zOne;
      method = 'Two-proportion TOST (equivalence, normal approximation)';
      formula = eps === 0
        ? `n = (z_{1−α} + z_{1−β/2})² * [p1(1-p1) + p2(1-p2)/r] / Δ², Δ=${m}`
        : `n = (z_{1−α} + z_{1−β})² * [p1(1-p1) + p2(1-p2)/r] / (Δ − |p2 − p1|)², Δ=${m}`;
    } else {
      nPerGroup = Math.ceil(
        ((zAlpha * Math.sqrt((1 + 1 / r) * pBar * (1 - pBar)) +
          zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2) / r)) ** 2) /
        ((p2 - p1) ** 2)
      );
      method = 'Two-proportion z-test (superiority)';
      formula = `n = [z_α√((1+1/r)p̄(1-p̄)) + z_β√(p1(1-p1)+p2(1-p2)/r)]² / (p2-p1)², p1=${p1}, p2=${p2.toFixed(3)}`;
    }

    const groups = input.numberOfGroups ?? 2;
    const total = nPerGroup * groups;
    const adjustedPerGroup = Math.ceil(nPerGroup / (1 - input.attritionRate));
    const adjustedTotal = adjustedPerGroup * groups;

    const scenarios = this.generateScenarios(input, 'binary');

    return {
      method,
      sampleSize: { perGroup: nPerGroup, total, groups },
      // Computed for this N by the test it was sized for (binaryPower) — before
      // 2026-09-25 this returned the target itself as the "achieved" power.
      power: Math.min(this.binaryPower(input, nPerGroup), 0.9999),
      effectSize: Math.abs(p2 - p1),
      alpha: input.alpha,
      adjustedSampleSize: adjustedPerGroup,
      adjustedTotal,
      attritionAdjusted: input.attritionRate > 0,
      criticalValue,
      testStatistic: 'z-test',
      formula,
      assumptions,
      scenarios,
    };
  }

  /**
   * The hazard ratio a time-to-event design is sized on. effectSize is read as
   * the hazard-ratio reduction, HR = 1 − effectSize. Before 2026-10-05 an
   * effectSize ≥ 1 (HR ≤ 0, undefined) was silently replaced by HR = 0.5 and a
   * trial was sized for an effect nobody asked for.
   */
  private hazardRatio(input: StatisticalInput): number {
    const hr = 1 - input.effectSize;
    if (!(Number.isFinite(hr) && hr > 0) || hr === 1) {
      throw new ComputationRefusal(
        'invalid_input',
        `Time-to-event sizing reads effectSize as the hazard-ratio reduction (HR = 1 − effectSize). effectSize = ${input.effectSize} gives hazard ratio ${hr.toFixed(3)}, which cannot be sized; provide 0 < effectSize < 1.`,
        'effectSize',
      );
    }
    return hr;
  }

  /** Overall probability of an event, events → patients. A missing rate is disclosed as a default in buildAssumptions. */
  private survivalEventRate(input: StatisticalInput): number {
    return input.eventRate ?? 0.5;
  }

  /**
   * Schoenfeld (1983) power of the log-rank test at `nPerGroup` in the reference
   * arm: E = n·(1 + r)·eventRate events, power = Φ(√(r·E)·|ln HR|/(1 + r) − z_{1−α/2}).
   * The inverse of computeSurvival's events formula.
   */
  private survivalPower(input: StatisticalInput, nPerGroup: number): number {
    if (nPerGroup <= 0) return 0;
    const r = input.allocationRatio || 1;
    const logHR = Math.log(this.hazardRatio(input));
    const events = nPerGroup * (1 + r) * this.survivalEventRate(input);
    return this.schoenfeldPower(input, events, logHR);
  }

  private schoenfeldPower(input: StatisticalInput, events: number, logHR: number): number {
    const r = input.allocationRatio || 1;
    const zAlpha = normalQuantile(1 - input.alpha / 2);
    return normalCdf((Math.sqrt(r * events) * Math.abs(logHR)) / (1 + r) - zAlpha);
  }

  private computeSurvival(input: StatisticalInput, assumptions: ComputationAssumption[]): ComputationResult {
    const zAlpha = normalQuantile(1 - input.alpha / 2);
    const zBeta = normalQuantile(input.powerTarget);
    const r = input.allocationRatio;

    // Schoenfeld formula for log-rank test
    const hr = this.hazardRatio(input);
    const logHR = Math.log(hr);

    const events = Math.ceil(
      ((zAlpha + zBeta) ** 2 * (1 + r) ** 2) / (r * logHR * logHR)
    );

    // Events → patients: total = events / eventRate, of which the reference arm
    // holds 1/(1 + r). (Unchanged for r = 1; before 2026-10-05 it divided by 2
    // whatever the allocation.)
    const eventRate = this.survivalEventRate(input);
    const nPerGroup = Math.ceil(events / ((1 + r) * eventRate));

    const groups = input.numberOfGroups ?? 2;
    const total = nPerGroup * groups;
    const adjustedPerGroup = Math.ceil(nPerGroup / (1 - input.attritionRate));
    const adjustedTotal = adjustedPerGroup * groups;

    const scenarios = this.generateScenarios(input, 'time_to_event');

    return {
      method: 'Log-rank test (Schoenfeld formula)',
      sampleSize: { perGroup: nPerGroup, total, groups },
      // The Schoenfeld power at the required events — before 2026-10-05 the
      // target itself was returned as the achieved power.
      power: Math.min(this.schoenfeldPower(input, events, logHR), 0.9999),
      effectSize: input.effectSize,
      alpha: input.alpha,
      adjustedSampleSize: adjustedPerGroup,
      adjustedTotal,
      attritionAdjusted: input.attritionRate > 0,
      criticalValue: zAlpha,
      testStatistic: 'Log-rank',
      formula: `Events = (z_α + z_β)² * (1+r)² / (r * ln(HR)²), HR=${hr.toFixed(3)}, events=${events}`,
      assumptions,
      scenarios,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Device-specific computations
  // ════════════════════════════════════════════════════════════════

  private computeDevice(input: StatisticalInput): ComputationResult {
    const assumptions = this.buildAssumptions(input);

    if (input.studyType === 'performance') {
      return this.computeDevicePerformance(input, assumptions);
    }

    // Non-inferiority/equivalence for devices uses same formulas
    // but with device-specific framing
    const base = this.computeStandard(input);
    base.method = `${base.method} (device pivotal study)`;
    return base;
  }

  /** The performance goal and expected rate of a single-arm performance-goal design. */
  private performanceGoal(input: StatisticalInput): { pg: number; expected: number } {
    if (typeof input.controlRate !== 'number') {
      // Before 2026-10-05 a missing goal was silently set to 0.85.
      throw new ComputationRefusal(
        'missing_input',
        'A performance-goal design needs the performance goal (controlRate); none was given, and none is assumed.',
        'controlRate',
      );
    }
    const pg = input.controlRate;
    return { pg, expected: input.treatmentRate ?? (pg + input.effectSize) };
  }

  /**
   * Single-arm performance-goal design, one-sided at α — delegated to the
   * canonical single-proportion sizing (stats/diagnostic-design.sizeSingleProportion,
   * Chow, Shao & Wang §4.1, normal approximation; the exact binomial n is stated too).
   */
  private computeDevicePerformance(input: StatisticalInput, assumptions: ComputationAssumption[]): ComputationResult {
    const { pg, expected } = this.performanceGoal(input);
    const sizing = this.sizeAgainstGoal(pg, expected, input.alpha, input.powerTarget, 'controlRate');
    const n = sizing.nNormalApprox;
    const adjustedN = Math.ceil(n / (1 - input.attritionRate));

    return {
      method: 'Performance goal test (single-arm, one-sample binomial, normal approximation)',
      sampleSize: { perGroup: n, total: n, groups: 1 },
      power: Math.min(normalApproxPower(n, pg, expected, input.alpha), 0.9999),
      effectSize: expected - pg,
      alpha: input.alpha,
      adjustedSampleSize: adjustedN,
      adjustedTotal: adjustedN,
      attritionAdjusted: input.attritionRate > 0,
      criticalValue: normalQuantile(1 - input.alpha),
      testStatistic: 'z-test (one-sided)',
      formula: `n = [z_{1−α}√(PG(1-PG)) + z_{1−β}√(p(1-p))]² / (p-PG)², PG=${pg}, p=${expected.toFixed(3)} (exact binomial n = ${sizing.nExact})`,
      assumptions,
      scenarios: this.generateScenarios(input, 'binary'),
    };
  }

  /** stats/diagnostic-design.sizeSingleProportion, its errors turned into refusals. */
  private sizeAgainstGoal(goal: number, expected: number, alphaOneSided: number, power: number, field: string) {
    try {
      return sizeSingleProportion({ goal, expected, alpha: alphaOneSided, power });
    } catch (err) {
      throw new ComputationRefusal(
        'invalid_input',
        `Cannot size a one-sample test of ${expected} against the goal ${goal}: ${(err as Error).message}.`,
        field,
      );
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Diagnostic/IVD-specific computations
  // ════════════════════════════════════════════════════════════════

  /**
   * The inputs a co-primary sensitivity/specificity design needs, or a refusal.
   * The margin is the distance from the expected value down to the performance
   * goal the lower confidence bound must exceed (goal = target − margin), carried
   * on `nonInferiorityMargin`. Before 2026-10-05 it was a hard-coded 5%, and
   * missing sensitivity, specificity or prevalence were silently 0.90/0.90/0.50.
   */
  private diagnosticDesign(input: StatisticalInput): {
    sens: number; spec: number; prev: number; margin: number; senGoal: number; specGoal: number; alphaOneSided: number;
  } {
    const need = (field: string, what: string): never => {
      throw new ComputationRefusal('missing_input', `Diagnostic-accuracy sizing needs ${what} (${field}); none was given, and none is assumed.`, field);
    };
    const sens = typeof input.sensitivity === 'number' ? input.sensitivity : need('sensitivity', 'the expected sensitivity');
    const spec = typeof input.specificity === 'number' ? input.specificity : need('specificity', 'the expected specificity');
    const prev = typeof input.prevalence === 'number' ? input.prevalence : need('prevalence', 'the prevalence in the intended-use population');
    const marginRaw = input.nonInferiorityMargin;
    const margin = typeof marginRaw === 'number' && marginRaw !== 0
      ? Math.abs(marginRaw)
      : need('nonInferiorityMargin', 'the margin below the expected sensitivity/specificity that defines the performance goal');
    if (!(prev > 0 && prev < 1)) {
      throw new ComputationRefusal('invalid_input', `prevalence must be in (0, 1); got ${prev}.`, 'prevalence');
    }
    // The engine's α is two-sided; each performance-goal test is one-sided at α/2.
    return { sens, spec, prev, margin, senGoal: sens - margin, specGoal: spec - margin, alphaOneSided: input.alpha / 2 };
  }

  private computeDiagnostic(input: StatisticalInput): ComputationResult {
    const assumptions = this.buildAssumptions(input);
    const d = this.diagnosticDesign(input);

    // Co-primary performance-goal tests — H0: Se ≤ Se − margin on the diseased,
    // H0: Sp ≤ Sp − margin on the non-diseased — each a one-sample binomial test
    // sized by the canonical stats/diagnostic-design.sizeSingleProportion (Chow,
    // Shao & Wang §4.1, normal approximation; the exact binomial n is stated).
    const sensSizing = this.sizeAgainstGoal(d.senGoal, d.sens, d.alphaOneSided, input.powerTarget, 'sensitivity');
    const specSizing = this.sizeAgainstGoal(d.specGoal, d.spec, d.alphaOneSided, input.powerTarget, 'specificity');
    const nSens = sensSizing.nNormalApprox;
    const nSpec = specSizing.nNormalApprox;

    const totalByPrevalence = this.diagnosticTotal(nSens, nSpec, d.prev);
    const adjustedTotal = Math.ceil(totalByPrevalence / (1 - input.attritionRate));

    // PPV / NPV
    const ppv = (d.sens * d.prev) / (d.sens * d.prev + (1 - d.spec) * (1 - d.prev));
    const npv = (d.spec * (1 - d.prev)) / (d.spec * (1 - d.prev) + (1 - d.sens) * d.prev);

    const diagnosticMetrics: DiagnosticComputationResult = {
      sensitivity: d.sens,
      specificity: d.spec,
      ppv: Math.round(ppv * 10000) / 10000,
      npv: Math.round(npv * 10000) / 10000,
      sampleSizeForSensitivity: nSens,
      sampleSizeForSpecificity: nSpec,
      prevalenceAdjustedN: totalByPrevalence,
    };

    // Power per co-primary endpoint at the sized counts; the smaller is reported.
    const marginalPower = Math.min(
      normalApproxPower(nSens, d.senGoal, d.sens, d.alphaOneSided),
      normalApproxPower(nSpec, d.specGoal, d.spec, d.alphaOneSided),
    );

    return {
      method: 'Diagnostic accuracy: co-primary one-sample binomial tests of sensitivity and specificity against a performance goal (normal approximation)',
      sampleSize: { perGroup: totalByPrevalence, total: totalByPrevalence, groups: 1 },
      power: Math.min(marginalPower, 0.9999),
      effectSize: d.sens,
      alpha: input.alpha,
      adjustedSampleSize: adjustedTotal,
      adjustedTotal,
      attritionAdjusted: input.attritionRate > 0,
      criticalValue: normalQuantile(1 - d.alphaOneSided),
      testStatistic: 'z-test (one-sided) vs performance goal',
      formula:
        `n = [z_{1−α/2}√(G(1−G)) + z_{1−β}√(P(1−P))]² / (P − G)², G = P − margin, margin=${d.margin}: ` +
        `n_sens=${nSens} (Se ${d.sens} vs goal ${d.senGoal.toFixed(4)}; exact binomial ${sensSizing.nExact}), ` +
        `n_spec=${nSpec} (Sp ${d.spec} vs goal ${d.specGoal.toFixed(4)}; exact binomial ${specSizing.nExact}), ` +
        `total = max(n_sens/prev, n_spec/(1−prev)), prevalence=${d.prev}. Power is per co-primary endpoint; ` +
        `both must succeed, so the joint power is about the product of the two.`,
      assumptions,
      diagnosticMetrics,
      scenarios: this.generateDiagnosticScenarios(input, nSens, nSpec, marginalPower),
    };
  }

  private diagnosticTotal(nSens: number, nSpec: number, prev: number): number {
    return Math.ceil(Math.max(nSens / prev, nSpec / (1 - prev)));
  }

  // ════════════════════════════════════════════════════════════════
  // Crossover study computation
  // ════════════════════════════════════════════════════════════════

  /**
   * 2×2 (AB/BA) crossover, normal approximation — Julious (2004) Stat Med
   * 23:1921, Senn (2002) §3: each subject contributes a within-subject
   * difference, Var(τ̂) = 2σ_w²/N with σ_w² = σ²(1 − ρ), so
   *   N_total = 2σ²(1 − ρ)(z_{1−α/2} + z_{1−β})² / δ²,
   * rounded up to an even number so the two sequences are balanced.
   *
   * Before 2026-10-05 this N was multiplied by the number of periods (doubling
   * it: 64 for the reference design, where 32 is right), and a missing ρ was
   * silently 0.5. A design with other than two periods has no formula here —
   * its variance depends on the sequence structure, not on the period count —
   * so it is refused.
   */
  computeCrossover(input: StatisticalInput): CrossoverResult {
    const periods = input.crossoverPeriods ?? 2;
    if (periods !== 2) {
      throw new ComputationRefusal(
        'not_supported',
        `Crossover sizing is implemented for the 2×2 (two-period, AB/BA) design only; a ${periods}-period design is not supported.`,
        'crossoverPeriods',
      );
    }
    const rho = input.withinSubjectCorrelation;
    if (typeof rho !== 'number') {
      throw new ComputationRefusal(
        'missing_input',
        'Crossover sizing needs the within-subject correlation (withinSubjectCorrelation); none was given, and none is assumed.',
        'withinSubjectCorrelation',
      );
    }
    if (!(rho >= 0 && rho < 1)) {
      throw new ComputationRefusal('invalid_input', `withinSubjectCorrelation must be in [0, 1); got ${rho}.`, 'withinSubjectCorrelation');
    }
    const sigma = this.continuousSigma(input);
    const zAlpha = normalQuantile(1 - input.alpha / 2);
    const zBeta = normalQuantile(input.powerTarget);
    const z2 = (zAlpha + zBeta) ** 2;
    const delta2 = input.effectSize ** 2;

    const rawN = Math.ceil((2 * sigma * sigma * (1 - rho) * z2) / delta2);
    const crossoverN = rawN % 2 === 0 ? rawN : rawN + 1;

    // Parallel-group comparator at the same α, power and σ (same approximation), total over both arms.
    const parallelTotal = 2 * Math.ceil((2 * sigma * sigma * z2) / delta2);
    const efficiencyGain = parallelTotal > 0 ? (1 - crossoverN / parallelTotal) * 100 : 0;

    return {
      periods,
      // Subjects needed (each receives both treatments), before attrition.
      withinSubjectN: crossoverN,
      totalSubjects: Math.ceil(crossoverN / (1 - input.attritionRate)),
      carryoverWarning: true,
      parallelEquivalentN: parallelTotal,
      efficiencyGain: Math.max(0, efficiencyGain),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Multiplicity adjustment computation
  // ════════════════════════════════════════════════════════════════

  computeMultiplicity(input: StatisticalInput): MultiplicityResult {
    const endpoints = input.numberOfEndpoints ?? 1;
    const method = input.multiplicityMethod ?? 'bonferroni';
    const originalAlpha = input.alpha;

    if (endpoints <= 1 || method === 'none') {
      return {
        method: 'none',
        originalAlpha,
        adjustedAlphas: [originalAlpha],
        endpointCount: endpoints,
        effectiveFamilyAlpha: originalAlpha,
        sampleSizeImpact: 0,
        recommendation: 'Single primary endpoint — no multiplicity adjustment needed.',
      };
    }

    let adjustedAlphas: number[];
    let effectiveAlpha: number;

    switch (method) {
      case 'bonferroni':
        adjustedAlphas = Array(endpoints).fill(originalAlpha / endpoints);
        effectiveAlpha = originalAlpha / endpoints;
        break;

      case 'holm': {
        // Holm step-down: alpha/(m), alpha/(m-1), ..., alpha/1
        adjustedAlphas = [];
        for (let i = 0; i < endpoints; i++) {
          adjustedAlphas.push(originalAlpha / (endpoints - i));
        }
        effectiveAlpha = originalAlpha / endpoints; // most conservative step
        break;
      }

      case 'hochberg': {
        // Hochberg step-up: alpha/m, alpha/(m-1), ..., alpha
        adjustedAlphas = [];
        for (let i = 0; i < endpoints; i++) {
          adjustedAlphas.push(originalAlpha / (endpoints - i));
        }
        effectiveAlpha = originalAlpha / endpoints;
        break;
      }

      case 'dunnett': {
        // Dunnett (1955): k treatments each against one shared control. Before
        // 2026-10-05 this returned Šidák's 1 − (1 − α)^{1/k} under Dunnett's
        // name (0.01695 for k = 3, where Dunnett's is 0.01883).
        const perComparison = this.dunnettPerComparisonAlpha(originalAlpha, endpoints, input.allocationRatio || 1);
        adjustedAlphas = Array(endpoints).fill(perComparison);
        effectiveAlpha = perComparison;
        break;
      }

      default:
        adjustedAlphas = Array(endpoints).fill(originalAlpha / endpoints);
        effectiveAlpha = originalAlpha / endpoints;
    }

    // Sample size increase: n ∝ (z_{1−α/2} + z_{1−β})², so the factor is
    // ((z_{1−α*/2} + z_{1−β}) / (z_{1−α/2} + z_{1−β}))². Before 2026-10-05 the
    // z_{1−β} term was left out (Bonferroni ×3: +49% where +33% is right).
    const zOriginal = normalQuantile(1 - originalAlpha / 2);
    const zAdjusted = normalQuantile(1 - effectiveAlpha / 2);
    const zBeta = normalQuantile(input.powerTarget);
    const sampleSizeImpact = Math.round((((zAdjusted + zBeta) / (zOriginal + zBeta)) ** 2 - 1) * 100);

    return {
      method,
      originalAlpha,
      adjustedAlphas,
      endpointCount: endpoints,
      effectiveFamilyAlpha: effectiveAlpha,
      sampleSizeImpact,
      recommendation: `${method} adjustment for ${endpoints} endpoints reduces per-comparison alpha to ${effectiveAlpha.toFixed(4)}. Sample size increases approximately ${sampleSizeImpact}% to maintain power.`,
    };
  }

  /**
   * Dunnett's per-comparison two-sided α for k treatment-vs-control comparisons
   * at family-wise α — Dunnett (1955) JASA 50:1096, large-sample (df = ∞) form.
   * The k statistics are equicorrelated normals with ρ = n_t/(n_t + n_c) =
   * r/(1 + r) (r = treatment:control allocation; 0.5 when balanced), and the
   * critical value c solves
   *   P(max_i |Z_i| ≤ c) = ∫ φ(x)·[Φ((c + √ρ·x)/√(1−ρ)) − Φ((−c + √ρ·x)/√(1−ρ))]^k dx = 1 − α.
   * The integral is evaluated by composite Simpson on [−10, 10] and c by
   * bisection between the unadjusted and the Bonferroni critical values.
   * Reference: k = 3, α = 0.05, ρ = 0.5 → c = 2.349, per-comparison α 0.01883
   * (Dunnett 1964 tables).
   */
  private dunnettPerComparisonAlpha(alpha: number, k: number, allocationRatio: number): number {
    const rho = allocationRatio / (1 + allocationRatio);
    const a = Math.sqrt(rho);
    const b = Math.sqrt(1 - rho);
    const coverage = (c: number): number => {
      const steps = 2000; // even
      const lo = -10;
      const h = 20 / steps;
      let sum = 0;
      for (let i = 0; i <= steps; i++) {
        const x = lo + i * h;
        const phi = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
        const inner = normalCdf((c + a * x) / b) - normalCdf((-c + a * x) / b);
        const w = i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2;
        sum += w * phi * Math.pow(inner, k);
      }
      return (sum * h) / 3;
    };
    let lo = normalQuantile(1 - alpha / 2);
    let hi = normalQuantile(1 - alpha / (2 * k));
    for (let i = 0; i < 100 && hi - lo > 1e-10; i++) {
      const mid = (lo + hi) / 2;
      if (coverage(mid) < 1 - alpha) lo = mid;
      else hi = mid;
    }
    const c = (lo + hi) / 2;
    return 2 * (1 - normalCdf(c));
  }

  // ════════════════════════════════════════════════════════════════
  // Missing data impact computation
  // ════════════════════════════════════════════════════════════════

  computeMissingDataImpact(input: StatisticalInput, baseResult: ComputationResult): MissingDataImpact {
    const missingRate = input.expectedMissingRate ?? input.attritionRate;
    const method = input.missingDataMethod ?? 'complete_case';

    const effectiveN = Math.floor(baseResult.sampleSize.total * (1 - missingRate));

    // Estimate power reduction from missing data
    const basePower = baseResult.power;
    let adjustedPower: number;
    let biasRisk: 'low' | 'moderate' | 'high';

    switch (method) {
      case 'complete_case':
        // Complete case: simple power reduction proportional to data loss
        adjustedPower = this.estimatePowerAtN(input, effectiveN);
        biasRisk = missingRate > 0.20 ? 'high' : missingRate > 0.10 ? 'moderate' : 'low';
        break;

      case 'LOCF':
        // LOCF: preserves N but may bias towards/against treatment
        adjustedPower = basePower * 0.95; // slight power reduction
        biasRisk = 'moderate'; // LOCF always has some bias risk
        break;

      case 'MMRM':
        // MMRM: efficient use of available data, moderate power preservation
        adjustedPower = basePower * (1 - missingRate * 0.3); // less power loss than CC
        biasRisk = missingRate > 0.30 ? 'moderate' : 'low';
        break;

      case 'multiple_imputation':
        // MI: good power preservation, depends on MAR assumption
        adjustedPower = basePower * (1 - missingRate * 0.25);
        biasRisk = missingRate > 0.25 ? 'moderate' : 'low';
        break;

      case 'pattern_mixture':
        // Pattern mixture: explicitly models MNAR, may reduce power more
        adjustedPower = basePower * (1 - missingRate * 0.5);
        biasRisk = 'low'; // explicitly addresses non-random missingness
        break;

      default:
        adjustedPower = this.estimatePowerAtN(input, effectiveN);
        biasRisk = missingRate > 0.15 ? 'moderate' : 'low';
    }

    adjustedPower = Math.max(0, Math.min(1, adjustedPower));
    const powerReduction = basePower - adjustedPower;

    const methodLabels: Record<string, string> = {
      complete_case: 'Complete case analysis',
      LOCF: 'Last observation carried forward',
      MMRM: 'Mixed model for repeated measures',
      multiple_imputation: 'Multiple imputation',
      pattern_mixture: 'Pattern mixture model',
    };

    let recommendation: string;
    if (biasRisk === 'high') {
      recommendation = `Missing rate of ${(missingRate * 100).toFixed(0)}% is high. ${methodLabels[method] ?? method} may yield biased estimates. Consider MMRM or multiple imputation as primary analysis with sensitivity analysis.`;
    } else if (powerReduction > 0.10) {
      recommendation = `Power reduction of ${(powerReduction * 100).toFixed(1)}% due to missing data. Consider increasing sample size or using more efficient missing data methods.`;
    } else {
      recommendation = `Missing data impact is manageable with ${methodLabels[method] ?? method}. Include sensitivity analysis for MNAR scenarios.`;
    }

    return {
      method: methodLabels[method] ?? method,
      expectedMissingRate: missingRate,
      effectiveSampleSize: effectiveN,
      powerReduction,
      adjustedPower,
      biasRisk,
      recommendation,
    };
  }

  /**
   * The design's power at a total of `n` evaluable subjects, by the same test
   * compute() sized it with — routed exactly as compute() routes. Before
   * 2026-10-05 this always used the continuous formula, so the missing-data
   * impact of a binary or time-to-event design was the power of a t-test on its
   * effect size read as a standardised mean difference.
   */
  private estimatePowerAtN(input: StatisticalInput, n: number): number {
    if (n <= 0) return 0;
    if (input.clientTrack === 'diagnostics_ivd' && input.studyType === 'diagnostic_accuracy') {
      const d = this.diagnosticDesign(input);
      return Math.min(
        normalApproxPower(Math.floor(n * d.prev), d.senGoal, d.sens, d.alphaOneSided),
        normalApproxPower(Math.floor(n * (1 - d.prev)), d.specGoal, d.spec, d.alphaOneSided),
      );
    }
    if (input.clientTrack === 'medical_device' && input.studyType === 'performance') {
      const { pg, expected } = this.performanceGoal(input);
      return normalApproxPower(n, pg, expected, input.alpha);
    }
    const perGroup = Math.floor(n / (input.numberOfGroups ?? 2));
    switch (input.endpointType) {
      case 'binary':
        return this.binaryPower(input, perGroup);
      case 'time_to_event':
        return this.survivalPower(input, perGroup);
      default:
        // continuous, and every endpoint computeStandard sizes with the continuous formula
        return this.continuousPower(input, perGroup);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Diagnostic: Agreement (Cohen's Kappa) sample size
  // ════════════════════════════════════════════════════════════════

  /**
   * Refused. Before 2026-10-05 this sized kappa with a variance (1−κ)²/(1−κ²+0.01)
   * that has no published basis and a null κ₀ = 0.40 nobody supplied. The
   * published methods — Donner & Eliasziw (1992) Stat Med 11:1511 for two
   * raters and a binary rating, Flack et al. (1988) Stat Med 7:1061 for more
   * categories — need the null κ₀ and the marginal rating distribution, neither
   * of which the input contract carries. Until it does, no figure is produced.
   */
  computeAgreementKappa(_input: StatisticalInput): never {
    throw this.kappaRefusal();
  }

  private kappaRefusal(): ComputationRefusal {
    return new ComputationRefusal(
      'not_supported',
      'Agreement (kappa) sample size is not supported: the published methods (Donner & Eliasziw 1992; Flack et al. 1988) need the null kappa and the marginal rating prevalence, which this engine does not take as inputs.',
      'agreementTarget',
    );
  }

  // ════════════════════════════════════════════════════════════════
  // Diagnostic: AUC comparison sample size
  // ════════════════════════════════════════════════════════════════

  /**
   * Hanley & McNeil (1982) Radiology 143:29 variance of the empirical AUC with
   * n diseased and n non-diseased subjects:
   *   Var(Â) = [A(1−A) + (n−1)(Q1 − A²) + (n−1)(Q2 − A²)] / n²,
   *   Q1 = A/(2−A), Q2 = 2A²/(1+A).
   */
  private hanleyMcNeilVariance(auc: number, n: number): number {
    const q1 = auc / (2 - auc);
    const q2 = (2 * auc * auc) / (1 + auc);
    return (auc * (1 - auc) + (n - 1) * (q1 - auc * auc) + (n - 1) * (q2 - auc * auc)) / (n * n);
  }

  /**
   * Subjects per group (diseased = non-diseased) to show an AUC exceeds a fixed
   * null value: the smallest n with z_{1−α/2}·SE₀(n) + z_{1−β}·SE₁(n) ≤ A − A₀, SE
   * from the Hanley–McNeil variance under the null and the alternative.
   * Reference: A = 0.85 vs A₀ = 0.50, α .05, power .8 → 9.19 → 10 per group.
   *
   * Before 2026-10-05 the variance was divided by an arbitrary 100 (giving 1 per
   * group for the reference design) and a missing target AUC was silently 0.85.
   * A missing null is the conventional chance-level 0.5, disclosed in the result.
   */
  computeAUCComparison(input: StatisticalInput): { aucSampleSize: number; auc: number; aucNull: number; aucCI: { lower: number; upper: number }; method: string } {
    if (typeof input.aucTarget !== 'number') {
      throw new ComputationRefusal(
        'missing_input',
        'AUC sizing needs the expected AUC (aucTarget); none was given, and none is assumed.',
        'aucTarget',
      );
    }
    const auc = input.aucTarget;
    const aucNull = input.aucNull ?? 0.5;
    if (!(auc > aucNull && auc < 1 && aucNull >= 0.5)) {
      throw new ComputationRefusal(
        'invalid_input',
        `AUC sizing needs 0.5 ≤ aucNull < aucTarget < 1; got aucTarget=${auc}, aucNull=${aucNull}.`,
        'aucTarget',
      );
    }
    const zAlpha = normalQuantile(1 - input.alpha / 2);
    const zBeta = normalQuantile(input.powerTarget);
    const meets = (n: number): boolean =>
      zAlpha * Math.sqrt(this.hanleyMcNeilVariance(aucNull, n)) + zBeta * Math.sqrt(this.hanleyMcNeilVariance(auc, n)) <= auc - aucNull;

    let hi = 2;
    while (!meets(hi) && hi < 1e7) hi *= 2;
    if (!meets(hi)) {
      throw new ComputationRefusal('invalid_input', 'AUC sizing did not converge below 10 million per group.', 'aucTarget');
    }
    let lo = Math.max(1, Math.floor(hi / 2));
    if (meets(lo)) hi = lo;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (meets(mid)) hi = mid;
      else lo = mid;
    }
    const n = hi;

    // Expected CI for the AUC at the sized n (Wald, Hanley–McNeil SE).
    const se = Math.sqrt(this.hanleyMcNeilVariance(auc, n));
    const aucCI = {
      lower: Math.max(0, auc - zAlpha * se),
      upper: Math.min(1, auc + zAlpha * se),
    };

    return {
      aucSampleSize: Math.ceil(n / (1 - input.attritionRate)),
      auc,
      aucNull,
      aucCI,
      method: `AUC vs a fixed null (Hanley & McNeil 1982 variance), ${n} diseased + ${n} non-diseased before attrition; null AUC ${aucNull}${typeof input.aucNull === 'number' ? '' : ' (default: chance level)'}`,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Enhanced main compute: attach multiplicity, crossover, missing data
  // ════════════════════════════════════════════════════════════════

  /**
   * An optional add-on the inputs asked for but the engine refused. Recorded on
   * the result — the main sizing stands, and the refusal is visible beside it
   * rather than the add-on silently missing.
   */
  private recordRefusal(base: ComputationResult, what: string, err: unknown): void {
    if (!(err instanceof ComputationRefusal)) throw err;
    base.assumptions.push({
      parameter: `${what}_not_computed`,
      value: err.message,
      source: 'derived',
      sensitivity: 'high',
    });
  }

  computeEnhanced(input: StatisticalInput): ComputationResult {
    const base = this.compute(input);

    // Add multiplicity result if multiple endpoints
    if ((input.numberOfEndpoints ?? 1) > 1) {
      base.multiplicityResult = this.computeMultiplicity(input);
    }

    // Add crossover result if crossover design
    if (input.crossoverPeriods && input.crossoverPeriods >= 2) {
      try {
        base.crossoverResult = this.computeCrossover(input);
      } catch (err) {
        this.recordRefusal(base, 'crossover', err);
      }
    }

    // Add missing data impact
    if (input.expectedMissingRate || input.missingDataMethod) {
      base.missingDataImpact = this.computeMissingDataImpact(input, base);
    }

    // Agreement studies are refused in compute() (kappa is not supported).

    // Add AUC for diagnostic AUC studies
    if (input.endpointType === 'auc_roc' && input.clientTrack === 'diagnostics_ivd') {
      try {
        const aucResult = this.computeAUCComparison(input);
        if (!base.diagnosticMetrics) base.diagnosticMetrics = { sensitivity: 0, specificity: 0 };
        base.diagnosticMetrics.auc = aucResult.auc;
        base.diagnosticMetrics.aucCI = aucResult.aucCI;
      } catch (err) {
        this.recordRefusal(base, 'auc', err);
      }
    }

    return base;
  }

  // ════════════════════════════════════════════════════════════════
  // Scenario comparison
  // ════════════════════════════════════════════════════════════════

  compareScenarios(inputA: StatisticalInput, inputB: StatisticalInput): {
    scenarioA: ComputationResult;
    scenarioB: ComputationResult;
    comparison: {
      sampleSizeDelta: number;
      powerDelta: number;
      stronger: 'A' | 'B' | 'equivalent';
      recommendation: string;
    };
  } {
    const scenarioA = this.compute(inputA);
    const scenarioB = this.compute(inputB);

    const sampleSizeDelta = scenarioB.sampleSize.total - scenarioA.sampleSize.total;
    const powerDelta = scenarioB.power - scenarioA.power;

    let stronger: 'A' | 'B' | 'equivalent';
    let recommendation: string;

    if (Math.abs(powerDelta) < 0.02 && Math.abs(sampleSizeDelta) < 10) {
      stronger = 'equivalent';
      recommendation = 'Both scenarios yield similar results. Choose based on practical considerations.';
    } else if (scenarioA.power >= scenarioB.power && scenarioA.sampleSize.total <= scenarioB.sampleSize.total) {
      stronger = 'A';
      recommendation = `Scenario A is stronger: higher power (${(scenarioA.power * 100).toFixed(1)}% vs ${(scenarioB.power * 100).toFixed(1)}%) with fewer subjects (${scenarioA.sampleSize.total} vs ${scenarioB.sampleSize.total}).`;
    } else if (scenarioB.power >= scenarioA.power && scenarioB.sampleSize.total <= scenarioA.sampleSize.total) {
      stronger = 'B';
      recommendation = `Scenario B is stronger: higher power (${(scenarioB.power * 100).toFixed(1)}% vs ${(scenarioA.power * 100).toFixed(1)}%) with fewer subjects (${scenarioB.sampleSize.total} vs ${scenarioA.sampleSize.total}).`;
    } else {
      // Trade-off case
      stronger = scenarioA.power > scenarioB.power ? 'A' : 'B';
      recommendation = `Trade-off: Scenario A has ${(scenarioA.power * 100).toFixed(1)}% power with N=${scenarioA.sampleSize.total}, Scenario B has ${(scenarioB.power * 100).toFixed(1)}% power with N=${scenarioB.sampleSize.total}. Consider feasibility vs. statistical rigor.`;
    }

    return {
      scenarioA,
      scenarioB,
      comparison: { sampleSizeDelta, powerDelta, stronger, recommendation },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Scenario generation helpers
  // ════════════════════════════════════════════════════════════════

  /**
   * Effect-size scenarios, each sized through the design's OWN path (compute),
   * so the "Base case" is the design itself and a non-inferiority, equivalence
   * or unequal-allocation design is scenario-tested as what it is.
   *
   * Before 2026-09-25 (LX-16) this carried a third copy of the sizing formulas —
   * superiority only, allocation 1:1 — and halved a per-group figure: every
   * design's Base case disagreed with the design beside it (superiority 32 vs
   * 63 per group, binary 2:1 82 vs 123), and a non-inferiority or equivalence
   * design with δ = 0 got an infinite N.
   *
   * compute() adds scenarios to every result, so the nested calls here are
   * guarded to one level: a scenario has no scenarios of its own. The engine is
   * synchronous, so the guard cannot interleave.
   */
  private scenarioDepth = 0;

  private generateScenarios(input: StatisticalInput, _type: string): ScenarioResult[] {
    if (this.scenarioDepth > 0) return [];
    this.scenarioDepth += 1;
    try {
      const scenarios: ScenarioResult[] = [];
      for (const mult of [0.75, 1.0, 1.25, 1.5]) {
        // A binary design given as two rates is sized from the rates, not from
        // effectSize — so the scenario scales the rate difference itself, or all
        // four "effect" scenarios would be the same trial.
        const modifiedInput: StatisticalInput = {
          ...input,
          effectSize: input.effectSize * mult,
          ...(typeof input.controlRate === 'number' && typeof input.treatmentRate === 'number'
            ? { treatmentRate: input.controlRate + (input.treatmentRate - input.controlRate) * mult }
            : {}),
        };
        let r: ComputationResult;
        try {
          r = this.compute(modifiedInput);
        } catch (err) {
          // A scaled effect can leave the method's domain (e.g. a hazard-ratio
          // reduction ≥ 1). That scenario has no N; it is left out, not filled in.
          if (err instanceof ComputationRefusal && mult !== 1.0) continue;
          throw err;
        }
        const label = mult === 1.0
          ? 'Base case'
          : mult < 1.0
            ? `Conservative (${(mult * 100).toFixed(0)}% effect)`
            : `Optimistic (${(mult * 100).toFixed(0)}% effect)`;
        scenarios.push({
          label,
          sampleSize: { perGroup: r.sampleSize.perGroup, total: r.adjustedTotal ?? r.sampleSize.total },
          power: r.power,
          delta: `Effect size = ${modifiedInput.effectSize.toFixed(4)}`,
          recommendation: mult < 1.0 ? 'Use for conservative planning' : mult > 1.25 ? 'May be overly optimistic' : undefined,
        });
      }
      return scenarios;
    } finally {
      this.scenarioDepth -= 1;
    }
  }


  /**
   * Prevalence scenarios for a diagnostic design: the diseased and non-diseased
   * counts the design was sized for, enrolled at other prevalences. The power
   * per co-primary endpoint does not depend on prevalence, so it is the design's.
   * Before 2026-10-05 these re-derived the counts with the hard-coded 5% margin
   * and silently assumed sensitivity/specificity 0.90.
   */
  private generateDiagnosticScenarios(input: StatisticalInput, nSens: number, nSpec: number, power: number): ScenarioResult[] {
    return [0.10, 0.30, 0.50, 0.70].map((prev) => {
      const total = this.diagnosticTotal(nSens, nSpec, prev);
      const adjusted = Math.ceil(total / (1 - input.attritionRate));
      return {
        label: `Prevalence = ${(prev * 100).toFixed(0)}%`,
        sampleSize: { perGroup: total, total: adjusted },
        power,
        delta: `Prev=${prev}, Se=${input.sensitivity}, Sp=${input.specificity}`,
        recommendation: prev < 0.2 ? 'Low prevalence requires large N — consider enrichment' : undefined,
      };
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Assumption builder
  // ════════════════════════════════════════════════════════════════

  private buildAssumptions(input: StatisticalInput): ComputationAssumption[] {
    const assumptions: ComputationAssumption[] = [];

    assumptions.push({
      parameter: 'alpha',
      value: input.alpha,
      source: input.alpha === 0.05 ? 'default' : 'user_provided',
      sensitivity: 'moderate',
    });

    assumptions.push({
      parameter: 'power',
      value: input.powerTarget,
      source: input.powerTarget === 0.80 ? 'default' : 'user_provided',
      sensitivity: 'high',
    });

    assumptions.push({
      parameter: 'effect_size',
      value: input.effectSize,
      source: 'user_provided',
      sensitivity: 'high',
    });

    if (input.variance !== undefined) {
      assumptions.push({
        parameter: 'variance',
        value: input.variance,
        source: 'user_provided',
        sensitivity: 'high',
      });
    } else if (input.endpointType === 'continuous') {
      // No variance: the effect size is read as a standardised difference
      // (continuousSigma). Stated, so no document presents it as measured.
      assumptions.push({
        parameter: 'variance',
        value: 1,
        source: 'default',
        sensitivity: 'high',
      });
    }

    assumptions.push({
      parameter: 'attrition_rate',
      value: input.attritionRate,
      source: input.attritionRate === 0.15 ? 'default' : 'user_provided',
      sensitivity: 'moderate',
    });

    assumptions.push({
      parameter: 'allocation_ratio',
      value: input.allocationRatio,
      source: input.allocationRatio === 1 ? 'default' : 'user_provided',
      sensitivity: 'low',
    });

    if (input.controlRate !== undefined) {
      assumptions.push({ parameter: 'control_rate', value: input.controlRate, source: 'user_provided', sensitivity: 'high' });
    }
    if (input.treatmentRate !== undefined) {
      assumptions.push({ parameter: 'treatment_rate', value: input.treatmentRate, source: 'user_provided', sensitivity: 'high' });
    }
    if (input.eventRate !== undefined) {
      assumptions.push({ parameter: 'event_rate', value: input.eventRate, source: 'user_provided', sensitivity: 'high' });
    }
    if (input.prevalence !== undefined) {
      assumptions.push({ parameter: 'prevalence', value: input.prevalence, source: 'user_provided', sensitivity: 'high' });
    }

    return [...assumptions, ...this.defaultedAssumptions(input)];
  }

  /**
   * The rates the sizing falls back on when the input leaves them out, stated
   * as defaults so no document presents them as supplied (2026-10-05).
   */
  private defaultedAssumptions(input: StatisticalInput): ComputationAssumption[] {
    const out: ComputationAssumption[] = [];
    const performanceDesign = input.clientTrack === 'medical_device' && input.studyType === 'performance';
    if (input.endpointType === 'binary' && input.controlRate === undefined && !performanceDesign) {
      // binaryRates: no control rate → 0.5 (the maximum-variance rate).
      out.push({ parameter: 'control_rate', value: 0.5, source: 'default', sensitivity: 'high' });
    }
    if (input.endpointType === 'time_to_event' && input.eventRate === undefined) {
      // survivalEventRate: no event probability → 0.5 to convert events to patients.
      out.push({ parameter: 'event_rate', value: 0.5, source: 'default', sensitivity: 'high' });
    }
    if (input.endpointType === 'auc_roc' && input.aucNull === undefined) {
      out.push({ parameter: 'auc_null', value: 0.5, source: 'default', sensitivity: 'moderate' });
    }
    return out;
  }
}

export const computationEngine = new ComputationEngine();
