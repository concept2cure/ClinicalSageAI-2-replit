/**
 * Automated Risk Detectors - Index
 * Phase 3.2 - Predictive Intelligence Engine
 * 
 * Central export for all automated risk detectors.
 */

// 510(k) Detectors
export { IFUConsistencyDetector, type IFUAnalysisInput, type IFUConsistencyResult } from './IFUConsistencyDetector';
export { PredicateMonitor, type PredicateMonitorInput, type PredicateMonitorResult, type PredicateDevice } from './PredicateMonitor';
export { DeviceDescriptionChecker, type DeviceDescriptionInput, type DeviceDescriptionResult } from './DeviceDescriptionChecker';

// IND Detectors
export { CMCAnalyzer, type CMCAnalysisInput, type CMCAnalysisResult } from './CMCAnalyzer';
export { ProtocolDesignAnalyzer, type ProtocolAnalysisInput, type ProtocolAnalysisResult } from './ProtocolDesignAnalyzer';

// Detector factory for easy instantiation
import { IFUConsistencyDetector } from './IFUConsistencyDetector';
import { PredicateMonitor } from './PredicateMonitor';
import { DeviceDescriptionChecker } from './DeviceDescriptionChecker';
import { CMCAnalyzer } from './CMCAnalyzer';
import { ProtocolDesignAnalyzer } from './ProtocolDesignAnalyzer';

export type DetectorType = 
  | 'IFU_CONSISTENCY'
  | 'PREDICATE_MONITOR'
  | 'DEVICE_DESCRIPTION'
  | 'CMC_ANALYZER'
  | 'PROTOCOL_DESIGN';

export type Detector = 
  | IFUConsistencyDetector
  | PredicateMonitor
  | DeviceDescriptionChecker
  | CMCAnalyzer
  | ProtocolDesignAnalyzer;

/**
 * Create a detector instance by type
 */
export function createDetector(type: DetectorType): Detector {
  switch (type) {
    case 'IFU_CONSISTENCY':
      return new IFUConsistencyDetector();
    case 'PREDICATE_MONITOR':
      return new PredicateMonitor();
    case 'DEVICE_DESCRIPTION':
      return new DeviceDescriptionChecker();
    case 'CMC_ANALYZER':
      return new CMCAnalyzer();
    case 'PROTOCOL_DESIGN':
      return new ProtocolDesignAnalyzer();
    default:
      throw new Error(`Unknown detector type: ${type}`);
  }
}

/**
 * Get applicable detectors for a submission type
 */
export function getDetectorsForSubmissionType(
  submissionType: '510k' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO'
): DetectorType[] {
  switch (submissionType) {
    case '510k':
    case 'DE_NOVO':
      return [
        'IFU_CONSISTENCY',
        'PREDICATE_MONITOR',
        'DEVICE_DESCRIPTION'
      ];
    case 'IND':
      return [
        'CMC_ANALYZER',
        'PROTOCOL_DESIGN'
      ];
    case 'NDA':
    case 'BLA':
    case 'MAA':
      return [
        'CMC_ANALYZER',
        'PROTOCOL_DESIGN'
      ];
    case 'PMA':
      return [
        'IFU_CONSISTENCY',
        'PREDICATE_MONITOR',
        'DEVICE_DESCRIPTION',
        'CMC_ANALYZER',
        'PROTOCOL_DESIGN'
      ];
    default:
      return [];
  }
}

/**
 * Detector metadata
 */
export const DETECTOR_METADATA: Record<DetectorType, {
  name: string;
  description: string;
  applicableSubmissions: string[];
  riskFactorsChecked: string[];
}> = {
  'IFU_CONSISTENCY': {
    name: 'IFU Consistency Detector',
    description: 'Analyzes Indications for Use for consistency with labeling and predicate',
    applicableSubmissions: ['510k', 'DE_NOVO', 'PMA'],
    riskFactorsChecked: ['510K-R004', '510K-R005', '510K-R013']
  },
  'PREDICATE_MONITOR': {
    name: 'Predicate Monitor',
    description: 'Monitors predicate device status and substantial equivalence risks',
    applicableSubmissions: ['510k', 'DE_NOVO', 'PMA'],
    riskFactorsChecked: ['510K-R001', '510K-R002', '510K-R003']
  },
  'DEVICE_DESCRIPTION': {
    name: 'Device Description Checker',
    description: 'Validates device description completeness and consistency',
    applicableSubmissions: ['510k', 'DE_NOVO', 'PMA'],
    riskFactorsChecked: ['510K-R006', '510K-R008']
  },
  'CMC_ANALYZER': {
    name: 'CMC Analyzer',
    description: 'Analyzes Chemistry, Manufacturing, and Controls package completeness',
    applicableSubmissions: ['IND', 'NDA', 'BLA', 'MAA', 'PMA'],
    riskFactorsChecked: ['IND-R001', 'IND-R002', 'IND-R003']
  },
  'PROTOCOL_DESIGN': {
    name: 'Protocol Design Analyzer',
    description: 'Analyzes clinical protocol design for safety and regulatory compliance',
    applicableSubmissions: ['IND', 'NDA', 'BLA', 'MAA', 'PMA'],
    riskFactorsChecked: ['IND-R008', 'IND-R009', 'IND-R010']
  }
};
