/**
 * Monte Carlo Simulation Service
 *
 * This service provides statistical simulation capabilities for the Study Architect module.
 * It runs Monte Carlo simulations to estimate power, sample size, and other statistical
 * properties for clinical trial designs.
 *
 * Reproducibility: every random variate is drawn from a seeded engine
 * (`server/services/stats/rng.ts`). Each simulation reseeds deterministically at
 * entry — from an explicit `seed` when supplied, otherwise from a stable hash of
 * the inputs — so the same request reproduces the same empirical power, type I
 * error, and confidence interval, and the result carries a provenance record.
 */
import { Rng, createRng, seedFromObject } from './stats/rng';
import { buildProvenance, type StatsProvenance } from './stats/computation-provenance';

export class MonteCarloService {
  /** Seeded generator for all Monte Carlo draws. Reseeded per simulation. */
  private rng: Rng = createRng();

  /**
   * Reseed the engine for a run. An explicit finite seed is used verbatim;
   * otherwise a seed is derived deterministically from the inputs so identical
   * requests reproduce identical results. Returns the seed actually used.
   */
  private seedRun(inputs: unknown, explicitSeed?: number): number {
    const seed =
      explicitSeed !== undefined && Number.isFinite(explicitSeed)
        ? Math.trunc(explicitSeed)
        : seedFromObject(inputs);
    this.rng = createRng(seed);
    return seed;
  }
  /**
   * Run a Monte Carlo simulation
   *
   * @param params Simulation parameters
   * @returns Simulation results
   */
  async runSimulation(params: any) {
    try {
      // Extract parameters
      const {
        design_type,
        test_type,
        endpoint_type,
        alpha,
        effect_size,
        variability,
        margin,
        sample_size,
        n_simulations,
        dropout_rate,
        allocation_ratio,
        include_sensitivity,
        seed,
      } = params;

      // Validate parameters
      if (alpha <= 0 || alpha >= 1) {
        throw new Error('Alpha must be between 0 and 1');
      }

      if (effect_size <= 0) {
        throw new Error('Effect size must be positive');
      }

      if (sample_size <= 0) {
        throw new Error('Sample size must be positive');
      }

      // Run simulation
      const simulationResult = this.performMonteCarloSimulation(
        design_type,
        test_type,
        endpoint_type,
        alpha,
        effect_size,
        variability || 1.0,
        margin || 0.0,
        sample_size,
        n_simulations || 1000,
        dropout_rate || 0.2,
        allocation_ratio || [1.0, 1.0],
        seed
      );

      // Run sensitivity analysis if requested
      let sensitivityResults = null;
      if (include_sensitivity) {
        sensitivityResults = this.performSensitivityAnalysis(
          design_type,
          test_type,
          endpoint_type,
          alpha,
          effect_size,
          variability || 1.0,
          margin || 0.0,
          sample_size,
          dropout_rate || 0.2
        );
      }

      return {
        success: true,
        parameters: {
          design_type,
          test_type,
          endpoint_type,
          alpha,
          effect_size,
          variability: variability || 1.0,
          margin: margin || 0.0,
          sample_size,
          n_simulations: n_simulations || 1000,
          dropout_rate: dropout_rate || 0.2,
          allocation_ratio: allocation_ratio || [1.0, 1.0],
        },
        empirical_power: simulationResult.power,
        type_i_error: simulationResult.typeIError,
        confidence_interval: simulationResult.confidenceInterval,
        effective_sample_size: Math.floor(sample_size * (1 - (dropout_rate || 0.2))),
        computational_time: simulationResult.computationalTime,
        sensitivity_analysis: sensitivityResults,
        seed: simulationResult.seed,
        provenance: buildProvenance({
          method: 'monte-carlo:runSimulation',
          seed: simulationResult.seed,
          inputs: {
            design_type,
            test_type,
            endpoint_type,
            alpha,
            effect_size,
            variability: variability || 1.0,
            margin: margin || 0.0,
            sample_size,
            n_simulations: n_simulations || 1000,
            dropout_rate: dropout_rate || 0.2,
            allocation_ratio: allocation_ratio || [1.0, 1.0],
          },
          note: 'Empirical power, type I error, and CI are reproducible given this seed and these inputs.',
        }),
      };
    } catch (error: any) {
      console.error('Error in runSimulation:', error);
      throw new Error(`Simulation failed: ${error.message}`);
    }
  }

