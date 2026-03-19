/**
 * CMC Comparability & Change Impact Assessment Service
 *
 * Evaluates manufacturing changes per ICH Q5E (biologics) and ICH Q12 guidelines.
 * Determines regulatory classification (minor/moderate/major), identifies impacted
 * CQAs and eCTD sections, and generates comparability assessment narratives.
 *
 * Critical gap identified by audit: the system had NO comparability atom,
 * NO change impact reasoning, and NO automated assessment of manufacturing changes.
 */

import OpenAI from 'openai';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createHash } from 'crypto';

// ============================================================
// Types
// ============================================================

interface ChangeAssessmentRequest {
  organizationId: number;
  projectId: string;
  changeName: string;
  changeType: 'site_transfer' | 'scale_up' | 'process_change' | 'raw_material_change' | 'equipment_change' | 'method_change' | 'specification_change' | 'container_closure_change';
  materialType: 'drug_substance' | 'drug_product' | 'intermediate';
  productType: 'small_molecule' | 'biologic' | 'biosimilar' | 'cell_therapy' | 'gene_therapy';
  preChangeDescription: string;
  postChangeDescription: string;
  affectedProcessSteps?: string[];
  knownCQAs?: string[];
  additionalContext?: string;
}

interface ChangeAssessmentResult {
  assessmentId: string;
  regulatoryClassification: RegulatoryClassification;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  impactedCQAs: Array<{ cqa: string; impactLevel: string; rationale: string }>;
  impactedProcessParameters: Array<{ parameter: string; impactLevel: string }>;
  impactedSections: ImpactedSection[];
  comparabilityTestingRequired: boolean;
  clinicalBridgingRequired: boolean;
  nonclinicalBridgingRequired: boolean;
  recommendedActions: string[];
  narrative: string;
  confidence: number;
}

interface RegulatoryClassification {
  fdaClassification: 'annual_report' | 'cbe0' | 'cbe30' | 'prior_approval_supplement';
  emaClassification: 'type_ia' | 'type_ib' | 'type_ii';
  justification: string;
}

interface ImpactedSection {
  sectionCode: string;
  sectionTitle: string;
  impactLevel: 'update_required' | 'review_recommended' | 'no_change_expected';
  updateDescription: string;
}

interface ComparabilityProtocol {
  analyticalTests: Array<{
    testName: string;
    method: string;
    targetCQA: string;
    acceptanceCriteria: string;
    statisticalApproach: string;
    sampleRequirements: string;
  }>;
  stabilityRequirements: {
    conditions: string[];
    timepoints: string[];
    testsPerTimepoint: string[];
  };
  reportingPlan: string;
}

interface ComparabilityData {
  testName: string;
  preChangeResults: number[];
  postChangeResults: number[];
  acceptanceCriteria: string;
  unit: string;
}

interface ComparabilityConclusion {
  overallConclusion: 'comparable' | 'not_comparable' | 'inconclusive';
  testResults: Array<{
    testName: string;
    preChangeMean: number;
    postChangeMean: number;
    difference: number;
    differencePercent: number;
    withinAcceptanceCriteria: boolean;
    statisticalSignificance: boolean;
    conclusion: string;
  }>;
  narrative: string;
  residualRisks: string[];
  followUpRecommendations: string[];
}

// ============================================================
// Section impact maps
// ============================================================

