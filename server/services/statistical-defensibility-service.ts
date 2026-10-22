/**
 * Statistical Defensibility Service
 *
 * Evaluates the statistical rigor and defensibility of clinical study designs,
 * analysis plans, and results. Identifies weaknesses that regulatory reviewers
 * would likely flag.
 *
 * Audit finding: system had good estimand/SAP logic but lacked automated
 * consistency checking between protocol, SAP, and CSR — and had no
 * defensibility scoring.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// Types
// ============================================================

interface EndpointForAssessment {
  name: string;
  category: 'primary' | 'secondary' | 'exploratory';
  type: 'continuous' | 'binary' | 'time_to_event' | 'ordinal' | 'count' | 'composite' | 'patient_reported';
  measurementVariable: string;
  timepoint: string;
  clinicalRelevance: string;
  isSurrogate: boolean;
  regulatoryQualification?: string;
}
import { anaBiostatsOrchestrator } from './ana-biostats/orchestrator';
import { toBiostatsInput } from './ana-biostats/request-input';
import type { ComputationAssumption, ComputationResult, JudgmentResult, JudgmentVerdict, StatisticalInput } from './ana-biostats/types';

/**
 * A defensibility assessment, from the deterministic judgment engine
 * (ana-biostats/judgment-engine.ts) — the engine AnA's
 * assess_statistical_defensibility tool runs.
 *
 * 2026-10-05 (CLAUDE.md Rule 2): this used to be a model's 0-100 score on
 * seven dimensions, with the overall rating and reviewer-risk level derived
 * from what it returned. A verdict on a study's statistics is a governed
 * output; it now comes from the engine, which computes the design first and
 * judges what it computed. When the engine lacks an input it says so
 * ('needs_parameters') rather than scoring around the gap.
 */
export type DefensibilityAssessment =
  | {
      status: 'needs_parameters';
      engine: 'deterministic';
      errors: unknown[];
      message: string;
    }
  | {
      status: 'assessed';
      engine: 'deterministic';
      sampleSize: number | null;
      power: number | null;
      /**
       * What the engine says it computed. Carried since 2026-10-12.
       *
       * The payload held only sampleSize, power and the judgment, so nothing
       * on screen stated the method or the hazard ratio the sizing used — and
       * the workbench labelled the engine's `effectSize` "Hazard ratio" when
       * the engine reads it as the hazard-ratio REDUCTION. A sponsor typing
       * their protocol's HR of 0.7 was sized for HR 0.300: 50 subjects where
       * 550 is right, with nothing in the response to contradict the label.
       * `formula` prints "HR=0.700", which is the line that would have caught
       * it, and `assumptions` names the event rate the engine defaulted —
       * which is what turns events into subjects.
       */
      method: string | null;
      formula: string | null;
      assumptions: ComputationAssumption[];
      judgment: Pick<
        JudgmentResult,
        | 'overallVerdict'
        | 'overallRisk'
        | 'actionRecommendation'
        | 'confidence'
        | 'dimensions'
        | 'fragility'
        | 'endpointMethodFit'
        | 'escalationReasons'
      >;
    };

/**
 * A `ComputationRefusal` reported as the assessment's own answer.
 *
 * A refusal is the engine declining to invent a figure, not a fault — and it
 * threw straight out of this service, so a caller that asked for an assessment
 * got an exception. Same defect the ana-biostats routes had until 2026-10-11:
 * the refusal contract only works if every caller reports a refusal AS one.
 *
 * The engine's own sentence is the message, because it names the input AND the
 * convention — for a time-to-event design, that `effectSize` is the
 * hazard-ratio reduction, which is the thing a mislabelled field got wrong.
 * Anything that is not a refusal is rethrown: a real fault must not be dressed
 * as a missing parameter.
 */
function refusalAsAssessment(err: unknown): DefensibilityAssessment {
  const e = err as { name?: unknown; message?: unknown; field?: unknown };
  if (e?.name !== 'ComputationRefusal') throw err;
  return {
    status: 'needs_parameters',
    engine: 'deterministic',
    errors: typeof e.field === 'string' ? [{ field: e.field }] : [],
    message: typeof e.message === 'string' ? e.message : NEEDS_PARAMETERS_MESSAGE,
  };
}

