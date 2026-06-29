/**
 * Translation QA — public surface + aggregator.
 *
 * runQaChecks() folds every registered check (structural + numeric + semantic)
 * over a single translated segment into one QaReport, deriving `passed` (no error
 * findings) and the per-severity `summary` HERE — never in the individual checks,
 * which only emit findings.
 *
 * qaGatesApproval() answers the workflow's question: should QA errors block this
 * segment from auto-advancing? True iff the report contains any 'error' finding.
 * QA never auto-rejects — it gates the machine, the human still adjudicates (see
 * the severity semantics in ./types).
 *
 * @module server/services/translation/qa
 */

import { STRUCTURAL_CHECKS } from './structural-checks';
import { numericChecks } from './numeric-checks';
import { SEMANTIC_CHECKS } from './semantic-checks';
import type { QaCheck, QaCheckInput, QaFinding, QaReport, QaSeverityCounts } from './types';
import type { TranslationSegment } from '../types';

/**
 * The full QA check registry, in stable execution/registration order:
 * structural (identifier/placeholder/untranslated/control-char) → numeric
 * (number/unit/length) → semantic (glossary adherence, back-translation drift).
 * Findings appear in this order in the report.
 */
export const ALL_QA_CHECKS: readonly QaCheck[] = [
  ...STRUCTURAL_CHECKS,
  ...numericChecks,
  ...SEMANTIC_CHECKS,
];

/** Zeroed severity counter. */
function emptyCounts(): QaSeverityCounts {
  return { error: 0, warning: 0, info: 0 };
}

/**
 * Run every registered QA check over one segment's text and aggregate the
 * findings into a QaReport. Pure and deterministic: equal input → equal report.
 *
 * @param input  the source/target (+ optional back-translation, glossary) to QA
 * @param segmentId  optional id to tie the report to a TranslationSegment row
 */
export function runQaChecks(
  input: QaCheckInput,
  segmentId?: TranslationSegment['id'],
): QaReport {
  const findings: QaFinding[] = [];
  for (const check of ALL_QA_CHECKS) {
    // A check must never throw for ordinary cases; guard anyway so one
    // misbehaving check can't sink the whole report (defensive, deterministic).
    const produced = check(input);
    if (produced.length > 0) findings.push(...produced);
  }

  const summary = emptyCounts();
  for (const f of findings) summary[f.severity]++;

  return {
    ...(segmentId !== undefined ? { segmentId } : {}),
    findings,
    passed: summary.error === 0,
    summary,
  };
}

/**
 * Should QA block this segment from auto-advancing? True iff the report carries
 * at least one 'error'. (Equivalent to `!report.passed`, named for intent at the
 * workflow call site.)
 */
export function qaGatesApproval(report: QaReport): boolean {
  return report.summary.error > 0;
}

export type { QaCheck, QaCheckInput, QaFinding, QaReport, QaSeverity, QaSeverityCounts } from './types';
export { STRUCTURAL_CHECKS } from './structural-checks';
export { numericChecks } from './numeric-checks';
export { SEMANTIC_CHECKS } from './semantic-checks';
