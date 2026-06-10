/**
 * Device Description Checker
 * Phase 3.2 - Automated Risk Detectors
 * 
 * Analyzes device descriptions for completeness, consistency,
 * and compliance with FDA 510(k) requirements.
 */

import type { RiskFactor, DetectedRisk } from '../risk-factors';
import { getRiskFactorByIdGlobal } from '../risk-factors';

export interface DeviceDescriptionInput {
  deviceName: string;
  deviceDescription: string;
  technologyDescription?: string;
  intendedUseEnvironment: string[];
  
  materials?: {
    patientContact: string[];
    nonPatientContact: string[];
    sterilizationMethod?: string;
  };
  
  software?: {
    hasSoftware: boolean;
    softwareLevel?: 'A' | 'B' | 'C'; // IEC 62304 levels
    cybersecurityRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    samdType?: 'SaMD' | 'SiMD' | 'NONE'; // Software as/in Medical Device
  };
  
  powerSource?: {
    type: 'BATTERY' | 'LINE_POWERED' | 'NONE' | 'BOTH';
    wirelessConnectivity?: boolean;
    networkCapability?: boolean;
  };
  
  dimensions?: {
    specified: boolean;
    drawings: boolean;
    tolerances: boolean;
  };
  
  accessories?: {
    list: string[];
    separateClearanceNeeded: boolean;
  };
  
  predicate?: {
    kNumber: string;
    deviceName: string;
    hasComparisonTable: boolean;
  };
}

export interface DeviceDescriptionResult {
  completenessScore: number; // 0.0 - 1.0
  status: 'COMPLETE' | 'NEEDS_IMPROVEMENT' | 'INCOMPLETE';
  sectionScores: {
    basicDescription: number;
    materials: number;
    software: number;
    powerAndConnectivity: number;
    dimensions: number;
    predicateComparison: number;
  };
  missingElements: MissingElement[];
  inconsistencies: DescriptionInconsistency[];
  recommendations: string[];
}

export interface MissingElement {
  section: string;
  element: string;
  importance: 'REQUIRED' | 'RECOMMENDED' | 'CONDITIONAL';
  fdaRequirement?: string;
}

export interface DescriptionInconsistency {
  type: 'INTERNAL' | 'PREDICATE' | 'IFU';
  description: string;
  severity: 'MINOR' | 'MODERATE' | 'MAJOR';
}

/**
 * Device Description Checker
 * Validates device description completeness for 510(k) submissions
 */
export class DeviceDescriptionChecker {
  private readonly requiredSections = [
    'device_name', 'intended_use', 'device_description',
    'materials', 'dimensions', 'operating_environment'
  ];

  private readonly softwareRequiredElements = [
    'software_level', 'hazard_analysis', 'architecture',
    'requirements', 'verification', 'validation'
  ];

  /**
   * Analyze device description
   */
  async analyze(input: DeviceDescriptionInput): Promise<DeviceDescriptionResult> {
    const missingElements: MissingElement[] = [];
    const inconsistencies: DescriptionInconsistency[] = [];

    // Score each section
    const basicScore = this.scoreBasicDescription(input, missingElements);
    const materialsScore = this.scoreMaterials(input, missingElements);
    const softwareScore = this.scoreSoftware(input, missingElements);
    const powerScore = this.scorePowerAndConnectivity(input, missingElements);
    const dimensionsScore = this.scoreDimensions(input, missingElements);
    const predicateScore = this.scorePredicateComparison(input, missingElements);

    // Check for inconsistencies
    this.detectInconsistencies(input, inconsistencies);

    // Calculate overall completeness
    const sectionScores = {
      basicDescription: basicScore,
      materials: materialsScore,
      software: softwareScore,
      powerAndConnectivity: powerScore,
      dimensions: dimensionsScore,
      predicateComparison: predicateScore
    };

    const completenessScore = this.calculateOverallScore(sectionScores, input);

    // Determine status
    const status = this.determineStatus(completenessScore, missingElements);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      missingElements,
      inconsistencies,
      input
    );

