/**
 * AnA RI — Memory Acceptance Pipeline
 *
 * Controls what gets written into the 3-layer memory system. Today, memory
 * acceptance is essentially "write everything" — there's no quality gate
 * between AI output and memory persistence. This service adds:
 *
 * 1. Provenance tracking — every memory atom knows where it came from
 * 2. Confidence scoring — based on evidence quality, not just model certainty
 * 3. Deduplication — prevent the same insight from being stored N times
 * 4. Contradiction checking — flag when a new memory contradicts existing ones
 * 5. Human review flagging — mark uncertain memories for user verification
 *
 * This pipeline sits between response generation and memory persistence.
 *
 * @module server/services/ana-ri/memory-acceptance
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryCandidate {
  /** The content to be stored as a memory atom */
  content: string;
  /** Category for the memory entry */
  category: string;
  /** Source thread ID */
  source_thread_id: string | null;
  /** Which messages in the thread produced this */
  source_message_window: [number, number] | null;
  /** How was this memory produced */
  provenance: MemoryProvenance;
  /** Computed confidence score (0-1) */
  confidence_score: number;
  /** Acceptance decision */
  acceptance_status: 'accepted' | 'rejected' | 'pending_review';
  /** Deduplication key */
  dedupe_key: string;
  /** Result of contradiction checking */
  contradiction_check_result: ContradictionCheckResult;
  /** Whether a human should verify before trusting this memory */
  human_review_required: boolean;
  /** Reason for the acceptance decision */
  decision_reason: string;
}

export interface MemoryProvenance {
  /** Which AnA route produced this */
  source_route: string;
  /** AI model used */
  model: string;
  /** AI provider used */
  provider: string;
  /** Evidence verdict at time of generation */
  evidence_validated: boolean;
  /** Structure validation score at time of generation */
  structure_score: number;
  /** Timestamp of generation */
  generated_at: string;
  /** User who triggered the generation */
  triggered_by: number | string;
}

export interface ContradictionCheckResult {
  /** Whether any contradictions were found */
  has_contradiction: boolean;
  /** Description of contradictions found */
  contradictions: string[];
  /** IDs of conflicting memory entries */
  conflicting_entry_ids: number[];
}

// ── Configuration ─────────────────────────────────────────────────────────────

/** Minimum confidence score to accept without human review */
const AUTO_ACCEPT_THRESHOLD = 0.7;

/** Below this, reject outright */
const REJECTION_THRESHOLD = 0.3;

/** Maximum content length for a single memory atom */
const MAX_ATOM_LENGTH = 5000;

/** Minimum content length to be useful */
const MIN_ATOM_LENGTH = 20;

// ── Confidence Scoring ────────────────────────────────────────────────────────

/**
 * Score confidence based on evidence quality and response characteristics.
 * This is NOT LLM self-reported confidence — it's our external assessment.
 */
function scoreConfidence(params: {
  content: string;
  evidenceValidated: boolean;
  structureScore: number;
  structureMaxScore: number;
  hasKnownLabels: boolean;
  hasInferredLabels: boolean;
  hasMissingLabels: boolean;
  category: string;
}): number {
  let score = 0.5; // base confidence

  // Evidence validation passed → +0.2
  if (params.evidenceValidated) {
    score += 0.2;
  } else {
    score -= 0.15;
  }

  // Good structure → +0.1
  const structureRatio =
    params.structureMaxScore > 0 ? params.structureScore / params.structureMaxScore : 0;
  score += structureRatio * 0.1;

  // Has [KNOWN] evidence labels → +0.1
  if (params.hasKnownLabels) {
    score += 0.1;
  }

  // Only [INFERRED] with no [KNOWN] → -0.1
  if (params.hasInferredLabels && !params.hasKnownLabels) {
    score -= 0.1;
  }

  // Has explicit [MISSING] → confidence drops (honest about gaps is good, but memory is uncertain)
  if (params.hasMissingLabels) {
    score -= 0.05;
  }

  // Category-specific adjustments
  if (
    params.category === 'rim_pattern_registry' ||
    params.category === 'intelligence_signal_summary'
  ) {
    // RIM signals have their own provenance chain — higher base trust
    score += 0.05;
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, score));
}

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Generate a deduplication key from content.
 * Uses a simple hash of the first 200 chars of normalized content + category.
 */
function generateDedupeKey(content: string, category: string): string {
  const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);

  // Simple string hash (djb2)
  let hash = 5381;
  const combined = `${category}:${normalizedContent}`;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) + hash + (combined.codePointAt(i) ?? 0)) & 0xffffffff;
  }

  return `mem_${hash.toString(36)}`;
}

// ── Contradiction Checking ────────────────────────────────────────────────────

/**
 * Check a new memory candidate against existing memories for contradictions.
 *
 * This is a lightweight text-based check — not a full semantic comparison.
 * It looks for direct negation patterns between the candidate and existing content.
 */
export function checkForContradictions(
  candidate: string,
  existingMemories: Array<{ id: number; content: string; category: string }>
): ContradictionCheckResult {
  const contradictions: string[] = [];
  const conflictingIds: number[] = [];

  const candidateNormalized = candidate.toLowerCase();

  const negationPairs = [
    { positive: 'is sufficient', negative: 'is insufficient' },
    { positive: 'is adequate', negative: 'is inadequate' },
    { positive: 'meets requirements', negative: 'does not meet requirements' },
    { positive: 'no risk', negative: 'significant risk' },
    { positive: 'compliant', negative: 'non-compliant' },
    { positive: 'complete', negative: 'incomplete' },
    { positive: 'no gaps', negative: 'data gaps' },
    { positive: 'approved', negative: 'rejected' },
  ];

  for (const existing of existingMemories) {
    const existingNormalized = existing.content.toLowerCase();
    checkPairContradictions(
      candidateNormalized,
      existingNormalized,
      existing.id,
      negationPairs,
      contradictions,
      conflictingIds
    );
  }

  return {
    has_contradiction: contradictions.length > 0,
    contradictions,
    conflicting_entry_ids: conflictingIds,
  };
}

