/**
 * Predictive Intelligence Engine
 * Phase 3.3 - Core Prediction Service
 * 
 * Orchestrates risk detection, generates predictions, and calculates
 * success probabilities for regulatory submissions.
 */

import type { DetectedRisk, RiskFactor } from './risk-factors';
import { 
  getRiskFactorsForSubmissionType, 
  getAllRiskFactorsBySeverity,
  calculateWeightedRiskScore 
} from './risk-factors';
import {
  createDetector,
  getDetectorsForSubmissionType,
  type DetectorType
} from './detectors';

export type SubmissionType = '510k' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO';

export interface PredictionInput {
  projectId: string;
  submissionType: SubmissionType;
  projectData: Record<string, unknown>;
  detectorInputs?: Record<DetectorType, unknown>;
  historicalContext?: HistoricalContext;
}

export interface HistoricalContext {
  previousSubmissions?: number;
  previousApprovals?: number;
  previousDeficiencies?: string[];
  therapeuticArea?: string;
  sponsorExperience?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface Prediction {
  projectId: string;
  submissionType: SubmissionType;
  generatedAt: Date;
  
  // Core predictions
  successProbability: number; // 0.0 - 1.0
  confidenceInterval: { lower: number; upper: number };
  predictionConfidence: number; // How confident we are in the prediction
  
  // Timeline predictions
  estimatedReviewTime: number; // days
  aiLetterProbability: number; // Probability of receiving AI letter
  rtaRisk: number; // Refuse to Accept risk
  
  // Risk analysis
  detectedRisks: DetectedRisk[];
  topRisks: DetectedRisk[];
  riskScore: number;
  
  // Outcome scenarios
  scenarios: OutcomeScenario[];
  
  // Recommendations
  mitigations: MitigationRecommendation[];
}

export interface OutcomeScenario {
  name: string;
  probability: number;
  description: string;
  timeline: number; // days
  conditions: string[];
}

export interface MitigationRecommendation {
  riskId: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  action: string;
  expectedImpact: number; // How much this could improve success probability
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  timelineImpact: number; // Days this might add to timeline
}

/**
 * Predictive Intelligence Engine
 * Core service for generating regulatory submission predictions
 */
export class PredictiveIntelligenceEngine {
  private readonly baseReviewTimes: Record<SubmissionType, number> = {
    '510k': 90,
    'DE_NOVO': 150,
    'IND': 30,
    'NDA': 300,
    'BLA': 300,
    'PMA': 180,
    'MAA': 210
  };

  private readonly historicalApprovalRates: Record<SubmissionType, number> = {
    '510k': 0.85,
    'DE_NOVO': 0.65,
    'IND': 0.95, // Clinical hold is rare
    'NDA': 0.75,
    'BLA': 0.70,
    'PMA': 0.65,
    'MAA': 0.72
  };

  /**
   * Generate prediction for a submission
   */
  async generatePrediction(input: PredictionInput): Promise<Prediction> {
    const startTime = Date.now();

    // Run applicable detectors
    const detectedRisks = await this.runDetectors(input);

    // Calculate success probability
    const { successProbability, confidenceInterval, predictionConfidence } = 
      this.calculateSuccessProbability(input, detectedRisks);

    // Calculate risk score
    const riskScore = calculateWeightedRiskScore(detectedRisks);

    // Get top risks
    const topRisks = this.identifyTopRisks(detectedRisks);

    // Calculate timeline predictions
    const { estimatedReviewTime, aiLetterProbability, rtaRisk } = 
      this.calculateTimelinePredictions(input, detectedRisks);

    // Generate outcome scenarios
    const scenarios = this.generateOutcomeScenarios(
      input.submissionType,
      successProbability,
      detectedRisks
    );

    // Generate mitigation recommendations
    const mitigations = this.generateMitigations(topRisks);

    // Ensure prediction time < 5 seconds
    const elapsed = Date.now() - startTime;
    if (elapsed > 5000) {
      console.warn(`Prediction took ${elapsed}ms, exceeding 5s target`);
    }

    return {
      projectId: input.projectId,
      submissionType: input.submissionType,
      generatedAt: new Date(),
      successProbability,
      confidenceInterval,
      predictionConfidence,
      estimatedReviewTime,
      aiLetterProbability,
      rtaRisk,
      detectedRisks,
      topRisks,
      riskScore,
      scenarios,
      mitigations
    };
  }

