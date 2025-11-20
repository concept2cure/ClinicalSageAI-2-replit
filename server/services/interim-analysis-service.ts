/**
 * Interim Analysis & Stopping Rule Designer Service
 *
 * This service provides functionality for:
 * - Defining interim analyses with configurable timing
 * - Simulating efficacy and futility stopping rules
 * - Implementing error spending functions and boundaries
 * - Visualizing expected outcomes under different scenarios
 */
export class InterimAnalysisService {
  /**
   * Get available alpha spending functions
   */
  getSpendingFunctions() {
    return [
      {
        id: 'obrien-fleming',
        name: "O'Brien-Fleming",
        description:
          'Conservative early, becomes less stringent over time. Preserves most alpha for the final analysis.',
        characteristics: [
          'Very stringent early boundaries',
          'Often used for efficacy stopping',
          'Minimal alpha penalty for interim looks',
          'Final boundary close to fixed design',
        ],
        formula: 'α(t) = 2 × (1 - Φ(z_{α/2}/√t))',
      },
      {
        id: 'pocock',
        name: 'Pocock',
        description: 'Constant boundary across all looks, uses alpha evenly throughout the trial.',
        characteristics: [
          'Constant critical value at each look',
          'More likely to stop early if true effect exists',
          'Larger penalty on final analysis',
          'Higher overall sample size required',
        ],
        formula: 'α(t) = α × log(1 + (e-1) × t)',
      },
      {
        id: 'hwang-shih-decani',
        name: 'Hwang-Shih-DeCani',
        description: 'Flexible family of spending functions with a shape parameter.',
        characteristics: [
          'Flexible gamma parameter controls shape',
          "γ < 0 similar to O'Brien-Fleming",
          'γ > 0 similar to Pocock',
          'γ = 0 similar to linear spending',
        ],
        formula: 'α(t) = α × (1 - e^(-γt))/(1 - e^(-γ))',
      },
      {
        id: 'lan-demets',
        name: 'Lan-DeMets',
        description: 'Another flexible family that approximates standard functions.',
        characteristics: [
          "Can approximate O'Brien-Fleming or Pocock",
          'Works with unplanned interim analyses',
          'Accommodates information-based monitoring',
          'Widely used in practice',
        ],
        formula: 'Various forms based on parameter choices',
      },
      {
        id: 'rho-family',
        name: 'Kim-DeMets (ρ-family)',
        description: 'Family parameterized by ρ, offering flexible spending patterns.',
        characteristics: [
          'ρ = 1: linear spending',
          'ρ = 2: more conservative early',
          "ρ = 3: approximates O'Brien-Fleming",
          'Easily computable boundaries',
        ],
        formula: 'α(t) = α × t^ρ',
      },
    ];
  }

  /**
   * Get available beta spending functions for futility
   */
  getBetaSpendingFunctions() {
    return [
      {
        id: 'obrien-fleming-beta',
        name: "O'Brien-Fleming (for futility)",
        description: 'Conservative approach to futility stopping, less likely to stop early.',
        characteristics: [
          'Very stringent early boundaries for futility',
          'Protective against falsely stopping promising treatments',
          'Minimal impact on overall trial power',
          'May miss early stopping opportunities',
        ],
      },
      {
        id: 'pocock-beta',
        name: 'Pocock (for futility)',
        description: 'Constant boundary for futility stopping across looks.',
        characteristics: [
          'More aggressive early stopping for futility',
          'Higher chance of stopping if treatment truly ineffective',
          'Some reduction in overall power',
          'Better for resource conservation',
        ],
      },
      {
        id: 'conditional-power',
        name: 'Conditional Power Based',
        description: 'Stops for futility when chance of success becomes too low.',
        characteristics: [
          'Based on probability of eventual success',
          'Typically stops if conditional power < 10-20%',
          'Intuitive for clinicians and sponsors',
          'Adaptive to observed treatment effect',
        ],
      },
      {
        id: 'predictive-probability',
        name: 'Predictive Probability Based',
        description: 'Bayesian approach accounting for uncertainty in current estimate.',
        characteristics: [
          'Incorporates prior distributions',
          'Accounts for uncertainty in current estimate',
          'Often more conservative than conditional power',
          'Useful when strong prior information exists',
        ],
      },
    ];
  }

