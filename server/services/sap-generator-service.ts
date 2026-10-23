import { db } from '../db';
import { csrReports } from 'shared/schema';
import { eq, and } from 'drizzle-orm';
import { OperatingSystemIntegration, SapCaptureIncomplete } from './operating-system-integration';
import { LedgerInputRefusal } from './assumption-registry-service';
import {
  renderEstimandSection,
  type EstimandInput,
  type RenderedEstimandSection,
} from './estimand-sap-section';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('sap-generator-service');

// 2026-10-15: generateSAP wrote data/sap/<protocol_id>_sap.txt — one directory
// for every organization, keyed by protocol id alone — and two readers read it
// back by protocol id alone. Nothing called the readers, and the continuum keeps
// the SAP as its thread's sapSnapshot.content. The file, its directory and the
// readers are gone.

/** The type of the primary endpoint's variable, as the request states it. */
export type SapEndpointType = 'continuous' | 'binary' | 'time_to_event';
const SAP_ENDPOINT_TYPES: readonly SapEndpointType[] = ['continuous', 'binary', 'time_to_event'];
const ENDPOINT_TYPE_LABEL: Record<SapEndpointType, string> = {
  continuous: 'continuous',
  binary: 'binary',
  time_to_event: 'time-to-event',
};

export interface SapRequestData {
  protocol_id?: string;
  indication: string;
  phase: string;
  sample_size: number;
  primary_endpoint: string;
  // The methods template's primary analysis is stated only for a type it fits;
  // absent, the SAP says the method is not determined (2026-10-15).
  primary_endpoint_type?: SapEndpointType;
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
  ['primary_endpoint_type', (v) => (SAP_ENDPOINT_TYPES as readonly unknown[]).includes(v), `one of ${SAP_ENDPOINT_TYPES.join(', ')}`],
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

/** A phase template's methods, and the primary-endpoint types its primary analysis fits. */
interface StatisticalMethods {
  primaryMethod: string;
  primaryFits: readonly SapEndpointType[];
  missingDataMethod: string;
  continuousMethod: string;
  binaryMethod: string;
  timeToEventMethod: string;
  multiplicityMethod: string;
  primaryMissingDataApproach: string;
  sensitivityAnalyses: string;
}

/**
 * The primary analysis and its missing-data handling as the phase template has
 * them, stated only for an endpoint type the template's method fits; otherwise
 * the method is not determined, and the SAP says why. Until 2026-10-15 the
 * template's method was printed as the plan whatever the endpoint was (MMRM
 * for overall survival).
 */
function primaryAnalysis(methods: StatisticalMethods, phase: string, type: SapEndpointType | undefined) {
  // A method that fits every type fits whatever the type is, stated or not.
  const fitsEveryType = SAP_ENDPOINT_TYPES.every((t) => methods.primaryFits.includes(t));
  if (type ? methods.primaryFits.includes(type) : fitsEveryType) {
    return {
      plan: [
        `The primary endpoint will be analyzed using ${methods.primaryMethod}.`,
        `Missing data will be handled using ${methods.missingDataMethod}.`,
        'The analysis method is aligned with the estimand defined in Section 2.',
      ].join('\n       '),
      missingData: [
        `Primary approach: ${methods.primaryMissingDataApproach}`,
        `Sensitivity analyses: ${methods.sensitivityAnalyses}`,
        'Missing-data handling supports the intercurrent-event strategies in the Section 2 estimands.',
      ].join('\n   '),
    };
  }
  const why = !type
    ? "method not determined — the primary endpoint's type (continuous, binary or time-to-event) was not stated"
    : methods.primaryFits.length === 0
      ? `method not determined for a ${ENDPOINT_TYPE_LABEL[type]} endpoint — there is no methods template for "${phase}"`
      : `method not determined for a ${ENDPOINT_TYPE_LABEL[type]} endpoint — the ${phase} template's ${methods.primaryMethod} ` +
        `applies to ${methods.primaryFits.map((t) => ENDPOINT_TYPE_LABEL[t]).join(', ')} endpoints`;
  return {
    plan: `Primary analysis: ${why}. To be set by the study statistician.`,
    missingData: [
      'Primary approach: not determined (the primary analysis method is not determined)',
      'Sensitivity analyses: not determined',
    ].join('\n   '),
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
      const primary = primaryAnalysis(statisticalMethods, phase, request.primary_endpoint_type);

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
       ${primary.plan}

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
   ${primary.missingData}

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

      // storeSapSegments, called here until 2026-10-15, read the protocol's
      // csr_reports row with no organization filter, stored nothing, and logged
      // "segments extracted". No file is written (see the note at the top).

      // Capture structured assumptions into the operating system layer
      const { assumptionCapture, captured } = await this.captureInputs(request, {
        power: powerForPrimary,
        effectSize: requiredEffectSize,
      });

      return {
        protocol_id,
        sapContent,
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
   * The methods template for a phase. Nothing else is read: the count-based
   * "similar trials" switch was removed on 2026-10-15 (see generateSAP).
   * primaryFits names the endpoint types the primary analysis (and its
   * missing-data handling) applies to; primaryAnalysis states it only for those.
   * @param phase The trial phase
   * @returns Statistical methods object
   */
  private determineStatisticalMethods(phase: string): StatisticalMethods {
    // Base statistical methods on phase
    let primaryMethod,
      missingDataMethod,
      continuousMethod,
      binaryMethod,
      timeToEventMethod,
      multiplicityMethod,
      primaryMissingDataApproach,
      sensitivityAnalyses;
    let primaryFits: readonly SapEndpointType[];

    // Set default values based on phase
    switch (phase) {
      case 'Phase 1':
        // Descriptive statistics and complete-case analysis apply to any type.
        primaryFits = SAP_ENDPOINT_TYPES;
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
        // ANCOVA on a baseline and LOCF: a continuous, repeatedly measured endpoint.
        primaryFits = ['continuous'];
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
        // MMRM: a continuous endpoint measured at repeated visits.
        primaryFits = ['continuous'];
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

      default: {
        // No template for this phase: no method is determined. Until
        // 2026-10-15 each line read "appropriate … methods", as the plan.
        const none = `method not determined — there is no methods template for "${phase}"`;
        primaryFits = [];
        primaryMethod = none;
        missingDataMethod = none;
        continuousMethod = none;
        binaryMethod = none;
        timeToEventMethod = none;
        multiplicityMethod = `Multiplicity adjustment: ${none}`;
        primaryMissingDataApproach = none;
        sensitivityAnalyses = none;
      }
    }

    return {
      primaryMethod,
      primaryFits,
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
