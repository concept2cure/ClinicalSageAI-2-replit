/**
 * Heuristic content classifier.
 *
 * Deterministic, dependency-free baseline for PHI/PII/regulatory detection.
 * It is intentionally high-precision: each detector targets a structured
 * identifier or a strong keyword signal, so false positives on ordinary
 * regulatory prose stay low. Recall on unstructured PHI (e.g. a free-text
 * clinical narrative naming a patient) is limited — that is what the
 * SLM-backed classifier is for. This baseline is always available and is the
 * safe default the governance layer can rely on with no model dependency.
 *
 * No raw sensitive value is ever returned or logged; matches carry only a
 * redacted sample.
 *
 * @module server/services/ai-governance/classification/heuristic-classifier
 */

import {
  type ClassificationMatch,
  type ClassificationResult,
  type ContentClass,
  type ContentClassifier,
  CLASS_SEVERITY,
} from './types';

interface Detector {
  detector: string;
  class: ContentClass;
  pattern: RegExp;
  /** A further test a candidate must pass; the first candidate that passes is the match. */
  accept?: (candidate: string) => boolean;
}

/** The Luhn checksum every payment card number carries. */
function passesLuhn(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** A US phone number. Exported so a caller that masks contact details before
 *  dispatch (shadow-review-input.ts) masks exactly what this detector finds. */
export const US_PHONE_PATTERN = /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/;

// Structured PII/PHI identifiers (high precision).
const DETECTORS: Detector[] = [
  // US SSN: 123-45-6789 (avoid obviously-invalid all-zero groups).
  { detector: 'ssn', class: 'pii', pattern: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/ },
  // Email address.
  { detector: 'email', class: 'pii', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  // A payment card number as one is written: 13–16 digits run together, or four
  // groups of four, and only one that passes the Luhn check. Until 2026-10-25 any
  // 13–16 digits with spaces between them matched, so a row of a numeric table
  // ("12 34 56 78 90 11 12 13") read as a card number and classified the whole
  // document as PII.
  {
    detector: 'credit_card',
    class: 'pii',
    pattern: /\b(?:\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,4}|\d{13,16})\b/,
    accept: passesLuhn,
  },
  // US phone number.
  { detector: 'phone', class: 'pii', pattern: US_PHONE_PATTERN },
  // Medical record number — labeled.
  { detector: 'mrn', class: 'phi', pattern: /\b(?:MRN|medical\s+record\s+(?:no|number|#))\b[:\s#]*[A-Z0-9-]{4,}/i },
  // Date of birth — labeled.
  { detector: 'dob', class: 'phi', pattern: /\b(?:DOB|date\s+of\s+birth)\b[:\s]*\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/i },
  // Health-plan / beneficiary id — labeled.
  { detector: 'health_plan_id', class: 'phi', pattern: /\b(?:member|beneficiary|policy|health\s*plan)\s*(?:id|no|number|#)\b[:\s#]*[A-Z0-9-]{5,}/i },
];

// Regulatory-context keyword signals (lower weight; presence-only).
const REGULATORY_KEYWORDS =
  /\b(IND|NDA|BLA|ANDA|510\(?k\)?|PMA|De\s?Novo|eCTD|21\s*CFR\s*Part\s*11|ICH\s*[EQMS]\d|GxP|GMP|GCP|clinical\s+study\s+report|investigator['’]s?\s+brochure)\b/i;

/**
 * The first candidate a detector finds that also passes its `accept` test, if it
 * has one. `input` is read as a string whatever a caller passed: `exec` coerces,
 * and a malformed content block (an object where text was expected) must still
 * be classified, never throw (ledger-provenance.test.ts).
 */
function firstMatch(d: Detector, input: string): string | null {
  if (!d.accept) return d.pattern.exec(input)?.[0] || null;
  const all = new RegExp(d.pattern.source, d.pattern.flags.includes('g') ? d.pattern.flags : `${d.pattern.flags}g`);
  for (const m of String(input).matchAll(all)) {
    if (m[0] && d.accept(m[0])) return m[0];
  }
  return null;
}

function redact(sample: string): string {
  // Keep a short, non-recoverable hint: first 2 chars + length bucket.
  const head = sample.replace(/\s+/g, ' ').trim().slice(0, 2);
  return `${head}…(${sample.length} chars)`;
}

export class HeuristicContentClassifier implements ContentClassifier {
  readonly method = 'heuristic' as const;

  async classify(text: string): Promise<ClassificationResult> {
    const matches: ClassificationMatch[] = [];
    const input = text || '';

    for (const d of DETECTORS) {
      const m = firstMatch(d, input);
      if (m) {
        matches.push({
          class: d.class,
          detector: d.detector,
          redactedSample: redact(m),
        });
      }
    }

    if (REGULATORY_KEYWORDS.test(input)) {
      const m = REGULATORY_KEYWORDS.exec(input);
      matches.push({
        class: 'regulatory',
        detector: 'regulatory_keyword',
        redactedSample: redact(m?.[0] || 'regulatory'),
      });
    }

    const classSet = new Set<ContentClass>(matches.map(m => m.class));
    const phi = classSet.has('phi');
    const pii = classSet.has('pii');
    const regulatory = classSet.has('regulatory');

    const classes: ContentClass[] = (phi || pii || regulatory)
      ? [...classSet].sort((a, b) => CLASS_SEVERITY[b] - CLASS_SEVERITY[a])
      : ['public'];

    // Structured-identifier hits are high confidence; keyword-only is moderate.
    const hasStructured = matches.some(m => m.class === 'phi' || m.class === 'pii');
    const confidence = hasStructured ? 0.9 : matches.length > 0 ? 0.6 : 0.5;

    return { classes, phi, pii, regulatory, matches, confidence, method: 'heuristic' };
  }
}
