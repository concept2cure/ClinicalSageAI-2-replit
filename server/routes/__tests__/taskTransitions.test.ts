import { describe, expect, it } from 'vitest';

import {
  isLegalTransition,
  TASK_STATUSES,
} from '../../services/tasking/task-state-machine';

/**
 * The status state machine (assessment D4/D5/D23). Free-text status let any
 * string be minted and let "advance" on a blocked task silently rewrite it to
 * pending via index arithmetic; these are the transitions the board and the
 * PATCH route now share.
 */
describe('task status state machine', () => {
  it('covers the whole status domain', () => {
    expect([...TASK_STATUSES]).toEqual([
      'pending', 'in-progress', 'review', 'completed', 'blocked', 'cancelled',
    ]);
  });

  it('allows the board’s forward path', () => {
    expect(isLegalTransition('pending', 'in-progress')).toBe(true);
    expect(isLegalTransition('in-progress', 'review')).toBe(true);
    expect(isLegalTransition('review', 'completed')).toBe(true);
  });

  it('allows the board’s back path', () => {
    expect(isLegalTransition('in-progress', 'pending')).toBe(true);
    expect(isLegalTransition('review', 'in-progress')).toBe(true);
    expect(isLegalTransition('completed', 'review')).toBe(true);
  });

  it('blocked resumes forward or retreats — never teleports to done', () => {
    expect(isLegalTransition('blocked', 'in-progress')).toBe(true);
    expect(isLegalTransition('blocked', 'pending')).toBe(true);
    expect(isLegalTransition('blocked', 'completed')).toBe(false);
  });

  it('completed can only reopen deliberately', () => {
    expect(isLegalTransition('completed', 'in-progress')).toBe(true);
    expect(isLegalTransition('completed', 'pending')).toBe(false);
    expect(isLegalTransition('completed', 'blocked')).toBe(false);
  });

  it('pending cannot skip straight to completed', () => {
    expect(isLegalTransition('pending', 'completed')).toBe(false);
  });

  it('same-status writes always pass (progress-only updates)', () => {
    for (const s of TASK_STATUSES) {
      expect(isLegalTransition(s, s)).toBe(true);
    }
  });

  it('an unknown legacy status may move to any known status (repairable)', () => {
    expect(isLegalTransition('some-legacy-value', 'pending')).toBe(true);
    expect(isLegalTransition('some-legacy-value', 'still-not-a-status')).toBe(false);
  });
});
