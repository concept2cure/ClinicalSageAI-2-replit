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
 * This is a heuristic layer, not a guarantee. A model-based guardrail remains a
 * future option; see QC_SECURITY_REVIEW. Patterns use bounded gaps ({0,N}) so
 * there is no catastrophic backtracking (ReDoS).
 */

export interface InjectionResult {
  detected: boolean;
  category?: string;
}

const PATTERNS: ReadonlyArray<{ category: string; re: RegExp }> = [
  // Override / disregard the model's existing instructions, rules or context.
  {
    category: 'instruction-override',
    re: /\b(ignore|disregard|forget|override)\b[\s\S]{0,40}\b(all|any|the)?\s*(previous|prior|above|earlier|preceding|foregoing|system|developer|original)\b[\s\S]{0,25}\b(instruction|instructions|prompt|prompts|rule|rules|directive|directives|guideline|guidelines|constraint|constraints)\b/i,
  },
  // Override directive explicitly addressed to the system role.
  {
    category: 'instruction-override',
    re: /\bsystem\s*[:>]\s*(override|bypass|ignore|disregard|new\s+(instruction|instructions|prompt))/i,
  },
  // System-prompt / instruction exfiltration.
  {
    category: 'system-prompt-exfiltration',
    re: /\b(reveal|show|print|repeat|output|display|expose|leak|give me|tell me|what(?:'s| is| are))\b[\s\S]{0,40}\b(your|the|these|this)\b[\s\S]{0,25}\b(system\s*(prompt|message|instructions?)|initial\s*(prompt|instructions)|original\s*(prompt|instructions)|hidden\s*(prompt|instructions)|prompt\s*above)\b/i,
  },
  // Persona / jailbreak reassignment.
  {
    category: 'jailbreak-persona',
    re: /\byou\s+are\s+(now\s+)?(?:an?\s+)?(DAN\b|do anything now|in\s+developer\s+mode|unrestricted\b|no\s+longer\s+bound|free\s+from\s+(your\s+)?(rules|restrictions|guidelines))/i,
  },
  {
    category: 'jailbreak-persona',
    re: /\b(from now on|starting (now|today)|henceforth)\b[\s\S]{0,40}\byou\s+(are|will|must|should|shall)\b[\s\S]{0,50}\b(ignore|disregard|no longer|not\s+(bound|restricted|limited)|without\s+(restriction|restrictions|limitation|limitations|filter|filters))\b/i,
  },
  // Safety / guardrail bypass framing.
  {
    category: 'guardrail-bypass',
    re: /\b(pretend|act\s+as\s+(if|though)|imagine|roleplay|role-play)\b[\s\S]{0,60}\b(no\s+(rules|restrictions|guidelines|filters|limits)|without\s+(restrictions|limitations|safety|guidelines)|bypass(?:ing)?\s+(safety|filters|guardrails|restrictions))\b/i,
  },
];

/**
 * Inspect a single text fragment for prompt-injection signatures.
 * Returns the first matching category, or { detected: false }.
 */
export function detectPromptInjection(text: string): InjectionResult {
  if (!text) return { detected: false };
  for (const { category, re } of PATTERNS) {
    if (re.test(text)) return { detected: true, category };
  }
  return { detected: false };
}
