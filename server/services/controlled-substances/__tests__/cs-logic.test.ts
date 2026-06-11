/**
 * Controlled Substances deterministic logic (C2C-15) — schedule catalog, balance
 * reconciliation, registration expiry, recordkeeping gate. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  DEA_SCHEDULES,
  reconcileBalance,
  registrationExpiryStatus,
  evaluateRecordkeeping,
} from '../cs-logic';

describe('DEA_SCHEDULES', () => {
  it('covers I-V with citations; II requires Form 222', () => {
    expect(DEA_SCHEDULES.map((s) => s.schedule)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(DEA_SCHEDULES.find((s) => s.schedule === 'II')!.requiresForm222).toBe(true);
    for (const s of DEA_SCHEDULES) expect(s.citation).toMatch(/21 CFR 1308/);
  });
});

describe('reconcileBalance', () => {
  it('adds on receipt, subtracts on dispense', () => {
    expect(reconcileBalance(10, 'receipt', 5)).toEqual({ newBalance: 15, ok: true });
    expect(reconcileBalance(10, 'dispense', 4)).toEqual({ newBalance: 6, ok: true });
  });
  it('rejects a subtraction that would go negative', () => {
    const r = reconcileBalance(2, 'use', 5);
    expect(r.ok).toBe(false);
    expect(r.newBalance).toBe(2);
    expect(r.error).toMatch(/negative/);
  });
  it('honors signed adjustments', () => {
    expect(reconcileBalance(10, 'adjustment', -3)).toEqual({ newBalance: 7, ok: true });
    expect(reconcileBalance(10, 'adjustment', 3)).toEqual({ newBalance: 13, ok: true });
  });
  it('treats disposal/transfer as subtractions', () => {
    expect(reconcileBalance(10, 'disposal', 4).newBalance).toBe(6);
    expect(reconcileBalance(10, 'transfer', 4).newBalance).toBe(6);
  });
});

describe('registrationExpiryStatus', () => {
  it('classifies active / expiring_soon / expired', () => {
    expect(registrationExpiryStatus('2027-01-01', '2026-06-10')).toBe('active');
    expect(registrationExpiryStatus('2026-07-01', '2026-06-10')).toBe('expiring_soon');
    expect(registrationExpiryStatus('2026-01-01', '2026-06-10')).toBe('expired');
    expect(registrationExpiryStatus(null, '2026-06-10')).toBe('unknown');
  });
});

describe('evaluateRecordkeeping', () => {
  it('requires an active registration (critical)', () => {
    const r = evaluateRecordkeeping({ schedule: 'II', transactionType: 'use', hasActiveRegistration: false });
    expect(r.riskLevel).toBe('high');
  });
  it('requires a witness for disposal (major)', () => {
    const r = evaluateRecordkeeping({ schedule: 'III', transactionType: 'disposal', hasActiveRegistration: true, witnessedBy: null });
    expect(r.findings.some((f) => /witness/i.test(f.message))).toBe(true);
    expect(r.riskLevel).toBe('medium');
  });
  it('notes Form 222 for a Schedule II receipt (minor)', () => {
    const r = evaluateRecordkeeping({ schedule: 'II', transactionType: 'receipt', hasActiveRegistration: true });
    expect(r.findings.some((f) => /Form 222/.test(f.message))).toBe(true);
    expect(r.riskLevel).toBe('low');
  });
});
