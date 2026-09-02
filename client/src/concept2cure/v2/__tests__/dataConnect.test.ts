// @vitest-environment jsdom
/**
 * dataConnect — envelope handling shared by the fixture-free read hooks.
 *
 * The `live ?? fixture` primitives (liveGet / useLive / useLiveList /
 * matchesShape) and their fail-closed matrix were deleted with their last
 * consumers (ledger L72); what remains here is the envelope unwrapping every
 * list read still depends on.
 */
import { describe, it, expect } from 'vitest';

import { unwrapList } from '../dataConnect';

describe('unwrapList', () => {
  it('returns a bare array unchanged', () => {
    const arr = [{ id: 'a' }];
    expect(unwrapList(arr)).toBe(arr);
  });
  it('extracts the inner list from the canonical { data } envelope', () => {
    const inner = [{ id: 'a' }];
    expect(unwrapList({ data: inner, meta: { count: 1 } })).toBe(inner);
  });
  it('returns the payload as-is when data is not an array', () => {
    const payload = { data: { not: 'an array' } };
    expect(unwrapList(payload)).toBe(payload);
  });
});
