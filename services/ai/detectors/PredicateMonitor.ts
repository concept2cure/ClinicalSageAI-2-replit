/**
 * Predicate Monitor Detector
 * Phase 3.2 - Automated Risk Detectors
 * 
 * Monitors predicate device status and detects risks related to
 * predicate availability, recalls, and substantial equivalence.
 */

import type { RiskFactor, DetectedRisk } from '../risk-factors';
import { getRiskFactorByIdGlobal } from '../risk-factors';

export interface PredicateDevice {
  id: string;
  kNumber?: string;
  deviceName: string;
  manufacturerName: string;
  productCode: string;
  regulationNumber?: string;
  clearanceDate?: Date;
  indications?: string;
  isPrimary: boolean;
}

export interface PredicateMonitorInput {
  subjectDevice: {
    name: string;
    productCode: string;
    technology: string[];
    indications: string;
  };
  predicates: PredicateDevice[];
  fdaRecallData?: FDARecallInfo[];
  marketStatusData?: DeviceMarketStatus[];
}

export interface FDARecallInfo {
  kNumber: string;
  recallClass: 'I' | 'II' | 'III';
  recallDate: Date;
  recallStatus: 'ONGOING' | 'TERMINATED' | 'COMPLETED';
  reason: string;
}

export interface DeviceMarketStatus {
  kNumber: string;
  status: 'ACTIVE' | 'DISCONTINUED' | 'WITHDRAWN' | 'UNKNOWN';
  lastUpdateDate?: Date;
}

export interface PredicateMonitorResult {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  predicateAssessments: PredicateAssessment[];
  strategyRecommendations: string[];
  multiplePredicateRisk: boolean;
  techGapAnalysis: TechGapAnalysis;
}

export interface PredicateAssessment {
  predicate: PredicateDevice;
  availability: 'AVAILABLE' | 'AT_RISK' | 'UNAVAILABLE';
  recallStatus?: FDARecallInfo;
  marketStatus?: DeviceMarketStatus;
  techSimilarity: number; // 0.0 - 1.0
  issues: string[];
}

export interface TechGapAnalysis {
  significantGaps: TechGap[];
  overallSimilarity: number;
  additionalTestingLikely: boolean;
}

export interface TechGap {
  characteristic: string;
  subjectValue: string;
  predicateValue: string;
  severity: 'MINOR' | 'MODERATE' | 'SIGNIFICANT';
  testingRequired: string[];
}

/**
 * Predicate Monitor
 * Monitors predicate device status and substantial equivalence risks
 */
export class PredicateMonitor {
  private readonly technologyCategories = [
    'materials', 'power_source', 'software', 'connectivity',
    'sterilization', 'patient_contact', 'use_environment'
  ];

  /**
   * Analyze predicate device status and risks
   */
  async analyze(input: PredicateMonitorInput): Promise<PredicateMonitorResult> {
    const predicateAssessments: PredicateAssessment[] = [];
    let multiplePredicateRisk = false;

    // Assess each predicate
    for (const predicate of input.predicates) {
      const assessment = this.assessPredicate(
        predicate,
        input.subjectDevice,
        input.fdaRecallData,
        input.marketStatusData
      );
      predicateAssessments.push(assessment);
    }

    // Check multiple predicate strategy risk
    if (input.predicates.length > 1) {
      multiplePredicateRisk = this.assessMultiplePredicateRisk(
        predicateAssessments
      );
    }

    // Perform tech gap analysis with primary predicate
    const primaryPredicate = input.predicates.find(p => p.isPrimary) || input.predicates[0];
    const techGapAnalysis = this.analyzeTechGaps(
      input.subjectDevice,
      primaryPredicate,
      predicateAssessments.find(a => a.predicate.id === primaryPredicate?.id)
    );

    // Determine overall risk
    const overallRisk = this.calculateOverallRisk(
      predicateAssessments,
      multiplePredicateRisk,
      techGapAnalysis
    );

    // Generate recommendations
    const strategyRecommendations = this.generateRecommendations(
      predicateAssessments,
      multiplePredicateRisk,
      techGapAnalysis
    );

    return {
      overallRisk,
      predicateAssessments,
      strategyRecommendations,
      multiplePredicateRisk,
      techGapAnalysis
    };
  }

