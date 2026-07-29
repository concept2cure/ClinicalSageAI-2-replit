/**
 * Claim-grounding guard — verify the high-stakes claims before they ship.
 *
 * Every pack so far makes AnA say MORE. This module makes her VERIFY what she
 * says. In a regulated tool, a confident-but-wrong factual assertion — a
 * mis-cited CFR section, an invented numeric threshold, an approval-probability
 * stated as fact, a precedent that does not transfer — is the most expensive
 * failure mode there is. It erodes the exact trust the product exists to earn.
 *
 * AnA's persona already defines the [KNOWN] / [INFERRED] / [MISSING] discipline.
 * This guard operationalizes it at the point of risk: it scans the user's
 * message (and, when supplied, AnA's own drafted answer) for the categories of
 * claim that must be grounded, and emits a focused verification directive that
 * tells AnA exactly which assertions to check against the injected evidence
 * before they reach the client.
 *
 * Claim categories detected (high-stakes, factual, falsifiable):
 *   - citation     → a specific CFR / ICH / regulation reference
 *   - numeric      → a threshold, count, percentage, timeline, dose figure
 *   - probability  → an approval-likelihood / success-odds assertion
 *   - precedent    → a "X was approved / cleared / precedent says" claim
 *   - guarantee    → an absolute assurance ("will be approved", "guaranteed")
 *   - deadline     → a regulatory clock / date assertion
 *
 * Design principle: this changes RIGOR, not content. It never fabricates and
 * never suppresses — it asks AnA to label each high-stakes claim by evidence
 * status and to flag any she cannot ground, which is precisely what a
 * reviewer-grade colleague does before signing their name to a number.
 *
 * Read by:
 *   - context-enrichment.ts (proactive — runs whenever a groundable claim
 *     category is detected; no slash command, because verification should be
 *     automatic, not summoned)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/claim-grounding
 */

export type ClaimCategory =
  | 'citation'
  | 'numeric'
  | 'probability'
  | 'precedent'
  | 'guarantee'
  | 'deadline';

export interface ClaimCheck {
  category: ClaimCategory;
  /** Short label for the directive. */
  label: string;
  /** What AnA must do for a claim of this category. */
  directive: string;
  /** Patterns that signal a claim of this category is in play. */
  triggers: RegExp[];
}

