/**
 * hybrid-workflow tests — proves the HYBRID WORKFLOW state machine drives a
 * segment through the regulated lifecycle and ENFORCES the platform guardrails.
 *
 * The module under test is pure (no db / env / network), so we import directly
 * and feed deterministic clocks + evidence — no vi.hoisted env shim needed.
 *
 * Coverage (the four mandated proofs + supporting cases):
 *  - HAPPY PATH: pending → mt_draft → in_progress → back_translation → review
 *    → approved, with a passing back-translation and a distinct human reviewer.
 *  - A MACHINE-ONLY segment is BLOCKED from approval (method_not_approvable).
 *  - Approval WITHOUT back-translation evidence is BLOCKED
 *    (back_translation_required).
 *  - ILLEGAL transitions throw WorkflowTransitionError('illegal_transition').
 *  - Supporting: reviewer-of-record required + separation of duties;
 *    isSubmissionReady gates on every required segment being approved.
 */

import { describe, it, expect } from 'vitest';

import {
  WorkflowTransitionError,
  approvalGuard,
  isApprovable,
  isSubmissionReady,
  transition,
  type WorkflowActor,
} from '../hybrid-workflow';
import type {
  BackTranslationResult,
  SegmentProvenance,
  TranslationProject,
  TranslationSegment,
} from '../types';

const ORG = 42;
const PROJECT_ID = 7;

// Named human actors of record. The post-editor and reviewer are DISTINCT to
// satisfy separation of duties.
const POST_EDITOR: WorkflowActor = { userId: 100 };
const REVIEWER: WorkflowActor = { userId: 200, isReviewer: true };
const SYSTEM: WorkflowActor = { userId: null };

const T0 = '2026-06-29T00:00:00.000Z';
const T1 = '2026-06-29T01:00:00.000Z';
const T2 = '2026-06-29T02:00:00.000Z';
const T3 = '2026-06-29T03:00:00.000Z';
const T4 = '2026-06-29T04:00:00.000Z';

/** A passing back-translation result (verified, above the 0.85 threshold). */
function passingBackTranslation(): BackTranslationResult {
  return {
    targetLang: 'ja',
    backText: 'The subject must provide informed consent.',
    engine: 'anthropic:claude-opus-4-8',
    similarity: 0.97,
    verified: true,
    performedAt: T2,
  };
}

function emptyProvenance(): SegmentProvenance {
  return {
    sourceHash: 'abc123',
    engine: null,
    promptVersion: null,
    postEditedBy: null,
    postEditedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    approvedBy: null,
    approvedAt: null,
    backTranslation: null,
  };
}

/** A fresh 'pending' segment. */
function pendingSegment(overrides: Partial<TranslationSegment> = {}): TranslationSegment {
  return {
    id: 1,
    projectId: PROJECT_ID,
    organizationId: ORG,
    ordinal: 0,
    sourceText: 'The subject must provide informed consent.',
    targetText: '',
    sourceHash: 'abc123',
    sourceLang: 'en',
    targetLang: 'ja',
    method: null,
    status: 'pending',
    provenance: emptyProvenance(),
    ...overrides,
  };
}

function project(): TranslationProject {
  return {
    id: PROJECT_ID,
    organizationId: ORG,
    name: 'ICF section 3',
    sourceDocumentId: null,
    sourceSectionCode: null,
    sourceLang: 'en',
    targetLang: 'ja',
    status: 'in_progress',
    createdBy: 100,
  };
}

/** Drive a pending segment all the way to 'review' with passing evidence. */
function driveToReview(): TranslationSegment {
  let seg = pendingSegment();
  seg = transition(seg, 'draft', SYSTEM, { now: T0 });
  seg = transition(seg, 'post_edit', POST_EDITOR, { now: T1, method: 'mt_postedited' });
  seg = transition(seg, 'submit_for_back_translation', POST_EDITOR, { now: T2 });
  seg = transition(seg, 'run_back_translation', POST_EDITOR, {
    now: T2,
    backTranslation: passingBackTranslation(),
  });
  seg = transition(seg, 'submit_for_review', POST_EDITOR, { now: T3 });
  return seg;
}

