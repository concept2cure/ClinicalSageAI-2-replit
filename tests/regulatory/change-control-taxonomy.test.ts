import { describe, it, expect } from 'vitest';
import {
  getVehicle,
  vehiclesForMarket,
  vehiclesForSegment,
  allVehicles,
  isSelfImplementing,
  fdaSupplementForImpact,
  euVariationForImpact,
  defaultImpactForScope,
  canAdvanceChange,
  type RegulatoryVehicleId,
  type FdaSupplementCategory,
  type EuVariationCategory,
  type ChangeScope,
  type ChangeImpactTier,
  type TrackedChangeStatus,
} from '../../shared/regulatory/change-control-taxonomy';

describe('change-control taxonomy — vehicle catalog', () => {
  it('every vehicle has required fields', () => {
    for (const v of allVehicles()) {
      expect(v.id).toBeTruthy();
      expect(v.label).toBeTruthy();
      expect(v.market).toBeTruthy();
      expect(typeof v.priorApprovalRequired).toBe('boolean');
      expect(v.implementationTiming).toBeTruthy();
      expect(v.citation).toBeTruthy();
      expect(['drug', 'device', 'both']).toContain(v.segment);
    }
  });

  it('getVehicle returns the correct vehicle by id', () => {
    const pas = getVehicle('pas');
    expect(pas).toBeDefined();
    expect(pas!.label).toContain('Prior Approval');
    expect(pas!.market).toBe('US');
    expect(pas!.priorApprovalRequired).toBe(true);
  });

  it('getVehicle returns undefined for unknown id', () => {
    expect(getVehicle('nonexistent' as RegulatoryVehicleId)).toBeUndefined();
  });

  it('catalogs all four FDA drug supplement types', () => {
    const ids: FdaSupplementCategory[] = ['pas', 'cbe_30', 'cbe_0', 'annual_report'];
    for (const id of ids) {
      expect(getVehicle(id)).toBeDefined();
      expect(getVehicle(id)!.segment).toBe('drug');
    }
  });

  it('catalogs all five EU variation types', () => {
    const ids: EuVariationCategory[] = ['type_ia', 'type_iain', 'type_ib', 'type_ii', 'extension'];
    for (const id of ids) {
      expect(getVehicle(id)).toBeDefined();
      expect(getVehicle(id)!.market).toBe('EU');
    }
  });

  it('catalogs all three FDA device change outcomes', () => {
    for (const id of ['letter_to_file', 'new_510k', 'pma_supplement_or_de_novo'] as const) {
      const v = getVehicle(id);
      expect(v).toBeDefined();
      expect(v!.segment).toBe('device');
    }
  });

  it('catalogs PMDA and Health Canada vehicles', () => {
    expect(getVehicle('partial_change')!.market).toBe('JP');
    expect(getVehicle('minor_notification')!.market).toBe('JP');
    expect(getVehicle('snds')!.market).toBe('CA');
    expect(getVehicle('notifiable_change')!.market).toBe('CA');
    expect(getVehicle('annual_notification')!.market).toBe('CA');
  });
});

describe('change-control taxonomy — market/segment filters', () => {
  it('vehiclesForMarket returns only vehicles for that market', () => {
    const fda = vehiclesForMarket('US');
    expect(fda.length).toBeGreaterThan(0);
    for (const v of fda) {
      expect(v.market).toBe('US');
    }
  });

  it('vehiclesForMarket covers all four major markets', () => {
    for (const m of ['US', 'EU', 'JP', 'CA'] as const) {
      expect(vehiclesForMarket(m).length).toBeGreaterThan(0);
    }
  });

  it('vehiclesForSegment drug includes drug vehicles but not device-only', () => {
    const drug = vehiclesForSegment('drug');
    expect(drug.some((v) => v.id === 'pas')).toBe(true);
    expect(drug.some((v) => v.id === 'type_ii')).toBe(true);
    expect(drug.some((v) => v.id === 'letter_to_file')).toBe(false);
  });

  it('vehiclesForSegment device includes device vehicles but not drug-only', () => {
    const device = vehiclesForSegment('device');
    expect(device.some((v) => v.id === 'new_510k')).toBe(true);
    expect(device.some((v) => v.id === 'significant')).toBe(true);
    expect(device.some((v) => v.id === 'pas')).toBe(false);
  });
});

