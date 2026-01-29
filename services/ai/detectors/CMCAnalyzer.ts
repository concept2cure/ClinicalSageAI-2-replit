/**
 * CMC Analyzer Detector
 * Phase 3.2 - Automated Risk Detectors
 * 
 * Analyzes Chemistry, Manufacturing, and Controls (CMC) information
 * for IND submissions to detect potential deficiencies.
 */

import type { RiskFactor, DetectedRisk } from '../risk-factors';
import { getRiskFactorByIdGlobal } from '../risk-factors';

export interface CMCAnalysisInput {
  drugSubstance: {
    characterizationComplete: boolean;
    structureElucidation: boolean;
    impurityProfile: boolean;
    specifications: boolean;
    referenceStandard: boolean;
    stabilityData: boolean;
  };
  drugProduct: {
    formulationDefined: boolean;
    manufacturingProcess: boolean;
    containerClosure: boolean;
    specifications: boolean;
    stabilityData: boolean;
  };
  manufacturingInfo: {
    siteIdentified: boolean;
    gmpCompliance: string; // 'FULL' | 'PARTIAL' | 'UNKNOWN'
    batchRecords: boolean;
    processValidation: string; // 'COMPLETE' | 'ONGOING' | 'NOT_STARTED'
  };
  stabilityProgram: {
    longTermStudies: boolean;
    acceleratedStudies: boolean;
    monthsOfData: number;
    proposedShelfLife: number; // months
    proposedTrialDuration: number; // months
  };
  phase: 'PHASE_1' | 'PHASE_2' | 'PHASE_3';
}

export interface CMCAnalysisResult {
  overallReadiness: number; // 0.0 - 1.0
  status: 'READY' | 'NEEDS_WORK' | 'CRITICAL_GAPS';
  drugSubstanceScore: number;
  drugProductScore: number;
  manufacturingScore: number;
  stabilityAdequacy: StabilityAssessment;
  deficiencies: CMCDeficiency[];
  recommendations: string[];
}

export interface StabilityAssessment {
  adequate: boolean;
  dataGap: number; // months of additional data needed
  concerns: string[];
}

export interface CMCDeficiency {
  category: 'DRUG_SUBSTANCE' | 'DRUG_PRODUCT' | 'MANUFACTURING' | 'STABILITY';
  severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';
  description: string;
  fdaRequirement: string;
  remediation: string;
}

/**
 * CMC Analyzer
 * Analyzes CMC package completeness for IND submissions
 */
export class CMCAnalyzer {
  private readonly phaseRequirements = {
    PHASE_1: {
      drugSubstance: { min: 0.6, recommended: 0.8 },
      drugProduct: { min: 0.5, recommended: 0.7 },
      manufacturing: { min: 0.4, recommended: 0.6 },
      stabilityMonths: { min: 1, recommended: 3 }
    },
    PHASE_2: {
      drugSubstance: { min: 0.8, recommended: 0.9 },
      drugProduct: { min: 0.7, recommended: 0.85 },
      manufacturing: { min: 0.6, recommended: 0.8 },
      stabilityMonths: { min: 6, recommended: 12 }
    },
    PHASE_3: {
      drugSubstance: { min: 0.9, recommended: 0.95 },
      drugProduct: { min: 0.85, recommended: 0.95 },
      manufacturing: { min: 0.8, recommended: 0.9 },
      stabilityMonths: { min: 12, recommended: 24 }
    }
  };

  /**
   * Analyze CMC package
   */
  async analyze(input: CMCAnalysisInput): Promise<CMCAnalysisResult> {
    const deficiencies: CMCDeficiency[] = [];

    // Score each CMC section
    const drugSubstanceScore = this.scoreDrugSubstance(input.drugSubstance, deficiencies);
    const drugProductScore = this.scoreDrugProduct(input.drugProduct, deficiencies);
    const manufacturingScore = this.scoreManufacturing(input.manufacturingInfo, deficiencies);

    // Assess stability adequacy
    const stabilityAdequacy = this.assessStability(input.stabilityProgram, input.phase, deficiencies);

    // Calculate overall readiness
    const overallReadiness = this.calculateOverallReadiness(
      drugSubstanceScore,
      drugProductScore,
      manufacturingScore,
      stabilityAdequacy,
      input.phase
    );

    // Determine status
    const status = this.determineStatus(overallReadiness, deficiencies);

    // Generate recommendations
    const recommendations = this.generateRecommendations(deficiencies, input.phase);

    return {
      overallReadiness,
      status,
      drugSubstanceScore,
      drugProductScore,
      manufacturingScore,
      stabilityAdequacy,
      deficiencies,
      recommendations
    };
  }

