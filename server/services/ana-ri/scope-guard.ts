/**
 * Scope-and-escalation guard — know the limits, hand off the rest.
 *
 * The claim-grounding guard makes AnA verify what she asserts. This guard makes
 * her recognize when a request crosses out of what an AI assistant should
 * decide on its own and into territory that requires a qualified human:
 *
 *   - regulatory_determination → a binding "is this approvable / compliant /
 *     acceptable to the agency" verdict that only the sponsor's RA function and
 *     ultimately the agency can make
 *   - legal_advice → contract, patent, liability, or law interpretation
 *   - medical_advice → patient-specific clinical or treatment guidance
 *   - business_decision → a go/no-go, investment, pricing, or staffing call
 *     that is the client's to own
 *   - human_subjects → IRB/ethics determinations and informed-consent adequacy
 *   - data_integrity → a request to fabricate, back-date, or alter regulated
 *     records (this one is refused, not merely escalated)
 *
 * AnA's persona already says high-impact outputs require qualified human review.
 * This operationalizes it: it detects the category in play and emits a calm,
 * specific hand-off directive so AnA stays maximally useful (does the analysis,
 * frames the options, surfaces the considerations) while being explicit about
 * the decision or determination she cannot make for the client.
 *
 * Design principle: this shapes RESPONSIBILITY, not helpfulness. It is not a
 * refusal reflex — for everything except a data-integrity violation it tells
 * AnA to do all the legitimate work and then name the boundary, never to
 * stonewall. It is the difference between a trusted advisor and an overreaching
 * one.
 *
 * Read by:
 *   - context-enrichment.ts (proactive — runs whenever a scope-sensitive
 *     request is detected; no slash command, because knowing your limits should
 *     be automatic, not summoned)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/scope-guard
 */

export type ScopeCategory =
  | 'regulatory_determination'
  | 'legal_advice'
  | 'medical_advice'
  | 'business_decision'
  | 'human_subjects'
  | 'data_integrity';

export interface ScopeCheck {
  category: ScopeCategory;
  /** Short label for the directive. */
  label: string;
  /**
   * 'handoff' = do the work, then name the boundary and who owns the call.
   * 'refuse'  = decline the action itself, explain why, offer the legitimate
   *             alternative.
   */
  mode: 'handoff' | 'refuse';
  /** What AnA must do for a request of this category. */
  directive: string;
  /** Patterns that signal a request of this category is in play. */
  triggers: RegExp[];
}

