import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { db } from './db';
import { strategicReports, protocols } from 'shared/schema';
import { eq } from 'drizzle-orm';
import { StatisticsService } from './statistics-service';

type InsertStrategicReport = typeof strategicReports.$inferInsert;

// Create an instance of the statistics service
const statisticsService = new StatisticsService();

const execPromise = promisify(exec);

/**
 * Strategic Report Generator leverages the ML models and statistical analysis
 * to create comprehensive strategic intelligence reports
 */
export class StrategicReportGenerator {
  private modelDir = path.join(process.cwd(), 'models');
  private dataDir = path.join(process.cwd(), 'data');

  /**
   * Generate a complete strategic report based on protocol data
   */
  async generateReport(
    protocolId: number,
    indication: string,
    phase: string,
    primaryEndpoints: string[],
    sampleSize: number,
    duration: number,
    controlType: string,
    blinding: string
  ): Promise<number> {
    console.log(
      `Generating strategic report for protocol ${protocolId} (${indication}, Phase ${phase})`
    );

    try {
      if (!db) {
        throw new Error('Database connection unavailable');
      }

      const [protocol] = await db
        .select({
          organizationId: protocols.organizationId,
          clientWorkspaceId: protocols.clientWorkspaceId,
        })
        .from(protocols)
        .where(eq(protocols.id, protocolId));

      if (!protocol) {
        throw new Error(`Protocol ${protocolId} not found`);
      }

      // 1. Gather historical benchmarking data
      const benchmarkData = await this.getHistoricalBenchmarks(indication, phase);

      // 2. Analyze endpoints compared to similar trials
      const endpointAnalysis = await this.analyzeEndpoints(indication, phase, primaryEndpoints);

      // 3. Predict success probability
      const successPrediction = await this.predictSuccessProbability({
        indication,
        phase,
        sampleSize,
        duration,
        controlType,
        blinding,
        primaryEndpoint: primaryEndpoints[0] || '',
      });

      // 4. Analyze potential failure risks
      const failureRisks = await this.assessFailureRisks({
        indication,
        phase,
        sampleSize,
        duration,
        controlType,
        blinding,
        primaryEndpoint: primaryEndpoints[0] || '',
      });

      // 5. Generate competitive landscape analysis
      const competitiveAnalysis = await this.analyzeCompetitiveLandscape(indication, phase);

      // 6. Generate strategic recommendations
      const strategicRecommendations = await this.generateStrategicRecommendations({
        successPrediction,
        failureRisks,
        benchmarkData,
        endpointAnalysis,
        competitiveAnalysis,
        protocolParams: {
          indication,
          phase,
          sampleSize,
          duration,
          primaryEndpoints,
          controlType,
          blinding,
        },
      });

      // 7. Create report structure
      const reportData = this.structureStrategicReport({
        protocolId,
        indication,
        phase,
        benchmarkData,
        endpointAnalysis,
        successPrediction,
        failureRisks,
        competitiveAnalysis,
        strategicRecommendations,
        sampleSize,
        duration,
        controlType,
        blinding,
        primaryEndpoints,
        organizationId: protocol.organizationId,
        clientWorkspaceId: protocol.clientWorkspaceId,
      });

      // 8. Save to database
      const [report] = await db.insert(strategicReports).values(reportData).returning();

      console.log(`Strategic report generated successfully with ID ${report.id}`);
      return report.id;
    } catch (error: any) {
      console.error('Error generating strategic report:', error);
      throw new Error(`Failed to generate strategic report: ${error.message}`);
    }
  }