  /**
   * Assess a single predicate device
   */
  private assessPredicate(
    predicate: PredicateDevice,
    subjectDevice: PredicateMonitorInput['subjectDevice'],
    recallData?: FDARecallInfo[],
    marketData?: DeviceMarketStatus[]
  ): PredicateAssessment {
    const issues: string[] = [];
    let availability: 'AVAILABLE' | 'AT_RISK' | 'UNAVAILABLE' = 'AVAILABLE';

    // Check recall status
    const recallStatus = recallData?.find(r => r.kNumber === predicate.kNumber);
    if (recallStatus) {
      if (recallStatus.recallClass === 'I') {
        availability = 'UNAVAILABLE';
        issues.push(`Class I recall (${recallStatus.reason})`);
      } else if (recallStatus.recallStatus === 'ONGOING') {
        availability = 'AT_RISK';
        issues.push(`Active Class ${recallStatus.recallClass} recall`);
      }
    }

    // Check market status
    const marketStatus = marketData?.find(m => m.kNumber === predicate.kNumber);
    if (marketStatus) {
      if (marketStatus.status === 'DISCONTINUED' || marketStatus.status === 'WITHDRAWN') {
        availability = availability === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AT_RISK';
        issues.push(`Device is ${marketStatus.status.toLowerCase()}`);
      }
    }

    // Calculate technology similarity
    const techSimilarity = this.calculateTechSimilarity(subjectDevice, predicate);
    if (techSimilarity < 0.7) {
      issues.push('Significant technological differences with predicate');
    }

    // Check clearance age
    if (predicate.clearanceDate) {
      const yearsOld = (Date.now() - predicate.clearanceDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (yearsOld > 15) {
        issues.push(`Predicate clearance is ${Math.floor(yearsOld)} years old`);
      }
    }

    return {
      predicate,
      availability,
      recallStatus,
      marketStatus,
      techSimilarity,
      issues
    };
  }

  /**
   * Calculate technology similarity between devices
   */
  private calculateTechSimilarity(
    subject: PredicateMonitorInput['subjectDevice'],
    predicate: PredicateDevice
  ): number {
    // Product code match is a strong indicator
    if (subject.productCode === predicate.productCode) {
      return 0.85; // Same product code indicates high similarity
    }

    // Basic heuristic - would need more device data for accurate calculation
    return 0.65; // Default moderate similarity
  }

  /**
   * Assess risk of multiple predicate strategy
   */
  private assessMultiplePredicateRisk(assessments: PredicateAssessment[]): boolean {
    // Multiple predicates is risky if:
    // 1. More than 2 predicates
    // 2. Predicates have different product codes
    // 3. Any predicate has issues

    if (assessments.length > 2) return true;

    const productCodes = new Set(assessments.map(a => a.predicate.productCode));
    if (productCodes.size > 1) return true;

    if (assessments.some(a => a.issues.length > 0)) return true;

    return false;
  }

  /**
   * Analyze technology gaps between subject and predicate
   */
  private analyzeTechGaps(
    subject: PredicateMonitorInput['subjectDevice'],
    predicate: PredicateDevice | undefined,
    assessment: PredicateAssessment | undefined
  ): TechGapAnalysis {
    const gaps: TechGap[] = [];

    // In a real implementation, this would compare detailed device specifications
    // For now, we'll create a placeholder analysis based on available data

    const overallSimilarity = assessment?.techSimilarity ?? 0.7;

    if (overallSimilarity < 0.7) {
      gaps.push({
        characteristic: 'Technology Platform',
        subjectValue: subject.technology.join(', ') || 'Not specified',
        predicateValue: 'Traditional technology',
        severity: 'MODERATE',
        testingRequired: ['Performance testing', 'Equivalence demonstration']
      });
    }

    return {
      significantGaps: gaps,
      overallSimilarity,
      additionalTestingLikely: gaps.some(g => g.severity === 'SIGNIFICANT')
    };
  }

  /**
   * Calculate overall predicate-related risk
   */
  private calculateOverallRisk(
    assessments: PredicateAssessment[],
    multiplePredicateRisk: boolean,
    techGapAnalysis: TechGapAnalysis
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // Critical if any predicate is unavailable
    if (assessments.some(a => a.availability === 'UNAVAILABLE')) {
      return 'CRITICAL';
    }

    // High if primary predicate at risk or significant tech gaps
    const primaryAssessment = assessments.find(a => a.predicate.isPrimary);
    if (primaryAssessment?.availability === 'AT_RISK') {
      return 'HIGH';
    }

    if (techGapAnalysis.significantGaps.some(g => g.severity === 'SIGNIFICANT')) {
      return 'HIGH';
    }

    // Medium if multiple predicate risk or moderate gaps
    if (multiplePredicateRisk) {
      return 'MEDIUM';
    }

    if (techGapAnalysis.overallSimilarity < 0.7) {
      return 'MEDIUM';
    }

    // Low otherwise
    return 'LOW';
  }

  /**
   * Generate strategy recommendations
   */
  private generateRecommendations(
    assessments: PredicateAssessment[],
    multiplePredicateRisk: boolean,
    techGapAnalysis: TechGapAnalysis
  ): string[] {
    const recommendations: string[] = [];

    // Unavailable predicate recommendations
    const unavailable = assessments.filter(a => a.availability === 'UNAVAILABLE');
    if (unavailable.length > 0) {
      recommendations.push(
        'Identify alternative predicate devices due to unavailable predicate'
      );
      recommendations.push(
        'Consider requesting FDA pre-submission meeting to discuss predicate strategy'
      );
    }

    // At-risk predicate recommendations
    const atRisk = assessments.filter(a => a.availability === 'AT_RISK');
    if (atRisk.length > 0) {
      recommendations.push(
        'Monitor predicate device status closely and prepare backup strategy'
      );
    }

    // Multiple predicate recommendations
    if (multiplePredicateRisk) {
      recommendations.push(
        'Strengthen substantial equivalence justification for multiple predicate approach'
      );
      recommendations.push(
        'Consider consolidating to single primary predicate if possible'
      );
    }

    // Tech gap recommendations
    if (techGapAnalysis.additionalTestingLikely) {
      recommendations.push(
        'Prepare additional performance testing data to address technological differences'
      );
    }

    if (techGapAnalysis.overallSimilarity < 0.6) {
      recommendations.push(
        'Evaluate if De Novo classification request may be more appropriate than 510(k)'
      );
    }

    return recommendations;
  }

  /**
   * Convert analysis to DetectedRisk format
   */
  toDetectedRisks(result: PredicateMonitorResult): DetectedRisk[] {
    const risks: DetectedRisk[] = [];

    // Check Predicate Unavailable (510K-R001)
    const unavailable = result.predicateAssessments.filter(a => a.availability === 'UNAVAILABLE');
    if (unavailable.length > 0) {
      const factor = getRiskFactorByIdGlobal('510K-R001');
      if (factor) {
        risks.push({
          factorId: '510K-R001',
          factor,
          detected: true,
          confidence: 0.95,
          evidence: unavailable.flatMap(a => a.issues),
          detectedAt: new Date(),
          mitigationRecommendations: result.strategyRecommendations.filter(r =>
            r.toLowerCase().includes('alternative') || r.toLowerCase().includes('pre-submission')
          )
        });
      }
    }

    // Check Tech Gap (510K-R002)
    if (result.techGapAnalysis.significantGaps.length > 0) {
      const factor = getRiskFactorByIdGlobal('510K-R002');
      if (factor) {
        risks.push({
          factorId: '510K-R002',
          factor,
          detected: true,
          confidence: 1 - result.techGapAnalysis.overallSimilarity,
          evidence: result.techGapAnalysis.significantGaps.map(g =>
            `${g.characteristic}: ${g.subjectValue} vs ${g.predicateValue}`
          ),
          detectedAt: new Date(),
          mitigationRecommendations: result.strategyRecommendations.filter(r =>
            r.toLowerCase().includes('testing') || r.toLowerCase().includes('performance')
          )
        });
      }
    }

    // Check Multiple Predicate Risk (510K-R003)
    if (result.multiplePredicateRisk) {
      const factor = getRiskFactorByIdGlobal('510K-R003');
      if (factor) {
        risks.push({
          factorId: '510K-R003',
          factor,
          detected: true,
          confidence: 0.75,
          evidence: ['Multiple predicate strategy introduces complexity'],
          detectedAt: new Date(),
          mitigationRecommendations: result.strategyRecommendations.filter(r =>
            r.toLowerCase().includes('predicate') || r.toLowerCase().includes('consolidat')
          )
        });
      }
    }

    return risks;
  }
}

export default PredicateMonitor;
