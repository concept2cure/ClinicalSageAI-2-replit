/**
 * Translation service — HYBRID WORKFLOW state machine.
 *
 * The heart of the engine: a PURE, runtime-isolated (no db / network / env)
 * state machine over TranslationStatus that drives every segment through the
 * regulated lifecycle and ENFORCES the platform guardrails at each transition.
 *
 * Lifecycle (the only legal status path):
 *
 *   pending ──draft──▶ mt_draft ──post_edit──▶ in_progress
 *      │                                            │
 *      │ start_human                                │ submit_for_back_translation
 *      ▼                                            ▼
 *   in_progress ◀──reopen── back_translation ──run_back_translation──▶ back_translation
 *                                                   │
 *                                          submit_for_review
 *                                                   ▼
 *                                                review ──approve──▶ approved   (terminal)
 *                                                   │
 *                                                reject──▶ rejected             (terminal)
 *
 * REGULATED-PLATFORM GUARDRAILS (enforced here, mirroring the contract pinned in
 * shared/types/translation.ts and the DNT principle in
 * server/services/ana-ri/locale-overlays.ts — "translate meaning, not identifiers"):
 *
 *  1. Machine translation is a DRAFT ACCELERATOR ONLY. A segment whose `method`
 *     is 'machine' can NEVER reach 'approved'. The only approvable methods are
 *     'human' and 'mt_postedited' (DEFAULT_GUARDRAILS.approvableMethods).
 *  2. A segment may reach 'approved' only when ALL hold:
 *       a. method ∈ approvableMethods (human OR mt_postedited), AND
 *       b. a back-translation result EXISTS and is verified above threshold, AND
 *       c. a NAMED human reviewer of record signed off (provenance.reviewedBy),
 *          who is distinct from the post-editor where both are recorded, AND
 *       d. the draft engine did not return deterministic/demo content
 *          (when rejectDeterministicDrafts is set).
 *  3. Illegal transitions are rejected with a typed WorkflowTransitionError so
 *     callers (routes, jobs, UI) get a stable ApiError envelope, never a throw
 *     with an opaque message.
 *
 * Purity: transition() does not mutate its input. It returns a NEW segment with
 * an updated status and provenance stamped from the supplied actor + clock. The
 * caller persists the result inside its own tenant-scoped transaction.
 *
 * @module server/services/translation/hybrid-workflow
 */

import type {
  ApiError,
  BackTranslationResult,
  SegmentProvenance,
  TranslationProject,
  TranslationSegment,
  TranslationStatus,
  WorkflowGuardrailConfig,
} from './types';
import { DEFAULT_GUARDRAILS } from './types';
import { isApprovableMethod } from '@shared/types/translation';

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The verbs a caller can apply to a segment. Each maps to exactly one legal
 * status edge (see TRANSITIONS); the guardrails gate which edges may actually
 * fire given the segment's method + provenance.
 */
export type WorkflowAction =
  | 'draft' //                     pending           → mt_draft        (machine DRAFT produced)
  | 'start_human' //               pending           → in_progress     (from-scratch human translation)
  | 'post_edit' //                 mt_draft          → in_progress     (human corrects the draft)
  | 'submit_for_back_translation'//in_progress       → back_translation
  | 'run_back_translation' //      back_translation  → back_translation(records evidence, stays)
  | 'submit_for_review' //         back_translation  → review
  | 'reopen' //                    back_translation  → in_progress     (evidence failed / more edits)
  | 'approve' //                   review            → approved        (terminal — fully guarded)
  | 'reject'; //                   review            → rejected        (terminal)

/** The acting principal — a named human (or, for `draft`, the system). */
export interface WorkflowActor {
  /** User id of the actor; null only for the system-run machine `draft` step. */
  userId: number | null;
  /** Whether this actor holds the reviewer-of-record role for sign-off. */
  isReviewer?: boolean;
  /** Optional acknowledgement note captured for the audit trail. */
  note?: string;
}