  /**
   * Run applicable detectors for submission type
   */
  private async runDetectors(input: PredictionInput): Promise<DetectedRisk[]> {
    const allRisks: DetectedRisk[] = [];
    const detectorTypes = getDetectorsForSubmissionType(input.submissionType);

    for (const detectorType of detectorTypes) {
      try {
        const detectorInput = input.detectorInputs?.[detectorType];
        if (!detectorInput) continue;

        const detector = createDetector(detectorType);
        const result = await (detector as any).analyze(detectorInput);
        
        if (typeof (detector as any).toDetectedRisks === 'function') {
          const risks = (detector as any).toDetectedRisks(result);
          allRisks.push(...risks);
        }
      } catch (error) {
        console.error(`Detector ${detectorType} failed:`, error);
        // Continue with other detectors
      }
    }

    // Add project health risk checks
    const projectHealthRisks = this.checkProjectHealthRisks(input.projectData);
    allRisks.push(...projectHealthRisks);

    return allRisks;
  }

  /**
   * Check project health risks from project data
   */
  private checkProjectHealthRisks(projectData: Record<string, unknown>): DetectedRisk[] {
    const risks: DetectedRisk[] = [];
    
    // Check for timeline risks
    if (projectData.criticalPathDelay) {
      const factor = getRiskFactorsForSubmissionType('510k').find(
        f => f.id === 'PH-R001'
      );
      if (factor) {
        risks.push({
          factorId: 'PH-R001',
          factor,
          detected: true,
          confidence: 0.8,
          evidence: ['Critical path tasks are delayed'],
          detectedAt: new Date(),
          mitigationRecommendations: ['Reallocate resources to critical path']
        });
      }
    }

    // Check for resource risks
    if (projectData.resourceOverallocation) {
      const factor = getRiskFactorsForSubmissionType('510k').find(
        f => f.id === 'PH-R004'
      );
      if (factor) {
        risks.push({
          factorId: 'PH-R004',
          factor,
          detected: true,
          confidence: 0.7,
          evidence: ['Key team members are overallocated'],
          detectedAt: new Date(),
          mitigationRecommendations: ['Rebalance workload or add resources']
        });
      }
    }

    return risks;
  }

  /**
   * Calculate success probability based on risks and historical data
   */
  calculateSuccessProbability(
    input: PredictionInput,
    detectedRisks: DetectedRisk[]
  ): {
    successProbability: number;
    confidenceInterval: { lower: number; upper: number };
    predictionConfidence: number;
  } {
    // Start with historical approval rate
    let baseProbability = this.historicalApprovalRates[input.submissionType];

    // Adjust for sponsor experience
    if (input.historicalContext?.sponsorExperience === 'HIGH') {
      baseProbability += 0.05;
    } else if (input.historicalContext?.sponsorExperience === 'LOW') {
      baseProbability -= 0.10;
    }

    // Calculate risk-based penalty
    const activeRisks = detectedRisks.filter(r => r.detected);
    const criticalRisks = activeRisks.filter(
      r => r.factor.severity === 'CRITICAL'
    );
    const highRisks = activeRisks.filter(
      r => r.factor.severity === 'HIGH'
    );

    // Risk penalties
    const criticalPenalty = criticalRisks.reduce(
      (sum, r) => sum + r.factor.weight * r.confidence * 0.3, 0
    );
    const highPenalty = highRisks.reduce(
      (sum, r) => sum + r.factor.weight * r.confidence * 0.15, 0
    );

    let successProbability = baseProbability - criticalPenalty - highPenalty;

    // Clamp to valid range
    successProbability = Math.max(0.05, Math.min(0.95, successProbability));

    // Calculate confidence interval based on data quality
    const dataPoints = activeRisks.length + (input.historicalContext ? 3 : 0);
    const confidenceWidth = Math.max(0.05, 0.20 - dataPoints * 0.01);

    // Calculate prediction confidence
    const predictionConfidence = Math.min(
      0.95,
      0.5 + dataPoints * 0.05 + (input.detectorInputs ? 0.2 : 0)
    );

    return {
      successProbability,
      confidenceInterval: {
        lower: Math.max(0, successProbability - confidenceWidth),
        upper: Math.min(1, successProbability + confidenceWidth)
      },
      predictionConfidence
    };
  }

