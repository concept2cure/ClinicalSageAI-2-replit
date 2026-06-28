import { describe, it, expect } from 'vitest';
import {
  getProgram,
  allPrograms,
  programsForRegion,
  programsForCategory,
  programsForSegment,
  orphanPrograms,
  expeditedPrograms,
  pediatricPrograms,
  isMandatory,
  acceleratesReview,
  grantsExclusivity,
  expeditedProgramsForRegion,
  exclusivityProgramsForRegion,
  mandatoryObligationsForRegion,
  hasOrphanProgram,
  hasMandatoryPediatric,
  applicableProgramsForFiling,
  areFdaCombinablePrograms,
  FDA_COMBINABLE_EXPEDITED,
  type DesignationProgramId,
  type DesignationCategory,
} from '../../shared/regulatory/special-designations';

describe('special-designations — program catalog', () => {
  it('every program has required fields', () => {
    for (const p of allPrograms()) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.region).toBeTruthy();
      expect(p.segment).toBeTruthy();
      expect(p.basis).toBeTruthy();
      expect(p.eligibility).toBeTruthy();
      expect(p.incentives.length).toBeGreaterThan(0);
      expect(typeof p.mandatory).toBe('boolean');
      expect(typeof p.acceleratesReview).toBe('boolean');
      expect(typeof p.grantsExclusivity).toBe('boolean');
    }
  });

  it('catalogs programs across three markets', () => {
    expect(programsForRegion('US').length).toBeGreaterThan(0);
    expect(programsForRegion('EU').length).toBeGreaterThan(0);
    expect(programsForRegion('JP').length).toBeGreaterThan(0);
  });

  it('catalogs all four designation categories', () => {
    const categories: DesignationCategory[] = ['orphan', 'pediatric', 'expedited', 'device_special'];
    for (const cat of categories) {
      expect(programsForCategory(cat).length).toBeGreaterThan(0);
    }
  });

  it('getProgram returns the correct program by id', () => {
    const btd = getProgram('fda_breakthrough_therapy');
    expect(btd).toBeDefined();
    expect(btd!.label).toContain('Breakthrough Therapy');
    expect(btd!.region).toBe('US');
    expect(btd!.acceleratesReview).toBe(true);
  });

  it('getProgram returns undefined for unknown id', () => {
    expect(getProgram('nonexistent' as DesignationProgramId)).toBeUndefined();
  });
});

describe('special-designations — orphan programs', () => {
  it('catalogs orphan programs for US, EU, and JP', () => {
    const orphans = orphanPrograms();
    expect(orphans.length).toBe(3);
    const regions = orphans.map((p) => p.region);
    expect(regions).toContain('US');
    expect(regions).toContain('EU');
    expect(regions).toContain('JP');
  });

  it('FDA orphan grants 7-year exclusivity', () => {
    const fda = getProgram('fda_orphan')!;
    expect(fda.grantsExclusivity).toBe(true);
    expect(fda.exclusivityYears).toBe(7);
  });

  it('EMA orphan grants 10-year exclusivity', () => {
    const ema = getProgram('ema_orphan')!;
    expect(ema.grantsExclusivity).toBe(true);
    expect(ema.exclusivityYears).toBe(10);
  });

  it('PMDA orphan grants 10-year re-examination period', () => {
    const pmda = getProgram('pmda_orphan')!;
    expect(pmda.grantsExclusivity).toBe(true);
    expect(pmda.exclusivityYears).toBe(10);
  });
});

describe('special-designations — FDA expedited programs', () => {
  it('catalogs all four FDA expedited programs', () => {
    expect(FDA_COMBINABLE_EXPEDITED).toHaveLength(4);
    for (const id of FDA_COMBINABLE_EXPEDITED) {
      const p = getProgram(id);
      expect(p).toBeDefined();
      expect(p!.acceleratesReview).toBe(true);
      expect(p!.region).toBe('US');
    }
  });

  it('RMAT is an expedited biologic program', () => {
    const rmat = getProgram('fda_rmat')!;
    expect(rmat.category).toBe('expedited');
    expect(rmat.segment).toBe('biologic');
    expect(rmat.acceleratesReview).toBe(true);
  });

  it('none of the expedited programs are mandatory', () => {
    for (const p of expeditedPrograms()) {
      expect(p.mandatory).toBe(false);
    }
  });
});

describe('special-designations — pediatric programs', () => {
  it('PREA is mandatory', () => {
    expect(isMandatory('fda_prea')).toBe(true);
  });

  it('BPCA is voluntary and grants exclusivity', () => {
    expect(isMandatory('fda_bpca')).toBe(false);
    expect(grantsExclusivity('fda_bpca')).toBe(true);
  });

  it('EMA PIP is mandatory', () => {
    expect(isMandatory('ema_pip')).toBe(true);
  });

  it('PUMA is voluntary and grants exclusivity', () => {
    const puma = getProgram('ema_puma')!;
    expect(puma.mandatory).toBe(false);
    expect(puma.grantsExclusivity).toBe(true);
    expect(puma.exclusivityYears).toBe(10);
  });

  it('pediatricPrograms returns all pediatric programs', () => {
    const peds = pediatricPrograms();
    expect(peds.length).toBeGreaterThanOrEqual(4);
    for (const p of peds) {
      expect(p.category).toBe('pediatric');
    }
  });
});