describe('hybrid-workflow — happy path', () => {
  it('reaches approved via mt_draft → post-edit → back-translation → review', () => {
    let seg = pendingSegment();

    seg = transition(seg, 'draft', SYSTEM, { now: T0 });
    expect(seg.status).toBe('mt_draft');
    expect(seg.method).toBe('machine');

    seg = transition(seg, 'post_edit', POST_EDITOR, { now: T1, method: 'mt_postedited' });
    expect(seg.status).toBe('in_progress');
    expect(seg.method).toBe('mt_postedited');
    expect(seg.provenance.postEditedBy).toBe(POST_EDITOR.userId);

    seg = transition(seg, 'submit_for_back_translation', POST_EDITOR, { now: T2 });
    expect(seg.status).toBe('back_translation');

    seg = transition(seg, 'run_back_translation', POST_EDITOR, {
      now: T2,
      backTranslation: passingBackTranslation(),
    });
    expect(seg.provenance.backTranslation?.verified).toBe(true);

    seg = transition(seg, 'submit_for_review', POST_EDITOR, { now: T3 });
    expect(seg.status).toBe('review');

    seg = transition(seg, 'approve', REVIEWER, { now: T4 });
    expect(seg.status).toBe('approved');
    expect(seg.provenance.reviewedBy).toBe(REVIEWER.userId);
    expect(seg.provenance.approvedBy).toBe(REVIEWER.userId);
    expect(seg.provenance.approvedAt).toBe(T4);
  });

  it('does not mutate the input segment (purity)', () => {
    const seg = pendingSegment();
    const snapshot = JSON.stringify(seg);
    transition(seg, 'draft', SYSTEM, { now: T0 });
    expect(JSON.stringify(seg)).toBe(snapshot);
  });

  it('supports the from-scratch human path (start_human → human)', () => {
    let seg = pendingSegment();
    seg = transition(seg, 'start_human', POST_EDITOR, { now: T0, method: 'human' });
    expect(seg.status).toBe('in_progress');
    expect(seg.method).toBe('human');
  });
});

describe('hybrid-workflow — guardrail: machine-only segment is BLOCKED', () => {
  it('a machine-method segment can NEVER be approved', () => {
    // Construct a segment that is otherwise fully evidenced but is still
    // method 'machine' (no human post-edit ever happened).
    const seg = pendingSegment({
      status: 'review',
      method: 'machine',
      provenance: {
        ...emptyProvenance(),
        reviewedBy: REVIEWER.userId,
        reviewedAt: T3,
        backTranslation: passingBackTranslation(),
      },
    });

    // The pure predicate refuses it...
    const violation = approvalGuard(seg);
    expect(violation).toBeInstanceOf(WorkflowTransitionError);
    expect(violation?.code).toBe('method_not_approvable');
    expect(isApprovable(seg)).toBe(false);

    // ...and transition('approve') throws the same typed error.
    expect(() => transition(seg, 'approve', REVIEWER, { now: T4 })).toThrowError(
      WorkflowTransitionError,
    );
    try {
      transition(seg, 'approve', REVIEWER, { now: T4 });
    } catch (e) {
      expect((e as WorkflowTransitionError).code).toBe('method_not_approvable');
    }
  });
});

describe('hybrid-workflow — guardrail: approval without back-translation is BLOCKED', () => {
  it('a human-edited segment with no back-translation evidence cannot be approved', () => {
    // Reach review WITHOUT recording any back-translation result.
    let seg = pendingSegment();
    seg = transition(seg, 'draft', SYSTEM, { now: T0 });
    seg = transition(seg, 'post_edit', POST_EDITOR, { now: T1, method: 'mt_postedited' });
    seg = transition(seg, 'submit_for_back_translation', POST_EDITOR, { now: T2 });
    // Intentionally SKIP run_back_translation.
    seg = transition(seg, 'submit_for_review', POST_EDITOR, { now: T3 });
    expect(seg.status).toBe('review');
    expect(seg.provenance.backTranslation).toBeNull();

    expect(() => transition(seg, 'approve', REVIEWER, { now: T4 })).toThrowError(
      WorkflowTransitionError,
    );
    try {
      transition(seg, 'approve', REVIEWER, { now: T4 });
    } catch (e) {
      expect((e as WorkflowTransitionError).code).toBe('back_translation_required');
    }
  });

  it('a back-translation that FAILED the threshold also blocks approval', () => {
    const seg = pendingSegment({
      status: 'review',
      method: 'mt_postedited',
      provenance: {
        ...emptyProvenance(),
        postEditedBy: POST_EDITOR.userId,
        reviewedBy: REVIEWER.userId,
        reviewedAt: T3,
        backTranslation: {
          ...passingBackTranslation(),
          similarity: 0.4,
          verified: false,
        },
      },
    });
    expect(approvalGuard(seg)?.code).toBe('back_translation_required');
  });
});

describe('hybrid-workflow — guardrail: named human reviewer of record', () => {
  it('blocks approval if the reviewer is the same person as the post-editor', () => {
    const seg = driveToReview();
    // SAME user post-edited and now tries to approve → separation-of-duties.
    const selfReviewer: WorkflowActor = { userId: POST_EDITOR.userId, isReviewer: true };
    try {
      transition(seg, 'approve', selfReviewer, { now: T4 });
      throw new Error('expected approval to throw');
    } catch (e) {
      expect((e as WorkflowTransitionError).code).toBe('reviewer_conflict');
    }
  });

  it('blocks approval when the actor is not a reviewer of record', () => {
    const seg = driveToReview();
    const nonReviewer: WorkflowActor = { userId: 300, isReviewer: false };
    try {
      transition(seg, 'approve', nonReviewer, { now: T4 });
      throw new Error('expected approval to throw');
    } catch (e) {
      expect((e as WorkflowTransitionError).code).toBe('reviewer_required');
    }
  });
});

