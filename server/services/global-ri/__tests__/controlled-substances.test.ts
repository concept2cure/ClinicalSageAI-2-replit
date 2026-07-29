/**
 * US DEA controlled-substance scheduling expert — schedule catalog + handling controls.
 */

import { describe, it, expect } from 'vitest';
import {
  getControlledSubstanceSchedules,
  getSchedule,
  getHandlingControls,
  CS_SCHEDULES,
  type Schedule,
} from '../controlled-substances';

describe('controlled-substance schedule catalog', () => {
  it('models all five schedules, each with examples + controls + citation', () => {
    const { schedules, citation, notes } = getControlledSubstanceSchedules();
    expect(schedules.map((s) => s.schedule)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(citation).toBeTruthy();
    expect(notes.length).toBeGreaterThan(0);
    for (const s of schedules) {
      expect(s.examples.length).toBeGreaterThan(0);
      expect(s.controls.length).toBeGreaterThan(0);
      expect(s.citation).toBeTruthy();
      expect(s.abusePotential).toBeTruthy();
    }
  });

  it('CS_SCHEDULES is the five CSA schedules', () => {
    expect(CS_SCHEDULES).toEqual(['I', 'II', 'III', 'IV', 'V']);
  });

  it('Schedule I has no accepted medical use; Schedule II does', () => {
    expect(getSchedule('I').acceptedMedicalUse).toBe(false);
    expect(getSchedule('II').acceptedMedicalUse).toBe(true);
  });

  it('Schedules III–V also have an accepted medical use', () => {
    for (const s of ['III', 'IV', 'V'] as Schedule[]) {
      expect(getSchedule(s).acceptedMedicalUse).toBe(true);
    }
  });
});

describe('getSchedule', () => {
  it('Schedule II examples include an opioid', () => {
    const examples = getSchedule('II').examples;
    const hasOpioid = examples.some((e) =>
      /oxycodone|fentanyl|morphine/i.test(e),
    );
    expect(hasOpioid).toBe(true);
  });

  it('Schedule I examples include heroin / LSD', () => {
    const examples = getSchedule('I').examples;
    expect(examples.some((e) => /heroin|lsd/i.test(e))).toBe(true);
  });

  it('throws for an unmodeled schedule', () => {
    expect(() => getSchedule('VI' as Schedule)).toThrow();
  });
});

describe('getHandlingControls', () => {
  it('Schedule I — no prescription allowed, quota-controlled', () => {
    const h = getHandlingControls('I');
    expect(h.prescriptionAllowed).toBe(false);
    expect(h.quotaControlled).toBe(true);
  });

  it('Schedule II — prescription allowed but NO refills, quota-controlled', () => {
    const h = getHandlingControls('II');
    expect(h.prescriptionAllowed).toBe(true);
    expect(h.refillsAllowed).toBe(false);
    expect(h.quotaControlled).toBe(true);
  });

  it('Schedule IV — refills allowed, not quota-controlled', () => {
    const h = getHandlingControls('IV');
    expect(h.refillsAllowed).toBe(true);
    expect(h.quotaControlled).toBe(false);
  });

  it('Schedule III refills allowed; V prescription allowed', () => {
    expect(getHandlingControls('III').refillsAllowed).toBe(true);
    expect(getHandlingControls('V').prescriptionAllowed).toBe(true);
  });

  it('carries an honest US-federal-only caveat note', () => {
    expect(getHandlingControls('II').notes.some((n) => /federal/i.test(n))).toBe(true);
  });

  it('throws for an unmodeled schedule', () => {
    expect(() => getHandlingControls('VI' as Schedule)).toThrow();
  });
});

describe('determinism', () => {
  it('repeated calls are identical', () => {
    expect(getControlledSubstanceSchedules()).toEqual(getControlledSubstanceSchedules());
    expect(getSchedule('III')).toEqual(getSchedule('III'));
    expect(getHandlingControls('IV')).toEqual(getHandlingControls('IV'));
  });
});