  /**
   * Get available simulation methods
   *
   * @returns Available methods and their parameters
   */
  getAvailableMethods() {
    return {
      design_types: [
        {
          id: 'parallel',
          name: 'Parallel Group',
          description: 'Subjects randomized to one of multiple arms',
        },
        {
          id: 'crossover',
          name: 'Crossover',
          description: 'Subjects receive multiple treatments in sequence',
        },
        {
          id: 'cluster',
          name: 'Cluster Randomized',
          description: 'Groups of subjects randomized together',
        },
        {
          id: 'adaptive',
          name: 'Adaptive Design',
          description: 'Design parameters modified based on interim results',
        },
      ],
      test_types: [
        {
          id: 'superiority',
          name: 'Superiority',
          description: 'Test if treatment is better than control',
        },
        {
          id: 'non-inferiority',
          name: 'Non-Inferiority',
          description: 'Test if treatment is not worse than control by more than a margin',
        },
        {
          id: 'equivalence',
          name: 'Equivalence',
          description: 'Test if treatment and control are similar within a margin',
        },
      ],
      endpoint_types: [
        {
          id: 'continuous',
          name: 'Continuous',
          description: 'Numeric measurement (e.g., blood pressure)',
        },
        { id: 'binary', name: 'Binary', description: 'Success/failure outcome' },
        { id: 'time-to-event', name: 'Time-to-Event', description: 'Survival or event time data' },
        { id: 'count', name: 'Count', description: 'Number of events or occurrences' },
      ],
    };
  }

  /**
   * Generate a power curve for a range of sample sizes
   *
   * @param params Base simulation parameters
   * @param minN Minimum sample size
   * @param maxN Maximum sample size
   * @param points Number of points to calculate
   * @returns Power curve data
   */
  async generatePowerCurve(params: any, minN: number, maxN: number, points: number = 10) {
    try {
      const step = Math.max(10, Math.ceil((maxN - minN) / points));
      const powerCurveData = [];

      for (let n = minN; n <= maxN; n += step) {
        const simParams = { ...params, sample_size: n };
        const result = await this.runSimulation(simParams);

        powerCurveData.push({
          sampleSize: n,
          power: result.empirical_power,
        });
      }

      return powerCurveData;
    } catch (error: any) {
      console.error('Error in generatePowerCurve:', error);
      throw new Error(`Power curve generation failed: ${error.message}`);
    }
  }

  /**
   * Calculate required sample size to achieve target power
   *
   * @param params Base simulation parameters
   * @param targetPower Target power (0-1)
   * @param maxN Maximum sample size to try
   * @returns Calculated sample size and associated result
   */
  async calculateSampleSize(params: any, targetPower: number, maxN: number = 1000) {
    try {
      // Validate parameters
      if (targetPower <= 0 || targetPower >= 1) {
        throw new Error('Target power must be between 0 and 1');
      }

      // Use binary search to find the sample size
      let lowN = 10;
      let highN = maxN;
      let bestN = null;
      let bestResult = null;
      let iterations = 0;
      const maxIterations = 10; // Limit iterations for performance

      while (lowN <= highN && iterations < maxIterations) {
        iterations++;
        const midN = Math.floor((lowN + highN) / 2);

        const simParams = { ...params, sample_size: midN };
        const result = await this.runSimulation(simParams);

        const power = result.empirical_power;

        if (Math.abs(power - targetPower) < 0.02 || midN === lowN) {
          // We found a close enough solution or can't go any lower
          bestN = midN;
          bestResult = result;
          break;
        }

        if (power < targetPower) {
          lowN = midN + 1;
        } else {
          highN = midN - 1;
          bestN = midN;
          bestResult = result;
        }
      }

      if (bestN === null) {
        throw new Error(`Could not find sample size to achieve ${targetPower * 100}% power`);
      }
      if (!bestResult) {
        throw new Error('No simulation result available for calculated sample size');
      }

      return {
        calculated_sample_size: bestN,
        achieved_power: bestResult.empirical_power,
        simulation_result: bestResult,
      };
    } catch (error: any) {
      console.error('Error in calculateSampleSize:', error);
      throw new Error(`Sample size calculation failed: ${error.message}`);
    }
  }

