/**
 * Tests for digest-preferences — parsing the scheduled-job parameters into
 * digest controls + the pure gates (severity floor, quiet hours, muting). No IO.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDigestPreferences,
  severityMeetsFloor,
  isWithinQuietHours,
  applyMutedSignals,
  DEFAULT_DIGEST_PREFERENCES,
} from '../digest-preferences.js';

describe('parseDigestPreferences', () => {
  it('returns permissive defaults for empty / missing params', () => {
    expect(parseDigestPreferences({})).toEqual(DEFAULT_DIGEST_PREFERENCES);
    expect(parseDigestPreferences(null)).toEqual(DEFAULT_DIGEST_PREFERENCES);
  });

  it('parses severity, muted signals (csv), and a valid quiet window', () => {
    const p = parseDigestPreferences({
      minSeverity: 'WARNING',
      mutedSignals: 'contradictions, bogus ,risks',
      quietHoursStart: '22',
      quietHoursEnd: 7,
    });
    expect(p.minSeverity).toBe('warning');
    expect(p.mutedSignals.sort()).toEqual(['contradictions', 'risks']);
    expect(p.quietHours).toEqual({ start: 22, end: 7 });
  });

  it('rejects malformed values (bad severity, out-of-range / equal hours)', () => {
    expect(parseDigestPreferences({ minSeverity: 'urgent' }).minSeverity).toBe('info');
    expect(parseDigestPreferences({ quietHoursStart: 9, quietHoursEnd: 9 }).quietHours).toBeNull();
    expect(parseDigestPreferences({ quietHoursStart: 25, quietHoursEnd: 5 }).quietHours).toBeNull();
  });

  it('dedupes muted signals and accepts an array', () => {
    const p = parseDigestPreferences({ mutedSignals: ['risks', 'risks', 'deadlines'] as unknown as string });
    expect(p.mutedSignals.sort()).toEqual(['deadlines', 'risks']);
  });
});

describe('severityMeetsFloor', () => {
  it('orders info < warning < critical', () => {
    expect(severityMeetsFloor('info', 'warning')).toBe(false);
    expect(severityMeetsFloor('warning', 'warning')).toBe(true);
    expect(severityMeetsFloor('critical', 'warning')).toBe(true);
    expect(severityMeetsFloor('warning', 'critical')).toBe(false);
  });
});

describe('isWithinQuietHours', () => {
  const at = (h: number) => new Date(2026, 5, 17, h, 30, 0);
  it('null window is never quiet', () => {
    expect(isWithinQuietHours(at(3), null)).toBe(false);
  });
  it('same-day window [9,17)', () => {
    expect(isWithinQuietHours(at(8), { start: 9, end: 17 })).toBe(false);
    expect(isWithinQuietHours(at(9), { start: 9, end: 17 })).toBe(true);
    expect(isWithinQuietHours(at(17), { start: 9, end: 17 })).toBe(false);
  });
  it('overnight wraparound [22,7)', () => {
    expect(isWithinQuietHours(at(23), { start: 22, end: 7 })).toBe(true);
    expect(isWithinQuietHours(at(3), { start: 22, end: 7 })).toBe(true);
    expect(isWithinQuietHours(at(7), { start: 22, end: 7 })).toBe(false);
    expect(isWithinQuietHours(at(12), { start: 22, end: 7 })).toBe(false);
  });
});

describe('applyMutedSignals', () => {
  const EMPTY = { tag: 'empty' };
  const base = { radar: { tag: 'radar' }, blockers: [1, 2], contradictions: ['a'] };

  it('zeroes only the muted types', () => {
    const out = applyMutedSignals(base, ['contradictions'], EMPTY);
    expect(out.radar).toEqual({ tag: 'radar' });
    expect(out.blockers).toEqual([1, 2]);
    expect(out.contradictions).toEqual([]);
  });
  it('mutes deadlines via the supplied empty radar and risks via []', () => {
    const out = applyMutedSignals(base, ['deadlines', 'risks'], EMPTY);
    expect(out.radar).toBe(EMPTY);
    expect(out.blockers).toEqual([]);
    expect(out.contradictions).toEqual(['a']);
  });
});
