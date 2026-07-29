/**
 * IND regulatory clock / clinical-hold tracker — deterministic 30-day + hold
 * state machine (21 CFR 312.40 / 312.42). No DB.
 */

import { describe, it, expect } from 'vitest';
import { evaluateRegulatoryClock, computeThirtyDayDate } from '../ind-regulatory-clock';

const RECEIPT = '2026-01-01T00:00:00.000Z';

describe('computeThirtyDayDate', () => {
  it('is receipt + 30 calendar days', () => {
    expect(computeThirtyDayDate(RECEIPT).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});

describe('evaluateRegulatoryClock', () => {
  it('is "submitted" and not safe-to-proceed within the 30-day window', () => {
    const s = evaluateRegulatoryClock({ receiptDate: RECEIPT, asOf: '2026-01-15T00:00:00.000Z' });
    expect(s.status).toBe('submitted');
    expect(s.safeToProceed).toBe(false);
    expect(s.daysUntilThirtyDay).toBe(16);
  });

  it('is "safe_to_proceed" once 30 days elapse with no hold', () => {
    const s = evaluateRegulatoryClock({ receiptDate: RECEIPT, asOf: '2026-02-15T00:00:00.000Z' });
    expect(s.status).toBe('safe_to_proceed');
    expect(s.safeToProceed).toBe(true);
    expect(s.daysUntilThirtyDay).toBe(0);
  });

  it('a clinical hold blocks proceeding even after day 30', () => {
    const s = evaluateRegulatoryClock({
      receiptDate: RECEIPT,
      asOf: '2026-02-15T00:00:00.000Z',
      events: [{ type: 'clinical_hold_imposed', date: '2026-01-20T00:00:00.000Z' }],
    });
    expect(s.status).toBe('clinical_hold');
    expect(s.onHold).toBe(true);
    expect(s.safeToProceed).toBe(false);
  });

  it('lifting a hold restores safe-to-proceed (latest event wins)', () => {
    const s = evaluateRegulatoryClock({
      receiptDate: RECEIPT,
      asOf: '2026-03-01T00:00:00.000Z',
      events: [
        { type: 'clinical_hold_imposed', date: '2026-01-20T00:00:00.000Z' },
        { type: 'hold_lifted', date: '2026-02-20T00:00:00.000Z' },
      ],
    });
    expect(s.status).toBe('safe_to_proceed');
    expect(s.safeToProceed).toBe(true);
  });

  it('honors partial holds', () => {
    const s = evaluateRegulatoryClock({
      receiptDate: RECEIPT,
      asOf: '2026-02-15T00:00:00.000Z',
      events: [{ type: 'partial_hold_imposed', date: '2026-02-01T00:00:00.000Z' }],
    });
    expect(s.status).toBe('partial_clinical_hold');
    expect(s.onHold).toBe(true);
    expect(s.safeToProceed).toBe(false);
  });

  it('withdrawal is terminal regardless of the clock', () => {
    const s = evaluateRegulatoryClock({
      receiptDate: RECEIPT,
      asOf: '2026-03-01T00:00:00.000Z',
      events: [{ type: 'withdrawn', date: '2026-02-10T00:00:00.000Z' }],
    });
    expect(s.status).toBe('withdrawn');
    expect(s.safeToProceed).toBe(false);
  });

  it('ignores future-dated events relative to as-of', () => {
    const s = evaluateRegulatoryClock({
      receiptDate: RECEIPT,
      asOf: '2026-02-15T00:00:00.000Z',
      events: [{ type: 'clinical_hold_imposed', date: '2026-06-01T00:00:00.000Z' }],
    });
    // The hold has not taken effect yet as of 2026-02-15.
    expect(s.status).toBe('safe_to_proceed');
    expect(s.safeToProceed).toBe(true);
  });

  it('reactivation clears inactive status', () => {
    const s = evaluateRegulatoryClock({
      receiptDate: RECEIPT,
      asOf: '2026-04-01T00:00:00.000Z',
      events: [
        { type: 'inactivated', date: '2026-02-01T00:00:00.000Z' },
        { type: 'reactivated', date: '2026-03-01T00:00:00.000Z' },
      ],
    });
    expect(s.status).toBe('safe_to_proceed');
  });
});