  /**
   * Get historical benchmarking data for similar trials
   */
  private async getHistoricalBenchmarks(indication: string, phase: string): Promise<any> {
    try {
      // Use statistics service to get benchmark data
      const trialStats = await statisticsService.getIndication(indication);
      const phaseStats = await statisticsService.getPhaseStatistics(phase);
      const combinedStats = await statisticsService.getCombinedStatistics({
        indication,
        phase,
      });

      return {
        sampleSizeStats: {
          mean: combinedStats.sampleSizeMean || 0,
          median: combinedStats.sampleSizeMedian || 0,
          range: combinedStats.sampleSizeRange || [0, 0],
        },
        durationStats: {
          mean: combinedStats.durationMean || 0,
          median: combinedStats.durationMedian || 0,
          range: combinedStats.durationRange || [0, 0],
        },
        dropoutRateStats: {
          mean: combinedStats.dropoutRateMean || 0,
          median: combinedStats.dropoutRateMedian || 0,
          range: combinedStats.dropoutRateRange || [0, 0],
        },
        successRate: combinedStats.successRate || 0,
        commonDesigns: combinedStats.commonDesigns || [],
        totalTrials: combinedStats.totalTrials || 0,
      };
    } catch (error) {
      console.error('Error getting historical benchmarks:', error);
      return {
        sampleSizeStats: { mean: 0, median: 0, range: [0, 0] },
        durationStats: { mean: 0, median: 0, range: [0, 0] },
        dropoutRateStats: { mean: 0, median: 0, range: [0, 0] },
        successRate: 0,
        commonDesigns: [],
        totalTrials: 0,
      };
    }
  }

  /**
   * Analyze endpoints compared to similar trials
   */
  private async analyzeEndpoints(
    indication: string,
    phase: string,
    primaryEndpoints: string[]
  ): Promise<any> {
    try {
      // Get endpoint statistics
      const endpointStats = await statisticsService.getEndpointStatistics({
        indication,
        phase,
      });

      // Analyze the submitted endpoints against historical data
      const endpointAnalysis = primaryEndpoints.map(endpoint => {
        const matchingEndpoints = endpointStats.commonEndpoints.filter(
          (e: any) =>
            e.name.toLowerCase().includes(endpoint.toLowerCase()) ||
            endpoint.toLowerCase().includes(e.name.toLowerCase())
        );

        return {
          endpoint,
          commonality:
            matchingEndpoints.length > 0
              ? matchingEndpoints[0].frequency / endpointStats.totalTrials
              : 0,
          isStandard: matchingEndpoints.length > 0,
          similarEndpoints: matchingEndpoints.map((e: any) => e.name),
          historicalSuccess: matchingEndpoints.length > 0 ? matchingEndpoints[0].successRate : null,
        };
      });

      return {
        endpointAnalysis,
        mostCommonEndpoints: endpointStats.commonEndpoints.slice(0, 5),
        endpointSuccessFactors: endpointStats.endpointSuccessFactors || [],
      };
    } catch (error) {
      console.error('Error analyzing endpoints:', error);
      return {
        endpointAnalysis: primaryEndpoints.map(endpoint => ({
          endpoint,
          commonality: 0,
          isStandard: false,
          similarEndpoints: [],
          historicalSuccess: null,
        })),
        mostCommonEndpoints: [],
        endpointSuccessFactors: [],
      };
    }
  }

  /**
   * Predict success probability using ML model
   */
  private async predictSuccessProbability(params: {
    indication: string;
    phase: string;
    sampleSize: number;
    duration: number;
    controlType: string;
    blinding: string;
    primaryEndpoint: string;
  }): Promise<any> {
    try {
      // Create temporary JSON file with trial data
      const tempDataPath = path.join(this.dataDir, `temp_predict_${Date.now()}.json`);
      fs.writeFileSync(tempDataPath, JSON.stringify(params));

      // Run Python prediction script
      const scriptPath = path.join(process.cwd(), 'server/scripts/predict_success.py');
      const { stdout, stderr } = await execPromise(`python ${scriptPath} --input ${tempDataPath}`);

      // Parse results
      fs.unlinkSync(tempDataPath); // Clean up temp file
      const result = JSON.parse(stdout);

      // Add feature importance data
      return {
        successProbability: result.probability,
        confidence: result.confidence,
        keyFactors: [
          { name: 'Sample Size', impact: result.feature_importance.sample_size || 0 },
          { name: 'Duration', impact: result.feature_importance.duration_weeks || 0 },
          { name: 'Dropout Rate', impact: result.feature_importance.dropout_rate || 0 },
          { name: 'Phase', impact: result.feature_importance.phase || 0 },
          { name: 'Blinding', impact: result.feature_importance.blinding || 0 },
        ].sort((a, b) => b.impact - a.impact),
      };
    } catch (error) {
      console.error('Error predicting success probability:', error);
      // Fall back to statistical prediction if ML model fails
      return this.statisticalSuccessPrediction(params);
    }
  }

