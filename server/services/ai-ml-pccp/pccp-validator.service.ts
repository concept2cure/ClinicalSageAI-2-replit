/**
 * PCCP Validator
 *
 * Deterministic checklist that scores a Predetermined Change Control Plan
 * against the FDA 2025 final guidance. Pure function — no DB writes — so
 * the same plan always produces the same finding set.
 *
 * The three required components per the guidance:
 *   1. Description of Modifications
 *   2. Modification Protocol
 *   3. Impact Assessment
 *
 * Per-modification checks:
 *   - boundary defined (and delta limit when applicable)
 *   - rationale present
 *   - rollback strategy present
 *   - performance acceptance criterion is quantitative
 *   - retraining-data criteria when modification involves retraining
 *   - cybersecurity impact narrative when type touches connectivity
 *   - labeling impact when modification affects user-facing claims
 *   - bias / subgroup analysis when retraining or algorithm update
 */

import type { AiMlPccpPlan, AiMlModification } from '../../../shared/schema/ai-ml-pccp';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type FindingSeverity = 'critical' | 'warning' | 'info';

export interface PccpFinding {
  code: string; // e.g. PCCP-001
  severity: FindingSeverity;
  scope: 'plan' | 'modification';
  modificationCode?: string; // present when scope=modification
  message: string;
  citation: string; // FDA guidance section
  recommendedFix?: string;
}