  /**
   * Identify top risks by impact
   */
  private identifyTopRisks(detectedRisks: DetectedRisk[]): DetectedRisk[] {
    return detectedRisks
      .filter(r => r.detected)
      .sort((a, b) => {
        const impactA = a.factor.weight * a.confidence;
        const impactB = b.factor.weight * b.confidence;
        return impactB - impactA;
      })
      .slice(0, 5);
  }

  /**
   * Calculate timeline predictions
   */
  private calculateTimelinePredictions(
    input: PredictionInput,
    detectedRisks: DetectedRisk[]
  ): {
    estimatedReviewTime: number;
    aiLetterProbability: number;
    rtaRisk: number;
  } {
    const baseTime = this.baseReviewTimes[input.submissionType];
    const activeRisks = detectedRisks.filter(r => r.detected);

    // AI letter probability based on risk factors
    let aiLetterProbability = 0.3; // Base probability
    const deficiencyRisks = activeRisks.filter(
      r => r.factor.category === 'TECHNICAL' || r.factor.category === 'COMPLIANCE'
    );
    aiLetterProbability += deficiencyRisks.length * 0.1;
    aiLetterProbability = Math.min(0.9, aiLetterProbability);

    // RTA risk based on completeness
    let rtaRisk = 0.1; // Base RTA risk
    const criticalMissing = activeRisks.filter(
      r => r.factor.severity === 'CRITICAL' && r.confidence > 0.8
    );
    rtaRisk += criticalMissing.length * 0.2;
    rtaRisk = Math.min(0.8, rtaRisk);

    // Estimate review time with potential AI letter delays
    let estimatedReviewTime = baseTime;
    if (aiLetterProbability > 0.5) {
      estimatedReviewTime += 45; // Add time for AI response cycle
    }
    if (aiLetterProbability > 0.7) {
      estimatedReviewTime += 30; // Additional cycle likely
    }

    return {
      estimatedReviewTime: Math.round(estimatedReviewTime),
      aiLetterProbability,
      rtaRisk
    };
  }

  /**
   * Generate outcome scenarios
   */
  generateOutcomeScenarios(
    submissionType: SubmissionType,
    successProbability: number,
    detectedRisks: DetectedRisk[]
  ): OutcomeScenario[] {
    const scenarios: OutcomeScenario[] = [];
    const baseTime = this.baseReviewTimes[submissionType];
    const hasHighRisks = detectedRisks.some(
      r => r.detected && (r.factor.severity === 'HIGH' || r.factor.severity === 'CRITICAL')
    );

    // Best case scenario
    scenarios.push({
      name: 'Best Case - First Cycle Approval',
      probability: successProbability * (hasHighRisks ? 0.3 : 0.5),
      description: 'Submission is approved in first review cycle without additional information requests',
      timeline: baseTime,
      conditions: [
        'All identified risks are mitigated',
        'Documentation is complete and consistent',
        'No unexpected FDA concerns'
      ]
    });

    // Expected case scenario
    scenarios.push({
      name: 'Expected - Approval with AI Letter',
      probability: successProbability * 0.4,
      description: 'Submission receives AI letter, responds successfully, and is approved',
      timeline: baseTime + 60,
      conditions: [
        'Minor deficiencies identified by FDA',
        'Successful response to information request',
        'No major issues discovered during review'
      ]
    });

    // Challenging case scenario
    scenarios.push({
      name: 'Challenging - Multiple Review Cycles',
      probability: successProbability * 0.2,
      description: 'Submission requires multiple rounds of information exchange before approval',
      timeline: baseTime + 120,
      conditions: [
        'Significant deficiencies require multiple responses',
        'Additional testing or documentation required',
        'Extended FDA review due to workload'
      ]
    });

    // Negative scenario
    if (submissionType !== 'IND') {
      scenarios.push({
        name: 'Not Substantially Equivalent / Complete Response Letter',
        probability: 1 - successProbability,
        description: 'Submission does not achieve clearance/approval in current form',
        timeline: baseTime + 150,
        conditions: [
          'Fundamental issues with submission strategy',
          'Unable to adequately address FDA concerns',
          'New safety or efficacy concerns emerge'
        ]
      });
    } else {
      scenarios.push({
        name: 'Clinical Hold',
        probability: 1 - successProbability,
        description: 'IND is placed on clinical hold pending resolution of safety concerns',
        timeline: baseTime + 90,
        conditions: [
          'Safety concerns identified in preclinical data',
          'Protocol design issues affecting patient safety',
          'CMC deficiencies preventing study initiation'
        ]
      });
    }

    return scenarios;
  }