describe('change-control taxonomy — self-implementing predicate', () => {
  it('PAS requires prior approval', () => {
    expect(isSelfImplementing('pas')).toBe(false);
  });

  it('CBE-30 is self-implementing', () => {
    expect(isSelfImplementing('cbe_30')).toBe(true);
  });

  it('CBE-0 is self-implementing', () => {
    expect(isSelfImplementing('cbe_0')).toBe(true);
  });

  it('annual report is self-implementing', () => {
    expect(isSelfImplementing('annual_report')).toBe(true);
  });

  it('EU Type II requires prior approval', () => {
    expect(isSelfImplementing('type_ii')).toBe(false);
  });

  it('EU Type IA is self-implementing (do and tell)', () => {
    expect(isSelfImplementing('type_ia')).toBe(true);
  });

  it('Letter-to-File is self-implementing (no submission)', () => {
    expect(isSelfImplementing('letter_to_file')).toBe(true);
  });

  it('new 510(k) requires clearance', () => {
    expect(isSelfImplementing('new_510k')).toBe(false);
  });
});

describe('change-control taxonomy — impact-to-vehicle mappers', () => {
  it('FDA: major impact → PAS', () => {
    expect(fdaSupplementForImpact('major')).toBe('pas');
  });

  it('FDA: moderate impact → CBE-30', () => {
    expect(fdaSupplementForImpact('moderate')).toBe('cbe_30');
  });

  it('FDA: immediate safety override → CBE-0', () => {
    expect(fdaSupplementForImpact('moderate', true)).toBe('cbe_0');
  });

  it('FDA: minor/administrative → annual report', () => {
    expect(fdaSupplementForImpact('minor')).toBe('annual_report');
    expect(fdaSupplementForImpact('administrative')).toBe('annual_report');
  });

  it('EU: major impact → Type II', () => {
    expect(euVariationForImpact('major')).toBe('type_ii');
  });

  it('EU: scope extension → line extension', () => {
    expect(euVariationForImpact('major', true)).toBe('extension');
    expect(euVariationForImpact('minor', true)).toBe('extension');
  });

  it('EU: moderate impact → Type IB', () => {
    expect(euVariationForImpact('moderate')).toBe('type_ib');
  });

  it('EU: minor with immediate notification → Type IAIN', () => {
    expect(euVariationForImpact('minor', false, true)).toBe('type_iain');
  });

  it('EU: minor without immediate notification → Type IA', () => {
    expect(euVariationForImpact('minor')).toBe('type_ia');
    expect(euVariationForImpact('administrative')).toBe('type_ia');
  });
});

describe('change-control taxonomy — scope default impacts', () => {
  it('new indication is always major', () => {
    expect(defaultImpactForScope('indication')).toBe('major');
  });

  it('manufacturing site is major (conservative)', () => {
    expect(defaultImpactForScope('manufacturing_site')).toBe('major');
  });

  it('analytical method is moderate', () => {
    expect(defaultImpactForScope('analytical_method')).toBe('moderate');
  });

  it('every change scope has a defined default impact', () => {
    const scopes: ChangeScope[] = [
      'manufacturing_site', 'manufacturing_process', 'specification',
      'analytical_method', 'shelf_life', 'labeling', 'indication',
      'formulation', 'container_closure', 'software', 'design',
      'sterilisation', 'materials',
    ];
    for (const s of scopes) {
      const impact = defaultImpactForScope(s);
      expect(['major', 'moderate', 'minor', 'administrative'] as ChangeImpactTier[]).toContain(impact);
    }
  });
});

describe('change-control taxonomy — tracked change lifecycle', () => {
  it('draft can advance to assessed', () => {
    expect(canAdvanceChange('draft', 'assessed')).toBe(true);
  });

  it('draft cannot skip to filed', () => {
    expect(canAdvanceChange('draft', 'filed')).toBe(false);
  });

  it('assessed can advance to filed or implemented (self-implementing)', () => {
    expect(canAdvanceChange('assessed', 'filed')).toBe(true);
    expect(canAdvanceChange('assessed', 'implemented')).toBe(true);
  });

  it('filed can advance to approved or closed', () => {
    expect(canAdvanceChange('filed', 'approved')).toBe(true);
    expect(canAdvanceChange('filed', 'closed')).toBe(true);
  });

  it('closed is a terminal state', () => {
    const targets: TrackedChangeStatus[] = ['draft', 'assessed', 'filed', 'approved', 'implemented', 'closed'];
    for (const t of targets) {
      expect(canAdvanceChange('closed', t)).toBe(false);
    }
  });
});
