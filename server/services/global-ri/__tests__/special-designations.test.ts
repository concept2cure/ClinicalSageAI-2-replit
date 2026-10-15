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

  // Until 2026-10-15 these two pinned eligible:false on the prevalence prong alone;
  // the alternative cost-recovery prong is not assessed, so the screen is not either.
  it('usPrevalence 500000 → prevalence prong not met; not assessed (cost-recovery prong)', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 500000 });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.notAssessedCriteria).toHaveLength(1);
    expect(r.designations).not.toContain('FDA Orphan Drug Designation (ODD)');
    // cost-recovery prong surfaced as a note
    expect(r.notes.some((n) => /cost-recovery/i.test(n))).toBe(true);
  });

  it('boundary: exactly 200000 → prevalence prong not met (must be fewer than); not assessed', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 200000 });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.rationale).toMatch(/not fewer than 200,000/);
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

  // Until 2026-10-15 these two pinned eligible:false on the prevalence limb alone;
  // Art 3(1)(a)'s insufficient-return limb is not assessed, so the screen is not either.
  it('euPrevalencePer10k 4 but not serious → prevalence limb not met; not assessed', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 4,
      seriousOrLifeThreatening: false,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.rationale).toMatch(/not life-threatening/i);
  });

  it('euPrevalencePer10k 6 (over threshold) → prevalence limb not met; not assessed', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 6,
      seriousOrLifeThreatening: true,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe('not_assessed');
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
  // Until 2026-10-15 this pinned eligible:true on prevalence alone, with a note to
  // confirm the medical-need criterion "qualitatively"; the record's other criteria have no input.
  it('jpPrevalence 40000 → prevalence criterion met; not assessed (medical need, development plan)', () => {
    const r = assessDesignationEligibility({ market: 'PMDA', jpPrevalence: 40000 });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.designations).not.toContain('PMDA / MHLW Orphan Drug Designation');
    expect(r.orphan.notAssessedCriteria.some((c) => /high medical need/i.test(c))).toBe(true);
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

// Until 2026-10-15 these pinned eligible:false: a "no" for a screen that was never run.
describe('assessDesignationEligibility — insufficient inputs', () => {
  it('FDA missing usPrevalence → orphan.eligible not_assessed with "not supplied" rationale', () => {
    const r = assessDesignationEligibility({ market: 'FDA' });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.rationale).toMatch(/not supplied/i);
  });

  it('EMA missing euPrevalencePer10k → orphan.eligible not_assessed with "not supplied" rationale', () => {
    const r = assessDesignationEligibility({ market: 'EMA', seriousOrLifeThreatening: true });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.rationale).toMatch(/not supplied/i);
    expect(r.orphan.missing).toContain('euPrevalencePer10k');
  });

  it('PMDA missing jpPrevalence → orphan.eligible not_assessed with "not supplied" rationale', () => {
    const r = assessDesignationEligibility({ market: 'PMDA' });
    expect(r.orphan.eligible).toBe('not_assessed');
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
