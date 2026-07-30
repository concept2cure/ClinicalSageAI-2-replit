import { describe, it, expect } from 'vitest';
import { canTransition, computeDecisionDue } from '../estar-submission-service';

/**
 * Pure lifecycle-helper tests. DB CRUD (create-from-catalog, list/get/advance)
 * is exercised by the route/integration layer (needs a live pool); here we pin
 * the transition rules and the review-clock math.
 */

describe('canTransition (eSTAR submission lifecycle)', () => {
  it('permits the forward path draft → filed → under_review → decision', () => {
    expect(canTransition('draft', 'filed')).toBe(true);
    expect(canTransition('filed', 'under_review')).toBe(true);
    expect(canTransition('under_review', 'decision')).toBe(true);
  });

  it('allows the additional-info round trip', () => {
    expect(canTransition('under_review', 'additional_info')).toBe(true);
    expect(canTransition('additional_info', 'under_review')).toBe(true);
  });

  it('allows withdrawal from any non-terminal status', () => {
    expect(canTransition('draft', 'withdrawn')).toBe(true);
    expect(canTransition('filed', 'withdrawn')).toBe(true);
    expect(canTransition('under_review', 'withdrawn')).toBe(true);
  });

  it('treats decision and withdrawn as terminal', () => {
    expect(canTransition('decision', 'under_review')).toBe(false);
    expect(canTransition('withdrawn', 'filed')).toBe(false);
  });

  it('rejects illegal jumps (draft → decision, filed → draft)', () => {
    expect(canTransition('draft', 'decision')).toBe(false);
    expect(canTransition('filed', 'draft')).toBe(false);
    expect(canTransition('draft', 'under_review')).toBe(false);
  });
});

describe('computeDecisionDue (review clock)', () => {
  it('adds reviewGoalDays to filedAt', () => {
    const filed = new Date('2026-01-01T00:00:00.000Z');
    const due = computeDecisionDue(filed, 90);
    expect(due?.toISOString()).toBe('2026-04-01T00:00:00.000Z'); // +90 days
  });

  it('returns null when there is no review clock (meeting-based requests)', () => {
    const filed = new Date('2026-01-01T00:00:00.000Z');
    expect(computeDecisionDue(filed, null)).toBeNull();
    expect(computeDecisionDue(filed, undefined)).toBeNull();
    expect(computeDecisionDue(filed, 0)).toBeNull();
  });
});
