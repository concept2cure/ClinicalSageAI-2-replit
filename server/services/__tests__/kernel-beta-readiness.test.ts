import { describe, expect, test, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { statusFromScore } from '../kernel-beta-readiness';

describe('kernel-beta-readiness', () => {
  test('maps readiness scores to launch status', () => {
    expect(statusFromScore(0.9)).toBe('green');
    expect(statusFromScore(0.7)).toBe('yellow');
    expect(statusFromScore(0.4)).toBe('red');
  });
});
