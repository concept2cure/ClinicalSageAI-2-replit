/**
 * AnA RI — Evidence Validation Service
 *
 * Semantic evidence validation that goes beyond the regex-based format checks in
 * enforcement.ts. This service answers: "Are the claims in this response actually
 * grounded by evidence, or is the model confabulating?"
 *
 * Moved from cortex-ft (PR #310's wrong home) into the canonical AnA RI path
 * so that every response — chat, stream, and fallback — gets validated.
 *
 * Validation layers:
 * 1. Label extraction — find all [KNOWN], [INFERRED], [MISSING] labels
 * 2. Claim extraction — find substantive claims (sentences with regulatory weight)
 * 3. Grounding check — for each claim, is there a nearby evidence label?
 * 4. Overclaim detection — strong language without KNOWN backing
 * 5. Contradiction detection — conflicting claims within the same response
 * 6. Verdict assembly — build EvidenceVerdict with counts and risk summary
 *
 * @module server/services/ana-ri/evidence-validation
 */

import type { EvidenceVerdict } from './response-contract.js';

// ── Configuration ─────────────────────────────────────────────────────────────

/** Minimum response length to trigger full validation (short responses get a pass) */
const MIN_VALIDATION_LENGTH = 200;

/** Proximity window: how many characters around a claim to search for evidence labels */
const EVIDENCE_PROXIMITY_CHARS = 500;

/** Patterns that indicate a substantive regulatory claim */
const CLAIM_PATTERNS = [
  // Requirement/obligation claims
  /(?:is required|must include|shall contain|should provide|needs to|has to|required by|mandated by|obligat)/i,
  // Risk/deficiency claims
  /(?:poses? (?:a )?(?:significant |moderate |high |critical )?risk|deficien|inadequate|insufficient|missing.*data)/i,
  // Factual regulatory assertions
  /(?:FDA requires?|EMA mandates?|ICH [A-Z]\d+ (?:states?|requires?))/i,
  /(?:per (?:21 CFR|EU MDR|IVDR)|according to)/i,
  // Quantitative claims
  /(?:\d+%|\d+ (?:patients?|subjects?))/i,
  /(?:\d+ (?:studies|trials?))/i,
  // Conclusive language
  /(?:demonstrates?|proves?|confirms?|establishes?|clearly shows?|evidence supports?|data confirms?)/i,
];

/** Strong language that requires [KNOWN] backing to be justified */
const OVERCLAIM_PATTERNS = [
  /(?:definitive|unequivocal|certain|absolute|irrefutable|conclusive|comprehensive) (?:evidence|data|proof|support)/i,
  /(?:has been|is) (?:fully|completely|thoroughly) (?:demonstrated|established|proven|validated)/i,
  /(?:there is no|zero) (?:risk|concern|deficiency|gap|issue)/i,
  /(?:guarantees?|ensures?|eliminates? (?:all|any|every) (?:risk|concern))/i,
];

/** Contradiction signal pairs — if both match in the same response, flag it */
const CONTRADICTION_PAIRS: Array<[RegExp, RegExp, string]> = [
  [
    /(?:no (?:significant )?risk|risk is (?:low|minimal|negligible))/i,
    /(?:significant risk|high risk|critical risk|poses? (?:a )?major risk)/i,
    'Conflicting risk assessment: claims both low and high risk',
  ],
  [
    /(?:data is (?:sufficient|adequate|complete))/i,
    /(?:data (?:gap|is (?:insufficient|inadequate|incomplete|missing)))/i,
    'Conflicting data sufficiency: claims both sufficient and insufficient',
  ],
  [
    /(?:meets? (?:all )?(?:requirements?|standards?|criteria))/i,
    /(?:does not meet|fails? to meet|non-compliant)/i,
    'Conflicting compliance assessment: claims both compliant and non-compliant',
  ],
  [
    /(?:no (?:additional )?(?:studies|data|evidence) (?:are |is )?(?:needed|required))/i,
    /(?:additional (?:studies|data|evidence) (?:are |is )?(?:needed|required|recommended))/i,
    'Conflicting evidence needs: claims both no additional data needed and additional data needed',
  ],
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractedLabel {
  type: 'KNOWN' | 'INFERRED' | 'MISSING';
  text: string;
  position: number;
}

interface ExtractedClaim {
  text: string;
  position: number;
  pattern: string;
  nearestLabel: ExtractedLabel | null;
  grounded: boolean;
}

interface ContradictionResult {
  found: boolean;
  contradictions: string[];
}

// ── Core Functions ────────────────────────────────────────────────────────────

/**
 * Extract all evidence labels from a response.
 */
function extractLabels(response: string): ExtractedLabel[] {
  const labels: ExtractedLabel[] = [];
  const pattern = /\[(KNOWN|INFERRED|MISSING)[^\]]*\]/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(response)) !== null) {
    labels.push({
      type: match[1].toUpperCase() as ExtractedLabel['type'],
      text: match[0],
      position: match.index,
    });
  }

  return labels;
}