  /**
   * Statistical success prediction as fallback
   */
  private async statisticalSuccessPrediction(params: {
    indication: string;
    phase: string;
    sampleSize: number;
    duration: number;
    controlType: string;
    blinding: string;
    primaryEndpoint: string;
  }): Promise<any> {
    try {
      // Get statistics for similar trials
      const stats = await statisticsService.getCombinedStatistics({
        indication: params.indication,
        phase: params.phase,
      });

      // Base probability on historical success rate
      let probability = stats.successRate || 0.3;

      // Adjust based on sample size
      if (params.sampleSize > (stats.sampleSizeMean || 0)) {
        probability += 0.05;
      } else if (params.sampleSize < (stats.sampleSizeMean || 0) * 0.8) {
        probability -= 0.05;
      }

      // Adjust based on duration
      if (params.duration > (stats.durationMean || 0) * 1.2) {
        probability -= 0.03;
      }

      // Adjust based on blinding
      if (params.blinding === 'double-blind') {
        probability += 0.03;
      } else if (params.blinding === 'open-label') {
        probability -= 0.02;
      }

      return {
        successProbability: Math.max(0.1, Math.min(0.9, probability)),
        confidence: 0.7,
        keyFactors: [
          { name: 'Sample Size', impact: 0.15 },
          { name: 'Duration', impact: 0.12 },
          { name: 'Dropout Rate', impact: 0.13 },
          { name: 'Phase', impact: 0.18 },
          { name: 'Blinding', impact: 0.11 },
        ],
      };
    } catch (error) {
      console.error('Error in statistical success prediction:', error);
      return {
        successProbability: 0.5,
        confidence: 0.5,
        keyFactors: [
          { name: 'Sample Size', impact: 0.15 },
          { name: 'Duration', impact: 0.12 },
          { name: 'Dropout Rate', impact: 0.13 },
          { name: 'Phase', impact: 0.18 },
          { name: 'Blinding', impact: 0.11 },
        ],
      };
    }
  }

  /**
   * Assess failure risks using the failure reason classifier
   */
  private async assessFailureRisks(params: {
    indication: string;
    phase: string;
    sampleSize: number;
    duration: number;
    controlType: string;
    blinding: string;
    primaryEndpoint: string;
  }): Promise<any> {
    try {
      // Create temporary JSON file with trial data
      const tempDataPath = path.join(this.dataDir, `temp_risks_${Date.now()}.json`);
      fs.writeFileSync(tempDataPath, JSON.stringify(params));

      // Run Python failure analysis script
      const scriptPath = path.join(process.cwd(), 'server/scripts/predict_failure_reasons.py');
      const { stdout, stderr } = await execPromise(`python ${scriptPath} --input ${tempDataPath}`);

      // Parse results
      fs.unlinkSync(tempDataPath); // Clean up temp file
      const result = JSON.parse(stdout);

      return {
        primaryRisks: result.primary_risks,
        riskBreakdown: result.risk_breakdown,
        mitigationStrategies: result.mitigation_strategies,
      };
    } catch (error) {
      console.error('Error assessing failure risks:', error);
      // Fall back to statistical risk assessment
      return this.statisticalRiskAssessment(params);
    }
  }

