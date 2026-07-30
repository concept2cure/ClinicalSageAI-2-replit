/**
 * Regression: parseFiniteInt must NOT truncate a non-integer string into a
 * valid-looking integer (ledger C-21).
 *
 * Number.parseInt is a prefix parser, so parseInt('3f1c2a10-…', 10) === 3. Both
 * mirrored copies (server/auth.ts and server/middleware/orgMembership.ts) used it
 * unguarded, so a UUID JWT subject became integer user id 3 — a DIFFERENT real
 * user. enforceOrgMembership then re-checked membership for the wrong user, and
 * on the authoring surface (UUID subjects, integer-keyed organization_users)
 * 503'd every request. A non-integer subject must yield null.
 */

import { describe, it, expect } from 'vitest';
import { parseFiniteInt } from '../orgMembership';

describe('parseFiniteInt — non-integer strings yield null, not a truncated int (C-21)', () => {
  it('a UUID subject does not become a partial integer', () => {
    expect(parseFiniteInt('3f1c2a10-0000-4000-8000-000000000001')).toBeNull();
    expect(parseFiniteInt('7a1c2a10-0000-4000-8000-0000000000a1')).toBeNull();
  });

  it('mixed alphanumeric strings yield null', () => {
    expect(parseFiniteInt('3f1c')).toBeNull();
    expect(parseFiniteInt('12abc')).toBeNull();
    expect(parseFiniteInt('abc')).toBeNull();
  });

  it('genuine integer strings still parse', () => {
    expect(parseFiniteInt('1')).toBe(1);
    expect(parseFiniteInt('42')).toBe(42);
    expect(parseFiniteInt(' 7 ')).toBe(7);
    expect(parseFiniteInt('-3')).toBe(-3);
  });

  it('numbers still parse and truncate', () => {
    expect(parseFiniteInt(5)).toBe(5);
    expect(parseFiniteInt(5.9)).toBe(5);
  });

  it('empty / nullish yield null', () => {
    expect(parseFiniteInt('')).toBeNull();
    expect(parseFiniteInt('   ')).toBeNull();
    expect(parseFiniteInt(undefined)).toBeNull();
    expect(parseFiniteInt(null)).toBeNull();
    expect(parseFiniteInt(NaN)).toBeNull();
  });
});