/**
 * The 'assessed' payload: the figures the engine computed, what it says about
 * HOW it computed them, and the judgment OF that computation.
 *
 * `method`, `formula` and `assumptions` are carried since 2026-10-12. The
 * payload held only the N, the power and the judgment, so nothing on screen
 * stated the method or — in the formula — the hazard ratio the sizing used.
 * The workbench meanwhile labelled the engine's `effectSize` "Hazard ratio"
 * when the engine reads it as the hazard-ratio REDUCTION, so a sponsor typing
 * their protocol's HR of 0.7 was sized for HR 0.300 (50 subjects where 550 is
 * right) with nothing in the response to contradict the label. `formula`
 * prints "HR=0.700"; `assumptions` names the event rate the engine defaulted,
 * which is what turns events into subjects.
 */
function assessedFrom(
  computation: ComputationResult | null,
  j: JudgmentResult,
): DefensibilityAssessment {
  return {
    status: 'assessed',
    engine: 'deterministic',
    sampleSize: computation?.adjustedTotal ?? computation?.sampleSize.total ?? null,
    power: computation?.power ?? null,
    method: computation?.method ?? null,
    formula: computation?.formula ?? null,
    assumptions: computation?.assumptions ?? [],
    judgment: {
      overallVerdict: j.overallVerdict,
      overallRisk: j.overallRisk,
      actionRecommendation: j.actionRecommendation,
      confidence: j.confidence,
      dimensions: j.dimensions,
      fragility: j.fragility,
      endpointMethodFit: j.endpointMethodFit,
      escalationReasons: j.escalationReasons,
    },
  };
}

const NEEDS_PARAMETERS_MESSAGE =
  'The statistics engine could not assess this design: the inputs listed in errors are missing or invalid. ' +
  'No verdict was formed.';

interface ConsistencyReport {
  overallConsistency: 'consistent' | 'minor_discrepancies' | 'major_discrepancies';
  discrepancies: Array<{
    field: string;
    protocolValue: string;
    sapValue: string;
    csrValue?: string;
    severity: 'critical' | 'major' | 'minor';
    recommendation: string;
  }>;
}

interface ProtocolStatData {
  primaryEndpoint: string;
  secondaryEndpoints: string[];
  sampleSize: number;
  statisticalMethods: string[];
  analysisPopulations: string[];
  alpha: number;
  power: number;
}

interface SAPStatData {
  primaryEndpoint: string;
  secondaryEndpoints: string[];
  sampleSize: number;
  statisticalMethods: string[];
  analysisPopulations: string[];
  alpha: number;
  multiplicityMethod?: string;
  missingDataMethod?: string;
  sensitivityAnalyses?: string[];
}

interface CSRStatData {
  primaryEndpoint: string;
  secondaryEndpoints: string[];
  actualSampleSize: number;
  statisticalMethods: string[];
  analysisPopulations: string[];
  results: any;
}

interface ReviewerRiskAnnotation {
  concern: string;
  severity: 'high' | 'medium' | 'low';
  affectedSection: string;
  likelyQuestion: string;
  suggestedResponse: string;
}

interface SampleSizeEvaluation {
  adequacy: 'adequate' | 'marginal' | 'inadequate' | 'cannot_assess';
  effectSizeReasonableness: string;
  powerAssessment: string;
  dropoutAssumption: string;
  issues: string[];
  recommendations: string[];
}

interface MultiplicityAssessment {
  adequacy: 'adequate' | 'inadequate' | 'not_applicable';
  familywiseErrorControlled: boolean;
  issues: string[];
  recommendedApproach?: string;
}

// ============================================================
// Service
// ============================================================

class StatisticalDefensibilityService {