  /**
   * Statistical risk assessment as fallback
   */
  private async statisticalRiskAssessment(params: {
    indication: string;
    phase: string;
    sampleSize: number;
    duration: number;
    controlType: string;
    blinding: string;
    primaryEndpoint: string;
  }): Promise<any> {
    // Get common risks for the indication/phase
    try {
      const stats = await statisticsService.getCombinedStatistics({
        indication: params.indication,
        phase: params.phase,
      });

      // Create a risk profile based on trial parameters
      const risks: any[] = [];

      // Sample size risk
      if (params.sampleSize < (stats.sampleSizeMean || 0) * 0.8) {
        risks.push({
          category: 'statistical',
          description: 'Underpowered study',
          probability: 0.7,
          impact: 'High',
          mitigation: 'Consider increasing sample size or refining endpoints to reduce variability',
        });
      }

      // Duration risk
      if (params.duration < (stats.durationMean || 0) * 0.7) {
        risks.push({
          category: 'efficacy',
          description: 'Insufficient time to observe effect',
          probability: 0.6,
          impact: 'Medium',
          mitigation: 'Extend study duration or include interim analyses',
        });
      }

      // Blinding risk
      if (params.blinding === 'open-label') {
        risks.push({
          category: 'design',
          description: 'Bias due to open-label design',
          probability: 0.5,
          impact: 'Medium',
          mitigation: 'Implement objective endpoints and independent outcome assessment',
        });
      }

      // Add some indication-specific risks
      const indicationRisks: { [key: string]: any } = {
        COPD: {
          category: 'safety',
          description: 'Exacerbation of respiratory symptoms',
          probability: 0.4,
          impact: 'High',
          mitigation: 'Careful patient selection and monitoring of respiratory function',
        },
        Oncology: {
          category: 'efficacy',
          description: 'Heterogeneous patient population affecting response',
          probability: 0.6,
          impact: 'High',
          mitigation: 'Consider biomarker-based stratification',
        },
        Diabetes: {
          category: 'safety',
          description: 'Hypoglycemia risk',
          probability: 0.5,
          impact: 'Medium',
          mitigation: 'Careful dose selection and safety monitoring',
        },
      };

      const generalRisks = [
        {
          category: 'enrollment',
          description: 'Slow recruitment affecting timeline',
          probability: 0.5,
          impact: 'Medium',
          mitigation: 'Broaden inclusion criteria or add more sites',
        },
        {
          category: 'regulatory',
          description: 'Evolving regulatory landscape',
          probability: 0.3,
          impact: 'Medium',
          mitigation: 'Early regulatory engagement and protocol review',
        },
      ];

      // Add indication-specific risk if available
      Object.keys(indicationRisks).forEach(ind => {
        if (params.indication.toLowerCase().includes(ind.toLowerCase())) {
          risks.push(indicationRisks[ind]);
        }
      });

      // Add general risks
      risks.push(...generalRisks);

      // Calculate risk breakdown by category
      const categories = risks.map(r => r.category);
      const uniqueCategories = Array.from(new Set(categories));
      const riskBreakdown = uniqueCategories.map(category => {
        const count = categories.filter(c => c === category).length;
        return {
          category,
          percentage: (count / risks.length) * 100,
        };
      });

      return {
        primaryRisks: risks,
        riskBreakdown,
        mitigationStrategies: risks.map(r => r.mitigation),
      };
    } catch (error) {
      console.error('Error in statistical risk assessment:', error);
      return {
        primaryRisks: [
          {
            category: 'statistical',
            description: 'Potential underpowering',
            probability: 0.5,
            impact: 'Medium',
            mitigation: 'Review sample size calculations and consider increasing enrollment',
          },
          {
            category: 'operational',
            description: 'Enrollment challenges',
            probability: 0.6,
            impact: 'Medium',
            mitigation: 'Expand site network and optimize inclusion/exclusion criteria',
          },
        ],
        riskBreakdown: [
          { category: 'statistical', percentage: 50 },
          { category: 'operational', percentage: 50 },
        ],
        mitigationStrategies: [
          'Review sample size calculations and consider increasing enrollment',
          'Expand site network and optimize inclusion/exclusion criteria',
        ],
      };
    }
  }

  /**
   * Analyze competitive landscape for a specific indication and phase
   */
  private async analyzeCompetitiveLandscape(indication: string, phase: string): Promise<any> {
    try {
      const competitiveAnalysis = await statisticsService.getCompetitiveAnalysis({
        indication,
        phase,
      });

      return {
        topSponsors: competitiveAnalysis.topSponsors || [],
        recentTrials: competitiveAnalysis.recentTrials || [],
        trendingEndpoints: competitiveAnalysis.trendingEndpoints || [],
        emergingDesigns: competitiveAnalysis.emergingDesigns || [],
        marketInsights: competitiveAnalysis.marketInsights || [],
      };
    } catch (error) {
      console.error('Error analyzing competitive landscape:', error);
      return {
        topSponsors: [],
        recentTrials: [],
        trendingEndpoints: [],
        emergingDesigns: [],
        marketInsights: [
          'Insufficient data available for competitive analysis',
          'Consider broader analysis across similar indications',
        ],
      };
    }
  }