    return {
      completenessScore,
      status,
      sectionScores,
      missingElements,
      inconsistencies,
      recommendations
    };
  }

  /**
   * Score basic device description
   */
  private scoreBasicDescription(
    input: DeviceDescriptionInput,
    missing: MissingElement[]
  ): number {
    let score = 0;

    // Device name
    if (input.deviceName && input.deviceName.length > 0) {
      score += 0.2;
    } else {
      missing.push({
        section: 'Basic Description',
        element: 'Device name',
        importance: 'REQUIRED',
        fdaRequirement: '21 CFR 807.87(e)'
      });
    }

    // Device description
    if (input.deviceDescription && input.deviceDescription.length > 100) {
      score += 0.3;
    } else if (input.deviceDescription) {
      score += 0.1;
      missing.push({
        section: 'Basic Description',
        element: 'Detailed device description (current description appears brief)',
        importance: 'REQUIRED'
      });
    } else {
      missing.push({
        section: 'Basic Description',
        element: 'Device description',
        importance: 'REQUIRED',
        fdaRequirement: '21 CFR 807.87(e)'
      });
    }

    // Technology description
    if (input.technologyDescription && input.technologyDescription.length > 50) {
      score += 0.2;
    } else {
      missing.push({
        section: 'Basic Description',
        element: 'Technology/mechanism description',
        importance: 'RECOMMENDED'
      });
    }

    // Intended use environment
    if (input.intendedUseEnvironment && input.intendedUseEnvironment.length > 0) {
      score += 0.3;
    } else {
      missing.push({
        section: 'Basic Description',
        element: 'Intended use environment (home, clinical, hospital, etc.)',
        importance: 'REQUIRED'
      });
    }

    return score;
  }

  /**
   * Score materials section
   */
  private scoreMaterials(
    input: DeviceDescriptionInput,
    missing: MissingElement[]
  ): number {
    if (!input.materials) {
      missing.push({
        section: 'Materials',
        element: 'Materials information',
        importance: 'REQUIRED',
        fdaRequirement: 'FDA Device Description Guidance'
      });
      return 0;
    }

    let score = 0;

    // Patient-contacting materials
    if (input.materials.patientContact && input.materials.patientContact.length > 0) {
      score += 0.5;
    } else {
      missing.push({
        section: 'Materials',
        element: 'Patient-contacting materials list',
        importance: 'REQUIRED'
      });
    }

    // Non-patient-contacting materials
    if (input.materials.nonPatientContact && input.materials.nonPatientContact.length > 0) {
      score += 0.25;
    } else {
      missing.push({
        section: 'Materials',
        element: 'Non-patient-contacting materials',
        importance: 'RECOMMENDED'
      });
    }

    // Sterilization method (if applicable)
    if (input.materials.sterilizationMethod) {
      score += 0.25;
    } else if (input.intendedUseEnvironment.some(env => 
      env.toLowerCase().includes('sterile') || env.toLowerCase().includes('surgical')
    )) {
      missing.push({
        section: 'Materials',
        element: 'Sterilization method',
        importance: 'CONDITIONAL'
      });
    }

    return score;
  }

  /**
   * Score software section
   */
  private scoreSoftware(
    input: DeviceDescriptionInput,
    missing: MissingElement[]
  ): number {
    if (!input.software) {
      // No software section provided - check if description mentions software
      const descriptionLower = input.deviceDescription?.toLowerCase() || '';
      if (descriptionLower.includes('software') || 
          descriptionLower.includes('algorithm') ||
          descriptionLower.includes('app') ||
          descriptionLower.includes('digital')) {
        missing.push({
          section: 'Software',
          element: 'Software documentation section',
          importance: 'REQUIRED',
          fdaRequirement: 'FDA Guidance on Software in Medical Devices'
        });
        return 0;
      }
      return 1.0; // No software applicable
    }

    if (!input.software.hasSoftware) {
      return 1.0; // Explicitly marked as no software
    }

    let score = 0;

    // Software level
    if (input.software.softwareLevel) {
      score += 0.3;
    } else {
      missing.push({
        section: 'Software',
        element: 'IEC 62304 software safety classification',
        importance: 'REQUIRED',
        fdaRequirement: 'IEC 62304'
      });
    }

    // Cybersecurity risk
    if (input.software.cybersecurityRisk) {
      score += 0.25;
    } else if (input.powerSource?.networkCapability || input.powerSource?.wirelessConnectivity) {
      missing.push({
        section: 'Software',
        element: 'Cybersecurity risk assessment',
        importance: 'REQUIRED',
        fdaRequirement: 'FDA Premarket Cybersecurity Guidance'
      });
    }

    // SaMD classification
    if (input.software.samdType) {
      score += 0.25;
    } else {
      missing.push({
        section: 'Software',
        element: 'SaMD/SiMD classification',
        importance: 'RECOMMENDED'
      });
    }

    // Higher requirements for Level C software
    if (input.software.softwareLevel === 'C') {
      score -= 0.1; // Penalize unless additional documentation confirmed
      missing.push({
        section: 'Software',
        element: 'Level C software requires full documentation package',
        importance: 'REQUIRED',
        fdaRequirement: 'IEC 62304 Level C requirements'
      });
    }

    return Math.max(0, score + 0.2); // Base score for having software section
  }

  /**
   * Score power and connectivity section
   */
  private scorePowerAndConnectivity(
    input: DeviceDescriptionInput,
    missing: MissingElement[]
  ): number {
    if (!input.powerSource) {
      // Check if device description suggests powered device
      const descLower = input.deviceDescription?.toLowerCase() || '';
      if (descLower.includes('battery') || 
          descLower.includes('powered') ||
          descLower.includes('electric') ||
          descLower.includes('wireless')) {
        missing.push({
          section: 'Power/Connectivity',
          element: 'Power source information',
          importance: 'REQUIRED'
        });
        return 0;
      }
      return 1.0; // Non-powered device
    }

    let score = 0;

    // Power type specified
    if (input.powerSource.type) {
      score += 0.5;
    }

    // Wireless connectivity
    if (input.powerSource.wirelessConnectivity !== undefined) {
      score += 0.25;
      if (input.powerSource.wirelessConnectivity) {
        // Additional requirements for wireless
        if (!input.software?.cybersecurityRisk) {
          missing.push({
            section: 'Power/Connectivity',
            element: 'Wireless cybersecurity considerations',
            importance: 'REQUIRED',
            fdaRequirement: 'FDA Cybersecurity Guidance'
          });
        }
      }
    }

    // Network capability
    if (input.powerSource.networkCapability !== undefined) {
      score += 0.25;
    }

    return score;
  }

  /**
   * Score dimensions section
   */
  private scoreDimensions(
    input: DeviceDescriptionInput,
    missing: MissingElement[]
  ): number {
    if (!input.dimensions) {
      missing.push({
        section: 'Dimensions',
        element: 'Device dimensions and specifications',
        importance: 'REQUIRED'
      });
      return 0;
    }

    let score = 0;

    if (input.dimensions.specified) {
      score += 0.4;
    } else {
      missing.push({
        section: 'Dimensions',
        element: 'Physical dimensions',
        importance: 'REQUIRED'
      });
    }

    if (input.dimensions.drawings) {
      score += 0.4;
    } else {
      missing.push({
        section: 'Dimensions',
        element: 'Engineering drawings',
        importance: 'RECOMMENDED'
      });
    }

    if (input.dimensions.tolerances) {
      score += 0.2;
    } else {
      missing.push({
        section: 'Dimensions',
        element: 'Manufacturing tolerances',
        importance: 'RECOMMENDED'
      });
    }

    return score;
  }

  /**
   * Score predicate comparison
   */
  private scorePredicateComparison(
    input: DeviceDescriptionInput,
    missing: MissingElement[]
  ): number {
    if (!input.predicate) {
      missing.push({
        section: 'Predicate Comparison',
        element: 'Predicate device information',
        importance: 'REQUIRED',
        fdaRequirement: '21 CFR 807.87(f)'
      });
      return 0;
    }

    let score = 0;

    if (input.predicate.kNumber) {
      score += 0.3;
    }

    if (input.predicate.deviceName) {
      score += 0.2;
    }

    if (input.predicate.hasComparisonTable) {
      score += 0.5;
    } else {
      missing.push({
        section: 'Predicate Comparison',
        element: 'Side-by-side comparison table',
        importance: 'REQUIRED',
        fdaRequirement: 'FDA 510(k) Guidance'
      });
    }

    return score;
  }

  /**
   * Detect inconsistencies in device description
   */
  private detectInconsistencies(
    input: DeviceDescriptionInput,
    inconsistencies: DescriptionInconsistency[]
  ): void {
    const descLower = input.deviceDescription?.toLowerCase() || '';

    // Check for software mentions without software section
    if ((descLower.includes('software') || descLower.includes('algorithm')) && 
        (!input.software || !input.software.hasSoftware)) {
      inconsistencies.push({
        type: 'INTERNAL',
        description: 'Device description mentions software but software section indicates no software',
        severity: 'MAJOR'
      });
    }

    // Check for wireless mentions without connectivity section
    if (descLower.includes('wireless') && !input.powerSource?.wirelessConnectivity) {
      inconsistencies.push({
        type: 'INTERNAL',
        description: 'Device description mentions wireless capability but not reflected in power/connectivity section',
        severity: 'MODERATE'
      });
    }

    // Check for sterile mentions without sterilization method
    if (descLower.includes('sterile') && !input.materials?.sterilizationMethod) {
      inconsistencies.push({
        type: 'INTERNAL',
        description: 'Device description mentions sterile but sterilization method not specified',
        severity: 'MODERATE'
      });
    }
  }

  /**
   * Calculate overall completeness score
   */
  private calculateOverallScore(
    scores: DeviceDescriptionResult['sectionScores'],
    input: DeviceDescriptionInput
  ): number {
    // Weight sections based on device type
    const weights = {
      basicDescription: 0.25,
      materials: 0.15,
      software: 0.20,
      powerAndConnectivity: 0.10,
      dimensions: 0.15,
      predicateComparison: 0.15
    };

    // Adjust weights for non-software devices
    if (!input.software?.hasSoftware) {
      weights.software = 0;
      weights.basicDescription = 0.30;
      weights.materials = 0.20;
      weights.predicateComparison = 0.20;
    }

    // Adjust for non-powered devices
    if (!input.powerSource || input.powerSource.type === 'NONE') {
      weights.powerAndConnectivity = 0;
      weights.basicDescription += 0.05;
      weights.materials += 0.05;
    }

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    
    let weightedScore = 0;
    weightedScore += scores.basicDescription * weights.basicDescription;
    weightedScore += scores.materials * weights.materials;
    weightedScore += scores.software * weights.software;
    weightedScore += scores.powerAndConnectivity * weights.powerAndConnectivity;
    weightedScore += scores.dimensions * weights.dimensions;
    weightedScore += scores.predicateComparison * weights.predicateComparison;

    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  /**
   * Determine overall status
   */
  private determineStatus(
    score: number,
    missing: MissingElement[]
  ): 'COMPLETE' | 'NEEDS_IMPROVEMENT' | 'INCOMPLETE' {
    const requiredMissing = missing.filter(m => m.importance === 'REQUIRED').length;

    if (score >= 0.85 && requiredMissing === 0) {
      return 'COMPLETE';
    }

    if (score >= 0.6 && requiredMissing <= 2) {
      return 'NEEDS_IMPROVEMENT';
    }

    return 'INCOMPLETE';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    missing: MissingElement[],
    inconsistencies: DescriptionInconsistency[],
    input: DeviceDescriptionInput
  ): string[] {
    const recommendations: string[] = [];

    // Required elements first
    const required = missing.filter(m => m.importance === 'REQUIRED');
    for (const elem of required.slice(0, 5)) {
      recommendations.push(`[REQUIRED] Add ${elem.element} to ${elem.section} section`);
    }

    // Major inconsistencies
    const majorInconsistencies = inconsistencies.filter(i => i.severity === 'MAJOR');
    for (const inc of majorInconsistencies) {
      recommendations.push(`[INCONSISTENCY] Resolve: ${inc.description}`);
    }

    // Software-specific recommendations
    if (input.software?.hasSoftware && input.software.softwareLevel === 'C') {
      recommendations.push(
        'Prepare comprehensive Level C software documentation package per IEC 62304'
      );
    }

    // Cybersecurity recommendations
    if (input.powerSource?.networkCapability || input.powerSource?.wirelessConnectivity) {
      recommendations.push(
        'Complete premarket cybersecurity documentation per FDA guidance'
      );
    }

    return recommendations;
  }

  /**
   * Convert analysis to DetectedRisk format
   */
  toDetectedRisks(result: DeviceDescriptionResult): DetectedRisk[] {
    const risks: DetectedRisk[] = [];

    // Insufficient Performance Testing / Documentation (510K-R006)
    if (result.status === 'INCOMPLETE') {
      const factor = getRiskFactorByIdGlobal('510K-R006');
      if (factor) {
        risks.push({
          factorId: '510K-R006',
          factor,
          detected: true,
          confidence: 1 - result.completenessScore,
          evidence: result.missingElements
            .filter(m => m.importance === 'REQUIRED')
            .map(m => `Missing: ${m.element}`),
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.slice(0, 5)
        });
      }
    }

    // Software Documentation Deficiency (510K-R008)
    if (result.sectionScores.software < 0.6) {
      const factor = getRiskFactorByIdGlobal('510K-R008');
      if (factor) {
        risks.push({
          factorId: '510K-R008',
          factor,
          detected: true,
          confidence: 1 - result.sectionScores.software,
          evidence: result.missingElements
            .filter(m => m.section === 'Software')
            .map(m => m.element),
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.filter(r =>
            r.toLowerCase().includes('software') || r.toLowerCase().includes('cyber')
          )
        });
      }
    }

    return risks;
  }
}

export default DeviceDescriptionChecker;
