/**
 * Outcome Scenario Generator
 * Phase 3.5 - Predictive Intelligence Engine
 * 
 * Generates realistic outcome scenarios for regulatory submissions
 * based on risk analysis, historical data, and project characteristics.
 */

import type { DetectedRisk, RiskFactor, RiskSeverity } from './risk-factors';
import type { SubmissionType, OutcomeScenario, Prediction } from './PredictiveIntelligenceEngine';

export interface ScenarioGeneratorInput {
  submissionType: SubmissionType;
  successProbability: number;
  detectedRisks: DetectedRisk[];
  historicalData?: HistoricalSubmissionData;
  projectCharacteristics?: ProjectCharacteristics;
}

export interface HistoricalSubmissionData {
  therapeuticArea?: string;
  previousSubmissions?: number;
  previousApprovals?: number;
  averageReviewTime?: number;
  aiLetterRate?: number;
  commonDeficiencies?: string[];
}

export interface ProjectCharacteristics {
  novelty: 'STANDARD' | 'MODERATELY_NOVEL' | 'HIGHLY_NOVEL';
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  dataMaturity: 'EARLY' | 'INTERMEDIATE' | 'MATURE';
  sponsorExperience: 'FIRST_TIME' | 'LIMITED' | 'EXPERIENCED' | 'EXPERT';
  fdaInteraction: 'NONE' | 'PRE_SUBMISSION' | 'TYPE_B' | 'TYPE_A' | 'BREAKTHROUGH';
}

export interface DetailedScenario extends OutcomeScenario {
  id: string;
  category: 'BEST_CASE' | 'EXPECTED' | 'CHALLENGING' | 'WORST_CASE';
  triggeringFactors: string[];
  mitigatingActions: string[];
  timelineBreakdown: TimelineBreakdown;
  financialImpact?: FinancialImpact;
  confidenceLevel: number;
}

export interface TimelineBreakdown {
  submissionToRTADecision: number;
  initialReview: number;
  aiLetterResponse?: number;
  secondaryReview?: number;
  finalDecision: number;
  totalDays: number;
}

export interface FinancialImpact {
  additionalCosts?: number;
  delayedRevenue?: number;
  riskToInvestment?: number;
}

/**
 * FDA Review Timeline Constants (in days)
 */
const FDA_REVIEW_TIMELINES: Record<SubmissionType, {
  rtaDecision: number;
  standardReview: number;
  priorityReview?: number;
  aiResponseTime: number;
  postAiReview: number;
}> = {
  '510k': {
    rtaDecision: 15,
    standardReview: 90,
    aiResponseTime: 30,
    postAiReview: 45
  },
  'DE_NOVO': {
    rtaDecision: 15,
    standardReview: 150,
    aiResponseTime: 45,
    postAiReview: 60
  },
  'IND': {
    rtaDecision: 0, // No formal RTA for IND
    standardReview: 30,
    aiResponseTime: 0,
    postAiReview: 0
  },
  'NDA': {
    rtaDecision: 60,
    standardReview: 300,
    priorityReview: 180,
    aiResponseTime: 60,
    postAiReview: 90
  },
  'BLA': {
    rtaDecision: 60,
    standardReview: 300,
    priorityReview: 180,
    aiResponseTime: 60,
    postAiReview: 90
  },
  'PMA': {
    rtaDecision: 45,
    standardReview: 180,
    aiResponseTime: 45,
    postAiReview: 60
  },
  'MAA': {
    rtaDecision: 30,
    standardReview: 210,
    aiResponseTime: 60,
    postAiReview: 90
  }
};

/**
 * Outcome Scenario Generator
 * Generates detailed outcome scenarios for regulatory submissions
 */