const SECTION_IMPACT_MAP: Record<string, ImpactedSection[]> = {
  site_transfer: [
    { sectionCode: '3.2.S.2.1', sectionTitle: 'Manufacturer(s)', impactLevel: 'update_required', updateDescription: 'Update manufacturer information and site address' },
    { sectionCode: '3.2.S.2.2', sectionTitle: 'Description of Manufacturing Process and Process Controls', impactLevel: 'review_recommended', updateDescription: 'Review process description for site-specific details' },
    { sectionCode: '3.2.S.2.4', sectionTitle: 'Controls of Critical Steps and Intermediates', impactLevel: 'review_recommended', updateDescription: 'Verify critical step controls are equivalent at new site' },
    { sectionCode: '3.2.S.4.4', sectionTitle: 'Batch Analyses', impactLevel: 'update_required', updateDescription: 'Include batch data from new site' },
    { sectionCode: '3.2.S.7', sectionTitle: 'Stability', impactLevel: 'update_required', updateDescription: 'Initiate stability studies on material from new site' },
    { sectionCode: '3.2.P.3.1', sectionTitle: 'Manufacturer(s) (Drug Product)', impactLevel: 'review_recommended', updateDescription: 'Update if drug product manufacturing is also transferred' },
  ],
  scale_up: [
    { sectionCode: '3.2.S.2.2', sectionTitle: 'Description of Manufacturing Process', impactLevel: 'update_required', updateDescription: 'Update batch size and scale-dependent parameters' },
    { sectionCode: '3.2.S.2.3', sectionTitle: 'Control of Materials', impactLevel: 'review_recommended', updateDescription: 'Review material quantities and handling at new scale' },
    { sectionCode: '3.2.S.2.5', sectionTitle: 'Process Validation and/or Evaluation', impactLevel: 'update_required', updateDescription: 'Include validation data at commercial scale' },
    { sectionCode: '3.2.S.4.4', sectionTitle: 'Batch Analyses', impactLevel: 'update_required', updateDescription: 'Include batch results at new scale' },
  ],
  process_change: [
    { sectionCode: '3.2.S.2.2', sectionTitle: 'Description of Manufacturing Process', impactLevel: 'update_required', updateDescription: 'Update process description to reflect change' },
    { sectionCode: '3.2.S.2.4', sectionTitle: 'Controls of Critical Steps', impactLevel: 'update_required', updateDescription: 'Update critical step controls if affected' },
    { sectionCode: '3.2.S.2.5', sectionTitle: 'Process Validation', impactLevel: 'update_required', updateDescription: 'Revalidate affected process steps' },
    { sectionCode: '3.2.S.4.1', sectionTitle: 'Specifications', impactLevel: 'review_recommended', updateDescription: 'Review if specifications need updating' },
    { sectionCode: '3.2.S.4.4', sectionTitle: 'Batch Analyses', impactLevel: 'update_required', updateDescription: 'Include batch data from modified process' },
    { sectionCode: '3.2.S.7', sectionTitle: 'Stability', impactLevel: 'update_required', updateDescription: 'Stability data on material from modified process' },
  ],
  raw_material_change: [
    { sectionCode: '3.2.S.2.3', sectionTitle: 'Control of Materials', impactLevel: 'update_required', updateDescription: 'Update material specifications and supplier info' },
    { sectionCode: '3.2.S.4.4', sectionTitle: 'Batch Analyses', impactLevel: 'update_required', updateDescription: 'Include batch data using new material' },
  ],
  equipment_change: [
    { sectionCode: '3.2.S.2.2', sectionTitle: 'Description of Manufacturing Process', impactLevel: 'review_recommended', updateDescription: 'Update equipment references if specified' },
    { sectionCode: '3.2.S.2.5', sectionTitle: 'Process Validation', impactLevel: 'update_required', updateDescription: 'Equipment qualification and process revalidation' },
  ],
  method_change: [
    { sectionCode: '3.2.S.4.2', sectionTitle: 'Analytical Procedures', impactLevel: 'update_required', updateDescription: 'Update method description' },
    { sectionCode: '3.2.S.4.3', sectionTitle: 'Validation of Analytical Procedures', impactLevel: 'update_required', updateDescription: 'Include method validation data' },
  ],
  specification_change: [
    { sectionCode: '3.2.S.4.1', sectionTitle: 'Specifications', impactLevel: 'update_required', updateDescription: 'Update specification table' },
    { sectionCode: '3.2.S.4.5', sectionTitle: 'Justification of Specification', impactLevel: 'update_required', updateDescription: 'Update justification for changed limits' },
  ],
  container_closure_change: [
    { sectionCode: '3.2.P.7', sectionTitle: 'Container Closure System', impactLevel: 'update_required', updateDescription: 'Update container closure description' },
    { sectionCode: '3.2.P.8', sectionTitle: 'Stability', impactLevel: 'update_required', updateDescription: 'Stability data in new container closure' },
  ],
};

// ============================================================
// Service
// ============================================================