/**
 * Extract substantive claims from a response.
 * A "claim" is a sentence or clause that makes a regulatory assertion.
 */
function extractClaims(
  response: string
): Array<{ text: string; position: number; pattern: string }> {
  const claims: Array<{ text: string; position: number; pattern: string }> = [];
  const seen = new Set<number>(); // dedupe by position

  for (const claimPattern of CLAIM_PATTERNS) {
    let match: RegExpExecArray | null;
    const globalPattern = new RegExp(claimPattern.source, 'gi');

    while ((match = globalPattern.exec(response)) !== null) {
      // Get the sentence containing this match
      const sentenceStart = Math.max(0, response.lastIndexOf('.', match.index) + 1);
      const sentenceEnd = response.indexOf('.', match.index + match[0].length);
      const end =
        sentenceEnd === -1 ? Math.min(response.length, match.index + 200) : sentenceEnd + 1;

      // Dedupe overlapping claims
      if (seen.has(sentenceStart)) continue;
      seen.add(sentenceStart);

      claims.push({
        text: response.slice(sentenceStart, end).trim(),
        position: match.index,
        pattern: claimPattern.source.slice(0, 40),
      });
    }
  }

  return claims;
}

/**
 * Check if a claim position has a nearby evidence label.
 */
function findNearestLabel(position: number, labels: ExtractedLabel[]): ExtractedLabel | null {
  let nearest: ExtractedLabel | null = null;
  let minDistance = Infinity;

  for (const label of labels) {
    const distance = Math.abs(label.position - position);
    if (distance < minDistance && distance <= EVIDENCE_PROXIMITY_CHARS) {
      minDistance = distance;
      nearest = label;
    }
  }

  return nearest;
}

/**
 * Detect overclaims — strong absolute language without [KNOWN] backing.
 */
function detectOverclaims(response: string, labels: ExtractedLabel[]): string[] {
  const overclaims: string[] = [];

  for (const pattern of OVERCLAIM_PATTERNS) {
    let match: RegExpExecArray | null;
    const globalPattern = new RegExp(pattern.source, 'gi');

    while ((match = globalPattern.exec(response)) !== null) {
      const nearest = findNearestLabel(match.index, labels);
      if (nearest?.type !== 'KNOWN') {
        const start = Math.max(0, match.index - 30);
        const end = Math.min(response.length, match.index + match[0].length + 30);
        const context = response.slice(start, end).trim();
        overclaims.push(context);
      }
    }
  }

  return overclaims;
}

/**
 * Detect contradictions — conflicting claims within the same response.
 */
function detectContradictions(response: string): ContradictionResult {
  const contradictions: string[] = [];

  for (const [pattern1, pattern2, description] of CONTRADICTION_PAIRS) {
    if (pattern1.test(response) && pattern2.test(response)) {
      contradictions.push(description);
    }
  }

  return {
    found: contradictions.length > 0,
    contradictions,
  };
}

/**
 * Build a reviewer risk summary from validation results.
 */
