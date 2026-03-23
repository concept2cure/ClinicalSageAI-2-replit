/**
 * Cross-Jurisdictional Intelligence Service
 *
 * Manages ICH frameworks, Project Orbis, Access Consortium pathways,
 * jurisdictional divergence mapping, reliance pathways, and filing sequence optimization.
 *
 * @module server/services/regulatory-precedent-intelligence/cross-jurisdictional-service
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('cross-jurisdictional');

// ─── Types ───────────────────────────────────────────────────────────────────

export type FrameworkType =
  | 'ich' | 'access_consortium' | 'project_orbis' | 'mutual_recognition'
  | 'work_sharing' | 'reliance' | 'recognition' | 'bilateral' | 'regional_harmonization';

export type DivergenceDomain =
  | 'clinical_endpoints' | 'clinical_design' | 'clinical_populations'
  | 'safety_requirements' | 'cmc_specifications' | 'cmc_stability'
  | 'nonclinical_requirements' | 'bioequivalence' | 'biosimilarity'
  | 'labeling' | 'pharmacovigilance' | 'pediatric' | 'orphan'
  | 'real_world_evidence' | 'decentralized_trials' | 'digital_endpoints';

export type RelianceType =
  | 'full_recognition' | 'abridged_review' | 'verification'
  | 'collaborative_review' | 'work_sharing';

export interface CrossJurisdictionalFramework {
  id: string;
  organizationId: string;
  frameworkCode: string;
  frameworkName: string;
  frameworkType: FrameworkType;
  memberAgencies: string[];
  leadAgency: string | null;
  description: string;
  scope: string[];
  eligibilityCriteria: Record<string, unknown>;
  parallelReviewSavingsDays: number | null;
  typicalTimelineDays: number | null;
  submissionSequence: SubmissionStep[];
  dataSharingMechanism: string | null;
  commonDossierRequirements: Record<string, unknown>;
  agencySpecificAddenda: Record<string, string[]>;
  active: boolean;
  effectiveDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionStep {
  agency: string;
  submitDay: number;
  decisionDay: number;
}

export interface JurisdictionalDivergence {
  id: string;
  organizationId: string;
  domain: DivergenceDomain;
  agencyA: string;
  agencyB: string;
  requirementA: string;
  requirementB: string;
  divergenceSeverity: 'minor' | 'moderate' | 'major' | 'critical';
  divergenceDescription: string;
  impactOnDevelopment: string | null;
  bridgingStudyRequired: boolean;
  bridgingStudyDetails: string | null;
  additionalDataRequired: unknown[];
  harmonizationApproach: string | null;
  recommendedStrategy: string | null;
  therapeuticAreas: string[];
  productTypes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReliancePathway {
  id: string;
  organizationId: string;
  pathwayCode: string;
  pathwayName: string;
  referenceAgency: string;
  relyingAgency: string;
  relianceType: RelianceType;
  eligibleProductTypes: string[];
  prerequisiteApproval: boolean;
  additionalLocalRequirements: unknown[];
  localDataRequirements: unknown[];
  typicalTimelineDays: number | null;
  timelineVsStandaloneSavings: number | null;
  historicalApprovalRate: number | null;
  rejectionReasons: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FilingSequenceStrategy {
  id: string;
  organizationId: string;
  strategyCode: string;
  strategyName: string;
  productType: string;
  therapeuticArea: string | null;
  filingSequence: FilingStep[];
  totalAgencies: number;
  estimatedTotalDays: number | null;
  criticalPathAgencies: string[];
  parallelWindows: ParallelWindow[];
  revenueOptimizationScore: number;
  riskMitigationScore: number;
  resourceEfficiencyScore: number;
  bridgingStudiesNeeded: unknown[];
  translationRequirements: Record<string, unknown>;
  localAgentRequirements: string[];
  confidenceScore: number;
  basedOnPrecedentCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FilingStep {
  step: number;
  agency: string;
  submissionType: string;
  day: number;
  dependencies: string[];
}

export interface ParallelWindow {
  agencies: string[];
  startDay: number;
  endDay: number;
}

export interface FilingOptimizationResult {
  recommendedStrategy: FilingSequenceStrategy | null;
  alternativeStrategies: FilingSequenceStrategy[];
  divergences: JurisdictionalDivergence[];
  relianceOpportunities: ReliancePathway[];
  timelineSummary: {
    fastestDays: number;
    averageDays: number;
    criticalPath: string[];
  };
  riskSummary: {
    highRiskAgencies: string[];
    bridgingStudiesNeeded: number;
    majorDivergences: number;
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

class CrossJurisdictionalService {

  // ─── Frameworks ─────────────────────────────────────────────────────────────

  async searchFrameworks(input: {
    organizationId: string;
    frameworkType?: FrameworkType;
    agency?: string;
    active?: boolean;
    limit?: number;
  }): Promise<CrossJurisdictionalFramework[]> {
    log.info('Searching frameworks', { type: input.frameworkType });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number | boolean)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.frameworkType) {
      conditions.push(`framework_type = $${paramIdx++}`);
      params.push(input.frameworkType);
    }
    if (input.agency) {
      conditions.push(`$${paramIdx++} = ANY(member_agencies)`);
      params.push(input.agency);
    }
    if (input.active !== undefined) {
      conditions.push(`active = $${paramIdx++}`);
      params.push(input.active);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM regulatory_intel.cross_jurisdictional_frameworks
      WHERE ${conditions.join(' AND ')}
      ORDER BY framework_name ASC
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(this.mapFramework);
  }

  async createFramework(fw: Omit<CrossJurisdictionalFramework, 'id' | 'createdAt' | 'updatedAt'>): Promise<CrossJurisdictionalFramework> {
    log.info('Creating framework', { code: fw.frameworkCode });

    const result = await pool!.query(`
      INSERT INTO regulatory_intel.cross_jurisdictional_frameworks (
        organization_id, framework_code, framework_name, framework_type,
        member_agencies, lead_agency, description, scope, eligibility_criteria,
        parallel_review_savings_days, typical_timeline_days, submission_sequence,
        data_sharing_mechanism, common_dossier_requirements, agency_specific_addenda,
        active, effective_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      fw.organizationId, fw.frameworkCode, fw.frameworkName, fw.frameworkType,
      fw.memberAgencies, fw.leadAgency, fw.description, fw.scope,
      JSON.stringify(fw.eligibilityCriteria), fw.parallelReviewSavingsDays,
      fw.typicalTimelineDays, JSON.stringify(fw.submissionSequence),
      fw.dataSharingMechanism, JSON.stringify(fw.commonDossierRequirements),
      JSON.stringify(fw.agencySpecificAddenda), fw.active, fw.effectiveDate
    ]);

    return this.mapFramework(result.rows[0]);
  }

  // ─── Divergence Mapping ─────────────────────────────────────────────────────

  async searchDivergences(input: {
    organizationId: string;
    domain?: DivergenceDomain;
    agencyA?: string;
    agencyB?: string;
    severity?: string;
    therapeuticArea?: string;
    limit?: number;
  }): Promise<JurisdictionalDivergence[]> {
    log.info('Searching divergences', { domain: input.domain, agencyA: input.agencyA, agencyB: input.agencyB });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.domain) {
      conditions.push(`domain = $${paramIdx++}`);
      params.push(input.domain);
    }
    if (input.agencyA) {
      conditions.push(`(agency_a = $${paramIdx} OR agency_b = $${paramIdx})`);
      params.push(input.agencyA);
      paramIdx++;
    }
    if (input.agencyB) {
      conditions.push(`(agency_a = $${paramIdx} OR agency_b = $${paramIdx})`);
      params.push(input.agencyB);
      paramIdx++;
    }
    if (input.severity) {
      conditions.push(`divergence_severity = $${paramIdx++}`);
      params.push(input.severity);
    }
    if (input.therapeuticArea) {
      conditions.push(`$${paramIdx++} = ANY(therapeutic_areas)`);
      params.push(input.therapeuticArea);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM regulatory_intel.jurisdictional_divergence_map
      WHERE ${conditions.join(' AND ')}
      ORDER BY CASE divergence_severity
        WHEN 'critical' THEN 0 WHEN 'major' THEN 1 WHEN 'moderate' THEN 2 ELSE 3
      END
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(this.mapDivergence);
  }

  async createDivergence(div: Omit<JurisdictionalDivergence, 'id' | 'createdAt' | 'updatedAt'>): Promise<JurisdictionalDivergence> {
    const result = await pool!.query(`
      INSERT INTO regulatory_intel.jurisdictional_divergence_map (
        organization_id, domain, agency_a, agency_b,
        requirement_a, requirement_b, divergence_severity, divergence_description,
        impact_on_development, bridging_study_required, bridging_study_details,
        additional_data_required, harmonization_approach, recommended_strategy,
        therapeutic_areas, product_types
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      div.organizationId, div.domain, div.agencyA, div.agencyB,
      div.requirementA, div.requirementB, div.divergenceSeverity, div.divergenceDescription,
      div.impactOnDevelopment, div.bridgingStudyRequired, div.bridgingStudyDetails,
      JSON.stringify(div.additionalDataRequired), div.harmonizationApproach, div.recommendedStrategy,
      div.therapeuticAreas, div.productTypes
    ]);

    return this.mapDivergence(result.rows[0]);
  }

  // ─── Reliance Pathways ──────────────────────────────────────────────────────

  async searchReliancePathways(input: {
    organizationId: string;
    referenceAgency?: string;
    relyingAgency?: string;
    relianceType?: RelianceType;
    productType?: string;
    active?: boolean;
    limit?: number;
  }): Promise<ReliancePathway[]> {
    log.info('Searching reliance pathways', { ref: input.referenceAgency, relying: input.relyingAgency });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number | boolean)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.referenceAgency) {
      conditions.push(`reference_agency = $${paramIdx++}`);
      params.push(input.referenceAgency);
    }
    if (input.relyingAgency) {
      conditions.push(`relying_agency = $${paramIdx++}`);
      params.push(input.relyingAgency);
    }
    if (input.relianceType) {
      conditions.push(`reliance_type = $${paramIdx++}`);
      params.push(input.relianceType);
    }
    if (input.productType) {
      conditions.push(`$${paramIdx++} = ANY(eligible_product_types)`);
      params.push(input.productType);
    }
    if (input.active !== undefined) {
      conditions.push(`active = $${paramIdx++}`);
      params.push(input.active);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM regulatory_intel.reliance_pathways
      WHERE ${conditions.join(' AND ')}
      ORDER BY historical_approval_rate DESC NULLS LAST
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(this.mapReliancePathway);
  }

  async createReliancePathway(pw: Omit<ReliancePathway, 'id' | 'createdAt' | 'updatedAt'>): Promise<ReliancePathway> {
    const result = await pool!.query(`
      INSERT INTO regulatory_intel.reliance_pathways (
        organization_id, pathway_code, pathway_name,
        reference_agency, relying_agency, reliance_type,
        eligible_product_types, prerequisite_approval,
        additional_local_requirements, local_data_requirements,
        typical_timeline_days, timeline_vs_standalone_savings,
        historical_approval_rate, rejection_reasons, active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      pw.organizationId, pw.pathwayCode, pw.pathwayName,
      pw.referenceAgency, pw.relyingAgency, pw.relianceType,
      pw.eligibleProductTypes, pw.prerequisiteApproval,
      JSON.stringify(pw.additionalLocalRequirements), JSON.stringify(pw.localDataRequirements),
      pw.typicalTimelineDays, pw.timelineVsStandaloneSavings,
      pw.historicalApprovalRate, pw.rejectionReasons, pw.active
    ]);

    return this.mapReliancePathway(result.rows[0]);
  }

  // ─── Filing Sequence ────────────────────────────────────────────────────────

  async searchFilingStrategies(input: {
    organizationId: string;
    productType?: string;
    therapeuticArea?: string;
    limit?: number;
  }): Promise<FilingSequenceStrategy[]> {
    log.info('Searching filing strategies', { productType: input.productType });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.productType) {
      conditions.push(`product_type = $${paramIdx++}`);
      params.push(input.productType);
    }
    if (input.therapeuticArea) {
      conditions.push(`therapeutic_area = $${paramIdx++}`);
      params.push(input.therapeuticArea);
    }

    const limit = input.limit ?? 10;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM regulatory_intel.filing_sequence_strategies
      WHERE ${conditions.join(' AND ')}
      ORDER BY revenue_optimization_score DESC NULLS LAST
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(this.mapFilingStrategy);
  }

  async createFilingStrategy(strategy: Omit<FilingSequenceStrategy, 'id' | 'createdAt' | 'updatedAt'>): Promise<FilingSequenceStrategy> {
    const result = await pool!.query(`
      INSERT INTO regulatory_intel.filing_sequence_strategies (
        organization_id, strategy_code, strategy_name, product_type, therapeutic_area,
        filing_sequence, total_agencies, estimated_total_days, critical_path_agencies,
        parallel_windows, revenue_optimization_score, risk_mitigation_score,
        resource_efficiency_score, bridging_studies_needed, translation_requirements,
        local_agent_requirements, confidence_score, based_on_precedent_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      strategy.organizationId, strategy.strategyCode, strategy.strategyName,
      strategy.productType, strategy.therapeuticArea,
      JSON.stringify(strategy.filingSequence), strategy.totalAgencies,
      strategy.estimatedTotalDays, strategy.criticalPathAgencies,
      JSON.stringify(strategy.parallelWindows), strategy.revenueOptimizationScore,
      strategy.riskMitigationScore, strategy.resourceEfficiencyScore,
      JSON.stringify(strategy.bridgingStudiesNeeded), JSON.stringify(strategy.translationRequirements),
      strategy.localAgentRequirements, strategy.confidenceScore, strategy.basedOnPrecedentCount
    ]);

    return this.mapFilingStrategy(result.rows[0]);
  }

  /**
   * Optimize filing sequence for a given product across target agencies
   */
  async optimizeFilingSequence(input: {
    organizationId: string;
    productType: string;
    therapeuticArea?: string;
    targetAgencies: string[];
    optimizeFor: 'speed' | 'revenue' | 'risk' | 'balanced';
  }): Promise<FilingOptimizationResult> {
    log.info('Optimizing filing sequence', { agencies: input.targetAgencies, optimize: input.optimizeFor });

    // Get existing strategies
    const strategies = await this.searchFilingStrategies({
      organizationId: input.organizationId,
      productType: input.productType,
      therapeuticArea: input.therapeuticArea,
      limit: 20,
    });

    // Get divergences between target agencies
    const divergences: JurisdictionalDivergence[] = [];
    for (let i = 0; i < input.targetAgencies.length; i++) {
      for (let j = i + 1; j < input.targetAgencies.length; j++) {
        const divs = await this.searchDivergences({
          organizationId: input.organizationId,
          agencyA: input.targetAgencies[i],
          agencyB: input.targetAgencies[j],
          limit: 20,
        });
        divergences.push(...divs);
      }
    }

    // Get reliance opportunities
    const relianceOpportunities: ReliancePathway[] = [];
    for (const refAgency of input.targetAgencies) {
      const pathways = await this.searchReliancePathways({
        organizationId: input.organizationId,
        referenceAgency: refAgency,
        productType: input.productType,
        active: true,
        limit: 10,
      });
      const relevant = pathways.filter(p => input.targetAgencies.includes(p.relyingAgency));
      relianceOpportunities.push(...relevant);
    }

    // Sort strategies by optimization preference
    const sorted = [...strategies].sort((a, b) => {
      switch (input.optimizeFor) {
        case 'speed': return (a.estimatedTotalDays ?? 999) - (b.estimatedTotalDays ?? 999);
        case 'revenue': return b.revenueOptimizationScore - a.revenueOptimizationScore;
        case 'risk': return b.riskMitigationScore - a.riskMitigationScore;
        default: return (b.revenueOptimizationScore + b.riskMitigationScore + b.resourceEfficiencyScore) -
                       (a.revenueOptimizationScore + a.riskMitigationScore + a.resourceEfficiencyScore);
      }
    });

    const recommended = sorted[0] ?? null;
    const alternatives = sorted.slice(1, 4);

    const majorDivergences = divergences.filter(d => d.divergenceSeverity === 'major' || d.divergenceSeverity === 'critical');
    const bridgingNeeded = divergences.filter(d => d.bridgingStudyRequired).length;

    return {
      recommendedStrategy: recommended,
      alternativeStrategies: alternatives,
      divergences,
      relianceOpportunities,
      timelineSummary: {
        fastestDays: recommended?.estimatedTotalDays ?? 0,
        averageDays: sorted.length > 0
          ? Math.round(sorted.reduce((s, st) => s + (st.estimatedTotalDays ?? 0), 0) / sorted.length)
          : 0,
        criticalPath: recommended?.criticalPathAgencies ?? [],
      },
      riskSummary: {
        highRiskAgencies: majorDivergences.map(d => d.agencyA).filter((v, i, a) => a.indexOf(v) === i),
        bridgingStudiesNeeded: bridgingNeeded,
        majorDivergences: majorDivergences.length,
      },
    };
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private mapFramework(row: Record<string, unknown>): CrossJurisdictionalFramework {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      frameworkCode: row.framework_code as string,
      frameworkName: row.framework_name as string,
      frameworkType: row.framework_type as FrameworkType,
      memberAgencies: (row.member_agencies as string[]) ?? [],
      leadAgency: row.lead_agency as string | null,
      description: row.description as string,
      scope: (row.scope as string[]) ?? [],
      eligibilityCriteria: (row.eligibility_criteria as Record<string, unknown>) ?? {},
      parallelReviewSavingsDays: row.parallel_review_savings_days as number | null,
      typicalTimelineDays: row.typical_timeline_days as number | null,
      submissionSequence: (row.submission_sequence as SubmissionStep[]) ?? [],
      dataSharingMechanism: row.data_sharing_mechanism as string | null,
      commonDossierRequirements: (row.common_dossier_requirements as Record<string, unknown>) ?? {},
      agencySpecificAddenda: (row.agency_specific_addenda as Record<string, string[]>) ?? {},
      active: (row.active as boolean) ?? true,
      effectiveDate: row.effective_date as string | null,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }

  private mapDivergence(row: Record<string, unknown>): JurisdictionalDivergence {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      domain: row.domain as DivergenceDomain,
      agencyA: row.agency_a as string,
      agencyB: row.agency_b as string,
      requirementA: row.requirement_a as string,
      requirementB: row.requirement_b as string,
      divergenceSeverity: row.divergence_severity as JurisdictionalDivergence['divergenceSeverity'],
      divergenceDescription: row.divergence_description as string,
      impactOnDevelopment: row.impact_on_development as string | null,
      bridgingStudyRequired: (row.bridging_study_required as boolean) ?? false,
      bridgingStudyDetails: row.bridging_study_details as string | null,
      additionalDataRequired: (row.additional_data_required as unknown[]) ?? [],
      harmonizationApproach: row.harmonization_approach as string | null,
      recommendedStrategy: row.recommended_strategy as string | null,
      therapeuticAreas: (row.therapeutic_areas as string[]) ?? [],
      productTypes: (row.product_types as string[]) ?? [],
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }

  private mapReliancePathway(row: Record<string, unknown>): ReliancePathway {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      pathwayCode: row.pathway_code as string,
      pathwayName: row.pathway_name as string,
      referenceAgency: row.reference_agency as string,
      relyingAgency: row.relying_agency as string,
      relianceType: row.reliance_type as RelianceType,
      eligibleProductTypes: (row.eligible_product_types as string[]) ?? [],
      prerequisiteApproval: (row.prerequisite_approval as boolean) ?? true,
      additionalLocalRequirements: (row.additional_local_requirements as unknown[]) ?? [],
      localDataRequirements: (row.local_data_requirements as unknown[]) ?? [],
      typicalTimelineDays: row.typical_timeline_days as number | null,
      timelineVsStandaloneSavings: row.timeline_vs_standalone_savings as number | null,
      historicalApprovalRate: row.historical_approval_rate ? parseFloat(row.historical_approval_rate as string) : null,
      rejectionReasons: (row.rejection_reasons as string[]) ?? [],
      active: (row.active as boolean) ?? true,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }

  private mapFilingStrategy(row: Record<string, unknown>): FilingSequenceStrategy {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      strategyCode: row.strategy_code as string,
      strategyName: row.strategy_name as string,
      productType: row.product_type as string,
      therapeuticArea: row.therapeutic_area as string | null,
      filingSequence: (row.filing_sequence as FilingStep[]) ?? [],
      totalAgencies: (row.total_agencies as number) ?? 0,
      estimatedTotalDays: row.estimated_total_days as number | null,
      criticalPathAgencies: (row.critical_path_agencies as string[]) ?? [],
      parallelWindows: (row.parallel_windows as ParallelWindow[]) ?? [],
      revenueOptimizationScore: parseFloat(row.revenue_optimization_score as string) || 0,
      riskMitigationScore: parseFloat(row.risk_mitigation_score as string) || 0,
      resourceEfficiencyScore: parseFloat(row.resource_efficiency_score as string) || 0,
      bridgingStudiesNeeded: (row.bridging_studies_needed as unknown[]) ?? [],
      translationRequirements: (row.translation_requirements as Record<string, unknown>) ?? {},
      localAgentRequirements: (row.local_agent_requirements as string[]) ?? [],
      confidenceScore: parseFloat(row.confidence_score as string) || 0,
      basedOnPrecedentCount: row.based_on_precedent_count as number | null,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }
}

export const crossJurisdictionalService = new CrossJurisdictionalService();
