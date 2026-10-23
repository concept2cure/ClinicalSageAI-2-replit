import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeShort } from '../formatRelativeShort';

afterEach(() => vi.useRealTimers());

describe('workbench relative dates', () => {
  it('keeps absent metadata distinct from a dated update', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    expect(formatRelativeShort(undefined)).toBe('—');
    expect(formatRelativeShort('2026-10-23T11:00:00Z')).toBe('today');
    expect(formatRelativeShort('2026-10-21T12:00:00Z')).toBe('2d ago');
  });
});