  /**
   * Generate strategic recommendations based on analyses
   */
  private async generateStrategicRecommendations(params: {
    successPrediction: any;
    failureRisks: any;
    benchmarkData: any;
    endpointAnalysis: any;
    competitiveAnalysis: any;
    protocolParams: {
      indication: string;
      phase: string;
      sampleSize: number;
      duration: number;
      primaryEndpoints: string[];
      controlType: string;
      blinding: string;
    };
  }): Promise<any> {
    try {
      // Generate design recommendations
      const designRecommendations = this.generateDesignRecommendations(params);

      // Generate endpoint recommendations
      const endpointRecommendations = this.generateEndpointRecommendations(params);

      // Generate competitive advantage recommendations
      const competitiveRecommendations = this.generateCompetitiveRecommendations(params);

      // Generate a summary of all recommendations
      const recommendationSummary = this.generateRecommendationSummary({
        designRecommendations,
        endpointRecommendations,
        competitiveRecommendations,
        successProbability: params.successPrediction.successProbability,
      });

      return {
        designRecommendations,
        endpointRecommendations,
        competitiveRecommendations,
        recommendationSummary,
      };
    } catch (error) {
      console.error('Error generating strategic recommendations:', error);
      return {
        designRecommendations: [
          'Consider standard design approaches for this indication and phase',
        ],
        endpointRecommendations: ['Review regulatory precedent for similar trials'],
        competitiveRecommendations: [
          'Analyze competitor strategies to identify potential differentiation opportunities',
        ],
        recommendationSummary:
          'Insufficient data for comprehensive recommendations. Consider consulting with regulatory experts.',
      };
    }
  }

  /**
   * Generate design optimization recommendations
   */
  private generateDesignRecommendations(params: any): string[] {
    const recommendations: string[] = [];

    // Sample size recommendations
    if (params.protocolParams.sampleSize < params.benchmarkData.sampleSizeStats.mean * 0.8) {
      recommendations.push(
        `Consider increasing sample size from ${params.protocolParams.sampleSize} to at least ${Math.round(params.benchmarkData.sampleSizeStats.mean * 0.8)} based on historical trials (mean: ${Math.round(params.benchmarkData.sampleSizeStats.mean)})`
      );
    }

    // Duration recommendations
    if (params.protocolParams.duration < params.benchmarkData.durationStats.mean * 0.7) {
      recommendations.push(
        `Consider extending study duration from ${params.protocolParams.duration} weeks to at least ${Math.round(params.benchmarkData.durationStats.mean * 0.7)} weeks based on historical trials (mean: ${Math.round(params.benchmarkData.durationStats.mean)} weeks)`
      );
    }

    // Blinding recommendations
    if (
      params.protocolParams.blinding === 'open-label' &&
      params.failureRisks.primaryRisks.some((risk: any) => risk.category === 'design')
    ) {
      recommendations.push(
        'Consider implementing double-blinding if feasible, or enhance objective outcome measures to reduce bias inherent in open-label design'
      );
    }

    // Add recommended study design if available
    if (params.benchmarkData.commonDesigns && params.benchmarkData.commonDesigns.length > 0) {
      const topDesign = params.benchmarkData.commonDesigns[0];
      if (topDesign) {
        recommendations.push(
          `Consider "${topDesign.design}" design which has been successfully used in ${Math.round(topDesign.percentage)}% of similar trials`
        );
      }
    }

    // If high failure risk, add specific mitigation recommendation
    if (params.successPrediction.successProbability < 0.4) {
      recommendations.push(
        'Given the predicted low success probability, consider an adaptive design with interim analyses to enable early stopping for futility or sample size re-estimation'
      );
    }

    // If we don't have enough recommendations, add fallback recommendations
    if (recommendations.length < 2) {
      recommendations.push(
        'Ensure appropriate stratification factors are included to control for known prognostic variables'
      );

      recommendations.push(
        'Consider implementing a run-in period to reduce placebo response and identify potential non-responders'
      );
    }

    return recommendations;
  }

