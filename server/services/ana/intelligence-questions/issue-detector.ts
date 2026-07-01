/**
 * Issue detection for the AnA Intelligence Question Engine.
 *
 * After each answer, runs the node's issue checks and returns any
 * regulatory red flags. Issues range from informational ("consider
 * adaptive design") to critical ("Phase 3 requires IRB approval
 * before enrollment").
 *
 * @module server/services/ana/intelligence-questions/issue-detector
 */

import type { QuestionNode, DetectedIssue } from './types.js';
import { evaluatePredicate } from './engine.js';

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
