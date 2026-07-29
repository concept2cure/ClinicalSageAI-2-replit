/**
 * Phase 11 Intelligence cluster — presentation helper contract.
 *
 * The /api/intelligence biostat + reports routes turn raw DB rows into the
 * exact label shapes the kit surfaces render (TLF "due in" + forecast delta).
 * That formatting has real branching (overdue vs future; ahead/behind/on
 * target; U+2212 minus to match the fixture). A regression here would make
 * live data render differently from the fixture it falls back to — these
 * tests pin the contract without needing a DB or an Express request.
 */

import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  dayDelta,
  formatDueIn,
  formatDelta,
  isoDate,
} from '../intelligence-cluster.format';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 4, 31); // fixed clock so tests are deterministic

describe('daysUntil', () => {
  it('rounds up partial days in the future', () => {
    expect(daysUntil(new Date(NOW + 38 * DAY), NOW)).toBe(38);
    expect(daysUntil(new Date(NOW + 1.2 * DAY), NOW)).toBe(2);
  });
  it('is negative for past dates', () => {
    expect(daysUntil(new Date(NOW - 5 * DAY), NOW)).toBeLessThan(0);
  });
});

describe('formatDueIn', () => {
  it('renders "N days" for a future due date', () => {
    expect(formatDueIn(new Date(NOW + 20 * DAY), NOW)).toBe('20 days');
  });
  it('renders "overdue" once the due date has passed', () => {
    expect(formatDueIn(new Date(NOW - DAY), NOW)).toBe('overdue');
  });
  it('treats today (0 days) as not overdue', () => {
    expect(formatDueIn(new Date(NOW), NOW)).toBe('0 days');
  });
});

describe('dayDelta', () => {
  it('is positive when b is after a, negative when before', () => {
    expect(dayDelta(new Date(NOW), new Date(NOW + 13 * DAY))).toBe(13);
    expect(dayDelta(new Date(NOW), new Date(NOW - 3 * DAY))).toBe(-3);
  });
});

describe('formatDelta', () => {
  it('renders "+Nd" when the forecast slips past target', () => {
    expect(formatDelta(new Date(NOW), new Date(NOW + 13 * DAY))).toBe('+13d');
  });
  it('renders "−Nd" with a U+2212 minus when ahead of target', () => {
    const out = formatDelta(new Date(NOW), new Date(NOW - 3 * DAY));
    expect(out).toBe('−3d');
    expect(out.startsWith('−')).toBe(true); // matches the kit fixture's minus glyph
  });
  it('renders "+0d" when forecast equals target', () => {
    expect(formatDelta(new Date(NOW), new Date(NOW))).toBe('+0d');
  });
});

describe('isoDate', () => {
  it('returns YYYY-MM-DD', () => {
    expect(isoDate(new Date(Date.UTC(2026, 9, 9)))).toBe('2026-10-09');
  });
});
