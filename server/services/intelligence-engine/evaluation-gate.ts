/**
 * Module 6 — Output Evaluation Gate (MANDATORY)
 *
 * Before any intelligence output is returned, it must pass this gate.
 * Checks for:
 *   - Verdict present (not vague)
 *   - Prioritization applied
 *   - Evidence grounding
 *   - Actionable guidance
 *
 * If any check fails → REJECT → signal for regeneration.
 */

import type { EvaluationResult, EvaluationCheck } from './types';

// ─── Evaluation Criteria ─────────────────────────────────────────────────────

/**
 * Check that output contains a clear verdict (not hedging everything).
 */
function checkVerdict(output: string): EvaluationCheck {
  const verdictMarkers = [
    /\b(recommend|conclusion|verdict|assessment|finding|determination)\s*:/i,
    /\b(should|must|needs?\s+to|recommend)\b/i,
    /\b(risk\s+level|severity|classification)\s*[:=]/i,
    /\b(approved?|reject(?:ed)?|accept(?:ed)?|compliant|non[- ]compliant)\b/i,
    /\bscore\s*[:=]\s*\d/i,
  ];

  const vaguenessMarkers = [
    /\bit\s+depends\b/i,
    /\bfurther\s+(?:analysis|review|investigation)\s+(?:is\s+)?(?:needed|required|recommended)\b/i,
    /\bmore\s+information\s+(?:is\s+)?(?:needed|required)\b/i,
  ];

  const hasVerdict = verdictMarkers.some(m => m.test(output));
  const isVague = vaguenessMarkers.filter(m => m.test(output)).length >= 2;

  if (!hasVerdict) {
    return {
      criterion: 'verdict_present',
      passed: false,
      detail: 'Output lacks a clear verdict, recommendation, or determination',
    };
  }

  if (isVague) {
    return {
      criterion: 'verdict_present',
      passed: false,
      detail: 'Output is hedged with multiple "more analysis needed" statements without actionable conclusions',
    };
  }

  return {
    criterion: 'verdict_present',
    passed: true,
    detail: 'Clear verdict or recommendation detected',
  };
}

/**
 * Check that output prioritizes findings (not a flat list).
 */
function checkPrioritization(output: string): EvaluationCheck {
  const priorityMarkers = [
    /\b(critical|high|medium|low)\s*(priority|severity|risk|importance)/i,
    /\b(first|most\s+important|primary\s+concern|top\s+priority)\b/i,
    /\b(severity|risk\s*level)\s*[:=]\s*(critical|high|moderate|low)/i,
    /\b(score|rating)\s*[:=]\s*\d/i,
    /\d+\.\s+\*?\*?(?:Critical|High|Major)/i,
  ];

  const hasPrioritization = priorityMarkers.some(m => m.test(output));

  return {
    criterion: 'prioritization_applied',
    passed: hasPrioritization,
    detail: hasPrioritization
      ? 'Output includes severity/priority classification'
      : 'Output presents findings as a flat list without prioritization',
  };
}

/**
 * Check that output references specific evidence (not generic statements).
 */
function checkEvidenceGrounding(output: string): EvaluationCheck {
  const groundingMarkers = [
    /\b(p\s*[<=>]\s*0?\.\d+)/i,              // p-values
    /\b(CI|confidence\s+interval)/i,           // confidence intervals
    /\b(section\s+\d|table\s+\d|figure\s+\d)/i, // document references
    /\b(claim|statement)\s+in\s+/i,            // specific claim references
    /\bclaim\s+strength\s*:/i,                 // structured signal reference
    /\bdefensibility\s+score\s*:/i,            // score reference
    /\binconsistency\s+(detected|found)/i,     // consistency reference
    /\bevidence\s+strength\s*:/i,              // evidence reference
    /\d+\s+claim/i,                            // quantified claim count
    /\d+%/,                                    // percentages
  ];

  const genericMarkers = [
    /\bin\s+general\b/i,
    /\boverall\b.*\btends?\s+to\b/i,
    /\btypically\b/i,
  ];

  const groundingCount = groundingMarkers.filter(m => m.test(output)).length;
  const genericCount = genericMarkers.filter(m => m.test(output)).length;

  const passed = groundingCount >= 2 && groundingCount > genericCount;

  return {
    criterion: 'evidence_grounded',
    passed,
    detail: passed
      ? `Output references ${groundingCount} specific evidence points`
      : `Output lacks specific evidence references (found ${groundingCount} grounding markers vs ${genericCount} generic statements)`,
  };
}

/**
 * Check that output provides actionable guidance (not just observations).
 */
function checkActionableGuidance(output: string): EvaluationCheck {
  const actionMarkers = [
    /\b(action|step|remediat|fix|correct|address|resolve|add|remove|revise|update|strengthen|moderate|soften)\b/i,
    /\bshould\s+\w+/i,
    /\bmust\s+\w+/i,
    /\brecommend(?:ation|ed|s)?\s*[:=]?\s*\w/i,
    /\bnext\s+step/i,
    /\bto\s+(?:resolve|address|fix|correct|improve)/i,
    /\bguidance\s*:/i,
  ];

  const actionCount = actionMarkers.filter(m => m.test(output)).length;
  const passed = actionCount >= 2;

  return {
    criterion: 'actionable_guidance',
    passed,
    detail: passed
      ? `Output contains ${actionCount} actionable recommendations`
      : 'Output lacks actionable remediation guidance',
  };
}

/**
 * Check minimum output length (reject trivially short responses).
 */
function checkMinimumSubstance(output: string): EvaluationCheck {
  const wordCount = output.split(/\s+/).length;
  const passed = wordCount >= 50;

  return {
    criterion: 'minimum_substance',
    passed,
    detail: passed
      ? `Output has adequate substance (${wordCount} words)`
      : `Output is too brief (${wordCount} words) for meaningful intelligence`,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate an intelligence output against quality criteria.
 * Returns pass/fail with specific rejection reasons.
 *
 * MANDATORY: Must be called before returning any intelligence output.
 */
export function evaluateOutput(output: string): EvaluationResult {
  const checks: EvaluationCheck[] = [
    checkVerdict(output),
    checkPrioritization(output),
    checkEvidenceGrounding(output),
    checkActionableGuidance(output),
    checkMinimumSubstance(output),
  ];

  const failedChecks = checks.filter(c => !c.passed);
  const passedCount = checks.filter(c => c.passed).length;
  const qualityScore = Math.round((passedCount / checks.length) * 100);

  return {
    passed: failedChecks.length === 0,
    checks,
    rejectionReasons: failedChecks.map(c => c.detail),
    qualityScore,
  };
}

/**
 * Evaluate structured intelligence analysis output.
 * Checks the formatted output string, not raw data.
 */
export function evaluateIntelligenceOutput(formattedOutput: string): EvaluationResult {
  return evaluateOutput(formattedOutput);
}