export class OutcomeScenarioGenerator {
  /**
   * Generate comprehensive outcome scenarios
   */
  generateScenarios(input: ScenarioGeneratorInput): DetailedScenario[] {
    const scenarios: DetailedScenario[] = [];
    const timelines = FDA_REVIEW_TIMELINES[input.submissionType];

    // Analyze risk landscape
    const riskAnalysis = this.analyzeRisks(input.detectedRisks);

    // Generate Best Case Scenario
    scenarios.push(this.generateBestCase(input, timelines, riskAnalysis));

    // Generate Expected Case Scenario
    scenarios.push(this.generateExpectedCase(input, timelines, riskAnalysis));

    // Generate Challenging Scenario
    scenarios.push(this.generateChallengingCase(input, timelines, riskAnalysis));

    // Generate Worst Case Scenario
    scenarios.push(this.generateWorstCase(input, timelines, riskAnalysis));

    // Adjust probabilities to sum to 1.0
    this.normalizeProbabilities(scenarios);

    return scenarios;
  }

  /**
   * Analyze detected risks for scenario generation
   */
  private analyzeRisks(detectedRisks: DetectedRisk[]): {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    topRiskCategories: string[];
    overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  } {
    const activeRisks = detectedRisks.filter(r => r.detected);
    
    const criticalCount = activeRisks.filter(r => r.factor.severity === 'CRITICAL').length;
    const highCount = activeRisks.filter(r => r.factor.severity === 'HIGH').length;
    const mediumCount = activeRisks.filter(r => r.factor.severity === 'MEDIUM').length;
    const lowCount = activeRisks.filter(r => r.factor.severity === 'LOW').length;

    // Get top risk categories
    const categoryCount = new Map<string, number>();
    for (const risk of activeRisks) {
      const count = categoryCount.get(risk.factor.category) || 0;
      categoryCount.set(risk.factor.category, count + 1);
    }
    const topRiskCategories = [...categoryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    // Determine overall risk level
    let overallRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    if (criticalCount > 0) {
      overallRiskLevel = 'CRITICAL';
    } else if (highCount >= 3) {
      overallRiskLevel = 'HIGH';
    } else if (highCount >= 1 || mediumCount >= 3) {
      overallRiskLevel = 'MODERATE';
    } else {
      overallRiskLevel = 'LOW';
    }

    return {
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      topRiskCategories,
      overallRiskLevel
    };
  }

  /**
   * Generate best case scenario
   */
  private generateBestCase(
    input: ScenarioGeneratorInput,
    timelines: typeof FDA_REVIEW_TIMELINES['510k'],
    riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>
  ): DetailedScenario {
    // Base probability decreases with risks
    let probability = input.successProbability * 0.3;
    
    // Reduce further for high-risk scenarios
    if (riskAnalysis.overallRiskLevel === 'CRITICAL') {
      probability *= 0.1;
    } else if (riskAnalysis.overallRiskLevel === 'HIGH') {
      probability *= 0.3;
    } else if (riskAnalysis.overallRiskLevel === 'MODERATE') {
      probability *= 0.6;
    }

    // Increase for experienced sponsors with FDA interaction
    if (input.projectCharacteristics?.fdaInteraction === 'BREAKTHROUGH') {
      probability *= 1.3;
    } else if (input.projectCharacteristics?.fdaInteraction === 'TYPE_A') {
      probability *= 1.2;
    }

    const timelineBreakdown: TimelineBreakdown = {
      submissionToRTADecision: timelines.rtaDecision,
      initialReview: timelines.standardReview * 0.9, // Faster than average
      finalDecision: 5,
      totalDays: Math.round(timelines.rtaDecision + timelines.standardReview * 0.9 + 5)
    };

    return {
      id: `scenario_best_${Date.now()}`,
      name: this.getBestCaseTitle(input.submissionType),
      probability: Math.min(0.4, probability),
      description: this.getBestCaseDescription(input.submissionType),
      timeline: timelineBreakdown.totalDays,
      conditions: this.getBestCaseConditions(input.submissionType, riskAnalysis),
      category: 'BEST_CASE',
      triggeringFactors: [
        'All identified risks are successfully mitigated before submission',
        'Documentation is complete, accurate, and well-organized',
        'No unexpected FDA reviewer concerns',
        'Favorable predicate/reference product selection (if applicable)'
      ],
      mitigatingActions: this.getMitigatingActions(input.detectedRisks, 'BEST_CASE'),
      timelineBreakdown,
      confidenceLevel: riskAnalysis.overallRiskLevel === 'LOW' ? 0.8 : 0.5
    };
  }

  /**
   * Generate expected case scenario
   */
  private generateExpectedCase(
    input: ScenarioGeneratorInput,
    timelines: typeof FDA_REVIEW_TIMELINES['510k'],
    riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>
  ): DetailedScenario {
    // Expected case is most likely for moderate risk levels
    let probability = input.successProbability * 0.45;

    if (riskAnalysis.overallRiskLevel === 'LOW') {
      probability *= 0.8; // More likely to be best case
    } else if (riskAnalysis.overallRiskLevel === 'CRITICAL') {
      probability *= 0.5; // More likely to be worse
    }

    const aiResponseTime = timelines.aiResponseTime || 30;
    const postAiReview = timelines.postAiReview || 45;

    const timelineBreakdown: TimelineBreakdown = {
      submissionToRTADecision: timelines.rtaDecision,
      initialReview: timelines.standardReview,
      aiLetterResponse: aiResponseTime,
      secondaryReview: postAiReview,
      finalDecision: 10,
      totalDays: Math.round(
        timelines.rtaDecision + 
        timelines.standardReview + 
        aiResponseTime + 
        postAiReview + 
        10
      )
    };

    return {
      id: `scenario_expected_${Date.now()}`,
      name: this.getExpectedCaseTitle(input.submissionType),
      probability: probability,
      description: this.getExpectedCaseDescription(input.submissionType),
      timeline: timelineBreakdown.totalDays,
      conditions: this.getExpectedCaseConditions(input.submissionType, riskAnalysis),
      category: 'EXPECTED',
      triggeringFactors: [
        'Minor deficiencies identified during FDA review',
        'Additional information requested on 1-2 topics',
        'Successful response to FDA questions',
        'No fundamental issues with submission strategy'
      ],
      mitigatingActions: this.getMitigatingActions(input.detectedRisks, 'EXPECTED'),
      timelineBreakdown,
      confidenceLevel: 0.7
    };
  }

  /**
   * Generate challenging case scenario
   */
  private generateChallengingCase(
    input: ScenarioGeneratorInput,
    timelines: typeof FDA_REVIEW_TIMELINES['510k'],
    riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>
  ): DetailedScenario {
    let probability = input.successProbability * 0.15;

    // Increase for high-risk scenarios
    if (riskAnalysis.overallRiskLevel === 'CRITICAL') {
      probability = input.successProbability * 0.3;
    } else if (riskAnalysis.overallRiskLevel === 'HIGH') {
      probability = input.successProbability * 0.25;
    }

    const aiResponseTime = (timelines.aiResponseTime || 30) * 1.5;
    const postAiReview = (timelines.postAiReview || 45) * 1.3;

    const timelineBreakdown: TimelineBreakdown = {
      submissionToRTADecision: timelines.rtaDecision,
      initialReview: timelines.standardReview,
      aiLetterResponse: Math.round(aiResponseTime),
      secondaryReview: Math.round(postAiReview * 2), // Multiple cycles
      finalDecision: 15,
      totalDays: Math.round(
        timelines.rtaDecision + 
        timelines.standardReview + 
        aiResponseTime * 2 + // Multiple AI rounds
        postAiReview * 2 + 
        15
      )
    };

    return {
      id: `scenario_challenging_${Date.now()}`,
      name: 'Challenging - Multiple Review Cycles',
      probability: probability,
      description: 'Submission requires multiple rounds of information exchange before approval',
      timeline: timelineBreakdown.totalDays,
      conditions: this.getChallengingCaseConditions(input.submissionType, riskAnalysis),
      category: 'CHALLENGING',
      triggeringFactors: [
        'Significant deficiencies requiring comprehensive responses',
        'FDA requests additional testing or documentation',
        'Multiple rounds of AI letters',
        'Extended review due to complexity or reviewer workload'
      ],
      mitigatingActions: this.getMitigatingActions(input.detectedRisks, 'CHALLENGING'),
      timelineBreakdown,
      financialImpact: {
        additionalCosts: this.estimateAdditionalCosts(input.submissionType, 'CHALLENGING'),
        delayedRevenue: this.estimateDelayedRevenue(timelineBreakdown.totalDays - timelines.standardReview)
      },
      confidenceLevel: 0.6
    };
  }

  /**
   * Generate worst case scenario
   */
  private generateWorstCase(
    input: ScenarioGeneratorInput,
    timelines: typeof FDA_REVIEW_TIMELINES['510k'],
    riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>
  ): DetailedScenario {
    // Probability is inverse of success probability
    let probability = 1 - input.successProbability;

    // Adjust based on risk level
    if (riskAnalysis.overallRiskLevel === 'CRITICAL') {
      probability = Math.max(probability, 0.3);
    }

    const timelineBreakdown: TimelineBreakdown = {
      submissionToRTADecision: timelines.rtaDecision,
      initialReview: timelines.standardReview,
      aiLetterResponse: timelines.aiResponseTime || 30,
      secondaryReview: timelines.postAiReview || 45,
      finalDecision: 30,
      totalDays: Math.round(
        timelines.rtaDecision + 
        timelines.standardReview + 
        (timelines.aiResponseTime || 30) * 2 + 
        (timelines.postAiReview || 45) * 2 + 
        30
      )
    };

    return {
      id: `scenario_worst_${Date.now()}`,
      name: this.getWorstCaseTitle(input.submissionType),
      probability: probability,
      description: this.getWorstCaseDescription(input.submissionType),
      timeline: timelineBreakdown.totalDays,
      conditions: this.getWorstCaseConditions(input.submissionType, riskAnalysis),
      category: 'WORST_CASE',
      triggeringFactors: this.getWorstCaseTriggers(input.submissionType, riskAnalysis),
      mitigatingActions: this.getMitigatingActions(input.detectedRisks, 'WORST_CASE'),
      timelineBreakdown,
      financialImpact: {
        additionalCosts: this.estimateAdditionalCosts(input.submissionType, 'WORST_CASE'),
        delayedRevenue: this.estimateDelayedRevenue(timelineBreakdown.totalDays * 2),
        riskToInvestment: 0.8
      },
      confidenceLevel: riskAnalysis.criticalCount > 0 ? 0.7 : 0.5
    };
  }

  /**
   * Normalize probabilities to sum to 1.0
   */
  private normalizeProbabilities(scenarios: DetailedScenario[]): void {
    const total = scenarios.reduce((sum, s) => sum + s.probability, 0);
    if (total > 0) {
      for (const scenario of scenarios) {
        scenario.probability = scenario.probability / total;
      }
    }
  }

  /**
   * Get title helpers
   */
  private getBestCaseTitle(type: SubmissionType): string {
    switch (type) {
      case '510k':
      case 'DE_NOVO':
        return 'Best Case - First Cycle Clearance';
      case 'IND':
        return 'Best Case - No Clinical Hold';
      case 'NDA':
      case 'BLA':
        return 'Best Case - First Cycle Approval';
      case 'PMA':
        return 'Best Case - First Cycle Approval';
      case 'MAA':
        return 'Best Case - Day 180 Opinion';
      default:
        return 'Best Case - First Cycle Success';
    }
  }

  private getExpectedCaseTitle(type: SubmissionType): string {
    switch (type) {
      case '510k':
      case 'DE_NOVO':
      case 'PMA':
        return 'Expected - Clearance with AI Letter Response';
      case 'IND':
        return 'Expected - Proceed to Phase 1';
      case 'NDA':
      case 'BLA':
      case 'MAA':
        return 'Expected - Approval with Complete Response';
      default:
        return 'Expected - Success with Minor Delays';
    }
  }

  private getWorstCaseTitle(type: SubmissionType): string {
    switch (type) {
      case '510k':
      case 'DE_NOVO':
        return 'Not Substantially Equivalent / Classification Denied';
      case 'IND':
        return 'Clinical Hold';
      case 'NDA':
      case 'BLA':
      case 'MAA':
        return 'Complete Response Letter / Negative Opinion';
      case 'PMA':
        return 'Not Approvable / Panel Review Required';
      default:
        return 'Negative Outcome';
    }
  }

  /**
   * Get description helpers
   */
  private getBestCaseDescription(type: SubmissionType): string {
    switch (type) {
      case '510k':
        return 'Submission receives SE decision on first review without AI letter';
      case 'DE_NOVO':
        return 'De Novo request is granted on first review cycle';
      case 'IND':
        return 'IND goes into effect after 30-day review with no clinical hold';
      case 'NDA':
      case 'BLA':
        return 'Application receives approval on first review cycle';
      case 'PMA':
        return 'PMA is approved on first review without panel meeting';
      case 'MAA':
        return 'MAA receives positive opinion on Day 180';
      default:
        return 'Best possible outcome achieved';
    }
  }

  private getExpectedCaseDescription(type: SubmissionType): string {
    switch (type) {
      case '510k':
      case 'DE_NOVO':
        return 'Submission receives AI letter, responds successfully, receives clearance';
      case 'IND':
        return 'IND is allowed to proceed after addressing minor questions';
      case 'NDA':
      case 'BLA':
      case 'MAA':
        return 'Application receives questions/issues, adequately addressed in response';
      case 'PMA':
        return 'PMA approved after addressing AI letter requests';
      default:
        return 'Success achieved after addressing reviewer questions';
    }
  }

  private getWorstCaseDescription(type: SubmissionType): string {
    switch (type) {
      case '510k':
        return 'FDA determines device is Not Substantially Equivalent to predicate';
      case 'DE_NOVO':
        return 'FDA denies De Novo classification request';
      case 'IND':
        return 'IND is placed on clinical hold due to safety concerns';
      case 'NDA':
      case 'BLA':
        return 'FDA issues Complete Response Letter requiring significant additional work';
      case 'PMA':
        return 'PMA is not approved, may require panel review or resubmission';
      case 'MAA':
        return 'EMA issues negative opinion or list of outstanding issues';
      default:
        return 'Submission does not achieve desired outcome';
    }
  }

  /**
   * Get conditions helpers
   */
  private getBestCaseConditions(type: SubmissionType, riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>): string[] {
    const conditions = [
      'All identified risks are mitigated before submission',
      'Documentation is complete, accurate, and well-organized'
    ];

    if (riskAnalysis.topRiskCategories.includes('TECHNICAL')) {
      conditions.push('All technical data requirements are fully addressed');
    }
    if (riskAnalysis.topRiskCategories.includes('REGULATORY')) {
      conditions.push('Regulatory strategy aligns with FDA expectations');
    }

    return conditions;
  }

  private getExpectedCaseConditions(type: SubmissionType, riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>): string[] {
    return [
      'Minor deficiencies identified by FDA reviewer',
      'Successful response to 1-2 rounds of questions',
      'No fundamental strategy or safety concerns',
      'Adequate time to prepare thorough response'
    ];
  }

  private getChallengingCaseConditions(type: SubmissionType, riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>): string[] {
    const conditions = [
      'Significant deficiencies requiring multiple responses',
      'Additional testing or documentation required',
      'Extended review due to workload or complexity'
    ];

    if (riskAnalysis.highCount > 2) {
      conditions.push(`${riskAnalysis.highCount} high-severity risks require mitigation`);
    }

    return conditions;
  }

  private getWorstCaseConditions(type: SubmissionType, riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>): string[] {
    const conditions = [
      'Fundamental issues cannot be adequately addressed',
      'Unable to satisfactorily respond to FDA concerns'
    ];

    if (type === '510k' || type === 'DE_NOVO') {
      conditions.push('Predicate device selection invalidated');
      conditions.push('New safety concerns emerge during review');
    } else if (type === 'IND') {
      conditions.push('Preclinical safety data does not support human exposure');
      conditions.push('Protocol design inadequately protects patients');
    }

    return conditions;
  }

  private getWorstCaseTriggers(type: SubmissionType, riskAnalysis: ReturnType<OutcomeScenarioGenerator['analyzeRisks']>): string[] {
    const triggers: string[] = [];

    if (riskAnalysis.criticalCount > 0) {
      triggers.push(`${riskAnalysis.criticalCount} critical risk(s) not addressed`);
    }
    if (riskAnalysis.highCount > 2) {
      triggers.push(`Multiple high-severity risks compound during review`);
    }

    switch (type) {
      case '510k':
      case 'DE_NOVO':
        triggers.push('Technological differences too significant to demonstrate SE');
        triggers.push('FDA determines different regulatory pathway required');
        break;
      case 'IND':
        triggers.push('Safety signal identified in preclinical package');
        triggers.push('CMC deficiencies prevent product manufacture');
        break;
      case 'NDA':
      case 'BLA':
        triggers.push('Efficacy data does not support approval');
        triggers.push('Safety profile not acceptable for indication');
        break;
    }

    return triggers;
  }

  /**
   * Get mitigating actions based on detected risks
   */
  private getMitigatingActions(
    detectedRisks: DetectedRisk[], 
    scenarioType: 'BEST_CASE' | 'EXPECTED' | 'CHALLENGING' | 'WORST_CASE'
  ): string[] {
    const activeRisks = detectedRisks.filter(r => r.detected);
    const actions: string[] = [];

    // Get recommendations from top risks
    for (const risk of activeRisks.slice(0, 5)) {
      if (risk.mitigationRecommendations.length > 0) {
        actions.push(risk.mitigationRecommendations[0]);
      } else {
        actions.push(risk.factor.mitigationGuidance);
      }
    }

    // Add scenario-specific actions
    switch (scenarioType) {
      case 'BEST_CASE':
        actions.push('Complete pre-submission review against RTA criteria');
        break;
      case 'EXPECTED':
        actions.push('Prepare response templates for anticipated questions');
        actions.push('Ensure team availability for rapid AI response');
        break;
      case 'CHALLENGING':
        actions.push('Engage additional consultants for complex areas');
        actions.push('Consider pre-submission meeting for challenging topics');
        break;
      case 'WORST_CASE':
        actions.push('Develop contingency strategy for alternative pathway');
        actions.push('Engage with FDA early to understand concerns');
        break;
    }

    return [...new Set(actions)].slice(0, 6);
  }

  /**
   * Estimate additional costs for scenario
   */
  private estimateAdditionalCosts(type: SubmissionType, scenario: 'CHALLENGING' | 'WORST_CASE'): number {
    const baseCosts: Record<SubmissionType, number> = {
      '510k': 50000,
      'DE_NOVO': 100000,
      'IND': 75000,
      'NDA': 500000,
      'BLA': 500000,
      'PMA': 300000,
      'MAA': 400000
    };

    const multiplier = scenario === 'WORST_CASE' ? 3 : 1.5;
    return baseCosts[type] * multiplier;
  }

  /**
   * Estimate delayed revenue impact
   */
  private estimateDelayedRevenue(delayDays: number): number {
    // Placeholder - would need actual market data
    const dailyRevenueLoss = 50000; // Generic estimate
    return delayDays * dailyRevenueLoss;
  }
}

export default OutcomeScenarioGenerator;