  /**
   * Score drug substance section
   */
  private scoreDrugSubstance(
    ds: CMCAnalysisInput['drugSubstance'],
    deficiencies: CMCDeficiency[]
  ): number {
    const weights = {
      characterizationComplete: 0.2,
      structureElucidation: 0.25,
      impurityProfile: 0.2,
      specifications: 0.15,
      referenceStandard: 0.1,
      stabilityData: 0.1
    };

    let score = 0;

    if (ds.characterizationComplete) score += weights.characterizationComplete;
    else {
      deficiencies.push({
        category: 'DRUG_SUBSTANCE',
        severity: 'MAJOR',
        description: 'Drug substance characterization incomplete',
        fdaRequirement: '21 CFR 312.23(a)(7)(i)',
        remediation: 'Complete comprehensive characterization including physical and chemical properties'
      });
    }

    if (ds.structureElucidation) score += weights.structureElucidation;
    else {
      deficiencies.push({
        category: 'DRUG_SUBSTANCE',
        severity: 'CRITICAL',
        description: 'Structure elucidation not complete',
        fdaRequirement: 'ICH Q6A',
        remediation: 'Provide complete structural characterization using appropriate analytical methods'
      });
    }

    if (ds.impurityProfile) score += weights.impurityProfile;
    else {
      deficiencies.push({
        category: 'DRUG_SUBSTANCE',
        severity: 'MAJOR',
        description: 'Impurity profile not established',
        fdaRequirement: 'ICH Q3A',
        remediation: 'Establish impurity profile with identification of significant impurities'
      });
    }

    if (ds.specifications) score += weights.specifications;
    else {
      deficiencies.push({
        category: 'DRUG_SUBSTANCE',
        severity: 'MAJOR',
        description: 'Drug substance specifications not defined',
        fdaRequirement: 'ICH Q6A',
        remediation: 'Define specifications with appropriate acceptance criteria'
      });
    }

    if (ds.referenceStandard) score += weights.referenceStandard;
    else {
      deficiencies.push({
        category: 'DRUG_SUBSTANCE',
        severity: 'MODERATE',
        description: 'Reference standard not characterized',
        fdaRequirement: 'ICH Q6A',
        remediation: 'Establish and characterize primary reference standard'
      });
    }

    if (ds.stabilityData) score += weights.stabilityData;
    else {
      deficiencies.push({
        category: 'DRUG_SUBSTANCE',
        severity: 'MODERATE',
        description: 'Drug substance stability data limited',
        fdaRequirement: 'ICH Q1A',
        remediation: 'Generate stability data supporting proposed storage and retest period'
      });
    }

    return score;
  }

  /**
   * Score drug product section
   */
  private scoreDrugProduct(
    dp: CMCAnalysisInput['drugProduct'],
    deficiencies: CMCDeficiency[]
  ): number {
    const weights = {
      formulationDefined: 0.25,
      manufacturingProcess: 0.25,
      containerClosure: 0.15,
      specifications: 0.2,
      stabilityData: 0.15
    };

    let score = 0;

    if (dp.formulationDefined) score += weights.formulationDefined;
    else {
      deficiencies.push({
        category: 'DRUG_PRODUCT',
        severity: 'CRITICAL',
        description: 'Formulation not adequately defined',
        fdaRequirement: '21 CFR 312.23(a)(7)(iv)(a)',
        remediation: 'Provide complete formulation including all components and their functions'
      });
    }

    if (dp.manufacturingProcess) score += weights.manufacturingProcess;
    else {
      deficiencies.push({
        category: 'DRUG_PRODUCT',
        severity: 'MAJOR',
        description: 'Manufacturing process description incomplete',
        fdaRequirement: '21 CFR 312.23(a)(7)(iv)(b)',
        remediation: 'Document manufacturing process with critical steps and parameters'
      });
    }

    if (dp.containerClosure) score += weights.containerClosure;
    else {
      deficiencies.push({
        category: 'DRUG_PRODUCT',
        severity: 'MODERATE',
        description: 'Container closure system not adequately described',
        fdaRequirement: '21 CFR 312.23(a)(7)(iv)(c)',
        remediation: 'Describe container closure system and justify suitability'
      });
    }

    if (dp.specifications) score += weights.specifications;
    else {
      deficiencies.push({
        category: 'DRUG_PRODUCT',
        severity: 'MAJOR',
        description: 'Drug product specifications not defined',
        fdaRequirement: 'ICH Q6A',
        remediation: 'Establish specifications with acceptance criteria for release and stability'
      });
    }

    if (dp.stabilityData) score += weights.stabilityData;
    else {
      deficiencies.push({
        category: 'DRUG_PRODUCT',
        severity: 'MAJOR',
        description: 'Drug product stability data insufficient',
        fdaRequirement: 'ICH Q1A',
        remediation: 'Generate stability data supporting proposed shelf life'
      });
    }

    return score;
  }

