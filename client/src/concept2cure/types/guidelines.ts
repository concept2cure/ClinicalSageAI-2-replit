/**
 * TypeScript Guidelines & Type Boundaries — ClinicalSageAI
 *
 * This file codifies the type patterns, conventions, and boundaries
 * used throughout the Concept2Cure codebase. Import these utility types
 * and follow the patterns described below.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 1: readonly by default
 *
 *   All interface props MUST use `readonly`. Mutation is opt-in, not default.
 *
 *   ✅ interface Props { readonly value: number; }
 *   ❌ interface Props { value: number; }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 2: Explicit return types on hooks and exported functions
 *
 *   ✅ function useData(): UseDataReturn { ... }
 *   ❌ function useData() { return { ... }; }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 3: No `any` — use `unknown` + type guards
 *
 *   ✅ function parse(raw: unknown): Result { ... }
 *   ❌ function parse(raw: any): Result { ... }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 4: `const` assertions for literal collections
 *
 *   ✅ const COLORS = ['#fff', '#000'] as const satisfies readonly string[];
 *   ❌ const COLORS = ['#fff', '#000'];
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 5: Named type aliases for union types reused > 1 time
 *
 *   ✅ type PanelSide = 'left' | 'right';
 *   ❌ side?: 'left' | 'right'; // inline everywhere
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 6: Prefer nullish coalescing (??) over logical OR (||)
 *
 *   ✅ parentId ?? null
 *   ❌ parentId || null  // incorrect for falsy values like 0 or ''
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 7: Use `void` prefix for fire-and-forget promises
 *
 *   ✅ void setDoc(ref, data);
 *   ❌ setDoc(ref, data);  // unhandled promise
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 8: Named constants for magic numbers
 *
 *   ✅ const HEARTBEAT_INTERVAL_MS = 10_000;
 *   ❌ setInterval(fn, 10000);
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 9: Use cn() (clsx/tailwind-merge) for className composition
 *
 *   ✅ cn('base-class', isActive && 'active-class', className)
 *   ❌ `base-class ${isActive ? 'active-class' : ''} ${className}`
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RULE 10: aria-* attributes on interactive animated elements
 *
 *   ✅ <motion.div aria-hidden="true" />  // backdrops
 *   ✅ <motion.div role="dialog" aria-modal="true" />  // modals
 *   ❌ <motion.div onClick={onClose} />  // no semantic meaning
 */

// ── Utility types ─────────────────────────────────────────────────────────────

/** Make all properties in T deeply readonly */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object
    ? T[K] extends (...args: readonly unknown[]) => unknown
      ? T[K]
      : DeepReadonly<T[K]>
    : T[K];
};

/** Extract the resolved type from a Promise (use built-in Awaited<T> in TS 4.5+) */
export type AwaitedValue<T> = T extends Promise<infer U> ? U : T;

/** Require at least one of the specified keys */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

/** Make specified keys required while keeping the rest as-is */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/** A branded type for compile-time ID distinction */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Branded string types for domain IDs */
export type UserId = Brand<string, 'UserId'>;
export type DocumentId = Brand<string, 'DocumentId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type CommentId = Brand<string, 'CommentId'>;

/** Unix timestamp in milliseconds */
export type UnixMs = Brand<number, 'UnixMs'>;

// ── Firestore document shapes (canonical) ─────────────────────────────────────

/** Shape of a Firestore presence document */
export interface FirestorePresenceDoc {
  readonly userId: string;
  readonly userName: string;
  readonly color: string;
  readonly cursorPos: number | null;
  readonly selectionFrom?: number;
  readonly selectionTo?: number;
  readonly lastActive: number;
  readonly activeSection?: string;
}

