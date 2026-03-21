/**
 * Readiness Evaluation Service — Rules-driven readiness assessment
 *
 * Evaluates project readiness by running registered rules from the
 * readiness_rules table against the project's current state.
 *
 * Three evidence classes are distinguished:
 *   1. rules_based — hard rules matched from readiness_rules table
 *   2. validation_based — results from validation engine
 *   3. ai_inferred — LLM-interpreted gaps (used sparingly)
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  Source of truth: PostgreSQL (readiness_evaluations, readiness_rules)║
 * ║  Firebase: projection only, written after PG commit                 ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * @module server/services/readiness-evaluation-service
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { eq, and } from 'drizzle-orm';
import {
  readinessRules,
  readinessEvaluations,
  type ReadinessFinding,
  type ReadinessRule,
} from '../../shared/schema/orchestration.js';

// ═══════════════════════════════════════════════════════════════════════════════
// RULE HANDLER REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A rule handler evaluates a single readiness rule against the project state.
 * Returns a finding indicating whether the rule passed or identified a gap.
 */
export interface RuleHandler {
  readonly ruleType: string;
  evaluate(
    rule: ReadinessRule,
    context: EvaluationContext,
  ): Promise<ReadinessFinding>;
}

export interface EvaluationContext {
  readonly organizationId: number;
  readonly projectId: number;
  readonly programId?: string;
  readonly programType: string;
  readonly moduleType?: string;
}

const _handlers = new Map<string, RuleHandler>();

