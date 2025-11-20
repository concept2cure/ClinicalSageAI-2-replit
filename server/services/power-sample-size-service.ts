import * as math from 'mathjs';

/**
 * Power & Sample Size Calculator Service
 *
 * This service provides comprehensive capabilities for sample size estimation
 * and power calculations across various trial designs and statistical methods.
 *
 * Features:
 * - Frequentist methods (t-tests, ANOVA, survival analysis, non-inferiority)
 * - Bayesian methods (posterior probability, credible intervals)
 * - Group sequential and adaptive design simulations
 */
export class PowerSampleSizeService {
  /**
   * Calculate sample size for a two-sample t-test
   *
   * @param delta - Effect size (difference between means)
   * @param sigma - Standard deviation (pooled)
   * @param alpha - Type I error rate (default: 0.05)
   * @param power - Desired power (default: 0.8)
   * @param ratio - Allocation ratio between groups (default: 1 for equal allocation)
   * @returns The required sample size per group
   */
  calculateTTestSampleSize(
    delta: number,
    sigma: number,
    alpha: number = 0.05,
    power: number = 0.8,
    ratio: number = 1
  ): { n1: number; n2: number; total: number } {
    // Two-sided t-test
    const z_alpha = this.getNormalQuantile(1 - alpha / 2);
    const z_beta = this.getNormalQuantile(power);

    const n1 = Math.ceil(
      ((1 + 1 / ratio) * Math.pow(sigma, 2) * Math.pow(z_alpha + z_beta, 2)) / Math.pow(delta, 2)
    );

    const n2 = Math.ceil(n1 * ratio);

    return { n1, n2, total: n1 + n2 };
  }

  /**
   * Calculate power for a two-sample t-test
   *
   * @param n1 - Sample size in group 1
   * @param n2 - Sample size in group 2
   * @param delta - Effect size (difference between means)
   * @param sigma - Standard deviation (pooled)
   * @param alpha - Type I error rate (default: 0.05)
   * @returns The calculated power
   */
  calculateTTestPower(
    n1: number,
    n2: number,
    delta: number,
    sigma: number,
    alpha: number = 0.05
  ): number {
    const z_alpha = this.getNormalQuantile(1 - alpha / 2);

    // Standard error of the difference
    const se = sigma * Math.sqrt(1 / n1 + 1 / n2);

    // Standardized effect
    const effect = delta / se;

    // Calculate power
    const power = this.normCdf(effect - z_alpha) + this.normCdf(-effect - z_alpha);

    return power;
  }

  /**
   * Calculate sample size for binary endpoint (proportions)
   *
   * @param p1 - Expected proportion in group 1
   * @param p2 - Expected proportion in group 2
   * @param alpha - Type I error rate (default: 0.05)
   * @param power - Desired power (default: 0.8)
   * @param ratio - Allocation ratio between groups (default: 1 for equal allocation)
   * @returns The required sample size per group
   */
  calculateProportionSampleSize(
    p1: number,
    p2: number,
    alpha: number = 0.05,
    power: number = 0.8,
    ratio: number = 1
  ): { n1: number; n2: number; total: number } {
    const z_alpha = this.getNormalQuantile(1 - alpha / 2);
    const z_beta = this.getNormalQuantile(power);

    // Pooled proportion
    const p = (p1 + ratio * p2) / (1 + ratio);

    // Sample size calculation using arcsin transformation (variance stabilizing)
    const n1 = Math.ceil(
      ((1 + 1 / ratio) * Math.pow(z_alpha + z_beta, 2)) /
        Math.pow(Math.asin(Math.sqrt(p1)) - Math.asin(Math.sqrt(p2)), 2)
    );

    const n2 = Math.ceil(n1 * ratio);

    return { n1, n2, total: n1 + n2 };
  }

