import { describe, it, expect } from 'vitest';
import { canTransitionSequence, isSequenceLocked } from '../submission-service';

describe('canTransitionSequence', () => {
  it('allows the forward path draft → assembling → validated → frozen → dispatched', () => {
    expect(canTransitionSequence('draft', 'assembling')).toBe(true);
    expect(canTransitionSequence('assembling', 'validated')).toBe(true);
    expect(canTransitionSequence('validated', 'frozen')).toBe(true);
    expect(canTransitionSequence('frozen', 'dispatched')).toBe(true);
  });

  it('allows backward moves to rework (assembling → draft, validated → assembling)', () => {
    expect(canTransitionSequence('assembling', 'draft')).toBe(true);
    expect(canTransitionSequence('validated', 'assembling')).toBe(true);
  });

  it('forbids skipping states and reviving a dispatched sequence', () => {
    expect(canTransitionSequence('draft', 'frozen')).toBe(false);
    expect(canTransitionSequence('draft', 'dispatched')).toBe(false);
    expect(canTransitionSequence('frozen', 'assembling')).toBe(false);
    expect(canTransitionSequence('dispatched', 'frozen')).toBe(false);
  });

  it('forbids unknown states', () => {
    expect(canTransitionSequence('bogus', 'draft')).toBe(false);
    expect(canTransitionSequence('draft', 'bogus')).toBe(false);
  });
});

describe('isSequenceLocked', () => {
  it('locks frozen and dispatched sequences', () => {
    expect(isSequenceLocked('frozen')).toBe(true);
    expect(isSequenceLocked('dispatched')).toBe(true);
  });
  it('leaves draft/assembling/validated mutable', () => {
    expect(isSequenceLocked('draft')).toBe(false);
    expect(isSequenceLocked('assembling')).toBe(false);
    expect(isSequenceLocked('validated')).toBe(false);
  });
});