/** Shape of a Firestore comment document */
export interface FirestoreCommentDoc {
  readonly userId: string;
  readonly userName: string;
  readonly content: string;
  readonly anchorPos: number;
  readonly parentId: string | null;
  readonly resolved: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Shape of a Firestore lock document */
export interface FirestoreLockDoc {
  readonly sectionId: string;
  readonly lockedBy: string;
  readonly lockedByName: string;
  readonly lockedAt: number;
  readonly expiresAt: number;
}

// ── Phase 3 Orchestration Constraints ──────────────────────────────────────────
//
// The following constraints are NON-NEGOTIABLE for all Phase 3 orchestration work.
// They exist to keep the system inspectable, trustworthy, and enterprise-safe.
//
// ────────────────────────────────────────────────────────────────────────────────
// CONSTRAINT 1: Workflow Run Persistence
//   Every orchestration workflow MUST create a persisted workflow run record.
//   See: shared/schema/orchestration.ts → workflowRuns
//   Required fields: runId, workflowType, triggerSource, scope, steps executed,
//   objects touched, outputs created, blockers, final status, timestamps, attribution.
//
// CONSTRAINT 2: Human Approval Checkpoints
//   No workflow may auto-promote, auto-route, or overwrite governed documents
//   without a configurable approval gate. Step statuses: proposed → awaiting_review
//   → approved → executed (or failed / skipped).
//   See: shared/schema/orchestration.ts → approvalCheckpoints
//
// CONSTRAINT 3: Diff & Review Surface
//   All revision-producing workflows MUST generate a structured diff summary
//   showing: what changed, why, evidence sources, validation findings addressed.
//   See: shared/schema/orchestration.ts → DiffSummary, DiffChange
//
// CONSTRAINT 4: Rules-Driven Readiness
//   Readiness MUST be rules-driven, not just AI-interpreted. Distinguish:
//     - Rules-based missing items (readiness_rules registry)
//     - Validation-derived blockers (deterministic checks)
//     - AI-inferred recommendations (LLM reasoning, requires confidence level)
//   See: shared/schema/orchestration.ts → readinessRules, readinessEvaluations
//
// CONSTRAINT 5: Deterministic / LLM Separation
//   Orchestration step execution MUST be deterministic where possible.
//   LLM reasoning for: summarization, prioritization, recommendation, gap interpretation.
//   Deterministic services for: routing, promotion, validation, status changes,
//   object lookup, permission checks.
//   See: server/services/orchestration-engine.ts → StepHandler.stepType
//
// CONSTRAINT 6: Confidence & Evidence Contract
//   Every recommendation MUST declare: evidence source(s), whether rules/validation/AI,
//   confidence level if inferred, suggested action, human review requirement.
//   See: shared/schema/orchestration.ts → EvidencedRecommendation, EvidenceSource
//
// CONSTRAINT 7: Resume / Retry Behavior
//   Workflow runs MUST support: pause, retry failed step, resume from last
//   successful step, cancel safely.
//   See: server/services/orchestration-engine.ts → resumeRun, retryStep
//
// CONSTRAINT 8: Project Intelligence Summary
//   A stable, persisted object per project that tracks: current blockers, recent
//   changes, important decisions, unresolved risks, readiness status, last workflow
//   outcomes, next recommended actions.
//   See: shared/schema/orchestration.ts → projectIntelligenceSummaries
//
// CONSTRAINT 9: Single Anchor Workspace
//   Phase 3 MUST ship one primary readiness workspace as the anchor experience.
//   All orchestration, blockers, recommendations, and workflow runs viewable from there.
//
// CONSTRAINT 10: Scope Discipline
//   Phase 3 targets TWO high-value regulated flows first:
//     1. Dossier / submission readiness review
//     2. Draft → validate → review → route
//   Do NOT generalize to all project types until these are working end-to-end.
//   See: server/services/orchestration-engine.ts → SUBMISSION_READINESS_REVIEW,
//        DRAFT_VALIDATE_REVIEW_ROUTE
//
// ────────────────────────────────────────────────────────────────────────────────

// ── Animation constants (shared across ZenTransitions) ────────────────────────

/** Standard ease curve matching Apple HIG motion design */
export const EASE_APPLE = [0.2, 0, 0, 1] as const;

/** Standard duration for modal/panel transitions (seconds) */
export const DURATION_MODAL = 0.18;

/** Standard duration for backdrop fade (seconds) */
export const DURATION_BACKDROP = 0.15;

/** Standard spring config for modals */
export const SPRING_MODAL = { type: 'spring' as const, damping: 25, stiffness: 350 };

/** Standard spring config for panels */
export const SPRING_PANEL = { type: 'spring' as const, damping: 28, stiffness: 300 };
