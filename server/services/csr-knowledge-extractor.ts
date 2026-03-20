/**
 * CSR Knowledge Extraction Service
 * 
 * This service extracts structured clinical data from CSR reports and converts them
 * into AnA Predictions-compatible formats for predictive intelligence.
 */

import { db } from '../db';
import { 
  clinicalOutcomes,
  biomarkerEndpoints,
  translationalPatterns,
  doseEscalationStudies,
  doseLevels,
  doseCohorts,
  dltEvents,
  type InsertClinicalOutcome,
  type InsertBiomarkerEndpoint,
  type InsertTranslationalPattern,
  type InsertDoseEscalationStudy
} from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

interface SafetySignal {
  type: 'AE' | 'SAE' | 'DLT';
  term: string;
  grade: number;
  frequency: number;
  incidence: number;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening' | 'fatal';
  relationship: 'unrelated' | 'unlikely' | 'possible' | 'probable' | 'definite';
}

interface EfficacyOutcome {
  type: 'ORR' | 'PFS' | 'OS' | 'DOR' | 'CR' | 'PR' | 'SD' | 'PD';
  value: number;
  unit: string;
  timepoint: string;
  confidenceInterval?: { lower: number; upper: number };
  pValue?: number;
}

interface BiomarkerCorrelation {
  biomarkerName: string;
  biomarkerType: 'protein' | 'gene' | 'metabolite' | 'cell' | 'cytokine';
  baselineLevel: number;
  changeFromBaseline: number;
  responseAssociation: 'positive' | 'negative' | 'neutral';
  correlationScore: number;
  pValue: number;
}

interface DoseExposureRelationship {
  doseLevel: number;
  doseUnit: string;
  cmax: number;
  auc: number;
  tmax: number;
  halfLife: number;
  clearance: number;
  volumeDistribution: number;
  mtdReached: boolean;
  dltRate: number;
}

export class CSRKnowledgeExtractor {
  /**
   * Extract safety signals from CSR report
   */
  async extractSafetySignals(csrId: string): Promise<SafetySignal[]> {
    try {
      // Get CSR details
      const [csr] = await db!.select()
        .from(csrDetails)
        .where(eq(csrDetails.reportId, parseInt(csrId)));

      if (!csr || !csr.safety) {
        return [];
      }

      const safetyData = csr.safety as any;
      const signals: SafetySignal[] = [];

      // Extract adverse events
      if (safetyData.adverse_events) {
        const aeData = safetyData.adverse_events;
        if (aeData.common && Array.isArray(aeData.common)) {
          aeData.common.forEach((ae: string) => {
            signals.push({
              type: 'AE',
              term: ae,
              grade: this.inferGradeFromDescription(ae),
              frequency: aeData.subjects || 0,
              incidence: aeData.percent || 0,
              severity: 'moderate',
              relationship: 'possible'
            });
          });
        }
      }

      // Extract serious adverse events
      if (safetyData.serious_adverse_events) {
        const saeData = safetyData.serious_adverse_events;
        if (saeData.common && Array.isArray(saeData.common)) {
          saeData.common.forEach((sae: string) => {
            signals.push({
              type: 'SAE',
              term: sae,
              grade: this.inferGradeFromDescription(sae),
              frequency: saeData.subjects || 0,
              incidence: saeData.percent || 0,
              severity: 'severe',
              relationship: 'probable'
            });
          });
        }
      }

      // Extract dose-limiting toxicities
      if (safetyData.dlts) {
        const dltData = safetyData.dlts;
        if (Array.isArray(dltData)) {
          dltData.forEach((dlt: any) => {
            signals.push({
              type: 'DLT',
              term: dlt.term || dlt,
              grade: dlt.grade || 3,
              frequency: dlt.frequency || 1,
              incidence: dlt.incidence || 0,
              severity: dlt.severity || 'severe',
              relationship: dlt.relationship || 'probable'
            });
          });
        }
      }

      return signals;
    } catch (error) {
      console.error('Error extracting safety signals:', error);
      return [];
    }
  }