describe('hybrid-workflow — guardrail: deterministic/demo drafts', () => {
  it('blocks approval of a segment flagged as a deterministic draft', () => {
    const seg = driveToReview();
    try {
      transition(seg, 'approve', REVIEWER, { now: T4, deterministicDraft: true });
      throw new Error('expected approval to throw');
    } catch (e) {
      expect((e as WorkflowTransitionError).code).toBe('deterministic_draft');
    }
  });
});

describe('hybrid-workflow — illegal transitions throw', () => {
  it('throws illegal_transition when approving from pending', () => {
    const seg = pendingSegment();
    try {
      transition(seg, 'approve', REVIEWER, { now: T4 });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(WorkflowTransitionError);
      expect((e as WorkflowTransitionError).code).toBe('illegal_transition');
    }
  });

  it('throws illegal_transition when post-editing a pending segment', () => {
    const seg = pendingSegment();
    expect(() => transition(seg, 'post_edit', POST_EDITOR, { now: T1 })).toThrowError(
      WorkflowTransitionError,
    );
  });

  it('throws from a terminal (approved) state', () => {
    const approved = pendingSegment({ status: 'approved' });
    try {
      transition(approved, 'reject', REVIEWER, { now: T4 });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as WorkflowTransitionError).code).toBe('illegal_transition');
    }
  });

  it('throws missing_evidence if run_back_translation lacks a result', () => {
    let seg = pendingSegment();
    seg = transition(seg, 'draft', SYSTEM, { now: T0 });
    seg = transition(seg, 'post_edit', POST_EDITOR, { now: T1, method: 'mt_postedited' });
    seg = transition(seg, 'submit_for_back_translation', POST_EDITOR, { now: T2 });
    expect(() => transition(seg, 'run_back_translation', POST_EDITOR, { now: T2 })).toThrowError(
      WorkflowTransitionError,
    );
  });

  it('toApiError() renders the shared error envelope', () => {
    const seg = pendingSegment();
    try {
      transition(seg, 'approve', REVIEWER, { now: T4 });
    } catch (e) {
      const api = (e as WorkflowTransitionError).toApiError();
      expect(api.error.code).toBe('illegal_transition');
      expect(typeof api.error.message).toBe('string');
    }
  });
});

describe('hybrid-workflow — isSubmissionReady', () => {
  it('is true only when every required segment is approved with evidence', () => {
    const approved = pendingSegment({
      id: 1,
      status: 'approved',
      method: 'mt_postedited',
      provenance: {
        ...emptyProvenance(),
        postEditedBy: POST_EDITOR.userId,
        reviewedBy: REVIEWER.userId,
        reviewedAt: T3,
        approvedBy: REVIEWER.userId,
        approvedAt: T4,
        backTranslation: passingBackTranslation(),
      },
    });
    const inProgress = pendingSegment({ id: 2, status: 'in_progress', method: 'mt_postedited' });
    const rejected = pendingSegment({ id: 3, status: 'rejected', method: 'machine' });

    // One approved + one rejected (ignored) → ready.
    expect(isSubmissionReady(project(), [approved, rejected])).toBe(true);

    // An in-progress required segment → not ready.
    expect(isSubmissionReady(project(), [approved, inProgress])).toBe(false);

    // No segments at all → not ready.
    expect(isSubmissionReady(project(), [])).toBe(false);
  });

  it('treats an approved-but-unevidenced segment as NOT ready (defense in depth)', () => {
    const fakeApproved = pendingSegment({
      id: 1,
      status: 'approved',
      method: 'machine', // should never have been approved
      provenance: { ...emptyProvenance() },
    });
    expect(isSubmissionReady(project(), [fakeApproved])).toBe(false);
  });

  it('ignores segments from other projects/tenants', () => {
    const approved = pendingSegment({
      id: 1,
      status: 'approved',
      method: 'human',
      provenance: {
        ...emptyProvenance(),
        postEditedBy: POST_EDITOR.userId,
        reviewedBy: REVIEWER.userId,
        reviewedAt: T3,
        approvedBy: REVIEWER.userId,
        approvedAt: T4,
        backTranslation: passingBackTranslation(),
      },
    });
    const otherTenant = pendingSegment({ id: 9, organizationId: 999, status: 'pending' });
    expect(isSubmissionReady(project(), [approved, otherTenant])).toBe(true);
  });
});
