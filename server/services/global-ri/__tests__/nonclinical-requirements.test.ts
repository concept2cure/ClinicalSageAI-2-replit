/**
 * Nonclinical-to-clinical phasing expert — ICH M3(R2).
 */

import { describe, it, expect } from 'vitest';
import {
  getNonclinicalRequirements,
  recommendToxDuration,
  NONCLINICAL_PHASES,
  type NonclinicalPhase,
} from '../nonclinical-requirements';

describe('getNonclinicalRequirements — per-phase package', () => {
  it('every phase returns at least one study, each with a truthy citation', () => {
    for (const phase of NONCLINICAL_PHASES) {
      const r = getNonclinicalRequirements(phase);
      expect(r.phase).toBe(phase);
      expect(r.studies.length).toBeGreaterThanOrEqual(1);
      for (const s of r.studies) {
        expect(s.area).toBeTruthy();
        expect(s.expectation).toBeTruthy();
        expect(s.citation).toBeTruthy();
      }
      expect(r.notes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('first_in_human includes a repeat-dose / two-species toxicity expectation', () => {
    const r = getNonclinicalRequirements('first_in_human');
    const text = r.studies.map((s) => `${s.area} ${s.expectation}`).join(' ').toLowerCase();
    expect(text).toContain('repeat-dose');
    expect(text).toContain('two species');
  });

  it('marketing includes carcinogenicity', () => {
    const r = getNonclinicalRequirements('marketing');
    const areas = r.studies.map((s) => s.area.toLowerCase());
    expect(areas.some((a) => a.includes('carcinogenicity'))).toBe(true);
  });

  it('phase3 includes embryo-fetal development toxicity', () => {
    const r = getNonclinicalRequirements('phase3');
    const text = r.studies.map((s) => s.area.toLowerCase()).join(' ');
    expect(text).toContain('embryo-fetal');
  });

  it('throws for an unknown phase', () => {
    expect(() => getNonclinicalRequirements('phase4' as NonclinicalPhase)).toThrow();
  });
});

describe('recommendToxDuration — ICH M3(R2) Table 1 tiers', () => {
  it('10 days → 2-week tier', () => {
    const r = recommendToxDuration(10);
    expect(r.tier).toBe('up to 2 weeks');
    expect(r.rodentMonths).toBe(0.5);
    expect(r.nonRodentMonths).toBe(0.5);
  });

  it('25 days → 1-month tier', () => {
    const r = recommendToxDuration(25);
    expect(r.tier).toBe('up to 1 month');
    expect(r.rodentMonths).toBe(1);
    expect(r.nonRodentMonths).toBe(1);
  });

  it('80 days → 3-month tier', () => {
    const r = recommendToxDuration(80);
    expect(r.tier).toBe('up to 3 months');
    expect(r.rodentMonths).toBe(3);
    expect(r.nonRodentMonths).toBe(3);
  });

  it('170 days → 6-month tier', () => {
    const r = recommendToxDuration(170);
    expect(r.tier).toBe('up to 6 months');
    expect(r.rodentMonths).toBe(6);
    expect(r.nonRodentMonths).toBe(6);
  });

  it('400 days → more-than-6-months tier with non-rodent 9 months', () => {
    const r = recommendToxDuration(400);
    expect(r.tier).toBe('more than 6 months');
    expect(r.rodentMonths).toBe(6);
    expect(r.nonRodentMonths).toBe(9);
  });

  it('throws for clinicalDurationDays <= 0', () => {
    expect(() => recommendToxDuration(0)).toThrow();
    expect(() => recommendToxDuration(-5)).toThrow();
  });

  it('throws for a non-finite duration', () => {
    expect(() => recommendToxDuration(NaN)).toThrow();
    expect(() => recommendToxDuration(Infinity)).toThrow();
  });
});

describe('determinism', () => {
  it('getNonclinicalRequirements is deterministic', () => {
    expect(getNonclinicalRequirements('phase2')).toEqual(getNonclinicalRequirements('phase2'));
  });

  it('recommendToxDuration is deterministic', () => {
    expect(recommendToxDuration(170)).toEqual(recommendToxDuration(170));
  });
});
