import { db } from '../db';
import { csrReports, csrDetails } from 'shared/schema';
import { eq, and, like, desc } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import { OperatingSystemIntegration } from './operating-system-integration';
import {
  renderEstimandSection,
  type EstimandInput,
  type RenderedEstimandSection,
} from './estimand-sap-section';

// Define the file paths
const SAP_DIR = path.join(process.cwd(), 'data/sap');

// Create directories if they don't exist
if (!fs.existsSync(SAP_DIR)) {
  fs.mkdirSync(SAP_DIR, { recursive: true });
}

export interface SapRequestData {
  protocol_id?: string;
  indication: string;
  phase: string;
  sample_size: number;
  primary_endpoint: string;
  secondary_endpoints?: string[];
  arms?: string[] | number;
  randomization?: string;
  blinding?: string;
  duration_weeks?: number;
  statistical_methods?: string;
  dropout_rate?: number;
  // Statistical assumptions for the sample-size justification. Supplied by the
  // study statistician — this service does not fabricate them when absent.
  target_power?: number; // e.g. 0.8 for 80% power
  minimum_detectable_effect?: number; // standardized effect size
  // ICH E9(R1) estimands for the primary / key secondary objectives. When
  // supplied, the SAP renders them as a first-class estimand framework section;
  // when absent, that section renders an explicit deferral rather than
  // fabricating an estimand. See server/services/estimand-sap-section.ts.
  estimands?: EstimandInput[];
  // Operating system context (optional — for assumption capture)
  organizationId?: number;
  projectId?: number;
  sourceArtifactId?: number;
  regulatorBody?: string;
  jurisdiction?: string;
  createdById?: number;
}

export interface GeneratedSapData {
  protocol_id?: string;
  sapContent: string;
  sapPath?: string;
  assumptions?: unknown[];
  decision?: unknown;
  // Structured metadata for the rendered estimand framework section: how many
  // estimands were rendered and their per-estimand ICH E9(R1) completeness.
  estimandSection?: RenderedEstimandSection;
}

