import { db } from '../db';
import { csrReports } from 'shared/schema';
import { eq, and } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import { OperatingSystemIntegration, SapCaptureIncomplete } from './operating-system-integration';
import { LedgerInputRefusal } from './assumption-registry-service';
import {
  renderEstimandSection,
  type EstimandInput,
  type RenderedEstimandSection,
} from './estimand-sap-section';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('sap-generator-service');

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
  alpha?: number; // two-sided significance level; it was printed as 0.05
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
  assumptionCapture: SapAssumptionCapture;
}

/**
 * Whether the SAP's inputs reached the assumption registry. A failed capture
 * was a "non-fatal" log line until 2026-10-15, and the SAP came back with no
 * word that nothing had been recorded.
 */
export type SapAssumptionCapture =
  | { recorded: true; assumptionIds: string[]; decisionId: string; notCaptured: string[] }
  | { recorded: false; reason: 'no_project_context'; message: string }
  | { recorded: false; reason: 'capture_failed'; error: string; writtenAssumptionIds: string[] };

/** A SAP asked for without an input it is built on, or with one it cannot use. Nothing was generated. */
export class SapInputRefusal extends Error {
  readonly code = 'SAP_INPUT_REFUSED' as const;
  constructor(readonly fields: string[], message: string) {
    super(message);
    this.name = 'SapInputRefusal';
  }
}

const isText = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown) => isNum(v) && Number.isInteger(v) && v > 0;
/** An input, whether a value of it is usable, and what a usable one is. */
type SapInputCheck = [keyof SapRequestData, (value: unknown) => boolean, string];
const REQUIRED_SAP_INPUTS: SapInputCheck[] = [
  ['indication', isText, 'the indication'],
  ['phase', isText, 'the study phase'],
  ['primary_endpoint', isText, 'the primary endpoint'],
  ['sample_size', isCount, 'a positive whole number of participants'],
];
const OPTIONAL_SAP_INPUTS: SapInputCheck[] = [
  ['dropout_rate', (v) => isNum(v) && v >= 0 && v < 1, 'a proportion from 0 to below 1'],
  ['duration_weeks', (v) => isNum(v) && v > 0, 'a positive number of weeks'],
  ['alpha', (v) => isNum(v) && v > 0 && v < 1, 'a proportion between 0 and 1'],
  ['arms', (v) => (Array.isArray(v) ? v.length > 0 && v.every(isText) : isCount(v)), 'a positive whole number of arms, or their names'],
];

/**
 * The request a SAP is built on, or a refusal naming what is missing or
 * unusable. An optional input that is absent stays absent, and the SAP says it
 * is not specified; one that is present but unusable is refused, not dropped.
 */
export function requireSapInputs(data: Partial<SapRequestData>): SapRequestData {
  const bad = [
    ...REQUIRED_SAP_INPUTS.filter(([key, usable]) => !usable(data[key])),
    ...OPTIONAL_SAP_INPUTS.filter(([key, usable]) => data[key] != null && !usable(data[key])),
  ];
  if (bad.length > 0) {
    throw new SapInputRefusal(
      bad.map(([key]) => key),
      `No SAP was generated. Missing or invalid: ${bad.map(([key, , rule]) => `${key} (${rule})`).join(', ')}. ` +
        'Nothing is filled in in their place.',
    );
  }
  return data as SapRequestData;
}

const NOT_FROM_PROTOCOL = 'not specified — to be taken from the protocol';
const NOT_FROM_STATISTICIAN = 'not specified — to be set by the study statistician';
const NO_PROJECT_CONTEXT =
  'No organizationId and projectId were given, so the SAP inputs were not recorded in the assumption registry.';

/** A stated value, shown; otherwise that it is not specified, and who sets it. */
function statedOr<T>(value: T | null | undefined, unstated: string, show: (v: T) => string): string {
  return value == null || value === '' ? unstated : show(value);
}

/**
 * The plan's design lines, from what the request stated. A design input it did
 * not state is printed as not specified, and nothing is computed from it.
 * Until 2026-10-15 generateSAP filled a dropout rate of 0.15, 24 weeks, 2 arms
 * (and an allocation ratio and per-arm size from them), 'randomized',
 * 'blinded' and alpha 0.05, and printed stratification factors, subgroups and
 * an interim analysis "at approximately 50%" that no request field carries —
 * as the plan.
 */