  /**
   * Generate mitigation recommendations
   */
  generateMitigations(topRisks: DetectedRisk[]): MitigationRecommendation[] {
    return topRisks.map(risk => {
      // Calculate expected impact based on risk weight
      const expectedImpact = risk.factor.weight * risk.confidence * 0.5;

      // Determine effort based on risk type
      let effort: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
      if (risk.factor.category === 'TECHNICAL') {
        effort = 'HIGH';
      } else if (risk.factor.category === 'COMPLIANCE') {
        effort = 'MEDIUM';
      } else if (risk.factor.category === 'RESOURCE') {
        effort = 'LOW';
      }

      // Estimate timeline impact
      let timelineImpact = 0;
      if (effort === 'HIGH') timelineImpact = 14;
      else if (effort === 'MEDIUM') timelineImpact = 7;
      else timelineImpact = 3;

      // Get priority from severity
      let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      switch (risk.factor.severity) {
        case 'CRITICAL': priority = 'CRITICAL'; break;
        case 'HIGH': priority = 'HIGH'; break;
        case 'MEDIUM': priority = 'MEDIUM'; break;
        default: priority = 'LOW';
      }

      return {
        riskId: risk.factorId,
        priority,
        action: risk.mitigationRecommendations[0] || risk.factor.mitigationGuidance,
        expectedImpact,
        effort,
        timelineImpact
      };
    });
  }

  /**
   * Get prediction summary for display
   */
  getPredictionSummary(prediction: Prediction): {
    headline: string;
    status: 'FAVORABLE' | 'MODERATE' | 'CHALLENGING' | 'HIGH_RISK';
    keyMetrics: Array<{ label: string; value: string; status: string }>;
    topActions: string[];
  } {
    // Determine status
    let status: 'FAVORABLE' | 'MODERATE' | 'CHALLENGING' | 'HIGH_RISK';
    if (prediction.successProbability >= 0.8) {
      status = 'FAVORABLE';
    } else if (prediction.successProbability >= 0.6) {
      status = 'MODERATE';
    } else if (prediction.successProbability >= 0.4) {
      status = 'CHALLENGING';
    } else {
      status = 'HIGH_RISK';
    }

    // Create headline
    const probability = Math.round(prediction.successProbability * 100);
    let headline: string;
    switch (status) {
      case 'FAVORABLE':
        headline = `Strong position with ${probability}% success probability`;
        break;
      case 'MODERATE':
        headline = `Moderate outlook with ${probability}% success probability - some risks to address`;
        break;
      case 'CHALLENGING':
        headline = `Challenging outlook at ${probability}% - significant mitigation needed`;
        break;
      case 'HIGH_RISK':
        headline = `High risk submission at ${probability}% - recommend strategy review`;
        break;
    }

    // Key metrics
    const keyMetrics = [
      {
        label: 'Success Probability',
        value: `${probability}%`,
        status: prediction.successProbability >= 0.7 ? 'good' : prediction.successProbability >= 0.5 ? 'warning' : 'critical'
      },
      {
        label: 'AI Letter Probability',
        value: `${Math.round(prediction.aiLetterProbability * 100)}%`,
        status: prediction.aiLetterProbability <= 0.3 ? 'good' : prediction.aiLetterProbability <= 0.5 ? 'warning' : 'critical'
      },
      {
        label: 'Est. Review Time',
        value: `${prediction.estimatedReviewTime} days`,
        status: 'neutral'
      },
      {
        label: 'RTA Risk',
        value: `${Math.round(prediction.rtaRisk * 100)}%`,
        status: prediction.rtaRisk <= 0.1 ? 'good' : prediction.rtaRisk <= 0.3 ? 'warning' : 'critical'
      }
    ];

    // Top actions
    const topActions = prediction.mitigations
      .filter(m => m.priority === 'CRITICAL' || m.priority === 'HIGH')
      .slice(0, 3)
      .map(m => m.action);

    return { headline, status, keyMetrics, topActions };
  }
}

export default PredictiveIntelligenceEngine;
