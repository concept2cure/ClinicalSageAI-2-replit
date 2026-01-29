/**
 * IFU Consistency Detector
 * Phase 3.2 - Automated Risk Detectors
 * 
 * Detects inconsistencies between Indications for Use statements
 * and device labeling, user manuals, and predicate devices.
 */

import type { RiskFactor, DetectedRisk } from '../risk-factors';
import { getRiskFactorByIdGlobal } from '../risk-factors';

export interface IFUAnalysisInput {
  subjectIFU: string;
  predicateIFU?: string;
  deviceLabeling?: string;
  userManual?: string;
  marketingClaims?: string[];
}

export interface IFUConsistencyResult {
  isConsistent: boolean;
  inconsistencies: IFUInconsistency[];
  expansionDetected: boolean;
  ambiguityScore: number; // 0.0 - 1.0 (higher = more ambiguous)
  recommendations: string[];
}

export interface IFUInconsistency {
  type: 'PREDICATE_MISMATCH' | 'LABELING_CONFLICT' | 'CLAIM_MISMATCH' | 'AMBIGUITY';
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  location: string;
}

/**
 * IFU Consistency Detector
 * Analyzes Indications for Use for consistency and regulatory compliance
 */
export class IFUConsistencyDetector {
  private readonly ambiguousTerms = [
    'may', 'might', 'could', 'potentially', 'various', 'multiple',
    'similar', 'related', 'associated', 'certain', 'some', 'general'
  ];

  private readonly broadClaimIndicators = [
    'all patients', 'any patient', 'universal', 'wide range',
    'all indications', 'multiple conditions', 'various diseases'
  ];

  /**
   * Analyze IFU for consistency issues
   */
  async analyze(input: IFUAnalysisInput): Promise<IFUConsistencyResult> {
    const inconsistencies: IFUInconsistency[] = [];
    let expansionDetected = false;

    // Check for predicate IFU expansion
    if (input.predicateIFU) {
      const expansionAnalysis = this.detectIFUExpansion(
        input.subjectIFU,
        input.predicateIFU
      );
      if (expansionAnalysis.expanded) {
        expansionDetected = true;
        inconsistencies.push({
          type: 'PREDICATE_MISMATCH',
          description: `Subject IFU appears to expand beyond predicate indications: ${expansionAnalysis.details}`,
          severity: 'HIGH',
          location: 'Subject IFU vs Predicate IFU'
        });
      }
    }

    // Check for labeling conflicts
    if (input.deviceLabeling) {
      const labelingConflicts = this.detectLabelingConflicts(
        input.subjectIFU,
        input.deviceLabeling
      );
      inconsistencies.push(...labelingConflicts);
    }

    // Check for marketing claim mismatches
    if (input.marketingClaims && input.marketingClaims.length > 0) {
      const claimConflicts = this.detectClaimMismatches(
        input.subjectIFU,
        input.marketingClaims
      );
      inconsistencies.push(...claimConflicts);
    }

    // Calculate ambiguity score
    const ambiguityScore = this.calculateAmbiguityScore(input.subjectIFU);

    if (ambiguityScore > 0.5) {
      inconsistencies.push({
        type: 'AMBIGUITY',
        description: `IFU contains ambiguous language that may require clarification`,
        severity: ambiguityScore > 0.7 ? 'HIGH' : 'MEDIUM',
        location: 'Subject IFU'
      });
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      inconsistencies,
      ambiguityScore,
      expansionDetected
    );

    return {
      isConsistent: inconsistencies.filter(i => i.severity === 'HIGH').length === 0,
      inconsistencies,
      expansionDetected,
      ambiguityScore,
      recommendations
    };
  }

