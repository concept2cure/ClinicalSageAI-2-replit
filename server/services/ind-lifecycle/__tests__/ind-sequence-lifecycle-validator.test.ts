/**
 * eCTD sequence lifecycle validator — legal-transition rules.
 */

import { describe, it, expect } from 'vitest';
import { validateSequenceTypeTransition } from '../ind-sequence-lifecycle-validator';

describe('validateSequenceTypeTransition', () => {
  it('allows an original as the first sequence', () => {
    const r = validateSequenceTypeTransition({ existingSequenceTypes: [], proposedType: 'original' });
    expect(r.allowed).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('blocks an amendment before any original (NO_ORIGINAL_FIRST)', () => {
    const r = validateSequenceTypeTransition({ existingSequenceTypes: [], proposedType: 'amendment' });
    expect(r.allowed).toBe(false);
    expect(r.reasons.map((x) => x.code)).toContain('NO_ORIGINAL_FIRST');
  });

  it('allows amendment/annual/response after an original', () => {
    for (const t of ['amendment', 'annual', 'response', 'variation', 'withdrawal']) {
      const r = validateSequenceTypeTransition({ existingSequenceTypes: ['original'], proposedType: t });
      expect(r.allowed, `${t} should be allowed after original`).toBe(true);
    }
  });

  it('blocks a second original (DUPLICATE_ORIGINAL)', () => {
    const r = validateSequenceTypeTransition({ existingSequenceTypes: ['original', 'amendment'], proposedType: 'original' });
    expect(r.allowed).toBe(false);
    expect(r.reasons.map((x) => x.code)).toContain('DUPLICATE_ORIGINAL');
  });

  it('treats withdrawal as terminal — nothing further is allowed', () => {
    const r = validateSequenceTypeTransition({ existingSequenceTypes: ['original', 'withdrawal'], proposedType: 'amendment' });
    expect(r.allowed).toBe(false);
    expect(r.terminal).toBe(true);
    expect(r.reasons.map((x) => x.code)).toContain('SUBMISSION_WITHDRAWN');
  });

  it('rejects an unknown sequence type', () => {
    const r = validateSequenceTypeTransition({ existingSequenceTypes: ['original'], proposedType: 'supplement' });
    expect(r.allowed).toBe(false);
    expect(r.reasons[0].code).toBe('UNKNOWN_TYPE');
  });

  it('is deterministic', () => {
    const a = validateSequenceTypeTransition({ existingSequenceTypes: ['original'], proposedType: 'annual' });
    const b = validateSequenceTypeTransition({ existingSequenceTypes: ['original'], proposedType: 'annual' });
    expect(a).toEqual(b);
  });
});