  /**
   * Defensibility assessment of a design, by the deterministic engine. The
   * request is read exactly as AnA's biostatistics tools read their input
   * (ana-biostats/request-input.ts).
   */
  async assessDefensibility(request: Record<string, unknown>): Promise<DefensibilityAssessment> {
    let result: ReturnType<typeof anaBiostatsOrchestrator.quickCompute>;
    try {
      result = anaBiostatsOrchestrator.quickCompute(toBiostatsInput(request) as Partial<StatisticalInput>);
    } catch (err) {
      return refusalAsAssessment(err);
    }
    if (!result.validation.valid || !result.judgment) {
      return {
        status: 'needs_parameters',
        engine: 'deterministic',
        errors: result.validation.errors ?? [],
        message: NEEDS_PARAMETERS_MESSAGE,
      };
    }
    return assessedFrom(result.computation ?? null, result.judgment);
  }

  /**
   * Check consistency between Protocol, SAP, and CSR.
   */
  async checkConsistency(
    protocolData: ProtocolStatData,
    sapData: SAPStatData,
    csrData?: CSRStatData
  ): Promise<ConsistencyReport> {
    const discrepancies: ConsistencyReport['discrepancies'] = [];

    // Endpoint consistency
    if (protocolData.primaryEndpoint !== sapData.primaryEndpoint) {
      discrepancies.push({
        field: 'Primary Endpoint',
        protocolValue: protocolData.primaryEndpoint,
        sapValue: sapData.primaryEndpoint,
        csrValue: csrData?.primaryEndpoint,
        severity: 'critical',
        recommendation: 'Primary endpoint must be identical across protocol, SAP, and CSR. Amend the discrepant document.',
      });
    }

    // Sample size
    if (protocolData.sampleSize !== sapData.sampleSize) {
      discrepancies.push({
        field: 'Sample Size',
        protocolValue: String(protocolData.sampleSize),
        sapValue: String(sapData.sampleSize),
        csrValue: csrData ? String(csrData.actualSampleSize) : undefined,
        severity: 'major',
        recommendation: 'Reconcile sample size across documents. If SAP updated sample size, reference the amendment.',
      });
    }

    // Alpha level
    if (protocolData.alpha !== sapData.alpha) {
      discrepancies.push({
        field: 'Alpha Level',
        protocolValue: String(protocolData.alpha),
        sapValue: String(sapData.alpha),
        severity: 'critical',
        recommendation: 'Alpha level must be pre-specified and consistent. Any change requires a protocol amendment.',
      });
    }

    // Analysis populations
    const protocolPops = new Set(protocolData.analysisPopulations.map(p => p.toLowerCase()));
    const sapPops = new Set(sapData.analysisPopulations.map(p => p.toLowerCase()));
    const missingInSAP = [...protocolPops].filter(p => !sapPops.has(p));
    if (missingInSAP.length > 0) {
      discrepancies.push({
        field: 'Analysis Populations',
        protocolValue: protocolData.analysisPopulations.join(', '),
        sapValue: sapData.analysisPopulations.join(', '),
        severity: 'major',
        recommendation: `SAP missing populations defined in protocol: ${missingInSAP.join(', ')}`,
      });
    }

    // Secondary endpoints count
    if (protocolData.secondaryEndpoints.length !== sapData.secondaryEndpoints.length) {
      discrepancies.push({
        field: 'Number of Secondary Endpoints',
        protocolValue: String(protocolData.secondaryEndpoints.length),
        sapValue: String(sapData.secondaryEndpoints.length),
        severity: 'major',
        recommendation: 'Ensure all secondary endpoints from the protocol are addressed in the SAP.',
      });
    }

    // Statistical methods
    const protocolMethods = new Set(protocolData.statisticalMethods.map(m => m.toLowerCase()));
    const sapMethods = new Set(sapData.statisticalMethods.map(m => m.toLowerCase()));
    for (const method of protocolMethods) {
      if (!sapMethods.has(method)) {
        discrepancies.push({
          field: 'Statistical Methods',
          protocolValue: method,
          sapValue: 'Not found in SAP',
          severity: 'minor',
          recommendation: `Protocol specifies "${method}" but SAP does not reference it.`,
        });
      }
    }

    // CSR-specific checks
    if (csrData) {
      if (csrData.actualSampleSize < protocolData.sampleSize * 0.8) {
        discrepancies.push({
          field: 'Actual vs Planned Sample Size',
          protocolValue: String(protocolData.sampleSize),
          sapValue: String(sapData.sampleSize),
          csrValue: String(csrData.actualSampleSize),
          severity: 'major',
          recommendation: 'Actual enrollment is >20% below planned. Discuss impact on study power in the CSR.',
        });
      }
    }

    const overallConsistency: ConsistencyReport['overallConsistency'] =
      discrepancies.some(d => d.severity === 'critical') ? 'major_discrepancies' :
      discrepancies.some(d => d.severity === 'major') ? 'minor_discrepancies' : 'consistent';

    return { overallConsistency, discrepancies };
  }

