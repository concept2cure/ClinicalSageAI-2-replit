import { describe, it, expect } from 'vitest';
import { REPORT_PERSONAS, isReportPersona, REPORT_PERSONA_LABELS } from '../report-personas';

describe('REPORT_PERSONAS', () => {
  it('is a non-empty, de-duplicated vocabulary', () => {
    expect(REPORT_PERSONAS.length).toBeGreaterThan(0);
    expect(new Set(REPORT_PERSONAS).size).toBe(REPORT_PERSONAS.length);
  });

  it('includes the job personas the Command Center personalizes on', () => {
    for (const p of ['executive', 'ra_lead', 'qa', 'medical_writer', 'pm']) {
      expect(REPORT_PERSONAS).toContain(p);
    }
  });
});

describe('isReportPersona', () => {
  it('accepts canonical personas', () => {
    expect(isReportPersona('ra_lead')).toBe(true);
    expect(isReportPersona('executive')).toBe(true);
  });

  it('rejects unknown values, the coarse roles, and non-strings', () => {
    expect(isReportPersona('member')).toBe(false); // an access role, not a persona
    expect(isReportPersona('admin')).toBe(false);
    expect(isReportPersona('')).toBe(false);
    expect(isReportPersona(null)).toBe(false);
    expect(isReportPersona(42)).toBe(false);
    expect(isReportPersona('RA_LEAD')).toBe(false); // case-sensitive
  });
});

describe('REPORT_PERSONA_LABELS', () => {
  it('only labels personas that exist in the vocabulary', () => {
    for (const key of Object.keys(REPORT_PERSONA_LABELS)) {
      expect(REPORT_PERSONAS).toContain(key);
    }
  });
});
