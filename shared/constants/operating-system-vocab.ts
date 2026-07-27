/**
 * Deployed operating-system vocabularies — single source of truth.
 *
 * These constants mirror the CHECK constraints in
 * db/migrations/20260323_assumption_decision_contradiction.sql — the shape that
 * actually deploys (see C-9 in docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md;
 * the rival Drizzle-shaped definition in migrations/0010 has no execution path).
 *
 * WHY THIS FILE EXISTS
 * The C-8 fail-open defect happened because gate values were string literals
 * duplicated between services and DDL, so they could diverge with no compile
 * error, no runtime error, and no failing test. Every service that filters on
 * these vocabularies must import from here; the schema-contract tier
 * (tests/schema-contract/) asserts these constants against the real DDL, so a
 * divergence now fails CI instead of silently disabling a gate.
 */

// ── Assumptions (assumption_records) ─────────────────────────────────────────

/** status CHECK constraint, db/migrations/20260323:57-59. Column DEFAULT 'active'. */
export const DEPLOYED_ASSUMPTION_STATUSES = [
  'active',
  'under_review',
  'superseded',
  'withdrawn',
  'challenged',
] as const;
export type DeployedAssumptionStatus = (typeof DEPLOYED_ASSUMPTION_STATUSES)[number];

/**
 * Approval semantics, taken from the deployed-shape service itself
 * (assumption-registry-service.ts): approveAssumption() sets status='active'
 * AND records reviewed_by; rejectAssumption() → 'withdrawn';
 * supersedeAssumption() → 'superseded'; reviewAssumption() → 'under_review'.
 *
 * Because 'active' is also the column DEFAULT, a freshly created assumption is
 * 'active' with reviewed_by NULL — created, never approved. A promotion gate
 * that treated bare 'active' as approved would fail open for every new
 * assumption. Therefore:
 *
 *   settled (does not block promotion):
 *     - status = 'superseded'  (replaced by a newer assumption)
 *     - status = 'withdrawn'   (no longer asserted at all)
 *     - status = 'active' AND reviewed_by IS NOT NULL  (approved)
 *   blocking (everything else):
 *     - 'under_review', 'challenged', and unreviewed 'active'
 *
 * Encoded as a SQL predicate so services cannot re-derive it differently.
 */
export const ASSUMPTION_SETTLED_SQL_PREDICATE =
  `(status IN ('superseded','withdrawn') OR (status = 'active' AND reviewed_by IS NOT NULL))`;

// ── Decisions (decision_records) ─────────────────────────────────────────────

/** action_state CHECK constraint, db/migrations/20260323:107-110. DEFAULT 'proposed'. */
export const DEPLOYED_DECISION_ACTION_STATES = [
  'proposed',
  'under_review',
  'approved',
  'rejected',
  'executed',
  'deferred',
  'escalated',
  'superseded',
] as const;
export type DeployedDecisionActionState = (typeof DEPLOYED_DECISION_ACTION_STATES)[number];

/**
 * States in which a decision is NOT yet resolved and must block promotion.
 *
 * Mapping rationale: the original (orphaned) enum blocked only
 * 'recommended_only' and treated 'prepared' as acceptable. In the deployed
 * vocabulary, 'proposed' is the recommended-only equivalent (it is the column
 * DEFAULT) and 'approved' is the prepared equivalent (a human approved it,
 * execution pending). 'under_review', 'deferred' and 'escalated' have no
 * original equivalent and are treated as unresolved — the conservative,
 * fail-closed reading.
 */
export const UNRESOLVED_DECISION_ACTION_STATES = [
  'proposed',
  'under_review',
  'deferred',
  'escalated',
] as const;

// ── Confidence ────────────────────────────────────────────────────────────────

/** confidence_level CHECK constraint, db/migrations/20260323:44-46 and :99-101. */
export const DEPLOYED_CONFIDENCE_LEVELS = [
  'definitive',
  'high',
  'moderate',
  'low',
  'speculative',
] as const;

/**
 * Unified confidence ladder covering BOTH vocabularies.
 *
 * Governance rules were historically seeded with the orphaned vocabulary
 * ('moderate', 'strong'), while deployed decisions carry the 20260323
 * vocabulary ('definitive'…'speculative'). Ranking both on one ladder lets
 * existing rules keep working against deployed data without a rule migration.
 *
 *   0: speculative / uncertain
 *   1: low / provisional
 *   2: moderate            (shared by both vocabularies)
 *   3: high / strong
 *   4: definitive
 */
export const CONFIDENCE_RANK: Record<string, number> = {
  speculative: 0,
  uncertain: 0,
  low: 1,
  provisional: 1,
  moderate: 2,
  high: 3,
  strong: 3,
  definitive: 4,
};

/**
 * Rank a confidence value from either vocabulary.
 * Returns null for an unrecognized value — callers MUST fail closed on null
 * rather than defaulting to 0 (defaulting is what made a 'definitive' decision
 * score the same as 'speculative' in the C-8 defect).
 */
export function rankConfidence(value: string | null | undefined): number | null {
  if (!value) return null;
  const rank = CONFIDENCE_RANK[value];
  return rank === undefined ? null : rank;
}