describe('special-designations — device-special programs', () => {
  it('Breakthrough Device accelerates review', () => {
    expect(acceleratesReview('fda_breakthrough_device')).toBe(true);
  });

  it('HDE is a device program', () => {
    const hde = getProgram('fda_hde')!;
    expect(hde.segment).toBe('device');
    expect(hde.category).toBe('device_special');
  });
});

describe('special-designations — region/segment predicates', () => {
  it('hasOrphanProgram is true for US, EU, JP', () => {
    expect(hasOrphanProgram('US')).toBe(true);
    expect(hasOrphanProgram('EU')).toBe(true);
    expect(hasOrphanProgram('JP')).toBe(true);
  });

  it('hasMandatoryPediatric is true for US and EU, false for JP', () => {
    expect(hasMandatoryPediatric('US')).toBe(true);
    expect(hasMandatoryPediatric('EU')).toBe(true);
    expect(hasMandatoryPediatric('JP')).toBe(false);
  });

  it('expeditedProgramsForRegion US includes BTD and Fast Track', () => {
    const us = expeditedProgramsForRegion('US');
    const ids = us.map((p) => p.id);
    expect(ids).toContain('fda_breakthrough_therapy');
    expect(ids).toContain('fda_fast_track');
  });

  it('exclusivityProgramsForRegion EU includes orphan and PUMA', () => {
    const eu = exclusivityProgramsForRegion('EU');
    const ids = eu.map((p) => p.id);
    expect(ids).toContain('ema_orphan');
    expect(ids).toContain('ema_puma');
  });

  it('mandatoryObligationsForRegion US returns PREA', () => {
    const us = mandatoryObligationsForRegion('US');
    expect(us.some((p) => p.id === 'fda_prea')).toBe(true);
  });

  it('mandatoryObligationsForRegion EU returns PIP', () => {
    const eu = mandatoryObligationsForRegion('EU');
    expect(eu.some((p) => p.id === 'ema_pip')).toBe(true);
  });
});

describe('special-designations — filing applicability', () => {
  it('drug filing in US returns orphan, expedited, and pediatric programs', () => {
    const us = applicableProgramsForFiling('US', 'drug');
    const categories = new Set(us.map((p) => p.category));
    expect(categories).toContain('orphan');
    expect(categories).toContain('expedited');
    expect(categories).toContain('pediatric');
  });

  it('device filing in US returns device-special programs but not drug-specific', () => {
    const us = applicableProgramsForFiling('US', 'device');
    expect(us.some((p) => p.id === 'fda_breakthrough_device')).toBe(true);
    expect(us.some((p) => p.id === 'fda_breakthrough_therapy')).toBe(false);
  });

  it('biologic filing in US includes RMAT', () => {
    const us = applicableProgramsForFiling('US', 'biologic');
    expect(us.some((p) => p.id === 'fda_rmat')).toBe(true);
  });
});

describe('special-designations — FDA combinability', () => {
  it('Fast Track + BTD are combinable', () => {
    expect(areFdaCombinablePrograms('fda_fast_track', 'fda_breakthrough_therapy')).toBe(true);
  });

  it('Orphan + BTD are combinable', () => {
    expect(areFdaCombinablePrograms('fda_orphan', 'fda_breakthrough_therapy')).toBe(true);
  });

  it('RMAT + Priority Review are combinable', () => {
    expect(areFdaCombinablePrograms('fda_rmat', 'fda_priority_review')).toBe(true);
  });

  it('same program is not combinable with itself', () => {
    expect(areFdaCombinablePrograms('fda_fast_track', 'fda_fast_track')).toBe(false);
  });

  it('non-combinable programs return false', () => {
    expect(areFdaCombinablePrograms('fda_prea', 'fda_breakthrough_device')).toBe(false);
  });
});

describe('special-designations — PMDA programs', () => {
  it('SAKIGAKE accelerates review for all segments', () => {
    const sak = getProgram('pmda_sakigake')!;
    expect(sak.segment).toBe('all');
    expect(sak.acceleratesReview).toBe(true);
  });

  it('PMDA conditional approval is expedited', () => {
    const ca = getProgram('pmda_conditional_approval')!;
    expect(ca.category).toBe('expedited');
    expect(ca.acceleratesReview).toBe(true);
  });

  it('programsForSegment drug includes PMDA programs', () => {
    const drug = programsForSegment('drug');
    expect(drug.some((p) => p.id === 'pmda_orphan')).toBe(true);
    expect(drug.some((p) => p.id === 'pmda_conditional_approval')).toBe(true);
  });
});