  /**
   * Perform Monte Carlo simulation
   *
   * This is the core simulation function that generates data and runs statistical tests
   * based on the specified parameters.
   */
  private performMonteCarloSimulation(
    designType: string,
    testType: string,
    endpointType: string,
    alpha: number,
    effectSize: number,
    variability: number,
    margin: number,
    sampleSize: number,
    nSimulations: number,
    dropoutRate: number,
    allocationRatio: number[],
    seed?: number
  ) {
    // Reseed deterministically so this simulation is reproducible. Sweeps
    // (power curve / sample-size search) reseed per point from their own inputs.
    const usedSeed = this.seedRun(
      {
        designType,
        testType,
        endpointType,
        alpha,
        effectSize,
        variability,
        margin,
        sampleSize,
        nSimulations,
        dropoutRate,
        allocationRatio,
      },
      seed
    );

    // Record start time for computational time measurement
    const startTime = Date.now();

    // Count successful trials (p < alpha)
    let successCount = 0;

    // Run simulations
    for (let i = 0; i < nSimulations; i++) {
      // Generate data based on design and endpoint type
      const data = this.generateSimulatedData(
        designType,
        endpointType,
        effectSize,
        variability,
        sampleSize,
        dropoutRate,
        allocationRatio
      );

      // Perform statistical test
      const pValue = this.performStatisticalTest(testType, endpointType, data, margin);

      // Count success
      if (pValue < alpha) {
        successCount++;
      }
    }

    // Calculate empirical power
    const power = successCount / nSimulations;

    // Calculate confidence interval for power
    const standardError = Math.sqrt((power * (1 - power)) / nSimulations);
    const marginOfError = 1.96 * standardError; // 95% confidence interval

    // Calculate type I error by running simulations with effect size = 0
    let typeIErrors = 0;
    const typeISimulations = Math.min(1000, nSimulations / 10); // Fewer simulations for type I error

    for (let i = 0; i < typeISimulations; i++) {
      // Generate data with no effect
      const data = this.generateSimulatedData(
        designType,
        endpointType,
        0, // No effect
        variability,
        sampleSize,
        dropoutRate,
        allocationRatio
      );

      // Perform statistical test
      const pValue = this.performStatisticalTest(testType, endpointType, data, margin);

      // Count type I errors
      if (pValue < alpha) {
        typeIErrors++;
      }
    }

    const typeIError = typeIErrors / typeISimulations;

    // Record computational time
    const computationalTime = Date.now() - startTime;

    return {
      power,
      typeIError,
      confidenceInterval: [Math.max(0, power - marginOfError), Math.min(1, power + marginOfError)],
      computationalTime,
      seed: usedSeed,
    };
  }

  /**
   * Generate simulated data based on study design and endpoint type
   */
  private generateSimulatedData(
    designType: string,
    endpointType: string,
    effectSize: number,
    variability: number,
    sampleSize: number,
    dropoutRate: number,
    allocationRatio: number[]
  ) {
    // Calculate arm sample sizes based on allocation ratio
    const totalRatio = allocationRatio.reduce((a, b) => a + b, 0);
    const armSampleSizes = allocationRatio.map(ratio =>
      Math.floor((ratio / totalRatio) * sampleSize)
    );

    // Apply dropout
    const effectiveArmSizes = armSampleSizes.map(n => Math.floor(n * (1 - dropoutRate)));

    // Generate data for each arm
    const armData = [];

    for (let armIndex = 0; armIndex < allocationRatio.length; armIndex++) {
      const armSize = effectiveArmSizes[armIndex];
      const armEffect = armIndex === 0 ? 0 : effectSize; // Arm 0 is control, others get effect

      const data = [];

      switch (endpointType) {
        case 'continuous':
          // Generate normally distributed continuous data
          for (let i = 0; i < armSize; i++) {
            data.push(armEffect + this.generateNormalRandom(0, variability));
          }
          break;

        case 'binary':
          // Generate binary data
          const controlRate = 0.3; // Base rate for control
          const treatmentRate = Math.min(1, Math.max(0, controlRate + effectSize));
          const rate = armIndex === 0 ? controlRate : treatmentRate;

          for (let i = 0; i < armSize; i++) {
            data.push(this.rng.bernoulli(rate) ? 1 : 0);
          }
          break;

        case 'time-to-event':
          // Generate survival data
          const lambdaControl = 0.1; // Base hazard for control
          const hazardRatio = Math.exp(-effectSize); // Effect size as log hazard ratio
          const lambda = armIndex === 0 ? lambdaControl : lambdaControl * hazardRatio;

          for (let i = 0; i < armSize; i++) {
            // Generate exponential survival time
            const survivalTime = this.rng.exponential(lambda);
            const censored = this.rng.uniform() > 0.7; // 30% censoring
            data.push({ time: survivalTime, event: !censored });
          }
          break;

        case 'count':
          // Generate count data using Poisson distribution
          const meanControl = 5; // Base mean for control
          const meanTreatment = meanControl + effectSize;
          const mean = armIndex === 0 ? meanControl : meanTreatment;

          for (let i = 0; i < armSize; i++) {
            data.push(this.generatePoissonRandom(mean));
          }
          break;
      }

      armData.push(data);
    }

    return {
      designType,
      endpointType,
      armData,
      armSizes: effectiveArmSizes,
    };
  }

