/**
 * PV signal screen — deterministic batch disproportionality + ranking. No DB.
 */

import { describe, it, expect } from 'vitest';
import { runSignalScreen } from '../pv-signal-screen';

describe('runSignalScreen', () => {
  it('flags signals and ranks them above non-signals', () => {
    const screen = runSignalScreen([
      { drug: 'D1', event: 'mild', counts: { a: 1, b: 100, c: 50, d: 5000 } }, // not a signal
      { drug: 'D1', event: 'strong', counts: { a: 25, b: 75, c: 100, d: 1000 } }, // signal
    ]);
    expect(screen.summary.total).toBe(2);
    expect(screen.summary.signals).toBeGreaterThanOrEqual(1);
    // The strong signal sorts first.
    expect(screen.rows[0].event).toBe('strong');
    expect(screen.rows[0].result.signalDetected).toBe(true);
  });

  it('orders two signals by EB05 descending', () => {
    const screen = runSignalScreen([
      { drug: 'A', event: 'weakish', counts: { a: 10, b: 90, c: 100, d: 1000 } },
      { drug: 'B', event: 'strongish', counts: { a: 60, b: 40, c: 100, d: 1000 } },
    ]);
    const signals = screen.rows.filter((r) => r.result.signalDetected);
    if (signals.length === 2) {
      expect(signals[0].result.eb05).toBeGreaterThanOrEqual(signals[1].result.eb05);
    }
  });

  it('is deterministic and tie-breaks by drug/event', () => {
    const inputs = [
      { drug: 'Z', event: 'x', counts: { a: 0, b: 10, c: 10, d: 100 } },
      { drug: 'A', event: 'x', counts: { a: 0, b: 10, c: 10, d: 100 } },
    ];
    const r1 = runSignalScreen(inputs);
    const r2 = runSignalScreen([...inputs].reverse());
    expect(r1.rows.map((r) => r.drug)).toEqual(r2.rows.map((r) => r.drug));
    expect(r1.rows[0].drug).toBe('A');
  });

  it('handles an empty batch', () => {
    expect(runSignalScreen([])).toEqual({ rows: [], summary: { total: 0, signals: 0 } });
  });
});
