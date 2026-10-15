/**
 * The regulatory clock refuses a hold history it cannot read — it never clears
 * an IND over a recorded event it dropped.
 *
 * What the code used to do (until 2026-10-15): deriveStatusFromEvents kept an
 * event only when `new Date(e.date) <= asOf`, so an event whose date did not
 * parse ("last week") failed that comparison and vanished; an event of an
 * unrecognised type ("hold") fell through the switch. Either way a RECORDED
 * clinical hold was ignored and, 30 days after a recorded receipt, the clock
 * answered safe_to_proceed / safeToProceed: true / onHold: false — "clinical
 * investigations may proceed". An unparseable receiptDate or asOf threw a
 * RangeError from toISOString (HTTP 500).
 */
import { describe, it, expect } from 'vitest';
import { evaluateRegulatoryClock, type ClockEvent } from '../ind-regulatory-clock';

const base = { receiptDate: '2026-01-01T00:00:00.000Z', receiptRecorded: true, asOf: '2026-06-01T00:00:00.000Z' };

describe('evaluateRegulatoryClock — an unreadable hold history is refused, never read as no hold', () => {
  it('a readable hold is a hold (control)', () => {
    const c = evaluateRegulatoryClock({ ...base, events: [{ type: 'clinical_hold_imposed', date: '2026-02-10' }] });
    expect(c.safeToProceed).toBe(false);
    expect(c.onHold).toBe(true);
  });

  it.each([
    [[{ type: 'clinical_hold_imposed', date: 'last week' }], 'events[0].date'],
    [[{ type: 'hold_lifted', date: '2026-01-20' }, { type: 'hold', date: '2026-02-10' }], 'events[1].type'],
    [[{ type: 'partial_hold_imposed' }], 'events[0].date'],
  ])('%j is refused naming %s — not safe_to_proceed', (events, field) => {
    expect(() => evaluateRegulatoryClock({ ...base, events: events as unknown as ClockEvent[] })).toThrow(new RegExp(`^VALIDATION: ${field.replace(/[[\]]/g, '\\$&')} `));
  });

  it.each([
    [{ ...base, receiptDate: 'soon' }, 'receiptDate'],
    [{ ...base, asOf: 'today-ish', events: [] }, 'asOf'],
  ])('an unparseable %s is refused by name, not a RangeError', (input, field) => {
    expect(() => evaluateRegulatoryClock(input)).toThrow(new RegExp(`^VALIDATION: ${field} `));
  });
});
