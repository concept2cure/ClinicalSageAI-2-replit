/**
 * The two dispatch-gate decisions that must fail closed, extracted as pure
 * helpers from the DB-bound assessor:
 *   - resolveDispatchEnvironment: an unset/misspelled NODE_ENV must NOT relax
 *     the production eValidator rule.
 *   - evaluateShadowPresenceGate: a never-Shadow-Reviewed sequence (0 completed
 *     runs) is UNASSESSED, not clean, and must block dispatch.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveDispatchEnvironment,
  evaluateShadowPresenceGate,
} from '../assess-dispatch-readiness';

describe('resolveDispatchEnvironment — fails toward production', () => {
  it('treats unset / misspelled NODE_ENV as production (strict)', () => {
    expect(resolveDispatchEnvironment(undefined)).toBe('production');
    expect(resolveDispatchEnvironment('')).toBe('production');
    expect(resolveDispatchEnvironment('prod')).toBe('production'); // misspelled → strict
    expect(resolveDispatchEnvironment('production')).toBe('production');
  });

  it('only relaxes for a recognized non-production value', () => {
    expect(resolveDispatchEnvironment('development')).toBe('staging');
    expect(resolveDispatchEnvironment('test')).toBe('staging');
    expect(resolveDispatchEnvironment('staging')).toBe('staging');
  });
});

describe('evaluateShadowPresenceGate — never-reviewed is not clean', () => {
  it('blocks when zero Shadow Review runs have completed', () => {
    const gate = evaluateShadowPresenceGate(0);
    expect(gate.cleared).toBe(false);
    expect(gate.blockers.join(' ')).toMatch(/never-reviewed|Shadow Review/i);
  });

  it('clears once at least one completed run exists', () => {
    const gate = evaluateShadowPresenceGate(1);
    expect(gate.cleared).toBe(true);
    expect(gate.blockers).toHaveLength(0);
  });
});
