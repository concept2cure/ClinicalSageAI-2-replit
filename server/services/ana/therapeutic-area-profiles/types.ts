/**
 * Shared types for therapeutic-area profiles (Feature 2.7).
 *
 * Profiles are static knowledge modules that AnA injects into prompt
 * assembly + retrieval scope. They are intentionally TEXT — not
 * marketing copy. Each field maps to a specific surface:
 *
 *   contextRules         → bullets injected into the system prompt at
 *                          the Therapeutic Area Context layer.
 *   riskFactors          → bullets shown to the model + reviewer view.
 *   commonGaps           → seeded into the gap-classifier's prefix-match
 *                          on top of the global GAP_RULES (NOT replacing).
 *   guidanceRefs         → folded into the project's RAG retrieval scope
 *                          and surfaced as "you should reference these".
 *   reviewerExpectations → "what FDA/EMA reviewers will look for" — used
 *                          by both the chat handler and submission-chat
 *                          to flag missing rebuttals.
 *   pathwayHints         → conditional logic (accelerated, breakthrough,
 *                          orphan, fast-track, etc.) keyed by pathway.
 *   statisticalConsiderations + endpointConsiderations → methodology
 *                          guardrails injected for any quantitative draft.
 *   retrievalKeywords    → boost terms used by the citation engine to
 *                          weight RAG results in the area's domain.
 *
 * @module server/services/ana/therapeutic-area-profiles/types
 */

export type TherapeuticAreaId =
  | 'oncology'
  | 'rare-disease'
  | 'neurology'
  | 'immunology';

export type ProfileSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface ContextRule {
  id: string;
  /** When this rule applies — module/section scope or 'always'. */
  scope: 'always' | 'module' | 'section';
  /** Module number (1..5) or CTD section code, depending on scope. */
  appliesTo?: string;
  /** Trigger keyword in the user's request that activates this rule. */
  triggerKeywords?: string[];
  instruction: string;
  severity: ProfileSeverity;
  guidanceRef?: string;
}

export interface CommonGap {
  ctdSection: string;
  prefix?: boolean;
  patterns: string[];
  description: string;
  severity: ProfileSeverity;
  guidanceRef?: string;
}

export interface GuidanceRef {
  code: string;
  authority: 'FDA' | 'EMA' | 'ICH' | 'PMDA' | 'HC' | 'WHO' | 'NMPA';
  title: string;
  why: string;
}

export interface PathwayHint {
  pathway:
    | 'accelerated_approval'
    | 'breakthrough_therapy'
    | 'fast_track'
    | 'orphan_drug'
    | 'priority_review'
    | 'conditional_marketing_authorization'
    | 'rmat'
    | 'prime';
  applicability: string;
  impactedSections: string[];
  reviewerNotes: string;
}

export interface TherapeuticAreaProfile {
  id: TherapeuticAreaId;
  displayName: string;
  description: string;
  contextRules: ContextRule[];
  riskFactors: string[];
  commonGaps: CommonGap[];
  guidanceRefs: GuidanceRef[];
  reviewerExpectations: string[];
  pathwayHints: PathwayHint[];
  statisticalConsiderations: string[];
  endpointConsiderations: string[];
  retrievalKeywords: string[];
}
