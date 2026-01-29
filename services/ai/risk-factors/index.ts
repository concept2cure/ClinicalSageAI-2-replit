/**
 * Risk Factor Definitions - Index
 * Phase 3.1 - Predictive Intelligence Engine
 * 
 * Central export for all risk factor definitions.
 * Total: 50+ risk factors across submission types.
 */

// Re-export types and core interfaces
export { 
  type RiskFactor, 
  type RiskSeverity, 
  type RiskCategory, 
  type DetectedRisk 
} from './510k-risks';

// 510(k) Risk Factors
export { 
  K510_RISK_FACTORS,
  getRiskFactorById,
  getRiskFactorsByCategory,
  getRiskFactorsBySeverity,
  getHighPriorityRisks,
  calculateWeightedRiskScore
} from './510k-risks';

// IND Risk Factors
export {
  IND_RISK_FACTORS,
  getINDRiskFactorById,
  getINDRiskFactorsByCategory,
  getINDRiskFactorsBySeverity,
  getCMCRisks,
  getPreclinicalSafetyRisks,
  getProtocolRisks,
  getClinicalHoldPredictors
} from './ind-risks';

// Project Health Risk Factors
export {
  PROJECT_HEALTH_RISKS,
  getProjectHealthRiskById,
  getProjectHealthRisksByCategory,
  getTimelineRisks,
  getResourceRisks,
  getComplianceRisks,
  getCriticalProjectHealthRisks,
  calculateProjectHealthScore
} from './project-health-risks';

// Combined risk factor lookup
import { K510_RISK_FACTORS } from './510k-risks';
import { IND_RISK_FACTORS } from './ind-risks';
import { PROJECT_HEALTH_RISKS } from './project-health-risks';
import type { RiskFactor, RiskCategory, RiskSeverity } from './510k-risks';

/**
 * All risk factors combined
 */
export const ALL_RISK_FACTORS: RiskFactor[] = [
  ...K510_RISK_FACTORS,
  ...IND_RISK_FACTORS,
  ...PROJECT_HEALTH_RISKS
];

/**
 * Risk factor counts by type
 */
export const RISK_FACTOR_COUNTS = {
  '510k': K510_RISK_FACTORS.length,
  'ind': IND_RISK_FACTORS.length,
  'projectHealth': PROJECT_HEALTH_RISKS.length,
  'total': ALL_RISK_FACTORS.length
};

/**
 * Get all risk factors for a submission type
 */
export function getRiskFactorsForSubmissionType(type: '510k' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO'): RiskFactor[] {
  // Project health risks apply to all submission types
  const baseRisks = [...PROJECT_HEALTH_RISKS];
  
  switch (type) {
    case '510k':
    case 'DE_NOVO': // De Novo shares many risks with 510(k)
      return [...baseRisks, ...K510_RISK_FACTORS];
    case 'IND':
      return [...baseRisks, ...IND_RISK_FACTORS];
    case 'NDA':
    case 'BLA':
      // NDA/BLA share many IND risks but at different phases
      return [...baseRisks, ...IND_RISK_FACTORS];
    case 'PMA':
      // PMA has elements of both 510(k) and IND
      return [...baseRisks, ...K510_RISK_FACTORS, ...IND_RISK_FACTORS];
    case 'MAA':
      // MAA (EU) similar to NDA/BLA
      return [...baseRisks, ...IND_RISK_FACTORS];
    default:
      return baseRisks;
  }
}

/**
 * Get risk factor by ID (searches all categories)
 */
export function getRiskFactorByIdGlobal(id: string): RiskFactor | undefined {
  return ALL_RISK_FACTORS.find(rf => rf.id === id);
}

/**
 * Get all risk factors by category
 */
export function getAllRiskFactorsByCategory(category: RiskCategory): RiskFactor[] {
  return ALL_RISK_FACTORS.filter(rf => rf.category === category);
}

/**
 * Get all risk factors by severity
 */
export function getAllRiskFactorsBySeverity(severity: RiskSeverity): RiskFactor[] {
  return ALL_RISK_FACTORS.filter(rf => rf.severity === severity);
}

/**
 * Get all automated-detectable risk factors
 */
export function getAutomatedRiskFactors(): RiskFactor[] {
  return ALL_RISK_FACTORS.filter(rf => rf.detectionMethod === 'AUTOMATED');
}

/**
 * Get risk factors that require human review
 */
export function getManualRiskFactors(): RiskFactor[] {
  return ALL_RISK_FACTORS.filter(rf => 
    rf.detectionMethod === 'MANUAL' || rf.detectionMethod === 'HYBRID'
  );
}
