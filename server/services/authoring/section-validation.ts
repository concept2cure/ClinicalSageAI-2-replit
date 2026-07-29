/**
 * Draft section validation — apply AnA's own evidence-discipline check to a
 * user's DRAFT section text, not just to AnA's responses.
 *
 * AnA already validates the grounding of its own output (validateEvidence →
 * EvidenceVerdict, surfaced as the trust summary). Authors had no way to run the
 * same check on text they are writing. This exposes it as a pure, stateless
 * snapshot a UI can call on a debounce for live "is this defensible?" feedback.
 *
 * Pure / deterministic — analyzes only the supplied text; no DB, no tenant data.
 */

import { validateEvidence } from '../ana-ri/evidence-validation.js';
import { buildTrustSummary, type EvidenceVerdict } from '../ana-ri/response-contract.js';

export interface DraftValidationSnapshot {
  /** Whether the draft passes evidence discipline (no overclaims/contradictions, grounded). */
  compliant: boolean;
  /** Human-readable one-line reliability read (same contract as AnA's trust strip). */
  trustSummary: string;
  /** The full evidence verdict (grounded / inferred / missing counts, flagged claims). */
  verdict: EvidenceVerdict;
}

/**
 * Validate a draft section's text. Returns a benign "nothing to validate"
 * snapshot for empty input so a UI can call it freely while the author types.
 */
export function validateDraftSection(text: string): DraftValidationSnapshot {
  const verdict = validateEvidence(typeof text === 'string' ? text : '', 'ana-ri');
  return {
    compliant: verdict.validated,
    trustSummary: buildTrustSummary(verdict),
    verdict,
  };
}