  /**
   * Score manufacturing information
   */
  private scoreManufacturing(
    mfg: CMCAnalysisInput['manufacturingInfo'],
    deficiencies: CMCDeficiency[]
  ): number {
    let score = 0;

    if (mfg.siteIdentified) score += 0.3;
    else {
      deficiencies.push({
        category: 'MANUFACTURING',
        severity: 'MAJOR',
        description: 'Manufacturing site not identified',
        fdaRequirement: '21 CFR 312.23(a)(7)',
        remediation: 'Identify manufacturing site with name and address'
      });
    }

    if (mfg.gmpCompliance === 'FULL') score += 0.35;
    else if (mfg.gmpCompliance === 'PARTIAL') {
      score += 0.15;
      deficiencies.push({
        category: 'MANUFACTURING',
        severity: 'MODERATE',
        description: 'GMP compliance not fully established',
        fdaRequirement: '21 CFR 211',
        remediation: 'Ensure manufacturing under GMP conditions appropriate for phase'
      });
    } else {
      deficiencies.push({
        category: 'MANUFACTURING',
        severity: 'MAJOR',
        description: 'GMP compliance status unknown',
        fdaRequirement: '21 CFR 211',
        remediation: 'Document GMP status of manufacturing facility'
      });
    }

    if (mfg.batchRecords) score += 0.2;
    else {
      deficiencies.push({
        category: 'MANUFACTURING',
        severity: 'MODERATE',
        description: 'Batch records not available',
        fdaRequirement: '21 CFR 211.188',
        remediation: 'Prepare batch records for clinical batches'
      });
    }

    if (mfg.processValidation === 'COMPLETE') score += 0.15;
    else if (mfg.processValidation === 'ONGOING') score += 0.1;
    // Process validation not required for early phase

    return score;
  }

  /**
   * Assess stability data adequacy
   */
  private assessStability(
    stability: CMCAnalysisInput['stabilityProgram'],
    phase: CMCAnalysisInput['phase'],
    deficiencies: CMCDeficiency[]
  ): StabilityAssessment {
    const requirements = this.phaseRequirements[phase];
    const concerns: string[] = [];

    // Check if stability data supports trial duration
    const dataNeeded = stability.proposedTrialDuration - stability.monthsOfData;
    const dataGap = Math.max(0, dataNeeded);

    if (stability.monthsOfData < requirements.stabilityMonths.min) {
      concerns.push(`Only ${stability.monthsOfData} months of stability data available, minimum ${requirements.stabilityMonths.min} recommended for ${phase}`);
      deficiencies.push({
        category: 'STABILITY',
        severity: dataGap > 6 ? 'CRITICAL' : 'MAJOR',
        description: `Insufficient stability data for ${phase} IND`,
        fdaRequirement: 'ICH Q1A(R2)',
        remediation: `Generate at least ${requirements.stabilityMonths.min} months of stability data`
      });
    }

    if (dataGap > 0) {
      concerns.push(`Stability data may not support ${stability.proposedTrialDuration} month trial duration`);
    }

    if (!stability.longTermStudies && phase !== 'PHASE_1') {
      concerns.push('Long-term stability studies not initiated');
      deficiencies.push({
        category: 'STABILITY',
        severity: 'MODERATE',
        description: 'Long-term stability studies not in place',
        fdaRequirement: 'ICH Q1A(R2)',
        remediation: 'Initiate long-term stability studies at recommended conditions'
      });
    }

    if (!stability.acceleratedStudies) {
      concerns.push('Accelerated stability studies not performed');
    }

    return {
      adequate: dataGap === 0 && concerns.length < 2,
      dataGap,
      concerns
    };
  }