class CMCComparabilityService {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI();
    }
    return this.openai;
  }

  /**
   * Assess a manufacturing change for regulatory impact.
   */
  async assessChange(request: ChangeAssessmentRequest): Promise<ChangeAssessmentResult> {
    const assessmentId = crypto.randomUUID();

    // Step 1: Get impacted sections from the map
    const impactedSections = this.getImpactedSections(request.changeType, request.materialType);

    // Step 2: Use AI for CQA impact assessment and regulatory classification
    const aiAssessment = await this.getAIAssessment(request);

    // Step 3: Determine risk level
    const riskLevel = this.computeRiskLevel(aiAssessment, request);

    // Step 4: Generate narrative
    const narrative = await this.generateNarrative(request, aiAssessment, impactedSections, riskLevel);

    const result: ChangeAssessmentResult = {
      assessmentId,
      regulatoryClassification: aiAssessment.classification,
      riskLevel,
      impactedCQAs: aiAssessment.impactedCQAs,
      impactedProcessParameters: aiAssessment.impactedParameters,
      impactedSections,
      comparabilityTestingRequired: riskLevel !== 'low',
      clinicalBridgingRequired: riskLevel === 'critical' || (request.productType !== 'small_molecule' && riskLevel === 'high'),
      nonclinicalBridgingRequired: riskLevel === 'critical' || riskLevel === 'high',
      recommendedActions: aiAssessment.recommendedActions,
      narrative,
      confidence: aiAssessment.confidence,
    };

    // Step 5: Persist to database
    await this.persistAssessment(result, request);

    return result;
  }

  /**
   * Get regulatory-impacted eCTD sections for a change type.
   */
  getImpactedSections(changeType: string, materialType: string): ImpactedSection[] {
    const sections = SECTION_IMPACT_MAP[changeType] || [];

    // Adjust section codes for drug product (P) vs drug substance (S)
    if (materialType === 'drug_product') {
      return sections.map((s) => ({
        ...s,
        sectionCode: s.sectionCode.replace('3.2.S', '3.2.P'),
        sectionTitle: s.sectionTitle.replace('Drug Substance', 'Drug Product'),
      }));
    }

    return sections;
  }

  /**
   * Classify a change per FDA and EMA guidelines.
   */
  async classifyChange(request: ChangeAssessmentRequest): Promise<RegulatoryClassification> {
    const assessment = await this.getAIAssessment(request);
    return assessment.classification;
  }

  /**
   * Generate a comparability study protocol.
   */
  async generateComparabilityProtocol(
    assessmentId: string,
    organizationId: number
  ): Promise<ComparabilityProtocol> {
    // Retrieve the assessment
    let assessmentData: any = null;
    try {
      const result = await db.execute(sql`
        SELECT * FROM cmc_comparability_assessments
        WHERE id = ${assessmentId}::uuid AND organization_id = ${organizationId}
        LIMIT 1
      `);
      assessmentData = (result.rows as any[])?.[0];
    } catch {
      // Table may not exist yet
    }

    const openai = this.getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a CMC regulatory scientist. Generate a comparability study protocol based on the manufacturing change assessment provided. Include analytical tests mapped to CQAs, acceptance criteria, statistical approaches, stability requirements, and a reporting plan. Return valid JSON matching: { analyticalTests: [{ testName, method, targetCQA, acceptanceCriteria, statisticalApproach, sampleRequirements }], stabilityRequirements: { conditions: [], timepoints: [], testsPerTimepoint: [] }, reportingPlan: string }`,
        },
        {
          role: 'user',
          content: `Generate comparability protocol for this change:\n${JSON.stringify(assessmentData || { note: 'Assessment not found, generate generic protocol for manufacturing change' })}`,
        },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { analyticalTests: [], stabilityRequirements: { conditions: [], timepoints: [], testsPerTimepoint: [] }, reportingPlan: '' };
    }

    return JSON.parse(content);
  }

  /**
   * Evaluate pre-change vs post-change comparability data.
   */
  async evaluateComparabilityData(
    assessmentId: string,
    data: ComparabilityData[]
  ): Promise<ComparabilityConclusion> {
    const testResults = data.map((d) => {
      const preSum = d.preChangeResults.reduce((a, b) => a + b, 0);
      const postSum = d.postChangeResults.reduce((a, b) => a + b, 0);
      const preMean = preSum / d.preChangeResults.length;
      const postMean = postSum / d.postChangeResults.length;
      const difference = postMean - preMean;
      const differencePercent = preMean !== 0 ? (difference / preMean) * 100 : 0;

      // Simple t-test approximation
      const preVar = d.preChangeResults.reduce((sum, x) => sum + (x - preMean) ** 2, 0) / (d.preChangeResults.length - 1);
      const postVar = d.postChangeResults.reduce((sum, x) => sum + (x - postMean) ** 2, 0) / (d.postChangeResults.length - 1);
      const pooledSE = Math.sqrt(preVar / d.preChangeResults.length + postVar / d.postChangeResults.length);
      const tStat = pooledSE > 0 ? Math.abs(difference) / pooledSE : 0;
      const statisticalSignificance = tStat > 1.96;

      const withinAcceptanceCriteria = Math.abs(differencePercent) < 10; // simplified

      return {
        testName: d.testName,
        preChangeMean: Math.round(preMean * 1000) / 1000,
        postChangeMean: Math.round(postMean * 1000) / 1000,
        difference: Math.round(difference * 1000) / 1000,
        differencePercent: Math.round(differencePercent * 100) / 100,
        withinAcceptanceCriteria,
        statisticalSignificance,
        conclusion: withinAcceptanceCriteria
          ? 'Comparable — within acceptance criteria'
          : statisticalSignificance
            ? 'Not comparable — statistically significant difference outside acceptance criteria'
            : 'Inconclusive — review recommended',
      };
    });

    const allComparable = testResults.every((t) => t.withinAcceptanceCriteria);
    const anyNotComparable = testResults.some((t) => !t.withinAcceptanceCriteria && t.statisticalSignificance);

    const overallConclusion: 'comparable' | 'not_comparable' | 'inconclusive' = allComparable
      ? 'comparable'
      : anyNotComparable
        ? 'not_comparable'
        : 'inconclusive';

    const residualRisks = testResults
      .filter((t) => !t.withinAcceptanceCriteria)
      .map((t) => `${t.testName}: ${t.differencePercent}% difference observed`);

    const followUpRecommendations = overallConclusion === 'comparable'
      ? ['Continue routine stability monitoring', 'Include comparability summary in next annual report']
      : ['Investigate root cause of differences', 'Consider additional testing', 'Evaluate impact on product quality'];

    const narrative = `Comparability assessment evaluated ${testResults.length} analytical tests. ` +
      `${testResults.filter((t) => t.withinAcceptanceCriteria).length} of ${testResults.length} tests met acceptance criteria. ` +
      `Overall conclusion: ${overallConclusion.replace('_', ' ')}.`;

    return {
      overallConclusion,
      testResults,
      narrative,
      residualRisks,
      followUpRecommendations,
    };
  }

  // ============================================================
  // Private methods
  // ============================================================

  private async getAIAssessment(request: ChangeAssessmentRequest): Promise<{
    classification: RegulatoryClassification;
    impactedCQAs: Array<{ cqa: string; impactLevel: string; rationale: string }>;
    impactedParameters: Array<{ parameter: string; impactLevel: string }>;
    recommendedActions: string[];
    confidence: number;
  }> {
    const openai = this.getOpenAI();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a CMC regulatory intelligence specialist. Classify manufacturing changes according to:
- FDA: 21 CFR 314.70 (drugs) / 21 CFR 601.12 (biologics): Annual Report, CBE-0, CBE-30, Prior Approval Supplement
- EMA: Commission Regulation EC No 1234/2008: Type IA, Type IB, Type II variation

Consider: the nature of the change, product type (${request.productType}), potential impact on identity/strength/quality/purity/potency, and whether the change could affect safety or efficacy.

Return valid JSON:
{
  "classification": {
    "fdaClassification": "annual_report|cbe0|cbe30|prior_approval_supplement",
    "emaClassification": "type_ia|type_ib|type_ii",
    "justification": "string"
  },
  "impactedCQAs": [{ "cqa": "string", "impactLevel": "low|moderate|high", "rationale": "string" }],
  "impactedParameters": [{ "parameter": "string", "impactLevel": "low|moderate|high" }],
  "recommendedActions": ["string"],
  "confidence": 0.0-1.0
}`,
        },
        {
          role: 'user',
          content: `Assess this manufacturing change:
Change Name: ${request.changeName}
Change Type: ${request.changeType}
Material: ${request.materialType}
Product Type: ${request.productType}
Pre-change: ${request.preChangeDescription}
Post-change: ${request.postChangeDescription}
Affected Steps: ${request.affectedProcessSteps?.join(', ') || 'Not specified'}
Known CQAs: ${request.knownCQAs?.join(', ') || 'Not specified'}
Additional Context: ${request.additionalContext || 'None'}`,
        },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        classification: { fdaClassification: 'prior_approval_supplement', emaClassification: 'type_ii', justification: 'Unable to assess — defaulting to most conservative classification' },
        impactedCQAs: [],
        impactedParameters: [],
        recommendedActions: ['Manual assessment required'],
        confidence: 0,
      };
    }

    return JSON.parse(content);
  }

  private computeRiskLevel(
    aiAssessment: any,
    request: ChangeAssessmentRequest
  ): 'low' | 'moderate' | 'high' | 'critical' {
    const fdaClass = aiAssessment.classification?.fdaClassification;
    const highImpactCQAs = (aiAssessment.impactedCQAs || []).filter(
      (c: any) => c.impactLevel === 'high'
    ).length;

    if (fdaClass === 'prior_approval_supplement' || highImpactCQAs >= 3) return 'critical';
    if (fdaClass === 'cbe30' || highImpactCQAs >= 1) return 'high';
    if (fdaClass === 'cbe0') return 'moderate';
    return 'low';
  }

  private async generateNarrative(
    request: ChangeAssessmentRequest,
    aiAssessment: any,
    impactedSections: ImpactedSection[],
    riskLevel: string
  ): Promise<string> {
    const openai = this.getOpenAI();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a CMC regulatory writer. Generate a concise comparability assessment narrative (300-500 words) covering: change description, regulatory classification rationale, impacted CQAs, recommended comparability testing approach, and conclusions. Use formal regulatory language.`,
        },
        {
          role: 'user',
          content: `Write a comparability assessment narrative:
Change: ${request.changeName} (${request.changeType})
Material: ${request.materialType} | Product: ${request.productType}
Risk Level: ${riskLevel}
FDA Classification: ${aiAssessment.classification?.fdaClassification}
EMA Classification: ${aiAssessment.classification?.emaClassification}
Impacted CQAs: ${JSON.stringify(aiAssessment.impactedCQAs)}
Impacted Sections: ${impactedSections.map((s) => s.sectionCode).join(', ')}
Pre-change: ${request.preChangeDescription}
Post-change: ${request.postChangeDescription}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    return response.choices[0]?.message?.content || 'Narrative generation failed.';
  }

  private async persistAssessment(
    result: ChangeAssessmentResult,
    request: ChangeAssessmentRequest
  ): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO cmc_comparability_assessments (
          id, organization_id, project_id,
          assessment_name, change_type,
          pre_change_state, post_change_state,
          changed_element, affected_cqas, affected_process_parameters,
          analytical_comparability_evidence,
          clinical_bridging_relevance, regulatory_risk_level,
          regulatory_classification, justification,
          impacted_sections, status,
          created_at, updated_at
        ) VALUES (
          ${result.assessmentId}::uuid,
          ${request.organizationId},
          ${request.projectId}::uuid,
          ${request.changeName},
          ${request.changeType},
          ${JSON.stringify({ description: request.preChangeDescription })}::jsonb,
          ${JSON.stringify({ description: request.postChangeDescription })}::jsonb,
          ${request.changeType},
          ${JSON.stringify(result.impactedCQAs)}::jsonb,
          ${JSON.stringify(result.impactedProcessParameters)}::jsonb,
          ${null}::jsonb,
          ${result.clinicalBridgingRequired ? 'clinical_required' : result.nonclinicalBridgingRequired ? 'nonclinical_only' : 'none'},
          ${result.riskLevel},
          ${result.regulatoryClassification.fdaClassification},
          ${result.regulatoryClassification.justification},
          ${JSON.stringify(result.impactedSections)}::jsonb,
          'draft',
          NOW(), NOW()
        )
      `);
    } catch (error) {
      console.error('[CMCComparability] Failed to persist assessment:', error);
    }
  }
}

export const cmcComparabilityService = new CMCComparabilityService();