export class SapGeneratorService {
  private static instance: SapGeneratorService;

  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }

  static getInstance(): SapGeneratorService {
    if (!SapGeneratorService.instance) {
      SapGeneratorService.instance = new SapGeneratorService();
    }
    return SapGeneratorService.instance;
  }

  /**
   * Generate a Statistical Analysis Plan based on protocol data
   * @param protocolData Protocol data to base the SAP on
   * @returns The generated SAP content
   */
  async generateSAP(protocolData: SapRequestData): Promise<GeneratedSapData> {
    try {
      const {
        protocol_id,
        indication,
        phase,
        sample_size,
        primary_endpoint,
        secondary_endpoints = [],
        arms,
        randomization,
        blinding,
        duration_weeks = 24,
        dropout_rate = 0.15,
        target_power,
        minimum_detectable_effect,
        estimands,
      } = protocolData;

      // Render the ICH E9(R1) estimand framework deterministically. When no
      // estimand is supplied this renders an explicit deferral, not a fabricated
      // estimand — consistent with the sample-size honesty stance below.
      const estimandSection = renderEstimandSection(estimands);

      // Calculate effective sample size accounting for dropouts
      const effectiveSampleSize = Math.round(sample_size * (1 - dropout_rate));

      // Determine number of arms
      let numArms = 2; // Default to 2 arms
      if (typeof arms === 'number') {
        numArms = arms;
      } else if (Array.isArray(arms)) {
        numArms = arms.length;
      }

      // Calculate per-arm sample size
      const perArmSampleSize = Math.floor(sample_size / numArms);

      // Statistical assumptions come from the caller (the study statistician),
      // not from fabricated random values. When absent, the SAP narrative defers
      // to the statistician rather than asserting a power figure that was never
      // computed. See FORENSIC_CODE_AUDIT_2026-05-29.md HI-2.
      const powerForPrimary =
        typeof target_power === 'number' ? target_power : null;
      const requiredEffectSize =
        typeof minimum_detectable_effect === 'number'
          ? minimum_detectable_effect
          : null;
      const sampleSizeJustification =
        powerForPrimary !== null && requiredEffectSize !== null
          ? `a sample size of ${sample_size} will provide ${(powerForPrimary * 100).toFixed(0)}% power to detect a difference of ${requiredEffectSize.toFixed(2)} at a two-sided significance level of 0.05, assuming a dropout rate of ${(dropout_rate * 100).toFixed(0)}%`
          : `the target power and minimum detectable effect must be specified and computed by the study statistician. Sample size of ${sample_size} is recorded as provided; this draft does not assert a power figure that has not been calculated. Dropout rate assumed at ${(dropout_rate * 100).toFixed(0)}%`;

      // The renderer's text begins with its own "ESTIMAND FRAMEWORK (ICH E9(R1))"
      // title line; the numbered SAP header below prefixes the section number to
      // it, so it reads "2. ESTIMAND FRAMEWORK (ICH E9(R1))" in the plan.
      const estimandSapBody = estimandSection.text;

      // Get relevant similar trials from the database
      const similarTrials = await this.findSimilarProtocols(indication, phase);

      // Get supplementary statistical methods based on similar trials
      const statisticalMethods = this.determineStatisticalMethods(phase, similarTrials);

      // Generate SAP Content
      const sapContent = `
STATISTICAL ANALYSIS PLAN (SAP)

Study Information:
- Indication: ${indication}
- Phase: ${phase}
- Sample Size: ${sample_size} participants (${effectiveSampleSize} effective after ${(dropout_rate * 100).toFixed(0)}% dropout)
- Duration: ${duration_weeks} weeks

1. STUDY OBJECTIVES
   1.1 Primary Objective
       To evaluate ${primary_endpoint}

   1.2 Secondary Objectives
       ${secondary_endpoints.map((endpoint, i) => `${i + 1}. To assess ${endpoint}`).join('\n       ')}

2. ${estimandSapBody}

3. STUDY DESIGN
   - ${numArms}-arm, ${randomization || 'randomized'}, ${blinding || 'blinded'} study
   - Allocation ratio: ${numArms > 1 ? `1:${numArms > 2 ? numArms - 1 : 1}` : 'N/A'}
   - Stratification factors: Disease severity, age group, previous treatment

4. SAMPLE SIZE JUSTIFICATION
   Based on the primary endpoint (${primary_endpoint}), ${sampleSizeJustification}.

   Per-arm sample size: ${perArmSampleSize}

5. STATISTICAL METHODS
   5.1 Primary Analysis
       The primary endpoint will be analyzed using ${statisticalMethods.primaryMethod}.
       Missing data will be handled using ${statisticalMethods.missingDataMethod}.
       The analysis method is aligned with the estimand defined in Section 2.

   5.2 Secondary Analyses
       Secondary endpoints will be analyzed using appropriate statistical methods based on the data type:
       - Continuous outcomes: ${statisticalMethods.continuousMethod}
       - Binary outcomes: ${statisticalMethods.binaryMethod}
       - Time-to-event outcomes: ${statisticalMethods.timeToEventMethod}

   5.3 Multiplicity Adjustment
       ${statisticalMethods.multiplicityMethod}

6. INTERIM ANALYSES
   ${statisticalMethods.interimAnalysisText}

7. ANALYSIS SETS
   - Intent-to-Treat (ITT): All randomized participants
   - Per-Protocol (PP): All randomized participants without major protocol deviations
   - Safety: All participants who received at least one dose of study drug

8. HANDLING OF MISSING DATA
   Primary approach: ${statisticalMethods.primaryMissingDataApproach}
   Sensitivity analyses: ${statisticalMethods.sensitivityAnalyses}
   Missing-data handling supports the intercurrent-event strategies in the Section 2 estimands.

9. SAFETY ANALYSES
   Adverse events will be coded using MedDRA and summarized by treatment group, severity, and relationship to study drug.

   Laboratory parameters, vital signs, and ECG data will be summarized using descriptive statistics and shift tables.

10. EXPLORATORY ANALYSES
    Subgroup analyses will be performed for:
    - Age groups (<65, ≥65 years)
    - Sex
    - Disease severity
    - Prior treatment history

11. DATA HANDLING CONVENTIONS
    - Continuous variables: mean, SD, median, min, max
    - Categorical variables: counts and percentages
    - Missing data codes: explicitly defined for database

12. REPORTING CONVENTIONS
    - P-values will be reported to 3 decimal places
    - Percentages will be reported to 1 decimal place
    - All confidence intervals will be reported at 95% level

13. AMENDMENTS TO THE SAP
    Any amendments to this SAP will be documented with justification and version control.
`;

      // Save SAP to file if protocol_id is provided
      let sapPath: string | undefined;
      if (protocol_id) {
        sapPath = path.join(SAP_DIR, `${protocol_id}_sap.txt`);
        fs.writeFileSync(sapPath, sapContent);

        // Store SAP segments in database for future reference
        await this.storeSapSegments(protocol_id, sapContent);
      }

      // Capture structured assumptions into the operating system layer
      let assumptionCapture;
      if (protocolData.organizationId && protocolData.projectId) {
        try {
          const osIntegration = OperatingSystemIntegration.getInstance();
          assumptionCapture = await osIntegration.captureFromSapGeneration({
            organizationId: protocolData.organizationId,
            projectId: protocolData.projectId,
            indication,
            phase,
            sampleSize: sample_size,
            dropoutRate: dropout_rate,
            primaryEndpoint: primary_endpoint,
            effectSize: requiredEffectSize ?? undefined,
            alpha: 0.05,
            power: powerForPrimary ?? undefined,
            regulatorBody: protocolData.regulatorBody,
            jurisdiction: protocolData.jurisdiction,
            sourceArtifactId: protocolData.sourceArtifactId,
            createdById: protocolData.createdById,
          });
        } catch (err) {
          console.warn('Operating system assumption capture failed (non-fatal):', err);
        }
      }

      return {
        protocol_id,
        sapContent,
        sapPath,
        assumptions: assumptionCapture?.assumptions,
        decision: assumptionCapture?.decision,
        estimandSection,
      };
    } catch (error) {
      console.error('Error in SAP generator service:', error);
      throw error;
    }
  }

  /**
   * Find similar protocols in the database
   * @param indication The indication to search for
   * @param phase The trial phase to search for
   * @returns An array of similar trials
   */
  private async findSimilarProtocols(indication: string, phase: string) {
    try {
      const dbInstance = this.getDb();
      const similarTrials = await dbInstance
        .select()
        .from(csrReports)
        .where(
          and(like(csrReports.indication, `%${indication}%`), like(csrReports.phase, `%${phase}%`))
        )
        .limit(10);

      return similarTrials;
    } catch (error) {
      console.error('Error finding similar protocols:', error);
      return [];
    }
  }

  /**
   * Store SAP segments in database for future reference and analysis
   * @param protocolId The protocol ID
   * @param sapContent The full SAP content
   */
  private async storeSapSegments(protocolId: string, sapContent: string) {
    try {
      // Find the associated report ID
      const dbInstance = this.getDb();
      const protocol = await dbInstance
        .select()
        .from(csrReports)
        .where(eq(csrReports.id, parseInt(protocolId)))
        .limit(1);

      if (protocol.length === 0) {
        console.warn(`No protocol found with ID ${protocolId}`);
        return;
      }

      // Extract sections from SAP content
      const sections = this.extractSapSections(sapContent);

      console.log(`SAP segments extracted for protocol ${protocolId}`, {
        reportId: protocol[0].id,
        sections: Object.keys(sections).length,
      });
    } catch (error) {
      console.error('Error storing SAP segments:', error);
    }
  }

  /**
   * Extract sections from SAP content
   * @param sapContent The full SAP content
   * @returns Object containing section names and content
   */
  private extractSapSections(sapContent: string) {
    const sections: Record<string, string> = {};

    // Regular expression to match section headers (numbers followed by dot and uppercase text)
    const sectionRegex = /(\d+\.\s[A-Z\s]+)\n/g;
    let match;
    let lastIndex = 0;
    let lastSectionName = 'header';

    // Extract the header section (before first numbered section)
    const firstSectionMatch = sapContent.match(sectionRegex);
    if (firstSectionMatch && firstSectionMatch.length > 0) {
      const firstSectionIndex = sapContent.indexOf(firstSectionMatch[0]);
      sections[lastSectionName] = sapContent.substring(0, firstSectionIndex).trim();
    }

    // Reset regex lastIndex
    sectionRegex.lastIndex = 0;

    // Extract numbered sections
    while ((match = sectionRegex.exec(sapContent)) !== null) {
      // If this is not the first match, save the previous section
      if (lastIndex > 0) {
        sections[lastSectionName] = sapContent.substring(lastIndex, match.index).trim();
      }

      lastSectionName = match[1].trim();
      lastIndex = match.index + match[0].length;
    }

    // Add the last section
    if (lastIndex > 0 && lastIndex < sapContent.length) {
      sections[lastSectionName] = sapContent.substring(lastIndex).trim();
    }

    return sections;
  }

  /**
   * Determine appropriate statistical methods based on similar trials
   * @param phase The trial phase
   * @param similarTrials Array of similar trials
   * @returns Statistical methods object
   */
  private determineStatisticalMethods(phase: string, similarTrials: any[]) {
    // Base statistical methods on phase
    let primaryMethod,
      missingDataMethod,
      continuousMethod,
      binaryMethod,
      timeToEventMethod,
      multiplicityMethod,
      interimAnalysisText,
      primaryMissingDataApproach,
      sensitivityAnalyses;

    // Set default values based on phase
    switch (phase) {
      case 'Phase 1':
        primaryMethod = 'descriptive statistics';
        missingDataMethod = 'complete case analysis';
        continuousMethod = 'descriptive statistics';
        binaryMethod = "Fisher's exact test";
        timeToEventMethod = 'Kaplan-Meier estimates';
        multiplicityMethod = 'No formal adjustment for multiplicity will be performed';
        interimAnalysisText = 'No interim analyses are planned for this study';
        primaryMissingDataApproach = 'Complete case analysis';
        sensitivityAnalyses = 'Not applicable for this phase';
        break;

      case 'Phase 2':
        primaryMethod = 'ANCOVA adjusted for baseline';
        missingDataMethod = 'last observation carried forward (LOCF)';
        continuousMethod = 'ANCOVA with baseline as covariate';
        binaryMethod = 'Logistic regression with treatment as factor';
        timeToEventMethod = 'Kaplan-Meier estimates and log-rank test';
        multiplicityMethod =
          'Hochberg procedure will be used to control for multiple testing of key secondary endpoints';
        interimAnalysisText = 'One interim analysis may be conducted for safety monitoring only';
        primaryMissingDataApproach = 'LOCF';
        sensitivityAnalyses = 'Complete case analysis and MMRM';
        break;

      case 'Phase 3':
      case 'Phase 4':
        primaryMethod = 'mixed model for repeated measures (MMRM)';
        missingDataMethod = 'multiple imputation';
        continuousMethod = 'MMRM or ANCOVA depending on measurement frequency';
        binaryMethod = 'CMH test stratified by randomization factors';
        timeToEventMethod = 'Cox proportional hazards model adjusted for stratification factors';
        multiplicityMethod =
          'Hierarchical testing procedure will be used to control for multiple testing of secondary endpoints';
        interimAnalysisText =
          'One interim analysis for efficacy and safety is planned at approximately 50% of enrolled participants';
        primaryMissingDataApproach = 'Multiple imputation';
        sensitivityAnalyses = 'Pattern mixture models and tipping point analysis';
        break;

      default:
        primaryMethod = 'appropriate statistical methods based on endpoint type';
        missingDataMethod = 'methods appropriate for the study design';
        continuousMethod = 'descriptive statistics and appropriate inferential methods';
        binaryMethod = 'appropriate categorical analysis methods';
        timeToEventMethod = 'survival analysis methods as appropriate';
        multiplicityMethod = 'Methods appropriate for the number of endpoints being evaluated';
        interimAnalysisText = 'Interim analyses will be determined based on study needs';
        primaryMissingDataApproach = 'Methods appropriate for the study design';
        sensitivityAnalyses = 'Methods appropriate for the study design';
    }

    // Enhance with information from similar trials if available
    if (similarTrials.length > 0) {
      // Use the most common statistical methods across similar trials
      // In a real implementation, would extract and analyze methods from similar trials

      // For now, we'll just adjust based on the number of similar trials found
      if (similarTrials.length >= 5) {
        // Enhance methods with more sophistication for indications with a lot of history
        switch (phase) {
          case 'Phase 2':
            primaryMethod += ' with supportive non-parametric analysis';
            break;
          case 'Phase 3':
            primaryMethod = 'generalized linear mixed model (GLMM) with baseline covariates';
            sensitivityAnalyses += ' and Reference-based imputation using control-based methods';
            break;
        }
      }
    }

    return {
      primaryMethod,
      missingDataMethod,
      continuousMethod,
      binaryMethod,
      timeToEventMethod,
      multiplicityMethod,
      interimAnalysisText,
      primaryMissingDataApproach,
      sensitivityAnalyses,
    };
  }

  /**
   * Retrieve a saved SAP by protocol ID
   * @param protocolId The protocol ID to retrieve
   * @returns The SAP content or null if not found
   */
  async getSapByProtocolId(protocolId: string): Promise<string | null> {
    try {
      const sapPath = path.join(SAP_DIR, `${protocolId}_sap.txt`);

      // Check if SAP file exists
      if (!fs.existsSync(sapPath)) {
        return null;
      }

      // Read and return SAP content
      return fs.readFileSync(sapPath, 'utf8');
    } catch (error) {
      console.error('Error retrieving SAP:', error);
      return null;
    }
  }

  /**
   * Get SAP segments from the database by protocol ID
   * @param protocolId The protocol ID
   * @returns Array of SAP segments
   */
  async getSapSegmentsByProtocolId(protocolId: string): Promise<
    Array<{
      section: string;
      content: string;
      order: number;
    }>
  > {
    try {
      const sapContent = await this.getSapByProtocolId(protocolId);
      if (!sapContent) {
        return [];
      }

      const sections = this.extractSapSections(sapContent);
      return Object.entries(sections).map(([section, content], index) => ({
        section,
        content,
        order: index + 1,
      }));
    } catch (error) {
      console.error('Error retrieving SAP segments:', error);
      return [];
    }
  }

  /**
   * Update the SAP when a protocol is updated
   * @param protocolId The protocol ID
   * @param updatedData Updated protocol data
   * @returns Updated SAP content
   */
  async updateSap(
    protocolId: string,
    updatedData: Partial<SapRequestData>
  ): Promise<GeneratedSapData | null> {
    try {
      // Get current protocol data
      const dbInstance = this.getDb();
      const protocol = await dbInstance
        .select()
        .from(csrReports)
        .where(eq(csrReports.id, parseInt(protocolId)))
        .limit(1);

      if (protocol.length === 0) {
        console.warn(`No protocol found with ID ${protocolId}`);
        return null;
      }

      // Build updated request data
      const requestData: SapRequestData = {
        protocol_id: protocolId,
        indication: updatedData.indication || protocol[0].indication || 'Unknown',
        phase: updatedData.phase || protocol[0].phase || 'Unknown',
        sample_size: updatedData.sample_size || 100, // Default value
        primary_endpoint: updatedData.primary_endpoint || 'treatment efficacy',
        // Add other fields with sensible defaults
        secondary_endpoints: updatedData.secondary_endpoints || [],
        duration_weeks: updatedData.duration_weeks || 24,
        dropout_rate: updatedData.dropout_rate || 0.15,
      };

      // Generate updated SAP
      return await this.generateSAP(requestData);
    } catch (error) {
      console.error('Error updating SAP:', error);
      return null;
    }
  }
}

export default SapGeneratorService.getInstance();