  /**
   * Generate endpoint recommendations
   */
  private generateEndpointRecommendations(params: any): string[] {
    const recommendations: string[] = [];

    // Check if primary endpoints are standard
    const nonStandardEndpoints = params.endpointAnalysis.endpointAnalysis.filter(
      (e: any) => !e.isStandard
    );
    if (nonStandardEndpoints.length > 0) {
      const endpointNames = nonStandardEndpoints.map((e: any) => `"${e.endpoint}"`).join(', ');

      // Find alternative commonly used endpoints
      if (
        params.endpointAnalysis.mostCommonEndpoints &&
        params.endpointAnalysis.mostCommonEndpoints.length > 0
      ) {
        const suggestedEndpoints = params.endpointAnalysis.mostCommonEndpoints
          .slice(0, 2)
          .map((e: any) => `"${e.name}"`)
          .join(' or ');

        recommendations.push(
          `Consider replacing or supplementing non-standard endpoint(s) ${endpointNames} with more commonly used endpoints such as ${suggestedEndpoints}`
        );
      } else {
        recommendations.push(
          `The endpoint(s) ${endpointNames} appear to be non-standard for this indication and phase, which may present regulatory challenges`
        );
      }
    }

    // Suggest trending endpoints
    if (
      params.competitiveAnalysis.trendingEndpoints &&
      params.competitiveAnalysis.trendingEndpoints.length > 0
    ) {
      const trendingEndpoint = params.competitiveAnalysis.trendingEndpoints[0];
      recommendations.push(
        `Consider adding "${trendingEndpoint.endpoint}" as a secondary endpoint, which shows an increasing trend in recent trials`
      );
    }

    // Add recommendations based on success factors
    if (
      params.endpointAnalysis.endpointSuccessFactors &&
      params.endpointAnalysis.endpointSuccessFactors.length > 0
    ) {
      const successFactor = params.endpointAnalysis.endpointSuccessFactors[0];
      recommendations.push(
        `Apply the "${successFactor.factor}" principle to endpoint selection and definition: ${successFactor.description}`
      );
    }

    // If we don't have enough recommendations, add fallback recommendations
    if (recommendations.length < 2) {
      recommendations.push(
        'Consider including both clinical and patient-reported outcomes as complementary endpoints to strengthen the overall evidence package'
      );

      recommendations.push(
        'Ensure endpoint definitions are precisely specified with clear measurement properties and minimized variability'
      );
    }

    return recommendations;
  }

  /**
   * Generate competitive advantage recommendations
   */
  private generateCompetitiveRecommendations(params: any): string[] {
    const recommendations: string[] = [];

    // Competitive landscape insights
    if (
      params.competitiveAnalysis.topSponsors &&
      params.competitiveAnalysis.topSponsors.length > 0
    ) {
      const topSponsor = params.competitiveAnalysis.topSponsors[0];
      recommendations.push(
        `Monitor activities of ${topSponsor.sponsor}, which has conducted ${topSponsor.trialCount} trials (${Math.round(topSponsor.percentage)}% of market share) in this indication`
      );
    }

    // Market insights
    if (
      params.competitiveAnalysis.marketInsights &&
      params.competitiveAnalysis.marketInsights.length > 0
    ) {
      const marketInsight = params.competitiveAnalysis.marketInsights[0];
      recommendations.push(marketInsight);
    }

    // Emerging design trends
    if (
      params.competitiveAnalysis.emergingDesigns &&
      params.competitiveAnalysis.emergingDesigns.length > 0
    ) {
      const emergingDesign = params.competitiveAnalysis.emergingDesigns[0];
      recommendations.push(
        `Consider implementing "${emergingDesign}" design which is emerging as a trend in recent studies`
      );
    }

    // If predicted success is low, add differentiation recommendation
    if (params.successPrediction.successProbability < 0.5) {
      recommendations.push(
        'Given the competitive landscape and success prediction, consider identifying a more specific patient subpopulation where treatment effect may be more pronounced'
      );
    }

    // If we don't have enough recommendations, add fallback recommendations
    if (recommendations.length < 2) {
      recommendations.push(
        'Conduct a thorough gap analysis of competitor trial designs to identify potential differentiation opportunities'
      );

      recommendations.push(
        'Consider innovative operational strategies to accelerate recruitment and reduce timeline compared to competitors'
      );
    }

    return recommendations;
  }

