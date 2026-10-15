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
 * refuse. A verdict the text declines or makes conditional is not asserted
 * (isAssertedVerdict).
 */
const VERDICT_CLAIM_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(?:is|are|it's|it is|that's|that is|they're|they are|we're|we are|now)\s+(?:now\s+|fully\s+|already\s+)?(?:ready|fit|cleared)\s+(?:to\s+(?:file|submit|be\s+(?:filed|submitted))|for\s+(?:(?:FDA|EMA|PMDA|MHRA|regulatory|agency|IND|NDA|BLA|MAA|the|an?)\s+){0,2}(?:filing|submission))\b/gi,
    reason: 'States a readiness verdict.' },
  { pattern: /\bsubmission[-\s]ready\b/gi,
    reason: 'States a readiness verdict.' },
  { pattern: /\b(?:is|are|it's|it is|remains?)\s+(?:now\s+|fully\s+|completely\s+|entirely\s+)?(?:(?:[A-Z0-9][\w.()§]*|CFR|Part|GMP|GCP|GLP)(?:\s+|-)){0,4}compliant\b/gi,
    reason: 'States a compliance verdict.' },
  { pattern: /\b(?:fully|completely)\s+compl(?:y|ies|iant)\b/gi,
    reason: 'States a compliance verdict.' },
  { pattern: /\bcomplies\s+(?:fully\s+)?with\b/gi,
    reason: 'States a compliance verdict.' },
  { pattern: /\b(?:meets?|satisf(?:y|ies))\s+all\s+(?:(?:the|applicable|relevant|regulatory|statutory|FDA|EMA|ICH|GMP)\s+){0,3}requirements\b/gi,
    reason: 'States a compliance verdict.' },
  { pattern: /\bin\s+(?:full\s+)?compliance\s+with\b/gi,
    reason: 'States a compliance verdict.' },
  { pattern: /\b(?:is|are)\s+approvable\b/gi,
    reason: 'States an approvability verdict.' },
  { pattern: /\b(?:will|would|should)\s+(?:likely|probably|certainly|surely|almost\s+certainly)\s+be\s+approved\b/gi,
    reason: 'Predicts an approval decision.' },
  // "will be approved" is a §14 prohibition above; these are the forms it misses.
  { pattern: /\b(?:NDA|BLA|ANDA|sNDA|sBLA|MAA|PMA|510\(k\)|De\s+Novo|IND|application|submission|dossier)\s+(?:should\s+(?:likely\s+|probably\s+|certainly\s+)?be\s+(?:approved|cleared|accepted|granted)|(?:will|would)\s+(?:likely\s+|probably\s+|certainly\s+)?be\s+(?:cleared|accepted|granted))\b/gi,
    reason: 'Predicts an approval decision.' },
  { pattern: /\b(?:FDA|EMA|PMDA|MHRA|Health\s+Canada|the\s+agency|the\s+reviewers?|regulators?)\s+(?:will|would)\s+(?:likely\s+|probably\s+|certainly\s+)?(?:accept|approve|clear|grant)\b/gi,
    reason: 'Predicts an agency decision.' },
];

/** Every verdict pattern match in the text, in order (not yet judged asserted). */
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

/** Words that decline a verdict, doubt it or make it conditional, in the clause before it or inside it. */
const NOT_ASSERTED =
  /\b(?:not|never|no\s+longer|no\s+(?:guarantee|assurance|certainty)|yet\s+to|fail(?:s|ed|ing)?\s+to|unlikely|uncertain|doubt(?:ful)?|may\s+not|might\s+not|whether|if|unless|before|until|once|when|in\s+order\s+to|so\s+that|confirm|check|verify|cannot|can't)\b|n't\b/i;
/** A condition after the verdict, in its own sentence: "is compliant only when audit trails are on". */
const CONDITION_AFTER =
  /\b(?:only\s+(?:if|when|once|after)|provided(?:\s+that)?|as\s+long\s+as|subject\s+to|unless|if|once|when|until)\b/i;
/** "approved by two signers" is a workflow step; "approved by FDA" is a prediction. */
const APPROVED_BY_PERSON = /^\s+by\s+(?!(?:the\s+)?(?:FDA|EMA|PMDA|MHRA|agency|regulators?|health\s+authorit))/i;

/**
 * Whether the text asserts the verdict a pattern found at `index`: not
 * declined or doubted ("does not meet all requirements", "no guarantee FDA
 * will accept"), not conditional ("whether the package is ready to file",
 * "before it is ready to file", "is compliant only when audit trails are
 * on"), not asked ("Is the section fully compliant?"), not a workflow step
 * ("will be approved by two signers"). The clause before it is read back to
 * the last sentence or clause break, at most 60 characters; the rest of its
 * sentence after it, at most 120.
 */
export function isAssertedVerdict(text: string, index: number, match: string): boolean {
  const before = text.slice(Math.max(0, index - 60), index);
  const clause = before.slice(Math.max(before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf(',')) + 1);
  if (NOT_ASSERTED.test(clause) || NOT_ASSERTED.test(match)) return false;
  const after = text.slice(index + match.length, index + match.length + 120);
  if (/approv(?:ed|e)$/i.test(match.trim()) && APPROVED_BY_PERSON.test(after)) return false;
  // The rest of its sentence: a question asks for the verdict, a condition withholds it.
  const end = after.search(/[.!?](?:\s|$)/);
  if (end >= 0 && after[end] === '?') return false;
  return !CONDITION_AFTER.test(end >= 0 ? after.slice(0, end) : after);
}
