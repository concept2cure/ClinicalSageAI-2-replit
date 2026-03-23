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
} from './types';

export class ComputationEngine {

  // ════════════════════════════════════════════════════════════════
  // Normal distribution utilities (deterministic, no external deps)
  // ════════════════════════════════════════════════════════════════

  /** Standard normal CDF using Abramowitz & Stegun approximation */
  private normCdf(z: number): number {
    if (z < -8) return 0;
    if (z > 8) return 1;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  /** Inverse normal CDF (quantile function) using rational approximation */
  private normQuantile(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a = [
      -3.969683028665376e+01, 2.209460984245205e+02,
      -2.759285104469687e+02, 1.383577518672690e+02,
      -3.066479806614716e+01, 2.506628277459239e+00,
    ];
    const b = [
      -5.447609879822406e+01, 1.615858368580409e+02,
      -1.556989798598866e+02, 6.680131188771972e+01,
      -1.328068155288572e+01,
    ];
    const c = [
      -7.784894002430293e-03, -3.223964580411365e-01,
      -2.400758277161838e+00, -2.549732539343734e+00,
      4.374664141464968e+00, 2.938163982698783e+00,
    ];
    const d = [
      7.784695709041462e-03, 3.224671290700398e-01,
      2.445134137142996e+00, 3.754408661907416e+00,
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number, r: number;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Main computation entry point
  // ════════════════════════════════════════════════════════════════

  compute(input: StatisticalInput): ComputationResult {
    switch (input.clientTrack) {
      case 'diagnostics_ivd':
        if (['diagnostic_accuracy', 'agreement'].includes(input.studyType)) {
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
      default:
        return this.computeContinuous(input, assumptions);
    }
  }

  private computeContinuous(input: StatisticalInput, assumptions: ComputationAssumption[]): ComputationResult {
    const zAlpha = this.normQuantile(1 - input.alpha / 2);
    const zBeta = this.normQuantile(input.powerTarget);
    const sigma = input.variance ? Math.sqrt(input.variance) : input.effectSize; // assume SD = effect size if not provided
    const r = input.allocationRatio;

    let nPerGroup: number;
    let formula: string;
    let method: string;

    if (input.studyType === 'non_inferiority' && input.nonInferiorityMargin) {
      const delta = input.effectSize - input.nonInferiorityMargin;
      nPerGroup = Math.ceil(
        ((1 + 1 / r) * sigma * sigma * (zAlpha + zBeta) ** 2) / (delta * delta)
      );
      method = 'Two-sample t-test (non-inferiority)';
      formula = `n = (1 + 1/r) * σ² * (z_α + z_β)² / (δ - Δ_NI)², where δ=${input.effectSize}, Δ_NI=${input.nonInferiorityMargin}`;
    } else if (input.studyType === 'equivalence' && input.equivalenceMargin) {
      // TOST: two one-sided tests
      nPerGroup = Math.ceil(
        ((1 + 1 / r) * sigma * sigma * (zAlpha + zBeta) ** 2) / (input.equivalenceMargin * input.equivalenceMargin)
      );
      method = 'TOST equivalence test';
      formula = `n = (1 + 1/r) * σ² * (z_α + z_β)² / Δ_eq², where Δ_eq=${input.equivalenceMargin}`;
    } else {
      nPerGroup = Math.ceil(
        ((1 + 1 / r) * sigma * sigma * (zAlpha + zBeta) ** 2) / (input.effectSize * input.effectSize)
      );
      method = 'Two-sample t-test (superiority)';
      formula = `n = (1 + 1/r) * σ² * (z_α + z_β)² / δ², where δ=${input.effectSize}, σ=${sigma.toFixed(3)}`;
    }

    const groups = input.numberOfGroups ?? 2;
    const total = nPerGroup * groups;
    const adjustedPerGroup = Math.ceil(nPerGroup / (1 - input.attritionRate));
    const adjustedTotal = adjustedPerGroup * groups;

    // Verify actual power
    const se = sigma * Math.sqrt(1 / nPerGroup + 1 / (nPerGroup * r));
    const actualPower = this.normCdf(input.effectSize / se - zAlpha) + this.normCdf(-input.effectSize / se - zAlpha);

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
      criticalValue: zAlpha,
      testStatistic: 't-test',
      formula,
      assumptions,
      scenarios,
    };
  }

  private computeBinary(input: StatisticalInput, assumptions: ComputationAssumption[]): ComputationResult {
    const zAlpha = this.normQuantile(1 - input.alpha / 2);
    const zBeta = this.normQuantile(input.powerTarget);
    const r = input.allocationRatio;

    const p1 = input.controlRate ?? 0.5;
    const p2 = input.treatmentRate ?? (p1 + input.effectSize);
    const pBar = (p1 + r * p2) / (1 + r);

    let nPerGroup: number;
    let method: string;
    let formula: string;

    if (input.studyType === 'non_inferiority' && input.nonInferiorityMargin) {
      const delta = (p2 - p1) - input.nonInferiorityMargin;
      const v = p1 * (1 - p1) + p2 * (1 - p2) / r;
      nPerGroup = Math.ceil((zAlpha + zBeta) ** 2 * v / (delta * delta));
      method = 'Two-proportion z-test (non-inferiority)';
      formula = `n = (z_α + z_β)² * [p1(1-p1) + p2(1-p2)/r] / (δ - Δ_NI)²`;
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
      power: input.powerTarget,
      effectSize: Math.abs(p2 - p1),
      alpha: input.alpha,
      adjustedSampleSize: adjustedPerGroup,
      adjustedTotal,
      attritionAdjusted: input.attritionRate > 0,
      criticalValue: zAlpha,
      testStatistic: 'z-test',
      formula,
      assumptions,
      scenarios,
    };
  }

  private computeSurvival(input: StatisticalInput, assumptions: ComputationAssumption[]): ComputationResult {
    const zAlpha = this.normQuantile(1 - input.alpha / 2);
    const zBeta = this.normQuantile(input.powerTarget);
    const r = input.allocationRatio;

    // Schoenfeld formula for log-rank test
    const hr = 1 - input.effectSize; // effect size as hazard ratio reduction
    const logHR = Math.log(hr > 0 ? hr : 0.5);

    const events = Math.ceil(
      ((zAlpha + zBeta) ** 2 * (1 + r) ** 2) / (r * logHR * logHR)
    );

    // Convert events to sample size using event rate
    const eventRate = input.eventRate ?? 0.5;
    const nPerGroup = Math.ceil(events / (2 * eventRate));

    const groups = input.numberOfGroups ?? 2;
    const total = nPerGroup * groups;
    const adjustedPerGroup = Math.ceil(nPerGroup / (1 - input.attritionRate));
    const adjustedTotal = adjustedPerGroup * groups;

    const scenarios = this.generateScenarios(input, 'time_to_event');

    return {
      method: 'Log-rank test (Schoenfeld formula)',
      sampleSize: { perGroup: nPerGroup, total, groups },
      power: input.powerTarget,
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

  private computeDevicePerformance(input: StatisticalInput, assumptions: ComputationAssumption[]): ComputationResult {
    // Performance goal design (single-arm vs. performance standard)
    const zAlpha = this.normQuantile(1 - input.alpha);
    const zBeta = this.normQuantile(input.powerTarget);
    const pg = input.controlRate ?? 0.85; // performance goal
    const expected = input.treatmentRate ?? (pg + input.effectSize);

    const n = Math.ceil(
      (zAlpha * Math.sqrt(pg * (1 - pg)) + zBeta * Math.sqrt(expected * (1 - expected))) ** 2 /
      ((expected - pg) ** 2)
    );

    const adjustedN = Math.ceil(n / (1 - input.attritionRate));

    return {
      method: 'Performance goal test (single-arm)',
      sampleSize: { perGroup: n, total: n, groups: 1 },
      power: input.powerTarget,
      effectSize: expected - pg,
      alpha: input.alpha,
      adjustedSampleSize: adjustedN,
      adjustedTotal: adjustedN,
      attritionAdjusted: input.attritionRate > 0,
      criticalValue: zAlpha,
      testStatistic: 'z-test (one-sided)',
      formula: `n = [z_α√(PG(1-PG)) + z_β√(p(1-p))]² / (p-PG)², PG=${pg}, p=${expected.toFixed(3)}`,
      assumptions,
      scenarios: this.generateScenarios(input, 'binary'),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Diagnostic/IVD-specific computations
  // ════════════════════════════════════════════════════════════════

  private computeDiagnostic(input: StatisticalInput): ComputationResult {
    const assumptions = this.buildAssumptions(input);
    const zAlpha = this.normQuantile(1 - input.alpha / 2);
    const zBeta = this.normQuantile(input.powerTarget);

    const sens = input.sensitivity ?? 0.90;
    const spec = input.specificity ?? 0.90;
    const prev = input.prevalence ?? 0.50;

    // Sample size for sensitivity (diseased subjects)
    const nSens = Math.ceil(
      (zAlpha + zBeta) ** 2 * sens * (1 - sens) / (0.05 ** 2) // margin of 5% around target
    );

    // Sample size for specificity (non-diseased subjects)
    const nSpec = Math.ceil(
      (zAlpha + zBeta) ** 2 * spec * (1 - spec) / (0.05 ** 2)
    );

    // Total accounting for prevalence
    const nDiseased = nSens;
    const nNonDiseased = nSpec;
    const totalByPrevalence = Math.ceil(Math.max(nDiseased / prev, nNonDiseased / (1 - prev)));
    const adjustedTotal = Math.ceil(totalByPrevalence / (1 - input.attritionRate));

    // PPV / NPV
    const ppv = (sens * prev) / (sens * prev + (1 - spec) * (1 - prev));
    const npv = (spec * (1 - prev)) / (spec * (1 - prev) + (1 - sens) * prev);

    const diagnosticMetrics: import('./types').DiagnosticComputationResult = {
      sensitivity: sens,
      specificity: spec,
      ppv: Math.round(ppv * 10000) / 10000,
      npv: Math.round(npv * 10000) / 10000,
      sampleSizeForSensitivity: nSens,
      sampleSizeForSpecificity: nSpec,
      prevalenceAdjustedN: totalByPrevalence,
    };

    return {
      method: 'Diagnostic accuracy study (sensitivity/specificity)',
      sampleSize: { perGroup: totalByPrevalence, total: totalByPrevalence, groups: 1 },
      power: input.powerTarget,
      effectSize: sens,
      alpha: input.alpha,
      adjustedSampleSize: adjustedTotal,
      adjustedTotal,
      attritionAdjusted: input.attritionRate > 0,
      testStatistic: 'Exact binomial / Clopper-Pearson',
      formula: `n_sens = (z_α+z_β)² * Se(1-Se) / w², n_spec = (z_α+z_β)² * Sp(1-Sp) / w², total adjusted by prevalence=${prev}`,
      assumptions,
      diagnosticMetrics,
      scenarios: this.generateDiagnosticScenarios(input),
    };
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

  private generateScenarios(input: StatisticalInput, type: string): ScenarioResult[] {
    const scenarios: ScenarioResult[] = [];
    const multipliers = [0.75, 1.0, 1.25, 1.5];

    for (const mult of multipliers) {
      const modifiedInput = { ...input, effectSize: input.effectSize * mult };
      const zAlpha = this.normQuantile(1 - modifiedInput.alpha / 2);
      const zBeta = this.normQuantile(modifiedInput.powerTarget);
      const sigma = modifiedInput.variance ? Math.sqrt(modifiedInput.variance) : modifiedInput.effectSize;

      let n: number;

      if (type === 'binary') {
        const p1 = modifiedInput.controlRate ?? 0.5;
        const p2 = p1 + modifiedInput.effectSize;
        const pBar = (p1 + p2) / 2;
        n = Math.ceil(
          ((zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
            zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) /
          ((p2 - p1) ** 2)
        );
      } else if (type === 'time_to_event') {
        const hr = 1 - modifiedInput.effectSize;
        const logHR = Math.log(hr > 0 ? hr : 0.5);
        const events = Math.ceil((zAlpha + zBeta) ** 2 * 4 / (logHR * logHR));
        const eventRate = modifiedInput.eventRate ?? 0.5;
        n = Math.ceil(events / eventRate);
      } else {
        n = Math.ceil(
          (2 * sigma * sigma * (zAlpha + zBeta) ** 2) / (modifiedInput.effectSize * modifiedInput.effectSize)
        );
      }

      const adjustedN = Math.ceil(n / (1 - modifiedInput.attritionRate));
      const label = mult === 1.0
        ? 'Base case'
        : mult < 1.0
          ? `Conservative (${(mult * 100).toFixed(0)}% effect)`
          : `Optimistic (${(mult * 100).toFixed(0)}% effect)`;

      scenarios.push({
        label,
        sampleSize: { perGroup: Math.ceil(n / 2), total: adjustedN },
        power: modifiedInput.powerTarget,
        delta: `Effect size = ${modifiedInput.effectSize.toFixed(4)}`,
        recommendation: mult < 1.0 ? 'Use for conservative planning' : mult > 1.25 ? 'May be overly optimistic' : undefined,
      });
    }

    return scenarios;
  }

  private generateDiagnosticScenarios(input: StatisticalInput): ScenarioResult[] {
    const scenarios: ScenarioResult[] = [];
    const prevValues = [0.10, 0.30, 0.50, 0.70];
    const sens = input.sensitivity ?? 0.90;
    const spec = input.specificity ?? 0.90;
    const zAlpha = this.normQuantile(1 - input.alpha / 2);
    const zBeta = this.normQuantile(input.powerTarget);

    for (const prev of prevValues) {
      const nSens = Math.ceil((zAlpha + zBeta) ** 2 * sens * (1 - sens) / (0.05 ** 2));
      const nSpec = Math.ceil((zAlpha + zBeta) ** 2 * spec * (1 - spec) / (0.05 ** 2));
      const total = Math.ceil(Math.max(nSens / prev, nSpec / (1 - prev)));
      const adjusted = Math.ceil(total / (1 - input.attritionRate));

      scenarios.push({
        label: `Prevalence = ${(prev * 100).toFixed(0)}%`,
        sampleSize: { perGroup: total, total: adjusted },
        power: input.powerTarget,
        delta: `Prev=${prev}, Se=${sens}, Sp=${spec}`,
        recommendation: prev < 0.2 ? 'Low prevalence requires large N — consider enrichment' : undefined,
      });
    }

    return scenarios;
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

    return assumptions;
  }
}

export const computationEngine = new ComputationEngine();
