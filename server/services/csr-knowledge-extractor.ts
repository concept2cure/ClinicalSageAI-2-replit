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
  csrReports,
  csrDetails,
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
  changeFromBaseline: number | null;
  responseAssociation: 'positive' | 'negative' | 'neutral';
  correlationScore: number;
  pValue: number | null;
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

      // safety payload is stored under csr_details.metadata (no dedicated column).
      const safetyData = (csr?.metadata as any)?.safety;
      if (!csr || !safetyData) {
        return [];
      }
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

      // Prefer the study's result-bearing fields as the analysis corpus; only
      // fall back to the whole record when those are empty. The `results` JSON
      // carries dedicated narrative fields (biomarkerResults / primaryResults /
      // secondaryResults) — extract those as clean text so the correlation /
      // p-value windows are anchored to the statistical narrative, with the
      // biomarker-specific field first.
      const resultsText = this.flattenResultsText(csr.results);
      const resultText = [
        resultsText,
        csr.efficacyResults,
        csr.statisticalMethods,
        csr.safetyResults,
        csr.patientReportedOutcome,
      ]
        .filter(Boolean)
        .join('\n');
      const analysisText = (resultText || JSON.stringify(csr)).toLowerCase();

      // Candidate biomarkers: the ones the study actually declares
      // (csr.biomarkerUsed) merged with a set of common biomarkers.
      const knownBiomarkers: { name: string; type: BiomarkerCorrelation['biomarkerType'] }[] = [
        { name: 'PD-L1', type: 'protein' },
        { name: 'EGFR', type: 'gene' },
        { name: 'KRAS', type: 'gene' },
        { name: 'CD4', type: 'cell' },
        { name: 'CD8', type: 'cell' },
        { name: 'IL-6', type: 'cytokine' },
        { name: 'TNF-alpha', type: 'cytokine' },
        { name: 'CRP', type: 'protein' },
        { name: 'HbA1c', type: 'metabolite' },
        { name: 'LDH', type: 'metabolite' },
      ];
      const candidates = this.mergeBiomarkers(
        knownBiomarkers,
        this.parseStudyBiomarkers(csr.biomarkerUsed)
      );

      for (const biomarker of candidates) {
        const pattern = new RegExp(
          `${this.escapeRegex(biomarker.name.toLowerCase())}[^.]*?(\\d+\\.?\\d*)`,
          'i'
        );
        const match = analysisText.match(pattern);
        if (!match) continue;

        const value = parseFloat(match[1]);

        const positiveTerms = ['response', 'benefit', 'improved', 'higher', 'increased'];
        const negativeTerms = ['resistance', 'poor', 'lower', 'decreased', 'worse'];
        let association: 'positive' | 'negative' | 'neutral' = 'neutral';
        const contextStart = Math.max(0, match.index! - 120);
        const contextEnd = Math.min(analysisText.length, match.index! + 120);
        const context = analysisText.substring(contextStart, contextEnd);
        if (positiveTerms.some(term => context.includes(term))) {
          association = 'positive';
        } else if (negativeTerms.some(term => context.includes(term))) {
          association = 'negative';
        }

        // Only emit a correlation when a real coefficient is present in the
        // source text. Without it there is no quantitative basis, so the row
        // is skipped rather than fabricated.
        const correlationScore = this.extractCorrelationScore(context);
        if (correlationScore === null) {
          continue;
        }

        correlations.push({
          biomarkerName: biomarker.name,
          biomarkerType: biomarker.type,
          baselineLevel: value,
          changeFromBaseline: this.extractChangeFromBaseline(context),
          responseAssociation: association,
          correlationScore,
          pValue: this.extractPValue(context) ?? null,
        });
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
    const orgId = Number(organizationId);
    try {
      // The `organization_id` columns are integers; coerce the string param.
      const orgIdNum = Number.isNaN(Number(organizationId)) ? null : Number(organizationId);
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
            organizationId: orgIdNum
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
          organizationId: orgIdNum
        };

        await db!.insert(clinicalOutcomes).values(clinicalOutcomeData);
      }

      // Store translational patterns
      if (biomarkerCorrelations.length > 0 && efficacyOutcomes.length > 0) {
        const pattern: InsertTranslationalPattern = {
          patternName: `biomarker_efficacy_${csrId}`,
          patternType: 'biomarker_efficacy',
          preclinicalMarkers: biomarkerCorrelations.map(b => ({
            name: b.biomarkerName,
            correlation: b.correlationScore,
            association: b.responseAssociation
          })),
          clinicalEndpoints: efficacyOutcomes.map(o => ({
            type: o.type,
            value: o.value,
            unit: o.unit
          })),
          occurrenceCount: 1,
          confidence: this.calculatePatternConfidence(biomarkerCorrelations, efficacyOutcomes),
          lastObserved: new Date(),
          metadata: {
            csrId,
            organizationId: orgIdNum,
            extractionDate: new Date().toISOString(),
            safetyProfile: {
              aes: safetySignals.filter(s => s.type === 'AE').length,
              saes: safetySignals.filter(s => s.type === 'SAE').length,
              dlts: safetySignals.filter(s => s.type === 'DLT').length
            }
          }
        };

        await db!.insert(translationalPatterns).values(pattern);
      }

      // Store dose escalation data if available
      if (doseRelationships.length > 0) {
        const csrIdNum = Number(csrId);
        const [report] = Number.isNaN(csrIdNum)
          ? [undefined]
          : await db!.select().from(csrReports).where(eq(csrReports.id, csrIdNum));

        const doseUnit = doseRelationships[0]?.doseUnit || 'mg';
        // Decimal columns are typed as strings by the driver; stringify the
        // computed dose figures. The escalation-study study id is a varchar,
        // so it can carry the CSR-derived identifier directly.
        const studyData: InsertDoseEscalationStudy = {
          organizationId: orgIdNum,
          studyId: `CSR_${csrId}`,
          protocolNumber: report?.studyId || `CSR-${csrId}`,
          title: report?.title || `CSR Study ${csrId}`,
          indication: report?.indication || 'Unknown',
          phase: report?.phase || 'I',
          escalationMethod: '3+3',
          startingDose: String(Math.min(...doseRelationships.map(d => d.doseLevel))),
          maxDose: String(Math.max(...doseRelationships.map(d => d.doseLevel))),
          doseUnit,
          currentDoseLevel: doseRelationships[0]?.doseLevel || 0,
          status: 'completed',
          escalationParameters: {
            csrId,
            drugName: ((report?.metadata as Record<string, unknown> | null)?.drugName as string) || 'Unknown',
            doseRelationships,
            mtdEstimate: doseRelationships.find(d => d.mtdReached)?.doseLevel
          }
        };

        const [study] = await db!.insert(doseEscalationStudies)
          .values(studyData)
          .returning();

        // Store dose levels and a representative cohort for each.
        for (const doseRel of doseRelationships) {
          const [doseLevel] = await db!.insert(doseLevels)
            .values({
              studyId: study.id,
              levelNumber: doseRelationships.indexOf(doseRel) + 1,
              doseAmount: String(doseRel.doseLevel),
              doseUnit: doseRel.doseUnit,
              dltsInCohort: Math.round(doseRel.dltRate * 3),
              status: 'completed'
            })
            .returning();

          // The schema models cohorts per patient; CSR extraction only has
          // aggregate figures, so we persist one representative row with the
          // aggregate detail in metadata.
          await db!.insert(doseCohorts)
            .values({
              studyId: study.id,
              doseLevelId: doseLevel.id,
              cohortNumber: doseRelationships.indexOf(doseRel) + 1,
              patientId: `${study.id}_cohort_${doseRelationships.indexOf(doseRel) + 1}`,
              enrollmentDate: new Date().toISOString().slice(0, 10),
              dltOccurred: doseRel.dltRate > 0.33,
              metadata: { dltsObserved: Math.round(doseRel.dltRate * 3) }
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

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extract clean narrative text from the CSR `results` JSON, putting the
   * biomarker-specific field first so biomarker extraction anchors to it.
   */
  private flattenResultsText(results: unknown): string {
    if (!results || typeof results !== 'object') {
      return typeof results === 'string' ? results : '';
    }
    const obj = results as Record<string, unknown>;
    const ordered = ['biomarkerResults', 'primaryResults', 'secondaryResults'];
    const parts: string[] = [];
    for (const key of ordered) {
      if (typeof obj[key] === 'string') parts.push(obj[key] as string);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (ordered.includes(key)) continue;
      if (typeof value === 'string') parts.push(value);
    }
    return parts.join('\n');
  }

  /** Infer a biomarker type from its name. */
  private inferBiomarkerType(name: string): BiomarkerCorrelation['biomarkerType'] {
    if (/\b(IL-?\d+|TNF|IFN|interferon|interleukin)\b/i.test(name)) return 'cytokine';
    if (/\b(CD\d+|lymphocyte|neutrophil|cell)\b/i.test(name)) return 'cell';
    if (/\b(EGFR|KRAS|BRAF|ALK|ROS1|HER2|gene|mutation)\b/i.test(name)) return 'gene';
    if (/\b(HbA1c|glucose|LDH|creatinine|cholesterol|metabolite)\b/i.test(name)) return 'metabolite';
    return 'protein';
  }

  /** Parse the study's declared biomarkers from the free-text biomarkerUsed field. */
  private parseStudyBiomarkers(
    biomarkerUsed: string | null | undefined
  ): { name: string; type: BiomarkerCorrelation['biomarkerType'] }[] {
    if (!biomarkerUsed) return [];
    return biomarkerUsed
      .split(/[,;/\n]|\band\b/i)
      .map(token => token.replace(/\(.*?\)/g, '').trim())
      .filter(name => name.length >= 2 && name.length <= 40)
      .map(name => ({ name, type: this.inferBiomarkerType(name) }));
  }

  /** Merge biomarker lists, de-duplicating case-insensitively by name. */
  private mergeBiomarkers(
    a: { name: string; type: BiomarkerCorrelation['biomarkerType'] }[],
    b: { name: string; type: BiomarkerCorrelation['biomarkerType'] }[]
  ): { name: string; type: BiomarkerCorrelation['biomarkerType'] }[] {
    const seen = new Set<string>();
    const merged: { name: string; type: BiomarkerCorrelation['biomarkerType'] }[] = [];
    for (const item of [...a, ...b]) {
      const key = item.name.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }

  /**
   * Extract a correlation coefficient stated in the text (e.g. "r = -0.62").
   * Returns null when no value in the valid [-1, 1] range is present.
   */
  private extractCorrelationScore(text: string): number | null {
    const match =
      text.match(/r\s*=\s*(-?\d+\.?\d*)/i) ||
      text.match(/correlation[^.\d-]*(-?\d+\.?\d*)/i);
    if (!match) return null;
    const value = parseFloat(match[1]);
    if (Number.isNaN(value) || value < -1 || value > 1) return null;
    return value;
  }

  /**
   * Extract a stated change-from-baseline value (e.g. "decreased by 12.4").
   * Returns null when not present; sign reflects increase/decrease wording.
   */
  private extractChangeFromBaseline(text: string): number | null {
    const explicit = text.match(/change from baseline[^.\d-]*(-?\d+\.?\d*)/i);
    if (explicit) {
      const value = parseFloat(explicit[1]);
      return Number.isNaN(value) ? null : value;
    }
    const directional = text.match(/(decreased|reduced|reduction|increased|increase)[^.\d]*(\d+\.?\d*)/i);
    if (directional) {
      const magnitude = parseFloat(directional[2]);
      if (Number.isNaN(magnitude)) return null;
      return /decreas|reduc/i.test(directional[1]) ? -magnitude : magnitude;
    }
    return null;
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