  /**
   * Perform statistical test based on test type and endpoint type
   */
  private performStatisticalTest(
    testType: string,
    endpointType: string,
    data: any,
    margin: number
  ) {
    const { armData, armSizes } = data;

    // Extract control and treatment data
    const controlData = armData[0];
    const treatmentData = armData[1]; // Using first treatment arm

    switch (endpointType) {
      case 'continuous':
        // t-test for continuous data
        return this.performTTest(controlData, treatmentData, testType, margin);

      case 'binary':
        // Chi-square test for binary data
        return this.performChiSquareTest(controlData, treatmentData, testType, margin);

      case 'time-to-event':
        // Log-rank test for survival data
        return this.performLogRankTest(controlData, treatmentData, testType, margin);

      case 'count':
        // Poisson regression for count data
        return this.performPoissonTest(controlData, treatmentData, testType, margin);

      default:
        // Default to t-test
        return this.performTTest(controlData, treatmentData, testType, margin);
    }
  }

  /**
   * Perform sensitivity analysis by varying parameters
   */
  private performSensitivityAnalysis(
    designType: string,
    testType: string,
    endpointType: string,
    alpha: number,
    effectSize: number,
    variability: number,
    margin: number,
    sampleSize: number,
    dropoutRate: number
  ) {
    // Sensitivity to effect size
    const effectSizes = [
      effectSize * 0.7,
      effectSize * 0.85,
      effectSize,
      effectSize * 1.15,
      effectSize * 1.3,
    ];

    const effectSizeSensitivity = effectSizes.map(es => {
      const result = this.performMonteCarloSimulation(
        designType,
        testType,
        endpointType,
        alpha,
        es,
        variability,
        margin,
        sampleSize,
        500, // Fewer simulations for sensitivity
        dropoutRate,
        [1.0, 1.0]
      );

      return {
        effect_size: es,
        power: result.power,
      };
    });

    // Sensitivity to dropout rate
    const dropoutRates = [
      0,
      dropoutRate * 0.5,
      dropoutRate,
      dropoutRate * 1.5,
      Math.min(0.5, dropoutRate * 2),
    ];

    const dropoutSensitivity = dropoutRates.map(dr => {
      const result = this.performMonteCarloSimulation(
        designType,
        testType,
        endpointType,
        alpha,
        effectSize,
        variability,
        margin,
        sampleSize,
        500, // Fewer simulations for sensitivity
        dr,
        [1.0, 1.0]
      );

      return {
        dropout_rate: dr,
        power: result.power,
      };
    });

    return {
      effect_size_sensitivity: effectSizeSensitivity,
      dropout_sensitivity: dropoutSensitivity,
    };
  }