function buildRiskSummary(params: {
  ungroundedCount: number;
  overclaims: string[];
  contradictions: string[];
  totalClaims: number;
  totalLabels: number;
}): string {
  const parts: string[] = [];

  if (params.totalClaims === 0) {
    return 'No substantive regulatory claims detected.';
  }

  if (params.ungroundedCount > 0) {
    const pct = Math.round((params.ungroundedCount / params.totalClaims) * 100);
    parts.push(
      `${params.ungroundedCount}/${params.totalClaims} claims (${pct}%) lack nearby evidence labels`
    );
  }

  if (params.overclaims.length > 0) {
    parts.push(
      `${params.overclaims.length} overclaim(s) using strong language without [KNOWN] backing`
    );
  }

  if (params.contradictions.length > 0) {
    parts.push(`${params.contradictions.length} internal contradiction(s) detected`);
  }

  if (parts.length === 0) {
    if (params.totalLabels === 0) {
      return 'Response lacks evidence discipline labels. Claims may be ungrounded.';
    }
    return 'All claims appear adequately grounded by evidence labels.';
  }

  return parts.join('; ') + '.';
}

// ── Main Validation Entry Point ───────────────────────────────────────────────

/**
 * Validate evidence discipline in an AnA response.
 *
 * This is the canonical evidence validation function. Call it from both
 * /chat and /stream paths after response generation.
 *
 * @param response - The full assistant response text
 * @param provider - Which evidence provider was used ('ana-ri', 'enterprise-bridge', 'fallback')
 * @returns EvidenceVerdict with full grounding analysis
 */
export function validateEvidence(
  response: string,
  provider: EvidenceVerdict['provider'] = 'ana-ri'
): EvidenceVerdict {
  // Short responses get a quick pass — no claims to validate
  if (response.length < MIN_VALIDATION_LENGTH) {
    return {
      attempted: true,
      validated: true,
      source_count: 0,
      source_types: [],
      grounded_claim_count: 0,
      weak_or_ungrounded_claim_count: 0,
      missing_support_count: 0,
      provider,
    };
  }

  // Step 1: Extract labels
  const labels = extractLabels(response);

  // Step 2: Extract claims
  const rawClaims = extractClaims(response);

  // Step 3: Ground each claim against nearest label
  const claims: ExtractedClaim[] = rawClaims.map(claim => {
    const nearestLabel = findNearestLabel(claim.position, labels);
    return {
      ...claim,
      nearestLabel,
      grounded: nearestLabel !== null,
    };
  });

  const groundedCount = claims.filter(c => c.grounded).length;
  const ungroundedCount = claims.filter(c => !c.grounded).length;

  // Step 4: Detect overclaims
  const overclaims = detectOverclaims(response, labels);

  // Step 5: Detect contradictions
  const contradictionResult = detectContradictions(response);

  // Step 6: Determine source types from labels
  const sourceTypes = new Set<string>();
  for (const label of labels) {
    if (label.type === 'KNOWN') sourceTypes.add('regulatory_reference');
    if (label.type === 'INFERRED') sourceTypes.add('analytical_inference');
    if (label.type === 'MISSING') sourceTypes.add('identified_gap');
  }

  // Step 7: Build verdict
  const totalIssues =
    ungroundedCount + overclaims.length + contradictionResult.contradictions.length;
  const validated =
    totalIssues === 0 || (claims.length > 0 && ungroundedCount / claims.length < 0.3);

  return {
    attempted: true,
    validated,
    source_count: labels.length,
    source_types: Array.from(sourceTypes),
    grounded_claim_count: groundedCount,
    weak_or_ungrounded_claim_count: ungroundedCount + overclaims.length,
    missing_support_count: claims.filter(c => !c.grounded && c.pattern.includes('missing')).length,
    provider,
    reviewer_risk_summary: buildRiskSummary({
      ungroundedCount,
      overclaims,
      contradictions: contradictionResult.contradictions,
      totalClaims: claims.length,
      totalLabels: labels.length,
    }),
  };
}

/**
 * Quick evidence check for streaming — lighter weight, runs during response assembly.
 * Returns true if the response so far seems evidence-grounded.
 */
export function quickEvidenceCheck(partialResponse: string): {
  hasLabels: boolean;
  labelCount: number;
  hasSubstantiveClaims: boolean;
  needsAttention: boolean;
} {
  const labels = extractLabels(partialResponse);
  const hasSubstantiveClaims =
    partialResponse.length > MIN_VALIDATION_LENGTH &&
    CLAIM_PATTERNS.some(p => p.test(partialResponse));

  return {
    hasLabels: labels.length > 0,
    labelCount: labels.length,
    hasSubstantiveClaims,
    needsAttention: hasSubstantiveClaims && labels.length === 0,
  };
}
