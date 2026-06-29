/**
 * Translation QA — SEMANTIC checks.
 *
 * Two deterministic, LLM-free checks that surface meaning-level translation
 * problems before a human reviewer adjudicates:
 *
 *  - glossaryAdherenceCheck — when the source contains a glossary-locked term
 *    (a non-DNT term with a mandated target rendering), the target should carry
 *    that mandated rendering. Absence is terminology drift → 'warning'. (DNT
 *    identifier preservation is the structural layer's job, not this one.)
 *
 *  - backTranslationDivergenceCheck — when an upstream back-translation exists,
 *    compute a deterministic lexical overlap (Jaccard over normalized tokens)
 *    between the original source and the back-translated text. Low overlap means
 *    the round-trip meaning may have drifted → 'warning', with the score in the
 *    message. Deterministic by construction (no clock, no engine call) — it only
 *    reads BackTranslationResult.backText that the upstream round-trip produced.
 *
 * Both conform to the QaCheck contract (pure: input → findings, never throws for
 * ordinary "no problem", never mutates input). See ./types for the contract.
 *
 * @module server/services/translation/qa/semantic-checks
 */

import type { GlossaryTerm } from '../types';
import type { QaCheck, QaCheckInput, QaFinding } from './types';

/** Below this source↔back-translation overlap, flag possible meaning drift. */
export const BACK_TRANSLATION_OVERLAP_THRESHOLD = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized token set for lexical overlap. Lowercases, strips punctuation to
 * spaces, and keeps tokens of length >= 2 so single-letter noise doesn't inflate
 * or deflate the score. Deterministic and allocation-light.
 */
function tokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

/** Jaccard similarity of two token sets: |A∩B| / |A∪B|, in [0,1]. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/** A glossary term is "locked" when it mandates a target rendering (non-DNT). */
function isLockedTerm(term: GlossaryTerm): term is GlossaryTerm & { targetTerm: string } {
  return !term.doNotTranslate && typeof term.targetTerm === 'string' && term.targetTerm.trim().length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Terminology adherence: for every locked glossary term whose source rendering
 * appears in the source text, the mandated target rendering must appear in the
 * target text. A miss is 'warning' (drift) — the reviewer decides, QA flags.
 * Source match is case-insensitive substring (regulatory terms are often
 * multi-word); target match is a plain substring (Japanese has no word spaces).
 */
export const glossaryAdherenceCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const glossary = input.glossary;
  if (!glossary || glossary.length === 0) return [];

  const sourceLower = input.source.toLowerCase();
  const findings: QaFinding[] = [];

  for (const term of glossary) {
    if (!isLockedTerm(term)) continue;
    const src = term.sourceTerm.trim();
    if (src.length === 0) continue;
    if (!sourceLower.includes(src.toLowerCase())) continue; // term not in this segment
    if (input.target.includes(term.targetTerm)) continue; // mandated rendering present
    findings.push({
      checkId: 'glossary-term-adherence',
      severity: 'warning',
      message:
        `Glossary term "${src}" is present in the source but its mandated target ` +
        `rendering "${term.targetTerm}" was not found in the target (possible terminology drift).`,
      sourceExcerpt: src,
    });
  }

  return findings;
};

/**
 * Back-translation divergence: deterministic lexical overlap between the source
 * and the back-translation. Below BACK_TRANSLATION_OVERLAP_THRESHOLD → 'warning'
 * (the round-trip meaning may have drifted), with the score in the message. No
 * finding when no back-translation has been produced yet.
 */
export const backTranslationDivergenceCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const bt = input.backTranslation;
  if (!bt || typeof bt.backText !== 'string' || bt.backText.trim().length === 0) return [];

  const overlap = jaccard(tokenSet(input.source), tokenSet(bt.backText));
  if (overlap >= BACK_TRANSLATION_OVERLAP_THRESHOLD) return [];

  const pct = Math.round(overlap * 100);
  return [
    {
      checkId: 'back-translation-drift',
      severity: 'warning',
      message:
        `Back-translation overlap with the source is low (${pct}%, threshold ` +
        `${Math.round(BACK_TRANSLATION_OVERLAP_THRESHOLD * 100)}%); the round-trip ` +
        `meaning may have drifted — verify the target conveys the source intent.`,
      sourceExcerpt: input.source.slice(0, 120),
      targetExcerpt: bt.backText.slice(0, 120),
    },
  ];
};

/** All semantic checks, in registration order. */
export const SEMANTIC_CHECKS: readonly QaCheck[] = [
  glossaryAdherenceCheck,
  backTranslationDivergenceCheck,
];