  /**
   * Perform t-test for continuous data
   */
  private performTTest(
    controlData: number[],
    treatmentData: number[],
    testType: string,
    margin: number
  ) {
    const n1 = controlData.length;
    const n2 = treatmentData.length;

    const mean1 = controlData.reduce((a, b) => a + b, 0) / n1;
    const mean2 = treatmentData.reduce((a, b) => a + b, 0) / n2;

    const var1 = controlData.reduce((a, b) => a + Math.pow(b - mean1, 2), 0) / (n1 - 1);
    const var2 = treatmentData.reduce((a, b) => a + Math.pow(b - mean2, 2), 0) / (n2 - 1);

    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const se = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));

    const t = (mean2 - mean1 - margin) / se;

    // Get p-value based on test type
    switch (testType) {
      case 'superiority':
        return 1 - this.tCDF(t, n1 + n2 - 2);
      case 'non-inferiority':
        return 1 - this.tCDF(t, n1 + n2 - 2);
      case 'equivalence':
        // TOST test
        const t1 = (mean2 - mean1 - margin) / se;
        const t2 = (mean2 - mean1 + margin) / se;
        const p1 = 1 - this.tCDF(t1, n1 + n2 - 2);
        const p2 = this.tCDF(t2, n1 + n2 - 2);
        return Math.max(p1, p2);
      default:
        return 1 - this.tCDF(Math.abs(t), n1 + n2 - 2) * 2; // Two-sided
    }
  }

  /**
   * Perform chi-square test for binary data
   */
  private performChiSquareTest(
    controlData: number[],
    treatmentData: number[],
    testType: string,
    margin: number
  ) {
    const n1 = controlData.length;
    const n2 = treatmentData.length;

    const success1 = controlData.reduce((a, b) => a + b, 0);
    const success2 = treatmentData.reduce((a, b) => a + b, 0);

    const p1 = success1 / n1;
    const p2 = success2 / n2;

    // For non-inferiority, check if difference is within margin
    if (testType === 'non-inferiority' || testType === 'equivalence') {
      const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
      const z = (p2 - p1 + margin) / se;
      return 1 - this.normalCDF(z);
    }

    // For superiority, use chi-square test
    const totalSuccess = success1 + success2;
    const totalN = n1 + n2;
    const expectedSuccess1 = n1 * (totalSuccess / totalN);
    const expectedSuccess2 = n2 * (totalSuccess / totalN);

    const chiSquare =
      Math.pow(success1 - expectedSuccess1, 2) / expectedSuccess1 +
      Math.pow(n1 - success1 - (n1 - expectedSuccess1), 2) / (n1 - expectedSuccess1) +
      Math.pow(success2 - expectedSuccess2, 2) / expectedSuccess2 +
      Math.pow(n2 - success2 - (n2 - expectedSuccess2), 2) / (n2 - expectedSuccess2);

    // Convert chi-square to p-value
    return 1 - this.chiSquareCDF(chiSquare, 1);
  }

  /**
   * Perform log-rank test for survival data
   */
  private performLogRankTest(
    controlData: any[],
    treatmentData: any[],
    testType: string,
    margin: number
  ) {
    // Simple approximation of log-rank test
    // Calculate observed and expected events in each group
    const allData = [...controlData, ...treatmentData].sort((a, b) => a.time - b.time);
    const n1 = controlData.length;
    const n2 = treatmentData.length;

    let observed1 = 0;
    let expected1 = 0;

    let atRisk1 = n1;
    let atRisk2 = n2;

    for (const d of allData) {
      if (d.event) {
        const group = controlData.includes(d) ? 1 : 2;
        if (group === 1) {
          observed1++;
        }

        const totalAtRisk = atRisk1 + atRisk2;
        expected1 += atRisk1 / totalAtRisk;
      }

      // Update at-risk counts
      if (controlData.includes(d)) {
        atRisk1--;
      } else {
        atRisk2--;
      }
    }

    // Calculate log-rank statistic
    const variance = expected1 * (1 - expected1 / (n1 + n2));
    const logRank = Math.pow(observed1 - expected1, 2) / variance;

    // Convert to p-value
    return 1 - this.chiSquareCDF(logRank, 1);
  }

  /**
   * Perform test for count data
   */
  private performPoissonTest(
    controlData: number[],
    treatmentData: number[],
    testType: string,
    margin: number
  ) {
    const n1 = controlData.length;
    const n2 = treatmentData.length;

    const mean1 = controlData.reduce((a, b) => a + b, 0) / n1;
    const mean2 = treatmentData.reduce((a, b) => a + b, 0) / n2;

    // Calculate z-statistic
    const se = Math.sqrt(mean1 / n1 + mean2 / n2);
    const z = (mean2 - mean1 - margin) / se;

    // Get p-value based on test type
    switch (testType) {
      case 'superiority':
        return 1 - this.normalCDF(z);
      case 'non-inferiority':
        return 1 - this.normalCDF(z);
      case 'equivalence':
        const z1 = (mean2 - mean1 - margin) / se;
        const z2 = (mean2 - mean1 + margin) / se;
        const p1 = 1 - this.normalCDF(z1);
        const p2 = this.normalCDF(z2);
        return Math.max(p1, p2);
      default:
        return 1 - this.normalCDF(Math.abs(z)) * 2; // Two-sided
    }
  }

  /**
   * Generate a random number from a normal distribution
   */
  private generateNormalRandom(mean: number, stdDev: number) {
    return this.rng.normal(mean, stdDev);
  }

  /**
   * Generate a random number from a Poisson distribution
   */
  private generatePoissonRandom(lambda: number) {
    return this.rng.poisson(lambda);
  }

  /**
   * Cumulative distribution function for standard normal
   */
  private normalCDF(x: number) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Cumulative distribution function for chi-square
   */
  private chiSquareCDF(x: number, df: number) {
    if (x <= 0) return 0;

    // Simple approximation for chi-square CDF
    return this.gammaCDF(x / 2, df / 2);
  }

  /**
   * Cumulative distribution function for t-distribution
   */
  private tCDF(t: number, df: number) {
    // Approximation for t CDF
    const x = df / (t * t + df);
    return 1 - 0.5 * this.betaCDF(x, df / 2, 0.5);
  }

  /**
   * Gamma function approximation
   */
  private gamma(z: number): number {
    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1 - z));
    }

    z -= 1;

    const p = [
      676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];

    let x = 0.99999999999980993;
    for (let i = 0; i < p.length; i++) {
      x += p[i] / (z + i + 1);
    }

    const t = z + p.length - 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  /**
   * Incomplete gamma function for gamma CDF
   */
  private gammaCDF(x: number, a: number) {
    if (x <= 0) return 0;
    if (a <= 0) return 1;

    // Simple approximation
    if (x < a + 1) {
      let sum = 1;
      let term = 1;
      for (let i = 1; i <= 100; i++) {
        term *= x / (a + i);
        sum += term;
        if (Math.abs(term) < 1e-10) break;
      }
      return (sum * Math.exp(-x) * Math.pow(x, a)) / this.gamma(a + 1);
    } else {
      return (
        1 - this.normalCDF((Math.pow(x / a, 1 / 3) - (1 - 2 / (9 * a))) / Math.sqrt(2 / (9 * a)))
      );
    }
  }

  /**
   * Beta function
   */
  private beta(a: number, b: number) {
    return (this.gamma(a) * this.gamma(b)) / this.gamma(a + b);
  }

  /**
   * Incomplete beta function for beta CDF
   */
  private betaCDF(x: number, a: number, b: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Simple approximation
    if (x > (a - 1) / (a + b - 2)) {
      return 1 - this.betaCDF(1 - x, b, a);
    }

    const bt = Math.exp(
      Math.log(x) * a + Math.log(1 - x) * b - Math.log(a) - Math.log(this.beta(a, b))
    );

    if (x < (a + 1) / (a + b + 2)) {
      return (bt * this.betaCF(x, a, b)) / a;
    } else {
      return 1 - (bt * this.betaCF(1 - x, b, a)) / b;
    }
  }

  /**
   * Continued fraction for beta function
   */
  private betaCF(x: number, a: number, b: number) {
    const MAX_ITERATIONS = 100;
    const EPSILON = 1e-10;

    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < EPSILON) d = EPSILON;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= MAX_ITERATIONS; m++) {
      const m2 = 2 * m;
      const aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < EPSILON) d = EPSILON;
      c = 1 + aa / c;
      if (Math.abs(c) < EPSILON) c = EPSILON;
      d = 1 / d;
      h *= d * c;

      const bb = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + bb * d;
      if (Math.abs(d) < EPSILON) d = EPSILON;
      c = 1 + bb / c;
      if (Math.abs(c) < EPSILON) c = EPSILON;
      d = 1 / d;

      const del = d * c;
      h *= del;

      if (Math.abs(del - 1) < EPSILON) break;
    }

    return h;
  }
}