  /**
   * Detect if subject IFU expands beyond predicate indications
   */
  private detectIFUExpansion(
    subjectIFU: string,
    predicateIFU: string
  ): { expanded: boolean; details: string } {
    const subjectLower = subjectIFU.toLowerCase();
    const predicateLower = predicateIFU.toLowerCase();

    // Extract key indication terms
    const subjectIndications = this.extractIndicationTerms(subjectLower);
    const predicateIndications = this.extractIndicationTerms(predicateLower);

    // Find indications in subject not present in predicate
    const newIndications = subjectIndications.filter(
      ind => !predicateIndications.some(
        pred => pred.includes(ind) || ind.includes(pred)
      )
    );

    // Check for population expansions
    const populationExpansions = this.detectPopulationExpansion(
      subjectLower,
      predicateLower
    );

    if (newIndications.length > 0 || populationExpansions.length > 0) {
      const details: string[] = [];
      if (newIndications.length > 0) {
        details.push(`New indications: ${newIndications.join(', ')}`);
      }
      if (populationExpansions.length > 0) {
        details.push(`Population expansions: ${populationExpansions.join(', ')}`);
      }
      return { expanded: true, details: details.join('; ') };
    }

    return { expanded: false, details: '' };
  }

  /**
   * Extract key indication terms from IFU text
   */
  private extractIndicationTerms(text: string): string[] {
    // Common medical indication patterns
    const indicationPatterns = [
      /treatment of ([a-z\s]+)/gi,
      /diagnosis of ([a-z\s]+)/gi,
      /management of ([a-z\s]+)/gi,
      /monitoring ([a-z\s]+)/gi,
      /for use in ([a-z\s]+)/gi,
      /indicated for ([a-z\s]+)/gi
    ];

    const terms: string[] = [];
    for (const pattern of indicationPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        terms.push(match[1].trim());
      }
    }