function describeDesign(req: SapRequestData) {
  const pct = (p: number) => `${(p * 100).toFixed(0)}%`;
  // The request carries no allocation ratio, so only a single arm has a
  // per-arm size that is not an assumption.
  const singleArm = (Array.isArray(req.arms) ? req.arms.length : req.arms) === 1;
  return {
    sampleSize: statedOr(
      req.dropout_rate,
      `${req.sample_size} participants (dropout rate not specified; no effective sample size is computed)`,
      (d) => `${req.sample_size} participants (${Math.round(req.sample_size * (1 - d))} effective after ${pct(d)} dropout)`,
    ),
    duration: statedOr(req.duration_weeks, NOT_FROM_PROTOCOL, (w) => `${w} weeks`),
    secondary: statedOr(req.secondary_endpoints?.length ? req.secondary_endpoints : null, 'Not specified in the request.', (list) =>
      list.map((endpoint, i) => `${i + 1}. To assess ${endpoint}`).join('\n       '),
    ),
    arms: statedOr(req.arms, NOT_FROM_PROTOCOL, (a) => (Array.isArray(a) ? `${a.length} (${a.join(', ')})` : String(a))),
    randomization: statedOr(req.randomization, NOT_FROM_PROTOCOL, String),
    blinding: statedOr(req.blinding, NOT_FROM_PROTOCOL, String),
    allocation: singleArm ? 'not applicable (single arm)' : NOT_FROM_PROTOCOL,
    perArm: singleArm ? String(req.sample_size) : 'not computed — the allocation ratio is not specified',
    alpha: statedOr(req.alpha, NOT_FROM_STATISTICIAN, String),
    dropout: statedOr(req.dropout_rate, NOT_FROM_STATISTICIAN, pct),
  };
}