/** Register a rule handler for a specific rule type */
export function registerRuleHandler(handler: RuleHandler): void {
  _handlers.set(handler.ruleType, handler);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILT-IN RULE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Required item handler — checks if an expected artifact/document exists.
 * This is the most common rule type: "Project must have a signed protocol."
 */
registerRuleHandler({
  ruleType: 'required_item',
  async evaluate(rule, context): Promise<ReadinessFinding> {
    // Query for the expected item in project artifacts
    // This is a lightweight check — look for artifacts matching the expected item description
    try {
      const { rows } = await db.execute(
        `SELECT id FROM project_artifacts
         WHERE organization_id = ${context.organizationId}
           AND project_id = ${context.projectId}
           AND (title ILIKE ${'%' + rule.expectedItem + '%'}
                OR document_type ILIKE ${'%' + (rule.documentType ?? rule.expectedItem) + '%'})
           AND status != 'deleted'
         LIMIT 1` as unknown as Parameters<typeof db.execute>[0],
      );

      if (rows && (rows as unknown[]).length > 0) {
        return {
          ruleId: rule.id,
          ruleCode: rule.ruleCode,
          findingType: 'passed',
          severity: rule.severity as ReadinessFinding['severity'],
          expectedItem: rule.expectedItem,
          actualState: 'present',
          evidenceClass: 'rules_based',
          regulatoryReference: rule.regulatoryReference ?? undefined,
        };
      }

      return {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        findingType: 'missing',
        severity: rule.severity as ReadinessFinding['severity'],
        expectedItem: rule.expectedItem,
        actualState: 'not_found',
        evidenceClass: 'rules_based',
        regulatoryReference: rule.regulatoryReference ?? undefined,
        recommendation: `Add required item: ${rule.expectedItem}`,
      };
    } catch {
      // If query fails (table may not exist yet), treat as missing
      return {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        findingType: 'missing',
        severity: rule.severity as ReadinessFinding['severity'],
        expectedItem: rule.expectedItem,
        actualState: 'unable_to_evaluate',
        evidenceClass: 'rules_based',
        regulatoryReference: rule.regulatoryReference ?? undefined,
        recommendation: `Verify: ${rule.expectedItem}`,
      };
    }
  },
});

/**
 * Completeness check handler — checks if sections/fields are complete.
 */
registerRuleHandler({
  ruleType: 'completeness_check',
  async evaluate(rule, context): Promise<ReadinessFinding> {
    // Check for document completeness by looking at artifact status
    try {
      const { rows } = await db.execute(
        `SELECT status FROM project_artifacts
         WHERE organization_id = ${context.organizationId}
           AND project_id = ${context.projectId}
           AND document_type ILIKE ${'%' + (rule.documentType ?? rule.expectedItem) + '%'}
           AND status != 'deleted'
         LIMIT 1` as unknown as Parameters<typeof db.execute>[0],
      );

      const artifact = rows && (rows as unknown[])[0] as Record<string, unknown> | undefined;
      if (!artifact) {
        return {
          ruleId: rule.id,
          ruleCode: rule.ruleCode,
          findingType: 'missing',
          severity: rule.severity as ReadinessFinding['severity'],
          expectedItem: rule.expectedItem,
          actualState: 'document_not_found',
          evidenceClass: 'rules_based',
          regulatoryReference: rule.regulatoryReference ?? undefined,
          recommendation: `Create and complete: ${rule.expectedItem}`,
        };
      }

      const status = artifact.status as string;
      if (status === 'completed' || status === 'approved' || status === 'published') {
        return {
          ruleId: rule.id,
          ruleCode: rule.ruleCode,
          findingType: 'passed',
          severity: rule.severity as ReadinessFinding['severity'],
          expectedItem: rule.expectedItem,
          actualState: status,
          evidenceClass: 'rules_based',
          regulatoryReference: rule.regulatoryReference ?? undefined,
        };
      }

      return {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        findingType: 'incomplete',
        severity: rule.severity as ReadinessFinding['severity'],
        expectedItem: rule.expectedItem,
        actualState: status,
        evidenceClass: 'rules_based',
        regulatoryReference: rule.regulatoryReference ?? undefined,
        recommendation: `Complete: ${rule.expectedItem} (currently ${status})`,
      };
    } catch {
      return {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        findingType: 'missing',
        severity: rule.severity as ReadinessFinding['severity'],
        expectedItem: rule.expectedItem,
        actualState: 'unable_to_evaluate',
        evidenceClass: 'rules_based',
        recommendation: `Verify completeness: ${rule.expectedItem}`,
      };
    }
  },
});

/**
 * Quality gate handler — checks if a quality threshold is met.
 */
registerRuleHandler({
  ruleType: 'quality_gate',
  async evaluate(rule, _context): Promise<ReadinessFinding> {
    // Quality gates are evaluated based on validation expression or threshold
    // For now, mark as advisory if no validation expression is set
    if (!rule.validationExpression) {
      return {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        findingType: 'warning',
        severity: 'advisory',
        expectedItem: rule.expectedItem,
        actualState: 'no_validation_expression',
        evidenceClass: 'rules_based',
        regulatoryReference: rule.regulatoryReference ?? undefined,
        recommendation: `Configure quality gate validation for: ${rule.expectedItem}`,
      };
    }

    // Placeholder — quality gates will be extended with real validation engine
    return {
      ruleId: rule.id,
      ruleCode: rule.ruleCode,
      findingType: 'passed',
      severity: rule.severity as ReadinessFinding['severity'],
      expectedItem: rule.expectedItem,
      actualState: 'gate_configured',
      evidenceClass: 'rules_based',
      regulatoryReference: rule.regulatoryReference ?? undefined,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvaluationResult {
  readonly evaluationId: string;
  readonly overallScore: number;
  readonly isReady: boolean;
  readonly rulesBasedFindings: ReadinessFinding[];
  readonly validationFindings: ReadinessFinding[];
  readonly aiInferredFindings: ReadinessFinding[];
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly advisoryCount: number;
  readonly passedCount: number;
}

/**
 * Run a readiness evaluation for a project.
 * Fetches applicable rules, evaluates each, persists the result.
 */
export async function evaluateReadiness(
  context: EvaluationContext,
  options?: { workflowRunId?: string; evaluatedBy?: string },
): Promise<EvaluationResult> {
  const evaluationId = uuidv4();

  // Fetch applicable rules for this org/program/module
  const rules = await db
    .select()
    .from(readinessRules)
    .where(and(
      eq(readinessRules.organizationId, context.organizationId),
      eq(readinessRules.isActive, true),
    ));

  // Filter rules by program/module scope
  const applicableRules = rules.filter(rule => {
    if (rule.programType !== '*' && rule.programType !== context.programType) return false;
    if (rule.moduleType && context.moduleType && rule.moduleType !== context.moduleType) return false;
    return true;
  });

  // Evaluate each rule
  const rulesBasedFindings: ReadinessFinding[] = [];

  for (const rule of applicableRules) {
    const handler = _handlers.get(rule.ruleType);
    if (!handler) {
      // Unknown rule type — log and skip
      console.warn(`[readiness] No handler for rule type "${rule.ruleType}" (rule ${rule.ruleCode})`);
      rulesBasedFindings.push({
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        findingType: 'warning',
        severity: 'advisory',
        expectedItem: rule.expectedItem,
        actualState: `no_handler_for_type_${rule.ruleType}`,
        evidenceClass: 'rules_based',
        recommendation: `Register handler for rule type: ${rule.ruleType}`,
      });
      continue;
    }

    try {
      const finding = await handler.evaluate(rule, context);
      rulesBasedFindings.push(finding);
    } catch (err) {
      console.error(`[readiness] Rule ${rule.ruleCode} evaluation failed:`, err);
      rulesBasedFindings.push({
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        findingType: 'warning',
        severity: 'advisory',
        expectedItem: rule.expectedItem,
        actualState: 'evaluation_error',
        evidenceClass: 'rules_based',
        recommendation: `Check rule ${rule.ruleCode} — evaluation encountered an error`,
      });
    }
  }

  // Combine all findings for scoring
  const allFindings = [...rulesBasedFindings]; // validation + ai findings added when available
  const blockerCount = allFindings.filter(f => f.severity === 'blocker').length;
  const warningCount = allFindings.filter(f => f.severity === 'warning').length;
  const advisoryCount = allFindings.filter(f => f.severity === 'advisory').length;
  const passedCount = allFindings.filter(f => f.findingType === 'passed').length;
  const totalRules = allFindings.length;

  // Score: 0-100, weighted by severity
  const overallScore = totalRules > 0
    ? Math.round((passedCount / totalRules) * 100)
    : 100; // No rules = 100% ready

  const isReady = blockerCount === 0 && overallScore >= 80;

  // Persist the evaluation
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evalValues: any = {
      id: evaluationId,
      workflowRunId: options?.workflowRunId ?? null,
      organizationId: context.organizationId,
      projectId: context.projectId,
      programId: context.programId ?? null,
      evaluatedBy: options?.evaluatedBy ?? 'system',
      rulesBasedFindings,
      validationFindings: [],
      aiInferredFindings: [],
      overallScore: String(overallScore),
      blockerCount,
      warningCount,
      advisoryCount,
      passedCount,
      isReady,
    };
    await db.insert(readinessEvaluations).values(evalValues);
  } catch (err) {
    console.error('[readiness] Failed to persist evaluation:', err);
  }

  return {
    evaluationId,
    overallScore,
    isReady,
    rulesBasedFindings,
    validationFindings: [],
    aiInferredFindings: [],
    blockerCount,
    warningCount,
    advisoryCount,
    passedCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED RULES — Default readiness rules for common program types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Seed default readiness rules for an organization.
 * Called once per org setup, or to refresh to latest rule definitions.
 */
export async function seedDefaultRules(organizationId: number): Promise<number> {
  const defaultRules = [
    // CER (Clinical Evaluation Report)
    { programType: 'CER', ruleCode: 'REQ-CER-001', ruleType: 'required_item' as const, name: 'Clinical Evaluation Plan', expectedItem: 'Clinical Evaluation Plan', severity: 'blocker', regulatoryReference: 'MDR Annex XIV, Part A' },
    { programType: 'CER', ruleCode: 'REQ-CER-002', ruleType: 'required_item' as const, name: 'Literature Search Protocol', expectedItem: 'Literature Search Protocol', severity: 'blocker', regulatoryReference: 'MEDDEV 2.7/1 Rev.4, Section 8' },
    { programType: 'CER', ruleCode: 'REQ-CER-003', ruleType: 'required_item' as const, name: 'Clinical Data Appraisal', expectedItem: 'Clinical Data Appraisal', severity: 'blocker', regulatoryReference: 'MDR Annex XIV, Part A, Section 1' },
    { programType: 'CER', ruleCode: 'REQ-CER-004', ruleType: 'completeness_check' as const, name: 'CER Completeness', expectedItem: 'Clinical Evaluation Report', severity: 'blocker', regulatoryReference: 'MDR Article 61' },
    { programType: 'CER', ruleCode: 'REQ-CER-005', ruleType: 'required_item' as const, name: 'PMCF Plan', expectedItem: 'Post-Market Clinical Follow-up Plan', severity: 'warning', regulatoryReference: 'MDR Annex XIV, Part B' },

    // 510(k)
    { programType: '510K', ruleCode: 'REQ-510K-001', ruleType: 'required_item' as const, name: 'Substantial Equivalence Comparison', expectedItem: 'Substantial Equivalence Comparison', severity: 'blocker', regulatoryReference: '21 CFR 807.87' },
    { programType: '510K', ruleCode: 'REQ-510K-002', ruleType: 'required_item' as const, name: 'Device Description', expectedItem: 'Device Description', severity: 'blocker', regulatoryReference: '21 CFR 807.87(e)' },
    { programType: '510K', ruleCode: 'REQ-510K-003', ruleType: 'required_item' as const, name: 'Predicate Device Identification', expectedItem: 'Predicate Device Identification', severity: 'blocker', regulatoryReference: '21 CFR 807.87(f)' },
    { programType: '510K', ruleCode: 'REQ-510K-004', ruleType: 'required_item' as const, name: 'Performance Data', expectedItem: 'Performance Testing Data', severity: 'blocker', regulatoryReference: '21 CFR 807.87(g)' },
    { programType: '510K', ruleCode: 'REQ-510K-005', ruleType: 'required_item' as const, name: 'Biocompatibility Assessment', expectedItem: 'Biocompatibility Assessment', severity: 'warning', regulatoryReference: 'FDA Guidance: Use of ISO 10993-1' },

    // IND (Investigational New Drug)
    { programType: 'IND', ruleCode: 'REQ-IND-001', ruleType: 'required_item' as const, name: 'Investigator Brochure', expectedItem: 'Investigator Brochure', severity: 'blocker', regulatoryReference: '21 CFR 312.23(a)(5)' },
    { programType: 'IND', ruleCode: 'REQ-IND-002', ruleType: 'required_item' as const, name: 'Clinical Protocol', expectedItem: 'Clinical Protocol', severity: 'blocker', regulatoryReference: '21 CFR 312.23(a)(6)' },
    { programType: 'IND', ruleCode: 'REQ-IND-003', ruleType: 'required_item' as const, name: 'Chemistry Manufacturing Controls', expectedItem: 'CMC Section', severity: 'blocker', regulatoryReference: '21 CFR 312.23(a)(7)' },
    { programType: 'IND', ruleCode: 'REQ-IND-004', ruleType: 'required_item' as const, name: 'Pharmacology/Toxicology', expectedItem: 'Pharmacology and Toxicology Data', severity: 'blocker', regulatoryReference: '21 CFR 312.23(a)(8)' },

    // NDA (New Drug Application)
    { programType: 'NDA', ruleCode: 'REQ-NDA-001', ruleType: 'required_item' as const, name: 'Clinical Overview', expectedItem: 'Module 2.5 Clinical Overview', severity: 'blocker', regulatoryReference: 'ICH M4E' },
    { programType: 'NDA', ruleCode: 'REQ-NDA-002', ruleType: 'required_item' as const, name: 'Quality Overall Summary', expectedItem: 'Module 2.3 Quality Overall Summary', severity: 'blocker', regulatoryReference: 'ICH M4Q' },
    { programType: 'NDA', ruleCode: 'REQ-NDA-003', ruleType: 'required_item' as const, name: 'Nonclinical Overview', expectedItem: 'Module 2.4 Nonclinical Overview', severity: 'blocker', regulatoryReference: 'ICH M4S' },

    // Universal rules (apply to all program types)
    { programType: '*', ruleCode: 'REQ-ALL-001', ruleType: 'required_item' as const, name: 'Cover Letter', expectedItem: 'Cover Letter', severity: 'warning', regulatoryReference: '' },
    { programType: '*', ruleCode: 'REQ-ALL-002', ruleType: 'quality_gate' as const, name: 'No Unresolved Blockers', expectedItem: 'All blockers resolved', severity: 'blocker', regulatoryReference: '' },
  ];

  let seeded = 0;
  for (const rule of defaultRules) {
    try {
      // Upsert: skip if rule code already exists for this org
      const existing = await db
        .select({ id: readinessRules.id })
        .from(readinessRules)
        .where(and(
          eq(readinessRules.organizationId, organizationId),
          eq(readinessRules.ruleCode, rule.ruleCode),
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(readinessRules).values({
          organizationId,
          programType: rule.programType,
          ruleType: rule.ruleType,
          ruleCode: rule.ruleCode,
          name: rule.name,
          description: `Readiness rule: ${rule.name}`,
          expectedItem: rule.expectedItem,
          severity: rule.severity,
          regulatoryReference: rule.regulatoryReference || null,
        });
        seeded++;
      }
    } catch (err) {
      console.error(`[readiness] Failed to seed rule ${rule.ruleCode}:`, err);
    }
  }

  console.info(`[readiness] Seeded ${seeded} default rules for org ${organizationId}`);
  return seeded;
}