  /**
   * Design interim analysis with stopping rules
   *
   * @param totalSampleSize - Total planned sample size
   * @param numInterimLooks - Number of interim analyses
   * @param alphaSpendingFunction - Function for efficacy boundaries
   * @param betaSpendingFunction - Function for futility boundaries (optional)
   * @param alpha - Overall type I error (default: 0.05)
   * @param beta - Overall type II error (default: 0.2)
   */
  designInterimAnalysis(
    totalSampleSize: number,
    numInterimLooks: number,
    alphaSpendingFunction: string,
    betaSpendingFunction?: string,
    alpha: number = 0.05,
    beta: number = 0.2
  ) {
    // Calculate information fractions
    const infoFractions = [];
    for (let i = 1; i <= numInterimLooks; i++) {
      infoFractions.push(i / (numInterimLooks + 1));
    }
    infoFractions.push(1); // Final analysis

    // Calculate cumulative alpha at each look
    const cumulativeAlpha = this.calculateCumulativeAlpha(
      infoFractions,
      alphaSpendingFunction,
      alpha
    );

    // Calculate efficacy boundaries
    const efficacyBoundaries = this.calculateEfficacyBoundaries(cumulativeAlpha);

    // Calculate futility boundaries if requested
    let futilityBoundaries = null;
    if (betaSpendingFunction) {
      const cumulativeBeta = this.calculateCumulativeBeta(
        infoFractions,
        betaSpendingFunction,
        beta
      );

      futilityBoundaries = this.calculateFutilityBoundaries(cumulativeBeta);
    }

    // Calculate sample sizes at each look
    const sampleSizes = infoFractions.map(f => Math.ceil(f * totalSampleSize));

    // Calculate expected probability of stopping at each look under different scenarios
    const scenarios = this.calculateStoppingProbabilities(
      efficacyBoundaries,
      futilityBoundaries,
      infoFractions,
      alpha,
      beta
    );

    return {
      infoFractions,
      numLooks: numInterimLooks + 1,
      sampleSizes,
      cumulativeAlpha,
      efficacyBoundaries,
      futilityBoundaries,
      scenarios,
      design: {
        alphaSpendingFunction,
        betaSpendingFunction,
        alpha,
        beta,
        totalSampleSize,
      },
    };
  }

  /**
   * Calculate cumulative alpha based on spending function
   */
  private calculateCumulativeAlpha(
    infoFractions: number[],
    spendingFunction: string,
    alpha: number
  ): number[] {
    const cumulativeAlpha = [];

    for (const t of infoFractions) {
      let spent = 0;

      switch (spendingFunction) {
        case 'obrien-fleming':
          // O'Brien-Fleming spending function
          spent = 2 * (1 - this.normalCDF(this.normalQuantile(1 - alpha / 2) / Math.sqrt(t)));
          break;

        case 'pocock':
          // Pocock spending function
          spent = alpha * Math.log(1 + (Math.E - 1) * t);
          break;

        case 'hwang-shih-decani':
          // Hwang-Shih-DeCani with gamma = -4 (similar to O'Brien-Fleming)
          const gamma = -4;
          if (gamma === 0) {
            spent = alpha * t;
          } else {
            spent = (alpha * (1 - Math.exp(-gamma * t))) / (1 - Math.exp(-gamma));
          }
          break;

        case 'rho-family':
          // Kim-DeMets rho family with rho = 3 (~ O'Brien-Fleming)
          const rho = 3;
          spent = alpha * Math.pow(t, rho);
          break;

        default:
          // Default to linear spending
          spent = alpha * t;
      }

      cumulativeAlpha.push(Math.min(spent, alpha));
    }

    return cumulativeAlpha;
  }

