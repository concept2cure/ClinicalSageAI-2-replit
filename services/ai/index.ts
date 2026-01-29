/**
 * Predictive Intelligence AI Services
 * Phase 3 - Predictive Intelligence Engine
 * 
 * Central export for all AI/ML services for regulatory submission
 * risk analysis, prediction, and proactive monitoring.
 */

// Core Prediction Engine
export { 
  PredictiveIntelligenceEngine,
  type SubmissionType,
  type PredictionInput,
  type Prediction,
  type OutcomeScenario,
  type MitigationRecommendation
} from './PredictiveIntelligenceEngine';

// Risk Factor Definitions
export {
  // Types
  type RiskFactor,
  type RiskSeverity,
  type RiskCategory,
  type DetectedRisk,
  
  // 510(k) Risks
  K510_RISK_FACTORS,
  getRiskFactorById,
  getRiskFactorsByCategory,
  getRiskFactorsBySeverity,
  getHighPriorityRisks,
  calculateWeightedRiskScore,
  
  // IND Risks
  IND_RISK_FACTORS,
  getINDRiskFactorById,
  getINDRiskFactorsByCategory,
  getINDRiskFactorsBySeverity,
  getCMCRisks,
  getPreclinicalSafetyRisks,
  getProtocolRisks,
  getClinicalHoldPredictors,
  
  // Project Health Risks
  PROJECT_HEALTH_RISKS,
  getProjectHealthRiskById,
  getProjectHealthRisksByCategory,
  getTimelineRisks,
  getResourceRisks,
  getComplianceRisks,
  getCriticalProjectHealthRisks,
  calculateProjectHealthScore,
  
  // Combined utilities
  ALL_RISK_FACTORS,
  RISK_FACTOR_COUNTS,
  getRiskFactorsForSubmissionType,
  getRiskFactorByIdGlobal,
  getAllRiskFactorsByCategory,
  getAllRiskFactorsBySeverity,
  getAutomatedRiskFactors,
  getManualRiskFactors
} from './risk-factors';

// Automated Detectors
export {
  // Detectors
  IFUConsistencyDetector,
  PredicateMonitor,
  DeviceDescriptionChecker,
  CMCAnalyzer,
  ProtocolDesignAnalyzer,
  
  // Types
  type IFUAnalysisInput,
  type IFUConsistencyResult,
  type PredicateMonitorInput,
  type PredicateMonitorResult,
  type PredicateDevice,
  type DeviceDescriptionInput,
  type DeviceDescriptionResult,
  type CMCAnalysisInput,
  type CMCAnalysisResult,
  type ProtocolAnalysisInput,
  type ProtocolAnalysisResult,
  
  // Factory and utilities
  createDetector,
  getDetectorsForSubmissionType,
  DETECTOR_METADATA,
  type DetectorType
} from './detectors';

// Proactive Monitoring
export {
  ProactiveMonitoringService,
  type MonitoringConfig,
  type AlertThresholds,
  type NotificationChannel,
  type MonitoredProject,
  type MonitoringCycleResult,
  type Alert,
  type AlertType,
  type EmergingRisk,
  type MonitoringSummary
} from './ProactiveMonitoringService';

// Outcome Scenario Generation
export {
  OutcomeScenarioGenerator,
  type ScenarioGeneratorInput,
  type HistoricalSubmissionData,
  type ProjectCharacteristics,
  type DetailedScenario,
  type TimelineBreakdown,
  type FinancialImpact
} from './OutcomeScenarioGenerator';

/**
 * Create a fully configured predictive intelligence service
 */
export function createPredictiveIntelligenceService(config?: {
  monitoringEnabled?: boolean;
  monitoringIntervalHours?: number;
}) {
  const engine = new PredictiveIntelligenceEngine();
  const scenarioGenerator = new OutcomeScenarioGenerator();
  
  let monitoringService: ProactiveMonitoringService | undefined;
  
  if (config?.monitoringEnabled) {
    const { ProactiveMonitoringService } = require('./ProactiveMonitoringService');
    monitoringService = new ProactiveMonitoringService({
      cycleIntervalHours: config.monitoringIntervalHours ?? 4
    });
  }
  
  return {
    engine,
    scenarioGenerator,
    monitoringService,
    
    /**
     * Generate a complete prediction with scenarios
     */
    async generateCompletePrediction(input: PredictionInput) {
      const prediction = await engine.generatePrediction(input);
      
      const detailedScenarios = scenarioGenerator.generateScenarios({
        submissionType: input.submissionType,
        successProbability: prediction.successProbability,
        detectedRisks: prediction.detectedRisks,
        historicalData: input.historicalContext,
        projectCharacteristics: undefined
      });
      
      return {
        ...prediction,
        detailedScenarios,
        summary: engine.getPredictionSummary(prediction)
      };
    }
  };
}

/**
 * Quick access factory functions
 */
export const AI = {
  createEngine: () => new PredictiveIntelligenceEngine(),
  createMonitoring: (config?: Partial<import('./ProactiveMonitoringService').MonitoringConfig>) => 
    new ProactiveMonitoringService(config),
  createScenarioGenerator: () => new OutcomeScenarioGenerator(),
  
  detectors: {
    ifu: () => new IFUConsistencyDetector(),
    predicate: () => new PredicateMonitor(),
    deviceDescription: () => new DeviceDescriptionChecker(),
    cmc: () => new CMCAnalyzer(),
    protocol: () => new ProtocolDesignAnalyzer()
  }
};

export default AI;
