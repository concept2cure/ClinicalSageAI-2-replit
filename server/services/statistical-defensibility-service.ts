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

interface DefensibilityReport {
  overallScore: number;
  overallRating: 'strong' | 'adequate' | 'weak' | 'deficient';
  dimensionScores: {
    endpointQuality: number;
    sampleSizeAdequacy: number;
    multiplicityControl: number;
    missingDataHandling: number;
    statisticalMethodChoice: number;
    designAppropriateness: number;
    estimandClarity: number;
  };
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

For each issue found, classify as critical/major/minor and suggest mitigation.

Return JSON:
{
  "dimensionScores": { "endpointQuality": 0-100, "sampleSizeAdequacy": 0-100, "multiplicityControl": 0-100, "missingDataHandling": 0-100, "statisticalMethodChoice": 0-100, "designAppropriateness": 0-100, "estimandClarity": 0-100 },
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
      return this.defaultReport();
    }

    const parsed = JSON.parse(content);
    const scores = parsed.dimensionScores || {};

    const overallScore = Math.round(
      (
        (scores.endpointQuality || 50) +
        (scores.sampleSizeAdequacy || 50) +
        (scores.multiplicityControl || 50) +
        (scores.missingDataHandling || 50) +
        (scores.statisticalMethodChoice || 50) +
        (scores.designAppropriateness || 50) +
        (scores.estimandClarity || 50)
      ) / 7
    );

    const overallRating: DefensibilityReport['overallRating'] =
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
      dimensionScores: {
        endpointQuality: scores.endpointQuality || 50,
        sampleSizeAdequacy: scores.sampleSizeAdequacy || 50,
        multiplicityControl: scores.multiplicityControl || 50,
        missingDataHandling: scores.missingDataHandling || 50,
        statisticalMethodChoice: scores.statisticalMethodChoice || 50,
        designAppropriateness: scores.designAppropriateness || 50,
        estimandClarity: scores.estimandClarity || 50,
      },
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

  private defaultReport(): DefensibilityReport {
    return {
      overallScore: 0,
      overallRating: 'deficient',
      dimensionScores: {
        endpointQuality: 0, sampleSizeAdequacy: 0, multiplicityControl: 0,
        missingDataHandling: 0, statisticalMethodChoice: 0, designAppropriateness: 0,
        estimandClarity: 0,
      },
      criticalIssues: [{ category: 'System', description: 'Assessment could not be completed', severity: 'critical', affectedSection: 'All', suggestedMitigation: 'Retry with complete study data' }],
      majorIssues: [],
      minorIssues: [],
      recommendations: ['Provide complete study design data for assessment'],
      reviewerRiskLevel: 'high',
    };
  }
}

export const statisticalDefensibilityService = new StatisticalDefensibilityService();