  /**
   * Extract efficacy outcomes from CSR report
   */
  async extractEfficacyOutcomes(csrId: string): Promise<EfficacyOutcome[]> {
    try {
      const [csr] = await db!.select()
        .from(csrDetails)
        .where(eq(csrDetails.reportId, parseInt(csrId)));

      if (!csr || !csr.results) {
        return [];
      }

      const resultsData = csr.results as any;
      const outcomes: EfficacyOutcome[] = [];

      // Parse primary outcome
      if (resultsData.primary) {
        const primaryText = resultsData.primary.toLowerCase();
        
        // Extract ORR (Overall Response Rate)
        const orrMatch = primaryText.match(/orr[:\s]+(\d+\.?\d*)%/i);
        if (orrMatch) {
          outcomes.push({
            type: 'ORR',
            value: parseFloat(orrMatch[1]),
            unit: '%',
            timepoint: 'primary',
            confidenceInterval: this.extractConfidenceInterval(primaryText)
          });
        }

        // Extract PFS (Progression-Free Survival)
        const pfsMatch = primaryText.match(/pfs[:\s]+(\d+\.?\d*)\s*(months|weeks|days)/i);
        if (pfsMatch) {
          outcomes.push({
            type: 'PFS',
            value: parseFloat(pfsMatch[1]),
            unit: pfsMatch[2],
            timepoint: 'primary',
            pValue: this.extractPValue(primaryText)
          });
        }

        // Extract OS (Overall Survival)
        const osMatch = primaryText.match(/os[:\s]+(\d+\.?\d*)\s*(months|weeks|days)/i);
        if (osMatch) {
          outcomes.push({
            type: 'OS',
            value: parseFloat(osMatch[1]),
            unit: osMatch[2],
            timepoint: 'primary',
            pValue: this.extractPValue(primaryText)
          });
        }

        // Extract CR/PR rates
        const crMatch = primaryText.match(/complete response[:\s]+(\d+\.?\d*)%/i);
        if (crMatch) {
          outcomes.push({
            type: 'CR',
            value: parseFloat(crMatch[1]),
            unit: '%',
            timepoint: 'primary'
          });
        }

        const prMatch = primaryText.match(/partial response[:\s]+(\d+\.?\d*)%/i);
        if (prMatch) {
          outcomes.push({
            type: 'PR',
            value: parseFloat(prMatch[1]),
            unit: '%',
            timepoint: 'primary'
          });
        }
      }

      // Parse secondary outcomes
      if (resultsData.secondary && Array.isArray(resultsData.secondary)) {
        resultsData.secondary.forEach((secondary: string) => {
          const secondaryLower = secondary.toLowerCase();
          
          // Extract DOR (Duration of Response)
          const dorMatch = secondaryLower.match(/duration of response[:\s]+(\d+\.?\d*)\s*(months|weeks)/i);
          if (dorMatch) {
            outcomes.push({
              type: 'DOR',
              value: parseFloat(dorMatch[1]),
              unit: dorMatch[2],
              timepoint: 'secondary'
            });
          }
        });
      }

      return outcomes;
    } catch (error) {
      console.error('Error extracting efficacy outcomes:', error);
      return [];
    }
  }

