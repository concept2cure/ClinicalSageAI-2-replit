/**
 * Tests for the IEC 60601 electrical-safety module.
 */
import { describe, it, expect } from 'vitest';
import { IEC_60601_STANDARDS, applicableElectricalStandards } from '../electrical-safety';

describe('electrical safety — applicability', () => {
  it('does not apply to a non-powered device', () => {
    const r = applicableElectricalStandards({ electricallyPowered: false });
    expect(r.applicable).toBe(false);
    expect(r.standards).toHaveLength(0);
  });

  it('always includes the general standard + EMC + usability for powered devices', () => {
    const r = applicableElectricalStandards({ electricallyPowered: true });
    const codes = r.standards.map((s) => s.code);
    expect(codes).toContain('IEC 60601-1');
    expect(codes).toContain('IEC 60601-1-2');
    expect(codes).toContain('IEC 60601-1-6');
    // No conditional collaterals unless triggered.
    expect(codes).not.toContain('IEC 60601-1-8');
  });

  it('adds the alarms collateral when the device has alarms', () => {
    const r = applicableElectricalStandards({ electricallyPowered: true, hasAlarms: true });
    expect(r.standards.map((s) => s.code)).toContain('IEC 60601-1-8');
  });

  it('adds home-use and closed-loop collaterals when triggered', () => {
    const r = applicableElectricalStandards({ electricallyPowered: true, homeUse: true, closedLoopControl: true });
    const codes = r.standards.map((s) => s.code);
    expect(codes).toContain('IEC 60601-1-11');
    expect(codes).toContain('IEC 60601-1-10');
  });

  it('notes a particular standard when present', () => {
    const r = applicableElectricalStandards({ electricallyPowered: true, hasParticularStandard: true });
    expect(r.notes.some((n) => /60601-2-xx/.test(n))).toBe(true);
  });

  it('surfaces the reviewer questions + test categories', () => {
    const r = applicableElectricalStandards({ electricallyPowered: true });
    expect(r.testCategories.some((t) => t.id === 'leakage_currents')).toBe(true);
    expect(r.reviewerQuestions.some((q) => /leakage currents/i.test(q))).toBe(true);
  });

  it('the general standard is marked always-applicable', () => {
    expect(IEC_60601_STANDARDS.find((s) => s.id === 'general')?.applicability).toBe('always');
  });
});