  /**
   * Calculate overall CMC readiness
   */
  private calculateOverallReadiness(
    drugSubstanceScore: number,
    drugProductScore: number,
    manufacturingScore: number,
    stabilityAdequacy: StabilityAssessment,
    phase: CMCAnalysisInput['phase']
  ): number {
    const requirements = this.phaseRequirements[phase];

    // Weight components by phase importance
    const weights = {
      PHASE_1: { ds: 0.35, dp: 0.30, mfg: 0.20, stab: 0.15 },
      PHASE_2: { ds: 0.30, dp: 0.30, mfg: 0.25, stab: 0.15 },
      PHASE_3: { ds: 0.25, dp: 0.30, mfg: 0.25, stab: 0.20 }
    };

    const phaseWeights = weights[phase];
    const stabilityScore = stabilityAdequacy.adequate ? 1.0 : 0.5;

    return (
      drugSubstanceScore * phaseWeights.ds +
      drugProductScore * phaseWeights.dp +
      manufacturingScore * phaseWeights.mfg +
      stabilityScore * phaseWeights.stab
    );
  }

  /**
   * Determine overall CMC status
   */
  private determineStatus(
    overallReadiness: number,
    deficiencies: CMCDeficiency[]
  ): 'READY' | 'NEEDS_WORK' | 'CRITICAL_GAPS' {
    const hasCritical = deficiencies.some(d => d.severity === 'CRITICAL');
    const majorCount = deficiencies.filter(d => d.severity === 'MAJOR').length;

    if (hasCritical || majorCount >= 3) {
      return 'CRITICAL_GAPS';
    }

    if (overallReadiness >= 0.8 && majorCount === 0) {
      return 'READY';
    }

    return 'NEEDS_WORK';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    deficiencies: CMCDeficiency[],
    phase: CMCAnalysisInput['phase']
  ): string[] {
    const recommendations: string[] = [];

    // Priority recommendations for critical deficiencies
    const critical = deficiencies.filter(d => d.severity === 'CRITICAL');
    for (const def of critical) {
      recommendations.push(`[CRITICAL] ${def.remediation}`);
    }

    // Recommendations for major deficiencies
    const major = deficiencies.filter(d => d.severity === 'MAJOR');
    for (const def of major.slice(0, 3)) { // Limit to top 3
      recommendations.push(`[HIGH PRIORITY] ${def.remediation}`);
    }

    // Phase-specific recommendations
    if (phase === 'PHASE_1') {
      recommendations.push(
        'Focus on drug substance characterization and safety data for Phase 1'
      );
    } else if (phase === 'PHASE_2' || phase === 'PHASE_3') {
      recommendations.push(
        'Ensure manufacturing process is adequately controlled and scalable'
      );
      recommendations.push(
        'Long-term stability data should be initiated if not already in place'
      );
    }

    return recommendations;
  }

  /**
   * Convert analysis to DetectedRisk format
   */
  toDetectedRisks(result: CMCAnalysisResult): DetectedRisk[] {
    const risks: DetectedRisk[] = [];

    // CMC Package Incomplete (IND-R001)
    if (result.status === 'CRITICAL_GAPS' || result.overallReadiness < 0.6) {
      const factor = getRiskFactorByIdGlobal('IND-R001');
      if (factor) {
        risks.push({
          factorId: 'IND-R001',
          factor,
          detected: true,
          confidence: 1 - result.overallReadiness,
          evidence: result.deficiencies
            .filter(d => d.severity === 'CRITICAL' || d.severity === 'MAJOR')
            .map(d => d.description),
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.slice(0, 5)
        });
      }
    }

    // Manufacturing Process Undefined (IND-R002)
    if (result.manufacturingScore < 0.5) {
      const factor = getRiskFactorByIdGlobal('IND-R002');
      if (factor) {
        risks.push({
          factorId: 'IND-R002',
          factor,
          detected: true,
          confidence: 1 - result.manufacturingScore,
          evidence: result.deficiencies
            .filter(d => d.category === 'MANUFACTURING')
            .map(d => d.description),
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.filter(r =>
            r.toLowerCase().includes('manufactur') || r.toLowerCase().includes('process')
          )
        });
      }
    }

    // Stability Data Insufficient (IND-R003)
    if (!result.stabilityAdequacy.adequate) {
      const factor = getRiskFactorByIdGlobal('IND-R003');
      if (factor) {
        risks.push({
          factorId: 'IND-R003',
          factor,
          detected: true,
          confidence: Math.min(0.9, 0.5 + result.stabilityAdequacy.dataGap * 0.05),
          evidence: result.stabilityAdequacy.concerns,
          detectedAt: new Date(),
          mitigationRecommendations: result.deficiencies
            .filter(d => d.category === 'STABILITY')
            .map(d => d.remediation)
        });
      }
    }

    return risks;
  }
}

export default CMCAnalyzer;
