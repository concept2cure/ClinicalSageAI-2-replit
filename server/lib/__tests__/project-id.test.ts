import { describe, it, expect } from 'vitest';
import { parseIntegerProjectId, looksLikeProgramUuid } from '../project-id';

describe('parseIntegerProjectId', () => {
  it('accepts a plain integer id and the proj_ prefix form', () => {
    expect(parseIntegerProjectId('7')).toBe(7);
    expect(parseIntegerProjectId('proj_7')).toBe(7);
    expect(parseIntegerProjectId('  42 ')).toBe(42);
    expect(parseIntegerProjectId(42)).toBe(42);
  });

  it('REJECTS a regulatory_programs UUID instead of truncating it to a wrong row', () => {
    // The exact ADR-0011 hazard: parseInt('7abb…') === 7 — a valid but WRONG
    // projects.id in the same org. The strict parser must return null, not 7.
    const uuid = '7abb1c22-0000-4000-8000-000000000000';
    expect(parseInt(uuid.replace(/^proj_/, ''), 10)).toBe(7); // the old bug, for contrast
    expect(parseIntegerProjectId(uuid)).toBeNull(); // the fix
    expect(parseIntegerProjectId('proj_' + uuid)).toBeNull();
    // A UUID that starts with letters would NaN under the old guard; still null here.
    expect(parseIntegerProjectId('abc12345-0000-4000-8000-000000000000')).toBeNull();
  });

  it('rejects NaN, non-positive, non-integer, and junk', () => {
    expect(parseIntegerProjectId('')).toBeNull();
    expect(parseIntegerProjectId('  ')).toBeNull();
    expect(parseIntegerProjectId('0')).toBeNull();
    expect(parseIntegerProjectId('-3')).toBeNull();
    expect(parseIntegerProjectId('3.5')).toBeNull();
    expect(parseIntegerProjectId('3abc')).toBeNull();
    expect(parseIntegerProjectId(0)).toBeNull();
    expect(parseIntegerProjectId(-3)).toBeNull();
    expect(parseIntegerProjectId(3.5)).toBeNull();
    expect(parseIntegerProjectId(null)).toBeNull();
    expect(parseIntegerProjectId(undefined)).toBeNull();
    expect(parseIntegerProjectId({})).toBeNull();
  });

  it('looksLikeProgramUuid distinguishes a program UUID from an integer id', () => {
    expect(looksLikeProgramUuid('7abb1c22-0000-4000-8000-000000000000')).toBe(true);
    expect(looksLikeProgramUuid('7')).toBe(false);
    expect(looksLikeProgramUuid('proj_7')).toBe(false);
    expect(looksLikeProgramUuid(7)).toBe(false);
  });
});
