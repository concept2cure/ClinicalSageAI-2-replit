/**
 * Stability-requirements expert — WHO/ICH climatic zones + ICH Q1A(R2) conditions.
 */

import { describe, it, expect } from 'vitest';
import {
  CLIMATIC_ZONES,
  STORAGE_CONDITIONS,
  getClimaticZone,
  getStabilityConditions,
  getStudyDesign,
  type StorageCondition,
} from '../stability-requirements';

describe('climatic zones', () => {
  it('models all 5 WHO/ICH zones, each with a long-term condition + description', () => {
    expect(CLIMATIC_ZONES.length).toBe(5);
    const ids = CLIMATIC_ZONES.map((z) => z.id);
    expect(ids).toEqual(['I', 'II', 'III', 'IVa', 'IVb']);
    for (const z of CLIMATIC_ZONES) {
      expect(z.longTermCondition).toBeTruthy();
      expect(z.description).toBeTruthy();
      expect(z.name).toBeTruthy();
    }
  });

  it('getClimaticZone resolves IVb and returns null for an unknown zone', () => {
    const ivb = getClimaticZone('IVb');
    expect(ivb).toBeTruthy();
    expect(ivb!.longTermCondition).toContain('75% RH');
    expect(getClimaticZone('V')).toBeNull();
  });
});

describe('storage conditions — room temperature', () => {
  it('accelerated is 40°C / 75% RH for 6 months', () => {
    const c = getStabilityConditions('room');
    expect(c.accelerated).toBeTruthy();
    expect(c.accelerated!.temperature).toContain('40°C');
    expect(c.accelerated!.humidity).toContain('75% RH');
    expect(c.accelerated!.minimumDurationMonths).toBe(6);
  });

  it('intermediate is 30°C / 65% RH', () => {
    const c = getStabilityConditions('room');
    expect(c.intermediate).toBeTruthy();
    expect(c.intermediate!.temperature).toContain('30°C');
    expect(c.intermediate!.humidity).toContain('65% RH');
  });

  it('long-term requires at least 12 months', () => {
    const c = getStabilityConditions('room');
    expect(c.longTerm.temperature).toContain('25°C');
    expect(c.longTerm.minimumDurationMonths).toBe(12);
  });

  it('carries an ICH citation and a market-dependence caveat', () => {
    const c = getStabilityConditions('room');
    expect(c.citation).toContain('Q1A');
    expect(c.notes.some((n) => n.includes('intended market'))).toBe(true);
  });
});

describe('storage conditions — refrigerated + frozen', () => {
  it('refrigerated long-term is 5°C', () => {
    const c = getStabilityConditions('refrigerated');
    expect(c.longTerm.temperature).toContain('5°C');
    expect(c.accelerated).toBeTruthy();
    expect(c.accelerated!.temperature).toContain('25°C');
  });

  it('frozen long-term is -20°C with no accelerated condition', () => {
    const c = getStabilityConditions('frozen');
    expect(c.longTerm.temperature).toContain('-20°C');
    expect(c.accelerated).toBeNull();
    expect(c.intermediate).toBeNull();
    expect(c.longTerm.humidity).toBeNull();
  });
});

describe('study design', () => {
  it('requires a minimum of 3 batches', () => {
    expect(getStudyDesign().minimumBatches).toBe(3);
  });

  it('accelerated time points include 0, 3 and 6 months', () => {
    const tp = getStudyDesign().acceleratedTimePointsMonths;
    expect(tp).toContain(0);
    expect(tp).toContain(3);
    expect(tp).toContain(6);
  });

  it('carries an ICH citation and the market-dependence caveat', () => {
    const d = getStudyDesign();
    expect(d.citation).toContain('Q1A');
    expect(d.notes.some((n) => n.includes('intended market'))).toBe(true);
  });
});

describe('STORAGE_CONDITIONS + errors + determinism', () => {
  it('exports the three modeled storage categories', () => {
    expect(STORAGE_CONDITIONS).toEqual(['room', 'refrigerated', 'frozen']);
  });

  it('throws for an unmodeled storage condition', () => {
    expect(() => getStabilityConditions('lunar' as StorageCondition)).toThrow();
  });

  it('is deterministic', () => {
    expect(getStabilityConditions('room')).toEqual(getStabilityConditions('room'));
    expect(getStudyDesign()).toEqual(getStudyDesign());
  });
});
