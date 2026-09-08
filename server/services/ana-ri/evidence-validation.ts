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

import type { EvidenceVerdict, FlaggedClaim } from './response-contract.js';

// ── Configuration ─────────────────────────────────────────────────────────────

/** Minimum response length to trigger full validation (short responses get a pass) */
const MIN_VALIDATION_LENGTH = 200;

/**
 * Maximum number of flagged claims carried back to the client. The validator
 * can match many overlapping patterns; cap the itemized list so the streamed
 * verdict payload (and the reviewer's drill-down panel) stays bounded.
 */
const MAX_FLAGGED_CLAIMS = 8;

/** Trim a flagged claim to a single readable line for the client panel. */
function trimClaim(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 180 ? collapsed.slice(0, 179) + '…' : collapsed;
}

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
  /* A SHORT ANSWER IS UNASSESSED, NOT VERIFIED.
   *
   * This returned `attempted: true, validated: true` with every count zero,
   * under the comment "Short responses get a quick pass — no claims to
   * validate". That is an assumption about LENGTH presented as a finding about
   * CONTENT: an answer of under 200 characters can carry a regulatory claim
   * whole — "21 CFR 314.50(d)(5)(vi)(a) requires an integrated summary of
   * safety" is 78.
   *
   * And the downstream surfaces read `validated` as the verdict, exactly as
   * they are designed to. `buildTrustSummary` rendered
   * "Verified · 0 grounded · 0 inferred/weak · 0 missing · 0 sources", and
   * `AnaGrounding` — whose whole purpose is to stop a zero reading as a clean
   * bill of health, and which gates every number on `validated` for that
   * reason — was routed past its own "not assessed" branch and drew a green
   * check reading "Claims grounded".
   *
   * So the surface people draft submissions from told them an answer's
   * regulatory claims had been checked and were sound, on answers where the
   * grounding pipeline had not run at all. The component's docstring names
   * this precise failure as the one it exists to close; it was reopened from
   * the server side by sending `validated: true`.
   *
   * `attempted: false` is the honest state and every consumer already handles
   * it: the strip says "Grounding not assessed for this answer", and the trust
   * summary says "Evidence check not run for this response — verify any
   * regulatory claims before relying on them." Both are true. Neither claims a
   * check that did not happen.
   *
   * The floor itself is kept: the claim and label extractors want sentence
   * structure, and running them on a fragment produces noise rather than a
   * verdict. Declining to judge is fine. Reporting the declined judgement as a
   * pass is not.
   */
  if (response.length < MIN_VALIDATION_LENGTH) {
    return {
      attempted: false,
      validated: false,
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

  // Step 7: Itemize the flagged claims so the client can show *which* claims
  // are weak — these were previously computed and then discarded. Order:
  // ungrounded claims first (most actionable), then overclaims, then
  // contradictions; deduped and bounded.
  const flaggedClaims: FlaggedClaim[] = [];
  const seenClaimText = new Set<string>();
  const pushFlagged = (kind: FlaggedClaim['kind'], raw: string) => {
    const text = trimClaim(raw);
    if (!text || seenClaimText.has(text)) return;
    seenClaimText.add(text);
    flaggedClaims.push({ kind, text });
  };
  for (const claim of claims) {
    if (!claim.grounded) pushFlagged('ungrounded', claim.text);
  }
  for (const overclaim of overclaims) pushFlagged('overclaim', overclaim);
  for (const contradiction of contradictionResult.contradictions) {
    pushFlagged('contradiction', contradiction);
  }
  const boundedFlaggedClaims = flaggedClaims.slice(0, MAX_FLAGGED_CLAIMS);

  // Step 8: Build verdict.
  //
  // Overclaims (strong absolute language without [KNOWN] backing) and internal
  // contradictions are categorical failures — they cannot be "averaged away" by
  // a low ungrounded ratio. Only the *ungrounded-claim* count is tolerated up to
  // a small fraction; if any overclaim or contradiction is present, the response
  // does not pass validation. (Previously the ratio fallback ignored overclaims
  // and contradictions entirely, so a self-contradictory or overclaiming answer
  // with few ungrounded claims was reported as validated — a fail-open.)
  const totalIssues =
    ungroundedCount + overclaims.length + contradictionResult.contradictions.length;
  const hasCategoricalIssue =
    overclaims.length > 0 || contradictionResult.contradictions.length > 0;
  const validated =
    totalIssues === 0 ||
    (!hasCategoricalIssue && claims.length > 0 && ungroundedCount / claims.length < 0.3);

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
    ...(boundedFlaggedClaims.length > 0 ? { flagged_claims: boundedFlaggedClaims } : {}),
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
