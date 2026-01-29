/**
 * Protocol Design Analyzer
 * Phase 3.2 - Automated Risk Detectors
 * 
 * Analyzes clinical trial protocol design for safety monitoring
 * adequacy, dose escalation strategy, and regulatory compliance.
 */

import type { RiskFactor, DetectedRisk } from '../risk-factors';
import { getRiskFactorByIdGlobal } from '../risk-factors';

export interface ProtocolAnalysisInput {
  trialPhase: 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'PHASE_1_2' | 'PHASE_2_3';
  indication: string;
  therapeuticArea: string;
  
  safetyMonitoring: {
    dsmcPlanned: boolean;
    safetyReviewCommittee: boolean;
    stoppingRules: boolean;
    adverseEventReporting: boolean;
    saeReportingTimeline: number; // hours
    interimAnalyses: number;
  };
  
  doseEscalation?: {
    strategy: 'TRADITIONAL_3+3' | 'MODIFIED_3+3' | 'ACCELERATED' | 'CRM' | 'BOIN' | 'OTHER';
    startingDose: number;
    startingDoseJustification: boolean;
    maxDoseDefined: boolean;
    dltDefinition: boolean;
    dltObservationPeriod: number; // days
    cohortSize: number;
    intraPatientEscalation: boolean;
  };
  
  eligibilityCriteria: {
    inclusionCount: number;
    exclusionCount: number;
    vulnerablePopulations: string[];
    adequateWashout: boolean;
    organFunctionRequirements: boolean;
  };
  
  endpoints: {
    primaryEndpointDefined: boolean;
    primaryEndpointType: 'SAFETY' | 'EFFICACY' | 'PK' | 'PD' | 'COMBINED';
    secondaryEndpoints: number;
    exploratoryEndpoints: number;
    biomarkerEndpoints: boolean;
  };
  
  sampleSize: {
    planned: number;
    justification: boolean;
    powerCalculation?: number; // percentage
  };
}

export interface ProtocolAnalysisResult {
  overallScore: number; // 0.0 - 1.0
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  safetyAssessment: SafetyAssessment;
  doseEscalationAssessment?: DoseEscalationAssessment;
  eligibilityAssessment: EligibilityAssessment;
  designIssues: ProtocolIssue[];
  recommendations: string[];
}

export interface SafetyAssessment {
  adequate: boolean;
  score: number;
  gaps: string[];
}

export interface DoseEscalationAssessment {
  strategyAppropriate: boolean;
  safetyMarginAdequate: boolean;
  dltWindowAdequate: boolean;
  concerns: string[];
}

export interface EligibilityAssessment {
  adequateProtection: boolean;
  vulnerablePopulationConcerns: string[];
  restrictiveness: 'TOO_BROAD' | 'APPROPRIATE' | 'TOO_RESTRICTIVE';
}

export interface ProtocolIssue {
  category: 'SAFETY' | 'DESIGN' | 'ELIGIBILITY' | 'STATISTICAL' | 'REGULATORY';
  severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';
  description: string;
  fdaGuidance?: string;
  recommendation: string;
}

/**
 * Protocol Design Analyzer
 * Analyzes clinical trial protocol for regulatory compliance and safety
 */
export class ProtocolDesignAnalyzer {
  private readonly vulnerablePopulationFlags = [
    'pediatric', 'children', 'pregnant', 'elderly', 'prisoners',
    'cognitively impaired', 'economically disadvantaged'
  ];

  /**
   * Analyze protocol design
   */
  async analyze(input: ProtocolAnalysisInput): Promise<ProtocolAnalysisResult> {
    const issues: ProtocolIssue[] = [];

    // Assess safety monitoring
    const safetyAssessment = this.assessSafetyMonitoring(input, issues);

    // Assess dose escalation (if applicable)
    let doseEscalationAssessment: DoseEscalationAssessment | undefined;
    if (input.doseEscalation && (input.trialPhase === 'PHASE_1' || input.trialPhase === 'PHASE_1_2')) {
      doseEscalationAssessment = this.assessDoseEscalation(input.doseEscalation, issues);
    }

    // Assess eligibility criteria
    const eligibilityAssessment = this.assessEligibility(input.eligibilityCriteria, input.therapeuticArea, issues);

    // Assess statistical design
    this.assessStatisticalDesign(input, issues);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(
      safetyAssessment,
      doseEscalationAssessment,
      eligibilityAssessment,
      issues
    );

    // Determine risk level
    const riskLevel = this.determineRiskLevel(overallScore, issues);

    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, input.trialPhase);

