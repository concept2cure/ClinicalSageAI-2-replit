/**
 * Post-approval changes / variations expert — vehicle classification per market.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyChange,
  getChangeVehicles,
  CHANGE_CATEGORIES,
  type ChangeMarket,
} from '../post-approval-changes';

const MARKETS: ChangeMarket[] = ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA'];

describe('change-vehicle catalog', () => {
  it('models every category for every market', () => {
    for (const m of MARKETS) {
      const vehicles = getChangeVehicles(m)!;
      for (const c of CHANGE_CATEGORIES) {
        expect(vehicles[c]).toBeTruthy();
        expect(vehicles[c].reportingCategory).toBeTruthy();
        expect(vehicles[c].citation).toBeTruthy();
      }
    }
  });
});

describe('classifyChange — FDA', () => {
  it('a major manufacturing process change → PAS (prior approval)', () => {
    const r = classifyChange({ market: 'FDA', category: 'manufacturing_process_major' });
    expect(r.vehicle.reportingCategory).toBe('PAS');
    expect(r.vehicle.priorApprovalRequired).toBe(true);
  });

  it('a minor manufacturing process change → CBE-30 (self-implementing)', () => {
    const r = classifyChange({ market: 'FDA', category: 'manufacturing_process_minor' });
    expect(r.vehicle.reportingCategory).toBe('CBE-30');
    expect(r.vehicle.priorApprovalRequired).toBe(false);
  });

  it('safety labeling → CBE-0; administrative labeling → Annual Report', () => {
    expect(classifyChange({ market: 'FDA', category: 'labeling_safety' }).vehicle.reportingCategory).toBe('CBE-0');
    expect(classifyChange({ market: 'FDA', category: 'labeling_administrative' }).vehicle.reportingCategory).toBe('Annual Report');
  });

  it('a new indication → an efficacy PAS', () => {
    const r = classifyChange({ market: 'FDA', category: 'new_indication' });
    expect(r.vehicle.reportingCategory).toBe('PAS');
    expect(r.vehicle.vehicle).toContain('efficacy');
  });
});

describe('classifyChange — EMA', () => {
  it('a major manufacturing change → Type II (prior approval)', () => {
    const r = classifyChange({ market: 'EMA', category: 'manufacturing_process_major' });
    expect(r.vehicle.reportingCategory).toBe('Type II');
    expect(r.vehicle.priorApprovalRequired).toBe(true);
  });

  it('an administrative change → Type IA ("do and tell")', () => {
    const r = classifyChange({ market: 'EMA', category: 'labeling_administrative' });
    expect(r.vehicle.reportingCategory).toBe('Type IA');
    expect(r.vehicle.priorApprovalRequired).toBe(false);
  });

  it('a formulation change → a Line Extension', () => {
    expect(classifyChange({ market: 'EMA', category: 'formulation_change' }).vehicle.reportingCategory).toBe('Extension');
  });
});

describe('classifyChange — PMDA + Health Canada', () => {
  it('PMDA major change → partial change application; minor → notification', () => {
    expect(classifyChange({ market: 'PMDA', category: 'manufacturing_site' }).vehicle.priorApprovalRequired).toBe(true);
    expect(classifyChange({ market: 'PMDA', category: 'specification_tightening' }).vehicle.priorApprovalRequired).toBe(false);
  });

  it('Health Canada major change → SNDS', () => {
    expect(classifyChange({ market: 'HEALTH_CANADA', category: 'new_indication' }).vehicle.reportingCategory).toBe('SNDS');
  });
});

describe('classifyChange — errors + determinism', () => {
  it('throws for an unmodeled market', () => {
    expect(() => classifyChange({ market: 'XYZ' as ChangeMarket, category: 'manufacturing_site' })).toThrow();
  });

  it('is deterministic', () => {
    expect(classifyChange({ market: 'FDA', category: 'shelf_life_extension' })).toEqual(
      classifyChange({ market: 'FDA', category: 'shelf_life_extension' }),
    );
  });
});