  /**
   * Calculate cumulative beta based on spending function
   */
  private calculateCumulativeBeta(
    infoFractions: number[],
    spendingFunction: string,
    beta: number
  ): number[] {
    const cumulativeBeta = [];

    for (const t of infoFractions) {
      let spent = 0;

      switch (spendingFunction) {
        case 'obrien-fleming-beta':
          // Conservative for futility (like O'Brien-Fleming)
          spent = 2 * (1 - this.normalCDF(this.normalQuantile(1 - beta / 2) / Math.sqrt(t)));
          break;

        case 'pocock-beta':
          // More aggressive for futility (like Pocock)
          spent = beta * Math.log(1 + (Math.E - 1) * t);
          break;

        case 'conditional-power':
          // More aggressive early, less later
          spent = beta * Math.pow(t, 0.8);
          break;

        case 'predictive-probability':
          // Similar to conditional power but slightly more conservative
          spent = beta * Math.pow(t, 0.9);
          break;

        default:
          // Default to linear spending
          spent = beta * t;
      }

      cumulativeBeta.push(Math.min(spent, beta));
    }

    return cumulativeBeta;
  }

  /**
   * Calculate efficacy boundaries from cumulative alpha
   */
  private calculateEfficacyBoundaries(cumulativeAlpha: number[]): number[] {
    // Convert cumulative alpha to z-boundaries
    return cumulativeAlpha.map((alpha, i) => {
      // If first interim, use the cumulative alpha
      if (i === 0) {
        return this.normalQuantile(1 - alpha / 2);
      }

      // Otherwise, compute incremental alpha
      const incremental = alpha - cumulativeAlpha[i - 1];
      return incremental <= 0 ? Infinity : this.normalQuantile(1 - incremental / 2);
    });
  }

  /**
   * Calculate futility boundaries from cumulative beta
   */
  private calculateFutilityBoundaries(cumulativeBeta: number[]): number[] {
    // Convert cumulative beta to z-boundaries (futility is one-sided)
    return cumulativeBeta.map((beta, i) => {
      // If first interim, use the cumulative beta
      if (i === 0) {
        return this.normalQuantile(beta);
      }

      // Otherwise, compute incremental beta
      const incremental = beta - cumulativeBeta[i - 1];
      return incremental <= 0 ? -Infinity : this.normalQuantile(incremental);
    });
  }

  /**
   * Calculate probability of stopping at each look under different scenarios
   */
  private calculateStoppingProbabilities(
    efficacyBoundaries: number[],
    futilityBoundaries: number[] | null,
    infoFractions: number[],
    alpha: number,
    beta: number
  ): any {
    const scenarios = [
      { effect: 0, label: 'Null hypothesis (no effect)' },
      { effect: 0.5, label: 'Half of expected effect' },
      { effect: 1.0, label: 'Expected effect' },
      { effect: 1.5, label: 'One and half times expected effect' },
    ];

    const results: any = {};

    for (const scenario of scenarios) {
      const effectSize = scenario.effect;
      const stoppingProbs = [];
      let cumulativeProb = 0;

      for (let i = 0; i < infoFractions.length; i++) {
        const t = infoFractions[i];
        const drift = effectSize * Math.sqrt(t);

        // Probability of crossing efficacy boundary
        const efficacyBound = efficacyBoundaries[i];
        const probEfficacy = 1 - this.normalCDF(efficacyBound - drift);

        // Probability of crossing futility boundary
        let probFutility = 0;
        if (futilityBoundaries) {
          const futilityBound = futilityBoundaries[i];
          probFutility = this.normalCDF(futilityBound - drift);
        }

        // Probability of stopping at this look
        const probStop = (probEfficacy + probFutility) * (1 - cumulativeProb);
        stoppingProbs.push({
          look: i + 1,
          infoFraction: t,
          efficacyBoundary: efficacyBound,
          futilityBoundary: futilityBoundaries ? futilityBoundaries[i] : null,
          probEfficacy: probEfficacy * (1 - cumulativeProb),
          probFutility: probFutility * (1 - cumulativeProb),
          probStop,
          cumulativeStopProb: cumulativeProb + probStop,
        });

        cumulativeProb += probStop;
      }

      results[`effect_${effectSize}`] = {
        label: scenario.label,
        stoppingProbs,
        overallProbStop: stoppingProbs[stoppingProbs.length - 1].cumulativeStopProb,
        expectedSampleSize: this.calculateExpectedSampleSize(
          stoppingProbs,
          infoFractions,
          infoFractions[infoFractions.length - 1] * 100 // Assuming 100 participants per unit of information
        ),
      };
    }

    return results;
  }