  /**
   * Generate a summary of all recommendations
   */
  private generateRecommendationSummary(params: {
    designRecommendations: string[];
    endpointRecommendations: string[];
    competitiveRecommendations: string[];
    successProbability: number;
  }): string {
    // Create a summary based on the success probability
    let summary = '';

    if (params.successProbability >= 0.7) {
      summary =
        'The protocol design shows strong potential for success. Our strategic recommendations focus on optimizing key elements to further enhance study robustness and efficiency.';
    } else if (params.successProbability >= 0.4) {
      summary =
        'The protocol design has moderate success potential. Strategic modifications in several areas could significantly improve probability of success.';
    } else {
      summary =
        'The protocol design shows elevated risk factors. Substantial strategic modifications are recommended to improve probability of success.';
    }

    // Add key recommendations summary
    summary += ' Key focus areas include: ';

    const allRecommendations = [
      ...params.designRecommendations,
      ...params.endpointRecommendations,
      ...params.competitiveRecommendations,
    ];

    // Select top 3 recommendations based on importance/priority
    const topRecommendations = allRecommendations
      .slice(0, 3)
      .map(r => r.split(' ').slice(0, 6).join(' ') + '...')
      .join('; ');

    summary += topRecommendations;

    return summary;
  }

  /**
   * Structure the final strategic report
   */
  private structureStrategicReport(params: {
    protocolId: number;
    indication: string;
    phase: string;
    benchmarkData: any;
    endpointAnalysis: any;
    successPrediction: any;
    failureRisks: any;
    competitiveAnalysis: any;
    strategicRecommendations: any;
    sampleSize: number;
    duration: number;
    controlType: string;
    blinding: string;
    primaryEndpoints: string[];
    organizationId: number;
    clientWorkspaceId: number | null;
  }): InsertStrategicReport {
    const now = new Date();
    const reportId = `protocol-${params.protocolId}`;

    // Create decision matrix data
    const decisionMatrix = {
      successProbability: params.successPrediction.successProbability,
      confidenceLevel: params.successPrediction.confidence,
      keyDecisionFactors: params.successPrediction.keyFactors.map((factor: any) => ({
        factor: factor.name,
        impact: factor.impact,
        direction: factor.impact > 0.15 ? 'positive' : 'negative',
      })),
      recommendations: [
        params.strategicRecommendations.designRecommendations[0],
        params.strategicRecommendations.endpointRecommendations[0],
        params.strategicRecommendations.competitiveRecommendations[0],
      ],
    };

    // Format risk factors
    const riskFactors = params.failureRisks.primaryRisks.map((risk: any) => ({
      factor: risk.category,
      risk: risk.impact as 'High' | 'Medium' | 'Low',
      impact: risk.description,
      mitigation: risk.mitigation,
    }));

    const content = {
      metadata: {
        reportId,
        title: `Strategic Intelligence Report: ${params.indication} Phase ${params.phase}`,
        generatedDate: now.toISOString(),
        version: '1.0',
        protocolId: params.protocolId,
        indication: params.indication,
        phase: params.phase,
        sponsor: 'Not Specified',
        confidentialityLevel: 'Internal',
      },
      executiveSummary: {
        overview: `This strategic intelligence report provides comprehensive analysis and recommendations for the ${params.indication} Phase ${params.phase} protocol. Based on analysis of ${params.benchmarkData.totalTrials || 'available'} historical trials and competitive intelligence, our assessment indicates ${params.successPrediction.successProbability < 0.4 ? 'significant challenges' : params.successPrediction.successProbability < 0.7 ? 'moderate potential' : 'strong potential'} for success, with strategic opportunities for optimization.`,
        keyFindings: [
          `Success probability is estimated at ${Math.round(params.successPrediction.successProbability * 100)}% based on statistical and machine learning analysis of similar trials`,
          `Primary failure risks are in the areas of ${params.failureRisks.riskBreakdown
            .slice(0, 2)
            .map((r: any) => r.category)
            .join(' and ')}`,
          `${params.benchmarkData.totalTrials || 'Multiple'} historical trials provide benchmarking data for optimizing design elements`,
          `${params.competitiveAnalysis.topSponsors.length > 0 ? `${params.competitiveAnalysis.topSponsors[0].sponsor} is the market leader with ${params.competitiveAnalysis.topSponsors[0].trialCount} trials` : 'Competitive landscape analysis shows diverse sponsor participation'}`,
        ],
        strategicRecommendations: [params.strategicRecommendations.recommendationSummary],
        decisionMatrix,
      },
      historicalBenchmarking: {
        sampleSizeAnalysis: {
          historicalMean: params.benchmarkData.sampleSizeStats.mean,
          historicalMedian: params.benchmarkData.sampleSizeStats.median,
          historicalRange: params.benchmarkData.sampleSizeStats.range,
          recommendation:
            params.sampleSize < params.benchmarkData.sampleSizeStats.mean
              ? `Consider increasing sample size (currently ${params.sampleSize})`
              : `Current sample size (${params.sampleSize}) appears adequate based on historical data`,
        },
        durationAnalysis: {
          historicalMean: params.benchmarkData.durationStats.mean,
          historicalMedian: params.benchmarkData.durationStats.median,
          historicalRange: params.benchmarkData.durationStats.range,
          recommendation:
            params.duration < params.benchmarkData.durationStats.mean
              ? `Consider increasing study duration (currently ${params.duration} weeks)`
              : `Current duration (${params.duration} weeks) appears adequate based on historical data`,
        },
        dropoutRateAnalysis: {
          historicalMean: params.benchmarkData.dropoutRateStats.mean,
          historicalMedian: params.benchmarkData.dropoutRateStats.median,
          historicalRange: params.benchmarkData.dropoutRateStats.range,
          recommendation: params.failureRisks.riskBreakdown.find(
            (r: any) => r.category === 'Patient Retention'
          )
            ? 'Focus on patient retention strategies'
            : 'No significant retention risks identified',
        },
      },
      endpointAnalysis: params.endpointAnalysis,
      successPrediction: params.successPrediction,
      failureRisks: params.failureRisks,
      competitiveAnalysis: params.competitiveAnalysis,
      strategicRecommendations: params.strategicRecommendations,
      protocolParams: {
        indication: params.indication,
        phase: params.phase,
        sampleSize: params.sampleSize,
        duration: params.duration,
        controlType: params.controlType,
        blinding: params.blinding,
        primaryEndpoints: params.primaryEndpoints,
      },
      riskFactors,
      designRiskPrediction: {
        successProbability: params.successPrediction.successProbability,
        confidence: params.successPrediction.confidence,
        keyFactors: params.successPrediction.keyFactors,
        riskFactors,
        riskBreakdown: params.failureRisks.riskBreakdown,
        mitigationStrategies: params.failureRisks.mitigationStrategies,
      },
      competitiveLandscape: {
        topSponsors: params.competitiveAnalysis.topSponsors,
        recentTrials: params.competitiveAnalysis.recentTrials,
        emergingDesigns: params.competitiveAnalysis.emergingDesigns,
        marketInsights: params.competitiveAnalysis.marketInsights,
        competitorAnalysis: params.competitiveAnalysis.topSponsors
          .map((sponsor: any) => ({
            sponsor: sponsor.sponsor,
            trialCount: sponsor.trialCount,
            marketShare: sponsor.percentage / 100,
            estimatedInvestment: sponsor.trialCount * 2500000,
            strategicFocus: 'Standard development pathway',
          }))
          .slice(0, 3),
      },
      aiRecommendations: {
        designRecommendations: params.strategicRecommendations.designRecommendations,
        endpointRecommendations: params.strategicRecommendations.endpointRecommendations,
        competitiveRecommendations: params.strategicRecommendations.competitiveRecommendations,
        overallSummary: params.strategicRecommendations.recommendationSummary,
      },
    };

    return {
      reportId,
      title: `Strategic Intelligence Report: ${params.indication} Phase ${params.phase}`,
      summary: params.strategicRecommendations.recommendationSummary,
      content,
      status: 'draft',
      organizationId: params.organizationId,
      clientWorkspaceId: params.clientWorkspaceId,
    };
  }
}

export const strategicReportGenerator = new StrategicReportGenerator();