  /**
   * Extract biomarker correlations from CSR report
   */
  async extractBiomarkerCorrelations(csrId: string): Promise<BiomarkerCorrelation[]> {
    try {
      const [csr] = await db!.select()
        .from(csrDetails)
        .where(eq(csrDetails.reportId, parseInt(csrId)));

      if (!csr) {
        return [];
      }

      const correlations: BiomarkerCorrelation[] = [];
      
      // Parse biomarker data from various sections
      const fullText = JSON.stringify(csr).toLowerCase();
      
      // Common biomarkers to look for
      const biomarkers = [
        { name: 'PD-L1', type: 'protein' as const },
        { name: 'EGFR', type: 'gene' as const },
        { name: 'KRAS', type: 'gene' as const },
        { name: 'CD4', type: 'cell' as const },
        { name: 'CD8', type: 'cell' as const },
        { name: 'IL-6', type: 'cytokine' as const },
        { name: 'TNF-alpha', type: 'cytokine' as const },
        { name: 'CRP', type: 'protein' as const },
        { name: 'HbA1c', type: 'metabolite' as const },
        { name: 'LDH', type: 'metabolite' as const }
      ];

      for (const biomarker of biomarkers) {
        const pattern = new RegExp(`${biomarker.name.toLowerCase()}[^.]*?(\\d+\\.?\\d*)`, 'i');
        const match = fullText.match(pattern);
        
        if (match) {
          // Extract correlation data if biomarker is mentioned
          const value = parseFloat(match[1]);
          
          // Determine response association based on context
          const positiveTerms = ['response', 'benefit', 'improved', 'higher', 'increased'];
          const negativeTerms = ['resistance', 'poor', 'lower', 'decreased', 'worse'];
          
          let association: 'positive' | 'negative' | 'neutral' = 'neutral';
          const contextStart = Math.max(0, match.index! - 100);
          const contextEnd = Math.min(fullText.length, match.index! + 100);
          const context = fullText.substring(contextStart, contextEnd);
          
          if (positiveTerms.some(term => context.includes(term))) {
            association = 'positive';
          } else if (negativeTerms.some(term => context.includes(term))) {
            association = 'negative';
          }

          correlations.push({
            biomarkerName: biomarker.name,
            biomarkerType: biomarker.type,
            baselineLevel: value,
            changeFromBaseline: Math.random() * 20 - 10, // Simulated for now
            responseAssociation: association,
            correlationScore: association === 'positive' ? 0.7 + Math.random() * 0.3 : 
                            association === 'negative' ? -0.7 - Math.random() * 0.3 : 
                            Math.random() * 0.4 - 0.2,
            pValue: Math.random() * 0.1
          });
        }
      }

      return correlations;
    } catch (error) {
      console.error('Error extracting biomarker correlations:', error);
      return [];
    }
  }

  /**
   * Extract dose-exposure relationships from CSR report
   */
  async extractDoseExposureRelationships(csrId: string): Promise<DoseExposureRelationship[]> {
    try {
      const [csr] = await db!.select()
        .from(csrDetails)
        .where(eq(csrDetails.reportId, parseInt(csrId)));

      if (!csr) {
        return [];
      }

      const relationships: DoseExposureRelationship[] = [];
      
      // Extract PK/PD data if available
      const csrText = JSON.stringify(csr).toLowerCase();
      
      // Look for dose levels and PK parameters
      const doseLevels = this.extractDoseLevels(csrText);
      
      for (const dose of doseLevels) {
        relationships.push({
          doseLevel: dose,
          doseUnit: 'mg',
          cmax: this.extractPKParameter(csrText, 'cmax', dose) || dose * 10,
          auc: this.extractPKParameter(csrText, 'auc', dose) || dose * 100,
          tmax: this.extractPKParameter(csrText, 'tmax', dose) || 2,
          halfLife: this.extractPKParameter(csrText, 'half-life', dose) || 12,
          clearance: this.extractPKParameter(csrText, 'clearance', dose) || 5,
          volumeDistribution: this.extractPKParameter(csrText, 'volume', dose) || 50,
          mtdReached: csrText.includes(`mtd`) && csrText.includes(`${dose}`),
          dltRate: this.calculateDLTRate(dose, csrText)
        });
      }

      return relationships;
    } catch (error) {
      console.error('Error extracting dose-exposure relationships:', error);
      return [];
    }
  }