  /**
   * Calculate expected sample size based on stopping probabilities
   */
  private calculateExpectedSampleSize(
    stoppingProbs: any[],
    infoFractions: number[],
    totalN: number
  ): number {
    let expectedN = 0;
    let cumulativeProb = 0;

    for (let i = 0; i < stoppingProbs.length; i++) {
      const t = infoFractions[i];
      const prob = stoppingProbs[i].probStop;

      expectedN += t * totalN * prob;
      cumulativeProb += prob;
    }

    return expectedN;
  }

  /**
   * Simulate trial outcomes with specified interim design
   *
   * @param design - Interim analysis design
   * @param trueEffect - True effect size
   * @param sigma - Standard deviation
   * @param simulations - Number of simulations to run
   */
  simulateTrialOutcomes(
    design: any,
    trueEffect: number,
    sigma: number,
    simulations: number = 10000
  ): any {
    const { infoFractions, efficacyBoundaries, futilityBoundaries } = design;

    const results = {
      stoppedForEfficacy: 0,
      stoppedForFutility: 0,
      continuedToFinal: 0,
      rejectedAtFinal: 0,
      overallRejection: 0,
      stoppedAt: Array(infoFractions.length).fill(0),
      expectedSampleSize: 0,
      totalSampleSize: design.design.totalSampleSize,
      averageObservedEffect: 0,
      sumObservedEffects: 0,
    };

    for (let sim = 0; sim < simulations; sim++) {
      let stopped = false;
      let z = 0;

      for (let i = 0; i < infoFractions.length; i++) {
        const t = infoFractions[i];

        // Generate test statistic with drift
        const drift = trueEffect * Math.sqrt(t);
        const se = sigma / Math.sqrt((t * design.design.totalSampleSize) / 2);
        const effectEstimate = trueEffect + this.generateNormal(0, se);
        z = effectEstimate / se;

        // Record effect size
        results.sumObservedEffects += effectEstimate;

        // Check efficacy boundary
        if (z >= efficacyBoundaries[i]) {
          results.stoppedForEfficacy++;
          results.overallRejection++;
          results.stoppedAt[i]++;
          stopped = true;
          break;
        }

        // Check futility boundary
        if (futilityBoundaries && z <= futilityBoundaries[i]) {
          results.stoppedForFutility++;
          results.stoppedAt[i]++;
          stopped = true;
          break;
        }
      }

      // If reached final analysis
      if (!stopped) {
        results.continuedToFinal++;

        // Check if null was rejected at final analysis
        if (z >= efficacyBoundaries[efficacyBoundaries.length - 1]) {
          results.rejectedAtFinal++;
          results.overallRejection++;
        }
      }
    }

    // Calculate expected sample size
    for (let i = 0; i < infoFractions.length; i++) {
      results.expectedSampleSize +=
        infoFractions[i] * design.design.totalSampleSize * (results.stoppedAt[i] / simulations);
    }

    // Convert counts to proportions
    results.stoppedForEfficacy /= simulations;
    results.stoppedForFutility /= simulations;
    results.continuedToFinal /= simulations;
    results.rejectedAtFinal /= simulations;
    results.overallRejection /= simulations;
    results.stoppedAt = results.stoppedAt.map(x => x / simulations);
    results.averageObservedEffect = results.sumObservedEffects / simulations;

    return results;
  }

