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
}

// Structured PII/PHI identifiers (high precision).
const DETECTORS: Detector[] = [
  // US SSN: 123-45-6789 (avoid obviously-invalid all-zero groups).
  { detector: 'ssn', class: 'pii', pattern: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/ },
  // Email address.
  { detector: 'email', class: 'pii', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  // Credit-card-like 16-digit groups.
  { detector: 'credit_card', class: 'pii', pattern: /\b(?:\d[ -]*?){13,16}\b(?=\D|$)/ },
  // US phone number.
  { detector: 'phone', class: 'pii', pattern: /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/ },
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
      const m = d.pattern.exec(input);
      if (m && m[0]) {
        matches.push({
          class: d.class,
          detector: d.detector,
          redactedSample: redact(m[0]),
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