    return [...new Set(terms)];
  }

  /**
   * Detect population expansions (e.g., pediatric, pregnant)
   */
  private detectPopulationExpansion(subject: string, predicate: string): string[] {
    const populationTerms = [
      { term: 'pediatric', alt: ['children', 'infants', 'neonates', 'adolescents'] },
      { term: 'geriatric', alt: ['elderly', 'older adults'] },
      { term: 'pregnant', alt: ['pregnancy', 'gestational'] },
      { term: 'immunocompromised', alt: ['immunosuppressed'] },
      { term: 'outpatient', alt: ['home use', 'point of care'] }
    ];

    const expansions: string[] = [];

    for (const pop of populationTerms) {
      const allTerms = [pop.term, ...pop.alt];
      const inSubject = allTerms.some(t => subject.includes(t));
      const inPredicate = allTerms.some(t => predicate.includes(t));

      if (inSubject && !inPredicate) {
        expansions.push(pop.term);
      }
    }

    return expansions;
  }

  /**
   * Detect conflicts between IFU and device labeling
   */
  private detectLabelingConflicts(
    ifu: string,
    labeling: string
  ): IFUInconsistency[] {
    const conflicts: IFUInconsistency[] = [];

    const ifuLower = ifu.toLowerCase();
    const labelingLower = labeling.toLowerCase();

    // Check for contraindication mismatches
    const ifuContra = this.extractContraindications(ifuLower);
    const labelingContra = this.extractContraindications(labelingLower);

    const missingInIFU = labelingContra.filter(c => !ifuContra.includes(c));
    if (missingInIFU.length > 0) {
      conflicts.push({
        type: 'LABELING_CONFLICT',
        description: `Contraindications in labeling not reflected in IFU: ${missingInIFU.join(', ')}`,
        severity: 'HIGH',
        location: 'Contraindications'
      });
    }

    return conflicts;
  }

  /**
   * Extract contraindications from text
   */
  private extractContraindications(text: string): string[] {
    const contraPatterns = [
      /contraindicated in ([^.]+)/gi,
      /not intended for ([^.]+)/gi,
      /should not be used ([^.]+)/gi
    ];

    const contras: string[] = [];
    for (const pattern of contraPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        contras.push(match[1].trim());
      }
    }

    return contras;
  }

  /**
   * Detect marketing claim mismatches
   */
  private detectClaimMismatches(
    ifu: string,
    claims: string[]
  ): IFUInconsistency[] {
    const conflicts: IFUInconsistency[] = [];
    const ifuLower = ifu.toLowerCase();

    for (const claim of claims) {
      const claimLower = claim.toLowerCase();
      
      // Check if claim makes statements not supported by IFU
      if (this.broadClaimIndicators.some(ind => claimLower.includes(ind))) {
        if (!ifuLower.includes(claimLower.substring(0, 50))) {
          conflicts.push({
            type: 'CLAIM_MISMATCH',
            description: `Marketing claim "${claim.substring(0, 100)}..." may exceed IFU scope`,
            severity: 'MEDIUM',
            location: 'Marketing Materials'
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Calculate ambiguity score for IFU text
   */
  private calculateAmbiguityScore(ifu: string): number {
    const ifuLower = ifu.toLowerCase();
    const words = ifuLower.split(/\s+/);
    
    let ambiguousCount = 0;
    let broadClaimCount = 0;

    // Count ambiguous terms
    for (const term of this.ambiguousTerms) {
      if (ifuLower.includes(term)) {
        ambiguousCount++;
      }
    }

    // Count broad claim indicators
    for (const indicator of this.broadClaimIndicators) {
      if (ifuLower.includes(indicator)) {
        broadClaimCount++;
      }
    }

    // Calculate score (normalized)
    const ambiguityRatio = ambiguousCount / Math.max(words.length / 20, 1);
    const broadClaimPenalty = broadClaimCount * 0.15;

    return Math.min(1.0, ambiguityRatio + broadClaimPenalty);
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    inconsistencies: IFUInconsistency[],
    ambiguityScore: number,
    expansionDetected: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (expansionDetected) {
      recommendations.push(
        'Consider requesting a pre-submission meeting with FDA to discuss expanded indications'
      );
      recommendations.push(
        'Prepare clinical data to support any new indications beyond predicate'
      );
    }

    if (ambiguityScore > 0.5) {
      recommendations.push(
        'Revise IFU to use more specific language and avoid ambiguous terms'
      );
      recommendations.push(
        'Ensure IFU clearly defines intended patient population'
      );
    }

    const highSeverityCount = inconsistencies.filter(i => i.severity === 'HIGH').length;
    if (highSeverityCount > 0) {
      recommendations.push(
        'Address high-severity inconsistencies before submission to reduce AI letter risk'
      );
    }

    if (inconsistencies.some(i => i.type === 'LABELING_CONFLICT')) {
      recommendations.push(
        'Conduct comprehensive labeling review to ensure consistency across all documents'
      );
    }

    return recommendations;
  }

  /**
   * Convert analysis to DetectedRisk format
   */
  toDetectedRisks(result: IFUConsistencyResult): DetectedRisk[] {
    const risks: DetectedRisk[] = [];

    // Check IFU Expansion (510K-R004)
    if (result.expansionDetected) {
      const factor = getRiskFactorByIdGlobal('510K-R004');
      if (factor) {
        risks.push({
          factorId: '510K-R004',
          factor,
          detected: true,
          confidence: 0.85,
          evidence: result.inconsistencies
            .filter(i => i.type === 'PREDICATE_MISMATCH')
            .map(i => i.description),
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.filter(r =>
            r.toLowerCase().includes('indication') || r.toLowerCase().includes('pre-submission')
          )
        });
      }
    }

    // Check IFU Ambiguity (510K-R005)
    if (result.ambiguityScore > 0.5) {
      const factor = getRiskFactorByIdGlobal('510K-R005');
      if (factor) {
        risks.push({
          factorId: '510K-R005',
          factor,
          detected: true,
          confidence: result.ambiguityScore,
          evidence: [`Ambiguity score: ${(result.ambiguityScore * 100).toFixed(1)}%`],
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.filter(r =>
            r.toLowerCase().includes('ambiguous') || r.toLowerCase().includes('specific')
          )
        });
      }
    }

    // Check Labeling Inconsistency (510K-R013)
    const labelingIssues = result.inconsistencies.filter(i => i.type === 'LABELING_CONFLICT');
    if (labelingIssues.length > 0) {
      const factor = getRiskFactorByIdGlobal('510K-R013');
      if (factor) {
        risks.push({
          factorId: '510K-R013',
          factor,
          detected: true,
          confidence: Math.min(0.9, 0.6 + labelingIssues.length * 0.1),
          evidence: labelingIssues.map(i => i.description),
          detectedAt: new Date(),
          mitigationRecommendations: result.recommendations.filter(r =>
            r.toLowerCase().includes('labeling')
          )
        });
      }
    }

    return risks;
  }
}

export default IFUConsistencyDetector;
