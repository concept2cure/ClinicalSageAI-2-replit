/**
 * Clinical Regulatory Evidence — statistical & evidentiary governance (§14).
 *
 * Two guards the whole spine (and any AnA text grounded on it) must pass:
 *
 *   1. Metric provenance — every reported metric must carry its numerator,
 *      denominator, missing count, inclusion criteria, filters, extraction
 *      method, verification status and date range. `validateMetricProvenance`
 *      reports what is missing; `INSUFFICIENT_EVIDENCE` is the correct output
 *      when the evidence cannot support an estimate.
 *
 *   2. Unsupported claims — the work order PROHIBITS a specific class of
 *      overclaims ("FDA usually accepts", "85% approval probability",
 *      "completed trials were successful", "three PPQ batches resolve this
 *      deficiency", "this endpoint is FDA approved"). `detectUnsupportedClaims`
 *      finds them in generated text; `assertNoUnsupportedClaims` throws.
 *
 * Pure — no DB, no LLM. Intended to gate service outputs and (later) AnA replies.
 *
 * @module server/services/clinical-regulatory-evidence/governance
 */

import type { MetricProvenance } from './types';

/** The one correct output when structured evidence is insufficient (§14). */
export const INSUFFICIENT_EVIDENCE = 'Insufficient structured evidence to estimate this reliably.';

export class UnsupportedClaimError extends Error {}

// ─── 1. Metric provenance ─────────────────────────────────────────────────────

export interface ProvenanceValidation {
  valid: boolean;
  missing: string[];   // which §14 fields are absent
}

/**
 * A reported metric must carry the full §14 envelope. numerator/denominator may
 * legitimately be 0 but not null; a null means "not recorded" → invalid.
 */
export function validateMetricProvenance(m: Partial<MetricProvenance> | null | undefined): ProvenanceValidation {
  const missing: string[] = [];
  if (!m) return { valid: false, missing: ['numerator', 'denominator', 'missingCount', 'inclusionCriteria', 'filters', 'extractionMethod', 'verificationStatus', 'dateRange'] };
  if (m.numerator == null) missing.push('numerator');
  if (m.denominator == null) missing.push('denominator');
  if (m.missingCount == null) missing.push('missingCount');
  if (m.inclusionCriteria == null || m.inclusionCriteria === '') missing.push('inclusionCriteria');
  if (m.filters == null) missing.push('filters');
  if (m.extractionMethod == null || m.extractionMethod === '') missing.push('extractionMethod');
  if (m.verificationStatus == null) missing.push('verificationStatus');
  if (m.dateRange === undefined) missing.push('dateRange');   // null date range is allowed (explicitly "not scoped")
  return { valid: missing.length === 0, missing };
}

// ─── 2. Unsupported-claim detection ───────────────────────────────────────────

export interface ClaimViolation {
  match: string;
  reason: string;
  index: number;
}

/**
 * Patterns for the claims §14 prohibits. Each is a phrase-shape, not a keyword —
 * "FDA approved this product" (a factual statement of record) is fine; "this
 * endpoint is FDA approved" (implying a general rule) is not.
 */
const PROHIBITED_CLAIM_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bFDA\s+(?:usually|typically|generally|normally|often)\s+(?:accepts?|approves?|clears?|allows?)\b/i,
    reason: 'Implies a general FDA disposition ("FDA usually accepts") the evidence cannot support.' },
  { pattern: /\b\d{1,3}(?:\.\d+)?\s*%\s*(?:approval|success)\s*(?:probability|chance|likelihood|rate)\b/i,
    reason: 'States an approval/success probability as a number.' },
  { pattern: /\b(?:approval|success)\s*(?:probability|likelihood|chance)\s*(?:of|is|:)?\s*\d{1,3}(?:\.\d+)?\s*%/i,
    reason: 'States an approval/success probability as a number.' },
  { pattern: /\bcompleted\s+trials?\s+(?:were|was|are|is)\s+success/i,
    reason: 'Uses trial completion as a proxy for success.' },
  { pattern: /\b(?:this|the)\s+(?:trial|study)\s+(?:was|is)\s+success/i,
    reason: 'Asserts trial success as a regulatory outcome proxy.' },
  { pattern: /\b(?:three|3|\d+)\s+PPQ\s+batches?\s+(?:resolve|resolves|will\s+resolve|fixes?|address(?:es)?)\b/i,
    reason: 'Asserts a fixed PPQ-batch count resolves a deficiency.' },
  { pattern: /\b(?:this|the)\s+endpoint\s+is\s+FDA[-\s]approved\b/i,
    reason: 'Asserts an endpoint is "FDA approved" as a general rule.' },
  { pattern: /\bFDA[-\s]approved\s+endpoint\b/i,
    reason: 'Labels an endpoint "FDA-approved" as a general property.' },
  { pattern: /\b(?:will|would|is\s+likely\s+to)\s+(?:be\s+)?approv(?:ed|e)\b/i,
    reason: 'Predicts an approval decision.' },
  { pattern: /\bguaranteed?\s+(?:approval|clearance|success)\b/i,
    reason: 'Guarantees a regulatory outcome.' },
];