/** Optional, deterministic inputs so the machine stays pure & testable. */
export interface TransitionContext {
  /** Guardrail knobs; defaults to the strict regulated posture. */
  guardrails?: WorkflowGuardrailConfig;
  /** ISO-8601 clock; injected so transitions are reproducible in tests. */
  now?: string;
  /**
   * Evidence supplied alongside a `run_back_translation` action. Stamped into
   * provenance.backTranslation. Required for that action; ignored otherwise.
   */
  backTranslation?: BackTranslationResult;
  /**
   * Method to record on a `post_edit` / `start_human` action. A machine draft
   * that a human corrects becomes 'mt_postedited'; a from-scratch human
   * translation is 'human'. Ignored for other actions.
   */
  method?: Extract<TranslationSegment['method'], 'human' | 'mt_postedited'>;
  /**
   * True if the originating draft engine returned deterministic/demo content.
   * Such a segment can never be approved when rejectDeterministicDrafts is set.
   * Defaults to the value carried on the segment (see segment.provenance hints);
   * pass explicitly when re-evaluating.
   */
  deterministicDraft?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed error
// ─────────────────────────────────────────────────────────────────────────────

/** Stable error codes surfaced through the shared ApiError envelope. */
export type WorkflowErrorCode =
  | 'illegal_transition' //         action not valid from the current status
  | 'method_not_approvable' //      method is 'machine' (or otherwise non-approvable)
  | 'back_translation_required' //  no/failed back-translation evidence
  | 'reviewer_required' //          no named human reviewer of record
  | 'reviewer_conflict' //          reviewer is the same person as the post-editor
  | 'deterministic_draft' //        draft engine returned demo content
  | 'missing_evidence' //           action requires payload that was not supplied
  | 'actor_required'; //            a human actor is required for this action

/**
 * Typed workflow error. Carries a code that maps 1:1 to an ApiError so route
 * handlers can return a uniform `{ error: { code, message } }` body. Throwing
 * (rather than returning a decision) keeps the happy path linear at call sites
 * while still being catchable and machine-classifiable.
 */
export class WorkflowTransitionError extends Error {
  readonly code: WorkflowErrorCode;
  readonly details?: unknown;

  constructor(code: WorkflowErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'WorkflowTransitionError';
    this.code = code;
    this.details = details;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, WorkflowTransitionError.prototype);
  }