  /**
   * Assess endpoint quality.
   */
  async assessEndpointQuality(
    endpoints: EndpointForAssessment[]
  ): Promise<{ endpoints: Array<EndpointForAssessment & { qualityScore: number; issues: string[] }> }> {
    const results = endpoints.map((ep) => {
      const issues: string[] = [];
      let score = 80;

      if (ep.isSurrogate && !ep.regulatoryQualification) {
        issues.push('Surrogate endpoint without regulatory qualification — may face scrutiny');
        score -= 20;
      }

      if (ep.category === 'primary' && ep.type === 'composite') {
        issues.push('Composite primary endpoint — ensure components are clinically related and directionally consistent');
        score -= 5;
      }

      if (ep.category === 'primary' && ep.type === 'patient_reported') {
        issues.push('PRO as primary endpoint — ensure instrument is validated and FDA-qualified');
        score -= 10;
      }

      if (!ep.timepoint || ep.timepoint.toLowerCase() === 'not specified') {
        issues.push('Assessment timepoint not specified — critical for endpoint definition');
        score -= 15;
      }

      if (!ep.measurementVariable || ep.measurementVariable.length < 5) {
        issues.push('Measurement variable poorly defined');
        score -= 10;
      }

      return { ...ep, qualityScore: Math.max(0, score), issues };
    });

    return { endpoints: results };
  }

  /**
   * Evaluate sample size justification.
   */
  async evaluateSampleSize(params: {
    indication: string;
    phase: string;
    endpointType: string;
    plannedSampleSize: number;
    effectSize: number;
    alpha: number;
    power: number;
    dropoutRate: number;
  }): Promise<SampleSizeEvaluation> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Basic checks
    if (params.power < 0.8) {
      issues.push(`Power of ${params.power * 100}% is below the standard 80% threshold`);
      recommendations.push('Consider increasing sample size to achieve at least 80% power');
    }

    if (params.alpha > 0.05) {
      issues.push(`Alpha of ${params.alpha} exceeds the standard 0.05 level`);
    }

    if (params.dropoutRate > 0.3) {
      issues.push(`Dropout rate assumption of ${params.dropoutRate * 100}% is high — may indicate feasibility concerns`);
      recommendations.push('Provide justification for the high dropout rate based on precedent or disease characteristics');
    }

    if (params.dropoutRate < 0.05 && params.phase !== '1') {
      issues.push(`Dropout rate of ${params.dropoutRate * 100}% may be optimistic for a Phase ${params.phase} study`);
      recommendations.push('Review dropout rates from similar completed studies');
    }

    // Phase-specific sample size expectations
    const phaseExpectations: Record<string, { min: number; typical: number }> = {
      '1': { min: 10, typical: 30 },
      '2': { min: 50, typical: 150 },
      '3': { min: 200, typical: 500 },
      '4': { min: 100, typical: 1000 },
    };

    const expected = phaseExpectations[params.phase];
    if (expected && params.plannedSampleSize < expected.min) {
      issues.push(`Sample size of ${params.plannedSampleSize} is unusually small for Phase ${params.phase}`);
    }

    const adequacy: SampleSizeEvaluation['adequacy'] =
      issues.filter(i => i.includes('below') || i.includes('unusually small')).length > 0 ? 'inadequate' :
      issues.length > 1 ? 'marginal' :
      issues.length === 0 ? 'adequate' : 'adequate';

