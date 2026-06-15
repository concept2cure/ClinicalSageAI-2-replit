import { describe, it, expect } from 'vitest';
import {
  assessDesignationEligibility,
  getDesignationCriteria,
  DESIGNATION_REFERENCE,
  type DesignationInput,
} from '../special-designations';

describe('assessDesignationEligibility — FDA orphan', () => {
  it('usPrevalence 150000 → orphan eligible (ODD)', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 150000 });
    expect(r.orphan.eligible).toBe(true);
    expect(r.orphan.program).toContain('Orphan Drug Designation');
    expect(r.designations).toContain('FDA Orphan Drug Designation (ODD)');
  });

  it('usPrevalence 500000 → not eligible', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 500000 });
    expect(r.orphan.eligible).toBe(false);
    expect(r.designations).not.toContain('FDA Orphan Drug Designation (ODD)');
    // cost-recovery prong surfaced as a note
    expect(r.notes.some((n) => /cost-recovery/i.test(n))).toBe(true);
  });

  it('boundary: exactly 200000 → not eligible (must be fewer than)', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 200000 });
    expect(r.orphan.eligible).toBe(false);
  });
});

describe('assessDesignationEligibility — EMA orphan', () => {
  it('euPrevalencePer10k 4 + serious + noSatisfactoryTreatment → eligible', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 4,
      seriousOrLifeThreatening: true,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe(true);
    expect(r.designations).toContain('EMA Orphan Medicinal Product Designation');
  });

  it('euPrevalencePer10k 4 with significantBenefit (no satisfactory flag) → eligible', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 4,
      seriousOrLifeThreatening: true,
      significantBenefit: true,
    });
    expect(r.orphan.eligible).toBe(true);
  });

  it('euPrevalencePer10k 4 but not serious → not eligible', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 4,
      seriousOrLifeThreatening: false,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.rationale).toMatch(/not life-threatening/i);
  });

  it('euPrevalencePer10k 6 (over threshold) → not eligible', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 6,
      seriousOrLifeThreatening: true,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.rationale).toMatch(/exceeds 5/i);
  });

  it('boundary: exactly 5 per 10k + serious + need → eligible', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 5,
      seriousOrLifeThreatening: true,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe(true);
  });
});

describe('assessDesignationEligibility — PMDA orphan', () => {
  it('jpPrevalence 40000 → eligible', () => {
    const r = assessDesignationEligibility({ market: 'PMDA', jpPrevalence: 40000 });
    expect(r.orphan.eligible).toBe(true);
    expect(r.designations).toContain('PMDA / MHLW Orphan Drug Designation');
    expect(r.notes.some((n) => /high medical need/i.test(n))).toBe(true);
  });

  it('jpPrevalence 60000 → not eligible', () => {
    const r = assessDesignationEligibility({ market: 'PMDA', jpPrevalence: 60000 });
    expect(r.orphan.eligible).toBe(false);
  });
});

describe('assessDesignationEligibility — pediatric', () => {
  it('pediatricDevelopment true on FDA → pediatric.applicable true with PSP/PREA mention', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 150000, pediatricDevelopment: true });
    expect(r.pediatric).toBeDefined();
    expect(r.pediatric!.applicable).toBe(true);
    expect(r.pediatric!.requirement).toMatch(/PSP|PREA|Pediatric Study Plan/);
    expect(r.designations).toContain(DESIGNATION_REFERENCE.FDA.pediatricProgram);
  });

  it('pediatricDevelopment true on EMA → PIP requirement', () => {
    const r = assessDesignationEligibility({ market: 'EMA', pediatricDevelopment: true });
    expect(r.pediatric!.applicable).toBe(true);
    expect(r.pediatric!.requirement).toMatch(/PIP|Paediatric Investigation Plan/);
  });

  it('no pediatricDevelopment → pediatric undefined', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 150000 });
    expect(r.pediatric).toBeUndefined();
  });
});

describe('assessDesignationEligibility — insufficient inputs', () => {
  it('FDA missing usPrevalence → orphan.eligible false with "not supplied" rationale', () => {
    const r = assessDesignationEligibility({ market: 'FDA' });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.rationale).toMatch(/not supplied/i);
  });

  it('EMA missing euPrevalencePer10k → orphan.eligible false with "not supplied" rationale', () => {
    const r = assessDesignationEligibility({ market: 'EMA', seriousOrLifeThreatening: true });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.rationale).toMatch(/not supplied/i);
  });

  it('PMDA missing jpPrevalence → orphan.eligible false with "not supplied" rationale', () => {
    const r = assessDesignationEligibility({ market: 'PMDA' });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.rationale).toMatch(/not supplied/i);
  });
});

describe('determinism & shape', () => {
  it('produces identical output for identical input', () => {
    const input: DesignationInput = {
      market: 'EMA',
      euPrevalencePer10k: 3,
      seriousOrLifeThreatening: true,
      significantBenefit: true,
      pediatricDevelopment: true,
    };
    const a = assessDesignationEligibility(input);
    const b = assessDesignationEligibility(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('designations and notes are sorted', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 150000, pediatricDevelopment: true });
    const sortedDesignations = [...r.designations].sort((x, y) => x.localeCompare(y));
    const sortedNotes = [...r.notes].sort((x, y) => x.localeCompare(y));
    expect(r.designations).toEqual(sortedDesignations);
    expect(r.notes).toEqual(sortedNotes);
  });

  it('echoes the queried market', () => {
    expect(assessDesignationEligibility({ market: 'PMDA', jpPrevalence: 40000 }).market).toBe('PMDA');
  });

  it('getDesignationCriteria returns the reference entry', () => {
    expect(getDesignationCriteria('FDA')).toBe(DESIGNATION_REFERENCE.FDA);
    expect(DESIGNATION_REFERENCE.EMA.citation).toMatch(/141\/2000/);
  });
});
