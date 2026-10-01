/**
 * The period a compliance report covers. UTC dates, inclusive; `to` defaults to
 * today and `from` to 90 days before `to`; a malformed date, `from` after `to`
 * or a span over 366 days is refused (BAD_PERIOD) rather than read as something
 * else. An as-of report uses `to` only.
 */
import { describe, expect, it } from 'vitest';

import { parseReportPeriod } from '../period';

const NOW = new Date('2026-09-30T15:42:00.000Z');

function ok(query: Record<string, unknown>, kind: 'range' | 'as-of' = 'range') {
  const out = parseReportPeriod(query, kind, NOW);
  if (!out.ok) throw new Error(`expected a period, got: ${out.message}`);
  return out;
}

describe('parseReportPeriod', () => {
  it('defaults to the 90 days before today, today included', () => {
    const { period, bounds } = ok({});
    expect(period).toEqual({ from: '2026-07-02', to: '2026-09-30', kind: 'range' });
    expect(bounds).toEqual({ start: '2026-07-02T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' });
  });

  it('defaults `from` to 90 days before a given `to`', () => {
    expect(ok({ to: '2026-03-01' }).period).toEqual({ from: '2025-12-01', to: '2026-03-01', kind: 'range' });
  });

  it('takes both dates as given, the end exclusive the day after `to`', () => {
    const { period, bounds } = ok({ from: '2026-01-01', to: '2026-01-31' });
    expect(period).toEqual({ from: '2026-01-01', to: '2026-01-31', kind: 'range' });
    expect(bounds).toEqual({ start: '2026-01-01T00:00:00.000Z', end: '2026-02-01T00:00:00.000Z' });
  });

  it('accepts a one-day period and a full leap year (366 days)', () => {
    expect(ok({ from: '2026-05-05', to: '2026-05-05' }).period.from).toBe('2026-05-05');
    expect(ok({ from: '2024-01-01', to: '2024-12-31' }).period.to).toBe('2024-12-31');
  });

  it('an as-of report uses `to` only, and ignores `from` even when it is malformed', () => {
    const { period, bounds } = ok({ from: 'garbage', to: '2026-06-15' }, 'as-of');
    expect(period).toEqual({ from: null, to: '2026-06-15', kind: 'as-of' });
    expect(bounds).toEqual({ start: '2026-06-15T00:00:00.000Z', end: '2026-06-16T00:00:00.000Z' });
    expect(ok({}, 'as-of').period).toEqual({ from: null, to: '2026-09-30', kind: 'as-of' });
  });

  it.each<[Record<string, unknown>, string]>([
    [{ from: '2026-1-01', to: '2026-01-31' }, 'malformed from'],
    [{ to: '30/09/2026' }, 'malformed to'],
    [{ from: '2026-02-30', to: '2026-03-31' }, 'a date that does not exist'],
    [{ to: '2026-13-01' }, 'month 13'],
    [{ from: '2026-01-01T00:00:00Z', to: '2026-01-31' }, 'a timestamp, not a date'],
    [{ from: ['2026-01-01', '2026-01-02'], to: '2026-01-31' }, 'a repeated parameter'],
    [{ from: '2026-02-01', to: '2026-01-31' }, 'from after to'],
    [{ from: '2025-01-01', to: '2026-01-02' }, 'a span over 366 days'],
    [{ from: '', to: '2026-01-31' }, 'an empty from'],
  ])('refuses %j (%s)', (query) => {
    const out = parseReportPeriod(query as Record<string, unknown>, 'range', NOW);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.message.length).toBeGreaterThan(10);
      expect(out.message).not.toContain('!');
    }
  });

  it('an as-of report still refuses a malformed `to`', () => {
    expect(parseReportPeriod({ to: 'yesterday' }, 'as-of', NOW).ok).toBe(false);
  });
});