/** Find every prohibited claim in a piece of generated text. */
export function detectUnsupportedClaims(text: string): ClaimViolation[] {
  if (!text) return [];
  const out: ClaimViolation[] = [];
  for (const { pattern, reason } of PROHIBITED_CLAIM_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({ match: m[0], reason, index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;  // avoid zero-width loop
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Throw if the text contains any prohibited claim. Use to gate generated output. */
export function assertNoUnsupportedClaims(text: string): void {
  const violations = detectUnsupportedClaims(text);
  if (violations.length > 0) {
    throw new UnsupportedClaimError(
      `Output contains ${violations.length} unsupported claim(s): ` +
        violations.map((v) => `"${v.match}" — ${v.reason}`).join('; '),
    );
  }
}

/** True when the text is free of prohibited claims. */
export function isEvidentiallySound(text: string): boolean {
  return detectUnsupportedClaims(text).length === 0;
}

// ─── 3. Verdicts stated in generated text ─────────────────────────────────────

/**
 * Verdicts: that a package is ready to file, that a section complies, that a
 * submission is approvable. Rule 2 (CLAUDE.md): numbers and verdicts come from
 * deterministic engines and the model narrates, so a verdict in an answer is
 * named to the person, who can see which engine, if any, gave it
 * (services/ana/answer-grounding.ts).
 *
 * A separate set from the §14 prohibitions above, on purpose: those refuse
 * retrieval atoms (retrieval-atoms.service.ts), and source text that records
 * a finding ("the site was found compliant") is evidence, not a claim to
 * refuse. A verdict the answer declines to give ("is not ready to file") is
 * not named.
 */
const VERDICT_CLAIM_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(?:is|are)\s+(?!not\b)(?:now\s+|fully\s+)?(?:ready|fit)\s+(?:to\s+(?:file|submit)|for\s+(?:filing|submission))\b/gi,
    reason: 'States a readiness verdict.' },
  { pattern: /\bsubmission[-\s]ready\b/gi,
    reason: 'States a readiness verdict.' },
  { pattern: /\b(?:is|are)\s+(?!not\b)(?:now\s+)?(?:fully\s+|completely\s+)?compliant\b/gi,
    reason: 'States a compliance verdict.' },
  { pattern: /\b(?:fully\s+|completely\s+)complies\b/gi,
    reason: 'States a compliance verdict.' },
  { pattern: /\bmeets?\s+all\s+(?:the\s+|applicable\s+|regulatory\s+)?requirements\b/gi,
    reason: 'States a compliance verdict.' },
  { pattern: /\b(?:is|are)\s+(?!not\b)approvable\b/gi,
    reason: 'States an approvability verdict.' },
  { pattern: /\b(?:FDA|EMA|PMDA|the\s+agency|the\s+reviewers?)\s+will\s+accept\b/gi,
    reason: 'Predicts an agency decision.' },
];

/** Every verdict the text states, in order. */
export function detectVerdictClaims(text: string): ClaimViolation[] {
  if (!text) return [];
  const out: ClaimViolation[] = [];
  for (const { pattern, reason } of VERDICT_CLAIM_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      out.push({ match: m[0].replace(/\s+/g, ' '), reason, index: m.index });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
