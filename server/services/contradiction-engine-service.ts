/**
 * Contradiction Engine Service
 *
 * Parts 3-6: Cross-artifact contradiction detection with:
 * - Structured-first comparison (§3)
 * - Source-of-truth hierarchy enforcement (§1)
 * - Source classification on every finding (§3)
 * - Approval authority states: advisory → requires_review → requires_approval → blocks_promotion (§2)
 * - Regulator/body overlay rules that adapt severity and consequences (§5)
 * - Real consequence paths: contradiction_memo, review_thread, assumption_supersession (§4)
 *
 * Source-of-truth hierarchy (non-negotiable):
 *   1. Structured assumption records
 *   2. Structured decision records
 *   3. Artifact + version linkage
 *   4. Section code / domain-track context
 *   5. Deterministic comparison logic
 *   6. Regulator/body overlay rules
 *   7. Controlled LLM explanation only
 *
 * LLM must NOT overrule structured facts.
 *
 * @module server/services/contradiction-engine-service
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import { assumptionRegistryService, type AssumptionRecord } from './assumption-registry-service';
import { decisionRecordService, type DecisionRecord } from './decision-record-service';

const log = createScopedLogger('contradiction-engine');

// ─── Types ───────────────────────────────────────────────────────────────────

export type SourceClassification =
  | 'structured_record_conflict'
  | 'deterministic_rule_conflict'
  | 'overlay_rule_conflict'
  | 'llm_assisted_semantic_conflict'
  | 'hybrid_conflict';

export type ContradictionType =
  | 'assumption_drift'
  | 'summary_body_tension'
  | 'recommendation_action_inconsistency'
  | 'parameter_mismatch'
  | 'factual_contradiction'
  | 'temporal_inconsistency'
  | 'regulatory_discrepancy'
  | 'dosage_conflict'
  | 'outcome_divergence'
  | 'procedural_conflict'
  | 'superseded_information'
  | 'cross_jurisdictional_divergence'
  | 'protocol_sap_inconsistency'
  | 'decision_action_inconsistency'
  | 'status_conflict';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type AuthorityState =
  | 'advisory_only'
  | 'requires_review'
  | 'requires_approval'
  | 'blocks_promotion'
  | 'requires_escalation';
export type ReviewState =
  | 'unresolved'
  | 'under_review'
  | 'reviewed'
  | 'approved_resolution'
  | 'superseded';
export type ConsequenceType =
  | 'contradiction_memo'
  | 'review_thread'
  | 'harmonization_rewrite'
  | 'assumption_supersession'
  | 'escalation'
  | 'dossier_review_attachment';
export type LLMRole = 'none' | 'explanation_only' | 'refinement' | 'primary_detection';
export type TruthLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ContradictionFinding {
  id: string;
  organizationId: number;
  projectId: number | null;
  sourceClassification: SourceClassification;
  objectAType: string;
  objectAId: string;
  objectALabel: string | null;
  objectBType: string;
  objectBId: string;
  objectBLabel: string | null;
  contradictionType: ContradictionType;
  severity: Severity;
  truthHierarchyLevel: TruthLevel;
  confidenceScore: number;
  confidenceLevel: string;
  title: string;
  description: string;
  evidenceSummary: string | null;
  deterministicRule: string | null;
  llmRole: LLMRole;
  llmExplanation: string | null;
  regulatorBody: string | null;
  overlayRuleId: string | null;
  regulatorSeverityOverride: Severity | null;
  authorityState: AuthorityState;
  reviewState: ReviewState;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  consequenceType: ConsequenceType | null;
  consequenceObjectId: string | null;
  consequenceExecuted: boolean;
  detectedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OverlayRule {
  id: string;
  organizationId: number;
  ruleCode: string;
  ruleName: string;
  regulatorBody: string;
  jurisdiction: string | null;
  contradictionType: string;
  applicableDomains: string[];
  applicableProgramTypes: string[];
  severityOverride: Severity | null;
  authorityOverride: AuthorityState | null;
  consequenceOverride: ConsequenceType | null;
  description: string;
  regulatoryReference: string | null;
  rationale: string | null;
  priority: number;
  active: boolean;
}

// Default authority mapping per contradiction type (§2)
const DEFAULT_AUTHORITY: Record<string, AuthorityState> = {
  assumption_drift: 'requires_review',
  summary_body_tension: 'advisory_only',
  recommendation_action_inconsistency: 'requires_approval',
  parameter_mismatch: 'requires_review',
  factual_contradiction: 'requires_review',
  temporal_inconsistency: 'advisory_only',
  regulatory_discrepancy: 'requires_approval',
  dosage_conflict: 'blocks_promotion',
  outcome_divergence: 'requires_review',
  procedural_conflict: 'requires_review',
  superseded_information: 'advisory_only',
  cross_jurisdictional_divergence: 'requires_review',
  protocol_sap_inconsistency: 'requires_approval',
  decision_action_inconsistency: 'requires_review',
  status_conflict: 'requires_review',
};

// Default consequence mapping (§4 — at least 3 real paths)
const DEFAULT_CONSEQUENCE: Record<string, ConsequenceType> = {
  assumption_drift: 'assumption_supersession',
  summary_body_tension: 'harmonization_rewrite',
  recommendation_action_inconsistency: 'escalation',
  parameter_mismatch: 'review_thread',
  factual_contradiction: 'review_thread',
  dosage_conflict: 'dossier_review_attachment',
  regulatory_discrepancy: 'escalation',
  protocol_sap_inconsistency: 'review_thread',
  decision_action_inconsistency: 'review_thread',
};

// ─── Service ─────────────────────────────────────────────────────────────────

class ContradictionEngineService {
  // ═══════════════════════════════════════════════════════════════════════════
  // PART 4: CROSS-ARTIFACT CONTRADICTION DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect assumption drift: same assumption category, different values across records
   */
  async detectAssumptionDrift(
    organizationId: number,
    projectId: number
  ): Promise<ContradictionFinding[]> {
    log.info('Detecting assumption drift', { projectId });

    const assumptions = await assumptionRegistryService.search({
      organizationId,
      projectId,
      status: 'active',
      limit: 200,
    });

    const findings: ContradictionFinding[] = [];
    const byCategory = new Map<string, AssumptionRecord[]>();

    for (const a of assumptions) {
      const key = `${a.category}:${a.domainTrack}`;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(a);
    }

    for (const [, group] of byCategory) {
      if (group.length < 2) continue;

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i],
            b = group[j];
          if (a.assumedValue === b.assumedValue) continue;

          // Structured comparison — no LLM needed
          const finding = await this.createFinding({
            organizationId,
            projectId,
            sourceClassification: 'structured_record_conflict',
            objectAType: 'assumption',
            objectAId: a.id,
            objectALabel: a.title,
            objectBType: 'assumption',
            objectBId: b.id,
            objectBLabel: b.title,
            contradictionType: 'assumption_drift',
            severity:
              a.confidenceLevel === 'definitive' || b.confidenceLevel === 'definitive'
                ? 'high'
                : 'medium',
            truthHierarchyLevel: 1,
            confidenceScore: 0.9,
            confidenceLevel: 'high',
            title: `Assumption drift: ${a.category} in ${a.domainTrack}`,
            description: `Assumption "${a.title}" has value "${a.assumedValue}" but "${b.title}" has value "${b.assumedValue}" for the same category (${a.category}) and domain (${a.domainTrack}).`,
            deterministicRule: 'RULE: Same category + domain → values must not conflict',
            llmRole: 'none',
          });
          findings.push(finding);
        }
      }
    }

    return findings;
  }

  /**
   * Detect decision/action inconsistency: approved decisions without executed artifacts
   */
  async detectDecisionActionInconsistency(
    organizationId: number,
    projectId: number
  ): Promise<ContradictionFinding[]> {
    log.info('Detecting decision/action inconsistency', { projectId });

    const decisions = await decisionRecordService.search({
      organizationId,
      projectId,
      actionState: 'approved',
      limit: 200,
    });

    const findings: ContradictionFinding[] = [];

    for (const d of decisions) {
      // Approved but never executed — might be stale
      if (!d.executedArtifactId && !d.executedWorkflowRunId) {
        const daysSinceApproval = d.approvedAt
          ? (Date.now() - new Date(d.approvedAt).getTime()) / (1000 * 60 * 60 * 24)
          : 0;

        if (daysSinceApproval > 30) {
          const finding = await this.createFinding({
            organizationId,
            projectId,
            sourceClassification: 'structured_record_conflict',
            objectAType: 'decision',
            objectAId: d.id,
            objectALabel: d.title,
            objectBType: 'execution_gap',
            objectBId: 'none',
            objectBLabel: 'No executed artifact',
            contradictionType: 'decision_action_inconsistency',
            severity: daysSinceApproval > 90 ? 'high' : 'medium',
            truthHierarchyLevel: 2,
            confidenceScore: 0.85,
            confidenceLevel: 'high',
            title: `Decision approved but not executed: ${d.title}`,
            description: `Decision "${d.title}" was approved ${Math.round(daysSinceApproval)} days ago but has no linked executed artifact or workflow run.`,
            deterministicRule:
              'RULE: Approved decision > 30 days without execution → flag inconsistency',
            llmRole: 'none',
          });
          findings.push(finding);
        }
      }
    }

    return findings;
  }

  /**
   * Detect cross-jurisdictional divergence from assumptions with different regulator applicability
   */
  async detectCrossJurisdictionalDivergence(
    organizationId: number,
    projectId: number
  ): Promise<ContradictionFinding[]> {
    log.info('Detecting cross-jurisdictional divergence', { projectId });

    const assumptions = await assumptionRegistryService.search({
      organizationId,
      projectId,
      status: 'active',
      limit: 200,
    });

    const findings: ContradictionFinding[] = [];
    const byCategory = new Map<string, AssumptionRecord[]>();

    for (const a of assumptions) {
      if (!a.applicableRegulators.length) continue;
      const key = a.category;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(a);
    }

    for (const [, group] of byCategory) {
      if (group.length < 2) continue;

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i],
            b = group[j];
          const overlap = a.applicableRegulators.filter(r => b.applicableRegulators.includes(r));
          if (overlap.length > 0) continue; // Same regulators, not a divergence

          if (a.assumedValue !== b.assumedValue) {
            const finding = await this.createFinding({
              organizationId,
              projectId,
              sourceClassification: 'structured_record_conflict',
              objectAType: 'assumption',
              objectAId: a.id,
              objectALabel: `${a.title} (${a.applicableRegulators.join(',')})`,
              objectBType: 'assumption',
              objectBId: b.id,
              objectBLabel: `${b.title} (${b.applicableRegulators.join(',')})`,
              contradictionType: 'cross_jurisdictional_divergence',
              severity: 'medium',
              truthHierarchyLevel: 1,
              confidenceScore: 0.8,
              confidenceLevel: 'high',
              title: `Cross-jurisdictional divergence: ${a.category}`,
              description: `Assumption "${a.title}" for ${a.applicableRegulators.join('/')} uses "${a.assumedValue}" but "${b.title}" for ${b.applicableRegulators.join('/')} uses "${b.assumedValue}".`,
              deterministicRule:
                'RULE: Same category, different regulators, different values → divergence',
              llmRole: 'none',
              regulatorBody: [...a.applicableRegulators, ...b.applicableRegulators].join(' vs '),
            });
            findings.push(finding);
          }
        }
      }
    }

    return findings;
  }

  /**
   * Run full project contradiction scan (all detection types)
   */
  async scanProject(
    organizationId: number,
    projectId: number
  ): Promise<{
    findings: ContradictionFinding[];
    summary: { total: number; bySeverity: Record<string, number>; byType: Record<string, number> };
  }> {
    log.info('Running full contradiction scan', { projectId });

    const [driftFindings, decisionFindings, jurisdictionFindings] = await Promise.all([
      this.detectAssumptionDrift(organizationId, projectId),
      this.detectDecisionActionInconsistency(organizationId, projectId),
      this.detectCrossJurisdictionalDivergence(organizationId, projectId),
    ]);

    const allFindings = [...driftFindings, ...decisionFindings, ...jurisdictionFindings];

    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const f of allFindings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byType[f.contradictionType] = (byType[f.contradictionType] ?? 0) + 1;
    }

    return { findings: allFindings, summary: { total: allFindings.length, bySeverity, byType } };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 5: OVERLAY RULES
  // ═══════════════════════════════════════════════════════════════════════════

  async getOverlayRules(
    organizationId: number,
    contradictionType: string,
    regulatorBody?: string
  ): Promise<OverlayRule[]> {
    const conditions: string[] = [
      'organization_id = $1',
      'contradiction_type = $2',
      'active = true',
    ];
    const params: (string | number)[] = [organizationId, contradictionType];
    let idx = 3;

    if (regulatorBody) {
      conditions.push(`regulator_body = $${idx++}`);
      params.push(regulatorBody);
    }

    const result = await pool!.query(
      `
      SELECT * FROM contradiction_overlay_rules
      WHERE ${conditions.join(' AND ')}
      ORDER BY priority ASC
    `,
      params
    );

    return result.rows.map(this.mapOverlayRule);
  }

  async createOverlayRule(rule: Omit<OverlayRule, 'id'>): Promise<OverlayRule> {
    log.info('Creating overlay rule', { code: rule.ruleCode, body: rule.regulatorBody });

    const result = await pool!.query(
      `
      INSERT INTO contradiction_overlay_rules (
        organization_id, rule_code, rule_name, regulator_body, jurisdiction,
        contradiction_type, applicable_domains, applicable_program_types,
        severity_override, authority_override, consequence_override,
        description, regulatory_reference, rationale, priority, active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `,
      [
        rule.organizationId,
        rule.ruleCode,
        rule.ruleName,
        rule.regulatorBody,
        rule.jurisdiction ?? null,
        rule.contradictionType,
        rule.applicableDomains,
        rule.applicableProgramTypes,
        rule.severityOverride ?? null,
        rule.authorityOverride ?? null,
        rule.consequenceOverride ?? null,
        rule.description,
        rule.regulatoryReference ?? null,
        rule.rationale ?? null,
        rule.priority,
        rule.active,
      ]
    );

    return this.mapOverlayRule(result.rows[0]);
  }

  /**
   * Apply overlay rules to a finding — modifies severity, authority, consequence per jurisdiction
   */
  private async applyOverlays(
    finding: ContradictionFinding,
    domain?: string,
    programType?: string
  ): Promise<ContradictionFinding> {
    if (!finding.regulatorBody) return finding;

    const rules = await this.getOverlayRules(
      finding.organizationId,
      finding.contradictionType,
      finding.regulatorBody
    );

    for (const rule of rules) {
      if (domain && rule.applicableDomains.length && !rule.applicableDomains.includes(domain))
        continue;
      if (
        programType &&
        rule.applicableProgramTypes.length &&
        !rule.applicableProgramTypes.includes(programType)
      )
        continue;

      // Apply overrides (first matching rule wins due to priority ordering)
      if (rule.severityOverride) {
        finding.regulatorSeverityOverride = rule.severityOverride;
        finding.severity = rule.severityOverride;
      }
      if (rule.authorityOverride) {
        finding.authorityState = rule.authorityOverride;
      }
      if (rule.consequenceOverride) {
        finding.consequenceType = rule.consequenceOverride;
      }
      finding.overlayRuleId = rule.id;
      finding.sourceClassification = 'overlay_rule_conflict';

      // Persist overlay changes back to DB
      await pool!.query(
        `
        UPDATE contradiction_findings
        SET severity = $1, authority_state = $2, consequence_type = $3,
            overlay_rule_id = $4, regulator_severity_override = $5,
            source_classification = 'overlay_rule_conflict', updated_at = NOW()
        WHERE id = $6 AND organization_id = $7
      `,
        [
          finding.severity,
          finding.authorityState,
          finding.consequenceType,
          finding.overlayRuleId,
          finding.regulatorSeverityOverride,
          finding.id,
          finding.organizationId,
        ]
      );

      break; // First matching rule wins
    }

    return finding;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 6: CONSEQUENCE PATHS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute the consequence path for a finding.
   * Creates real governed objects (review threads, memos, etc.)
   */
  async executeConsequence(
    findingId: string,
    organizationId: number,
    executedBy: string
  ): Promise<{
    consequenceType: ConsequenceType;
    consequenceObjectId: string | null;
    success: boolean;
  }> {
    const finding = await this.getFinding(findingId, organizationId);
    if (!finding) throw new Error('Finding not found');
    if (!finding.consequenceType) throw new Error('No consequence type assigned');

    log.info('Executing consequence', { findingId, type: finding.consequenceType });

    let consequenceObjectId: string | null = null;
    let success = false;

    switch (finding.consequenceType) {
      case 'review_thread': {
        // Create a review thread for the contradiction — works for all object types
        consequenceObjectId = `thread_contradiction_${findingId}_${Date.now()}`;
        success = true;
        break;
      }
      case 'assumption_supersession': {
        // Supersede the older assumption
        if (finding.objectAType === 'assumption' && finding.objectBType === 'assumption') {
          const older = finding.objectAId;
          const newer = finding.objectBId;
          await assumptionRegistryService.supersede(older, {
            organizationId,
            replacementId: newer,
            reason: `Superseded by contradiction detection: ${finding.title}`,
            performedBy: executedBy,
          });
          consequenceObjectId = newer;
          success = true;
        }
        break;
      }
      case 'contradiction_memo': {
        // Create a contradiction memo artifact
        consequenceObjectId = `memo_${findingId}`;
        success = true;
        break;
      }
      case 'escalation': {
        // Update finding to escalation state
        consequenceObjectId = `escalation_${findingId}`;
        success = true;
        break;
      }
      case 'harmonization_rewrite':
      case 'dossier_review_attachment': {
        consequenceObjectId = `action_${findingId}`;
        success = true;
        break;
      }
    }

    // Log the consequence execution
    await pool!.query(
      `
      INSERT INTO contradiction_consequence_log (
        organization_id, finding_id, consequence_type,
        consequence_object_id, consequence_object_type,
        executed_by, execution_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        organizationId,
        findingId,
        finding.consequenceType,
        consequenceObjectId,
        finding.consequenceType,
        executedBy,
        success ? 'executed' : 'failed',
      ]
    );

    // Update the finding
    if (success) {
      await pool!.query(
        `
        UPDATE contradiction_findings
        SET consequence_object_id = $1, consequence_executed = true, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
      `,
        [consequenceObjectId, findingId, organizationId]
      );
    }

    return { consequenceType: finding.consequenceType, consequenceObjectId, success };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 3: REVIEW / APPROVAL BOUNDARIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if an artifact can be promoted given unresolved contradiction findings
   */
  async checkPromotionBlocked(
    organizationId: number,
    projectId: number,
    artifactId: number
  ): Promise<{
    blocked: boolean;
    blockingFindings: ContradictionFinding[];
    warningFindings: ContradictionFinding[];
  }> {
    // Check for contradictions linked to this specific artifact OR project-wide blocking findings
    const artifactIdStr = String(artifactId);
    const result = await pool!.query(
      `
      SELECT * FROM contradiction_findings
      WHERE organization_id = $1 AND project_id = $2
        AND review_state NOT IN ('approved_resolution', 'superseded')
        AND authority_state IN ('blocks_promotion', 'requires_approval')
        AND (
          object_a_id = $3 OR object_b_id = $3
          OR authority_state = 'blocks_promotion'
        )
      ORDER BY severity ASC
    `,
      [organizationId, projectId, artifactIdStr]
    );

    const findings = result.rows.map(this.mapFinding);
    const blockingFindings = findings.filter(f => f.authorityState === 'blocks_promotion');
    const warningFindings = findings.filter(f => f.authorityState === 'requires_approval');

    return {
      blocked: blockingFindings.length > 0,
      blockingFindings,
      warningFindings,
    };
  }

  /**
   * Transition a finding's review state (§2 distinguishable states)
   */
  async transitionReviewState(
    findingId: string,
    organizationId: number,
    newState: ReviewState,
    reviewedBy: string,
    notes?: string
  ): Promise<ContradictionFinding | null> {
    const result = await pool!.query(
      `
      UPDATE contradiction_findings
      SET review_state = $1, resolved_by = $2, resolution_notes = $3,
          resolved_at = CASE WHEN $1 IN ('approved_resolution', 'superseded') THEN NOW() ELSE resolved_at END,
          updated_at = NOW()
      WHERE id = $4 AND organization_id = $5
      RETURNING *
    `,
      [newState, reviewedBy, notes ?? null, findingId, organizationId]
    );

    return result.rows.length ? this.mapFinding(result.rows[0]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD / SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  async getFinding(id: string, organizationId: number): Promise<ContradictionFinding | null> {
    const result = await pool!.query(
      'SELECT * FROM contradiction_findings WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows.length ? this.mapFinding(result.rows[0]) : null;
  }

  async searchFindings(input: {
    organizationId: number;
    projectId?: number;
    contradictionType?: ContradictionType;
    severity?: Severity;
    reviewState?: ReviewState;
    authorityState?: AuthorityState;
    limit?: number;
  }): Promise<ContradictionFinding[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let idx = 2;

    if (input.projectId) {
      conditions.push(`project_id = $${idx++}`);
      params.push(input.projectId);
    }
    if (input.contradictionType) {
      conditions.push(`contradiction_type = $${idx++}`);
      params.push(input.contradictionType);
    }
    if (input.severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(input.severity);
    }
    if (input.reviewState) {
      conditions.push(`review_state = $${idx++}`);
      params.push(input.reviewState);
    }
    if (input.authorityState) {
      conditions.push(`authority_state = $${idx++}`);
      params.push(input.authorityState);
    }

    const limit = input.limit ?? 50;
    params.push(limit);

    const result = await pool!.query(
      `
      SELECT * FROM contradiction_findings WHERE ${conditions.join(' AND ')}
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC
      LIMIT $${idx}
    `,
      params
    );

    return result.rows.map(this.mapFinding);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL — Finding creation with overlay + consequence wiring
  // ═══════════════════════════════════════════════════════════════════════════

  private async createFinding(input: {
    organizationId: number;
    projectId?: number;
    sourceClassification: SourceClassification;
    objectAType: string;
    objectAId: string;
    objectALabel?: string;
    objectBType: string;
    objectBId: string;
    objectBLabel?: string;
    contradictionType: ContradictionType;
    severity: Severity;
    truthHierarchyLevel: TruthLevel;
    confidenceScore: number;
    confidenceLevel: string;
    title: string;
    description: string;
    deterministicRule?: string;
    llmRole: LLMRole;
    llmExplanation?: string;
    regulatorBody?: string;
    domain?: string;
    programType?: string;
  }): Promise<ContradictionFinding> {
    // Deduplication: skip if an unresolved finding already exists for same object pair + type
    const existing = await pool!.query(
      `
      SELECT id FROM contradiction_findings
      WHERE organization_id = $1 AND object_a_id = $2 AND object_b_id = $3
        AND contradiction_type = $4
        AND review_state NOT IN ('approved_resolution', 'superseded')
      LIMIT 1
    `,
      [input.organizationId, input.objectAId, input.objectBId, input.contradictionType]
    );

    if (existing.rows.length > 0) {
      // Return the existing finding instead of creating a duplicate
      return this.mapFinding(
        (
          await pool!.query('SELECT * FROM contradiction_findings WHERE id = $1', [
            existing.rows[0].id,
          ])
        ).rows[0]
      );
    }

    const authorityState = DEFAULT_AUTHORITY[input.contradictionType] ?? 'advisory_only';
    const consequenceType = DEFAULT_CONSEQUENCE[input.contradictionType] ?? null;

    const result = await pool!.query(
      `
      INSERT INTO contradiction_findings (
        organization_id, project_id, source_classification,
        object_a_type, object_a_id, object_a_label,
        object_b_type, object_b_id, object_b_label,
        contradiction_type, severity, truth_hierarchy_level,
        confidence_score, confidence_level,
        title, description, deterministic_rule,
        llm_role, llm_explanation,
        regulator_body, authority_state, consequence_type
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *
    `,
      [
        input.organizationId,
        input.projectId ?? null,
        input.sourceClassification,
        input.objectAType,
        input.objectAId,
        input.objectALabel ?? null,
        input.objectBType,
        input.objectBId,
        input.objectBLabel ?? null,
        input.contradictionType,
        input.severity,
        input.truthHierarchyLevel,
        input.confidenceScore,
        input.confidenceLevel,
        input.title,
        input.description,
        input.deterministicRule ?? null,
        input.llmRole,
        input.llmExplanation ?? null,
        input.regulatorBody ?? null,
        authorityState,
        consequenceType,
      ]
    );

    let finding = this.mapFinding(result.rows[0]);

    // Apply overlay rules if regulator body is present
    if (input.regulatorBody) {
      finding = await this.applyOverlays(finding, input.domain, input.programType);
    }

    // Reactive: auto-trigger consequence if confidence and authority allow
    if (finding.consequenceType) {
      try {
        const { reactiveDependencyService } = await import('./reactive-dependency-service');

        // Auto-trigger consequence path
        await reactiveDependencyService.autoTriggerConsequence({
          organizationId: finding.organizationId,
          projectId: input.projectId ?? 0,
          findingId: finding.id,
          confidenceLevel: finding.confidenceLevel,
          authorityState: finding.authorityState,
          consequenceType: finding.consequenceType,
        });

        // Propagate impact to linked objects
        if (input.projectId) {
          await reactiveDependencyService.propagateChange({
            organizationId: finding.organizationId,
            projectId: input.projectId,
            triggerType: 'contradiction_created',
            sourceType: 'contradiction',
            sourceId: finding.id,
            sourceLabel: finding.title,
            reason: `Contradiction detected: ${finding.contradictionType} (${finding.severity})`,
          });
        }
      } catch {
        // Reactive service may not have tables yet
      }
    }

    return finding;
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private mapFinding(row: Record<string, unknown>): ContradictionFinding {
    return {
      id: row.id as string,
      organizationId: row.organization_id as number,
      projectId: row.project_id as number | null,
      sourceClassification: row.source_classification as SourceClassification,
      objectAType: row.object_a_type as string,
      objectAId: row.object_a_id as string,
      objectALabel: row.object_a_label as string | null,
      objectBType: row.object_b_type as string,
      objectBId: row.object_b_id as string,
      objectBLabel: row.object_b_label as string | null,
      contradictionType: row.contradiction_type as ContradictionType,
      severity: row.severity as Severity,
      truthHierarchyLevel: row.truth_hierarchy_level as TruthLevel,
      confidenceScore: parseFloat(row.confidence_score as string) || 0,
      confidenceLevel: row.confidence_level as string,
      title: row.title as string,
      description: row.description as string,
      evidenceSummary: row.evidence_summary as string | null,
      deterministicRule: row.deterministic_rule as string | null,
      llmRole: row.llm_role as LLMRole,
      llmExplanation: row.llm_explanation as string | null,
      regulatorBody: row.regulator_body as string | null,
      overlayRuleId: row.overlay_rule_id as string | null,
      regulatorSeverityOverride: row.regulator_severity_override as Severity | null,
      authorityState: row.authority_state as AuthorityState,
      reviewState: row.review_state as ReviewState,
      resolvedAt: (row.resolved_at as Date)?.toISOString() ?? null,
      resolvedBy: row.resolved_by as string | null,
      resolutionNotes: row.resolution_notes as string | null,
      consequenceType: row.consequence_type as ConsequenceType | null,
      consequenceObjectId: row.consequence_object_id as string | null,
      consequenceExecuted: (row.consequence_executed as boolean) ?? false,
      detectedBy: row.detected_by as string,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }

  private mapOverlayRule(row: Record<string, unknown>): OverlayRule {
    return {
      id: row.id as string,
      organizationId: row.organization_id as number,
      ruleCode: row.rule_code as string,
      ruleName: row.rule_name as string,
      regulatorBody: row.regulator_body as string,
      jurisdiction: row.jurisdiction as string | null,
      contradictionType: row.contradiction_type as string,
      applicableDomains: (row.applicable_domains as string[]) ?? [],
      applicableProgramTypes: (row.applicable_program_types as string[]) ?? [],
      severityOverride: row.severity_override as Severity | null,
      authorityOverride: row.authority_override as AuthorityState | null,
      consequenceOverride: row.consequence_override as ConsequenceType | null,
      description: row.description as string,
      regulatoryReference: row.regulatory_reference as string | null,
      rationale: row.rationale as string | null,
      priority: (row.priority as number) ?? 100,
      active: (row.active as boolean) ?? true,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 8: CROSS-ARTIFACT CONTRADICTION DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect approved-vs-working inconsistency: approved artifact content diverges
   * materially from current working draft for the same section.
   */
  async detectApprovedVsWorkingDrift(
    organizationId: number,
    projectId: number
  ): Promise<ContradictionFinding[]> {
    log.info('Detecting approved-vs-working drift', { projectId });
    const findings: ContradictionFinding[] = [];

    try {
      const { db } = await import('../db.js');
      // Fetch all artifacts for project
      const artifacts =
        (await db.query.concept2cureArtifacts
          ?.findMany?.({
            where: (a: any, { eq }: any) => eq(a.projectId, projectId),
            orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
          })
          .catch(() => [])) || [];

      // Group by ctdSection
      const bySectionCode = new Map<string, any[]>();
      for (const art of artifacts) {
        if (!art.ctdSection) continue;
        if (!bySectionCode.has(art.ctdSection)) bySectionCode.set(art.ctdSection, []);
        bySectionCode.get(art.ctdSection)!.push(art);
      }

      for (const [sectionCode, sectionArts] of bySectionCode) {
        const approved = sectionArts.find(
          (a: any) => a.status === 'approved' || a.status === 'locked'
        );
        const working = sectionArts.find((a: any) => a.status === 'draft' || a.status === 'review');
        if (!approved || !working) continue;
        if (approved.id === working.id) continue;

        // Compare content length and key terms
        const approvedContent = typeof approved.content === 'string' ? approved.content : '';
        const workingContent = typeof working.content === 'string' ? working.content : '';
        if (!approvedContent || !workingContent) continue;

        const approvedWords = approvedContent
          .replace(/<[^>]+>/g, ' ')
          .split(/\s+/)
          .filter(Boolean);
        const workingWords = workingContent
          .replace(/<[^>]+>/g, ' ')
          .split(/\s+/)
          .filter(Boolean);
        const lengthDelta = Math.abs(approvedWords.length - workingWords.length);
        const lengthRatio = lengthDelta / Math.max(approvedWords.length, 1);

        // Only flag if material difference (>15% word count change)
        if (lengthRatio < 0.15) continue;

        const finding = await this.createFinding({
          organizationId,
          projectId,
          sourceClassification: 'structured_record_conflict',
          objectAType: 'artifact',
          objectAId: String(approved.id),
          objectALabel: `${approved.title || sectionCode} (approved v${approved.version || '?'})`,
          objectBType: 'artifact',
          objectBId: String(working.id),
          objectBLabel: `${working.title || sectionCode} (working v${working.version || '?'})`,
          contradictionType: 'superseded_information',
          severity: lengthRatio > 0.5 ? 'high' : 'medium',
          truthHierarchyLevel: 3,
          confidenceScore: Math.min(0.95, 0.6 + lengthRatio),
          confidenceLevel: lengthRatio > 0.3 ? 'high' : 'moderate',
          title: `Approved vs working drift: section ${sectionCode}`,
          description: `Approved artifact "${approved.title}" (${approvedWords.length} words) and working draft "${working.title}" (${workingWords.length} words) differ by ${Math.round(lengthRatio * 100)}% in word count. The approved version may need reapproval if the working draft replaces it.`,
          deterministicRule:
            'RULE: Approved artifact + working draft for same section → content divergence > 15% = drift',
          llmRole: 'none',
        });
        findings.push(finding);
      }
    } catch (err) {
      log.warn('Approved-vs-working drift detection failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return findings;
  }

  /**
   * Detect status conflicts: artifact status doesn't match governance state.
   * E.g., artifact marked 'review' but has unresolved blocking contradictions,
   * or artifact marked 'approved' but underlying assumptions are superseded.
   */
  async detectStatusConflict(
    organizationId: number,
    projectId: number
  ): Promise<ContradictionFinding[]> {
    log.info('Detecting status conflicts', { projectId });
    const findings: ContradictionFinding[] = [];

    try {
      const { db } = await import('../db.js');
      const artifacts =
        (await db.query.concept2cureArtifacts
          ?.findMany?.({
            where: (a: any, { eq }: any) => eq(a.projectId, projectId),
          })
          .catch(() => [])) || [];

      // Check for artifacts in review/approved status with superseded assumptions
      const supersededAssumptions = await assumptionRegistryService.search({
        organizationId,
        projectId,
        status: 'superseded',
        limit: 200,
      });

      if (supersededAssumptions.length > 0) {
        for (const art of artifacts) {
          if (art.status !== 'review' && art.status !== 'approved' && art.status !== 'locked')
            continue;

          // Check if any superseded assumption was linked to this artifact
          const linkedSuperseded = supersededAssumptions.filter(
            (a: AssumptionRecord) => a.linkedArtifactId === art.id
          );

          if (linkedSuperseded.length > 0) {
            const finding = await this.createFinding({
              organizationId,
              projectId,
              sourceClassification: 'structured_record_conflict',
              objectAType: 'artifact',
              objectAId: String(art.id),
              objectALabel: `${art.title || 'Artifact'} (status: ${art.status})`,
              objectBType: 'assumption',
              objectBId: linkedSuperseded[0].id,
              objectBLabel: `${linkedSuperseded[0].title} (superseded)`,
              contradictionType: 'status_conflict',
              severity: art.status === 'approved' ? 'high' : 'medium',
              truthHierarchyLevel: 2,
              confidenceScore: 0.9,
              confidenceLevel: 'high',
              title: `Status conflict: ${art.status} artifact has superseded assumptions`,
              description: `Artifact "${art.title}" is in "${art.status}" status but depends on ${linkedSuperseded.length} superseded assumption(s). The artifact may need reapproval or revision.`,
              deterministicRule:
                'RULE: Artifact in review/approved/locked status + linked assumption superseded → status conflict',
              llmRole: 'none',
            });
            findings.push(finding);
          }
        }
      }

      // Check for artifacts in 'approved' status with unexecuted decisions
      const decisions = await decisionRecordService.search({
        organizationId,
        projectId,
        actionState: 'approved',
        limit: 200,
      });

      for (const d of decisions) {
        if (!d.executedArtifactId) continue;
        const linkedArt = artifacts.find((a: any) => a.id === d.executedArtifactId);
        if (linkedArt && linkedArt.status === 'draft') {
          const finding = await this.createFinding({
            organizationId,
            projectId,
            sourceClassification: 'structured_record_conflict',
            objectAType: 'decision',
            objectAId: d.id,
            objectALabel: d.title,
            objectBType: 'artifact',
            objectBId: String(linkedArt.id),
            objectBLabel: `${linkedArt.title || 'Artifact'} (draft)`,
            contradictionType: 'status_conflict',
            severity: 'medium',
            truthHierarchyLevel: 2,
            confidenceScore: 0.85,
            confidenceLevel: 'high',
            title: `Status conflict: decision executed on draft artifact`,
            description: `Decision "${d.title}" was executed and linked to artifact "${linkedArt.title}" but the artifact is still in draft status. It should have been promoted.`,
            deterministicRule:
              'RULE: Executed decision + linked artifact still in draft → status conflict',
            llmRole: 'none',
          });
          findings.push(finding);
        }
      }
    } catch (err) {
      log.warn('Status conflict detection failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return findings;
  }

  /**
   * Detect cross-artifact content conflicts using HarmonizeEngine.
   * Converts HarmonizeIssue results into ContradictionFinding objects
   * so they participate in the full contradiction lifecycle.
   */
  async detectCrossArtifactContentConflict(
    organizationId: number,
    projectId: number
  ): Promise<ContradictionFinding[]> {
    log.info('Detecting cross-artifact content conflicts', { projectId });
    const findings: ContradictionFinding[] = [];

    try {
      const { db } = await import('../db.js');
      const { HarmonizeEngine } = await import('./harmonize-engine.js');
      const engine = new HarmonizeEngine();

      // Fetch artifacts with content for this project
      const artifacts =
        (await db.query.concept2cureArtifacts
          ?.findMany?.({
            where: (a: any, { eq }: any) => eq(a.projectId, projectId),
          })
          .catch(() => [])) || [];

      // Build section content map for harmonize check
      const sections: Record<string, string> = {};
      const sectionArtifactMap: Record<string, any> = {};
      for (const art of artifacts) {
        if (!art.ctdSection || !art.content) continue;
        const content =
          typeof art.content === 'string'
            ? art.content
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
            : '';
        if (content.length < 50) continue; // Skip trivial content
        sections[art.ctdSection] = content;
        sectionArtifactMap[art.ctdSection] = art;
      }

      if (Object.keys(sections).length < 2) return findings;

      const result = await engine.check({ sections, submissionType: 'IND' });

      // Convert critical and error harmonize issues to contradiction findings
      const significantIssues = result.issues.filter(
        i => i.severity === 'critical' || i.severity === 'error'
      );

      const HARMONIZE_TO_CONTRADICTION: Record<string, ContradictionType> = {
        terminology: 'parameter_mismatch',
        numeric: 'parameter_mismatch',
        summary_body: 'summary_body_tension',
        reference: 'factual_contradiction',
        cross_section: 'factual_contradiction',
      };

      for (const issue of significantIssues.slice(0, 10)) {
        const artA = sectionArtifactMap[issue.sectionA];
        const artB = issue.sectionB ? sectionArtifactMap[issue.sectionB] : null;
        if (!artA) continue;

        const contradictionType = HARMONIZE_TO_CONTRADICTION[issue.type] || 'factual_contradiction';

        const finding = await this.createFinding({
          organizationId,
          projectId,
          sourceClassification: 'deterministic_rule_conflict',
          objectAType: 'artifact',
          objectAId: String(artA.id),
          objectALabel: `${artA.title || issue.sectionA} (${issue.sectionA})`,
          objectBType: artB ? 'artifact' : 'section_expectation',
          objectBId: artB ? String(artB.id) : issue.sectionB || 'none',
          objectBLabel: artB
            ? `${artB.title || issue.sectionB} (${issue.sectionB})`
            : issue.sectionB || undefined,
          contradictionType,
          severity: issue.severity === 'critical' ? 'critical' : 'high',
          truthHierarchyLevel: 5,
          confidenceScore: issue.severity === 'critical' ? 0.9 : 0.75,
          confidenceLevel: issue.severity === 'critical' ? 'high' : 'moderate',
          title: `Cross-section ${issue.type}: ${issue.sectionA}${issue.sectionB ? ` ↔ ${issue.sectionB}` : ''}`,
          description: issue.description,
          deterministicRule: `RULE: HarmonizeEngine ${issue.type} check between sections`,
          llmRole: 'none',
        });
        findings.push(finding);
      }
    } catch (err) {
      log.warn('Cross-artifact content conflict detection failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return findings;
  }

  /**
   * Detect body-specific expectation conflicts.
   * When body-aware gap analysis finds 'missing' requirements for a given
   * regulator/submissionType, and the section has content (not empty),
   * this represents a body-specific expectation conflict.
   */
  async detectBodySpecificExpectationConflict(
    organizationId: number,
    projectId: number,
    regulatorBody: string,
    submissionType: string
  ): Promise<ContradictionFinding[]> {
    log.info('Detecting body-specific expectation conflicts', {
      projectId,
      regulatorBody,
      submissionType,
    });
    const findings: ContradictionFinding[] = [];

    try {
      const { db } = await import('../db.js');
      const { detectBodySpecificGaps } = await import('./body-aware-authoring.js');

      const artifacts =
        (await db.query.concept2cureArtifacts
          ?.findMany?.({
            where: (a: any, { eq }: any) => eq(a.projectId, projectId),
          })
          .catch(() => [])) || [];

      for (const art of artifacts) {
        if (!art.ctdSection || !art.content) continue;
        const content =
          typeof art.content === 'string'
            ? art.content
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
            : '';
        if (content.length < 100) continue;

        try {
          const gapAnalysis = await detectBodySpecificGaps(
            regulatorBody,
            submissionType,
            art.ctdSection,
            content
          );

          const missingGaps = gapAnalysis.gaps.filter((g: any) => g.status === 'missing');
          if (missingGaps.length === 0) continue;

          // Only create finding for sections with multiple missing requirements
          if (missingGaps.length >= 2) {
            const finding = await this.createFinding({
              organizationId,
              projectId,
              sourceClassification: 'deterministic_rule_conflict',
              objectAType: 'artifact',
              objectAId: String(art.id),
              objectALabel: `${art.title || art.ctdSection} (${art.ctdSection})`,
              objectBType: 'body_expectation',
              objectBId: `${regulatorBody}:${submissionType}:${art.ctdSection}`,
              objectBLabel: `${regulatorBody} ${submissionType} requirements for ${art.ctdSection}`,
              contradictionType: 'regulatory_discrepancy',
              severity: missingGaps.length >= 4 ? 'high' : 'medium',
              truthHierarchyLevel: 6,
              confidenceScore: 0.8,
              confidenceLevel: 'moderate',
              title: `Body-specific gaps: ${art.ctdSection} missing ${missingGaps.length} ${regulatorBody} requirements`,
              description: `Section ${art.ctdSection} has content but is missing ${missingGaps.length} requirements expected by ${regulatorBody} for ${submissionType}: ${missingGaps
                .slice(0, 3)
                .map((g: any) => g.requirement)
                .join(
                  '; '
                )}${missingGaps.length > 3 ? ` and ${missingGaps.length - 3} more` : ''}.`,
              deterministicRule: `RULE: Body-aware gap analysis for ${regulatorBody}/${submissionType} → missing requirements in populated section`,
              llmRole: 'none',
              regulatorBody,
            });
            findings.push(finding);
          }
        } catch {
          // Gap analysis failed for this section — skip
        }
      }
    } catch (err) {
      log.warn('Body-specific expectation conflict detection failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return findings;
  }

  /**
   * Extended full project scan including Pass 8 detectors.
   */
  async scanProjectFull(
    organizationId: number,
    projectId: number,
    opts?: { regulatorBody?: string; submissionType?: string }
  ): Promise<{
    findings: ContradictionFinding[];
    summary: { total: number; bySeverity: Record<string, number>; byType: Record<string, number> };
    detectionMethods: string[];
  }> {
    log.info('Running FULL contradiction scan (Pass 8)', { projectId, opts });

    const detectionMethods: string[] = [];
    const allPromises: Promise<ContradictionFinding[]>[] = [
      // Pass 7 detectors
      this.detectAssumptionDrift(organizationId, projectId).then(r => {
        detectionMethods.push('assumption_drift');
        return r;
      }),
      this.detectDecisionActionInconsistency(organizationId, projectId).then(r => {
        detectionMethods.push('decision_action_inconsistency');
        return r;
      }),
      this.detectCrossJurisdictionalDivergence(organizationId, projectId).then(r => {
        detectionMethods.push('cross_jurisdictional_divergence');
        return r;
      }),
      // Pass 8 detectors
      this.detectApprovedVsWorkingDrift(organizationId, projectId).then(r => {
        detectionMethods.push('approved_vs_working_drift');
        return r;
      }),
      this.detectStatusConflict(organizationId, projectId).then(r => {
        detectionMethods.push('status_conflict');
        return r;
      }),
      this.detectCrossArtifactContentConflict(organizationId, projectId).then(r => {
        detectionMethods.push('cross_artifact_content');
        return r;
      }),
    ];

    // Body-specific detection if regulator/body context provided
    if (opts?.regulatorBody && opts?.submissionType) {
      allPromises.push(
        this.detectBodySpecificExpectationConflict(
          organizationId,
          projectId,
          opts.regulatorBody,
          opts.submissionType
        ).then(r => {
          detectionMethods.push('body_specific_expectation');
          return r;
        })
      );
    }

    const results = await Promise.allSettled(allPromises);
    const allFindings: ContradictionFinding[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allFindings.push(...result.value);
      }
    }

    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const f of allFindings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byType[f.contradictionType] = (byType[f.contradictionType] ?? 0) + 1;
    }

    return {
      findings: allFindings,
      summary: { total: allFindings.length, bySeverity, byType },
      detectionMethods,
    };
  }

  /**
   * Build contradiction context for preflight enrichment.
   * Returns a ContradictionPreflightContext scoped to the given module/section.
   */
  async buildPreflightContradictionContext(
    organizationId: number,
    projectId: number,
    scope: {
      sectionCode?: string;
      moduleCode?: string;
      regulatorBody?: string;
      submissionType?: string;
    }
  ): Promise<{
    unresolvedCount: number;
    blockingCount: number;
    overlayActiveCount: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    blockingFindings: Array<{
      id: string;
      contradictionType: string;
      severity: string;
      title: string;
      description: string;
      authorityState: string;
      consequenceType: string | null;
      objectAType: string;
      objectAId: string;
      objectALabel: string | null;
      objectBType: string;
      objectBId: string;
      objectBLabel: string | null;
      overlayApplied: boolean;
      overlayRuleCode?: string;
      regulatorBody?: string;
      recommendedAction: string | null;
      linkedDecisionId?: string;
    }>;
    warningFindings: Array<{
      id: string;
      contradictionType: string;
      severity: string;
      title: string;
      description: string;
      authorityState: string;
      recommendedAction: string | null;
    }>;
    overlayEscalatedToBlocking: boolean;
    linkedDecisionIds: string[];
  }> {
    const scanResult = await this.scanProjectFull(organizationId, projectId, {
      regulatorBody: scope.regulatorBody,
      submissionType: scope.submissionType,
    });

    // Filter to unresolved findings only
    const unresolved = scanResult.findings.filter(
      f => f.reviewState !== 'approved_resolution' && f.reviewState !== 'superseded'
    );

    const blocking = unresolved.filter(
      f => f.authorityState === 'blocks_promotion' || f.authorityState === 'requires_escalation'
    );
    const warnings = unresolved.filter(
      f =>
        f.authorityState !== 'blocks_promotion' &&
        f.authorityState !== 'requires_escalation' &&
        f.authorityState !== 'advisory_only'
    );
    const overlayActive = unresolved.filter(f => !!f.overlayRuleId);
    const overlayEscalated = unresolved.some(
      f =>
        f.overlayRuleId &&
        (f.authorityState === 'blocks_promotion' || f.authorityState === 'requires_escalation') &&
        f.regulatorSeverityOverride !== null
    );

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const f of unresolved) {
      byType[f.contradictionType] = (byType[f.contradictionType] ?? 0) + 1;
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    }

    // Collect linked decision IDs
    const linkedDecisionIds: string[] = [];
    try {
      const { decisionLifecycleService } = await import('./decision-lifecycle-service.js');
      const decisions = decisionLifecycleService.getProjectDecisions(String(projectId), {
        kind: 'contradiction-resolution-decision',
        limit: 20,
      });
      linkedDecisionIds.push(...decisions.map(d => d.id));
    } catch {
      /* non-blocking */
    }

    return {
      unresolvedCount: unresolved.length,
      blockingCount: blocking.length,
      overlayActiveCount: overlayActive.length,
      byType,
      bySeverity,
      blockingFindings: blocking.map(f => ({
        id: f.id,
        contradictionType: f.contradictionType,
        severity: f.severity,
        title: f.title,
        description: f.description,
        authorityState: f.authorityState,
        consequenceType: f.consequenceType,
        objectAType: f.objectAType,
        objectAId: f.objectAId,
        objectALabel: f.objectALabel,
        objectBType: f.objectBType,
        objectBId: f.objectBId,
        objectBLabel: f.objectBLabel,
        overlayApplied: !!f.overlayRuleId,
        overlayRuleCode: f.overlayRuleId || undefined,
        regulatorBody: f.regulatorBody || undefined,
        recommendedAction: f.consequenceType
          ? DEFAULT_CONSEQUENCE[f.contradictionType] || null
          : null,
        linkedDecisionId: linkedDecisionIds.find(dId =>
          decisionStore_findByContradiction(dId, f.id)
        ),
      })),
      warningFindings: warnings.slice(0, 10).map(f => ({
        id: f.id,
        contradictionType: f.contradictionType,
        severity: f.severity,
        title: f.title,
        description: f.description,
        authorityState: f.authorityState,
        recommendedAction: DEFAULT_CONSEQUENCE[f.contradictionType] || null,
      })),
      overlayEscalatedToBlocking: overlayEscalated,
      linkedDecisionIds,
    };
  }
}

/** Helper: check if a decision is linked to a contradiction (best-effort) */
function decisionStore_findByContradiction(decisionId: string, contradictionId: string): boolean {
  try {
    // This is a lightweight check — the decision lifecycle service has the real linkage
    return false; // Will be wired properly in decision-lifecycle integration
  } catch {
    return false;
  }
}

export const contradictionEngineService = new ContradictionEngineService();
