import { describe, it, expect } from 'vitest';
import {
  normalizeRegion,
  getModule1Structure,
  getModule2Structure,
} from '../../../server/services/regulatory/ctd-module-structure';

describe('CTD structure — region-aware Module 1', () => {
  it('maps region aliases', () => {
    expect(normalizeRegion('US')).toBe('FDA');
    expect(normalizeRegion('EU')).toBe('EMA');
    expect(normalizeRegion('JP')).toBe('PMDA');
    expect(normalizeRegion('JNDA')).toBe('PMDA');
    expect(normalizeRegion(undefined)).toBe('FDA');
  });

  it('FDA / EMA / PMDA Module 1 differ in their administrative content', () => {
    const fda = JSON.stringify(getModule1Structure('FDA'));
    const ema = JSON.stringify(getModule1Structure('EMA'));
    const pmda = JSON.stringify(getModule1Structure('PMDA'));
    expect(fda).toMatch(/356h|1571/);
    expect(ema).toMatch(/SmPC|Risk management plan|Application form/);
    expect(pmda).toMatch(/添付文書|GPSP|J-RMP/);
    // They are genuinely different structures.
    expect(fda).not.toBe(ema);
    expect(ema).not.toBe(pmda);
  });
});

describe('CTD structure — Module 2 summaries with source-module links', () => {
  it('contains 2.1–2.7 and links summaries to their source module', () => {
    const m2 = getModule2Structure();
    const codes = m2.map((s) => s.code);
    for (const c of ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7']) expect(codes).toContain(c);
    expect(m2.find((s) => s.code === '2.3')!.sourceModules).toEqual([3]); // QOS ← M3
    expect(m2.find((s) => s.code === '2.4')!.sourceModules).toEqual([4]); // Nonclinical overview ← M4
    expect(m2.find((s) => s.code === '2.5')!.sourceModules).toEqual([5]); // Clinical overview ← M5
    expect(m2.find((s) => s.code === '2.7')!.sourceModules).toEqual([5]);
  });
});