// Ordered by how damaging an ungrounded instance is, most damaging first, so
// the rendered directive leads with the riskiest category in play.
export const CLAIM_CHECKS: ClaimCheck[] = [
  {
    category: 'guarantee',
    label: 'Absolute assurance',
    directive:
      'Do not assert a guaranteed regulatory outcome. No submission is certain to be approved or cleared. Replace any absolute with a calibrated, evidence-anchored statement — what is strong, what is fragile, and what the outcome depends on.',
    triggers: [
      /\b(?:guarantee[ds]?|guaranteed)\b/i,
      /\b(?:certain|sure|definitely|will|going|guaranteed)\s+(?:to\s+)?(?:be\s+)?(?:approved|cleared|pass(?:ed)?)\b/i,
      /\b(?:no way (?:it|this|we) (?:fails?|gets? rejected)|100%\s*(?:approv|chance|sure)|slam dunk|sure thing|can.?t (?:fail|lose|miss))\b/i,
    ],
  },
  {
    category: 'citation',
    label: 'Regulatory citation',
    directive:
      'For every specific citation (a 21 CFR part/section, an ICH guideline code, an EU regulation number, a guidance title), verify it against the injected context or your established knowledge. If you are recalling it rather than reading it from provided evidence, mark it [INFERRED] and tell the user to confirm the exact section before relying on it. Never invent a section number to look precise.',
    triggers: [
      /\b21\s*cfr\s*(?:part\s*)?\d+/i,
      /\bich\s*[eqsm]\d+/i,
      /\b(?:eu|regulation)\s*\d{4}\/\d{2,4}/i,
      /\b(?:§|section)\s*\d+(?:\.\d+)*/i,
    ],
  },
  {
    category: 'probability',
    label: 'Approval-probability claim',
    directive:
      'When you state any approval likelihood or success probability, ground it: name what it is based on (precedent base rate, readiness score, specific risks) and label it [INFERRED] unless a model in your context produced it. Do not present a number you reasoned to as if it were measured.',
    triggers: [
      /\b(?:probability|likelihood|chance|odds)\s+of\s+(?:approval|success|clearance)/i,
      /\b(?:approval|success)\s+(?:probability|likelihood|rate|odds)/i,
      /\b\d{1,3}\s*%\s*(?:chance|likely|probability|odds)\b/i,
    ],
  },
  {
    category: 'precedent',
    label: 'Precedent assertion',
    directive:
      'For any claim that a specific product was approved/cleared, or that "precedent shows" X, verify the precedent actually transfers (same indication, endpoint, division, guidance era) and label it [KNOWN] only if it is in your injected context. If you are recalling a precedent from general knowledge, mark it [INFERRED] and recommend confirming it against the precedent engine.',
    triggers: [
      /\b(?:precedent\s+(?:shows|says|exists|is|suggests)|there.?s\s+precedent|was\s+approved|was\s+cleared|got\s+(?:approved|cleared)|approved\s+(?:by|under|via))\b/i,
      /\b(?:similar\s+(?:product|device|drug)s?\s+(?:were|was|have been)\s+(?:approved|cleared))\b/i,
    ],
  },
  {
    category: 'numeric',
    label: 'Numeric threshold or figure',
    directive:
      'For each load-bearing number you state (a threshold, patient count, exposure requirement, page limit, batch count, dose, percentage), verify it against the injected context or established guidance. If recalled rather than read, label it [INFERRED] and say what document confirms it. A fabricated threshold in a regulated answer is a critical defect — never round a number into existence to sound authoritative.',
    triggers: [
      /\b\d+\s*(?:patients?|subjects?|batches?|mg|mcg|µg|ml|days?|weeks?|months?|years?)\b/i,
      /\b(?:at least|no more than|minimum of|maximum of|threshold of|limit of)\s+\d+/i,
      /\b\d{2,}\s*%/,
      /\bpage\s+limit\b/i,
    ],
  },
  {
    category: 'deadline',
    label: 'Regulatory clock or date claim',
    directive:
      'For any review-clock or statutory-timeline figure (a PDUFA date, a 75-day Pre-Sub clock, a 90-day review, a 30-day IND wait), confirm the clock and any clock-stop conditions. Label it [INFERRED] if recalled, and note that clocks reset on major amendments — do not state a date as fixed when an amendment could move it.',
    triggers: [
      /\b(?:pdufa|gdufa|mdufa)\s*(?:date|goal)?/i,
      // "75-day", "30 day", "90-day review/clock/window/hold/wait" — allow a
      // noun phrase (e.g. "Pre-Sub") between "day" and the clock word.
      /\b\d+\s*[- ]?day\b[^.?!]{0,20}\b(?:review|clock|wait|hold|window|target|pre.?sub|meeting)\b/i,
      /\b\d+\s*[- ]?day\s+(?:review|clock|wait|hold|window|target)\b/i,
      /\b(?:review\s+clock|statutory\s+(?:clock|timeline)|goal\s+date)\b/i,
    ],
  },
];

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect which claim categories appear in the supplied text(s). Scans the user
 * message and, when provided, AnA's drafted answer (so the guard can run both
 * before AnA drafts and as a self-check on a draft).
 */
export function detectClaimCategories(...texts: Array<string | undefined>): ClaimCheck[] {
  const haystack = texts.filter(Boolean).join('\n');
  if (!haystack) return [];
  return CLAIM_CHECKS.filter((c) => c.triggers.some((re) => re.test(haystack)));
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Build a verification directive for the detected claim categories. Returns ''
 * when nothing groundable is present, so the caller can skip it. This shapes
 * rigor and evidence-labeling, never the substance of the answer.
 */
export function buildClaimGroundingBlock(...texts: Array<string | undefined>): string {
  const matched = detectClaimCategories(...texts);
  if (matched.length === 0) return '';

  const lines = matched.map((c) => `- **${c.label}:** ${c.directive}`);

  return (
    '\n\n## Claim-grounding check (NON-NEGOTIABLE)\n' +
    'This exchange involves high-stakes factual claims that a client could act on. Before you commit them, ground each one ' +
    'against your injected context using your [KNOWN] / [INFERRED] / [MISSING] discipline. This raises rigor, not caution: ' +
    'state what you can stand behind, label what you are inferring, and flag what you cannot ground rather than smoothing ' +
    'over it. Apply specifically to:\n\n' +
    lines.join('\n') +
    '\n\nIf a load-bearing claim cannot be grounded, say so plainly and tell the user how to confirm it. A labeled ' +
    'uncertainty is a strength here; a confident fabrication is the one failure this tool cannot afford.'
  );
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getClaimCheck(category: ClaimCategory): ClaimCheck | null {
  return CLAIM_CHECKS.find((c) => c.category === category) ?? null;
}