export interface PccpValidationResult {
  planId: string;
  planCode: string;
  planVersion: number;
  findings: PccpFinding[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  /** True if no critical findings — does NOT imply approval-readiness on its own. */
  passesGate: boolean;
  componentCoverage: {
    descriptionOfModifications: boolean;
    modificationProtocol: boolean;
    impactAssessment: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const has = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim().length > 0;

const FDA_GUIDANCE = 'FDA Guidance "Marketing Submission Recommendations for a Predetermined Change Control Plan for AI-Enabled Device Software Functions" (2024)';

const RETRAINING_TYPES: ReadonlySet<string> = new Set([
  'algorithm_update',
  'retraining',
  'input_data_change',
]);

const CYBER_RELEVANT_TYPES: ReadonlySet<string> = new Set([
  'algorithm_update',
  'input_data_change',
  'output_format_change',
  'hardware_dependency',
]);

const LABELING_RELEVANT_TYPES: ReadonlySet<string> = new Set([
  'output_format_change',
  'performance_threshold_change',
  'ui_change',
]);

function isQuantitativeThreshold(mod: AiMlModification): boolean {
  if (!has(mod.performanceMetric) || !has(mod.performanceComparator) || !has(mod.performanceThresholdValue)) {
    return false;
  }
  const v = String(mod.performanceThresholdValue).trim();
  // Accepts a number, optionally with %, or a numeric range; rejects free-text
  return /^[+-]?\d+(\.\d+)?\s*%?$/.test(v) || /^\d+(\.\d+)?\s*[-]\s*\d+(\.\d+)?\s*%?$/.test(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan-level checks
// ─────────────────────────────────────────────────────────────────────────────

function checkPlanLevel(plan: AiMlPccpPlan, mods: AiMlModification[]): PccpFinding[] {
  const out: PccpFinding[] = [];

  // Component 1: Description of Modifications
  if (!has(plan.descriptionSummary) && mods.length === 0) {
    out.push({
      code: 'PCCP-001',
      severity: 'critical',
      scope: 'plan',
      message: 'No Description of Modifications: the plan must enumerate the anticipated changes.',
      citation: `${FDA_GUIDANCE} §V.A`,
      recommendedFix:
        'Add at least one ai_ml_modifications row OR populate description_summary on the plan.',
    });
  }

  // Component 2: Modification Protocol global elements
  const protocolMissing: string[] = [];
  if (!has(plan.dataManagementPractices)) protocolMissing.push('data_management_practices');
  if (!has(plan.retrainingPractices)) protocolMissing.push('retraining_practices');
  if (!has(plan.performanceEvaluationProtocol)) protocolMissing.push('performance_evaluation_protocol');
  if (!has(plan.updateProcedures)) protocolMissing.push('update_procedures');
  if (protocolMissing.length) {
    out.push({
      code: 'PCCP-002',
      severity: 'critical',
      scope: 'plan',
      message: `Modification Protocol is incomplete. Missing: ${protocolMissing.join(', ')}.`,
      citation: `${FDA_GUIDANCE} §V.B`,
      recommendedFix:
        'Each Modification Protocol element is required: data management, retraining practices, performance evaluation protocol, and update procedures.',
    });
  }

  // Component 3: Impact Assessment
  const impactMissing: string[] = [];
  if (!has(plan.benefitsNarrative)) impactMissing.push('benefits_narrative');
  if (!has(plan.risksNarrative)) impactMissing.push('risks_narrative');
  if (!has(plan.mitigationsNarrative)) impactMissing.push('mitigations_narrative');
  if (!has(plan.comparisonToCurrentDevice)) impactMissing.push('comparison_to_current_device');
  if (impactMissing.length) {
    out.push({
      code: 'PCCP-003',
      severity: 'critical',
      scope: 'plan',
      message: `Impact Assessment is incomplete. Missing: ${impactMissing.join(', ')}.`,
      citation: `${FDA_GUIDANCE} §V.C`,
    });
  }

  // Cross-cutting expectations (non-critical when missing, but warned)
  if (!has(plan.monitoringPlan)) {
    out.push({
      code: 'PCCP-010',
      severity: 'warning',
      scope: 'plan',
      message: 'No real-world monitoring plan documented.',
      citation: `${FDA_GUIDANCE} §V.B; FDA "Good Machine Learning Practice" Guiding Principles (2021)`,
    });
  }
  if (!has(plan.driftDetectionPlan)) {
    out.push({
      code: 'PCCP-011',
      severity: 'warning',
      scope: 'plan',
      message: 'No drift detection plan documented.',
      citation: `${FDA_GUIDANCE} §V.B`,
    });
  }
  if (!has(plan.biasSubgroupAnalysisPlan)) {
    out.push({
      code: 'PCCP-012',
      severity: 'warning',
      scope: 'plan',
      message: 'No bias / subgroup analysis plan documented.',
      citation: `${FDA_GUIDANCE} §V.C; GMLP Principle 5`,
    });
  }
  if (!has(plan.rollbackStrategyNarrative)) {
    out.push({
      code: 'PCCP-013',
      severity: 'warning',
      scope: 'plan',
      message: 'No global rollback strategy narrative on the plan.',
      citation: `${FDA_GUIDANCE} §V.B`,
    });
  }
  if (!has(plan.cybersecurityImpactNarrative)) {
    out.push({
      code: 'PCCP-014',
      severity: 'warning',
      scope: 'plan',
      message: 'No cybersecurity impact narrative.',
      citation: 'FDA Cybersecurity Premarket Guidance (2023); IEC 81001-5-1:2021',
    });
  }
  if (!has(plan.labelingImpactNarrative)) {
    out.push({
      code: 'PCCP-015',
      severity: 'warning',
      scope: 'plan',
      message: 'No labeling impact narrative.',
      citation: '21 CFR 801; FDA PCCP Guidance §V.B',
    });
  }

  if (plan.locked && plan.status !== 'approved' && plan.status !== 'superseded') {
    out.push({
      code: 'PCCP-099',
      severity: 'critical',
      scope: 'plan',
      message: `Plan is locked but status is "${plan.status}". A locked plan must be approved or superseded.`,
      citation: '21 CFR Part 11 §11.10(e)',
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-modification checks
// ─────────────────────────────────────────────────────────────────────────────

function checkModification(mod: AiMlModification): PccpFinding[] {
  const out: PccpFinding[] = [];
  const ref = mod.code;

  if (!has(mod.boundary)) {
    out.push({
      code: 'PCCP-101',
      severity: 'critical',
      scope: 'modification',
      modificationCode: ref,
      message: `Modification ${ref} has no defined boundary.`,
      citation: `${FDA_GUIDANCE} §V.A`,
    });
  }
  if (!has(mod.rationale)) {
    out.push({
      code: 'PCCP-102',
      severity: 'critical',
      scope: 'modification',
      modificationCode: ref,
      message: `Modification ${ref} has no rationale.`,
      citation: `${FDA_GUIDANCE} §V.A`,
    });
  }
  if (!has(mod.rollbackStrategy)) {
    out.push({
      code: 'PCCP-103',
      severity: 'critical',
      scope: 'modification',
      modificationCode: ref,
      message: `Modification ${ref} has no rollback strategy.`,
      citation: `${FDA_GUIDANCE} §V.B`,
    });
  }

  if (!isQuantitativeThreshold(mod)) {
    out.push({
      code: 'PCCP-104',
      severity: 'critical',
      scope: 'modification',
      modificationCode: ref,
      message: `Modification ${ref} lacks a quantitative performance acceptance threshold (metric + comparator + numeric value).`,
      citation: `${FDA_GUIDANCE} §V.B`,
      recommendedFix:
        'Set performanceMetric (e.g. AUC), performanceComparator (e.g. >=), and performanceThresholdValue (e.g. 0.85).',
    });
  }

  if (RETRAINING_TYPES.has(mod.modificationType)) {
    if (!has(mod.retrainingDataCriteria)) {
      out.push({
        code: 'PCCP-105',
        severity: 'critical',
        scope: 'modification',
        modificationCode: ref,
        message: `Modification ${ref} (${mod.modificationType}) is a retraining-class change but has no retraining-data criteria.`,
        citation: `${FDA_GUIDANCE} §V.B; GMLP Principle 4`,
      });
    }
    if (!has(mod.biasSubgroupAnalysis)) {
      out.push({
        code: 'PCCP-106',
        severity: 'warning',
        scope: 'modification',
        modificationCode: ref,
        message: `Modification ${ref} should include a per-modification bias / subgroup analysis since it involves retraining.`,
        citation: `${FDA_GUIDANCE} §V.C`,
      });
    }
  }

  if (CYBER_RELEVANT_TYPES.has(mod.modificationType) && !has(mod.cybersecurityImpact)) {
    out.push({
      code: 'PCCP-107',
      severity: 'warning',
      scope: 'modification',
      modificationCode: ref,
      message: `Modification ${ref} (${mod.modificationType}) should include a cybersecurity impact statement.`,
      citation: 'FDA Cybersecurity Premarket Guidance (2023); IEC 81001-5-1:2021',
    });
  }

  if (LABELING_RELEVANT_TYPES.has(mod.modificationType) && !has(mod.labelingImpact)) {
    out.push({
      code: 'PCCP-108',
      severity: 'warning',
      scope: 'modification',
      modificationCode: ref,
      message: `Modification ${ref} (${mod.modificationType}) should include a labeling impact statement.`,
      citation: '21 CFR 801; FDA PCCP Guidance §V.B',
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

export function validatePccp(
  plan: AiMlPccpPlan,
  modifications: AiMlModification[]
): PccpValidationResult {
  const findings: PccpFinding[] = [
    ...checkPlanLevel(plan, modifications),
    ...modifications.flatMap(checkModification),
  ];

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const infoCount = findings.filter(f => f.severity === 'info').length;

  return {
    planId: plan.id,
    planCode: plan.code,
    planVersion: plan.version,
    findings,
    criticalCount,
    warningCount,
    infoCount,
    passesGate: criticalCount === 0,
    componentCoverage: {
      descriptionOfModifications:
        has(plan.descriptionSummary) || modifications.length > 0,
      modificationProtocol:
        has(plan.dataManagementPractices) &&
        has(plan.retrainingPractices) &&
        has(plan.performanceEvaluationProtocol) &&
        has(plan.updateProcedures),
      impactAssessment:
        has(plan.benefitsNarrative) &&
        has(plan.risksNarrative) &&
        has(plan.mitigationsNarrative) &&
        has(plan.comparisonToCurrentDevice),
    },
  };
}
