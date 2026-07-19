/**
 * AI Gateway — prompt-injection detection.
 *
 * High-precision heuristics for the AI gateway's content filter. The platform
 * processes regulated clinical/regulatory text, so a false positive (blocking a
 * legitimate request) is itself harmful — a pasted protocol may legitimately
 * say "disregard the previous draft" or "summarize the previous instructions
 * section". Every pattern therefore requires BOTH an override/exfiltration verb
 * AND a meta-reference to the model's own instructions, rules or persona; a bare
 * word like "ignore" or "instructions" never triggers on its own.
 *
 * Each pattern carries a severity used by the policy engine's role-aware scan
 * (policy.ts): in content that should never contain directives to the model
 * (assistant history, tool outputs, ingested document text), 'high' detections
 * block fail-closed while 'medium' detections are flagged into the audit trail
 * without blocking. User messages keep the original block-on-any-hit posture.
 *   - 'high'   — direct subversion or exfiltration of the model's operating
 *                instructions (override / leak / persona reassignment). In
 *                indirect content these are unambiguous attack signatures.
 *   - 'medium' — roleplay/pretend framing. Genuine attack phrasing, but the
 *                most likely family to appear descriptively in legitimate
 *                text (e.g. an AI-security assessment quoted in a submission),
 *                so indirect hits are surfaced rather than blocked.
 *
 * This is a heuristic layer, not a guarantee. A model-based guardrail remains a
 * future option; see QC_SECURITY_REVIEW. Patterns use bounded gaps ({0,N}) so
 * there is no catastrophic backtracking (ReDoS).
 */

export type InjectionSeverity = 'high' | 'medium';

export interface InjectionResult {
  detected: boolean;
  category?: string;
  severity?: InjectionSeverity;
}

const PATTERNS: ReadonlyArray<{ category: string; severity: InjectionSeverity; re: RegExp }> = [
  // Override / disregard the model's existing instructions, rules or context.
  {
    category: 'instruction-override',
    severity: 'high',
    re: /\b(ignore|disregard|forget|override)\b[\s\S]{0,40}\b(all|any|the)?\s*(previous|prior|above|earlier|preceding|foregoing|system|developer|original)\b[\s\S]{0,25}\b(instruction|instructions|prompt|prompts|rule|rules|directive|directives|guideline|guidelines|constraint|constraints)\b/i,
  },
  // Override directive explicitly addressed to the system role.
  {
    category: 'instruction-override',
    severity: 'high',
    re: /\bsystem\s*[:>]\s*(override|bypass|ignore|disregard|new\s+(instruction|instructions|prompt))/i,
  },
  // System-prompt / instruction exfiltration.
  {
    category: 'system-prompt-exfiltration',
    severity: 'high',
    re: /\b(reveal|show|print|repeat|output|display|expose|leak|give me|tell me|what(?:'s| is| are))\b[\s\S]{0,40}\b(your|the|these|this)\b[\s\S]{0,25}\b(system\s*(prompt|message|instructions?)|initial\s*(prompt|instructions)|original\s*(prompt|instructions)|hidden\s*(prompt|instructions)|prompt\s*above)\b/i,
  },
  // Persona / jailbreak reassignment.
  {
    category: 'jailbreak-persona',
    severity: 'high',
    re: /\byou\s+are\s+(now\s+)?(?:an?\s+)?(DAN\b|do anything now|in\s+developer\s+mode|unrestricted\b|no\s+longer\s+bound|free\s+from\s+(your\s+)?(rules|restrictions|guidelines))/i,
  },
  {
    category: 'jailbreak-persona',
    severity: 'high',
    re: /\b(from now on|starting (now|today)|henceforth)\b[\s\S]{0,40}\byou\s+(are|will|must|should|shall)\b[\s\S]{0,50}\b(ignore|disregard|no longer|not\s+(bound|restricted|limited)|without\s+(restriction|restrictions|limitation|limitations|filter|filters))\b/i,
  },
  // Safety / guardrail bypass framing. NOTE: keep this family last — the
  // detector returns the first matching pattern, so ordering high-severity
  // patterns first guarantees a text carrying both signals reports 'high'.
  {
    category: 'guardrail-bypass',
    severity: 'medium',
    re: /\b(pretend|act\s+as\s+(if|though)|imagine|roleplay|role-play)\b[\s\S]{0,60}\b(no\s+(rules|restrictions|guidelines|filters|limits)|without\s+(restrictions|limitations|safety|guidelines)|bypass(?:ing)?\s+(safety|filters|guardrails|restrictions))\b/i,
  },
];

/**
 * Inspect a single text fragment for prompt-injection signatures.
 * Returns the first matching category (high-severity patterns are ordered
 * first, so a mixed text reports its most severe hit), or { detected: false }.
 */
export function detectPromptInjection(text: string): InjectionResult {
  if (!text) return { detected: false };
  for (const { category, severity, re } of PATTERNS) {
    if (re.test(text)) return { detected: true, category, severity };
  }
  return { detected: false };
}