    return {
      adequacy,
      effectSizeReasonableness: params.effectSize > 0.8 ? 'Large effect size — ensure it is supported by pilot data' : 'Reasonable',
      powerAssessment: params.power >= 0.8 ? 'Adequately powered' : 'Underpowered — regulatory risk',
      dropoutAssumption: params.dropoutRate <= 0.2 ? 'Reasonable' : 'Requires justification',
      issues,
      recommendations,
    };
  }

  /**
   * Assess multiplicity control.
   */
  async assessMultiplicityControl(
    endpoints: EndpointForAssessment[],
    multiplicityMethod: string | null
  ): Promise<MultiplicityAssessment> {
    const primaryCount = endpoints.filter(e => e.category === 'primary').length;
    const secondaryCount = endpoints.filter(e => e.category === 'secondary').length;

    if (primaryCount <= 1 && secondaryCount === 0) {
      return {
        adequacy: 'not_applicable',
        familywiseErrorControlled: true,
        issues: [],
      };
    }

    const issues: string[] = [];

    if (primaryCount > 1 && !multiplicityMethod) {
      issues.push('Multiple primary endpoints with no multiplicity adjustment — familywise error rate is inflated');
    }

    if (secondaryCount > 3 && !multiplicityMethod) {
      issues.push(`${secondaryCount} secondary endpoints without multiplicity control — inferential claims are not defensible`);
    }

    const validMethods = ['bonferroni', 'holm', 'hochberg', 'hierarchical', 'gatekeeping', 'graphical', 'fixed_sequence', 'fallback'];
    if (multiplicityMethod && !validMethods.some(m => multiplicityMethod.toLowerCase().includes(m))) {
      issues.push(`Multiplicity method "${multiplicityMethod}" may not be recognized by regulators`);
    }

    return {
      adequacy: issues.length === 0 ? 'adequate' : 'inadequate',
      familywiseErrorControlled: issues.length === 0,
      issues,
      recommendedApproach: issues.length > 0
        ? primaryCount > 1
          ? 'Consider hierarchical testing or graphical approach for multiple primary endpoints'
          : 'Consider Hochberg or gatekeeping procedure for secondary endpoint testing'
        : undefined,
    };
  }

  /**
   * The points a statistical reviewer is likely to raise: every dimension the
   * deterministic judgment did not find adequate, with severity from its
   * verdict and wording from the engine's own rationale and flags. Until
   * 2026-10-05 a model predicted these and assigned their severity.
   */
  async generateReviewerRiskAnnotations(
    request: Record<string, unknown>,
  ): Promise<{ assessment: DefensibilityAssessment; annotations: ReviewerRiskAnnotation[] }> {
    const assessment = await this.assessDefensibility(request);
    if (assessment.status !== 'assessed') return { assessment, annotations: [] };
    const annotations = assessment.judgment.dimensions.flatMap((d): ReviewerRiskAnnotation[] => {
      const severity = REVIEWER_SEVERITY[d.verdict];
      if (!severity) return [];
      const subject = d.name.toLowerCase();
      return [
        {
          concern: `${d.name}: ${d.rationale}`,
          severity,
          affectedSection: 'Statistical methods (protocol and SAP)',
          likelyQuestion:
            d.verdict === 'insufficient_information'
              ? `The ${subject} cannot be assessed from what was supplied. What is it, and how was it determined?`
              : `How is the ${subject} justified?`,
          suggestedResponse: d.flags.length > 0 ? `Address: ${d.flags.join('; ')}.` : d.rationale,
        },
      ];
    });
    return { assessment, annotations };
  }
}

/** A dimension's verdict → the severity of the reviewer point it raises; adequate raises none. */
const REVIEWER_SEVERITY: Record<JudgmentVerdict, ReviewerRiskAnnotation['severity'] | null> = {
  inadequate: 'high',
  marginal: 'medium',
  insufficient_information: 'medium',
  adequate: null,
};

export const statisticalDefensibilityService = new StatisticalDefensibilityService();
