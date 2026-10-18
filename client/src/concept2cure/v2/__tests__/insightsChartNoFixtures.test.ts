/**
 * A chart draws what the spec carries, or says it carries nothing.
 *
 * HS-1008-5, honest-state review 2026-10-08. Three of the four ROChart
 * branches invented their data when the spec lacked it:
 *
 *   readiness_ring   `Number(s.value) || 0`   → an empty ring labelled "0 of 100"
 *   forecast_band    `Number(s.anchor) || 60` → a trajectory with a fixed shape
 *   trend            `[62, 66, 64, 70, 73]`   → a rising line, for any report
 *
 * The `bar` branch already did the right thing ("No series data — connect the
 * live provider"), so the honest behaviour was in the same function the whole
 * time. These cases pin the number-reading rule the other three now share: a
 * genuine 0 is a measurement, and nothing else is.
 */
import { describe, expect, it } from 'vitest';
import { roSpecNum } from '../surfaces/Insights';

describe('roSpecNum', () => {
  it('reads a genuine zero as a measurement', () => {
    expect(roSpecNum(0)).toBe(0);
    expect(roSpecNum('0')).toBe(0);
  });

  /* THE CASE THE OLD `|| 0` GOT WRONG: every one of these drew a ring at 0. */
  it('reads an absent, null, empty or non-numeric field as nothing, never as zero', () => {
    for (const absent of [undefined, null, '', 'n/a', {}, [], NaN, Infinity, -Infinity]) {
      expect(roSpecNum(absent), `${JSON.stringify(absent) ?? 'undefined'} was read as a number`).toBeNull();
    }
  });

  it('reads the numbers a spec actually carries', () => {
    expect(roSpecNum(72)).toBe(72);
    expect(roSpecNum('72.5')).toBe(72.5);
    expect(roSpecNum(-3)).toBe(-3);
  });
});
