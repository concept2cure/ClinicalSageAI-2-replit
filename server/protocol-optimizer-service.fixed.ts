import { huggingFaceService } from './huggingface-service';
import { trialPredictorService } from './trial-predictor-service';
import { db } from './db';
import { csrReports, csrDetails } from '../shared/schema';
import { eq, like, and, desc, sql } from 'drizzle-orm';
import { ProtocolAnalyzerService } from './protocol-analyzer-service';

// Define these interfaces before the class
interface ProtocolData {
  phase: string;
  indication: string;
  sample_size: number;
  duration_weeks: number;
  endpoint_primary: string;
  [key: string]: any; // Allow for additional properties
}

interface BenchmarkData {
  avg_sample_size: number;
  avg_duration_weeks: number;
  [key: string]: any; // Allow for additional properties
}

interface OptimizationResult {
  recommendations: string[];
  improvedPrediction?: number;
  optimizedProtocol?: {
    sample_size?: number;
    duration_weeks?: number;
    [key: string]: any;
  };
  benchmarks?: BenchmarkData;
  error?: string;
}

interface FieldInsight {
  score: number;
  insights: string[];
}

interface DeepOptimizationResult {
  fieldLevelInsights: {
    endpoint: FieldInsight;
    design: FieldInsight;
    population: FieldInsight;
    duration: FieldInsight;
    [key: string]: any;
  };
  recommendations: string[];
  modelWeights: Record<string, number>;
  optimizedProtocol: any;
  improvedPrediction: number;
  sapRecommendations?: string[];
  error?: string;
}

/**
 * Protocol Optimizer Service
 *
 * This service provides recommendations for optimizing clinical trial protocols
 * based on historical data from Clinical Study Reports (CSRs) and machine learning predictions.
 */
class ProtocolOptimizerService {
  private protocolAnalyzerService: ProtocolAnalyzerService;

  constructor() {
    this.protocolAnalyzerService = new ProtocolAnalyzerService();
  }

