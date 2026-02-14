import { db } from '../db';
import { csrReports, csrDetails } from 'shared/schema';
import { eq, and, like, inArray } from 'drizzle-orm';

/**
 * CSR-Informed Historical Comparator Engine
 *
 * This service extracts and analyzes arm-level data from CSRs
 * to inform trial design, prior distributions, and comparisons.
 *
 * Features:
 * - Extract arm-specific data (means, SDs, effect sizes) from matched prior studies
 * - Create Bayesian priors based on historical data
 * - Generate comparative visualizations (forest plots, risk curves)
 * - Analyze dropout patterns across similar trials
 */
export class HistoricalComparatorService {
  /**
   * Search for relevant historical trials
   *
   * @param indication - Target indication/disease
   * @param phase - Trial phase
   * @param endpoints - Relevant endpoints to match
   * @param options - Additional search options
   */
  async findSimilarTrials(
    indication: string,
    phase: string,
    endpoints: string[] = [],
    options: {
      limit?: number;
      similarIndications?: boolean;
      yearRange?: [number, number];
      includeObservational?: boolean;
    } = {}
  ): Promise<any> {
    const {
      limit = 20,
      similarIndications = false,
      yearRange = [0, new Date().getFullYear()],
      includeObservational = false,
    } = options;

    try {
      // Build query based on parameters
      const query = db
        .select({
          id: csrReports.id,
          title: csrReports.title,
          sponsor: csrReports.sponsor,
          indication: csrReports.indication,
          phase: csrReports.phase,
          status: csrReports.status,
          uploadDate: csrReports.uploadDate,
          studyDesign: csrDetails.studyDesign,
          population: csrDetails.inclusionCriteria,
          primaryEndpoint: csrDetails.primaryEndpoint,
          secondaryEndpoints: csrDetails.secondaryEndpoints,
          statisticalMethods: csrDetails.statisticalMethods,
          efficacyResults: csrDetails.efficacyResults,
          safetyResults: csrDetails.safetyResults,
          sampleSize: csrDetails.sampleSize,
          dropoutRate: csrDetails.dropoutRate,
        })
        .from(csrReports)
        .leftJoin(csrDetails, eq(csrReports.id, csrDetails.reportId))
        .where(
          and(
            similarIndications
              ? like(csrReports.indication, `%${indication}%`)
              : eq(csrReports.indication, indication),

            phase ? eq(csrReports.phase, phase) : undefined,

            !includeObservational ? like(csrDetails.studyDesign || '', '%randomized%') : undefined
          )
        )
        .limit(limit);

      // Execute query
      const results = await query;

      // Post-process to match endpoints if provided
      let matchedTrials = results;

      if (endpoints && endpoints.length > 0) {
        matchedTrials = results.filter(trial => {
          // Check primary endpoint
          const primaryMatch =
            trial.primaryEndpoint &&
            endpoints.some(e => trial.primaryEndpoint?.toLowerCase().includes(e.toLowerCase()));

          // Check secondary endpoints
          const secondaryMatch =
            trial.secondaryEndpoints &&
            endpoints.some(e => trial.secondaryEndpoints?.toLowerCase().includes(e.toLowerCase()));

          return primaryMatch || secondaryMatch;
        });

        // If too few matches, fallback to original results
        if (matchedTrials.length < 3) {
          matchedTrials = results;
        }
      }

      // Extract and structure arm-level data
      const trialsWithArms = await this.extractArmLevelData(matchedTrials);

      return {
        totalMatches: results.length,
        matchingEndpoints: matchedTrials.length,
        trials: trialsWithArms,
      };
    } catch (error) {
      console.error('Error finding similar trials:', error);
      return {
        totalMatches: 0,
        matchingEndpoints: 0,
        trials: [],
        error: 'Failed to query historical trials',
      };
    }
  }

  /**
   * Extract structured arm-level data from trial results
   */
  private async extractArmLevelData(trials: any[]): Promise<any[]> {
    return Promise.all(
      trials.map(async trial => {
        // Extract arm information from efficacy results and study design
        const arms = this.parseArmData(
          trial.studyDesign || '',
          trial.efficacyResults || '',
          trial.sampleSize
        );

        // Extract endpoint results by arm
        const endpointResults = this.parseEndpointResults(
          trial.primaryEndpoint || '',
          trial.secondaryEndpoints || '',
          trial.efficacyResults || ''
        );

        // Extract safety data by arm
        const safetyData = this.parseSafetyData(trial.safetyResults || '');

        // Extract dropout patterns
        const dropoutPatterns = this.parseDropoutPatterns(
          trial.efficacyResults || '',
          trial.safetyResults || '',
          trial.dropoutRate
        );

        return {
          ...trial,
          extractedData: {
            arms,
            endpointResults,
            safetyData,
            dropoutPatterns,
          },
        };
      })
    );
  }

