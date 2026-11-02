/**
 * Issue detection for the AnA Intelligence Question Engine.
 *
 * After each answer, runs the node's issue checks and cross-node
 * cumulative risk analysis. Issues range from informational to
 * critical regulatory red flags. The cross-node detector identifies
 * compound risks that only emerge from the combination of answers
 * across multiple questions.
 *
 * @module server/services/ana/intelligence-questions/issue-detector
 */

import type { QuestionNode, DetectedIssue, FlowState, FlowDefinition } from './types.js';
import { evaluatePredicate } from './engine.js';
import {
  askedAt,
  contextFor,
  fieldsAskedBy,
  type CrossNodeContext,
  type MitigationState,
} from './cross-node-context.js';
import { CROSS_NODE_RULES } from './cross-node-rules.js';

/* Re-exported so every existing caller — and the gates — are unchanged. The
   rule table itself lives in cross-node-rules.ts (split 2026-11-02). */
export { fieldsAskedBy };
export type { CrossNodeContext, MitigationState };
export { crossNodeRuleFields } from './cross-node-rules.js';

/**
 * Evaluate all issue checks on a question node against the provided answers.
 * Returns an array of detected issues (empty = no issues).
 */
export function runIssueChecks(
  node: QuestionNode,
  answers: Record<string, unknown>,
): DetectedIssue[] {
  if (!node.issueChecks || node.issueChecks.length === 0) return [];

  const issues: DetectedIssue[] = [];

  for (const check of node.issueChecks) {
    if (evaluatePredicate(check.condition, answers)) {
      issues.push({
        checkId: check.id,
        severity: check.severity,
        title: check.title,
        message: check.message,
        reference: check.reference,
        questionId: node.id,
        triggerValues: extractTriggerValues(check.condition.field, answers),
      });
    }
  }

  return issues;
}

/**
 * Run cross-node cumulative risk analysis across all collected answers.
 * Detects compound issues that only emerge when looking at the full picture.
 */
export function runCrossNodeAnalysis(
  state: FlowState,
  definition: FlowDefinition,
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const flat = flattenAnswers(state.answers);
  const existingIds = new Set(state.issues.map(i => i.checkId));

  const asked = fieldsAskedBy(definition);
  /* A question the person has not reached is not a question they declined, and
     neither is one the card never DREW. The node must be completed AND the
     field's own `visibleWhen` must have held — a mitigating field hidden by its
     gate inside a completed node was indistinguishable from one left empty, so
     a CRITICAL finding asserted the absence of something never shown
     (2026-10-13 audit, F10). The gate is evaluated with the same shared
     evaluator the engine, the validator and the card all use. */
  const asksAt = askedAt(definition);
  const completed = new Set(state.completedNodes);
  const reached = (fieldId: string) => {
    const where = asksAt.get(fieldId);
    if (!where || !completed.has(where.node)) return false;
    return where.gate ? evaluatePredicate(where.gate, flat) : true;
  };
  for (const rule of CROSS_NODE_RULES) {
    if (existingIds.has(rule.id)) continue;
    if (rule.appliesTo && !rule.appliesTo.includes(definition.category)) continue;

    const issue = rule.check(flat, state, definition, contextFor(rule, flat, asked, reached));
    if (issue && !existingIds.has(issue.checkId)) {
      issues.push(issue);
    }
  }

  return issues;
}

/**
 * Compute a cumulative regulatory risk score (0-100) from all detected issues.
 * Higher = more risk. Used for flow-level risk assessment display.
 */
export function computeRiskScore(issues: DetectedIssue[]): {
  score: number;
  level: 'low' | 'moderate' | 'high' | 'critical';
  breakdown: { critical: number; warning: number; info: number };
} {
  const critical = issues.filter(i => i.severity === 'critical').length;
  const warning = issues.filter(i => i.severity === 'warning').length;
  const info = issues.filter(i => i.severity === 'info').length;

  const score = Math.min(100, critical * 25 + warning * 10 + info * 3);

  const level: 'low' | 'moderate' | 'high' | 'critical' =
    score >= 75 ? 'critical' :
    score >= 50 ? 'high' :
    score >= 25 ? 'moderate' :
    'low';

  return { score, level, breakdown: { critical, warning, info } };
}

/* ─── Internal helpers ───────────────────────────────────────────────── */

function extractTriggerValues(
  fieldId: string,
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (fieldId in answers) {
    result[fieldId] = answers[fieldId];
  }
  return result;
}

function flattenAnswers(answers: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const nodeAnswers of Object.values(answers)) {
    Object.assign(flat, nodeAnswers);
  }
  return flat;
}