  /**
   * Get optimization recommendations for a clinical trial protocol
   *
   * @param protocolData Protocol data including phase, indication, sample size, duration, endpoints
   * @param benchmarks Benchmark data for similar trials
   * @param prediction Current prediction score (0-1)
   * @returns Array of optimization recommendations
   */
  async getOptimizationRecommendations(
    protocolData: ProtocolData,
    benchmarks: BenchmarkData,
    prediction: number
  ): Promise<OptimizationResult> {
    try {
      // Collect relevant successful trials from the same indication and phase
      const similarSuccessfulTrials = await this.getSimilarSuccessfulTrials(
        protocolData.indication,
        protocolData.phase
      );

      // Generate recommendations based on the data
      return await this.generateRecommendations(
        protocolData,
        benchmarks,
        prediction,
        similarSuccessfulTrials
      );
    } catch (error) {
      console.error('Error generating optimization recommendations:', error);
      return {
        recommendations: [
          'Unable to generate optimization recommendations due to an error.',
          'Please check your protocol data and try again.',
        ],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get similar successful trials from the database
   *
   * @param indication The indication (therapeutic area)
   * @param phase The trial phase
   * @returns Array of successful trial data
   */
  private async getSimilarSuccessfulTrials(indication: string, phase: string): Promise<any[]> {
    try {
      const trials = await db
        .select()
        .from(csrReports)
        .where(
          and(
            like(csrReports.indication, `%${indication}%`),
            like(csrReports.phase, `%${phase}%`),
            eq(csrReports.status, 'Completed')
          )
        )
        .orderBy(desc(csrReports.uploadDate))
        .limit(15);

      return trials;
    } catch (error) {
      console.error('Error fetching similar successful trials:', error);
      return [];
    }
  }

  /**
   * Generate specific recommendations based on protocol data, benchmarks, and ML prediction
   *
   * @param protocolData Protocol data
   * @param benchmarks Benchmark data
   * @param prediction Current prediction score
   * @param similarTrials Similar successful trials
   * @returns Optimization recommendations and improved metrics
   */
  private async generateRecommendations(
    protocolData: ProtocolData,
    benchmarks: BenchmarkData,
    prediction: number,
    similarTrials: any[]
  ): Promise<OptimizationResult> {
    const recommendations: string[] = [];
    let improvedPrediction = prediction;

    // Sample size optimization
    if (protocolData.sample_size < benchmarks.avg_sample_size * 0.8) {
      const recommendedSampleSize = Math.round(benchmarks.avg_sample_size);
      recommendations.push(
        `Increase sample size from ${protocolData.sample_size} to at least ${recommendedSampleSize} to align with successful trials (avg: ${benchmarks.avg_sample_size}).`
      );
      improvedPrediction += 0.05; // Estimate improvement in prediction
    }

    // Trial duration optimization
    const avgDuration = benchmarks.avg_duration_weeks;
    if (protocolData.duration_weeks > avgDuration * 1.5) {
      recommendations.push(
        `Consider reducing trial duration from ${protocolData.duration_weeks} to ${Math.round(avgDuration)} weeks to improve completion rates and reduce dropout.`
      );
      improvedPrediction += 0.03;
    } else if (protocolData.duration_weeks < avgDuration * 0.6) {
      recommendations.push(
        `Consider extending trial duration from ${protocolData.duration_weeks} to at least ${Math.round(avgDuration * 0.7)} weeks to ensure adequate follow-up for ${protocolData.endpoint_primary}.`
      );
      improvedPrediction += 0.02;
    }

    // Use HuggingFace for more sophisticated endpoint recommendations
    try {
      const endpointRecommendations = await this.getEndpointRecommendations(
        protocolData.indication,
        protocolData.phase,
        protocolData.endpoint_primary
      );

      if (endpointRecommendations && endpointRecommendations.length > 0) {
        recommendations.push(...endpointRecommendations);
        improvedPrediction += 0.04;
      }
    } catch (error) {
      console.error('Error getting endpoint recommendations from HuggingFace:', error);
      // Fallback recommendation for endpoints
      recommendations.push(
        `Ensure ${protocolData.endpoint_primary} definition aligns with FDA guidelines for ${protocolData.indication} clinical trials.`
      );
    }

    // If prediction is still below threshold, add more specific recommendations
    if (improvedPrediction < 0.8) {
      recommendations.push(
        `Consider adding secondary endpoints that have shown correlation with ${protocolData.endpoint_primary} in recent successful trials.`
      );
      recommendations.push(
        `Implement stratified randomization based on key prognostic factors for ${protocolData.indication}.`
      );
    }

    // Additional optimization for Phase 2/3 trials
    if (protocolData.phase.includes('2') || protocolData.phase.includes('3')) {
      recommendations.push(
        `Consider implementing an adaptive design with sample size re-estimation to optimize resource allocation.`
      );
    }

    // Format and clean recommendations
    const uniqueRecommendations = [...new Set(recommendations)].map(rec =>
      rec.trim().replace(/\s+/g, ' ')
    );

    return {
      recommendations: uniqueRecommendations,
      improvedPrediction: Math.min(0.95, improvedPrediction), // Cap at 0.95
      optimizedProtocol: {
        sample_size:
          protocolData.sample_size < benchmarks.avg_sample_size * 0.8
            ? Math.round(benchmarks.avg_sample_size)
            : protocolData.sample_size,
        duration_weeks:
          protocolData.duration_weeks > avgDuration * 1.5
            ? Math.round(avgDuration)
            : protocolData.duration_weeks,
      },
      benchmarks,
    };
  }

  /**
   * Get endpoint-specific recommendations using HuggingFace
   *
   * @param indication Trial indication
   * @param phase Trial phase
   * @param primaryEndpoint Primary endpoint
   * @returns Array of endpoint-specific recommendations
   */
  private async getEndpointRecommendations(
    indication: string,
    phase: string,
    primaryEndpoint: string
  ): Promise<string[]> {
    try {
      const prompt = `
        As a clinical trial design expert, analyze the following clinical trial primary endpoint and provide specific optimization recommendations:
        
        Indication: ${indication}
        Phase: ${phase}
        Primary Endpoint: ${primaryEndpoint}
        
        Provide 2-3 specific, concise recommendations for optimizing this endpoint definition or measurement to increase trial success probability. Focus on:
        1. Statistical analysis plan recommendations
        2. Endpoint definition refinements
        3. Measurement timing optimization
        
        Format each recommendation as a single, concise sentence. No introduction or conclusion needed.
      `;

      const response = await huggingFaceService.queryHuggingFace(prompt);

      if (!response) {
        return [];
      }

      // Process the response to extract specific recommendations
      const lines = response
        .split('\n')
        .filter(line => line.trim().length > 0)
        .filter(line => !line.includes('recommendation') && !line.includes('Recommendation'))
        .map(line => line.replace(/^\d+\.\s+/, '').trim())
        .filter(line => line.length > 20 && line.length < 150);

      return lines.slice(0, 3); // Return up to 3 recommendations
    } catch (error) {
      console.error('Error getting endpoint recommendations:', error);
      return [];
    }
  }

  /**
   * Get benchmark data for a given indication and phase
   *
   * @param indication Trial indication
   * @param phase Trial phase
   * @returns Benchmark data for similar trials
   */
  async getBenchmarkData(indication: string, phase: string): Promise<BenchmarkData> {
    try {
      // Get similar trials
      const similarTrials = await db
        .select({
          sample_size: csrReports.sampleSize,
          duration_weeks: csrReports.durationWeeks,
          status: csrReports.status,
        })
        .from(csrReports)
        .where(
          and(like(csrReports.indication, `%${indication}%`), like(csrReports.phase, `%${phase}%`))
        );

      // Calculate averages
      const succeededTrials = similarTrials.filter(
        trial => trial.status === 'Completed' || trial.status === 'Successful'
      );

      const validSampleSizes = succeededTrials
        .map(trial => trial.sample_size)
        .filter(size => size !== null && size > 0) as number[];

      const validDurations = succeededTrials
        .map(trial => trial.duration_weeks)
        .filter(duration => duration !== null && duration > 0) as number[];

      const avgSampleSize =
        validSampleSizes.length > 0
          ? validSampleSizes.reduce((sum, size) => sum + size, 0) / validSampleSizes.length
          : 100; // Default if no data

      const avgDuration =
        validDurations.length > 0
          ? validDurations.reduce((sum, duration) => sum + duration, 0) / validDurations.length
          : 24; // Default if no data

      // Calculate standard deviations
      const sampleSizeStdDev = this.calculateStdDev(validSampleSizes, avgSampleSize);
      const durationStdDev = this.calculateStdDev(validDurations, avgDuration);

      // Get additional detail statistics from trial details
      const successRates = await this.getSuccessRates(indication, phase);
      const endpointMetrics = await this.getEndpointMetrics(indication, phase);

      return {
        avg_sample_size: avgSampleSize,
        avg_duration_weeks: avgDuration,
        sample_size_stddev: sampleSizeStdDev,
        duration_stddev: durationStdDev,
        total_trials: similarTrials.length,
        successful_trials: succeededTrials.length,
        success_rate: similarTrials.length > 0 ? succeededTrials.length / similarTrials.length : 0,
        ...successRates,
        ...endpointMetrics,
      };
    } catch (error) {
      console.error('Error getting benchmark data:', error);
      return {
        avg_sample_size: 100,
        avg_duration_weeks: 24,
        sample_size_stddev: 0,
        duration_stddev: 0,
        total_trials: 0,
        successful_trials: 0,
        success_rate: 0,
      };
    }
  }

  /**
   * Calculate standard deviation for a set of numbers
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;

    const variance =
      values.reduce((sum, value) => {
        const diff = value - mean;
        return sum + diff * diff;
      }, 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Get success rates by study design features
   */
  private async getSuccessRates(indication: string, phase: string): Promise<any> {
    try {
      // Get design-specific success rates by joining with details
      const detailsQuery = await db
        .select({
          blinding: csrDetails.blinding,
          randomization: csrDetails.randomization,
          status: csrReports.status,
        })
        .from(csrReports)
        .leftJoin(csrDetails, eq(csrReports.id, csrDetails.reportId))
        .where(
          and(like(csrReports.indication, `%${indication}%`), like(csrReports.phase, `%${phase}%`))
        );

      // Process data to get success rates by feature
      const blindingStats = this.calculateFeatureSuccessRates(detailsQuery, 'blinding');

      const randomizationStats = this.calculateFeatureSuccessRates(detailsQuery, 'randomization');

      return {
        blinding_success_rates: blindingStats,
        randomization_success_rates: randomizationStats,
      };
    } catch (error) {
      console.error('Error getting success rates:', error);
      return {
        blinding_success_rates: {},
        randomization_success_rates: {},
      };
    }
  }

  /**
   * Calculate success rates for a specific feature
   */
  private calculateFeatureSuccessRates(data: any[], featureKey: string): Record<string, number> {
    const result: Record<string, { total: number; success: number }> = {};

    // Group by feature value
    data.forEach(item => {
      const featureValue = item[featureKey] || 'Unknown';
      if (!result[featureValue]) {
        result[featureValue] = { total: 0, success: 0 };
      }

      result[featureValue].total++;
      if (item.status === 'Completed' || item.status === 'Successful') {
        result[featureValue].success++;
      }
    });

    // Calculate rates
    const rates: Record<string, number> = {};
    Object.entries(result).forEach(([key, { total, success }]) => {
      rates[key] = total > 0 ? success / total : 0;
    });

    return rates;
  }

  /**
   * Get endpoint-related metrics from similar trials
   */
  private async getEndpointMetrics(indication: string, phase: string): Promise<any> {
    try {
      // Get endpoint data from successful trials
      const endpointData = await db
        .select({
          primary_objective: csrDetails.primaryObjective,
          patient_reported: csrDetails.patientReportedOutcome,
          biomarker_used: csrDetails.biomarkerUsed,
          results: csrDetails.results,
        })
        .from(csrReports)
        .leftJoin(csrDetails, eq(csrReports.id, csrDetails.reportId))
        .where(
          and(
            like(csrReports.indication, `%${indication}%`),
            like(csrReports.phase, `%${phase}%`),
            eq(csrReports.status, 'Completed')
          )
        );

      // Analyze what percentage of successful trials use patient-reported outcomes
      const totalSuccessful = endpointData.length;
      const patientReportedCount = endpointData.filter(
        data => data.patient_reported === 'Yes'
      ).length;

      const biomarkerCount = endpointData.filter(data => data.biomarker_used === 'Yes').length;

      return {
        patient_reported_outcome_rate:
          totalSuccessful > 0 ? patientReportedCount / totalSuccessful : 0,
        biomarker_usage_rate: totalSuccessful > 0 ? biomarkerCount / totalSuccessful : 0,
        endpoint_count: totalSuccessful,
      };
    } catch (error) {
      console.error('Error getting endpoint metrics:', error);
      return {
        patient_reported_outcome_rate: 0,
        biomarker_usage_rate: 0,
        endpoint_count: 0,
      };
    }
  }

  /**
   * Get deep optimization recommendations for a clinical trial protocol
   *
   * @param protocolData Protocol data
   * @param benchmarks Benchmark data for similar trials
   * @param prediction Current prediction score
   * @returns Detailed optimization recommendations with field-level insights
   */
  async getDeepOptimizationRecommendations(
    protocolData: ProtocolData,
    benchmarks: BenchmarkData,
    prediction: number
  ): Promise<DeepOptimizationResult> {
    try {
      // Analyze each protocol component/field
      const endpointInsight = await this.analyzeEndpointQuality(
        protocolData.endpoint_primary,
        protocolData.indication,
        protocolData.phase
      );

      const designInsight = await this.analyzeStudyDesign(protocolData, benchmarks);

      const populationInsight = await this.analyzePatientPopulation(protocolData, benchmarks);

      const durationInsight = this.analyzeDuration(protocolData, benchmarks);

      // Get field importance weights
      const fieldWeights = await this.getFieldImportance();

      // Get SAP recommendations if available
      const sapRecommendations = await this.getSapRecommendations(
        protocolData.indication,
        protocolData.phase,
        prediction
      );

      // Compile field-level insights
      const fieldInsights = {
        endpoint: endpointInsight,
        design: designInsight,
        population: populationInsight,
        duration: durationInsight,
      };

      // Generate comprehensive optimization recommendations
      const recommendations = await this.generateDeepRecommendations(
        fieldInsights,
        protocolData,
        benchmarks,
        prediction
      );

      // Create optimized protocol
      const optimizedProtocol = this.generateOptimizedProtocol(
        protocolData,
        fieldInsights,
        benchmarks
      );

      // Estimate improved prediction
      const improvedPrediction = this.estimateImprovedPrediction(
        prediction,
        protocolData,
        optimizedProtocol,
        fieldInsights
      );

      return {
        fieldLevelInsights: fieldInsights,
        recommendations,
        modelWeights: fieldWeights,
        optimizedProtocol,
        improvedPrediction,
        sapRecommendations,
      };
    } catch (error) {
      console.error('Error generating deep optimization recommendations:', error);
      return {
        fieldLevelInsights: {
          endpoint: { score: 0, insights: [] },
          design: { score: 0, insights: [] },
          population: { score: 0, insights: [] },
          duration: { score: 0, insights: [] },
        },
        recommendations: [
          'Unable to generate detailed optimization recommendations due to an error.',
          'Please check your protocol data and try again.',
        ],
        modelWeights: {},
        optimizedProtocol: protocolData,
        improvedPrediction: prediction,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Analyze the quality of endpoint definitions
   */
  private async analyzeEndpointQuality(
    primaryEndpoint: string,
    indication: string,
    phase: string
  ): Promise<FieldInsight> {
    try {
      // Start with baseline score
      let score = 0.5;
      const insights: string[] = [];

      // Check if endpoint is empty or too short
      if (!primaryEndpoint || primaryEndpoint.length < 10) {
        return {
          score: 0.1,
          insights: [
            'Primary endpoint is not adequately defined.',
            'Detailed endpoint definition is required for proper protocol evaluation.',
          ],
        };
      }

      // Analyze specificity and clarity
      if (primaryEndpoint.length > 30) {
        score += 0.1;
      }

      // Check for specific keywords that indicate quality
      const qualityIndicators = [
        'change from baseline',
        'compared to placebo',
        'statistical significance',
        'p-value',
        'confidence interval',
        'mean',
        'median',
        'reduction',
        'improvement',
      ];

      let qualityMatches = 0;
      qualityIndicators.forEach(indicator => {
        if (primaryEndpoint.toLowerCase().includes(indicator.toLowerCase())) {
          qualityMatches++;
        }
      });

      score += qualityMatches * 0.05;

      // Check for timeframe specification
      const timeframeIndicators = ['week', 'month', 'day', 'hour', 'year'];
      let hasTimeframe = false;

      timeframeIndicators.forEach(indicator => {
        if (primaryEndpoint.toLowerCase().includes(indicator.toLowerCase())) {
          hasTimeframe = true;
        }
      });

      if (hasTimeframe) {
        score += 0.1;
      } else {
        insights.push(
          "Add specific timeframe for primary endpoint assessment (e.g., 'at week 12')."
        );
      }

      // Check if the endpoint contains measurement method
      const measurementMethods = [
        'scale',
        'score',
        'index',
        'questionnaire',
        'assessment',
        'imaging',
        'biomarker',
        'laboratory',
        'test',
      ];

      let hasMeasurement = false;
      measurementMethods.forEach(method => {
        if (primaryEndpoint.toLowerCase().includes(method.toLowerCase())) {
          hasMeasurement = true;
        }
      });

      if (hasMeasurement) {
        score += 0.1;
      } else {
        insights.push('Specify measurement method or assessment tool for the primary endpoint.');
      }

      // Generate AI-powered insights using Hugging Face
      try {
        const prompt = `
          As a clinical trial endpoint expert for ${indication} studies, analyze this Phase ${phase} primary endpoint:
          "${primaryEndpoint}"
          
          What specific improvements would make this endpoint definition stronger? 
          List 2-3 specific, actionable recommendations to improve endpoint clarity, specificity, and statistical power.
          Each recommendation should be a single sentence. No introduction or explanation needed.
        `;

        const response = await huggingFaceService.queryHuggingFace(prompt);

        if (response) {
          const aiInsights = response
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.replace(/^\d+\.\s+/, '').trim())
            .filter(line => line.length > 10 && line.length < 150)
            .slice(0, 3);

          insights.push(...aiInsights);
        }
      } catch (error) {
        console.error('Error getting AI insights for endpoint analysis:', error);
        // Add generic insights if AI fails
        insights.push(
          'Consider adding more specificity to endpoint measurement methodology.',
          'Ensure statistical analysis approach is clearly defined for the primary endpoint.'
        );
      }

      // Cap score between 0 and 1
      score = Math.min(1.0, Math.max(0.1, score));

      return {
        score,
        insights: insights.slice(0, 5), // Limit to top 5 insights
      };
    } catch (error) {
      console.error('Error analyzing endpoint quality:', error);
      return {
        score: 0.5,
        insights: [
          'Unable to fully analyze endpoint definition.',
          'Ensure endpoint is clearly defined with measurement method and timeframe.',
        ],
      };
    }
  }

  /**
   * Analyze study design elements
   */
  private async analyzeStudyDesign(
    protocolData: ProtocolData,
    benchmarks: BenchmarkData
  ): Promise<FieldInsight> {
    try {
      let score = 0.5;
      const insights: string[] = [];

      // Check for key design elements
      if (!protocolData.randomization || protocolData.randomization === 'Not specified') {
        score -= 0.15;
        insights.push(
          'Add randomization details to strengthen study design (recommendation: use stratified randomization).'
        );
      } else if (protocolData.randomization.toLowerCase().includes('stratified')) {
        score += 0.1;
      }

      if (!protocolData.blinding || protocolData.blinding === 'Not specified') {
        score -= 0.15;

        // Phase-appropriate blinding recommendation
        if (protocolData.phase.includes('2') || protocolData.phase.includes('3')) {
          insights.push('Implement double-blinding to reduce bias in efficacy assessments.');
        } else {
          insights.push('Consider at least single-blinding for outcome assessors to reduce bias.');
        }
      } else if (protocolData.blinding.toLowerCase().includes('double')) {
        score += 0.1;
      }

      // Check control group
      if (!protocolData.control_group || protocolData.control_group === 'None') {
        score -= 0.1;
        insights.push(
          'Add a control group (placebo or active comparator) to strengthen study design.'
        );
      } else if (protocolData.control_group.toLowerCase().includes('active')) {
        score += 0.1;
      }

      // Check design appropriate for phase
      if (protocolData.phase.includes('3') && !protocolData.multicenter) {
        score -= 0.1;
        insights.push(
          'Consider multi-center design for Phase 3 study to enhance generalizability.'
        );
      }

      // Use success rate data from benchmarks
      if (benchmarks.blinding_success_rates) {
        const blindingRates = benchmarks.blinding_success_rates;
        let bestBlinding = '';
        let bestRate = 0;

        for (const [type, rate] of Object.entries(blindingRates)) {
          if (rate > bestRate && type !== 'Unknown' && type !== 'None') {
            bestRate = rate;
            bestBlinding = type;
          }
        }

        if (bestBlinding && bestRate > 0.6) {
          insights.push(
            `Consider "${bestBlinding}" design which has shown ${Math.round(bestRate * 100)}% success rate in similar trials.`
          );
        }
      }

      // Check for adaptive design elements for larger trials
      if (protocolData.sample_size > 100 && !protocolData.adaptive_design) {
        insights.push(
          'Consider incorporating adaptive design elements for more efficient resource utilization.'
        );
      }

      // Cap score between 0 and 1
      score = Math.min(1.0, Math.max(0.1, score));

      return {
        score,
        insights: insights.slice(0, 5), // Limit to top 5 insights
      };
    } catch (error) {
      console.error('Error analyzing study design:', error);
      return {
        score: 0.5,
        insights: [
          'Ensure study includes appropriate randomization and blinding.',
          'Consider control group selection carefully based on research question.',
        ],
      };
    }
  }

  /**
   * Analyze patient population and inclusion/exclusion
   */
  private async analyzePatientPopulation(
    protocolData: ProtocolData,
    benchmarks: BenchmarkData
  ): Promise<FieldInsight> {
    try {
      let score = 0.5;
      const insights: string[] = [];

      // Check inclusion/exclusion criteria
      if (!protocolData.inclusion_criteria || protocolData.inclusion_criteria.length < 50) {
        score -= 0.2;
        insights.push(
          'Define inclusion criteria more comprehensively to ensure appropriate patient selection.'
        );
      }

      if (!protocolData.exclusion_criteria || protocolData.exclusion_criteria.length < 50) {
        score -= 0.2;
        insights.push(
          'Define exclusion criteria more comprehensively to reduce protocol deviations and dropouts.'
        );
      }

      // Check age range
      if (!protocolData.age_range || protocolData.age_range === 'Not specified') {
        score -= 0.1;
        insights.push('Specify appropriate age range for study population.');
      }

      // Check demographic diversity
      if (!protocolData.demographics_plan) {
        score -= 0.1;
        insights.push(
          'Include plan for demographic diversity and representation in enrollment strategy.'
        );
      }

      // Use HuggingFace for indication-specific population insights
      try {
        const prompt = `
          As a clinical trial design expert for ${protocolData.indication} studies, what are the 2-3 most important patient population considerations for a Phase ${protocolData.phase} trial?
          
          Focus on specific inclusion/exclusion criteria that impact trial success.
          Each recommendation should be a single, specific sentence. No introduction or explanation needed.
        `;

        const response = await huggingFaceService.queryHuggingFace(prompt);

        if (response) {
          const aiInsights = response
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.replace(/^\d+\.\s+/, '').trim())
            .filter(line => line.length > 10 && line.length < 150)
            .slice(0, 3);

          insights.push(...aiInsights);
        }
      } catch (error) {
        console.error('Error getting AI insights for population analysis:', error);
        // Add generic insights
        insights.push(
          'Define target population based on disease severity appropriate for study phase.',
          'Consider stratifying for key prognostic factors to improve statistical efficiency.'
        );
      }

      // Cap score between 0 and 1
      score = Math.min(1.0, Math.max(0.1, score));

      return {
        score,
        insights: insights.slice(0, 5), // Limit to top 5 insights
      };
    } catch (error) {
      console.error('Error analyzing patient population:', error);
      return {
        score: 0.5,
        insights: [
          'Clearly define inclusion and exclusion criteria.',
          'Consider targeted enrollment strategies for efficiency.',
        ],
      };
    }
  }

  /**
   * Analyze trial duration
   */
  private analyzeDuration(protocolData: ProtocolData, benchmarks: BenchmarkData): FieldInsight {
    try {
      let score = 0.5;
      const insights: string[] = [];

      const duration = protocolData.duration_weeks;
      const avgDuration = benchmarks.avg_duration_weeks;
      const stdDev = benchmarks.duration_stddev || avgDuration * 0.3; // Default if not available

      // Check if duration is within reasonable range of average
      if (Math.abs(duration - avgDuration) <= stdDev) {
        score += 0.2;
      } else if (duration > avgDuration + stdDev * 2) {
        score -= 0.2;
        insights.push(
          `Consider reducing trial duration from ${duration} to ${Math.round(avgDuration)} weeks (average for similar trials) to improve completion rates.`
        );
      } else if (duration < avgDuration - stdDev) {
        score -= 0.1;
        insights.push(
          `Consider extending trial duration from ${duration} to at least ${Math.round(avgDuration - stdDev)} weeks to ensure adequate endpoint assessment.`
        );
      }

      // Check if duration is appropriate for the endpoint
      if (protocolData.endpoint_primary.toLowerCase().includes('survival') && duration < 52) {
        score -= 0.2;
        insights.push(
          'Extend trial duration for survival endpoint assessment to at least 52 weeks.'
        );
      }

      if (protocolData.endpoint_primary.toLowerCase().includes('progression') && duration < 24) {
        score -= 0.2;
        insights.push(
          'Extend trial duration for progression endpoint assessment to at least 24 weeks.'
        );
      }

      // Check for follow-up period
      if (!protocolData.follow_up_period) {
        score -= 0.1;
        insights.push(
          'Add an appropriate follow-up period to capture delayed treatment effects and safety outcomes.'
        );
      }

      // Add generic insights if needed
      if (insights.length < 2) {
        insights.push(
          'Ensure trial duration aligns with the timing needed to observe clinically meaningful changes in the primary endpoint.',
          'Consider interim analyses to potentially shorten trial if strong effects are observed early.'
        );
      }

      // Cap score between 0 and 1
      score = Math.min(1.0, Math.max(0.1, score));

      return {
        score,
        insights: insights.slice(0, 5), // Limit to top 5 insights
      };
    } catch (error) {
      console.error('Error analyzing trial duration:', error);
      return {
        score: 0.5,
        insights: [
          'Set trial duration based on time needed to observe clinically meaningful effects.',
          'Consider relevant historical data on time-to-event for this condition.',
        ],
      };
    }
  }

  /**
   * Generate comprehensive recommendations based on field insights
   */
  private async generateDeepRecommendations(
    fieldInsights: {
      endpoint: FieldInsight;
      design: FieldInsight;
      population: FieldInsight;
      duration: FieldInsight;
    },
    protocolData: ProtocolData,
    benchmarks: BenchmarkData,
    prediction: number
  ): Promise<string[]> {
    // Combine insights from all fields
    const allInsights: string[] = [
      ...fieldInsights.endpoint.insights,
      ...fieldInsights.design.insights,
      ...fieldInsights.population.insights,
      ...fieldInsights.duration.insights,
    ];

    // Prioritize insights based on field scores (lowest scores get higher priority)
    const priorityMap = new Map<string, number>();
    for (const insight of fieldInsights.endpoint.insights) {
      priorityMap.set(insight, 1 - fieldInsights.endpoint.score);
    }

    for (const insight of fieldInsights.design.insights) {
      priorityMap.set(insight, 1 - fieldInsights.design.score);
    }

    for (const insight of fieldInsights.population.insights) {
      priorityMap.set(insight, 1 - fieldInsights.population.score);
    }

    for (const insight of fieldInsights.duration.insights) {
      priorityMap.set(insight, 1 - fieldInsights.duration.score);
    }

    // Sort insights by priority
    const prioritizedInsights = [...priorityMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    // If prediction is already high, add different types of recommendations
    if (prediction > 0.8) {
      prioritizedInsights.push(
        'Consider adding exploratory endpoints to gain additional insights for future trials.'
      );

      prioritizedInsights.push(
        'Implement enhanced data quality monitoring procedures to maintain high-quality data collection.'
      );
    }

    // Get unique recommendations and format them
    const uniqueRecommendations = [...new Set(prioritizedInsights)]
      .filter(rec => rec.trim().length > 0)
      .map(rec => rec.trim().replace(/\s+/g, ' '));

    return uniqueRecommendations.slice(0, 8); // Limit to top 8 recommendations
  }

  /**
   * Get relative importance of different protocol fields
   */
  private async getFieldImportance(): Promise<Record<string, number>> {
    // This could be determined by machine learning models later
    // Currently using fixed weights based on domain knowledge
    return {
      endpoint: 0.3,
      design: 0.25,
      population: 0.25,
      duration: 0.2,
    };
  }

  /**
   * Get statistical analysis plan recommendations
   */
  private async getSapRecommendations(
    indication: string,
    phase: string,
    prediction: number
  ): Promise<string[]> {
    try {
      const prompt = `
        As a statistical expert in ${indication} clinical trials, provide 3 specific recommendations 
        for the statistical analysis plan (SAP) of a Phase ${phase} study.
        Focus on analysis population definitions, handling of missing data, and sensitivity analyses.
        Each recommendation should be a single, specific sentence. No explanations needed.
      `;

      const response = await huggingFaceService.queryHuggingFace(prompt);

      if (response) {
        return response
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => line.replace(/^\d+\.\s+/, '').trim())
          .filter(line => line.length > 10 && line.length < 150)
          .slice(0, 3);
      }

      return [
        'Define intention-to-treat (ITT) and per-protocol populations clearly in the SAP.',
        'Specify multiple imputation approach for handling missing data.',
        'Include sensitivity analyses to assess robustness of primary findings.',
      ];
    } catch (error) {
      console.error('Error getting SAP recommendations:', error);
      return [
        'Define intention-to-treat (ITT) and per-protocol populations clearly in the SAP.',
        'Specify multiple imputation approach for handling missing data.',
        'Include sensitivity analyses to assess robustness of primary findings.',
      ];
    }
  }

  /**
   * Generate optimized protocol based on insights
   */
  private generateOptimizedProtocol(
    originalProtocol: any,
    fieldInsights: any,
    benchmarks: BenchmarkData
  ): any {
    const optimizedProtocol = { ...originalProtocol };

    // Optimize sample size if needed
    if (originalProtocol.sample_size < benchmarks.avg_sample_size * 0.8) {
      optimizedProtocol.sample_size = Math.round(benchmarks.avg_sample_size);
    }

    // Optimize duration if needed
    const durationInsight = fieldInsights.duration;
    if (durationInsight.score < 0.6) {
      optimizedProtocol.duration_weeks = Math.round(benchmarks.avg_duration_weeks);
    }

    // Add blinding if missing
    if (!originalProtocol.blinding || originalProtocol.blinding === 'Not specified') {
      // Default to double-blind for phase 2/3
      if (originalProtocol.phase.includes('2') || originalProtocol.phase.includes('3')) {
        optimizedProtocol.blinding = 'Double-blind';
      } else {
        optimizedProtocol.blinding = 'Single-blind';
      }
    }

    // Add randomization if missing
    if (!originalProtocol.randomization || originalProtocol.randomization === 'Not specified') {
      optimizedProtocol.randomization = 'Stratified randomization';
    }

    // Enhanced primary endpoint if score is low
    if (fieldInsights.endpoint.score < 0.6 && originalProtocol.primary_endpoint) {
      // Enhance the endpoint definition with timing and measurement
      let enhancedEndpoint = originalProtocol.primary_endpoint;

      // Add timeframe if missing
      if (!/week|month|day|hour|year/i.test(enhancedEndpoint)) {
        enhancedEndpoint += ` at ${Math.round(benchmarks.avg_duration_weeks)} weeks`;
      }

      // Add statistical basis if missing
      if (!/mean|median|percentage|proportion|statistical/i.test(enhancedEndpoint)) {
        enhancedEndpoint += ` (change from baseline, assessed by ANOVA)`;
      }

      optimizedProtocol.primary_endpoint = enhancedEndpoint;
    }

    return optimizedProtocol;
  }

  /**
   * Estimate improved prediction score based on optimizations
   */
  private estimateImprovedPrediction(
    currentPrediction: number,
    originalProtocol: any,
    optimizedProtocol: any,
    fieldInsights: any
  ): number {
    let improvementFactor = 0;

    // Sample size improvement
    if (optimizedProtocol.sample_size > originalProtocol.sample_size) {
      const percentIncrease =
        (optimizedProtocol.sample_size - originalProtocol.sample_size) /
        originalProtocol.sample_size;
      improvementFactor += percentIncrease * 0.1; // Up to 10% improvement for sample size
    }

    // Duration optimization
    if (optimizedProtocol.duration_weeks !== originalProtocol.duration_weeks) {
      improvementFactor += 0.05;
    }

    // Design improvements (blinding, randomization)
    if (optimizedProtocol.blinding !== originalProtocol.blinding) {
      improvementFactor += 0.07;
    }

    if (optimizedProtocol.randomization !== originalProtocol.randomization) {
      improvementFactor += 0.05;
    }

    // Endpoint improvement
    if (optimizedProtocol.primary_endpoint !== originalProtocol.primary_endpoint) {
      improvementFactor += 0.08;
    }

    // Field insights contribute to overall improvement
    const averageFieldScore =
      (fieldInsights.endpoint.score +
        fieldInsights.design.score +
        fieldInsights.population.score +
        fieldInsights.duration.score) /
      4;

    // Low scores mean more room for improvement
    if (averageFieldScore < 0.5) {
      improvementFactor += 0.1;
    } else if (averageFieldScore < 0.7) {
      improvementFactor += 0.05;
    }

    // Calculate final prediction with diminishing returns for already high predictions
    let improvedPrediction = currentPrediction + (1 - currentPrediction) * improvementFactor;

    // Cap at 95% to avoid overpromising
    return Math.min(0.95, improvedPrediction);
  }
}

// Export a single instance of the service
export const protocolOptimizerService = new ProtocolOptimizerService();
