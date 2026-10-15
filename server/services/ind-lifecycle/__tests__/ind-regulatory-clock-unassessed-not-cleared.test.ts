/**
 * IND regulatory clock (21 CFR 312.40 / 312.42) — "may proceed" only over a
 * recorded FDA receipt AND an assessed clinical-hold history.
 *
 * What the code used to do (until 2026-10-15): evaluateRegulatoryClock read a
 * missing `events` list as "no hold". Thirty days after whatever date it was
 * given it returned status 'safe_to_proceed', safeToProceed: true, onHold: false
 * and the sentence "The 30-day review period has elapsed with no clinical hold;
 * clinical investigations may proceed (21 CFR 312.40(b))". The IND screen posts
 * the program's TARGET submission date with no events, so the engine authorised
 * dosing over a planning date and a hold history nobody had read; the screen
 * had to hard-code its own workaround, and any other API caller got the
 * authorisation.
 *
 * Now the supplied date is FDA's receipt only when the caller says so
 * (`receiptRecorded: true`), and the hold history is assessed only when
 * `events` is supplied (an empty list is "assessed, none").
 */
import { describe, it, expect } from 'vitest';
import { evaluateRegulatoryClock } from '../ind-regulatory-clock';

const RECEIPT = '2026-01-01T00:00:00.000Z';
const ELAPSED = '2026-02-15T00:00:00.000Z';
const WITHIN = '2026-01-15T00:00:00.000Z';

describe('evaluateRegulatoryClock — nothing unassessed reads as a clearance', () => {
  it('a date not stated to be FDA\'s receipt, with no events: a projection — no clearance, no hold verdict', () => {
    const s = evaluateRegulatoryClock({ receiptDate: RECEIPT, asOf: ELAPSED });
    expect(s.status).not.toBe('safe_to_proceed');
    expect(s.status).toBe('projected');
    expect(s.basis).toBe('projection');
    expect(s.safeToProceed).toBeNull();
    expect(s.onHold).toBeNull();
    expect(s.holdHistoryAssessed).toBe(false);
    expect(s.rationale).not.toMatch(/may proceed/);
    expect(s.rationale).not.toMatch(/no clinical hold/);
    expect(s.rationale).toMatch(/receipt of the IND is not recorded/);
    expect(s.rationale).toMatch(/Clinical-hold history was not assessed/);
    // The date arithmetic is still reported, as a projection.
    expect(s.thirtyDayDate).toBe('2026-01-31T00:00:00.000Z');
    expect(s.daysUntilThirtyDay).toBe(0);
  });

  it('a projection never clears, even with an assessed, empty hold history', () => {
    const s = evaluateRegulatoryClock({ receiptDate: RECEIPT, asOf: ELAPSED, events: [] });
    expect(s.status).toBe('projected');
    expect(s.safeToProceed).toBeNull();
    expect(s.onHold).toBe(false);
    expect(s.holdHistoryAssessed).toBe(true);
  });

  it('a recorded receipt with NO hold history supplied: elapsed is undetermined, not safe to proceed', () => {
    const s = evaluateRegulatoryClock({ receiptDate: RECEIPT, receiptRecorded: true, asOf: ELAPSED });
    expect(s.basis).toBe('fda_receipt');
    expect(s.status).toBe('undetermined');
    expect(s.safeToProceed).toBeNull();
    expect(s.onHold).toBeNull();
    expect(s.rationale).not.toMatch(/may proceed/);
    expect(s.rationale).toMatch(/no clinical-hold history was supplied/);
  });

  it('a recorded receipt inside the window is not safe to proceed whatever the holds — that much is known', () => {
    const s = evaluateRegulatoryClock({ receiptDate: RECEIPT, receiptRecorded: true, asOf: WITHIN });
    expect(s.status).toBe('submitted');
    expect(s.safeToProceed).toBe(false);
    expect(s.onHold).toBeNull();
    expect(s.daysUntilThirtyDay).toBe(16);
    expect(s.rationale).toMatch(/Clinical-hold history was not assessed/);
  });

  it('a recorded receipt and an assessed, empty hold history clear on day 30 — the only clearance', () => {
    const s = evaluateRegulatoryClock({ receiptDate: RECEIPT, receiptRecorded: true, events: [], asOf: ELAPSED });
    expect(s.status).toBe('safe_to_proceed');
    expect(s.safeToProceed).toBe(true);
    expect(s.onHold).toBe(false);
    expect(s.rationale).toMatch(/may proceed \(21 CFR 312\.40\(b\)\)/);
  });

  it('a recorded hold is a fact on either basis', () => {
    const events = [{ type: 'clinical_hold_imposed' as const, date: '2026-01-20T00:00:00.000Z' }];
    for (const receiptRecorded of [true, false]) {
      const s = evaluateRegulatoryClock({ receiptDate: RECEIPT, receiptRecorded, events, asOf: ELAPSED });
      expect(s.status).toBe('clinical_hold');
      expect(s.onHold).toBe(true);
      expect(s.safeToProceed).toBe(false);
    }
  });

  it('receiptRecorded must be the boolean true — a truthy string is not a recorded receipt', () => {
    const s = evaluateRegulatoryClock({
      receiptDate: RECEIPT,
      receiptRecorded: 'yes' as unknown as boolean,
      events: [],
      asOf: ELAPSED,
    });
    expect(s.basis).toBe('projection');
    expect(s.safeToProceed).toBeNull();
  });
});