  /**
   * Calculate power for binary endpoint (proportions)
   *
   * @param n1 - Sample size in group 1
   * @param n2 - Sample size in group 2
   * @param p1 - Expected proportion in group 1
   * @param p2 - Expected proportion in group 2
   * @param alpha - Type I error rate (default: 0.05)
   * @returns The calculated power
   */
  calculateProportionPower(
    n1: number,
    n2: number,
    p1: number,
    p2: number,
    alpha: number = 0.05
  ): number {
    const z_alpha = this.getNormalQuantile(1 - alpha / 2);

    // Standard error under null hypothesis
    const p = (n1 * p1 + n2 * p2) / (n1 + n2);
    const se0 = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));

    // Standard error under alternative hypothesis
    const se1 = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);

    // Effect size
    const delta = Math.abs(p1 - p2);

    // Non-centrality parameter
    const ncp = delta / se0;

    // Calculate power
    const criticalValue = z_alpha * se0;
    const power =
      this.normCdf(-criticalValue, delta, se1) + this.normCdf(criticalValue, -delta, se1);

    return power;
  }

  /**
   * Calculate sample size for survival endpoint (log-rank test)
   *
   * @param hr - Hazard ratio
   * @param eventRateControl - Event rate in control group
   * @param dropoutRate - Expected dropout rate (default: 0.1)
   * @param alpha - Type I error rate (default: 0.05)
   * @param power - Desired power (default: 0.8)
   * @param ratio - Allocation ratio between groups (default: 1 for equal allocation)
   * @returns The required number of events and total sample size
   */
  calculateSurvivalSampleSize(
    hr: number,
    eventRateControl: number,
    dropoutRate: number = 0.1,
    alpha: number = 0.05,
    power: number = 0.8,
    ratio: number = 1
  ): any {
    const z_alpha = this.getNormalQuantile(1 - alpha / 2);
    const z_beta = this.getNormalQuantile(power);

    // Required number of events
    const events = Math.ceil(
      (Math.pow(z_alpha + z_beta, 2) * (1 + ratio)) / (ratio * Math.pow(Math.log(hr), 2))
    );

    // Calculate weighted event rate
    const eventRateTreatment = eventRateControl * hr;
    const weightedEventRate = (eventRateControl + ratio * eventRateTreatment) / (1 + ratio);

    // Adjust for dropouts
    const adjustedEventRate = weightedEventRate * (1 - dropoutRate);

    // Total sample size
    const n = Math.ceil(events / adjustedEventRate);

    // Sample size per group
    const n1 = Math.ceil(n / (1 + ratio));
    const n2 = n - n1;

    return { events, n1, n2, total: n };
  }

  /**
   * Calculate sample size for non-inferiority trial
   *
   * @param expectedRate - Expected event rate in both groups
   * @param nonInferiorityMargin - Non-inferiority margin
   * @param alpha - Type I error rate (default: 0.025, one-sided)
   * @param power - Desired power (default: 0.8)
   * @param ratio - Allocation ratio between groups (default: 1 for equal allocation)
   * @returns The required sample size per group
   */
  calculateNonInferioritySampleSize(
    expectedRate: number,
    nonInferiorityMargin: number,
    alpha: number = 0.025,
    power: number = 0.8,
    ratio: number = 1
  ): any {
    const z_alpha = this.getNormalQuantile(1 - alpha); // One-sided test
    const z_beta = this.getNormalQuantile(power);

    // For binary outcome
    if (expectedRate > 0 && expectedRate < 1) {
      // Calculate sample size for non-inferiority with binary outcome
      const p = expectedRate;
      const n1 = Math.ceil(
        (Math.pow(z_alpha + z_beta, 2) * p * (1 - p) * (1 + 1 / ratio)) /
          Math.pow(nonInferiorityMargin, 2)
      );

      const n2 = Math.ceil(n1 * ratio);

      return { n1, n2, total: n1 + n2, type: 'binary' };
    }
    // For continuous outcome
    else {
      // Assuming expectedRate here is the expected mean, and nonInferiorityMargin is delta
      // Standard deviation needs to be provided
      const sd = 1; // Default standardized effect, should be replaced with actual SD

      const n1 = Math.ceil(
        (Math.pow(z_alpha + z_beta, 2) * Math.pow(sd, 2) * (1 + 1 / ratio)) /
          Math.pow(nonInferiorityMargin, 2)
      );

      const n2 = Math.ceil(n1 * ratio);

      return { n1, n2, total: n1 + n2, type: 'continuous' };
    }
  }

  /**
   * Calculate sample size for ANOVA
   *
   * @param groups - Number of groups
   * @param effectSize - Effect size (f in Cohen's terminology)
   * @param alpha - Type I error rate (default: 0.05)
   * @param power - Desired power (default: 0.8)
   * @returns The required total sample size
   */
  calculateANOVASampleSize(
    groups: number,
    effectSize: number,
    alpha: number = 0.05,
    power: number = 0.8
  ): { nPerGroup: number; total: number } {
    // Calculate non-centrality parameter lambda
    const lambda = groups * effectSize * effectSize;

    // Degrees of freedom
    const df1 = groups - 1;
    const df2 = 100; // Initial guess for denominator df

    // Critical F value
    const criticalF = this.getInverseF(1 - alpha, df1, df2);

    // Required sample size per group for desired power
    const nPerGroup = Math.ceil((criticalF * (1 + 1 / lambda)) / (effectSize * effectSize));

    return { nPerGroup, total: nPerGroup * groups };
  }

  /**
   * Calculate Bayesian sample size for a two-arm trial
   *
   * @param priorMean1 - Prior mean for group 1
   * @param priorSD1 - Prior standard deviation for group 1
   * @param priorMean2 - Prior mean for group 2
   * @param priorSD2 - Prior standard deviation for group 2
   * @param expectedDifference - Expected treatment effect
   * @param dataSigma - Expected data standard deviation
   * @param threshold - Probability threshold for success (default: 0.95)
   * @returns The required sample size per group
   */
  calculateBayesianSampleSize(
    priorMean1: number,
    priorSD1: number,
    priorMean2: number,
    priorSD2: number,
    expectedDifference: number,
    dataSigma: number,
    threshold: number = 0.95
  ): any {
    // Convert prior information to precision (1/variance)
    const priorPrecision1 = 1 / (priorSD1 * priorSD1);
    const priorPrecision2 = 1 / (priorSD2 * priorSD2);

    // Data precision per observation
    const dataPrecision = 1 / (dataSigma * dataSigma);

    // Iteratively find sample size
    let n = 1;
    let posteriorProbability = 0;

    while (posteriorProbability < threshold && n < 10000) {
      // Posterior precision
      const posteriorPrecision1 = priorPrecision1 + n * dataPrecision;
      const posteriorPrecision2 = priorPrecision2 + n * dataPrecision;

      // Posterior means
      const posteriorMean1 =
        (priorMean1 * priorPrecision1 + n * dataPrecision * (priorMean1 + expectedDifference)) /
        posteriorPrecision1;
      const posteriorMean2 =
        (priorMean2 * priorPrecision2 + n * dataPrecision * priorMean2) / posteriorPrecision2;

      // Posterior standard deviations
      const posteriorSD1 = Math.sqrt(1 / posteriorPrecision1);
      const posteriorSD2 = Math.sqrt(1 / posteriorPrecision2);

      // Probability that treatment is better than control
      posteriorProbability = this.normCdf(
        0,
        posteriorMean1 - posteriorMean2,
        Math.sqrt(posteriorSD1 * posteriorSD1 + posteriorSD2 * posteriorSD2)
      );

      n++;
    }

    return { n1: n - 1, n2: n - 1, total: 2 * (n - 1) };
  }

  /**
   * Simulate group sequential trial to determine sample size
   *
   * @param expectedEffect - Expected treatment effect
   * @param sigma - Standard deviation
   * @param interimLooks - Number of interim looks
   * @param alpha - Type I error rate (default: 0.05)
   * @param power - Desired power (default: 0.8)
   * @param spendingFunction - Alpha spending function ('obrien-fleming' or 'pocock')
   * @returns The sample size required for each stage
   */
  simulateGroupSequentialTrial(
    expectedEffect: number,
    sigma: number,
    interimLooks: number,
    alpha: number = 0.05,
    power: number = 0.8,
    spendingFunction: 'obrien-fleming' | 'pocock' = 'obrien-fleming'
  ): any {
    // First, calculate fixed sample size
    const fixedN = this.calculateTTestSampleSize(expectedEffect, sigma, alpha, power).total;

    // Information fractions for each look
    const informationFractions = Array(interimLooks + 1)
      .fill(0)
      .map((_, i) => (i + 1) / (interimLooks + 1));

    // Alpha spending at each look
    let alphaSpent: number[];

    if (spendingFunction === 'pocock') {
      // Pocock: equal alpha at each look
      alphaSpent = Array(interimLooks + 1).fill(alpha / (interimLooks + 1));
    } else {
      // O'Brien-Fleming: more conservative early, more liberal later
      alphaSpent = informationFractions.map(
        t => 2 * (1 - this.normCdf(this.getNormalQuantile(1 - alpha / 2) / Math.sqrt(t)))
      );
    }

    // Calculate boundaries
    const boundaries = alphaSpent.map(a => this.getNormalQuantile(1 - a / 2));

    // Calculate sample size for each stage
    const maxN = Math.ceil(fixedN * 1.1); // Inflation factor for group sequential design
    const stageN = informationFractions.map(f => Math.ceil(f * maxN));

    // Cumulative sample sizes
    const cumulativeN = stageN;

    // Calculate incremental sample sizes
    const incrementalN = [stageN[0]];
    for (let i = 1; i < stageN.length; i++) {
      incrementalN.push(stageN[i] - stageN[i - 1]);
    }

    // Simulate power
    const simulatedPower = this.simulateGroupSequentialPower(
      expectedEffect,
      sigma,
      cumulativeN,
      boundaries
    );

    return {
      fixedSampleSize: fixedN,
      maxSampleSize: maxN,
      cumulativeN,
      incrementalN,
      informationFractions,
      boundaries,
      alphaSpent,
      simulatedPower,
    };
  }

  /**
   * Simulate power for group sequential design
   *
   * @param delta - Expected effect size
   * @param sigma - Standard deviation
   * @param cumulativeN - Cumulative sample size at each stage
   * @param boundaries - Critical boundaries at each stage
   * @param simulations - Number of simulations (default: 10000)
   * @returns The simulated power
   */
  private simulateGroupSequentialPower(
    delta: number,
    sigma: number,
    cumulativeN: number[],
    boundaries: number[],
    simulations: number = 10000
  ): number {
    let successCount = 0;

    for (let sim = 0; sim < simulations; sim++) {
      let rejected = false;

      for (let stage = 0; stage < cumulativeN.length; stage++) {
        // Sample size in this stage
        const n = cumulativeN[stage];

        // Standard error
        const se = sigma * Math.sqrt(2 / n);

        // Generate test statistic
        const z = delta / se + this.generateStandardNormal();

        // Check if boundary is crossed
        if (Math.abs(z) > boundaries[stage]) {
          rejected = true;
          break;
        }
      }

      if (rejected) {
        successCount++;
      }
    }

    return successCount / simulations;
  }

  /**
   * Calculate sample size for adaptive design
   *
   * @param initialEffect - Initial estimate of treatment effect
   * @param sigma - Standard deviation
   * @param adaptiveRule - Type of sample size re-estimation ('promising zone' or 'conditional power')
   * @param alpha - Type I error rate (default: 0.05)
   * @param power - Desired power (default: 0.8)
   * @returns The expected sample size
   */
  calculateAdaptiveSampleSize(
    initialEffect: number,
    sigma: number,
    adaptiveRule: 'promising zone' | 'conditional power' = 'conditional power',
    alpha: number = 0.05,
    power: number = 0.8
  ): any {
    // Calculate initial sample size
    const initialN = this.calculateTTestSampleSize(initialEffect, sigma, alpha, power).total;

    // Define parameters for sample size re-estimation
    const interimFraction = 0.5; // 50% of patients for interim analysis
    const interimN = Math.ceil(initialN * interimFraction);
    const finalN = initialN;

    // Simulation parameters
    const simulations = 1000;
    const possibleEffects = [0, initialEffect * 0.5, initialEffect, initialEffect * 1.5];
    const results: any = {};

    // Simulate for each true effect size
    for (const trueEffect of possibleEffects) {
      let totalSampleSize = 0;
      let rejections = 0;

      for (let sim = 0; sim < simulations; sim++) {
        // Generate interim data
        const interimSE = sigma * Math.sqrt(2 / interimN);
        const interimEffect = trueEffect + interimSE * this.generateStandardNormal();

        // Re-estimate sample size based on interim effect
        let reestimatedN;

        if (adaptiveRule === 'promising zone') {
          // Promising zone approach
          const interimZ = interimEffect / interimSE;

          if (Math.abs(interimZ) < 0.5) {
            // Unpromising zone: no increase
            reestimatedN = finalN;
          } else if (Math.abs(interimZ) < 1.5) {
            // Promising zone: increase sample size
            reestimatedN = Math.ceil(finalN * 1.5);
          } else {
            // Favorable zone: no increase
            reestimatedN = finalN;
          }
        } else {
          // Conditional power approach
          const conditionalPower = this.calculateConditionalPower(
            interimEffect,
            interimN,
            finalN,
            sigma,
            alpha
          );

          if (conditionalPower < 0.3) {
            // Futility
            reestimatedN = interimN; // Stop for futility
          } else if (conditionalPower < 0.8) {
            // Increase sample size to achieve desired power
            const neededN = this.calculateTTestSampleSize(interimEffect, sigma, alpha, power).total;

            // Cap sample size increase
            reestimatedN = Math.min(neededN, finalN * 2);
          } else {
            // Already sufficient power
            reestimatedN = finalN;
          }
        }

        // Final analysis
        const finalSampleSize = Math.max(interimN, reestimatedN);
        totalSampleSize += finalSampleSize;

        // Calculate final test statistic
        const finalSE = sigma * Math.sqrt(2 / finalSampleSize);
        const finalEffect = trueEffect + finalSE * this.generateStandardNormal();
        const finalZ = finalEffect / finalSE;

        // Check if null hypothesis is rejected
        if (Math.abs(finalZ) > this.getNormalQuantile(1 - alpha / 2)) {
          rejections++;
        }
      }

      // Store results for this effect size
      results[`effect_${trueEffect}`] = {
        expectedSampleSize: totalSampleSize / simulations,
        power: rejections / simulations,
      };
    }

    return {
      initialSampleSize: initialN,
      interimAnalysisAt: interimN,
      adaptiveRule,
      expectedResults: results,
    };
  }

  /**
   * Calculate conditional power at interim
   *
   * @param interimEffect - Observed effect at interim
   * @param interimN - Sample size at interim
   * @param plannedN - Planned total sample size
   * @param sigma - Standard deviation
   * @param alpha - Type I error rate
   * @returns The conditional power
   */
  private calculateConditionalPower(
    interimEffect: number,
    interimN: number,
    plannedN: number,
    sigma: number,
    alpha: number
  ): number {
    const criticalValue = this.getNormalQuantile(1 - alpha / 2);
    const remainingN = plannedN - interimN;

    if (remainingN <= 0) {
      const interimSE = sigma * Math.sqrt(2 / interimN);
      const interimZ = interimEffect / interimSE;
      return Math.abs(interimZ) > criticalValue ? 1 : 0;
    }

    const interimWeight = interimN / plannedN;
    const remainingWeight = remainingN / plannedN;

    const finalZ = interimEffect * Math.sqrt(interimWeight / 2 / sigma);
    const variance = remainingWeight;

    // Calculate conditional power
    const cp = 1 - this.normCdf((criticalValue - finalZ) / Math.sqrt(variance));

    return cp;
  }

  /**
   * Generate a standard normal random variate
   */
  private generateStandardNormal(): number {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Get normal distribution quantile
   *
   * @param p - Probability
   * @returns The z-score
   */
  private getNormalQuantile(p: number): number {
    if (p <= 0) return Number.NEGATIVE_INFINITY;
    if (p >= 1) return Number.POSITIVE_INFINITY;

    // Approximation of the quantile function
    if (p < 0.5) {
      return -this.getNormalQuantile(1 - p);
    }

    const y = Math.sqrt(-2 * Math.log(1 - p));
    const a = 2.515517 + 0.802853 * y + 0.010328 * y * y;
    const b = 1 + 1.432788 * y + 0.189269 * y * y + 0.001308 * y * y * y;

    return y - a / b;
  }

  /**
   * Normal CDF function
   *
   * @param x - Value
   * @param mean - Mean (default: 0)
   * @param sd - Standard deviation (default: 1)
   * @returns The cumulative probability
   */
  private normCdf(x: number, mean: number = 0, sd: number = 1): number {
    const z = (x - mean) / sd;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p =
      d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  /**
   * Get inverse F distribution quantile (approximation)
   *
   * @param p - Probability
   * @param df1 - Numerator degrees of freedom
   * @param df2 - Denominator degrees of freedom
   * @returns The F statistic
   */
  private getInverseF(p: number, df1: number, df2: number): number {
    // Simple approximation for the inverse F distribution
    const t1 = 2 / (9 * df1);
    const t2 = 2 / (9 * df2);
    const z = this.getNormalQuantile(p);
    const f = (1 - t2 + z * Math.sqrt(t2)) / (1 - t1);

    return f * f * f;
  }

  /**
   * Get commonly used effect sizes from CSR data
   *
   * @param indication - The indication/disease area
   * @param endpointType - Type of endpoint (continuous, binary, time-to-event)
   * @returns Distribution of effect sizes
   */
  async getHistoricalEffectSizes(indication: string, endpointType: string): Promise<any> {
    // This would ideally be implemented with a database query
    // For now returning mockup data
    return (
      {
        continuous: {
          mean: 0.5,
          median: 0.45,
          percentile25: 0.3,
          percentile75: 0.7,
          range: [0.2, 1.2],
          description: "Standardized mean difference (Cohen's d)",
        },
        binary: {
          meanOddsRatio: 1.8,
          medianOddsRatio: 1.6,
          rangeOddsRatio: [1.2, 3.5],
          meanRiskRatio: 1.5,
          medianRiskRatio: 1.4,
          rangeRiskRatio: [1.1, 2.8],
          description: 'Odds ratios and risk ratios from similar trials',
        },
        timeToEvent: {
          meanHazardRatio: 0.75,
          medianHazardRatio: 0.72,
          rangeHazardRatio: [0.5, 0.95],
          description: 'Hazard ratios from similar trials',
        },
      }[endpointType] || {
        description: 'No historical data available for this endpoint type',
      }
    );
  }

  /**
   * Get common dropout rates from CSR data
   *
   * @param indication - The indication/disease area
   * @param phase - Study phase
   * @returns Distribution of dropout rates
   */
  async getHistoricalDropoutRates(indication: string, phase: string): Promise<any> {
    // This would ideally be implemented with a database query
    // For now returning mockup data based on typical patterns
    const baseRate = 0.15; // 15% base dropout rate

    let multiplier = 1.0;

    // Adjust by phase
    if (phase.toLowerCase().includes('1')) {
      multiplier *= 0.8; // Phase 1 often has lower dropout
    } else if (phase.toLowerCase().includes('3')) {
      multiplier *= 1.2; // Phase 3 often has higher dropout
    }

    // Some indications have higher dropout rates
    if (
      indication.toLowerCase().includes('oncology') ||
      indication.toLowerCase().includes('cancer')
    ) {
      multiplier *= 1.3;
    } else if (
      indication.toLowerCase().includes('psych') ||
      indication.toLowerCase().includes('mental')
    ) {
      multiplier *= 1.4;
    } else if (indication.toLowerCase().includes('chronic')) {
      multiplier *= 1.2;
    }

    const meanRate = baseRate * multiplier;

    return {
      mean: meanRate,
      median: meanRate * 0.9, // Usually slightly lower than mean
      range: [meanRate * 0.5, meanRate * 1.5],
      byDuration: {
        '3 months': meanRate * 0.7,
        '6 months': meanRate,
        '12 months': meanRate * 1.4,
        '24 months': meanRate * 1.8,
      },
      recommendations: {
        conservative: meanRate * 1.5,
        typical: meanRate,
        optimistic: meanRate * 0.7,
      },
    };
  }

  /**
   * Create simulation models for complex designs
   */
  async createSimulationModel(params: any): Promise<any> {
    // Implementation would depend on specific simulation requirements
    // This is a placeholder for future expansion
    return {
      modelCreated: true,
      simulationParameters: params,
      runSimulation: () => {
        // Run simulation logic would go here
      },
    };
  }
}