type SapCapture = Awaited<ReturnType<OperatingSystemIntegration['captureFromSapGeneration']>>;

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
    // Refused before anything is drafted: a refusal is the caller's answer,
    // not a service error.
    const request = requireSapInputs(protocolData);
    const {
      protocol_id,
      indication,
      phase,
      sample_size,
      primary_endpoint,
      target_power,
      minimum_detectable_effect,
      estimands,
    } = request;
    try {
      // Render the ICH E9(R1) estimand framework deterministically. When no
      // estimand is supplied this renders an explicit deferral, not a fabricated
      // estimand — consistent with the sample-size honesty stance below.
      const estimandSection = renderEstimandSection(estimands);

      // Every design line says what was stated, or that it was not (see describeDesign).
      const design = describeDesign(request);

      // Statistical assumptions come from the caller (the study statistician),
      // not from fabricated random values. When absent, the SAP narrative defers
      // to the statistician rather than asserting a power figure that was never
      // computed. See FORENSIC_CODE_AUDIT_2026-05-29.md HI-2.
      const powerForPrimary = typeof target_power === 'number' ? target_power : null;
      const requiredEffectSize = typeof minimum_detectable_effect === 'number' ? minimum_detectable_effect : null;
      const sampleSizeJustification =
        powerForPrimary !== null && requiredEffectSize !== null
          ? `a sample size of ${sample_size} will provide ${(powerForPrimary * 100).toFixed(0)}% power to detect a difference of ${requiredEffectSize.toFixed(2)}, as specified by the study statistician (significance level and dropout rate as stated below)`
          : `the target power and minimum detectable effect must be specified and computed by the study statistician. Sample size of ${sample_size} is recorded as provided; this draft does not assert a power figure that has not been calculated`;

      // The renderer's text begins with its own "ESTIMAND FRAMEWORK (ICH E9(R1))"
      // title line; the numbered SAP header below prefixes the section number to
      // it, so it reads "2. ESTIMAND FRAMEWORK (ICH E9(R1))" in the plan.
      const estimandSapBody = estimandSection.text;

      // The per-phase methods template. Until 2026-10-15 a read of every
      // tenant's csr_reports for "similar trials" switched Phase 3 to a GLMM
      // when it returned five rows or more — a count, read across tenants and
      // never their methods. That read and that switch are gone.
      const statisticalMethods = this.determineStatisticalMethods(phase);

      // Generate SAP Content
      const sapContent = `
STATISTICAL ANALYSIS PLAN (SAP)

Study Information:
- Indication: ${indication}
- Phase: ${phase}
- Sample Size: ${design.sampleSize}
- Duration: ${design.duration}

1. STUDY OBJECTIVES
   1.1 Primary Objective
       To evaluate ${primary_endpoint}

   1.2 Secondary Objectives
       ${design.secondary}

2. ${estimandSapBody}

3. STUDY DESIGN
   - Arms: ${design.arms}
   - Randomization: ${design.randomization}
   - Blinding: ${design.blinding}
   - Allocation ratio: ${design.allocation}
   - Stratification factors: ${NOT_FROM_PROTOCOL}

4. SAMPLE SIZE JUSTIFICATION
   Based on the primary endpoint (${primary_endpoint}), ${sampleSizeJustification}.

   - Significance level (two-sided): ${design.alpha}
   - Dropout rate: ${design.dropout}
   - Per-arm sample size: ${design.perArm}

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
   Interim analyses: ${NOT_FROM_STATISTICIAN}

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
    Subgroup analyses: ${NOT_FROM_STATISTICIAN}

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

      // Save SAP to file if protocol_id is provided. storeSapSegments, called
      // here until 2026-10-15, read the protocol's csr_reports row with no
      // organization filter, stored nothing, and logged "segments extracted".
      let sapPath: string | undefined;
      if (protocol_id) {
        sapPath = path.join(SAP_DIR, `${protocol_id}_sap.txt`);
        fs.writeFileSync(sapPath, sapContent);
      }

      // Capture structured assumptions into the operating system layer
      const { assumptionCapture, captured } = await this.captureInputs(request, {
        power: powerForPrimary,
        effectSize: requiredEffectSize,
      });

      return {
        protocol_id,
        sapContent,
        sapPath,
        assumptions: captured?.assumptions,
        decision: captured?.decision,
        estimandSection,
        assumptionCapture,
      };
    } catch (error) {
      logger.error('Error in SAP generator service', { error });
      throw error;
    }
  }

  /**
   * Record the SAP's stated inputs in the assumption registry, and say whether
   * that happened. A failed capture was logger.warn('... (non-fatal)') with
   * nothing in the result until 2026-10-15. A refusal's sentence is safe to
   * show the caller; a driver's text is not, so it stays in the log.
   */
  private async captureInputs(
    request: SapRequestData,
    figures: { power: number | null; effectSize: number | null },
  ): Promise<{ assumptionCapture: SapAssumptionCapture; captured?: SapCapture }> {
    if (!request.organizationId || !request.projectId) {
      return { assumptionCapture: { recorded: false, reason: 'no_project_context', message: NO_PROJECT_CONTEXT } };
    }
    try {
      const captured = await OperatingSystemIntegration.getInstance().captureFromSapGeneration({
        organizationId: request.organizationId,
        projectId: request.projectId,
        indication: request.indication,
        phase: request.phase,
        sampleSize: request.sample_size,
        dropoutRate: request.dropout_rate ?? undefined,
        primaryEndpoint: request.primary_endpoint,
        effectSize: figures.effectSize ?? undefined,
        alpha: request.alpha ?? undefined,
        power: figures.power ?? undefined,
        regulatorBody: request.regulatorBody,
        jurisdiction: request.jurisdiction,
        sourceArtifactId: request.sourceArtifactId,
        createdById: request.createdById,
      });
      return {
        captured,
        assumptionCapture: {
          recorded: true,
          assumptionIds: captured.assumptions.map((a) => a.id),
          decisionId: captured.decision.id,
          notCaptured: captured.notCaptured,
        },
      };
    } catch (err) {
      const failure = err instanceof SapCaptureIncomplete ? err.failure : err;
      logger.error('SAP inputs were NOT recorded in the assumption registry', {
        error: failure instanceof Error ? failure.message : String(failure),
      });
      return {
        assumptionCapture: {
          recorded: false,
          reason: 'capture_failed',
          error:
            failure instanceof LedgerInputRefusal
              ? failure.message
              : 'The SAP inputs could not be written to the assumption registry; the server log has the cause.',
          writtenAssumptionIds: err instanceof SapCaptureIncomplete ? err.writtenAssumptionIds : [],
        },
      };
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
   * The methods template for a phase. Nothing else is read: the count-based
   * "similar trials" switch was removed on 2026-10-15 (see generateSAP).
   * @param phase The trial phase
   * @returns Statistical methods object
   */
  private determineStatisticalMethods(phase: string) {
    // Base statistical methods on phase
    let primaryMethod,
      missingDataMethod,
      continuousMethod,
      binaryMethod,
      timeToEventMethod,
      multiplicityMethod,
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
        primaryMissingDataApproach = 'Methods appropriate for the study design';
        sensitivityAnalyses = 'Methods appropriate for the study design';
    }

    return {
      primaryMethod,
      missingDataMethod,
      continuousMethod,
      binaryMethod,
      timeToEventMethod,
      multiplicityMethod,
      primaryMissingDataApproach,
      sensitivityAnalyses,
    };
  }

  /**
   * Retrieve a saved SAP by protocol ID
   * @param protocolId The protocol ID to retrieve
   * @returns The SAP content, or null when none was saved. A read that fails
   * throws: it answered null — "no SAP" — until 2026-10-15.
   */
  async getSapByProtocolId(protocolId: string): Promise<string | null> {
    const sapPath = path.join(SAP_DIR, `${protocolId}_sap.txt`);
    if (!fs.existsSync(sapPath)) {
      return null;
    }
    return fs.readFileSync(sapPath, 'utf8');
  }

  /**
   * Get the segments of a saved SAP by protocol ID
   * @param protocolId The protocol ID
   * @returns Array of SAP segments; [] when no SAP was saved. A read that fails
   * throws: it answered [] until 2026-10-15.
   */
  async getSapSegmentsByProtocolId(protocolId: string): Promise<
    Array<{
      section: string;
      content: string;
      order: number;
    }>
  > {
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
  }

  /**
   * Update the SAP when a protocol is updated
   * @param protocolId The protocol ID
   * @param organizationId The caller's organization; the protocol is read only within it
   * @param updatedData Updated protocol data
   * @returns Updated SAP content, or null when the organization has no such protocol
   *
   * Uses what the update states and, for indication and phase, what the stored
   * report holds. Until 2026-10-15 a missing sample size became 100, the
   * endpoint 'treatment efficacy', duration 24 weeks, dropout 0.15 and
   * indication / phase 'Unknown', and any failure returned the null that means
   * "no such protocol". A missing input is refused (SapInputRefusal) now, and a
   * failure is thrown. The report was read by id alone, from any organization,
   * until the same date.
   */
  async updateSap(
    protocolId: string,
    organizationId: number,
    updatedData: Partial<SapRequestData>
  ): Promise<GeneratedSapData | null> {
    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      throw new Error(`updateSap: organizationId must be a positive integer (got ${JSON.stringify(organizationId)}); refusing an unscoped read.`);
    }
    // Get current protocol data
    const dbInstance = this.getDb();
    const protocol = await dbInstance
      .select()
      .from(csrReports)
      .where(and(eq(csrReports.id, parseInt(protocolId)), eq(csrReports.organizationId, organizationId)))
      .limit(1);

    if (protocol.length === 0) {
      logger.warn(`No protocol found with ID ${protocolId}`);
      return null;
    }

    // Generate updated SAP
    return this.generateSAP(
      requireSapInputs({
        protocol_id: protocolId,
        indication: updatedData.indication || protocol[0].indication || undefined,
        phase: updatedData.phase || protocol[0].phase || undefined,
        sample_size: updatedData.sample_size,
        primary_endpoint: updatedData.primary_endpoint,
        secondary_endpoints: updatedData.secondary_endpoints,
        duration_weeks: updatedData.duration_weeks,
        dropout_rate: updatedData.dropout_rate,
      }),
    );
  }
}

export default SapGeneratorService.getInstance();