  /**
   * Parse arm information from study design and efficacy results
   */
  private parseArmData(
    studyDesign: string,
    efficacyResults: string,
    totalSampleSize: string | null
  ): any[] {
    const arms = [];
    let armCount = 2; // Default assumption
    let extractedNames: string[] = [];

    // Extract arm count from study design
    const armCountMatch = studyDesign.match(/(\d+)[\s-]arm/i);
    if (armCountMatch && armCountMatch[1]) {
      armCount = parseInt(armCountMatch[1]);
    }

    // Try to extract arm names from text
    const armNamePatterns = [
      /(?:arm|group|treatment)s?(?:\s+were)?(?:\s+as)?(?:\s+follows)?:?\s*((?:[^.]*?(?:arm|group|treatment)[^.]*?(?:,|and)[^.]*)+)/i,
      /randomized to (?:receive)?\s*((?:[^.]*?(?:arm|group|treatment)[^.]*?(?:,|and|or)[^.]*)+)/i,
      /patients (?:were )?(?:assigned|allocated) to\s*((?:[^.]*?(?:,|and|or)[^.]*?)+)/i,
    ];

    for (const pattern of armNamePatterns) {
      const match = studyDesign.match(pattern) || efficacyResults.match(pattern);
      if (match && match[1]) {
        // Extract names between commas, 'and', or other separators
        const namesText = match[1];
        extractedNames = namesText
          .split(/(?:,|\sand\s|\sor\s)/)
          .map(name => name.trim())
          .filter(name => name.length > 0);

        if (extractedNames.length >= 2) {
          break;
        }
      }
    }

    // If we found arm names, use them
    if (extractedNames.length >= 2) {
      armCount = extractedNames.length;

      for (let i = 0; i < armCount; i++) {
        arms.push({
          name: extractedNames[i],
          isControl:
            extractedNames[i].toLowerCase().includes('placebo') ||
            extractedNames[i].toLowerCase().includes('control'),
          estimatedSize: totalSampleSize ? Math.floor(parseInt(totalSampleSize) / armCount) : null,
        });
      }
    }
    // Otherwise create generic arms
    else {
      const hasPlacebo =
        studyDesign.toLowerCase().includes('placebo') ||
        efficacyResults.toLowerCase().includes('placebo-controlled');

      for (let i = 0; i < armCount; i++) {
        const isLast = i === armCount - 1;

        arms.push({
          name: isLast && hasPlacebo ? 'Placebo' : `Treatment Arm ${i + 1}`,
          isControl: isLast && hasPlacebo,
          estimatedSize: totalSampleSize ? Math.floor(parseInt(totalSampleSize) / armCount) : null,
        });
      }
    }

    return arms;
  }

  /**
   * Parse endpoint results by arm
   */
  private parseEndpointResults(
    primaryEndpoint: string,
    secondaryEndpoints: string,
    efficacyResults: string
  ): any {
    const results: any = {
      primary: {},
      secondary: {},
    };

    // Parse primary endpoint results
    if (primaryEndpoint) {
      const endpointName = primaryEndpoint.split(/[,.]?(?:\s+The\s+|\s+A\s+)/i)[0].trim();

      // Look for result patterns in the efficacy text
      const resultSection = this.findSectionForEndpoint(efficacyResults, endpointName);
      if (resultSection) {
        // Try to extract numeric results
        const numericResults = this.extractNumericResults(resultSection);
        if (Object.keys(numericResults).length > 0) {
          results.primary[endpointName] = numericResults;
        }

        // Try to extract p-value
        const pValueMatch = resultSection.match(/p[\s-]*(?:value|=)\s*(?:<|>|=)?\s*(0\.\d+)/i);
        if (pValueMatch && pValueMatch[1]) {
          results.primary[`${endpointName}_pvalue`] = pValueMatch[1];
        }
      }
    }

    // Parse secondary endpoints (simplified)
    if (secondaryEndpoints) {
      const endpoints = secondaryEndpoints
        .split(/[,.]/)
        .map(ep => ep.trim())
        .filter(ep => ep.length > 10); // Arbitrary minimum length

      for (const endpoint of endpoints.slice(0, 3)) {
        // Limit to first 3 for efficiency
        const endpointName = endpoint.split(/[,.]\s+(?:The|A)\s+/i)[0].trim();

        // Look for result patterns in the efficacy text
        const resultSection = this.findSectionForEndpoint(efficacyResults, endpointName);
        if (resultSection) {
          // Try to extract numeric results
          const numericResults = this.extractNumericResults(resultSection);
          if (Object.keys(numericResults).length > 0) {
            results.secondary[endpointName] = numericResults;
          }
        }
      }
    }

    return results;
  }

  /**
   * Find the section of text that discusses a specific endpoint
   */
  private findSectionForEndpoint(text: string, endpoint: string): string | null {
    const paragraphs = text.split(/\n\n|\r\n\r\n/);

    // Look for the endpoint name in paragraphs
    for (let i = 0; i < paragraphs.length; i++) {
      const lowercasePara = paragraphs[i].toLowerCase();
      const lowercaseEndpoint = endpoint.toLowerCase();

      if (lowercasePara.includes(lowercaseEndpoint)) {
        // Return this paragraph and the next one
        return paragraphs.slice(i, i + 2).join('\n\n');
      }
    }

    return null;
  }