    return {
      overallScore,
      riskLevel,
      safetyAssessment,
      doseEscalationAssessment,
      eligibilityAssessment,
      designIssues: issues,
      recommendations
    };
  }

  /**
   * Assess safety monitoring adequacy
   */
  private assessSafetyMonitoring(
    input: ProtocolAnalysisInput,
    issues: ProtocolIssue[]
  ): SafetyAssessment {
    const gaps: string[] = [];
    let score = 0;

    // DSMC requirement (typically Phase 2/3, sometimes Phase 1)
    if (input.safetyMonitoring.dsmcPlanned) {
      score += 0.2;
    } else if (input.trialPhase === 'PHASE_2' || input.trialPhase === 'PHASE_3' || input.trialPhase === 'PHASE_2_3') {
      gaps.push('Data Safety Monitoring Committee not planned');
      issues.push({
        category: 'SAFETY',
        severity: 'MAJOR',
        description: 'DSMC not planned for Phase 2/3 trial',
        fdaGuidance: 'FDA Guidance on Establishment and Operation of Clinical Trial DSMCs',
        recommendation: 'Establish DSMC with charter defining composition and meeting frequency'
      });
    }

    // Safety review committee
    if (input.safetyMonitoring.safetyReviewCommittee) {
      score += 0.15;
    } else {
      gaps.push('Internal safety review committee not established');
    }

    // Stopping rules
    if (input.safetyMonitoring.stoppingRules) {
      score += 0.25;
    } else {
      gaps.push('Stopping rules not defined');
      issues.push({
        category: 'SAFETY',
        severity: 'CRITICAL',
        description: 'Protocol does not include stopping rules for safety',
        fdaGuidance: 'ICH E6(R2) - GCP',
        recommendation: 'Define clear stopping rules including criteria for pausing enrollment and terminating study'
      });
    }

    // Adverse event reporting
    if (input.safetyMonitoring.adverseEventReporting) {
      score += 0.2;
      
      // Check SAE reporting timeline
      if (input.safetyMonitoring.saeReportingTimeline > 24) {
        gaps.push('SAE reporting timeline exceeds 24 hours');
        issues.push({
          category: 'SAFETY',
          severity: 'MODERATE',
          description: `SAE reporting timeline is ${input.safetyMonitoring.saeReportingTimeline} hours, should be ≤24 hours`,
          fdaGuidance: '21 CFR 312.32',
          recommendation: 'Establish expedited SAE reporting within 24 hours to sponsor'
        });
      }
    } else {
      gaps.push('Adverse event reporting procedures not defined');
      issues.push({
        category: 'SAFETY',
        severity: 'CRITICAL',
        description: 'AE/SAE reporting procedures not adequately defined',
        recommendation: 'Define comprehensive AE/SAE reporting procedures per ICH E2A'
      });
    }

    // Interim analyses
    if (input.safetyMonitoring.interimAnalyses > 0) {
      score += 0.2;
    } else if (input.trialPhase === 'PHASE_3' || input.trialPhase === 'PHASE_2_3') {
      gaps.push('No interim analyses planned for Phase 3');
    }

    return {
      adequate: score >= 0.7 && !issues.some(i => i.severity === 'CRITICAL'),
      score,
      gaps
    };
  }

  /**
   * Assess dose escalation strategy
   */
  private assessDoseEscalation(
    de: NonNullable<ProtocolAnalysisInput['doseEscalation']>,
    issues: ProtocolIssue[]
  ): DoseEscalationAssessment {
    const concerns: string[] = [];
    let strategyAppropriate = true;
    let safetyMarginAdequate = true;
    let dltWindowAdequate = true;

    // Check starting dose justification
    if (!de.startingDoseJustification) {
      strategyAppropriate = false;
      concerns.push('Starting dose justification not provided');
      issues.push({
        category: 'DESIGN',
        severity: 'CRITICAL',
        description: 'Starting dose not justified based on preclinical data',
        fdaGuidance: 'FDA Guidance on Estimating Safe Starting Dose',
        recommendation: 'Justify starting dose based on NOAEL with appropriate safety factor'
      });
    }

    // Check max dose
    if (!de.maxDoseDefined) {
      concerns.push('Maximum dose not defined');
      issues.push({
        category: 'DESIGN',
        severity: 'MAJOR',
        description: 'Maximum planned dose not defined',
        recommendation: 'Define maximum dose based on preclinical toxicology and PK data'
      });
    }

    // Check DLT definition
    if (!de.dltDefinition) {
      strategyAppropriate = false;
      concerns.push('DLT not defined');
      issues.push({
        category: 'DESIGN',
        severity: 'CRITICAL',
        description: 'Dose Limiting Toxicity (DLT) criteria not defined',
        recommendation: 'Provide clear DLT definition with specific toxicity grades and types'
      });
    }

    // Check DLT observation period
    if (de.dltObservationPeriod < 21) {
      dltWindowAdequate = false;
      concerns.push(`DLT observation period (${de.dltObservationPeriod} days) may be too short`);
      issues.push({
        category: 'DESIGN',
        severity: 'MODERATE',
        description: `DLT observation period of ${de.dltObservationPeriod} days may not capture delayed toxicities`,
        recommendation: 'Consider extending DLT observation period based on drug mechanism and expected toxicity timeline'
      });
    }

    // Check cohort size for strategy
    if ((de.strategy === 'TRADITIONAL_3+3' || de.strategy === 'MODIFIED_3+3') && de.cohortSize < 3) {
      safetyMarginAdequate = false;
      concerns.push('Cohort size too small for 3+3 design');
    }

    // Intra-patient escalation concerns
    if (de.intraPatientEscalation) {
      concerns.push('Intra-patient dose escalation included - ensure safety safeguards');
      issues.push({
        category: 'SAFETY',
        severity: 'MINOR',
        description: 'Intra-patient dose escalation may complicate safety assessment',
        recommendation: 'Define clear criteria for intra-patient escalation and safety monitoring'
      });
    }

    return {
      strategyAppropriate,
      safetyMarginAdequate,
      dltWindowAdequate,
      concerns
    };
  }

  /**
   * Assess eligibility criteria
   */
  private assessEligibility(
    ec: ProtocolAnalysisInput['eligibilityCriteria'],
    therapeuticArea: string,
    issues: ProtocolIssue[]
  ): EligibilityAssessment {
    const vulnerablePopulationConcerns: string[] = [];

    // Check for vulnerable populations
    for (const pop of ec.vulnerablePopulations) {
      const popLower = pop.toLowerCase();
      if (this.vulnerablePopulationFlags.some(flag => popLower.includes(flag))) {
        vulnerablePopulationConcerns.push(`Vulnerable population included: ${pop}`);
      }
    }

    if (vulnerablePopulationConcerns.length > 0) {
      issues.push({
        category: 'ELIGIBILITY',
        severity: 'MODERATE',
        description: `Protocol includes vulnerable populations: ${ec.vulnerablePopulations.join(', ')}`,
        fdaGuidance: 'ICH E8 - General Considerations for Clinical Studies',
        recommendation: 'Ensure additional protections are in place for vulnerable populations'
      });
    }

    // Check organ function requirements
    if (!ec.organFunctionRequirements) {
      issues.push({
        category: 'ELIGIBILITY',
        severity: 'MODERATE',
        description: 'Organ function requirements not specified',
        recommendation: 'Define minimum organ function requirements for patient safety'
      });
    }

    // Check washout periods
    if (!ec.adequateWashout) {
      issues.push({
        category: 'ELIGIBILITY',
        severity: 'MODERATE',
        description: 'Washout period for prior therapies not adequately defined',
        recommendation: 'Specify washout periods based on drug half-lives and potential interactions'
      });
    }

    // Assess restrictiveness
    let restrictiveness: 'TOO_BROAD' | 'APPROPRIATE' | 'TOO_RESTRICTIVE';
    const totalCriteria = ec.inclusionCount + ec.exclusionCount;
    
    if (totalCriteria < 10) {
      restrictiveness = 'TOO_BROAD';
      issues.push({
        category: 'ELIGIBILITY',
        severity: 'MINOR',
        description: 'Eligibility criteria may be too broad for adequate safety',
        recommendation: 'Review eligibility criteria for completeness'
      });
    } else if (totalCriteria > 40) {
      restrictiveness = 'TOO_RESTRICTIVE';
      issues.push({
        category: 'ELIGIBILITY',
        severity: 'MINOR',
        description: 'Eligibility criteria may be too restrictive, affecting enrollment feasibility',
        recommendation: 'Review necessity of each criterion to balance safety and enrollment'
      });
    } else {
      restrictiveness = 'APPROPRIATE';
    }

    return {
      adequateProtection: ec.organFunctionRequirements && ec.adequateWashout,
      vulnerablePopulationConcerns,
      restrictiveness
    };
  }

  /**
   * Assess statistical design elements
   */
  private assessStatisticalDesign(
    input: ProtocolAnalysisInput,
    issues: ProtocolIssue[]
  ): void {
    // Check primary endpoint
    if (!input.endpoints.primaryEndpointDefined) {
      issues.push({
        category: 'STATISTICAL',
        severity: 'CRITICAL',
        description: 'Primary endpoint not defined',
        recommendation: 'Define clear, measurable primary endpoint appropriate for trial phase'
      });
    }

    // Check sample size justification
    if (!input.sampleSize.justification) {
      const severity = (input.trialPhase === 'PHASE_3' || input.trialPhase === 'PHASE_2_3') 
        ? 'MAJOR' 
        : 'MODERATE';
      issues.push({
        category: 'STATISTICAL',
        severity,
        description: 'Sample size not statistically justified',
        fdaGuidance: 'ICH E9 - Statistical Principles for Clinical Trials',
        recommendation: 'Provide sample size justification with power calculation if applicable'
      });
    }

    // Check power for efficacy trials
    if (input.endpoints.primaryEndpointType === 'EFFICACY' && input.sampleSize.powerCalculation) {
      if (input.sampleSize.powerCalculation < 80) {
        issues.push({
          category: 'STATISTICAL',
          severity: 'MODERATE',
          description: `Study power of ${input.sampleSize.powerCalculation}% may be insufficient`,
          recommendation: 'Consider increasing sample size to achieve at least 80% power'
        });
      }
    }
  }

  /**
   * Calculate overall protocol design score
   */
  private calculateOverallScore(
    safetyAssessment: SafetyAssessment,
    doseEscalationAssessment: DoseEscalationAssessment | undefined,
    eligibilityAssessment: EligibilityAssessment,
    issues: ProtocolIssue[]
  ): number {
    let score = 0;

    // Safety component (40%)
    score += safetyAssessment.score * 0.4;

    // Dose escalation component (20% if applicable)
    if (doseEscalationAssessment) {
      let deScore = 0;
      if (doseEscalationAssessment.strategyAppropriate) deScore += 0.4;
      if (doseEscalationAssessment.safetyMarginAdequate) deScore += 0.3;
      if (doseEscalationAssessment.dltWindowAdequate) deScore += 0.3;
      score += deScore * 0.2;
    } else {
      // Redistribute weight
      score += safetyAssessment.score * 0.2;
    }

    // Eligibility component (20%)
    let eligibilityScore = 0;
    if (eligibilityAssessment.adequateProtection) eligibilityScore += 0.6;
    if (eligibilityAssessment.restrictiveness === 'APPROPRIATE') eligibilityScore += 0.4;
    else if (eligibilityAssessment.restrictiveness === 'TOO_RESTRICTIVE') eligibilityScore += 0.2;
    score += eligibilityScore * 0.2;

    // Issue penalty (20%)
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const majorCount = issues.filter(i => i.severity === 'MAJOR').length;
    const issuePenalty = Math.min(1, (criticalCount * 0.3 + majorCount * 0.15));
    score += (1 - issuePenalty) * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Determine overall risk level
   */
  private determineRiskLevel(
    score: number,
    issues: ProtocolIssue[]
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const hasCritical = issues.some(i => i.severity === 'CRITICAL');
    const majorCount = issues.filter(i => i.severity === 'MAJOR').length;

    if (hasCritical || majorCount >= 3) {
      return 'CRITICAL';
    }

    if (score < 0.5 || majorCount >= 2) {
      return 'HIGH';
    }

    if (score < 0.7 || majorCount >= 1) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    issues: ProtocolIssue[],
    phase: ProtocolAnalysisInput['trialPhase']
  ): string[] {
    const recommendations: string[] = [];

    // Critical issues first
    const critical = issues.filter(i => i.severity === 'CRITICAL');
    for (const issue of critical) {
      recommendations.push(`[CRITICAL] ${issue.recommendation}`);
    }

    // Major issues
    const major = issues.filter(i => i.severity === 'MAJOR');
    for (const issue of major.slice(0, 3)) {
      recommendations.push(`[HIGH PRIORITY] ${issue.recommendation}`);
    }

    // Phase-specific
    if (phase === 'PHASE_1' || phase === 'PHASE_1_2') {
      recommendations.push('Consider engaging Phase 1 oncology unit with FIH experience');
    }

    if (phase === 'PHASE_3' || phase === 'PHASE_2_3') {
      recommendations.push('Ensure statistical analysis plan is finalized before enrollment');
    }

    return recommendations;
  }

  /**
   * Convert analysis to DetectedRisk format
   */
  toDetectedRisks(result: ProtocolAnalysisResult): DetectedRisk[] {
    const risks: DetectedRisk[] = [];

    // Protocol Design Deficiency (IND-R008)
    if (result.riskLevel === 'CRITICAL' || result.riskLevel === 'HIGH') {
      const factor = getRiskFactorByIdGlobal('IND-R008');
      if (factor) {
        risks.push({
          factorId: 'IND-R008',
          factor,
          detected: true,
          confidence: 1 - result.overallScore,
          evidence: result.designIssues
            .filter(i => i.severity === 'CRITICAL' || i.severity === 'MAJOR')
            .map(i => i.description),
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.slice(0, 5)
        });
      }
    }

    // Dose Escalation Strategy Risk (IND-R009)
    if (result.doseEscalationAssessment && !result.doseEscalationAssessment.strategyAppropriate) {
      const factor = getRiskFactorByIdGlobal('IND-R009');
      if (factor) {
        risks.push({
          factorId: 'IND-R009',
          factor,
          detected: true,
          confidence: 0.8,
          evidence: result.doseEscalationAssessment.concerns,
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.filter(r =>
            r.toLowerCase().includes('dose') || r.toLowerCase().includes('dlt')
          )
        });
      }
    }

    // Inclusion/Exclusion Criteria Risk (IND-R010)
    if (!result.eligibilityAssessment.adequateProtection || 
        result.eligibilityAssessment.vulnerablePopulationConcerns.length > 0) {
      const factor = getRiskFactorByIdGlobal('IND-R010');
      if (factor) {
        risks.push({
          factorId: 'IND-R010',
          factor,
          detected: true,
          confidence: 0.7,
          evidence: [
            ...result.eligibilityAssessment.vulnerablePopulationConcerns,
            ...(result.eligibilityAssessment.adequateProtection ? [] : ['Inadequate safety criteria'])
          ],
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.filter(r =>
            r.toLowerCase().includes('eligib') || r.toLowerCase().includes('population')
          )
        });
      }
    }

    return risks;
  }
}

export default ProtocolDesignAnalyzer;