  /**
   * Compare different interim analysis strategies
   *
   * @param strategies - Array of interim analysis designs
   * @param effectSizes - Array of true effect sizes to evaluate
   */
  compareStrategies(strategies: any[], effectSizes: number[] = [0, 0.5, 1.0, 1.5]): any {
    const results: any = {};

    for (const effect of effectSizes) {
      results[`effect_${effect}`] = [];

      for (const strategy of strategies) {
        const sim = this.simulateTrialOutcomes(
          strategy,
          effect,
          1.0, // Standard deviation
          5000 // Fewer simulations for comparison
        );

        results[`effect_${effect}`].push({
          name: strategy.design.name || `Strategy with ${strategy.numLooks} looks`,
          overallPower: sim.overallRejection,
          expectedSampleSize: sim.expectedSampleSize,
          expectedSampleSizeSavings: 1 - sim.expectedSampleSize / sim.totalSampleSize,
          earlyStopRate: 1 - sim.continuedToFinal,
          earlyEfficacyRate: sim.stoppedForEfficacy,
          earlyFutilityRate: sim.stoppedForFutility,
        });
      }
    }

    return results;
  }

  /**
   * Generate optimal interim design based on constraints
   *
   * @param constraints - Constraints on the design
   */
  generateOptimalDesign(constraints: any): any {
    const {
      maxInterimLooks = 3,
      targetPower = 0.8,
      maxSampleSize,
      expectedEffect,
      typeIError = 0.05,
      optimization = 'expectedSampleSize', // or 'overallPower'
    } = constraints;

    // Start with one interim look
    let bestDesign = null;
    let bestMetric = optimization === 'expectedSampleSize' ? Infinity : 0;

    // Try different numbers of looks
    for (let looks = 1; looks <= maxInterimLooks; looks++) {
      // Try different spacing strategies
      const spacingStrategies = [
        'equal', // Equal spacing
        'early', // More looks early
        'late', // More looks late
      ];

      for (const spacing of spacingStrategies) {
        // Generate info fractions based on spacing
        const infoFractions = [];
        for (let i = 1; i <= looks; i++) {
          let fraction;
          if (spacing === 'equal') {
            fraction = i / (looks + 1);
          } else if (spacing === 'early') {
            fraction = Math.pow(i / (looks + 1), 1.5);
          } else {
            // late
            fraction = Math.pow(i / (looks + 1), 0.75);
          }
          infoFractions.push(fraction);
        }
        infoFractions.push(1); // Final analysis

        // Try different alpha spending functions
        const alphaFunctions = ['obrien-fleming', 'pocock', 'hwang-shih-decani'];
        for (const alphaFn of alphaFunctions) {
          // Try different beta spending functions
          const betaFunctions = [null, 'obrien-fleming-beta', 'pocock-beta', 'conditional-power'];
          for (const betaFn of betaFunctions) {
            // Create the design
            const design = this.designInterimAnalysis(
              maxSampleSize,
              looks,
              alphaFn,
              betaFn,
              typeIError,
              1 - targetPower
            );

            // Simulate performance
            const sim = this.simulateTrialOutcomes(design, expectedEffect, 1.0, 1000);

            // Check if this is the best design based on optimization criterion
            if (optimization === 'expectedSampleSize') {
              if (sim.overallRejection >= targetPower && sim.expectedSampleSize < bestMetric) {
                bestMetric = sim.expectedSampleSize;
                bestDesign = { ...design, simulation: sim };
              }
            } else {
              // optimize for power
              if (sim.overallRejection > bestMetric && sim.expectedSampleSize <= maxSampleSize) {
                bestMetric = sim.overallRejection;
                bestDesign = { ...design, simulation: sim };
              }
            }
          }
        }
      }
    }

    return bestDesign;
  }

  /**
   * Generate a standard normal random variate
   */
  private generateNormal(mean: number = 0, sd: number = 1): number {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * sd;
  }

  /**
   * Normal CDF function
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp((-x * x) / 2);
    const p =
      d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  /**
   * Normal quantile function
   */
  private normalQuantile(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;

    // Approximation of the quantile function
    if (p < 0.5) {
      return -this.normalQuantile(1 - p);
    }

    const y = Math.sqrt(-2 * Math.log(1 - p));
    const a = 2.515517 + 0.802853 * y + 0.010328 * y * y;
    const b = 1 + 1.432788 * y + 0.189269 * y * y + 0.001308 * y * y * y;

    return y - a / b;
  }
}