  /**
   * Extract numeric results from text
   */
  private extractNumericResults(text: string): any {
    const results: any = {};

    // Pattern for mean and SD
    const meanSdPattern =
      /(?:mean|average)(?:\s+\(?(?:SD|standard deviation)\)?)?\s+(?:of|was|is|:)?\s*([-\d.]+)\s*(?:\(?(?:SD|standard deviation|±)\s*([-\d.]+)\)?)?/i;
    const meanSdMatch = text.match(meanSdPattern);
    if (meanSdMatch) {
      results.mean = parseFloat(meanSdMatch[1]);
      if (meanSdMatch[2]) {
        results.sd = parseFloat(meanSdMatch[2]);
      }
    }

    // Pattern for median and IQR
    const medianPattern =
      /median\s+(?:of|was|is|:)?\s*([-\d.]+)\s*(?:\((?:IQR|range)?\s*([-\d.]+)(?:\s*-\s*|\s*to\s*)([-\d.]+)\)?)?/i;
    const medianMatch = text.match(medianPattern);
    if (medianMatch) {
      results.median = parseFloat(medianMatch[1]);
      if (medianMatch[2] && medianMatch[3]) {
        results.q1 = parseFloat(medianMatch[2]);
        results.q3 = parseFloat(medianMatch[3]);
      }
    }

    // Pattern for proportions
    const proportionPattern =
      /(?:proportion|percentage|rate|incidence)(?:\s+of)?\s+(?:patients|subjects)?\s*(?:with|was|is|:)?\s*(?:was|is|:)?\s*(\d+(?:\.\d+)?)%?\s*(?:\((\d+)\/(\d+)\))?/i;
    const proportionMatch = text.match(proportionPattern);
    if (proportionMatch) {
      if (proportionMatch[1].includes('.')) {
        results.proportion = parseFloat(proportionMatch[1]) / 100; // Convert percentage to proportion
      } else {
        results.proportion = parseInt(proportionMatch[1]) / 100;
      }

      if (proportionMatch[2] && proportionMatch[3]) {
        results.events = parseInt(proportionMatch[2]);
        results.total = parseInt(proportionMatch[3]);
      }
    }

    // Pattern for hazard ratio
    const hrPattern =
      /(?:hazard ratio|HR)(?:\s+was|:)?\s*([\d.]+)(?:\s*\((?:95%\s*CI)?[:\s]*([\d.]+)(?:\s*-\s*|\s*to\s*)([\d.]+)\))?/i;
    const hrMatch = text.match(hrPattern);
    if (hrMatch) {
      results.hazardRatio = parseFloat(hrMatch[1]);
      if (hrMatch[2] && hrMatch[3]) {
        results.lowerCI = parseFloat(hrMatch[2]);
        results.upperCI = parseFloat(hrMatch[3]);
      }
    }

    return results;
  }

  /**
   * Parse safety data by arm
   */
  private parseSafetyData(safetyResults: string): any {
    const safetyData: any = {
      adverseEvents: {},
      seriousAdverseEvents: {},
      discontinuations: {},
    };

    // Extract adverse event rates
    const aePattern =
      /(?:most common|frequent)(?:\s+treatment-emergent)?\s+adverse events(?:\s+\([^)]+\))?\s+(?:included|were):?\s*([^.]+)/i;
    const aeMatch = safetyResults.match(aePattern);
    if (aeMatch && aeMatch[1]) {
      const aeText = aeMatch[1].trim();

      // Parse individual AEs
      const aeParts = aeText.split(/,\s*|\s+and\s+/);
      for (const part of aeParts) {
        const aeRateMatch = part.match(/([^(]+)\s*\((\d+(?:\.\d+)?)%\)/);
        if (aeRateMatch) {
          const aeName = aeRateMatch[1].trim();
          const aeRate = parseFloat(aeRateMatch[2]) / 100;
          safetyData.adverseEvents[aeName] = aeRate;
        }
      }
    }

    // Extract serious adverse events
    const saePattern =
      /(?:serious adverse events|SAEs)(?:\s+\([^)]+\))?\s+(?:occurred|were reported|included)(?:\s+in)?:?\s*([^.]+)/i;
    const saeMatch = safetyResults.match(saePattern);
    if (saeMatch && saeMatch[1]) {
      const saeText = saeMatch[1].trim();

      // Try to extract overall SAE rate
      const overallRateMatch = saeText.match(/(\d+(?:\.\d+)?)%/);
      if (overallRateMatch) {
        safetyData.seriousAdverseEvents.overall = parseFloat(overallRateMatch[1]) / 100;
      }
    }

    // Extract discontinuation rates
    const discPattern =
      /(?:discontinuation|withdrawal)(?:\s+rate)?\s+(?:due to|from)(?:\s+adverse events)?(?:\s+was|:)?\s*(\d+(?:\.\d+)?)%/i;
    const discMatch = safetyResults.match(discPattern);
    if (discMatch && discMatch[1]) {
      safetyData.discontinuations.overall = parseFloat(discMatch[1]) / 100;
    }

