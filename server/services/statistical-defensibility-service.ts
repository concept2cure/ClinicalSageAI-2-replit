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
import type { VerificationOutcome } from '../lib/verification-outcome';

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
import { ai } from '../lib/unified-ai-client';

interface DefensibilityRequest {
  studyPhase: string;
  indication: string;
  studyDesign: string;
  primaryEndpoint: EndpointForAssessment;
  secondaryEndpoints: EndpointForAssessment[];
  sampleSize: number;
  powerAssumptions?: { effectSize: number; alpha: number; power: number; dropoutRate: number };
  statisticalMethods: string[];
  multiplicityMethod?: string;
  missingDataMethod?: string;
  interimAnalysis?: boolean;
  adaptiveDesign?: boolean;
  subgroupAnalyses?: string[];
  estimandStrategy?: string;
}

interface DefensibilityIssue {
  category: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  affectedSection: string;
  regulatoryPrecedent?: string;
  suggestedMitigation: string;
}

/** The seven dimensions of a defensibility assessment, in report order. */
const DIMENSION_KEYS = [
  'endpointQuality',
  'sampleSizeAdequacy',
  'multiplicityControl',
  'missingDataHandling',
  'statisticalMethodChoice',
  'designAppropriateness',
  'estimandClarity',
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

interface DefensibilityReport {
  /** The mean of all seven dimensions, or null when any went unscored. */
  overallScore: number | null;
  overallRating: 'strong' | 'adequate' | 'weak' | 'deficient' | null;
  /** A dimension the model did not score is null — never a substituted midpoint. */
  dimensionScores: Record<DimensionKey, number | null>;
  /**
   * WO-16C finding 45 — the third state, in the vocabulary of
   * server/lib/verification-outcome.ts. The overall score was either computed
   * from all seven dimensions or it was not; when it was not, this carries the
   * reason in place of a number. "Could not score" is not a low score.
   */
  scoreBasis: VerificationOutcome<{ assessedDimensions: DimensionKey[] }>;
  criticalIssues: DefensibilityIssue[];
  majorIssues: DefensibilityIssue[];
  minorIssues: DefensibilityIssue[];
  recommendations: string[];
  reviewerRiskLevel: 'low' | 'moderate' | 'high';
}

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
   * Comprehensive defensibility assessment.
   */
  async assessDefensibility(request: DefensibilityRequest): Promise<DefensibilityReport> {
    const aiResult = await ai.chat(
      [
        {
          role: 'system',
          content: `You are a senior biostatistician reviewing a clinical study design for regulatory submission to FDA/EMA. Evaluate the study for statistical defensibility.

For each of these 7 dimensions, provide a score (0-100) and identify issues:

1. Endpoint Quality: Is the primary endpoint clinically meaningful, well-defined, validated? Is it a surrogate? Does it have regulatory precedent?
2. Sample Size Adequacy: Are assumptions reasonable? Is the study adequately powered? Is the dropout rate realistic?
3. Multiplicity Control: Is familywise error rate controlled? Are multiple primary/secondary endpoints handled?
4. Missing Data Handling: Is the approach per ICH E9(R1)? Is MMRM/MI used instead of LOCF? Are sensitivity analyses planned?
5. Statistical Method Choice: Are the methods appropriate for the endpoint type? Are covariates pre-specified?
6. Design Appropriateness: Is the study design suitable for the indication and phase?
7. Estimand Clarity: Are estimands defined per ICH E9(R1)? Are intercurrent events addressed?

If a dimension cannot be assessed from the inputs below, return null for that dimension and say why in minorIssues. Do not estimate a score to fill the gap: an unscored dimension is reported as unscored, and a study whose sample size, statistical methods, multiplicity, missing-data or estimand strategy were not supplied has not told you enough to score the dimensions that depend on them.

You are given only the study description below. No precedent corpus, literature index or database lookup is available to you, so "regulatoryPrecedent" must be null unless the precedent is stated verbatim in that description.

For each issue found, classify as critical/major/minor and suggest mitigation.

Return JSON:
{
  "dimensionScores": { "endpointQuality": 0-100 or null, "sampleSizeAdequacy": 0-100 or null, "multiplicityControl": 0-100 or null, "missingDataHandling": 0-100 or null, "statisticalMethodChoice": 0-100 or null, "designAppropriateness": 0-100 or null, "estimandClarity": 0-100 or null },
  "criticalIssues": [{ "category": "string", "description": "string", "severity": "critical", "affectedSection": "string", "regulatoryPrecedent": "string or null", "suggestedMitigation": "string" }],
  "majorIssues": [...],
  "minorIssues": [...],
  "recommendations": ["string"]
}`,
        },
        {
          role: 'user',
          content: `Assess this study design:
Phase: ${request.studyPhase}
Indication: ${request.indication}
Design: ${request.studyDesign}
Primary Endpoint: ${JSON.stringify(request.primaryEndpoint)}
Secondary Endpoints: ${JSON.stringify(request.secondaryEndpoints)}
Sample Size: ${request.sampleSize}
Power Assumptions: ${JSON.stringify(request.powerAssumptions || 'Not provided')}
Statistical Methods: ${request.statisticalMethods.join(', ')}
Multiplicity: ${request.multiplicityMethod || 'Not specified'}
Missing Data: ${request.missingDataMethod || 'Not specified'}
Interim Analysis: ${request.interimAnalysis || false}
Adaptive Design: ${request.adaptiveDesign || false}
Subgroups: ${(request.subgroupAnalyses || []).join(', ') || 'None'}
Estimand Strategy: ${request.estimandStrategy || 'Not specified'}`,
        },
      ],
      { taskType: 'regulatory_review', jsonMode: true, temperature: 0.2, maxTokens: 4000, callerModule: 'statistical-defensibility-service' }
    );

    const content = aiResult.content;
    if (!content) {
      return this.defaultReport('The model returned no content, so no dimension was scored.');
    }

    const parsed = JSON.parse(content);
    const scores = (parsed.dimensionScores || {}) as Record<string, unknown>;

    // WO-16C finding 45. Every dimension used to be read as `scores.X || 50`,
    // which turned BOTH a dimension the model omitted and a worst score of 0 it
    // actually reported into the same hardcoded midpoint. A reported 0 is a
    // finding; a 50 nothing computed is an invention, and it moved the rendered
    // rating across the 40/60/80 thresholds with no indicator. Read each score
    // as a number in range or as "not assessed" — those are different states.
    const dimensionScores = {} as Record<DimensionKey, number | null>;
    const assessedDimensions: DimensionKey[] = [];
    const unassessedDimensions: DimensionKey[] = [];
    for (const key of DIMENSION_KEYS) {
      const raw = scores[key];
      const value =
        typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
      dimensionScores[key] = value;
      (value === null ? unassessedDimensions : assessedDimensions).push(key);
    }

    // `overallScore` is the mean of all seven dimensions and is labelled as one
    // wherever it is rendered. The mean of whichever subset came back is a
    // different quantity, so it is withheld with a reason rather than relabelled.
    const scoreBasis: DefensibilityReport['scoreBasis'] =
      unassessedDimensions.length === 0
        ? { ran: true, assessedDimensions }
        : {
            ran: false,
            reason:
              `No usable 0-100 score was returned for: ${unassessedDimensions.join(', ')}. ` +
              'An overall score is the mean of all seven dimensions, so none was computed. ' +
              'This is not a verdict on the study: those dimensions were not assessed.',
          };

    const overallScore = scoreBasis.ran
      ? Math.round(
          assessedDimensions.reduce((sum, key) => sum + (dimensionScores[key] as number), 0) /
            DIMENSION_KEYS.length,
        )
      : null;

    const overallRating: DefensibilityReport['overallRating'] =
      overallScore === null ? null :
      overallScore >= 80 ? 'strong' :
      overallScore >= 60 ? 'adequate' :
      overallScore >= 40 ? 'weak' : 'deficient';

    const criticalCount = (parsed.criticalIssues || []).length;
    const majorCount = (parsed.majorIssues || []).length;
    const reviewerRisk: 'low' | 'moderate' | 'high' =
      criticalCount > 0 ? 'high' :
      majorCount > 2 ? 'high' :
      majorCount > 0 ? 'moderate' : 'low';

    return {
      overallScore,
      overallRating,
      dimensionScores,
      scoreBasis,
      criticalIssues: parsed.criticalIssues || [],
      majorIssues: parsed.majorIssues || [],
      minorIssues: parsed.minorIssues || [],
      recommendations: parsed.recommendations || [],
      reviewerRiskLevel: reviewerRisk,
    };
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
   * Generate reviewer risk annotations.
   */
  async generateReviewerRiskAnnotations(studyData: {
    phase: string;
    indication: string;
    design: string;
    endpoints: EndpointForAssessment[];
    sampleSize: number;
    statisticalMethods: string[];
    multiplicityApproach?: string;
    missingDataApproach?: string;
    hasInterimAnalysis: boolean;
    subgroupAnalyses: string[];
  }): Promise<ReviewerRiskAnnotation[]> {
    const aiResult = await ai.chat(
      [
        {
          role: 'system',
          content: `You are an FDA/EMA statistical reviewer. Based on the study design provided, predict specific questions or objections a regulatory reviewer would raise. For each concern, provide severity (high/medium/low), the affected submission section, the likely reviewer question, and a suggested response.

Return JSON: { "annotations": [{ "concern": "string", "severity": "high|medium|low", "affectedSection": "string", "likelyQuestion": "string", "suggestedResponse": "string" }] }`,
        },
        {
          role: 'user',
          content: `Predict reviewer concerns for this study:\n${JSON.stringify(studyData, null, 2)}`,
        },
      ],
      { taskType: 'regulatory_review', jsonMode: true, temperature: 0.3, maxTokens: 3000, callerModule: 'statistical-defensibility-service' }
    );

    const content = aiResult.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    return parsed.annotations || [];
  }

  /**
   * The assessment did not run. WO-16C finding 45: it used to say 0/100 and
   * "deficient", which is a verdict on the study — the opposite of what
   * happened. Scores are null and `scoreBasis` carries the reason.
   */
  private defaultReport(reason: string): DefensibilityReport {
    return {
      overallScore: null,
      overallRating: null,
      dimensionScores: {
        endpointQuality: null, sampleSizeAdequacy: null, multiplicityControl: null,
        missingDataHandling: null, statisticalMethodChoice: null, designAppropriateness: null,
        estimandClarity: null,
      },
      scoreBasis: { ran: false, reason },
      criticalIssues: [{ category: 'System', description: 'Assessment could not be completed', severity: 'critical', affectedSection: 'All', suggestedMitigation: 'Retry with complete study data' }],
      majorIssues: [],
      minorIssues: [],
      recommendations: ['Provide complete study design data for assessment'],
      reviewerRiskLevel: 'high',
    };
  }
}

export const statisticalDefensibilityService = new StatisticalDefensibilityService();