/** Helper to reduce cognitive complexity in contradiction checking */
function checkPairContradictions(
  candidateNorm: string,
  existingNorm: string,
  existingId: number,
  pairs: Array<{ positive: string; negative: string }>,
  contradictions: string[],
  conflictingIds: number[]
): void {
  for (const { positive, negative } of pairs) {
    const candidateHasPositive = candidateNorm.includes(positive);
    const candidateHasNegative = candidateNorm.includes(negative);
    const existingHasPositive = existingNorm.includes(positive);
    const existingHasNegative = existingNorm.includes(negative);

    const isContradiction =
      (candidateHasPositive && existingHasNegative) ||
      (candidateHasNegative && existingHasPositive);

    if (isContradiction) {
      const candidateAssertion = candidateHasPositive ? positive : negative;
      const existingAssertion = existingHasPositive ? positive : negative;
      contradictions.push(
        `New memory says "${candidateAssertion}" but existing memory #${existingId} says "${existingAssertion}"`
      );
      if (!conflictingIds.includes(existingId)) {
        conflictingIds.push(existingId);
      }
    }
  }
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

/**
 * Evaluate a memory candidate through the acceptance pipeline.
 *
 * Call this before persisting any memory atom from an AnA response.
 *
 * @param content - The text to store as a memory atom
 * @param category - Memory category (e.g., 'insight', 'decision', 'rim_pattern_registry')
 * @param provenance - Where this memory came from
 * @param qualitySignals - Quality signals from the response that generated this memory
 * @param existingMemories - Existing memories in the same project for dedup/contradiction checking
 * @returns MemoryCandidate with acceptance decision
 */
export function evaluateMemoryCandidate(params: {
  content: string;
  category: string;
  provenance: MemoryProvenance;
  qualitySignals: {
    evidenceValidated: boolean;
    structureScore: number;
    structureMaxScore: number;
    hasKnownLabels: boolean;
    hasInferredLabels: boolean;
    hasMissingLabels: boolean;
  };
  existingMemories?: Array<{ id: number; content: string; category: string }>;
  threadId?: string | null;
  messageWindow?: [number, number] | null;
}): MemoryCandidate {
  const {
    content,
    category,
    provenance,
    qualitySignals,
    existingMemories = [],
    threadId = null,
    messageWindow = null,
  } = params;

  // Step 1: Basic validation
  if (content.length < MIN_ATOM_LENGTH) {
    return buildRejection(
      content,
      category,
      provenance,
      threadId,
      messageWindow,
      'Content too short'
    );
  }

  if (content.length > MAX_ATOM_LENGTH) {
    return buildRejection(
      content,
      category,
      provenance,
      threadId,
      messageWindow,
      `Content too long (${content.length} > ${MAX_ATOM_LENGTH})`
    );
  }

  // Step 2: Score confidence
  const confidence = scoreConfidence({
    content,
    ...qualitySignals,
    category,
  });

  // Step 3: Generate dedupe key
  const dedupeKey = generateDedupeKey(content, category);

  // Step 4: Check deduplication
  const existingDedupes = existingMemories.filter(
    m => generateDedupeKey(m.content, m.category) === dedupeKey
  );
  if (existingDedupes.length > 0) {
    return buildRejection(
      content,
      category,
      provenance,
      threadId,
      messageWindow,
      `Duplicate of existing memory #${existingDedupes[0].id}`
    );
  }

  // Step 5: Check contradictions
  const contradictionResult = checkForContradictions(content, existingMemories);

  // Step 6: Determine acceptance status
  let status: MemoryCandidate['acceptance_status'];
  let humanReview = false;
  let reason: string;

  if (confidence >= AUTO_ACCEPT_THRESHOLD && !contradictionResult.has_contradiction) {
    status = 'accepted';
    reason = `Confidence ${confidence.toFixed(2)} >= ${AUTO_ACCEPT_THRESHOLD} threshold, no contradictions`;
  } else if (confidence < REJECTION_THRESHOLD) {
    status = 'rejected';
    reason = `Confidence ${confidence.toFixed(2)} < ${REJECTION_THRESHOLD} rejection threshold`;
  } else if (contradictionResult.has_contradiction) {
    status = 'pending_review';
    humanReview = true;
    reason = `Contradicts existing memories: ${contradictionResult.contradictions[0]}`;
  } else {
    status = 'pending_review';
    humanReview = true;
    reason = `Confidence ${confidence.toFixed(2)} between thresholds — needs human verification`;
  }

  return {
    content,
    category,
    source_thread_id: threadId,
    source_message_window: messageWindow,
    provenance,
    confidence_score: confidence,
    acceptance_status: status,
    dedupe_key: dedupeKey,
    contradiction_check_result: contradictionResult,
    human_review_required: humanReview,
    decision_reason: reason,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRejection(
  content: string,
  category: string,
  provenance: MemoryProvenance,
  threadId: string | null,
  messageWindow: [number, number] | null,
  reason: string
): MemoryCandidate {
  return {
    content,
    category,
    source_thread_id: threadId,
    source_message_window: messageWindow,
    provenance,
    confidence_score: 0,
    acceptance_status: 'rejected',
    dedupe_key: generateDedupeKey(content, category),
    contradiction_check_result: {
      has_contradiction: false,
      contradictions: [],
      conflicting_entry_ids: [],
    },
    human_review_required: false,
    decision_reason: reason,
  };
}