    return safetyData;
  }

  /**
   * Parse dropout patterns
   */
  private parseDropoutPatterns(
    efficacyResults: string,
    safetyResults: string,
    dropoutRate: string | null
  ): any {
    const dropoutData: any = {
      overall: dropoutRate ? parseFloat(dropoutRate) / 100 : null,
      byReason: {},
      byTime: {},
    };

    // Extract overall dropout if not provided
    if (!dropoutData.overall) {
      const overallPattern =
        /(?:discontinuation|dropout|withdrawal)(?:\s+rate)?(?:\s+was|:)?\s*(\d+(?:\.\d+)?)%/i;
      const combinedText = efficacyResults + '\n' + safetyResults;
      const overallMatch = combinedText.match(overallPattern);
      if (overallMatch && overallMatch[1]) {
        dropoutData.overall = parseFloat(overallMatch[1]) / 100;
      }
    }

    // Try to extract reasons for dropout
    const reasonPattern =
      /(?:(?:discontinuation|dropout|withdrawal)s?\s+due to|reasons? for\s+(?:discontinuation|dropout|withdrawal))\s+(?:included|were):?\s*([^.]+)/i;
    const combinedText = efficacyResults + '\n' + safetyResults;
    const reasonMatch = combinedText.match(reasonPattern);
    if (reasonMatch && reasonMatch[1]) {
      const reasonsText = reasonMatch[1].trim();

      // Parse individual reasons
      const reasonParts = reasonsText.split(/,\s*|\s+and\s+/);
      for (const part of reasonParts) {
        const reasonRateMatch = part.match(/([^(]+)\s*\((\d+(?:\.\d+)?)%\)/);
        if (reasonRateMatch) {
          const reason = reasonRateMatch[1].trim();
          const rate = parseFloat(reasonRateMatch[2]) / 100;
          dropoutData.byReason[reason] = rate;
        }
      }
    }

    return dropoutData;
  }

  /**
   * Generate a Bayesian prior distribution based on historical data
   *
   * @param indication - Target indication
   * @param endpoint - Target endpoint
   * @param armType - Arm type (e.g., 'control', 'treatment')
   * @param options - Additional options
   */
  async generateBayesianPrior(
    indication: string,
    endpoint: string,
    armType: 'control' | 'treatment' | 'all' = 'all',
    options: {
      phase?: string;
      discounting?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const {
      phase,
      discounting = 0.5, // Weight given to historical data (0-1)
      limit = 20,
    } = options;

    try {
      // Find relevant historical trials
      const historicalData = await this.findSimilarTrials(indication, phase || '', [endpoint], {
        limit,
      });

      if (!historicalData.trials || historicalData.trials.length === 0) {
        return {
          success: false,
          error: 'No relevant historical data found',
        };
      }

      // Extract relevant numeric results for the endpoint
      const endpointResults: any[] = [];

      for (const trial of historicalData.trials) {
        // Look for the endpoint in primary and secondary results
        const primary = trial.extractedData?.endpointResults?.primary || {};
        const secondary = trial.extractedData?.endpointResults?.secondary || {};

        for (const [key, value] of Object.entries({ ...primary, ...secondary })) {
          if (
            key.toLowerCase().includes(endpoint.toLowerCase()) &&
            typeof value === 'object' &&
            value !== null
          ) {
            // Add relevant information for Bayesian modeling
            const result = {
              trialId: trial.id,
              endpoint: key,
              armType: 'unknown',
              ...value,
            };

            // Determine arm type if possible
            if (trial.extractedData?.arms && trial.extractedData.arms.length > 0) {
              for (const arm of trial.extractedData.arms) {
                if (arm.isControl) {
                  result.armType = 'control';
                } else {
                  result.armType = 'treatment';
                }
              }
            }

            // Add to results if it matches the requested arm type
            if (armType === 'all' || result.armType === armType) {
              endpointResults.push(result);
            }
          }
        }
      }

      // Generate appropriate prior based on endpoint type
      if (endpointResults.length === 0) {
        return {
          success: false,
          error: 'No numeric results found for the specified endpoint',
        };
      }

      // Determine endpoint type based on available data
      let endpointType = 'unknown';
      const firstResult = endpointResults[0];

      if ('mean' in firstResult) {
        endpointType = 'continuous';
      } else if ('proportion' in firstResult || 'events' in firstResult) {
        endpointType = 'binary';
      } else if ('hazardRatio' in firstResult) {
        endpointType = 'time-to-event';
      }

      // Generate appropriate prior
      let prior;
      switch (endpointType) {
        case 'continuous':
          prior = this.generateContinuousPrior(endpointResults, discounting);
          break;
        case 'binary':
          prior = this.generateBinaryPrior(endpointResults, discounting);
          break;
        case 'time-to-event':
          prior = this.generateSurvivalPrior(endpointResults, discounting);
          break;
        default:
          return {
            success: false,
            error: 'Could not determine endpoint type from available data',
          };
      }

      return {
        success: true,
        endpointType,
        prior,
        dataPoints: endpointResults.length,
        rawData: endpointResults,
        discounting,
      };
    } catch (error) {
      console.error('Error generating Bayesian prior:', error);
      return {
        success: false,
        error: 'Failed to generate Bayesian prior',
      };
    }
  }

  /**
   * Generate prior for continuous endpoint
   */
  private generateContinuousPrior(results: any[], discounting: number): any {
    // Extract means and SDs
    const means = results.filter(r => 'mean' in r).map(r => r.mean);
    const sds = results.filter(r => 'sd' in r).map(r => r.sd);

    if (means.length === 0) {
      return null;
    }

    // Calculate weighted average and variance
    const meanEstimate = means.reduce((sum, m) => sum + m, 0) / means.length;

    let varianceEstimate;
    if (sds.length > 0) {
      // Pooled variance from all studies
      varianceEstimate = sds.reduce((sum, sd) => sum + sd * sd, 0) / sds.length;
    } else {
      // Use variance of means if SDs not available
      const meanVariance =
        means.reduce((sum, m) => sum + (m - meanEstimate) ** 2, 0) / means.length;
      varianceEstimate = meanVariance * 2; // Conservative estimate
    }

    // Apply discounting to increase uncertainty
    const discountedVariance = varianceEstimate / discounting;

    // For normal prior
    return {
      distribution: 'normal',
      mean: meanEstimate,
      variance: discountedVariance,
      standardDeviation: Math.sqrt(discountedVariance),
      precision: 1 / discountedVariance,
      histogramData: this.generateNormalHistogram(meanEstimate, Math.sqrt(discountedVariance)),
    };
  }

  /**
   * Generate prior for binary endpoint
   */
  private generateBinaryPrior(results: any[], discounting: number): any {
    // Extract proportions and event counts
    const proportions = results.filter(r => 'proportion' in r).map(r => r.proportion);
    const eventCounts = results
      .filter(r => 'events' in r && 'total' in r)
      .map(r => ({ events: r.events, total: r.total }));

    if (proportions.length === 0 && eventCounts.length === 0) {
      return null;
    }

    // Calculate total events and total sample size if available
    let totalEvents = 0;
    let totalSampleSize = 0;

    if (eventCounts.length > 0) {
      totalEvents = eventCounts.reduce((sum, ec) => sum + ec.events, 0);
      totalSampleSize = eventCounts.reduce((sum, ec) => sum + ec.total, 0);
    }

    // Calculate proportion estimate
    let proportionEstimate;
    if (totalSampleSize > 0) {
      proportionEstimate = totalEvents / totalSampleSize;
    } else {
      proportionEstimate = proportions.reduce((sum, p) => sum + p, 0) / proportions.length;
    }

    // Apply discounting to reduce effective sample size
    const effectiveSampleSize =
      totalSampleSize > 0 ? totalSampleSize * discounting : proportions.length * 10 * discounting; // Assume n=10 per proportion if no counts

    // For beta prior
    const alpha = proportionEstimate * effectiveSampleSize;
    const beta = (1 - proportionEstimate) * effectiveSampleSize;

    return {
      distribution: 'beta',
      alpha,
      beta,
      mean: alpha / (alpha + beta),
      mode: (alpha - 1) / (alpha + beta - 2),
      variance: (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1)),
      effectiveSampleSize,
      histogramData: this.generateBetaHistogram(alpha, beta),
    };
  }

  /**
   * Generate prior for time-to-event endpoint
   */
  private generateSurvivalPrior(results: any[], discounting: number): any {
    // Extract hazard ratios and confidence intervals
    const hazardRatios = results.filter(r => 'hazardRatio' in r).map(r => r.hazardRatio);
    const confidenceIntervals = results
      .filter(r => 'lowerCI' in r && 'upperCI' in r)
      .map(r => ({ lower: r.lowerCI, upper: r.upperCI }));

    if (hazardRatios.length === 0) {
      return null;
    }

    // Calculate log hazard ratio mean
    const logHrMean = hazardRatios.reduce((sum, hr) => sum + Math.log(hr), 0) / hazardRatios.length;

    // Calculate variance from confidence intervals if available
    let logHrVariance;
    if (confidenceIntervals.length > 0) {
      // Standard error can be estimated from CI width
      const logSEs = confidenceIntervals.map(ci => {
        const logWidth = Math.log(ci.upper) - Math.log(ci.lower);
        return logWidth / (2 * 1.96); // 95% CI = 1.96 * SE
      });

      logHrVariance = logSEs.reduce((sum, se) => sum + se * se, 0) / logSEs.length;
    } else {
      // Use variance of log hazard ratios if CIs not available
      const hrVariance =
        hazardRatios.reduce((sum, hr) => sum + (Math.log(hr) - logHrMean) ** 2, 0) /
        hazardRatios.length;
      logHrVariance = hrVariance * 1.5; // Conservative estimate
    }

    // Apply discounting to increase uncertainty
    const discountedVariance = logHrVariance / discounting;

    // For log-normal prior on hazard ratio
    return {
      distribution: 'log-normal',
      logMean: logHrMean,
      logVariance: discountedVariance,
      median: Math.exp(logHrMean),
      mean: Math.exp(logHrMean + discountedVariance / 2),
      mode: Math.exp(logHrMean - discountedVariance),
      histogramData: this.generateLogNormalHistogram(logHrMean, Math.sqrt(discountedVariance)),
    };
  }

  /**
   * Generate histogram data for normal distribution
   */
  private generateNormalHistogram(mean: number, sd: number): any[] {
    const bins = 30;
    const range = 4 * sd; // +/- 2 SD from mean
    const min = mean - range / 2;
    const max = mean + range / 2;
    const step = range / bins;

    const histogram = [];
    for (let i = 0; i < bins; i++) {
      const x = min + step * i + step / 2; // Center of bin
      const p = this.normalPDF(x, mean, sd);
      histogram.push({ x, y: p });
    }

    return histogram;
  }

  /**
   * Generate histogram data for beta distribution
   */
  private generateBetaHistogram(alpha: number, beta: number): any[] {
    const bins = 30;
    const min = 0;
    const max = 1;
    const step = (max - min) / bins;

    const histogram = [];
    for (let i = 0; i < bins; i++) {
      const x = min + step * i + step / 2; // Center of bin
      const p = this.betaPDF(x, alpha, beta);
      histogram.push({ x, y: p });
    }

    return histogram;
  }

  /**
   * Generate histogram data for log-normal distribution
   */
  private generateLogNormalHistogram(logMean: number, logSd: number): any[] {
    const bins = 30;
    const range = Math.exp(logMean + 2 * logSd) - Math.exp(logMean - 2 * logSd);
    const min = Math.max(0.01, Math.exp(logMean - 2 * logSd));
    const max = Math.exp(logMean + 2 * logSd);
    const step = (max - min) / bins;

    const histogram = [];
    for (let i = 0; i < bins; i++) {
      const x = min + step * i + step / 2; // Center of bin
      const p = this.logNormalPDF(x, logMean, logSd);
      histogram.push({ x, y: p });
    }

    return histogram;
  }

  /**
   * Normal probability density function
   */
  private normalPDF(x: number, mean: number, sd: number): number {
    return (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / sd, 2));
  }

  /**
   * Beta probability density function (approximation)
   */
  private betaPDF(x: number, alpha: number, beta: number): number {
    if (x <= 0 || x >= 1) return 0;

    // Approximation using logs to avoid overflow
    // log(p(x)) = log((x^(a-1) * (1-x)^(b-1)) / B(a,b))
    const logP =
      (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - this.logBeta(alpha, beta);

    return Math.exp(logP);
  }

  /**
   * Log of the beta function
   */
  private logBeta(alpha: number, beta: number): number {
    // log(B(a,b)) = log(Γ(a)) + log(Γ(b)) - log(Γ(a+b))
    return this.logGamma(alpha) + this.logGamma(beta) - this.logGamma(alpha + beta);
  }

  /**
   * Log of the gamma function (Lanczos approximation)
   */
  private logGamma(x: number): number {
    if (x <= 0) return Infinity;

    // Lanczos approximation constants
    const p = [
      676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];

    let g = 7;
    let a = 0.99999999999980993;
    for (let i = 0; i < p.length; i++) {
      a += p[i] / (x + i);
    }

    let t = x + g - 0.5;
    return Math.log(Math.sqrt(2 * Math.PI)) + Math.log(a) + (x - 0.5) * Math.log(t) - t;
  }

  /**
   * Log-normal probability density function
   */
  private logNormalPDF(x: number, logMean: number, logSd: number): number {
    if (x <= 0) return 0;

    return (
      (1 / (x * logSd * Math.sqrt(2 * Math.PI))) *
      Math.exp(-0.5 * Math.pow((Math.log(x) - logMean) / logSd, 2))
    );
  }

  /**
   * Generate forest plot data for a specified endpoint
   *
   * @param indication - Target indication
   * @param endpoint - Target endpoint
   * @param options - Additional options
   */
  async generateForestPlotData(
    indication: string,
    endpoint: string,
    options: {
      phase?: string;
      limit?: number;
      yearRange?: [number, number];
    } = {}
  ): Promise<any> {
    try {
      // Find relevant historical trials
      const historicalData = await this.findSimilarTrials(
        indication,
        options.phase || '',
        [endpoint],
        {
          limit: options.limit || 20,
          yearRange: options.yearRange,
        }
      );

      if (!historicalData.trials || historicalData.trials.length === 0) {
        return {
          success: false,
          error: 'No relevant historical data found',
        };
      }

      // Extract relevant data for forest plot
      const forestData: any[] = [];
      let endpointType = '';

      for (const trial of historicalData.trials) {
        // Look for the endpoint in primary and secondary results
        const primary = trial.extractedData?.endpointResults?.primary || {};
        const secondary = trial.extractedData?.endpointResults?.secondary || {};

        for (const [key, value] of Object.entries({ ...primary, ...secondary })) {
          if (
            key.toLowerCase().includes(endpoint.toLowerCase()) &&
            typeof value === 'object' &&
            value !== null
          ) {
            // Detect endpoint type if not already determined
            if (!endpointType) {
              if ('mean' in value) {
                endpointType = 'continuous';
              } else if ('proportion' in value || 'events' in value) {
                endpointType = 'binary';
              } else if ('hazardRatio' in value) {
                endpointType = 'time-to-event';
              }
            }

            // Create forest plot entry based on endpoint type
            switch (endpointType) {
              case 'continuous':
                if ('mean' in value && 'sd' in value) {
                  forestData.push({
                    study: trial.title,
                    year: trial.date?.split('-')[0] || 'Unknown',
                    sponsor: trial.sponsor,
                    phase: trial.phase,
                    sampleSize: trial.extractedData?.arms?.[0]?.estimatedSize || 0,
                    effect: value.mean,
                    lowerCI:
                      value.mean -
                      (1.96 * value.sd) /
                        Math.sqrt(trial.extractedData?.arms?.[0]?.estimatedSize || 10),
                    upperCI:
                      value.mean +
                      (1.96 * value.sd) /
                        Math.sqrt(trial.extractedData?.arms?.[0]?.estimatedSize || 10),
                    weight: 1,
                  });
                }
                break;

              case 'binary':
                if ('proportion' in value) {
                  const sampleSize = trial.extractedData?.arms?.[0]?.estimatedSize || 20;
                  const p = value.proportion;
                  const se = Math.sqrt((p * (1 - p)) / sampleSize);

                  forestData.push({
                    study: trial.title,
                    year: trial.date?.split('-')[0] || 'Unknown',
                    sponsor: trial.sponsor,
                    phase: trial.phase,
                    sampleSize,
                    effect: p,
                    lowerCI: Math.max(0, p - 1.96 * se),
                    upperCI: Math.min(1, p + 1.96 * se),
                    weight: 1,
                  });
                } else if ('events' in value && 'total' in value) {
                  const p = value.events / value.total;
                  const se = Math.sqrt((p * (1 - p)) / value.total);

                  forestData.push({
                    study: trial.title,
                    year: trial.date?.split('-')[0] || 'Unknown',
                    sponsor: trial.sponsor,
                    phase: trial.phase,
                    sampleSize: value.total,
                    effect: p,
                    lowerCI: Math.max(0, p - 1.96 * se),
                    upperCI: Math.min(1, p + 1.96 * se),
                    weight: 1,
                  });
                }
                break;

              case 'time-to-event':
                if ('hazardRatio' in value) {
                  forestData.push({
                    study: trial.title,
                    year: trial.date?.split('-')[0] || 'Unknown',
                    sponsor: trial.sponsor,
                    phase: trial.phase,
                    sampleSize: trial.extractedData?.arms?.[0]?.estimatedSize || 0,
                    effect: value.hazardRatio,
                    lowerCI: value.lowerCI || value.hazardRatio * 0.7, // Estimate if missing
                    upperCI: value.upperCI || value.hazardRatio * 1.4, // Estimate if missing
                    weight: 1,
                  });
                }
                break;
            }
          }
        }
      }

      if (forestData.length === 0) {
        return {
          success: false,
          error: 'No suitable data found for forest plot',
        };
      }

      // Calculate relative weights based on sample size
      const totalSampleSize = forestData.reduce((sum, d) => sum + d.sampleSize, 0);
      forestData.forEach(d => {
        d.weight = d.sampleSize / totalSampleSize;
      });

      // Meta-analyze if possible
      let metaAnalysis = null;
      if (forestData.length >= 3) {
        metaAnalysis = this.metaAnalyzeForestData(forestData, endpointType);
      }

      return {
        success: true,
        endpointType,
        data: forestData,
        metaAnalysis,
        totalTrials: forestData.length,
        endpoint,
      };
    } catch (error) {
      console.error('Error generating forest plot data:', error);
      return {
        success: false,
        error: 'Failed to generate forest plot data',
      };
    }
  }

  /**
   * Perform meta-analysis on forest plot data
   */
  private metaAnalyzeForestData(data: any[], endpointType: string): any {
    // Different meta-analysis approaches based on endpoint type
    switch (endpointType) {
      case 'continuous':
        return this.metaAnalyzeContinuous(data);
      case 'binary':
        return this.metaAnalyzeBinary(data);
      case 'time-to-event':
        return this.metaAnalyzeSurvival(data);
      default:
        return null;
    }
  }

  /**
   * Meta-analyze continuous outcomes
   */
  private metaAnalyzeContinuous(data: any[]): any {
    // Fixed effects meta-analysis
    const weights = data.map(d => 1 / ((d.upperCI - d.lowerCI) ** 2 / 16)); // Approx. from CI
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const weightedSum = data.reduce((sum, d, i) => sum + d.effect * weights[i], 0);
    const pooledEffect = weightedSum / totalWeight;

    // Standard error of pooled estimate
    const pooledSE = 1 / Math.sqrt(totalWeight);

    return {
      method: 'Fixed effects',
      pooledEffect,
      lowerCI: pooledEffect - 1.96 * pooledSE,
      upperCI: pooledEffect + 1.96 * pooledSE,
      heterogeneity: this.calculateI2(data, weights, pooledEffect),
    };
  }

  /**
   * Meta-analyze binary outcomes
   */
  private metaAnalyzeBinary(data: any[]): any {
    // Log odds meta-analysis
    const logOdds = data.map(d => {
      const p = d.effect;
      return Math.log(p / (1 - p));
    });

    const variances = data.map(d => {
      const p = d.effect;
      const n = d.sampleSize;
      return 1 / (n * p * (1 - p));
    });

    const weights = variances.map(v => 1 / v);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const weightedSum = logOdds.reduce((sum, lo, i) => sum + lo * weights[i], 0);
    const pooledLogOdds = weightedSum / totalWeight;

    // Convert back to proportion
    const pooledProportion = 1 / (1 + Math.exp(-pooledLogOdds));

    // Standard error of pooled log odds
    const pooledSE = 1 / Math.sqrt(totalWeight);

    // 95% CI for pooled proportion
    const lowerLogOdds = pooledLogOdds - 1.96 * pooledSE;
    const upperLogOdds = pooledLogOdds + 1.96 * pooledSE;

    const lowerProportion = 1 / (1 + Math.exp(-lowerLogOdds));
    const upperProportion = 1 / (1 + Math.exp(-upperLogOdds));

    return {
      method: 'Fixed effects (logit)',
      pooledEffect: pooledProportion,
      lowerCI: lowerProportion,
      upperCI: upperProportion,
      heterogeneity: this.calculateI2(data, weights, pooledLogOdds, logOdds),
    };
  }

  /**
   * Meta-analyze survival outcomes
   */
  private metaAnalyzeSurvival(data: any[]): any {
    // Log hazard ratio meta-analysis
    const logHRs = data.map(d => Math.log(d.effect));

    const variances = data.map(d => {
      const logUpperCI = Math.log(d.upperCI);
      const logLowerCI = Math.log(d.lowerCI);
      return ((logUpperCI - logLowerCI) / 3.92) ** 2; // 3.92 = 2 * 1.96
    });

    const weights = variances.map(v => 1 / v);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const weightedSum = logHRs.reduce((sum, lhr, i) => sum + lhr * weights[i], 0);
    const pooledLogHR = weightedSum / totalWeight;

    // Convert back to hazard ratio
    const pooledHR = Math.exp(pooledLogHR);

    // Standard error of pooled log HR
    const pooledSE = 1 / Math.sqrt(totalWeight);

    // 95% CI for pooled HR
    const lowerHR = Math.exp(pooledLogHR - 1.96 * pooledSE);
    const upperHR = Math.exp(pooledLogHR + 1.96 * pooledSE);

    return {
      method: 'Fixed effects (log HR)',
      pooledEffect: pooledHR,
      lowerCI: lowerHR,
      upperCI: upperHR,
      heterogeneity: this.calculateI2(data, weights, pooledLogHR, logHRs),
    };
  }

  /**
   * Calculate I² statistic for heterogeneity
   */
  private calculateI2(
    data: any[],
    weights: number[],
    pooledEffect: number,
    transformedEffects?: number[]
  ): any {
    // Cochran's Q statistic
    const effects = transformedEffects || data.map(d => d.effect);

    const Q = effects.reduce((sum, e, i) => {
      return sum + weights[i] * (e - pooledEffect) ** 2;
    }, 0);

    const df = data.length - 1;

    // I² = max(0, (Q - df) / Q * 100%)
    const i2 = Math.max(0, ((Q - df) / Q) * 100);

    return {
      Q,
      df,
      i2,
      pValue: this.chiSquarePValue(Q, df),
      heterogeneityLevel: i2 < 25 ? 'Low' : i2 < 50 ? 'Moderate' : 'High',
    };
  }

  /**
   * Chi-square p-value approximation
   */
  private chiSquarePValue(value: number, df: number): number {
    // Simple approximation for small df
    const x = value / 2;

    // For df = 1, approximation is 2 * (1 - normal CDF(sqrt(x)))
    if (df === 1) {
      return 2 * (1 - this.normalCDF(Math.sqrt(x)));
    }

    // For df = 2, approximation is exp(-x)
    if (df === 2) {
      return Math.exp(-x);
    }

    // For other df, use Wilson-Hilferty approximation
    const z = ((x / df) ** (1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
    return 1 - this.normalCDF(z);
  }

  /**
   * Normal cumulative distribution function
   */
  private normalCDF(x: number): number {
    // Approximation of normal CDF
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-(x * x) / 2);
    const p =
      d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  /**
   * Generate dropout patterns analysis
   *
   * @param indication - Target indication
   * @param phase - Trial phase
   */
  async analyzeDropoutPatterns(
    indication: string,
    phase: string,
    options: {
      limit?: number;
    } = {}
  ): Promise<any> {
    try {
      // Find relevant historical trials
      const historicalData = await this.findSimilarTrials(indication, phase, [], {
        limit: options.limit || 30,
      });

      if (!historicalData.trials || historicalData.trials.length === 0) {
        return {
          success: false,
          error: 'No relevant historical data found',
        };
      }

      // Extract dropout data
      const dropoutRates: number[] = [];
      const dropoutByReason: Record<string, number[]> = {};
      const dropoutPatternsByTrial: any[] = [];

      for (const trial of historicalData.trials) {
        const dropoutInfo = trial.extractedData?.dropoutPatterns;

        if (dropoutInfo && dropoutInfo.overall !== null) {
          dropoutRates.push(dropoutInfo.overall);

          // Collect reasons
          for (const [reason, rate] of Object.entries(dropoutInfo.byReason || {})) {
            if (!dropoutByReason[reason]) {
              dropoutByReason[reason] = [];
            }
            dropoutByReason[reason].push(rate as number);
          }

          // Add to trial-specific patterns
          dropoutPatternsByTrial.push({
            trial: trial.title,
            phase: trial.phase,
            sponsor: trial.sponsor,
            overall: dropoutInfo.overall,
            reasons: dropoutInfo.byReason,
            byTime: dropoutInfo.byTime,
          });
        }
      }

      if (dropoutRates.length === 0) {
        return {
          success: false,
          error: 'No dropout data found in matching trials',
        };
      }

      // Calculate summary statistics
      const meanDropout = dropoutRates.reduce((sum, r) => sum + r, 0) / dropoutRates.length;
      dropoutRates.sort((a, b) => a - b);
      const medianDropout =
        dropoutRates.length % 2 === 0
          ? (dropoutRates[dropoutRates.length / 2 - 1] + dropoutRates[dropoutRates.length / 2]) / 2
          : dropoutRates[Math.floor(dropoutRates.length / 2)];

      // Process reasons
      const commonReasons: any[] = [];
      for (const [reason, rates] of Object.entries(dropoutByReason)) {
        if (rates.length >= 2) {
          const meanRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
          commonReasons.push({
            reason,
            meanRate,
            proportion: meanRate / meanDropout,
            occurrences: rates.length,
          });
        }
      }

      // Sort by mean rate
      commonReasons.sort((a, b) => b.meanRate - a.meanRate);

      // Estimate a reasonable dropout rate for future trials
      const recommendedRate = Math.min(
        0.3, // Cap at 30%
        meanDropout * 1.2 // 20% buffer over mean
      );

      return {
        success: true,
        meanDropoutRate: meanDropout,
        medianDropoutRate: medianDropout,
        rangeDropoutRate: [dropoutRates[0], dropoutRates[dropoutRates.length - 1]],
        commonReasons,
        recommendedRate,
        trialSpecificData: dropoutPatternsByTrial,
        recommendationRationale: `Recommended dropout rate based on mean (${(meanDropout * 100).toFixed(1)}%) with 20% buffer to account for variability between trials, capped at 30%.`,
        trials: dropoutRates.length,
      };
    } catch (error) {
      console.error('Error analyzing dropout patterns:', error);
      return {
        success: false,
        error: 'Failed to analyze dropout patterns',
      };
    }
  }
}