// Ordered most-serious first, so the rendered directive leads with the highest
// responsibility boundary in play (a data-integrity ask dominates everything).
export const SCOPE_CHECKS: ScopeCheck[] = [
  {
    category: 'data_integrity',
    label: 'Regulated-record integrity',
    mode: 'refuse',
    directive:
      'Decline any request to fabricate, back-date, alter, or selectively omit data from a regulated record, audit trail, or submission. State plainly that you cannot do this and why (it breaches data integrity and 21 CFR Part 11). Then offer the legitimate path — a documented correction, a deviation report, an amendment with reason-for-change — so the user gets a real way forward, not just a refusal.',
    triggers: [
      /\b(?:back.?date|backdate|predate|alter|falsif(?:y|ied)|fabricat|make up|invent)\b[^.?!]{0,30}\b(?:data|record|result|audit|signature|date|entry|log)/i,
      /\b(?:change|edit|fix|adjust)\b[^.?!]{0,20}\b(?:the )?(?:audit trail|timestamp|signed (?:record|date)|locked record)/i,
      /\b(?:hide|omit|remove|delete|leave out)\b[^.?!]{0,25}\b(?:the )?(?:adverse event|sae|deviation|failing result|negative (?:data|result)|unfavorable)/i,
      /\bmake (?:it|the data) (?:look|say)\b/i,
    ],
  },
  {
    category: 'medical_advice',
    label: 'Patient-specific medical guidance',
    mode: 'handoff',
    directive:
      'You can discuss clinical evidence, endpoints, safety profiles, and labeling in the regulatory context. You cannot give patient-specific medical or treatment advice. If the request is about how to treat or dose an individual patient, say that is a decision for a qualified clinician with the full clinical picture, and redirect to what you can help with — the evidence and labeling framing.',
    triggers: [
      /\b(?:should (?:this|my|the) patient|how (?:should|do) (?:i|we) (?:treat|dose|manage)|what (?:treatment|dose|drug) (?:should|for))\b/i,
      /\b(?:my|a) patient\b[^.?!]{0,30}\b(?:should (?:i|we|they)|take|switch|stop|dose)/i,
      /\b(?:diagnos|prescrib|contraindicat)[a-z]*\b[^.?!]{0,25}\b(?:for (?:my|this|a) patient|this individual)/i,
    ],
  },
  {
    category: 'legal_advice',
    label: 'Legal interpretation',
    mode: 'handoff',
    directive:
      'You can explain regulations, guidance, and procedural requirements. You cannot give legal advice — contract terms, patent strategy, liability exposure, or how a law would be interpreted in a dispute. Do the regulatory framing you can, then name where qualified legal counsel is required and why, so the user knows exactly what to take to their attorney.',
    triggers: [
      /\b(?:is (?:this|it) legal|are we liable|liability|sue|lawsuit|breach of contract|contract terms|patent (?:infringe|strategy|claim)|intellectual property dispute|indemnif)/i,
      /\b(?:legally (?:binding|required|enforceable)|hold up in court|legal (?:advice|opinion|risk))\b/i,
    ],
  },
  {
    category: 'human_subjects',
    label: 'Human-subjects / ethics determination',
    mode: 'handoff',
    directive:
      'You can advise on GCP, protocol design, and informed-consent content against ICH E6 and 21 CFR 50/56. You cannot make the IRB/IEC determination or judge whether consent is ethically adequate for a specific study population — that is the IRB/ethics committee\'s role. Frame the requirements and the common deficiencies, then point to the IRB as the body that makes the call.',
    triggers: [
      /\b(?:irb|iec|ethics committee)\b[^.?!]{0,25}\b(?:approv|determination|waiver|decide)/i,
      /\b(?:is (?:this|our) (?:consent|protocol) ethical|waive (?:informed )?consent|is consent (?:adequate|sufficient|enough))\b/i,
    ],
  },
  {
    category: 'regulatory_determination',
    label: 'Binding regulatory determination',
    mode: 'handoff',
    directive:
      'You can assess readiness, predict likely reviewer questions, and rate defensibility with your evidence labels. You cannot issue a binding determination that a submission IS approvable, compliant, or acceptable to the agency — only the sponsor\'s RA function (and ultimately the agency) can. When asked for a definitive verdict, give your evidence-graded assessment, state clearly that it is an assessment and not a determination, and recommend qualified RA sign-off before the client relies on it.',
    triggers: [
      /\b(?:is (?:this|it|our|my)|are we|will (?:this|it|we))\b[^.?!]{0,30}\b(?:approvable|compliant|going to (?:be )?approved|acceptable to (?:the )?(?:fda|ema|agency)|pass (?:the )?(?:review|inspection|audit))/i,
      /\b(?:confirm|certify|guarantee|sign off (?:that|on))\b[^.?!]{0,30}\b(?:compliant|this (?:is|meets)|approv)/i,
      /\b(?:are we|we are)\b[^.?!]{0,20}\b(?:ready|good)\b[^.?!]{0,15}\b(?:to )?(?:file|submit|ship)/i,
    ],
  },
  {
    category: 'business_decision',
    label: 'Business decision the client owns',
    mode: 'handoff',
    directive:
      'You can lay out the trade-off, the regulatory consequences of each path, and what tilts the decision. You cannot make the go/no-go, investment, pricing, or resourcing call for the client — that is theirs, weighing factors beyond the regulatory picture. Frame the decision cleanly, recommend if you have a regulatory basis, and leave the choice with them.',
    triggers: [
      /\b(?:should we (?:fund|invest in|kill|stop|in.?licen|acquire|partner|hire|lay off|price)|what (?:should we|do we) (?:charge|price|pay))\b/i,
      /\b(?:go.?no.?go|make the (?:call|decision) for (?:us|me)|just (?:tell|decide for) (?:us|me) (?:what to do|whether))\b/i,
    ],
  },
];

// ─── Detection ───────────────────────────────────────────────────────────────

/** Detect which scope categories the message crosses into. */
export function detectScopeCategories(message: string): ScopeCheck[] {
  if (!message) return [];
  return SCOPE_CHECKS.filter((c) => c.triggers.some((re) => re.test(message)));
}

/** True when any detected category requires refusal (data integrity). */
export function requiresRefusal(message: string): boolean {
  return detectScopeCategories(message).some((c) => c.mode === 'refuse');
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Build a scope/escalation directive for the detected categories. Returns ''
 * when the request is fully within scope. Shapes responsibility, not
 * helpfulness: for hand-off categories it instructs AnA to do all the
 * legitimate work and then name the boundary, never to stonewall.
 */
export function buildScopeGuardBlock(message: string): string {
  const matched = detectScopeCategories(message);
  if (matched.length === 0) return '';

  const hasRefusal = matched.some((c) => c.mode === 'refuse');
  const lines = matched.map((c) => {
    const tag = c.mode === 'refuse' ? '[DECLINE]' : '[HAND OFF]';
    return `- **${c.label}** ${tag}: ${c.directive}`;
  });

  const header = hasRefusal
    ? '## Scope and integrity boundary (NON-NEGOTIABLE)'
    : '## Scope and escalation boundary (NON-NEGOTIABLE)';

  const framing = hasRefusal
    ? 'This request reaches a boundary you must hold. Decline the part you cannot do, explain why plainly and without lecturing, and offer the legitimate path so the user still moves forward.'
    : 'This request reaches the edge of what you should decide on your own. Stay maximally useful — do the analysis, frame the options, surface the considerations — then be explicit about the determination or decision that belongs to a qualified human, and who that is. Naming the boundary is a mark of a trusted advisor, not a limitation.';

  return (
    '\n\n' + header + '\n' + framing + ' Apply specifically to:\n\n' + lines.join('\n')
  );
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getScopeCheck(category: ScopeCategory): ScopeCheck | null {
  return SCOPE_CHECKS.find((c) => c.category === category) ?? null;
}
