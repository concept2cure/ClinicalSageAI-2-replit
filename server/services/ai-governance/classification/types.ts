/**
 * Content classification — types.
 *
 * The governance contract (GOVERNANCE_BINDING_CONTRACT.md) flags a missing
 * PHI/PII/Regulatory classification model: governed actions need to know
 * whether the content they touch carries protected data before deciding how it
 * may be processed (which substrate, whether redaction is required, what
 * retention applies). This module defines that classifier seam.
 *
 * Two implementations back the same interface:
 *   - HeuristicContentClassifier — deterministic, dependency-free regex/keyword
 *     baseline. Always available; the safe default. High precision on
 *     structured identifiers (SSN, MRN, email), lower recall on free text.
 *   - SlmContentClassifier — routes to a small fine-tuned classification model
 *     (served on the local/self-hosted lane) for higher recall. Falls back to
 *     the heuristic until a model is wired.
 *
 * @module server/services/ai-governance/classification/types
 */

/** Sensitivity classes a span of content can carry. */
export type ContentClass =
  | 'phi' // Protected Health Information (HIPAA)
  | 'pii' // Personally Identifiable Information (GDPR/CCPA)
  | 'regulatory' // Regulated submission content (subject to GxP / Part 11 controls)
  | 'public'; // No detected sensitivity

export interface ClassificationMatch {
  /** Which class this match contributes to. */
  class: ContentClass;
  /** A short label for the detector that fired (e.g. 'ssn', 'email', 'mrn'). */
  detector: string;
  /** Redacted excerpt for audit (never the raw value). */
  redactedSample: string;
}

export interface ClassificationResult {
  /** Distinct classes detected, most-sensitive first. */
  classes: ContentClass[];
  phi: boolean;
  pii: boolean;
  regulatory: boolean;
  /** Individual detector hits (no raw sensitive values retained). */
  matches: ClassificationMatch[];
  /** 0..1 confidence in the overall classification. */
  confidence: number;
  /** Which implementation produced this result. */
  method: 'heuristic' | 'slm';
}

export interface ContentClassifier {
  readonly method: 'heuristic' | 'slm';
  classify(text: string): Promise<ClassificationResult>;
}

/** Highest-sensitivity-first ordering used when summarizing classes. */
export const CLASS_SEVERITY: Record<ContentClass, number> = {
  phi: 3,
  pii: 2,
  regulatory: 1,
  public: 0,
};