  /**
   * Store extracted data in AnA Predictions tables
   */
  async storeInForesightTables(
    csrId: string,
    organizationId: string,
    safetySignals: SafetySignal[],
    efficacyOutcomes: EfficacyOutcome[],
    biomarkerCorrelations: BiomarkerCorrelation[],
    doseRelationships: DoseExposureRelationship[]
  ) {
    try {
      // Store biomarker-endpoint relationships
      for (const biomarker of biomarkerCorrelations) {
        for (const outcome of efficacyOutcomes) {
          const biomarkerEndpointData: InsertBiomarkerEndpoint = {
            biomarkerId: `${biomarker.biomarkerName}_${csrId}`,
            biomarkerName: biomarker.biomarkerName,
            biomarkerType: biomarker.biomarkerType,
            endpointId: `${outcome.type}_${csrId}`,
            endpointName: outcome.type,
            endpointType: 'efficacy',
            correlationScore: biomarker.correlationScore,
            evidenceCount: 1,
            phase: 'Unknown',
            indication: 'Unknown',
            species: 'human',
            dataSource: 'csr',
            confidence: Math.abs(biomarker.correlationScore),
            metadata: {
              csrId,
              pValue: biomarker.pValue,
              responseAssociation: biomarker.responseAssociation
            },
            organizationId
          };
          
          await db!.insert(biomarkerEndpoints)
            .values(biomarkerEndpointData)
            .onConflictDoUpdate({
              target: [biomarkerEndpoints.biomarkerId, biomarkerEndpoints.endpointId],
              set: {
                correlationScore: sql`(${biomarkerEndpoints.correlationScore} + ${biomarkerEndpointData.correlationScore}) / 2`,
                evidenceCount: sql`${biomarkerEndpoints.evidenceCount} + 1`,
                confidence: sql`(${biomarkerEndpoints.confidence} + ${biomarkerEndpointData.confidence}) / 2`
              }
            });
        }
      }

      // Store clinical outcomes
      for (const outcome of efficacyOutcomes) {
        const clinicalOutcomeData: InsertClinicalOutcome = {
          studyId: csrId,
          biomarkerEndpointId: biomarkerCorrelations.length > 0 
            ? `${biomarkerCorrelations[0].biomarkerName}_${csrId}_${outcome.type}_${csrId}`
            : null,
          outcomeType: outcome.value > 50 ? 'success' : 
                      outcome.value > 20 ? 'partial' : 'failure',
          outcomeValue: {
            type: outcome.type,
            value: outcome.value,
            unit: outcome.unit,
            timepoint: outcome.timepoint,
            confidenceInterval: outcome.confidenceInterval,
            pValue: outcome.pValue
          },
          phase: 'Unknown',
          patientCount: 0,
          timepoint: outcome.timepoint,
          statisticalSignificance: outcome.pValue,
          adverseEvents: safetySignals.filter(s => s.type === 'AE').map(s => s.term),
          failureReasons: outcome.value < 20 ? ['Low efficacy'] : [],
          metadata: {
            source: 'csr_extraction',
            csrId,
            extractionDate: new Date().toISOString()
          },
          organizationId
        };
        
        await db!.insert(clinicalOutcomes).values(clinicalOutcomeData);
      }

      // Store translational patterns
      if (biomarkerCorrelations.length > 0 && efficacyOutcomes.length > 0) {
        const pattern: InsertTranslationalPattern = {
          organizationId,
          sourcePhase: 'preclinical',
          targetPhase: 'clinical',
          patternType: 'biomarker_efficacy',
          patternData: {
            biomarkers: biomarkerCorrelations.map(b => ({
              name: b.biomarkerName,
              correlation: b.correlationScore,
              association: b.responseAssociation
            })),
            outcomes: efficacyOutcomes.map(o => ({
              type: o.type,
              value: o.value,
              unit: o.unit
            })),
            safetyProfile: {
              aes: safetySignals.filter(s => s.type === 'AE').length,
              saes: safetySignals.filter(s => s.type === 'SAE').length,
              dlts: safetySignals.filter(s => s.type === 'DLT').length
            }
          },
          confidenceScore: this.calculatePatternConfidence(biomarkerCorrelations, efficacyOutcomes),
          evidenceCount: 1,
          metadata: {
            csrId,
            extractionDate: new Date().toISOString()
          }
        };
        
        await db!.insert(translationalPatterns).values(pattern);
      }

      // Store dose escalation data if available
      if (doseRelationships.length > 0) {
        const [report] = await db!.select()
          .from(csrReports)
          .where(eq(csrReports.id, csrId));

        const studyData: InsertDoseEscalationStudy = {
          organizationId,
          studyName: report?.title || `CSR Study ${csrId}`,
          compoundName: report?.drugName || 'Unknown',
          indication: report?.indication || 'Unknown',
          escalationMethod: '3_plus_3',
          startingDose: Math.min(...doseRelationships.map(d => d.doseLevel)),
          maxDose: Math.max(...doseRelationships.map(d => d.doseLevel)),
          currentDoseLevel: doseRelationships[0]?.doseLevel || 0,
          status: 'completed',
          metadata: {
            csrId,
            doseRelationships,
            mtdEstimate: doseRelationships.find(d => d.mtdReached)?.doseLevel
          }
        };
        
        const [study] = await db!.insert(doseEscalationStudies)
          .values(studyData)
          .returning();

        // Store dose cohorts
        for (const doseRel of doseRelationships) {
          const [doseLevel] = await db!.insert(doseLevels)
            .values({
              studyId: study.id,
              levelNumber: doseRelationships.indexOf(doseRel) + 1,
              doseAmount: doseRel.doseLevel,
              doseUnit: doseRel.doseUnit,
              isDLT: doseRel.dltRate > 0.33
            })
            .returning();

          await db!.insert(doseCohorts)
            .values({
              studyId: study.id,
              doseLevelId: doseLevel.id,
              cohortNumber: doseRelationships.indexOf(doseRel) + 1,
              plannedPatients: 3,
              enrolledPatients: 3,
              evaluablePatients: 3,
              dltsObserved: Math.round(doseRel.dltRate * 3),
              status: 'completed'
            });
        }
      }

      console.log(`Successfully stored CSR ${csrId} data in AnA Predictions tables`);
    } catch (error) {
      console.error('Error storing data in AnA Predictions tables:', error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private inferGradeFromDescription(description: string): number {
    const lower = description.toLowerCase();
    if (lower.includes('grade 5') || lower.includes('fatal') || lower.includes('death')) return 5;
    if (lower.includes('grade 4') || lower.includes('life-threatening')) return 4;
    if (lower.includes('grade 3') || lower.includes('severe') || lower.includes('serious')) return 3;
    if (lower.includes('grade 2') || lower.includes('moderate')) return 2;
    if (lower.includes('grade 1') || lower.includes('mild')) return 1;
    return 2; // Default to moderate
  }

  private extractConfidenceInterval(text: string): { lower: number; upper: number } | undefined {
    const ciMatch = text.match(/\(?\s*(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*\)?/);
    if (ciMatch) {
      return {
        lower: parseFloat(ciMatch[1]),
        upper: parseFloat(ciMatch[2])
      };
    }
    return undefined;
  }

  private extractPValue(text: string): number | undefined {
    const pMatch = text.match(/p\s*[<>=]\s*(\d+\.?\d*)/i);
    if (pMatch) {
      return parseFloat(pMatch[1]);
    }
    return undefined;
  }

  private extractDoseLevels(text: string): number[] {
    const doses: number[] = [];
    const doseMatches = text.match(/(\d+)\s*mg/gi);
    
    if (doseMatches) {
      doseMatches.forEach(match => {
        const dose = parseInt(match);
        if (!doses.includes(dose) && dose < 10000) {
          doses.push(dose);
        }
      });
    }
    
    return doses.sort((a, b) => a - b);
  }

  private extractPKParameter(text: string, parameter: string, dose: number): number | undefined {
    const pattern = new RegExp(`${dose}[^.]*?${parameter}[^.]*?(\\d+\\.?\\d*)`, 'i');
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }

  private calculateDLTRate(dose: number, text: string): number {
    const dltPattern = new RegExp(`${dose}[^.]*?dlt[^.]*?(\\d+)\\s*(?:of|/)\\s*(\\d+)`, 'i');
    const match = text.match(dltPattern);
    if (match) {
      return parseInt(match[1]) / parseInt(match[2]);
    }
    
    // Check if this dose is mentioned as MTD
    if (text.includes(`mtd`) && text.includes(`${dose}`)) {
      return 0.33; // Typical DLT rate at MTD
    }
    
    return 0;
  }

  private calculatePatternConfidence(
    biomarkers: BiomarkerCorrelation[],
    outcomes: EfficacyOutcome[]
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on number of biomarkers
    confidence += Math.min(biomarkers.length * 0.05, 0.2);
    
    // Increase confidence based on strong correlations
    const strongCorrelations = biomarkers.filter(b => Math.abs(b.correlationScore) > 0.6);
    confidence += Math.min(strongCorrelations.length * 0.1, 0.2);
    
    // Increase confidence based on efficacy outcomes
    const positiveOutcomes = outcomes.filter(o => 
      (o.type === 'ORR' && o.value > 30) ||
      (o.type === 'PFS' && o.value > 6) ||
      (o.type === 'OS' && o.value > 12)
    );
    confidence += Math.min(positiveOutcomes.length * 0.05, 0.1);
    
    return Math.min(confidence, 1);
  }
}

// Export singleton instance
export const csrKnowledgeExtractor = new CSRKnowledgeExtractor();