  /** Render as the shared error envelope for HTTP responses. */
  toApiError(): ApiError {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transition table (status edges only — guardrails layer on top)
// ─────────────────────────────────────────────────────────────────────────────

/** Status reached by applying an action, keyed by the originating status. */
const TRANSITIONS: Readonly<
  Record<TranslationStatus, Partial<Record<WorkflowAction, TranslationStatus>>>
> = {
  pending: {
    draft: 'mt_draft',
    start_human: 'in_progress',
  },
  mt_draft: {
    post_edit: 'in_progress',
  },
  in_progress: {
    submit_for_back_translation: 'back_translation',
    // A human may iterate in place; we model re-editing as staying in_progress.
    post_edit: 'in_progress',
  },
  back_translation: {
    run_back_translation: 'back_translation',
    submit_for_review: 'review',
    reopen: 'in_progress',
  },
  review: {
    approve: 'approved',
    reject: 'rejected',
    reopen: 'in_progress',
  },
  approved: {}, // terminal
  rejected: {}, // terminal
};

/** Terminal states admit no further transitions. */
export const TERMINAL_STATUSES: readonly TranslationStatus[] = ['approved', 'rejected'];

/** True if a status is terminal (no outgoing edges). */
export function isTerminal(status: TranslationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** The set of actions legal from a given status (status-edge level only). */
export function allowedActions(status: TranslationStatus): WorkflowAction[] {
  return Object.keys(TRANSITIONS[status] ?? {}) as WorkflowAction[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval guard (the regulated core)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure predicate: may this segment be approved RIGHT NOW under the guardrails?
 *
 * Returns a typed error (NOT a throw) describing the FIRST failed condition so
 * UIs can show why an "Approve" affordance is disabled. transition('approve')
 * uses the same checks and throws the corresponding WorkflowTransitionError.
 *
 * Conditions (all must hold), in evaluation order:
 *  1. method ∈ guardrails.approvableMethods   → method_not_approvable
 *  2. draft was not deterministic/demo content → deterministic_draft
 *  3. back-translation exists AND verified     → back_translation_required
 *  4. a named human reviewer of record exists  → reviewer_required
 *  5. reviewer ≠ post-editor (when both known) → reviewer_conflict
 */
export function approvalGuard(
  segment: TranslationSegment,
  guardrails: WorkflowGuardrailConfig = DEFAULT_GUARDRAILS,
  opts: { deterministicDraft?: boolean } = {},
): WorkflowTransitionError | null {
  // 1. Machine-only segments are NEVER approvable. This is the cardinal rule.
  const method = segment.method;
  const methodOk =
    !!method &&
    (guardrails.approvableMethods as readonly string[]).includes(method) &&
    // Defense in depth: the shared predicate must also agree.
    isApprovableMethod(method);
  if (!methodOk) {
    return new WorkflowTransitionError(
      'method_not_approvable',
      `Segment method '${method ?? 'null'}' is not approvable; machine drafts ` +
        `require human post-edit ('mt_postedited' or 'human') before approval.`,
      { method, approvableMethods: guardrails.approvableMethods },
    );
  }

  // 2. Deterministic/demo draft content may never be promoted.
  if (guardrails.rejectDeterministicDrafts && opts.deterministicDraft === true) {
    return new WorkflowTransitionError(
      'deterministic_draft',
      'Segment originates from deterministic/demo draft content and cannot be approved.',
    );
  }

  // 3. Back-translation evidence must exist and have passed the threshold.
  if (guardrails.requireBackTranslation) {
    const bt = segment.provenance.backTranslation;
    if (!bt) {
      return new WorkflowTransitionError(
        'back_translation_required',
        'Approval blocked: no back-translation evidence on record.',
      );
    }
    const passes = bt.verified && bt.similarity >= guardrails.backTranslationThreshold;
    if (!passes) {
      return new WorkflowTransitionError(
        'back_translation_required',
        `Approval blocked: back-translation did not pass (verified=${bt.verified}, ` +
          `similarity=${bt.similarity} < threshold=${guardrails.backTranslationThreshold}).`,
        { similarity: bt.similarity, threshold: guardrails.backTranslationThreshold },
      );
    }
  }

  // 4. A NAMED human reviewer of record must have signed off.
  const reviewedBy = segment.provenance.reviewedBy;
  if (reviewedBy == null) {
    return new WorkflowTransitionError(
      'reviewer_required',
      'Approval blocked: no named human reviewer of record has signed off.',
    );
  }

  // 5. Separation of duties: the reviewer cannot also be the post-editor.
  const postEditedBy = segment.provenance.postEditedBy;
  if (postEditedBy != null && postEditedBy === reviewedBy) {
    return new WorkflowTransitionError(
      'reviewer_conflict',
      'Approval blocked: the reviewer of record must differ from the post-editor.',
      { reviewedBy, postEditedBy },
    );
  }

  return null;
}

/** Convenience boolean form of {@link approvalGuard}. */
export function isApprovable(
  segment: TranslationSegment,
  guardrails: WorkflowGuardrailConfig = DEFAULT_GUARDRAILS,
  opts: { deterministicDraft?: boolean } = {},
): boolean {
  return approvalGuard(segment, guardrails, opts) === null;
}

// ─────────────────────────────────────────────────────────────────────────────
// transition()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply `action` performed by `actor` to `segment`. Returns a NEW segment with
 * updated status + provenance, or throws a {@link WorkflowTransitionError} for
 * an illegal transition or a guardrail violation. Pure: the input is not mutated.
 */
export function transition(
  segment: TranslationSegment,
  action: WorkflowAction,
  actor: WorkflowActor,
  ctx: TransitionContext = {},
): TranslationSegment {
  const guardrails = ctx.guardrails ?? DEFAULT_GUARDRAILS;
  const now = ctx.now ?? new Date().toISOString();

  // (a) The status edge must exist.
  const nextStatus = TRANSITIONS[segment.status]?.[action];
  if (!nextStatus) {
    throw new WorkflowTransitionError(
      'illegal_transition',
      `Action '${action}' is not allowed from status '${segment.status}'.`,
      { from: segment.status, action, allowed: allowedActions(segment.status) },
    );
  }

  // (b) Every human action requires a named actor; only the system `draft` step
  //     may run without a user id.
  if (action !== 'draft' && actor.userId == null) {
    throw new WorkflowTransitionError(
      'actor_required',
      `Action '${action}' requires a named human actor.`,
    );
  }

  // Work on a deep-enough copy of provenance so we never mutate the input.
  const provenance: SegmentProvenance = { ...segment.provenance };
  let method = segment.method;

  switch (action) {
    case 'draft': {
      // Machine DRAFT: stamp the engine; method becomes 'machine' (non-approvable).
      method = 'machine';
      break;
    }

    case 'start_human':
    case 'post_edit': {
      // Human touched the segment. Record the post-editor + method. A machine
      // draft corrected by a human becomes 'mt_postedited'; from-scratch is 'human'.
      const m = ctx.method ?? (action === 'start_human' ? 'human' : 'mt_postedited');
      method = m;
      provenance.postEditedBy = actor.userId;
      provenance.postEditedAt = now;
      break;
    }

    case 'submit_for_back_translation':
      // No provenance change; purely a status move toward verification.
      break;

    case 'run_back_translation': {
      const bt = ctx.backTranslation;
      if (!bt) {
        throw new WorkflowTransitionError(
          'missing_evidence',
          "Action 'run_back_translation' requires a BackTranslationResult in context.",
        );
      }
      provenance.backTranslation = bt;
      break;
    }

    case 'submit_for_review':
      // No provenance change; reviewer is recorded at approve/reject time.
      break;

    case 'reopen':
      // Iterating: clear stale review sign-off so a fresh reviewer must re-sign.
      provenance.reviewedBy = null;
      provenance.reviewedAt = null;
      break;

    case 'approve': {
      // Record the reviewer of record FIRST (so the guard sees this sign-off),
      // then enforce ALL approval guardrails. Any failure throws — nothing is
      // persisted because we return only on success.
      if (actor.isReviewer === false) {
        throw new WorkflowTransitionError(
          'reviewer_required',
          'Approval requires an actor holding the reviewer-of-record role.',
        );
      }
      provenance.reviewedBy = actor.userId;
      provenance.reviewedAt = now;

      const candidate: TranslationSegment = { ...segment, method, provenance };
      const violation = approvalGuard(candidate, guardrails, {
        deterministicDraft: ctx.deterministicDraft,
      });
      if (violation) throw violation;

      provenance.approvedBy = actor.userId;
      provenance.approvedAt = now;
      break;
    }

    case 'reject':
      provenance.reviewedBy = actor.userId;
      provenance.reviewedAt = now;
      break;

    default: {
      // Exhaustiveness guard: a new action must extend the switch above.
      const _exhaustive: never = action;
      throw new WorkflowTransitionError(
        'illegal_transition',
        `Unhandled action '${String(_exhaustive)}'.`,
      );
    }
  }

  return {
    ...segment,
    method,
    status: nextStatus,
    provenance,
    updatedAt: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Project-level readiness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is every required segment of `project` approved under the guardrails?
 *
 * Submission-readiness is the strictest gate in the platform: it is true ONLY
 * when there is at least one segment and EVERY required segment is in 'approved'
 * AND still satisfies approvalGuard (defense in depth — a stored 'approved'
 * segment that somehow lacks evidence is treated as NOT ready). 'rejected'
 * segments are not required and are ignored.
 *
 * `segments` is supplied by the caller (the state machine is storage-agnostic);
 * `project` scopes the tenant/language and is matched defensively.
 */
export function isSubmissionReady(
  project: TranslationProject,
  segments: readonly TranslationSegment[],
  guardrails: WorkflowGuardrailConfig = DEFAULT_GUARDRAILS,
): boolean {
  // Only segments belonging to this project + tenant count.
  const own = segments.filter(
    (s) => s.projectId === project.id && s.organizationId === project.organizationId,
  );

  // Required = everything that isn't an explicit rejection.
  const required = own.filter((s) => s.status !== 'rejected');
  if (required.length === 0) return false;

  return required.every(
    (s) => s.status === 'approved' && isApprovable(s, guardrails),
  );
}
